// CABINA AI (сервер помощника, без сети): что уходит в нейросеть, как читается её ответ, как режутся документы,
// и весь путь вопроса с подменным Яндексом и подменной базой. Тексты — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestion, maskPersonal, buildPrompt, parseAnswer, sourcesOf, NO_ANSWER, SYSTEM, parseWeb, webRequest, WEB_SITES } from '../../server/ai/core.mjs';
import { splitDoc, parts, sqlText } from '../../server/ai/split.mjs';
import { ask } from '../../server/ai/server.mjs';

test('вопрос: пустой, короткий, без букв и слишком длинный — не принимаем; лишние пробелы и невидимые знаки — вон', () => {
  assert.equal(cleanQuestion(''), null);
  assert.equal(cleanQuestion('аб'), null);
  assert.equal(cleanQuestion('12345'), null);
  assert.equal(cleanQuestion(42), null);
  assert.equal(cleanQuestion('о'.repeat(501)), null);
  assert.equal(cleanQuestion('  Сколько\u200b дней\n\nотпуска?  '), 'Сколько дней отпуска?');
});

test('персональные данные вырезаются до отправки: почта, телефон, длинные номера; обычные числа остаются', () => {
  const m = maskPersonal('Я Иванов, ivan.petrov@mail.example, тел. +7 (912) 345-67-89 и 8 912 345 67 89, поезд 2402, локомотив 1234567, табельный 00123456. Отпуск 28 дней в 2026 году, статья 115');
  assert.doesNotMatch(m, /@|912|345|1234567|00123456/);
  assert.match(m, /\[почта\]/);
  assert.match(m, /\[телефон\]/);
  assert.match(m, /\[номер\]/);
  assert.match(m, /поезд 2402/);        // 4 цифры — не персональные (номер поезда в вопросе без имени — можно)
  assert.match(m, /28 дней в 2026 году, статья 115/);
});

test('имена с отчеством и инициалами — вон; документы, станции и сигналы остаются', () => {
  const cases = [
    ['Можно ли Петрову Ивану Сергеевичу отказать в отпуске?', 'Можно ли [имя] отказать в отпуске?'],
    ['Мне сказала Анна Сергеевна Козлова', 'Мне сказала [имя]'],
    ['Иван Петрович сказал', '[имя] сказал'],
    ['машинист Сидоров А. Б. и А.Б. Сидоров', 'машинист [имя] и [имя]'],
  ];
  for (const [q, want] of cases) assert.equal(maskPersonal(q), want);
  for (const keep of ['Статья 115 ТК РФ, п. 4.2 ПТЭ, ИДП прил. 9', 'Москва Пассажирская', 'Какой отдых по Приказу Минтранса № 339?', 'Светофор НМ1 на станции Лужки'])
    assert.equal(maskPersonal(keep), keep);
  // имя без отчества и инициалов не отличить от обычных слов — не ловим (в окне просим не писать имён)
  assert.equal(maskPersonal('Иванов сказал'), 'Иванов сказал');
});

test('текст для нейросети: правила, номера фрагментов с документом, пунктом и редакцией', () => {
  assert.match(SYSTEM, /ТОЛЬКО по фрагментам/);
  assert.match(SYSTEM, new RegExp(NO_ANSWER));
  const p = buildPrompt('Сколько дней отпуска?', [
    { title: 'Трудовой кодекс РФ', ref: 'статья 115', edition: 'ред. 2026', body: 'Отпуск 28 дней.' },
    { title: 'Колдоговор', ref: 'пункт 4.2', edition: '2026–2028', body: 'Дополнительный отпуск.' },
  ]);
  assert.match(p, /\[1\] Трудовой кодекс РФ, статья 115 \(ред\. 2026\):\nОтпуск 28 дней\./);
  assert.match(p, /\[2\] Колдоговор, пункт 4\.2/);
  assert.match(p, /Вопрос работника: Сколько дней отпуска\?$/);
});

test('ответ нейросети: «нет ответа», без ссылок и с выдуманными номерами — не показываем; ссылки собираются', () => {
  assert.equal(parseAnswer(NO_ANSWER, 3), null);
  assert.equal(parseAnswer('', 3), null);
  assert.equal(parseAnswer('Отпуск 28 дней.', 3), null);            // без ссылки — вдруг выдумано
  assert.equal(parseAnswer('Отпуск 28 дней [7].', 3), null);        // ссылка на несуществующий фрагмент
  const r = parseAnswer('**Отпуск** 28 дней [1]. Есть дополнительный [2, 9] , и ещё [3]', 3);
  assert.deepEqual(r.cited, [1, 2, 3]);
  assert.equal(r.answer, 'Отпуск 28 дней [1]. Есть дополнительный [2], и ещё [3]');
  const s = sourcesOf([{ title: 'ТК', edition: 'ред.', ref: 'ст. 1', source: 'https://x.test', body: 'а' }, { title: 'К', edition: 'р', ref: 'п. 2', source: 'https://y.test', body: 'б' }], [2]);
  assert.deepEqual(s, [{ n: 2, title: 'К', edition: 'р', ref: 'п. 2', source: 'https://y.test', quote: 'б' }]);
});

test('документ режется по статьям и по пунктам, приложения — своей нумерацией, длинное — на части', () => {
  const tk = splitDoc('Трудовой кодекс\nГлава 19\nСтатья 114. Ежегодные отпуска\nРаботникам предоставляются отпуска.\nСтатья 115. Продолжительность\nОтпуск 28 дней.', 'articles');
  assert.deepEqual(tk.map((c) => c.ref), ['вводная часть', 'статья 114', 'статья 115']);
  assert.match(tk[2].body, /^Статья 115\. Продолжительность Отпуск 28 дней\.$/);
  const pte = splitDoc('I. Общие положения\n1. Правила устанавливают.\n2. Работники обязаны.\nпродолжение второго\nПриложение N 8\nИнструкция\n57. Сигналы подаются.\n4.2.3. Вложенный пункт.', 'points');
  assert.deepEqual(pte.map((c) => c.ref), ['вводная часть', 'пункт 1', 'пункт 2', 'приложение 8', 'приложение 8, пункт 57', 'приложение 8, пункт 4.2.3']);
  assert.equal(pte[2].body, '2. Работники обязаны. продолжение второго');
  const kd = splitDoc('Раздел 1. Основные понятия\nДоговор — акт.\nРаздел 2. Общие положения\n2.1. Договор заключён,\nсогласно пунктам\n7.1. - 7.12. настоящего Договора и\n7.24. и подпунктом «а».\n2.2. Работодатель обязуется:\n3\nРаздел 3. Ответственность\n3.1. Текст.', 'points');
  assert.deepEqual(kd.map((c) => c.ref), ['раздел 1', 'пункт 2.1', 'пункт 2.2', 'пункт 3.1'], 'заголовок раздела — не кусок, ссылка «7.1. - 7.12.» — не пункт');
  assert.doesNotMatch(kd[2].body, /Раздел 3/);
  const long = parts('Предложение номер один. '.repeat(200), 1800);
  assert.ok(long.length >= 3 && long.every((p) => p.length <= 1800));
  const big = splitDoc(`Статья 1. ${'Очень длинная статья. '.repeat(200)}`, 'articles');
  assert.deepEqual(big.map((c) => c.ref).slice(0, 2), ['статья 1 (часть 1)', 'статья 1 (часть 2)']);
  assert.equal(sqlText("О'Нил\u0000"), "'О''Нил'");
});

// ---- весь путь вопроса: подменные Яндекс и база
const TOKEN = 'aaa.bbb.ccc';
function fake({ begin = { ok: true, status: 200, data: { left: 7 } }, found, answer = 'Отпуск 28 дней [1].' } = {}) {
  const calls = [];
  const chunks = found ?? [{ doc: 'tk', title: 'Трудовой кодекс РФ', edition: 'ред. 2026', source: 'https://x.test', ref: 'статья 115', body: 'Отпуск 28 календарных дней.', score: 0.03 }];
  return {
    calls,
    deps: {
      rest: async (fn, body, token) => { calls.push({ to: 'db', fn, body, token }); return fn === 'ai_begin' ? begin : { ok: true, status: 200, data: chunks }; },
      yc: async (path, body) => {
        calls.push({ to: 'yandex', path, body });
        if (path === 'textEmbedding') return { ok: true, status: 200, data: { embedding: Array.from({ length: 256 }, () => '0.01') } };
        return { ok: true, status: 200, data: { result: { alternatives: [{ message: { text: answer } }] } } };
      },
    },
  };
}

test('вопрос целиком: ответ с источником; в Яндекс не уходят ни ключ входа, ни телефон, ни почта', async () => {
  const f = fake();
  const r = await ask(TOKEN, 'Сколько дней отпуска? Мой телефон +7 912 345-67-89, почта a@b.example', f.deps);
  assert.equal(r.status, 200);
  assert.equal(r.body.answer, 'Отпуск 28 дней [1].');
  assert.equal(r.body.left, 7);
  assert.deepEqual(r.body.sources.map((s) => s.ref), ['статья 115']);
  const toYandex = JSON.stringify(f.calls.filter((c) => c.to === 'yandex'));
  assert.doesNotMatch(toYandex, /912|a@b|aaa\.bbb/);
  assert.ok(f.calls.filter((c) => c.to === 'db').every((c) => c.token === TOKEN));
  assert.deepEqual(f.calls.map((c) => c.fn || c.path), ['ai_begin', 'textEmbedding', 'ai_search', 'completion']);
});

test('нет доступа, лимит, плохой вопрос, нет ключа входа — без Яндекса; «нет ответа» — честно', async () => {
  let f = fake({ begin: { ok: false, status: 400, data: { message: 'cabina: limit' } } });
  assert.deepEqual(await ask(TOKEN, 'Сколько дней отпуска?', f.deps), { status: 429, body: { error: 'limit' } });
  assert.equal(f.calls.filter((c) => c.to === 'yandex').length, 0);
  f = fake({ begin: { ok: false, status: 400, data: { message: 'cabina: forbidden' } } });
  assert.equal((await ask(TOKEN, 'Сколько дней отпуска?', f.deps)).status, 403);
  f = fake({ begin: { ok: false, status: 400, data: { message: 'cabina: ai busy' } } });
  assert.equal((await ask(TOKEN, 'Сколько дней отпуска?', f.deps)).body.error, 'busy');
  f = fake();
  assert.equal((await ask('', 'Сколько дней отпуска?', f.deps)).status, 401);
  assert.equal((await ask(TOKEN, 'а', f.deps)).status, 400);
  assert.equal(f.calls.length, 0);
  f = fake({ answer: NO_ANSWER });
  assert.deepEqual((await ask(TOKEN, 'Какая погода завтра?', f.deps)).body, { answer: null, sources: [], left: 7 });
  f = fake({ found: [] });
  assert.equal((await ask(TOKEN, 'Какая погода завтра?', f.deps)).body.answer, null);
  assert.equal(f.calls.filter((c) => c.path === 'completion').length, 0); // ничего не нашли — нейросеть не спрашиваем
});

// ---------------------------------------------------------------- поиск в интернете (15.11.2026)

const webData = (text, anns = []) => ({ output: [
  { type: 'web_search_call', status: 'completed' },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: anns }] },
] });

test('запрос в интернет: 5 официальных сайтов или весь интернет, Россия, ответ не сохраняется', () => {
  const off = webRequest('Сколько дней отпуска?', 'official', 'gpt://f/yandexgpt/latest');
  assert.equal(off.store, false);
  assert.equal(off.tools[0].type, 'web_search');
  assert.deepEqual(off.tools[0].filters.allowed_domains, WEB_SITES);
  assert.equal(WEB_SITES.length, 5);
  assert.equal(off.tools[0].user_location.region, '225');
  assert.match(off.instructions, new RegExp(NO_ANSWER));
  const all = webRequest('Сколько дней отпуска?', 'all', 'm');
  assert.equal(all.tools[0].filters, undefined);
});

test('ответ из интернета: ссылки только https, без повторов, не больше 5; «нет ответа» и пусто — null', () => {
  const anns = [
    { type: 'url_citation', url: 'https://www.consultant.ru/document/x/', title: 'ТК РФ Статья 115' },
    { type: 'url_citation', url: 'https://www.consultant.ru/document/x/', title: 'повтор' },
    { type: 'url_citation', url: 'javascript:alert(1)', title: 'плохая' },
    { type: 'url_citation', url: 'http://plain.example/', title: 'без https' },
    { type: 'url_citation', url: 'https://user:pw@evil.example/', title: 'с паролем' },
    ...[1, 2, 3, 4, 5].map((i) => ({ type: 'url_citation', url: `https://s${i}.example/`, title: '' })),
  ];
  const r = parseWeb(webData('Отпуск — **28** календарных дней ([ТК](https://x.example/tk)). Подробнее https://y.example/z', anns));
  assert.equal(r.answer, 'Отпуск — 28 календарных дней (ТК). Подробнее');
  assert.equal(r.links.length, 5);
  assert.deepEqual(r.links[0], { url: 'https://www.consultant.ru/document/x/', title: 'ТК РФ Статья 115', host: 'consultant.ru' });
  assert.equal(r.links[1].title, 's1.example'); // нет названия — адрес сайта
  assert.ok(r.links.every((l) => l.url.startsWith('https://') && !l.url.includes('@')));
  assert.equal(parseWeb(webData(NO_ANSWER)), null);
  assert.equal(parseWeb({}), null);
  assert.equal(parseWeb(null), null);
});

test('вопрос в интернет: тот же вопрос без персональных данных, лимит считается, документы не ищем', async () => {
  const f = fake();
  const sent = [];
  f.deps.web = async (body) => { sent.push(body); return { ok: true, status: 200, data: webData('Отпуск 28 дней.', [{ type: 'url_citation', url: 'https://www.garant.ru/a/', title: 'Гарант' }]) }; };
  const r = await ask(TOKEN, 'Сколько дней отпуска? телефон +7 912 345-67-89', f.deps, 'official');
  assert.deepEqual(r, { status: 200, body: { answer: 'Отпуск 28 дней.', web: 'official', links: [{ url: 'https://www.garant.ru/a/', title: 'Гарант', host: 'garant.ru' }], left: 7 } });
  assert.deepEqual(f.calls.map((c) => c.fn || c.path), ['ai_begin']); // ни эмбеддинга, ни поиска по документам
  assert.doesNotMatch(JSON.stringify(sent), /912|aaa\.bbb/);
  assert.deepEqual(sent[0].tools[0].filters.allowed_domains, WEB_SITES);
  f.deps.web = async () => ({ ok: true, status: 200, data: webData(NO_ANSWER) });
  assert.deepEqual((await ask(TOKEN, 'Сколько дней отпуска?', f.deps, 'all')).body, { answer: null, web: 'all', links: [], left: 7 });
  f.deps.web = async () => ({ ok: false, status: 500, data: null });
  assert.deepEqual(await ask(TOKEN, 'Сколько дней отпуска?', f.deps, 'all'), { status: 502, body: { error: 'yandex' } });
  assert.deepEqual(await ask(TOKEN, 'Сколько дней отпуска?', f.deps, 'evil'), { status: 400, body: { error: 'bad_mode' } });
  const lim = fake({ begin: { ok: false, status: 400, data: { message: 'cabina: limit' } } });
  let called = false;
  lim.deps.web = async () => { called = true; return {}; };
  assert.equal((await ask(TOKEN, 'Сколько дней отпуска?', lim.deps, 'all')).status, 429);
  assert.equal(called, false);
});
