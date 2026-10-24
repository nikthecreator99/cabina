// CABINA 2.3: напоминание о медкомиссии и квиток в PDF. Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastMedical, medDue, medReminder, MED_REMIND_DAYS } from '../../js/med.js';
import { pdfFromJpeg } from '../../js/slip.js';

const abs = [
  { id: '1', type: 'medical', start: '2025-10-25', end: '2025-10-25' },
  { id: '2', type: 'vacation', start: '2026-07-01', end: '2026-07-28' },
  { id: '3', type: 'medical', start: '2024-10-01', end: '2024-10-01' },
];
const on = { on: true, months: 12, dismissed: null };

test('медкомиссия: последняя — самая поздняя «Медкомиссия», остальные отвлечения не считаются', () => {
  assert.equal(lastMedical(abs), '2025-10-25');
  assert.equal(lastMedical([abs[1]]), null);
});

test('медкомиссия: следующая через год по умолчанию, можно через полгода или 2 года', () => {
  assert.equal(medDue('2025-10-25'), '2026-10-25');
  assert.equal(medDue('2025-10-25', 6), '2026-04-25');
  assert.equal(medDue('2025-10-25', 24), '2027-10-25');
  assert.equal(medDue('2024-02-29', 12), '2025-02-28', '29 февраля → 28 февраля');
  assert.equal(medDue(null), null);
});

test('медкомиссия: напоминание за 2 недели и после срока, пока не скрыто', () => {
  assert.equal(MED_REMIND_DAYS, 14);
  assert.equal(medReminder('2026-10-10', abs, on), null, 'за 15 дней — ещё рано');
  assert.deepEqual(medReminder('2026-10-11', abs, on), { last: '2025-10-25', due: '2026-10-25', left: 14 });
  assert.equal(medReminder('2026-10-25', abs, on).left, 0);
  assert.equal(medReminder('2026-11-03', abs, on).left, -9, 'после срока напоминание остаётся');
  assert.equal(medReminder('2026-10-20', abs, { ...on, on: false }), null, 'выключено — не напоминаем');
  assert.equal(medReminder('2026-10-20', abs, { ...on, dismissed: '2026-10-25' }), null, 'скрыто до следующей');
  assert.equal(medReminder('2026-10-20', [], on), null, 'нет медкомиссий — нет срока');
  // новая медкомиссия сдвигает срок, и скрытое раньше напоминание больше не мешает
  const next = [...abs, { id: '4', type: 'medical', start: '2026-10-19', end: '2026-10-19' }];
  assert.equal(medReminder('2027-10-06', next, { ...on, dismissed: '2026-10-25' }).due, '2027-10-19');
});

test('PDF: правильная структура, таблица ссылок указывает на объекты, картинка целиком', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5, 0xff, 0xd9]);
  const pdf = pdfFromJpeg(jpeg, 100, 141, { title: 'CABINA — Октябрь 2026' });
  const s = Buffer.from(pdf).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const xref = +s.match(/startxref\n(\d+)/)[1];
  assert.equal(s.slice(xref, xref + 4), 'xref');
  const offs = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => +m[1]);
  assert.equal(offs.length, 6);
  offs.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.match(s, /\/Width 100 \/Height 141 .*\/Filter \/DCTDecode \/Length 9 >>/);
  const at = s.indexOf('stream\n', s.indexOf('/DCTDecode')) + 7;
  assert.deepEqual([...pdf.slice(at, at + jpeg.length)], [...jpeg]);
  assert.match(s, /\/Title <FEFF0043004100420049004E0041/);
});
