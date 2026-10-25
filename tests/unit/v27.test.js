// CABINA 2.7: следование пассажиром отдельной строкой, тяжёлый и длинносоставный поезд, строки по среднему.
// Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats, monthSummary } from '../../js/calc.js';
import { payCfg, payMonth, tripPay, isHeavy, PAY_FIELDS } from '../../js/pay.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], restType: 'turnaround', routeId: 'r1', ...extra });
const line = (r, key) => r.lines.find((l) => l.key === key);
const st = (t) => tripStats(t);
const NORMS = { r1: { weight: 5199, length: 59 } };
const cfgOf = (fields = {}, norms = NORMS) => ({ ...payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0, ...fields } }), norms });

test('следование пассажиром: минуты вне самой поездки, по месяцам', () => {
  const t = T('a', '2026-10-31T20:00', '2026-10-31T23:00', {
    passenger: [{ id: 'p', start: '2026-10-31T23:30', end: '2026-11-01T01:30' }],
    waiting: [{ id: 'w', start: '2026-10-31T23:00', end: '2026-10-31T23:30' }],
  });
  const s = tripStats(t);
  assert.equal(s.work, 330);
  assert.equal(s.wait, 30);
  assert.equal(s.pass, 120);
  assert.equal(s.byMonth['2026-10'].pass, 30);
  assert.equal(s.byMonth['2026-11'].pass, 90);
  // следование, совпавшее с поездкой, не считается дважды
  const o = tripStats(T('o', '2026-10-14T08:00', '2026-10-14T12:00', { passenger: [{ id: 'p', start: '2026-10-14T11:00', end: '2026-10-14T13:00' }] }));
  assert.equal(o.work, 300);
  assert.equal(o.pass, 60);
  assert.equal(monthSummary(2026, 10, [t], []).pass, 30);
});

test('квиток: работа, следование пассажиром, ожидание и резерв — отдельные строки, сумма часов = отработано', () => {
  const trips = [
    T('a', '2026-10-14T08:00', '2026-10-14T12:00', {
      passenger: [{ id: 'p', start: '2026-10-14T14:30', end: '2026-10-14T16:00' }],
      waiting: [{ id: 'w', start: '2026-10-14T12:00', end: '2026-10-14T14:30' }],
    }),
    T('r', '2026-10-15T08:00', '2026-10-15T10:00', { kind: 'reserve', passenger: [{ id: 'p2', start: '2026-10-15T10:00', end: '2026-10-15T11:00' }] }),
  ];
  const r = payMonth(2026, 10, trips, [], cfgOf(), st);
  const hours = (k) => line(r, k)?.hours;
  assert.deepEqual([hours('base'), hours('pass'), hours('wait'), hours('reserve')], [4, 2.5, 2.5, 2]);
  assert.equal(hours('base') + hours('pass') + hours('wait') + hours('reserve'), r.sum.work / 60);
  assert.equal(line(r, 'pass').label, 'Следование пассажиром');
  assert.equal(line(r, 'pass').amount, 750);
  assert.equal(r.gross, 11 * 300);
});

test('тяжёлый поезд: вес больше нормы маршрута — +15% ставки за часы на локомотиве', () => {
  assert.equal(PAY_FIELDS.find((f) => f.k === 'heavy').def, 15);
  const cfg = cfgOf();
  assert.equal(cfg.heavy, 15);
  assert.equal(isHeavy(T('a', '', '', { weight: 5200 }), cfg), true, '5200 т при норме 5199 — тяжёлый');
  assert.equal(isHeavy(T('a', '', '', { weight: 5199 }), cfg), false, 'ровно норма — не тяжёлый');
  assert.equal(isHeavy(T('a', '', '', { length: 60 }), cfg), true, '60 усл. ваг. при норме 59 — длинносоставный');
  assert.equal(isHeavy(T('a', '', '', { length: 59 }), cfg), false);
  assert.equal(isHeavy(T('a', '', ''), cfg), false, 'вес не указан — доплаты нет');
  assert.equal(isHeavy(T('a', '', '', { weight: 9000, routeId: 'other' }), cfg), false, 'у маршрута нет норм');
  assert.equal(isHeavy(T('a', '', '', { weight: 9000, routeId: null }), cfg), false, 'маршрут не выбран');
  assert.equal(isHeavy(T('a', '', '', { weight: 9000, kind: 'reserve' }), cfg), false, 'резерв — без поезда');
  assert.equal(isHeavy(T('a', '', '', { weight: 9000, kind: 'shunt' }), cfg), false, 'манёврам не положено');
  assert.equal(isHeavy(T('a', '', '', { weight: 9000 }), cfgOf({}, { r1: { length: 59 } })), false, 'норма веса не задана');
  // тяжёлый и длинный одновременно — одна доплата
  const both = T('h', '2026-10-14T08:00', '2026-10-14T18:00', {
    weight: 6000, length: 71,
    passenger: [{ id: 'p', start: '2026-10-14T18:00', end: '2026-10-14T20:00' }],
    waiting: [{ id: 'w', start: '2026-10-14T07:00', end: '2026-10-14T08:00' }],
  });
  const r = payMonth(2026, 10, [both], [], cfg, st);
  const h = line(r, 'heavy');
  assert.deepEqual({ hours: h.hours, pct: h.pct, amount: h.amount, label: h.label }, { hours: 10, pct: 15, amount: 450, label: 'Тяжёлые и длинносоставные поезда' });
  // премия и районный начисляются и на эту доплату
  const rb = payMonth(2026, 10, [both], [], cfgOf({ bonus: 10, rk: 20 }), st);
  assert.equal(line(rb, 'bonus').amount, Math.round((13 * 300 + 450) * 0.1 * 100) / 100);
  // за поездку — тоже
  assert.equal(tripPay(both, st(both), cfg).gross, 13 * 300 + 450);
  // свой процент
  assert.equal(line(payMonth(2026, 10, [both], [], cfgOf({ heavy: 10 }), st), 'heavy').amount, 300);
  // без норм в маршрутах строки нет
  assert.equal(line(payMonth(2026, 10, [both], [], cfgOf({}, {}), st), 'heavy'), undefined);
});

test('по среднему: следование пассажиром и ожидание — тоже отдельными строками', () => {
  const cfg = cfgOf({ mode: 'avg', avgHour: 600 });
  const t = T('a', '2026-10-14T08:00', '2026-10-14T12:00', {
    weight: 6000,
    passenger: [{ id: 'p', start: '2026-10-14T14:30', end: '2026-10-14T16:00' }],
    waiting: [{ id: 'w', start: '2026-10-14T12:00', end: '2026-10-14T14:30' }],
  });
  const r = payMonth(2026, 10, [t], [], cfg, st);
  assert.deepEqual(r.lines.map((l) => [l.key, l.hours, l.amount]), [['avg', 4, 2400], ['pass', 1.5, 900], ['wait', 2.5, 1500]]);
  assert.equal(r.gross, 8 * 600, 'по среднему без доплаты за тяжёлый поезд — она внутри среднего');
});
