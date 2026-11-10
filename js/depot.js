// Настройки депо одним QR-кодом (2.21.9, просьба Никиты): участки (до 2.25 — «маршруты») с километрами, нормами
// и станциями (2.25: девятым элементом — список промежуточных станций; прежние версии его не читают), нормативное время,
// дома отдыха с их минимумами, выходной депо, общий минимум отдыха и междусменный отдых.
// Ставок, оклада, поездок, заработка и профиля в коде нет. Из телефона в телефон: код лежит после «#» в адресе
// (браузер его на сервер не отправляет), приложение сразу убирает его из адреса. Получатель смотрит список и сам
// выбирает, что добавить; уже совпадающее не показываем, отличающееся — «обновить», по умолчанию не выбрано.
import { I, esc, openLayer, closeLayer, sheet, toast, plural, uid, small } from './ui.js';
import { S, saveRoute, saveSettings, stationKey, STATIONS_MAX } from './store.js';
import { fmtDur } from './calc.js';
import { b64u, unb64u, pipe, canZip, qrSvg, openReceive } from './share.js';

const JSON_MAX = 64 * 1024;
const CODE_MAX = 8000;
export const DEPOT_ROUTES_MAX = 80;
export const DEPOT_HOUSES_MAX = 60;
const NUMS = ['distanceKm', 'weightNorm', 'lengthNorm', 'acceptMin', 'departMin', 'walkMin'];
const LIMITS = { distanceKm: [20000, false], weightNorm: [20000, true], lengthNorm: [1000, true], acceptMin: [600, true], departMin: [600, true], walkMin: [600, true] };
const SET = { o: ['dayOffMin', 12 * 60, 14 * 24 * 60], m: ['minRest', 0, 24 * 60], q: ['minShiftRest', 0, 48 * 60] };

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const numOk = (k, v) => {
  const [max, intOnly] = LIMITS[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) return null;
  if (intOnly) return Number.isInteger(v) ? v : null;
  return Math.round(v * 10) / 10;
};
const sameName = (a, b) => stationKey(a) === stationKey(b) && !!stationKey(a);

// ---- что отправляем ----
export function depotPayload(st = S) {
  const r = st.routes.filter((x) => x.from && x.to).slice(0, DEPOT_ROUTES_MAX)
    .map((x) => {
      const a = [clean(x.from, 60), clean(x.to, 60), ...NUMS.map((k) => numOk(k, x[k]) ?? 0)];
      const st = (Array.isArray(x.stations) ? x.stations : []).map((n) => clean(n, 60)).filter(Boolean).slice(0, STATIONS_MAX);
      if (st.length) a.push(st);
      return a;
    });
  const h = Object.entries(st.settings.houses || {})
    .filter(([, v]) => Number.isFinite(v?.minRest)).slice(0, DEPOT_HOUSES_MAX)
    .map(([k, v]) => [clean(v.name || k, 60), Math.round(v.minRest)]);
  const out = { v: 1, r, h };
  for (const [c, [key]] of Object.entries(SET)) if (Number.isFinite(st.settings[key])) out[c] = Math.round(st.settings[key]);
  return out;
}
export const depotEmpty = (p) => !p.r.length && !p.h.length;

export async function encodeDepot(payload = depotPayload()) {
  // пустые хвосты участка (нули) не отправляем — QR меньше
  const json = JSON.stringify({ ...payload, r: payload.r.map((x) => { const a = [...x]; while (a.length > 2 && !a[a.length - 1]) a.pop(); return a; }) });
  const raw = new TextEncoder().encode(json);
  if (canZip()) return `z${b64u(await pipe(raw, new CompressionStream('deflate-raw'), JSON_MAX * 2))}`;
  return `j${b64u(raw)}`;
}
export const depotUrl = (code) => `${location.origin}${location.pathname}#d=${code}`;
export function depotCodeFrom(text) {
  const s = String(text || '').trim();
  const m = /#d=([A-Za-z0-9_-]+)/.exec(s) || /^([zj][A-Za-z0-9_-]{8,})$/.exec(s);
  return m && m[1].length <= CODE_MAX ? m[1] : null;
}

// ---- что получили: только проверенное ----
export async function decodeDepot(code) {
  let obj;
  try {
    const bytes = unb64u(code.slice(1));
    const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw'), JSON_MAX) : bytes;
    if (raw.length > JSON_MAX) throw new Error('big');
    obj = JSON.parse(new TextDecoder().decode(raw));
  } catch { throw new Error('Код повреждён или не дочитан. Попробуйте ещё раз.'); }
  if (!obj || typeof obj !== 'object' || obj.v !== 1) throw new Error('Это не код CABINA с настройками депо. Возможно, нужна новая версия приложения.');
  const routes = [];
  for (const x of (Array.isArray(obj.r) ? obj.r : []).slice(0, DEPOT_ROUTES_MAX)) {
    if (!Array.isArray(x)) continue;
    const from = clean(x[0], 60); const to = clean(x[1], 60);
    if (!from || !to || sameName(from, to)) continue;
    const r = { from, to };
    NUMS.forEach((k, i) => { const v = numOk(k, x[i + 2]); if (v != null) r[k] = v; });
    const st = [];
    for (const n of (Array.isArray(x[2 + NUMS.length]) ? x[2 + NUMS.length] : []).slice(0, STATIONS_MAX)) {
      const name = clean(n, 60);
      if (name && stationKey(name) && ![from, to, ...st].some((y) => sameName(y, name))) st.push(name);
    }
    if (st.length) r.stations = st;
    if (!routes.some((y) => sameName(y.from, from) && sameName(y.to, to))) routes.push(r);
  }
  const houses = [];
  for (const x of (Array.isArray(obj.h) ? obj.h : []).slice(0, DEPOT_HOUSES_MAX)) {
    if (!Array.isArray(x)) continue;
    const name = clean(x[0], 60);
    const min = Number.isInteger(x[1]) && x[1] >= 30 && x[1] <= 24 * 60 ? x[1] : null;
    if (name && stationKey(name) && min != null && !houses.some((y) => sameName(y.name, name))) houses.push({ name, minRest: min });
  }
  const settings = {};
  for (const [c, [key, lo, hi]] of Object.entries(SET)) if (Number.isInteger(obj[c]) && obj[c] >= lo && obj[c] <= hi) settings[key] = obj[c];
  return { routes, houses, settings };
}

// Список для окна: новое — выбрано, отличающееся — «обновить» (не выбрано), совпадающее — не показываем
export function depotItems(data, st = S) {
  const items = []; let same = 0;
  for (const r of data.routes) {
    const ex = st.routes.find((y) => sameName(y.from, r.from) && sameName(y.to, r.to));
    if (!ex) { items.push({ kind: 'route', r, pick: true }); continue; }
    const diff = NUMS.filter((k) => r[k] != null && r[k] !== ex[k]);
    if (r.stations && JSON.stringify(r.stations.map(stationKey)) !== JSON.stringify((ex.stations || []).map(stationKey))) diff.push('stations');
    if (diff.length) items.push({ kind: 'route', r, ex, diff, pick: false }); else same++;
  }
  for (const h of data.houses) {
    const cur = st.settings.houses?.[stationKey(h.name)]?.minRest;
    if (cur === h.minRest) { same++; continue; }
    items.push({ kind: 'house', h, cur: Number.isFinite(cur) ? cur : null, pick: cur == null });
  }
  for (const [key, v] of Object.entries(data.settings)) {
    const cur = st.settings[key];
    if (cur === v) { same++; continue; }
    items.push({ kind: 'set', key, v, cur, pick: false });
  }
  return { items, same };
}

const SET_NAMES = { dayOffMin: 'Выходной депо', minRest: 'Минимальный отдых в пункте оборота', minShiftRest: 'Междусменный отдых' };
const dur = (m) => fmtDur(m, { short: true });
function routeSub(r) {
  const p = [];
  if (r.distanceKm) p.push(`${String(r.distanceKm).replace('.', ',')} км`);
  if (r.stations?.length) p.push(`${r.stations.length + 2} ${plural(r.stations.length + 2, 'станция', 'станции', 'станций')}`);
  if (r.weightNorm) p.push(`норма ${r.weightNorm} т`);
  if (r.lengthNorm) p.push(`${r.lengthNorm} ваг.`);
  if (r.acceptMin || r.departMin || r.walkMin) p.push('нормативное время');
  return p.join(' · ');
}
export function itemText(it) {
  if (it.kind === 'route') return { t1: `Участок ${it.r.from} — ${it.r.to}`, t2: routeSub(it.r) || 'Без норм', warn: it.ex ? (it.diff?.includes('stations') ? 'У вас уже есть — обновить нормы и станции' : 'У вас уже есть — обновить нормы') : '' };
  if (it.kind === 'house') return { t1: `Дом отдыха · ${it.h.name}`, t2: `Минимум ${dur(it.h.minRest)}`, warn: it.cur != null ? `У вас ${dur(it.cur)} — заменить` : '' };
  return { t1: SET_NAMES[it.key], t2: dur(it.v), warn: it.cur != null ? `У вас ${dur(it.cur)} — заменить` : '' };
}

export async function applyDepot(chosen, st = S) {
  let n = 0;
  const houses = { ...(st.settings.houses || {}) };
  const patch = {};
  for (const it of chosen) {
    if (it.kind === 'route') {
      const nums = Object.fromEntries(NUMS.filter((k) => it.r[k] != null).map((k) => [k, it.r[k]]));
      if (it.r.stations) nums.stations = [...it.r.stations];
      if (it.ex) await saveRoute({ ...it.ex, ...nums, updatedAt: Date.now() });
      else await saveRoute({ id: uid(), from: it.r.from, to: it.r.to, distanceKm: null, weightNorm: null, lengthNorm: null, ...nums, createdAt: Date.now() });
    } else if (it.kind === 'house') houses[stationKey(it.h.name)] = { name: it.h.name, minRest: it.h.minRest };
    else patch[it.key] = it.v;
    n++;
  }
  if (chosen.some((it) => it.kind === 'house')) patch.houses = houses;
  if (Object.keys(patch).length) await saveSettings(patch);
  return n;
}

// ---- окно «Поделиться настройками депо» ----
export async function openDepotShare() {
  const p = depotPayload();
  if (depotEmpty(p)) { toast('Сначала добавьте участки или минимумы домов отдыха в «Настройках работы»', { error: true }); return null; }
  const what = [p.r.length ? `${p.r.length} ${plural(p.r.length, 'участок', 'участка', 'участков')}` : '', p.h.length ? `${p.h.length} ${plural(p.h.length, 'дом отдыха', 'дома отдыха', 'домов отдыха')}` : ''].filter(Boolean).join(' и ');
  const el = openLayer(sheet({
    title: 'Настройки депо', tall: true,
    body: `<div class="share-box"><div class="qr-wrap" id="dp-qr"><div class="hint">Готовим QR-код…</div></div>
      <p class="share-how">Коллега открывает свою CABINA → меню ☰ <b>«Настройки работы»</b> → <b>«Получить настройки депо»</b> и наводит камеру. Можно и обычной камерой телефона.</p>
      <button class="btn btn-ghost" data-act="dp-link" id="dp-link" disabled>${I.link} Отправить ссылкой</button>
      <div class="notice">${I.shield}<div>В коде — ${esc(what)}: километры, нормы веса и длины, нормативное время, минимумы отдыха, выходной и междусменный отдых. <b>Ставок, оклада, поездок и заработка там нет.</b> Наш сервер код не видит.</div></div>
      <details class="share-list"><summary>Что отправится</summary><ul>${p.r.map((x) => `<li>${esc(`${x[0]} → ${x[1]}`)}</li>`).join('')}${p.h.map((x) => `<li>${esc(`Дом отдыха ${x[0]} · ${dur(x[1])}`)}</li>`).join('')}</ul></details></div>`,
  }));
  let url = '';
  try { url = depotUrl(await encodeDepot(p)); } catch { el.querySelector('#dp-qr').innerHTML = '<div class="hint">Не удалось подготовить настройки.</div>'; return el; }
  const svg = await qrSvg(url, 'QR-код с настройками депо');
  el.querySelector('#dp-qr').innerHTML = svg || '<div class="hint">Слишком много участков для одного QR-кода — отправьте ссылкой.</div>';
  const btn = el.querySelector('#dp-link');
  btn.disabled = false;
  btn.onclick = async () => {
    const text = 'Настройки депо для CABINA: участки со станциями, нормы и дома отдыха. Откройте ссылку или вставьте её в CABINA: ☰ «Настройки работы» → «Получить настройки депо».';
    try { if (navigator.share) { await navigator.share({ title: 'Настройки депо CABINA', text, url }); return; } } catch (ex) { if (ex?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — вставьте её в сообщение коллеге'); } catch { toast('Не удалось скопировать ссылку', { error: true }); }
  };
  return el;
}

// ---- окно «Получить настройки депо» и просмотр ----
export function openDepotReceive() {
  return openReceive({
    title: 'Получить настройки депо',
    intro: 'Коллега открывает ☰ «Настройки работы» → «Поделиться настройками депо» и показывает QR-код.',
    placeholder: 'https://cabina-app.ru/#d=…',
    notCode: 'Это не код CABINA с настройками депо.',
    handle: async (text, close) => {
      const code = depotCodeFrom(text);
      if (!code) return false;
      const data = await decodeDepot(code);
      close();
      openDepotPreview(data);
      return true;
    },
  });
}

export function openDepotPreview(data) {
  const { items, same } = depotItems(data);
  const pick = new Set(items.map((it, i) => (it.pick ? i : null)).filter((i) => i != null));
  const row = (it, i) => {
    const t = itemText(it);
    return `<button class="imp-row" data-act="dp-pick" data-i="${i}" aria-pressed="${pick.has(i)}"><span class="sel-dot" aria-hidden="true"></span>
      <span class="grow"><span class="t1">${esc(t.t1)}</span><span class="t2">${esc(t.t2)}</span>${t.warn ? `<span class="t2 warn-line">${esc(t.warn)}</span>` : ''}</span></button>`;
  };
  const body = items.length
    ? `<div class="notice warn">${I.alert}<div><b>Проверьте сами:</b> коллега мог ошибиться. Всё добавленное можно изменить в «Настройках работы». Ставки и поездки не меняются.</div></div>
      <div class="list imp-list">${items.map(row).join('')}</div>
      ${same ? `<p class="t2">${same} ${plural(same, 'настройка совпадает', 'настройки совпадают', 'настроек совпадают')} с вашими — их не показываем.</p>` : ''}`
    : `<div class="empty">${small(I.check, 28)}<b>Всё уже как у вас</b><p>Новых участков и настроек в коде нет.</p></div>`;
  const el = openLayer(sheet({
    title: 'Настройки от коллеги', tall: true, body,
    foot: items.length ? `<button class="btn btn-primary" data-act="dp-add" id="dp-add">${I.check} <span></span></button>` : '',
  }));
  const label = () => {
    const b = el.querySelector('#dp-add');
    if (!b) return;
    b.disabled = !pick.size;
    b.querySelector('span').textContent = pick.size ? `Добавить ${pick.size} ${plural(pick.size, 'пункт', 'пункта', 'пунктов')}` : 'Ничего не выбрано';
  };
  label();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'dp-pick') {
      const i = Number(b.dataset.i);
      if (pick.has(i)) pick.delete(i); else pick.add(i);
      b.setAttribute('aria-pressed', String(pick.has(i)));
      label();
    } else if (b.dataset.act === 'dp-add') {
      if (!pick.size) return;
      b.disabled = true;
      try {
        const n = await applyDepot([...pick].sort((x, y) => x - y).map((i) => items[i]));
        closeLayer(el);
        toast(`Добавлено: ${n} ${plural(n, 'пункт', 'пункта', 'пунктов')}`);
      } catch {
        b.disabled = false;
        toast('Не удалось сохранить. Попробуйте ещё раз.', { error: true });
      }
    }
  });
  return el;
}

// Открыли ссылку с настройками депо: убираем код из адреса и показываем, что внутри
export async function checkDepotHash() {
  if (!/#d=/.test(location.hash)) return false;
  const code = depotCodeFrom(location.hash);
  history.replaceState(history.state, '', location.pathname + location.search);
  if (!code) { toast('Ссылка с настройками депо повреждена', { error: true }); return true; }
  try { openDepotPreview(await decodeDepot(code)); } catch (ex) { toast(ex.message, { error: true, ms: 5000 }); }
  return true;
}

