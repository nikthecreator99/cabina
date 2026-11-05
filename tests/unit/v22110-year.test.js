// CABINA 2.21.10: «Мой год в CABINA» — итоги года картинками. Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { parseLocal } from '../../js/calc.js';
import { yearData, yearSlides, yearToShow, kmCompare, yearTripCount } from '../../js/year.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], restType: 'turnaround', routeId: 'r1', routeLabel: '', locoType: '2ЭС5К', locoNumber: String(100 + (+id.slice(1) % 3)), ...extra });

beforeEach(() => {
  S.trips = []; S.absences = []; S.notes = [];
  S.routes = [{ id: 'r1', from: 'Альфа', to: 'Бета', distanceKm: 250 }];
  S.profile = {};
});

test('какой год показывать: декабрь — текущий, январь — прошлый, иначе нет', () => {
  assert.equal(yearToShow(parseLocal('2026-12-05T10:00')), 2026);
  assert.equal(yearToShow(parseLocal('2027-01-20T10:00')), 2026);
  assert.equal(yearToShow(parseLocal('2026-11-05T10:00')), null);
});

test('итоги года: часы, ночные, км, любимая серия без номера, рекорды', () => {
  for (let i = 0; i < 12; i++) {
    const d = String(i + 1).padStart(2, '0');
    S.trips.push(T(`t${i}`, `2026-${d}-10T20:00`, `2026-${d}-11T09:00`));
  }
  S.trips.push(T('t99', '2025-12-10T08:00', '2025-12-10T18:00', { locoType: 'ВЛ80С' }));
  const d = yearData(2026);
  assert.equal(d.trips, 12);
  assert.equal(yearTripCount(2026), 12);
  assert.equal(d.work, 12 * 780);
  assert.equal(d.night, 12 * 480);
  assert.equal(d.km, 12 * 250);
  assert.equal(d.fav.label, '2ЭС5К');
  assert.equal(d.fav.n, 12);
  assert.equal(d.machines, 3);
  assert.equal(d.longest, 780);
  const slides = yearSlides(d);
  assert.deepEqual(slides.map((s) => s.kind), ['hours', 'night', 'km', 'loco', 'awards', 'end']);
  // ничего лишнего: ни станций, ни номеров локомотивов
  const text = JSON.stringify(slides.map(({ awards, ...s }) => s));
  for (const bad of ['Альфа', 'Бета', '№', '100', '101', '102']) assert.ok(!text.includes(bad), bad);
  // первая поездка («Добро пожаловать») — в 2025, в наградах 2026 её нет
  const aw = slides.find((s) => s.kind === 'awards').awards.map((x) => x.a.id);
  assert.ok(!aw.includes('first'));
  assert.ok(yearData(2025).awards.some((x) => x.a.id === 'first'));
});

test('повторяемые награды считаются только за год', () => {
  S.trips.push(T('a1', '2025-03-01T06:00', '2025-03-01T19:00')); // 13 ч — «Железная пятая точка» в 2025
  S.trips.push(T('a2', '2026-03-01T06:00', '2026-03-01T19:00'));
  S.trips.push(T('a3', '2026-04-01T06:00', '2026-04-01T19:00'));
  const iron = yearData(2026).awards.find((x) => x.a.id === 'iron');
  assert.equal(iron.n, 2);
});

test('пустой год — картинок нет; без км и локомотивов — эти картинки пропускаются', () => {
  assert.equal(yearData(2026), null);
  assert.deepEqual(yearSlides(null), []);
  S.routes = [];
  S.trips.push(T('b1', '2026-05-01T08:00', '2026-05-01T12:00', { routeId: null, locoType: '', locoNumber: '' }));
  const kinds = yearSlides(yearData(2026)).map((s) => s.kind);
  assert.ok(!kinds.includes('km') && !kinds.includes('loco') && !kinds.includes('night'));
  assert.equal(kinds[0], 'hours'); assert.equal(kinds.at(-1), 'end');
});

test('сравнение пути', () => {
  assert.match(kmCompare(90000), /2,2 раза вокруг Земли/);
  assert.equal(kmCompare(43680), 'больше, чем вокруг Земли');
  assert.match(kmCompare(10000), /Владивостока/);
  assert.match(kmCompare(3000), /4 раза от Москвы до Петербурга/);
  assert.equal(kmCompare(500), '');
});
