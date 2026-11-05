// Сервер, шаг 5: личные приглашения и «Идеи».
// Главный вопрос: может ли чужой увидеть или изменить мои приглашения и идеи, узнать, кого я пригласил? Ответ — «нет».
// Почты и тексты — выдуманные.
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

let n = 0;
const adminCode = () => {
  const code = `INV${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  return code;
};
const signup = (code, consent = 'privacy-4') => db.sql(`insert into auth.users (email, raw_user_meta_data)
  values ('i${++n}@example.test', '{"consent":"${consent}","invite":"${code}","platform":"web","version":"2.20.0"}'::jsonb) returning id`, 'auth');
function account({ confirmed = true, code = adminCode() } = {}) {
  const r = signup(code);
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  if (confirmed) q(`update auth.users set email_confirmed_at = now() where id = '${id}'`);
  return id;
}
const invite = (who) => json('select public.create_invite()', who);
const mine = (who) => json('select public.my_invites()', who);
// «Заходил в CABINA в d разных дней»: как будто touch вызывался в разные дни
const activeDays = (who, d) => q(`update public.profiles set active_days = ${d} where id = '${who}'`);

test('новая редакция согласия privacy-4: со старой регистрация не проходит, приглашения и идеи не работают', () => {
  assert.match(signup(adminCode(), 'privacy-3').err, /consent required/);
  const me = account();
  q(`update public.consents set document = 'privacy-3' where user_id = '${me}'`);
  fails('select public.create_invite()', me, /consent required/);
  fails(`select public.send_idea('Добавьте тёмную тему для PDF')`, me, /consent required/);
  q(`select public.give_consent('privacy-4')`, me);
  assert.match(invite(me).code, /^[0-9A-F]{10}$/);
});

test('приглашение: только после подтверждения почты; код показывается один раз, на сервере — только хеш', () => {
  const me = account({ confirmed: false });
  fails('select public.create_invite()', me, /email not confirmed/);
  fails('select public.create_invite()', 'anon', /permission denied/);
  q(`update auth.users set email_confirmed_at = now() where id = '${me}'`);
  const inv = invite(me);
  assert.match(inv.code, /^[0-9A-F]{10}$/);
  assert.ok(new Date(inv.expires_at) - Date.now() > 13 * 864e5, 'действует 14 дней');
  assert.deepEqual(q(`select count(*) from private.invites where code_hash = '${inv.code}'`), ['0'], 'сам код не хранится');
  assert.deepEqual(q(`select created_by from private.invites where code_hash = private.hash_code('${inv.code}')`), [me]);
  const m = mine(me);
  assert.equal(m.open.length, 1);
  assert.equal(m.open[0].id, inv.id);
  assert.equal(JSON.stringify(m).includes(inv.code), false, 'в списке кода нет');
  assert.deepEqual([m.joined, m.counted, m.limit, m.need_days], [0, 0, 10, 3]);
});

test('не больше 10 неиспользованных приглашений; отменённое и просроченное место освобождают', () => {
  const me = account();
  const list = Array.from({ length: 10 }, () => invite(me));
  fails('select public.create_invite()', me, /limit/);
  q(`select public.drop_invite('${list[0].id}')`, me);
  invite(me);
  q(`update private.invites set expires_at = now() - interval '1 minute' where id = '${list[1].id}'`);
  invite(me);
  fails('select public.create_invite()', me, /limit/);
  // отменённым кодом зарегистрироваться нельзя
  assert.match(signup(list[0].code).err, /invite required/);
});

test('регистрация по личному приглашению; засчитывается после подтверждения почты и 3 разных дней', () => {
  const me = account();
  const inv = invite(me);
  const friend = account({ confirmed: false, code: inv.code.toLowerCase() });
  assert.match(signup(inv.code).err, /invite required/, 'код одноразовый');
  let m = mine(me);
  assert.deepEqual([m.open.length, m.joined, m.counted], [0, 1, 0], 'пришёл, но ещё не засчитан');
  q(`update auth.users set email_confirmed_at = now() where id = '${friend}'`);
  assert.equal(mine(me).counted, 0, 'почта есть, дней мало');
  activeDays(friend, 3);
  m = mine(me);
  assert.equal(m.counted, 1);
  // кто именно пришёл — не видно: ни почты, ни id
  const all = JSON.stringify(m);
  assert.ok(!all.includes(friend) && !all.includes('@'), all);
});

test('touch: +1 день только при первом заходе за сутки; сами даты не хранятся', () => {
  const me = account();
  assert.deepEqual(q(`select active_days from public.profiles where id = '${me}'`), ['1']);
  q(`select public.touch('web', '2.20.0')`, me);
  assert.deepEqual(q(`select active_days from public.profiles where id = '${me}'`), ['1'], 'в день регистрации — тот же день');
  q(`update public.profiles set last_seen = last_seen - 1 where id = '${me}'`);
  q(`select public.touch('web', '2.20.0')`, me);
  q(`select public.touch('web', '2.20.0')`, me);
  assert.deepEqual(q(`select active_days from public.profiles where id = '${me}'`), ['2']);
});

test('чужой не видит и не отменяет мои приглашения; таблица приглашений закрыта от приложения', () => {
  const me = account();
  const other = account();
  const inv = invite(me);
  assert.equal(mine(other).open.length, 0);
  q(`select public.drop_invite('${inv.id}')`, other);
  assert.equal(mine(me).open.length, 1, 'чужая отмена ничего не сделала');
  fails('select * from private.invites', other, /permission denied/);
  fails('select * from private.invites', 'anon', /permission denied/);
  fails(`select private.invites_counted('${me}')`, other, /permission denied/);
  fails(`update private.invites set created_by = '${other}'`, other, /permission denied/);
});

test('пригласивший удалил аккаунт — его приглашения стёрты, приглашённый остаётся; приглашённый удалил — счёт уменьшился', () => {
  const me = account();
  const a = account({ code: invite(me).code });
  const b = account({ code: invite(me).code });
  activeDays(a, 3); activeDays(b, 3);
  invite(me);
  assert.deepEqual([mine(me).joined, mine(me).counted, mine(me).open.length], [2, 2, 1]);
  q('select public.delete_my_account()', b);
  assert.deepEqual([mine(me).joined, mine(me).counted], [2, 1], 'пришёл и ушёл: засчитан больше не считается');
  q('select public.delete_my_account()', me);
  assert.deepEqual(q(`select count(*) from private.invites where created_by = '${me}'`), ['0']);
  assert.deepEqual(q(`select count(*) from auth.users where id = '${a}'`), ['1'], 'приглашённый не пострадал');
  assert.equal(json('select public.export_my_data()', a).invited_by, null, 'связи с удалённым больше нет');
});

test('идеи: текст чистится, от 3 до 500 знаков, 5 в день; видит только автор; стереть может только автор', () => {
  const me = account();
  const other = account();
  fails(`select public.send_idea('  ')`, me, /empty/);
  fails(`select public.send_idea('ok')`, me, /empty/);
  fails(`select public.send_idea('Идея')`, 'anon', /permission denied/);
  const id = q(`select public.send_idea(${lit('  Добавьте\n\tвиджет   с отдыхом  ')})`, me)[0];
  assert.deepEqual(q(`select body, state from public.ideas where id = '${id}'`, me), ['Добавьте виджет с отдыхом|new']);
  q(`select public.send_idea(${lit('я'.repeat(800))})`, me);
  assert.deepEqual(q(`select max(char_length(body)) from public.ideas where user_id = '${me}'`, me), ['500']);
  for (let i = 0; i < 3; i++) q(`select public.send_idea('Идея номер ${i}')`, me);
  fails(`select public.send_idea('Шестая за день')`, me, /limit/);
  assert.deepEqual(q(`select count(*) from public.ideas where user_id = '${me}'`, me), ['5'], 'лишняя не сохранилась');
  // чужой не видит, не меняет и не стирает
  assert.deepEqual(q('select count(*) from public.ideas', other), ['0']);
  fails('select count(*) from public.ideas', 'anon', /permission denied/);
  fails(`update public.ideas set state = 'accepted' where id = '${id}'`, other, /permission denied/);
  fails(`update public.ideas set state = 'accepted' where id = '${id}'`, me, /permission denied/);
  fails(`insert into public.ideas (user_id, body) values ('${me}', 'напрямую')`, me, /permission denied/);
  q(`select public.delete_idea('${id}')`, other);
  assert.deepEqual(q(`select count(*) from public.ideas where id = '${id}'`), ['1']);
  q(`select public.delete_idea('${id}')`, me);
  assert.deepEqual(q(`select count(*) from public.ideas where id = '${id}'`), ['0']);
});

test('администратор видит идеи без автора и отвечает; обычный человек — нет', () => {
  const me = account();
  const admin = account();
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
  const id = q(`select public.send_idea('Покажите ночные часы на главной')`, me)[0];
  fails('select public.admin_ideas()', me, /forbidden/);
  fails(`select public.admin_answer_idea('${id}', true)`, me, /forbidden/);
  const list = json('select public.admin_ideas()', admin);
  const it = list.find((x) => x.id === id);
  assert.equal(it.body, 'Покажите ночные часы на главной');
  assert.deepEqual(Object.keys(it).sort(), ['answered_at', 'body', 'created_at', 'email', 'id', 'state'], 'без id автора');
  assert.equal(it.email, null, 'без отметки «можно ответить» — без почты');
  q(`select public.admin_answer_idea('${id}', true)`, admin);
  assert.deepEqual(q(`select state, answered_at is not null from public.ideas where id = '${id}'`, me), ['accepted|t']);
  const st = json('select public.admin_stats()', admin);
  assert.ok(Number.isInteger(st.ideas_new) && Number.isInteger(st.invited));
});

test('«Можно ответить мне на почту» (2.21): почту видит только администратор и только у отмеченной идеи', () => {
  const me = account();
  const other = account();
  const admin = account();
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
  const email = q(`select email from auth.users where id = '${me}'`)[0];
  const yes = q(`select public.send_idea('Напишите мне про виджет', true)`, me)[0];
  const no = q(`select public.send_idea('А эту без ответа', false)`, me)[0];
  const dflt = q(`select public.send_idea('Старое приложение — без отметки')`, me)[0];
  const list = json('select public.admin_ideas()', admin);
  const by = (id) => list.find((x) => x.id === id);
  assert.equal(by(yes).email, email);
  assert.equal(by(no).email, null);
  assert.equal(by(dflt).email, null, 'по умолчанию — не отмечено');
  assert.ok(list.every((x) => !('user_id' in x)), 'id автора не отдаём');
  fails('select public.admin_ideas()', me, /forbidden/);
  fails('select public.admin_ideas()', other, /forbidden/);
  fails(`select public.send_idea('Чужому нельзя', true)`, 'anon', /permission denied/);
  // свою отметку автор видит, чужие идеи — нет; поменять напрямую нельзя
  assert.deepEqual(q(`select reply_ok from public.ideas where id = '${yes}'`, me), ['t']);
  assert.deepEqual(q(`select count(*) from public.ideas where id = '${yes}'`, other), ['0']);
  fails(`update public.ideas set reply_ok = true where id = '${no}'`, me, /permission denied/);
  const mine = json('select public.export_my_data()', me);
  assert.deepEqual(mine.ideas.map((x) => x.reply_by_email), [true, false, false]);
  // стёр идею — пропала и почта у администратора
  q(`select public.delete_idea('${yes}')`, me);
  assert.equal(json('select public.admin_ideas()', admin).find((x) => x.id === yes), undefined);
});

test('«Мои данные на сервере»: приглашения, кто пригласил и идеи; удаление аккаунта стирает идеи', () => {
  const me = account();
  const inv = invite(me);
  const friend = account({ code: inv.code });
  invite(me);
  q(`select public.send_idea('Напоминание о конце отдыха')`, friend);
  const mineData = json('select public.export_my_data()', me);
  assert.equal(mineData.invites.joined, 1);
  assert.equal(mineData.invites.open.length, 1);
  assert.equal(mineData.invited_by, 'admin', 'меня пригласил администратор');
  assert.ok(Number.isInteger(mineData.active_days));
  const fr = json('select public.export_my_data()', friend);
  assert.equal(fr.invited_by, me);
  assert.deepEqual(fr.ideas.map((x) => [x.body, x.state]), [['Напоминание о конце отдыха', 'new']]);
  q('select public.delete_my_account()', friend);
  assert.deepEqual(q(`select count(*) from public.ideas where user_id = '${friend}'`), ['0']);
});

test('ежедневная очистка: просроченные приглашения и старые отвеченные идеи стираются', () => {
  const me = account();
  const inv = invite(me);
  q(`update private.invites set expires_at = now() - interval '1 day' where id = '${inv.id}'`);
  const a = q(`select public.send_idea('Старая идея')`, me)[0];
  const b = q(`select public.send_idea('Свежая идея')`, me)[0];
  q(`update public.ideas set state = 'declined', answered_at = now() - interval '400 days' where id = '${a}'`);
  q('select private.cleanup_logs()');
  assert.deepEqual(q(`select count(*) from private.invites where id = '${inv.id}'`), ['0']);
  assert.deepEqual(q(`select id from public.ideas where user_id = '${me}'`), [b]);
});
