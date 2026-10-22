// Производственный календарь: нормы часов по официальным данным и прогноз для будущих лет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayInfo, isHoliday, monthNorm, yearInfo, officialYears, mergeCalendarData } from '../../js/calendar.js';

test('нормы 2026 года совпадают с официальным календарём (пятидневка, 40 ч)', () => {
  const expected = [120, 152, 168, 175, 151, 167, 184, 168, 176, 176, 159, 176];
  const days = [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22];
  for (let m = 1; m <= 12; m++) {
    assert.equal(monthNorm(2026, m).hours, expected[m - 1], `часы, месяц ${m}`);
    assert.equal(monthNorm(2026, m).days, days[m - 1], `дни, месяц ${m}`);
  }
  const y = yearInfo(2026);
  assert.equal(y.hours, 1972);
  assert.equal(y.official, true);
});

test('нормы 2027 года', () => {
  const expected = [120, 151, 176, 175, 152, 167, 176, 176, 176, 168, 159, 176];
  for (let m = 1; m <= 12; m++) assert.equal(monthNorm(2027, m).hours, expected[m - 1], `месяц ${m}`);
  assert.equal(yearInfo(2027).hours, 1972);
  // 20 февраля 2027 (суббота) — рабочий сокращённый день по переносу
  assert.deepEqual(dayInfo('2027-02-20'), { kind: 'short', hours: 7 });
  assert.equal(dayInfo('2027-02-22').kind, 'off');
});

test('виды дней', () => {
  assert.deepEqual(dayInfo('2026-01-01'), { kind: 'holiday', hours: 0 });
  assert.deepEqual(dayInfo('2026-01-09'), { kind: 'off', hours: 0 });
  assert.deepEqual(dayInfo('2026-11-03'), { kind: 'short', hours: 7 });
  assert.deepEqual(dayInfo('2026-11-04'), { kind: 'holiday', hours: 0 });
  assert.deepEqual(dayInfo('2026-10-17'), { kind: 'weekend', hours: 0 });
  assert.deepEqual(dayInfo('2026-10-19'), { kind: 'work', hours: 8 });
});

test('праздничные часы дают только официальные праздники, а не выходные по переносу', () => {
  assert.equal(isHoliday('2026-05-09'), true);
  assert.equal(isHoliday('2026-05-11'), false); // выходной по переносу
  assert.equal(isHoliday('2026-10-18'), false); // обычное воскресенье
  assert.equal(isHoliday('2026-12-31'), false);
});

test('год без постановления считается по правилам ТК РФ', () => {
  const y = yearInfo(2028);
  assert.equal(y.official, false);
  assert.match(y.source, /Прогноз/);
  // 8 марта 2028 — среда, накануне сокращённый день
  assert.equal(dayInfo('2028-03-07').hours, 7);
  // 9 мая 2032 — воскресенье, выходной переносится на понедельник
  assert.equal(dayInfo('2032-05-09').kind, 'holiday');
  assert.equal(dayInfo('2032-05-10').kind, 'off');
});

test('календарь можно обновить файлом data/calendar.json', () => {
  assert.ok(!officialYears().includes(2030));
  const before = monthNorm(2030, 3).hours;
  mergeCalendarData({ years: { 2030: { source: 'Тест', off: ['2030-03-11'], work: [], short: ['2030-03-07'] } } });
  assert.ok(officialYears().includes(2030));
  assert.equal(yearInfo(2030).source, 'Тест');
  assert.equal(dayInfo('2030-03-11').kind, 'off');
  assert.equal(before - monthNorm(2030, 3).hours, 8); // 11 марта 2030 — понедельник
  // мусор не ломает календарь
  mergeCalendarData(null);
  mergeCalendarData({ years: { 2031: { off: 'нет' } } });
  assert.ok(!officialYears().includes(2031));
});
