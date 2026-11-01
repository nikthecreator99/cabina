// CABINA 2.19.9: прошлая работа на железной дороге — общий стаж без перерывов. Места и даты выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tenure, tenureText, periodTenure, addTenures, totalTenure, pastOf, pastError, careerOf, nextDayKey, prevDayKey } from '../../js/career.js';
import { HELP } from '../../js/help.js';

const NOW = '2026-11-01';
const SOS = { id: 'p1', place: 'Депо Сосновка', role: 'assistant', title: '', from: '2018-03-01', to: '2019-08-31' };

test('прошлая работа: обе даты включительно; соседние дни', () => {
  assert.deepEqual(periodTenure(SOS), { y: 1, m: 6, d: 0 });
  assert.deepEqual(periodTenure({ from: '2020-05-10', to: '2020-05-10' }), { y: 0, m: 0, d: 1 });
  assert.equal(nextDayKey('2024-02-28'), '2024-02-29');
  assert.equal(nextDayKey('2026-12-31'), '2027-01-01');
  assert.equal(prevDayKey('2026-03-01'), '2026-02-28');
});

test('сложение стажа: 30 дней — месяц, 12 месяцев — год', () => {
  assert.deepEqual(addTenures([{ y: 1, m: 11, d: 20 }, { y: 0, m: 0, d: 15 }]), { y: 2, m: 0, d: 5 });
  assert.deepEqual(addTenures([{ y: 0, m: 7, d: 29 }, { y: 0, m: 5, d: 1 }]), { y: 1, m: 1, d: 0 });
  assert.deepEqual(addTenures([null, { y: 3, m: 0, d: 0 }]), { y: 3, m: 0, d: 0 });
});

test('весь стаж: прошлая работа + нынешняя, перерыв не входит; без прошлой — как непрерывный', () => {
  const c = { hired: '2023-02-10', past: [SOS], jobs: [] };
  // 1 год 6 месяцев + 3 года 8 месяцев 22 дня
  assert.deepEqual(tenure('2023-02-10', NOW), { y: 3, m: 8, d: 22 });
  assert.deepEqual(totalTenure(c, NOW), { y: 5, m: 2, d: 22 });
  assert.equal(tenureText(totalTenure(c, NOW)), '5 лет 2 месяца');
  assert.deepEqual(totalTenure({ hired: '2023-02-10', past: [] }, NOW), tenure('2023-02-10', NOW));
  // дату устройства не указали — только прошлая работа
  assert.deepEqual(totalTenure({ hired: '', past: [SOS] }, NOW), { y: 1, m: 6, d: 0 });
  assert.equal(totalTenure({ hired: '', past: [] }, NOW), null);
});

test('из хранилища и копии берётся только понятное: даты, роль, текст до 60 знаков, новые сверху', () => {
  const past = pastOf({ past: [
    SOS,
    { id: 'p2', place: 'Ольховка', role: 'driver', title: 'лишнее', from: '2014-01-01', to: '2015-12-31' },
    { id: 'p3', place: 'x'.repeat(200), role: 'boss', title: '<b>Слесарь</b>', from: '2016-01-01', to: '2016-06-30', extra: 'нет' },
    { id: 'bad1', from: '2017-05-01', to: '2017-04-01' }, // «с» позже «по»
    { id: 'bad2', from: '2017-05-01' }, // нет «по»
    { from: '2010-01-01', to: '2010-02-01' }, // нет id
    null, 'строка',
  ] });
  assert.deepEqual(past.map((x) => x.id), ['p1', 'p3', 'p2']);
  assert.equal(past[1].place.length, 60);
  assert.equal(past[1].role, 'other');
  assert.equal(past[1].title, '<b>Слесарь</b>', 'текст хранится как есть, на экран — только через esc()');
  assert.equal(past[2].title, '', 'у помощника и машиниста названия нет');
  assert.equal('extra' in past[1], false);
  assert.deepEqual(pastOf({}), []);
  assert.deepEqual(pastOf({ past: 'нет' }), []);
  assert.deepEqual(careerOf({ career: { hired: '2023-02-10' } }).past, []);
});

test('проверка дат: обе есть, по порядку, не в будущем, раньше даты устройства, без пересечений', () => {
  const c = { hired: '2023-02-10', past: [SOS] };
  const err = (x) => pastError(c, x, NOW);
  assert.match(err({ from: '', to: '2020-01-01' }), /с какого числа/);
  assert.match(err({ from: '2020-01-01', to: '' }), /по какое число/);
  assert.match(err({ from: '2020-05-01', to: '2020-04-30' }), /раньше начала/);
  assert.match(pastError({ hired: '', past: [] }, { from: '2026-10-01', to: '2026-11-02' }, NOW), /в будущем/);
  assert.match(err({ from: '2022-01-01', to: '2023-02-10' }), /раньше даты устройства — 10 февраля 2023/);
  assert.equal(err({ from: '2022-01-01', to: '2023-02-09' }), null, 'накануне устройства — можно');
  assert.match(err({ from: '2019-08-31', to: '2020-01-01' }), /пересекаются с другой прошлой работой: Депо Сосновка \(с 1 марта 2018 по 31 августа 2019\)/);
  assert.match(err({ from: '2017-01-01', to: '2018-03-01' }), /пересекаются/);
  assert.equal(err({ from: '2019-09-01', to: '2020-01-01' }), null, 'со следующего дня — можно');
  assert.equal(err({ id: 'p1', from: '2018-01-01', to: '2019-08-31' }, NOW), null, 'сама с собой не пересекается');
});

test('в «Помощи» есть вопрос про прошлую работу; на сервер карьера не уходит', () => {
  const it = HELP.flatMap((g) => g.items).find((x) => x.id === 'app-career');
  assert.ok(it);
  assert.deepEqual(it.open, ['Карьера', 'career']);
  assert.match(it.a, /Добавить прошлую работу/);
  // «Коллеги» и аккаунт про карьеру ничего не знают
  for (const f of ['colleagues.js', 'auth.js', 'account.js', 'share.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../../js/${f}`, import.meta.url), 'utf8'), /career/, f);
  }
});
