// 2.26.2 (просьба Никиты): статус поездки важнее выбранного отдыха — полного, выходного, «на очереди», «другого».
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocal, fmtLocal } from '../../js/calc.js';
import { S, tripNow } from '../../js/store.js';
import { currentRest, turnaroundNow, dayOffIntervals } from '../../js/rest.js';
import { statusFacts, profileStatus } from '../../js/profile.js';
import { statusPayload } from '../../js/colleagues.js';

const T = (id, start, end, extra = {}) => ({ id, start, end, ...extra });
const at = (s) => parseLocal(s);

beforeEach(() => {
  S.trips = []; S.routes = []; S.absences = []; S.notes = [];
  S.settings = { ...S.settings, minRest: 240, minShiftRest: 960, dayOffMin: 60 * 60, houses: {} };
});

// прошлая поездка с полным отдыхом до 21.10 03:12
const full = () => [
  T('a', '2026-10-19T08:00', '2026-10-19T14:00', { restType: 'turnaround' }),
  T('b', '2026-10-19T20:00', '2026-10-20T02:00', { restType: 'home', homeRest: { ids: ['a', 'b'] }, homeChoice: 'full' }),
];

test('поездка, записанная сразу с окончанием, идёт сейчас — «В пути», а не полный отдых', () => {
  S.trips = [...full(), T('c', '2026-10-20T10:00', '2026-10-20T18:00')];
  const now = at('2026-10-20T12:00');
  assert.equal(tripNow(now).trip.id, 'c');
  assert.equal(tripNow(now).soon, false);
  assert.equal(currentRest(now), null);
  assert.equal(statusFacts(now).kind, 'trip');
  assert.match(profileStatus(now).label, /^В пути/);
  assert.equal(statusPayload(statusFacts(now), 0).p_kind, 'trip');
  // выбор отдыха у прошлой поездки не стёрт
  assert.equal(S.trips[1].homeChoice, 'full');
});

test('явка на записанную заранее поездку в ближайшие 3 суток — «Скоро явка»', () => {
  S.trips = [...full(), T('c', '2026-10-20T20:00', '2026-10-21T04:00')];
  const now = at('2026-10-20T12:00');
  assert.equal(tripNow(now).soon, true);
  assert.equal(statusFacts(now).kind, 'soon');
  assert.equal(currentRest(now), null);
  // явка дальше чем через 3 суток — пока отдых
  S.trips[2] = T('c', '2026-10-24T20:00', '2026-10-25T04:00');
  assert.equal(tripNow(now), null);
  assert.equal(currentRest(now).kind, 'full');
  assert.equal(statusFacts(now).kind, 'between');
});

test('поездка «ждёт явки» важнее выходного', () => {
  S.trips = [T('d', '2026-10-19T22:00', '2026-10-20T06:00', { restType: 'home', homeChoice: 'dayOff' }), T('p', '2026-10-21T08:00', '')];
  const now = at('2026-10-20T12:00');
  assert.equal(statusFacts(now).kind, 'soon');
  // выходной заканчивается с явкой
  const iv = dayOffIntervals();
  assert.equal(fmtLocal(iv[0].e), '2026-10-21T08:00');
});

test('после поездки в пункт оборота — «На отдыхе», даже если раньше был выбран выходной', () => {
  S.trips = [
    T('d', '2026-10-19T22:00', '2026-10-20T06:00', { restType: 'home', homeChoice: 'dayOff' }),
    T('c', '2026-10-21T08:00', '2026-10-21T16:00', { restType: 'turnaround' }),
  ];
  // выходной до 22.10 18:00, но 21.10 вызвали
  const now = at('2026-10-21T18:00');
  assert.equal(statusFacts(now).kind, 'rest');
  assert.equal(profileStatus(now).label, 'На отдыхе');
  assert.equal(turnaroundNow(now).stage, 'rest');
  assert.equal(currentRest(now).kind, 'turnaround');
  // отдых вышел — «Жду явку», а не «На выходном»
  assert.equal(statusFacts(at('2026-10-22T10:00')).kind, 'wait');
  // в календаре выходной — до явки на поездку
  assert.equal(fmtLocal(dayOffIntervals()[0].e), '2026-10-21T08:00');
});

test('после новой поездки действует отдых, выбранный после неё; «Другое» — без отдыха', () => {
  S.trips = [...full(), T('c', '2026-10-20T10:00', '2026-10-20T16:00', { restType: 'home', homeChoice: 'queue' })];
  const now = at('2026-10-20T18:00');
  assert.equal(currentRest(now).kind, 'queue');
  assert.equal(statusFacts(now).rest.kind, 'queue');
  S.trips[2].homeChoice = 'other';
  assert.equal(currentRest(now), null);
  assert.equal(statusFacts(now).kind, 'between');
  assert.equal(statusFacts(now).rest, null);
});

test('отвлечение: поездка во время него важнее, начавшееся после поездки — важнее отдыха', () => {
  S.trips = [T('c', '2026-10-20T08:00', '2026-10-20T16:00', { restType: 'turnaround' })];
  S.absences = [{ id: 'x', type: 'study', start: '2026-10-19', end: '2026-10-23' }];
  assert.equal(statusFacts(at('2026-10-20T18:00')).kind, 'rest');
  S.absences = [{ id: 'x', type: 'sick', start: '2026-10-21', end: '2026-10-23' }];
  assert.equal(statusFacts(at('2026-10-21T10:00')).kind, 'abs');
});
