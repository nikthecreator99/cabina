// Статистика: поездная и заработная плата за месяц, квартал, год или всё время.
// Показываются только блоки, где есть данные.
import { I, esc, small, pageHead, MONTHS, MONTHS_SHORT, MONTHS_GEN, MONTHS_PREP, plural, sheet, openLayer, closeLayer, hm } from './ui.js';
import { S, statsOf, nowLocal, routeOf, locoLabel, normType, normNum, myPay, refreshLive, isPending, overRestByTrip } from './store.js';
import { monthSummary, fmtDur, fmtHours, parseLocal, monthKeyOf, dateKeyOf, DAY, MIN } from './calc.js';
import { dayInfo } from './calendar.js';
import { payMonth, payTotal, overRestIntervals, hasRate, isAvg, rateOn, fmtRub, fmtH } from './pay.js';
import { houseOf, dayOffIntervals } from './rest.js';
import { ABS_TYPES, openTripForm } from './forms.js';
import { exportSlip } from './slip.js';
import { slipPdfTour } from './tours.js';
import { openDay } from './day.js';
import { eyeBtn } from './money.js';
import { openRecap } from './recap.js';

const MONTHS_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const ROMAN = ['I', 'II', 'III', 'IV'];
const PERIODS = { month: 'Месяц', quarter: 'Квартал', year: 'Год', all: 'Всё время' };
const p2 = (n) => String(n).padStart(2, '0');
const mkOf = (y, m) => `${y}-${p2(m)}`;
const HOME_GAP_MAX = 7 * DAY; // дольше — это уже не отдых между поездками (отпуск, больничный)
const HOUSE_GAP_MAX = 2 * DAY;

export const ST = { kind: 'trips', period: 'month', y: 0, m: 0 };
export function statsAt(y, m) { ST.y = y; ST.m = m; ST.period = 'month'; }

// ---------------------------------------------------------------- период
function firstMonth() {
  let min = null;
  for (const t of S.trips) { const k = monthKeyOf(statsOf(t).start); if (k && (!min || k < min)) min = k; }
  for (const a of S.absences) { const k = a.start?.slice(0, 7); if (k && (!min || k < min)) min = k; }
  return min;
}
function periodMonths(p = ST) {
  if (p.period === 'month') return [[p.y, p.m]];
  if (p.period === 'quarter') { const q0 = Math.floor((p.m - 1) / 3) * 3; return [1, 2, 3].map((i) => [p.y, q0 + i]); }
  if (p.period === 'year') return Array.from({ length: 12 }, (_, i) => [p.y, i + 1]);
  const first = firstMonth();
  const now = new Date(nowLocal());
  let y = first ? +first.slice(0, 4) : now.getUTCFullYear();
  let m = first ? +first.slice(5, 7) : now.getUTCMonth() + 1;
  const out = [];
  while ((y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1)) && out.length < 600) {
    out.push([y, m]); m++; if (m > 12) { m = 1; y++; }
  }
  return out.length ? out : [[now.getUTCFullYear(), now.getUTCMonth() + 1]];
}
function periodTitle(p = ST) {
  if (p.period === 'month') return `${MONTHS[p.m - 1]} ${p.y}`;
  if (p.period === 'quarter') return `${ROMAN[Math.floor((p.m - 1) / 3)]} квартал ${p.y}`;
  if (p.period === 'year') return `${p.y} год`;
  return 'Всё время';
}
function shifted(p, d) {
  const n = { ...p };
  const step = p.period === 'month' ? 1 : p.period === 'quarter' ? 3 : 12;
  let idx = n.y * 12 + (n.m - 1) + d * step;
  n.y = Math.floor(idx / 12); n.m = (idx % 12) + 1;
  return n;
}
// «в октябре 2026», «во II квартале 2026», «в 2026 году», «за всё время»
function periodPrep(p = ST) {
  if (p.period === 'month') return `в ${MONTHS_PREP[p.m - 1]} ${p.y}`;
  if (p.period === 'quarter') return `${p.m <= 6 && p.m > 3 ? 'во' : 'в'} ${ROMAN[Math.floor((p.m - 1) / 3)]} квартале ${p.y}`;
  if (p.period === 'year') return `в ${p.y} году`;
  return 'за всё время';
}
function compareLabel(p) {
  const prev = shifted(p, -1);
  if (p.period === 'month') return `к ${MONTHS_DAT[prev.m - 1]}`;
  if (p.period === 'quarter') return `к ${ROMAN[Math.floor((prev.m - 1) / 3)]} кварталу`;
  if (p.period === 'year') return `к ${prev.y} году`;
  return '';
}

// ---------------------------------------------------------------- подсчёт
// поездка, которая ждёт явки, в статистику не входит, пока не началась
function tripsIn(keys) {
  return S.trips.filter((t) => keys.has(monthKeyOf(statsOf(t).start)) && !isPending(t));
}
function gapAfter(sorted, i) {
  const st = statsOf(sorted[i]);
  const next = sorted[i + 1];
  if (!next || st.live || !Number.isFinite(st.end)) return null;
  return statsOf(next).start - st.end;
}
function collect(p) {
  refreshLive();
  const months = periodMonths(p);
  const keys = new Set(months.map(([y, m]) => mkOf(y, m)));
  const sums = months.map(([y, m]) => monthSummary(y, m, S.trips, S.absences));
  const R = { months, sums, keys, work: 0, norm: 0, overtime: 0, night: 0, holiday: 0, wait: 0, abs: { sick: 0, vacation: 0, medical: 0, study: 0 } };
  for (const s of sums) {
    R.work += s.work; R.norm += s.normMin; R.overtime += s.overtime; R.night += s.night; R.holiday += s.holiday; R.wait += s.wait || 0;
    for (const k of Object.keys(R.abs)) R.abs[k] += s.absByType[k] || 0;
  }
  const trips = tripsIn(keys).sort((a, b) => statsOf(a).start - statsOf(b).start);
  R.trips = trips;
  const done = trips.filter((t) => !statsOf(t).live);
  R.count = trips.length;
  R.avg = done.length ? done.reduce((s, t) => s + statsOf(t).work, 0) / done.length : 0;
  R.longest = done.reduce((m, t) => (!m || statsOf(t).work > statsOf(m).work ? t : m), null);
  // километры и плечи
  R.km = 0;
  const arms = new Map();
  R.passenger = 0;
  // следование резервом: число поездок периода и их часы по месяцам периода (без ожидания — как в заработке)
  R.reserve = { n: trips.filter((t) => t.kind === 'reserve').length, min: 0 };
  R.shunt = { n: trips.filter((t) => t.kind === 'shunt').length, min: 0 }; // манёвры — так же
  for (const t of S.trips) {
    const x = t.kind === 'reserve' ? R.reserve : t.kind === 'shunt' ? R.shunt : null;
    if (!x) continue;
    for (const [mk, b] of Object.entries(statsOf(t).byMonth || {})) if (keys.has(mk)) x.min += b.work - (b.wait || 0);
  }
  for (const t of trips) {
    const r = t.routeId && S.routes.find((x) => x.id === t.routeId);
    if (r?.distanceKm) R.km += r.distanceKm;
    const label = routeOf(t);
    if (label) arms.set(label, (arms.get(label) || 0) + 1);
    for (const pi of t.passenger || []) { const s = parseLocal(pi.start); const e = parseLocal(pi.end); if (e > s) R.passenger += (e - s) / MIN; }
  }
  R.arms = [...arms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  R.series = locoSeries(trips);
  // время явки: по два часа, начиная с полуночи
  R.calls = Array(12).fill(0);
  for (const t of trips) { const st = statsOf(t).start; if (Number.isFinite(st)) R.calls[Math.floor(new Date(st).getUTCHours() / 2)]++; }
  const top = R.calls.indexOf(Math.max(...R.calls));
  R.callTop = R.calls[top] ? { from: top * 2, n: R.calls[top] } : null;
  // дома отдыха и домашний отдых: от окончания поездки до начала следующей
  const all = [...S.trips].sort((a, b) => statsOf(a).start - statsOf(b).start);
  const houses = new Map();
  R.home = { n: 0, total: 0 };
  // переотдых — отдых в пункте оборота сверх привезённого рабочего времени (как в заработке)
  const over = overRestByTrip();
  const cfg = myPay();
  const orPay = !isAvg(cfg) && hasRate(cfg);
  all.forEach((t, i) => {
    if (!keys.has(monthKeyOf(statsOf(t).start))) return;
    const gap = gapAfter(all, i);
    if (gap == null || gap <= 0) return;
    if (t.restType === 'turnaround' && gap <= HOUSE_GAP_MAX) {
      const name = houseOf(t) || 'Дом отдыха не указан';
      const x = houses.get(name) || { name, n: 0, total: 0, unknown: !houseOf(t), overN: 0, over: 0, overRub: 0 };
      x.n++; x.total += gap / MIN; houses.set(name, x);
      const o = over.get(t.id) || 0;
      if (o > 0) { x.overN++; x.over += o; if (orPay) x.overRub += (o / 60) * rateOn(cfg, dateKeyOf(statsOf(t).end)) * 2 / 3; }
    } else if (t.restType === 'home' && gap <= HOME_GAP_MAX) { R.home.n++; R.home.total += gap / MIN; }
  });
  R.houses = [...houses.values()].sort((a, b) => (a.unknown - b.unknown) || b.n - a.n);
  R.houseTotal = R.houses.reduce((s, h) => s + h.total, 0);
  R.houseN = R.houses.reduce((s, h) => s + h.n, 0);
  R.over = R.houses.reduce((s, h) => s + h.over, 0);
  R.overN = R.houses.reduce((s, h) => s + h.overN, 0);
  R.overRub = R.houses.reduce((s, h) => s + h.overRub, 0);
  return R;
}

// Локомотивы периода по сериям: серия → номера → поездки. «Раз» — число поездок.
// Поездка без номера идёт в серию строкой «Без номера», без серии — в «Серия не указана».
let LOCOS = [];
function locoSeries(trips) {
  const series = new Map();
  for (const t of trips) {
    const tk = normType(t.locoType); const nk = normNum(t.locoNumber);
    if (!tk && !nk) continue;
    const s = series.get(tk) || { key: tk || '—', label: String(t.locoType || '').trim() || 'Серия не указана', unknown: !tk, n: 0, nums: new Map() };
    s.n++;
    const n = s.nums.get(nk) || { key: `${tk}|${nk}`, label: nk ? `№${nk}` : 'Без номера', unknown: !nk, trips: [] };
    n.trips.push(t);
    s.nums.set(nk, n); series.set(tk, s);
  }
  const last = (n) => statsOf(n.trips[n.trips.length - 1]).start;
  LOCOS = [...series.values()].map((s) => ({ ...s, nums: [...s.nums.values()].sort((a, b) => (a.unknown - b.unknown) || b.trips.length - a.trips.length || last(b) - last(a)) }))
    .sort((a, b) => (a.unknown - b.unknown) || b.n - a.n || a.label.localeCompare(b.label, 'ru'));
  return LOCOS;
}

// ---------------------------------------------------------------- графики
// Столбцы по месяцам (один ряд): тонкие, скругление 4px сверху, 2px зазор, отметка нормы.
function barChart(items, { fmt, normKey, id }) {
  const max = Math.max(1, ...items.map((x) => Math.max(x.v, normKey ? x[normKey] || 0 : 0)));
  const W = 320; const H = 140; const top = 14; const base = H - 20;
  const bw = W / items.length;
  const bars = items.map((x, i) => {
    const h = Math.max(x.v > 0 ? 3 : 0, (x.v / max) * (base - top));
    const bx = i * bw + 2; const w = bw - 4;
    const r = Math.min(4, w / 2, h);
    const y = base - h;
    const path = h ? `M${bx} ${base}V${y + r}Q${bx} ${y} ${bx + r} ${y}H${bx + w - r}Q${bx + w} ${y} ${bx + w} ${y + r}V${base}Z` : '';
    const norm = normKey && x[normKey] ? `<line class="bar-norm" x1="${bx}" x2="${bx + w}" y1="${base - (x[normKey] / max) * (base - top)}" y2="${base - (x[normKey] / max) * (base - top)}"/>` : '';
    return `<g class="bar-g" data-bar="${i}"><rect class="bar-hit" x="${i * bw}" y="0" width="${bw}" height="${H}"/>${path ? `<path class="bar" d="${path}"/>` : ''}${norm}
      <text class="bar-x" x="${bx + w / 2}" y="${H - 5}">${esc(x.label)}</text></g>`;
  }).join('');
  return `<figure class="chart" id="${id}" data-tips='${esc(JSON.stringify(items.map((x) => `${x.full}: ${fmt(x.v)}${normKey && x[normKey] ? ` · норма ${fmt(x[normKey])}` : ''}`)))}'>
    <div class="chart-tip" aria-live="polite">Нажмите на столбец, чтобы увидеть значение</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(items.map((x) => `${x.full} ${fmt(x.v)}`).join(', '))}"><line class="bar-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>${bars}</svg>
    ${normKey ? '<figcaption><span class="lg-bar"></span> отработано <span class="lg-norm"></span> норма</figcaption>' : ''}</figure>`;
}

function monthCalendar(y, m) {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // пн = 0
  const work = new Set();
  for (const t of S.trips) {
    for (const [s, e] of statsOf(t).intervals || []) {
      for (let d = Math.floor(s / DAY) * DAY; d < e; d += DAY) work.add(dateKeyOf(d));
    }
  }
  const abs = new Map();
  for (const a of S.absences) {
    if (!(a.start <= `${mkOf(y, m)}-31` && a.end >= `${mkOf(y, m)}-01`)) continue;
    for (let d = parseLocal(`${a.start}T00:00`); d <= parseLocal(`${a.end}T00:00`); d += DAY) abs.set(dateKeyOf(d), a.type);
  }
  // выходные: от окончания поездки, после которой выбрано «Пойти на выходной»
  const off = new Set();
  for (const x of dayOffIntervals()) {
    for (let d = Math.floor(x.s / DAY) * DAY; d < x.e; d += DAY) off.add(dateKeyOf(d));
  }
  for (const k of S.daysOff) off.add(k); // отмеченные в календаре вручную
  const used = new Set();
  let cells = '<span></span>'.repeat(firstDow);
  for (let d = 1; d <= n; d++) {
    const k = `${mkOf(y, m)}-${p2(d)}`;
    const kind = dayInfo(k).kind;
    const cls = abs.has(k) ? `abs-${abs.get(k)}` : work.has(k) ? 'work' : off.has(k) ? 'dayoff' : 'free';
    used.add(cls);
    const what = { work: 'работа', dayoff: 'выходной', free: 'пусто' }[cls] || ABS_TYPES[abs.get(k)]?.label.toLowerCase() || '';
    cells += `<button class="cal-d ${cls} ${kind === 'holiday' ? 'hol' : ''} ${kind === 'weekend' || kind === 'off' || kind === 'holiday' ? 'we' : ''}" data-act="cal-day" data-d="${k}" aria-label="${d} ${MONTHS_GEN[m - 1]}: ${what}">${d}</button>`;
  }
  const lg = [['work', 'работа'], ['dayoff', 'выходной'], ['free', 'отдых'], ['abs-sick', 'больничный'], ['abs-vacation', 'отпуск'], ['abs-medical', 'медкомиссия'], ['abs-study', 'учёба']]
    .filter(([c]) => used.has(c)).map(([c, l]) => `<span><i class="cal-d ${c}"></i>${l}</span>`).join('');
  return `<div class="cal"><div class="hint cal-tip">Нажмите на день: у рабочего — сводка по поездке, у пустого — отвлечение или выходной.</div><div class="cal-wd">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells}</div><div class="cal-lg">${lg}</div></div>`;
}

// ---------------------------------------------------------------- блоки
const block = (title, body, cls = '') => `<section class="st-block ${cls}"><h3>${title}</h3>${body}</section>`;
const kv = (label, value, sub = '') => `<div class="kv"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

function tripsView(R) {
  if (!R.count && !R.work && !Object.values(R.abs).some((v) => v > 0)) {
    return `<div class="empty"><div class="em-ico">${I.chart}</div><b>За этот период данных нет</b><p>Добавьте поездки — здесь появятся часы, ночные, плечи, дома отдыха и многое другое.</p></div>`;
  }
  let html = '';
  // часы против нормы
  let cmp = '';
  if (ST.period !== 'all') {
    const prev = collectLite(shifted(ST, -1));
    if (prev > 0 || R.work > 0) {
      const d = R.work - prev;
      if (Math.abs(d) >= 1) cmp = `<div class="st-cmp ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${fmtDur(Math.abs(d), { short: true })} ${compareLabel(ST)}</div>`;
    }
  }
  const pct = R.norm > 0 ? Math.round((R.work / R.norm) * 100) : null;
  html += `<section class="st-hero"><div class="eyebrow">Отработано</div><div class="st-big num">${fmtDur(R.work, { short: true })}</div>
    <div class="st-sub">${R.norm > 0 ? `норма ${fmtDur(R.norm, { short: true })} · ${pct}%` : 'норма покрыта отвлечениями'}</div>${cmp}
    ${R.overtime > 0 ? `<div class="st-pill warn">${small(I.overtime, 15)} Переработка ${fmtDur(R.overtime, { short: true })}</div>` : ''}</section>`;
  if (ST.period === 'year' || (ST.period === 'all' && R.months.length > 1 && R.months.length <= 24)) {
    const items = R.months.map(([y, m], i) => ({ v: R.sums[i].work, norm: R.sums[i].normMin, label: R.months.length > 12 ? MONTHS_SHORT[m - 1][0] : MONTHS_SHORT[m - 1], full: `${MONTHS[m - 1]} ${y}` }));
    if (items.some((x) => x.v > 0)) html += block('Часы по месяцам', barChart(items, { fmt: (v) => fmtDur(v, { short: true }), normKey: 'norm', id: 'ch-hours' }));
  }
  if (ST.period === 'month') html += block('Календарь', monthCalendar(ST.y, ST.m));
  // поездки
  if (R.count) {
    const longest = R.longest ? statsOf(R.longest) : null;
    html += block('Поездки', `<div class="kv-grid">
      ${kv('Поездок', R.count)}
      ${R.avg ? kv('Средняя', fmtDur(R.avg, { short: true })) : ''}
      ${longest ? kv('Самая длинная', fmtDur(longest.work, { short: true }), `${new Date(longest.start).getUTCDate()} ${MONTHS_SHORT[new Date(longest.start).getUTCMonth()]}`) : ''}
      ${R.km > 0 ? kv('Пройдено', `${Math.round(R.km).toLocaleString('ru-RU')} км`) : ''}
      ${R.passenger > 0 ? kv('Пассажиром', fmtDur(R.passenger, { short: true })) : ''}
      ${R.wait > 0 ? kv('Ожидание следования', fmtDur(R.wait, { short: true })) : ''}
      ${R.shunt.n || R.shunt.min > 0 ? kv('Манёвры', `${R.shunt.n} ${plural(R.shunt.n, 'смена', 'смены', 'смен')}`, fmtDur(R.shunt.min, { short: true })) : ''}
      ${R.reserve.n || R.reserve.min > 0 ? kv('Резервом', `${R.reserve.n} ${plural(R.reserve.n, 'поездка', 'поездки', 'поездок')}`, fmtDur(R.reserve.min, { short: true })) : ''}
    </div>`);
  }
  if (R.night > 0 || R.holiday > 0) {
    const share = R.work > 0 ? Math.round((R.night / R.work) * 100) : 0;
    html += block('Ночные и праздничные', `<div class="kv-grid">
      ${R.night > 0 ? kv(`${small(I.moon, 15)} Ночные`, fmtDur(R.night, { short: true }), `${share}% всего времени`) : ''}
      ${R.holiday > 0 ? kv(`${small(I.calStar, 15)} Праздничные`, fmtDur(R.holiday, { short: true })) : ''}
    </div>${R.night > 0 ? `<div class="share"><i style="width:${Math.min(100, share)}%"></i></div>` : ''}`);
  }
  const absRows = Object.entries(ABS_TYPES).filter(([k]) => R.abs[k] > 0);
  if (absRows.length) html += block('Отвлечения', `<div class="rows">${absRows.map(([k, v]) => `<div class="r"><span class="dot" style="--c:${v.color}"></span><span>${v.label}</span><b>−${fmtHours(R.abs[k])}</b></div>`).join('')}</div><div class="hint">Часы, вычтенные из нормы.</div>`);
  if (R.arms.length) {
    const max = R.arms[0][1];
    html += block('Плечи', `<div class="rows">${R.arms.map(([label, n]) => `<div class="r bar-r"><span class="grow">${esc(label)}</span><b>${n}</b><i style="width:${(n / max) * 100}%"></i></div>`).join('')}</div>`);
  }
  if (R.houseN || R.home.n) {
    let b = '';
    if (R.houseN) {
      b += `<div class="kv-grid">${kv('В домах отдыха', fmtDur(R.houseTotal, { short: true }), `${R.houseN} ${plural(R.houseN, 'раз', 'раза', 'раз')}`)}${kv('Средний отдых', fmtDur(R.houseTotal / R.houseN, { short: true }))}${R.overN ? kv('Переотдых', fmtDur(R.over, { short: true }), `${R.overN} ${plural(R.overN, 'раз', 'раза', 'раз')}${R.overRub > 0 ? ` · <span class="money">≈ ${fmtRub(R.overRub)}</span>` : ''}`) : ''}</div>`;
      b += `<div class="rows">${R.houses.map((h) => `<div class="r st-house"><div class="grow"><span class="${h.unknown ? 'muted' : ''}">${esc(h.name)}</span><small>${h.n} ${plural(h.n, 'раз', 'раза', 'раз')} · ср. ${fmtDur(h.total / h.n, { short: true })}</small>${h.overN ? `<small class="over">Переотдых ${fmtDur(h.over, { short: true })} · ${h.overN} ${plural(h.overN, 'раз', 'раза', 'раз')}${h.overRub > 0 ? ` · <span class="money">≈ ${fmtRub(h.overRub)}</span>` : ''}</small>` : ''}</div><b>${fmtDur(h.total, { short: true })}</b></div>`).join('')}</div>`;
    }
    if (R.home.n) b += `<div class="kv-grid">${kv('Домашний отдых', fmtDur(R.home.total, { short: true }), `${R.home.n} ${plural(R.home.n, 'раз', 'раза', 'раз')}`)}${kv('В среднем', fmtDur(R.home.total / R.home.n, { short: true }))}</div>`;
    html += block('Отдых', `${b}<div class="hint">От окончания поездки до начала следующей.${R.overN ? ' Переотдых — сверх привезённого рабочего времени.' : ''}</div>`);
  }
  if (R.series.length) html += block('Локомотивы', locosHtml(R.series));
  if (R.count >= 3 && R.callTop) {
    const items = R.calls.map((v, i) => ({ v, label: i % 2 ? '' : String(i * 2), full: callRange(i * 2) }));
    html += block('Время явки', `<div class="kv-grid">${kv('Чаще всего вызывают', callRange(R.callTop.from, true), `${R.callTop.n} из ${R.count} ${plural(R.count, 'явки', 'явок', 'явок')}`)}</div>
      ${barChart(items, { fmt: (v) => `${v} ${plural(v, 'явка', 'явки', 'явок')}`, id: 'ch-calls' })}`);
  }
  if (R.count) html += `<button class="btn btn-ghost" data-act="st-recap">${I.share} Итоги картинкой</button>`;
  return html;
}
const p2h = (h) => `${String(h % 24).padStart(2, '0')}:00`;
const callRange = (h, words = false) => (words ? `с ${p2h(h)} до ${p2h(h + 2)}` : `${p2h(h)}–${p2h(h + 2)}`);
const times = (n) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
// серия раскрывается на месте: номера и сколько раз; номер открывает его поездки
const openSeries = new Set();
function locosHtml(series) {
  const max = series[0].n;
  return `<div class="rows st-locos">${series.map((s) => {
    const open = openSeries.has(s.key);
    return `<button class="r bar-r st-series" data-act="st-series" data-k="${esc(s.key)}" aria-expanded="${open}">
      <span class="grow ${s.unknown ? 'muted' : ''}">${small(I.train, 15)} ${esc(s.label)}</span><b>${times(s.n)}</b><span class="chev">${small(I.right, 16)}</span><i style="width:${(s.n / max) * 100}%"></i></button>
      ${open ? `<div class="st-nums">${s.nums.map((n) => `<button class="r" data-act="st-loco" data-k="${esc(n.key)}"><span class="grow ${n.unknown ? 'muted' : ''}">${esc(n.label)}</span><b>${times(n.trips.length)}</b><span class="chev">${small(I.right, 16)}</span></button>`).join('')}</div>` : ''}`;
  }).join('')}</div>`;
}

// поездки одного локомотива за период: дата, маршрут, время; нажатие открывает поездку
function openLoco(key) {
  let found = null; let ser = null;
  for (const s of LOCOS) { const n = s.nums.find((x) => x.key === key); if (n) { found = n; ser = s; break; } }
  if (!found) return;
  const title = ser.unknown ? found.label : found.unknown ? `${ser.label}, без номера` : `${ser.label} ${found.label}`;
  const list = [...found.trips].reverse();
  const el = openLayer(sheet({
    title,
    body: `<div class="hint">${times(list.length)} ${periodPrep()}</div>
      <div class="panel">${list.map((t) => { const st = statsOf(t); const r = routeOf(t);
        return `<button class="row" data-act="loco-trip" data-id="${esc(t.id)}"><div class="grow"><div class="t1">${new Date(st.start).getUTCDate()} ${MONTHS_SHORT[new Date(st.start).getUTCMonth()]}, ${hm(st.start)}${st.live ? ' · в пути' : ` · ${fmtDur(st.work, { short: true })}`}</div><div class="t2">${r ? esc(r) : 'Маршрут не указан'}</div></div>${small(I.right, 18)}</button>`; }).join('')}</div>`,
  }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'loco-trip') { closeLayer(el); openTripForm(b.dataset.id); }
  });
}

// Итоги периода для картинки: только часы, поездки и техника — без сумм, имени, депо и станций
function recapData() {
  const R = collect(ST);
  const tiles = [];
  tiles.push(['Поездок', String(R.count)]);
  if (R.night > 0) tiles.push(['Ночью', fmtDur(R.night, { short: true }), `${Math.round((R.night / Math.max(1, R.work)) * 100)}% времени`]);
  if (R.km > 0) tiles.push(['Пройдено', `${Math.round(R.km).toLocaleString('ru-RU')} км`]);
  if (R.longest) tiles.push(['Самая длинная', fmtDur(statsOf(R.longest).work, { short: true })]);
  if (R.count >= 3 && R.callTop) tiles.push(['Чаще вызывают', callRange(R.callTop.from)]);
  const ser = R.series.find((x) => !x.unknown);
  if (ser) tiles.push(['Чаще всего на', ser.label, times(ser.n)]);
  if (R.overtime > 0) tiles.push(['Переработка', fmtDur(R.overtime, { short: true })]);
  if (R.houseN) tiles.push(['Отдых в доме отдыха', `ср. ${fmtDur(R.houseTotal / R.houseN, { short: true })}`]);
  return { title: periodTitle(), work: fmtDur(R.work, { short: true }), norm: R.norm > 0 ? Math.round((R.work / R.norm) * 100) : null, tiles: tiles.slice(0, 6), file: `CABINA-itogi-${ST.period === 'all' ? 'vse' : ST.period === 'year' ? ST.y : `${ST.y}-${String(ST.m).padStart(2, '0')}`}.png` };
}

// только часы за период — для сравнения
function collectLite(p) {
  return periodMonths(p).reduce((s, [y, m]) => s + monthSummary(y, m, S.trips, S.absences).work, 0);
}

function slipHtml(t, { single }) {
  const row = (l) => `<div class="slip-row"><span>${esc(l.label)}${l.pct ? ` ${String(l.pct).replace('.', ',')}%` : ''}${l.hours ? `<small>${fmtH(l.hours)}</small>` : ''}${l.days ? `<small>${l.days} ${plural(l.days, 'день', 'дня', 'дней')}</small>` : ''}</span><b>${fmtRub(l.amount, true)}</b></div>`;
  return `<section class="slip">
    <div class="slip-head">Начислено</div>
    ${t.lines.map(row).join('')}
    <div class="slip-row total"><span>Всего начислено</span><b>${fmtRub(t.gross, true)}</b></div>
    ${t.deductions.length ? `<div class="slip-head">Удержано</div>${t.deductions.map(row).join('')}` : ''}
    ${t.comp > 0 ? `<div class="slip-row"><span>Ком. расходы<small>без налога</small></span><b>+${fmtRub(t.comp, true)}</b></div>` : ''}
    <div class="slip-net"><span>На руки</span><b>≈ ${fmtRub(t.net)}</b></div>
    ${single && single.rate ? `<div class="hint">Ставка ${fmtRub(single.rate, true)} в час. Премия посчитана за работу этого же месяца, хотя в квиток она попадёт в следующем.</div>` : ''}
  </section>`;
}

function payView(R) {
  const cfg = myPay();
  if (!hasRate(cfg)) {
    return `<div class="empty"><div class="em-ico" style="--accent:var(--ok)">${I.wallet}</div><b>Укажите тарифную ставку</b><p>По ней приложение посчитает заработок на руки за каждую поездку, месяц и год.</p>
      <button class="btn btn-primary btn-sm" data-act="go" data-page="tariffs">Указать ставку</button></div>`;
  }
  const or = overRestIntervals(S.trips, statsOf);
  const months = R.months.map(([y, m]) => payMonth(y, m, S.trips, S.absences, cfg, statsOf, { overRest: or }));
  const total = payTotal(months);
  if (total.gross <= 0 && total.comp <= 0) {
    return `<div class="empty"><div class="em-ico" style="--accent:var(--ok)">${I.wallet}</div><b>За этот период заработка нет</b><p>Здесь появится расчёт, похожий на квиток, когда в периоде будут поездки.</p></div>`;
  }
  let html = `<section class="st-hero"><div class="eyebrow st-eye">На руки${ST.period === 'month' ? '' : ' за период'}${eyeBtn()}</div><div class="st-big num">≈ ${fmtRub(total.net)}</div>
    <div class="st-sub">начислено ${fmtRub(total.gross)} · НДФЛ 13%</div></section>`;
  if (R.months.length > 1) {
    const items = months.map((r, i) => ({ v: r.net, label: R.months.length > 12 ? MONTHS_SHORT[R.months[i][1] - 1][0] : MONTHS_SHORT[R.months[i][1] - 1], full: `${MONTHS[R.months[i][1] - 1]} ${R.months[i][0]}` }));
    if (R.months.length <= 24) html += block('На руки по месяцам', barChart(items, { fmt: (v) => fmtRub(v), id: 'ch-pay' }));
    const nz = months.map((r, i) => [r, R.months[i]]).filter(([r]) => r.net > 0);
    if (nz.length) html += block('По месяцам', `<div class="rows">${nz.map(([r, [y, m]]) => `<button class="r link" data-act="st-month" data-y="${y}" data-m="${m}"><span class="grow">${MONTHS[m - 1]} ${y}</span><span class="muted">${fmtHours(r.sum.work / 60)}</span><b>${fmtRub(r.net)}</b>${small(I.right, 16)}</button>`).join('')}</div>`);
  }
  html += block(ST.period === 'month' ? 'Квиток' : 'Квиток за период', slipHtml(total, { single: months.length === 1 ? months[0] : null }));
  if (ST.period === 'month') html += `<button class="btn btn-ghost" data-act="slip-pdf">${I.download} Скачать квиток в PDF</button>`;
  html += `<div class="notice">${I.info}<div><b>Расчёт ориентировочный, итог — по вашему расчётному листку.</b> Отпускные, техучёба и разовые выплаты не учитываются. Больничный — если в «Тарифных ставках» указана оплата одного дня.</div></div>`;
  return `<div class="money-area">${html}</div>`;
}

// ---------------------------------------------------------------- экран
export function renderStats() {
  if (!ST.y) { const d = new Date(nowLocal()); ST.y = d.getUTCFullYear(); ST.m = d.getUTCMonth() + 1; }
  const R = collect(ST);
  return `${pageHead('Статистика', { back: true })}
    <div class="seg accent" id="st-kind"><button data-act="st-kind" data-v="trips" aria-pressed="${ST.kind === 'trips'}">Поездная статистика</button><button data-act="st-kind" data-v="pay" aria-pressed="${ST.kind === 'pay'}">Заработная плата</button></div>
    <div class="seg" id="st-period">${Object.entries(PERIODS).map(([k, v]) => `<button data-act="st-period" data-v="${k}" aria-pressed="${ST.period === k}">${v}</button>`).join('')}</div>
    ${ST.period === 'all' ? '' : `<div class="period-switch"><button class="icon-btn" data-act="st-prev" aria-label="Предыдущий период">${I.left}</button><div class="period-title" aria-live="polite">${periodTitle()}</div><button class="icon-btn" data-act="st-next" aria-label="Следующий период">${I.right}</button></div>`}
    ${ST.kind === 'trips' ? tripsView(R) : payView(R)}`;
}

export function statsClick(act, b, ctx) {
  switch (act) {
    case 'st-kind': ST.kind = b.dataset.v; ctx.rerender(); if (ST.kind === 'pay') setTimeout(slipPdfTour, 400); return true;
    case 'st-period': ST.period = b.dataset.v; ctx.rerender(); return true;
    case 'st-prev': Object.assign(ST, shifted(ST, -1)); ctx.rerender(); return true;
    case 'st-next': Object.assign(ST, shifted(ST, 1)); ctx.rerender(); return true;
    case 'slip-pdf': {
      if (b.disabled) return true;
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      exportSlip(ST.y, ST.m).finally(() => { b.disabled = false; b.removeAttribute('aria-busy'); });
      return true;
    }
    case 'cal-day': openDay(b.dataset.d); return true;
    case 'st-series': { const k = b.dataset.k; if (openSeries.has(k)) openSeries.delete(k); else openSeries.add(k); ctx.rerender(); return true; }
    case 'st-loco': openLoco(b.dataset.k); return true;
    case 'st-recap': openRecap(recapData()); return true;
    case 'st-month': ST.period = 'month'; ST.y = +b.dataset.y; ST.m = +b.dataset.m; ctx.rerender(); window.scrollTo(0, 0); return true;
    default: return false;
  }
}

// подсказка по нажатию на столбец графика
export function statsTap(e) {
  const g = e.target.closest('[data-bar]');
  const fig = g?.closest('.chart');
  if (!fig) return false;
  const tips = JSON.parse(fig.dataset.tips || '[]');
  fig.querySelectorAll('.bar-g.on').forEach((x) => x.classList.remove('on'));
  g.classList.add('on');
  fig.querySelector('.chart-tip').textContent = tips[+g.dataset.bar] || '';
  return true;
}

