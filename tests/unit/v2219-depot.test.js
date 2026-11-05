// CABINA 2.21.9: настройки депо одним QR-кодом — маршруты, нормы, дома отдыха; без ставок и поездок.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depotPayload, encodeDepot, decodeDepot, depotCodeFrom, depotItems, itemText, depotEmpty } from '../../js/depot.js';
import { b64u } from '../../js/share.js';

const ST = {
  routes: [
    { id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 198.5, weightNorm: 5199, lengthNorm: 59, acceptMin: 20, departMin: 60, walkMin: 15 },
    { id: 'r2', from: 'Ольховка', to: 'Сосновка', distanceKm: 198.5 },
  ],
  settings: { houses: { 'ольховка': { name: 'Ольховка', minRest: 300 }, 'берёзово': { name: 'Берёзово' } }, dayOffMin: 3600, minRest: 240, minShiftRest: 960,
    pay: { main: { rates: [{ from: '2020-01-01', rate: 400 }], oklad: 50000 } } },
  trips: [{ id: 't1', start: '2026-10-01T08:00', end: '2026-10-01T16:00' }],
};

test('в коде — маршруты, нормы, минимумы, выходной; ставок, оклада и поездок нет', async () => {
  const p = depotPayload(ST);
  assert.equal(p.r.length, 2);
  assert.deepEqual(p.h, [['Ольховка', 300]]);
  assert.equal(p.o, 3600);
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, /400|50000|rate|oklad|t1|2026/);
  const code = await encodeDepot(p);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  const d = await decodeDepot(code);
  assert.deepEqual(d.routes[0], { from: 'Сосновка', to: 'Ольховка', distanceKm: 198.5, weightNorm: 5199, lengthNorm: 59, acceptMin: 20, departMin: 60, walkMin: 15 });
  assert.deepEqual(d.routes[1], { from: 'Ольховка', to: 'Сосновка', distanceKm: 198.5 });
  assert.deepEqual(d.houses, [{ name: 'Ольховка', minRest: 300 }]);
  assert.deepEqual(d.settings, { dayOffMin: 3600, minRest: 240, minShiftRest: 960 });
  assert.equal(depotCodeFrom(`https://cabina-app.ru/#d=${code}`), code);
  assert.equal(depotCodeFrom('https://cabina-app.ru/#t=zabcdefghij'), null);
  assert.ok(depotEmpty(depotPayload({ routes: [], settings: { houses: {} } })));
});

test('чужое и испорченное не принимается: длинные строки, неверные числа, не тот формат', async () => {
  const raw = (o) => `j${b64u(new TextEncoder().encode(JSON.stringify(o)))}`;
  await assert.rejects(decodeDepot(raw({ v: 2, r: [] })), /не код CABINA с настройками депо/);
  await assert.rejects(decodeDepot('zНЕКОД'), /повреждён/);
  const d = await decodeDepot(raw({ v: 1,
    r: [['<b>А</b>'.repeat(30), 'Б', -5, 5199.5, 59, 20, 9999], ['В', 'В'], [1, 2], 'x', ['Г', 'Д\u2028', 100]],
    h: [['Дом', 10], ['Дом2', 300], ['Дом2', 400], [{}, 300]], o: 5, m: 30.5, q: 600 }));
  assert.equal(d.routes.length, 2);
  assert.equal(d.routes[0].from.length, 60);
  assert.deepEqual(Object.keys(d.routes[0]), ['from', 'to', 'lengthNorm', 'acceptMin']);
  assert.equal(d.routes[1].to, 'Д');
  assert.deepEqual(d.houses, [{ name: 'Дом2', minRest: 300 }]);
  assert.deepEqual(d.settings, { minShiftRest: 600 });
});

test('список: новое выбрано, отличающееся — «обновить» (не выбрано), совпадающее не показываем', async () => {
  const d = await decodeDepot(await encodeDepot(depotPayload(ST)));
  const mine = { routes: [{ id: 'm1', from: 'сосновка', to: 'ОЛЬХОВКА', distanceKm: 198.5, weightNorm: 5000 }], settings: { houses: {}, dayOffMin: 3600, minRest: 240, minShiftRest: 720 } };
  const { items, same } = depotItems(d, mine);
  assert.equal(same, 2); // выходной и минимальный отдых совпадают
  const route = items.find((it) => it.kind === 'route' && it.ex);
  assert.equal(route.pick, false);
  assert.deepEqual(route.diff, ['weightNorm', 'lengthNorm', 'acceptMin', 'departMin', 'walkMin']);
  assert.match(itemText(route).warn, /обновить/);
  assert.equal(items.find((it) => it.kind === 'route' && !it.ex).pick, true);
  const house = items.find((it) => it.kind === 'house');
  assert.equal(house.pick, true);
  assert.match(itemText(house).t1, /Дом отдыха · Ольховка/);
  const shift = items.find((it) => it.kind === 'set');
  assert.deepEqual([shift.key, shift.v, shift.pick], ['minShiftRest', 960, false]);
  assert.match(itemText(shift).warn, /У вас 12 ч — заменить/);
});
