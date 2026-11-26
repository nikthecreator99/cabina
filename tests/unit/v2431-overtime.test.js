// 2.43.1: переработку оплачиваем от нормы по закону (пятидневка), как в расчётном листке;
// на экране норма остаётся по выбранной неделе (по умолчанию шестидневка). Данные — выдуманные.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tripStats, monthSummary } from '../../js/calc.js';
import { setNormWeek } from '../../js/calendar.js';
import { payCfg, payMonth, OVER_FIRST } from '../../js/pay.js';

const T = (id, start, end) => ({ id, start, end, passenger: [], restType: 'turnaround' });
const st = (t) => tripStats(t);
const cfg = payCfg({ assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } }, 'assistant');
const line = (r, key) => r.lines.find((l) => l.key === key);
after(() => setNormWeek(5));

// будни сентября 2026 по 9 ч: 22 дня = 198 ч; норма по закону 176 ч, по шестидневке 174 ч
const sepTrips = () => {
  const out = [];
  for (let d = 1; d <= 30; d++) {
    const wd = new Date(Date.UTC(2026, 8, d)).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const k = String(d).padStart(2, '0');
    out.push(T(`s${k}`, `2026-09-${k}T08:00`, `2026-09-${k}T17:00`));
  }
  return out;
};

test('шестидневка на экране, а переработка — от нормы по закону', () => {
  setNormWeek(6);
  const s = monthSummary(2026, 5, [], []);
  assert.equal(s.base, 159, 'май 2026 на экране — как в листке нормы депо');
  assert.equal(s.lawBase, 151, 'в расчётном листке — «Норма часов (по закону) 151»');
  const trips = sepTrips();
  const sum = monthSummary(2026, 9, trips, []);
  assert.equal(sum.work, 198 * 60);
  assert.equal(sum.norm, 174);
  assert.equal(sum.overtime, 24 * 60, 'на экране — от шестидневки');
  assert.equal(sum.payOvertime, 22 * 60, 'в оплату — от пятидневки');
  const r = payMonth(2026, 9, trips, [], cfg, st);
  assert.equal(OVER_FIRST, 120);
  assert.deepEqual([line(r, 'overOther').hours, line(r, 'overOther').amount], [2, 2 * 300 * 0.5]);
  assert.deepEqual([line(r, 'overOther2').hours, line(r, 'overOther2').amount], [20, 20 * 300]);
  assert.equal(line(r, 'base').amount, 198 * 300, 'все часы по тарифу — как раньше');
});

test('выбрана пятидневка — оплата та же', () => {
  setNormWeek(5);
  const trips = sepTrips();
  const sum = monthSummary(2026, 9, trips, []);
  assert.equal(sum.overtime, sum.payOvertime);
  const r = payMonth(2026, 9, trips, [], cfg, st);
  assert.equal(line(r, 'overOther2').hours, 20);
});

test('отвлечение вычитается из нормы по закону по пятидневке', () => {
  setNormWeek(6);
  // отпуск пн 07.09 – сб 12.09: по шестидневке 7×5 + 5 = 40 ч, по пятидневке 8×5 = 40 ч, суббота — 0
  const abs = [{ id: 'v', type: 'vacation', start: '2026-09-07', end: '2026-09-12', auto: true }];
  const trips = sepTrips().filter((t) => t.start < '2026-09-07' || t.start > '2026-09-12T23:59');
  const sum = monthSummary(2026, 9, trips, abs);
  assert.equal(sum.absTotal, 40);
  assert.equal(sum.lawNormMin, (176 - 40) * 60);
  assert.equal(sum.payOvertime, Math.max(0, sum.work - (176 - 40) * 60));
  // вписанные вручную часы — одни и те же для обеих норм
  const manual = [{ id: 'm', type: 'study', start: '2026-09-07', end: '2026-09-12', auto: false, monthHours: { '2026-09': 30 } }];
  const s2 = monthSummary(2026, 9, trips, manual);
  assert.equal(s2.norm, 174 - 30);
  assert.equal(s2.lawNormMin, (176 - 30) * 60);
});

test('выходные сверх нормы — ×2, обычная переработка — после них', () => {
  setNormWeek(6);
  // 22 будних дня по 8 ч (176 ч = норма по закону) + две субботы по 8 ч
  const trips = sepTrips().map((t) => ({ ...t, end: t.end.replace('T17:00', 'T16:00') }));
  trips.push(T('w1', '2026-09-05T08:00', '2026-09-05T16:00'), T('w2', '2026-09-12T08:00', '2026-09-12T16:00'));
  const r = payMonth(2026, 9, trips, [], cfg, st);
  assert.equal(r.sum.payOvertime, 16 * 60);
  assert.deepEqual([line(r, 'overWeekend').hours, line(r, 'overWeekend').amount], [16, 16 * 300]);
  assert.equal(line(r, 'overOther'), undefined);
  assert.equal(line(r, 'overOther2'), undefined);
});
