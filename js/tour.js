// Подсказки при первом использовании: затемнение, подсветка элемента, стрелка и карточка с текстом.
import * as db from './db.js';
import { esc } from './ui.js';

let done = new Set();
let active = null;
const queue = [];
// «Пропустить» закрывает подсказки этого экрана: до перехода на другой экран (или перезапуска) новых не показываем,
// даже если экран перерисуется. screenKey задаёт app.js: вкладка или экран + число открытых окон.
let screenKey = () => '';
let skippedOn = null;
export const setTourScreen = (fn) => { screenKey = fn; };

const disabled = () => { try { return localStorage.getItem('cabina-tours-off') === '1'; } catch { return false; } };

export async function loadTours() {
  try { const m = await db.get('meta', 'tours'); done = new Set(m?.done || []); } catch { done = new Set(); }
}
export const tourDone = (id) => disabled() || done.has(id);
export const tourActive = () => !!active;
async function markDone(id) {
  done.add(id);
  try { await db.put('meta', { id: 'tours', done: [...done] }); } catch {}
}
// отметить подсказку показанной, не показывая (её шаг уже вошёл в общую подсказку)
export const markTourDone = (id) => (done.has(id) ? null : markDone(id));
export async function resetTours() {
  done = new Set();
  skippedOn = null;
  try { await db.put('meta', { id: 'tours', done: [] }); } catch {}
}

const ARROW_ARC = '<svg viewBox="0 0 44 56" width="40" height="52"><path d="M13 52C4 39 7 21 26 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M17 7.5 26.5 9.6 24.4 19" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_STRAIGHT = '<svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 49V6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M11 15 20 5.5 29 15" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const resolve = (t) => (typeof t === 'function' ? t() : document.querySelector(t));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/**
 * steps: [{ target, title, text, onShow?, pad?, arrow? }] — arrow: 'straight' — прямая стрелка ровно по центру элемента.
 * Шаги, чей элемент не найден, пропускаются. Тур показывается один раз.
 */
export function runTour(id, steps) {
  if (tourDone(id)) return;
  if (skippedOn !== null && skippedOn === screenKey()) return;
  if (active) { if (active.id !== id && !queue.some((q) => q.id === id)) queue.push({ id, steps }); return; }
  start(id, steps);
}

function start(id, allSteps) {
  // всегда сверху вниз и слева направо — в порядке расположения на экране
  const steps = allSteps.filter((s) => visible(resolve(s.target))).sort((a, b) => {
    const ea = resolve(a.target); const eb = resolve(b.target);
    if (ea === eb || ea.contains(eb) || eb.contains(ea)) return 0;
    return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  if (!steps.length) return;
  active = { id };
  const ov = document.createElement('div');
  ov.className = 'tour';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `<div class="tour-spot"></div>
    <div class="tour-arrow" aria-hidden="true"></div>
    <div class="tour-card" aria-live="polite"><div class="tour-body"></div>
      <div class="tour-foot"><button class="tour-skip" type="button">Пропустить</button><span class="tour-count"></span><button class="tour-next" type="button"></button></div></div>`;
  document.body.appendChild(ov);
  const spot = ov.querySelector('.tour-spot');
  const card = ov.querySelector('.tour-card');
  const arrow = ov.querySelector('.tour-arrow');
  const skip = ov.querySelector('.tour-skip');
  let i = 0;
  let target = null;

  function place() {
    if (!target || !document.body.contains(target)) return;
    const r = target.getBoundingClientRect();
    const pad = steps[i].pad ?? 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(4, r.top - pad);
    const left = Math.max(4, r.left - pad);
    const width = Math.min(vw - 8, r.right + pad) - left;
    const height = Math.min(vh - 4, r.bottom + pad) - top;
    Object.assign(spot.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` });
    const cw = Math.min(360, vw - 24);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight;
    const gap = 58; // место под стрелку
    const below = vh - (top + height);
    const above = top;
    let cardTop;
    let dir;
    if (below >= ch + gap + 12) { cardTop = top + height + gap; dir = 'up'; }
    else if (above >= ch + gap + 12) { cardTop = top - gap - ch; dir = 'down'; }
    else { cardTop = Math.max(12, vh - ch - 24); dir = cardTop > top + height / 2 ? 'up' : 'down'; }
    const cx = left + width / 2;
    const cardLeft = Math.min(Math.max(12, cx - cw / 2), vw - cw - 12);
    Object.assign(card.style, { top: `${cardTop}px`, left: `${cardLeft}px` });
    const showArrow = dir === 'up' ? cardTop - (top + height) >= 40 : top - (cardTop + ch) >= 40;
    arrow.hidden = !showArrow;
    if (showArrow) {
      const ay = dir === 'up' ? top + height + 2 : top - 54;
      const shift = steps[i].arrow === 'straight' ? 20 : dir === 'up' ? 24 : 16;
      Object.assign(arrow.style, { top: `${ay}px`, left: `${Math.min(Math.max(8, cx - shift), vw - 52)}px` });
      arrow.dataset.dir = dir;
    }
  }

  async function show(n) {
    i = n;
    const s = steps[i];
    target = resolve(s.target);
    if (!visible(target)) { if (i + 1 < steps.length) return show(i + 1); return finish(); }
    card.classList.add('swap');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(380);
    ov.querySelector('.tour-body').innerHTML = `${s.title ? `<div class="tour-title">${esc(s.title)}</div>` : ''}<div class="tour-text">${s.text}</div>`;
    ov.querySelector('.tour-count').textContent = steps.length > 1 ? `${i + 1} из ${steps.length}` : '';
    ov.querySelector('.tour-next').textContent = i + 1 < steps.length ? 'Дальше' : 'Понятно';
    skip.hidden = i + 1 >= steps.length; // на последнем шаге «Понятно» и так закрывает
    arrow.innerHTML = s.arrow === 'straight' ? ARROW_STRAIGHT : ARROW_ARC;
    place();
    card.classList.remove('swap');
    s.onShow?.(target);
    ov.querySelector('.tour-next').focus({ preventScroll: true });
  }

  function finish(skipped) {
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    ov.classList.add('closing');
    setTimeout(() => ov.remove(), 200);
    markDone(id);
    active = null;
    if (skipped === true) { queue.length = 0; skippedOn = screenKey(); return; } // «Пропустить» — без цепочки следующих подсказок
    const nxt = queue.shift();
    if (nxt) setTimeout(() => runTour(nxt.id, nxt.steps), 300);
  }
  const onKey = (e) => { if (e.key === 'Escape') finish(true); };

  skip.onclick = () => finish(true);
  ov.querySelector('.tour-next').onclick = () => (i + 1 < steps.length ? show(i + 1) : finish());
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);
  show(0);
}
