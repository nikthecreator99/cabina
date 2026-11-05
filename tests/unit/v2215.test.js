// CABINA 2.21.5: проверки перед сохранением — поездки не налезают друг на друга, отвлечения, слишком длинная поездка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripOverlap, tripAbsences, absenceTrips, tripLength, tripSpans, LONG_TRIP_MIN } from '../../js/checks.js';
import { parseLocal } from '../../js/calc.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], ...extra });
const now = parseLocal('2026-10-20T12:00');
const a = T('a', '2026-10-14T08:00', '2026-10-14T16:00');

test('налезает на другую поездку — найдена; касание концами — можно', () => {
  assert.equal(tripOverlap(T('b', '2026-10-14T15:00', '2026-10-14T20:00'), [a], now)?.id, 'a');
  assert.equal(tripOverlap(T('b', '2026-10-14T06:00', '2026-10-14T23:00'), [a], now)?.id, 'a');
  assert.equal(tripOverlap(T('b', '2026-10-14T16:00', '2026-10-14T20:00'), [a], now), null);
  assert.equal(tripOverlap(T('b', '2026-10-14T02:00', '2026-10-14T08:00'), [a], now), null);
  // сама с собой не пересекается
  assert.equal(tripOverlap({ ...a, end: '2026-10-14T17:00' }, [a], now), null);
});

test('следование пассажиром вне поездки тоже считается', () => {
  const b = T('b', '2026-10-14T18:00', '2026-10-15T02:00', { passenger: [{ id: 'p', start: '2026-10-14T15:00', end: '2026-10-14T17:00' }] });
  assert.equal(tripOverlap(b, [a], now)?.id, 'a');
});

test('поездка «в пути» — до «сейчас», «ждёт явки» — точка явки', () => {
  const live = T('l', '2026-10-20T08:00', '');
  assert.equal(tripOverlap(T('b', '2026-10-20T10:00', '2026-10-20T11:00'), [live], now)?.id, 'l');
  assert.equal(tripOverlap(T('b', '2026-10-20T13:00', '2026-10-20T15:00'), [live], now), null);
  const pend = T('p', '2026-10-21T09:00', '');
  assert.deepEqual(tripSpans(pend, now), [[parseLocal('2026-10-21T09:00'), parseLocal('2026-10-21T09:00')]]);
  assert.equal(tripOverlap(pend, [T('b', '2026-10-21T08:00', '2026-10-21T10:00')], now)?.id, 'b');
  assert.equal(tripOverlap(pend, [T('b', '2026-10-21T06:00', '2026-10-21T09:00')], now), null);
  assert.equal(tripOverlap(pend, [T('q', '2026-10-21T09:00', '')], now)?.id, 'q');
});

test('отвлечения: попадает на дни больничного (включительно)', () => {
  const sick = { id: 's', type: 'sick', start: '2026-10-15', end: '2026-10-16' };
  assert.equal(tripAbsences(T('b', '2026-10-14T20:00', '2026-10-15T04:00'), [sick], now).length, 1);
  assert.equal(tripAbsences(T('b', '2026-10-16T20:00', '2026-10-17T04:00'), [sick], now).length, 1);
  assert.equal(tripAbsences(T('b', '2026-10-17T00:00', '2026-10-17T04:00'), [sick], now).length, 0);
  assert.equal(tripAbsences(T('b', '2026-10-14T16:00', '2026-10-15T00:00'), [sick], now).length, 0);
  assert.deepEqual(absenceTrips(sick, [a, T('c', '2026-10-16T10:00', '2026-10-16T12:00')], now).map((t) => t.id), ['c']);
  assert.deepEqual(absenceTrips({ start: '', end: '' }, [a], now), []);
});

test('длина поездки: от начала до окончания, «в пути» — 0', () => {
  assert.equal(tripLength(a), 8 * 60);
  assert.equal(tripLength(T('b', '2026-10-14T08:00', '2026-10-15T15:05')), 31 * 60 + 5);
  assert.ok(tripLength(T('b', '2026-10-14T08:00', '2026-10-15T15:05')) > LONG_TRIP_MIN);
  assert.equal(tripLength(T('b', '2026-10-14T08:00', '2026-10-15T08:00')), LONG_TRIP_MIN);
  assert.equal(tripLength(T('l', '2026-10-14T08:00', '')), 0);
});
