// Статистика роста для администратора (2.32.2, просьба Никиты 14.11.2026): расчёты без экрана — периоды, столбцы графиков,
// сравнение с прошлым периодом. Числа приходят с нашего сервера (admin_growth): только суммы, без почты, имён и id.
// Ничего не хранит и не отправляет. Даты — строки 'YYYY-MM-DD' (московские сутки, как на сервере).

export const GROWTH_PERIODS = { month: 'Месяц', quarter: 'Квартал', year: 'Год', all: 'Всё время' };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const DAY = 86400000;

const ms = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => iso(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY); // b − a
const ymd = (y, m, d) => iso(Date.UTC(y, m - 1, d));
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const minD = (a, b) => (a < b ? a : b);

// Начало и конец периода, в котором лежит месяц (y, m)
function bounds(period, y, m) {
  if (period === 'month') return [ymd(y, m, 1), ymd(y, m, lastDay(y, m))];
  if (period === 'quarter') { const q = Math.floor((m - 1) / 3) * 3 + 1; return [ymd(y, q, 1), ymd(y, q + 2, lastDay(y, q + 2))]; }
  return [ymd(y, 1, 1), ymd(y, 12, 31)];
}
export function shiftPeriod(period, y, m, dir) {
  const step = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
  const idx = y * 12 + (m - 1) + dir * step;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

// «1–14 ноября», «1 октября – 31 декабря 2026»
export function spanText(a, b, { year = true } = {}) {
  const [ya, ma, da] = [+a.slice(0, 4), +a.slice(5, 7), +a.slice(8, 10)];
  const [yb, mb, db] = [+b.slice(0, 4), +b.slice(5, 7), +b.slice(8, 10)];
  const yy = year ? ` ${yb}` : '';
  if (a === b) return `${da} ${MONTHS_GEN[ma - 1]}${yy}`;
  if (ya === yb && ma === mb) return `${da}–${db} ${MONTHS_GEN[mb - 1]}${yy}`;
  if (ya === yb) return `${da} ${MONTHS_GEN[ma - 1]} – ${db} ${MONTHS_GEN[mb - 1]}${yy}`;
  return `${da} ${MONTHS_GEN[ma - 1]} ${ya} – ${db} ${MONTHS_GEN[mb - 1]} ${yb}`;
}

// Выбранный период и с чем сравнивать. Идёт сейчас — сравниваем с тем же числом дней от начала прошлого периода
// («1–14 ноября» с «1–14 октября»), иначе вышло бы, что неполный месяц всегда «хуже».
export function growthRange(period, y, m, today) {
  if (period === 'all') return { period, from: null, to: today, prevFrom: null, prevTo: null, title: 'Всё время', future: false };
  const [from, end] = bounds(period, y, m);
  const to = minD(end, today);
  const p = shiftPeriod(period, y, m, -1);
  const [pFrom, pEnd] = bounds(period, p.y, p.m);
  const future = from > today;
  const prevTo = future || to === end ? pEnd : minD(addDays(pFrom, daysBetween(from, to)), pEnd);
  const title = period === 'month' ? `${cap(MONTHS[m - 1])} ${y}` : period === 'quarter' ? `${ROMAN[Math.floor((m - 1) / 3)]} квартал ${y}` : `${y} год`;
  return { period, from, to: future ? end : to, end, prevFrom: pFrom, prevTo, title, future, partial: !future && to < end,
    prevText: spanText(pFrom, prevTo, { year: pFrom.slice(0, 4) !== from.slice(0, 4) }) };
}

// Столбцы графика: месяц — по дням, квартал — по неделям, год — по месяцам, всё время — по месяцам (дольше двух лет — по кварталам)
export function bucketsOf(from, to, period) {
  const out = [];
  if (period === 'month') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ a: d, b: d, label: String(+d.slice(8, 10)), full: spanText(d, d) });
    return out;
  }
  if (period === 'quarter') {
    for (let d = from; d <= to;) {
      const dow = (new Date(ms(d)).getUTCDay() + 6) % 7; // пн = 0
      const b = minD(addDays(d, 6 - dow), to);
      out.push({ a: d, b, label: String(+d.slice(8, 10)), full: spanText(d, b) });
      d = addDays(b, 1);
    }
    return out;
  }
  const months = (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1;
  const step = months > 24 ? 3 : 1;
  let y = +from.slice(0, 4); let m = +from.slice(5, 7);
  if (step === 3) m = Math.floor((m - 1) / 3) * 3 + 1;
  while (ymd(y, m, 1) <= to) {
    const a = ymd(y, m, 1) < from ? from : ymd(y, m, 1);
    const e = shiftPeriod('month', y, m, step - 1);
    const b = minD(ymd(e.y, e.m, lastDay(e.y, e.m)), to);
    const label = step === 3 ? `${ROMAN[Math.floor((m - 1) / 3)]}·${String(y).slice(2)}` : (months > 12 ? MONTHS_SHORT[m - 1][0] : MONTHS_SHORT[m - 1]);
    const full = step === 3 ? `${ROMAN[Math.floor((m - 1) / 3)]} квартал ${y}` : `${cap(MONTHS[m - 1])} ${y}`;
    out.push({ a, b, label, full });
    const n = shiftPeriod('month', y, m, step); y = n.y; m = n.m;
  }
  return out;
}

// Сумма по столбцам (avg — среднее за день по дням, где число уже считалось: заходы — с active_since)
export function seriesOf(days, buckets, key, { avg = false, since = '' } = {}) {
  const by = new Map((Array.isArray(days) ? days : []).map((d) => [d?.d, d]));
  return buckets.map((bk) => {
    let s = 0; let n = 0;
    for (let d = bk.a; d <= bk.b; d = addDays(d, 1)) {
      if (avg && since && d < since) continue;
      s += num(by.get(d)?.[key]); n += 1;
    }
    if (avg) return n ? Math.round((s / n) * 10) / 10 : null;
    return s;
  });
}
// Сколько аккаунтов было к концу каждого столбца (из тех, что есть сейчас)
export function cumulative(days, buckets, base) {
  const joined = seriesOf(days, buckets, 'joined');
  let acc = num(base);
  return joined.map((v) => (acc += v));
}

export const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

// Разница с прошлым периодом: {d: +3, pct: 40} (pct — null, если прошлое 0)
export function delta(cur, prev) {
  if (prev == null) return null;
  const c = num(cur); const p = num(prev);
  return { d: Math.round((c - p) * 10) / 10, pct: p ? Math.round(((c - p) / p) * 100) : null };
}
export const avgActive = (sum) => (sum && num(sum.active_days) > 0 ? Math.round((num(sum.active_sum) / num(sum.active_days)) * 10) / 10 : null);
// «Остаются»: доля из тех, кому уже исполнилось 7 (30) дней
export function retention(cohort, k) {
  const age = num(cohort?.[`age${k}`]); const back = num(cohort?.[`back${k}`]);
  return age ? { pct: Math.round((back / age) * 100), back, age } : null;
}
export const pctOf = (v, total) => (num(total) ? Math.round((num(v) / num(total)) * 100) : 0);

// Чем пользуются сейчас — по порядку от «включил» к «делится»
export const USAGE = [
  ['colleagues', 'Включили «Коллег»'],
  ['findable', '«Меня можно найти»'],
  ['status', 'Показывают статус'],
  ['place', 'Показывают «где я»'],
  ['hours', 'Делятся часами'],
  ['notes', 'Делятся заметками о локомотивах'],
  ['in_groups', 'Состоят в группах'],
  ['group_status', 'Показывают статус группе'],
];
export const PLATFORM_NAMES = { web: 'Сайт', android: 'Android', ios: 'iOS', unknown: 'Неизвестно' };

// Только то, что умеем показать: всё с сервера — через num(), лишнего не берём
export function cleanGrowth(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const sum = (s) => (s && typeof s === 'object' ? {
    from: date(s.from), to: date(s.to),
    signup: num(s.signup), confirmed: num(s.confirmed), deleted: num(s.deleted), invited: num(s.invited), invited_admin: num(s.invited_admin),
    groups: num(s.groups), active_sum: num(s.active_sum), active_days: num(s.active_days),
    cohort: ['n', 'age7', 'back7', 'age30', 'back30'].reduce((o, k) => ({ ...o, [k]: num(s.cohort?.[k]) }), {}),
  } : null);
  const counts = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
    .filter(([k]) => /^[\w.]{1,20}$/.test(k)).map(([k, v]) => [k, num(v)]).filter(([, v]) => v > 0));
  const nw = r.now && typeof r.now === 'object' ? r.now : {};
  return {
    today: date(r.today), firstDay: date(r.first_day), since: date(r.active_since), base: num(r.base),
    cur: sum(r.cur), prev: sum(r.prev),
    days: (Array.isArray(r.days) ? r.days : []).filter((d) => date(d?.d)).slice(0, 4000)
      .map((d) => ({ d: d.d, ...['signup', 'confirmed', 'deleted', 'active', 'invited', 'groups', 'joined'].reduce((o, k) => ({ ...o, [k]: num(d[k]) }), {}) })),
    now: { ...['total', 'confirmed', 'active_1', 'active_7', 'active_30', 'links', 'groups', ...USAGE.map(([k]) => k)].reduce((o, k) => ({ ...o, [k]: num(nw[k]) }), {}),
      platforms: counts(nw.platforms), versions: counts(nw.versions) },
  };
}

// Всё, что показывают экран и PDF, одним набором
export function growthModel(data, range) {
  const from = range.from || data.firstDay || data.today || range.to;
  const to = range.to;
  const per = range.period === 'all' ? 'all' : range.period;
  const bk = bucketsOf(from, to, per === 'all' ? 'year' : per);
  const hasPrev = !!(data.prev && range.prevFrom);
  const pbk = hasPrev ? bucketsOf(range.prevFrom, range.prevTo, per) : [];
  const c = data.cur || {}; const p = hasPrev ? data.prev : null;
  const t = (key, label, cur, prev, { bad = false, fmt } = {}) => ({ key, label, v: cur, p: prev, dl: p ? delta(cur, prev) : null, bad, fmt });
  const tiles = [
    t('signup', 'Регистраций', c.signup, p?.signup),
    t('confirmed', 'Подтвердили почту', c.confirmed, p?.confirmed),
    t('invited', 'Пришли по приглашениям коллег', c.invited, p?.invited),
    t('active', 'Заходят в день, в среднем', avgActive(c), p ? avgActive(p) : null),
    t('groups', 'Новых групп', c.groups, p?.groups),
    t('deleted', 'Удалили аккаунт', c.deleted, p?.deleted, { bad: true }),
  ];
  const sig = seriesOf(data.days, bk, 'signup');
  const act = seriesOf(data.days, bk, 'active', { avg: true, since: data.since });
  return {
    from, to, buckets: bk, prevBuckets: pbk, hasPrev, tiles,
    signups: { cur: sig, prev: hasPrev ? seriesOf(data.days, pbk, 'signup') : null },
    active: { cur: act, prev: hasPrev ? seriesOf(data.days, pbk, 'active', { avg: true, since: data.since }) : null, any: act.some((v) => v != null) },
    total: cumulative(data.days, bk, data.base),
    invited: seriesOf(data.days, bk, 'invited'),
    ret: { w: retention(c.cohort, 7), m: retention(c.cohort, 30), pw: p ? retention(p.cohort, 7) : null, pm: p ? retention(p.cohort, 30) : null, n: num(c.cohort?.n) },
    usage: USAGE.map(([k, label]) => ({ k, label, v: data.now[k], pct: pctOf(data.now[k], data.now.total) })),
    sinceLate: !!(data.since && data.since > from),
  };
}
