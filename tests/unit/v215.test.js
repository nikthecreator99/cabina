// CABINA 2.15: «Коллеги» — что уходит на сервер, как читается то, что пришло, и что видит коллега.
// Все имена, станции и идентификаторы — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusPayload, payloadStatus, colleagueLine, cleanCard, cleanStatus, buildSnapshot, cardPayload, cleanText, partOf, partStart, updatedText, colError, ROLE_NAMES, myDataHtml } from '../../js/colleagues.js';
import { CONSENT_VERSION, PUBLISH_VERSION } from '../../js/legal.js';

const H = 3600e3;
const OFF = 3 * H; // Москва: настенное время = настоящее + 3 ч
const wall = (s) => Date.parse(`${s}Z`); // '2026-10-20T12:00' по Москве как «настенное» время
const real = (s) => wall(s) - OFF;
const ME = '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d';
const ANNA = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OLEG = '11111111-2222-4333-8444-555555555555';
const PETR = '99999999-8888-4777-8666-555555555555';
const KEYS = ['p_kind', 'p_place', 'p_dest', 'p_part', 'p_note', 'p_until'];

test('часть суток вместо точного времени', () => {
  assert.equal(partOf(wall('2026-10-21T05:40')), 'night');
  assert.equal(partOf(wall('2026-10-21T06:00')), 'morning');
  assert.equal(partOf(wall('2026-10-21T13:10')), 'day');
  assert.equal(partOf(wall('2026-10-21T23:59')), 'evening');
  assert.equal(partStart(wall('2026-10-21T08:47')), wall('2026-10-21T06:00'));
  assert.equal(partStart(wall('2026-10-21T19:05')), wall('2026-10-21T18:00'));
});

test('статус для коллег: по каждому виду уходит только нужное, без точного времени явки, поезда и локомотива', () => {
  const trip = { id: 't1', routeLabel: 'Сосновка → Ольховка', locoType: 'ВЛ80С', locoNumber: '1234', routeNo: '2402', weight: 6000 };
  const soon = statusPayload({ kind: 'soon', trip, start: wall('2026-10-21T07:40') }, OFF);
  assert.deepEqual(soon, { p_kind: 'soon', p_place: null, p_dest: null, p_part: 'morning', p_note: null, p_until: new Date(real('2026-10-21T06:00')).toISOString() });
  const go = statusPayload({ kind: 'trip', trip, start: wall('2026-10-20T05:40') }, OFF);
  assert.deepEqual(go, { p_kind: 'trip', p_place: 'Сосновка', p_dest: 'Ольховка', p_part: 'night', p_note: null, p_until: null });
  assert.doesNotMatch(JSON.stringify([soon, go]), /1234|ВЛ80|2402|6000|07:40|05:40|t1/, 'ни номера, ни серии, ни веса, ни минут');
  const rest = statusPayload({ kind: 'rest', house: 'Ольховка', until: wall('2026-10-20T14:30') }, OFF);
  assert.deepEqual(rest, { p_kind: 'rest', p_place: 'Ольховка', p_dest: null, p_part: null, p_note: null, p_until: '2026-10-20T11:30:00.000Z' });
  assert.deepEqual(statusPayload({ kind: 'wait', house: 'Ольховка' }, OFF), { p_kind: 'wait', p_place: 'Ольховка', p_dest: null, p_part: null, p_note: null, p_until: null });
  assert.deepEqual(statusPayload({ kind: 'dayoff', until: wall('2026-10-22T18:00') }, OFF).p_until, '2026-10-22T15:00:00.000Z');
  assert.deepEqual(statusPayload({ kind: 'abs', end: '2026-10-25' }, OFF), { p_kind: 'abs', p_place: null, p_dest: null, p_part: null, p_note: null, p_until: null }, 'у отвлечения — ни дат, ни причины');
  const q = statusPayload({ kind: 'between', rest: { kind: 'queue', label: 'На очереди', until: wall('2026-10-20T20:00') } }, OFF);
  assert.equal(q.p_note, 'queue');
  assert.equal(q.p_until, '2026-10-20T17:00:00.000Z');
  assert.deepEqual(statusPayload({ kind: 'between', rest: null }, OFF), { p_kind: 'between', p_place: null, p_dest: null, p_part: null, p_note: null, p_until: null });
  assert.equal(statusPayload({ kind: 'between', rest: { kind: 'turnaround', until: wall('2026-10-20T20:00') } }, OFF).p_note, null);
  assert.equal(statusPayload(null), null);
  assert.equal(statusPayload({ kind: 'gps' }), null);
  for (const p of [soon, go, rest, q]) assert.deepEqual(Object.keys(p), KEYS, 'никаких других полей');
  // без маршрута — без станций, свободный текст поездки не уходит
  assert.deepEqual(statusPayload({ kind: 'trip', trip: { routeLabel: 'смена у Петровича' }, start: wall('2026-10-20T09:00') }, OFF).p_place, null);
});

test('строка коллеги: что видно и как меняется само, когда отдых закончился', () => {
  const now = real('2026-10-20T12:00');
  const line = (st, n = now) => { const l = colleagueLine(cleanStatus(st), n, OFF); return l && `${l.label}${l.sub ? ` · ${l.sub}` : ''}`; };
  const iso = (s) => new Date(real(s)).toISOString();
  assert.equal(line({ kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning' }), 'В пути · Сосновка → Ольховка · с утра');
  assert.equal(line({ kind: 'rest', place: 'Ольховка', until_at: iso('2026-10-20T14:30'), after_kind: 'wait' }), 'На отдыхе · Ольховка · до 14:30');
  assert.equal(line({ kind: 'rest', place: 'Ольховка', until_at: iso('2026-10-20T11:30'), after_kind: 'wait' }), 'Ждёт явку · Ольховка', 'отдых вышел — «Ждёт явку»');
  assert.equal(line({ kind: 'dayoff', until_at: iso('2026-10-22T18:00'), after_kind: 'between' }), 'На выходном · до 22 окт, 18:00');
  assert.equal(line({ kind: 'dayoff', until_at: iso('2026-10-20T10:00'), after_kind: 'between' }), 'Между поездками');
  assert.equal(line({ kind: 'between', note: 'queue', until_at: iso('2026-10-20T20:00') }), 'Между поездками · на очередь с 20:00');
  assert.equal(line({ kind: 'between', note: 'full', until_at: iso('2026-10-21T08:00') }), 'Между поездками · полный отдых до завтра, 08:00');
  assert.equal(line({ kind: 'between', note: 'queue', until_at: iso('2026-10-20T09:00') }), 'Между поездками', 'время вышло — без «на очередь»');
  assert.equal(line({ kind: 'abs' }), 'На отвлечении');
  assert.equal(line({ kind: 'soon', part: 'morning', until_at: iso('2026-10-21T06:00') }), 'Скоро явка · завтра утром');
  assert.equal(line({ kind: 'soon', part: 'evening', until_at: iso('2026-10-20T18:00') }), 'Скоро явка · сегодня вечером');
  assert.equal(line({ kind: 'soon', part: 'night', until_at: iso('2026-10-21T00:00') }, real('2026-10-20T21:00')), 'Скоро явка · этой ночью');
  assert.equal(line({ kind: 'soon', part: 'day', until_at: iso('2026-10-23T12:00') }), 'Скоро явка · 23 октября днём');
  assert.equal(line({ kind: 'soon', part: 'day' }), 'Скоро явка · днём');
  assert.equal(colleagueLine(null), null);
  assert.equal(updatedText(real('2026-10-20T09:10'), now, OFF), 'обновлено в 09:10');
  assert.equal(updatedText(real('2026-10-19T21:40'), now, OFF), 'обновлено вчера, 21:40');
  // «Так вас видят коллеги» — та же строка, что увидит коллега
  const mine = payloadStatus(statusPayload({ kind: 'rest', house: 'Ольховка', until: wall('2026-10-20T14:30') }, OFF));
  assert.deepEqual(colleagueLine(mine, now, OFF), { kind: 'rest', label: 'На отдыхе', sub: 'Ольховка · до 14:30' });
});

test('с сервера — только известные значения: чужой текст не становится разметкой, лишнее отбрасывается', () => {
  const c = cleanCard({ user_id: ANNA.toUpperCase(), name: ' <img src=x onerror=alert(1)>\u0000Анна\n ', role: '__proto__', depot: 'Сосновка'.repeat(20), avatar: [1, 2], searchable: 'yes' });
  assert.equal(c.id, ANNA);
  assert.equal(c.name, '<img src=x onerror=alert(1)> Анна', 'текст остаётся текстом — на экран только через esc()');
  assert.equal(c.role, '');
  assert.equal(c.depot.length, 60);
  assert.equal(c.avatar, null);
  assert.equal(c.searchable, false);
  assert.equal(cleanCard({ user_id: '1 or 1=1', name: 'x' }), null);
  assert.equal(cleanCard({ id: ANNA, name: '' }).name, 'Без имени');
  assert.equal(cleanCard({ id: ANNA, name: 'Анна', avatar: { sex: 'robot', hat: 'cap', bg: 'javascript:alert(1)' } }).avatar.bg, 'mist', 'персонаж — только из известных деталей');
  const st = cleanStatus({ kind: 'rest', place: 'Ольховка', part: 'constructor', note: 'toString', until_at: 'not a date', after_kind: 'gps', updated_at: '2026-10-20T06:10:00Z' });
  assert.deepEqual(st, { kind: 'rest', place: 'Ольховка', dest: '', part: '', note: '', until: null, after: '', at: Date.parse('2026-10-20T06:10:00Z') });
  assert.equal(cleanStatus({ kind: 'gps' }), null);
  assert.equal(cleanStatus(null), null);
});

test('снимок с сервера: согласия, предложения мне и мои, коллеги со статусом', () => {
  const snap = buildSnapshot(ME, {
    consents: [{ document: 'privacy-1', withdrawn_at: null }, { document: CONSENT_VERSION, withdrawn_at: null }, { document: PUBLISH_VERSION, withdrawn_at: '2026-10-20T08:00:00Z' }],
    links: [
      { from_id: ME, to_id: ANNA, state: 'accepted' },
      { from_id: OLEG, to_id: ME, state: 'pending' },
      { from_id: ME, to_id: PETR, state: 'pending' },
      { from_id: OLEG, to_id: PETR, state: 'accepted' }, // не моя связь — пропускаем
      { from_id: 'bad', to_id: ME, state: 'accepted' },
      { from_id: ME, to_id: ANNA, state: 'pending' }, // повтор той же пары
    ],
    cards: [{ user_id: ME, name: 'Иван', searchable: true }, { user_id: ANNA, name: 'Анна', role: 'other', depot: 'Сосновка' }, { user_id: OLEG, name: 'Олег', role: 'driver' }],
    statuses: [{ user_id: ANNA, kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'day', updated_at: '2026-10-20T06:10:00Z' }, { user_id: ME, kind: 'abs' }],
  });
  assert.deepEqual(snap.consent, { main: true, publish: false }, 'отозванное согласие не считается');
  assert.equal(snap.card.name, 'Иван');
  assert.equal(snap.myStatus.kind, 'abs');
  assert.deepEqual(snap.colleagues.map((c) => [c.card.name, c.status?.kind]), [['Анна', 'trip']]);
  assert.deepEqual(snap.incoming.map((c) => c.card.name), ['Олег']);
  assert.deepEqual(snap.outgoing.map((c) => [c.id, c.card.name]), [[PETR, 'Без имени']]);
  const empty = buildSnapshot(ME, { consents: null, links: 'x', cards: {}, statuses: undefined });
  assert.deepEqual([empty.consent, empty.card, empty.colleagues.length], [{ main: false, publish: false }, null, 0]);
});

test('карточка для коллег: имя и должность, депо и персонаж — только если разрешено; телефона нет никогда', () => {
  const p = { name: '  Иван   Петров ', role: 'driver', depot: 'ТЧЭ-1 Сосновка', phone: '+7 900 000-00-00', klass: '2',
    avatar: { sex: 'm', hat: 'cap', mazut: true }, privacy: { depot: false, avatar: false, phone: true } };
  const off = cardPayload(p);
  assert.deepEqual(off, { p_name: 'Иван Петров', p_role: 'driver', p_depot: null, p_avatar: null, p_searchable: false });
  const on = cardPayload({ ...p, privacy: { depot: true, avatar: true, phone: true } }, { findable: true });
  assert.equal(on.p_depot, 'ТЧЭ-1 Сосновка');
  assert.equal(on.p_searchable, true);
  assert.equal(on.p_avatar.mazut, false, 'премиум-детали без Премиума не уходят');
  assert.doesNotMatch(JSON.stringify([off, on]), /900|\+7|klass/, 'номер телефона и класс не уходят');
  assert.deepEqual(Object.keys(on), ['p_name', 'p_role', 'p_depot', 'p_avatar', 'p_searchable']);
  assert.equal(cardPayload({ ...p, name: ' \n ' }), null, 'без имени карточки нет');
  assert.equal(cardPayload({ ...p, role: 'other' }).p_role, 'other');
  assert.equal(cardPayload({ ...p, role: 'boss' }).p_role, null);
  assert.equal(cleanText('a'.repeat(80)).length, 60);
  assert.deepEqual(Object.keys(ROLE_NAMES), ['assistant', 'driver', 'other']);
});

test('отказы сервера понятны человеку', () => {
  const e = (message, what, status = 400) => colError({ status, data: { code: 'P0001', message } }, what);
  assert.match(colError(null), /Нет связи/);
  assert.match(colError({ status: 404, data: { code: 'PGRST202' } }), /ещё не включён/);
  assert.match(e('cabina: name too short'), /3 букв/);
  assert.match(e('cabina: later'), /30 дней/);
  assert.match(e('cabina: limit', 'search'), /поисков/);
  assert.match(e('cabina: limit'), /не больше 10/);
  assert.match(e('cabina: not found'), /нет в поиске/);
  assert.match(e('cabina: publish consent required'), /отдельное согласие/);
  assert.match(e('cabina: consent required'), /новую редакцию/);
  assert.match(e('cabina: name required'), /имя/);
});

test('«Что сервер знает о вас»: выгрузка понятным языком, всё с сервера экранировано', () => {
  const now = real('2026-10-20T12:00');
  const d = {
    email: 'ivan<b>@example.com', email_confirmed: false, created_on: '2026-10-19', last_seen: '2026-10-20', platform: 'web', app_version: '2.15.1',
    consents: [
      { document: 'privacy-1', given_at: '2026-10-19T10:00:00+00:00', withdrawn_at: null },
      { document: CONSENT_VERSION, given_at: '2026-10-20T07:05:00+00:00', withdrawn_at: null },
      { document: PUBLISH_VERSION, given_at: '2026-10-20T07:06:00+00:00', withdrawn_at: '2026-10-20T08:00:00+00:00' },
      { document: '<img src=x onerror=alert(1)>', given_at: 'не дата' },
    ],
    colleagues_card: { name: 'Иван <script>', role: 'driver', depot: 'Сосновка', avatar: null, searchable: false, updated_at: '2026-10-20T07:06:00+00:00' },
    colleagues_status: { kind: 'rest', place: 'Ольховка', until_at: new Date(real('2026-10-20T14:30')).toISOString(), after_kind: 'wait',
      updated_at: new Date(real('2026-10-20T09:10')).toISOString(), expires_at: new Date(real('2026-10-22T09:10')).toISOString() },
    colleagues: [
      { with: ANNA, state: 'accepted', offered_by_me: true }, { with: OLEG, state: 'accepted', offered_by_me: false },
      { with: PETR, state: 'pending', offered_by_me: true }, { with: ME, state: 'declined', offered_by_me: false }, null,
    ],
  };
  const html = myDataHtml(d, now, OFF);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(!/<script|<img|<b>@/.test(html), 'текст с сервера экранирован');
  assert.match(text, /ivan&lt;b&gt;@example\.com не подтверждена/);
  assert.match(text, /Аккаунт создан 19 октября 2026/);
  assert.match(text, /Последний заход 20 октября 2026 только дата, без времени/);
  assert.match(text, /Сайт \(браузер\) · CABINA 2\.15\.1/);
  assert.match(text, /обработку персональных данных редакция 1 · принято 19 октября 2026, 13:00 · прежняя редакция/);
  assert.match(text, /обработку персональных данных редакция 2 · принято 20 октября 2026, 10:05 Согласие на распространение/);
  assert.match(text, /поиск коллег редакция 1 · принято 20 октября 2026, 10:06 · отозвано 20 октября 2026, 11:00/);
  assert.match(text, /Согласие &lt;img src=x onerror=alert\(1\)&gt; Коллеги/, 'неизвестный документ — как есть, без «прежней редакции»');
  assert.match(text, /Иван &lt;script&gt; Машинист · депо Сосновка/);
  assert.match(text, /В поиске Нет найти вас нельзя/);
  assert.match(text, /На отдыхе Ольховка · до 14:30 обновлено в 09:10 · сотрётся сам 22 октября 2026, 09:10/);
  assert.match(text, /Коллеги 2 /);
  assert.match(text, /Ваши предложения без ответа стираются через 30 дней 1/);
  assert.match(text, /Отказы и удалённые коллеги стираются через 30 дней 1/);
  assert.ok(!/Предложения вам/.test(text), 'нулевые строки не показываем');
  assert.ok(!html.includes(ANNA) && !html.includes(OLEG), 'идентификаторы коллег не показываем');
  assert.match(text, /Не на сервере: поездки, заработок, отвлечения/);
});

test('«Что сервер знает о вас»: без «Коллег» и с пустым ответом — не падает и говорит прямо', () => {
  const t1 = myDataHtml({ email: 'a@example.com', email_confirmed: true, consents: [], colleagues: [] }, Date.now(), OFF);
  assert.match(t1, /Вы не включали «Коллеги»/);
  assert.ok(!t1.includes('Согласия'), 'пустой раздел не показываем');
  for (const bad of [null, undefined, 'строка', [], { consents: 'x', colleagues: {}, colleagues_card: 'x', colleagues_status: [], created_on: '2026-13-01', platform: 'toString' }]) {
    const h = myDataHtml(bad, Date.now(), OFF);
    assert.match(h, /Вы не включали «Коллеги»/);
    assert.ok(!/undefined|NaN|function/.test(h));
  }
});
