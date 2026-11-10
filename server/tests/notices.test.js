// Сервер, шаг 10: уведомления — «попросить показать статус» и ответ / комментарий к идее.
// Главные вопросы: видит ли чужой чью-то просьбу? Может ли человек просить того, кто ему не коллега? Включает ли просьба что-нибудь сама?
// Может ли обычный человек комментировать идеи? Ответ всегда «нет». Все имена — выдуманные.
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
  const code = `NTC${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('n${n}@example.test', '{"consent":"privacy-4","invite":"${code}","platform":"web","version":"2.28.0"}'::jsonb) returning id`, 'auth');
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
const ask = (who, to) => q(`select public.ask_status('${to}')`, who)[0];

test('просьба показать статус: только коллеге, видит её только тот, кого просят', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const c = account({ name: 'Олег' });
  fails(`select public.ask_status('${b}')`, a, /not found/);            // ещё не коллеги
  fails(`select public.ask_status('${a}')`, a, /not found/);            // себя
  fails(`select public.ask_status(null)`, a, /not found/);
  fails(`select public.ask_status('${b}')`, 'anon', /permission denied/);
  colleagues(a, b);
  assert.equal(ask(a, b), 'sent');
  assert.deepEqual(q(`select asker, state from public.status_asks`, b), [`${a}|open`]);
  assert.equal(count('select count(*) from public.status_asks', a), 0, 'просящий не видит своих просьб (и ответа на них)');
  assert.equal(count('select count(*) from public.status_asks', c), 0, 'чужой не видит');
  fails('select count(*) from public.status_asks', 'anon', /permission denied/);
  fails(`insert into public.status_asks (asker, target) values ('${c}', '${a}')`, c, /permission denied/);
  fails(`update public.status_asks set state = 'muted' where target = '${b}'`, b, /permission denied/);
  fails(`delete from public.status_asks where target = '${b}'`, b, /permission denied/);
  assert.equal(ask(a, b), 'later', 'не чаще раза в 7 дней');
  assert.equal(count('select count(*) from public.status_asks', b), 1);
});

test('просьба ничего не включает; «не сейчас» и «больше не просить»; повторная — через 7 дней', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  assert.equal(ask(a, b), 'sent');
  assert.equal(count(`select count(*) from public.access where user_id = '${b}'`), 0, 'просьба ничего не включила');
  assert.equal(count(`select count(*) from public.statuses where user_id = '${b}'`), 0);
  q(`select public.answer_status_ask('${a}', false)`, b);
  assert.deepEqual(q('select state from public.status_asks', b), ['dismissed']);
  assert.equal(ask(a, b), 'later', 'пауза считается и после «не сейчас»');
  q(`update public.status_asks set asked_at = now() - interval '8 days'`);
  assert.equal(ask(a, b), 'sent');
  assert.deepEqual(q('select state from public.status_asks', b), ['open']);
  // «больше не просить»: просящему отвечают «отправлено», но у того ничего не появляется
  q(`select public.answer_status_ask('${a}', true)`, b);
  q(`update public.status_asks set asked_at = now() - interval '8 days'`);
  assert.equal(ask(a, b), 'sent');
  assert.deepEqual(q('select state from public.status_asks', b), ['muted']);
  // чужой не может ответить за меня
  const c = account({ name: 'Олег' });
  q(`select public.answer_status_ask('${a}', false)`, c);
  assert.deepEqual(q('select state from public.status_asks', b), ['muted']);
});

test('человек сам включил показ статуса — просьба выполнена; уже показывает — «already»', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const c = account({ name: 'Олег' });
  colleagues(a, b);
  colleagues(a, c);
  assert.equal(ask(a, b), 'sent');
  assert.equal(ask(c, a), 'sent');
  // b показывает статус только c — просьба a остаётся
  q(`select public.set_access('status', false, array['${c}']::uuid[])`, b);
  assert.equal(count('select count(*) from public.status_asks', b), 1);
  // b показывает статус всем коллегам — просьба a выполнена
  q(`select public.set_access('status', true, null)`, b);
  assert.equal(count('select count(*) from public.status_asks', b), 0);
  assert.equal(ask(a, b), 'already');
  assert.equal(count('select count(*) from public.status_asks', a), 1, 'чужие просьбы не тронуты');
  // a показывает статус выбранному c — просьба c выполнена
  q(`select public.set_access('status', false, array['${c}']::uuid[])`, a);
  assert.equal(count('select count(*) from public.status_asks', a), 0);
});

test('перестали быть коллегами или вышли из «Коллег» — просьбы стираются; очистка и выгрузка', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const c = account({ name: 'Олег' });
  colleagues(a, b);
  colleagues(a, c);
  ask(a, b); ask(c, a);
  const data = json('select public.export_my_data()', b);
  assert.equal(data.status_asks.asked_me.length, 1);
  assert.equal(data.status_asks.asked_by_me.length, 0);
  assert.equal(json('select public.export_my_data()', a).status_asks.asked_by_me.length, 1);
  q(`select public.drop_colleague('${b}')`, a);
  assert.equal(count('select count(*) from public.status_asks where target = ' + `'${b}'`), 0);
  q('select public.leave_colleagues()', a);
  assert.equal(count('select count(*) from public.status_asks'), count(`select count(*) from public.status_asks where asker not in ('${a}') and target not in ('${a}')`));
  assert.equal(count(`select count(*) from public.status_asks where '${a}' in (asker, target)`), 0);
  // очистка: открытые и «не сейчас» старше 30 дней стираются, «больше не просить» — остаётся, пока коллеги
  const d = account({ name: 'Ира' });
  const e = account({ name: 'Паша' });
  colleagues(d, e);
  ask(d, e);
  q(`select public.answer_status_ask('${d}', true)`, e);
  q(`update public.status_asks set asked_at = now() - interval '40 days'`);
  q('select private.cleanup_logs()');
  assert.deepEqual(q(`select state from public.status_asks where asker = '${d}'`), ['muted']);
  const f = account({ name: 'Сеня' });
  colleagues(d, f);
  ask(d, f);
  q(`update public.status_asks set asked_at = now() - interval '40 days' where target = '${f}'`);
  q('select private.cleanup_logs()');
  assert.equal(count(`select count(*) from public.status_asks where target = '${f}'`), 0);
  // удаление аккаунта уносит и просьбы
  q(`delete from auth.users where id = '${e}'`);
  assert.equal(count(`select count(*) from public.status_asks where '${e}' in (asker, target)`), 0);
});

test('не больше 20 просьб в сутки', () => {
  const a = account({ name: 'Никита' });
  for (let i = 0; i < 20; i++) {
    const t = account({ name: null });
    q(`insert into public.status_asks (asker, target) values ('${a}', '${t}')`);
  }
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  fails(`select public.ask_status('${b}')`, a, /limit/);
  assert.equal(count(`select count(*) from public.status_asks where target = '${b}'`), 0);
});

test('ответ и комментарий к идее: только администратор, только автору; уведомление до прочтения', () => {
  const me = account({ name: 'Анна' });
  const other = account({ name: 'Олег' });
  const admin = account({ name: 'Никита' });
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
  const id = q(`select public.send_idea('Добавьте тёмную тему для квитка')`, me)[0];
  fails(`select public.admin_answer_idea('${id}', null, 'Спасибо')`, me, /forbidden/);
  fails(`select public.admin_answer_idea('${id}', null, 'Спасибо')`, 'anon', /permission denied/);
  fails(`select public.admin_answer_idea('${id}')`, admin, /empty/);
  // комментарий к ещё не отвеченной идее — не уведомление
  q(`select public.admin_answer_idea('${id}', null, ${lit('  Подумаем,\n  спасибо  ')})`, admin);
  assert.deepEqual(q(`select state, admin_note, seen_at is not null from public.ideas where id = '${id}'`, me), ['new|Подумаем, спасибо|t']);
  // ответ — уведомление: не прочитано
  q(`select public.admin_answer_idea('${id}', true, null)`, admin);
  assert.deepEqual(q(`select state, admin_note, seen_at is null from public.ideas where id = '${id}'`, me), ['accepted|Подумаем, спасибо|t']);
  assert.equal(count(`select count(*) from public.ideas where seen_at is null and state <> 'new'`, me), 1);
  assert.equal(count(`select count(*) from public.ideas`, other), 0, 'чужой не видит идею и комментарий');
  // старый вызов (id, принять) работает как раньше
  const id2 = q(`select public.send_idea('Ещё одна идея про отдых')`, me)[0];
  q(`select public.admin_answer_idea('${id2}', false)`, admin);
  assert.deepEqual(q(`select state, admin_note from public.ideas where id = '${id2}'`, me), ['declined|']);
  // автор открыл уведомления; чужое «прочитано» не трогается
  q('select public.mark_ideas_seen()', other);
  assert.equal(count(`select count(*) from public.ideas where seen_at is null`, me), 2);
  q('select public.mark_ideas_seen()', me);
  assert.equal(count(`select count(*) from public.ideas where seen_at is null`, me), 0);
  // комментарий к уже отвеченной идее снова делает её «непрочитанной»
  q(`select public.admin_answer_idea('${id}', null, 'Сделали в 2.28')`, admin);
  assert.equal(count(`select count(*) from public.ideas where seen_at is null`, me), 1);
  // длина — не больше 300, пустая строка стирает комментарий
  q(`select public.admin_answer_idea('${id}', null, ${lit('я'.repeat(500))})`, admin);
  assert.equal(count(`select char_length(admin_note) from public.ideas where id = '${id}'`, me), 300);
  q(`select public.admin_answer_idea('${id}', null, '   ')`, admin);
  assert.deepEqual(q(`select admin_note is null from public.ideas where id = '${id}'`, me), ['t']);
  // свою идею с комментарием автор видит в выгрузке
  q(`select public.admin_answer_idea('${id}', null, 'Спасибо!')`, admin);
  assert.ok(json('select public.export_my_data()', me).ideas.some((x) => x.comment === 'Спасибо!'));
  // без прямых записей
  fails(`update public.ideas set admin_note = 'сам себе' where id = '${id}'`, me, /permission denied/);
  fails(`update public.ideas set seen_at = null where id = '${id}'`, me, /permission denied/);
  // администратор видит комментарий в списке, без id автора
  const it = json('select public.admin_ideas()', admin).find((x) => x.id === id);
  assert.equal(it.note, 'Спасибо!');
  assert.ok(!('user_id' in it));
});
