// Наглядный разбор расчётного листка (2.43, просьба Никиты 26.11.2026: «сочно и понятно, чтобы было
// видно, за что платить подписку»). Здесь — только расчёты для экрана и разметка; сам листок разбирает
// payslip-parse.js, проверки делает payslip-report.js. Всё — в телефоне.
import {esc} from './ui.js';
import {rub} from './payslip-report.js';

const n2 = n => n.toLocaleString('ru-RU', {maximumFractionDigits: 2});
const n0 = n => Math.round(n).toLocaleString('ru-RU');
const cents = rows => rows.reduce((a, r) => a + Math.round(r.amount * 100), 0) / 100;
const fin = (...xs) => xs.every(Number.isFinite);

// Из чего сложилась зарплата: группы строк начислений по коду. Порядок — как их привычно читать.
export const PARTS = [
  {key: 'work', label: 'Работа по тарифу', hint: 'часы на локомотиве, следование и ожидание', test: c => /^(004|013|018|049|052)/.test(c)},
  {key: 'night', label: 'Ночные', hint: 'с 22:00 до 06:00', test: c => /^023/.test(c)},
  {key: 'over', label: 'Сверх нормы и выходные', hint: 'переработка, выходные и праздники', test: c => /^(072|073|C073|E073|035|076|082)/.test(c)},
  {key: 'extra', label: 'Доплаты', hint: 'вредность, тяжёлые поезда, удлинённые участки, отдых', test: c => /^(057|151|152|172)/.test(c)},
  {key: 'bonus', label: 'Премии', hint: '', test: c => /^(010|011|248|269)/.test(c)},
  {key: 'north', label: 'Север и районный', hint: 'районный коэффициент и северная надбавка', test: c => /^(026|027)/.test(c)},
  {key: 'leave', label: 'Отпуск и больничный', hint: 'по среднему заработку', test: c => /^(032|033|174|256|260|305|556)/.test(c)},
  {key: 'comp', label: 'Компенсации', hint: 'суточные, жильё и другие выплаты без налога', test: c => /^(349|461|504)/.test(c)},
  {key: 'other', label: 'Прочее', hint: '', test: () => true},
];

export function breakdown(sheet) {
  const earn = sheet.rows.filter(r => r.kind === 'earnings');
  const parts = PARTS.map(p => ({...p, rows: []}));
  for (const r of earn) parts.find(p => p.test(r.code)).rows.push(r);
  const used = parts.map(p => ({key: p.key, label: p.label, hint: p.hint, amount: cents(p.rows), count: p.rows.length})).filter(p => p.amount > 0);
  const total = used.reduce((a, p) => a + p.amount, 0);
  for (const p of used) p.share = total ? p.amount / total : 0;
  return {parts: used, total};
}

// Главные числа месяца — плитками. Только то, что есть в листке.
export function slipFacts(sheet, payout) {
  const out = [], month = sheet.period?.split(' ')[0];
  const cur = sheet.rows.filter(r => r.kind === 'earnings' && r.month === month);
  if (fin(sheet.worked)) {
    const over = fin(sheet.norm) ? Math.round((sheet.worked - sheet.norm) * 100) / 100 : null;
    out.push({key: 'worked', label: 'Отработано', value: n2(sheet.worked) + ' ч',
      sub: fin(sheet.norm) ? 'норма ' + n2(sheet.norm) + ' ч' + (over > 0 ? ' · сверх нормы ' + n2(over) + ' ч' : over < 0 ? ' · до нормы ' + n2(-over) + ' ч' : ' · ровно норма') : ''});
  }
  if (fin(payout?.total, sheet.worked) && sheet.worked > 0) out.push({key: 'hour', label: 'Час на руки', value: rub(payout.total / sheet.worked), money: true,
    sub: 'в среднем: на руки / отработанные часы' + (fin(sheet.rate) ? ' · тариф ' + rub(sheet.rate) : '')});
  const night = cur.filter(r => /^023/.test(r.code));
  const nightH = night.reduce((a, r) => a + (Number.isFinite(r.hours) ? r.hours : 0), 0);
  if (night.length && nightH > 0) out.push({key: 'night', label: 'Ночные', value: n2(nightH) + ' ч', sub: 'доплата ' + rub(cents(night)), subMoney: true});
  const north = sheet.rows.filter(r => r.kind === 'earnings' && /^(026|027)/.test(r.code)), northSum = cents(north);
  if (northSum > 0 && sheet.gross > 0) out.push({key: 'north', label: 'Север и районный', value: rub(northSum), money: true, sub: Math.round(northSum / sheet.gross * 100) + ' % начисленного'});
  const tax = cents(sheet.rows.filter(r => r.kind === 'deductions' && /^883/.test(r.code)));
  if (tax > 0) out.push({key: 'tax', label: 'НДФЛ', value: rub(tax), money: true, sub: sheet.gross > 0 ? n2(Math.round(tax / sheet.gross * 1000) / 10) + ' % начисленного' : ''});
  return out;
}

// Итог проверки одной фразой: сколько сошлось, сколько нет и сколько по одному листку не проверить.
export function verdict(checks, items) {
  const all = [...checks.filter(x => !x.code), ...items];
  const c = {ok: 0, approx: 0, diff: 0, none: 0};
  for (const x of all) c[x.status in c ? x.status : 'none']++;
  const checked = c.ok + c.approx + c.diff;
  if (c.diff) return {tone: 'bad', counts: c, title: c.diff === 1 ? 'Нашли расхождение' : 'Нашли расхождения: ' + c.diff,
    text: 'Ниже — формула по каждой строке. Покажите её расчётчику: так проще разобраться, чем «на словах».'};
  if (!checked) return {tone: 'none', counts: c, title: 'Проверить не получилось', text: 'В листке не нашлось строк с часами, ставкой и итогами. Попробуйте исходный PDF.'};
  if (c.approx) return {tone: 'warn', counts: c, title: 'Почти всё сходится',
    text: 'Проверили ' + checked + ' ' + plural(checked, 'строку', 'строки', 'строк') + ' и итогов. ' + c.approx + ' — с точностью до рубля или по процентам, которых нет в листке.'};
  return {tone: 'ok', counts: c, title: 'Ошибок не нашли', text: 'Проверили ' + checked + ' ' + plural(checked, 'строку', 'строки', 'строк') + ' и итогов — всё сходится до копейки.'};
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}

// ------------------------------------------------------------------ разметка

const ICON = {ok: '✓', warn: '≈', bad: '!', none: '?'};
export function verdictHtml(v) {
  const {ok, approx, diff, none} = v.counts, total = ok + approx + diff + none || 1;
  const seg = (k, n) => n ? `<i class="ps-seg ps-seg-${k}" style="flex-grow:${n}"></i>` : '';
  const leg = (k, n, label) => n ? `<li><i class="ps-dot ps-seg-${k}"></i>${label} <b>${n}</b></li>` : '';
  return `<div class="ps-verdict ps-v-${v.tone}" data-verdict="${v.tone}">
    <span class="ps-v-ico" aria-hidden="true">${ICON[v.tone]}</span>
    <div class="ps-v-copy"><strong>${esc(v.title)}</strong><p>${esc(v.text)}</p></div>
    <div class="ps-bar" role="img" aria-label="${esc(`Сошлось ${ok}, приблизительно ${approx}, не сошлось ${diff}, не проверить по листку ${none} из ${total}`)}">${seg('ok', ok)}${seg('approx', approx)}${seg('diff', diff)}${seg('none', none)}</div>
    <ul class="ps-legend">${leg('ok', ok, 'Сошлось')}${leg('approx', approx, 'Приблизительно')}${leg('diff', diff, 'Не сошлось')}${leg('none', none, 'Не проверить по листку')}</ul>
  </div>`;
}

export function breakdownHtml(b, gross) {
  if (b.parts.length < 2) return '';
  const bar = b.parts.map(p => `<i class="ps-seg ps-part-${p.key}" style="flex-grow:${p.amount}"></i>`).join('');
  const rows = b.parts.map(p => `<li class="ps-part"><i class="ps-dot ps-part-${p.key}"></i><span class="ps-part-name">${esc(p.label)}${p.hint ? `<small>${esc(p.hint)}</small>` : ''}</span>
    <span class="ps-part-sum"><b class="money">${rub(p.amount)}</b><small>${Math.round(p.share * 100) || '<1'} %</small></span></li>`).join('');
  const note = Number.isFinite(gross) && Math.abs(gross - b.total) >= 0.01 ? '<p class="hint">Перерасчёты прошлых месяцев с минусом в полосе не показаны.</p>' : '';
  return `<section class="ps-block" data-breakdown><h3>Из чего сложилась зарплата</h3>
    <div class="ps-bar ps-bar-big" role="img" aria-label="Доли начислений">${bar}</div><ul class="ps-parts">${rows}</ul>${note}</section>`;
}

export function factsHtml(facts) {
  if (!facts.length) return '';
  return `<section class="ps-block"><h3>Главное за месяц</h3><div class="ps-facts">${facts.map(f =>
    `<div class="ps-fact" data-fact="${f.key}"><span>${esc(f.label)}</span><b${f.money ? ' class="money"' : ''}>${esc(f.value)}</b>${f.sub ? `<small${f.subMoney ? ' class="money"' : ''}>${esc(f.sub)}</small>` : ''}</div>`).join('')}</div></section>`;
}

// ------------------------------------------------------------------ сверка с поездками

export function compareVerdict(rows) {
  const c = {ok: 0, approx: 0, diff: 0, none: 0};
  for (const r of rows) c[r.status in c ? r.status : 'none']++;
  const checked = c.ok + c.approx + c.diff;
  if (c.diff) return {tone: 'bad', counts: c, title: 'Часы расходятся: ' + c.diff + ' ' + plural(c.diff, 'строка', 'строки', 'строк'),
    text: 'Проверьте поездки в CABINA за месяц. Если в них всё верно — покажите разницу расчётчику.'};
  if (!checked) return {tone: 'none', counts: c, title: 'Сверить не получилось', text: 'В листке нет часов, которые можно сравнить с поездками.'};
  if (c.approx) return {tone: 'warn', counts: c, title: 'Часы почти совпали', text: 'Разница в пределах округления минут до сотых часа.'};
  return {tone: 'ok', counts: c, title: 'Часы совпали с поездками', text: 'Сравнили ' + checked + ' ' + plural(checked, 'показатель', 'показателя', 'показателей') + ' — листок совпадает с вашими записями.'};
}

const hrs = h => Number.isFinite(h) ? n2(h) + ' ч' : '—';
export function compareRowHtml(r) {
  const max = Math.max(r.cabina || 0, r.sheet || 0) || 1;
  const bar = (k, v, label) => `<div class="ps-cmp-line"><span>${label}</span><span class="ps-cmp-track"><i class="ps-cmp-${k}" style="width:${Number.isFinite(v) ? Math.max(2, v / max * 100) : 0}%"></i></span><b>${hrs(v)}</b></div>`;
  const tone = {ok: 'ok', approx: 'approx', diff: 'diff'}[r.status] || 'none';
  const tag = {ok: 'Совпало', approx: 'Почти', diff: 'Разница', none: 'Нет данных'}[tone];
  return `<li class="ps-cmp ps-${r.status}" data-cmp="${esc(r.title)}"><div class="ps-cmp-head"><b>${esc(r.title)}</b><span class="ps-tag ps-tag-${tone}">${tag}${Number.isFinite(r.delta) && r.delta ? ' ' + (r.delta > 0 ? '+' : '−') + n2(Math.abs(r.delta)) + ' ч' : ''}</span></div>
    ${Number.isFinite(r.cabina) || Number.isFinite(r.sheet) ? bar('cab', r.cabina, 'CABINA') + bar('sheet', r.sheet, 'Листок') : ''}<p>${esc(r.detail)}</p></li>`;
}

export function moneyHtml(m) {
  if (!m || !fin(m.cabina, m.sheet)) return '';
  const d = m.sheet - m.cabina, pct = m.cabina ? Math.round(d / m.cabina * 1000) / 10 : 0;
  return `<section class="ps-block ps-money" data-money><h3>Начислено: прогноз CABINA и листок</h3>
    <div class="ps-money-row"><div><span>Прогноз CABINA</span><b class="money">${rub(m.cabina)}</b></div><div><span>По листку</span><b class="money">${rub(m.sheet)}</b></div></div>
    <p class="hint">${Math.abs(pct) < 0.05 ? 'Совпало.' : `В листке ${d > 0 ? 'больше' : 'меньше'} на <span class="money">${rub(Math.abs(d))}</span> (${n2(Math.abs(pct))} %).`} Прогноз — ориентировочный: премии за прошлые месяцы, отпуск и разовые выплаты CABINA не знает.</p></section>`;
}
export {n0};
