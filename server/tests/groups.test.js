// Сервер, шаг 7: группы коллег.
// Главные вопросы: может ли чужой (не участник) увидеть группу, её участников или изменить её? Видит ли участник группы
// мой статус, если я сам не включил «Показывать моей группе»? Ответ всегда «нет». Все имена и станции — выдуманные.
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
  const code = `GRP${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('g${n}@example.test', '{"consent":"privacy-6","invite":"${code}","platform":"web","version":"2.22.0"}'::jsonb) returning id`, 'auth');
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  if (name) q(`select public.save_card(${lit(name)}, null, null, null, false)`, id);
  return id;
}
function colleagues(a, b) {
  q(`select public.give_consent('publish-2')`, b);
  q(`select public.save_card(coalesce((select name from public.cards where user_id = '${b}'), 'Коллега'), null, null, null, true)`, b);
  q(`select public.offer_colleague('${b}')`, a);
  q(`select public.answer_colleague('${a}', true)`, b);
}
const create = (who, name = 'Бригада 7') => q(`select public.create_group(${lit(name)})`, who)[0];
const code = (who, g, fresh = false) => q(`select public.group_code('${g}', ${fresh})`, who)[0];
const join = (who, c) => q(`select public.join_group(${lit(c)})`, who)[0];
const shareG = (who, g, st, pl = false) => q(`select public.set_group_share('${g}', ${st}, ${pl})`, who);
const status = (who, kind = 'trip', place = 'Сосновка', dest = 'Ольховка') =>
  q(`select public.set_status(${lit(kind)}, ${lit(place)}, ${lit(dest)}, 'morning', null, null)`, who);
// Группа из админа и двух участников, вступивших по коду
function trio() {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const c = account({ name: 'Олег' });
  const g = create(a);
  const k = code(a, g);
  join(b, k);
  join(c, k);
  return { a, b, c, g, k };
}

test('новые таблицы под RLS: без входа — отказ, писать напрямую нельзя никому', () => {
  for (const t of ['groups', 'group_members', 'group_invites']) {
    assert.deepEqual(q(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`), ['t'], t);
    fails(`select * from public.${t}`, 'anon', /permission denied/);
  }
  for (const t of ['group_codes', 'group_bans']) {
    assert.deepEqual(q(`select relrowsecurity from pg_class where oid = 'private.${t}'::regclass`), ['t'], t);
  }
  const { a, g } = trio();
  fails(`insert into public.groups (name) values ('Моя')`, a, /permission denied/);
  fails(`update public.groups set name = 'Взлом' where id = '${g}'`, a, /permission denied/);
  fails(`update public.group_members set role = 'admin'`, a, /permission denied/);
  fails(`delete from public.group_members`, a, /permission denied/);
  fails(`insert into public.group_invites (group_id, user_id, invited_by) values ('${g}', '${a}', '${a}')`, a, /permission denied/);
  fails('select * from private.group_codes', a, /permission denied/);
  fails('select private.shares(auth.uid(), \'status\')', a, /permission denied/);
  for (const f of ['create_group(\'X\')', `group_code('${g}', false)`, 'join_group(\'ABC\')', `leave_group('${g}')`]) {
    fails(`select public.${f}`, 'anon', /permission denied/);
  }
});

test('создать группу: нужны согласие новой редакции и имя; название до 30 знаков, не уникально', () => {
  const noName = account({ name: null });
  fails('select public.create_group(\'Бригада\')', noName, /name required/);
  const old = account();
  q(`update public.consents set document = 'privacy-3' where user_id = '${old}'`);
  fails('select public.create_group(\'Бригада\')', old, /consent required/);
  const a = account();
  fails('select public.create_group(\'   \')', a, /name required/);
  const g1 = create(a, `  Колонна\n№1 ${'я'.repeat(40)}`);
  const [name] = q(`select name from public.groups where id = '${g1}'`, a);
  assert.ok(name.startsWith('Колонна №1') && name.length === 30, 'служебные символы убраны, не длиннее 30');
  const g2 = create(account(), 'Колонна №1');
  assert.notEqual(g1, g2, 'одинаковые названия можно');
  assert.deepEqual(q(`select role from public.group_members where group_id = '${g1}'`, a), ['admin']);
});

test('чужой не видит группу, участников и приглашения; участник видит группу и участников', () => {
  const { a, b, g } = trio();
  const stranger = account({ name: 'Чужой' });
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`, stranger), 0);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, stranger), 0);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, b), 3);
  assert.deepEqual(q(`select name from public.groups where id = '${g}'`, b), ['Бригада 7']);
  // карточки участников видны друг другу, чужому — нет
  assert.equal(count(`select count(*) from public.cards where user_id = '${a}'`, b), 1);
  assert.equal(count(`select count(*) from public.cards where user_id = '${a}'`, stranger), 0);
  // код видит только администратор
  fails(`select public.group_code('${g}', false)`, b, /forbidden/);
  fails(`select public.group_code('${g}', false)`, stranger, /forbidden/);
});

test('код группы: вступить можно, сменили код — старый не работает; угадывать — не больше 20 раз в день', () => {
  const { a, g, k } = trio();
  const d = account();
  const peek = json(`select public.peek_group(${lit(k.toLowerCase().replace(/(.{5})/, '$1 '))})`, d);
  assert.deepEqual([peek.id, peek.name, peek.members, peek.member], [g, 'Бригада 7', 3, false], 'регистр и пробелы в коде не важны');
  assert.equal(code(a, g), k, 'тот же код, пока не сменили');
  const k2 = code(a, g, true);
  assert.notEqual(k2, k);
  assert.deepEqual(q(`select coalesce(public.join_group(${lit(k)})::text, 'нет')`, d), ['нет'], 'старый код не работает');
  assert.equal(join(d, k2), g);
  assert.equal(join(d, k2), g, 'повторно — без ошибки');
  const e = account();
  for (let i = 0; i < 20; i++) assert.deepEqual(q(`select coalesce(public.join_group('ZZZZZZZZ${String(i).padStart(2, '0')}')::text, 'нет')`, e), ['нет']);
  fails(`select public.join_group('ZZZZZZZZZZ')`, e, /limit/);
  fails(`select public.peek_group(${lit(k2)})`, e, /limit/, 'даже верный код после 20 ошибок — завтра');
  assert.deepEqual(q(`select coalesce(public.peek_group('NOPE000000')::text, 'нет')`, d), ['нет']);
});

test('приглашение: только администратор и только своего коллегу; коллега сам принимает или отказывается', () => {
  const { a, b, g } = trio();
  const friend = account({ name: 'Пётр' });
  const notFriend = account({ name: 'Семён' });
  colleagues(a, friend);
  colleagues(b, notFriend);
  fails(`select public.invite_to_group('${g}', '${notFriend}')`, b, /forbidden/, 'участник не приглашает');
  fails(`select public.invite_to_group('${g}', '${notFriend}')`, a, /not found/, 'не коллега администратора');
  assert.deepEqual(q(`select public.invite_to_group('${g}', '${friend}')`, a), ['sent']);
  assert.deepEqual(q(`select public.invite_to_group('${g}', '${friend}')`, a), ['sent'], 'повторно — без дубля');
  assert.equal(count(`select count(*) from public.group_invites where group_id = '${g}'`, a), 1, 'администратор видит приглашение');
  assert.equal(count(`select count(*) from public.group_invites where group_id = '${g}'`, b), 0, 'участник — нет');
  assert.equal(count(`select count(*) from public.group_invites`, friend), 1, 'приглашённый видит своё');
  assert.deepEqual(q(`select name from public.groups where id = '${g}'`, friend), ['Бригада 7'], 'и название группы');
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, friend), 0, 'но не участников');
  fails(`select public.answer_group_invite('${g}', true)`, notFriend, /not found/);
  q(`select public.answer_group_invite('${g}', true)`, friend);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, friend), 4);
  assert.equal(count(`select count(*) from public.group_invites`, friend), 0);
  // отказ
  const g2 = create(a, 'Другая');
  q(`select public.invite_to_group('${g2}', '${friend}')`, a);
  q(`select public.answer_group_invite('${g2}', false)`, friend);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g2}'`, a), 1);
  // удалил из коллег — приглашение пропало
  q(`select public.invite_to_group('${g2}', '${friend}')`, a);
  q(`select public.drop_colleague('${a}')`, friend);
  assert.equal(count(`select count(*) from public.group_invites where group_id = '${g2}'`), 0);
  // отмена
  const f2 = account({ name: 'Фёдор' });
  colleagues(a, f2);
  q(`select public.invite_to_group('${g2}', '${f2}')`, a);
  q(`select public.cancel_group_invite('${g2}', '${f2}')`, a);
  assert.equal(count(`select count(*) from public.group_invites`, f2), 0);
});

test('статус: участники группы видят его, только если человек сам включил «Показывать моей группе»', () => {
  const { a, b, c, g } = trio();
  const stranger = account();
  status(b);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0, 'показывать некому — сервер не хранит');
  shareG(b, g, true);
  status(b);
  // статус в группе — взаимно (2.27): кто свой не показывает, чужой не видит
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 0, 'админ свой не показывает — не видит');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 0, 'участник свой не показывает — не видит');
  shareG(a, g, true);
  shareG(c, g, true, true);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 1, 'админ показывает — видит');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 1, 'участник показывает — видит');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, stranger), 0, 'чужой — нет');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`), 0, 'станции без «где я» не хранятся');
  shareG(b, g, true, true);
  status(b);
  assert.deepEqual(q(`select place || '>' || dest from public.status_places where user_id = '${b}'`, c), ['Сосновка>Ольховка']);
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`, a), 0, 'А не показывает «где я» — станций не видит');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`, stranger), 0);
  // «где я» без статуса не бывает
  shareG(b, g, false, true);
  assert.deepEqual(q(`select show_status, show_place from public.group_members where group_id = '${g}' and user_id = '${b}'`), ['f|f']);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0, 'выключил — статус стёрт сразу');
  // в другой группе с теми же людьми, где не включено, — не видно
  const g2 = create(c, 'Вторая');
  join(b, code(c, g2));
  shareG(b, g2, true);
  shareG(c, g2, true);
  status(b);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 1);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 0, 'А не во второй группе — не видит');
  // включить — только с согласием
  q(`update public.consents set withdrawn_at = now() where user_id = '${c}'`);
  fails(`select public.set_group_share('${g}', true, false)`, c, /consent required/);
  q(`select public.set_group_share('${g}', false, false)`, c);
});

test('статус для коллег и для группы не мешают друг другу', () => {
  const { a, b, g } = trio();
  const friend = account({ name: 'Пётр' });
  colleagues(b, friend);
  q(`select public.set_access('status', true, null)`, b);
  shareG(a, g, true);
  shareG(b, g, true);
  status(b);
  q(`select public.set_access('status', false, null)`, b);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 1, 'коллегам выключил — группа видит');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, friend), 0, 'коллега больше не видит');
  shareG(b, g, false);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0, 'никому — не хранится');
});

test('администратор: переименовать, исключить (по коду 30 дней не вернуться), передать права, удалить группу', () => {
  const { a, b, c, g, k } = trio();
  fails(`select public.rename_group('${g}', 'Взлом')`, b, /forbidden/);
  q(`select public.rename_group('${g}', 'Колонна 3')`, a);
  assert.deepEqual(q(`select name from public.groups where id = '${g}'`, c), ['Колонна 3']);
  fails(`select public.remove_from_group('${g}', '${a}')`, b, /forbidden/);
  q(`select public.remove_from_group('${g}', '${c}')`, a);
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`, c), 0, 'исключённый больше не видит группу');
  fails(`select public.join_group(${lit(k)})`, c, /banned/);
  colleagues(a, c);
  q(`select public.invite_to_group('${g}', '${c}')`, a);
  q(`select public.answer_group_invite('${g}', true)`, c);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, c), 3, 'по приглашению — можно');
  fails(`select public.make_group_admin('${g}', '${c}')`, b, /forbidden/);
  q(`select public.make_group_admin('${g}', '${b}')`, a);
  assert.deepEqual(q(`select user_id from public.group_members where group_id = '${g}' and role = 'admin'`), [b], 'администратор один');
  fails(`select public.rename_group('${g}', 'Снова')`, a, /forbidden/, 'прежний больше не администратор');
  fails(`select public.delete_group('${g}')`, a, /forbidden/);
  q(`select public.delete_group('${g}')`, b);
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`), 0);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`), 0);
  assert.equal(count(`select count(*) from private.group_codes where group_id = '${g}'`), 0);
});

test('ушёл администратор — права у того, кто дольше в группе; ушли все — группы нет', () => {
  const { a, b, c, g } = trio();
  q(`select public.leave_group('${g}')`, a);
  assert.deepEqual(q(`select user_id from public.group_members where group_id = '${g}' and role = 'admin'`), [b]);
  q(`delete from auth.users where id = '${b}'`); // удалил аккаунт
  assert.deepEqual(q(`select user_id from public.group_members where group_id = '${g}' and role = 'admin'`), [c]);
  q(`select public.leave_group('${g}')`, c);
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`), 0);
});

test('лимиты: не больше 10 групп у человека и 200 участников в группе; групп в день — не больше 5', () => {
  const a = account();
  for (let i = 0; i < 5; i++) create(a, `Г${i}`);
  fails('select public.create_group(\'Шестая\')', a, /limit/);
  const b = account();
  const admins = Array.from({ length: 10 }, () => account());
  const groups = admins.map((x) => create(x));
  groups.forEach((g, i) => join(b, code(admins[i], g)));
  const extra = account();
  const gx = create(extra);
  fails(`select public.join_group(${lit(code(extra, gx))})`, b, /groups limit/);
  // 200 участников: добавляем напрямую (как будто вступили), 201-й — отказ
  q(`set local session_replication_role = replica; insert into auth.users (email) select 'm' || i || '@example.test' from generate_series(1, 199) i;
    insert into public.group_members (group_id, user_id) select '${gx}', id from auth.users where email like 'm%@example.test'`);
  fails(`select public.join_group(${lit(code(extra, gx))})`, account(), /group full/);
});

test('«Выйти из „Коллег“» выводит из групп; удаление аккаунта стирает всё; выгрузка показывает группы', () => {
  const { a, b, g } = trio();
  shareG(b, g, true, true);
  status(b);
  const data = json('select public.export_my_data()', b);
  assert.deepEqual(data.groups.map((x) => [x.name, x.role, x.show_status, x.show_place, x.members]), [['Бригада 7', 'member', true, true, 3]]);
  q('select public.leave_colleagues()', b);
  assert.equal(count(`select count(*) from public.group_members where user_id = '${b}'`), 0);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0);
  q('select public.leave_colleagues()', a);
  assert.deepEqual(q(`select role from public.group_members where group_id = '${g}'`), ['admin'], 'группа перешла к оставшемуся');
});

test('очистка: приглашения без ответа старше 30 дней и статусы, которые никому не показывают', () => {
  const { a, b, g } = trio();
  const friend = account({ name: 'Пётр' });
  colleagues(a, friend);
  q(`select public.invite_to_group('${g}', '${friend}')`, a);
  q(`update public.group_invites set created_at = now() - interval '31 days'`);
  shareG(b, g, true);
  status(b);
  q(`update public.group_members set show_status = false where user_id = '${b}'`); // как будто изменилось в обход функций
  q('select private.cleanup_logs()');
  assert.equal(count('select count(*) from public.group_invites'), 0);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0);
});

// ---------------------------------------------------------------- шаг 9 (2.27)

test('статус в группе взаимно: выключил свой — чужие снова не видны; коллегам — как раньше', () => {
  const { a, b, c, g } = trio();
  shareG(b, g, true, true);
  status(b);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 0, 'C свой не показывает');
  shareG(c, g, true);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 1, 'C показывает статус — видит статус');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`, c), 0, 'а станции — только за свои станции');
  shareG(c, g, true, true);
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`, c), 1, 'показал «где я» — видит станции');
  shareG(c, g, false);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 0, 'выключил свой — снова не видит');
  assert.equal(count(`select count(*) from public.status_places where user_id = '${b}'`, c), 0);
  // коллега видит по правилу «кому видно», даже если в общей группе свой не показывает
  colleagues(a, b);
  q(`select public.set_access('status', true, null)`, b);
  status(b);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, a), 1, 'коллега видит как раньше');
  // показывать в одной группе не открывает чужие статусы в другой
  const g2 = create(c, 'Вторая');
  join(b, code(c, g2));
  shareG(b, g2, true);
  q(`select public.set_group_share('${g}', false, false)`, b);
  shareG(c, g, true);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`, c), 0, 'B показывает только во второй, C показывает только в первой');
});

test('картинка группы: только администратор, только известные значения; видят участники, чужой — нет', () => {
  const { a, b, g } = trio();
  const stranger = account();
  q(`select public.set_group_pic('${g}', '{"k":"text","t":"ТД-64","f":"u","sz":3,"sh":"circle","bg":2}'::jsonb)`, a);
  assert.deepEqual(json(`select pic from public.groups where id = '${g}'`, b), { k: 'text', t: 'ТД-64', f: 'u', sz: 3, sh: 'circle', bg: 2 });
  assert.equal(count(`select count(*) from public.groups where id = '${g}'`, stranger), 0, 'чужой группу не видит');
  fails(`select public.set_group_pic('${g}', '{"k":"num","n":5}'::jsonb)`, b, /forbidden/);
  fails(`select public.set_group_pic('${g}', '{"k":"num","n":5}'::jsonb)`, stranger, /forbidden/);
  fails(`select public.set_group_pic('${g}', '{"k":"num","n":5}'::jsonb)`, 'anon', /permission denied/);
  fails(`update public.groups set pic = '{"k":"num","n":1}' where id = '${g}'`, a, /permission denied/);
  // лишнее выбрасывается, неизвестное — отказ
  q(`select public.set_group_pic('${g}', '{"k":"num","n":"7","x":"<script>","bg":1}'::jsonb)`, a);
  assert.deepEqual(json(`select pic from public.groups where id = '${g}'`, a), { k: 'num', n: 7, sh: 'rnd', bg: 1 });
  q(`select public.set_group_pic('${g}', '{"k":"art","a":"steam","sh":"sq","bg":7}'::jsonb)`, a);
  assert.deepEqual(json(`select pic from public.groups where id = '${g}'`, a), { k: 'art', a: 'steam', sh: 'sq', bg: 7 });
  for (const bad of ['{"k":"img","src":"http://x"}', '{"k":"num","n":100}', '{"k":"num","n":0}', '{"k":"art","a":"logo"}',
    '{"k":"text","t":"<b>x</b>"}', '{"k":"text","t":"123456789"}', '{"k":"text","t":"ТД","f":"arial"}', '{"k":"text","t":"ТД","sz":4}',
    '{"k":"num","n":1,"sh":"star"}', '{"k":"num","n":1,"bg":8}', '[1,2]', '"x"']) {
    fails(`select public.set_group_pic('${g}', '${bad}'::jsonb)`, a, /bad pic/);
  }
  // убрать картинку
  q(`select public.set_group_pic('${g}', null)`, a);
  assert.deepEqual(q(`select coalesce(pic::text, 'нет') from public.groups where id = '${g}'`, a), ['нет']);
  // приглашённый видит название и картинку (как и раньше — только саму группу)
  q(`select public.set_group_pic('${g}', '{"k":"num","n":3}'::jsonb)`, a);
  const friend = account({ name: 'Пётр' });
  colleagues(a, friend);
  q(`select public.invite_to_group('${g}', '${friend}')`, a);
  assert.equal(count(`select count(*) from public.groups where id = '${g}' and pic is not null`, friend), 1);
  assert.equal(count(`select count(*) from public.group_members where group_id = '${g}'`, friend), 0, 'участников приглашённый не видит');
});

test('предложить стать коллегами участнику общей группы — можно, даже если его нельзя найти; чужому — нельзя', () => {
  const { a, b, c } = trio();
  const stranger = account({ name: 'Пётр' });
  assert.equal(count(`select count(*) from public.cards where user_id = '${b}' and searchable`), 0, 'B не в поиске');
  assert.deepEqual(q(`select public.offer_colleague('${b}')`, a), ['sent']);
  assert.deepEqual(q(`select public.offer_colleague('${c}')`, b), ['sent']);
  q(`select public.answer_colleague('${a}', true)`, b);
  assert.equal(count(`select count(*) from public.links where state = 'accepted' and '${a}' in (from_id, to_id) and '${b}' in (from_id, to_id)`), 1);
  fails(`select public.offer_colleague('${b}')`, stranger, /not found/);
  fails(`select public.offer_colleague('${stranger}')`, a, /not found/);
  // отказ — пауза 30 дней, как и раньше
  q(`select public.drop_colleague('${b}')`, c);
  fails(`select public.offer_colleague('${c}')`, b, /later/);
  // вышел из группы — больше не участник общей группы
  const { a: a2, b: b2, g: g2 } = trio();
  q(`select public.leave_group('${g2}')`, b2);
  fails(`select public.offer_colleague('${b2}')`, a2, /not found/);
});
