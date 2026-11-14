// Сервер, шаг 15: CABINA AI. Главные вопросы: может ли кто-то, кроме разрешённых, искать по документам или тратить
// вопросы? Видны ли кому-то таблицы документов и счётчики? Работают ли лимиты и общий потолок? Находит ли поиск
// нужный кусок и по словам, и по смыслу? Тексты и почты — выдуманные.
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
function account() {
  const code = `AIT${++n}`.padEnd(10, 'X');
  q(`insert into private.invites (code_hash) values (private.hash_code('${code}'))`);
  const r = db.sql(`insert into auth.users (email, raw_user_meta_data)
    values ('ai${n}@example.test', '{"consent":"privacy-6","invite":"${code}","platform":"web","version":"2.34.0"}'::jsonb) returning id`, 'auth');
  assert.ok(r.ok, r.err);
  return r.rows[0];
}
// эмбеддинг: 256 чисел, «смысл» задаём одной единицей в позиции k
const emb = (k) => `array[${Array.from({ length: 256 }, (_, i) => (i === k ? 1 : 0)).join(',')}]::real[]`;
const vec = (k) => `'[${Array.from({ length: 256 }, (_, i) => (i === k ? 1 : 0)).join(',')}]'::extensions.vector`;

let admin, user;
before(async () => {
  db = await startDb();
  admin = account();
  user = account();
  q(`update public.profiles set role = 'admin' where id = '${admin}'`);
  q(`insert into private.ai_docs (id, title, edition, source) values
      ('tk', 'Трудовой кодекс РФ', 'ред. от 01.09.2026', 'https://example.test/tk'),
      ('rest', 'Особенности режима рабочего времени', 'ред. от 01.03.2026', 'https://example.test/rest')`);
  q(`insert into private.ai_chunks (doc_id, ref, body, emb) values
      ('tk', 'статья 115', 'Ежегодный основной оплачиваемый отпуск предоставляется работникам продолжительностью 28 календарных дней.', ${vec(1)}),
      ('tk', 'статья 99', 'Сверхурочная работа не должна превышать для каждого работника четырех часов в течение двух дней подряд.', ${vec(2)}),
      ('rest', 'пункт 14', 'Продолжительность отдыха в пункте оборота устанавливается не менее половины продолжительности предшествующей работы.', ${vec(3)})`);
});

test('таблицы документов, кусков и счётчиков закрыты для всех', () => {
  for (const who of ['anon', user, admin]) {
    fails('select * from private.ai_chunks', who, /permission denied/);
    fails('select * from private.ai_docs', who, /permission denied/);
    fails('select * from private.ai_daily', who, /permission denied/);
    fails('select private.ai_allowed()', who, /permission denied/);
  }
});

test('режим «только администратор»: обычный человек и гость не могут ни спрашивать, ни искать', () => {
  assert.equal(q(`select private.conf('ai_mode')`)[0], 'admin');
  fails('select public.ai_begin()', 'anon', /permission denied/);
  fails(`select * from public.ai_search('отпуск', ${emb(1)})`, 'anon', /permission denied/);
  fails('select public.ai_begin()', user, /forbidden/);
  fails(`select * from public.ai_search('отпуск', ${emb(1)})`, user, /forbidden/);
  assert.deepEqual(json('select public.ai_status()', user), { on: false });
  const st = json('select public.ai_status()', admin);
  assert.equal(st.on, true);
  assert.equal(st.left, 100);
  assert.equal(st.docs.length, 2);
});

test('поиск по смыслу и по словам находит нужный пункт; неверный эмбеддинг — отказ', () => {
  // по смыслу: слов из вопроса в тексте нет, но эмбеддинг совпал с пунктом об отдыхе
  let rows = q(`select doc || '|' || ref from public.ai_search('сколько спать после поездки', ${emb(3)}, 3)`, admin);
  assert.equal(rows[0], 'rest|пункт 14');
  // по словам: эмбеддинг «ни о чём», но слова совпали со статьёй об отпуске
  rows = q(`select doc || '|' || ref from public.ai_search('отпуск 28 календарных дней', ${emb(200)}, 3)`, admin);
  assert.equal(rows[0], 'tk|статья 115');
  // ответ — с названием, редакцией и источником
  const one = q(`select title || '|' || edition || '|' || source from public.ai_search('сверхурочная', ${emb(2)}, 1)`, admin);
  assert.deepEqual(one, ['Трудовой кодекс РФ|ред. от 01.09.2026|https://example.test/tk']);
  fails(`select * from public.ai_search('отпуск', array[1,2,3]::real[])`, admin, /bad embedding/);
  fails(`select * from public.ai_search('отпуск', null)`, admin, /bad embedding/);
  // не больше 10 кусков, сколько бы ни попросили
  assert.ok(q(`select ref from public.ai_search('отпуск', ${emb(1)}, 1000)`, admin).length <= 10);
});

test('лимит в день на человека: лишний вопрос не засчитывается, счётчик стирается вместе с аккаунтом', () => {
  q(`update private.config set value = 'members' where key = 'ai_mode'`);
  try {
    const a = account();
    for (let i = 0; i < 10; i++) assert.equal(json('select public.ai_begin()', a).left, 9 - i);
    fails('select public.ai_begin()', a, /limit/);
    assert.equal(json('select public.ai_status()', a).left, 0);
    assert.equal(q(`select ai_questions from private.limits where user_id = '${a}'`)[0], '10');
    // обычный человек в режиме для всех может искать
    assert.equal(q(`select ref from public.ai_search('отпуск', ${emb(1)}, 1)`, a)[0], 'статья 115');
    q(`select public.delete_my_account()`, a);
    assert.equal(q(`select count(*) from private.limits where user_id = '${a}'`)[0], '0');
  } finally {
    q(`update private.config set value = 'admin' where key = 'ai_mode'`);
  }
});

test('общий потолок за день на весь сервер; в режиме «выключено» нельзя никому', () => {
  q(`update private.ai_daily set n = (select value::int from private.config where key = 'ai_all_per_day') where day = private.today()`);
  fails('select public.ai_begin()', admin, /ai busy/);
  q(`update private.ai_daily set n = 0`);
  assert.ok(json('select public.ai_begin()', admin).left >= 0);
  q(`update private.config set value = 'off' where key = 'ai_mode'`);
  try {
    fails('select public.ai_begin()', admin, /forbidden/);
    assert.deepEqual(json('select public.ai_status()', admin), { on: false });
  } finally {
    q(`update private.config set value = 'admin' where key = 'ai_mode'`);
  }
});

test('документ удаляется вместе со своими кусками', () => {
  q(`insert into private.ai_docs (id, title, edition, source) values ('tmp', 'Временный', 'ред. 1', 'https://example.test/x')`);
  q(`insert into private.ai_chunks (doc_id, ref, body, emb) values ('tmp', 'п. 1', 'текст', ${vec(9)})`);
  q(`delete from private.ai_docs where id = 'tmp'`);
  assert.equal(q(`select count(*) from private.ai_chunks where doc_id = 'tmp'`)[0], '0');
  // источник — только https
  fails(`insert into private.ai_docs (id, title, edition, source) values ('bad', 'Плохой', 'ред. 1', 'http://example.test')`, undefined, /check/);
});
