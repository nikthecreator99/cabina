// Квиток за месяц в PDF. Страница A4 рисуется на холсте (canvas) теми же шрифтами, что и приложение,
// и вкладывается в PDF картинкой — без сторонних библиотек и без отправки данных куда-либо:
// файл собирается в телефоне и отдаётся через «Поделиться» или сохраняется.
// В файле честно сказано: расчёт ориентировочный, по данным, которые человек ввёл сам.
import { MONTHS, MONTHS_GEN, toast, openLayer, closeLayer, sheet, I, saveToDevice } from './ui.js';
import { S, statsOf, myPay } from './store.js';
import { fmtDur } from './calc.js';
import { payMonth, overRestIntervals, hasRate, fmtRub, fmtH, ROLES, NDFL } from './pay.js';

// ---------------------------------------------------------------- PDF из одной JPEG-картинки
const PAGE_W = 595.28; const PAGE_H = 841.89; // A4 в пунктах

export function pdfFromJpeg(jpeg, w, h, { title = '' } = {}) {
  const enc = new TextEncoder();
  const parts = []; const offsets = []; let len = 0;
  const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; add(`${n} 0 obj\n`); body(); add('\nendobj\n'); };
  // заголовок PDF — только латиница; название в метаданных — в UTF-16 (\376\377 …)
  const utf16 = (s) => { let o = 'FEFF'; for (const ch of s) { const c = ch.codePointAt(0); if (c > 0xffff) continue; o += c.toString(16).padStart(4, '0').toUpperCase(); } return `<${o}>`; };
  const content = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im0 Do Q`;
  add('%PDF-1.4\n'); add(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // метка «в файле двоичные данные»
  obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { add(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); add(jpeg); add('\nendstream'); });
  obj(5, () => add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => add(`<< /Title ${utf16(title)} /Producer (CABINA) >>`));
  const xref = len;
  add(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}

// ---------------------------------------------------------------- данные месяца
export function slipData(y, m) {
  const cfg = myPay();
  if (!hasRate(cfg)) return null;
  const r = payMonth(y, m, S.trips, S.absences, cfg, statsOf, { overRest: overRestIntervals(S.trips, statsOf) });
  if (r.empty) return null;
  const tripsN = r.sum.monthTrips.filter((t) => Number.isFinite(statsOf(t).start)).length;
  return { y, m, r, cfg, tripsN };
}

// ---------------------------------------------------------------- рисование страницы
const K = 2.5; // пикселей на пункт: ≈ 180 точек на дюйм, чётко при печати и на экране
const C = { ink: '#0b1020', text: '#1d2333', muted: '#6b7386', line: '#dfe3ec', zebra: '#f5f7fb', head: '#0b1020', accent: '#e53935', warnBg: '#fff6e0', warnLine: '#f0c36d', card: '#f3f5f9' };
const FONT = "'Onest', 'Segoe UI', Roboto, Arial, sans-serif";

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const pct = (v) => (v || v === 0 ? `${String(v).replace('.', ',')}%` : '');

export function drawSlip(ctx, d, { today = new Date() } = {}) {
  const { y, m, r, cfg, tripsN } = d;
  const L = 40; const R = PAGE_W - 40; const W = R - L;
  const font = (size, weight = 400, fam = FONT) => { ctx.font = `${weight} ${size}px ${fam}`; };
  const text = (s, x, yy, { size = 10, weight = 400, color = C.text, align = 'left', fam = FONT } = {}) => {
    font(size, weight, fam); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, yy);
  };
  const rect = (x, yy, w, h, color, radius = 0) => {
    ctx.fillStyle = color; ctx.beginPath();
    if (radius && ctx.roundRect) ctx.roundRect(x, yy, w, h, radius); else ctx.rect(x, yy, w, h);
    ctx.fill();
  };
  const hline = (yy, color = C.line, x1 = L, x2 = R, w = 0.8) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.stroke(); };

  // предупреждение готовим заранее: от его высоты зависит, сколько места останется таблицам
  font(9.5);
  const note = `Расчёт сделан приложением CABINA только по данным, которые вы сами ввели: поездки, отвлечения, тарифная ставка и надбавки. Премия, надбавки и удержания у каждого свои и меняются, поэтому суммы могут отличаться от начисленных. Отпускные, техучёба и разовые выплаты не учитываются${r.sickDays && !cfg.sickDay ? ', больничный — тоже: оплата дня не указана' : ''}. Премия посчитана за работу этого же месяца (${cfg.bonus}%), НДФЛ ${NDFL}%.`;
  const lines = wrap(ctx, note, W - 28);
  const nh = 24 + lines.length * 12 + 8;
  // высота строки таблиц: всё должно поместиться на один лист A4 над подвалом
  const SEC = 30; const HEAD = 20; const TOTAL = 22; const CARD = 40; const NET = 50;
  const nTables = r.deductions.length ? 2 : 1;
  const nRows = r.lines.length + r.deductions.length;
  const used = 114 + SEC + CARD + nTables * (SEC + HEAD + TOTAL) + (r.comp > 0 ? 20 : 0) + 14 + NET + 14 + nh;
  const rowH = Math.max(14, Math.min(21, (PAGE_H - 58 - used) / Math.max(1, nRows)));
  const rowFont = rowH >= 18 ? 10 : 9;

  // фон и шапка
  rect(0, 0, PAGE_W, PAGE_H, '#ffffff');
  rect(0, 0, PAGE_W, 84, C.ink);
  rect(0, 84, PAGE_W, 3, C.accent);
  // строгая надпись, как в приложении: прямой шрифт с разрядкой (отдельные буквы — разрядка работает везде)
  font(23, 800); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let wx = L;
  for (const ch of 'CABINA') { ctx.fillText(ch, wx, 46); wx += ctx.measureText(ch).width + 4.5; }
  text('Личный учёт поездок для железнодорожников', L, 66, { size: 9, color: '#a9b2c7' });
  text('ОРИЕНТИРОВОЧНЫЙ РАСЧЁТ ЗАРАБОТКА', R, 38, { size: 8.5, weight: 700, color: '#ffb547', align: 'right' });
  text(`${MONTHS[m - 1]} ${y}`, R, 62, { size: 19, weight: 700, color: '#ffffff', align: 'right' });

  let yy = 114;
  const role = ROLES[cfg.role] || '';
  text([role, r.rate ? `ставка ${fmtRub(r.rate, true)} в час` : ''].filter(Boolean).join(' · '), L, yy, { size: 11, weight: 600 });
  text(`Сформирован ${today.getDate()} ${MONTHS_GEN[today.getMonth()]} ${today.getFullYear()}`, R, yy, { size: 9, color: C.muted, align: 'right' });

  // рабочее время — карточки в один ряд
  const section = (title) => { yy += SEC - 8; text(title.toUpperCase(), L, yy, { size: 8.5, weight: 700, color: C.muted }); yy += 8; };
  section('Рабочее время');
  const s = r.sum;
  const cards = [
    ['Отработано', fmtDur(s.work, { short: true })],
    ['Норма месяца', fmtDur(s.normMin, { short: true })],
    s.overtime > 0 ? ['Переработка', fmtDur(s.overtime, { short: true })] : null,
    s.night > 0 ? ['Ночные', fmtDur(s.night, { short: true })] : null,
    s.holiday > 0 ? ['Праздничные', fmtDur(s.holiday, { short: true })] : null,
    tripsN ? ['Поездок', String(tripsN)] : null,
  ].filter(Boolean);
  const gap = 8; const cw = (W - gap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, value], i) => {
    const cx = L + i * (cw + gap);
    rect(cx, yy, cw, CARD, C.card, 8);
    text(label, cx + 10, yy + 15, { size: 8.5, color: C.muted });
    text(value, cx + 10, yy + 32, { size: 13.5, weight: 700, color: C.ink });
  });
  yy += CARD;

  // таблица строк
  const cols = [L + 10, R - 200, R - 130, R - 10]; // вид · часы · % · сумма (правые края у трёх последних)
  const base = rowH / 2 + rowFont * 0.36; // базовая линия текста по центру строки
  const table = (title, rows, total) => {
    section(title);
    rect(L, yy, W, HEAD, C.head, 6);
    for (const [t, x, align] of [['Вид', cols[0], 'left'], [rows.some((l) => l.days) ? 'Часы, дни' : 'Часы', cols[1], 'right'], ['%', cols[2], 'right'], ['Сумма', cols[3], 'right']]) {
      text(t, x, yy + 13.5, { size: 8.5, weight: 700, color: '#ffffff', align });
    }
    yy += HEAD;
    rows.forEach((l, i) => {
      if (i % 2) rect(L, yy, W, rowH, C.zebra);
      text(l.label, cols[0], yy + base, { size: rowFont });
      if (l.hours || l.days) text(l.days ? `${l.days} дн.` : fmtH(l.hours), cols[1], yy + base, { size: rowFont, color: C.muted, align: 'right' });
      if (l.pct) text(pct(l.pct), cols[2], yy + base, { size: rowFont, color: C.muted, align: 'right' });
      text(fmtRub(l.amount, true), cols[3], yy + base, { size: rowFont, weight: 600, align: 'right' });
      yy += rowH;
    });
    hline(yy, C.ink, L, R, 1);
    text(total[0], cols[0], yy + 15, { size: 10.5, weight: 700, color: C.ink });
    text(total[1], cols[3], yy + 15, { size: 10.5, weight: 700, color: C.ink, align: 'right' });
    yy += TOTAL;
  };
  table('Начислено', r.lines, ['Всего начислено', fmtRub(r.gross, true)]);
  if (r.deductions.length) table('Удержано', r.deductions, ['Всего удержано', fmtRub(r.deductions.reduce((a, x) => a + x.amount, 0), true)]);
  if (r.comp > 0) {
    text('Ком. расходы (без налога)', cols[0], yy + 14, { size: 10 });
    text(`+${fmtRub(r.comp, true)}`, cols[3], yy + 14, { size: 10, weight: 600, align: 'right' });
    yy += 20;
  }

  // на руки
  yy += 14;
  rect(L, yy, W, NET, '#fff0ef', 10);
  rect(L, yy, 5, NET, C.accent, 0);
  text('На руки', L + 18, yy + 22, { size: 12, weight: 700, color: C.ink });
  text('ориентировочно', L + 18, yy + 37, { size: 9, color: C.muted });
  text(`≈ ${fmtRub(r.net)}`, R - 16, yy + 34, { size: 22, weight: 800, color: C.ink, align: 'right' });
  yy += NET;

  // предупреждение
  yy += 14;
  rect(L, yy, W, nh, C.warnBg, 10);
  ctx.strokeStyle = C.warnLine; ctx.lineWidth = 1; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(L, yy, W, nh, 10); else ctx.rect(L, yy, W, nh);
  ctx.stroke();
  text('Расчёт ориентировочный, итог — по вашему расчётному листку.', L + 14, yy + 18, { size: 10.5, weight: 700, color: C.ink });
  lines.forEach((ln, i) => text(ln, L + 14, yy + 32 + i * 12, { size: 9.5, color: C.text }));

  // подвал
  hline(PAGE_H - 46);
  text('Сформировано в CABINA. Не является официальной системой ОАО «РЖД» и не заменяет расчётный листок', PAGE_W / 2, PAGE_H - 24, { size: 8.5, color: C.muted, align: 'center' });
}

// ---------------------------------------------------------------- сборка и выдача файла
export async function slipPdfBlob(y, m) {
  const d = slipData(y, m);
  if (!d) return null;
  try { await Promise.all(['400 10px Onest', '600 10px Onest', '700 10px Onest', '800 10px Onest'].map((f) => document.fonts.load(f))); } catch {}
  const cv = document.createElement('canvas');
  cv.width = Math.round(PAGE_W * K); cv.height = Math.round(PAGE_H * K);
  const ctx = cv.getContext('2d');
  ctx.scale(cv.width / PAGE_W, cv.height / PAGE_H);
  drawSlip(ctx, d);
  const jpegBlob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
  if (!jpegBlob) return null;
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = pdfFromJpeg(jpeg, cv.width, cv.height, { title: `CABINA — ${MONTHS[m - 1]} ${y}` });
  return new Blob([pdf], { type: 'application/pdf' });
}
export const slipFileName = (y, m) => `CABINA-kvitok-${y}-${String(m).padStart(2, '0')}.pdf`;

export async function exportSlip(y, m) {
  let blob;
  try { blob = await slipPdfBlob(y, m); } catch { blob = null; }
  if (!blob) { toast('Не удалось собрать PDF. Попробуйте ещё раз.', { error: true }); return; }
  const name = slipFileName(y, m);
  const file = new File([blob], name, { type: 'application/pdf' });
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Квиток CABINA: ${MONTHS[m - 1].toLowerCase()} ${y}` }); return; }
    catch (e) {
      if (e?.name === 'AbortError') return;
      // браузер не дал открыть «Поделиться» после подготовки файла — откроем его по отдельному нажатию
      if (e?.name === 'NotAllowedError') { readySheet(file, y, m); return; }
    }
  }
  const res = await saveToDevice(blob, name);
  if (res === 'saved') toast('Квиток сохранён в PDF');
  else if (res === 'failed') toast('Не удалось сохранить файл', { error: true });
}

function readySheet(file, y, m) {
  const el = openLayer(sheet({
    title: 'Квиток готов',
    body: `<p class="hint">PDF за ${MONTHS[m - 1].toLowerCase()} ${y} собран. Нажмите, чтобы сохранить его в «Файлы» или отправить.</p>`,
    foot: `<button class="btn btn-primary" data-act="slip-share">${I.share} Сохранить или отправить</button>`,
  }));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'slip-share') {
      try { await navigator.share({ files: [file], title: 'Квиток CABINA' }); closeLayer(el); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
    }
  });
}
