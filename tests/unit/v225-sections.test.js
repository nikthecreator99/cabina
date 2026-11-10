// CABINA 2.25: «Маршруты» → «Участки» со станциями по порядку; поездка — часть участка в любую сторону,
// километры — по перегонам. Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  S, routeOf, legEnds, legRoute, legKm, legKey, segOf, isWhole, stationsList, sectionText, saveSection, deleteRoute, saveRoute, saveTrip,
} from '../../js/store.js';
import { parseLocal, legsOf } from '../../js/calc.js';
import { routeEnds, houseOf } from '../../js/rest.js';
import { computeAwards } from '../../js/awards.js';
import { encodeTrips, decodeShare, importItems, sectionFor } from '../../js/share.js';
import { depotPayload, encodeDepot, decodeDepot, depotItems, applyDepot } from '../../js/depot.js';

const NOW = parseLocal('2026-10-20T12:00');
const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], restType: 'turnaround', routeId: null, routeLabel: '', locoType: '', locoNumber: '', kind: 'freight', ...extra });
// выдуманный участок: 6 станций, 5 перегонов, 100 км
const SEC = () => ({ id: 'sec', from: 'Сосновка', to: 'Берёзово', stations: ['Ольховка', 'Липки', 'Дубки', 'Клёны'], distanceKm: 100, weightNorm: 5199, createdAt: 1 });

beforeEach(() => {
  S.trips = []; S.routes = [SEC()]; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, tz: 'Europe/Moscow', houses: {}, pay: { main: { rates: [{ from: null, rate: 300 }], bonus: 0, rk: 0, sn: 0, night: 0, harm: 0 } } };
});

test('участок: станции по порядку, часть участка в любую сторону', () => {
  const r = S.routes[0];
  assert.deepEqual(stationsList(r), ['Сосновка', 'Ольховка', 'Липки', 'Дубки', 'Клёны', 'Берёзово']);
  assert.equal(sectionText(r), 'Сосновка — Берёзово');
  assert.deepEqual(segOf(r, 'липки', 'Сосновка'), { from: 'Липки', to: 'Сосновка', i: 2, j: 0 });
  assert.equal(segOf(r, 'Липки', 'Липки'), null, 'одна и та же станция — не часть участка');
  assert.equal(segOf(r, 'Липки', 'Нигде'), null);
  assert.equal(isWhole(r, 'Сосновка', 'берёзово'), true);
  assert.equal(isWhole(r, 'Берёзово', 'Сосновка'), false, 'обратно — уже не «весь участок от А к Б»');
  assert.deepEqual(stationsList({ from: 'А', to: 'Б' }), ['А', 'Б'], 'старый маршрут без станций — две станции');
});

test('километры: длина участка ÷ перегоны × проеханные перегоны', () => {
  const leg = (x) => ({ routeId: 'sec', ...x });
  assert.equal(legKm(leg({})), 100, 'весь участок');
  assert.equal(legKm(leg({ stFrom: 'Сосновка', stTo: 'Ольховка' })), 20, 'один перегон из пяти');
  assert.equal(legKm(leg({ stFrom: 'Клёны', stTo: 'Ольховка' })), 60, 'обратно три перегона');
  assert.equal(legKm(leg({ stFrom: 'Берёзово', stTo: 'Сосновка' })), 100, 'весь участок обратно');
  assert.equal(legKm(leg({ stFrom: 'Убрана', stTo: 'Липки' })), 0, 'станции уже нет на участке — не угадываем');
  S.routes[0].distanceKm = null;
  assert.equal(legKm(leg({ stFrom: 'Сосновка', stTo: 'Липки' })), 0, 'без длины участка — 0');
  // 11 станций, 10 перегонов, 33 км — один перегон 3,3 км
  S.routes = [{ id: 'm', from: 'А', to: 'Л', stations: ['Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'], distanceKm: 33 }];
  assert.equal(legKm({ routeId: 'm', stFrom: 'А', stTo: 'Б' }), 3.3);
  assert.equal(legKm({ routeId: 'm', stFrom: 'В', stTo: 'Ж' }), 13.2);
});

test('поездка по части участка: подписи, концы, дом отдыха', () => {
  const t = T('t', '2026-10-14T05:00', '2026-10-14T11:00', { routeId: 'sec', stFrom: 'Дубки', stTo: 'Ольховка', routeLabel: 'Дубки → Ольховка' });
  assert.deepEqual(legEnds(t), { from: 'Дубки', to: 'Ольховка' });
  assert.equal(legRoute(t), 'Дубки → Ольховка');
  assert.equal(routeOf(t), 'Дубки → Ольховка');
  assert.deepEqual(routeEnds(t), { from: 'Дубки', to: 'Ольховка' });
  assert.equal(houseOf(t), 'Ольховка', 'дом отдыха — станция прибытия, а не конец участка');
  const whole = T('w', '2026-10-15T05:00', '2026-10-15T11:00', { routeId: 'sec' });
  assert.equal(routeOf(whole), 'Сосновка → Берёзово');
  assert.notEqual(legKey(t), legKey(whole), '«Ракета» сравнивает только одинаковые пути');
});

test('со сменой локомотива: туда часть участка, обратно — тот же участок', () => {
  const t = T('t', '2026-10-14T05:00', '2026-10-14T19:00', {
    routeId: 'sec', stFrom: 'Сосновка', stTo: 'Липки',
    legs: [{ id: 'l', start: '2026-10-14T11:00', routeId: 'sec', stFrom: 'Липки', stTo: 'Сосновка', routeLabel: 'Липки → Сосновка' }],
  });
  assert.equal(routeOf(t), 'Сосновка → Липки → Сосновка');
  assert.deepEqual(legsOf(t).map(legKm), [40, 40]);
  assert.equal(houseOf(t), 'Сосновка');
});

test('награды и «Вёрсты»: километры части участка', () => {
  S.trips = [
    T('a', '2026-10-10T05:00', '2026-10-10T09:00', { routeId: 'sec', stFrom: 'Сосновка', stTo: 'Ольховка' }),
    T('b', '2026-10-11T05:00', '2026-10-11T09:00', { routeId: 'sec' }),
  ];
  assert.equal(computeAwards().c.km, 120);
});

test('переименовали станцию на участке — поездки тоже; удалили участок — станции остаются в подписи', async () => {
  S.trips = [];
  await saveTrip(T('t', '2026-10-14T05:00', '2026-10-14T11:00', { routeId: 'sec', stFrom: 'Липки', stTo: 'Сосновка', routeLabel: 'Липки → Сосновка' }));
  const r = { ...SEC(), from: 'Сосновка-1', stations: ['Ольховка', 'Липецкая', 'Дубки', 'Клёны'] };
  await saveSection(r, [['Сосновка', 'Сосновка-1'], ['Липки', 'Липецкая']]);
  const t = S.trips[0];
  assert.deepEqual([t.stFrom, t.stTo, t.routeLabel], ['Липецкая', 'Сосновка-1', 'Липецкая → Сосновка-1']);
  assert.equal(legKm(t), 40);
  await deleteRoute('sec');
  const u = S.trips[0];
  assert.equal(u.routeId, null);
  assert.equal(u.stFrom, undefined);
  assert.equal(routeOf(u), 'Липецкая → Сосновка-1');
});

test('поездки напарнику: станции внутри участка находят свой участок, а не создают новый', async () => {
  assert.deepEqual(sectionFor('Сосновка', 'Берёзово'), { routeId: 'sec' });
  assert.deepEqual(sectionFor('Клёны', 'Ольховка'), { routeId: 'sec', stFrom: 'Клёны', stTo: 'Ольховка' });
  assert.equal(sectionFor('Сосновка', 'Нигде'), null);
  globalThis.location = { origin: 'https://cabina-app.ru', pathname: '/' };
  const t = T('t', '2026-10-14T05:00', '2026-10-14T11:00', { routeId: 'sec', stFrom: 'Липки', stTo: 'Клёны', routeLabel: 'Липки → Клёны' });
  const code = await encodeTrips([t]);
  S.trips = [];
  const { items } = await decodeShare(code, NOW);
  assert.deepEqual([items[0].from, items[0].to, items[0].km], ['Липки', 'Клёны', 40], 'уходят станции и километры части');
  await importItems(items);
  assert.equal(S.routes.length, 1);
  assert.deepEqual([S.trips[0].routeId, S.trips[0].stFrom, S.trips[0].stTo], ['sec', 'Липки', 'Клёны']);
});

test('настройки депо: станции участка уходят и приходят, прежний код без станций читается', async () => {
  const p = depotPayload();
  assert.deepEqual(p.r[0].slice(0, 2), ['Сосновка', 'Берёзово']);
  assert.deepEqual(p.r[0][8], ['Ольховка', 'Липки', 'Дубки', 'Клёны']);
  const data = await decodeDepot(await encodeDepot(p));
  assert.deepEqual(data.routes[0].stations, ['Ольховка', 'Липки', 'Дубки', 'Клёны']);
  assert.equal(data.routes[0].distanceKm, 100);
  // у получателя тот же участок без станций — «обновить нормы и станции»
  S.routes = [{ id: 'x', from: 'Сосновка', to: 'Берёзово', distanceKm: 100, weightNorm: 5199 }];
  const { items } = depotItems(data);
  assert.equal(items.length, 1);
  assert.ok(items[0].diff.includes('stations'));
  await applyDepot(items);
  assert.deepEqual(S.routes[0].stations, ['Ольховка', 'Липки', 'Дубки', 'Клёны']);
  // мусор в станциях отбрасывается: концы, повторы, не строки
  const bad = { v: 1, r: [['А', 'Б', 0, 0, 0, 0, 0, 0, ['А', 'В', 'в', 5, '', 'Г']]], h: [] };
  const got = await decodeDepot(`j${Buffer.from(JSON.stringify(bad)).toString('base64url')}`);
  assert.deepEqual(got.routes[0].stations, ['В', 'Г']);
});

test('старые маршруты и поездки после обновления — как были', () => {
  S.routes = [{ id: 'old', from: 'Сосновка', to: 'Ольховка', distanceKm: 50 }];
  const t = T('t', '2026-10-14T05:00', '2026-10-14T11:00', { routeId: 'old', routeLabel: 'Сосновка → Ольховка' });
  assert.equal(routeOf(t), 'Сосновка → Ольховка');
  assert.equal(legKm(t), 50);
  assert.equal(houseOf(t), 'Ольховка');
});
