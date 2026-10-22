// Рабочее время, ночные и праздничные часы, отвлечения и итоги месяца.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocal, fmtLocal, mergeIntervals, tripStats, validateTrip, autoAbsenceHours, absenceMonths,
  absenceHoursByMonth, validateAbsence, monthSummary, fmtDur, fmtHours, HOUR,
} from '../../js/calc.js';

const trip = (start, end, extra = {}) => ({ id: `t-${start}`, start, end, ...extra });

test('время хранится как настенное: без сдвига часового пояса', () => {
  const ms = parseLocal('2026-10-14T20:05');
  assert.equal(fmtLocal(ms), '2026-10-14T20:05');
  assert.ok(Number.isNaN(parseLocal('')));
  assert.ok(Number.isNaN(parseLocal('14.10.2026 20:05')));
  assert.ok(Number.isNaN(parseLocal(null)));
});

test('ночные часы считаются с 22:00 до 6:00', () => {
  const st = tripStats(trip('2026-10-14T20:00', '2026-10-15T07:30'));
  assert.equal(st.work, 690);
  assert.equal(st.night, 480);
  assert.equal(st.holiday, 0);
  // поездка целиком днём
  assert.equal(tripStats(trip('2026-10-14T08:00', '2026-10-14T17:00')).night, 0);
  // утро после полуночи
  assert.equal(tripStats(trip('2026-10-15T04:00', '2026-10-15T09:00')).night, 120);
  // двое суток подряд: две ночи
  assert.equal(tripStats(trip('2026-10-14T12:00', '2026-10-16T12:00')).night, 960);
});

test('поездка через границу месяцев делится по месяцам', () => {
  const st = tripStats(trip('2026-10-31T21:00', '2026-11-01T03:00'));
  assert.deepEqual(st.byMonth, {
    '2026-10': { work: 180, night: 120, holiday: 0 },
    '2026-11': { work: 180, night: 180, holiday: 0 },
  });
});

test('праздничные часы — только часы внутри праздничных суток', () => {
  const st = tripStats(trip('2026-11-03T20:00', '2026-11-04T10:00'));
  assert.equal(st.work, 840);
  assert.equal(st.holiday, 600);
  assert.equal(st.night, 480);
  // Новый год: поездка 31.12 → 01.01 захватывает 6 праздничных часов
  const ny = tripStats(trip('2026-12-31T18:00', '2027-01-01T06:00'));
  assert.equal(ny.holiday, 360);
  assert.equal(ny.byMonth['2026-12'].holiday, 0);
  assert.equal(ny.byMonth['2027-01'].holiday, 360);
});

test('следование пассажиром входит в рабочее время без двойного счёта', () => {
  const t = trip('2026-10-14T08:00', '2026-10-14T12:00', {
    passenger: [{ start: '2026-10-14T11:00', end: '2026-10-14T14:00' }, { start: '2026-10-14T16:00', end: '2026-10-14T17:00' }],
  });
  const st = tripStats(t);
  assert.equal(st.work, 420);
  assert.equal(st.intervals.length, 2);
  assert.equal(fmtLocal(st.end), '2026-10-14T17:00');
  assert.deepEqual(mergeIntervals([[5, 6], [1, 3], [2, 4], [7, 7], [NaN, 9]]), [[1, 4], [5, 6]]);
});

test('проверка поездки', () => {
  assert.equal(validateTrip(trip('2026-10-14T08:00', '2026-10-14T12:00')), null);
  assert.match(validateTrip(trip('', '2026-10-14T12:00')), /начала/);
  assert.match(validateTrip(trip('2026-10-14T08:00', '')), /окончания/);
  assert.match(validateTrip(trip('2026-10-14T12:00', '2026-10-14T08:00')), /раньше начала/);
  assert.match(validateTrip(trip('2026-10-14T08:00', '2026-10-14T08:00')), /0 минут/);
  assert.match(validateTrip(trip('2026-10-14T08:00', '2026-10-14T12:00', { passenger: [{ start: '2026-10-14T13:00', end: '' }] })), /пассажиром №1/);
  assert.match(validateTrip(trip('2026-10-14T08:00', '2026-10-14T12:00', { passenger: [{ start: '2026-10-14T13:00', end: '2026-10-14T13:00' }] })), /позже начала/);
});

test('отвлечения вычитают рабочие часы по календарю, выходные не считаются', () => {
  // 29–30 окт — рабочие, 31 окт и 1 ноя — выходные, 2 ноя — рабочий, 3 ноя — сокращённый (7 ч)
  assert.deepEqual(autoAbsenceHours('2026-10-29', '2026-11-03'), { '2026-10': 16, '2026-11': 15 });
  assert.deepEqual(absenceMonths('2026-12-30', '2027-01-02'), ['2026-12', '2027-01']);
  const manual = { start: '2026-10-29', end: '2026-11-03', auto: false, monthHours: { '2026-10': '4', '2026-11': -3 } };
  assert.deepEqual(absenceHoursByMonth(manual), { '2026-10': 4, '2026-11': 0 });
});

test('проверка отвлечения', () => {
  const others = [{ id: 'a1', start: '2026-10-05', end: '2026-10-09' }];
  assert.equal(validateAbsence({ id: 'n', start: '2026-10-12', end: '2026-10-13' }, others), null);
  assert.match(validateAbsence({ id: 'n', start: '', end: '2026-10-13' }, others), /начала/);
  assert.match(validateAbsence({ id: 'n', start: '2026-10-13', end: '2026-10-12' }, others), /раньше/);
  assert.match(validateAbsence({ id: 'n', start: '2026-10-09', end: '2026-10-12' }, others), /пересекается/);
  // редактирование того же отвлечения — не пересечение
  assert.equal(validateAbsence({ id: 'a1', start: '2026-10-06', end: '2026-10-09' }, others), null);
  assert.match(validateAbsence({ id: 'n', start: '2026-10-12', end: '2026-10-12', auto: false, monthHours: { '2026-10': '' } }, others), /часов/);
  assert.match(validateAbsence({ id: 'n', start: '2026-10-12', end: '2026-10-12', auto: false, monthHours: { '2026-10': -1 } }, others), /отрицательным/);
});

test('итоги месяца: норма минус отвлечения, ночные, праздничные, процент', () => {
  const trips = [trip('2026-10-14T20:00', '2026-10-15T07:30'), trip('2026-10-31T21:00', '2026-11-01T03:00'), trip('2026-09-10T08:00', '2026-09-10T12:00')];
  const absences = [{ id: 'v', type: 'vacation', start: '2026-10-19', end: '2026-10-20' }];
  const s = monthSummary(2026, 10, trips, absences);
  assert.equal(s.base, 176);
  assert.equal(s.absTotal, 16);
  assert.equal(s.norm, 160);
  assert.equal(s.normMin, 9600);
  assert.equal(s.work, 690 + 180);
  assert.equal(s.night, 480 + 120);
  assert.equal(s.monthTrips.length, 2);
  assert.equal(s.absByType.vacation, 16);
  assert.equal(s.pct, 870 / 9600);
  // весь месяц на больничном — норма 0, процент не считается
  const full = monthSummary(2026, 10, [], [{ id: 's', type: 'sick', start: '2026-10-01', end: '2026-10-31' }]);
  assert.equal(full.norm, 0);
  assert.equal(full.pct, null);
});

test('форматирование длительности', () => {
  assert.equal(fmtDur(125), '2 ч 05 мин');
  assert.equal(fmtDur(125, { short: true }), '2 ч 05');
  assert.equal(fmtDur(120, { short: true }), '2 ч');
  assert.equal(fmtDur(-90), '−1 ч 30 мин');
  assert.equal(fmtDur(0), '0 ч 00 мин');
  assert.equal(fmtHours(8), '8 ч');
  assert.equal(fmtHours(7.5), '7 ч 30 мин');
  assert.equal(HOUR, 3600000);
});
