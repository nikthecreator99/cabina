// Напарник в поездке (2.32, просьба Никиты 11.11.2026): кто ездил вместе — для статистики «с кем сколько поездок».
// Поле поездки mates [{id, name}] — не больше MATES_MAX; id — номер коллеги из «Коллег» (uuid) или '' для вписанного имени.
// Хранится только в этом телефоне (как «Телефоны»): на сервер, напарнику, в «Поделиться напарнику» и в таблицу не уходит.
// Всё из хранилища и копии — непроверенное, поэтому только через matesOf.
export const MATES_MAX = 3;
export const MATE_NAME_MAX = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const mateName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\s]+/g, ' ').trim().slice(0, MATE_NAME_MAX).trim();
const fold = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
// Один и тот же человек: коллега — по id, вписанное имя — по имени без регистра, «ё» и знаков
export const mateKey = (m) => (m.id ? `id:${m.id}` : `n:${fold(m.name)}`);

export function cleanMates(list) {
  if (!Array.isArray(list)) return [];
  const out = []; const seen = new Set();
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const name = mateName(x.name);
    if (!name) continue;
    const id = typeof x.id === 'string' && UUID.test(x.id) ? x.id.toLowerCase() : '';
    const m = { id, name };
    const k = mateKey(m);
    if (seen.has(k)) continue;
    seen.add(k); out.push(m);
    if (out.length >= MATES_MAX) break;
  }
  return out;
}
export const matesOf = (t) => cleanMates(t?.mates);
export const matesText = (t) => matesOf(t).map((m) => m.name).join(', ');

// С кем ездил: [{key, id, name, n, work, trips}] — больше поездок выше; имя — из самой поздней поездки.
// work(t) — рабочее время поездки в минутах (передаётся снаружи, чтобы модуль не зависел от расчётов)
export function matesStats(trips, work = () => 0, startOf = (t) => t.start) {
  const by = new Map();
  for (const t of trips) {
    for (const m of matesOf(t)) {
      const k = mateKey(m);
      const s = by.get(k) || { key: k, id: m.id, name: m.name, n: 0, work: 0, trips: [], last: '' };
      s.n++; s.work += work(t) || 0; s.trips.push(t);
      const at = String(startOf(t) ?? '');
      if (at >= s.last) { s.last = at; s.name = m.name; }
      by.set(k, s);
    }
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.work - a.work || a.name.localeCompare(b.name, 'ru'));
}

// Недавние напарники по всем поездкам: сначала тот, с кем ездили последним
export function recentMates(trips, n = 8) {
  const by = new Map();
  for (const t of trips) {
    for (const m of matesOf(t)) {
      const k = mateKey(m);
      const s = by.get(k);
      const at = String(t.start || '');
      if (!s) by.set(k, { ...m, key: k, n: 1, last: at });
      else { s.n++; if (at >= s.last) { s.last = at; s.name = m.name; } }
    }
  }
  return [...by.values()].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)).slice(0, n);
}
