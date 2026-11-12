// Сервер, шаг 13: поиск групп по названию, открытые группы и заявки (решения Никиты 12.11.2026).
// Главные вопросы: находит ли чужой группу, которую администратор не показал в поиске? Видит ли он через поиск состав,
// число участников или администратора? Может ли попасть в закрытую группу без одобрения? Ответ всегда «нет».
// Все имена и названия — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
const count = (sql, who) => Number(q(sql, who)[0]);

let n = 0;
function account({ name = 'Иван' } = {}) {
  const code = `GSR${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('s${n}@example.test', '{"consent":"privacy-6","invite":"${code}","platform":"web","version":"2.33.0"}'::jsonb) returning id`, 'auth');
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  if (name) q(`select public.save_card(${lit(name)}, null, null, null, false)`, id);
  return id;
}
const create = (who, name) => q(`select public.create_group(${lit(name)})`, who)[0];
const search = (who, g, listed, open = false) => q(`select public.set_group_search('${g}', ${listed}, ${open})`, who);
const find = (who, text) => json(`select public.find_groups(${lit(text)})`, who);
const ask = (who, g) => q(`select public.request_group('${g}')`, who)[0];
const answer = (who, g, u, yes) => q(`select public.answer_group_request('${g}', '${u}', ${yes})`, who);
const member = (g, u) => count(`select count(*) from public.group_members where group_id = '${g}' and user_id = '${u}'`) === 1;
const resetLimits = () => q('delete from private.limits');

test('новая редакция согласия privacy-6: со старой поиск не работает', () => {
  assert.equal(q(`select value from private.config where key = 'consent_version'`)[0], 'privacy-6');
  const me = account();
  q(`update public.consents set withdrawn_at = now() where user_id = '${me}' and document = 'privacy-6'`);
  fails(`select public.find_groups('колонна')`, me, /consent required/);
  fails(`select public.find_groups('колонна')`, 'anon', /permission denied/);
});

test('группа без «Показывать в поиске» не находится; в найденной — только название, картинка и «открытая»', () => {
  const a = account({ name: 'Админ' });
  const b = account({ name: 'Участник' });
  const x = account({ name: 'Чужой' });
  const g = create(a, 'Колонна Сосновка');
  const k = q(`select public.group_code('${g}', false)`, a)[0];
  q(`select public.join_group('${k}')`, b);
  // уже существующая и новая группа без отметки — скрыты
  assert.equal(q(`select listed from public.groups where id = '${g}'`)[0], 'f');
  assert.deepEqual(find(x, 'сосновка'), []);
  // показал — находится по части названия, без учёта регистра, «ё» и знаков
  search(a, g, true);
  for (const t of ['СОСНОВКА', 'колоннасос', 'Колонна-Сосн', 'осно']) assert.equal(find(x, t).length, 1, t);
  const [r] = find(x, 'сосновка');
  assert.deepEqual(Object.keys(r).sort(), ['id', 'me', 'name', 'open', 'pic']);
  assert.equal(r.name, 'Колонна Сосновка');
  assert.equal(r.open, false);
  assert.equal(r.me, null);
  assert.equal(find(b, 'сосновка')[0].me, 'member');
  // таблицы группы чужому по-прежнему закрыты
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`, x), 0);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, x), 0);
  assert.equal(count(`select count(*) from public.cards where user_id in ('${a}', '${b}')`, x), 0);
  // убрал из поиска — не находится
  search(a, g, false);
  assert.deepEqual(find(x, 'сосновка'), []);
});

test('поиск: только с аккаунтом, от 3 букв, не больше 10 результатов и 30 поисков в день', () => {
  resetLimits();
  const x = account();
  for (let i = 0; i < 12; i++) { const own = account(); search(own, create(own, `Депо Ольховка ${i}`), true); }
  fails(`select public.find_groups('ол')`, x, /short query/);
  fails(`select public.find_groups('-- %')`, x, /short query/);
  assert.equal(find(x, 'ольховка').length, 10);
  // знаки подстановки — не шаблон
  assert.deepEqual(find(x, 'ол%ка'), find(x, 'олка'));
  for (let i = 3; i < 30; i++) find(x, 'ольховка');
  fails(`select public.find_groups('ольховка')`, x, /cabina: limit/);
});

test('закрытая группа: только по заявке, администратор видит карточку заявителя и решает', () => {
  resetLimits();
  const a = account({ name: 'Админ' });
  const m = account({ name: 'Участник' });
  const x = account({ name: 'Заявитель' });
  const y = account({ name: 'Посторонний' });
  const g = create(a, 'Бригада Ёлкино');
  const k = q(`select public.group_code('${g}', false)`, a)[0];
  q(`select public.join_group('${k}')`, m);
  // не в поиске — заявку не подать
  fails(`select public.request_group('${g}')`, x, /not found/);
  search(a, g, true);
  assert.equal(ask(x, g), 'sent');
  assert.equal(ask(x, g), 'sent', 'повтор не плодит заявки');
  assert.equal(member(g, x), false);
  // заявку видят только сам заявитель и администратор; карточку заявителя — только администратор
  assert.equal(count(`select count(*) from public.group_requests where group_id = '${g}'`, x), 1);
  assert.equal(count(`select count(*) from public.group_requests where group_id = '${g}'`, a), 1);
  assert.equal(count(`select count(*) from public.group_requests where group_id = '${g}'`, m), 0);
  assert.equal(count(`select count(*) from public.group_requests where group_id = '${g}'`, y), 0);
  assert.equal(count(`select count(*) from public.cards where user_id = '${x}'`, a), 1);
  assert.equal(count(`select count(*) from public.cards where user_id = '${x}'`, m), 0);
  // заявитель видит название своей группы, но не участников
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`, x), 1);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, x), 0);
  // ответить может только администратор
  fails(`select public.answer_group_request('${g}', '${x}', true)`, m, /forbidden/);
  fails(`select public.answer_group_request('${g}', '${x}', true)`, x, /forbidden/);
  // менять заявки напрямую нельзя
  fails(`delete from public.group_requests`, x, /permission denied/);
  fails(`insert into public.group_requests (group_id, user_id) values ('${g}', '${y}')`, y, /permission denied/);
  fails(`update public.groups set listed = true`, a, /permission denied/);
  fails(`select public.set_group_search('${g}', true, true)`, m, /forbidden/);
  // отклонил — 30 дней заново нельзя, карточка администратору больше не видна
  answer(a, g, x, false);
  assert.equal(member(g, x), false);
  assert.equal(count(`select count(*) from public.cards where user_id = '${x}'`, a), 0);
  assert.equal(find(x, 'ёлкино')[0].me, 'declined');
  fails(`select public.request_group('${g}')`, x, /later/);
  q(`update public.group_requests set answered_at = now() - interval '31 days' where user_id = '${x}'`);
  q(`select public.save_card('Заявитель', null, null, null, false)`, x); // карточку снова сохраняет приложение (ensureCard)
  assert.equal(ask(x, g), 'sent');
  // принял — в группе, заявки больше нет
  answer(a, g, x, true);
  assert.equal(member(g, x), true);
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${x}'`), 0);
  assert.equal(ask(x, g), 'member');
  fails(`select public.answer_group_request('${g}', '${x}', true)`, a, /not found/);
});

test('открытая группа: вступить сразу; исключённого 30 дней не пускает', () => {
  resetLimits();
  const a = account({ name: 'Админ' });
  const x = account({ name: 'Новичок' });
  const g = create(a, 'Открытые Ворота');
  search(a, g, true, true);
  assert.equal(find(x, 'ворота')[0].open, true);
  assert.equal(ask(x, g), 'joined');
  assert.equal(member(g, x), true);
  q(`select public.remove_from_group('${g}', '${x}')`, a);
  fails(`select public.request_group('${g}')`, x, /later/);
  // заявка в закрытую, потом группу открыли — вступает сразу
  const y = account({ name: 'Другой' });
  search(a, g, true, false);
  assert.equal(ask(y, g), 'sent');
  search(a, g, true, true);
  assert.equal(ask(y, g), 'joined');
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${y}'`), 0);
});

test('без имени заявку не подать; лимит 10 заявок в день', () => {
  resetLimits();
  const noName = account({ name: null });
  const groups = [];
  for (let i = 0; i < 11; i++) { const a = account({ name: 'Админ' }); const g = create(a, `Колонна ${i}`); search(a, g, true); groups.push(g); }
  fails(`select public.request_group('${groups[0]}')`, noName, /name required/);
  const x = account({ name: 'Торопыга' });
  for (let i = 0; i < 10; i++) assert.equal(ask(x, groups[i]), 'sent');
  fails(`select public.request_group('${groups[10]}')`, x, /cabina: limit/);
});

test('отозвать заявку, «Выйти из „Коллег“», удаление аккаунта и очистка стирают заявки', () => {
  resetLimits();
  const a = account({ name: 'Админ' });
  const g = create(a, 'Колонна Чистая');
  search(a, g, true);
  const x = account({ name: 'Передумал' });
  ask(x, g);
  q(`select public.cancel_group_request('${g}')`, x);
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${x}'`), 0);
  assert.equal(count(`select count(*) from public.cards where user_id = '${x}'`), 0, 'карточка без поиска и связей больше не нужна');
  const y = account({ name: 'Ушёл' });
  ask(y, g);
  q('select public.leave_colleagues()', y);
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${y}'`), 0);
  const z = account({ name: 'Удалился' });
  ask(z, g);
  const exp = json('select public.export_my_data()', z);
  assert.equal(exp.group_requests.length, 1);
  assert.equal(exp.group_requests[0].group, 'Колонна Чистая');
  assert.equal(json('select public.export_my_data()', a).groups[0].in_search, true);
  q('select public.delete_my_account()', z);
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${z}'`), 0);
  // очистка: без ответа старше 30 дней
  const w = account({ name: 'Ждёт' });
  ask(w, g);
  q(`update public.group_requests set created_at = now() - interval '31 days' where user_id = '${w}'`);
  q('select private.cleanup_logs()');
  assert.equal(count(`select count(*) from public.group_requests where user_id = '${w}'`), 0);
  // удалили группу — заявки тоже
  const v = account({ name: 'Последний' });
  ask(v, g);
  q(`select public.delete_group('${g}')`, a);
  assert.equal(count(`select count(*) from public.group_requests where group_id = '${g}'`), 0);
});
