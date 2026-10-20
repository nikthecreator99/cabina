// Состояние приложения в памяти + сохранение в IndexedDB.
import * as db from './db.js';
import { tripStats, parseLocal } from './calc.js';

export const DEFAULT_SETTINGS = { id: 'settings', theme: 'system', minRest: 240, tz: 'Europe/Moscow' };

export const S = {
  trips: [], absences: [], routes: [], notes: [], files: [],
  settings: { ...DEFAULT_SETTINGS },
  locoTypes: [],
  onboarded: false,
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

const clean = (o) => { const c = { ...o }; delete c._stats; return c; };

export async function loadAll() {
  const [trips, absences, routes, notes, files, meta] = await Promise.all(
    ['trips', 'absences', 'routes', 'notes', 'files', 'meta'].map((s) => db.getAll(s).catch(() => [])));
  S.trips = trips; S.absences = absences; S.routes = routes; S.notes = notes; S.files = files;
  const m = Object.fromEntries(meta.map((x) => [x.id, x]));
  S.settings = { ...DEFAULT_SETTINGS, ...(m.settings || {}) };
  S.locoTypes = m.locoTypes?.list || [];
  S.onboarded = !!m.onboarded;
  S.trips.forEach((t) => { t._stats = tripStats(t); });
  try { localStorage.setItem('cabina-theme', S.settings.theme); } catch {}
}

export function statsOf(t) { return t._stats || (t._stats = tripStats(t)); }

// ---- Время «сейчас» в выбранном часовом поясе ----
export function nowLocal() {
  const tz = S.settings.tz === 'auto' ? undefined : S.settings.tz;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => +parts.find((p) => p.type === t).value;
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  } catch {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  }
}

// ---- Маршруты и локомотивы ----
export const routeText = (r) => (r ? `${r.from} → ${r.to}` : '');
export function routeOf(trip) {
  const r = trip.routeId && S.routes.find((x) => x.id === trip.routeId);
  if (r) return routeText(r);
  return trip.routeLabel || '';
}

const LAT2CYR = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
export const normType = (t) => String(t || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[ABCEHKMOPTXY]/g, (c) => LAT2CYR[c]);
export const normNum = (n) => String(n || '').trim().replace(/^№\s*/, '').replace(/\s+/g, '').toUpperCase();
export const locoKey = (type, num) => `${normType(type)}|${normNum(num)}`;
export function locoLabel(type, num) {
  const t = String(type || '').trim();
  const n = normNum(num);
  if (t && n) return `${t} №${n}`;
  if (t) return t;
  if (n) return `№${n}`;
  return '';
}

export function knownTypes() {
  const seen = new Map();
  const add = (t, w) => { const k = normType(t); if (!k) return; if (!seen.has(k) || seen.get(k).w < w) seen.set(k, { label: String(t).trim(), w }); };
  S.locoTypes.forEach((t, i) => add(t, -1000 + i));
  S.trips.forEach((t) => add(t.locoType, parseLocal(t.start) || 0));
  S.notes.forEach((n) => add(n.type, n.createdAt || 0));
  return [...seen.values()].sort((a, b) => b.w - a.w).map((x) => x.label);
}

export const notesFor = (type, num) => {
  const k = locoKey(type, num);
  return S.notes.filter((n) => locoKey(n.type, n.number) === k).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// ---- Сохранение ----
export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.put('meta', S.settings);
  try { localStorage.setItem('cabina-theme', S.settings.theme); } catch {}
  emit();
}

export async function setOnboarded() {
  S.onboarded = true;
  await db.put('meta', { id: 'onboarded', at: Date.now() });
}

let persistAsked = false;
async function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch {}
}

export async function saveTrip(trip, noteOp) {
  const ops = [{ store: 'trips', put: clean(trip) }];
  const t = String(trip.locoType || '').trim();
  let types = S.locoTypes;
  if (t && !S.locoTypes.some((x) => normType(x) === normType(t))) {
    types = [t, ...S.locoTypes].slice(0, 50);
    ops.push({ store: 'meta', put: { id: 'locoTypes', list: types } });
  }
  if (noteOp?.put) ops.push({ store: 'notes', put: noteOp.put });
  if (noteOp?.del) ops.push({ store: 'notes', del: noteOp.del });
  await db.write(ops);
  S.locoTypes = types;
  trip._stats = tripStats(trip);
  const i = S.trips.findIndex((x) => x.id === trip.id);
  if (i >= 0) S.trips[i] = trip; else S.trips.push(trip);
  if (noteOp?.put) { const j = S.notes.findIndex((n) => n.id === noteOp.put.id); if (j >= 0) S.notes[j] = noteOp.put; else S.notes.push(noteOp.put); }
  if (noteOp?.del) S.notes = S.notes.filter((n) => n.id !== noteOp.del);
  askPersist();
  emit();
}

export async function deleteTrip(id) {
  const linked = S.notes.filter((n) => n.tripId === id).map((n) => ({ ...n, tripId: null }));
  await db.write([{ store: 'trips', del: id }, ...linked.map((n) => ({ store: 'notes', put: n }))]);
  S.trips = S.trips.filter((t) => t.id !== id);
  linked.forEach((n) => { const j = S.notes.findIndex((x) => x.id === n.id); if (j >= 0) S.notes[j] = n; });
  emit();
}

async function upsert(store, list, obj) {
  await db.put(store, obj);
  const arr = S[list];
  const i = arr.findIndex((x) => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  askPersist();
  emit();
}
async function remove(store, list, id) {
  await db.del(store, id);
  S[list] = S[list].filter((x) => x.id !== id);
  emit();
}

export const saveAbsence = (a) => upsert('absences', 'absences', a);
export const deleteAbsence = (id) => remove('absences', 'absences', id);
export const saveRoute = (r) => upsert('routes', 'routes', r);
export const saveNote = (n) => upsert('notes', 'notes', n);
export const deleteNote = (id) => remove('notes', 'notes', id);

export async function deleteRoute(id) {
  const r = S.routes.find((x) => x.id === id);
  const label = routeText(r);
  // поездки сохраняют название маршрута
  const affected = S.trips.filter((t) => t.routeId === id).map((t) => ({ ...t, routeId: null, routeLabel: label }));
  await db.write([{ store: 'routes', del: id }, ...affected.map((t) => ({ store: 'trips', put: clean(t) }))]);
  S.routes = S.routes.filter((x) => x.id !== id);
  affected.forEach((t) => { t._stats = tripStats(t); const i = S.trips.findIndex((x) => x.id === t.id); S.trips[i] = t; });
  emit();
}

// ---- Файлы ----
export async function addFile(meta, data) {
  await db.write([{ store: 'blobs', put: { id: meta.id, data } }, { store: 'files', put: meta }]);
  S.files.push(meta);
  askPersist();
}
export async function saveFileMeta(meta) {
  await db.put('files', meta);
  const i = S.files.findIndex((f) => f.id === meta.id);
  if (i >= 0) S.files[i] = meta; else S.files.push(meta);
  emit();
}
export async function deleteFiles(ids) {
  const ops = [];
  for (const id of ids) { ops.push({ store: 'files', del: id }); ops.push({ store: 'blobs', del: id }); }
  await db.write(ops);
  const set = new Set(ids);
  S.files = S.files.filter((f) => !set.has(f.id));
  emit();
}
export const getBlob = (id) => db.get('blobs', id);
