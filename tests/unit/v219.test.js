// CABINA 2.19: депо пишется одинаково, награды и рекорды, поездки напарнику (упаковка, проверка присланного).
// Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { parseLocal, MIN } from '../../js/calc.js';
import { normDepot } from '../../js/profile.js';
import { computeAwards, awardSnapshot, awardNews, awardArt, AWARDS, MEDALS_TOTAL } from '../../js/awards.js';
import { encodeTrips, decodeShare, codeFrom, shareUrl, shareable, importItems } from '../../js/share.js';

const NOW = parseLocal('2026-10-20T12:00');
const T = (id, start, end, extra = {}) => ({ id, start, end, passenger: [], waiting: [], restType: 'turnaround', routeId: null, routeLabel: '', locoType: '', locoNumber: '', ...extra });

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, pay: { main: { rates: [{ from: null, rate: 300 }] } } };
});

test('депо: «тд64», «тд 64», «Тд-64», «td64» → «ТД-64»; названия словами не трогаем', () => {
  for (const v of ['тд64', 'тд 64', 'Тд-64', ' ТД–64 ', 'td64', 'Tд64']) assert.equal(normDepot(v), 'ТД-64', v);
  assert.equal(normDepot('тч 13'), 'ТЧ-13');
  assert.equal(normDepot('TCH-13'), 'ТЧ-13');
  assert.equal(normDepot('тчэ13'), 'ТЧЭ-13');
  assert.equal(normDepot('тч13 Няндома'), 'ТЧ-13 Няндома');
  assert.equal(normDepot('Малошуйка'), 'Малошуйка');
  assert.equal(normDepot('64'), '64');
  assert.equal(normDepot('fg12'), 'fg12', 'латиница, которую нельзя прочитать по-русски, остаётся как есть');
  assert.equal(normDepot('тд64\u0000'), 'ТД-64', 'служебные символы убираются');
  assert.ok(normDepot('x'.repeat(100)).length <= 60);
});

const pad = (n) => String(n).padStart(2, '0');

test('награды: первая поездка, «Железная пятая точка» за каждую поездку от 12 ч (счётчик), километры по ступеням', () => {
  S.routes = [{ id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 4000 }];
  S.trips = [
    T('a', '2026-10-01T08:00', '2026-10-01T19:00', { routeId: 'r1' }),
    T('b', '2026-10-03T08:00', '2026-10-03T20:30', { routeId: 'r1' }),
    T('c', '2026-10-05T08:00', '2026-10-05T16:00', { routeId: 'r1' }),
    T('d', '2026-10-07T08:00', '2026-10-07T20:00', { routeId: 'r1' }),
  ];
  const { aw, c, records } = computeAwards();
  assert.deepEqual(aw.first.days, ['2026-10-01']);
  assert.equal(aw.iron.n, 2, '12 ч 30 мин и ровно 12 ч');
  assert.equal(aw.iron.tier, 1, 'бронза с первой, серебро — с 10-й');
  assert.deepEqual(aw.iron.days, ['2026-10-03']);
  assert.equal(aw.iron.last, '2026-10-07');
  assert.equal(c.km, 16000);
  assert.equal(aw.km.tier, 1, '10 000 км — бронза; серебро — 40 075 (вокруг Земли)');
  assert.deepEqual(aw.km.days, ['2026-10-05']);
  assert.equal(aw.trips.tier, 0, 'маршрутные листы — с 50 поездок');
  assert.equal(records.longest.t.id, 'b');
  assert.equal(records.longest.min, 12 * 60 + 30);
  assert.equal(records.monthTrips.n, 4);
});

test('награды: ночная сова, часы, разные локомотивы, месяц от 200 ч; Новый год и праздники — по разу за каждый', () => {
  S.trips = Array.from({ length: 20 }, (_, i) => T(`n${i}`, `2026-10-${pad(i + 1)}T20:00`, `2026-10-${pad(i + 2)}T06:00`, { locoType: '2ТЭ10М', locoNumber: String(1000 + i) }));
  for (const y of [2026, 2027, 2028]) S.trips.push(T(`ny${y}`, `${y}-12-31T20:00`, `${y + 1}-01-01T06:00`));
  const { aw, c } = computeAwards();
  assert.equal(c.night, 23 * 8 * 60);
  assert.equal(aw.owl.tier, 1, '100 ночных часов — бронза, 500 — серебро');
  assert.equal(aw.owl.days[0], '2026-10-14', '13-я ночь: 104 ч');
  assert.equal(c.locos, 20);
  assert.equal(aw.loco.tier, 1);
  assert.equal(aw.cabin.n, 1, 'в октябре ровно 200 ч');
  assert.equal(aw.cabin.tier, 1);
  assert.equal(aw.newyear.n, 3);
  assert.equal(aw.newyear.tier, 2, 'три Новых года — серебро, пять — золото');
  assert.equal(aw.holiday.n, 3, 'три разных 1 января');
  assert.equal(aw.hours.tier, 0, '230 ч — до 500 ещё далеко');
});

test('награды: «Ракета» — каждый раз, когда быстрее обычного на тот момент; ожидание от 4 ч; тяжеловес; без расстояния км не идут', () => {
  S.routes = [{ id: 'h', from: 'Ельник', to: 'Берёзово', weightNorm: 5199 }];
  const day = (i) => `2026-10-${pad(i)}`;
  S.trips = [
    ...[1, 2, 3].map((i) => T(`u${i}`, `${day(i)}T08:00`, `${day(i)}T18:00`, { routeLabel: 'А → Б' })),
    ...[4, 5, 6, 7, 8].map((i) => T(`f${i}`, `${day(i)}T08:00`, `${day(i)}T14:00`, { routeLabel: 'А → Б' })),
    T('w', `${day(10)}T08:00`, `${day(10)}T18:00`, { routeLabel: 'В → Г', passenger: [{ id: 'p', start: `${day(10)}T08:00`, end: `${day(10)}T10:00` }], waiting: [{ id: 'q', start: `${day(10)}T10:00`, end: `${day(10)}T14:10` }] }),
    T('hv', `${day(11)}T08:00`, `${day(11)}T16:00`, { routeId: 'h', weight: 6100 }),
    T('lt', `${day(12)}T08:00`, `${day(12)}T16:00`, { routeId: 'h', weight: 4000 }),
  ];
  const { aw, c, records } = computeAwards();
  assert.equal(aw.rocket.n, 4, '6 ч против обычных 10 ч, потом обычное сползает к 6 ч');
  assert.deepEqual(aw.rocket.days, [day(4)]);
  assert.equal(aw.wait.n, 1, 'ожидание 4 ч 10 мин');
  assert.equal(aw.heavy.n, 1, '6100 т при норме 5199 т');
  assert.equal(c.pass, 1);
  assert.equal(aw.pass.tier, 0);
  assert.equal(c.km, 0);
  assert.equal(c.noKm, 11);
  assert.equal(records.fastest, null, 'рекорд — от обычного времени сейчас: оно стало 6 ч, быстрее не было');
});

test('поздравление: новая ступень — окном, повтор — счётчиком, рекорд — когда было с чем сравнить', () => {
  S.trips = Array.from({ length: 6 }, (_, i) => T(`t${i}`, `2026-10-0${i + 1}T08:00`, `2026-10-0${i + 1}T16:00`));
  const before = awardSnapshot();
  assert.equal(awardNews(before), null, 'ничего не изменилось');
  S.trips.push(T('long', '2026-10-09T06:00', '2026-10-09T19:00'));
  const news = awardNews(before);
  assert.deepEqual(news.fresh.map((x) => [x.a.id, x.tier, x.n]), [['iron', 1, 1]]);
  assert.equal(news.repeats.length, 0);
  assert.equal(news.record, 13 * 60);
  const again = awardSnapshot();
  S.trips.push(T('long2', '2026-10-11T06:00', '2026-10-11T18:30'));
  const news2 = awardNews(again);
  assert.equal(news2.fresh.length, 0, 'ступень та же — бронза');
  assert.deepEqual(news2.repeats.map((x) => [x.a.id, x.n]), [['iron', 2]]);
  assert.equal(news2.record, 0, '12 ч 30 мин короче 13 ч');
});

test('награды: у каждой три ступени по возрастанию или одна особая, рисунки есть для всех ступеней', () => {
  assert.equal(new Set(AWARDS.map((a) => a.id)).size, AWARDS.length, 'id наград не повторяются');
  for (const a of AWARDS) {
    assert.ok(a.goals.length === 3 || (a.goals.length === 1 && a.color), a.id);
    for (let i = 1; i < a.goals.length; i++) assert.ok(a.goals[i] > a.goals[i - 1], a.id);
    if (a.repeat) assert.equal(a.goals[0], 1, `${a.id}: повторяемая — бронза с первого раза`);
    for (let t = 0; t <= a.goals.length; t++) {
      const svg = awardArt(a.id, 64, t);
      assert.match(svg, /^<svg/);
      assert.doesNotMatch(svg, /undefined|NaN/, `${a.id} ступень ${t}`);
    }
  }
  assert.equal(MEDALS_TOTAL, AWARDS.reduce((s, a) => s + a.goals.length, 0));
});

test('поездки напарнику: упаковали → распаковали то же самое, без заработка и заметок; маршрут найден или создан', async () => {
  S.routes = [{ id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 182.5 }];
  const trips = [
    T('a', '2026-10-14T06:00', '2026-10-14T17:00', { routeId: 'r1', kind: 'passenger', locoType: '2ТЭ116', locoNumber: '1234', weight: 5600, axles: 280, length: 71, routeNo: '778899', restType: 'turnaround',
      passenger: [{ id: 'p', start: '2026-10-14T15:00', end: '2026-10-14T17:00' }], waiting: [{ id: 'w', start: '2026-10-14T13:30', end: '2026-10-14T15:00' }], homeChoice: 'queue', note: 'секрет' }),
    T('b', '2026-10-15T03:10', '2026-10-15T12:00', { routeLabel: 'Ольховка → Сосновка', restType: 'home' }),
    T('live', '2026-10-20T08:00', ''),
  ];
  assert.equal(shareable(trips[2]), false, 'поездку «в пути» не отправить');
  globalThis.location = { origin: 'https://cabina-app.ru', pathname: '/' };
  const code = await encodeTrips(trips);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  assert.equal(codeFrom(shareUrl(code)), code);
  assert.equal(codeFrom(`Смотри: https://cabina-app.ru/#t=${code} — это наши поездки`), code);
  // у получателя своих поездок и маршрутов нет
  S.routes = []; S.trips = [];
  const { items, skipped } = await decodeShare(code, NOW);
  assert.equal(skipped, 0);
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.trip.start, '2026-10-14T06:00');
  assert.equal(a.trip.end, '2026-10-14T17:00');
  assert.deepEqual([a.from, a.to, a.km], ['Сосновка', 'Ольховка', 182.5]);
  assert.deepEqual([a.trip.kind, a.trip.locoType, a.trip.locoNumber, a.trip.weight, a.trip.axles, a.trip.length, a.trip.routeNo, a.trip.restType], ['passenger', '2ТЭ116', '1234', 5600, 280, 71, '778899', 'turnaround']);
  assert.deepEqual(a.trip.passenger.map((p) => [p.start, p.end]), [['2026-10-14T15:00', '2026-10-14T17:00']]);
  assert.deepEqual(a.trip.waiting.map((p) => [p.start, p.end]), [['2026-10-14T13:30', '2026-10-14T15:00']]);
  assert.notEqual(a.trip.id, 'a', 'id — новые');
  assert.equal(a.trip.homeChoice, null, 'выбор «на очередь» не передаётся');
  assert.equal(a.trip.note, undefined);
  assert.equal(b.trip.restType, 'home');
  assert.deepEqual([b.from, b.to, b.km], ['Ольховка', 'Сосновка', null]);
  assert.equal(a.dup, false);
  // добавили: маршрут создан один раз на две поездки в одну сторону
  const n = await importItems(items);
  assert.equal(n, 2);
  assert.equal(S.trips.length, 2);
  assert.equal(S.routes.length, 2);
  assert.equal(S.routes.find((r) => r.from === 'Сосновка').distanceKm, 182.5);
  // во второй раз те же поездки — «уже есть в это время»
  const again = await decodeShare(code, NOW);
  assert.deepEqual(again.items.map((x) => x.dup), [true, true]);
});

test('присланное проверяется: мусор, будущее, огромные и чужие значения не проходят', async () => {
  const enc = (obj) => `j${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
  const base = Math.round(parseLocal('2026-10-14T06:00') / MIN);
  await assert.rejects(decodeShare('zzzz', NOW), /повреждена|не код/);
  await assert.rejects(decodeShare('<script>', NOW), /не код CABINA/);
  await assert.rejects(decodeShare(enc({ v: 2, b: base, t: [] }), NOW), /более новой версии/);
  await assert.rejects(decodeShare(enc({ v: 1, b: 5, t: [] }), NOW), /повреждена/);
  const res = await decodeShare(enc({ v: 1, b: base, t: [
    { a: 0, d: 600, f: '<img src=x onerror=alert(1)>', to: 'Б', lt: 'x'.repeat(100), w: 1e9, ax: -5, k: 'z', r: 'evil', p: [[0, 60], ['a', 1], [0, 1e9]] },
    { a: 10 * 24 * 60, d: 60 }, // в будущем относительно «сейчас»
    { a: 0, d: 0 },
    { a: 1.5, d: 60 },
    'строка',
    { a: 0, d: 60, wt: [[0, 30], [30, 30]] }, // ожиданий больше, чем следований пассажиром
  ] }), NOW);
  assert.equal(res.items.length, 2);
  assert.equal(res.skipped, 4);
  const [x, y] = res.items;
  assert.equal(x.from, '<img src=x onerror=alert(1)>', 'текст сохраняется как текст — выводится через esc()');
  assert.equal(x.trip.locoType.length, 20);
  assert.equal(x.trip.weight, undefined);
  assert.equal(x.trip.axles, undefined);
  assert.equal(x.trip.kind, undefined);
  assert.equal(x.trip.restType, null);
  assert.equal(x.trip.passenger.length, 1);
  assert.equal(y.trip.waiting.length, 0);
  // слишком длинный код
  await assert.rejects(decodeShare(`z${'A'.repeat(9000)}`, NOW), /не код CABINA/);
});

test('QR-код: 20 поездок в одной ссылке помещаются и читаются обратно', async () => {
  const { default: qrcode } = await import('../../js/vendor/qrcode.js');
  const { default: jsQR } = await import('../../js/vendor/jsqr.js');
  const { qrSvg } = await import('../../js/share.js');
  S.routes = [{ id: 'r1', from: 'Сумский Посад', to: 'Малошуйка', distanceKm: 160 }, { id: 'r2', from: 'Малошуйка', to: 'Сумский Посад', distanceKm: 160 }];
  const trips = Array.from({ length: 20 }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return T(`t${i}`, `2026-09-${d}T0${i % 10}:15`, `2026-09-${d}T1${i % 10}:40`, { routeId: i % 2 ? 'r1' : 'r2', locoType: '2ТЭ116', locoNumber: String(1000 + i), weight: 5000 + i * 10 });
  });
  globalThis.location = { origin: 'https://cabina-app.ru', pathname: '/' };
  const url = shareUrl(await encodeTrips(trips));
  assert.ok(url.length < 1200, `ссылка ${url.length} символов`);
  assert.match(await qrSvg(url), /^<svg class="qr"/);
  // рисуем тот же код в пиксели и читаем, как камера
  const q = qrcode(0, 'M'); q.addData(url, 'Byte'); q.make();
  const n = q.getModuleCount(); const k = 4; const quiet = 4; const size = (n + quiet * 2) * k;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) {
    for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) { const i = (((r + quiet) * k + y) * size + (c + quiet) * k + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  }
  assert.equal(jsQR(px, size, size)?.data, url);
  S.trips = [];
  const { items } = await decodeShare(codeFrom(url), NOW);
  assert.equal(items.length, 20);
  assert.equal(items[19].trip.locoNumber, '1019');
});
