// Сервер, шаг 14: расширенная статистика роста для администратора.
// Главные вопросы: видит ли её кто-то, кроме администратора? Есть ли в ней почта, id, имена? Ответ — «нет».
// И считает ли она правильно: заходы по дням (раз в сутки на человека), приглашения, группы, «остаются через 7 и 30 дней».
// Почты и названия — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDb } from './db.js';

let db;
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

let n = 0;
const adminCode = () => {
  const code = `GRW${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  return code;
};
const signup = (code) => db.sql(`insert into auth.users (email, raw_user_meta_data)
  values ('g${++n}@example.test', '{"consent":"privacy-6","invite":"${code}","platform":"web","version":"2.32.2"}'::jsonb) returning id`, 'auth');
function account({ code = adminCode() } = {}) {
  const r = signup(code);
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  q(`update auth.users set email_confirmed_at = now() where id = '${id}'`);
  return id;
}
let admin;
const growth = (args = `null, null`) => json(`select public.admin_growth(${args})`, admin);
const today = () => q('select private.today()')[0];
const day = (shift) => q(`select private.today() + ${shift}`)[0];

before(async () => {
  db = await startDb();
  admin = account();
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
});

test('видит только администратор: без входа, обычный человек — отказ; служебная функция закрыта', () => {
  const user = account();
  fails('select public.admin_growth(null, null)', 'anon', /permission denied/);
  fails('select public.admin_growth(null, null)', user, /forbidden/);
  fails(`select private.growth_sum(current_date, current_date)`, user, /permission denied/);
  fails(`select private.growth_sum(current_date, current_date)`, admin, /permission denied/);
  fails('select * from private.stats_daily', user, /permission denied/);
  const g = growth();
  assert.equal(g.today, today());
  assert.ok(g.now.total >= 2);
});

test('неверный период — отказ', () => {
  fails(`select public.admin_growth('${today()}'::date, '${day(-1)}'::date)`, admin, /bad period/);
  fails(`select public.admin_growth('${day(-4000)}'::date, '${today()}'::date)`, admin, /bad period/);
  fails(`select public.admin_growth('${day(-1)}'::date, '${today()}'::date, '${day(-5)}'::date, null)`, admin, /bad period/);
  fails(`select public.admin_growth('${day(-1)}'::date, '${today()}'::date, '${day(-2)}'::date, '${day(-5)}'::date)`, admin, /bad period/);
});

test('заходы по дням: один раз за сутки на человека, день регистрации — по регистрации, без того, кто именно', () => {
  const a = account();
  const b = account();
  const was0 = growth(`'${day(-1)}'::date, '${today()}'::date`);
  const t0 = was0.days.find((d) => d.d === today())?.active || 0;
  // в день регистрации touch ничего не прибавляет: человек уже посчитан регистрацией
  q(`select public.touch('web', '2.32.2')`, a);
  assert.equal(growth(`'${day(-1)}'::date, '${today()}'::date`).days.find((d) => d.d === today()).active, t0);
  // заходили вчера — сегодня первый заход прибавляет 1, второй и третий — ничего
  q(`update public.profiles set last_seen = private.today() - 1 where id in ('${a}', '${b}')`);
  q(`select public.touch('android', '2.32.2')`, a);
  q(`select public.touch('android', '2.32.2')`, a);
  q(`select public.touch('web', '2.32.2')`, b);
  q(`select public.touch('web', '2.32.2')`, b);
  const g = growth(`'${day(-1)}'::date, '${today()}'::date`);
  assert.equal(g.days.find((d) => d.d === today()).active, t0 + 2);
  // в таблице — только суммы по устройствам, без людей
  assert.deepEqual(q(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'stats_daily' order by 1`),
    ['day', 'metric', 'platform', 'value']);
  assert.equal(q(`select value from private.stats_daily where day = private.today() and metric = 'active' and platform = 'android'`)[0], '1');
  // touch сам по себе работает как раньше
  assert.deepEqual(q(`select last_seen = private.today(), platform, active_days from public.profiles where id = '${a}'`), ['t|android|2']);
  fails(`select public.touch('web', '2.32.2')`, 'anon', /permission denied|not signed in/);
});

test('до дня, с которого считаются заходы, заходов нет (а не ноль)', () => {
  const g = growth(`'${day(-30)}'::date, '${today()}'::date`);
  assert.equal(g.active_since, today());
  assert.equal(g.cur.active_days, 1, 'считается только сегодня');
  for (const d of g.days) if (d.d < today()) assert.equal(d.active, undefined);
});

test('итоги периода и сравнение с прошлым: регистрации, приглашения коллег, группы, «остаются через 7 и 30 дней»', () => {
  // прошлые дни — как их записал бы сервер
  q(`insert into private.stats_daily (day, metric, platform, value) values
      (private.today() - 40, 'signup', 'web', 3), (private.today() - 40, 'confirmed', 'web', 2),
      (private.today() - 10, 'signup', 'web', 5), (private.today() - 10, 'deleted', 'web', 1),
      (private.today() - 9, 'signup', 'android', 2)`);
  // приглашение коллеги: создал, по нему зарегистрировались
  const host = account();
  const code = json('select public.create_invite()', host).code;
  const guest = account({ code });
  q(`update private.invites set used_at = now() - interval '10 days' where used_by = '${guest}'`);
  // группа, созданная 9 дней назад
  q(`insert into public.groups (name, created_at) values ('Бригада Сосновки', now() - interval '9 days')`);
  // «остаются»: зарегистрировались 40 и 10 дней назад; кто-то заходил после 7-го (и 30-го) дня, кто-то нет
  const p1 = account(); const p2 = account(); const p3 = account(); const p4 = account();
  q(`update public.profiles set created_on = private.today() - 40, last_seen = private.today() - 5 where id = '${p1}'`);   // и неделю, и месяц
  q(`update public.profiles set created_on = private.today() - 40, last_seen = private.today() - 38 where id = '${p2}'`);  // ушёл сразу
  q(`update public.profiles set created_on = private.today() - 10, last_seen = private.today() where id = '${p3}'`);       // неделя — да
  q(`update public.profiles set created_on = private.today() - 10, last_seen = private.today() - 9 where id = '${p4}'`);   // неделя — нет

  const g = growth(`'${day(-14)}'::date, '${day(-8)}'::date, '${day(-44)}'::date, '${day(-38)}'::date`);
  assert.equal(g.cur.from, day(-14));
  assert.equal(g.cur.signup, 7);
  assert.equal(g.cur.deleted, 1);
  assert.equal(g.cur.invited, 1, 'пришёл по приглашению коллеги');
  assert.equal(g.cur.groups, 1);
  assert.deepEqual(g.cur.cohort, { n: 2, age7: 2, back7: 1, age30: 0, back30: 0 });
  assert.equal(g.prev.signup, 3);
  assert.equal(g.prev.confirmed, 2);
  assert.deepEqual(g.prev.cohort, { n: 2, age7: 2, back7: 1, age30: 2, back30: 1 });
  const d10 = g.days.find((d) => d.d === day(-10));
  assert.deepEqual({ ...d10, d: undefined }, { d: undefined, signup: 5, deleted: 1, invited: 1, joined: 2 });
  assert.equal(g.days.find((d) => d.d === day(-9)).groups, 1);
  assert.ok(g.base >= 2, 'аккаунтов к началу периода');
  // без сравнения — prev пустой; пустое начало — с первой регистрации
  assert.equal(growth(`'${day(-3)}'::date, '${today()}'::date`).prev, null);
  const all = growth();
  assert.equal(all.cur.from, day(-40));
  assert.equal(all.first_day, day(-40));
  // будущее обрезается сегодняшним днём
  assert.equal(growth(`'${day(-1)}'::date, '${day(30)}'::date`).cur.to, today());
});

test('сейчас: сколько пользуется «Коллегами», статусом, часами, заметками, группами — только числа', () => {
  const was = growth().now;
  const a = account(); const b = account();
  q(`insert into public.cards (user_id, name, searchable) values ('${a}', 'Пётр', true), ('${b}', 'Иван', false)`);
  q(`insert into public.links (from_id, to_id, state) values ('${a}', '${b}', 'accepted')`);
  q(`insert into public.statuses (user_id, kind, expires_at) values ('${a}', 'trip', now() + interval '1 day'), ('${b}', 'rest', now() - interval '1 hour')`);
  q(`insert into public.status_places (user_id, place) values ('${a}', 'Сосновка')`);
  q(`insert into public.hours (user_id, month, cur_min, expires_at) values ('${a}', '2026-11', 600, now() + interval '7 days')`);
  q(`insert into public.loco_notes (user_id, note_key, loco_num, body, month) values
      ('${a}', 'n1', '1234', 'Тугой кран', date '2026-11-01'), ('${a}', 'n2', '5678', 'Течёт масло', date '2026-11-01')`);
  const gid = q(`insert into public.groups (name) values ('Депо') returning id`)[0];
  q(`insert into public.group_members (group_id, user_id, role, show_status) values ('${gid}', '${a}', 'admin', true), ('${gid}', '${b}', 'member', false)`);
  const now = growth().now;
  const d = (k) => now[k] - was[k];
  assert.equal(d('total'), 2);
  assert.equal(d('colleagues'), 2);
  assert.equal(d('findable'), 1);
  assert.equal(d('links'), 1);
  assert.equal(d('status'), 1, 'устаревший статус не считается');
  assert.equal(d('place'), 1);
  assert.equal(d('hours'), 1);
  assert.equal(d('notes'), 1, 'людей, а не заметок');
  assert.equal(d('groups'), 1);
  assert.equal(d('in_groups'), 2);
  assert.equal(d('group_status'), 1);
  assert.ok(now.platforms.web >= 2);
  assert.ok(now.versions['2.32.2'] >= 2);
});

test('в ответе нет почты, идентификаторов, имён и текстов; удалённый аккаунт пропадает из чисел', () => {
  const me = account();
  q(`insert into public.cards (user_id, name, depot) values ('${me}', 'Секретный Машинист', 'ТЧЭ-99')`);
  q(`insert into public.loco_notes (user_id, note_key, loco_num, body, month) values ('${me}', 'z', '9999', 'Особый текст заметки', date '2026-11-01')`);
  const g = growth();
  const text = JSON.stringify(g);
  assert.ok(!text.includes('@'), 'нет почты');
  for (const id of q('select id from auth.users')) assert.ok(!text.includes(id), 'нет идентификаторов');
  for (const s of ['Секретный', 'ТЧЭ-99', '9999', 'Особый', 'Бригада Сосновки', 'Сосновка']) assert.ok(!text.includes(s), `нет «${s}»`);
  const total = g.now.total; const cards = g.now.colleagues; const notes = g.now.notes;
  q(`select public.delete_my_account()`, me);
  const after = growth().now;
  assert.equal(after.total, total - 1);
  assert.equal(after.colleagues, cards - 1);
  assert.equal(after.notes, notes - 1);
  assert.ok(growth().days.find((d) => d.d === today()).deleted >= 1, 'удаление посчитано числом');
});

test('прежняя статистика (admin_stats) для приложений до 2.32.2 работает как раньше', () => {
  const s = json('select public.admin_stats()', admin);
  assert.ok(Number.isInteger(s.total) && Array.isArray(s.daily));
});
