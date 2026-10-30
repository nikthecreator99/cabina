// CABINA 2.16: кому из коллег что видно — правила с сервера, режимы «никто / все / выбранные»,
// станции статуса отдельно, «Мои данные на сервере». Все имена и идентификаторы — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, accessMode, sees, accessText, myDataHtml } from '../../js/colleagues.js';

const ME = '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d';
const ANNA = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OLEG = '11111111-2222-4333-8444-555555555555';
const PETR = '99999999-8888-4777-8666-555555555555';
const ON = { status: true };
const snapWith = (access, extra = {}) => buildSnapshot(ME, {
  consents: [{ document: 'privacy-2' }],
  links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }, { from_id: OLEG, to_id: ME, state: 'accepted' }, { from_id: PETR, to_id: ME, state: 'pending' }],
  cards: [{ user_id: ANNA, name: 'Анна' }, { user_id: OLEG, name: 'Олег' }, { user_id: PETR, name: 'Пётр' }],
  access, ...extra,
});

test('правила с сервера: свои, «все коллеги» и выбранные; чужие и мусор отбрасываются', () => {
  const s = snapWith([
    { user_id: ME, item: 'status', viewer_id: null },
    { user_id: ME, item: 'place', viewer_id: ANNA.toUpperCase() },
    { user_id: OLEG, item: 'status', viewer_id: ME },
    { user_id: ME, item: 'gps', viewer_id: null },
    { user_id: ME, item: 'place', viewer_id: 'не-идентификатор' },
    null, 'строка',
  ]);
  assert.deepEqual(s.access, { status: { all: true, ids: [] }, place: { all: false, ids: [ANNA] } });
  assert.deepEqual(snapWith(undefined).access, { status: { all: false, ids: [] }, place: { all: false, ids: [] } }, 'нет ответа — никому');
});

test('режим: статус выключен в телефоне — никому; «где я» без статуса — никому; выбранные — только нынешние коллеги', () => {
  const all = snapWith([{ user_id: ME, item: 'status', viewer_id: null }, { user_id: ME, item: 'place', viewer_id: null }]);
  assert.equal(accessMode(all, 'status', { status: false }).mode, 'none', 'выключено в телефоне побеждает');
  assert.equal(accessMode(all, 'place', { status: false }).mode, 'none');
  assert.equal(accessMode(all, 'status', ON).mode, 'all');
  const some = snapWith([{ user_id: ME, item: 'status', viewer_id: ANNA }, { user_id: ME, item: 'status', viewer_id: PETR }, { user_id: ME, item: 'place', viewer_id: OLEG }]);
  assert.deepEqual(accessMode(some, 'status', ON), { mode: 'some', ids: [ANNA] }, 'Пётр ещё не коллега');
  assert.ok(sees(some, 'status', ANNA, ON));
  assert.ok(!sees(some, 'status', OLEG, ON));
  assert.ok(!sees(some, 'place', OLEG, ON), '«где я» без статуса не видно');
  assert.ok(!sees(some, 'status', PETR, ON));
  const nobody = snapWith([{ user_id: ME, item: 'status', viewer_id: PETR }]);
  assert.equal(accessMode(nobody, 'status', ON).mode, 'none', 'выбран только не-коллега — значит никому');
  assert.equal(accessMode(null, 'status', ON).mode, 'none');
});

test('подпись «кто видит»', () => {
  const s = (rows) => snapWith(rows);
  assert.equal(accessText(s([]), 'status', ON), 'Никто');
  assert.equal(accessText(s([{ item: 'status', viewer_id: null }]), 'status', ON), 'Все коллеги');
  assert.equal(accessText(s([{ item: 'status', viewer_id: ANNA }, { item: 'place', viewer_id: null }]), 'place', ON), 'Все, кто видит статус');
  assert.equal(accessText(s([{ item: 'status', viewer_id: ANNA }, { item: 'status', viewer_id: OLEG }]), 'status', ON), 'Анна, Олег');
  assert.equal(accessText(s([{ item: 'status', viewer_id: ANNA }, { item: 'place', viewer_id: OLEG }]), 'place', ON), 'Никто', 'Олег статус не видит');
});

test('станции статуса приходят отдельно и подставляются к статусу коллеги', () => {
  const st = (id, kind) => ({ user_id: id, kind, place: null, dest: null, part: 'morning', updated_at: '2026-10-20T06:10:00Z' });
  const s = snapWith([], { statuses: [st(ANNA, 'trip'), st(OLEG, 'trip')], places: [{ user_id: ANNA, place: 'Сосновка', dest: 'Ольховка' }, { user_id: 'x', place: 'Где-то' }] });
  const anna = s.colleagues.find((c) => c.id === ANNA).status;
  const oleg = s.colleagues.find((c) => c.id === OLEG).status;
  assert.equal(anna.place, 'Сосновка'); assert.equal(anna.dest, 'Ольховка');
  assert.equal(oleg.place, ''); assert.equal(oleg.dest, '', 'Олег не показывает, где он');
});

test('«Мои данные на сервере»: кому что видно — числом, без идентификаторов', () => {
  const html = myDataHtml({ email: 'a@example.com', colleagues: [{ with: ANNA, state: 'accepted' }],
    colleagues_access: [{ item: 'status', to: ANNA }, { item: 'status', to: OLEG }, { item: 'place', to: 'all' }, null, { item: '<b>', to: 'all' }] }, Date.parse('2026-10-20T09:00:00Z'), 3 * 3600e3);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Статус видят 2 выбранных коллеги/);
  assert.match(text, /Где вы, видят все коллеги/);
  assert.ok(!html.includes(ANNA) && !html.includes(OLEG));
  assert.ok(!html.includes('<b>,'));
});
