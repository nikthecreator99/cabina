// Отдых: дома отдыха, отдых в пункте оборота, «На очередь», полный (домашний) отдых.
import { S, statsOf, isLive, legEnds, stationKey, sameSt } from './store.js';
import { MIN, turnaroundRest, homeRestMulti, tripStats, legsOf } from './calc.js';

export { stationKey, sameSt };

// Концы маршрута всей поездки: откуда (первый локомотив) и куда (последний). null — где-то маршрут не указан.
export function routeEnds(trip) {
  const legs = legsOf(trip);
  const a = legEnds(legs[0]);
  const b = legs.length > 1 ? legEnds(legs[legs.length - 1]) : a;
  return a && b ? { from: a.from, to: b.to } : null;
}
// Станция прибытия: у поездки со сменой локомотива — по маршруту последнего локомотива
const arrivalOf = (trip) => { const legs = legsOf(trip); return legEnds(legs[legs.length - 1])?.to || null; };

// Дом отдыха — станция прибытия поездки с отдыхом в пункте оборота. null — маршрут не указан.
export function houseOf(trip) {
  if (trip.restType !== 'turnaround') return null;
  return arrivalOf(trip);
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
  // конец участка — тоже дом отдыха, если по участку ещё не ездили или ездили с отдыхом в пункте оборота
  const lastRoute = (t) => { const legs = legsOf(t); return legs[legs.length - 1].routeId; };
  for (const r of S.routes) {
    const ts = S.trips.filter((t) => lastRoute(t) === r.id);
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

// Выходной: длительность у каждого депо своя, задаётся в «Настройках работы» (по умолчанию 60 ч)
export const DAY_OFF_DEFAULT = 60 * 60;
export const dayOffMin = () => S.settings.dayOffMin ?? DAY_OFF_DEFAULT;
// trip — поездка, после которой выбран выходной: у неё своя длительность (как была на момент выбора)
export const dayOffUntil = (endMs, trip) => endMs + (trip?.dayOffMin || dayOffMin()) * MIN;

// Полный отдых, окончание которого поправили вручную: минут после окончания поездки (целое > 0) или 0
export const restEndOf = (trip) => (Number.isInteger(trip?.restEndMin) && trip.restEndMin > 0 && trip.restEndMin <= 14 * 24 * 60 ? trip.restEndMin : 0);

export const HOME_CHOICES = {
  queue: 'На очереди',
  dayOff: 'На выходном',
  full: 'Полный отдых',
  fullOff: 'Полный отдых с выходным',
};
// Что можно выбрать после «Домашний отдых» (2.22: выбор обязателен). 'other' — «Другое»: отдыха на главной нет,
// как у старых поездок без выбора (homeChoice: null — так и остаётся, пока поездку не поправят)
export const HOME_PICKS = ['queue', 'dayOff', 'full', 'fullOff', 'other'];

// Выбранный после поездки отдых: { kind, label, until } или null
export function chosenRest(trip, pool = S.trips) {
  const st = trip._stats && !isLive(trip) ? trip._stats : tripStats(trip);
  if (!Number.isFinite(st.end) || isLive(trip)) return null;
  if (trip.restType === 'home') {
    if (trip.homeChoice === 'queue') return { kind: 'queue', label: HOME_CHOICES.queue, until: queueUntil(st.end) };
    if (trip.homeChoice === 'dayOff') return { kind: 'dayOff', label: HOME_CHOICES.dayOff, until: dayOffUntil(st.end, trip) };
    if (trip.homeChoice === 'full' || trip.homeChoice === 'fullOff') {
      // окончание поправили вручную (2.21.2, как у выходного): restEndMin — минут после окончания поездки
      const own = restEndOf(trip);
      if (own) return { kind: trip.homeChoice, label: HOME_CHOICES[trip.homeChoice], until: st.end + own * MIN, own: true };
      const r = computeHomeRest(trip, trip.homeRest?.ids, pool);
      if (!r || r.missing || !r.valid) return null;
      return trip.homeChoice === 'full'
        ? { kind: 'full', label: HOME_CHOICES.full, until: r.fullUntil }
        : { kind: 'fullOff', label: HOME_CHOICES.fullOff, until: r.withDayOffUntil };
    }
    return null;
  }
  if (trip.restType !== 'turnaround') return null; // отдых после поездки не выбран
  const house = houseOf(trip);
  const r = turnaroundRest(st.work, st.end, houseMinRest(house));
  return { kind: 'turnaround', label: 'Отдых в пункте оборота', house, until: r.until, rest: r.rest };
}

// Последняя законченная поездка, если нет поездки «в пути» и «ждёт явки»
function lastFinished(now) {
  if (S.trips.some(isLive)) return null;
  let last = null;
  let lastEnd = -Infinity;
  for (const t of S.trips) { const st = statsOf(t); if (st.end <= now && st.end > lastEnd) { last = t; lastEnd = st.end; } }
  return last;
}

// Отдых, который идёт сейчас: после последней завершённой поездки, если нет поездки «в пути»
export function currentRest(now) {
  const last = lastFinished(now);
  if (!last) return null;
  const r = chosenRest(last);
  if (!r || r.until <= now) return null;
  return { trip: last, ...r, left: (r.until - now) / MIN };
}

// Больше 48 ч после поездки — это уже не отдых в пункте оборота (как OVERREST_MAX в pay.js)
const TURN_MAX = 48 * 60 * MIN;

// Отдых в пункте оборота для главного экрана (2.24.8, просьба Никиты), пока не добавлена новая явка:
// 'rest' — идёт положенный отдых (половина рабочего времени, не меньше минимума), до r.until;
// 'full' — положенный вышел, идёт отдых до 100 % рабочего времени поездки;
// 'over' — и 100 % вышли: переотдых (с окончания 100 %, как в заработке — overRestIntervals), до 48 ч после поездки.
export function turnaroundNow(now) {
  const last = lastFinished(now);
  if (!last || last.restType !== 'turnaround') return null;
  const r = chosenRest(last);
  if (!r) return null;
  const st = statsOf(last);
  const fullAt = st.end + st.work * MIN;
  const base = { trip: last, house: r.house, half: r.until, fullAt };
  if (now < r.until) return { ...base, stage: 'rest', until: r.until, left: (r.until - now) / MIN };
  if (now < fullAt) return { ...base, stage: 'full', until: fullAt, left: (fullAt - now) / MIN };
  if (now - st.end > TURN_MAX) return null;
  return { ...base, stage: 'over', since: fullAt, over: (now - fullAt) / MIN };
}

// Выходные (выбор «Пойти на выходной» после поездки): [{ trip, s, e }] в мс — для календаря и статуса
export function dayOffIntervals(pool = S.trips) {
  const out = [];
  for (const t of pool) {
    if (t.restType !== 'home' || t.homeChoice !== 'dayOff' || isLive(t)) continue;
    const st = statsOf(t);
    if (Number.isFinite(st.end)) out.push({ trip: t, s: st.end, e: dayOffUntil(st.end, t) });
  }
  return out;
}

