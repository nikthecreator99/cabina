// CABINA AI: загрузка документов в базу. Запускает администратор на сервере (инструкция — server/ai/README.md):
//
//   node ingest.mjs docs.json > /tmp/ai-docs.sql
//   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/ai-docs.sql
//
// docs.json — список документов: [{ "id": "tk", "title": "Трудовой кодекс РФ", "edition": "ред. от …",
//   "source": "https://…", "file": "tk.txt", "mode": "articles" | "points" }]. Файлы — обычный текст (UTF-8),
// путь — от папки, где лежит docs.json. Тексты документов в репозиторий не кладём.
// Только открытые документы! На каждом проверить, что нет пометки «Для служебного пользования» / «ДСП».
// Ключ Яндекса берётся из переменных окружения YC_API_KEY и YC_FOLDER_ID (тех же, что у сервера помощника).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { splitDoc, sqlText } from './split.mjs';

const KEY = process.env.YC_API_KEY;
const FOLDER = process.env.YC_FOLDER_ID;
const list = process.argv[2];
if (!KEY || !FOLDER || !list) {
  console.error('нужно: YC_API_KEY, YC_FOLDER_ID и путь к docs.json');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embed(text) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding', {
      method: 'POST',
      headers: { Authorization: `Api-Key ${KEY}`, 'x-folder-id': FOLDER, 'x-data-logging-enabled': 'false', 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelUri: `emb://${FOLDER}/text-search-doc/latest`, text }),
    }).catch(() => null);
    if (r?.ok) {
      const v = (await r.json()).embedding.map(Number);
      if (v.length === 256 && v.every(Number.isFinite)) return v;
      throw new Error('эмбеддинг не той длины');
    }
    await sleep(1000 * (attempt + 1)); // 429 или нет связи — подождать и повторить
  }
  throw new Error('Яндекс не отвечает');
}

const docs = JSON.parse(readFileSync(list, 'utf8'));
const out = ['begin;'];
let total = 0;
for (const d of docs) {
  if (!/^[a-z0-9-]{2,40}$/.test(d.id) || !/^https:\/\//.test(d.source) || !['articles', 'points'].includes(d.mode)) {
    throw new Error(`документ ${d.id}: проверьте id, source и mode`);
  }
  const chunks = splitDoc(readFileSync(join(dirname(list), d.file), 'utf8'), d.mode);
  console.error(`${d.id}: ${chunks.length} кусков`);
  out.push(`delete from private.ai_docs where id = ${sqlText(d.id)};`);
  out.push(`insert into private.ai_docs (id, title, edition, source) values (${sqlText(d.id)}, ${sqlText(d.title)}, ${sqlText(d.edition)}, ${sqlText(d.source)});`);
  for (const c of chunks) {
    const v = await embed(`${d.title}, ${c.ref}. ${c.body}`);
    out.push(`insert into private.ai_chunks (doc_id, ref, body, emb) values (${sqlText(d.id)}, ${sqlText(c.ref)}, ${sqlText(c.body)}, '[${v.join(',')}]');`);
    total++;
    await sleep(120); // не больше ~8 запросов в секунду (предел Яндекса — 10)
  }
}
out.push('commit;');
process.stdout.write(out.join('\n') + '\n');
console.error(`готово: ${total} кусков`);
