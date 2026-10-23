// Закрепление состава: таблица III.4 Правил тормозов и расчёт башмаков. Числа — выдуманный состав.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIX_TABLE, fixCalc } from '../../js/fix.js';

test('таблица норм: уклоны 0–40‰ через 2‰, ручные оси нормируются до 20‰', () => {
  assert.deepEqual(FIX_TABLE.map((r) => r[0]), Array.from({ length: 21 }, (_, i) => i * 2));
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 0), [0, 0.2, 0.4, 0.4]);
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 8), [8, 0.2, 0.6, 0.6]);
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 10), [10, 0.3, 0.8, 0.8]);
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 20), [20, 0.6, 1.8, 1.8]);
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 22), [22, 0.7, 2.0, null]);
  assert.deepEqual(FIX_TABLE.find((r) => r[0] === 40), [40, 1.3, 3.8, null]);
  // башмаков ≥10 тс/ось — не меньше трети ручных осей (1 башмак = 3 оси), башмаков <10 тс — равно осям
  for (const [, a, b, c] of FIX_TABLE) if (c != null) { assert.ok(a * 3 >= c - 1e-9); assert.equal(b, c); }
  // нормы не убывают с ростом уклона
  for (let i = 1; i < FIX_TABLE.length; i++) { assert.ok(FIX_TABLE[i][1] >= FIX_TABLE[i - 1][1]); assert.ok(FIX_TABLE[i][2] >= FIX_TABLE[i - 1][2]); }
});

test('гружёный состав 5200 тс, 216 осей, 4‰: 11 башмаков, 30 на локомотиве — хватает', () => {
  const r = fixCalc({ weight: 5200, axles: 216, shoes: 30, slope: 4 });
  assert.equal(r.load, 24.07);
  assert.equal(r.loaded, true);
  assert.equal(r.k, 0.2);
  assert.equal(r.need, 11); // 5200 / 100 × 0,2 = 10,4 → 11
  assert.equal(r.lay, 11);
  assert.equal(r.deficit, 0);
  assert.equal(r.extraAxes, 0);
  assert.equal(r.axesNorm, 21); // 0,4 оси на 100 тс → 20,8 → 21
});

test('нехватка башмаков заменяется ручными тормозами: гружёный 3 оси за башмак, порожний — 1', () => {
  const a = fixCalc({ weight: 5200, axles: 216, shoes: 3, slope: 12 });
  assert.equal(a.need, 21); // 5200 / 100 × 0,4 = 20,8 → 21
  assert.equal(a.deficit, 18);
  assert.equal(a.extraAxes, 54);
  assert.equal(a.extraWagons, 14); // 54 / 4 = 13,5 → 14
  const e = fixCalc({ weight: 1200, axles: 200, shoes: 2, slope: 10 });
  assert.equal(e.loaded, false); // 6 тс на ось
  assert.equal(e.k, 0.8);
  assert.equal(e.need, 10); // 1200 / 100 × 0,8 = 9,6 → 10
  assert.equal(e.extraAxes, 8);
  assert.equal(e.extraWagons, 2);
});

test('точное деление не округляется лишний раз, граница 10 тс на ось — гружёный', () => {
  assert.equal(fixCalc({ weight: 5000, axles: 500, slope: 0 }).loaded, true);
  assert.equal(fixCalc({ weight: 5000, axles: 500, slope: 0 }).need, 10); // 5000 / 100 × 0,2 = 10
  assert.equal(fixCalc({ weight: 4999, axles: 500, slope: 0 }).loaded, false);
  assert.equal(fixCalc({ weight: 3000, axles: 120, slope: 30 }).need, 30); // 30 × 1,0
  assert.equal(fixCalc({ weight: 3000, axles: 120, slope: 30 }).axesNorm, null);
});

test('уклон между значениями берётся по большему, пустые данные — без расчёта', () => {
  assert.equal(fixCalc({ weight: 1000, axles: 40, slope: 7 }).slope, 8);
  assert.equal(fixCalc({ weight: 1000, axles: 40, slope: 55 }).slope, 40);
  assert.equal(fixCalc({ weight: 0, axles: 40 }), null);
  assert.equal(fixCalc({ weight: 1000, axles: 0 }), null);
});
