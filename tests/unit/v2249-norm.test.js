// 2.24.9: норма и отвлечения по листку нормы часов депо (шестидневка) и «Норма 159 ч (32 ч)».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthNorm, normDay, normToDate, yearInfo, setNormWeek, normWeek, normWeekOf, dayInfo, dateKey } from '../../js/calendar.js';
import { absenceBreakdown, autoAbsenceHours, monthSummary, normSoFar } from '../../js/calc.js';

test('ноябрь 2026 по шестидневке — день в день как на листке в депо (159 ч)', () => {
  // нарастающий итог с листка: число месяца → часы
  const sheet = { 2: 7, 3: 13, 5: 20, 6: 27, 7: 32, 9: 39, 10: 46, 11: 53, 12: 60, 13: 67, 14: 72, 16: 79, 17: 86, 18: 93,
    19: 100, 20: 107, 21: 112, 23: 119, 24: 126, 25: 133, 26: 140, 27: 147, 28: 152, 30: 159 };
  for (const [d, h] of Object.entries(sheet)) assert.equal(normToDate(2026, 11, Number(d), 6), h, `${d} ноября`);
  // воскресенья и 4 ноября — 0, нарастающий итог не растёт
  for (const d of [1, 4, 8, 15, 22, 29]) assert.equal(normDay(dateKey(2026, 11, d), 6).hours, 0, `${d} ноября`);
  assert.equal(normDay('2026-11-04', 6).kind, 'holiday');
  assert.deepEqual(normDay('2026-11-03', 6), { kind: 'short', hours: 6 });
  assert.deepEqual(normDay('2026-11-07', 6), { kind: 'work', hours: 5 });
  assert.deepEqual(monthNorm(2026, 11, 6), { hours: 159, days: 24 });
});

test('шестидневка 2026–2027: дни как в производственном календаре для шестидневки', () => {
  // рабочие дни по месяцам (производственный календарь для шестидневной рабочей недели)
  const days26 = [20, 23, 25, 26, 24, 25, 27, 26, 26, 27, 24, 26];
  const days27 = [19, 23, 26, 26, 24, 25, 27, 26, 26, 26, 25, 26];
  for (let m = 1; m <= 12; m++) {
    assert.equal(monthNorm(2026, m, 6).days, days26[m - 1], `2026, месяц ${m}`);
    assert.equal(monthNorm(2027, m, 6).days, days27[m - 1], `2027, месяц ${m}`);
  }
  assert.equal(monthNorm(2026, 10, 6).hours, 179); // 22 × 7 + 5 × 5
  assert.equal(normDay('2026-03-09', 6).kind, 'off'); // 8 марта — воскресенье
  assert.deepEqual(normDay('2026-03-07', 6), { kind: 'short', hours: 4 }); // суббота перед праздником
  assert.equal(normDay('2026-01-09', 6).hours, 7); // перенос с субботы для шестидневки не действует
  assert.equal(normDay('2026-05-11', 6).hours, 7);
  assert.equal(normDay('2026-12-31', 6).kind, 'off'); // перенос с воскресенья 4 января
  assert.equal(normDay('2027-05-03', 6).hours, 7); // 1 мая 2027 — суббота: при шестидневке не переносится
  assert.equal(normDay('2027-05-10', 6).kind, 'off'); // 9 мая 2027 — воскресенье
  // оплата по-прежнему по пятидневке
  assert.equal(dayInfo('2026-11-07').kind, 'weekend');
  assert.equal(dayInfo('2026-01-09').kind, 'off');
});

test('прогноз шестидневки для лет без постановления повторяет правила', () => {
  // 2032: 9 мая — воскресенье → 10 мая выходной; 8 мая (суббота) — предпраздничный, 4 ч
  assert.equal(normDay('2032-05-10', 6).kind, 'off');
  assert.deepEqual(normDay('2032-05-08', 6), { kind: 'short', hours: 4 });
  // 2028: 8 марта — среда, 7 марта — предпраздничный (6 ч); 1 мая — понедельник, накануне воскресенье — суббота 29 апреля обычная
  assert.deepEqual(normDay('2028-03-07', 6), { kind: 'short', hours: 6 });
  assert.deepEqual(normDay('2028-04-29', 6), { kind: 'work', hours: 5 });
  assert.equal(yearInfo(2028, 6).official, false);
  // 12 июня 2027 — суббота, по шестидневке выходной не переносится (как в официальном)
  assert.equal(normDay('2027-06-14', 6).hours, 7);
});

test('по умолчанию в модуле — пятидневка, выбор шестидневки меняет норму и отвлечения', () => {
  assert.equal(normWeek(), 5);
  assert.equal(normWeekOf('мусор'), 6);
  assert.equal(normWeekOf(5), 5);
  assert.equal(monthNorm(2026, 10).hours, 176);
  assert.equal(absenceBreakdown('2026-10-30', '2026-11-05'), '8 + 8 + 7 + 8, выходные и праздник — 0');
  setNormWeek(6);
  try {
    assert.equal(monthNorm(2026, 10).hours, 179);
    // 30 окт (пт) 7, 31 окт (сб) 5, 1 ноя (вс) 0, 2 ноя 7, 3 ноя 6, 4 ноя праздник, 5 ноя 7
    assert.equal(absenceBreakdown('2026-10-30', '2026-11-05'), '7 + 5 + 7 + 6 + 7, выходной и праздник — 0');
    assert.deepEqual(autoAbsenceHours('2026-10-30', '2026-11-05'), { '2026-10': 12, '2026-11': 20 });
    const abs = [{ id: 'a1', type: 'vacation', start: '2026-11-09', end: '2026-11-10', auto: true }];
    const sum = monthSummary(2026, 11, [], abs);
    assert.equal(sum.base, 159);
    assert.equal(sum.absTotal, 14);
    assert.equal(sum.norm, 145);
    // норма на сегодня: на 7 ноября — 32 ч; на 10 ноября без отвлечений — 46, с отпуском 9–10 — 32
    assert.equal(normSoFar(2026, 11, '2026-11-07', [], 159), 32);
    assert.equal(normSoFar(2026, 11, '2026-11-10', [], 159), 46);
    assert.equal(normSoFar(2026, 11, '2026-11-10', abs, sum.norm), 32);
    // отвлечение, начатое в прошлом месяце, тоже вычитается своими днями
    assert.equal(normSoFar(2026, 11, '2026-11-03', [{ start: '2026-10-25', end: '2026-11-02', type: 'sick' }], 159), 6);
    // другой месяц — скобок нет
    assert.equal(normSoFar(2026, 10, '2026-11-03', [], 179), null);
    // не больше нормы месяца
    assert.equal(normSoFar(2026, 11, '2026-11-30', [], 150), 150);
  } finally { setNormWeek(5); }
});
