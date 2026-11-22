import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthSummary, finishedMonthShortfall, tripStats } from '../../js/calc.js';
import { sectionPct, sectionMinutes, tripPay, payMonth, payTotal } from '../../js/pay.js';
import { S, myPay } from '../../js/store.js';

test('151: границы всех пяти ставок и неизвестная длина', () => {
  for (const [km, pct] of [[null, null], [NaN, null], [0, null], [200, 0], [250, 0], [250.1, 10], [349.9, 10],
    [350, 20], [449.9, 20], [450, 30], [499.9, 30], [500, 35], [999.9, 35], [1000, 50], [1500, 50]]) {
    assert.equal(sectionPct(km), pct, String(km));
  }
});

test('151: ставка каждого участка применяется к его часам на локомотиве и попадает в свой месяц', () => {
  S.routes = [{ id: 'ab', distanceKm: 350, from: 'А', to: 'Б', stations: ['В'] }, { id: 'bc', distanceKm: 500 }];
  S.settings.pay = { main: { rates: [{ rate: 200 }], harm: 0, night: 0, bonus: 0 } };
  const cfg = myPay();
  const t = { id: 'test', kind: 'freight', routeId: 'ab', stFrom: 'А', stTo: 'В', start: '2026-08-31T21:00', end: '2026-09-01T04:00',
    legs: [{ id: 'leg', routeId: 'bc', start: '2026-09-01T01:00' }],
    passenger: [{ start: '2026-08-31T22:00', end: '2026-08-31T23:00' }],
    waiting: [{ start: '2026-09-01T02:00', end: '2026-09-01T03:00' }] };
  assert.deepEqual([...sectionMinutes(t, tripStats(t), cfg)], [[20, 180], [35, 120]]);
  const aug = payMonth(2026, 8, [t], [], cfg, tripStats);
  const sep = payMonth(2026, 9, [t], [], cfg, tripStats);
  const bands = (r) => r.lines.filter((l) => l.key.startsWith('section')).map((l) => [l.pct, l.hours, l.amount]);
  assert.deepEqual(bands(aug), [[20, 2, 80]]);
  assert.deepEqual(bands(sep), [[20, 1, 40], [35, 2, 140]]);
  assert.deepEqual(bands(payTotal([aug, sep])), [[20, 3, 120], [35, 2, 140]]);
  const unknown = { ...cfg, norms: {} };
  assert.deepEqual([...sectionMinutes(t, tripStats(t), unknown)], [[null, 300]]);
  assert.equal(tripPay(t, tripStats(t), cfg).gross - tripPay(t, tripStats(t), unknown).gross, 260);
  assert.deepEqual(bands(payMonth(2026, 9, [t], [], { ...cfg, mode: 'avg', avgHour: 300 }, tripStats)), []);
});

test('151: два плеча короткого участка не образуют длинный участок', () => {
  const cfg = { norms: { there: { distanceKm: 200 }, back: { distanceKm: 200 } } };
  const trip = { start: '2026-06-10T12:00', end: '2026-06-10T16:00', routeId: 'there', passenger: [],
    legs: [{ id: 'later', start: '2026-06-10T14:00', routeId: 'back' }] };
  assert.deepEqual([...sectionMinutes(trip, tripStats(trip), cfg)], [[0, 240]]);
  assert.deepEqual([...sectionMinutes({ ...trip, legs: [] }, tripStats({ ...trip, legs: [] }), cfg)], [[0, 240]]);
});

test('недоработка появляется на границе месяца и использует норму с учётом отвлечений', () => {
  const trip = { start: '2026-11-12T10:00', end: '2026-11-12T18:00' };
  const abs = { type: 'sick', start: '2026-11-16', end: '2026-11-17', auto: true };
  const sum = monthSummary(2026, 11, [trip], [abs]);
  assert.equal(finishedMonthShortfall(sum, '2026-10'), 0);
  assert.equal(finishedMonthShortfall(sum, '2026-11'), 0);
  assert.equal(finishedMonthShortfall(sum, '2026-12'), (sum.base - sum.absTotal - 8) * 60);
  assert.equal(finishedMonthShortfall(monthSummary(2026, 10, [], []), '2026-11'), 0);
  assert.equal(finishedMonthShortfall({ ...sum, work: sum.normMin + 60 }, '2026-12'), 0);
});
