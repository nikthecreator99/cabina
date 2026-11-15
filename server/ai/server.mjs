// CABINA AI: маленький сервер помощника (контейнер «ai» в server/stack/docker-compose.yml). Без сторонних библиотек.
//
// POST /ask {q} с ключом входа человека (Authorization: Bearer …) →
//   1) ai_begin в нашей базе от имени человека: можно ли ему, лимит, счётчик;
//   2) эмбеддинг вопроса в Яндексе (только текст вопроса, персональные данные вырезаны);
//   3) ai_search в нашей базе: подходящие куски документов;
//   4) YandexGPT отвечает только по этим кускам;
//   5) в приложение — ответ и источники, на которые он ссылается.
// В Яндекс уходит только текст вопроса и куски открытых документов: без почты, имени, id. Заголовок
// x-data-logging-enabled: false — Яндекс такие запросы не сохраняет. Ключ Яндекса — только в /opt/cabina/.env.
// В журнал не пишем ни вопросы, ни ответы, ни адреса: только код ошибки.
import { createServer } from 'node:http';
import { cleanQuestion, maskPersonal, SYSTEM, buildPrompt, parseAnswer, sourcesOf } from './core.mjs';

const env = process.env;
const PORT = Number(env.AI_PORT || 8787);
const REST = env.AI_REST_URL || 'http://rest:3000';
const KEY = env.YC_API_KEY || '';
const FOLDER = env.YC_FOLDER_ID || '';
const MODEL = env.AI_MODEL || 'yandexgpt/latest';
const YC = 'https://llm.api.cloud.yandex.net/foundationModels/v1';

async function post(url, body, headers, timeout = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}

const yc = (path, body) => post(`${YC}/${path}`, body, {
  Authorization: `Api-Key ${KEY}`, 'x-folder-id': FOLDER, 'x-data-logging-enabled': 'false',
});
const rest = (fn, body, token) => post(`${REST}/rpc/${fn}`, body, { Authorization: `Bearer ${token}` }, 10000);

// Ответ ошибкой: код для приложения (оно само знает, что сказать человеку)
const fail = (status, code) => ({ status, body: { error: code } });

export async function ask(token, raw, deps = { yc, rest }) {
  if (!KEY && deps.yc === yc) return fail(503, 'ai_off');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token || '')) return fail(401, 'auth');
  const question = cleanQuestion(raw);
  if (!question) return fail(400, 'bad_question');

  const begin = await deps.rest('ai_begin', {}, token);
  if (!begin.ok) {
    const msg = String(begin.data?.message || '');
    if (begin.status === 401 || /JWT/i.test(msg)) return fail(401, 'auth');
    if (/limit/.test(msg)) return fail(429, 'limit');
    if (/ai busy/.test(msg)) return fail(429, 'busy');
    if (/forbidden|not signed in/.test(msg)) return fail(403, 'forbidden');
    return fail(502, 'db');
  }
  const left = Number(begin.data?.left ?? 0);
  const masked = maskPersonal(question);

  const e = await deps.yc('textEmbedding', { modelUri: `emb://${FOLDER}/text-search-query/latest`, text: masked });
  const vec = e.ok && Array.isArray(e.data?.embedding) ? e.data.embedding.map(Number) : null;
  if (!vec || vec.length !== 256 || vec.some((x) => !Number.isFinite(x))) return fail(502, 'yandex');

  const s = await deps.rest('ai_search', { p_query: masked, p_emb: vec, p_limit: 6 }, token);
  if (!s.ok || !Array.isArray(s.data)) return fail(502, 'db');
  // «нет ответа» решает нейросеть: поиск по смыслу всегда что-то находит, по числам это не понять
  const chunks = s.data.filter((c) => c && typeof c.body === 'string' && typeof c.ref === 'string');
  if (!chunks.length) return { status: 200, body: { answer: null, sources: [], left } };

  const c = await deps.yc('completion', {
    modelUri: `gpt://${FOLDER}/${MODEL}`,
    completionOptions: { stream: false, temperature: 0.1, maxTokens: '700' },
    messages: [{ role: 'system', text: SYSTEM }, { role: 'user', text: buildPrompt(masked, chunks) }],
  });
  const text = c.ok ? c.data?.result?.alternatives?.[0]?.message?.text : null;
  if (typeof text !== 'string') return fail(502, 'yandex');
  const parsed = parseAnswer(text, chunks.length);
  if (!parsed) return { status: 200, body: { answer: null, sources: [], left } };
  return { status: 200, body: { answer: parsed.answer, sources: sourcesOf(chunks, parsed.cited), left } };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function start(port = PORT) {
  const srv = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/ask') return send(res, 404, { error: 'not_found' });
    let size = 0;
    const parts = [];
    req.on('data', (d) => { size += d.length; if (size > 8192) { req.destroy(); } else parts.push(d); });
    req.on('end', async () => {
      let q = null;
      try { q = JSON.parse(Buffer.concat(parts).toString('utf8'))?.q; } catch {}
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      try {
        const r = await ask(token, q);
        if (r.status >= 500) console.error(`ai: ${r.body.error}`); // без вопроса и без адреса
        send(res, r.status, r.body);
      } catch { console.error('ai: crash'); send(res, 500, { error: 'crash' }); }
    });
  });
  srv.listen(port);
  return srv;
}

if (import.meta.url === `file://${process.argv[1]}`) start();
