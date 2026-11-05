// CABINA 2.21.9: отпускные ориентировочно (ст. 139, 120 ТК РФ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats } from '../../js/calc.js';
import { payCfg, payMonth, vacationPay, vacationDays, VAC_MIN_MONTHS } from '../../js/pay.js';

const T = (id, start, end) => ({ id, start, end, passenger: [], restType: 'turnaround' });
const st = (t) => tripStats(t);
const cfg = payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0, sickDay: 1000 } });
// одна поездка 8 ч (08:00–16:00) 10-го числа каждого месяца
const monthly = (from, n) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(from[0], from[1] - 1 + i, 10)); const k = d.toISOString().slice(0, 10); return T(`t${i}`, `${k}T08:00`, `${k}T16:00`); });

test('дни отпуска без нерабочих праздников', () => {
  assert.equal(vacationDays('2026-07-01', '2026-07-28'), 28);
  assert.equal(vacationDays('2026-12-29', '2027-01-11'), 14 - 8, 'новогодние каникулы 1–8 января не входят');
});

test('12 полных месяцев: заработок / 12 / 29,3 × дни, НДФЛ 13%', () => {
  const trips = monthly([2025, 10], 12); // октябрь 2025 — сентябрь 2026
  const sumGross = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(2025, 9 + i, 1)); return payMonth(d.getUTCFullYear(), d.getUTCMonth() + 1, trips, [], cfg, st).gross; }).reduce((a, b) => a + b, 0);
  const v = vacationPay('2026-10-05', '2026-10-18', trips, [], cfg, st);
  assert.equal(v.enough, true); assert.equal(v.months, 12); assert.equal(v.days, 14);
  const perDay = sumGross / 12 / 29.3;
  assert.ok(Math.abs(v.perDay - perDay) < 0.01);
  assert.ok(Math.abs(v.gross - perDay * 14) < 0.01);
  assert.equal(v.ndfl, Math.round(v.gross * 0.13));
});

test('меньше 6 месяцев с поездками — не считаем; без ставки — null', () => {
  const v = vacationPay('2026-10-05', '2026-10-18', monthly([2026, 5], VAC_MIN_MONTHS - 1), [], cfg, st);
  assert.deepEqual(v, { months: VAC_MIN_MONTHS - 1, enough: false });
  assert.equal(vacationPay('2026-10-05', '2026-10-18', monthly([2026, 1], 9), [], payCfg({ main: {} }), st), null);
});

test('больничный: его дни и деньги из периода исключаются; сам этот отпуск в расчёт не входит', () => {
  const trips = monthly([2025, 10], 12);
  const sick = { id: 's', type: 'sick', start: '2026-03-01', end: '2026-03-31', auto: true, monthHours: {} }; // весь март — исключается целиком
  const half = { id: 'h', type: 'sick', start: '2026-04-16', end: '2026-04-30', auto: true, monthHours: {} };
  const self = { id: 'v', type: 'vacation', start: '2026-10-05', end: '2026-10-18', auto: true, monthHours: {} };
  const v = vacationPay('2026-10-05', '2026-10-18', trips, [sick, half, self], cfg, st);
  assert.equal(v.months, 11, 'март целиком на больничном — не считается');
  const m = (y, mo, abs = []) => payMonth(y, mo, trips, abs, cfg, st).gross;
  let sum = 0;
  for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(2025, 9 + i, 1)); const y = d.getUTCFullYear(); const mo = d.getUTCMonth() + 1; if (mo !== 3) sum += m(y, mo); }
  const weight = 10 * 29.3 + 29.3 / 30 * 15; // апрель: 15 дней из 30 отработано
  assert.ok(Math.abs(v.perDay - Math.round(sum / weight * 100) / 100) < 0.011, `${v.perDay} vs ${sum / weight}`);
});
