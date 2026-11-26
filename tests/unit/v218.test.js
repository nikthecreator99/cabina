// CABINA 2.18 (правило с 10.11.2026): тестовый режим «оплата по сменам» — переработка месяца,
// первые 1,5 ч на каждую явку ×1,5, остальное ×2. Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats } from '../../js/calc.js';
import { homeShiftHistory } from '../../js/store.js';
import { payCfg, payMonth as calculateMonth, tripPay, payTotal, shiftSplit } from '../../js/pay.js';

const T = (id, start, end) => ({ id, start, end, passenger: [], routeLabel: 'Депо → Депо', restType: 'home' });
function payMonth(y, m, trips, absences, cfg, statsOf) {
  const homeShifts = homeShiftHistory(trips, Infinity);
  return calculateMonth(y, m, trips, absences, { ...cfg, homeShifts }, statsOf);
}
const st = (t) => tripStats(t);
const cfgOf = (fields = {}) => payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0, ...fields } });
const line = (r, key) => r.lines.find((l) => l.key === key);

test('переработка по сменам: первые 1,5 ч на каждую явку, остальное — дальше', () => {
  // пример Никиты: 10 явок — 15 ч ×1,5, остальное ×2
  assert.deepEqual(shiftSplit(30 * 60, 10), { shifts: 10, first: 15 * 60, rest: 15 * 60 });
  // переработки меньше, чем 1,5 ч на явку, — вся ×1,5
  assert.deepEqual(shiftSplit(30 * 60, 21), { shifts: 21, first: 30 * 60, rest: 0 });
  assert.deepEqual(shiftSplit(0, 21), { shifts: 21, first: 0, rest: 0 });
  // смен нет — всё дальше (так не бывает: переработка без поездок; но расчёт не ломается)
  assert.deepEqual(shiftSplit(120, 0), { shifts: 0, first: 0, rest: 120 });
  assert.deepEqual(shiftSplit(-5, 3), { shifts: 3, first: 0, rest: 0 });
});

test('месяц в тестовом режиме: переработка месяца — 1,5 ч на явку ×1,5, остальное ×2; премия и коэффициенты сверху', () => {
  // 20 смен по 11 ч в будни октября: 220 ч при норме 176 — переработка 44 ч
  const days = ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14', '15', '16', '19', '20', '21', '22', '23', '26', '27', '28'];
  const trips = days.map((d) => T(`t${d}`, `2026-10-${d}T06:00`, `2026-10-${d}T17:00`));
  const usual = payMonth(2026, 10, trips, [], cfgOf(), st);
  assert.deepEqual([line(usual, 'overOther').hours, line(usual, 'overOther').pct], [2, 50], 'обычный режим — первые 2 ч ×1,5');
  assert.deepEqual([line(usual, 'overOther2').hours, line(usual, 'overOther2').pct], [42, 100], 'остальное ×2');
  assert.equal(line(usual, 'shift1'), undefined);

  const r = payMonth(2026, 10, trips, [], cfgOf({ shiftTest: true }), st);
  assert.equal(r.shiftTest, true);
  assert.equal(line(r, 'overOther'), undefined, 'обычной строки переработки нет');
  assert.equal(line(r, 'overOther2'), undefined);
  assert.equal(line(r, 'overWeekend'), undefined);
  const s1 = line(r, 'shift1');
  const s2 = line(r, 'shift2');
  assert.deepEqual([s1.label, s1.hours, s1.pct, s1.amount], ['Переработка, до 1,5 ч на явку', 30, 50, 30 * 300 * 0.5]);
  assert.deepEqual([s2.label, s2.hours, s2.pct, s2.amount], ['Переработка сверх 1,5 ч на явку', 14, 100, 14 * 300]);
  assert.equal(line(r, 'base').amount, 220 * 300, 'все часы по тарифу — как обычно');
  assert.equal(r.workPay, 220 * 300 + 4500 + 4200);

  // переработки нет — и строк нет
  const short = payMonth(2026, 10, trips.slice(0, 5), [], cfgOf({ shiftTest: true }), st);
  assert.equal(line(short, 'shift1'), undefined);
  assert.equal(line(short, 'shift2'), undefined);

  // премия и районные — на заработок вместе со сверхурочными
  const b = payMonth(2026, 10, trips, [], cfgOf({ shiftTest: true, bonus: 10, rk: 20 }), st);
  assert.equal(line(b, 'bonus').amount, Math.round(r.workPay * 0.1 * 100) / 100);
  assert.equal(b.gross, Math.round(r.workPay * 1.1 * 1.2 * 100) / 100);
  // итог за несколько месяцев помнит, что это тест
  assert.equal(payTotal([r]).shiftTest, true);
  assert.equal(payTotal([usual]).shiftTest, false);
});

test('тестовый режим: смена считается в месяце явки; праздничные часы второй раз не доплачиваются', () => {
  // 16 смен по 13 ч в будни ноября, одна из них — с явкой 31.10 (в октябре), она в ноябре сменой не считается
  const nov = ['02', '05', '06', '09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23', '24'];
  const trips = nov.map((d) => T(`n${d}`, `2026-11-${d}T06:00`, `2026-11-${d}T19:00`));
  trips.push(T('oct', '2026-10-31T20:00', '2026-11-01T09:00'));
  const r = payMonth(2026, 11, trips, [], cfgOf({ shiftTest: true }), st);
  const sum = r.sum;
  const over = sum.overtime - Math.min(sum.overtime, sum.holiday);
  const first = Math.min(over, 15 * 90);
  assert.equal(line(r, 'shift1').hours, Math.round(first) / 60, '15 явок × 1,5 ч');
  assert.equal(line(r, 'shift2')?.hours || 0, Math.round(over - first) / 60);
  // праздник 4 ноября: часы праздника уже вдвойне, из переработки вычитаются
  const h = [...trips, T('hol', '2026-11-04T06:00', '2026-11-04T16:00')];
  const rh = payMonth(2026, 11, h, [], cfgOf({ shiftTest: true }), st);
  const hover = rh.sum.overtime - Math.min(rh.sum.overtime, rh.sum.holiday);
  assert.equal(rh.sum.holiday, 600, 'праздник — 10 ч');
  assert.ok(hover < rh.sum.overtime, 'праздничные часы из переработки вычтены');
  assert.equal(Math.round((line(rh, 'shift1').hours + (line(rh, 'shift2')?.hours || 0)) * 60), Math.round(hover));
  assert.equal(line(rh, 'holiday').amount, 10 * 300, 'праздничные — своей строкой, как обычно');
});

test('поездка в тестовом режиме: заработок как обычно (переработка — за месяц); по среднему режим не действует', () => {
  const t = T('a', '2026-10-14T06:00', '2026-10-14T17:00');
  const plain = tripPay(t, st(t), cfgOf());
  const test1 = tripPay(t, st(t), cfgOf({ shiftTest: true }));
  assert.equal(test1.gross, plain.gross);
  const avg = payCfg({ main: { mode: 'avg', avgHour: 500, shiftTest: true } });
  assert.equal(avg.shiftTest, false);
  assert.equal(line(payMonth(2026, 10, [t], [], avg, st), 'shift1'), undefined);
  // переключатель хранится только как true; всё прочее — выключено
  assert.equal(payCfg({ main: { rates: [{ rate: 300 }], shiftTest: 'yes' } }).shiftTest, false);
});

test('дом подтверждается тремя домашними отдыхами, отнесение к месяцу — по первой явке', () => {
  const trip = (date, from, to, restType, ext = {}) => ({
    start: date + 'T06:00', end: date + 'T17:00', routeLabel: from + ' → ' + to, restType, ...ext
  });
  const list = [
    trip('2026-09-30', 'Депо', 'ПО', 'turnaround'),
    trip('2026-10-01', 'ПО', 'ПО', 'turnaround', { kind: 'shunt' }),
    trip('2026-10-02', 'ПО', 'Депо', 'home'),
    trip('2026-10-03', 'Депо', 'ПО', 'turnaround'),
    trip('2026-10-04', 'ПО', ' депо ', 'home'),
    trip('2026-10-05', 'Депо', 'ПО', 'home', { legs: [{ routeLabel: 'ПО → Депо' }] }),
  ];
  assert.equal(homeShiftHistory(list.slice(0, -1), Infinity).home, '');
  const history = homeShiftHistory([...list].reverse(), Infinity);
  assert.equal(history.home, 'Депо');
  assert.deepEqual(history.months, {
    '2026-09': { count: 1, missingRoute: false },
    '2026-10': { count: 2, missingRoute: false }
  });
  const cutoff = Date.parse('2026-10-05T12:00Z');
  assert.equal(homeShiftHistory(list, cutoff).home, '');
  const other = trip('2026-10-06', 'Депо', 'Другое', 'home');
  assert.equal(homeShiftHistory([...list.slice(0, -1), other, trip('2026-10-07', 'ПО', 'Депо', 'home')], Infinity).home, '');
  const changed = [...list, ...['06', '07', '08'].map(d => trip('2026-10-' + d, 'Новое', 'Новое', 'home'))];
  assert.equal(homeShiftHistory(changed, Infinity).home, 'Новое');
  assert.equal(homeShiftHistory(changed, Infinity).months['2026-10'].count, 5);
  changed[list.length] = trip('2026-10-06', 'Депо', 'Новое', 'home');
  assert.equal(homeShiftHistory(changed, Infinity).months['2026-10'].count, 5);
});

test('до подтверждения депо месячная переработка остаётся по обычной схеме', () => {
  const trips = Array.from({ length: 20 }, (_, i) => ({
    ...T('t' + i, `2026-10-${String(i + 1).padStart(2, '0')}T06:00`, `2026-10-${String(i + 1).padStart(2, '0')}T18:00`),
    restType: 'turnaround'
  }));
  const plain = payMonth(2026, 10, trips, [], cfgOf(), st);
  const pending = payMonth(2026, 10, trips, [], cfgOf({ shiftTest: true }), st);
  assert.ok(plain.sum.overtime > 0);
  assert.equal(pending.shiftPending, true);
  assert.equal(pending.net, plain.net);
});
