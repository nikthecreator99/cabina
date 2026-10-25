// CABINA 2.5: явка заранее, вид движения (резерв), учёба, заработок по среднему, расшифровка часов отвлечения.
// Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats, parseLocal, validateTrip, absenceBreakdown, monthSummary, PENDING_MAX } from '../../js/calc.js';
import { payCfg, payMonth, tripPay, payTotal, hasRate, absDaysInMonth } from '../../js/pay.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], restType: 'turnaround', ...extra });
const line = (r, key) => r.lines.find((l) => l.key === key);
const NOW = parseLocal('2026-10-20T12:00');

test('явка заранее: не дальше чем через 3 суток, без окончания поездка не считается до явки', () => {
  assert.equal(PENDING_MAX, 3 * 24 * 60);
  assert.equal(validateTrip(T('a', '2026-10-23T12:00', ''), { live: true, now: NOW }), null, 'ровно 3 суток — можно');
  assert.match(validateTrip(T('a', '2026-10-23T12:01', ''), { live: true, now: NOW }), /не больше чем за 3 суток/);
  assert.equal(validateTrip(T('a', '2026-10-20T08:00', ''), { live: true, now: NOW }), null, 'обычная поездка «в пути»');
  // с окончанием будущая поездка проверяется как обычная (без ограничения по явке)
  assert.equal(validateTrip(T('a', '2026-10-25T08:00', '2026-10-25T16:00'), { now: NOW }), null);
  // до явки рабочего времени нет
  const pend = T('p', '2026-10-21T06:00', '');
  assert.equal(tripStats(pend, NOW).work, 0);
  const sum = monthSummary(2026, 10, [pend], [], (t) => tripStats(t, NOW));
  assert.equal(sum.work, 0);
});

test('резерв: отдельная строка «Следование резервом» по тарифу, база уменьшается на эти часы', () => {
  const cfg = payCfg({ assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } });
  const trips = [
    T('f', '2026-10-05T08:00', '2026-10-05T16:00'), // 8 ч грузовой
    T('r', '2026-10-06T08:00', '2026-10-06T11:00', { kind: 'reserve' }), // 3 ч резервом
    T('p', '2026-10-07T08:00', '2026-10-07T10:00', { kind: 'passenger' }), // 2 ч пассажирский — как грузовой
  ];
  const r = payMonth(2026, 10, trips, [], cfg, (t) => tripStats(t));
  assert.deepEqual({ amount: line(r, 'base').amount, hours: line(r, 'base').hours }, { amount: 3000, hours: 10 });
  assert.deepEqual({ amount: line(r, 'reserve').amount, hours: line(r, 'reserve').hours }, { amount: 900, hours: 3 });
  assert.equal(r.workPay, 3900, 'резерв входит в оплату работы');
  assert.equal(r.sum.work, 13 * 60, 'часы резерва — рабочие часы');
  // старые поездки без вида — грузовые, строки «резерв» нет
  const old = payMonth(2026, 10, [trips[0]], [], cfg, (t) => tripStats(t));
  assert.equal(line(old, 'reserve'), undefined);
  // ожидание следования в поездке резервом — по-прежнему своей строкой
  const rw = T('rw', '2026-10-08T10:00', '2026-10-08T12:00', { kind: 'reserve', waiting: [{ id: 'w', start: '2026-10-08T09:00', end: '2026-10-08T10:00' }] });
  const r2 = payMonth(2026, 10, [rw], [], cfg, (t) => tripStats(t));
  assert.equal(line(r2, 'reserve').hours, 2);
  assert.equal(line(r2, 'wait').hours, 1);
  assert.equal(line(r2, 'base'), undefined);
  // за одну поездку резервом заработок тот же, что и за грузовую
  const st = tripStats(trips[1]);
  assert.equal(tripPay(trips[1], st, cfg).gross, tripPay({ ...trips[1], kind: 'freight' }, st, cfg).gross);
});

test('учёба (сессия, 2.6): средний за час × часы дней учёбы по календарю, без премии и надбавок, с НДФЛ', () => {
  const abs = [
    { id: 'u', type: 'study', start: '2026-10-26', end: '2026-11-04' }, // 6 дней в октябре, 4 в ноябре
    { id: 's', type: 'sick', start: '2026-10-01', end: '2026-10-02' },
  ];
  assert.equal(absDaysInMonth(abs, 2026, 10, 'study'), 6);
  assert.equal(absDaysInMonth(abs, 2026, 11, 'study'), 4);
  assert.equal(absDaysInMonth(abs, 2026, 10, 'sick'), 2);
  assert.equal(absDaysInMonth(abs, 2026, 9, 'study'), 0);
  // режим «по тарифу»: учёба всё равно по среднему за час; старое поле «средний за день» больше не используется
  const cfg = payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 12, rk: 20, avgHour: 500, studyDay: 4000 } });
  const r = payMonth(2026, 10, [], [abs[0]], cfg, () => ({}));
  assert.deepEqual({ amount: line(r, 'study').amount, hours: line(r, 'study').hours }, { amount: 20000, hours: 40 }, '26–30 октября — 5 рабочих дней по 8 ч');
  assert.equal(r.lines.length, 1, 'премия и районный на учёбу не начисляются');
  assert.equal(r.gross, 20000);
  assert.equal(r.ndfl, 2600);
  // учёба уменьшает норму месяца на те же часы
  const sum = monthSummary(2026, 10, [], [abs[0]]);
  assert.equal(sum.normMin, (176 - 40) * 60, '31-е — суббота');
  assert.equal(sum.absByType.study, 40);
  // без среднего за час строки нет
  const r0 = payMonth(2026, 10, [], [abs[0]], payCfg({ main: { rates: [{ from: null, rate: 300 }], studyDay: 4000 } }), () => ({}));
  assert.equal(line(r0, 'study'), undefined);
  assert.equal(r0.studyDays, 6);
  // ноябрь: 2-е — 8 ч, 3-е предпраздничное — 7 ч, 1-е воскресенье и 4-е праздник — 0
  const r2 = payMonth(2026, 11, [], abs, cfg, () => ({}));
  assert.equal(line(r2, 'study').hours, 15);
  assert.equal(payTotal([r, r2]).lines.find((l) => l.key === 'study').hours, 55);
  // учёба, вписанная вручную по месяцам, оплачивается по вписанным часам
  const manual = payMonth(2026, 10, [], [{ ...abs[0], auto: false, monthHours: { '2026-10': 24, '2026-11': 8 } }], cfg, () => ({}));
  assert.equal(line(manual, 'study').amount, 12000);
});

test('по среднему за час: все часы × средний, без доплат, премии и коэффициентов; больничный и учёба как обычно', () => {
  const sets = { assistant: { mode: 'avg', avgHour: 600, rates: [{ from: null, rate: 300 }], bonus: 12, rk: 20, night: 40, harm: 4, sickDay: 2000, studyDay: 3000 } };
  const cfg = payCfg(sets);
  assert.equal(cfg.mode, 'avg');
  assert.equal(payCfg({ assistant: { mode: 'что-то' } }).mode, 'tariff', 'неизвестный режим — по тарифу');
  assert.equal(hasRate(payCfg({ assistant: { mode: 'avg', rates: [{ from: null, rate: 300 }] } })), false, 'по среднему нужен средний за час');
  const trips = [
    T('n', '2026-10-05T20:00', '2026-10-06T04:00'), // 8 ч, из них 6 ночных
    T('r', '2026-10-10T08:00', '2026-10-10T10:00', { kind: 'reserve' }), // 2 ч резервом, суббота
  ];
  const abs = [{ id: 's', type: 'sick', start: '2026-10-12', end: '2026-10-12' }, { id: 'u', type: 'study', start: '2026-10-13', end: '2026-10-13' }];
  const r = payMonth(2026, 10, trips, abs, cfg, (t) => tripStats(t));
  assert.deepEqual(r.lines.map((l) => l.key), ['avg', 'sick', 'study']);
  assert.deepEqual({ amount: line(r, 'avg').amount, hours: line(r, 'avg').hours }, { amount: 6000, hours: 10 });
  assert.equal(line(r, 'study').amount, 8 * 600, 'учёба: 8 ч по календарю × средний за час');
  assert.equal(r.gross, 6000 + 2000 + 4800);
  assert.equal(r.ndfl, 1664);
  assert.equal(r.rate, 0);
  // заработок за поездку тоже по среднему
  assert.equal(tripPay(trips[0], tripStats(trips[0]), cfg).gross, 4800);
  // переключение обратно не теряет ставки
  const back = payMonth(2026, 10, trips, [], payCfg({ assistant: { ...sets.assistant, mode: 'tariff' } }), (t) => tripStats(t));
  assert.ok(line(back, 'base') && line(back, 'night') && line(back, 'bonus'));
});

test('отвлечение: расшифровка «Из нормы вычтется» по дням календаря', () => {
  assert.equal(absenceBreakdown('2026-10-30', '2026-11-05'), '8 + 8 + 7 + 8, выходные и праздник — 0');
  assert.equal(absenceBreakdown('2026-10-01', '2026-10-28'), '20 × 8, выходные — 0');
  assert.equal(absenceBreakdown('2026-10-05', '2026-10-05'), '8');
  assert.equal(absenceBreakdown('2026-10-03', '2026-10-03'), 'выходной — 0');
  assert.equal(absenceBreakdown('2026-11-04', '2026-11-04'), 'праздник — 0');
  assert.equal(absenceBreakdown('2026-10-24', '2026-10-25'), 'выходные — 0');
});
