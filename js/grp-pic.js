// Картинка группы (2.27, просьба Никиты 10.11.2026). Рисуется кодом в SVG из короткого описания — фото и файлов нет:
//   { k: 'num',  n: 1…99 }                         — готовая цифра;
//   { k: 'art',  a: 'eloc' | 'diesel' | … }        — готовый рисунок (поезда, светофор, рельсы — нарисованы здесь же, свои);
//   { k: 'text', t: 'ТД-64', f: 'u'|'o', sz: 1…3 }  — свой текст до 8 знаков, шрифт Unbounded или Onest (оба — OFL, лежат в fonts/);
//   у всех: sh — форма ('sq' квадрат, 'rnd' скруглённый, 'circle' круг), bg — цвет фона 0…7.
// То же описание проверяет сервер (private.clean_pic, миграция 0009). Всё с сервера — только через normPic; текст — через esc().
import { esc, openLayer, closeLayer, sheet, small, I } from './ui.js';

export const PIC_BG = ['#2f5bd3', '#d83a3a', '#1f8a5b', '#e07b1f', '#7446c8', '#14808e', '#3b4352', '#b4870f'];
export const PIC_BG_NAMES = ['Синий', 'Красный', 'Зелёный', 'Оранжевый', 'Фиолетовый', 'Бирюзовый', 'Графит', 'Золотой'];
export const PIC_SHAPES = [['sq', 'Квадрат'], ['rnd', 'Скруглённый'], ['circle', 'Круг']];
export const PIC_FONTS = [['u', 'Unbounded'], ['o', 'Onest']];
export const PIC_SIZES = [[1, 'Мелкий'], [2, 'Средний'], [3, 'Крупный']];
export const PIC_TEXT_MAX = 8;
const TEXT_OK = /^[0-9A-Za-zА-Яа-яЁё №.-]{1,8}$/;

// Готовые рисунки: свои, простые, без надписей и логотипов. c — цвет фона (для «окон» и фар).
const ART = {
  eloc: ['Электровоз', (c) => `<path d="M37 24 50 13 63 24M50 13v13" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="27" y="26" width="46" height="50" rx="9" fill="#fff"/><rect x="33" y="32" width="34" height="16" rx="3.5" fill="${c}"/>
    <circle cx="37" cy="63" r="4.5" fill="${c}"/><circle cx="63" cy="63" r="4.5" fill="${c}"/><rect x="45" y="59" width="10" height="8" rx="2" fill="${c}" opacity=".55"/>
    <path d="M33 76 29 84M67 76l4 8M20 86h60" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`],
  diesel: ['Тепловоз', (c) => `<rect x="12" y="40" width="76" height="24" rx="4" fill="#fff"/><path d="M60 40V27h22a6 6 0 0 1 6 6v7z" fill="#fff"/>
    <rect x="66" y="31" width="16" height="9" rx="2" fill="${c}"/><path d="M18 50h36" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <rect x="22" y="31" width="7" height="9" rx="1.5" fill="#fff"/>
    <g fill="${c}" stroke="#fff" stroke-width="3.5"><circle cx="26" cy="70" r="6"/><circle cx="41" cy="70" r="6"/><circle cx="59" cy="70" r="6"/><circle cx="74" cy="70" r="6"/></g>
    <path d="M8 79h84" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`],
  steam: ['Паровоз', (c) => `<circle cx="27" cy="17" r="5" fill="#fff" opacity=".55"/><circle cx="37" cy="12" r="6.5" fill="#fff" opacity=".75"/>
    <rect x="25" y="25" width="9" height="15" rx="2" fill="#fff"/><rect x="15" y="40" width="50" height="22" rx="11" fill="#fff"/>
    <path d="M60 30h26v32H60z" fill="#fff"/><rect x="66" y="35" width="14" height="10" rx="2" fill="${c}"/>
    <g fill="${c}" stroke="#fff" stroke-width="3.5"><circle cx="28" cy="70" r="7"/><circle cx="47" cy="70" r="7"/><circle cx="71" cy="69" r="9"/></g>
    <path d="M8 81h84" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`],
  light: ['Светофор', () => `<rect x="46" y="62" width="8" height="26" rx="2" fill="#fff"/><path d="M36 88h28" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <rect x="33" y="10" width="34" height="56" rx="17" fill="#141922" stroke="#fff" stroke-width="3"/>
    <circle cx="50" cy="24" r="7" fill="#ff5a52"/><circle cx="50" cy="38" r="7" fill="#ffd23f" opacity=".35"/><circle cx="50" cy="52" r="7" fill="#37d67a" opacity=".35"/>`],
  rails: ['Рельсы', () => `<circle cx="50" cy="26" r="11" fill="#fff" opacity=".85"/><path d="M8 40h84" stroke="#fff" stroke-width="2" opacity=".5"/>
    <path d="M18 92 46 40M82 92 54 40" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M24 82h52M31 69h38M37 58h26M41 50h18" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`],
  wheel: ['Колесо', (c) => `<circle cx="50" cy="50" r="31" fill="none" stroke="#fff" stroke-width="6"/><circle cx="50" cy="50" r="24" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>
    <path d="M50 26v48M26 50h48M33 33l34 34M67 33 33 67" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="8" fill="#fff"/><circle cx="50" cy="50" r="3" fill="${c}"/>`],
  wagon: ['Вагон', (c) => `<rect x="12" y="28" width="76" height="38" rx="3" fill="#fff"/><path d="M40 33v28M60 33v28M40 47h20" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <g fill="${c}" stroke="#fff" stroke-width="3.5"><circle cx="23" cy="72" r="6"/><circle cx="36" cy="72" r="6"/><circle cx="64" cy="72" r="6"/><circle cx="77" cy="72" r="6"/></g>
    <path d="M8 81h84" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`],
  cap: ['Фуражка', (c) => `<path d="M14 44c0-12 18-20 36-20s36 8 36 18c0 4-4 7-9 7H23c-5 0-9-1-9-5z" fill="#fff"/>
    <rect x="22" y="49" width="56" height="12" rx="3" fill="#fff"/><path d="M24 55h52" stroke="${c}" stroke-width="3" opacity=".6"/>
    <path d="M24 61c6 12 46 12 52 0" fill="#fff"/><circle cx="50" cy="38" r="6" fill="${c}"/><circle cx="50" cy="38" r="2.5" fill="#fff"/>`],
};
export const PIC_ARTS = Object.keys(ART);

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const cleanText = (s) => String(s ?? '').replace(/[\s\u0000-\u001f]+/g, ' ').trim();

// Только известные поля и значения; плохое — null (тогда рисуем картинку по умолчанию)
export function normPic(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const sh = x.sh == null ? 'rnd' : x.sh;
  const bg = x.bg == null ? 0 : x.bg;
  if (!PIC_SHAPES.some(([k]) => k === sh) || !Number.isInteger(bg) || bg < 0 || bg > 7) return null;
  if (x.k === 'num') {
    const n = typeof x.n === 'string' && /^\d+$/.test(x.n) ? Number(x.n) : x.n;
    return Number.isInteger(n) && n >= 1 && n <= 99 ? { k: 'num', n, sh, bg } : null;
  }
  if (x.k === 'art') return typeof x.a === 'string' && own(ART, x.a) ? { k: 'art', a: x.a, sh, bg } : null;
  if (x.k === 'text') {
    const t = cleanText(x.t);
    const f = x.f == null ? 'u' : x.f;
    const sz = x.sz == null ? 2 : x.sz;
    if (!TEXT_OK.test(t) || !['u', 'o'].includes(f) || ![1, 2, 3].includes(sz)) return null;
    return { k: 'text', t, f, sz, sh, bg };
  }
  return null;
}
export const picText = (s) => cleanText(s).replace(/[^0-9A-Za-zА-Яа-яЁё №.-]/g, '').slice(0, PIC_TEXT_MAX).trim();

let seq = 0;
// Описание → SVG. Нет картинки — синий скруглённый квадрат с «плитками», как раньше.
export function picSvg(pic, { size = 44, label = '' } = {}) {
  const p = normPic(pic);
  const id = `gpic${++seq}`;
  const sh = p?.sh || 'rnd';
  const c = PIC_BG[p ? p.bg : 0];
  const shape = sh === 'circle' ? '<circle cx="50" cy="50" r="50"/>' : `<rect width="100" height="100" rx="${sh === 'sq' ? 8 : 24}"/>`;
  let inner;
  if (!p) {
    inner = '<g fill="none" stroke="#fff" stroke-width="5.5"><rect x="27" y="27" width="19" height="19" rx="5"/><rect x="54" y="27" width="19" height="19" rx="5"/><rect x="27" y="54" width="19" height="19" rx="5"/><rect x="54" y="54" width="19" height="19" rx="5"/></g>';
  } else if (p.k === 'art') {
    const draw = ART[p.a][1](c);
    inner = sh === 'circle' ? `<g transform="translate(10 10) scale(.8)">${draw}</g>` : draw;
  } else {
    const t = p.k === 'num' ? String(p.n) : p.t;
    const font = p.k === 'num' || p.f === 'u' ? 'Unbounded' : 'Onest';
    const k = font === 'Unbounded' ? 0.8 : 0.62;       // примерная ширина знака относительно размера шрифта
    const base = p.k === 'num' ? (t.length > 1 ? 50 : 60) : [0, 24, 32, 42][p.sz];
    const maxW = sh === 'circle' ? 72 : 84;
    const fs = Math.max(10, Math.min(base, maxW / (Math.max(1, [...t].length) * k)));
    inner = `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="${font}, Onest, sans-serif" font-weight="800" font-size="${fs.toFixed(1)}">${esc(t)}</text>`;
  }
  const aria = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="gpic-svg" width="${size}" height="${size}" viewBox="0 0 100 100" ${aria} focusable="false">
    <defs><clipPath id="${id}">${shape}</clipPath></defs>
    <g clip-path="url(#${id})"><rect width="100" height="100" fill="${c}"/><path d="M0 0h100v38C70 52 30 52 0 38z" fill="#fff" opacity=".1"/>${inner}</g></svg>`;
}

// Картинка по умолчанию для новой группы: текст из названия («ТД-64»), иначе электровоз
export function picFromName(name) {
  const t = picText(String(name || '').split(/\s+/).find((w) => picText(w)) || '');
  return t ? { k: 'text', t, f: 'u', sz: 2, sh: 'rnd', bg: 0 } : { k: 'art', a: 'eloc', sh: 'rnd', bg: 0 };
}

// ---------------------------------------------------------------- окно «Картинка группы»

// Возвращает: описание — сохранить; null — убрать картинку; undefined — закрыли без изменений
export function openPicEditor({ name = '', pic = null } = {}) {
  return new Promise((resolve) => {
    let result;
    let cur = normPic(pic) || picFromName(name);
    if (cur.k === 'num') cur = { k: 'art', a: 'eloc', sh: cur.sh, bg: cur.bg }; // цифры убраны из редактора (просьба Никиты 11.11.2026); старая цифра у группы остаётся, пока картинку не изменят
    const last = { art: { k: 'art', a: 'eloc' }, text: { k: 'text', t: picFromName(name).t || 'ТД-64', f: 'u', sz: 2 } };
    last[cur.k] = { ...cur };
    const segBtns = (list, act, val) => list.map(([k, v]) => `<button type="button" data-act="${act}" data-v="${k}" aria-pressed="${String(k) === String(val)}"${act === 'gpic-font' ? ` class="gpic-font-${k}"` : ''}>${esc(v)}</button>`).join('');
    const kindHtml = () => {
      if (cur.k === 'art') {
        return `<div class="gpic-tiles gpic-arts" role="group" aria-label="Рисунок">${PIC_ARTS.map((a) => `<button type="button" class="gpic-art" data-act="gpic-a" data-v="${a}" aria-pressed="${cur.a === a}" aria-label="${esc(ART[a][0])}">${picSvg({ k: 'art', a, sh: cur.sh, bg: cur.bg }, { size: 52 })}</button>`).join('')}</div>`;
      }
      return `<div class="pay-field"><label for="gpic-text">Текст на картинке</label>
          <input class="input" id="gpic-text" maxlength="${PIC_TEXT_MAX}" autocomplete="off" spellcheck="false" placeholder="Например, ТД-64" value="${esc(cur.t)}">
          <div class="hint">До ${PIC_TEXT_MAX} знаков: буквы, цифры, пробел, «-», «.», «№».</div></div>
        <div class="gpic-label">Размер текста</div><div class="seg" id="gpic-sz">${segBtns(PIC_SIZES, 'gpic-sz', cur.sz)}</div>
        <div class="gpic-label">Шрифт</div><div class="seg" id="gpic-f">${segBtns(PIC_FONTS, 'gpic-font', cur.f)}</div>`;
    };
    const body = () => `<div class="gpic-edit" id="gpic-edit">
      <div class="gpic-preview" id="gpic-preview">${picSvg(cur, { size: 112, label: 'Так будет выглядеть картинка' })}</div>
      <div class="seg" id="gpic-kind" role="group" aria-label="Что на картинке">${segBtns([['art', 'Рисунок'], ['text', 'Текст']], 'gpic-kind', cur.k)}</div>
      <div id="gpic-kind-box">${kindHtml()}</div>
      <div class="gpic-label">Форма</div><div class="seg" id="gpic-sh">${segBtns(PIC_SHAPES, 'gpic-sh', cur.sh)}</div>
      <div class="gpic-label">Цвет фона</div>
      <div class="gpic-colors" role="radiogroup" aria-label="Цвет фона">${PIC_BG.map((col, i) => `<button type="button" class="gpic-color" role="radio" data-act="gpic-bg" data-v="${i}" aria-checked="${cur.bg === i}" aria-label="${PIC_BG_NAMES[i]}" style="--c:${col}"></button>`).join('')}</div>
      <p class="hint">Картинку видят участники группы и те, кого в неё пригласили. Не пишите служебную информацию.</p>
      <div id="gpic-err" class="acc-err" role="alert" aria-live="assertive"></div>
      ${pic ? `<button class="link-btn gpic-clear" data-act="gpic-clear" id="gpic-clear">${small(I.trash, 16)} Убрать картинку</button>` : ''}</div>`;
    const el = openLayer(sheet({ title: 'Картинка группы', tall: true, body: body(),
      foot: '<button class="btn btn-primary" data-act="gpic-save" id="gpic-save">Сохранить</button>' }), { onClose: () => resolve(result) });
    const box = el.querySelector('.sheet-body');
    const redraw = (all = false) => {
      if (all) {
        const y = box.scrollTop;
        box.innerHTML = body();
        box.scrollTop = y;
      } else el.querySelector('#gpic-preview').innerHTML = picSvg(cur, { size: 112, label: 'Так будет выглядеть картинка' });
    };
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'gpic-text') return;
      cur = { ...cur, t: picText(e.target.value) };
      last.text = { ...cur };
      el.querySelector('#gpic-err').innerHTML = '';
      if (cur.t) redraw();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const v = b.dataset.v;
      switch (b.dataset.act) {
        case 'gpic-kind': if (v !== cur.k) { cur = { ...last[v], sh: cur.sh, bg: cur.bg }; redraw(true); } break;
        case 'gpic-a': cur = { ...cur, a: v }; last.art = { ...cur }; redraw(true); break;
        case 'gpic-sz': cur = { ...cur, sz: Number(v) }; last.text = { ...cur }; redraw(true); break;
        case 'gpic-font': cur = { ...cur, f: v }; last.text = { ...cur }; redraw(true); break;
        case 'gpic-sh': cur = { ...cur, sh: v }; redraw(true); break;
        case 'gpic-bg': cur = { ...cur, bg: Number(v) }; redraw(true); break;
        case 'gpic-save': {
          const p = normPic(cur);
          if (!p) {
            el.querySelector('#gpic-err').innerHTML = `<div class="error-box">${I.alert}<span>Впишите текст: буквы или цифры, до ${PIC_TEXT_MAX} знаков.</span></div>`;
            el.querySelector('#gpic-text')?.focus();
            return;
          }
          result = p; closeLayer(el); break;
        }
        case 'gpic-clear': result = null; closeLayer(el); break;
        default:
      }
    });
  });
}
