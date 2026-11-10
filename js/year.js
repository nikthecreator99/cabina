// «Мой год в CABINA» (2.21.10, просьба Никиты): 5–6 картинок-историй 1080×1920 об итогах года —
// часы, ночные, километры, любимый локомотив, награды и рекорды; внизу адрес сайта и QR-код на cabina-app.ru.
// Без сумм, имени, депо, станций и номеров локомотивов. Рисуется в телефоне, никуда не отправляется.
import { I, small, toast, openLayer, closeLayer, sheet, saveToDevice, plural, MONTHS, esc } from './ui.js';
import { S, statsOf, isPending, isLive, locosOf, normType, normNum, locoKey, legKm } from './store.js';
import { monthSummary, parseLocal, legsOf, fmtDur } from './calc.js';
import { computeAwards, AWARDS, TIER_NAMES, awardImg, awardColors } from './awards.js';
import { drawSky, fit, roundRect, loadFonts, DISPLAY, BODY } from './recap.js';
import { qrMatrix } from './share.js';
import { isGuest } from './auth.js';

export const SITE = 'https://cabina-app.ru/';
export const YEAR_MIN_TRIPS = 10; // плашка на главной — от 10 законченных поездок за год
const NAG_KEY = 'cabina-year-nag';
const W = 1080; const H = 1920;
const EARTH = 40075; const MSK_VLAD = 9288; const MSK_SPB = 650;

const fmtN = (n) => Math.round(n).toLocaleString('ru-RU');
const hours = (min) => Math.floor(min / 60);
const yearOf = (ms) => new Date(ms).getUTCFullYear();

// Какой год показывать: в декабре — текущий, в январе — прошедший, в остальное время — нет (только из статистики)
export function yearToShow(nowMs) {
  const d = new Date(nowMs);
  const m = d.getUTCMonth();
  if (m === 11) return d.getUTCFullYear();
  if (m === 0) return d.getUTCFullYear() - 1;
  return null;
}

// законченные поездки, начатые в году y
function doneIn(y) {
  return S.trips.filter((t) => !isPending(t) && !isLive(t) && t.end && Number.isFinite(parseLocal(t.end)) && yearOf(statsOf(t).start) === y && statsOf(t).work > 0);
}
export const yearTripCount = (y) => doneIn(y).length;

// Итоги года — только числа и серия любимого локомотива. Нет законченных поездок — null.
export function yearData(y) {
  const trips = doneIn(y);
  if (!trips.length) return null;
  let work = 0; let night = 0; let holiday = 0;
  let best = null;
  for (let m = 1; m <= 12; m++) {
    const s = monthSummary(y, m, S.trips, S.absences);
    work += s.work; night += s.night; holiday += s.holiday;
    if (s.work > 0 && (!best || s.work > best.min)) best = { m, min: s.work };
  }
  // километры — по маршруту каждого локомотива, манёвры не считаем (как в наградах)
  let km = 0;
  for (const t of trips) if (t.kind !== 'shunt') for (const l of legsOf(t)) km += legKm(l);
  // локомотивы: любимая серия (сколько поездок на ней) и сколько разных машин. Номер на картинку не попадает.
  const series = new Map(); const machines = new Set();
  for (const t of trips) {
    const seen = new Set();
    for (const l of locosOf(t)) {
      const k = normType(l.type);
      if (normNum(l.number)) machines.add(locoKey(l.type, l.number));
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const x = series.get(k) || { label: String(l.type).trim().slice(0, 20), n: 0 };
      x.n++; series.set(k, x);
    }
  }
  const fav = [...series.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ru'))[0] || null;
  const longest = trips.reduce((m, t) => (!m || statsOf(t).work > statsOf(m).work ? t : m), null);
  const nightTrips = trips.filter((t) => statsOf(t).night > 0).length;
  // награды года: ступени, полученные в этом году, и повторяемые — сколько раз за год
  const endY = parseLocal(`${y + 1}-01-01T00:00`); const startY = parseLocal(`${y}-01-01T00:00`);
  const upTo = (ms) => S.trips.filter((t) => t.end && Number.isFinite(parseLocal(t.end)) && parseLocal(t.end) < ms);
  const after = computeAwards(upTo(endY)).aw;
  const before = computeAwards(upTo(startY)).aw;
  const awards = [];
  for (const a of AWARDS) {
    if (a.repeat) {
      const n = after[a.id].n - before[a.id].n;
      if (n > 0) awards.push({ a, tier: 1, n });
    } else {
      // одна строка на награду — высшая ступень, полученная в этом году
      const tiers = after[a.id].days.map((d, i) => (d && d.startsWith(`${y}-`) ? i + 1 : 0)).filter(Boolean);
      if (tiers.length) awards.push({ a, tier: Math.max(...tiers) });
    }
  }
  // сначала высшие ступени, потом особые, потом повторяемые
  const rank = (x) => (x.a.repeat ? 0 : x.a.goals.length > 1 ? x.tier : 1.5);
  awards.sort((p, q) => rank(q) - rank(p));
  return {
    y, trips: trips.length, work, night, holiday, km, nightTrips,
    days: work / (24 * 60), avg: work / trips.length,
    fav, machines: machines.size,
    longest: longest ? statsOf(longest).work : 0,
    best, awards,
  };
}

// сравнение пути с понятными расстояниями
export function kmCompare(km) {
  if (km >= EARTH && km < EARTH * 2) return 'больше, чем вокруг Земли';
  if (km >= EARTH) { const k = Math.floor((km / EARTH) * 10) / 10; return `${String(k).replace('.', ',')} ${plural(Math.floor(k), 'раз', 'раза', 'раз')} вокруг Земли`; }
  if (km >= MSK_VLAD) return 'дальше, чем от Москвы до Владивостока';
  if (km >= MSK_SPB * 2) { const n = Math.floor(km / MSK_SPB); return `${n} ${plural(n, 'раз', 'раза', 'раз')} от Москвы до Петербурга`; }
  return '';
}

// Слайды: каждый — { kind, ... }. Пустые не делаем.
export function yearSlides(d) {
  if (!d) return [];
  const s = [];
  s.push({ kind: 'hours', big: `${fmtN(hours(d.work))} ч`, label: 'в кабине и в пути', lines: [
    `${fmtN(d.trips)} ${plural(d.trips, 'поездка', 'поездки', 'поездок')}`,
    d.days >= 1 ? `это ${fmtN(Math.floor(d.days))} ${plural(Math.floor(d.days), 'сутки', 'суток', 'суток')} работы` : '',
    `в среднем ${fmtDur(d.avg, { short: true })} за поездку`,
  ].filter(Boolean) });
  if (d.night > 0) {
    const pct = Math.round((d.night / Math.max(1, d.work)) * 100);
    s.push({ kind: 'night', big: `${fmtN(hours(d.night))} ч`, label: 'ночью, с 22:00 до 6:00', lines: [
      `${pct}% всего времени`,
      `${fmtN(d.nightTrips)} ${plural(d.nightTrips, 'поездка', 'поездки', 'поездок')} захватили ночь`,
      d.holiday >= 60 ? `и ещё ${fmtN(hours(d.holiday))} ч в праздники` : '',
    ].filter(Boolean) });
  }
  if (d.km >= 1) s.push({ kind: 'km', big: `${fmtN(d.km)} км`, label: 'пройдено за год', lines: [kmCompare(d.km)].filter(Boolean) });
  if (d.fav) {
    s.push({ kind: 'loco', big: d.fav.label, label: 'любимая серия', lines: [
      `${fmtN(d.fav.n)} ${plural(d.fav.n, 'поездка', 'поездки', 'поездок')} на ней`,
      d.machines > 1 ? `всего ${fmtN(d.machines)} разных ${plural(d.machines, 'локомотив', 'локомотива', 'локомотивов')}` : '',
    ].filter(Boolean) });
  }
  // гость (2.26): награды — с аккаунтом, картинку с ними не рисуем
  if (d.awards.length && !isGuest()) s.push({ kind: 'awards', awards: d.awards.slice(0, 6), more: Math.max(0, d.awards.length - 6), total: d.awards.length });
  const rec = [];
  if (d.longest) rec.push(['Самая долгая поездка', fmtDur(d.longest, { short: true })]);
  if (d.best) rec.push([`Лучший месяц — ${MONTHS[d.best.m - 1].toLowerCase()}`, `${fmtN(hours(d.best.min))} ч`]);
  s.push({ kind: 'end', rec });
  return s;
}

// ---------------------------------------------------------------- рисование
const L = 90;
function header(ctx, y, n, total) {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#ff4d5e'; roundRect(ctx, L, 120, 14, 46, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 46px ${DISPLAY}`; ctx.fillText('CABINA', L + 34, 164);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `600 34px ${BODY}`;
  ctx.fillText(`Мой ${y} год`, W - L, 162);
  // полоски «историй»: какая это картинка из скольких
  const gap = 10; const w = (W - 2 * L - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) { ctx.fillStyle = i <= n ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.22)'; roundRect(ctx, L + i * (w + gap), 70, w, 8, 4); ctx.fill(); }
  ctx.textAlign = 'left';
}
function footer(ctx) {
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 40px ${BODY}`;
  ctx.fillText('cabina-app.ru', W / 2, H - 130);
  ctx.textAlign = 'left';
}
const TITLES = { hours: 'Отработано', night: 'Ночная смена', km: 'Путь', loco: 'Любимый локомотив', awards: 'Награды года', end: 'Спасибо за год!' };

function bigSlide(ctx, s) {
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 54px ${BODY}`; ctx.fillText(TITLES[s.kind], L, 420);
  ctx.fillStyle = '#fff'; fit(ctx, s.big, 190, 800, DISPLAY, W - 2 * L); ctx.fillText(s.big, L, 860);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; fit(ctx, s.label, 52, 500, BODY, W - 2 * L); ctx.fillText(s.label, L, 950);
  s.lines.forEach((t, i) => {
    const y = 1080 + i * 150;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; roundRect(ctx, L, y, W - 2 * L, 120, 30); ctx.fill();
    ctx.fillStyle = '#fff'; fit(ctx, t, 46, 600, BODY, W - 2 * L - 80); ctx.fillText(t, L + 40, y + 76);
  });
}

function loadImg(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
async function awardsSlide(ctx, s) {
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 54px ${BODY}`; ctx.fillText(TITLES.awards, L, 420);
  ctx.fillStyle = '#fff'; fit(ctx, String(s.total), 190, 800, DISPLAY, W - 2 * L); ctx.fillText(String(s.total), L, 640);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 52px ${BODY}`;
  ctx.fillText(plural(s.total, 'новая награда', 'новые награды', 'новых наград'), L, 730);
  const imgs = await Promise.all(s.awards.map((x) => loadImg(awardImg(x.a, x.tier - 1))));
  const cw = (W - 2 * L - 40) / 2; const ch = 270;
  s.awards.forEach((x, i) => {
    const cx = L + (i % 2) * (cw + 40); const cy = 790 + Math.floor(i / 2) * (ch + 26);
    ctx.fillStyle = 'rgba(255,255,255,.09)'; roundRect(ctx, cx, cy, cw, ch, 32); ctx.fill();
    const [fill, rim] = awardColors(x.a, x.tier);
    const mx = cx + cw / 2; const my = cy + 100; const r = 74;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 8; ctx.stroke();
    if (imgs[i]) ctx.drawImage(imgs[i], mx - 54, my - 54, 108, 108);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    fit(ctx, x.a.name, 34, 700, BODY, cw - 40); ctx.fillText(x.a.name, mx, cy + 216);
    const sub = x.a.repeat ? `×${x.n}` : x.a.goals.length > 1 ? TIER_NAMES[x.tier - 1] : 'особая';
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `500 30px ${BODY}`; ctx.fillText(sub, mx, cy + 254);
    ctx.textAlign = 'left';
  });
  if (s.more) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 40px ${BODY}`; ctx.textAlign = 'center'; ctx.fillText(`и ещё ${s.more}`, W / 2, 790 + 3 * (ch + 26) + 40); ctx.textAlign = 'left'; }
}

async function endSlide(ctx, s, y) {
  ctx.fillStyle = '#fff'; fit(ctx, TITLES.end, 88, 800, DISPLAY, W - 2 * L); ctx.fillText(TITLES.end, L, 430);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `500 44px ${BODY}`; ctx.fillText(`Рекорды ${y} года`, L, 520);
  s.rec.forEach(([label, v], i) => {
    const ty = 580 + i * 190;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; roundRect(ctx, L, ty, W - 2 * L, 160, 32); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; fit(ctx, label, 36, 500, BODY, W - 2 * L - 80); ctx.fillText(label, L + 40, ty + 60);
    ctx.fillStyle = '#fff'; fit(ctx, v, 60, 800, BODY, W - 2 * L - 80); ctx.fillText(v, L + 40, ty + 130);
  });
  // QR-код на сайт
  const m = await qrMatrix(SITE);
  const size = 380; const qx = (W - size) / 2; const qy = 1070;
  ctx.fillStyle = '#fff'; roundRect(ctx, qx - 60, qy - 60, size + 120, size + 120, 36); ctx.fill();
  if (m) {
    const cell = size / m.n;
    ctx.fillStyle = '#000';
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) ctx.fillRect(qx + c * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
  }
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `500 38px ${BODY}`;
  ctx.fillText('Считайте часы вместе с CABINA', W / 2, qy + size + 140);
  ctx.textAlign = 'left';
}

export async function slideBlob(s, i, total, y) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  drawSky(ctx, H);
  header(ctx, y, i, total);
  if (s.kind === 'awards') await awardsSlide(ctx, s);
  else if (s.kind === 'end') await endSlide(ctx, s, y);
  else bigSlide(ctx, s);
  footer(ctx);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

// ---------------------------------------------------------------- окно
export async function openYear(y) {
  const slides = yearSlides(yearData(y));
  if (!slides.length) { toast(`В ${y} году законченных поездок нет`); return; }
  await loadFonts();
  let blobs;
  try { blobs = await Promise.all(slides.map((s, i) => slideBlob(s, i, slides.length, y))); } catch { blobs = null; }
  if (!blobs || blobs.some((b) => !b)) { toast('Не удалось нарисовать картинки', { error: true }); return; }
  const files = blobs.map((b, i) => new File([b], `CABINA-${y}-${i + 1}.png`, { type: 'image/png' }));
  const urls = blobs.map((b) => URL.createObjectURL(b));
  const canShare = !!navigator.canShare?.({ files });
  const el = openLayer(sheet({
    title: `Мой ${y} год в CABINA`,
    body: `<div class="year-strip" id="year-strip">${urls.map((u, i) => `<figure class="year-card"><img class="year-img" src="${u}" alt="${esc(TITLES[slides[i].kind])}" width="${W}" height="${H}">
        <button class="btn btn-ghost btn-sm" data-act="year-one" data-i="${i}">${small(I.download, 16)} Сохранить</button></figure>`).join('')}</div>
      <div class="hint">${slides.length} ${plural(slides.length, 'картинка', 'картинки', 'картинок')} — листайте вбок. Без сумм, имени, депо, станций и номеров локомотивов.</div>`,
    foot: `${canShare ? `<button class="btn btn-primary" data-act="year-share">${I.share} Поделиться</button>` : ''}
      <button class="btn ${canShare ? 'btn-ghost' : 'btn-primary'}" data-act="year-save">${small(I.download, 18)} Сохранить все</button>`,
  }), { onClose: () => setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1000) });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'year-share') {
      try { await navigator.share({ files, title: `Мой ${y} год в CABINA` }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
    } else if (b.dataset.act === 'year-one') {
      const i = +b.dataset.i;
      const r = await saveToDevice(blobs[i], files[i].name);
      if (r === 'saved') toast('Картинка сохранена'); else if (r === 'failed') toast('Не удалось сохранить файл', { error: true });
    } else if (b.dataset.act === 'year-save') {
      let ok = 0;
      for (let i = 0; i < blobs.length; i++) {
        const r = await saveToDevice(blobs[i], files[i].name);
        if (r === 'saved') ok++; else if (r === 'declined') break;
        await new Promise((res) => setTimeout(res, 350)); // браузер не любит много скачиваний разом
      }
      if (ok) toast(ok === blobs.length ? 'Картинки сохранены' : `Сохранено ${ok} из ${blobs.length}`);
      else toast('Не удалось сохранить файлы', { error: true });
    }
  });
}

// ---------------------------------------------------------------- плашка на главной (декабрь и январь)
function nagState() { try { return JSON.parse(localStorage.getItem(NAG_KEY) || '{}') || {}; } catch { return {}; } }
export function yearNagHtml(nowMs) {
  const y = yearToShow(nowMs);
  if (y == null || nagState()[y] || yearTripCount(y) < YEAR_MIN_TRIPS) return '';
  return `<div class="loyal-banner year-banner" role="status" id="year-nag"><button class="grow" data-act="year-open" data-y="${y}"><span class="ico">${I.medal}</span>
    <span class="txt"><b>Мой ${y} год в CABINA</b><small>Итоги года картинками — часы, ночные, километры, награды</small></span></button>
    <button class="icon-btn" data-act="year-hide" data-y="${y}" aria-label="Скрыть «Мой год»">${small(I.x, 18)}</button></div>`;
}
export function yearClick(act, b, ctx) {
  if (act === 'year-open') { openYear(+b.dataset.y); return true; }
  if (act === 'year-hide') {
    try { localStorage.setItem(NAG_KEY, JSON.stringify({ ...nagState(), [b.dataset.y]: 1 })); } catch {}
    toast('Скрыли. Итоги года — в «Статистике» за год');
    ctx.rerender();
    return true;
  }
  return false;
}
