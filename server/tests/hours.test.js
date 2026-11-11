// Сервер, шаг 11: часы для коллег. Главный вопрос: может ли кто-то, кому человек не разрешал, увидеть его часы? Ответ — нет.
// Все имена — выдуманные.
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
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const count = (sql, who) => Number(q(sql, who)[0]);

let n = 0;
function account({ name = 'Иван', consent = 'privacy-5' } = {}) {
  const code = `HRS${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('h${n}@example.test', '{"consent":"${consent}","invite":"${code}","platform":"web","version":"2.29.0"}'::jsonb) returning id`, 'auth');
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
const MONTH = new Date().toISOString().slice(0, 7);
const share = (who, to = true, item = 'hours') => q(`select public.set_access(${lit(item)}, ${to === true}, ${Array.isArray(to) && to.length ? `array[${to.map((x) => `'${x}'`).join(',')}]::uuid[]` : 'null'})`, who);
const hours = (who, cur = 6000, prev = 10740, month = MONTH) => q(`select public.set_hours(${lit(month)}, ${cur}, ${prev == null ? 'null' : prev})`, who);
const seen = (owner, who) => q(`select cur_min from public.hours where user_id = '${owner}'`, who);
const stored = (owner) => count(`select count(*) from public.hours where user_id = '${owner}'`);

test('таблица часов: RLS включён, без входа ничего не видно и ничего не записать', () => {
  assert.deepEqual(q("select relrowsecurity from pg_class where oid = 'public.hours'::regclass"), ['t']);
  fails('select * from public.hours', 'anon', /permission denied/);
  fails(`select public.set_hours(${lit(MONTH)}, 60, null)`, 'anon', /permission denied/);
  const a = account();
  fails(`insert into public.hours (user_id, month, cur_min, expires_at) values ('${a}', ${lit(MONTH)}, 60, now() + interval '1 day')`, a, /permission denied/);
  fails(`update public.hours set cur_min = 1 where user_id = '${a}'`, a, /permission denied/);
});

test('по умолчанию часы никто не видит и сервер их не хранит', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  hours(a);
  assert.equal(stored(a), 0, 'показывать некому — не хранится');
  assert.deepEqual(seen(a, b), []);
});

test('всем коллегам: коллега видит, чужой и участник общей группы — нет', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const stranger = account({ name: 'Чужой' });
  const mate = account({ name: 'Олег' });
  colleagues(a, b);
  // общая группа, где Никита показывает и статус, и «где я»: часы группе всё равно не видны
  const g = q("select public.create_group('Бригада')", a)[0];
  const k = q(`select public.group_code('${g}', false)`, a)[0];
  q(`select public.join_group(${lit(k)})`, mate);
  q(`select public.set_group_share('${g}', true, true)`, a);
  q(`select public.set_group_share('${g}', true, true)`, mate);
  share(a);
  hours(a, 6000, 10740);
  assert.deepEqual(q(`select month, cur_min, prev_min from public.hours where user_id = '${a}'`, b), [`${MONTH}|6000|10740`]);
  assert.deepEqual(seen(a, stranger), [], 'чужой не видит');
  assert.deepEqual(seen(a, mate), [], 'участник группы не видит');
  assert.deepEqual(seen(a, a), ['6000'], 'свои — видно');
  // чужое изменить нельзя: set_hours пишет только свою строку
  hours(b, 1, null);
  assert.deepEqual(seen(a, b), ['6000']);
});

test('выбранным: видит только выбранный; «никто» — часы стираются сразу', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  const c = account({ name: 'Пётр' });
  colleagues(a, b);
  colleagues(a, c);
  share(a, [c]);
  hours(a, 300, null);
  assert.deepEqual(seen(a, c), ['300']);
  assert.deepEqual(seen(a, b), [], 'не выбран — не видит');
  share(a, false);
  assert.equal(stored(a), 0, '«никто» — стёрто');
  assert.deepEqual(seen(a, c), []);
});

test('статус и часы — отдельно: разрешил статус — часы не видны, и наоборот', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  share(a, true, 'status');
  hours(a);
  assert.deepEqual(seen(a, b), []);
  share(a, false, 'status');
  share(a);
  hours(a, 120, null);
  assert.deepEqual(seen(a, b), ['120']);
  assert.equal(count(`select count(*) from public.statuses where user_id = '${a}'`, b), 0);
});

test('удалил из коллег — часы ему не видны и не хранятся; выйти из «Коллег» и удалить аккаунт — стирает', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  share(a, [b]);
  hours(a);
  q(`select public.drop_colleague('${a}')`, b);
  assert.deepEqual(seen(a, b), []);
  assert.equal(stored(a), 0, 'показывать больше некому — стёрто');

  const c = account({ name: 'Олег' });
  const d = account({ name: 'Семён' });
  colleagues(c, d);
  share(c);
  hours(c);
  assert.equal(stored(c), 1);
  q('select public.leave_colleagues()', c);
  assert.equal(stored(c), 0);

  const e = account({ name: 'Вера' });
  const f = account({ name: 'Лиза' });
  colleagues(e, f);
  share(e);
  hours(e);
  q('select public.delete_my_account()', e);
  assert.equal(stored(e), 0);
});

test('проверка чисел и месяца; без согласия privacy-5 — нельзя', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  share(a);
  fails(`select public.set_hours('2020-01', 60, null)`, a, /bad month/);
  fails(`select public.set_hours('2026-13', 60, null)`, a, /bad month/);
  fails(`select public.set_hours(null, 60, null)`, a, /bad month/);
  fails(`select public.set_hours(${lit(MONTH)}, -1, null)`, a, /bad hours/);
  fails(`select public.set_hours(${lit(MONTH)}, 44641, null)`, a, /bad hours/);
  fails(`select public.set_hours(${lit(MONTH)}, 60, 99999)`, a, /bad hours/);
  fails(`select public.set_access('salary', true, null)`, a, /bad item/);
  const old = account({ name: 'Старый' });
  colleagues(old, b);
  q(`update public.consents set document = 'privacy-4' where user_id = '${old}'`);
  fails(`select public.set_access('hours', true, null)`, old, /consent required/);
  fails(`select public.set_hours(${lit(MONTH)}, 60, null)`, old, /consent required/);
});

test('устаревшие часы коллега не видит, очистка их стирает; в «Моих данных» — свои часы', () => {
  const a = account({ name: 'Никита' });
  const b = account({ name: 'Анна' });
  colleagues(a, b);
  share(a);
  hours(a, 900, 100);
  const mine = JSON.parse(q('select public.export_my_data()', a)[0]);
  assert.equal(mine.colleagues_hours.cur_min, 900);
  assert.equal(mine.colleagues_hours.month, MONTH);
  assert.ok(mine.colleagues_access.some((x) => x.item === 'hours' && x.to === 'all'));
  q(`update public.hours set expires_at = now() - interval '1 minute' where user_id = '${a}'`);
  assert.deepEqual(seen(a, b), [], 'устарело — не видно');
  q('select private.cleanup_logs()');
  assert.equal(stored(a), 0);
});
