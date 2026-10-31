// Поездки напарнику (2.19, просьба Никиты): машинист и помощник ездят вместе, и одному не нужно вводить то же самое.
// Поездки передаются с телефона на телефон — QR-кодом на экране или ссылкой, — наш сервер их не видит:
// данные стоят в ссылке после «#», а эту часть браузер на сервер не отправляет.
// Уходит: время явки и окончания, маршрут и расстояние, вид движения, локомотив, вес/оси/длина, номер маршрута,
// следование пассажиром и ожидание, вид отдыха. Не уходит: заработок, заметки, выбор «на очередь / выходной», отвлечения, профиль.
// Всё полученное — непроверенные данные: строгая проверка, новые id, человек сам выбирает, что добавить.
import { S, saveTrip, saveRoute, statsOf, isLive, nowLocal } from './store.js';
import { parseLocal, fmtLocal, MIN, validateTrip, fmtDur } from './calc.js';
import { routeEnds, stationKey } from './rest.js';
import { awardSnapshot, awardNews, celebrate } from './awards.js';
import { I, esc, uid, openLayer, closeLayer, sheet, toast, plural, dayMonth, hm, WD } from './ui.js';

export const SHARE_MAX = 40; // поездок за один раз
const CODE_MAX = 8000; // длина кода в ссылке
const JSON_MAX = 64 * 1024; // распакованные данные
const DAY_MIN = 24 * 60;
const KINDS = { passenger: 'p', reserve: 'r', shunt: 's' };
const KIND_BACK = { p: 'passenger', r: 'reserve', s: 'shunt' };

// ---- упаковка ----
const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
async function pipe(bytes, stream, max) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { reader.cancel().catch(() => {}); throw new Error('too big'); }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

const mins = (s) => Math.round(parseLocal(s) / MIN);
const iv = (list, s0) => (list || []).map((p) => [mins(p.start) - s0, mins(p.end) - mins(p.start)]).filter(([o, d]) => Number.isFinite(o) && d > 0);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined; };

// Поездка → короткая запись (минуты от общей точки отсчёта)
function packTrip(t, base) {
  const s = mins(t.start); const e = mins(t.end);
  const ends = routeEnds(t);
  const r = t.routeId && S.routes.find((x) => x.id === t.routeId);
  const x = { a: s - base, d: e - s };
  if (ends) { x.f = ends.from; x.to = ends.to; }
  if (num(r?.distanceKm)) x.km = num(r.distanceKm);
  if (KINDS[t.kind]) x.k = KINDS[t.kind];
  if (t.locoType) x.lt = String(t.locoType);
  if (t.locoNumber) x.ln = String(t.locoNumber);
  if (num(t.weight)) x.w = num(t.weight);
  if (num(t.axles)) x.ax = num(t.axles);
  if (num(t.length)) x.l = num(t.length);
  if (t.routeNo) x.rn = String(t.routeNo);
  if (t.restType === 'home') x.r = 'h'; else if (t.restType === 'turnaround') x.r = 't';
  const p = iv(t.passenger, s); if (p.length) x.p = p;
  const w = iv(t.waiting, s); if (w.length) x.wt = w;
  return x;
}
// Можно отправить только законченную поездку
export const shareable = (t) => !!t && !!t.end && !isLive(t) && Number.isFinite(parseLocal(t.end)) && parseLocal(t.end) > parseLocal(t.start);

export async function encodeTrips(trips) {
  const list = trips.filter(shareable).sort((a, b) => parseLocal(a.start) - parseLocal(b.start)).slice(0, SHARE_MAX);
  if (!list.length) throw new Error('empty');
  const base = mins(list[0].start);
  const json = JSON.stringify({ v: 1, b: base, t: list.map((t) => packTrip(t, base)) });
  const raw = new TextEncoder().encode(json);
  if (canZip()) return `z${b64u(await pipe(raw, new CompressionStream('deflate-raw'), JSON_MAX * 2))}`;
  return `j${b64u(raw)}`;
}
export const shareUrl = (code) => `${location.origin}${location.pathname}#t=${code}`;

// Код из текста: ссылка целиком, только «#t=…» или сам код
export function codeFrom(text) {
  const s = String(text || '').trim();
  const m = /#t=([A-Za-z0-9_-]+)/.exec(s) || /^([zj][A-Za-z0-9_-]{8,})$/.exec(s);
  return m && m[1].length <= CODE_MAX ? m[1] : null;
}

// ---- распаковка и проверка ----
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const pos = (v, hi) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= hi ? Math.round(v * 10) / 10 : null);
const MIN_BASE = Math.round(Date.UTC(2000, 0, 1) / MIN);
const MAX_BASE = Math.round(Date.UTC(2100, 0, 1) / MIN);

function intervals(list, s, maxN) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list.slice(0, maxN)) {
    if (!Array.isArray(p)) continue;
    const o = int(p[0], -3 * DAY_MIN, 4 * DAY_MIN);
    const d = int(p[1], 1, 3 * DAY_MIN);
    if (o == null || d == null) continue;
    out.push({ id: uid(), start: fmtLocal((s + o) * MIN), end: fmtLocal((s + o + d) * MIN) });
  }
  return out;
}

// Одна присланная запись → поездка (без маршрута: from/to/km отдельно) или null
function unpackTrip(x, base, nowMs) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const a = int(x.a, 0, 400 * DAY_MIN);
  const d = int(x.d, 1, 3 * DAY_MIN);
  if (a == null || d == null) return null;
  const s = base + a;
  if ((s + d) * MIN > nowMs) return null; // законченные поездки, не из будущего
  const passenger = intervals(x.p, s, 6);
  const trip = {
    id: uid(), routeId: null, routeLabel: '', start: fmtLocal(s * MIN), end: fmtLocal((s + d) * MIN),
    passenger, waiting: intervals(x.wt, s, 6).slice(0, passenger.length),
    locoType: clean(x.lt, 20), locoNumber: clean(x.ln, 12),
    restType: x.r === 'h' ? 'home' : x.r === 't' ? 'turnaround' : null, homeRest: null, homeChoice: null,
    createdAt: Date.now(),
  };
  if (KIND_BACK[x.k]) trip.kind = KIND_BACK[x.k];
  const w = pos(x.w, 20000); if (w) trip.weight = w;
  const ax = pos(x.ax, 2000); if (ax) trip.axles = Math.round(ax);
  const l = pos(x.l, 1000); if (l) trip.length = l;
  const rn = clean(x.rn, 20); if (rn) trip.routeNo = rn;
  if (validateTrip(trip)) return null;
  const from = clean(x.f, 60); const to = clean(x.to, 60);
  return { trip, from: from && to ? from : '', to: from && to ? to : '', km: pos(x.km, 20000) };
}

// Возвращает { items: [{ trip, from, to, km, dup }], skipped } или бросает ошибку с понятным текстом
export async function decodeShare(code, nowMs) {
  if (!code || code.length > CODE_MAX || !/^[zj][A-Za-z0-9_-]+$/.test(code)) throw new Error('Это не код CABINA с поездками.');
  let bytes;
  try { bytes = unb64u(code.slice(1)); } catch { throw new Error('Ссылка повреждена — попросите отправить её ещё раз.'); }
  if (code[0] === 'z') {
    if (!canZip()) throw new Error('Этот браузер слишком старый, чтобы открыть поездки. Обновите его.');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), JSON_MAX); } catch { throw new Error('Ссылка повреждена — попросите отправить её ещё раз.'); }
  } else if (bytes.length > JSON_MAX) throw new Error('Слишком много данных.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('Ссылка повреждена — попросите отправить её ещё раз.'); }
  if (!data || data.v !== 1 || !Array.isArray(data.t)) throw new Error('Поездки отправлены из более новой версии CABINA. Обновите приложение.');
  const base = int(data.b, MIN_BASE, MAX_BASE);
  if (base == null) throw new Error('Ссылка повреждена — попросите отправить её ещё раз.');
  const list = data.t.slice(0, SHARE_MAX);
  const items = [];
  for (const x of list) {
    const it = unpackTrip(x, base, nowMs);
    if (it) items.push(it);
  }
  for (const it of items) it.dup = overlaps(it.trip);
  return { items, skipped: data.t.length - items.length };
}

// Есть ли уже своя поездка в это время
function overlaps(trip) {
  const s = parseLocal(trip.start); const e = parseLocal(trip.end);
  return S.trips.some((t) => {
    const st = statsOf(t);
    const ts = Number.isFinite(st.start) ? st.start : parseLocal(t.start);
    const te = Number.isFinite(st.end) ? st.end : ts;
    return ts < e && te > s;
  });
}

// Добавить выбранные: маршрут — свой с теми же станциями, иначе создаём
export async function importItems(items) {
  const made = new Map();
  let n = 0;
  for (const it of items) {
    const t = { ...it.trip, updatedAt: Date.now() };
    if (it.from && it.to) {
      const key = `${stationKey(it.from)}|${stationKey(it.to)}`;
      let r = made.get(key) || S.routes.find((x) => `${stationKey(x.from)}|${stationKey(x.to)}` === key);
      if (!r) {
        r = { id: uid(), from: it.from, to: it.to, distanceKm: it.km || null, createdAt: Date.now() };
        await saveRoute(r);
      }
      made.set(key, r);
      t.routeId = r.id;
    }
    await saveTrip(t);
    n++;
  }
  return n;
}

// ---- QR-код: SVG из модулей (рисует библиотека qrcode-generator, своя только разметка) ----
let qrLib = null;
async function qrMatrix(text) {
  qrLib = qrLib || (await import('./vendor/qrcode.js')).default;
  for (const level of ['M', 'L']) {
    try {
      const q = qrLib(0, level);
      q.addData(text, 'Byte');
      q.make();
      const n = q.getModuleCount();
      if (n <= (level === 'M' ? 97 : 117)) return { n, dark: (r, c) => q.isDark(r, c) };
    } catch { /* не поместилось */ }
  }
  return null;
}
export async function qrSvg(text) {
  const m = await qrMatrix(text);
  if (!m) return '';
  const Q = 4; const size = m.n + Q * 2;
  let d = '';
  for (let r = 0; r < m.n; r++) {
    for (let c = 0; c < m.n;) {
      if (!m.dark(r, c)) { c++; continue; }
      let w = 1; while (c + w < m.n && m.dark(r, c + w)) w++;
      d += `M${c + Q} ${r + Q}h${w}v1h-${w}z`;
      c += w;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR-код с поездками"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// ---- чтение QR с картинки или камеры (библиотека jsQR, всё в телефоне) ----
let jsQR = null;
async function readQr(imageData) {
  jsQR = jsQR || (await import('./vendor/jsqr.js')).default;
  const r = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return r?.data || null;
}
async function readQrFile(file) {
  const bmp = await createImageBitmap(file);
  try {
    for (const side of [1400, 800, 2000]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k)); const h = Math.max(1, Math.round(bmp.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0, w, h);
      const text = await readQr(cx.getImageData(0, 0, w, h));
      if (text) return text;
    }
    return null;
  } finally { bmp.close?.(); }
}

// ---- окно «Поделиться» ----
const tripLine = (t) => {
  const st = statsOf(t);
  const e = routeEnds(t);
  return `${dayMonth(st.start)}, ${WD[new Date(st.start).getUTCDay()]} · ${hm(parseLocal(t.start))}–${hm(parseLocal(t.end))}${e ? ` · ${e.from} → ${e.to}` : ''}`;
};
export async function openShareSheet(trips, { onDone } = {}) {
  const list = trips.filter(shareable);
  if (!list.length) { toast('Выберите законченные поездки', { error: true }); return; }
  const el = openLayer(sheet({
    title: list.length === 1 ? 'Поездка напарнику' : `${list.length} ${plural(list.length, 'поездка', 'поездки', 'поездок')} напарнику`, tall: true,
    body: `<div class="share-box" id="sh-box"><div class="qr-wrap" id="sh-qr"><div class="hint">Готовим QR-код…</div></div>
      <p class="share-how">Напарник открывает свою CABINA → <b>«Добавить поездку»</b> → <b>«Получить поездки от напарника»</b> и наводит камеру. Можно и обычной камерой телефона.</p>
      <button class="btn btn-ghost" data-act="sh-link" id="sh-link" disabled>${I.link} Отправить ссылкой</button>
      <div class="notice">${I.shield}<div>В коде — время, маршрут и локомотив ${list.length === 1 ? 'этой поездки' : 'этих поездок'}. <b>Заработка, заметок и отвлечений там нет.</b> Наш сервер код не видит. Ссылку отправляйте только тому, с кем ездили: мессенджер видит её содержимое.</div></div>
      <details class="share-list"><summary>Что отправится</summary><ul>${list.map((t) => `<li>${esc(tripLine(t))}</li>`).join('')}</ul></details></div>`,
  }), { onClose: () => onDone?.() });
  let url = '';
  try { url = shareUrl(await encodeTrips(list)); } catch { el.querySelector('#sh-qr').innerHTML = '<div class="hint">Не удалось подготовить поездки.</div>'; return; }
  const svg = await qrSvg(url);
  el.querySelector('#sh-qr').innerHTML = svg || `<div class="hint">Слишком много поездок для одного QR-кода — выберите меньше или отправьте ссылкой.</div>`;
  const btn = el.querySelector('#sh-link');
  btn.disabled = false;
  btn.onclick = async () => {
    const text = 'Поездки для CABINA. Откройте её или вставьте в CABINA: «Добавить поездку» → «Получить поездки от напарника».';
    try {
      if (navigator.share) { await navigator.share({ title: 'Поездки CABINA', text, url }); return; }
    } catch (ex) { if (ex?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — вставьте её в сообщение напарнику'); } catch { toast('Не удалось скопировать ссылку', { error: true }); }
  };
}

// ---- окно «Получить от напарника» ----
export function openReceive() {
  let stream = null; let timer = 0; let busy = false;
  const stop = () => { clearInterval(timer); timer = 0; stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const el = openLayer(sheet({
    title: 'Получить от напарника', tall: true,
    body: `<p class="t2">Напарник выбирает поездки (удержать палец на поездке) → «Поделиться» и показывает QR-код.</p>
      <div class="cam-wrap" id="rc-cam" hidden><video id="rc-video" playsinline muted></video><div class="cam-frame"></div></div>
      <button class="btn btn-primary" data-act="rc-cam" id="rc-cam-btn">${I.camera} Сканировать камерой</button>
      <label class="btn btn-ghost file-btn" id="rc-photo-btn">${I.image} Сфотографировать или выбрать картинку<input type="file" accept="image/*" id="rc-photo" hidden></label>
      <div class="pay-field"><label for="rc-link">Или вставьте ссылку</label>
        <div class="input-row"><input class="input" id="rc-link" autocomplete="off" inputmode="url" placeholder="https://cabina-app.ru/#t=…"><button class="btn btn-ghost btn-sm" data-act="rc-open">Открыть</button></div></div>
      <div data-error></div>`,
  }), { onClose: stop });
  const err = (text) => { el.querySelector('[data-error]').innerHTML = text ? `<div class="error-box">${I.alert}<div>${esc(text)}</div></div>` : ''; };
  // Камера запрещена правилами сайта или её нет — сразу главная кнопка «Сфотографировать»
  const camOff = !navigator.mediaDevices?.getUserMedia || (document.featurePolicy && !document.featurePolicy.allowsFeature('camera'));
  if (camOff) {
    el.querySelector('#rc-cam-btn').hidden = true;
    el.querySelector('#rc-photo-btn').classList.replace('btn-ghost', 'btn-primary');
  }
  const got = async (text) => {
    if (busy) return;
    const code = codeFrom(text);
    if (!code) { err('Это не код CABINA с поездками.'); return; }
    busy = true; stop();
    try {
      const res = await decodeShare(code, nowLocal() + 6 * 60 * MIN);
      closeLayer(el);
      openImportPreview(res);
    } catch (ex) { err(ex.message); } finally { busy = false; }
  };
  el.querySelector('#rc-cam-btn').onclick = async () => {
    err('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      err('Камера недоступна. Нажмите «Сфотографировать или выбрать картинку» — это работает и без разрешения камеры.');
      return;
    }
    const v = el.querySelector('#rc-video');
    el.querySelector('#rc-cam').hidden = false;
    el.querySelector('#rc-cam-btn').hidden = true;
    v.srcObject = stream;
    try { await v.play(); } catch {}
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d', { willReadFrequently: true });
    timer = setInterval(async () => {
      if (!stream || busy || !v.videoWidth) return;
      const k = Math.min(1, 720 / v.videoWidth);
      cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
      cx.drawImage(v, 0, 0, cv.width, cv.height);
      const text = await readQr(cx.getImageData(0, 0, cv.width, cv.height));
      if (text) got(text);
    }, 250);
  };
  el.querySelector('#rc-photo').onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    err('');
    if (!/^image\//.test(f.type) || f.size > 25 * 1024 * 1024) { err('Нужна картинка с QR-кодом.'); return; }
    let text = null;
    try { text = await readQrFile(f); } catch { text = null; }
    if (!text) { err('QR-код не найден. Сфотографируйте его ближе и ровнее.'); return; }
    got(text);
  };
  el.querySelector('[data-act=rc-open]').onclick = () => got(el.querySelector('#rc-link').value);
  el.querySelector('#rc-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') got(e.target.value); });
  return el;
}

// ---- предпросмотр: что добавить ----
const isIosBrowser = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
export function openImportPreview({ items, skipped }, { link } = {}) {
  const pick = new Set(items.map((it, i) => (it.dup ? null : i)).filter((i) => i != null));
  const row = (it, i) => {
    const t = it.trip;
    const s = parseLocal(t.start); const e = parseLocal(t.end);
    const route = it.from ? `${it.from} → ${it.to}` : 'Маршрут не указан';
    const loco = [t.locoType, t.locoNumber ? `№${t.locoNumber}` : ''].filter(Boolean).join(' ');
    return `<button class="imp-row" data-act="imp-pick" data-i="${i}" aria-pressed="${pick.has(i)}"><span class="sel-dot" aria-hidden="true"></span>
      <span class="grow"><span class="t1">${esc(`${dayMonth(s)}, ${WD[new Date(s).getUTCDay()]} · ${hm(s)}–${hm(e)}`)}</span>
      <span class="t2">${esc(route)} · ${esc(fmtDur((e - s) / MIN, { short: true }))}${loco ? ` · ${esc(loco)}` : ''}</span>
      ${it.dup ? `<span class="t2 warn-line">У вас уже есть поездка в это время</span>` : ''}</span></button>`;
  };
  const body = items.length ? `<div class="notice warn">${I.alert}<div><b>Проверьте цифры сами:</b> человек мог ошибиться. Добавленные поездки можно изменить или удалить как обычные. Заработок по ним посчитается по вашим ставкам.</div></div>
      ${isIosBrowser() && link ? `<div class="notice">${I.info}<div>Если CABINA у вас на экране «Домой», добавляйте там: Safari и значок хранят записи отдельно. <button class="link-btn" data-act="imp-copy">Скопировать ссылку</button>, откройте CABINA → «Добавить поездку» → «Получить поездки от напарника» и вставьте её.</div></div>` : ''}
      <div class="list imp-list">${items.map(row).join('')}</div>
      ${skipped ? `<p class="t2">${skipped} ${plural(skipped, 'поездку', 'поездки', 'поездок')} не показали: в них ошибка или они ещё не закончились.</p>` : ''}`
    : `<div class="empty">В коде нет поездок, которые можно добавить.</div>`;
  const el = openLayer(sheet({
    title: 'Поездки от напарника', tall: true, body,
    foot: items.length ? `<button class="btn btn-primary" data-act="imp-add" id="imp-add">${I.check} <span></span></button>` : '',
  }));
  const label = () => {
    const b = el.querySelector('#imp-add');
    if (!b) return;
    b.disabled = !pick.size;
    b.querySelector('span').textContent = pick.size ? `Добавить ${pick.size} ${plural(pick.size, 'поездку', 'поездки', 'поездок')}` : 'Ничего не выбрано';
  };
  label();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'imp-pick') {
      const i = Number(b.dataset.i);
      if (pick.has(i)) pick.delete(i); else pick.add(i);
      b.setAttribute('aria-pressed', String(pick.has(i)));
      label();
    } else if (b.dataset.act === 'imp-copy') {
      try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast('Не удалось скопировать', { error: true }); }
    } else if (b.dataset.act === 'imp-add') {
      if (!pick.size) return;
      b.disabled = true;
      const chosen = [...pick].sort((x, y) => x - y).map((i) => items[i]);
      try {
        const before = awardSnapshot();
        const n = await importItems(chosen);
        closeLayer(el);
        toast(`Добавлено ${n} ${plural(n, 'поездка', 'поездки', 'поездок')}`);
        document.dispatchEvent(new CustomEvent('cabina:imported', { detail: chosen[chosen.length - 1].trip.start }));
        const news = awardNews(before);
        if (news) setTimeout(() => celebrate(news), 700);
      } catch {
        b.disabled = false;
        toast('Не удалось сохранить. Возможно, на устройстве закончилась память.', { error: true });
      }
    }
  });
  return el;
}

// Открыли ссылку с поездками: убираем код из адреса (чтобы не остался в истории) и показываем, что внутри
export async function checkShareHash() {
  const code = codeFrom(location.hash);
  if (!code) return false;
  const link = location.href;
  history.replaceState(history.state, '', location.pathname + location.search);
  try {
    openImportPreview(await decodeShare(code, nowLocal() + 6 * 60 * MIN), { link });
  } catch (ex) { toast(ex.message, { error: true, ms: 5000 }); }
  return true;
}

