// CABINA AI: как документ режется на куски (без сети — проверяется автотестами).
// Кусок = одна статья или один пункт, чтобы ответ ссылался точно. Длинный — делится на части по предложениям.

export const CHUNK_MAX = 1800;   // знаков в куске (≈ 500 токенов, у эмбеддингов Яндекса предел 2048)

const ARTICLE = /^\s*Статья\s+(\d{1,4}(?:\.\d{1,3})*)\.?\s*(.*)$/;
// Пункт: «14. Текст», «4.2.3. текст». Перенос строки посреди ссылки («…пунктами 7.1. - 7.12. настоящего», «7.24. и подпунктом»)
// пунктом не считаем: после номера не тире, не союз и не предлог.
const POINT = /^\s*(\d{1,3}(?:\.\d{1,3}){0,3})\.\s+(?![-–—]|(?:и|или|а|в|во|на|по|с|к|о|об|от|до|из|за|настоящего|настоящих|указанного|указанных)[\s,.])(?=\S)/;
const SECTION = /^\s*Раздел\s+(\d{1,2})\.?\s+\S/;
const APPENDIX = /^\s*Приложение\s*(?:N|№)?\s*(\d{1,2})\b/i;

// Длинный текст → части не длиннее max, по границам предложений (а слишком длинное предложение — как есть, обрезкой)
export function parts(text, max = CHUNK_MAX) {
  if (text.length <= max) return [text];
  const sent = text.match(/[^.!?;]+[.!?;]*\s*/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sent) {
    if (cur && (cur + s).length > max) { out.push(cur.trim()); cur = ''; }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim()); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

// mode: 'articles' — «Статья 115. …» (кодексы); 'points' — «14. …», «4.2.3. …» (приказы, ПТЭ, колдоговор).
// В 'points' строка «Приложение N 8» начинает новую нумерацию: ссылка «приложение 8, пункт 57»;
// «Раздел 3. …» — ссылка «раздел 3» для текста раздела до первого пункта (сам заголовок куском не становится).
export function splitDoc(text, mode) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = [];
  let ref = 'вводная часть';
  let prefix = '';
  let buf = [];
  let headOnly = false; // в буфере только заголовок раздела — отдельным куском не нужен
  const flush = () => {
    const body = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf = [];
    if (body.length < 3 || headOnly) { headOnly = false; return; }
    const ps = parts(body);
    ps.forEach((p, i) => out.push({ ref: ps.length > 1 ? `${ref} (часть ${i + 1})` : ref, body: p }));
  };
  for (const line of lines) {
    let m;
    if (mode === 'articles' && (m = ARTICLE.exec(line))) {
      flush(); ref = `статья ${m[1]}`; buf.push(line.trim()); continue;
    }
    if (mode === 'points' && (m = SECTION.exec(line))) {
      flush(); prefix = ''; ref = `раздел ${m[1]}`; buf.push(line.trim()); headOnly = true; continue;
    }
    if (mode === 'points' && (m = APPENDIX.exec(line))) {
      flush(); prefix = `приложение ${m[1]}, `; ref = `приложение ${m[1]}`; buf.push(line.trim()); continue;
    }
    if (mode === 'points' && (m = POINT.exec(line))) {
      flush(); ref = `${prefix}пункт ${m[1]}`; buf.push(line.trim()); continue;
    }
    if (line.trim()) headOnly = false;
    buf.push(line.trim());
  }
  flush();
  return out.map((c) => ({ ref: c.ref.slice(0, 200), body: c.body.slice(0, 4000) }));
}

// Строка для SQL: одинарные кавычки удваиваются (standard_conforming_strings включён по умолчанию)
export const sqlText = (s) => `'${String(s).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
