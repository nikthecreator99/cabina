// Производственный календарь РФ (пятидневка, 40 ч).
// Официальные данные по годам + прогноз по правилам ТК РФ для лет без постановления.
// Данные можно обновить отдельно: data/calendar.json (подхватывается при запуске).

const HOLIDAYS_MD = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
  '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'];

// holidays — официальные нерабочие праздничные дни (только они дают «праздничные часы»)
// off — дополнительные выходные в результате переносов
// work — выходные дни, ставшие рабочими
// short — предпраздничные сокращённые дни (7 ч)
const OFFICIAL = {
  2026: {
    source: 'Постановление Правительства РФ о переносе выходных дней в 2026 году',
    off: ['2026-01-09', '2026-03-09', '2026-05-11', '2026-12-31'],
    work: [],
    short: ['2026-04-30', '2026-05-08', '2026-06-11', '2026-11-03'],
  },
  2027: {
    source: 'Постановление Правительства РФ о переносе выходных дней в 2027 году',
    off: ['2027-02-22', '2027-05-03', '2027-05-10', '2027-06-14', '2027-11-05', '2027-12-31'],
    work: ['2027-02-20'],
    short: ['2027-02-20', '2027-04-30', '2027-06-11', '2027-11-03'],
  },
};

const cache = new Map();

export function mergeCalendarData(json) {
  if (!json || typeof json !== 'object' || !json.years) return;
  for (const [y, v] of Object.entries(json.years)) {
    if (!v || !Array.isArray(v.off) || !Array.isArray(v.short)) continue;
    OFFICIAL[y] = { source: v.source || 'Обновление календаря', off: v.off, work: v.work || [], short: v.short };
  }
  cache.clear();
}

const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 вс … 6 сб
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function buildYear(y) {
  if (cache.has(y)) return cache.get(y);
  const map = new Map(); // dateKey -> {kind, hours}
  const holidays = new Set(HOLIDAYS_MD.map((md) => `${y}-${md}`));
  const off = new Set();
  const work = new Set();
  const short = new Set();
  const official = OFFICIAL[y];

  if (official) {
    official.off.forEach((d) => off.add(d));
    official.work.forEach((d) => work.add(d));
    official.short.forEach((d) => short.add(d));
  } else {
    // Прогноз: праздник (кроме январских) на выходном переносится на следующий рабочий день
    const isNonWorking = (key, wd) => holidays.has(key) || off.has(key) || wd === 0 || wd === 6;
    for (const md of HOLIDAYS_MD) {
      if (md.startsWith('01-')) continue;
      const [mm, dd] = md.split('-').map(Number);
      const wd = dow(y, mm, dd);
      if (wd === 0 || wd === 6) {
        let t = Date.UTC(y, mm - 1, dd);
        for (let i = 0; i < 10; i++) {
          t += 86400000;
          const dt = new Date(t);
          const k = dateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
          if (!isNonWorking(k, dt.getUTCDay())) { off.add(k); break; }
        }
      }
    }
    // Сокращённый день — рабочий день непосредственно перед праздником
    for (const h of holidays) {
      const [hy, hm, hd] = h.split('-').map(Number);
      const prev = new Date(Date.UTC(hy, hm - 1, hd) - 86400000);
      const k = dateKey(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
      const wd = prev.getUTCDay();
      if (prev.getUTCFullYear() === y && wd !== 0 && wd !== 6 && !holidays.has(k) && !off.has(k)) short.add(k);
    }
  }

  for (let m = 1; m <= 12; m++) {
    const n = daysInMonth(y, m);
    for (let d = 1; d <= n; d++) {
      const k = dateKey(y, m, d);
      const wd = dow(y, m, d);
      let kind;
      if (holidays.has(k)) kind = 'holiday';
      else if (off.has(k)) kind = 'off';
      else if (work.has(k)) kind = 'work';
      else kind = wd === 0 || wd === 6 ? 'weekend' : 'work';
      let hours = kind === 'work' ? 8 : 0;
      if (kind === 'work' && short.has(k)) { kind = 'short'; hours = 7; }
      map.set(k, { kind, hours });
    }
  }
  const info = { map, official: !!official, source: official ? official.source : 'Прогноз по правилам ТК РФ (ст. 112)' };
  cache.set(y, info);
  return info;
}

export function dayInfo(key) {
  const y = Number(key.slice(0, 4));
  return buildYear(y).map.get(key) || { kind: 'weekend', hours: 0 };
}

export const isHoliday = (key) => dayInfo(key).kind === 'holiday';

export function monthNorm(y, m) {
  const n = daysInMonth(y, m);
  let h = 0;
  let days = 0;
  for (let d = 1; d <= n; d++) {
    const inf = dayInfo(dateKey(y, m, d));
    h += inf.hours;
    if (inf.hours > 0) days++;
  }
  return { hours: h, days };
}

export function yearInfo(y) {
  const info = buildYear(y);
  let hours = 0;
  for (let m = 1; m <= 12; m++) hours += monthNorm(y, m).hours;
  return { official: info.official, source: info.source, hours };
}

export const officialYears = () => Object.keys(OFFICIAL).map(Number).sort();
