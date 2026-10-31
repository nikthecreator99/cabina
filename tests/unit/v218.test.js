// CABINA 2.18: тестовый режим «оплата по сменам» — норма дня явки по производственному календарю,
// сверх неё первые 2 ч ×1,5, дальше ×2; месячная переработка не считается. Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats } from '../../js/calc.js';
import { payCfg, payMonth, tripPay, payTotal, shiftOver } from '../../js/pay.js';

const T = (id, start, end) => ({ id, start, end, passenger: [], restType: 'turnaround' });
const st = (t) => tripStats(t);
const cfgOf = (fields = {}) => payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0, ...fields } });
const line = (r, key) => r.lines.find((l) => l.key === key);

test('норма смены — часы дня явки: будний 8 ч, предпраздничный 7 ч, выходной 0, праздник — без двойного счёта', () => {
  // будний день, 11 ч: 8 по тарифу, 2 ×1,5, 1 ×2
  assert.deepEqual(shiftOver(st(T('a', '2026-10-14T06:00', '2026-10-14T17:00'))), { norm: 480, first: 120, rest: 60 });
  // пример Никиты: норма 7 ч, привезли 10 — 8-й и 9-й час ×1,5, десятый ×2
  assert.deepEqual(shiftOver(st(T('b', '2026-11-03T06:00', '2026-11-03T16:00'))), { norm: 420, first: 120, rest: 60 });
  // меньше нормы — ничего сверх
  assert.deepEqual(shiftOver(st(T('c', '2026-10-14T06:00', '2026-10-14T13:30'))), { norm: 480, first: 0, rest: 0 });
  // выходной: норма 0
  assert.deepEqual(shiftOver(st(T('d', '2026-10-17T08:00', '2026-10-17T13:00'))), { norm: 0, first: 120, rest: 180 });
  // праздничные часы уже вдвойне строкой «Праздничные» — сверх нормы их не добавляем
  assert.deepEqual(shiftOver(st(T('e', '2026-11-04T06:00', '2026-11-04T16:00'))), { norm: 0, first: 0, rest: 0 });
  // поездка через полночь — норма дня явки
  assert.deepEqual(shiftOver(st(T('f', '2026-10-14T20:00', '2026-10-15T07:00'))), { norm: 480, first: 120, rest: 60 });
});

test('месяц в тестовом режиме: строки «сверх нормы смены», месячной переработки нет, премия и коэффициенты сверху', () => {
  // 20 смен по 11 ч в будни октября: 220 ч при норме 176 — обычно это переработка 44 ч
  const days = ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14', '15', '16', '19', '20', '21', '22', '23', '26', '27', '28'];
  const trips = days.map((d) => T(`t${d}`, `2026-10-${d}T06:00`, `2026-10-${d}T17:00`));
  const usual = payMonth(2026, 10, trips, [], cfgOf(), st);
  assert.ok(line(usual, 'overOther'), 'обычный режим — месячная переработка');
  assert.equal(line(usual, 'shift1'), undefined);

  const r = payMonth(2026, 10, trips, [], cfgOf({ shiftTest: true }), st);
  assert.equal(r.shiftTest, true);
  assert.equal(line(r, 'overOther'), undefined, 'месячной переработки нет');
  assert.equal(line(r, 'overWeekend'), undefined);
  const s1 = line(r, 'shift1');
  const s2 = line(r, 'shift2');
  assert.deepEqual([s1.hours, s1.pct, s1.amount], [40, 50, 40 * 300 * 0.5]);
  assert.deepEqual([s2.hours, s2.pct, s2.amount], [20, 100, 20 * 300]);
  assert.equal(line(r, 'base').amount, 220 * 300, 'все часы по тарифу — как обычно');
  assert.equal(r.workPay, 220 * 300 + 6000 + 6000);

  // премия и районные — на заработок вместе со сверхурочными
  const b = payMonth(2026, 10, trips, [], cfgOf({ shiftTest: true, bonus: 10, rk: 20 }), st);
  assert.equal(line(b, 'bonus').amount, Math.round(r.workPay * 0.1 * 100) / 100);
  assert.equal(b.gross, Math.round(r.workPay * 1.1 * 1.2 * 100) / 100);
  // итог за несколько месяцев помнит, что это тест
  assert.equal(payTotal([r]).shiftTest, true);
  assert.equal(payTotal([usual]).shiftTest, false);
});

test('поездка в тестовом режиме: заработок с её сверхурочными; по среднему режим не действует', () => {
  const t = T('a', '2026-10-14T06:00', '2026-10-14T17:00');
  const plain = tripPay(t, st(t), cfgOf());
  const test1 = tripPay(t, st(t), cfgOf({ shiftTest: true }));
  assert.equal(Math.round((test1.gross - plain.gross) * 100) / 100, 2 * 300 * 0.5 + 300);
  const avg = payCfg({ main: { mode: 'avg', avgHour: 500, shiftTest: true } });
  assert.equal(avg.shiftTest, false);
  assert.equal(line(payMonth(2026, 10, [t], [], avg, st), 'shift1'), undefined);
  // переключатель хранится только как true; всё прочее — выключено
  assert.equal(payCfg({ main: { rates: [{ rate: 300 }], shiftTest: 'yes' } }).shiftTest, false);
});
