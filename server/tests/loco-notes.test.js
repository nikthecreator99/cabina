// Сервер, шаг 11: заметки о локомотивах для коллег.
// Главные вопросы: видит ли чужой (не коллега, коллега без разрешения, участник общей группы) мои заметки? Может ли кто-то
// записать или оценить заметку за меня? Остаются ли заметки на сервере, когда я перестал ими делиться? Ответ всегда «нет».
// Все имена и номера — выдуманные.
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
const month = () => new Date().toISOString().slice(0, 7);

let n = 0;
function account(name = 'Иван') {
  const code = `LCN${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('l${n}@example.test', '{"consent":"privacy-5","invite":"${code}","platform":"web","version":"2.29.0"}'::jsonb) returning id`, 'auth');
  assert.ok(r.ok, r.err);
  const id = r.rows[0];
  q(`select public.save_card(${lit(name)}, null, null, null, false)`, id);
  return id;
}
function colleagues(a, b) {
  q(`select public.give_consent('publish-2')`, b);
  q(`select public.save_card(coalesce((select name from public.cards where user_id = '${b}'), 'Коллега'), null, null, null, true)`, b);
  q(`select public.offer_colleague('${b}')`, a);
  q(`select public.answer_colleague('${a}', true)`, b);
}
const share = (who, notes) => q(`select public.sync_loco_notes(${lit(JSON.stringify(notes))}::jsonb)`, who);
const note = (k, num = '405', body = 'Не работает обогрев кабины', t = '2ЭС5К') => ({ k, t, n: num, b: body, m: month() });
const access = (who, all, ids = []) => q(`select public.set_access('notes', ${all}, ${ids.length ? `array[${ids.map((x) => `'${x}'`).join(',')}]::uuid[]` : 'null'})`, who);
const seen = (who) => q('select loco_num || \'|\' || body from public.loco_notes order by loco_num, body', who);

test('без правила «кому видно» заметки на сервере не хранятся', () => {
  const a = account('Никита');
  const b = account('Анна');
  colleagues(a, b);
  share(a, [note('n1')]);
  assert.equal(count('select count(*) from public.loco_notes'), 0, 'никому не показываю — сервер не хранит');
  access(a, true);
  share(a, [note('n1')]);
  assert.equal(count('select count(*) from public.loco_notes'), 1);
  assert.deepEqual(seen(b), ['405|Не работает обогрев кабины']);
  assert.deepEqual(q(`select month from public.loco_notes`), [`${month()}-01`], 'только месяц');
});

test('чужой, коллега без разрешения и участник общей группы заметок не видят; аноним — тоже', () => {
  const a = account('Никита');
  const b = account('Анна');
  const c = account('Олег');      // не коллега
  const d = account('Пётр');      // коллега, но ему не показываю
  colleagues(a, b); colleagues(a, d);
  // общая группа с Олегом, оба показывают ей статус и «где я»: заметки это не открывает
  const g = q(`select public.create_group('Бригада')`, a)[0];
  const code = q(`select public.group_code('${g}', false)`, a)[0];
  q(`select public.join_group('${code}')`, c);
  q(`select public.set_group_share('${g}', true, true)`, a);
  q(`select public.set_group_share('${g}', true, true)`, c);
  access(a, false, [b]);
  share(a, [note('n1'), note('n2', '1702', 'Течёт кран машиниста')]);
  assert.equal(seen(b).length, 2);
  assert.deepEqual(seen(c), [], 'участник группы не видит');
  assert.deepEqual(seen(d), [], 'коллега без разрешения не видит');
  fails('select count(*) from public.loco_notes', 'anon', /permission denied/);
  fails('select count(*) from public.loco_note_votes', 'anon', /permission denied/);
  // напрямую писать нельзя никому
  fails(`insert into public.loco_notes (user_id, note_key, loco_num, body, month) values ('${b}', 'x', '1', 'x', date_trunc('month', now()))`, b, /permission denied/);
  fails(`update public.loco_notes set body = 'чужое'`, b, /permission denied/);
  fails(`delete from public.loco_notes`, b, /permission denied/);
  fails(`select public.sync_loco_notes('[]'::jsonb)`, 'anon', /permission denied/);
});

test('«полезно»: только к заметке коллеги, который мне её показывает; один голос; автор видит только число', () => {
  const a = account('Никита');
  const b = account('Анна');
  const c = account('Олег');
  colleagues(a, b); colleagues(a, c);
  access(a, true);
  share(a, [note('n1')]);
  const id = q('select id from public.loco_notes', a)[0];
  assert.equal(q(`select public.rate_loco_note('${id}', true)`, b)[0], '1');
  assert.equal(q(`select public.rate_loco_note('${id}', true)`, b)[0], '1', 'второй раз не считается');
  assert.equal(q(`select public.rate_loco_note('${id}', true)`, c)[0], '2');
  fails(`select public.rate_loco_note('${id}', true)`, a, /not found/);             // свою — нельзя
  const x = account('Чужой');
  fails(`select public.rate_loco_note('${id}', true)`, x, /not found/);             // не коллега
  fails(`select public.rate_loco_note('${id}', true)`, 'anon', /permission denied/);
  assert.deepEqual(q('select useful from public.loco_notes', a), ['2']);
  assert.equal(count('select count(*) from public.loco_note_votes', a), 0, 'автор не видит, кто отметил');
  assert.equal(count('select count(*) from public.loco_note_votes', b), 1, 'свою отметку видит');
  assert.equal(q(`select public.rate_loco_note('${id}', false)`, c)[0], '1', 'отметку можно снять');
  // правка текста отметки сохраняет, смена локомотива — нет
  share(a, [note('n1', '405', 'Не работает обогрев, сообщил в депо')]);
  assert.deepEqual(q('select useful from public.loco_notes', a), ['1']);
  share(a, [note('n1', '406', 'Не работает обогрев, сообщил в депо')]);
  assert.deepEqual(q('select useful from public.loco_notes', a), ['0']);
  assert.equal(count('select count(*) from public.loco_note_votes', b), 0);
});

test('перестал делиться — заметки стираются: убрал из списка, «никому», удалил из коллег, вышел из «Коллег», удалил аккаунт', () => {
  const a = account('Никита');
  const b = account('Анна');
  colleagues(a, b);
  access(a, true);
  share(a, [note('n1'), note('n2', '1702')]);
  share(a, [note('n2', '1702')]);
  assert.deepEqual(seen(b), ['1702|Не работает обогрев кабины'], 'убрал «Показать коллегам» у одной');
  access(a, true);   // поменял правило на то же — заметки остались (проверка в конце транзакции)
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${a}'`), 1);
  access(a, false);
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${a}'`), 0, '«никому» — стёрто');

  access(a, false, [b]);
  share(a, [note('n1')]);
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${a}'`), 1);
  q(`select public.drop_colleague('${b}')`, a);
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${a}'`), 0, 'последний выбранный больше не коллега — стёрто');

  const f = account('Олег');
  const h = account('Мария');
  colleagues(f, h);
  access(f, true);
  share(f, [note('n1')]);
  q('select public.leave_colleagues()', f);
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${f}'`), 0, 'вышел из «Коллег» — стёрто');

  const d = account('Пётр');
  const e = account('Ольга');
  colleagues(d, e);
  access(d, true);
  share(d, [note('n1')]);
  const id = q('select id from public.loco_notes', d)[0];
  q(`select public.rate_loco_note('${id}', true)`, e);
  q('select public.delete_my_account()', e);
  assert.equal(count('select count(*) from public.loco_note_votes'), 0, 'удалил аккаунт — отметки тоже');
  q('select public.delete_my_account()', d);
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${d}'`), 0);
});

test('проверка присланного: длина, лимит, месяц, без согласия — нельзя; выгрузка «мои данные»', () => {
  const a = account('Никита');
  const b = account('Анна');
  colleagues(a, b);
  access(a, true);
  share(a, [
    note('n1', '405', `${'а'.repeat(400)}`),
    { k: 'n2', t: '', n: '  0405  ', b: 'Песочница\n\nне работает', m: month() },
    { k: 'n3', n: '1', b: 'из будущего', m: '2999-01' },
    { k: 'n4', n: '1', b: 'плохой месяц', m: '2026-13' },
    { k: '', n: '1', b: 'без id', m: month() },
    { k: 'n5', n: '', b: 'без номера', m: month() },
    'строка',
    note('n1', '405', 'повтор id'),
  ]);
  const rows = q('select note_key, coalesce(loco_type, \'-\'), loco_num, char_length(body) from public.loco_notes order by note_key', a);
  assert.deepEqual(rows, ['n1|2ЭС5К|405|300', 'n2|-|0405|21']);
  fails(`select public.sync_loco_notes('{}'::jsonb)`, a, /bad notes/);
  fails(`select public.sync_loco_notes(${lit(JSON.stringify(Array.from({ length: 201 }, (_, i) => note(`k${i}`))))}::jsonb)`, a, /limit/);
  const data = json('select public.export_my_data()', a);
  assert.equal(data.loco_notes.length, 2);
  assert.equal(data.loco_notes[0].month, month());
  assert.equal(data.loco_notes_marked_useful, 0);
  // отозвал согласие (новая редакция не принята) — новые заметки не принимаются
  q(`update public.consents set withdrawn_at = now() where user_id = '${a}' and document = 'privacy-5'`);
  fails(`select public.sync_loco_notes('[]'::jsonb)`, a, /consent required/);
});

test('ежедневная очистка: заметки тех, кто ни с кем не делится', () => {
  const a = account('Никита');
  const b = account('Анна');
  colleagues(a, b);
  access(a, true);
  share(a, [note('n1')]);
  q(`delete from public.links where '${a}' in (from_id, to_id)`); // связь пропала «мимо» приложения
  q('select private.cleanup_logs()');
  assert.equal(count(`select count(*) from public.loco_notes where user_id = '${a}'`), 0);
});
