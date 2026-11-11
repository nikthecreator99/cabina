// CABINA 2.29: заметки о локомотивах от коллег — что уходит на сервер, что принимаем с сервера, награда «Полезный совет».
// Все имена, номера и идентификаторы — выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { buildSnapshot, notesPayload, NOTE_SHARE_MAX } from '../../js/colleagues.js';
import { computeAwards, countOf, AWARDS } from '../../js/awards.js';
import { monthText } from '../../js/loconotes.js';
import { parseLocal } from '../../js/calc.js';

const ME = '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d';
const ANNA = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const STRANGER = '99999999-8888-4777-8666-555555555555';
const N1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const N2 = 'aaaaaaaa-0000-4000-8000-000000000002';

beforeEach(() => { S.notes = []; S.trips = []; S.profile = { id: 'profile' }; });

test('на сервер — только заметки с «Показать коллегам»: серия, номер, текст до 300 знаков и месяц; без поездки и дня', () => {
  const at = Date.UTC(2026, 10, 3, 9, 30);
  S.notes = [
    { id: 'n1', tripId: 't1', type: '2ЭС5К', number: '№ 405', text: 'Не работает\n\nобогрев', shared: true, createdAt: at },
    { id: 'n2', type: 'ВЛ80С', number: '1702', text: 'Только себе', createdAt: at },
    { id: 'n3', type: '2ЭС5К', number: '406', text: 'x'.repeat(500), shared: true, createdAt: at - 40 * 864e5 },
    { id: 'n4', type: '2ЭС5К', number: '', text: 'без номера', shared: true, createdAt: at },
    { id: 'n5', type: '2ЭС5К', number: '1', text: '   ', shared: true, createdAt: at },
    { id: 'n6', type: '2ЭС5К', number: '7', text: 'не true', shared: 'yes', createdAt: at },
  ];
  const p = notesPayload(S.notes, 3 * 3600e3);
  assert.deepEqual(p.map((x) => x.k), ['n1', 'n3']);
  assert.deepEqual(p[0], { k: 'n1', t: '2ЭС5К', n: '405', b: 'Не работает обогрев', m: '2026-11' });
  assert.equal(p[1].b.length, NOTE_SHARE_MAX);
  assert.equal(p[1].m, '2026-09');
  for (const x of p) assert.deepEqual(Object.keys(x).sort(), ['b', 'k', 'm', 'n', 't'], 'ничего лишнего: ни поездки, ни времени');
});

test('с сервера: заметки только от моих коллег, мусор отбрасывается; свои — только число «полезно»', () => {
  const snap = buildSnapshot(ME, {
    consents: [], links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }], cards: [{ user_id: ANNA, name: 'Анна' }], access: [],
    notes: [
      { id: N1, user_id: ANNA, loco_type: '2ЭС5К', loco_num: '405', body: 'Течёт кран <b>машиниста</b>', month: '2026-10-01', useful: 2 },
      { id: N2, user_id: STRANGER, loco_type: '2ЭС5К', loco_num: '405', body: 'чужой', month: '2026-10-01', useful: 0 },
      { id: 'не-id', user_id: ANNA, loco_num: '1', body: 'x', month: '2026-10-01' },
      { id: N2, user_id: ANNA, loco_num: '', body: 'без номера', month: '2026-10-01' },
      { id: N2, user_id: ANNA, loco_num: '5', body: 'плохой месяц', month: '2026-13-01' },
      { id: N2, user_id: ME, note_key: 'n1', loco_num: '405', body: 'моя', month: '2026-11-01', useful: 3 },
      { id: N2, user_id: ME, note_key: 'n2', loco_num: '406', body: 'моя', month: '2026-11-01', useful: -5 },
      null, 'строка',
    ],
    votes: [{ note_id: N1.toUpperCase() }, { note_id: 'мусор' }],
  });
  assert.equal(snap.notesOn, true);
  assert.deepEqual(snap.locoNotes, [{ id: N1, from: ANNA, name: 'Анна', type: '2ЭС5К', number: '405', text: 'Течёт кран <b>машиниста</b>', month: '2026-10', useful: 2 }]);
  assert.deepEqual(snap.myNotes, { n1: 3, n2: 0 });
  assert.equal(snap.useful, 3);
  assert.deepEqual(snap.votes, [N1]);
  const old = buildSnapshot(ME, { consents: [], links: [], cards: [], access: [] });
  assert.equal(old.notesOn, false, 'старый сервер без таблицы — заметки коллег выключены');
});

test('«Полезный совет»: повторяемая награда со счётчиком; число из телефона, мусор из копии не принимается', () => {
  const a = AWARDS.find((x) => x.id === 'useful');
  assert.equal(a.repeat, true);
  assert.deepEqual(a.goals, [1]);
  assert.equal(computeAwards().aw.useful.n, 0);
  S.profile = { id: 'profile', useful: { n: 4, days: ['2026-11-02', '2026-11-11'] } };
  const aw = computeAwards().aw.useful;
  assert.equal(aw.tier, 1);
  assert.equal(aw.n, 4);
  assert.equal(aw.last, '2026-11-11');
  S.profile = { id: 'profile', useful: { n: '5', days: ['<script>'] } };
  assert.deepEqual(countOf('useful'), { n: 0, days: [] });
});

test('месяц заметки: «ноябрь 2026»; старше года — «давняя»', () => {
  const now = parseLocal('2026-11-11T12:00');
  assert.deepEqual(monthText('2026-11', now), { label: 'ноябрь 2026', old: false });
  assert.deepEqual(monthText('2025-12', now), { label: 'декабрь 2025', old: false });
  assert.deepEqual(monthText('2025-11', now), { label: 'ноябрь 2025', old: true });
});
