// CABINA 2.21.9: выгрузка поездок в Excel (CSV) и загрузка из таблицы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, tripsCsv, parseCsv, tableItems, mapHeader, EXPORT_COLS } from '../../js/table.js';
import { parseLocal } from '../../js/calc.js';

const NOW = parseLocal('2026-10-20T12:00');
const T = [
  { id: 'a', routeLabel: 'Сосновка → Ольховка', start: '2026-10-14T20:30', end: '2026-10-15T05:10', passenger: [], waiting: [], locoType: '2ЭС5К', locoNumber: '0123', weight: 6100, routeNo: '=1+2', restType: 'turnaround', note: 'секрет' },
  { id: 'b', routeLabel: 'Ольховка → Сосновка', start: '2026-10-16T08:00', end: '2026-10-16T16:00', passenger: [], waiting: [], kind: 'reserve', restType: 'home' },
];

test('ячейка: кавычки, точка с запятой, защита от формул', () => {
  assert.equal(csvCell('просто'), 'просто');
  assert.equal(csvCell('а;б'), '"а;б"');
  assert.equal(csvCell('скажи "да"'), '"скажи ""да"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+7 900'), "'+7 900");
  assert.equal(csvCell(null), '');
});

test('выгрузка: BOM, «;», часы с запятой, без заметок; загрузка своей же выгрузки возвращает поездки', () => {
  const csv = tripsCsv(T);
  assert.ok(csv.startsWith('﻿Дата явки;Явка;Дата окончания;Окончание;Маршрут'));
  assert.match(csv, /\r\n14\.10\.2026;20:30;15\.10\.2026;05:10;Сосновка → Ольховка;Грузовой;2ЭС5К №0123;'=1\+2;6100;;;8,67;/);
  assert.match(csv, /16\.10\.2026;08:00;16\.10\.2026;16:00;Ольховка → Сосновка;Резерв;/);
  assert.doesNotMatch(csv, /секрет/);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], EXPORT_COLS);
  assert.equal(rows[1][7], '=1+2', 'апостроф снимается при чтении');
  const { items, skipped, error } = tableItems(rows, NOW, []);
  assert.equal(error, null); assert.equal(skipped, 0);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.deepEqual([a.trip.start, a.trip.end, a.from, a.to, a.trip.locoType, a.trip.locoNumber, a.trip.weight, a.trip.routeNo], ['2026-10-14T20:30', '2026-10-15T05:10', 'Сосновка', 'Ольховка', '2ЭС5К', '0123', 6100, '=1+2']);
  assert.equal(b.trip.kind, 'reserve');
  // уже есть такие поездки — отмечены
  assert.ok(tableItems(rows, NOW, T).items.every((it) => it.dup));
});

test('своя таблица: дата и время отдельно, через полночь, «,»-разделитель, ошибки пропускаются', () => {
  const text = 'Дата,Начало,Конец,Маршрут,Серия,Номер локомотива\n14.10.26,22:00,06:30,Сосновка-Сортировочная - Ольховка,ВЛ80С,1555\n15.10.2026,08:00,,x,,\n31.02.2026,08:00,10:00,,,\n2026-10-25,08:00,10:00,,,\n';
  const rows = parseCsv(text);
  assert.deepEqual(mapHeader(rows[0]), { date: 0, start: 1, end: 2, route: 3, locoType: 4, locoNumber: 5 });
  const { items, skipped } = tableItems(rows, NOW, []);
  assert.equal(items.length, 1);
  assert.equal(skipped, 3, 'без окончания, несуществующая дата, будущее');
  assert.deepEqual([items[0].trip.start, items[0].trip.end, items[0].from, items[0].to, items[0].trip.locoType, items[0].trip.locoNumber], ['2026-10-14T22:00', '2026-10-15T06:30', 'Сосновка-Сортировочная', 'Ольховка', 'ВЛ80С', '1555']);
  assert.match(tableItems(parseCsv('Дата;Часы\n1;2'), NOW, []).error, /Явка» и «Окончание/);
  assert.match(tableItems([['Явка']], NOW, []).error, /нет строк/);
});
