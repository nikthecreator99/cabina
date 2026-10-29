// Экран «Мой персонаж»: конструктор нарисованного персонажа вместо фото профиля.
// Пока человек выбирает, всё живёт в памяти (E); в профиль попадает только по «Готово».
// Премиум-детали можно примерить, но сохранить — только разработчику (роль admin на сервере аккаунтов).
import { I, esc, small, toast, confirmDialog, plural } from './ui.js';
import { S, saveProfile } from './store.js';
import * as A from './avatar.js';
import { session, myRole } from './auth.js';

// ---- Премиум. Код открытый, поэтому это удобство для разработчика, а не защита: платного здесь ничего нет.
const PREM_KEY = 'cabina-premium-dev';
export function premiumOk() {
  try { const s = session(); return !!s && localStorage.getItem(PREM_KEY) === s.sub; } catch { return false; }
}
// Роль спрашиваем у сервера только при открытом аккаунте. Нет связи — оставляем как было.
async function refreshPremium() {
  try {
    const s = session();
    if (!s) { localStorage.removeItem(PREM_KEY); return; }
    const role = await myRole();
    if (role === 'admin') localStorage.setItem(PREM_KEY, s.sub);
    else if (role) localStorage.removeItem(PREM_KEY);
  } catch {}
}

const E = { a: null, base: '', hist: [], group: 'face', drag: false, prem: false, chars: false };
const NUM = new Set(['skin', 'eyeC', 'hairC', 'beardC', 'outfitC', 'hatC', 'glassesC', 'lips', 'metal', 'glow']);
const GROUPS = [['face', 'Лицо', I.face], ['hair', 'Волосы', I.hair], ['wear', 'Одежда', I.shirt], ['acc', 'Детали', I.glasses], ['bg', 'Фон', I.image]];
const norm = (a) => A.normalizeAvatar(a, { premium: true });
const changed = () => !!E.a && JSON.stringify(E.a) !== E.base;
export const hasAvatar = (p = S.profile) => !!p.avatar && typeof p.avatar === 'object';

function start() {
  E.prem = premiumOk();
  // первый раз — спокойный персонаж по умолчанию, дальше человек меняет сам или жмёт «Случайный»
  E.a = A.normalizeAvatar(hasAvatar() ? S.profile.avatar : {}, { premium: E.prem });
  E.base = JSON.stringify(E.a);
  E.hist = []; E.group = 'face'; E.drag = false; E.chars = false;
}

export function openAvatarEditor(ctx) {
  start();
  ctx.go('avatar');
  refreshPremium().then(() => { if (E.a && premiumOk() !== E.prem) { E.prem = premiumOk(); refresh(); } });
}

// ---- Разметка
const NONE = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>';
// data-h — отпечаток содержимого: по нему видно, изменился ли раздел, без сравнения разметки
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function sec(id, title, body, note = '') {
  const inner = `<h3>${title}${note ? `<span>${note}</span>` : ''}</h3>${body}`;
  return `<section class="av-sec" data-sec="${id}" data-h="${hash(inner)}">${inner}</section>`;
}
const hashOf = (html) => /data-h="(\w+)"/.exec(html)?.[1];
// Плитка — картинкой из того же рисунка: так телефон рисует десятки вариантов заметно быстрее,
// чем столько же встроенных SVG. Последние картинки запоминаются, чтобы не собирать их заново.
const pics = new Map();
function pic(a, crop) {
  const key = crop + JSON.stringify(a);
  let src = pics.get(key);
  if (!src) {
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(A.avatarSvg(a, { size: 76, crop, bg: false }))}`;
    if (pics.size > 400) pics.delete(pics.keys().next().value);
    pics.set(key, src);
  }
  return `<img src="${src}" alt="" width="76" height="76" decoding="async">`;
}
const prBadge = '<span class="av-pr">Премиум</span>';
function tile(k, v, name, { crop = 'face', variant = {}, prem = false } = {}) {
  const on = E.a[k] === v;
  const img = v == null ? `<span class="av-none">${NONE}</span>` : pic(norm({ ...E.a, ...variant, [k]: v }), crop);
  return `<button class="av-tile${on ? ' on' : ''}" data-act="av-set" data-k="${k}" data-v="${esc(v ?? '')}" aria-pressed="${on}" aria-label="${esc(name)}${prem ? ', Премиум' : ''}">${img}${prem ? prBadge : ''}<span class="n">${esc(name)}</span></button>`;
}
const row = (id, tiles) => `<div class="av-row" data-row="${id}">${tiles}</div>`;
const grid = (tiles, cls = '') => `<div class="av-grid ${cls}">${tiles}</div>`;
function swatches(k, colors, cur, { noneFirst = false } = {}) {
  return `<div class="av-sws">${colors.map((c, i) => {
    const on = cur === i;
    if (c == null) return noneFirst ? `<button class="av-sw none" data-act="av-set" data-k="${k}" data-v="${i}" aria-pressed="${on}" aria-label="Нет"></button>` : '';
    return `<button class="av-sw" style="--c:${c}" data-act="av-set" data-k="${k}" data-v="${i}" aria-pressed="${on}" aria-label="Цвет ${i + 1}"></button>`;
  }).join('')}</div>`;
}
const chip = (act, k, v, label, on, prem = false) => `<button class="av-chip" data-act="${act}" data-k="${k}" data-v="${esc(v ?? '')}" aria-pressed="${on}">${esc(label)}${prem ? prBadge : ''}</button>`;
const chipSet = (k, list) => `<div class="av-chips">${list.map((x) => chip('av-set', k, x.id, x.name, E.a[k] === x.id)).join('')}</div>`;

const between = (v, lo, hi, a, b, c) => (v < lo ? a : v > hi ? c : b);
const RANGE_TXT = {
  age: (v) => `${v} ${plural(v, 'год', 'года', 'лет')}`,
  faceW: (v) => between(v, 0.96, 1.04, 'Узкое', 'Обычное', 'Широкое'),
  eyeS: (v) => between(v, 0.95, 1.07, 'Маленькие', 'Обычные', 'Большие'),
  eyeGap: (v) => between(v, 0.96, 1.04, 'Ближе', 'Обычно', 'Шире'),
  noseS: (v) => between(v, 0.92, 1.1, 'Маленький', 'Обычный', 'Крупный'),
};
function range(k, label) {
  const [lo, hi] = A.RANGES[k];
  const step = k === 'age' ? 1 : 0.01;
  return `<div class="av-range-row"><label for="av-r-${k}">${label}</label>
    <input type="range" class="av-range" id="av-r-${k}" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${E.a[k]}">
    <output id="av-o-${k}" for="av-r-${k}">${RANGE_TXT[k](E.a[k])}</output></div>`;
}

function stageHtml() {
  const parts = A.premiumParts(E.a);
  return `<div class="av-big">${A.avatarSvg(E.a, { size: 216 })}</div>
    <button class="av-fab l" data-act="av-rand"><span>${I.dice}</span>Случайный</button>
    <button class="av-fab r" data-act="av-undo"${E.hist.length ? '' : ' disabled'}><span>${I.undo}</span>Назад</button>
    ${parts.length && !E.prem ? `<div class="av-try">${small(I.lock, 14)} Примерка: ${esc(parts.join(', '))}</div>` : ''}`;
}
// у робота вместо волос — макушка (антенны, мигалка)
const groupName = (k, t) => (k === 'hair' && E.a.sex === 'robot' ? 'Макушка' : t);
const groupsHtml = () => GROUPS.map(([k, t, ic]) => `<button role="tab" data-act="av-group" data-g="${k}" aria-selected="${E.group === k}">${ic}<span>${groupName(k, t)}</span></button>`).join('');

// Разделы панели: id (по нему раздел обновляется отдельно) и разметка — функцией, чтобы собирать только нужное
function sections() {
  const a = E.a;
  const f = a.sex === 'f', robot = a.sex === 'robot';
  const S_ = (id, title, body, note) => ({ id, html: () => sec(id, title, body(), note) });
  // «Кто вы»: мужчина, женщина или премиум-персонажи (пока только робот)
  const who = () => {
    const open = E.chars || robot;
    return `<div class="av-chips">${chip('av-set', 'sex', 'm', 'Мужчина', a.sex === 'm')}${chip('av-set', 'sex', 'f', 'Женщина', f)}<button class="av-chip prem" data-act="av-chars" aria-pressed="${open}" aria-expanded="${open}">Премиум</button></div>` +
      (open ? `<div class="av-chars">${row('chars', A.CHARS.map((c) => tile('sex', c.id, c.name, { variant: { hat: null, glasses: null, goggles: false, defenders: false }, prem: c.premium })).join(''))}</div>` : '');
  };
  if (E.group === 'face' && robot) {
    const clean = { hat: null, glasses: null, goggles: false, defenders: false, rTop: null };
    const tiles = (k, list) => () => row(k, list.map((x) => tile(k, x.id, x.name, { variant: clean })).join(''));
    return [
      S_('sex', 'Кто вы', who),
      S_('head', 'Форма головы', tiles('head', A.HEADS)),
      S_('props', 'Пропорции', () => range('faceW', 'Лицо') + range('eyeS', 'Глаза') + range('eyeGap', 'Между глаз')),
      S_('metal', 'Цвет корпуса', () => swatches('metal', A.METAL_C, a.metal)),
      S_('rEyes', 'Глаза', tiles('rEyes', A.R_EYES)),
      S_('glow', 'Цвет свечения', () => swatches('glow', A.GLOW_C, a.glow), 'глаза, рот, огоньки'),
      S_('rMouth', 'Рот', tiles('rMouth', A.R_MOUTHS)),
      S_('ears', 'Уши', tiles('ears', A.EARS)),
    ];
  }
  if (E.group === 'hair' && robot) {
    return [S_('rTop', 'Макушка', () => grid(A.R_TOPS.map((x) => tile('rTop', x.id, x.name, { crop: 'top', variant: { hat: null, goggles: false } })).join('')), a.hat ? 'под головным убором не видно' : '')];
  }
  if (E.group === 'face') {
    const bare = { hair: f ? 'fbun' : 'bald', beard: null, mous: null, hat: null, glasses: null, goggles: false, defenders: false };
    const clean = { hat: null, glasses: null, goggles: false };
    const tiles = (k, list, variant = clean) => () => row(k, list.map((x) => tile(k, x.id, x.name, { variant })).join(''));
    return [
      S_('sex', 'Кто вы', who),
      S_('age', 'Возраст персонажа', () => range('age', 'Возраст')),
      S_('head', 'Форма головы', tiles('head', A.HEADS, bare)),
      S_('props', 'Пропорции', () => range('faceW', 'Лицо') + range('eyeS', 'Глаза') + range('eyeGap', 'Между глаз') + range('noseS', 'Нос')),
      S_('skin', 'Цвет кожи', () => swatches('skin', A.SKIN, a.skin)),
      S_('eyes', 'Глаза', tiles('eyes', A.EYES)),
      S_('eyeC', 'Цвет глаз', () => swatches('eyeC', A.EYE_C, a.eyeC)),
      S_('brows', 'Брови', tiles('brows', A.BROWS)),
      S_('nose', 'Нос', tiles('nose', A.NOSES)),
      S_('mouth', 'Выражение', tiles('mouth', A.MOUTHS)),
      S_('ears', 'Уши', tiles('ears', A.EARS, { ...bare, hair: f ? 'fbun' : 'buzz' })),
      f && S_('lips', 'Помада', () => swatches('lips', A.LIP_C, a.lips, { noneFirst: true })),
    ].filter(Boolean);
  }
  if (E.group === 'hair') {
    const hairs = A.hairsOf(a.sex);
    return [
      S_('hair', 'Причёска', () => grid(hairs.map((x) => tile('hair', x.id, x.name, { crop: 'top', variant: { hat: null } })).join('')), `${hairs.length} ${plural(hairs.length, 'вариант', 'варианта', 'вариантов')}`),
      S_('hairC', 'Цвет волос', () => swatches('hairC', A.HAIR_C, a.hairC)),
      !f && S_('mous', 'Усы', () => row('mous', A.MOUS.map((x) => tile('mous', x.id, x.name)).join(''))),
      !f && S_('beard', 'Борода', () => row('beard', A.BEARDS.map((x) => tile('beard', x.id, x.name)).join(''))),
      !f && (a.beard || a.mous) && S_('beardC', 'Цвет бороды и усов', () => `<div class="av-chips">${chip('av-set', 'beardC', null, 'Как волосы', a.beardC == null)}</div>${swatches('beardC', A.HAIR_C, a.beardC)}`),
    ].filter(Boolean);
  }
  if (E.group === 'wear') {
    const o = A.OUTFITS.find((x) => x.id === a.outfit);
    return [
      S_('outfit', 'Одежда', () => grid(A.OUTFITS.map((x) => tile('outfit', x.id, x.name, { crop: 'bust', variant: { outfitC: null } })).join(''))),
      o?.color && S_('outfitC', 'Цвет', () => swatches('outfitC', A.CLOTH_C, a.outfitC ?? o.def)),
      S_('build', 'Телосложение', () => row('build', A.BUILDS.map((x) => tile('build', x.id, x.name, { crop: 'wide' })).join(''))),
    ].filter(Boolean);
  }
  if (E.group === 'acc') {
    const hc = a.hat && !A.isPremiumHat(a.hat) ? A.hatColors(a.hat) : null;
    return [
      S_('hat', 'Головной убор', () => row('hat', A.HATS.map((x) => tile('hat', x.id, x.name, { crop: 'top', variant: { goggles: false }, prem: !!x.premium })).join(''))),
      hc && S_('hatC', 'Цвет убора', () => swatches('hatC', hc, a.hatC < hc.length ? a.hatC : 0)),
      S_('glasses', 'Очки', () => row('glasses', A.GLASSES.map((x) => tile('glasses', x.id, x.name, { variant: { goggles: false } })).join(''))),
      a.glasses && S_('glassesC', 'Цвет оправы', () => swatches('glassesC', A.FRAME_C, a.glassesC)),
      S_('more', 'Ещё', () => `<div class="av-chips">${chip('av-toggle', 'goggles', '', 'Очки на лбу', a.goggles)}${chip('av-toggle', 'defenders', '', 'Наушники', a.defenders)}${chip('av-toggle', 'mazut', '', 'Мазут', a.mazut, true)}</div>`),
      !robot && S_('earrings', 'Серьги', () => chipSet('earrings', A.EARRINGS)),
      !robot && S_('piercing', 'Пирсинг', () => chipSet('piercing', A.PIERCING)),
      !robot && S_('marks', 'Приметы', () => `<div class="av-chips">${A.MARKS.map((m) => chip('av-mark', 'marks', m.id, m.name, a.marks.includes(m.id))).join('')}</div>`, 'можно несколько'),
    ].filter(Boolean);
  }
  return [S_('bg', 'Фон', () => grid(A.BG.map((b) => {
    const on = a.bg === b.id;
    return `<button class="av-tile${on ? ' on' : ''}" data-act="av-set" data-k="bg" data-v="${b.id}" aria-pressed="${on}" aria-label="${esc(b.name)}${b.premium ? ', Премиум' : ''}">${A.bgSvg(b.id)}${b.premium ? prBadge : ''}<span class="n">${esc(b.name)}</span></button>`;
  }).join(''), 'bg3'))];
}
const panelHtml = () => sections().map((x) => x.html()).join('');

export function renderAvatarEdit() {
  if (!E.a) start();
  return `<div class="av-top"><div class="page-head">
      <button class="icon-btn" data-act="av-close" aria-label="Закрыть">${I.x}</button>
      <h1>Мой персонаж</h1>
      <button class="btn btn-primary btn-sm" data-act="av-save">Готово</button></div>
      <div class="av-stage" id="av-stage">${stageHtml()}</div>
      <div class="av-groups" id="av-groups" role="tablist">${groupsHtml()}</div></div>
    <div class="av-panel" id="av-panel">${panelHtml()}</div>
    <div class="notice ok">${I.shield}<div><b>Это рисунок, а не фото.</b> Персонаж хранится только в этом телефоне и попадает в резервную копию.</div></div>`;
}

// ---- Обновление без перерисовки всего экрана: ряды не уезжают, страница не прыгает.
// Сразу меняются персонаж и раздел, в котором нажали; остальные разделы — по одному, сначала видимые,
// чтобы телефон не замирал на десятках картинок. Новое нажатие отменяет недоделанное.
let gen = 0;
// Выбранное отмечается сразу у всех кнопок — даже в разделах, которые ещё не перерисованы
function current(k) {
  if (k === 'outfitC') return E.a.outfitC ?? A.OUTFITS.find((o) => o.id === E.a.outfit)?.def;
  if (k === 'hatC') return E.a.hatC < A.hatColors(E.a.hat).length ? E.a.hatC : 0;
  return E.a[k];
}
function syncPressed(panel) {
  panel.querySelectorAll('[data-act^="av-"][data-k]').forEach((b) => {
    const { act, k, v } = b.dataset;
    const on = act === 'av-mark' ? E.a.marks.includes(v) : act === 'av-toggle' ? !!E.a[k] : current(k) === (v === '' ? null : NUM.has(k) ? parseInt(v, 10) : v);
    b.setAttribute('aria-pressed', String(on));
    if (b.classList.contains('av-tile')) b.classList.toggle('on', on);
  });
}
function swap(old, html) {
  const box = document.createElement('div');
  box.innerHTML = html;
  const n = box.firstElementChild;
  const r0 = old.querySelector('[data-row]');
  const x = r0 ? r0.scrollLeft : 0;
  old.replaceWith(n);
  if (x) n.querySelector('[data-row]').scrollLeft = x;
}
function refresh(first = null) {
  const root = document.querySelector('.screen[data-page="avatar"]');
  if (!root || !E.a) return;
  const my = ++gen;
  root.querySelector('#av-stage').innerHTML = stageHtml();
  root.querySelector('#av-groups').innerHTML = groupsHtml();
  const panel = root.querySelector('#av-panel');
  const list = sections();
  const have = new Map([...panel.children].map((el) => [el.dataset.sec, el]));
  const y = window.scrollY;
  // новые разделы (другая вкладка, появился цвет бороды) — сразу; лишние — убрать
  const els = list.map((x) => have.get(x.id) || Object.assign(document.createElement('div'), { innerHTML: x.html() }).firstElementChild);
  const fresh = new Set(els.filter((el) => !el.isConnected));
  if (els.some((el, i) => panel.children[i] !== el) || panel.children.length !== els.length) panel.replaceChildren(...els);
  window.scrollTo(0, y);
  syncPressed(panel);
  const todo = list.map((x, i) => i).filter((i) => !fresh.has(els[i]));
  const vis = (i) => { const r = els[i].getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  todo.sort((i, j) => (list[j].id === first) - (list[i].id === first) || vis(j) - vis(i) || i - j);
  const step = () => {
    if (my !== gen || !todo.length || !E.a) return;
    const i = todo.shift();
    const cur = panel.querySelector(`[data-sec="${list[i].id}"]`);
    const html = list[i].html();
    if (cur && cur.dataset.h !== hashOf(html)) swap(cur, html);
    setTimeout(step, 0);
  };
  // раздел, в котором нажали, — в том же кадре, что и персонаж
  if (todo.length && list[todo[0]].id === first) { const i = todo.shift(); const cur = els[i]; const html = list[i].html(); if (cur.dataset.h !== hashOf(html)) swap(cur, html); }
  requestAnimationFrame(() => setTimeout(step, 0));
}
const sectionOf = (k) => (['goggles', 'defenders', 'mazut'].includes(k) ? 'more' : k in A.RANGES && k !== 'age' ? 'props' : k);
function remember() { E.hist.push(JSON.stringify(E.a)); if (E.hist.length > 40) E.hist.shift(); }
function set(patch) {
  remember();
  const next = { ...E.a, ...patch };
  // у каски свои цвета: номер цвета, которого у неё нет, — первый
  if ('hat' in patch && next.hatC >= A.hatColors(next.hat).length) next.hatC = 0;
  // новая одежда — со своим цветом по умолчанию, как на картинке
  if ('outfit' in patch && patch.outfit !== E.a.outfit) next.outfitC = null;
  // помаду выбирают только у женского персонажа — у мужского её не должно остаться скрытой
  if (patch.sex === 'm') next.lips = 0;
  if (patch.sex === 'robot') E.chars = true;
  E.a = norm(next);
  refresh(sectionOf(Object.keys(patch)[0]));
}

// Ползунки: во время движения меняется только сам персонаж, после — весь экран
export function avatarInput(t) {
  if (!t.classList?.contains('av-range') || !E.a) return false;
  const k = t.dataset.k;
  if (!(k in A.RANGES)) return true;
  if (!E.drag) { remember(); E.drag = true; }
  E.a = norm({ ...E.a, [k]: Number(t.value) });
  document.querySelector('#av-stage .av-big').innerHTML = A.avatarSvg(E.a, { size: 216 });
  const o = document.getElementById(`av-o-${k}`);
  if (o) o.textContent = RANGE_TXT[k](E.a[k]);
  return true;
}
export function avatarChange(e) {
  if (!e.target.classList?.contains('av-range') || !E.a) return false;
  E.drag = false;
  refresh();
  return true;
}

async function save(ctx) {
  const prem = premiumOk();
  const parts = A.premiumParts(E.a);
  if (parts.length && !prem) {
    const robot = E.a.sex === 'robot', rest = parts.filter((p) => p !== 'робот');
    const ok = await confirmDialog({
      title: 'Это Премиум',
      text: robot
        ? `Робот — премиум-персонаж${rest.length ? ` (и ещё: ${rest.join(', ')})` : ''}. Его можно примерить, но сохранить пока нельзя: Премиум появится позже. Сохранить человека с той же одеждой?`
        : `Премиум-детали (${parts.join(', ')}) можно примерить, но сохранить пока нельзя: Премиум появится позже. Снять их и сохранить остальное?`,
      ok: robot ? 'Сохранить человека' : 'Снять и сохранить', cancel: 'Ещё примерю', danger: false,
    });
    if (!ok) return;
  }
  const avatar = A.normalizeAvatar(E.a, { premium: prem });
  const photo = !!S.profile.photo;
  E.a = null;
  ctx.back();
  await saveProfile({ avatar });
  if (photo && await confirmDialog({ title: 'Удалить старое фото?', text: 'Теперь в профиле ваш персонаж. Фото больше не показывается — его можно удалить из телефона.', ok: 'Удалить фото', cancel: 'Оставить' })) {
    await saveProfile({ photo: '' });
    toast('Персонаж сохранён, фото удалено');
  } else toast('Персонаж сохранён');
}

export async function avatarClick(act, b, ctx) {
  if (act === 'av-open') { openAvatarEditor(ctx); return true; }
  if (!act.startsWith('av-')) return false;
  if (act === 'av-close') {
    if (changed() && !(await confirmDialog({ title: 'Выйти без сохранения?', text: 'Изменения персонажа не сохранятся.', ok: 'Выйти', cancel: 'Остаться' }))) return true;
    E.a = null;
    ctx.back();
    return true;
  }
  if (!E.a) return true;
  const { k, v } = b.dataset;
  if (act === 'av-set') set({ [k]: v === '' ? null : NUM.has(k) ? parseInt(v, 10) : v });
  else if (act === 'av-toggle' && ['goggles', 'defenders', 'mazut'].includes(k)) set({ [k]: !E.a[k] });
  else if (act === 'av-chars') {
    // свернуть список можно, только пока робот не выбран
    if (E.a.sex !== 'robot') E.chars = !E.chars;
    refresh('sex');
  } else if (act === 'av-mark') set({ marks: E.a.marks.includes(v) ? E.a.marks.filter((m) => m !== v) : [...E.a.marks, v] });
  else if (act === 'av-group' && GROUPS.some((g) => g[0] === b.dataset.g)) {
    E.group = b.dataset.g;
    refresh();
    window.scrollTo(0, 0);
  } else if (act === 'av-rand') { remember(); E.a = A.randomAvatar(Math.random, { sex: E.a.sex }); refresh(); }
  else if (act === 'av-undo' && E.hist.length) { E.a = norm(JSON.parse(E.hist.pop())); refresh(); }
  else if (act === 'av-save') await save(ctx);
  return true;
}
