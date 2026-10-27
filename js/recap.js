// «Итоги картинкой»: аккуратная картинка с итогами периода, чтобы сохранить или отправить.
// На картинке только часы, поездки и техника — без сумм, имени, депо и станций. Рисуется в телефоне, никуда не отправляется.
import { I, small, toast, openLayer, closeLayer, sheet, saveToDevice } from './ui.js';

const W = 1080; const H = 1350;
const DISPLAY = "'Unbounded', 'Arial Black', sans-serif";
const BODY = "'Onest', 'Segoe UI', Roboto, Arial, sans-serif";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// подогнать размер шрифта под ширину
function fit(ctx, text, size, weight, fam, maxW) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${fam}`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 12);
}

// небо как на иконке: ночь сверху, закат у горизонта, лес и рельсы
function drawSky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070a16'); g.addColorStop(0.45, '#151b3d'); g.addColorStop(0.72, '#4a2f5e'); g.addColorStop(0.86, '#c9665a'); g.addColorStop(1, '#f2a46b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // звёзды — всегда одни и те же
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W; const y = rnd() * H * 0.5; const r = rnd() * 1.8 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.4})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // солнце у горизонта
  const sun = ctx.createRadialGradient(W * 0.72, H * 0.93, 10, W * 0.72, H * 0.93, 420);
  sun.addColorStop(0, 'rgba(255,230,170,.85)'); sun.addColorStop(0.25, 'rgba(255,180,110,.35)'); sun.addColorStop(1, 'rgba(255,150,100,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, H * 0.5, W, H * 0.5);
  // лес
  ctx.fillStyle = '#0c1022';
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 36) {
    const h = 40 + ((x * 37) % 80);
    ctx.lineTo(x, H - 50); ctx.lineTo(x + 18, H - 50 - h); ctx.lineTo(x + 36, H - 50);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.fillRect(0, H - 52, W, 52);
  // рельсы
  ctx.strokeStyle = 'rgba(255,208,138,.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, H - 34); ctx.lineTo(W, H - 34); ctx.moveTo(0, H - 22); ctx.lineTo(W, H - 22); ctx.stroke();
}

function drawRecap(ctx, d) {
  drawSky(ctx);
  const L = 80;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // шапка
  ctx.fillStyle = '#ff4d5e'; roundRect(ctx, L, 92, 14, 44, 7); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = `800 44px ${DISPLAY}`; ctx.fillText('CABINA', L + 34, 134);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 30px ${BODY}`; ctx.textAlign = 'right'; ctx.fillText('Мои итоги', W - L, 132); ctx.textAlign = 'left';
  // период и часы
  ctx.fillStyle = 'rgba(255,255,255,.75)'; fit(ctx, d.title, 46, 600, BODY, W - 2 * L); ctx.fillText(d.title, L, 250);
  ctx.fillStyle = '#ffffff'; fit(ctx, d.work, 150, 800, DISPLAY, W - 2 * L); ctx.fillText(d.work, L, 410);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 34px ${BODY}`;
  ctx.fillText(d.norm != null ? `отработано · ${d.norm}% нормы` : 'отработано', L, 468);
  // плитки 2 × 3
  const gap = 24; const cw = (W - 2 * L - gap) / 2; const ch = 168; const top = 520;
  d.tiles.forEach(([label, value, sub], i) => {
    const x = L + (i % 2) * (cw + gap); const y = top + Math.floor(i / 2) * (ch + gap);
    ctx.fillStyle = 'rgba(255,255,255,.09)'; roundRect(ctx, x, y, cw, ch, 28); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.65)'; fit(ctx, label, 27, 500, BODY, cw - 56); ctx.fillText(label, x + 28, y + 50);
    ctx.fillStyle = '#ffffff'; fit(ctx, value, 52, 800, BODY, cw - 56); ctx.fillText(value, x + 28, y + (sub ? 112 : 124));
    if (sub) { ctx.fillStyle = 'rgba(255,255,255,.6)'; fit(ctx, sub, 24, 500, BODY, cw - 56); ctx.fillText(sub, x + 28, y + 148); }
  });
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `500 26px ${BODY}`;
  ctx.fillText('Личный учёт поездок для локомотивных бригад', L, H - 200);
}

export async function recapBlob(d) {
  try { await Promise.all(['500 10px Onest', '600 10px Onest', '800 10px Onest', '800 10px Unbounded'].map((f) => document.fonts.load(f))); } catch {}
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  drawRecap(cv.getContext('2d'), d);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export async function openRecap(d) {
  let blob;
  try { blob = await recapBlob(d); } catch { blob = null; }
  if (!blob) { toast('Не удалось нарисовать картинку', { error: true }); return; }
  const file = new File([blob], d.file, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const canShare = !!navigator.canShare?.({ files: [file] });
  const el = openLayer(sheet({
    title: 'Итоги картинкой',
    body: `<img class="recap-img" src="${url}" alt="Итоги: ${d.title}" width="${W}" height="${H}">
      <div class="hint">Без сумм, имени, депо и станций.</div>`,
    foot: `${canShare ? `<button class="btn btn-primary" data-act="recap-share">${I.share} Поделиться</button>` : ''}
      <button class="btn ${canShare ? 'btn-ghost' : 'btn-primary'}" data-act="recap-save">${small(I.download, 18)} Сохранить</button>`,
  }), { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'recap-share') {
      try { await navigator.share({ files: [file], title: `Итоги CABINA: ${d.title}` }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
    } else if (b.dataset.act === 'recap-save') {
      const r = await saveToDevice(blob, d.file);
      if (r === 'saved') toast('Картинка сохранена');
      else if (r === 'failed') toast('Не удалось сохранить файл', { error: true });
    }
  });
}
