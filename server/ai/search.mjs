// Результаты поиска — выдержки и ссылки. Запросы к генеративной модели не нужны.
import { cleanQuestion, maskPersonal } from './core.mjs';

export const TRUSTED = ['pravo.gov.ru', 'mintrans.gov.ru', 'rostrud.gov.ru', 'rzd.ru'];
const labels = { documents: 'Документы CABINA', trusted: 'Проверенный сайт', internet: 'Интернет' };

export function searchTerms(q) {
  return q.toLowerCase().replaceAll('ё', 'е').split(/[^а-я0-9a-z]+/u)
    .filter((w) => w && !['сколько', 'скока', 'скок', 'какой', 'какая', 'какие', 'такое', 'пожалуйста', 'подскажите', 'положено', 'положен', 'можно', 'мне'].includes(w))
    .map((w) => /^оборотк/.test(w) ? 'пункт оборота' : /^отдыхать$/.test(w) ? 'отдых' : w).join(' ');
}

function plain(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (all, key) => {
    const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
    if (key in named) return named[key];
    const n = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).trim();
}
export function webHits(encoded, stage) {
  if (typeof encoded !== 'string' || encoded.length > 2000000) throw Error('search_format');
  const xml = Buffer.from(encoded, 'base64').toString('utf8');
  if (!/<yandexsearch[\s>]/i.test(xml)) throw Error('search_format');
  if (/<error\b/i.test(xml) && !/<error\b[^>]*code=["']15["']/i.test(xml)) throw Error('search_provider');
  const rows = [];
  for (const [, doc] of xml.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/gi)) {
    const field = (tag) => plain(doc.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'))?.[1] || '');
    let url;
    try { url = new URL(field('url')); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 500) continue;
    if (stage === 'trusted' && !TRUSTED.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) continue;
    const quote = field('passage') || field('headline');
    if (!quote || rows.some(r => r.source === url.href)) continue;
    rows.push({n: rows.length + 1, title: (field('title') || url.hostname).slice(0, 200),
      ref: url.hostname, source: url.href, edition: labels[stage], quote: quote.slice(0, 1000)});
    if (rows.length === 3) break;
  }
  return rows;
}

export async function findStage(token, q, stage, {rest, web, webEnabled}) {
  const fail = (status, error) => ({status, body: {error}});
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token || '')) return fail(401, 'auth');
  const question = cleanQuestion(q);
  if (!question || !Object.hasOwn(labels, stage)) return fail(400, 'bad_question');
  const masked = maskPersonal(question);
  function dbError(r) {
    const m = String(r.data?.message || '');
    if (r.status === 401) return fail(401, 'auth');
    if (r.status === 403 || /forbidden/.test(m)) return fail(403, 'forbidden');
    if (/month limit/.test(m)) return fail(429, 'month_limit');
    if (/ai busy/.test(m)) return fail(429, 'busy');
    return fail(503, 'search_off');
  }
  if (stage === 'documents') {
    const r = await rest('ai_document_matches', {p_query: searchTerms(masked)}, token);
    if (!r.ok || !Array.isArray(r.data)) return dbError(r);
    const sources = r.data.map((c, i) => ({n: i + 1, title: c.title, edition: c.edition, source: c.source, ref: c.ref, quote: c.body.slice(0, 1500)}));
    return {status: 200, body: {stage, sources, webEnabled}};
  }
  if (!webEnabled) return fail(503, 'web_off');
  const quota = await rest('ai_web_reserve', {}, token);
  if (!quota.ok) return dbError(quota);
  const sites = stage === 'trusted' ? ' (' + TRUSTED.map(s => 'site:' + s).join(' | ') + ')' : '';
  const query = masked.replace(/[^\p{L}\p{N}\s]/gu, ' ').slice(0, 400 - sites.length).trim();
  const r = await web(query + sites);
  if (!r.ok) return fail(502, 'search_provider');
  try { return {status: 200, body: {stage, sources: webHits(r.data?.rawData, stage), webLeft: quota.data}}; }
  catch { return fail(502, 'search_provider'); }
}
