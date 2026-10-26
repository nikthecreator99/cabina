// CABINA 2.8: следование и ожидание пассажиром в квитке, группы и несколько номеров в «Телефонах».
// Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { payMonth, payCfg } from '../../js/pay.js';
import { tripStats } from '../../js/calc.js';
import { phonesOf, phonesListHtml, contactGroups } from '../../js/phones.js';

beforeEach(() => { S.contacts = []; S.contactGroups = []; });

const line = (r, k) => r.lines.find((l) => l.key === k);

test('ожидание и следование пассажиром, вписанные внутри времени поездки, — отдельными строками квитка', () => {
  // поездку записали до прихода домой: 08:00–19:00, а с 14:00 ждали, с 16:00 ехали пассажиром
  const t = { id: 't', start: '2026-10-14T08:00', end: '2026-10-14T19:00',
    waiting: [{ id: 'w', start: '2026-10-14T14:00', end: '2026-10-14T16:00' }],
    passenger: [{ id: 'p', start: '2026-10-14T16:00', end: '2026-10-14T19:00' }] };
  const cfg = payCfg({ main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } });
  const r = payMonth(2026, 10, [t], [], cfg, (x) => tripStats(x));
  assert.deepEqual([line(r, 'base').hours, line(r, 'wait').hours, line(r, 'pass').hours], [6, 2, 3]);
  assert.deepEqual([line(r, 'base').amount, line(r, 'wait').amount, line(r, 'pass').amount], [1800, 600, 900]);
  assert.equal(r.sum.work, 11 * 60, 'всего отработано не меняется');
  // по среднему — тоже отдельно
  const a = payMonth(2026, 10, [t], [], payCfg({ main: { mode: 'avg', avgHour: 500 } }), (x) => tripStats(x));
  assert.deepEqual(a.lines.map((l) => l.key), ['avg', 'pass', 'wait']);
});

test('«Телефоны»: старые контакты с одним номером читаются, группы — папками', () => {
  assert.deepEqual(phonesOf({ phone: '+7 900 000-00-01' }), ['+7 900 000-00-01'], 'запись 2.6');
  assert.deepEqual(phonesOf({ phones: ['1', '', '+7 900'] }), ['1', '+7 900']);
  assert.deepEqual(phonesOf({}), []);
  S.contacts = [
    { id: 'a', group: 'Обозерская', name: 'Дежурный', phones: ['+7 900 000-00-01', '8 800 000 00 02'] },
    { id: 'b', group: 'обозерская', name: 'Нарядчик', phones: ['+7 900 000-00-03'] },
    { id: 'c', group: '', name: 'Медпункт', phone: '+7 900 000-00-04' },
    { id: 'd', group: 'Нарядчики <b>', name: 'Анна', phones: ['+7 900 000-00-05'] },
  ];
  assert.deepEqual(contactGroups().map((g) => [g.name, g.list.length]), [['Нарядчики <b>', 1], ['Обозерская', 2]], 'регистр не важен');
  const top = phonesListHtml();
  assert.ok(top.includes('data-g="Обозерская"') && top.includes('2 контакта'));
  assert.ok(!top.includes('<b>'), 'название группы экранировано');
  assert.ok(top.includes('Без группы') && top.includes('Медпункт') && !top.includes('Дежурный'), 'контакты групп — внутри папок');
  const inside = phonesListHtml('', 'Обозерская');
  assert.ok(inside.includes('Дежурный') && inside.includes('Нарядчик') && !inside.includes('Медпункт'));
  // несколько номеров — каждый своей ссылкой для звонка
  assert.ok(inside.includes('href="tel:+79000000001"') && inside.includes('href="tel:88000000002"'));
  // поиск — по всем группам, с названием группы
  const found = phonesListHtml('обозерская');
  assert.ok(found.includes('Дежурный') && found.includes('Нарядчик') && !found.includes('Медпункт'));
  assert.ok(phonesListHtml('0000002').includes('Дежурный'), 'по второму номеру');
});
