// «Коллеги» (с 2.15): найти коллегу по имени, предложить стать коллегами, показывать коллегам свой статус.
// Работает только с аккаунтом и через наш сервер в России (server/migrations/0002_colleagues.sql).
// Что уходит на сервер, решает сам человек, и всё по умолчанию выключено:
//   карточка — имя, должность и, если включено в «Приватности», депо и персонаж (набор деталей, не фото);
//   «Меня можно найти» — отдельное согласие на распространение (152-ФЗ, ст. 10.1); выключил — согласие отозвано;
//   статус — одна строка без истории: вид, станции или дом отдыха, часть суток, «до …»; сам стирается через 48 часов.
// Номер поезда и локомотива, точное время явки, причина и даты отвлечения, телефон на сервер не уходят никогда.
// Всё, что пришло с сервера, — непроверенное: текст только через esc(), персонаж — через normalizeAvatar.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, whenShort, plural, layerCount, MONTHS_GEN } from './ui.js';
import { S, saveProfile, nowLocal, onChange } from './store.js';
import { DAY } from './calc.js';
import { session, rpc, restGet, errorText } from './auth.js';
import { CONSENT_VERSION, PUBLISH_VERSION, consentHtml, policyHtml, publishConsentHtml, legalReady } from './legal.js';
import { statusFacts, privacyOf } from './profile.js';
import { routeEnds } from './rest.js';
import { avatarSvg, normalizeAvatar } from './avatar.js';
import { premiumOk, hasAvatar } from './avatar-edit.js';

export const ROLE_NAMES = { assistant: 'Помощник машиниста', driver: 'Машинист', other: 'Другая должность' };
const KINDS = ['soon', 'trip', 'rest', 'wait', 'dayoff', 'between', 'abs'];
// часть суток вместо точного времени: «Скоро явка · завтра утром», «В пути · … · с утра»
const PARTS = { night: ['ночью', 'с ночи'], morning: ['утром', 'с утра'], day: ['днём', 'с обеда'], evening: ['вечером', 'с вечера'] };
// какой отдых дома выбран после поездки (только «Между поездками»)
const NOTES = { queue: 'на очередь с', full: 'полный отдых до', fullOff: 'полный отдых с выходным до', dayOff: 'выходной до' };
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arr = (v) => (Array.isArray(v) ? v : []);
const RESEND = 6 * 3600e3; // статус переотправляем раз в 6 часов, пока приложение открывают: сервер стирает его через 48 ч

// ---------------------------------------------------------------- время

// Сдвиг часового пояса из настроек: «настенное» время (как в поездках) = настоящее + сдвиг
export const tzOffset = () => Math.round((nowLocal() - Date.now()) / 900000) * 900000;
// Часть суток по настенному времени
export function partOf(ms) {
  const h = new Date(ms).getUTCHours();
  return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'day' : 'evening';
}
// Начало части суток (00, 06, 12, 18 часов) — дальше этого точность явки не уходит
export function partStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 6) * 6);
}

// ---------------------------------------------------------------- что уходит на сервер

// Текст так же, как его чистит сервер (private.clean): без служебных символов и лишних пробелов
export const cleanText = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\s]+/g, ' ').trim().slice(0, max).trim();

// Статус для коллег из того, что считает телефон (statusFacts в profile.js). off — сдвиг часового пояса.
// Сервер ещё раз отбрасывает лишнее для каждого вида (set_status), но приложение лишнего и не шлёт.
export function statusPayload(f, off = tzOffset()) {
  if (!f || !KINDS.includes(f.kind)) return null;
  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms - off).toISOString() : null);
  const p = { p_kind: f.kind, p_place: null, p_dest: null, p_part: null, p_note: null, p_until: null };
  if (f.kind === 'soon') { p.p_part = partOf(f.start); p.p_until = iso(partStart(f.start)); }
  if (f.kind === 'trip') {
    const e = f.trip ? routeEnds(f.trip) : null;
    if (e) { p.p_place = cleanText(e.from) || null; p.p_dest = cleanText(e.to) || null; }
    p.p_part = partOf(f.start);
  }
  if (f.kind === 'rest') { p.p_place = cleanText(f.house) || null; p.p_until = iso(f.until); }
  if (f.kind === 'wait') p.p_place = cleanText(f.house) || null;
  if (f.kind === 'dayoff') p.p_until = iso(f.until);
  if (f.kind === 'between' && f.rest && own(NOTES, f.rest.kind)) { p.p_note = f.rest.kind; p.p_until = iso(f.rest.until); }
  return p;
}
// То же, но в виде, в каком статус вернётся с сервера: для строки «Так вас видят коллеги»
export function payloadStatus(p) {
  if (!p) return null;
  return cleanStatus({ kind: p.p_kind, place: p.p_place, dest: p.p_dest, part: p.p_part, note: p.p_note, until_at: p.p_until,
    after_kind: p.p_kind === 'rest' ? 'wait' : p.p_kind === 'dayoff' ? 'between' : null });
}

// Карточка: имя и должность всегда, депо и персонаж — только если включены в «Приватности». Телефона здесь нет.
export function cardPayload(p = S.profile, { findable = false, premium = false } = {}) {
  const pv = privacyOf(p);
  const name = cleanText(p.name);
  if (!name) return null;
  return {
    p_name: name,
    p_role: own(ROLE_NAMES, p.role) ? p.role : null,
    p_depot: pv.depot ? cleanText(p.depot) || null : null,
    p_avatar: pv.avatar && hasAvatar(p) ? normalizeAvatar(p.avatar, { premium }) : null,
    p_searchable: findable,
  };
}

// ---------------------------------------------------------------- что пришло с сервера

const txt = (v, max = 60) => (typeof v === 'string' ? cleanText(v, max) : '');
const time = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

export function cleanCard(x) {
  const id = String(x?.user_id ?? x?.id ?? '');
  if (!x || typeof x !== 'object' || !UUID.test(id)) return null;
  const av = x.avatar && typeof x.avatar === 'object' && !Array.isArray(x.avatar) ? normalizeAvatar(x.avatar, { premium: true }) : null;
  return { id: id.toLowerCase(), name: txt(x.name) || 'Без имени', role: own(ROLE_NAMES, x.role) ? x.role : '', depot: txt(x.depot), avatar: av, searchable: x.searchable === true };
}

export function cleanStatus(x) {
  if (!x || typeof x !== 'object' || !KINDS.includes(x.kind)) return null;
  return {
    kind: x.kind, place: txt(x.place), dest: txt(x.dest),
    part: own(PARTS, x.part) ? x.part : '', note: own(NOTES, x.note) ? x.note : '',
    until: time(x.until_at), after: x.after_kind === 'wait' || x.after_kind === 'between' ? x.after_kind : '', at: time(x.updated_at),
  };
}

// Снимок с сервера: согласия, моя карточка, предложения мне, мои предложения, коллеги со статусом
export function buildSnapshot(me, { consents, links, cards, statuses }) {
  me = String(me).toLowerCase();
  const ok = (doc) => arr(consents).some((c) => c && c.document === doc && !c.withdrawn_at);
  const cardOf = new Map();
  for (const c of arr(cards)) { const k = cleanCard(c); if (k) cardOf.set(k.id, k); }
  const statusOf = new Map();
  for (const s of arr(statuses)) { const v = UUID.test(String(s?.user_id)) && cleanStatus(s); if (v) statusOf.set(s.user_id.toLowerCase(), v); }
  const out = { consent: { main: ok(CONSENT_VERSION), publish: ok(PUBLISH_VERSION) }, card: cardOf.get(me) || null, myStatus: statusOf.get(me) || null, incoming: [], outgoing: [], colleagues: [] };
  const seen = new Set();
  for (const l of arr(links)) {
    if (!l || !UUID.test(String(l.from_id)) || !UUID.test(String(l.to_id))) continue;
    const from = l.from_id.toLowerCase(); const to = l.to_id.toLowerCase();
    if ((from !== me && to !== me) || from === to) continue;
    const other = from === me ? to : from;
    if (seen.has(other)) continue;
    seen.add(other);
    const item = { id: other, card: cardOf.get(other) || { id: other, name: 'Без имени', role: '', depot: '', avatar: null, searchable: false } };
    if (l.state === 'accepted') out.colleagues.push({ ...item, status: statusOf.get(other) || null });
    else if (l.state === 'pending') (from === me ? out.outgoing : out.incoming).push(item);
  }
  const byName = (a, b) => a.card.name.localeCompare(b.card.name, 'ru');
  out.colleagues.sort(byName); out.incoming.sort(byName); out.outgoing.sort(byName);
  return out;
}

// ---------------------------------------------------------------- строка статуса коллеги

// Как коллега видит статус. Время с сервера — настоящее, показываем в своём часовом поясе (off).
// Отдых или выходной закончился, а коллега ещё не открывал CABINA — показываем то, что идёт следом («Ждёт явку»).
export function colleagueLine(st, nowAbs = Date.now(), off = tzOffset()) {
  if (!st) return null;
  const now = nowAbs + off;
  const when = (ms) => whenShort(ms + off, now).replace(/^сегодня, /, '');
  const kind = st.until != null && st.until <= nowAbs && st.after ? st.after : st.kind;
  const line = (label, ...sub) => ({ kind, label, sub: sub.filter(Boolean).join(' · ') });
  switch (kind) {
    case 'soon': return line('Скоро явка', st.part ? soonWhen(st, now, off) : '');
    case 'trip': return line('В пути', st.place && st.dest ? `${st.place} → ${st.dest}` : st.place || st.dest, st.part ? PARTS[st.part][1] : '');
    case 'rest': return line('На отдыхе', st.place, st.until != null ? `до ${when(st.until)}` : '');
    case 'wait': return line('Ждёт явку', st.place);
    case 'dayoff': return line('На выходном', st.until != null ? `до ${when(st.until)}` : '');
    case 'abs': return line('На отвлечении');
    default: return line('Между поездками', kind === st.kind && st.note && st.until != null && st.until > nowAbs ? `${NOTES[st.note]} ${when(st.until)}` : '');
  }
}
// «сегодня утром», «завтра днём», «этой ночью», «1 ноября утром»
function soonWhen(st, now, off) {
  const word = PARTS[st.part][0];
  if (st.until == null) return word;
  const at = st.until + off;
  const d = Math.floor(at / DAY); const n = Math.floor(now / DAY); const h = new Date(now).getUTCHours();
  if (st.part === 'night' && ((d === n + 1 && h >= 18) || (d === n && h < 6))) return 'этой ночью';
  if (d === n) return `сегодня ${word}`;
  if (d === n + 1) return `завтра ${word}`;
  if (d === n - 1) return `вчера ${word}`;
  const x = new Date(at);
  return `${x.getUTCDate()} ${MONTHS_GEN[x.getUTCMonth()]} ${word}`;
}
// «обновлено в 09:10», «обновлено вчера, 21:40»
export function updatedText(at, nowAbs = Date.now(), off = tzOffset()) {
  if (at == null) return '';
  const w = whenShort(at + off, nowAbs + off);
  return /^сегодня, /.test(w) ? `обновлено в ${w.slice(9)}` : `обновлено ${w}`;
}

// ---------------------------------------------------------------- состояние

const C = { sub: null, snap: null, at: 0, failAt: 0, err: '', loading: null, busy: false,
  q: { name: '', depot: '', role: '' }, results: null, searching: false };
let hooks = { rerender: () => {}, go: () => {}, active: () => false };
const SYNC_KEY = 'cabina-colleagues';

function reset(sub) {
  Object.assign(C, { sub, snap: null, at: 0, failAt: 0, err: '', loading: null, busy: false, q: { name: '', depot: '', role: '' }, results: null, searching: false });
}
// Текущий вход; сменился человек или вышел — всё, что знали о коллегах, забываем
function mine() {
  const s = session();
  const sub = s?.sub ? String(s.sub).toLowerCase() : null;
  if (sub !== C.sub) {
    reset(sub);
    if (!sub) { try { localStorage.removeItem(SYNC_KEY); } catch {} }
  }
  return sub ? s : null;
}

// Что и когда последний раз отправили (только отпечатки, сами данные не храним)
function readSync(sub) {
  try { const x = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); if (x && x.sub === sub) return x; } catch {}
  return { sub, card: '', status: '', statusAt: 0 };
}
function writeSync(x) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(x)); } catch {} }
const mark = (v) => { let h = 0x811c9dc5; for (const c of JSON.stringify(v)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

export function initColleagues(h) {
  hooks = { ...hooks, ...h };
  onChange(() => { if (C.snap) scheduleSync(); });
}

const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const SERVER_OFF = 'Раздел «Коллеги» на сервере ещё не включён. Попробуйте позже.';
const notReady = (r) => r && (r.status === 404 || /^(PGRST20\d|42883|42P01|42703)$/.test(String(r.data?.code || '')));

// Понятная причина отказа сервера
export function colError(r, what = '') {
  if (!r) return OFFLINE;
  if (notReady(r)) return SERVER_OFF;
  const m = String(r.data?.message || '');
  if (/name too short/.test(m)) return 'Введите не меньше 3 букв имени.';
  if (/name required/.test(m)) return 'Сначала укажите имя в профиле.';
  if (/publish consent required/.test(m)) return 'Чтобы вас можно было найти, нужно отдельное согласие.';
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  if (/cabina: later/.test(m)) return 'Предложить этому человеку снова можно будет позже: после отказа или удаления из коллег — через 30 дней.';
  if (/cabina: not found/.test(m)) return 'Этого человека уже нет в поиске.';
  if (/cabina: limit/.test(m)) return what === 'search' ? 'На сегодня поисков слишком много. Попробуйте завтра.' : 'На сегодня предложений слишком много: не больше 10 в день. Попробуйте завтра.';
  return errorText(r);
}

// Снимок с сервера. Таблицы читаем обычными запросами: что видно, решают правила базы (RLS).
export function loadColleagues({ force = false } = {}) {
  const s = mine();
  if (!s || !legalReady()) return Promise.resolve(null);
  if (C.loading) return C.loading;
  if (!force && C.snap && Date.now() - C.at < 30e3) return Promise.resolve(C.snap);
  const sub = C.sub;
  C.loading = (async () => {
    const rs = await Promise.all([
      restGet('consents?select=document,withdrawn_at'),
      restGet('links?select=from_id,to_id,state'),
      restGet('cards?select=user_id,name,role,depot,avatar,searchable'),
      restGet('statuses?select=user_id,kind,place,dest,part,note,until_at,after_kind,updated_at'),
    ]);
    if (mine()?.sub?.toLowerCase() !== sub) return null; // за это время вышли из аккаунта
    const bad = rs.find((r) => !r?.ok);
    if (bad !== undefined) {
      C.err = !bad ? 'offline' : notReady(bad) ? 'server' : 'error';
      C.failAt = Date.now();
      return C.snap;
    }
    const [consents, links, cards, statuses] = rs.map((r) => r.data);
    C.snap = buildSnapshot(sub, { consents, links, cards, statuses });
    C.at = Date.now(); C.err = '';
    return C.snap;
  })().finally(() => { C.loading = null; });
  return C.loading.then((snap) => {
    if (hooks.active() && !layerCount()) hooks.rerender();
    if (snap) scheduleSync(0);
    return snap;
  });
}
function ensureFresh() {
  if (C.loading) return;
  if (C.err && Date.now() - C.failAt < 30e3) return;
  if (!C.snap || Date.now() - C.at > 60e3) loadColleagues({ force: true });
}
// Раз в минуту (приложение открыто): свежий снимок, пока виден раздел, и отправка изменившегося статуса
export function colleaguesTick() {
  if (!mine() || document.visibilityState !== 'visible') return;
  if (hooks.active() && Date.now() - C.at > 120e3) loadColleagues({ force: true });
  else if (!C.snap && !C.loading && Date.now() - C.failAt > 300e3) loadColleagues({ force: true });
  else if (C.snap) scheduleSync(0);
}
// Приложение открыли или вернулись в него
export function colleaguesWake() {
  if (!mine()) return;
  loadColleagues({ force: Date.now() - C.at > 60e3 });
}

// ---------------------------------------------------------------- отправка своего

let syncTimer = null;
let syncing = false;
function scheduleSync(ms = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { sync().catch(() => {}); }, ms);
}

// Сводим то, что на сервере, с выбором человека. При любом расхождении побеждает «выключено».
async function sync() {
  const s = mine();
  const snap = C.snap;
  if (!s || !snap || !snap.consent.main) return;
  if (syncing) { scheduleSync(3000); return; }
  syncing = true;
  try {
    const last = readSync(C.sub);
    const pv = privacyOf();
    // «Меня можно найти» выключили на другом устройстве или вышли из «Коллег» — выключаем и здесь
    if (pv.find && !snap.consent.publish) { await saveProfile({ privacy: { ...pv, find: false } }); return; }
    const want = cardPayload(S.profile, { findable: pv.find, premium: premiumOk() })
      // имя стёрли, а из поиска убрать нужно: сервер без имени карточку не сохранит
      || (snap.card?.searchable ? { p_name: snap.card.name, p_role: snap.card.role || null, p_depot: null, p_avatar: null, p_searchable: false } : null);
    // новую карточку создаём только по действию человека («Меня можно найти», предложить, принять), здесь — лишь обновляем
    if (want && (snap.card || want.p_searchable)) {
      const m = mark(want);
      if (!snap.card || snap.card.searchable !== want.p_searchable || last.card !== m) {
        const r = await rpc('save_card', want);
        if (r?.ok) { last.card = m; snap.card = cleanCard({ user_id: C.sub, name: want.p_name, role: want.p_role, depot: want.p_depot, avatar: want.p_avatar, searchable: want.p_searchable }); }
        else if (/publish consent required/.test(String(r?.data?.message))) { await saveProfile({ privacy: { ...pv, find: false } }); return; }
      }
    }
    const st = pv.status && snap.colleagues.length ? statusPayload(statusFacts()) : null;
    if (st) {
      const m = mark(st);
      if (m !== last.status || Date.now() - last.statusAt > RESEND) {
        const r = await rpc('set_status', st);
        if (r?.ok) { last.status = m; last.statusAt = Date.now(); snap.myStatus = payloadStatus(st); }
      }
    } else if (last.status || snap.myStatus) {
      const r = await rpc('clear_status');
      if (r?.ok) { last.status = ''; last.statusAt = 0; snap.myStatus = null; }
    }
    writeSync(last);
  } finally { syncing = false; }
}

// ---------------------------------------------------------------- окна

// Согласие с галочкой (не отмечена заранее). true — человек согласился.
function askConsent({ title, html, label, ok, policy = false }) {
  return new Promise((resolve) => {
    let result = false;
    const el = openLayer(sheet({ title, tall: true,
      body: `${html}${policy ? `<div class="acc-docs"><button type="button" class="link-btn" data-act="col-policy">${small(I.book, 16)} Прочитать политику</button></div>` : ''}
        <div class="acc-consent col-agree"><input type="checkbox" id="col-agree"><label for="col-agree">${label}</label></div>
        <div id="col-agree-err" class="acc-err" role="alert" aria-live="assertive"></div>`,
      foot: `<button class="btn btn-primary" data-act="col-agree-ok">${esc(ok)}</button>` }), { onClose: () => resolve(result) });
    el.querySelector('[data-act="col-policy"]')?.addEventListener('click', () => openLayer(sheet({ title: 'Политика обработки персональных данных', body: policyHtml(), tall: true, back: true })));
    el.querySelector('[data-act="col-agree-ok"]').addEventListener('click', () => {
      const box = el.querySelector('#col-agree');
      if (!box.checked) {
        el.querySelector('#col-agree-err').innerHTML = `<div class="error-box">${I.alert}<span>Отметьте галочку, если согласны.</span></div>`;
        box.focus();
        return;
      }
      result = true;
      closeLayer(el);
    });
  });
}

function needAccount() {
  const el = openLayer(sheet({ title: 'Нужен аккаунт CABINA', body: `
    <p class="hint">Коллеги работают через аккаунт: так предложения и ваш статус доходят только до тех, кого вы сами добавили.</p>
    <div class="notice ok">${I.shield}<div>Без аккаунта CABINA работает как раньше: все записи остаются в этом телефоне.</div></div>`,
  foot: '<button class="btn btn-primary" data-act="col-to-account">Аккаунт CABINA</button>' }));
  el.querySelector('[data-act="col-to-account"]').addEventListener('click', () => { closeLayer(el); hooks.go('account'); });
}

const snapOrSay = async () => {
  const snap = C.snap || await loadColleagues({ force: true });
  if (!snap) toast(C.err === 'server' ? SERVER_OFF : OFFLINE, { error: true, ms: 5000 });
  return snap;
};

// Новая редакция согласия (в ней появились «Коллеги») — для тех, кто зарегистрировался раньше
async function ensureConsent() {
  const snap = await snapOrSay();
  if (!snap) return false;
  if (snap.consent.main) return true;
  const ok = await askConsent({ title: 'Новая редакция согласия', html: consentHtml(), policy: true, ok: 'Принять',
    label: 'Мне исполнилось 18 лет. Даю согласие на обработку моих персональных данных в этой редакции.' });
  if (!ok) return false;
  const r = await rpc('give_consent', { p_document: CONSENT_VERSION });
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return false; }
  snap.consent.main = true;
  toast('Согласие принято');
  hooks.rerender();
  scheduleSync(0);
  return true;
}

// Без имени коллеги не поймут, кто это: сервер карточку без имени не принимает
async function ensureCard() {
  const pv = privacyOf();
  const want = cardPayload(S.profile, { findable: pv.find && !!C.snap?.consent.publish, premium: premiumOk() });
  if (!want) {
    toast('Сначала укажите имя в профиле — по нему вас узнают коллеги', { error: true, ms: 5000 });
    hooks.go('profile-edit');
    setTimeout(() => document.getElementById('pr-name')?.focus(), 350);
    return false;
  }
  if (C.snap?.card) return true;
  const r = await rpc('save_card', want);
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return false; }
  const last = readSync(C.sub); last.card = mark(want); writeSync(last);
  return true;
}

// Окно коллеги: персонаж, имя, статус и «Удалить из коллег»
function openColleague(id) {
  const c = C.snap?.colleagues.find((x) => x.id === id);
  if (!c) return;
  const line = colleagueLine(c.status);
  const el = openLayer(sheet({ title: 'Коллега', body: `
    <section class="profile-card col-card">
      <span class="avatar view big">${cardAvatar(c.card, 132)}</span>
      <div class="profile-name">${esc(c.card.name)}</div>
      ${cardSub(c.card) ? `<div class="profile-sub">${esc(cardSub(c.card))}</div>` : ''}
      ${line ? `${pill(line, 'pr-status')}<div class="hint">${esc(updatedText(c.status.at))}</div>` : '<div class="hint">Статус не показан: коллега его не включил или давно не открывал CABINA.</div>'}
    </section>
    <div class="notice ok">${I.shield}<div>Номер поезда и локомотива, точное время явки и причину отвлечения CABINA коллегам не показывает.</div></div>`,
  foot: `<button class="btn btn-danger" data-act="col-drop">${small(I.trash, 18)} Удалить из коллег</button>` }));
  el.querySelector('[data-act="col-drop"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Удалить из коллег?', ok: 'Удалить',
      text: `${c.card.name} перестанет видеть ваш статус, а вы — его. Снова предложить вам стать коллегами этот человек сможет только через 30 дней.` });
    if (!ok) return;
    const r = await rpc('drop_colleague', { p_other: c.id });
    if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return; }
    closeLayer(el);
    toast('Удалён из коллег');
    await loadColleagues({ force: true });
  });
}

// ---------------------------------------------------------------- разметка

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
function cardAvatar(card, size = 44) {
  if (card.avatar) return avatarSvg(card.avatar, { size, cls: 'ava-svg' });
  const ini = initials(card.name);
  return ini ? `<span class="ava-txt">${esc(ini)}</span>` : I.user;
}
const cardSub = (card) => [card.role === 'other' ? '' : ROLE_NAMES[card.role], card.depot ? `депо ${card.depot}` : ''].filter(Boolean).join(' · ');
const pill = (line, cls = 'col-st') => `<span class="${cls} st-${line.kind}"><span class="dot"></span><b>${esc(line.label)}</b>${line.sub ? `<small>${esc(line.sub)}</small>` : ''}</span>`;
const avaBox = (card) => `<span class="col-ava" aria-hidden="true">${cardAvatar(card)}</span>`;
const idAttr = (id) => `data-id="${esc(id)}"`;

function colleagueRow(c) {
  const line = colleagueLine(c.status);
  return `<button class="row col-row" data-act="col-open" ${idAttr(c.id)}>${avaBox(c.card)}
    <div class="grow"><div class="t1">${esc(c.card.name)}</div>
      ${line ? `<div class="t2">${pill(line)}</div><div class="col-upd">${esc(updatedText(c.status.at))}</div>` : '<div class="t2">Статус не показан</div>'}</div>${small(I.right, 18)}</button>`;
}
function offerRow(o) {
  return `<div class="col-offer">
    <div class="col-who">${avaBox(o.card)}<div class="grow"><div class="t1">${esc(o.card.name)}</div><div class="t2">${esc(cardSub(o.card) || 'Предлагает стать коллегами')}</div></div></div>
    ${cardSub(o.card) ? '<div class="t2">Предлагает стать коллегами</div>' : ''}
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="col-decline" ${idAttr(o.id)}>Отклонить</button><button class="btn btn-primary btn-sm" data-act="col-accept" ${idAttr(o.id)}>Принять</button></div>
  </div>`;
}
function sentRow(o) {
  return `<div class="row col-row">${avaBox(o.card)}<div class="grow"><div class="t1">${esc(o.card.name)}</div><div class="t2">Ждёт ответа</div></div>
    <button class="btn btn-plain btn-sm" data-act="col-cancel" ${idAttr(o.id)} aria-label="Отменить предложение: ${esc(o.card.name)}">Отменить</button></div>`;
}
const switchRow = (k, title, sub, on) => `<div class="row"><div class="grow"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
  <button class="switch" role="switch" data-act="pr-priv" data-k="${k}" aria-checked="${on}" aria-label="${title}"></button></div>`;

function loadingHtml(head) {
  const body = C.err
    ? `<div class="grow t2">${esc(C.err === 'server' ? SERVER_OFF : C.err === 'offline' ? 'Нет связи с сервером — коллег покажем, когда появится интернет.' : 'Не удалось загрузить коллег.')}</div><button class="btn btn-plain btn-sm" data-act="col-retry">Повторить</button>`
    : '<div class="grow t2">Загружаем коллег…</div>';
  return `<div class="group col-sec" id="col-sec">${head}<div class="panel"><div class="row col-row">${body}</div></div></div>`;
}

// Раздел «Коллеги» на экране «Профиль». Без аккаунта его нет.
export function colleaguesHtml() {
  if (!legalReady() || !mine()) return '';
  ensureFresh();
  const head = '<div class="group-title">Коллеги</div>';
  const snap = C.snap;
  if (!snap) return loadingHtml(head);
  if (!snap.consent.main) {
    return `<div class="group col-sec" id="col-sec">${head}
      <div class="notice ok">${I.shield}<div><b>Новая редакция согласия.</b> В ней появились «Коллеги»: поиск коллег и статус для них. Чтобы пользоваться ими, прочитайте и примите согласие.</div></div>
      <button class="btn btn-primary" data-act="col-consent">Прочитать и принять</button></div>`;
  }
  const pv = privacyOf();
  const mineLine = colleagueLine(payloadStatus(statusPayload(statusFacts())));
  const statusSub = !pv.status ? 'Выключено: коллеги не видят, где вы.'
    : `${snap.colleagues.length ? 'Так вас видят коллеги:' : 'Так вас увидят коллеги:'} ${mineLine ? pill(mineLine) : 'пока нечего показать'}`;
  const findSub = pv.find ? `Вас найдут по имени «${esc(cleanText(S.profile.name))}».` : 'Выключено: в поиске вас нет, предложить можете только вы.';
  const linked = snap.colleagues.length + snap.incoming.length + snap.outgoing.length > 0;
  return `<div class="group col-sec" id="col-sec">${head}
    <button class="col-search" data-act="go" data-page="colleagues">${small(I.search, 20)}<span>Найти коллегу</span></button>
    ${snap.incoming.length ? `<div class="panel col-offers">${snap.incoming.map(offerRow).join('')}</div>` : ''}
    ${snap.colleagues.length ? `<div class="panel" id="col-list">${snap.colleagues.map(colleagueRow).join('')}</div>`
      : '<div class="hint col-empty">Пока никого. Найдите коллегу по имени и предложите стать коллегами — когда он согласится, появится здесь.</div>'}
    ${snap.outgoing.length ? `<div class="group-title">Ждут ответа</div><div class="panel">${snap.outgoing.map(sentRow).join('')}</div>` : ''}
    <div class="panel" id="col-switches">
      ${switchRow('find', 'Меня можно найти', findSub, pv.find)}
      ${switchRow('status', 'Показывать мой статус коллегам', statusSub, pv.status)}
    </div>
    ${snap.card || linked ? '<button class="link-btn col-leave" data-act="col-leave">Выйти из «Коллег»</button>' : ''}
  </div>`;
}

// Экран «Найти коллегу»: имя (от 3 букв), депо и должность — по желанию
const ROLE_FILTER = [['', 'Любая'], ['assistant', 'Помощник'], ['driver', 'Машинист'], ['other', 'Другая']];
function resultRow(c) {
  const snap = C.snap;
  const rel = snap?.colleagues.some((x) => x.id === c.id) ? 'col' : snap?.outgoing.some((x) => x.id === c.id) ? 'sent' : snap?.incoming.some((x) => x.id === c.id) ? 'in' : '';
  const act = rel === 'col' ? '<span class="col-tag ok">Коллега</span>'
    : rel === 'sent' ? '<span class="col-tag">Ждёт ответа</span>'
    : rel === 'in' ? `<button class="btn btn-primary btn-sm" data-act="col-accept" ${idAttr(c.id)}>Принять</button>`
    : `<button class="btn btn-primary btn-sm" data-act="col-offer" ${idAttr(c.id)} aria-label="Предложить стать коллегами: ${esc(c.name)}">Предложить</button>`;
  return `<div class="row col-row">${avaBox(c)}<div class="grow"><div class="t1">${esc(c.name)}</div>${cardSub(c) ? `<div class="t2">${esc(cardSub(c))}</div>` : ''}</div>${act}</div>`;
}
function resultsHtml() {
  if (C.results == null) return '';
  if (!C.results.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Никого не нашли</b><p>Проверьте имя. В поиске только те, кто сам включил «Меня можно найти».</p></div>`;
  const n = C.results.length;
  return `<div class="group-title">Нашли ${n} ${plural(n, 'человека', 'человек', 'человек')}${n >= 20 ? ' — уточните имя или депо' : ''}</div><div class="panel" id="col-found">${C.results.map(resultRow).join('')}</div>`;
}

export function renderColleagues() {
  if (mine()) ensureFresh();
  else {
    return `${pageHead('Найти коллегу', { back: true })}
      <div class="notice ok">${I.shield}<div><b>Нужен аккаунт CABINA.</b> Коллеги работают через аккаунт: так предложения и статус доходят только до тех, кого вы добавили.</div></div>
      <button class="btn btn-primary" data-act="go" data-page="account">Аккаунт CABINA</button>`;
  }
  const q = C.q;
  return `${pageHead('Найти коллегу', { back: true })}
    <form class="panel pay-panel" id="col-form" novalidate role="search">
      <div class="pay-field"><label for="col-name">Имя</label><input class="input" id="col-name" type="search" maxlength="60" autocomplete="off" enterkeyhint="search" placeholder="Не меньше 3 букв" value="${esc(q.name)}"></div>
      <div class="pay-field"><label for="col-depot">Депо</label><input class="input" id="col-depot" maxlength="60" autocomplete="off" enterkeyhint="search" placeholder="Необязательно" value="${esc(q.depot)}"></div>
      <div class="pay-field"><div class="label" id="col-role-l">Должность</div>
        <div class="seg col-roles" id="col-role" role="group" aria-labelledby="col-role-l">${ROLE_FILTER.map(([k, v]) => `<button type="button" data-act="col-role" data-role="${k}" aria-pressed="${q.role === k}">${v}</button>`).join('')}</div></div>
    </form>
    <div id="col-err" class="acc-err" role="alert" aria-live="assertive"></div>
    <button class="btn btn-primary" type="submit" form="col-form" id="col-submit">${small(I.search, 18)} ${C.searching ? 'Ищем…' : 'Найти'}</button>
    <div id="col-results">${resultsHtml()}</div>
    <div class="notice ok">${I.shield}<div>В поиске только те, кто сам включил «Меня можно найти». Показываем не больше 20 человек. ${privacyOf().find ? 'Вас тоже можно найти по имени.' : 'Вас в поиске нет — это включается в разделе «Коллеги» в профиле.'}</div></div>`;
}

// ---------------------------------------------------------------- действия

function showErr(text, focusId) {
  const box = document.getElementById('col-err');
  if (box) box.innerHTML = text ? `<div class="error-box">${I.alert}<span>${esc(text)}</span></div>` : '';
  if (focusId) document.getElementById(focusId)?.focus();
}

export function colleaguesInput(t) {
  if (t.id === 'col-name') { C.q.name = t.value; return true; }
  if (t.id === 'col-depot') { C.q.depot = t.value; return true; }
  return false;
}

export async function colleaguesSubmit(e) {
  if (e.target.id !== 'col-form') return false;
  e.preventDefault();
  if (C.searching || !mine()) return true;
  C.q.name = document.getElementById('col-name')?.value ?? C.q.name;
  C.q.depot = document.getElementById('col-depot')?.value ?? C.q.depot;
  if (cleanText(C.q.name).toLowerCase().replace(/[^a-zа-яё0-9]/g, '').length < 3) { showErr('Введите не меньше 3 букв имени.', 'col-name'); return true; }
  showErr('');
  if (!(await ensureConsent())) return true;
  C.searching = true;
  const btn = document.getElementById('col-submit');
  if (btn) { btn.disabled = true; btn.lastChild.textContent = ' Ищем…'; }
  let r;
  try { r = await rpc('find_colleagues', { p_name: cleanText(C.q.name), p_depot: cleanText(C.q.depot) || null, p_role: C.q.role || null }); } finally { C.searching = false; }
  if (!r?.ok) { hooks.rerender(); showErr(colError(r, 'search')); return true; }
  C.results = arr(r.data).map(cleanCard).filter((c) => c && c.id !== C.sub).slice(0, 20);
  document.activeElement?.blur?.();
  hooks.rerender();
  return true;
}

async function setFind(on) {
  const pv = privacyOf();
  if (!on) {
    await saveProfile({ privacy: { ...pv, find: false } });
    if (!mine()) return;
    const snap = C.snap || await loadColleagues({ force: true });
    if (!snap?.card?.searchable) { toast('Вас больше нет в поиске'); return; }
    const want = cardPayload(S.profile, { findable: false, premium: premiumOk() }) || { p_name: snap.card.name, p_role: snap.card.role || null, p_depot: null, p_avatar: null, p_searchable: false };
    const r = await rpc('save_card', want);
    if (r?.ok) { snap.card = { ...snap.card, searchable: false }; snap.consent.publish = false; const last = readSync(C.sub); last.card = mark(want); writeSync(last); toast('Вас больше нет в поиске'); }
    else toast('Нет связи: уберём вас из поиска, как только появится интернет', { error: true, ms: 5000 });
    hooks.rerender();
    return;
  }
  if (!mine()) { needAccount(); return; }
  if (!cleanText(S.profile.name)) {
    toast('Сначала укажите имя — по нему вас найдут', { error: true, ms: 4000 });
    if (!document.getElementById('pr-name')) hooks.go('profile-edit');
    setTimeout(() => document.getElementById('pr-name')?.focus(), 350);
    return;
  }
  if (!(await ensureConsent())) return;
  const want = cardPayload(S.profile, { findable: true, premium: premiumOk() });
  const shown = ['имя', want.p_role ? 'должность' : '', want.p_depot ? 'депо' : '', want.p_avatar ? 'персонаж' : ''].filter(Boolean);
  const ok = await askConsent({ title: 'Меня можно найти', ok: 'Включить',
    html: `<div class="notice ok">${I.users}<div>Пользователи CABINA смогут найти вас по имени и увидят: <b>${shown.join(', ')}</b>. Статус, список коллег, почту и телефон в поиске не видно.</div></div>${publishConsentHtml(session()?.email || '')}`,
    label: 'Даю согласие на распространение этих данных, чтобы коллеги могли найти меня в поиске CABINA.' });
  if (!ok) return;
  let r = await rpc('give_consent', { p_document: PUBLISH_VERSION });
  if (r?.ok) r = await rpc('save_card', want);
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return; }
  if (C.snap) { C.snap.consent.publish = true; C.snap.card = cleanCard({ user_id: C.sub, name: want.p_name, role: want.p_role, depot: want.p_depot, avatar: want.p_avatar, searchable: true }); }
  const last = readSync(C.sub); last.card = mark(want); writeSync(last);
  await saveProfile({ privacy: { ...privacyOf(), find: true } });
  toast('Теперь вас можно найти по имени');
}

async function setStatus(on) {
  const pv = privacyOf();
  if (on && mine()) {
    const snap = await snapOrSay();
    if (!snap) return;
    if (!snap.consent.main && !(await ensureConsent())) return;
  }
  await saveProfile({ privacy: { ...pv, status: on } });
  if (!mine()) { if (on) toast('Статус увидят коллеги, когда вы войдёте в аккаунт и добавите их'); return; }
  if (!on) {
    const r = await rpc('clear_status');
    if (r?.ok) { const last = readSync(C.sub); last.status = ''; last.statusAt = 0; writeSync(last); if (C.snap) C.snap.myStatus = null; toast('Коллеги больше не видят ваш статус'); }
    else toast('Нет связи: статус сотрём с сервера, как только появится интернет', { error: true, ms: 5000 });
    return;
  }
  toast(C.snap?.colleagues.length ? 'Коллеги видят ваш статус' : 'Статус увидят коллеги, когда они появятся');
  scheduleSync(0);
}

export async function colleaguesClick(act, b) {
  if (act === 'pr-priv' && (b.dataset.k === 'find' || b.dataset.k === 'status')) {
    if (C.busy) return true;
    C.busy = true;
    try { if (b.dataset.k === 'find') await setFind(!privacyOf().find); else await setStatus(!privacyOf().status); } finally { C.busy = false; }
    return true;
  }
  if (!act.startsWith('col-')) return false;
  if (act === 'col-role') {
    C.q.role = own(ROLE_NAMES, b.dataset.role) ? b.dataset.role : '';
    document.querySelectorAll('#col-role button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    return true;
  }
  if (act === 'col-open') { openColleague(b.dataset.id); return true; }
  if (act === 'col-retry') { C.err = ''; C.failAt = 0; loadColleagues({ force: true }); hooks.rerender(); return true; }
  if (C.busy) return true;
  C.busy = true;
  try {
    const id = String(b.dataset.id || '').toLowerCase();
    const who = C.results?.find((x) => x.id === id) || [...(C.snap?.incoming || []), ...(C.snap?.outgoing || [])].find((x) => x.id === id)?.card;
    switch (act) {
      case 'col-consent': await ensureConsent(); break;
      case 'col-offer': {
        if (!UUID.test(id) || !(await ensureConsent())) break;
        const ok = await confirmDialog({ title: 'Предложить стать коллегами?', ok: 'Предложить', danger: false,
          text: `${who?.name || 'Человек'} получит предложение. Если согласится, вы будете видеть статусы друг друга — у кого он включён.` });
        if (!ok || !(await ensureCard())) break;
        const r = await rpc('offer_colleague', { p_to: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 6000 }); break; }
        toast(r.data === 'accepted' ? 'Теперь вы коллеги' : r.data === 'already' ? 'Вы уже коллеги' : 'Предложение отправлено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-accept': {
        if (!UUID.test(id) || !(await ensureConsent()) || !(await ensureCard())) break;
        const r = await rpc('answer_colleague', { p_from: id, p_accept: true });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast(privacyOf().status ? 'Теперь вы коллеги' : 'Теперь вы коллеги. Ваш статус они увидят, если вы его включите');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-decline': {
        const ok = await confirmDialog({ title: 'Отклонить предложение?', ok: 'Отклонить',
          text: `Повторное предложение от ${who?.name ? `«${who.name}»` : 'этого человека'} сможет прийти только через 30 дней.` });
        if (!ok) break;
        const r = await rpc('drop_colleague', { p_other: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast('Предложение отклонено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-cancel': {
        const r = await rpc('drop_colleague', { p_other: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast('Предложение отменено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-leave': {
        const ok = await confirmDialog({ title: 'Выйти из «Коллег»?', ok: 'Выйти',
          text: 'С сервера сразу сотрутся ваша карточка, статус, предложения и список коллег, вас не будет в поиске. Аккаунт и записи в телефоне останутся.' });
        if (!ok) break;
        const r = await rpc('leave_colleagues');
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        writeSync({ sub: C.sub, card: '', status: '', statusAt: 0 });
        C.results = null;
        await saveProfile({ privacy: { ...privacyOf(), find: false, status: false } });
        toast('Данные «Коллег» стёрты с сервера');
        await loadColleagues({ force: true });
        break;
      }
      default: return false;
    }
  } finally { C.busy = false; }
  return true;
}
