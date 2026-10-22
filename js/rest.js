// Отдых: дома отдыха, отдых в пункте оборота, «На очередь», полный (домашний) отдых.
import { S, statsOf, isLive } from './store.js';
import { MIN, turnaroundRest, homeRestMulti, tripStats } from './calc.js';

// Концы маршрута поездки: из сохранённого маршрута или из подписи «А → Б»
export function routeEnds(trip) {
  const r = trip.routeId && S.routes.find((x) => x.id === trip.routeId);
  if (r) return { from: r.from, to: r.to };
  const m = String(trip.routeLabel || '').split(/\s*(?:→|—|->)\s*/);
  return m.length === 2 && m[0] && m[1] ? { from: m[0].trim(), to: m[1].trim() } : null;
}
export const stationKey = (name) => String(name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export const sameSt = (a, b) => stationKey(a) === stationKey(b);

// Дом отдыха — станция прибытия поездки с отдыхом в пункте оборота. null — маршрут не указан.
export function houseOf(trip) {
  if (trip.restType !== 'turnaround') return null;
  const e = routeEnds(trip);
  return e ? e.to : null;
}

// Свой минимум дома отдыха или общий из настроек (минуты)
export function houseMinRest(name) {
  const h = name ? S.settings.houses?.[stationKey(name)] : null;
  return h && Number.isFinite(h.minRest) ? h.minRest : S.settings.minRest;
}
export const minRestFor = (trip) => houseMinRest(houseOf(trip));

// Дома отдыха для меню ☰: станции прибытия маршрутов и поездок с отдыхом в пункте оборота,
// а также станции, для которых уже задан свой минимум. Сначала те, где отдыхали чаще.
export function restHouses() {
  const map = new Map();
  const add = (name, n = 0) => {
    const k = stationKey(name);
    if (!k) return;
    const cur = map.get(k) || { key: k, name: String(name).trim(), count: 0 };
    cur.count += n;
    map.set(k, cur);
  };
  for (const t of S.trips) { const h = houseOf(t); if (h) add(h, 1); }
  // станция прибытия маршрута — тоже дом отдыха, если по маршруту ещё не ездили или ездили с отдыхом в пункте оборота
  for (const r of S.routes) {
    const ts = S.trips.filter((t) => t.routeId === r.id);
    if (!ts.length || ts.some((t) => t.restType === 'turnaround')) add(r.to);
  }
  for (const [k, v] of Object.entries(S.settings.houses || {})) if (!map.has(k)) add(v.name || k);
  return [...map.values()].map((h) => ({ ...h, minRest: S.settings.houses?.[h.key]?.minRest ?? null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

export function computeHomeRest(trip, ids, pool) {
  if (!ids || ids.length < 1) return null;
  const trips = ids.map((id) => (id === trip.id ? trip : pool.find((x) => x.id === id)));
  if (trips.some((t) => !t)) return { missing: true };
  const stats = trips.map((t) => (t === trip ? tripStats(trip) : statsOf(t)));
  const r = homeRestMulti(stats);
  r.earlyTrip = trips[stats.indexOf(r.early)];
  r.lateTrip = trips[stats.indexOf(r.late)];
  return r;
}

// «На очередь»: вызвать на явку могут не раньше, чем через минимальный междусменный отдых
export const queueUntil = (endMs) => endMs + (S.settings.minShiftRest ?? 960) * MIN;

export const HOME_CHOICES = {
  queue: 'На очереди',
  full: 'Полный отдых',
  fullOff: 'Полный отдых с выходным',
};

// Выбранный после поездки отдых: { kind, label, until } или null
export function chosenRest(trip, pool = S.trips) {
  const st = trip._stats && !isLive(trip) ? trip._stats : tripStats(trip);
  if (!Number.isFinite(st.end) || isLive(trip)) return null;
  if (trip.restType === 'home') {
    if (trip.homeChoice === 'queue') return { kind: 'queue', label: HOME_CHOICES.queue, until: queueUntil(st.end) };
    if (trip.homeChoice === 'full' || trip.homeChoice === 'fullOff') {
      const r = computeHomeRest(trip, trip.homeRest?.ids, pool);
      if (!r || r.missing || !r.valid) return null;
      return trip.homeChoice === 'full'
        ? { kind: 'full', label: HOME_CHOICES.full, until: r.fullUntil }
        : { kind: 'fullOff', label: HOME_CHOICES.fullOff, until: r.withDayOffUntil };
    }
    return null;
  }
  const house = houseOf(trip);
  const r = turnaroundRest(st.work, st.end, houseMinRest(house));
  return { kind: 'turnaround', label: 'Отдых в пункте оборота', house, until: r.until, rest: r.rest };
}

// Отдых, который идёт сейчас: после последней завершённой поездки, если нет поездки «в пути»
export function currentRest(now) {
  if (S.trips.some(isLive)) return null;
  let last = null;
  let lastEnd = -Infinity;
  for (const t of S.trips) { const st = statsOf(t); if (st.end <= now && st.end > lastEnd) { last = t; lastEnd = st.end; } }
  if (!last) return null;
  const r = chosenRest(last);
  if (!r || r.until <= now) return null;
  return { trip: last, ...r, left: (r.until - now) / MIN };
}
