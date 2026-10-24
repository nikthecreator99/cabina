// Статистика: поездная и заработная плата за месяц, квартал, год или всё время.
// Показываются только блоки, где есть данные.
import { I, esc, small, pageHead, MONTHS, MONTHS_SHORT, plural } from './ui.js';
import { S, statsOf, nowLocal, routeOf, locoLabel, locoKey, myPay, refreshLive } from './store.js';
import { monthSummary, fmtDur, fmtHours, parseLocal, monthKeyOf, dateKeyOf, DAY, MIN } from './calc.js';
import { dayInfo } from './calendar.js';
import { payMonth, payTotal, overRestIntervals, hasRate, fmtRub, fmtH } from './pay.js';
import { houseOf, dayOffIntervals } from './rest.js';
import { ABS_TYPES } from './forms.js';
import { exportSlip } from './slip.js';
import { slipPdfTour } from './tours.js';

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
function compareLabel(p) {
  const prev = shifted(p, -1);
  if (p.period === 'month') return `к ${MONTHS_DAT[prev.m - 1]}`;
  if (p.period === 'quarter') return `к ${ROMAN[Math.floor((prev.m - 1) / 3)]} кварталу`;
  if (p.period === 'year') return `к ${prev.y} году`;
  return '';
}

// ---------------------------------------------------------------- подсчёт
function tripsIn(keys) {
  return S.trips.filter((t) => keys.has(monthKeyOf(statsOf(t).start)));
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
  const R = { months, sums, keys, work: 0, norm: 0, overtime: 0, night: 0, holiday: 0, wait: 0, abs: { sick: 0, vacation: 0, medical: 0 } };
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
  const locos = new Map();
  R.passenger = 0;
  for (const t of trips) {
    const r = t.routeId && S.routes.find((x) => x.id === t.routeId);
    if (r?.distanceKm) R.km += r.distanceKm;
    const label = routeOf(t);
    if (label) arms.set(label, (arms.get(label) || 0) + 1);
    const ll = locoLabel(t.locoType, t.locoNumber);
    if (t.locoType && t.locoNumber) { const k = locoKey(t.locoType, t.locoNumber); const x = locos.get(k) || { label: ll, n: 0 }; x.n++; locos.set(k, x); }
    for (const pi of t.passenger || []) { const s = parseLocal(pi.start); const e = parseLocal(pi.end); if (e > s) R.passenger += (e - s) / MIN; }
  }
  R.arms = [...arms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  R.locos = [...locos.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  // дома отдыха и домашний отдых: от окончания поездки до начала следующей
  const all = [...S.trips].sort((a, b) => statsOf(a).start - statsOf(b).start);
  const houses = new Map();
  R.home = { n: 0, total: 0 };
  all.forEach((t, i) => {
    if (!keys.has(monthKeyOf(statsOf(t).start))) return;
    const gap = gapAfter(all, i);
    if (gap == null || gap <= 0) return;
    if (t.restType === 'turnaround' && gap <= HOUSE_GAP_MAX) {
      const name = houseOf(t) || 'Дом отдыха не указан';
      const x = houses.get(name) || { name, n: 0, total: 0, unknown: !houseOf(t) };
      x.n++; x.total += gap / MIN; houses.set(name, x);
    } else if (t.restType === 'home' && gap <= HOME_GAP_MAX) { R.home.n++; R.home.total += gap / MIN; }
  });
  R.houses = [...houses.values()].sort((a, b) => (a.unknown - b.unknown) || b.n - a.n);
  R.houseTotal = R.houses.reduce((s, h) => s + h.total, 0);
  R.houseN = R.houses.reduce((s, h) => s + h.n, 0);
  return R;
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
  const used = new Set();
  let cells = '<span></span>'.repeat(firstDow);
  for (let d = 1; d <= n; d++) {
    const k = `${mkOf(y, m)}-${p2(d)}`;
    const kind = dayInfo(k).kind;
    const cls = abs.has(k) ? `abs-${abs.get(k)}` : work.has(k) ? 'work' : off.has(k) ? 'dayoff' : 'free';
    used.add(cls);
    cells += `<span class="cal-d ${cls} ${kind === 'holiday' ? 'hol' : ''} ${kind === 'weekend' || kind === 'off' || kind === 'holiday' ? 'we' : ''}" title="${d} ${MONTHS_SHORT[m - 1]}">${d}</span>`;
  }
  const lg = [['work', 'работа'], ['dayoff', 'выходной'], ['free', 'отдых'], ['abs-sick', 'больничный'], ['abs-vacation', 'отпуск'], ['abs-medical', 'медкомиссия']]
    .filter(([c]) => used.has(c)).map(([c, l]) => `<span><i class="cal-d ${c}"></i>${l}</span>`).join('');
  return `<div class="cal"><div class="cal-wd">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells}</div><div class="cal-lg">${lg}</div></div>`;
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
      b += `<div class="kv-grid">${kv('В домах отдыха', fmtDur(R.houseTotal, { short: true }), `${R.houseN} ${plural(R.houseN, 'раз', 'раза', 'раз')}`)}${kv('Средний отдых', fmtDur(R.houseTotal / R.houseN, { short: true }))}</div>`;
      b += `<div class="rows">${R.houses.map((h) => `<div class="r"><span class="grow ${h.unknown ? 'muted' : ''}">${esc(h.name)}</span><span class="muted">${h.n} ${plural(h.n, 'раз', 'раза', 'раз')} · ср. ${fmtDur(h.total / h.n, { short: true })}</span><b>${fmtDur(h.total, { short: true })}</b></div>`).join('')}</div>`;
    }
    if (R.home.n) b += `<div class="kv-grid">${kv('Домашний отдых', fmtDur(R.home.total, { short: true }), `${R.home.n} ${plural(R.home.n, 'раз', 'раза', 'раз')}`)}${kv('В среднем', fmtDur(R.home.total / R.home.n, { short: true }))}</div>`;
    html += block('Отдых', `${b}<div class="hint">От окончания поездки до начала следующей.</div>`);
  }
  if (R.locos.length) html += block('Частые локомотивы', `<div class="rows">${R.locos.map((l) => `<div class="r"><span class="grow">${small(I.train, 15)} ${esc(l.label)}</span><b>${l.n} ${plural(l.n, 'поездка', 'поездки', 'поездок')}</b></div>`).join('')}</div>`);
  return html;
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
  let html = `<section class="st-hero"><div class="eyebrow">На руки${ST.period === 'month' ? '' : ' за период'}</div><div class="st-big num">≈ ${fmtRub(total.net)}</div>
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
  return html;
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

