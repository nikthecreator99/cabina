// Сервер, шаг 2: «Коллеги» — карточка, поиск, предложение стать коллегами, статус для коллег.
// Главный вопрос: может ли чужой (не коллега) увидеть или изменить мои данные? Ответ всегда «нет».
// Все имена, депо и станции — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startDb } from './db.js';

let db;
before(async () => { db = await startDb(); });
after(async () => { await db?.stop(); });

const q = (text, who) => {
  const r = db.sql(text, who);
  assert.ok(r.ok, `ожидался успех: ${r.err}\n${text}`);
  return r.rows;
};
const fails = (text, who, re) => {
  const r = db.sql(text, who);
  assert.ok(!r.ok, `ожидался отказ:\n${text}`);
  assert.match(r.err, re);
};
const json = (text, who) => JSON.parse(q(text, who)[0]);
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

let n = 0;
// Аккаунт с согласием текущей редакции (как после регистрации в приложении)
function account() {
  const code = `COLL${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('c${n}@example.test', '{"consent":"privacy-2","invite":"${code}","platform":"web","version":"2.15.0"}'::jsonb) returning id`, 'auth');
  assert.ok(r.ok, r.err);
  return r.rows[0];
}
// find: true — «меня можно найти»; перед этим, как в приложении, — отдельное согласие на распространение
const card = (who, { name = 'Иван', role = null, depot = null, avatar = null, find = false } = {}) => {
  if (find) q(`select public.give_consent('publish-2')`, who);
  return q(`select public.save_card(${lit(name)}, ${lit(role)}, ${lit(depot)}, ${avatar ? `'${JSON.stringify(avatar)}'::jsonb` : 'null'}, ${find})`, who);
};
const offer = (from, to) => q(`select public.offer_colleague('${to}')`, from)[0];
const accept = (me, from) => q(`select public.answer_colleague('${from}', true)`, me);
const find = (who, name, depot = null, role = null) => json(`select public.find_colleagues(${lit(name)}, ${lit(depot)}, ${lit(role)})`, who);
const status = (who, kind, { place = null, dest = null, part = null, note = null, until = null } = {}) =>
  q(`select public.set_status(${lit(kind)}, ${lit(place)}, ${lit(dest)}, ${lit(part)}, ${lit(note)}, ${until ? `${lit(until)}::timestamptz` : 'null'})`, who);
// Кому показывать статус ('status') или станции ('place'): всем коллегам (true) или выбранным (список)
const share = (who, item, to = true) => q(`select public.set_access(${lit(item)}, ${to === true}, ${Array.isArray(to) && to.length ? `array[${to.map((x) => `'${x}'`).join(',')}]::uuid[]` : 'null'})`, who);
// Статус вместе со станциями (они хранятся отдельно, со своим правилом доступа)
const ST = (id) => `public.statuses s left join public.status_places p on p.user_id = s.user_id where s.user_id = '${id}'`;
// Двое — коллеги
function pair(nameA = 'Никита', nameB = 'Анна') {
  const a = account();
  const b = account();
  card(a, { name: nameA });
  card(b, { name: nameB, find: true });
  assert.equal(offer(a, b), 'sent');
  accept(b, a);
  return [a, b];
}
const count = (sql, who) => Number(q(sql, who)[0]);

test('без согласия новой редакции «Коллеги» не работают; согласие принимается только текущей редакции', () => {
  const me = account();
  // как будто человек зарегистрировался раньше, по старой редакции
  q(`update public.consents set document = 'privacy-1' where user_id = '${me}'`);
  fails(`select public.save_card('Иван', null, null, null, true)`, me, /consent required/);
  fails(`select public.find_colleagues('Анна')`, me, /consent required/);
  fails(`select public.set_status('trip', null, null, null, null, null)`, me, /consent required/);
  fails(`select public.give_consent('privacy-1')`, me, /consent required/);
  fails(`select public.give_consent('privacy-2')`, 'anon', /permission denied/);
  q(`select public.give_consent('privacy-2')`, me);
  q(`select public.give_consent('privacy-2')`, me);
  assert.deepEqual(q(`select document from public.consents where user_id = '${me}' order by given_at`), ['privacy-1', 'privacy-2'], 'одна запись на редакцию');
  card(me);
  assert.deepEqual(q(`select name from public.cards where user_id = '${me}'`), ['Иван']);
});

test('быть в поиске — только с отдельным согласием на распространение; выключил — согласие отозвано', () => {
  const me = account();
  fails(`select public.save_card('Иван', null, null, null, true)`, me, /publish consent required/);
  q(`update public.consents set document = 'privacy-1' where user_id = '${me}'`);
  fails(`select public.give_consent('publish-2')`, me, /consent required/, 'сначала основное согласие');
  q(`select public.give_consent('privacy-2')`, me);
  q(`select public.give_consent('publish-2')`, me);
  q(`select public.save_card('Иван', null, null, null, true)`, me);
  assert.deepEqual(q(`select searchable from public.cards where user_id = '${me}'`), ['t']);
  q(`select public.save_card('Иван', null, null, null, false)`, me);
  assert.deepEqual(q(`select withdrawn_at is not null from public.consents where user_id = '${me}' and document = 'publish-2'`), ['t'], 'отзыв записан');
  fails(`select public.save_card('Иван', null, null, null, true)`, me, /publish consent required/, 'включить снова — снова согласие');
  card(me, { find: true });
  assert.deepEqual(q(`select count(*) from public.consents where user_id = '${me}' and document = 'publish-2' and withdrawn_at is null`), ['1']);
  const data = json('select public.export_my_data()', me);
  assert.deepEqual(data.consents.map((c) => [c.document, c.withdrawn_at === null]), [['privacy-1', true], ['privacy-2', true], ['publish-2', false], ['publish-2', true]]);
  q('select public.leave_colleagues()', me);
  assert.deepEqual(q(`select count(*) from public.consents where user_id = '${me}' and document = 'publish-2' and withdrawn_at is null`), ['0'], 'выход из «Коллег» тоже отзывает');
});

test('сайт переехал (шаг 4): прежняя редакция publish-1 больше не держит в поиске', () => {
  const me = account();
  const other = account();
  card(other, { name: 'Пётр' });
  // как было до шага 4: согласие publish-1, «меня можно найти» включено
  q(`insert into public.consents (user_id, document) values ('${me}', 'publish-1')`);
  q(`insert into public.cards (user_id, name, searchable) values ('${me}', 'Евлампий', true)`);
  // шаг 4 на сервере (повторный запуск ничего не ломает)
  const step = readFileSync(new URL('../migrations/0004_site.sql', import.meta.url), 'utf8').replace(/^notify .*$/m, '');
  q(step);
  q(step);
  assert.deepEqual(q(`select searchable from public.cards where user_id = '${me}'`), ['f']);
  assert.deepEqual(find(other, 'Евлампий'), [], 'в поиске его нет');
  fails(`select public.give_consent('publish-1')`, me, /consent required/, 'старую редакцию принять нельзя');
  fails(`select public.save_card('Евлампий', null, null, null, true)`, me, /publish consent required/, 'включить — только с новой');
  card(me, { name: 'Евлампий', find: true });
  assert.equal(find(other, 'Евлампий').length, 1, 'принял новую — снова в поиске');
});

test('карточка: только имя, должность, депо, персонаж и «меня можно найти»; лишнее отбрасывается', () => {
  const me = account();
  fails(`select public.save_card('   ', null, null, null, false)`, me, /name required/);
  card(me, { name: `  Иван\n\tПетров${'я'.repeat(80)}`, role: 'начальник', depot: '  Сосновка  ', find: true,
    avatar: { v: 1, sex: 'm', hair: 'short', marks: ['scar'] } });
  const [row] = q(`select name, coalesce(role, '-'), depot, avatar ->> 'hair', searchable from public.cards where user_id = '${me}'`);
  const [name, role, depot, hair, searchable] = row.split('|');
  assert.ok(name.startsWith('Иван Петров') && name.length === 60, 'пробелы и служебные символы убраны, не длиннее 60');
  assert.equal(role, '-', 'неизвестная должность не сохраняется');
  assert.equal(depot, 'Сосновка');
  assert.equal(hair, 'short');
  assert.equal(searchable, 't');
  card(me, { avatar: { v: 1, nested: { evil: true } } });
  assert.deepEqual(q(`select avatar is null from public.cards where user_id = '${me}'`), ['t'], 'вложенный объект вместо персонажа не сохраняется');
  card(me, { avatar: { v: 1, junk: 'x'.repeat(3000) } });
  assert.deepEqual(q(`select avatar is null from public.cards where user_id = '${me}'`), ['t'], 'слишком большой персонаж не сохраняется');
  const cols = q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cards' order by 1`);
  assert.deepEqual(cols, ['avatar', 'depot', 'name', 'role', 'searchable', 'updated_at', 'user_id'], 'телефона и прочего в карточке нет');
});

test('чужой не видит мою карточку; видит только тот, с кем есть предложение или связь', () => {
  const me = account();
  const other = account();
  const stranger = account();
  card(me, { name: 'Мария', depot: 'Ольховка', find: true });
  card(other, { name: 'Олег' });
  assert.equal(count(`select count(*) from public.cards where user_id = '${me}'`, other), 0, 'даже «можно найти» не открывает карточку для чтения напрямую');
  assert.equal(count(`select count(*) from public.cards where user_id = '${me}'`, stranger), 0);
  fails('select * from public.cards', 'anon', /permission denied/);
  assert.equal(offer(other, me), 'sent');
  assert.equal(count(`select count(*) from public.cards where user_id = '${me}'`, other), 1, 'после предложения он видит, кому отправил');
  assert.equal(count(`select count(*) from public.cards where user_id = '${other}'`, me), 1, 'а я вижу, кто мне предлагает');
  assert.equal(count(`select count(*) from public.cards where user_id in ('${me}', '${other}')`, stranger), 0, 'третий не видит ничего');
});

test('поиск: только те, кто разрешил себя находить; от 3 букв; регистр и «ё» не важны; фильтры; не больше 20', () => {
  const me = account();
  card(me, { name: 'Ищущий' });
  const people = [
    ['Пётр Семёнов', 'driver', 'Сосновка', true],
    ['ПЕТР Лесной', 'assistant', 'Ольховка', true],
    ['Петра', null, null, true],
    ['Пётр Скрытный', 'driver', 'Сосновка', false],
  ].map(([name, role, depot, findMe]) => { const id = account(); card(id, { name, role, depot, find: findMe }); return id; });
  const names = (r) => r.map((x) => x.name).sort();
  assert.deepEqual(names(find(me, 'петр')), ['ПЕТР Лесной', 'Петра', 'Пётр Семёнов'], 'кто выключил «меня можно найти», того нет');
  assert.deepEqual(names(find(me, 'ПЁТР', 'сосн')), ['Пётр Семёнов']);
  assert.deepEqual(names(find(me, 'петр', null, 'assistant')), ['ПЕТР Лесной']);
  assert.deepEqual(find(me, 'Ищущий'), [], 'себя не находит');
  const one = find(me, 'Пётр Сем')[0];
  assert.deepEqual(Object.keys(one).sort(), ['avatar', 'depot', 'id', 'name', 'role'], 'только то, что видно в поиске');
  assert.equal(one.id, people[0]);
  fails(`select public.find_colleagues('пе')`, me, /name too short/);
  fails(`select public.find_colleagues(' . - ')`, me, /name too short/);
  fails(`select public.find_colleagues('петр')`, 'anon', /permission denied/);
  for (let i = 0; i < 25; i++) card(account(), { name: `Тестов ${i}`, find: true });
  assert.equal(find(me, 'тестов').length, 20, 'не больше 20 человек за раз');
});

test('поиск: не больше 100 раз в день, чтобы нельзя было перебрать всех', () => {
  const me = account();
  card(me);
  q(`insert into private.limits (user_id, day, searches) values ('${me}', private.today(), 99)`);
  find(me, 'анна');
  fails(`select public.find_colleagues('анна')`, me, /limit/);
  fails(`select public.find_colleagues('анна')`, me, /limit/);
  assert.deepEqual(q(`select searches from private.limits where user_id = '${me}'`), ['100'], 'отказ не засчитывается');
});

test('предложение: только тому, кто разрешил себя находить; себе нельзя; встречное = согласие', () => {
  const a = account();
  const b = account();
  const hidden = account();
  card(b, { name: 'Анна', find: true });
  card(hidden, { name: 'Скрытая' });
  fails(`select public.offer_colleague('${b}')`, a, /name required/, 'без своей карточки — не понятно, кто предлагает');
  card(a, { name: 'Никита' });
  fails(`select public.offer_colleague('${hidden}')`, a, /not found/);
  fails(`select public.offer_colleague('${a}')`, a, /not found/);
  fails(`select public.offer_colleague(gen_random_uuid())`, a, /not found/);
  assert.equal(offer(a, b), 'sent');
  assert.equal(offer(a, b), 'sent', 'повторно — ничего нового');
  assert.equal(count(`select count(*) from public.links where from_id = '${a}' and to_id = '${b}'`), 1);
  // скрытая может сама предложить, и тогда ей можно ответить
  card(a, { name: 'Никита', find: true });
  assert.equal(offer(hidden, a), 'sent');
  assert.equal(offer(a, hidden), 'accepted', 'встречное предложение — это ответ «да»');
  assert.deepEqual(q(`select state from public.links where id = private.pair('${a}', '${hidden}')`), ['accepted']);
  assert.equal(offer(a, hidden), 'already');
});

test('предложения: не больше 10 в день', () => {
  const a = account();
  card(a);
  const targets = Array.from({ length: 11 }, (_, i) => { const id = account(); card(id, { name: `Цель ${i}`, find: true }); return id; });
  for (const t of targets.slice(0, 10)) assert.equal(offer(a, t), 'sent');
  fails(`select public.offer_colleague('${targets[10]}')`, a, /limit/);
});

test('ответить на предложение может только тот, кому его прислали', () => {
  const a = account();
  const b = account();
  const c = account();
  card(a); card(b, { name: 'Анна', find: true }); card(c, { name: 'Чужой' });
  offer(a, b);
  fails(`select public.answer_colleague('${a}', true)`, c, /not found/, 'чужой не может принять за неё');
  fails(`select public.answer_colleague('${b}', true)`, a, /not found/, 'сам себе ответить нельзя');
  assert.deepEqual(q(`select state from public.links where id = private.pair('${a}', '${b}')`), ['pending']);
  accept(b, a);
  assert.deepEqual(q(`select state from public.links`, a), ['accepted']);
  assert.deepEqual(q(`select state from public.links`, b), ['accepted']);
  assert.deepEqual(q(`select count(*) from public.links`, c), ['0']);
});

test('статус видят только коллеги, которым разрешено; пока предложение без ответа — не видно; без коллег статус не хранится', () => {
  const a = account();
  const b = account();
  const stranger = account();
  card(a); card(b, { name: 'Анна', find: true }); card(stranger, { name: 'Чужой' });
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'morning' });
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0, 'коллег нет — на сервере ничего');
  offer(a, b);
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'morning' });
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0, 'предложение без ответа — ещё не коллеги');
  accept(b, a);
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'morning' });
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0, 'никому не разрешено показывать — на сервере ничего');
  share(a, 'status');
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'morning' });
  assert.deepEqual(q(`select kind, part, place is null, dest is null from public.statuses where user_id = '${a}'`, b), ['trip|morning|t|t'], 'станций в самом статусе нет');
  assert.equal(count('select count(*) from public.status_places'), 0, '«где я» никому не разрешено — станции не хранятся');
  share(a, 'place');
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'morning' });
  assert.deepEqual(q(`select place, dest from public.status_places where user_id = '${a}'`, b), ['Сосновка|Ольховка']);
  assert.equal(count('select count(*) from public.status_places', stranger), 0, 'чужой не видит станций');
  fails('select * from public.status_places', 'anon', /permission denied/);
  assert.equal(count(`select count(*) from public.statuses`, stranger), 0, 'чужой не видит');
  fails('select * from public.statuses', 'anon', /permission denied/);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`, a), 1, 'свой вижу');
});

test('статус: сервер хранит только нужное для каждого вида, точного времени явки нет', () => {
  const [a] = pair();
  share(a, 'status'); share(a, 'place');
  status(a, 'abs', { place: 'Больница', dest: 'x', part: 'night', note: 'queue', until: new Date(Date.now() + 3600e3).toISOString() });
  assert.deepEqual(q(`select s.kind, p.place is null, p.dest is null, s.part is null, s.note is null, s.until_at is null from ${ST(a)}`),
    ['abs|t|t|t|t|t'], 'у отвлечения ни места, ни дат');
  status(a, 'soon', { place: 'Сосновка', dest: 'Ольховка', part: 'evening' });
  assert.deepEqual(q(`select s.part, p.place is null, p.dest is null from ${ST(a)}`), ['evening|t|t'], 'скоро явка — только часть суток');
  const soon = new Date(Math.floor((Date.now() + 20 * 3600e3) / 3600e3) * 3600e3 + 47 * 60e3).toISOString();
  status(a, 'soon', { part: 'evening', until: soon });
  assert.deepEqual(q(`select until_at = date_trunc('hour', until_at) from public.statuses where user_id = '${a}'`), ['t'], 'без минут: точное время явки не хранится');
  const until = new Date(Date.now() + 5 * 3600e3).toISOString();
  status(a, 'rest', { place: 'Ольховка', dest: 'x', until });
  assert.deepEqual(q(`select p.place, p.dest is null, s.until_at = ${lit(until)}::timestamptz, s.after_kind from ${ST(a)}`), ['Ольховка|t|t|wait']);
  status(a, 'dayoff', { until: new Date(Date.now() + 30 * 86400e3).toISOString() });
  assert.deepEqual(q(`select until_at is null, after_kind from public.statuses where user_id = '${a}'`), ['t|between'], 'время дальше 14 дней — не сохраняется');
  status(a, 'between', { note: 'queue', until });
  assert.deepEqual(q(`select note, until_at is not null from public.statuses where user_id = '${a}'`), ['queue|t']);
  fails(`select public.set_status('gps', null, null, null, null, null)`, a, /bad status/);
  fails(`select public.set_status(null, null, null, null, null, null)`, a, /bad status/);
  assert.deepEqual(q(`select expires_at between now() + interval '47 hours' and now() + interval '49 hours' from public.statuses where user_id = '${a}'`), ['t'], 'сам стирается через 48 часов');
});

test('устаревший статус не виден, «выключить» стирает сразу', () => {
  const [a, b] = pair();
  share(a, 'status'); share(a, 'place');
  status(a, 'wait', { place: 'Ольховка' });
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`, b), 1);
  assert.equal(count(`select count(*) from public.status_places where user_id = '${a}'`, b), 1);
  q(`update public.statuses set expires_at = now() - interval '1 minute' where user_id = '${a}'`);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`, b), 0, 'старше 48 часов — не видно');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${a}'`, b), 0, 'и станции тоже');
  status(a, 'wait', { place: 'Ольховка' });
  q('select public.clear_status()', a);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0);
  assert.equal(count(`select count(*) from public.status_places where user_id = '${a}'`), 0, 'станции стёрты вместе со статусом');
  fails('select public.clear_status()', 'anon', /permission denied/);
});

test('удалить из коллег: удалённый больше ничего не видит и 30 дней не может предложить снова', () => {
  const [a, b] = pair();
  card(a, { name: 'Никита', find: true });
  share(a, 'status'); share(b, 'status');
  status(a, 'wait', { place: 'Ольховка' });
  status(b, 'wait', { place: 'Сосновка' });
  q(`select public.drop_colleague('${a}')`, b);
  assert.equal(count('select count(*) from public.links', a), 0);
  assert.equal(count('select count(*) from public.links', b), 0);
  assert.equal(count(`select count(*) from public.cards where user_id = '${b}'`, a), 0, 'карточку больше не видно');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 0, 'статус больше не видно');
  assert.equal(count(`select count(*) from public.statuses where user_id in ('${a}', '${b}')`), 0, 'без коллег статусы стёрты');
  fails(`select public.offer_colleague('${b}')`, a, /later/);
  assert.equal(offer(b, a), 'sent', 'тот, кто удалил, может передумать');
  q(`select public.drop_colleague('${a}')`, b);
  assert.equal(count(`select count(*) from public.links where id = private.pair('${a}', '${b}')`), 0, 'отмена своего предложения');
  // отклонил предложение — та же пауза
  assert.equal(offer(a, b), 'sent');
  q(`select public.answer_colleague('${a}', false)`, b);
  fails(`select public.offer_colleague('${b}')`, a, /later/);
  q(`update public.links set answered_at = now() - interval '31 days' where id = private.pair('${a}', '${b}')`);
  assert.equal(offer(a, b), 'sent', 'после паузы — можно');
});

test('напрямую в таблицы писать нельзя: ни себе в коллеги, ни чужой статус', () => {
  const a = account();
  const b = account();
  card(a); card(b, { name: 'Анна', find: true });
  fails(`insert into public.links (from_id, to_id, state) values ('${a}', '${b}', 'accepted')`, a, /permission denied/);
  offer(a, b);
  fails(`update public.links set state = 'accepted'`, a, /permission denied/);
  fails(`delete from public.links`, a, /permission denied/);
  fails(`update public.cards set searchable = true where user_id = '${b}'`, a, /permission denied/);
  fails(`insert into public.statuses (user_id, kind, expires_at) values ('${b}', 'trip', now() + interval '1 day')`, a, /permission denied/);
  fails('select * from private.limits', a, /permission denied/);
  fails(`insert into public.access (user_id, item) values ('${b}', 'status')`, a, /permission denied/);
  fails(`insert into public.access (user_id, item, viewer_id) values ('${a}', 'status', '${b}')`, a, /permission denied/);
  fails(`insert into public.status_places (user_id, place) values ('${b}', 'Сосновка')`, a, /permission denied/);
  fails('select * from private.config', a, /permission denied/);
  fails(`select private.forget_access()`, a, /permission denied|trigger/);
  fails(`select private.spend('${a}', 'search')`, a, /permission denied/);
  fails(`select private.tidy('${b}')`, a, /permission denied/);
  assert.deepEqual(q(`select state from public.links where id = private.pair('${a}', '${b}')`), ['pending']);
});

test('выйти из «Коллег» — стираются своя карточка, статус, предложения и связи', () => {
  const [a, b] = pair();
  const c = account();
  card(c, { name: 'Третий', find: true });
  offer(a, c);
  share(a, 'status'); share(b, 'status'); share(b, 'place', [a]);
  status(a, 'wait', { place: 'Ольховка' });
  status(b, 'wait', { place: 'Сосновка' });
  assert.equal(count(`select count(*) from public.statuses where user_id in ('${a}', '${b}')`), 2);
  q('select public.leave_colleagues()', a);
  assert.equal(count(`select count(*) from public.access where user_id = '${a}'`), 0, 'свои правила «кому видно» стёрты');
  assert.equal(count(`select count(*) from public.access where viewer_id = '${a}'`), 0, 'и разрешения, которые давали мне');
  assert.equal(count(`select count(*) from public.cards where user_id = '${a}'`), 0);
  assert.equal(count(`select count(*) from public.statuses where user_id in ('${a}', '${b}')`), 0, 'и статус коллеги, у которого больше нет коллег');
  assert.equal(count(`select count(*) from public.links where '${a}' in (from_id, to_id)`), 0);
  assert.equal(count(`select count(*) from public.cards where user_id = '${b}'`), 1, 'карточка того, кого можно найти, на месте');
  fails('select public.leave_colleagues()', 'anon', /permission denied/);
});

test('выгрузка своих данных показывает карточку, статус и связи; удаление аккаунта стирает всё', () => {
  const [a, b] = pair();
  share(a, 'status'); share(a, 'place', [b]);
  status(a, 'trip', { place: 'Сосновка', dest: 'Ольховка', part: 'day' });
  const data = json('select public.export_my_data()', a);
  assert.equal(data.colleagues_status.place, 'Сосновка', 'станции статуса — в выгрузке');
  assert.equal(data.colleagues_status.dest, 'Ольховка');
  assert.deepEqual(data.colleagues_access, [{ item: 'place', to: b }, { item: 'status', to: 'all' }], 'и кому что видно');
  assert.equal(data.colleagues_card.name, 'Никита');
  assert.equal(data.colleagues_status.kind, 'trip');
  assert.equal(data.colleagues.length, 1);
  assert.equal(data.colleagues[0].with, b);
  assert.equal(data.colleagues[0].state, 'accepted');
  assert.ok(!JSON.stringify(data).includes('Анна'), 'чужая карточка в мою выгрузку не попадает');
  q(`insert into private.limits (user_id, day, searches) values ('${a}', private.today(), 3) on conflict (user_id, day) do update set searches = 3`);
  q('select public.delete_my_account()', a);
  for (const [t, col] of [['public.cards', 'user_id'], ['public.statuses', 'user_id'], ['public.status_places', 'user_id'], ['public.access', 'user_id'], ['public.access', 'viewer_id'], ['private.limits', 'user_id'], ['public.links', 'from_id'], ['public.links', 'to_id']]) {
    assert.equal(count(`select count(*) from ${t} where ${col} = '${a}'`), 0, t);
  }
  assert.equal(count(`select count(*) from public.links`, b), 0, 'у коллеги связь пропала');
});

test('ежедневная очистка: устаревшие статусы, старые отказы и предложения, ненужные карточки, старые счётчики', () => {
  const [a, b] = pair();
  share(a, 'status'); share(a, 'place');
  status(a, 'wait', { place: 'Ольховка' });
  q(`update public.statuses set expires_at = now() - interval '1 minute' where user_id = '${a}'`);
  const c = account();
  const d = account();
  card(c, { name: 'Ц' });
  card(d, { name: 'Д', find: true });
  offer(c, d);
  q(`update public.links set created_at = now() - interval '31 days' where id = private.pair('${c}', '${d}')`);
  const e = account();
  card(e, { name: 'Е' });
  q(`update public.cards set updated_at = now() - interval '2 days' where user_id in ('${c}', '${e}')`);
  q(`insert into private.limits (user_id, day, searches) values ('${e}', private.today() - 5, 1)`);
  q('select private.cleanup_logs()');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0);
  assert.equal(count(`select count(*) from public.status_places where user_id = '${a}'`), 0, 'станции — вместе со статусом');
  assert.equal(count(`select count(*) from public.links where id = private.pair('${c}', '${d}')`), 0, 'предложение без ответа старше 30 дней');
  assert.equal(count(`select count(*) from public.cards where user_id in ('${c}', '${e}')`), 0, 'карточки без связей и без «можно найти»');
  assert.equal(count(`select count(*) from public.cards where user_id in ('${a}', '${b}', '${d}')`), 3, 'нужные карточки на месте');
  assert.equal(count(`select count(*) from private.limits where user_id = '${e}'`), 0);
});

test('кому видно: никому, всем коллегам или выбранным; «где я» — только тем, кто видит и статус', () => {
  const a = account();
  const [b, c, stranger] = [account(), account(), account()];
  card(a, { name: 'Никита', find: true });
  card(b, { name: 'Анна', find: true }); card(c, { name: 'Олег', find: true }); card(stranger, { name: 'Чужой', find: true });
  offer(b, a); accept(a, b);
  offer(c, a); accept(a, c);
  const sees = (who, t = 'statuses') => count(`select count(*) from public.${t} where user_id = '${a}'`, who);
  // выбранным: Анна видит, Олег — нет
  share(a, 'status', [b, stranger]);
  status(a, 'rest', { place: 'Ольховка', until: new Date(Date.now() + 3600e3).toISOString() });
  assert.equal(sees(b), 1);
  assert.equal(sees(c), 0, 'коллегу не выбрали — не видит');
  assert.equal(sees(stranger), 0, 'не коллегу выбрать нельзя: правило не сохранилось');
  assert.deepEqual(q(`select coalesce(viewer_id::text, 'все') from public.access where user_id = '${a}'`), [b], 'в правилах только коллеги');
  // «где я» Олегу разрешили, а статус — нет: станций он тоже не видит
  share(a, 'place', [b, c]);
  status(a, 'rest', { place: 'Ольховка', until: new Date(Date.now() + 3600e3).toISOString() });
  assert.equal(sees(b, 'status_places'), 1);
  assert.equal(sees(c, 'status_places'), 0, 'без статуса и станций не видно');
  // всем коллегам — и тем, кто появится
  share(a, 'status');
  assert.equal(sees(b) + sees(c), 2);
  assert.equal(sees(stranger), 0, '«все коллеги» — это не все пользователи');
  const d = account(); card(d, { name: 'Дарья', find: true }); offer(d, a); accept(a, d);
  assert.equal(sees(d), 1, 'новый коллега видит статус, если выбрано «все коллеги»');
  assert.equal(sees(d, 'status_places'), 0, 'а станции — нет: их показывают только Анне и Олегу');
  // никому — статус стирается сразу
  share(a, 'status', false);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`), 0, 'никому не показываю — не храню');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${a}'`), 0);
  fails(`select public.set_access('gps', true, null)`, a, /bad item/);
  fails(`select public.set_access('status', true, null)`, 'anon', /permission denied/);
});

test('правила «кому видно» видит только хозяин; удалил из коллег — разрешение пропало и само не вернётся', () => {
  const [a, b] = pair();
  share(a, 'status', [b]); share(a, 'place', [b]);
  assert.equal(count('select count(*) from public.access', b), 0, 'коллега не видит, что я ему разрешил');
  assert.equal(count('select count(*) from public.access', a), 2);
  assert.ok(q(`select private.allowed('${a}', 'status')`, b)[0] === 't', 'а проверить «мне можно?» — может');
  assert.ok(q(`select private.allowed('${a}', 'status')`, account())[0] === 'f');
  q(`select public.drop_colleague('${b}')`, a);
  assert.equal(count(`select count(*) from public.access where user_id = '${a}'`), 0, 'разрешения между нами стёрты');
  card(a, { name: 'Никита' });
  assert.equal(offer(a, b), 'sent', 'кто удалил, может передумать'); accept(b, a);
  status(a, 'wait', { place: 'Ольховка' });
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`, b), 0, 'снова коллеги — но видеть разрешают заново');
});

test('без согласия разрешить показ нельзя, а убрать — можно', () => {
  const [a, b] = pair();
  share(a, 'status', [b]);
  q(`update public.consents set withdrawn_at = now() where user_id = '${a}' and document = 'privacy-2'`);
  fails(`select public.set_access('status', true, null)`, a, /consent required/);
  assert.equal(count(`select count(*) from public.access where user_id = '${a}'`), 1, 'отказ ничего не поменял');
  share(a, 'status', false);
  assert.equal(count(`select count(*) from public.access where user_id = '${a}'`), 0);
});
