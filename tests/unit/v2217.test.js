// CABINA 2.21.7: «Напомнить в календаре» — файл .ics с одним событием, без станций и номеров.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText, icsEsc, alarmAt, REMIND, restRemindKind } from '../../js/remind.js';
import { parseLocal } from '../../js/calc.js';

const H = 3600000;

test('событие со временем: начало в UTC по смещению пояса, напоминание заранее', () => {
  const t = icsText({ title: 'CABINA: явка', at: parseLocal('2026-10-21T09:30'), before: 120, off: 3 * H, id: 'abc', stamp: Date.UTC(2026, 9, 20, 9, 0) });
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
  assert.match(t, /\r\nDTSTART:20261021T063000Z\r\nDTEND:20261021T064500Z\r\n/);
  assert.match(t, /\r\nTRIGGER:-PT120M\r\n/);
  assert.match(t, /\r\nSUMMARY:CABINA: явка\r\n/);
  assert.match(t, /\r\nUID:abc@cabina-app\.ru\r\n/);
  assert.match(t, /\r\nDTSTAMP:20261020T090000Z\r\n/);
  const lines = t.split('\r\n');
  assert.equal(lines.filter((l) => l.startsWith('BEGIN:')).length, lines.filter((l) => l.startsWith('END:')).length);
});

test('событие на весь день (медкомиссия) и напоминание «в это время»', () => {
  const t = icsText({ title: 'CABINA: срок медкомиссии', date: '2026-12-31', before: 10080 });
  assert.match(t, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.match(t, /TRIGGER:-PT10080M/);
  assert.match(icsText({ title: 'x', at: parseLocal('2026-10-21T09:30') }), /TRIGGER:PT0M/);
});

test('текст экранируется, в заголовках нет станций и номеров', () => {
  assert.equal(icsEsc('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  for (const r of Object.values(REMIND)) {
    assert.match(r.title, /^CABINA: [а-яё ]+$/);
    assert.ok(r.befores.some(([v]) => v === r.def));
  }
  assert.equal(restRemindKind('queue'), 'queue');
  assert.equal(restRemindKind('dayOff'), 'dayOff');
  assert.equal(restRemindKind('full'), 'rest');
  assert.equal(restRemindKind('turnaround'), 'rest');
});

test('когда звенит: время минус «заранее», для дня — 09:00', () => {
  assert.equal(alarmAt({ at: parseLocal('2026-10-21T09:30'), before: 60 }), parseLocal('2026-10-21T08:30'));
  assert.equal(alarmAt({ date: '2026-12-31', before: 1440 }), parseLocal('2026-12-30T09:00'));
});
