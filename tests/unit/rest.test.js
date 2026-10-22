// Отдых в пункте оборота и полный (домашний) отдых, поиск поездки «туда и обратно».
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { turnaroundRest, homeRestMulti, tripStats, parseLocal, fmtLocal, MIN } from '../../js/calc.js';
import { S, statsOf } from '../../js/store.js';
import { computeHomeRest, suggestChain } from '../../js/forms.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, ...extra });

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, minRest: 240 };
});

test('отдых в пункте оборота: половина рабочего времени, но не меньше минимума', () => {
  const end = parseLocal('2026-10-15T07:30');
  const long = turnaroundRest(690, end, 240);
  assert.equal(long.rest, 345);
  assert.equal(fmtLocal(long.until), '2026-10-15T13:15');
  const short = turnaroundRest(300, end, 240);
  assert.equal(short.rest, 240);
  assert.equal(fmtLocal(short.until), '2026-10-15T11:30');
});

test('полный отдых: рабочее время × 2,6 минус промежутки между поездками', () => {
  const a = tripStats(T('a', '2026-10-14T08:00', '2026-10-14T14:00'));
  const b = tripStats(T('b', '2026-10-14T20:00', '2026-10-15T02:00'));
  const r = homeRestMulti([b, a]); // порядок не важен
  assert.equal(r.work, 720);
  assert.equal(r.gap, 360);
  assert.equal(r.full, 720 * 2.6 - 360);
  assert.equal(r.withDayOff, r.full + 24 * 60);
  assert.equal(fmtLocal(r.fullUntil), fmtLocal(b.end + r.full * MIN));
  assert.equal(r.early, a);
  assert.equal(r.late, b);
  assert.equal(r.valid, true);
  // по одной поездке
  const one = homeRestMulti([a]);
  assert.equal(one.full, 936);
  assert.equal(one.gap, 0);
  // промежуток больше отдыха — расчёт недействителен
  const far = tripStats(T('c', '2026-10-20T08:00', '2026-10-20T09:00'));
  assert.equal(homeRestMulti([a, far]).valid, false);
});

test('домашний отдых по выбранным поездкам', () => {
  const a = T('a', '2026-10-14T08:00', '2026-10-14T14:00', { restType: 'turnaround' });
  const b = T('b', '2026-10-14T20:00', '2026-10-15T02:00', { restType: 'home' });
  S.trips = [a];
  const r = computeHomeRest(b, ['a', 'b'], S.trips);
  assert.equal(r.full, 1512);
  assert.equal(r.earlyTrip, a);
  assert.equal(r.lateTrip, b);
  assert.equal(computeHomeRest(b, [], S.trips), null);
  assert.deepEqual(computeHomeRest(b, ['gone', 'b'], S.trips), { missing: true });
});

test('поиск всей поездки туда и обратно по маршрутам', () => {
  S.routes = [
    { id: 'r1', from: 'Малошуйка', to: 'Сумский Посад' },
    { id: 'r2', from: 'Сумский Посад', to: 'Малошуйка' },
  ];
  const older = T('o', '2026-10-10T08:00', '2026-10-10T14:00', { routeId: 'r2', restType: 'home' });
  const there = T('a', '2026-10-14T08:00', '2026-10-14T14:00', { routeId: 'r1', restType: 'turnaround' });
  const back = T('b', '2026-10-14T20:00', '2026-10-15T02:00', { routeId: 'r2', restType: 'home' });
  S.trips = [older, there];
  S.trips.forEach(statsOf);
  const res = suggestChain(back);
  assert.deepEqual(res.chain.map((c) => c.id), ['a', 'b']);
  assert.equal(res.path, 'Малошуйка → Сумский Посад → Малошуйка');
  assert.equal(res.roundTrip, true);
});

test('цепочка рвётся, если маршруты не стыкуются или перерыв больше 48 ч', () => {
  S.routes = [{ id: 'r1', from: 'А', to: 'Б' }, { id: 'r3', from: 'В', to: 'А' }];
  const prev = T('p', '2026-10-14T08:00', '2026-10-14T14:00', { routeId: 'r1', restType: 'turnaround' });
  const cur = T('c', '2026-10-14T20:00', '2026-10-15T02:00', { routeId: 'r3' });
  S.trips = [prev];
  assert.deepEqual(suggestChain(cur).chain.map((c) => c.id), ['c']);

  // подпись маршрута без сохранённого маршрута тоже работает, регистр и «ё» не важны
  const p2 = T('p2', '2026-10-14T08:00', '2026-10-14T14:00', { routeLabel: 'Пёстрое → Б', restType: 'turnaround' });
  const c2 = T('c2', '2026-10-14T20:00', '2026-10-15T02:00', { routeLabel: 'б → пестрое' });
  S.trips = [p2];
  const r2 = suggestChain(c2);
  assert.deepEqual(r2.chain.map((c) => c.id), ['p2', 'c2']);
  assert.equal(r2.roundTrip, true);

  const old = T('old', '2026-10-10T08:00', '2026-10-10T14:00', { restType: 'turnaround' });
  S.trips = [old];
  assert.deepEqual(suggestChain(T('n', '2026-10-14T20:00', '2026-10-15T02:00')).chain.map((c) => c.id), ['n']);
});
