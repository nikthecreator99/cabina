// Сервер, шаг 1: аккаунты, согласие, приглашения, удаление, статистика и правила доступа.
// Главный вопрос каждого теста: «может ли чужой увидеть или изменить мои данные?» — ответ всегда «нет».
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDb } from './db.js';

// Текущая редакция согласия (с шагом 2 «Коллеги» — privacy-2) и прошлая, которая для регистрации уже не подходит
const CONSENT = 'privacy-2';
const OLD = 'privacy-1';

let db;
before(async () => { db = await startDb(); });
after(async () => { await db?.stop(); });

const q = (text, who) => {
  const r = db.sql(text, who);
  assert.ok(r.ok, `ожидался успех: ${r.err}\n${text}`);
  return r.rows;
};
const denied = (text, who, re = /permission denied|forbidden|not signed in/) => {
  const r = db.sql(text, who);
  assert.ok(!r.ok, `ожидался отказ:\n${text}`);
  assert.match(r.err, re);
};

let n = 0;
const invite = () => {
  const admin = q(`select p.id from public.profiles p where role = 'admin' limit 1`)[0];
  if (admin) return q('select public.admin_create_invite()', admin)[0];
  const code = `TEST${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  return code;
};
// Так регистрирует встроенный вход Supabase: строка в auth.users с данными из signUp.
const signup = (email, meta) => db.sql(
  `insert into auth.users (email, raw_user_meta_data) values ('${email}', '${JSON.stringify(meta)}'::jsonb) returning id`, 'auth');
const register = (email, extra = {}) => {
  const r = signup(email, { consent: CONSENT, invite: invite(), platform: 'web', version: '2.8.0', ...extra });
  assert.ok(r.ok, r.err);
  return r.rows[0];
};

test('без согласия аккаунт не создаётся', () => {
  const r = signup('a1@example.test', { invite: invite(), platform: 'web' });
  assert.ok(!r.ok);
  assert.match(r.err, /consent required/);
  const r2 = signup('a1@example.test', { consent: OLD, invite: invite() });
  assert.match(r2.err, /consent required/, 'старая редакция согласия не подходит');
  assert.deepEqual(q(`select count(*) from auth.users where email = 'a1@example.test'`), ['0']);
});

test('в закрытом режиме без живого приглашения аккаунт не создаётся', () => {
  assert.match(signup('a2@example.test', { consent: CONSENT }).err, /invite required/);
  assert.match(signup('a2@example.test', { consent: CONSENT, invite: 'NOSUCHCODE' }).err, /invite required/);
  const code = invite();
  q(`update private.invites set expires_at = now() - interval '1 minute' where code_hash = private.hash_code('${code}')`);
  assert.match(signup('a2@example.test', { consent: CONSENT, invite: code }).err, /invite required/, 'просроченное');
  assert.deepEqual(q(`select count(*) from auth.users where email = 'a2@example.test'`), ['0']);
});

test('регистрация по приглашению: профиль и согласие созданы, лишнее не сохранено, код одноразовый', () => {
  const code = invite();
  const r = signup('a3@example.test', { consent: CONSENT, invite: code.toLowerCase(), platform: 'android', version: '2.8.0', depot: 'лишнее' });
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  assert.deepEqual(q(`select role, platform, app_version, last_seen is not null from public.profiles where id = '${id}'`), ['user|android|2.8.0|t']);
  assert.deepEqual(q(`select document from public.consents where user_id = '${id}'`), [CONSENT]);
  assert.deepEqual(q(`select raw_user_meta_data from auth.users where id = '${id}'`), ['{}'], 'код и прочее не хранятся');
  assert.deepEqual(q(`select used_by from private.invites where code_hash = private.hash_code('${code}')`), [id]);
  assert.deepEqual(q(`select count(*) from private.invites where code_hash = '${code}'`), ['0'], 'сам код не хранится');
  assert.match(signup('a4@example.test', { consent: CONSENT, invite: code }).err, /invite required/, 'второй раз тем же кодом');
});

test('странная платформа и версия не сохраняются', () => {
  const id = register('a5@example.test', { platform: '<script>', version: '1; drop table x' });
  assert.deepEqual(q(`select platform is null, app_version is null from public.profiles where id = '${id}'`), ['t|t']);
});

test('чужой не видит мой профиль и мои согласия', () => {
  const me = register('me@example.test');
  const other = register('other@example.test');
  assert.deepEqual(q('select id from public.profiles', me), [me]);
  assert.deepEqual(q('select count(*) from public.consents', me), ['1']);
  assert.deepEqual(q(`select count(*) from public.profiles where id = '${me}'`, other), ['0']);
  assert.deepEqual(q(`select count(*) from public.consents where user_id = '${me}'`, other), ['0']);
});

test('без входа не видно ничего', () => {
  register('b1@example.test');
  denied('select * from public.profiles', 'anon');
  denied('select * from public.consents', 'anon');
  denied('select * from private.invites', 'anon');
  denied('select * from private.stats_daily', 'anon');
  denied('select public.export_my_data()', 'anon');
  denied('select public.delete_my_account()', 'anon');
  denied('select public.admin_stats()', 'anon');
});

test('напрямую в таблицы писать нельзя: ни себе роль администратора, ни чужие строки', () => {
  const me = register('c1@example.test');
  const other = register('c2@example.test');
  denied(`update public.profiles set role = 'admin' where id = '${me}'`, me);
  denied(`delete from public.profiles where id = '${other}'`, me);
  denied(`insert into public.consents (user_id, document) values ('${other}', '${CONSENT}')`, me);
  denied(`delete from public.consents where user_id = '${me}'`, me);
  denied('select * from private.invites', me);
  denied('select * from private.stats_daily', me);
  denied('select * from private.config', me);
  denied(`select private.bump('signup', 'web')`, me);
  denied(`update private.config set value = 'false' where key = 'invite_only'`, me);
  assert.deepEqual(q(`select role from public.profiles where id = '${me}'`), ['user']);
});

test('«заходил сегодня»: только дата, платформа и версия своего аккаунта', () => {
  const me = register('d1@example.test');
  const other = register('d2@example.test', { platform: 'web' });
  q(`update public.profiles set last_seen = date '2026-01-01' where id in ('${me}', '${other}')`);
  q(`select public.touch('ios', '2.9.0')`, me);
  assert.deepEqual(q(`select last_seen = private.today(), platform, app_version from public.profiles where id = '${me}'`), ['t|ios|2.9.0']);
  assert.deepEqual(q(`select last_seen, platform from public.profiles where id = '${other}'`), ['2026-01-01|web'], 'чужой не задет');
  q(`select public.touch('windows', 'abc')`, me);
  assert.deepEqual(q(`select platform, app_version from public.profiles where id = '${me}'`), ['ios|2.9.0']);
});

test('выгрузка своих данных: всё о себе и ничего о других', () => {
  const me = register('e1@example.test');
  register('e2@example.test');
  const data = JSON.parse(q('select public.export_my_data()', me)[0]);
  assert.equal(data.email, 'e1@example.test');
  assert.equal(data.consents.length, 1);
  assert.equal(data.consents[0].document, CONSENT);
  assert.ok(!JSON.stringify(data).includes('e2@example.test'));
});

test('удаление аккаунта стирает всё, что с ним связано', () => {
  const me = register('f1@example.test');
  const other = register('f2@example.test');
  q(`insert into auth.sessions (user_id, ip) values ('${me}', '10.0.0.1'), ('${other}', '10.0.0.2')`);
  const before = Number(q(`select coalesce(sum(value), 0) from private.stats_daily where metric = 'deleted'`)[0]);
  q('select public.delete_my_account()', me);
  for (const [t, col] of [['auth.users', 'id'], ['public.profiles', 'id'], ['public.consents', 'user_id'], ['auth.sessions', 'user_id']]) {
    assert.deepEqual(q(`select count(*) from ${t} where ${col} = '${me}'`), ['0'], t);
  }
  assert.deepEqual(q(`select count(*) from private.invites where used_by = '${me}'`), ['0']);
  assert.deepEqual(q(`select count(*) from public.profiles where id = '${other}'`), ['1'], 'чужой аккаунт на месте');
  assert.equal(Number(q(`select sum(value) from private.stats_daily where metric = 'deleted'`)[0]), before + 1);
  assert.deepEqual(q('select public.export_my_data()', me), [], 'после удаления о человеке ничего не известно');
});

test('статистика: только администратор и только числа', () => {
  const user = register('g1@example.test', { platform: 'ios' });
  denied('select public.admin_stats()', user);
  denied('select public.admin_create_invite()', user);
  const admin = register('g2@example.test');
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
  q(`update auth.users set email_confirmed_at = now() where id = '${user}'`);
  const s = JSON.parse(q('select public.admin_stats()', admin)[0]);
  const total = Number(q('select count(*) from public.profiles')[0]);
  assert.equal(s.total, total);
  assert.ok(s.confirmed >= 1);
  assert.ok(s.active_1 >= 2);
  assert.ok(s.platforms.ios >= 1);
  const today = s.daily.find((d) => d.day === s.today);
  assert.ok(today.signup >= total, 'регистрации за сегодня посчитаны');
  assert.ok(today.confirmed >= 1, 'подтверждения почты посчитаны');
  const text = JSON.stringify(s);
  assert.ok(!text.includes('@'), 'нет почты');
  assert.ok(!text.includes(user) && !text.includes(admin), 'нет идентификаторов');
  const code = q('select public.admin_create_invite()', admin)[0];
  assert.match(code, /^[0-9A-F]{10}$/);
  q(`delete from auth.users where id = '${admin}'`);
});

test('лишние данные в user_metadata после регистрации не сохраняются', () => {
  const me = register('h1@example.test');
  q(`update auth.users set raw_user_meta_data = '{"phone":"+70000000000"}' where id = '${me}'`, 'auth');
  assert.deepEqual(q(`select raw_user_meta_data from auth.users where id = '${me}'`), ['{}']);
});

test('IP-адреса в журналах входа хранятся не дольше 30 дней', () => {
  const me = register('i1@example.test');
  q(`insert into auth.audit_log_entries (created_at, ip_address) values (now() - interval '31 days', '10.0.0.1'), (now(), '10.0.0.2')`);
  q(`insert into auth.sessions (user_id, created_at, ip, user_agent) values ('${me}', now() - interval '31 days', '10.0.0.1', 'x'), ('${me}', now(), '10.0.0.2', 'y')`);
  q('select private.cleanup_logs()');
  assert.deepEqual(q(`select ip_address from auth.audit_log_entries where ip_address <> ''`), ['10.0.0.2']);
  assert.deepEqual(q(`select host(ip) from auth.sessions where user_id = '${me}' and ip is not null`), ['10.0.0.2']);
});

// --- Правила, которые должны соблюдаться и для всех будущих таблиц и функций ---

test('у каждой таблицы в public и private включены правила доступа (RLS)', () => {
  const rows = q(`select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where c.relkind = 'r' and n.nspname in ('public', 'private') and not c.relrowsecurity`);
  assert.deepEqual(rows, [], `таблицы без RLS: ${rows.join(', ')}`);
});

test('у приложения без входа нет прав ни на одну таблицу', () => {
  const rows = q(`select table_schema || '.' || table_name || ' ' || privilege_type from information_schema.role_table_grants
                  where grantee = 'anon' and table_schema in ('public', 'private')`);
  assert.deepEqual(rows, []);
});

test('вошедший может только читать, и только таблицы, где есть правило «своё»', () => {
  const grants = q(`select distinct table_name || ' ' || privilege_type from information_schema.role_table_grants
                    where grantee = 'authenticated' and table_schema in ('public', 'private') order by 1`);
  for (const g of grants) assert.match(g, / SELECT$/, `лишнее право: ${g}`);
  const withPolicy = new Set(q(`select tablename from pg_policies where schemaname = 'public'`));
  for (const g of grants) assert.ok(withPolicy.has(g.split(' ')[0]), `у ${g} нет правила доступа`);
});

test('всё, что ссылается на аккаунт, удаляется вместе с ним', () => {
  const rows = q(`select conrelid::regclass::text || ' ' || confdeltype::text from pg_constraint
                  where contype = 'f' and confrelid = 'auth.users'::regclass
                    and connamespace in (select oid from pg_namespace where nspname in ('public', 'private'))`);
  assert.ok(rows.length >= 3);
  for (const r of rows) assert.match(r, / [cn]$/, `${r}: нужно on delete cascade (или set null без личных данных)`);
});

test('функции приложения защищены от подмены и закрыты для тех, кто не вошёл', () => {
  const rows = q(`select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''),
                         has_function_privilege('anon', p.oid, 'execute')
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  assert.ok(rows.length >= 5);
  for (const r of rows) {
    const [name, secdef, conf, anon] = r.split('|');
    assert.equal(secdef, 't', `${name}: security definer`);
    assert.match(conf, /search_path=/, `${name}: задан search_path`);
    assert.equal(anon, 'f', `${name}: недоступна без входа`);
  }
});
