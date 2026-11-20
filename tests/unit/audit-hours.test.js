// Проверка расчётов часов и отдыха по нормативным документам (15.11.2026) — редкие случаи.
// Документы (редакции, по которым сверялось):
//  • ТК РФ (ред. от 25.05.2026): ст. 95 (предпраздничный день −1 ч, суббота шестидневки ≤ 5 ч), ст. 96 (ночь 22–6),
//    ст. 110 (еженедельный отдых ≥ 42 ч), ст. 112 (праздничные дни), ст. 153 (часы праздника — от 0 до 24 ч);
//  • приказ Минтранса № 339 (ред. от 02.07.2025): п. 14 (следование и ожидание пассажиром — рабочее время),
//    п. 40 (выходной = +24 ч к расчётному отдыху), п. 43 (междусменный отдых: рабочее время × коэффициент −
//    отдых в пункте оборота, не меньше 16 ч), п. 45 (отдых в пункте оборота: не меньше половины, не меньше 3 ч,
//    не больше времени работы);
//  • постановление Правительства РФ от 17.09.2026 № 1187 (перенос выходных в 2027 году).
// Данные — выдуманные. Там, где приложение считает по правилу Никиты или практике депо, а не по документу,
// это написано в названии теста.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  tripStats, monthSummary, turnaroundRest, homeRestMulti, parseLocal, fmtLocal, autoAbsenceHours, normSoFar,
  absenceBreakdown, MIN, HOUR, DAY,
} from '../../js/calc.js';
import { dayInfo, normDay, monthNorm, yearInfo, isHoliday } from '../../js/calendar.js';
import { overRestIntervals } from '../../js/pay.js';
import { S } from '../../js/store.js';
import { chosenRest, currentRest, turnaroundNow, dayOffIntervals } from '../../js/rest.js';

const T = (start, end, extra = {}) => ({ id: `t-${start}`, start, end, ...extra });
const P = (start, end) => ({ id: `p-${start}`, start, end });

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, minRest: 240, minShiftRest: 960, dayOffMin: 3600, houses: {} };
});

// ---------- Ночные часы (ТК РФ, ст. 96: с 22 до 6 часов) ----------

test('ночные: границы 22:00 и 06:00 с точностью до минуты', () => {
  assert.equal(tripStats(T('2026-10-14T22:00', '2026-10-15T06:00')).night, 480, 'ровно вся ночь');
  assert.equal(tripStats(T('2026-10-14T21:59', '2026-10-14T22:01')).night, 1, 'минута после 22:00');
  assert.equal(tripStats(T('2026-10-14T05:59', '2026-10-14T06:01')).night, 1, 'минута до 06:00');
  assert.equal(tripStats(T('2026-10-14T06:00', '2026-10-14T22:00')).night, 0, 'весь день — без ночных');
  assert.equal(tripStats(T('2026-10-14T00:00', '2026-10-14T00:01')).night, 1, 'первая минута суток');
  assert.equal(tripStats(T('2026-10-14T23:59', '2026-10-15T00:00')).night, 1, 'последняя минута суток');
  // вечер и утро одних суток — две разные ночи
  assert.equal(tripStats(T('2026-10-14T05:00', '2026-10-14T23:00')).night, 60 + 60);
});

test('ночные: ночь через границу месяца и года делится по месяцам', () => {
  const m = tripStats(T('2026-11-30T21:00', '2026-12-01T07:00'));
  assert.equal(m.night, 480);
  assert.equal(m.byMonth['2026-11'].night, 120);
  assert.equal(m.byMonth['2026-12'].night, 360);
  const y = tripStats(T('2026-12-31T23:30', '2027-01-01T00:30'));
  assert.deepEqual([y.byMonth['2026-12'].work, y.byMonth['2027-01'].work], [30, 30]);
  assert.deepEqual([y.byMonth['2026-12'].night, y.byMonth['2027-01'].night], [30, 30]);
});

test('ночные: следование и ожидание пассажиром ночью — тоже ночные, без двойного счёта', () => {
  // поездка 18:00–23:00, ожидание 23:00–01:00, следование 01:00–04:00
  const st = tripStats(T('2026-10-14T18:00', '2026-10-14T23:00', {
    waiting: [P('2026-10-14T23:00', '2026-10-15T01:00')], passenger: [P('2026-10-15T01:00', '2026-10-15T04:00')],
  }));
  assert.equal(st.work, 600);
  assert.equal(st.night, 360); // 22:00–04:00
  assert.equal(st.wait, 120);
  assert.equal(st.pass, 180);
});

// ---------- Месяц, год, високосный год ----------

test('поездка через полночь месяца: каждому месяцу — свои минуты', () => {
  const st = tripStats(T('2026-09-30T23:59', '2026-10-01T00:01'));
  assert.deepEqual([st.byMonth['2026-09'].work, st.byMonth['2026-10'].work], [1, 1]);
  // ровно до полуночи — следующему месяцу ничего
  assert.deepEqual(Object.keys(tripStats(T('2026-09-30T20:00', '2026-10-01T00:00')).byMonth), ['2026-09']);
  // ровно с полуночи — прошлому месяцу ничего
  assert.deepEqual(Object.keys(tripStats(T('2026-10-01T00:00', '2026-10-01T05:00')).byMonth), ['2026-10']);
});

test('високосный год: 29 февраля есть в 2028-м и нет в 2027-м', () => {
  const st = tripStats(T('2028-02-28T20:00', '2028-03-01T04:00'));
  assert.equal(st.byMonth['2028-02'].work, 4 * 60 + 24 * 60);
  assert.equal(st.byMonth['2028-03'].work, 240);
  const no = tripStats(T('2027-02-28T20:00', '2027-03-01T04:00'));
  assert.equal(no.byMonth['2027-02'].work, 240);
  assert.equal(no.byMonth['2027-03'].work, 240);
});

test('следование пассажиром через границу месяца: строки «следование» и «ожидание» — по своим месяцам', () => {
  const st = tripStats(T('2026-10-31T20:00', '2026-10-31T23:00', {
    waiting: [P('2026-10-31T22:30', '2026-10-31T23:30')], passenger: [P('2026-10-31T23:30', '2026-11-01T02:00')],
  }));
  assert.equal(st.work, 360);
  assert.deepEqual(st.byMonth['2026-10'], { work: 240, night: 120, holiday: 0, restDay: 240, wait: 60, pass: 30 });
  assert.deepEqual(st.byMonth['2026-11'], { work: 120, night: 120, holiday: 0, restDay: 120, wait: 0, pass: 120 });
});

test('рабочее время (приказ № 339, п. 14): перерыв между поездкой и следованием пассажиром не считается', () => {
  // поездка 10–12, следование 13–15: час между ними человек не вписал — в рабочее время не входит
  const st = tripStats(T('2026-10-14T10:00', '2026-10-14T12:00', { passenger: [P('2026-10-14T13:00', '2026-10-14T15:00')] }));
  assert.equal(st.work, 240);
  assert.equal(st.intervals.length, 2);
  // а вписанное ожидание закрывает этот час
  const full = tripStats(T('2026-10-14T10:00', '2026-10-14T12:00', {
    waiting: [P('2026-10-14T12:00', '2026-10-14T13:00')], passenger: [P('2026-10-14T13:00', '2026-10-14T15:00')],
  }));
  assert.equal(full.work, 300);
  assert.deepEqual([full.wait, full.pass], [60, 120]);
  // следование до явки на локомотив (приехали пассажиром, потом работа) — рабочее время с начала следования
  const before = tripStats(T('2026-10-14T10:00', '2026-10-14T18:00', { passenger: [P('2026-10-14T07:00', '2026-10-14T10:00')] }));
  assert.equal(before.work, 660);
  assert.equal(fmtLocal(before.start), '2026-10-14T07:00');
});

test('пересекающиеся следования и ожидание внутри следования не удваивают часы', () => {
  const two = tripStats(T('2026-10-14T10:00', '2026-10-14T12:00', {
    passenger: [P('2026-10-14T12:00', '2026-10-14T15:00'), P('2026-10-14T14:00', '2026-10-14T16:00')],
  }));
  assert.equal(two.work, 360);
  assert.equal(two.pass, 240);
  const inside = tripStats(T('2026-10-14T10:00', '2026-10-14T12:00', {
    passenger: [P('2026-10-14T12:00', '2026-10-14T15:00')], waiting: [P('2026-10-14T13:00', '2026-10-14T14:00')],
  }));
  assert.equal(inside.work, 300);
  assert.deepEqual([inside.pass, inside.wait], [180, 0]); // следование важнее ожидания
});

test('поездка «в пути» считается до «сейчас», в том числе через полночь месяца', () => {
  const live = T('2026-10-31T20:00', '');
  const st = tripStats(live, parseLocal('2026-11-01T02:30'));
  assert.equal(st.live, true);
  assert.equal(st.work, 390);
  assert.deepEqual([st.byMonth['2026-10'].work, st.byMonth['2026-11'].work], [240, 150]);
  assert.equal(st.night, 270);
  // «сейчас» раньше явки («ждёт явки») — часов нет
  assert.equal(tripStats(live, parseLocal('2026-10-31T19:00')).work, 0);
});

// ---------- Праздничные часы (ТК РФ, ст. 112 и 153) ----------

test('праздники по ст. 112: 1–8 января, 23 февраля, 8 марта, 1 и 9 мая, 12 июня, 4 ноября — и больше никакие', () => {
  const list = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'];
  for (const y of [2026, 2027, 2028, 2031]) {
    const found = [];
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += DAY) {
      const k = new Date(t).toISOString().slice(0, 10);
      if (isHoliday(k)) found.push(k.slice(5));
    }
    assert.deepEqual(found, list, `год ${y}`);
  }
});

test('праздничные часы — только от 0 до 24 ч самого праздника (ст. 153), выходной по переносу — не праздник', () => {
  // 23 февраля 2026 целиком внутри поездки
  const feb = tripStats(T('2026-02-22T23:00', '2026-02-24T01:00'));
  assert.equal(feb.holiday, 1440);
  // 8 марта 2026 — воскресенье, выходной перенесён на 9 марта: 9-е — выходной, но не праздник
  const mar = tripStats(T('2026-03-08T18:00', '2026-03-09T06:00'));
  assert.equal(mar.holiday, 360);
  assert.equal(mar.restDay, 720);
  assert.equal(tripStats(T('2026-03-09T08:00', '2026-03-09T20:00')).holiday, 0);
  // 9 мая 2026 — суббота: праздник остаётся праздником, 11 мая (перенос) — нет
  assert.equal(tripStats(T('2026-05-09T08:00', '2026-05-09T20:00')).holiday, 720);
  assert.equal(tripStats(T('2026-05-11T08:00', '2026-05-11T20:00')).holiday, 0);
  // 31 декабря 2026 — выходной по переносу, не праздник
  assert.equal(tripStats(T('2026-12-31T08:00', '2026-12-31T20:00')).holiday, 0);
  // минута до и после праздника
  assert.equal(tripStats(T('2026-11-03T23:59', '2026-11-04T00:01')).holiday, 1);
  assert.equal(tripStats(T('2026-11-04T23:59', '2026-11-05T00:01')).holiday, 1);
});

test('новогодние праздники: 8 января — последний праздничный день, 9-е — уже нет; ночь праздника — и ночные, и праздничные', () => {
  const st = tripStats(T('2027-01-08T20:00', '2027-01-09T08:00'));
  assert.equal(st.holiday, 240);
  assert.equal(st.night, 480);
  // поездка на все каникулы подряд (выдуманный случай): 8 суток праздника
  const all = tripStats(T('2026-12-31T12:00', '2027-01-09T12:00'));
  assert.equal(all.holiday, 8 * 1440);
  assert.equal(all.byMonth['2026-12'].holiday, 0);
  assert.equal(all.byMonth['2027-01'].holiday, 8 * 1440);
});

// ---------- Сверка «в лоб»: каждая минута поездки ----------

test('часы, ночные и праздничные совпадают с подсчётом по одной минуте (200 выдуманных поездок)', () => {
  let seed = 20261115;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const anchors = ['2026-12-30T00:00', '2027-01-07T00:00', '2026-02-21T00:00', '2026-03-07T00:00', '2026-04-29T00:00', '2026-05-08T00:00',
    '2026-06-11T00:00', '2026-11-02T00:00', '2026-10-30T00:00', '2028-02-27T00:00'];
  for (let i = 0; i < 200; i++) {
    const s = parseLocal(anchors[i % anchors.length]) + rnd(3 * 1440) * MIN;
    const e = s + (1 + rnd(30 * 60)) * MIN;
    const trip = T(fmtLocal(s), fmtLocal(e));
    const list = [[s, e]];
    if (i % 3 === 0) { // следование после поездки, иногда с перерывом, иногда внахлёст
      const ps = e + (rnd(180) - 60) * MIN;
      const pe = ps + (1 + rnd(8 * 60)) * MIN;
      trip.passenger = [P(fmtLocal(ps), fmtLocal(pe))];
      list.push([ps, pe]);
    }
    const st = tripStats(trip);
    let work = 0, night = 0, holiday = 0;
    const byMonth = {};
    const lo = Math.min(...list.map((x) => x[0]));
    const hi = Math.max(...list.map((x) => x[1]));
    for (let t = lo; t < hi; t += MIN) {
      if (!list.some(([a, b]) => t >= a && t < b)) continue;
      const k = fmtLocal(t);
      const hh = +k.slice(11, 13);
      work++;
      byMonth[k.slice(0, 7)] = (byMonth[k.slice(0, 7)] || 0) + 1;
      if (hh >= 22 || hh < 6) night++;
      if (isHoliday(k.slice(0, 10))) holiday++;
    }
    const label = `${trip.start} — ${trip.end}${trip.passenger ? ` + ${trip.passenger[0].start} — ${trip.passenger[0].end}` : ''}`;
    assert.equal(st.work, work, `часы: ${label}`);
    assert.equal(st.night, night, `ночные: ${label}`);
    assert.equal(st.holiday, holiday, `праздничные: ${label}`);
    for (const [mk, b] of Object.entries(st.byMonth)) assert.equal(b.work, byMonth[mk], `месяц ${mk}: ${label}`);
    // сумма по месяцам равна итогу
    const sum = (f) => Object.values(st.byMonth).reduce((a, b) => a + b[f], 0);
    assert.deepEqual([sum('work'), sum('night'), sum('holiday'), sum('pass'), sum('wait')], [st.work, st.night, st.holiday, st.pass, st.wait]);
    assert.ok(st.pass + st.wait <= st.work);
  }
});

// ---------- Производственный календарь ----------

test('2027 год по постановлению № 1187 от 17.09.2026: переносы 2.01 → 5.11, 3.01 → 31.12, 20.02 ↔ 22.02', () => {
  assert.equal(dayInfo('2027-11-05').kind, 'off');
  assert.equal(dayInfo('2027-12-31').kind, 'off');
  assert.equal(dayInfo('2027-02-22').kind, 'off');
  assert.deepEqual(dayInfo('2027-02-20'), { kind: 'short', hours: 7 }); // рабочая суббота, предпраздничная
  // праздники на выходных переносятся сами (ст. 112): 1 мая (сб) → 3 мая, 9 мая (вс) → 10 мая, 12 июня (сб) → 14 июня
  for (const k of ['2027-05-03', '2027-05-10', '2027-06-14']) assert.equal(dayInfo(k).kind, 'off', k);
  // предпраздничные дни (ст. 95)
  for (const k of ['2027-04-30', '2027-06-11', '2027-11-03']) assert.deepEqual(dayInfo(k), { kind: 'short', hours: 7 }, k);
  assert.equal(monthNorm(2027, 2, 5).hours, 151);
  assert.equal(yearInfo(2027, 5).hours, 1972);
  // рабочих дней в году: 247 по пятидневке, 299 по шестидневке (как в производственных календарях 2026 и 2027)
  for (const y of [2026, 2027]) {
    let d5 = 0, d6 = 0;
    for (let m = 1; m <= 12; m++) { d5 += monthNorm(y, m, 5).days; d6 += monthNorm(y, m, 6).days; }
    assert.deepEqual([d5, d6], [247, 299], `год ${y}`);
  }
});

test('шестидневка 2027 (листок депо): 22 февраля — рабочий предпраздничный, суббота 8 мая — 4 ч, 10 мая и 31 декабря — выходные', () => {
  assert.deepEqual(normDay('2027-02-20', 6), { kind: 'work', hours: 5 }); // обычная суббота: перенос субботы шестидневки не касается
  assert.deepEqual(normDay('2027-02-22', 6), { kind: 'short', hours: 6 });
  assert.deepEqual(normDay('2027-05-08', 6), { kind: 'short', hours: 4 });
  assert.equal(normDay('2027-05-10', 6).hours, 0);
  assert.equal(normDay('2027-12-31', 6).hours, 0);
  assert.deepEqual(normDay('2027-11-05', 6), { kind: 'work', hours: 7 }); // перенос с субботы 2 января — не для шестидневки
  // 1 мая и 12 июня 2027 — субботы: при шестидневке выходной не переносится
  assert.equal(normDay('2027-05-03', 6).hours, 7);
  assert.equal(normDay('2027-06-14', 6).hours, 7);
});

test('шестидневка (ст. 95): суббота не длиннее 5 ч, предпраздничный день на час короче, воскресенье и праздник — 0', () => {
  for (const y of [2026, 2027, 2028, 2030]) {
    for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += DAY) {
      const d = new Date(t);
      const k = d.toISOString().slice(0, 10);
      const n = normDay(k, 6);
      const wd = d.getUTCDay();
      if (wd === 0 || isHoliday(k)) assert.equal(n.hours, 0, k);
      else if (n.kind === 'off') assert.equal(n.hours, 0, k);
      else assert.equal(n.hours, (wd === 6 ? 5 : 7) - (n.kind === 'short' ? 1 : 0), k);
      // предпраздничный — только день прямо перед праздником
      if (n.kind === 'short') assert.ok(isHoliday(new Date(t + DAY).toISOString().slice(0, 10)), `${k}: завтра праздник`);
    }
  }
});

// ---------- Норма и отвлечения ----------

test('отвлечение через Новый год: часы делятся по месяцам, праздники и выходной 31 декабря — 0', () => {
  // шестидневка: 28–30 декабря по 7 ч, 31-е — выходной; 1–8 января — праздники, 9-е (сб) 5 ч, 11 и 12 — по 7 ч
  assert.deepEqual(autoAbsenceHours('2026-12-28', '2027-01-12'), { '2026-12': 24, '2027-01': 16 }); // пятидневка (неделя по умолчанию в тестах)
  let h12 = 0, h01 = 0;
  for (const d of [28, 29, 30, 31]) h12 += normDay(`2026-12-${d}`, 6).hours;
  for (let d = 1; d <= 12; d++) h01 += normDay(`2027-01-${String(d).padStart(2, '0')}`, 6).hours;
  assert.deepEqual([h12, h01], [21, 19]);
  assert.equal(absenceBreakdown('2026-12-30', '2027-01-02'), '8, выходной и праздники — 0');
});

test('отвлечение на весь месяц и дольше: норма не уходит в минус, переработка — всё отработанное', () => {
  const abs = [{ id: 'v', type: 'vacation', start: '2026-09-25', end: '2026-11-05' }];
  const s = monthSummary(2026, 10, [T('2026-10-31T20:00', '2026-11-01T04:00')], abs);
  assert.equal(s.norm, 0);
  assert.equal(s.work, 240);
  assert.equal(s.overtime, 240);
  assert.equal(s.pct, null);
});

test('переработка = отработано − норма с учётом отвлечений; ровно норма — переработки нет', () => {
  // ноябрь 2026: 159 ч, отпуск 2–6 ноября (8 + 7 + 0 + 8 + 8 = 31 ч по пятидневке) → норма 128 ч
  const abs = [{ id: 'v', type: 'vacation', start: '2026-11-02', end: '2026-11-06' }];
  const trips = [];
  for (let d = 9; d < 25; d++) trips.push(T(`2026-11-${String(d).padStart(2, '0')}T08:00`, `2026-11-${String(d).padStart(2, '0')}T16:00`)); // 16 × 8 = 128 ч
  const s = monthSummary(2026, 11, trips, abs);
  assert.equal(s.norm, 128);
  assert.equal(s.work, 128 * 60);
  assert.equal(s.overtime, 0);
  assert.equal(s.pct, 1);
  trips.push(T('2026-11-25T08:00', '2026-11-25T08:01'));
  assert.equal(monthSummary(2026, 11, trips, abs).overtime, 1);
});

test('норма на сегодня: дни отвлечения, начавшегося в прошлом месяце, не считаются', () => {
  // ноябрь 2026, пятидневка: 2-е (8), 3-е (7), 5 и 6 (16), 9–13 (40) = 71 ч к 15-му; больничный 28.10–03.11 убирает 15 ч
  assert.equal(normSoFar(2026, 11, '2026-11-15', [], null), 71);
  assert.equal(normSoFar(2026, 11, '2026-11-15', [{ start: '2026-10-28', end: '2026-11-03' }], null), 56);
  assert.equal(normSoFar(2026, 11, '2026-11-01', [], null), 0);
  assert.equal(normSoFar(2026, 11, '2026-12-01', [], null), null, 'другой месяц');
});

// ---------- Отдых в пункте оборота (приказ № 339, п. 45) ----------

test('отдых в пункте оборота: никогда не меньше половины рабочего времени и не меньше минимума', () => {
  for (let w = 1; w <= 16 * 60; w++) {
    const r = turnaroundRest(w, 0, 240).rest;
    assert.ok(r * 2 >= w, `половина: ${w} мин`);
    assert.ok(r >= 240, `минимум: ${w} мин`);
    assert.ok(r === 240 || r * 2 - w <= 1, `не больше половины с округлением до минуты: ${w} мин`);
  }
  assert.equal(turnaroundRest(481, 0, 240).rest, 241); // 8 ч 01 мин → 4 ч 01 мин (половина минуты — в пользу отдыха)
  assert.equal(turnaroundRest(300, 0, 180).rest, 180); // минимум по п. 45 — 3 ч
});

test('отдых в пункте оборота на главной: положенный → до 100 % → переотдых → через 48 ч ничего', () => {
  // поездка 8 ч (06:00–14:00): положенный отдых 4 ч до 18:00, 100 % — до 22:00, дальше переотдых
  S.trips = [T('2026-10-19T06:00', '2026-10-19T14:00', { restType: 'turnaround' })];
  const at = (k) => turnaroundNow(parseLocal(k));
  assert.deepEqual([at('2026-10-19T17:59').stage, at('2026-10-19T17:59').left], ['rest', 1]);
  assert.equal(at('2026-10-19T18:00').stage, 'full');
  assert.equal(fmtLocal(at('2026-10-19T18:00').until), '2026-10-19T22:00');
  assert.deepEqual([at('2026-10-19T22:00').stage, at('2026-10-19T22:00').over], ['over', 0]);
  assert.equal(at('2026-10-21T14:00').stage, 'over'); // ровно 48 ч после поездки
  assert.equal(at('2026-10-21T14:01'), null);
  // переотдых в заработке — с той же минуты (100 % рабочего времени), до явки на следующую поездку
  const next = T('2026-10-20T03:00', '2026-10-20T09:00', { restType: 'home' });
  const iv = overRestIntervals([S.trips[0], next], (t) => tripStats(t));
  assert.deepEqual(iv.map((x) => [fmtLocal(x.s), fmtLocal(x.e)]), [['2026-10-19T22:00', '2026-10-20T03:00']]);
});

test('переотдых: перерыв ровно 48 ч ещё считается, больше — нет; явка раньше 100 % — переотдыха нет', () => {
  const a = T('2026-10-14T08:00', '2026-10-14T14:00', { restType: 'turnaround' });
  const st = (t) => tripStats(t);
  assert.equal(overRestIntervals([a, T('2026-10-16T14:00', '2026-10-16T20:00')], st).length, 1);
  assert.equal(overRestIntervals([a, T('2026-10-16T14:01', '2026-10-16T20:00')], st).length, 0);
  assert.equal(overRestIntervals([a, T('2026-10-14T20:00', '2026-10-15T02:00')], st).length, 0); // отдых ровно 100 %
  assert.equal(overRestIntervals([{ ...a, restType: 'home' }, T('2026-10-15T08:00', '2026-10-15T14:00')], st).length, 0); // после домашнего отдыха
});

// ---------- Полный (междусменный) отдых (приказ № 339, п. 40 и 43) ----------

test('полный отдых: коэффициент 2,6 = (6 суток × 24 ч − 40 ч) / 40 ч; отдых в пункте оборота вычитается', () => {
  assert.equal((6 * 24 - 40) / 40, 2.6);
  const a = tripStats(T('2026-10-31T16:00', '2026-10-31T23:00')); // 7 ч
  const b = tripStats(T('2026-11-01T05:30', '2026-11-01T12:45')); // 7 ч 15 мин, отдых 6 ч 30 мин — через полночь месяца
  const r = homeRestMulti([a, b]);
  assert.equal(r.work, 855);
  assert.equal(r.gap, 390);
  assert.equal(r.full, 855 * 2.6 - 390); // 2223 − 390 = 1833 мин = 30 ч 33 мин
  assert.equal(fmtLocal(r.fullUntil), '2026-11-02T19:18');
  assert.equal(fmtLocal(r.withDayOffUntil), '2026-11-03T19:18'); // п. 40: выходной — +24 ч к расчётному отдыху
});

test('полный отдых: округление до минуты — не больше половины минуты в любую сторону', () => {
  for (let w = 1; w <= 24 * 60; w++) {
    const r = homeRestMulti([{ start: 0, end: w * MIN, work: w }]);
    assert.ok(Math.abs(r.full - w * 2.6) <= 0.5, `${w} мин`);
  }
});

test('полный отдых по правилу Никиты (10.11.2026): из нескольких отдыхов в пунктах оборота вычитается только первый', () => {
  // В п. 43 приказа № 339 сказано «за вычетом времени отдыха в пункте оборота» без уточнения, первого или всех.
  // Приложение считает по практике депо со слов Никиты. Вопрос про 3 и больше отдыхов — открыт.
  const a = tripStats(T('2026-12-30T08:00', '2026-12-30T14:00'));
  const b = tripStats(T('2026-12-30T20:00', '2026-12-31T01:00'));
  const c = tripStats(T('2026-12-31T08:00', '2026-12-31T14:00'));
  const d = tripStats(T('2026-12-31T21:00', '2027-01-01T03:00')); // через Новый год
  const r = homeRestMulti([d, b, a, c]);
  assert.deepEqual(r.gaps, [360, 420, 420]);
  assert.equal(r.gap, 360);
  assert.equal(r.kept, 840);
  assert.equal(r.full, Math.round(23 * 60 * 2.6 - 360));
  assert.equal(fmtLocal(r.fullUntil), '2027-01-03T08:48');
});

test('ВОПРОС НИКИТЕ: короткие поездки — полный отдых сейчас получается меньше 16 ч, а с выходным — меньше 42 ч', () => {
  // Приказ № 339, п. 43: «Междусменный отдых менее 16 часов … не допускается».
  // П. 40 и ст. 110 ТК РФ: еженедельный непрерывный отдых (выходной) — не менее 42 часов.
  // Сейчас приложение показывает расчёт как есть, без этих нижних границ. Тест закрепляет то, что есть сегодня;
  // если Никита решит показывать «не меньше 16 ч / 42 ч», ожидания здесь поменяются.
  const a = tripStats(T('2026-10-14T08:00', '2026-10-14T11:00'));
  const b = tripStats(T('2026-10-14T15:00', '2026-10-14T18:00'));
  const r = homeRestMulti([a, b]); // (3 + 3) × 2,6 − 4 = 11 ч 36 мин
  assert.equal(r.full, 696);
  assert.ok(r.full < 16 * 60);
  assert.equal(r.withDayOff, 696 + 1440); // 35 ч 36 мин
  assert.ok(r.withDayOff < 42 * 60);
  assert.equal(homeRestMulti([tripStats(T('2026-10-14T08:00', '2026-10-14T12:00'))]).full, 624); // одна поездка 4 ч → 10 ч 24 мин
});

test('полный отдых на главной: «с выходным» ровно на сутки дольше; после новой явки отдых прошлой поездки не показывается', () => {
  const a = T('2026-10-19T08:00', '2026-10-19T14:00', { restType: 'turnaround' });
  const b = T('2026-10-19T20:00', '2026-10-20T02:00', { restType: 'home', homeRest: { ids: [a.id, 'b'] }, homeChoice: 'full' });
  b.id = 'b';
  S.trips = [a, b];
  const full = chosenRest(b);
  assert.equal(fmtLocal(full.until), '2026-10-21T03:12');
  b.homeChoice = 'fullOff';
  assert.equal(chosenRest(b).until - full.until, DAY);
  // поездка, записанная сразу с окончанием и идущая сейчас, важнее отдыха
  S.trips.push(T('2026-10-20T10:00', '2026-10-20T18:00', { restType: 'home', homeChoice: 'queue' }));
  S.trips.forEach((t) => { t._stats = null; });
  assert.equal(currentRest(parseLocal('2026-10-20T12:00')), null);
  // а после неё действует её отдых: «на очередь» — 16 ч (п. 43: не менее 16 ч)
  const cur = currentRest(parseLocal('2026-10-20T19:00'));
  assert.equal(cur.kind, 'queue');
  assert.equal(fmtLocal(cur.until), '2026-10-21T10:00');
});

test('выходной через границу месяца и года; вызвали раньше — заканчивается с новой явкой', () => {
  const t = T('2026-12-30T22:00', '2026-12-31T06:00', { restType: 'home', homeChoice: 'dayOff' });
  S.trips = [t];
  let iv = dayOffIntervals();
  assert.deepEqual([fmtLocal(iv[0].s), fmtLocal(iv[0].e)], ['2026-12-31T06:00', '2027-01-02T18:00']); // 60 ч
  assert.ok((iv[0].e - iv[0].s) / HOUR >= 42, 'выходной депо не короче 42 ч (ст. 110 ТК РФ)');
  S.trips.push(T('2027-01-01T20:00', '2027-01-02T04:00', { restType: 'home', homeChoice: 'queue' }));
  iv = dayOffIntervals();
  assert.equal(fmtLocal(iv[0].e), '2027-01-01T20:00');
});
