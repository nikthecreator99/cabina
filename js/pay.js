// Ориентировочный расчёт заработной платы локомотивной бригады.
// Схема сверена с расчётными листками (см. ТЗ 2.0, п. 5.4):
//  • все отработанные часы × тарифная ставка; следование пассажиром и ожидание следования — тоже по тарифу,
//    тоже входят в отработанные часы и идут отдельными строками (в квитке — «ОплЗаСледПасс» и «ОплЗаОжидСлед»);
//  • тяжёлый или длинносоставный поезд (вес или длина больше нормы маршрута) — +15% ставки за часы на локомотиве
//    («ДоплРабЛокомБрТяжДлинПоез»); у резерва и манёвров, следования и ожидания этой доплаты нет;
//  • ночные (22:00–06:00) +40% ставки, «вредность» +4% на все часы, надбавка за класс — на все часы;
//  • праздничные часы +100%;
//  • переработка в том же месяце: часы сверх нормы по закону (пятидневка, с учётом отвлечений — как
//    «Норма часов (по закону)» в листке; на экране норма — по выбранной неделе): сначала часы выходных
//    и праздников — ещё +100% (праздничные уже оплачены вдвойне), остальное — первые 2 ч +50%, дальше +100%
//    (ст. 152 ТК, строки 073L и 073M листка);
//  • отдых в пункте оборота сверх нормы — 2/3 ставки (норма = привезённое рабочее время);
//  • премия — процент от заработка за работу этого же месяца;
//  • районный коэффициент, северная, зональная и бамовская надбавки — на заработок вместе с премией;
//  • НДФЛ 13%, необязательные удержания (профсоюз, корпоративная пенсия — от начисленного; алименты — от начисленного
//    за вычетом НДФЛ, как в ст. 99 закона об исполнительном производстве; не больше 70%);
//  • ком. расходы за поездку — компенсация, налогом не облагается;
//  • резерв (вид движения «Резерв» — работа на одиночно следующем локомотиве) — по тарифу отдельной строкой
//    («ОплЗаРабНаОдиночСледЛоком»); ночные, вредность, класс, праздничные и переработка — как обычно, без доплаты за тяжёлый поезд;
//  • учёба (сессия) — средний заработок за час × часы дней учёбы по производственному календарю
//    (средний за день люди не знают, а средний за час легко посчитать по квитку);
//  • режим «по среднему»: все рабочие часы × средний заработок за час, без отдельных доплат и надбавок;
//  • тестовый режим «оплата по сменам» (2.18) — см. shiftSplit.
// Все суммы — в рублях, время на входе — в минутах.
import { MIN, HOUR, monthKeyOf, dateKeyOf, monthSummary, parseLocal, legsOf } from './calc.js';
import { dayInfo } from './calendar.js';

export const ROLES = { assistant: 'Помощник машиниста', driver: 'Машинист' };
export const NDFL = 13;
export const ALIMONY_MAX = 70; // больше 70% удерживать нельзя (ст. 99 закона № 229-ФЗ)
export const OVERREST_MAX = 48 * HOUR; // больше 48 ч между поездками — это уже не отдых в пункте оборота

// Поля набора ставок. pct — проценты, rub — рубли. def — значение по умолчанию.
export const PAY_FIELDS = [
  { k: 'bonus', label: 'Премия', unit: '%', def: 10, hint: 'До первого расчёта по листкам — 10%. Можно указать свой процент.' },
  { k: 'night', label: 'Ночные', unit: '%', def: 40, hint: 'Доплата за часы с 22:00 до 6:00. В квитке — «Доплата за работу в ночное время», обычно 40%.' },
  { k: 'harm', label: 'Вредность', unit: '%', def: 4, hint: 'Доплата за вредные условия на все часы. В квитке — «Допл…ВредДляЛБ», обычно 4%.' },
  { k: 'klass', label: 'Надбавка за класс', unit: '%', def: null, hint: 'Доплата за класс квалификации машиниста, процент от тарифа. Смотрите в квитке или спросите в нарядной.', role: 'driver' },
  { k: 'rk', label: 'Районный коэффициент', unit: '%', def: null, hint: 'В квитке — «Районный коэффициент». Например, 20%. Начисляется на заработок вместе с премией.' },
  { k: 'sn', label: 'Северная надбавка', unit: '%', def: null, hint: 'В квитке — «Северная надбавка». Например, 50%. Начисляется на заработок вместе с премией.' },
  { k: 'zone', label: 'Зональная надбавка', unit: '%', def: null, hint: 'Есть не во всех регионах. Если в квитке её нет — оставьте пустым.' },
  { k: 'bam', label: 'Бамовская надбавка', unit: '%', def: null, hint: 'Только для работающих на БАМе. Если в квитке её нет — оставьте пустым.' },
  { k: 'heavy', label: 'Тяжёлый и длинносоставный поезд', unit: '%', def: 15, hint: 'В квитке — «Допл…ТяжДлинПоез», обычно 15%. Нормы веса и длины — в настройках участка.' },
  { k: 'trip', label: 'Ком. расходы за поездку', unit: '₽', def: null, hint: 'Фиксированная выплата за каждую поездку, если она у вас есть. Налогом не облагается.' },
  { k: 'sickDay', label: 'Оплата одного дня больничного', unit: '₽', def: null, hint: 'Сколько вам начисляют за один календарный день больничного. Найти можно в расчётном листке: сумму по больничному разделите на число дней болезни. Если оставить пустым, больничный не считается.', group: 'sick', ph: 'Например, 2 500' },
  { k: 'avgHour', label: 'Средний заработок за час', unit: '₽/ч', def: null, hint: '', group: 'avg', ph: 'Например, 600' },
  { k: 'union', label: 'Профсоюзный взнос', unit: '%', def: null, hint: 'Удержание, если вы в профсоюзе. В квитке — «Профсоюз…», обычно 1%.', deduct: true },
  { k: 'pension', label: 'Корпоративная пенсия', unit: '%', def: null, hint: 'Добровольный взнос, если вы его платите. В квитке — «Удержание взнос КорпПенсия».', deduct: true },
  { k: 'alimony', label: 'Алименты', unit: '%', def: null, max: ALIMONY_MAX, hint: 'Процент из решения суда или соглашения (на одного ребёнка обычно 25%, на двоих — 33,33%, на троих и больше — 50%). Удерживается из заработка после вычета НДФЛ. Если алименты — твёрдая сумма, этот расчёт не подойдёт.', deduct: true },
];

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
const round2 = (v) => Math.round(v * 100) / 100;

// Один набор ставок на человека (с 2.6, ключ main). Раньше наборы были по должностям: пока main нет,
// берём набор должности из профиля, а если в нём нет ставки — тот, где она есть. Старые наборы не удаляются.
const hasData = (x) => !!x && typeof x === 'object' && ((Array.isArray(x.rates) && x.rates.some((r) => num(r.rate))) || num(x.avgHour) > 0);
export function paySet(sets, role = 'assistant') {
  if (!sets || typeof sets !== 'object') return {};
  if (sets.main && typeof sets.main === 'object') return sets.main;
  if (hasData(sets[role])) return sets[role];
  return Object.keys(ROLES).map((k) => sets[k]).find(hasData) || sets[role] || {};
}

// Набор ставок с подставленными значениями по умолчанию. role — должность из профиля (надбавка за класс — только машинисту)
export function payCfg(sets, role = 'assistant', estimatedBonus = null) {
  const raw = paySet(sets, role);
  const cfg = { role, mode: raw.mode === 'avg' ? 'avg' : 'tariff', rates: Array.isArray(raw.rates) ? raw.rates.filter((r) => num(r.rate)) : [] };
  cfg.shiftTest = cfg.mode === 'tariff' && raw.shiftTest === true; // тестовый режим «оплата по сменам» — только по тарифу
  for (const f of PAY_FIELDS) {
    if (f.role && f.role !== role) { cfg[f.k] = 0; continue; }
    const v = raw[f.k];
    cfg[f.k] = v === undefined || v === null ? num(f.def) : num(v); // пустое поле, введённое человеком, = 0
    if (f.max) cfg[f.k] = Math.min(cfg[f.k], f.max);
  }
  cfg.bonusEstimate = estimatedBonus;
  cfg.bonusFromSlips = estimatedBonus != null && raw.bonus == null;
  if (cfg.bonusFromSlips) cfg.bonus = estimatedBonus;
  return cfg;
}

// Ставка на дату 'YYYY-MM-DD'. История: [{ from: 'YYYY-MM-DD' | null, rate }].
// Первая ставка действует и для всех более ранних дат.
export function rateOn(cfg, dateKey) {
  const list = [...(cfg.rates || [])].sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')));
  if (!list.length) return 0;
  let r = num(list[0].rate);
  for (const x of list) if (!x.from || x.from <= dateKey) r = num(x.rate);
  return r;
}
// Есть из чего считать: тарифная ставка, а в режиме «по среднему» — средний за час
export const hasRate = (cfg) => (cfg.mode === 'avg' ? cfg.avgHour > 0 : (cfg.rates || []).some((r) => num(r.rate) > 0));
export const isAvg = (cfg) => cfg.mode === 'avg';
export function currentRate(cfg, todayKey) { return rateOn(cfg, todayKey); }

// Отдых в пункте оборота сверх нормы: от «окончание поездки + привезённое рабочее время»
// до начала следующей поездки. Возвращает интервалы [s, e] в мс.
export function overRestIntervals(trips, statsOf) {
  const list = trips.map((t) => ({ t, st: statsOf(t) })).filter((x) => Number.isFinite(x.st.start)).sort((a, b) => a.st.start - b.st.start);
  const out = [];
  for (let i = 0; i < list.length - 1; i++) {
    const { t, st } = list[i];
    if (t.restType !== 'turnaround' || st.live || !Number.isFinite(st.end)) continue;
    const next = list[i + 1].st.start;
    const gap = next - st.end;
    if (gap <= 0 || gap > OVERREST_MAX) continue;
    const from = st.end + st.work * MIN;
    if (next > from) out.push({ trip: t, s: from, e: next });
  }
  return out;
}

// Минуты интервалов, попавшие в месяц 'YYYY-MM'
export function minutesInMonth(ivs, mk) {
  let total = 0;
  for (const { s, e } of ivs) {
    const y = +mk.slice(0, 4);
    const m = +mk.slice(5, 7);
    const ms = Date.UTC(y, m - 1, 1);
    const me = Date.UTC(y, m, 1);
    total += Math.max(0, Math.min(e, me) - Math.max(s, ms)) / MIN;
  }
  return total;
}

// Тяжёлый или длинносоставный поезд: вес или условная длина больше нормы маршрута (норма 5199 т — с 5200 т уже тяжёлый).
// cfg.norms — нормы маршрутов { [routeId]: { weight, length } }. У резерва и манёвров поезда нет.
export function isHeavy(trip, cfg) {
  if (!trip || trip.kind === 'reserve' || trip.kind === 'shunt') return false;
  const n = cfg?.norms?.[trip.routeId];
  if (!n) return false;
  return (num(n.weight) > 0 && num(trip.weight) > num(n.weight)) || (num(n.length) > 0 && num(trip.length) > num(n.length));
}
// Сколько тяжёлых или длинных поездов в поездке: у смены локомотива — у каждого локомотива свой поезд (2.19.7)
export const heavyCount = (trip, cfg) => legsOf(trip).filter((l) => isHeavy(l, cfg)).length;
// Минуты на локомотиве с тяжёлым или длинным поездом — за всю поездку или за месяц mk.
// У поездки со сменой локомотива — только часы тех локомотивов, у которых поезд тяжелее или длиннее нормы их маршрута.
export function heavyMin(trip, st, cfg, mk) {
  return legsOf(trip).reduce((sum, leg, i) => sum + (isHeavy(leg, cfg) ? locoMinutes(st, i, mk) : 0), 0);
}

function locoMinutes(st, i, mk) {
  if (Array.isArray(st?.legs)) return mk ? st.legs[i]?.byMonth[mk] || 0 : st.legs[i]?.work || 0;
  if (i !== 0) return 0;
  const part = mk ? st?.byMonth?.[mk] : st;
  return part ? Math.max(0, part.work - (part.wait || 0) - (part.pass || 0)) : 0;
}

const sectionRates = [10, 20, 30, 35, 50];
export function sectionPct(distanceKm) {
  const km = num(distanceKm);
  if (!km) return null;
  if (km >= 1000) return 50;
  if (km >= 500) return 35;
  if (km >= 450) return 30;
  if (km >= 350) return 20;
  return km > 250 ? 10 : 0;
}

// Код 151: часы на локомотиве по ставке каждого участка. null — длина участка неизвестна.
export function sectionMinutes(trip, st, cfg, mk) {
  const minutes = new Map();
  for (const [i, leg] of legsOf(trip).entries()) {
    const pct = sectionPct(cfg.norms?.[leg.routeId]?.distanceKm);
    const work = locoMinutes(st, i, mk);
    if (work) minutes.set(pct, (minutes.get(pct) || 0) + work);
  }
  return minutes;
}

// Обычная переработка месяца: первые 2 ч — ×1,5, остальное — ×2 (ст. 152 ТК; в листке 073L 0,5 и 073M 1,0)
export const OVER_FIRST = 120;
// На каждую явку из дома приходится до 90 минут месячной переработки по ставке ×1,5.
export const SHIFT_FIRST = 90;
export const averageDailyPay = (annual) => round2(annual / 12 / 29.3);

export function shiftPayNote(months) {
  const shifts = months.reduce((n, r) => n + (r.homeAppearances || 0), 0);
  const pending = months.some(r => r.shiftPending);
  return `Явок из дома: ${shifts}. До 1,5 часа переработки на явку оплачивается в полуторном размере, остаток — в двойном.${pending ? ' За месяцы с неполными данными показан обычный расчёт. Проверьте участки поездок и отметки домашнего отдыха.' : ''}`;
}

export function shiftSplit(overMin, shifts) {
  const over = Math.max(0, Math.round(overMin) || 0);
  const n = Math.max(0, Math.floor(shifts) || 0);
  const first = Math.min(over, n * SHIFT_FIRST);
  return { shifts: n, first, rest: over - first };
}

// Начисление за часы поездки (или её часть в месяце) без переработки:
// ставка, следование, ожидание, ночные, вредность, класс, праздничные, тяжёлый поезд.
// part — { work, night, holiday, wait, pass } в минутах. Работа на локомотиве = work − wait − pass.
// heavy — минуты на локомотиве с тяжёлым или длинным поездом (heavyMin).
// У резерва часы на локомотиве идут своей строкой, тоже по тарифу.
// Пассажирский и манёвры пока оплачиваются как грузовой (доплаты за тяжёлый поезд манёврам не положены).
function reserveMinutes(trip, st, mk) {
  return legsOf(trip).reduce((sum, leg, i) => sum + (leg.kind === 'reserve' ? locoMinutes(st, i, mk) : 0), 0);
}

function hoursPay(part, rate, cfg, reserveMin, heavy, section) {
  const h = part.work / 60;
  const w = (part.wait || 0) / 60;
  const p = (part.pass || 0) / 60;
  const drive = Math.max(0, h - w - p);
  const reserve = Math.min(drive, reserveMin / 60);
  return {
    ...Object.fromEntries(sectionRates.map((pct) => [`section${pct}`, (section.get(pct) || 0) / 60 * rate * pct / 100])),
    base: (drive - reserve) * rate,
    pass: p * rate,
    wait: w * rate,
    reserve: reserve * rate,
    night: (part.night / 60) * rate * cfg.night / 100,
    harm: h * rate * cfg.harm / 100,
    klass: h * rate * cfg.klass / 100,
    holiday: (part.holiday / 60) * rate,
    heavy: (Math.min(drive * 60, heavy) / 60) * rate * cfg.heavy / 100,
  };
}
const sumObj = (o) => Object.values(o).reduce((s, v) => s + v, 0);
// Алименты — процент от заработка после НДФЛ (ком. расходы — компенсация, с них не удерживают)
const alimonyOf = (gross, ndfl, cfg) => Math.max(0, gross - ndfl) * (cfg.alimony || 0) / 100;
const regionalPct = (cfg) => cfg.rk + cfg.sn + cfg.zone + cfg.bam;

// Заработок за одну поездку на руки: все доплаты к часам, отдых сверх нормы после неё, премия,
// районные надбавки, минус НДФЛ и удержания, плюс ком. расходы. Переработка считается только за месяц
// (и в тестовом режиме «по сменам» тоже).
export function tripPay(trip, st, cfg, { overRestMin = 0 } = {}) {
  if (!hasRate(cfg) || !Number.isFinite(st.start)) return null;
  let gross;
  if (isAvg(cfg)) gross = (st.work / 60) * cfg.avgHour;
  else {
    const rate = rateOn(cfg, dateKeyOf(st.start));
    const p = hoursPay(st, rate, cfg, reserveMinutes(trip, st), heavyMin(trip, st, cfg), sectionMinutes(trip, st, cfg));
    const work = sumObj(p) + (overRestMin / 60) * rate * 2 / 3;
    gross = work * (1 + cfg.bonus / 100) * (1 + regionalPct(cfg) / 100);
  }
  const ded = gross * (NDFL + cfg.union + cfg.pension) / 100 + alimonyOf(gross, gross * NDFL / 100, cfg);
  return { gross: round2(gross), net: round2(gross - ded + (st.live ? 0 : cfg.trip)) };
}

// Подробный расчёт месяца — строки «квитка».
export function payMonth(y, m, trips, absences, cfg, statsOf, { overRest } = {}) {
  const mk = `${y}-${String(m).padStart(2, '0')}`;
  const sum = monthSummary(y, m, trips, absences);
  const res = { mk, sum, lines: [], deductions: [], gross: 0, ndfl: 0, net: 0, hasRate: hasRate(cfg), empty: true };
  if (!res.hasRate) return res;
  const acc = { base: 0, pass: 0, wait: 0, reserve: 0, night: 0, harm: 0, klass: 0, holiday: 0, heavy: 0 };
  let comp = 0;
  let reserveMin = 0;
  let heavyTotal = 0;
  const sectionTotals = new Map();
  for (const pct of sectionRates) acc[`section${pct}`] = 0;
  for (const t of sum.monthTrips) {
    const st = statsOf(t);
    const part = st.byMonth[mk];
    if (!part) continue;
    const hv = heavyMin(t, st, cfg, mk);
    const section = sectionMinutes(t, st, cfg, mk);
    for (const [pct, minutes] of section) sectionTotals.set(pct, (sectionTotals.get(pct) || 0) + minutes);
    const reserve = reserveMinutes(t, st, mk);
    const p = hoursPay(part, rateOn(cfg, dateKeyOf(st.start)), cfg, reserve, hv, section);
    for (const k of Object.keys(acc)) acc[k] += p[k];
    reserveMin += reserve;
    heavyTotal += hv;
    if (!st.live && monthKeyOf(st.start) === mk) comp += cfg.trip;
  }
  const lastDay = `${mk}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const rateEnd = rateOn(cfg, lastDay);
  // переработка: часы сверх нормы; в выходные и праздники — сначала праздничные (они уже +100%)
  const monthShifts = cfg.homeShifts?.months[mk];
  res.homeAppearances = monthShifts?.count || 0;
  res.shiftPending = !!cfg.shiftTest && (!cfg.homeShifts?.home || !!monthShifts?.missingRoute);
  const useShifts = cfg.shiftTest && !res.shiftPending;
  // переработка — от нормы по закону (пятидневка), как в листке
  const over = sum.payOvertime ?? sum.overtime;
  const O = useShifts ? 0 : over / 60;
  const Ow = Math.min(O, (sum.restDay || 0) / 60);
  const hOw = Math.min(Ow, sum.holiday / 60);
  // праздничные часы сверх нормы уже оплачены вдвойне строкой «Праздничные», поэтому здесь только выходные
  const overWeekend = (Ow - hOw) * rateEnd;
  const Oo1 = Math.min(O - Ow, OVER_FIRST / 60);
  const Oo2 = O - Ow - Oo1;
  const overOther = Oo1 * rateEnd * 0.5;
  const overOther2 = Oo2 * rateEnd;
  const shift = useShifts ? shiftSplit(over - Math.min(over, sum.holiday), res.homeAppearances) : shiftSplit(0, 0);
  shift.pay1 = (shift.first / 60) * rateEnd * 0.5;
  shift.pay2 = (shift.rest / 60) * rateEnd;
  const orMin = minutesInMonth(overRest || [], mk);
  const orPay = (orMin / 60) * rateEnd * 2 / 3;

  const h = (min) => Math.round(min) / 60;
  // label — название строки, pct — процент (показывается рядом), hours — часы, к которым он применён, days — дни
  const L = (key, label, amount, { pct, hours, days } = {}) => { if (amount > 0.004) res.lines.push({ key, label, pct, hours, days, amount: round2(amount) }); };
  const avg = isAvg(cfg);
  const avgPay = avg ? (sum.work / 60) * cfg.avgHour : 0;
  const passMin = sum.pass || 0;
  const waitMin = sum.wait || 0;
  const baseMin = Math.max(0, sum.work - waitMin - passMin - reserveMin);
  if (avg) {
    // по среднему: все часы × средний за час (доплаты, премия и коэффициенты уже внутри среднего);
    // следование, ожидание и резерв — отдельными строками, как в квитке
    const ah = (min) => (min / 60) * cfg.avgHour;
    L('avg', 'Работа по среднему', ah(baseMin), { hours: h(baseMin) });
    L('pass', 'Следование пассажиром', ah(passMin), { hours: h(passMin) });
    L('wait', 'Ожидание следования пассажиром', ah(waitMin), { hours: h(waitMin) });
    L('reserve', 'Работа на одиночно следующем локомотиве', ah(reserveMin), { hours: h(reserveMin) });
    for (const k of Object.keys(acc)) acc[k] = 0;
  }
  const noAvg = (v) => (avg ? 0 : v);
  L('base', 'Оплата по тарифу', acc.base, { hours: h(baseMin) });
  L('pass', 'Следование пассажиром', acc.pass, { hours: h(passMin) });
  L('wait', 'Ожидание следования пассажиром', acc.wait, { hours: h(waitMin) });
  L('reserve', 'Работа на одиночно следующем локомотиве', acc.reserve, { hours: h(reserveMin) });
  L('night', 'Ночные', acc.night, { pct: cfg.night, hours: h(sum.night) });
  L('harm', 'Вредность', acc.harm, { pct: cfg.harm, hours: h(sum.work) });
  L('klass', 'Надбавка за класс', acc.klass, { pct: cfg.klass, hours: h(sum.work) });
  L('holiday', 'Праздничные', acc.holiday, { pct: 100, hours: h(sum.holiday) });
  L('heavy', 'Тяжёлые и длинносоставные поезда', acc.heavy, { pct: cfg.heavy, hours: h(heavyTotal) });
  for (const pct of sectionRates) {
    const key = `section${pct}`;
    L(key, '151 · Работа на удлинённых участках', acc[key], { pct, hours: h(sectionTotals.get(pct) || 0) });
  }
  L('overOther', 'Переработка, первые 2 ч', noAvg(overOther), { pct: 50, hours: Oo1 });
  L('overOther2', 'Переработка сверх 2 ч', noAvg(overOther2), { pct: 100, hours: Oo2 });
  L('overWeekend', 'Переработка в выходные', noAvg(overWeekend), { pct: 100, hours: Ow - hOw });
  L('shift1', 'Переработка, до 1,5 ч на явку', noAvg(shift.pay1), { pct: 50, hours: h(shift.first) });
  L('shift2', 'Переработка сверх 1,5 ч на явку', noAvg(shift.pay2), { pct: 100, hours: h(shift.rest) });
  L('overRest', 'Отдых сверх нормы в пункте оборота', noAvg(orPay), { hours: h(orMin) });
  const workPay = avg ? avgPay : sumObj(acc) + overOther + overOther2 + overWeekend + shift.pay1 + shift.pay2 + orPay;
  const bonus = avg ? 0 : workPay * cfg.bonus / 100;
  L('bonus', 'Премия', bonus, { pct: cfg.bonus });
  const withBonus = workPay + bonus;
  const regional = avg ? 0 : regionalPct(cfg);
  if (!avg) {
    L('rk', 'Районный коэффициент', withBonus * cfg.rk / 100, { pct: cfg.rk });
    L('sn', 'Северная надбавка', withBonus * cfg.sn / 100, { pct: cfg.sn });
    L('zone', 'Зональная надбавка', withBonus * cfg.zone / 100, { pct: cfg.zone });
    L('bam', 'Бамовская надбавка', withBonus * cfg.bam / 100, { pct: cfg.bam });
  }
  // больничный: календарные дни в этом месяце × оплата дня из настроек; премия и надбавки на него не начисляются
  const sickDays = sickDaysInMonth(absences, y, m);
  const sickPay = sickDays * cfg.sickDay;
  L('sick', 'Больничный', sickPay, { days: sickDays });
  // учёба (сессия): средний заработок за час × часы дней учёбы по производственному календарю
  // (те же часы, что вычтены из нормы; 8 ч в обычный день, 7 — в предпраздничный, 0 — в выходной)
  const studyDays = absDaysInMonth(absences, y, m, 'study');
  const studyHours = sum.absByType?.study || 0;
  const studyPay = studyHours * cfg.avgHour;
  L('study', 'Учёба (сессия)', studyPay, { hours: studyHours });
  res.sickDays = sickDays;
  res.studyDays = studyDays;
  res.rate = avg ? 0 : rateEnd;
  const gross = withBonus * (1 + regional / 100) + sickPay + studyPay;
  res.workPay = round2(workPay);
  res.gross = round2(gross);
  res.ndfl = Math.round(gross * NDFL / 100); // НДФЛ считается в целых рублях
  const D = (key, label, pct, amount) => { if (amount > 0.004) res.deductions.push({ key, label, pct, amount: round2(amount) }); };
  D('ndfl', 'НДФЛ', NDFL, res.ndfl);
  D('union', 'Профсоюзный взнос', cfg.union, gross * cfg.union / 100);
  D('pension', 'Корпоративная пенсия', cfg.pension, gross * cfg.pension / 100);
  D('alimony', 'Алименты', cfg.alimony, alimonyOf(gross, res.ndfl, cfg));
  res.comp = round2(comp);
  res.net = round2(gross - res.deductions.reduce((s, d) => s + d.amount, 0) + comp);
  res.overRestMin = orMin;
  res.shiftTest = !!cfg.shiftTest;
  res.empty = res.gross <= 0 && comp <= 0;
  return res;
}

// Календарные дни больничного внутри месяца (отвлечения «Больничный»)
export const sickDaysInMonth = (absences, y, m) => absDaysInMonth(absences, y, m, 'sick');

// Календарные дни отвлечений данного вида внутри месяца
export function absDaysInMonth(absences, y, m, type) {
  const p2 = (n) => String(n).padStart(2, '0');
  const first = `${y}-${p2(m)}-01`;
  const last = `${y}-${p2(m)}-${p2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  let n = 0;
  for (const a of absences || []) {
    if (a.type !== type || !a.start || !a.end) continue;
    const s = a.start > first ? a.start : first;
    const e = a.end < last ? a.end : last;
    if (e >= s) n += Math.round((Date.parse(`${e}T00:00Z`) - Date.parse(`${s}T00:00Z`)) / 86400000) + 1;
  }
  return n;
}

// Сумма нескольких месяцев (квартал, год, всё время)
export function payTotal(months) {
  const out = { lines: new Map(), deductions: new Map(), gross: 0, net: 0, comp: 0, months, shiftTest: months.some((r) => r.shiftTest) };
  // если процент в разные месяцы был разный, у итоговой строки его не показываем
  const add = (map, l) => {
    const x = map.get(l.key) || { key: l.key, label: l.label, pct: l.pct, hours: 0, amount: 0 };
    if (x.pct !== l.pct) x.pct = undefined;
    x.amount += l.amount;
    if (l.hours != null) x.hours = (x.hours || 0) + l.hours; else x.hours = undefined;
    if (l.days) x.days = (x.days || 0) + l.days;
    map.set(l.key, x);
  };
  for (const r of months) {
    for (const l of r.lines) add(out.lines, l);
    for (const d of r.deductions) add(out.deductions, d);
    out.gross += r.gross; out.net += r.net; out.comp += r.comp || 0;
  }
  const order = ['avg', 'base', 'pass', 'wait', 'reserve', 'night', 'harm', 'klass', 'holiday', 'heavy', ...sectionRates.map((pct) => `section${pct}`), 'overOther', 'overOther2', 'overWeekend', 'shift1', 'shift2', 'overRest', 'bonus', 'rk', 'sn', 'zone', 'bam', 'sick', 'study', 'ndfl', 'union', 'pension', 'alimony'];
  const byOrder = (a, b) => order.indexOf(a.key) - order.indexOf(b.key);
  out.lines = [...out.lines.values()].sort(byOrder).map((l) => ({ ...l, amount: round2(l.amount) }));
  out.deductions = [...out.deductions.values()].sort(byOrder).map((d) => ({ ...d, amount: round2(d.amount) }));
  out.gross = round2(out.gross); out.net = round2(out.net); out.comp = round2(out.comp);
  return out;
}

// ---- Форматирование ----
export function fmtRub(v, kop = false) {
  const n = kop ? Math.round(v * 100) / 100 : Math.round(v);
  const [i, f] = Math.abs(n).toFixed(kop ? 2 : 0).split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${int}${kop ? `,${f}` : ''} ₽`;
}
export function fmtH(hours) {
  const v = Math.round(hours * 100) / 100;
  return `${String(v).replace('.', ',')} ч`;
}
export const parseDateKey = (k) => parseLocal(`${k}T00:00`);

// ---- Отпускные ориентировочно (2.21.9, просьба Никиты; ст. 139 и 120 ТК РФ) ----
// Расчётный период — 12 календарных месяцев до месяца начала отпуска. Средний за день = заработок за период /
// (29,3 × полные месяцы + 29,3 / дней в месяце × отработанные календарные дни неполных месяцев). Из периода
// исключаются дни больничного, отпуска, учёбы и медкомиссии и деньги за них (больничный, учёба). Отпускные =
// средний за день × дни отпуска; нерабочие праздничные дни внутри отпуска в дни отпуска не входят (ст. 120).
// Учитываем только месяцы, где есть поездки (до CABINA записей нет); считаем, если таких месяцев хотя бы 6.
export const VAC_MIN_MONTHS = 6;
const EXCLUDED = ['sick', 'vacation', 'study', 'medical'];
export function vacationDays(startKey, endKey) {
  let n = 0;
  for (let t = Date.parse(`${startKey}T00:00Z`), e = Date.parse(`${endKey}T00:00Z`), g = 0; t <= e && g < 400; t += 86400000, g++) {
    if (dayInfo(new Date(t).toISOString().slice(0, 10)).kind !== 'holiday') n++;
  }
  return n;
}
export function vacationPay(startKey, endKey, trips, absences, cfg, statsOf, { overRest } = {}) {
  if (!hasRate(cfg) || !startKey || !endKey || endKey < startKey) return null;
  const y0 = +startKey.slice(0, 4); const m0 = +startKey.slice(5, 7);
  const tripMonths = new Set();
  for (const t of trips) { const st = statsOf(t); if (!st.live) for (const mk of Object.keys(st.byMonth || {})) tripMonths.add(mk); }
  let sum = 0; let weight = 0; let months = 0;
  const others = (absences || []).filter((a) => !(a.start === startKey && a.end === endKey && a.type === 'vacation'));
  for (let i = 12; i >= 1; i--) {
    const d = new Date(Date.UTC(y0, m0 - 1 - i, 1));
    const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1;
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    if (!tripMonths.has(mk)) continue;
    const r = payMonth(y, m, trips, others, cfg, statsOf, { overRest });
    const paid = (r.lines.find((l) => l.key === 'sick')?.amount || 0) + (r.lines.find((l) => l.key === 'study')?.amount || 0);
    const cal = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const off = Math.min(cal, EXCLUDED.reduce((s, type) => s + absDaysInMonth(others, y, m, type), 0));
    if (off >= cal) continue;
    sum += Math.max(0, r.gross - paid);
    weight += 29.3 / cal * (cal - off);
    months++;
  }
  if (months < VAC_MIN_MONTHS || weight <= 0) return { months, enough: false };
  const days = vacationDays(startKey, endKey);
  const perDay = sum / weight;
  const gross = round2(perDay * days);
  const ndfl = Math.round(gross * NDFL / 100);
  return { enough: true, months, days, perDay: round2(perDay), gross, ndfl, net: round2(gross - ndfl) };
}
