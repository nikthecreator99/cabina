// Расчёты CABINA. Время хранится как «настенное» локальное время пользователя
// в строке 'YYYY-MM-DDTHH:mm' и переводится в миллисекунды как UTC-наивное время,
// поэтому полночь, месяц и ночные часы всегда считаются по фактическим датам.
import { dayInfo, isHoliday, monthNorm } from './calendar.js';

export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function parseLocal(s) {
  if (!s || typeof s !== 'string') return NaN;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

const p2 = (n) => String(n).padStart(2, '0');
export function fmtLocal(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
export const dateKeyOf = (ms) => fmtLocal(ms).slice(0, 10);
export const monthKeyOf = (ms) => fmtLocal(ms).slice(0, 7);

export function mergeIntervals(list) {
  const arr = list.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of arr) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function tripIntervals(trip) {
  const list = [[parseLocal(trip.start), parseLocal(trip.end)]];
  for (const p of trip.passenger || []) list.push([parseLocal(p.start), parseLocal(p.end)]);
  return mergeIntervals(list);
}

const ov = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

function nightIn(s, e) {
  let total = 0;
  const first = Math.floor(s / DAY) - 1;
  const last = Math.floor(e / DAY);
  for (let d = first; d <= last; d++) {
    const ws = d * DAY + 22 * HOUR;
    total += ov(s, e, ws, ws + 8 * HOUR);
  }
  return total;
}

function holidayIn(s, e) {
  let total = 0;
  for (let d = Math.floor(s / DAY); d * DAY < e; d++) {
    if (isHoliday(dateKeyOf(d * DAY))) total += ov(s, e, d * DAY, (d + 1) * DAY);
  }
  return total;
}

function monthStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function nextMonthStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

// Возвращает минуты: { work, night, holiday, start, end, byMonth: { 'YYYY-MM': {work, night, holiday} } }
export function tripStats(trip) {
  const iv = tripIntervals(trip);
  const res = { work: 0, night: 0, holiday: 0, byMonth: {}, start: NaN, end: NaN, intervals: iv };
  if (!iv.length) return res;
  res.start = iv[0][0];
  res.end = iv[iv.length - 1][1];
  for (const [s, e] of iv) {
    let cur = s;
    while (cur < e) {
      const stop = Math.min(e, nextMonthStart(cur));
      const mk = monthKeyOf(cur);
      const b = res.byMonth[mk] || (res.byMonth[mk] = { work: 0, night: 0, holiday: 0 });
      const w = (stop - cur) / MIN;
      const n = nightIn(cur, stop) / MIN;
      const h = holidayIn(cur, stop) / MIN;
      b.work += w; b.night += n; b.holiday += h;
      res.work += w; res.night += n; res.holiday += h;
      cur = stop;
    }
  }
  return res;
}

export function validateTrip(trip) {
  const s = parseLocal(trip.start);
  const e = parseLocal(trip.end);
  if (!Number.isFinite(s)) return 'Укажите дату и время начала поездки.';
  if (!Number.isFinite(e)) return 'Укажите дату и время окончания поездки.';
  if (e < s) return 'Окончание поездки раньше начала. Проверьте даты и время.';
  if (e === s) return 'Поездка не может длиться 0 минут. Проверьте время окончания.';
  for (const [i, p] of (trip.passenger || []).entries()) {
    const ps = parseLocal(p.start);
    const pe = parseLocal(p.end);
    const n = i + 1;
    if (!Number.isFinite(ps) || !Number.isFinite(pe)) return `Заполните начало и окончание следования пассажиром №${n} или удалите его.`;
    if (pe <= ps) return `Следование пассажиром №${n}: окончание должно быть позже начала.`;
  }
  return null;
}

// ---- Отвлечения ----
export function eachDate(startKey, endKey, fn) {
  let t = Date.UTC(+startKey.slice(0, 4), +startKey.slice(5, 7) - 1, +startKey.slice(8, 10));
  const end = Date.UTC(+endKey.slice(0, 4), +endKey.slice(5, 7) - 1, +endKey.slice(8, 10));
  let guard = 0;
  while (t <= end && guard++ < 3700) { fn(dateKeyOf(t)); t += DAY; }
}

export function autoAbsenceHours(startKey, endKey) {
  const byMonth = {};
  eachDate(startKey, endKey, (k) => {
    const mk = k.slice(0, 7);
    byMonth[mk] = (byMonth[mk] || 0) + dayInfo(k).hours;
  });
  return byMonth;
}

export function absenceMonths(startKey, endKey) {
  const set = new Set();
  eachDate(startKey, endKey, (k) => set.add(k.slice(0, 7)));
  return [...set];
}

export function absenceHoursByMonth(a) {
  if (a.auto !== false) return autoAbsenceHours(a.start, a.end);
  const out = {};
  for (const mk of absenceMonths(a.start, a.end)) out[mk] = Math.max(0, Number(a.monthHours?.[mk]) || 0);
  return out;
}

export function validateAbsence(a, others) {
  if (!a.start) return 'Укажите дату начала.';
  if (!a.end) return 'Укажите дату окончания.';
  if (a.end < a.start) return 'Дата окончания не может быть раньше даты начала.';
  if (a.auto === false) {
    for (const mk of absenceMonths(a.start, a.end)) {
      const v = Number(a.monthHours?.[mk]);
      if (a.monthHours?.[mk] === '' || a.monthHours?.[mk] == null || !Number.isFinite(v)) return 'Укажите количество часов для каждого месяца.';
      if (v < 0) return 'Количество часов не может быть отрицательным.';
    }
  }
  const clash = others.find((o) => o.id !== a.id && o.start <= a.end && a.start <= o.end);
  if (clash) return 'Этот период пересекается с другим отвлечением. Измените даты.';
  return null;
}

// ---- Месяц ----
export function monthSummary(y, m, trips, absences) {
  const mk = `${y}-${p2(m)}`;
  const base = monthNorm(y, m).hours;
  let work = 0, night = 0, holiday = 0;
  const monthTrips = [];
  for (const t of trips) {
    const st = t._stats || tripStats(t);
    const b = st.byMonth[mk];
    if (b && b.work > 0) {
      work += b.work; night += b.night; holiday += b.holiday;
      monthTrips.push(t);
    }
  }
  const absByType = { sick: 0, vacation: 0, medical: 0 };
  const monthAbs = [];
  for (const a of absences) {
    const h = absenceHoursByMonth(a)[mk];
    if (h === undefined) continue;
    monthAbs.push({ a, hours: h });
    absByType[a.type] = (absByType[a.type] || 0) + h;
  }
  const absTotal = Object.values(absByType).reduce((s, v) => s + v, 0);
  const norm = Math.max(0, base - absTotal);
  const normMin = Math.round(norm * 60);
  const pct = normMin > 0 ? work / normMin : null;
  return { mk, base, absTotal, norm, normMin, work, night, holiday, absByType, pct, monthTrips, monthAbs };
}

// ---- Отдых ----
export function turnaroundRest(workMin, endMs, minRestMin) {
  const rest = Math.max(Math.round(workMin / 2), minRestMin);
  return { rest, until: endMs + rest * MIN };
}

// Полный (домашний) отдых по двум и более поездкам (статистика tripStats).
// (сумма рабочего времени всех поездок) × 2,6 − (сумма промежутков между соседними поездками).
// Для двух поездок это ровно формула ТЗ. Окончание считается от конца самой поздней поездки.
export function homeRestMulti(list) {
  const arr = [...list].filter((x) => Number.isFinite(x.end)).sort((a, b) => a.end - b.end);
  const work = arr.reduce((s, x) => s + x.work, 0);
  let gap = 0;
  for (let i = 1; i < arr.length; i++) gap += Math.max(0, (arr[i].start - arr[i - 1].end) / MIN);
  const full = Math.round(work * 2.6 - gap);
  const late = arr[arr.length - 1];
  return {
    list: arr, early: arr[0], late, gap, work, count: arr.length,
    valid: arr.length >= 2 && full > 0,
    full,
    fullUntil: late.end + full * MIN,
    withDayOff: full + 24 * 60,
    withDayOffUntil: late.end + (full + 24 * 60) * MIN,
  };
}
export const homeRest = (sa, sb) => homeRestMulti([sa, sb]);

// ---- Форматирование ----
export function fmtDur(min, { short = false } = {}) {
  const sign = min < 0 ? '−' : '';
  const v = Math.round(Math.abs(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (short) return `${sign}${h} ч${m ? ` ${p2(m)}` : ''}`;
  return `${sign}${h} ч ${p2(m)} мин`;
}
export function fmtHours(hours) {
  const min = Math.round(hours * 60);
  return min % 60 ? fmtDur(min) : `${min / 60} ч`;
}
