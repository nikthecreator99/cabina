// Ориентировочный расчёт заработка: ставки, надбавки, переработка, отдых сверх нормы, НДФЛ.
// Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats, parseLocal } from '../../js/calc.js';
import { payCfg, rateOn, payMonth, tripPay, payTotal, overRestIntervals, fmtRub, hasRate } from '../../js/pay.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], restType: 'turnaround', ...extra });
const st = (t) => tripStats(t);
const cfgOf = (fields, role = 'assistant') => payCfg({ [role]: { rates: [{ from: null, rate: 300 }], ...fields } }, role);
const line = (r, key) => r.lines.find((l) => l.key === key);

test('набор ставок: значения по умолчанию, пустое поле = 0, класс только у машиниста', () => {
  const d = payCfg({}, 'assistant');
  assert.equal(d.bonus, 12);
  assert.equal(d.night, 40);
  assert.equal(d.harm, 4);
  assert.equal(d.rk, 0);
  assert.equal(hasRate(d), false);
  assert.equal(payCfg({ assistant: { bonus: '' } }).bonus, 0);
  assert.equal(payCfg({ assistant: { bonus: '9,5' } }).bonus, 9.5);
  assert.equal(payCfg({ driver: { klass: 10 } }, 'driver').klass, 10);
  assert.equal(payCfg({ assistant: { klass: 10 } }, 'assistant').klass, 0);
});

test('история ставки: новая действует с указанного числа, первая — и для более ранних дат', () => {
  const cfg = { rates: [{ from: '2026-10-15', rate: 300 }, { from: null, rate: 280 }] };
  assert.equal(rateOn(cfg, '2026-09-01'), 280);
  assert.equal(rateOn(cfg, '2026-10-14'), 280);
  assert.equal(rateOn(cfg, '2026-10-15'), 300);
  assert.equal(rateOn({ rates: [{ from: '2026-06-01', rate: 250 }] }, '2026-01-01'), 250);
  assert.equal(rateOn({ rates: [] }, '2026-01-01'), 0);
});

test('месяц: тариф, вредность, премия, районный и северный, НДФЛ в целых рублях', () => {
  const trips = [T('a', '2026-10-14T08:00', '2026-10-14T16:00')];
  const r = payMonth(2026, 10, trips, [], cfgOf({ bonus: 10, rk: 20, sn: 50 }), st);
  assert.equal(line(r, 'base').amount, 2400);
  assert.equal(line(r, 'harm').amount, 96);
  assert.equal(line(r, 'night'), undefined, 'нулевые строки не показываются');
  assert.equal(line(r, 'bonus').amount, 249.6);
  assert.equal(line(r, 'rk').amount, 549.12);
  assert.equal(line(r, 'sn').amount, 1372.8);
  assert.equal(r.gross, 4667.52);
  assert.equal(r.ndfl, 607);
  assert.equal(r.net, 4060.52);
});

test('без ставки зарплата не считается', () => {
  const r = payMonth(2026, 10, [T('a', '2026-10-14T08:00', '2026-10-14T16:00')], [], payCfg({}), st);
  assert.equal(r.hasRate, false);
  assert.equal(r.empty, true);
  assert.equal(tripPay(T('a', '2026-10-14T08:00', '2026-10-14T16:00'), st(T('a', '2026-10-14T08:00', '2026-10-14T16:00')), payCfg({})), null);
});

test('переработка: часы сверх нормы в выходные оплачиваются вдвойне', () => {
  // 23 дня по 8 ч, среди них 6 выходных: 184 ч при норме 176 ч
  const trips = [];
  for (let d = 1; d <= 23; d++) { const k = String(d).padStart(2, '0'); trips.push(T(`t${d}`, `2026-10-${k}T08:00`, `2026-10-${k}T16:00`)); }
  const r = payMonth(2026, 10, trips, [], cfgOf({ bonus: 0, harm: 0 }), st);
  assert.equal(r.sum.overtime, 480);
  assert.equal(line(r, 'overWeekend').amount, 2400);
  assert.equal(line(r, 'overWeekend').hours, 8);
  assert.equal(line(r, 'overOther'), undefined);
  assert.equal(line(r, 'base').amount, 184 * 300);
});

test('переработка в будни: +50% ставки', () => {
  // только будни: 23 будних дня октября по 8 ч, кроме одного — 184 ч, выходных часов нет
  const days = [];
  for (let d = 1; d <= 31 && days.length < 22; d++) { const k = String(d).padStart(2, '0'); const wd = new Date(Date.UTC(2026, 9, d)).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(k); }
  const trips = days.map((k) => T(`t${k}`, `2026-10-${k}T08:00`, `2026-10-${k}T16:20`));
  const r = payMonth(2026, 10, trips, [], cfgOf({ bonus: 0, harm: 0 }), st);
  // 22 × 8 ч 20 мин = 183 ч 20 мин, сверх нормы 7 ч 20 мин
  assert.equal(r.sum.overtime, 440);
  assert.equal(line(r, 'overOther').amount, Math.round((440 / 60) * 300 * 0.5 * 100) / 100);
  assert.equal(line(r, 'overWeekend'), undefined);
});

test('праздничные часы: ещё одна ставка сверху', () => {
  const trips = [T('h', '2026-11-04T08:00', '2026-11-04T16:00')];
  const r = payMonth(2026, 11, trips, [], cfgOf({ bonus: 0, harm: 0, night: 0 }), st);
  assert.equal(line(r, 'base').amount, 2400);
  assert.equal(line(r, 'holiday').amount, 2400);
});

test('отдых сверх нормы в пункте оборота — 2/3 ставки', () => {
  const trips = [
    T('a', '2026-10-19T08:00', '2026-10-19T14:00'),
    T('b', '2026-10-20T08:00', '2026-10-20T12:00', { restType: 'home' }),
  ];
  const iv = overRestIntervals(trips, st);
  assert.equal(iv.length, 1);
  // норма отдыха = привезённое рабочее время (6 ч): с 20:00 до начала следующей поездки в 08:00
  assert.equal(iv[0].s, parseLocal('2026-10-19T20:00'));
  assert.equal(iv[0].e, parseLocal('2026-10-20T08:00'));
  const r = payMonth(2026, 10, trips, [], cfgOf({ bonus: 0, harm: 0, night: 0 }), st, { overRest: iv });
  assert.equal(line(r, 'overRest').amount, 2400);
  assert.equal(r.gross, 5400);
  assert.equal(r.ndfl, 702);
  assert.equal(r.net, 4698);
  // перерыв больше 48 ч — это уже не отдых в пункте оборота
  assert.equal(overRestIntervals([T('a', '2026-10-01T08:00', '2026-10-01T14:00'), T('b', '2026-10-04T08:00', '2026-10-04T12:00')], st).length, 0);
  // после поездки с домашним отдыхом — тоже нет
  assert.equal(overRestIntervals([T('a', '2026-10-19T08:00', '2026-10-19T14:00', { restType: 'home' }), T('b', '2026-10-20T08:00', '2026-10-20T12:00')], st).length, 0);
});

test('заработок за одну поездку на руки, с ком. расходами без налога', () => {
  const t = T('n', '2026-10-14T22:00', '2026-10-15T06:00');
  const p = tripPay(t, st(t), cfgOf({ trip: 500 }));
  // 8 ч × 300 + ночные 40% + вредность 4% = 3456; премия 12% → 3870,72; минус 13%; плюс 500
  assert.equal(p.gross, 3870.72);
  assert.equal(p.net, 3867.53);
  // поездка «в пути»: ком. расходы ещё не начислены
  const live = T('l', '2026-10-20T10:00', '');
  const pl = tripPay(live, tripStats(live, parseLocal('2026-10-20T12:00')), cfgOf({ trip: 500, bonus: 0, harm: 0 }));
  assert.equal(pl.gross, 600);
  assert.equal(pl.net, 522);
});

test('итог за период: строки по порядку квитка, разный процент не показывается', () => {
  const m1 = { lines: [{ key: 'base', label: 'Оплата по тарифу', hours: 10, amount: 100 }, { key: 'bonus', label: 'Премия', pct: 12, amount: 12 }], deductions: [], gross: 112, net: 97, comp: 0 };
  const m2 = { lines: [{ key: 'base', label: 'Оплата по тарифу', hours: 5, amount: 50 }, { key: 'night', label: 'Ночные', pct: 40, hours: 2, amount: 8 }, { key: 'bonus', label: 'Премия', pct: 10, amount: 5.8 }], deductions: [], gross: 63.8, net: 55.5, comp: 0 };
  const t = payTotal([m1, m2]);
  assert.deepEqual(t.lines.map((l) => l.key), ['base', 'night', 'bonus']);
  assert.equal(t.lines[0].hours, 15);
  assert.equal(t.lines[2].pct, undefined);
  assert.equal(t.gross, 175.8);
});

test('суммы в рублях по-русски, неразрывными пробелами', () => {
  const f = (...a) => fmtRub(...a).replace(/\u00a0/g, '_');
  assert.equal(f(1234567.891, true), '1_234_567,89_₽');
  assert.equal(f(38132.4), '38_132_₽');
  assert.equal(f(-5), '−5_₽');
});
