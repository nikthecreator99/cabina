// Карьера: стаж и вознаграждение за преданность компании. Даты — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salariesFor, anniversary, payMonthOf, loyaltyMilestones, nextLoyalty, tenure, tenureText } from '../../js/career.js';

test('размер вознаграждения: 3 года — 2 оклада, 5 — 3, 10 — 4, 15 и каждые 5 лет — 5', () => {
  assert.equal(salariesFor(3), 2);
  assert.equal(salariesFor(5), 3);
  assert.equal(salariesFor(10), 4);
  assert.equal(salariesFor(15), 5);
  assert.equal(salariesFor(20), 5);
  assert.equal(salariesFor(35), 5);
  assert.equal(salariesFor(4), 0);
  assert.equal(salariesFor(12), 0);
});

test('выплата — в первом месяце следующего квартала', () => {
  assert.equal(payMonthOf('2027-01-10'), '2027-04');
  assert.equal(payMonthOf('2027-03-31'), '2027-04');
  assert.equal(payMonthOf('2027-04-01'), '2027-07');
  assert.equal(payMonthOf('2027-06-30'), '2027-07');
  assert.equal(payMonthOf('2027-07-15'), '2027-10');
  assert.equal(payMonthOf('2027-09-01'), '2027-10');
  assert.equal(payMonthOf('2027-10-01'), '2028-01');
  assert.equal(payMonthOf('2027-12-31'), '2028-01');
});

test('годовщины: тот же день, 29 февраля — 1 марта', () => {
  assert.equal(anniversary('2021-12-15', 5), '2026-12-15');
  assert.equal(anniversary('2020-02-29', 3), '2023-03-01');
  assert.equal(anniversary('2020-02-29', 4), '2024-02-29');
});

test('список выплат и ближайшая выплата', () => {
  const ms = loyaltyMilestones('2021-12-15', 25);
  assert.deepEqual(ms.map((x) => x.years), [3, 5, 10, 15, 20, 25]);
  assert.deepEqual(ms[0], { years: 3, date: '2024-12-15', payMonth: '2025-01', salaries: 2 });
  assert.equal(nextLoyalty('2021-12-15', '2026-10-20').years, 5);
  // право наступило, но месяц выплаты ещё не закончился — выплата всё ещё «ближайшая»
  assert.equal(nextLoyalty('2021-12-15', '2027-01-31').years, 5);
  assert.equal(nextLoyalty('2021-12-15', '2027-02-01').years, 10);
  assert.equal(loyaltyMilestones('').length, 0);
});

test('стаж в годах, месяцах и днях', () => {
  assert.deepEqual(tenure('2021-12-15', '2026-10-20'), { y: 4, m: 10, d: 5 });
  assert.deepEqual(tenure('2021-12-31', '2022-03-01'), { y: 0, m: 2, d: 1 });
  assert.equal(tenureText(tenure('2021-12-15', '2026-10-20')), '4 года 10 месяцев');
  assert.equal(tenureText(tenure('2026-10-10', '2026-10-20')), '10 дней');
  assert.equal(tenure('2027-01-01', '2026-10-20'), null);
});
