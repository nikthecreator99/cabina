// CABINA 2.19.7: смена локомотива в одной поездке и следование пассажиром без окончания.
// Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S, routeOf, stationsOf, legAt, locosOf, locosText, timeNorms, usesRoute, deleteRoute, saveRoute, saveTrip } from '../../js/store.js';
import { tripStats, validateTrip, legsOf, hasLegs, parseLocal, MIN, LEGS_MAX } from '../../js/calc.js';
import { routeEnds, houseOf } from '../../js/rest.js';
import { tripPay, payMonth, heavyMin, heavyCount, payCfg } from '../../js/pay.js';
import { computeAwards } from '../../js/awards.js';
import { encodeTrips, decodeShare, importItems } from '../../js/share.js';
import { statusPayload } from '../../js/colleagues.js';
import { profileStatus } from '../../js/profile.js';

const NOW = parseLocal('2026-10-20T12:00');
const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], restType: 'turnaround', routeId: null, routeLabel: '', locoType: '', locoNumber: '', kind: 'freight', ...extra });
const R = (id, from, to, extra = {}) => ({ id, from, to, createdAt: 1, ...extra });

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, tz: 'Europe/Moscow', pay: { main: { rates: [{ from: null, rate: 300 }], bonus: 0, rk: 0, sn: 0, night: 0, harm: 0 } } };
});

// туда на одном локомотиве, обратно на другом, потом пассажиром
const roundTrip = (extra = {}) => T('t', '2026-10-14T05:00', '2026-10-14T19:00', {
  routeId: 'ab', locoType: '2ЭС5К', locoNumber: '355', weight: 6100,
  legs: [{ id: 'l1', start: '2026-10-14T11:00', routeId: 'ba', routeLabel: 'Ольховка → Сосновка', locoType: 'ВЛ80С', locoNumber: '1234', weight: 5000 }],
  passenger: [{ id: 'p', start: '2026-10-14T16:00', end: '2026-10-14T19:00' }],
  ...extra,
});

test('плечи: первая — сама поездка, следующая — с времени смены до окончания; работа на каждом локомотиве без пассажира', () => {
  const t = roundTrip();
  assert.equal(hasLegs(t), true);
  const legs = legsOf(t);
  assert.deepEqual(legs.map((l) => [l.start, l.end, l.locoNumber, l.kind]), [['2026-10-14T05:00', '2026-10-14T11:00', '355', 'freight'], ['2026-10-14T11:00', '2026-10-14T19:00', '1234', 'freight']]);
  const st = tripStats(t);
  assert.equal(st.work, 14 * 60, 'рабочее время — вся поездка, как раньше');
  assert.equal(st.pass, 3 * 60);
  assert.deepEqual(st.legs.map((x) => x.work), [6 * 60, 5 * 60], 'второй локомотив — с 11:00 до 16:00, дальше пассажиром');
  assert.equal(st.legs[0].work + st.legs[1].work, st.work - st.pass - st.wait, 'в сумме — вся работа на локомотиве');
  // поездка без смены — без legs и как раньше
  assert.equal(tripStats(T('x', '2026-10-14T05:00', '2026-10-14T10:00')).legs, undefined);
  assert.equal(legsOf(T('x', '2026-10-14T05:00', '2026-10-14T10:00')).length, 1);
});

test('плечи через полночь месяца делятся по месяцам', () => {
  const t = T('m', '2026-10-31T20:00', '2026-11-01T08:00', { legs: [{ id: 'l', start: '2026-11-01T02:00' }] });
  const st = tripStats(t);
  assert.deepEqual(st.legs[0].byMonth, { '2026-10': 240, '2026-11': 120 });
  assert.deepEqual(st.legs[1].byMonth, { '2026-11': 360 });
});

test('проверка смены локомотива: время обязательно, по порядку, внутри поездки, не в будущем у поездки «в пути»', () => {
  const ok = roundTrip();
  assert.equal(validateTrip(ok), null);
  const leg = (start) => ({ ...ok, legs: [{ ...ok.legs[0], start }] });
  assert.match(validateTrip(leg('')), /Второй локомотив: укажите дату и время смены/);
  assert.match(validateTrip(leg('2026-10-14T05:00')), /позже начала поездки/);
  assert.match(validateTrip(leg('2026-10-14T19:00')), /раньше окончания поездки/);
  const two = { ...ok, legs: [ok.legs[0], { id: 'l2', start: '2026-10-14T10:00' }] };
  assert.match(validateTrip(two), /Третий локомотив: смена должна быть позже, чем на второй/);
  const live = T('v', '2026-10-20T05:00', '', { legs: [{ id: 'l', start: '2026-10-20T13:00' }] });
  assert.match(validateTrip(live, { live: true, now: NOW }), /время смены ещё не наступило/);
  live.legs[0].start = '2026-10-20T11:30';
  assert.equal(validateTrip(live, { live: true, now: NOW }), null);
  const many = { ...ok, legs: Array.from({ length: LEGS_MAX + 1 }, (_, i) => ({ id: `l${i}`, start: `2026-10-14T${String(6 + i).padStart(2, '0')}:00` })) };
  assert.match(validateTrip(many), /не больше 5 локомотивов/);
});

test('пассажиром без окончания: в пути — до текущего момента, у законченной поездки — до её окончания', () => {
  const live = T('v', '2026-10-20T05:00', '', { passenger: [{ id: 'p', start: '2026-10-20T10:00', end: '' }] });
  assert.equal(validateTrip(live, { live: true, now: NOW }), null);
  const st = tripStats(live, NOW);
  assert.equal(st.work, 7 * 60);
  assert.equal(st.pass, 2 * 60, 'с 10:00 до «сейчас» (12:00) — следование пассажиром');
  // пассажиром после окончания самой поездки: живая поездка всё равно «в пути» до сейчас
  const after = T('v2', '2026-10-20T05:00', '', { passenger: [{ id: 'p', start: '2026-10-20T13:00', end: '' }] });
  assert.equal(tripStats(after, NOW).pass, 0, 'ещё не началось — не считается');
  // законченная поездка с незакрытым следованием (например, из старой копии) — до окончания поездки
  const done = T('d', '2026-10-14T05:00', '2026-10-14T18:00', { passenger: [{ id: 'p', start: '2026-10-14T15:00', end: '' }] });
  assert.equal(validateTrip(done), null);
  assert.equal(tripStats(done).pass, 3 * 60);
  // две без окончания — нельзя; началась после окончания поездки — нужно окончание
  const two = { ...live, passenger: [{ id: 'a', start: '2026-10-20T09:00', end: '' }, { id: 'b', start: '2026-10-20T10:00', end: '' }] };
  assert.match(validateTrip(two, { live: true, now: NOW }), /только одно следование пассажиром/);
  const late = { ...done, passenger: [{ id: 'p', start: '2026-10-14T18:30', end: '' }] };
  assert.match(validateTrip(late), /укажите окончание — оно началось после окончания поездки/);
  assert.match(validateTrip({ ...done, passenger: [{ id: 'p', start: '', end: '' }] }), /Заполните начало следования пассажиром №1/);
});

test('маршрут поездки со сменой: «А → Б → А», концы и дом отдыха — по последнему локомотиву', () => {
  S.routes = [R('ab', 'Сосновка', 'Ольховка', { distanceKm: 120 }), R('ba', 'Ольховка', 'Сосновка', { distanceKm: 120, walkMin: 25 }), R('bc', 'Ольховка', 'Берёзовка')];
  const t = roundTrip();
  assert.deepEqual(stationsOf(t), ['Сосновка', 'Ольховка', 'Сосновка']);
  assert.equal(routeOf(t), 'Сосновка → Ольховка → Сосновка');
  assert.deepEqual(routeEnds(t), { from: 'Сосновка', to: 'Сосновка' });
  assert.equal(houseOf(t), 'Сосновка');
  assert.equal(houseOf({ ...t, legs: [{ ...t.legs[0], routeId: 'bc' }] }), 'Берёзовка');
  // плечи не стыкуются — через запятую; у второго нет маршрута — только известное
  const odd = { ...t, legs: [{ ...t.legs[0], routeId: null, routeLabel: 'Липовка → Дубки' }] };
  assert.equal(routeOf(odd), 'Сосновка → Ольховка, Липовка → Дубки');
  const none = { ...t, legs: [{ ...t.legs[0], routeId: null, routeLabel: '' }] };
  assert.equal(routeOf(none), 'Сосновка → Ольховка');
  assert.equal(routeEnds(none), null, 'куда приехали — неизвестно');
  assert.equal(houseOf(none), null);
  // локомотивы, нормативы, поиск маршрута
  assert.deepEqual(locosOf(t), [{ type: '2ЭС5К', number: '355' }, { type: 'ВЛ80С', number: '1234' }]);
  assert.equal(locosText(t), '2ЭС5К №355, ВЛ80С №1234');
  assert.deepEqual(timeNorms(t), { accept: 0, depart: 0, walk: 25 }, 'окончание работы — по маршруту последнего локомотива');
  assert.equal(usesRoute(t, 'ba'), true);
  assert.equal(usesRoute(t, 'bc'), false);
  // статус: в пути — плечо, на котором едут сейчас
  assert.equal(legAt(t, parseLocal('2026-10-14T09:00')).routeId, 'ab');
  assert.equal(legAt(t, parseLocal('2026-10-14T12:00')).routeId, 'ba');
});

test('доплата за тяжёлый поезд — у каждого локомотива по норме его маршрута', () => {
  S.routes = [R('ab', 'Сосновка', 'Ольховка', { weightNorm: 6000 }), R('ba', 'Ольховка', 'Сосновка', { weightNorm: 6000 })];
  const cfg = { ...payCfg(S.settings.pay, 'assistant'), norms: { ab: { weight: 6000 }, ba: { weight: 6000 } }, heavy: 15 };
  const t = roundTrip();
  const st = tripStats(t);
  assert.equal(heavyCount(t, cfg), 1);
  assert.equal(heavyMin(t, st, cfg), 6 * 60, 'только часы первого локомотива (6100 т > 6000 т)');
  assert.equal(heavyMin(t, st, cfg, '2026-10'), 6 * 60);
  // оба тяжёлые — вся работа на локомотиве
  const both = { ...t, legs: [{ ...t.legs[0], weight: 6500 }] };
  assert.equal(heavyMin(both, tripStats(both), cfg), 11 * 60);
  assert.equal(heavyCount(both, cfg), 2);
  // без смены — как раньше: вся работа на локомотиве
  const one = T('o', '2026-10-14T05:00', '2026-10-14T19:00', { routeId: 'ab', weight: 6100, passenger: t.passenger });
  assert.equal(heavyMin(one, tripStats(one), cfg), 11 * 60);
  // в заработке: 6 ч × 300 ₽ × 15% = 270 ₽ за тяжёлый поезд
  const base = { ...t, weight: 0 };
  const diff = tripPay(t, st, cfg).gross - tripPay(base, tripStats(base), cfg).gross;
  assert.ok(Math.abs(diff - 270) < 0.01, String(diff));
  const m = payMonth(2026, 10, [t], [], cfg, (x) => tripStats(x));
  const line = m.lines.find((l) => l.key === 'heavy');
  assert.equal(line.hours, 6);
  assert.ok(Math.abs(line.amount - 270) < 0.01);
  // резерв и манёвры — без доплаты, сколько бы ни весили
  assert.equal(heavyMin({ ...both, kind: 'reserve' }, tripStats(both), cfg), 0);
});

test('награды: километры, локомотивы и тяжеловесы — по каждому локомотиву', () => {
  S.routes = [R('ab', 'Сосновка', 'Ольховка', { distanceKm: 120, weightNorm: 6000 }), R('ba', 'Ольховка', 'Сосновка', { distanceKm: 120, weightNorm: 4000 })];
  S.trips = [roundTrip()];
  const { c } = computeAwards();
  assert.equal(c.km, 240);
  assert.equal(c.noKm, 0);
  assert.equal(c.locos, 2);
  assert.equal(c.heavy, 2, 'у обоих поезд тяжелее нормы своего маршрута');
  // у второго нет расстояния — подсказка «в N поездках нет расстояния»
  S.routes[1].distanceKm = null;
  assert.equal(computeAwards().c.noKm, 1);
});

test('напарнику: смена локомотива уходит и приходит, маршруты создаются у каждого локомотива', async () => {
  S.routes = [R('ab', 'Сосновка', 'Ольховка', { distanceKm: 120 }), R('ba', 'Ольховка', 'Сосновка', { distanceKm: 121 })];
  const t = roundTrip({ legs: [{ ...roundTrip().legs[0], axles: 300, length: 70 }] });
  globalThis.location = { origin: 'https://cabina-app.ru', pathname: '/' };
  const code = await encodeTrips([t]);
  S.routes = []; S.trips = [];
  const { items } = await decodeShare(code, NOW);
  assert.equal(items.length, 1);
  const [it] = items;
  assert.deepEqual([it.from, it.to, it.km], ['Сосновка', 'Ольховка', 120]);
  assert.deepEqual(it.legs.map((e) => [e.from, e.to, e.km]), [['Ольховка', 'Сосновка', 121]]);
  const [l] = it.trip.legs;
  assert.deepEqual([l.start, l.locoType, l.locoNumber, l.weight, l.axles, l.length], ['2026-10-14T11:00', 'ВЛ80С', '1234', 5000, 300, 70]);
  assert.notEqual(l.id, 'l1', 'id — новые');
  await importItems(items);
  assert.equal(S.routes.length, 2);
  const saved = S.trips[0];
  assert.equal(routeOf(saved), 'Сосновка → Ольховка → Сосновка');
  assert.equal(S.routes.find((r) => r.id === saved.legs[0].routeId).distanceKm, 121);
});

test('напарнику: неверная смена локомотива — поездку не берём', async () => {
  const enc = (obj) => `j${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
  const base = Math.round(parseLocal('2026-10-14T06:00') / MIN);
  const e = Math.round(Date.now() / MIN) + 60;
  const res = await decodeShare(enc({ v: 2, b: base, e, t: [
    { a: 0, d: 600, g: [{ s: 120, lt: '<b>ВЛ</b>', ln: '1'.repeat(40), w: 1e9 }] }, // хорошая (текст — как текст, лишнее обрезано)
    { a: 0, d: 600, g: [{ s: 600 }] }, // смена в момент окончания
    { a: 0, d: 600, g: [{ s: 0 }] }, // в момент явки
    { a: 0, d: 600, g: [{ s: 300 }, { s: 200 }] }, // не по порядку
    { a: 0, d: 600, g: Array.from({ length: LEGS_MAX + 1 }, (_, i) => ({ s: 10 + i })) }, // слишком много
    { a: 0, d: 600, g: 'смена' },
    { a: 0, d: 600, g: [null] },
  ] }), NOW);
  assert.equal(res.items.length, 1);
  assert.equal(res.skipped, 6);
  const [l] = res.items[0].trip.legs;
  assert.equal(l.locoType, '<b>ВЛ</b>');
  assert.equal(l.locoNumber.length, 12);
  assert.equal(l.weight, undefined);
});

test('удалили маршрут — у второго локомотива остаётся его название', async () => {
  await saveRoute(R('ab', 'Сосновка', 'Ольховка'));
  await saveRoute(R('ba', 'Ольховка', 'Сосновка'));
  await saveTrip(roundTrip());
  await deleteRoute('ba');
  const t = S.trips.find((x) => x.id === 't');
  assert.equal(t.legs[0].routeId, null);
  assert.equal(t.legs[0].routeLabel, 'Ольховка → Сосновка');
  assert.equal(routeOf(t), 'Сосновка → Ольховка → Сосновка');
});

test('статус для коллег и в профиле — плечо, по которому едут сейчас', () => {
  S.routes = [R('ab', 'Сосновка', 'Ольховка'), R('ba', 'Ольховка', 'Сосновка')];
  const t = roundTrip({ end: '' });
  const p = statusPayload({ kind: 'trip', trip: t, start: parseLocal(t.start), leg: legAt(t, parseLocal('2026-10-14T12:00')) }, 0);
  assert.deepEqual([p.p_place, p.p_dest], ['Ольховка', 'Сосновка']);
  // профиль: живая поездка сегодня, сменили в 09:00
  S.trips = [T('v', '2026-10-20T05:00', '', { routeId: 'ab', legs: [{ id: 'l', start: '2026-10-20T09:00', routeId: 'ba' }] })];
  const st = profileStatus(NOW);
  assert.equal(st.label, 'В пути с\u00a005:00'); // 2.22: время в заголовке, ниже — откуда и куда
  assert.equal(st.sub, 'Ольховка → Сосновка');
});
