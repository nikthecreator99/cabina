// «Статистика роста» в PDF (2.32.2, просьба Никиты 14.11.2026): одна страница A4 рисуется на холсте и вкладывается в PDF
// картинкой — как квиток (slip.js), без библиотек и без отправки куда-либо: файл собирается в телефоне администратора.
// В файле только числа (без почты, имён и идентификаторов).
import { pdfFromJpeg, deliverPdf } from './slip.js';
import { growthModel, spanText, PLATFORM_NAMES, num } from './growth-data.js';

const PAGE_W = 595.28; const PAGE_H = 841.89;
const K = 2.5;
const C = { ink: '#0b1020', text: '#1d2333', muted: '#6b7386', line: '#dfe3ec', card: '#f3f5f9', accent: '#e53935', accent2: '#ff8a65', prev: '#8a93a8', good: '#1f9d63', bad: '#d93a3a', bar: '#e9edf4' };
const FONT = "'Onest', 'Segoe UI', Roboto, Arial, sans-serif";
const fmtN = (v) => (v == null ? '—' : String(Math.round(num(v) * 10) / 10).replace('.', ','));
const plural = (n, a, b, c) => { const x = Math.abs(n) % 100; const y = x % 10; return x > 10 && x < 20 ? c : y === 1 ? a : y >= 2 && y <= 4 ? b : c; };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const font = (ctx, w, s) => { ctx.font = `${w} ${s}px ${FONT}`; };
function text(ctx, s, x, y, { w = 400, size = 10, color = C.text, align = 'left', max } = {}) {
  font(ctx, w, size); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  let t = String(s);
  if (max) while (t.length > 1 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
  ctx.fillText(t, x, y);
  return ctx.measureText(t).width;
}
function deltaText(t) {
  if (!t.dl) return null;
  const { d, pct } = t.dl;
  const good = d === 0 ? null : (d > 0) !== t.bad;
  const s = d === 0 ? '= так же' : `${d > 0 ? '▲ +' : '▼ −'}${fmtN(Math.abs(d))}${pct != null ? ` (${pct > 0 ? '+' : '−'}${Math.abs(pct)}%)` : ''}`;
  return { s, color: good == null ? C.muted : good ? C.good : C.bad };
}

function chart(ctx, x, y, w, h, { title, buckets, cur, prev, kind }) {
  rr(ctx, x, y, w, h, 10); ctx.fillStyle = C.card; ctx.fill();
  text(ctx, title, x + 12, y + 18, { w: 700, size: 10.5, color: C.ink });
  const px = x + 12; const pw = w - 24; const top = y + 34; const base = y + h - 18;
  const n = buckets.length || 1;
  const vals = [...cur, ...(prev || [])].filter((v) => v != null);
  const max = Math.max(1, ...vals);
  const bw = pw / n; const cx = (i) => px + i * bw + bw / 2; const yy = (v) => base - (v / max) * (base - top);
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px + pw, base); ctx.stroke();
  text(ctx, fmtN(max), px, top - 4, { size: 7, color: C.muted });
  if (kind === 'bar') {
    ctx.fillStyle = C.accent;
    cur.forEach((v, i) => { if (v > 0) { const bh = Math.max(1.5, base - yy(v)); const bwid = Math.min(26, Math.max(1, bw - (n > 20 ? 1.2 : 4))); rr(ctx, cx(i) - bwid / 2, base - bh, bwid, bh, Math.min(2, bwid / 2, bh)); ctx.fill(); } });
  } else {
    const pts = cur.map((v, i) => (v == null ? null : [cx(i), yy(v)]));
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    let open = false; ctx.beginPath();
    for (const p of pts) { if (!p) { open = false; continue; } if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; } }
    ctx.stroke();
    ctx.fillStyle = C.accent;
    if (pts.filter(Boolean).length === 1) { const p = pts.find(Boolean); ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  if (prev && prev.some((v) => v != null)) {
    ctx.strokeStyle = C.prev; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2.5]); ctx.beginPath(); let open = false;
    prev.slice(0, n).forEach((v, i) => { if (v == null) { open = false; return; } if (open) ctx.lineTo(cx(i), yy(v)); else { ctx.moveTo(cx(i), yy(v)); open = true; } });
    ctx.stroke(); ctx.setLineDash([]);
  }
  const step = Math.ceil(n / (w > 300 ? 12 : 6));
  buckets.forEach((b, i) => { if (i % step === 0) text(ctx, b.label, cx(i), base + 10, { size: 6.5, color: C.muted, align: 'center' }); });
}

export function drawGrowth(ctx, data, range, { made = new Date() } = {}) {
  const M = growthModel(data, { ...range, from: range.from || data.firstDay });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const L = 36; const R = PAGE_W - 36; const W = R - L;
  // шапка
  text(ctx, 'CABINA', L, 46, { w: 800, size: 11, color: C.accent });
  text(ctx, 'Статистика роста', L, 72, { w: 800, size: 22, color: C.ink });
  const span = range.period === 'all' ? `Всё время: с ${spanText(M.from, M.from)} по ${spanText(M.to, M.to)}` : `${range.title}: ${spanText(M.from, M.to)}`;
  text(ctx, span, L, 90, { w: 600, size: 10.5, color: C.text });
  text(ctx, M.hasPrev ? `Сравнение: ${range.prevText}${range.partial ? ' (столько же дней от начала)' : ''}` : 'Без сравнения', L, 104, { size: 9, color: C.muted });
  const d2 = (n) => String(n).padStart(2, '0');
  text(ctx, `Сформировано ${d2(made.getDate())}.${d2(made.getMonth() + 1)}.${made.getFullYear()}`, R, 46, { size: 8.5, color: C.muted, align: 'right' });
  // сейчас
  let y = 118;
  rr(ctx, L, y, W, 48, 12); ctx.fillStyle = C.ink; ctx.fill();
  text(ctx, fmtN(data.now.total), L + 16, y + 33, { w: 800, size: 26, color: '#ffffff' });
  const tw = (() => { font(ctx, 800, 26); return ctx.measureText(fmtN(data.now.total)).width; })();
  text(ctx, `${plural(num(data.now.total), 'аккаунт', 'аккаунта', 'аккаунтов')} сейчас`, L + 22 + tw, y + 31, { w: 600, size: 10, color: '#c9d0e0' });
  const sub = [['сегодня', data.now.active_1], ['за 7 дней', data.now.active_7], ['за 30 дней', data.now.active_30]];
  sub.forEach(([l, v], i) => {
    const x = R - 16 - (2 - i) * 78;
    text(ctx, fmtN(v), x, y + 24, { w: 800, size: 14, color: '#ffffff', align: 'right' });
    text(ctx, `заходили ${l}`, x, y + 38, { size: 7.5, color: '#c9d0e0', align: 'right' });
  });
  // плитки
  y += 58;
  const tW = (W - 16) / 3; const tH = 56;
  M.tiles.forEach((t, i) => {
    const x = L + (i % 3) * (tW + 8); const ty = y + Math.floor(i / 3) * (tH + 8);
    rr(ctx, x, ty, tW, tH, 10); ctx.fillStyle = C.card; ctx.fill();
    text(ctx, fmtN(t.v), x + 12, ty + 22, { w: 800, size: 17, color: C.ink });
    text(ctx, t.label, x + 12, ty + 35, { size: 8, color: C.muted, max: tW - 24 });
    const dt = deltaText(t);
    if (dt) text(ctx, `${dt.s} · было ${fmtN(t.p)}`, x + 12, ty + 48, { w: 700, size: 8, color: dt.color, max: tW - 24 });
  });
  y += tH * 2 + 8 + 10;
  // графики
  chart(ctx, L, y, W, 112, { title: 'Регистрации', buckets: M.buckets, cur: M.signups.cur, prev: M.signups.prev, kind: 'bar' });
  y += 120;
  const hW = (W - 10) / 2;
  chart(ctx, L, y, hW, 104, { title: 'Заходят в день, в среднем', buckets: M.buckets, cur: M.active.cur, prev: M.active.prev, kind: 'line' });
  chart(ctx, L + hW + 10, y, hW, 104, { title: 'Всего аккаунтов', buckets: M.buckets, cur: M.total, kind: 'line' });
  y += 112;
  if (M.hasPrev) {
    ctx.fillStyle = C.accent; ctx.fillRect(L, y + 1, 12, 3);
    text(ctx, 'этот период', L + 16, y + 6, { size: 7.5, color: C.muted });
    ctx.strokeStyle = C.prev; ctx.setLineDash([3, 2.5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(L + 74, y + 2.5); ctx.lineTo(L + 88, y + 2.5); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, range.prevText, L + 92, y + 6, { size: 7.5, color: C.muted });
  }
  if (M.sinceLate || !M.active.any) text(ctx, `Заходы по дням считаются с ${spanText(data.since || data.today, data.since || data.today)}.`, R, y + 6, { size: 7.5, color: C.muted, align: 'right' });
  y += 16;
  // остаются
  rr(ctx, L, y, W, 66, 10); ctx.fillStyle = C.card; ctx.fill();
  text(ctx, `Остаются — из ${M.ret.n} ${plural(M.ret.n, 'зарегистрировавшегося', 'зарегистрировавшихся', 'зарегистрировавшихся')} за период (примерно)`, L + 12, y + 17, { w: 700, size: 10.5, color: C.ink, max: W - 24 });
  [['Заходят и через неделю', M.ret.w, M.ret.pw], ['Заходят и через месяц', M.ret.m, M.ret.pm]].forEach(([l, x, px], i) => {
    const bx = L + 12 + i * (hW + 5); const bw = hW - 24;
    text(ctx, l, bx, y + 34, { size: 8.5, color: C.text });
    text(ctx, x ? `${x.pct}%` : '—', bx + bw, y + 34, { w: 800, size: 11, color: C.ink, align: 'right' });
    rr(ctx, bx, y + 40, bw, 6, 3); ctx.fillStyle = C.bar; ctx.fill();
    if (x) { rr(ctx, bx, y + 40, Math.max(3, (bw * x.pct) / 100), 6, 3); ctx.fillStyle = C.accent; ctx.fill(); }
    text(ctx, x ? `${x.back} из ${x.age}${px ? ` · раньше ${px.pct}%` : ''}` : 'пока рано', bx, y + 58, { size: 7.5, color: C.muted });
  });
  y += 76;
  // чем пользуются
  const rows = M.usage;
  const uH = 18 + Math.ceil(rows.length / 2) * 22 + 6;
  rr(ctx, L, y, W, uH, 10); ctx.fillStyle = C.card; ctx.fill();
  text(ctx, `Чем пользуются сейчас · пар «коллеги»: ${fmtN(data.now.links)} · групп: ${fmtN(data.now.groups)}`, L + 12, y + 17, { w: 700, size: 10.5, color: C.ink, max: W - 24 });
  rows.forEach((u, i) => {
    const bx = L + 12 + (i % 2) * (hW + 5); const by = y + 32 + Math.floor(i / 2) * 22; const bw = hW - 24;
    text(ctx, u.label, bx, by, { size: 8, color: C.text, max: bw - 60 });
    text(ctx, `${fmtN(u.v)} · ${u.pct}%`, bx + bw, by, { w: 700, size: 8, color: C.ink, align: 'right' });
    rr(ctx, bx, by + 4, bw, 5, 2.5); ctx.fillStyle = C.bar; ctx.fill();
    if (u.v) { rr(ctx, bx, by + 4, Math.max(3, (bw * u.pct) / 100), 5, 2.5); ctx.fillStyle = C.accent2; ctx.fill(); }
  });
  y += uH + 10;
  // устройства и версии — строкой
  const plat = Object.entries(data.now.platforms).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${PLATFORM_NAMES[k] || k} ${v}`).join(' · ');
  const vers = Object.entries(data.now.versions).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k === 'unknown' ? '?' : k} — ${v}`).join(' · ');
  if (plat) text(ctx, `Устройства: ${plat}`, L, y + 6, { size: 8.5, color: C.text, max: W });
  if (vers) text(ctx, `Версии: ${vers}`, L, y + 20, { size: 8.5, color: C.text, max: W });
  // подвал
  ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(L, PAGE_H - 46); ctx.lineTo(R, PAGE_H - 46); ctx.stroke();
  text(ctx, 'Только числа с сервера CABINA в России: без почты, имён и идентификаторов людей. Для администратора.', L, PAGE_H - 32, { size: 8, color: C.muted, max: W });
  text(ctx, '«Остаются» — примерно: сервер помнит только день регистрации и день последнего захода.', L, PAGE_H - 20, { size: 8, color: C.muted, max: W });
}

export async function growthPdfBlob(data, range) {
  try { await Promise.all(['400 10px Onest', '600 10px Onest', '700 10px Onest', '800 10px Onest'].map((f) => document.fonts.load(f))); } catch {}
  const cv = document.createElement('canvas');
  cv.width = Math.round(PAGE_W * K); cv.height = Math.round(PAGE_H * K);
  const ctx = cv.getContext('2d');
  ctx.scale(cv.width / PAGE_W, cv.height / PAGE_H);
  drawGrowth(ctx, data, range);
  const jpegBlob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
  if (!jpegBlob) return null;
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  return new Blob([pdfFromJpeg(jpeg, cv.width, cv.height, { title: `CABINA — статистика роста, ${range.title}` })], { type: 'application/pdf' });
}
export function growthFileName(range, today) {
  if (range.period === 'all') return `CABINA-rost-vse-${today}.pdf`;
  const y = range.from.slice(0, 4); const m = +range.from.slice(5, 7);
  const tail = range.period === 'year' ? '' : range.period === 'quarter' ? `-q${Math.floor((m - 1) / 3) + 1}` : `-${String(m).padStart(2, '0')}`;
  return `CABINA-rost-${y}${tail}.pdf`;
}

export async function exportGrowthPdf(data, range) {
  const blob = await growthPdfBlob(data, range);
  if (!blob) throw new Error('pdf');
  await deliverPdf(blob, growthFileName(range, data.today), {
    shareTitle: `Статистика роста CABINA: ${range.title}`, savedText: 'Статистика сохранена в PDF',
    readyTitle: 'PDF готов', readyText: `Статистика роста (${range.title.toLowerCase()}) собрана.`,
  });
}
