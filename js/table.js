// Таблица (2.21.9, просьба Никиты): выгрузка поездок в Excel (CSV) и загрузка поездок из таблицы.
// Всё в телефоне: файл создаётся и читается здесь, на наш сервер ничего не уходит.
// CSV — с «;» и BOM: так русский Excel открывает его двойным нажатием без настройки кодировки.
// Файл выгрузки не защищён паролем — об этом предупреждаем до сохранения.
import { I, esc, openLayer, closeLayer, sheet, toast, plural, uid, saveToDevice, MONTHS } from './ui.js';
import { S, statsOf, nowLocal, routeOf, locosText, isLive, myPay, overRestByTrip } from './store.js';
import { parseLocal, fmtLocal, validateTrip, DAY } from './calc.js';
import { tripPay, hasRate } from './pay.js';
import { TRIP_KINDS, kindOf } from './forms.js';
import { openImportPreview } from './share.js';

const p2 = (n) => String(n).padStart(2, '0');
const dmy = (ms) => { const d = new Date(ms); return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`; };
const hhmm = (ms) => { const d = new Date(ms); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
const hours = (min) => (min > 0 ? String(Math.round(min / 60 * 100) / 100).replace('.', ',') : '');
const numText = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? String(v).replace('.', ',') : '');

// Ячейка CSV: кавычки при необходимости; текст, который Excel принял бы за формулу (= + - @), — с апострофом
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXPORT_COLS = ['Дата явки', 'Явка', 'Дата окончания', 'Окончание', 'Маршрут', 'Вид движения', 'Локомотив', 'Номер маршрута',
  'Вес, т', 'Оси', 'Длина, усл. ваг.', 'Рабочее время, ч', 'Ночные, ч', 'Праздничные, ч', 'Пассажиром, ч', 'Ожидание, ч'];

// trips — законченные поездки; money: { cfg, or } — добавить ориентировочный заработок на руки
export function tripsCsv(trips, { money = null } = {}) {
  const cols = money ? [...EXPORT_COLS, 'Заработок на руки, ₽ (ориентировочно)'] : EXPORT_COLS;
  const rows = [cols];
  const list = trips.filter((t) => t.end && !isLive(t)).map((t) => ({ t, st: statsOf(t) })).filter(({ st }) => Number.isFinite(st.start) && Number.isFinite(st.end))
    .sort((a, b) => a.st.start - b.st.start);
  for (const { t, st } of list) {
    const s = parseLocal(t.start); const e = parseLocal(t.end);
    const row = [dmy(s), hhmm(s), dmy(e), hhmm(e), routeOf(t) || '', TRIP_KINDS[kindOf(t)].label, locosText(t), t.routeNo || '',
      numText(t.weight), numText(t.axles), numText(t.length), hours(st.work), hours(st.night), hours(st.holiday), hours(st.pass), hours(st.wait)];
    if (money) { const p = tripPay(t, st, money.cfg, { overRestMin: money.or.get(t.id) || 0 }); row.push(p ? String(Math.round(p.net)) : ''); }
    rows.push(row);
  }
  return `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

// ---- чтение CSV ----
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
    if (rows.length > IMPORT_MAX + 5) break;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim().replace(/^'(?=[=+\-@])/, ''))).filter((r) => r.some((x) => x));
}

export const IMPORT_MAX = 500;
const FILE_MAX = 2 * 1024 * 1024;
const COLS = [
  ['endDate', /^дата\s+оконч|^дата\s+конц/],
  ['date', /^дата/],
  ['routeNo', /номер\s+маршрута|^№\s*маршрута/],
  ['locoNumber', /номер\s+локомотива/],
  ['locoType', /тип\s+локомотива|^серия/],
  ['loco', /^локомотив/],
  ['start', /^явка|^начало|^время\s+явки/],
  ['end', /^окончание|^конец|^время\s+окончания/],
  ['from', /^откуда|станция\s+отправления/],
  ['to', /^куда|станция\s+прибытия/],
  ['route', /^маршрут|^плечо/],
  ['kind', /^вид/],
  ['weight', /^вес/],
  ['axles', /^оси/],
  ['length', /^длина/],
];
export function mapHeader(head) {
  const map = {};
  head.forEach((h, i) => {
    const k = h.toLowerCase().replace(/ё/g, 'е').trim();
    const hit = COLS.find(([key, re]) => map[key] == null && re.test(k));
    if (hit) map[hit[0]] = i;
  });
  return map;
}
// «14.10.2026», «14.10.26», «2026-10-14» → 'YYYY-MM-DD'
function dateKey(s) {
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return okDate(y, +m[2], +m[1]); }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? okDate(+m[1], +m[2], +m[3]) : null;
}
function okDate(y, mo, d) {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 ? `${y}-${p2(mo)}-${p2(d)}` : null;
}
const timeOf = (s) => { const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(s); return m && +m[1] < 24 && +m[2] < 60 ? `${p2(+m[1])}:${p2(+m[2])}` : null; };
// Дата и время из одной ячейки («14.10.2026 08:00», «2026-10-14T08:00») или из ячейки времени и даты рядом
function stamp(cell, dateCell) {
  const s = String(cell || '').trim();
  const m = /^(.+?)[ T]+(\d{1,2}[:.]\d{2}(?::\d{2})?)$/.exec(s);
  if (m) { const d = dateKey(m[1].trim()); const t = timeOf(m[2]); return d && t ? `${d}T${t}` : null; }
  const t = timeOf(s); const d = dateKey(String(dateCell || '').trim());
  return t && d ? `${d}T${t}` : null;
}
const clean = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const posNum = (v, max) => { const n = Number(String(v || '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 10) / 10 : null; };
const KIND_BY_LABEL = Object.fromEntries(Object.entries(TRIP_KINDS).map(([k, v]) => [v.label.toLowerCase().replace(/ё/g, 'е'), k]));

// Строки таблицы → { items, skipped, error } для окна выбора (как у поездок от напарника)
export function tableItems(rows, nowMs, mine = S.trips) {
  if (rows.length < 2) return { items: [], skipped: 0, error: 'В таблице нет строк с поездками.' };
  const map = mapHeader(rows[0]);
  if (map.start == null || (map.end == null)) return { items: [], skipped: 0, error: 'Не нашли столбцы «Явка» и «Окончание». Первая строка таблицы — названия столбцов, как в выгрузке CABINA.' };
  const items = []; let skipped = 0;
  const get = (r, k) => (map[k] != null ? r[map[k]] ?? '' : '');
  for (const r of rows.slice(1, IMPORT_MAX + 1)) {
    const start = stamp(get(r, 'start'), get(r, 'date'));
    let end = stamp(get(r, 'end'), get(r, 'endDate') || get(r, 'date'));
    // окончание без своей даты раньше явки — значит, на следующий день
    if (start && end && !get(r, 'endDate') && !/\d[ T]+\d/.test(get(r, 'end')) && parseLocal(end) <= parseLocal(start)) end = fmtLocal(parseLocal(end) + DAY);
    if (!start || !end) { skipped++; continue; }
    const s = parseLocal(start); const e = parseLocal(end);
    if (e > nowMs || e - s > 3 * DAY) { skipped++; continue; }
    let from = clean(get(r, 'from'), 60); let to = clean(get(r, 'to'), 60);
    if (!(from && to)) {
      const parts = clean(get(r, 'route'), 130).split(/\s*(?:→|->|—|–|\s-\s)\s*/).filter(Boolean);
      if (parts.length === 2) { [from, to] = parts.map((x) => x.slice(0, 60)); } else { from = ''; to = ''; }
    }
    const trip = { id: uid(), routeId: null, routeLabel: from && to ? '' : clean(get(r, 'route'), 60), start, end, passenger: [], waiting: [],
      locoType: '', locoNumber: '', restType: null, homeRest: null, homeChoice: null, createdAt: Date.now() };
    const loco = clean(get(r, 'loco'), 60).split(',')[0].trim(); // несколько локомотивов — берём первый
    trip.locoType = clean(get(r, 'locoType'), 20) || clean(loco.replace(/\s*№?\s*\d+\s*$/, ''), 20);
    trip.locoNumber = clean(get(r, 'locoNumber'), 12).replace(/^№\s*/, '') || (/(\d+)\s*$/.exec(loco)?.[1] || '').slice(0, 12);
    const kind = KIND_BY_LABEL[clean(get(r, 'kind'), 20).toLowerCase().replace(/ё/g, 'е')];
    if (kind && kind !== 'freight') trip.kind = kind;
    const rn = clean(get(r, 'routeNo'), 20); if (rn) trip.routeNo = rn;
    const w = posNum(get(r, 'weight'), 20000); if (w) trip.weight = w;
    const ax = posNum(get(r, 'axles'), 2000); if (ax) trip.axles = Math.round(ax);
    const l = posNum(get(r, 'length'), 1000); if (l) trip.length = l;
    if (validateTrip(trip)) { skipped++; continue; }
    const dup = mine.some((t) => { const st = statsOf(t); const ts = Number.isFinite(st.start) ? st.start : parseLocal(t.start); const te = Number.isFinite(st.end) ? st.end : ts; return ts < e && te > s; })
      || items.some((it) => parseLocal(it.trip.start) < e && parseLocal(it.trip.end) > s);
    items.push({ trip, from: from && to ? from : '', to: from && to ? to : '', km: null, dup });
  }
  skipped += Math.max(0, rows.length - 1 - IMPORT_MAX);
  return { items, skipped, error: null };
}

// ---- окна ----
export function openTableExport() {
  const now = nowLocal(); const d = new Date(now);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  const PER = [['month', `${MONTHS[m]}`], ['year', `${y} год`], ['all', 'Всё время']];
  let per = 'year'; let money = false;
  const cfg = myPay();
  const pick = () => S.trips.filter((t) => {
    if (!t.end || isLive(t)) return false;
    const s = new Date(statsOf(t).start);
    return per === 'all' || (s.getUTCFullYear() === y && (per === 'year' || s.getUTCMonth() === m));
  });
  const el = openLayer(sheet({
    title: 'Поездки в таблицу',
    body: `<div class="field"><div class="label">За какой период</div><div class="seg" id="tx-per">${PER.map(([k, l]) => `<button type="button" data-per="${k}" aria-pressed="${k === per}">${esc(l)}</button>`).join('')}</div></div>
      ${hasRate(cfg) ? `<div class="switch-row"><div class="grow"><div style="font-weight:700">Добавить заработок</div><div class="hint">Ориентировочно, на руки — по вашим ставкам</div></div>
        <button type="button" class="switch" role="switch" id="tx-money" aria-checked="false" aria-label="Добавить заработок в таблицу"></button></div>` : ''}
      <div class="hint" id="tx-count"></div>
      <div class="notice warn">${I.alert}<div><b>Файл не защищён паролем.</b> В нём ваш график${hasRate(cfg) ? ' (и заработок, если включите)' : ''}. Не выкладывайте его в общие чаты и группы — храните у себя или отправьте только себе.</div></div>
      <div class="hint">Откроется в Excel и других программах для таблиц. Заметок и отвлечений в файле нет.</div>`,
    foot: `<button class="btn btn-primary" data-act="tx-save" id="tx-save">${I.download} Скачать таблицу</button>`,
  }));
  const paint = () => {
    const n = pick().length;
    for (const b of el.querySelectorAll('[data-per]')) b.setAttribute('aria-pressed', String(b.dataset.per === per));
    el.querySelector('#tx-money')?.setAttribute('aria-checked', String(money));
    el.querySelector('#tx-count').textContent = n ? `В таблице будет ${n} ${plural(n, 'поездка', 'поездки', 'поездок')}` : 'За этот период законченных поездок нет';
    el.querySelector('#tx-save').disabled = !n;
  };
  paint();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.per) { per = b.dataset.per; paint(); return; }
    if (b.id === 'tx-money') { money = !money; paint(); return; }
    if (b.dataset.act === 'tx-save') {
      const list = pick();
      if (!list.length) return;
      const csv = tripsCsv(list, { money: money && hasRate(cfg) ? { cfg, or: overRestByTrip() } : null });
      const name = `cabina-poezdki-${per === 'month' ? `${y}-${p2(m + 1)}` : per === 'year' ? y : 'vse'}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      // в телефоне — как с резервной копией: окно «Поделиться» (сохранить в «Файлы» или открыть в Excel)
      const file = typeof File === 'function' ? new File([blob], name, { type: 'text/csv' }) : null;
      if (file && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Поездки CABINA' }); closeLayer(el); return; } catch (ex) { if (ex?.name === 'AbortError') return; }
      }
      const res = await saveToDevice(blob, name);
      if (res === 'declined') return;
      if (res === 'failed') { toast('Не удалось сохранить файл', { error: true }); return; }
      closeLayer(el);
      toast(`Таблица сохранена: ${name}`, { ms: 4000 });
    }
  });
  return el;
}

// Файл таблицы выбран: читаем, показываем, что нашли, человек отмечает, что добавить
export async function importTableFile(file) {
  if (!file) return false;
  if (/\.(xlsx?|ods|numbers)$/i.test(file.name || '')) { toast('Сохраните таблицу в формате CSV: в Excel — «Файл» → «Сохранить как» → «CSV (разделители — точка с запятой)»', { error: true, ms: 7000 }); return false; }
  if (file.size > FILE_MAX) { toast('Файл слишком большой', { error: true }); return false; }
  let text;
  try {
    const buf = await file.arrayBuffer();
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1251').decode(buf); }
  } catch { toast('Не удалось прочитать файл', { error: true }); return false; }
  const res = tableItems(parseCsv(text), nowLocal());
  if (res.error) { toast(res.error, { error: true, ms: 6000 }); return false; }
  openImportPreview(res, { title: 'Поездки из таблицы', notice: '<b>Проверьте цифры:</b> поездки взяты из таблицы как есть. Добавленные можно изменить или удалить как обычные. Вид отдыха после поездки выберите сами, если нужен расчёт отдыха.' });
  return true;
}

