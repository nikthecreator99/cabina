// CABINA 2.32: напарник в поездке — проверка полей и «с кем ездил». Имена выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMates, matesOf, matesStats, recentMates, mateKey, MATES_MAX, lastMates } from '../../js/mates.js';

const A = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

test('cleanMates: только известные поля, uuid или пусто, имя без управляющих знаков, без повторов, не больше трёх', () => {
  assert.deepEqual(cleanMates(null), []);
  assert.deepEqual(cleanMates('Иван'), []);
  const out = cleanMates([
    { id: A.toUpperCase(), name: '  Анна\u0000 Тестовая ', extra: 'x' },
    { id: '<script>', name: 'Олег' },
    { id: '', name: 'олег' }, // тот же, что выше (регистр не важен)
    { id: '', name: '' },
    { name: 'Пётр' }, { name: 'Семён' },
  ]);
  assert.equal(out.length, MATES_MAX);
  assert.deepEqual(out[0], { id: A, name: 'Анна Тестовая' });
  assert.deepEqual(out[1], { id: '', name: 'Олег' });
  assert.deepEqual(out[2], { id: '', name: 'Пётр' });
  assert.equal(cleanMates([{ name: 'x'.repeat(80) }])[0].name.length, 40);
  assert.equal(mateKey({ id: '', name: 'Пётр Ёлкин' }), mateKey({ id: '', name: 'пётр елкин' }));
});

test('matesStats: сколько поездок и часов вместе, имя — из последней поездки, сначала частые', () => {
  const trips = [
    { id: '1', start: '2026-10-01T08:00', mates: [{ id: A, name: 'Анна' }, { id: '', name: 'Олег' }] },
    { id: '2', start: '2026-10-05T08:00', mates: [{ id: A, name: 'Анна Тестовая' }] },
    { id: '3', start: '2026-10-03T08:00' },
  ];
  const work = { 1: 600, 2: 300, 3: 400 };
  const s = matesStats(trips, (t) => work[t.id]);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].name, s[0].n, s[0].work], ['Анна Тестовая', 2, 900]);
  assert.deepEqual([s[1].name, s[1].n, s[1].work], ['Олег', 1, 600]);
  assert.deepEqual(recentMates(trips).map((m) => m.name), ['Анна Тестовая', 'Олег']);
  assert.deepEqual(matesOf(trips[2]), []);
  // новая поездка — с напарниками последней поездки, где они есть (поездка 3 позже 1, но без напарника)
  assert.deepEqual(lastMates(trips), [{ id: A, name: 'Анна Тестовая' }]);
  assert.deepEqual(lastMates([]), []);
});
