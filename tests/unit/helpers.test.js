// Мелкие помощники: подписи дат, склонения, локомотивы, восход и закат.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, whenShort, dateRange, plural, fmtSize, hm, dayMonth } from '../../js/ui.js';
import { S, normType, normNum, locoKey, locoLabel, routeOf, routeText } from '../../js/store.js';
import { parseLocal } from '../../js/calc.js';
import { sunTimes, skyPhase, coordsForTz } from '../../js/sun.js';

test('подписи дат', () => {
  const now = parseLocal('2026-10-14T12:00');
  assert.equal(whenShort(parseLocal('2026-10-14T18:05'), now), 'сегодня, 18:05');
  assert.equal(whenShort(parseLocal('2026-10-15T03:00'), now), 'завтра, 03:00');
  assert.equal(whenShort(parseLocal('2026-10-13T23:59'), now), 'вчера, 23:59');
  assert.equal(whenShort(parseLocal('2026-10-20T07:00'), now), '20 окт, 07:00');
  assert.equal(hm(parseLocal('2026-10-14T09:07')), '09:07');
  assert.equal(dayMonth(parseLocal('2026-03-08T09:07')), '8 марта');
  assert.equal(dateRange('2026-10-19', '2026-10-19'), '19 октября');
  assert.equal(dateRange('2026-10-19', '2026-10-23'), '19–23 октября');
  assert.equal(dateRange('2026-10-29', '2026-11-03'), '29 окт – 3 ноя');
  assert.equal(dateRange('2026-12-29', '2027-01-03'), '29.12.2026 – 3.01.2027');
});

test('склонения и размеры файлов', () => {
  const p = (n) => plural(n, 'поездка', 'поездки', 'поездок');
  assert.equal(p(1), 'поездка');
  assert.equal(p(3), 'поездки');
  assert.equal(p(5), 'поездок');
  assert.equal(p(11), 'поездок');
  assert.equal(p(21), 'поездка');
  assert.equal(p(112), 'поездок');
  assert.equal(fmtSize(500), '500 Б');
  assert.equal(fmtSize(2048), '2 КБ');
  assert.equal(fmtSize(1.5 * 1024 * 1024), '1,5 МБ');
});

test('экранирование текста пользователя', () => {
  assert.equal(esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.equal(esc(null), '');
});

test('локомотивы: похожие латинские буквы, регистр и «№» не создают новую машину', () => {
  assert.equal(normType(' tem 2 '), 'ТЕМ2'); // латинские T, E, M
  assert.equal(normType('2эс5к'), '2ЭС5К');
  assert.equal(normNum('№ 355'), '355');
  assert.equal(locoKey('BЛ80C', '№1234'), locoKey('ВЛ80С', '1234')); // латинские B и C
  assert.equal(locoLabel('2ЭС5К', '355'), '2ЭС5К №355');
  assert.equal(locoLabel('', '355'), '№355');
  assert.equal(locoLabel('', ''), '');
});

test('название маршрута поездки', () => {
  S.routes = [{ id: 'r1', from: 'Няндома', to: 'Коноша' }];
  assert.equal(routeText(S.routes[0]), 'Няндома → Коноша');
  assert.equal(routeOf({ routeId: 'r1' }), 'Няндома → Коноша');
  assert.equal(routeOf({ routeId: 'gone', routeLabel: 'Старый → Маршрут' }), 'Старый → Маршрут');
  assert.equal(routeOf({}), '');
  S.routes = [];
});

test('восход и закат в Москве', () => {
  const [lat, lon] = coordsForTz('Europe/Moscow');
  // 21 июня 2026: восход около 00:44 UTC (03:44 МСК), закат около 18:18 UTC (21:18 МСК)
  const t = sunTimes(Date.UTC(2026, 5, 21, 9), lat, lon);
  const utcMin = (ms) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes();
  assert.ok(Math.abs(utcMin(t.rise) - (0 * 60 + 44)) <= 5, `восход ${new Date(t.rise).toISOString()}`);
  assert.ok(Math.abs(utcMin(t.set) - (18 * 60 + 18)) <= 5, `закат ${new Date(t.set).toISOString()}`);
  assert.equal(skyPhase(Date.UTC(2026, 5, 21, 9), 'Europe/Moscow'), 'day');
  assert.equal(skyPhase(Date.UTC(2026, 11, 21, 21), 'Europe/Moscow'), 'night');
  // неизвестный пояс — координаты Москвы
  assert.deepEqual(coordsForTz('Mars/Olympus'), [lat, lon]);
});

test('полярный день и ночь', () => {
  assert.equal(sunTimes(Date.UTC(2026, 5, 21, 9), 69, 33).polar, 'day');
  assert.equal(sunTimes(Date.UTC(2026, 11, 21, 9), 69, 33).polar, 'night');
});
