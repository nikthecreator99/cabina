// CABINA AI: как документ режется на куски (без сети — проверяется автотестами).
// Кусок = одна статья или один пункт, чтобы ответ ссылался точно. Длинный — делится на части по предложениям.

export const CHUNK_MAX = 1800;   // знаков в куске (≈ 500 токенов, у эмбеддингов Яндекса предел 2048)

const ARTICLE = /^\s*Статья\s+(\d{1,4}(?:\.\d{1,3})*)\.?\s*(.*)$/;
const POINT = /^\s*(\d{1,3}(?:\.\d{1,3}){0,3})\.\s+(?=\S)/;
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
// В 'points' строка «Приложение N 8» начинает новую нумерацию: ссылка «приложение 8, пункт 57».
export function splitDoc(text, mode) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const out = [];
  let ref = 'вводная часть';
  let prefix = '';
  let buf = [];
  const flush = () => {
    const body = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf = [];
    if (body.length < 3) return;
    const ps = parts(body);
    ps.forEach((p, i) => out.push({ ref: ps.length > 1 ? `${ref} (часть ${i + 1})` : ref, body: p }));
  };
  for (const line of lines) {
    let m;
    if (mode === 'articles' && (m = ARTICLE.exec(line))) {
      flush(); ref = `статья ${m[1]}`; buf.push(line.trim()); continue;
    }
    if (mode === 'points' && (m = APPENDIX.exec(line))) {
      flush(); prefix = `приложение ${m[1]}, `; ref = `приложение ${m[1]}`; buf.push(line.trim()); continue;
    }
    if (mode === 'points' && (m = POINT.exec(line))) {
      flush(); ref = `${prefix}пункт ${m[1]}`; buf.push(line.trim()); continue;
    }
    buf.push(line.trim());
  }
  flush();
  return out.map((c) => ({ ref: c.ref.slice(0, 200), body: c.body.slice(0, 4000) }));
}

// Строка для SQL: одинарные кавычки удваиваются (standard_conforming_strings включён по умолчанию)
export const sqlText = (s) => `'${String(s).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
