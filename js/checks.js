// Проверки перед сохранением (2.21.5, просьба Никиты): поездки не налезают друг на друга,
// поездка на больничном или в отпуске и слишком длинная поездка — «Проверьте…».
// Всё считается в телефоне, ничего никуда не уходит.
import { tripStats, parseLocal, DAY, MIN } from './calc.js';

// Длиннее суток (от начала до окончания) — спрашиваем «точно так?»
export const LONG_TRIP_MIN = 24 * 60;

// Отрезки времени поездки (сама поездка, следование и ожидание пассажиром).
// «В пути» — до «сейчас»; «ждёт явки» (ещё не началась) — одна точка в момент явки.
export function tripSpans(trip, now) {
  const s = parseLocal(trip?.start);
  if (!Number.isFinite(s)) return [];
  const live = !trip.end;
  const iv = tripStats(trip, live && Number.isFinite(now) ? now : undefined).intervals
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
  return iv.length ? iv : [[s, s]];
}

// Пересекаются ли два отрезка. Касание (одна закончилась — другая началась) — можно.
// Точка (явка) мешает, только если попадает внутрь чужого отрезка или совпадает с другой явкой.
function meets([a, b], [c, d]) {
  if (a === b && c === d) return a === c;
  if (a === b) return c <= a && a < d;
  if (c === d) return a <= c && c < b;
  return Math.max(a, c) < Math.min(b, d);
}

// Первая другая поездка, на которую налезает эта (или null).
export function tripOverlap(trip, trips, now) {
  const mine = tripSpans(trip, now);
  if (!mine.length) return null;
  const lo = mine[0][0] - 3 * DAY;
  const hi = mine[mine.length - 1][1] + 3 * DAY;
  for (const t of trips || []) {
    if (!t || t.id === trip.id) continue;
    // быстрый отсев далёких поездок: форма проверяет на каждое нажатие клавиши
    const s = parseLocal(t.start);
    const e = t.end ? parseLocal(t.end) : Math.max(s, Number.isFinite(now) ? now : s);
    if (s > hi || e < lo) continue;
    const other = tripSpans(t, now);
    if (mine.some((x) => other.some((y) => meets(x, y)))) return t;
  }
  return null;
}

const absSpan = (a) => [parseLocal(`${a.start}T00:00`), parseLocal(`${a.end}T00:00`) + DAY];

// Отвлечения (больничный, отпуск, медкомиссия, учёба), на дни которых попадает поездка.
export function tripAbsences(trip, absences, now) {
  const mine = tripSpans(trip, now);
  return (absences || []).filter((a) => {
    if (!a?.start || !a?.end) return false;
    const span = absSpan(a);
    if (!Number.isFinite(span[0]) || !Number.isFinite(span[1])) return false;
    return mine.some((x) => meets(x, span));
  });
}

// Поездки, которые попадают на дни отвлечения.
export function absenceTrips(absence, trips, now) {
  if (!absence?.start || !absence?.end) return [];
  const span = absSpan(absence);
  if (!Number.isFinite(span[0]) || !Number.isFinite(span[1])) return [];
  return (trips || []).filter((t) => tripSpans(t, now).some((x) => meets(x, span)));
}

// Длина законченной поездки от начала до окончания (с учётом следования вне поездки), в минутах; иначе 0.
export function tripLength(trip) {
  if (!trip?.end) return 0;
  const iv = tripSpans(trip);
  if (!iv.length) return 0;
  return Math.round((iv[iv.length - 1][1] - iv[0][0]) / MIN);
}
