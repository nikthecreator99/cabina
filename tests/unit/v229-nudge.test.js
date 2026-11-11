// CABINA 2.29.0: вечернее напоминание об ударном режиме (просьба Никиты 11.11.2026). Данные выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../js/learn-state.js';

const st = (o) => L.normalizeLearn({ ...L.emptyLearn(), ...o });

test('напоминаем с 18:00, если серия жива, а сегодня урока нет', () => {
  const s = st({ days: ['2026-11-09', '2026-11-10'] });
  assert.equal(L.streakNudge(s, '2026-11-11', 17), null, 'до 18:00 — нет');
  assert.deepEqual(L.streakNudge(s, '2026-11-11', 18), { n: 2, freeze: false });
  assert.deepEqual(L.streakNudge(s, '2026-11-11', 23), { n: 2, freeze: false });
});
test('урок сегодня уже был, серии нет или она прервалась — не напоминаем', () => {
  assert.equal(L.streakNudge(st({ days: ['2026-11-10', '2026-11-11'] }), '2026-11-11', 20), null);
  assert.equal(L.streakNudge(st({}), '2026-11-11', 20), null, 'ни одного урока');
  assert.equal(L.streakNudge(st({ days: ['2026-11-08'] }), '2026-11-11', 20), null, 'серия уже прервалась');
});
test('честно: если есть заморозка, серия не сгорит', () => {
  assert.deepEqual(L.streakNudge(st({ days: ['2026-11-10'], freezes: 1 }), '2026-11-11', 19), { n: 1, freeze: true });
});
test('вчерашний пропуск, закрытый заморозкой, серию не рвёт', () => {
  const s0 = st({ days: ['2026-11-08', '2026-11-09'], freezes: 1 });
  const s = L.dailyCheck(s0, '2026-11-11').state;
  assert.deepEqual(L.streakNudge(s, '2026-11-11', 19), { n: 2, freeze: false });
});
