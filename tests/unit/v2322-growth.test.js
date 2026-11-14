// «Статистика роста» (2.32.2): периоды, столбцы графиков, сравнение, «остаются», очистка ответа сервера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growthRange, bucketsOf, seriesOf, cumulative, delta, avgActive, retention, cleanGrowth, growthModel, spanText, shiftPeriod } from '../../js/growth-data.js';

test('идущий месяц сравнивается с теми же днями прошлого; законченный — с прошлым целиком', () => {
  const r = growthRange('month', 2026, 11, '2026-11-14');
  assert.deepEqual([r.from, r.to, r.prevFrom, r.prevTo, r.partial, r.title], ['2026-11-01', '2026-11-14', '2026-10-01', '2026-10-14', true, 'Ноябрь 2026']);
  assert.equal(r.prevText, '1–14 октября');
  const o = growthRange('month', 2026, 10, '2026-11-14');
  assert.deepEqual([o.from, o.to, o.prevFrom, o.prevTo, o.partial], ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30', false], '31 день против 30 — до конца сентября');
  const m = growthRange('month', 2026, 3, '2026-03-31');
  assert.deepEqual([m.prevFrom, m.prevTo], ['2026-02-01', '2026-02-28'], 'не дальше конца февраля');
  const j = growthRange('month', 2027, 1, '2027-01-10');
  assert.equal(j.prevText, '1–10 декабря 2026', 'другой год — с годом');
});

test('квартал, год, всё время, будущее', () => {
  const q = growthRange('quarter', 2026, 11, '2026-11-14');
  assert.deepEqual([q.from, q.to, q.prevFrom, q.prevTo, q.title], ['2026-10-01', '2026-11-14', '2026-07-01', '2026-08-14', 'IV квартал 2026']);
  const y = growthRange('year', 2026, 5, '2026-11-14');
  assert.deepEqual([y.from, y.to, y.prevFrom, y.prevTo], ['2026-01-01', '2026-11-14', '2025-01-01', '2025-11-14']);
  const a = growthRange('all', 2026, 11, '2026-11-14');
  assert.deepEqual([a.from, a.to, a.prevFrom], [null, '2026-11-14', null]);
  assert.equal(growthRange('month', 2026, 12, '2026-11-14').future, true);
  assert.deepEqual(shiftPeriod('quarter', 2026, 11, 1), { y: 2027, m: 2 });
  assert.equal(spanText('2026-10-30', '2026-11-02'), '30 октября – 2 ноября 2026');
});

test('столбцы: месяц — по дням, квартал — по неделям с понедельника, год — по месяцам, долго — по кварталам', () => {
  assert.equal(bucketsOf('2026-11-01', '2026-11-14', 'month').length, 14);
  const w = bucketsOf('2026-10-01', '2026-10-20', 'quarter');
  assert.deepEqual(w.map((b) => [b.a, b.b]), [['2026-10-01', '2026-10-04'], ['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-20']]);
  const y = bucketsOf('2026-01-01', '2026-11-14', 'year');
  assert.equal(y.length, 11);
  assert.deepEqual([y[10].a, y[10].b, y[10].label], ['2026-11-01', '2026-11-14', 'ноя']);
  const all = bucketsOf('2024-05-10', '2026-11-14', 'year');
  assert.equal(all[0].full, 'II квартал 2024');
  assert.equal(all[0].a, '2024-05-10', 'первый столбец — с первой регистрации');
  assert.equal(all.at(-1).full, 'IV квартал 2026');
});

test('суммы и средние по столбцам; заходы — только с дня, когда их начали считать', () => {
  const days = [{ d: '2026-11-01', signup: 2, active: 5 }, { d: '2026-11-02', active: 7 }, { d: '2026-11-03', signup: 1, joined: 1 }, { d: 'плохо', signup: 99 }];
  const bk = bucketsOf('2026-11-01', '2026-11-03', 'month');
  assert.deepEqual(seriesOf(days, bk, 'signup'), [2, 0, 1]);
  assert.deepEqual(seriesOf(days, bk, 'active', { avg: true, since: '2026-11-02' }), [null, 7, 0]);
  const w = [{ a: '2026-11-01', b: '2026-11-03' }];
  assert.deepEqual(seriesOf(days, w, 'active', { avg: true, since: '2026-11-02' }), [3.5]);
  assert.deepEqual(cumulative(days, bk, 10), [10, 10, 11]);
});

test('сравнение, среднее, «остаются»', () => {
  assert.deepEqual(delta(14, 8), { d: 6, pct: 75 });
  assert.deepEqual(delta(3, 0), { d: 3, pct: null });
  assert.equal(delta(3, null), null);
  assert.equal(avgActive({ active_sum: 60, active_days: 15 }), 4);
  assert.equal(avgActive({ active_sum: 0, active_days: 0 }), null);
  assert.deepEqual(retention({ age7: 12, back7: 6 }, 7), { pct: 50, back: 6, age: 12 });
  assert.equal(retention({ age30: 0, back30: 0 }, 30), null);
});

test('ответ сервера — только известные числа; мусор и лишние поля отбрасываются', () => {
  const c = cleanGrowth({ today: '2026-11-14', email: 'x@example.com', cur: { signup: '5', cohort: { n: 2, id: 'u1' }, who: 'u1' }, prev: null,
    days: [{ d: '2026-11-01', signup: 1, email: 'x' }, { d: '<b>', signup: 1 }, null],
    now: { total: 3, platforms: { web: 2, '<script>': 1, android: 0 }, versions: { '2.32.2': 3 }, name: 'Пётр' } });
  const s = JSON.stringify(c);
  assert.ok(!/@|u1|Пётр|script|<b>/.test(s));
  assert.equal(c.cur.signup, 5);
  assert.equal(c.days.length, 1);
  assert.deepEqual(c.now.platforms, { web: 2 });
  assert.equal(c.prev, null);
  assert.deepEqual(cleanGrowth(null).days, []);
});

test('модель для экрана и PDF: плитки со сравнением, удаления — «плохо», когда растут', () => {
  const d = cleanGrowth({ today: '2026-11-14', first_day: '2026-10-01', active_since: '2026-11-05', base: 4,
    cur: { signup: 6, deleted: 2, cohort: { n: 6, age7: 3, back7: 2 } }, prev: { signup: 3, deleted: 1, cohort: {} },
    days: [{ d: '2026-11-03', signup: 6, joined: 6 }], now: { total: 10, colleagues: 5 } });
  const M = growthModel(d, growthRange('month', 2026, 11, '2026-11-14'));
  assert.equal(M.buckets.length, 14);
  assert.deepEqual(M.tiles.find((t) => t.key === 'signup').dl, { d: 3, pct: 100 });
  assert.equal(M.tiles.find((t) => t.key === 'deleted').bad, true);
  assert.equal(M.total.at(-1), 10);
  assert.equal(M.sinceLate, true);
  assert.equal(M.usage.find((u) => u.k === 'colleagues').pct, 50);
  assert.equal(M.ret.w.pct, 67);
});

test('законченный короткий месяц сравнивается с прошлым целиком', () => {
  const r = growthRange('month', 2026, 9, '2026-11-14');
  assert.deepEqual([r.prevFrom, r.prevTo], ['2026-08-01', '2026-08-31']);
});
