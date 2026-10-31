// Обновление свайпом вниз: потянули экран вниз в самом верху — подтягиваем свежие статусы коллег
// и проверяем новую версию. Анимаций несколько (для проверки, какая лучше): круг, поезд с дымом, светофор, колесо.
// Ничего не хранит и никуда не отправляет само: что обновлять, решает приложение (refresh).

export const PULL_STYLES = [
  { id: 'spin', name: 'Круг', text: 'Крутящийся круг, как в большинстве приложений' },
  { id: 'train', name: 'Поезд', text: 'Паровозик выезжает, дымит и «чух-чух»' },
  { id: 'light', name: 'Светофор', text: 'Тянете — горит красный, потом плавно жёлтый, а когда обновилось — зелёный' },
  { id: 'wheel', name: 'Колесо', text: 'Колесо локомотива раскручивается' },
];
export const pullStyle = (v) => (PULL_STYLES.some((s) => s.id === v) ? v : 'spin');

const ARM = 72; // столько пикселей (после торможения) — и можно отпускать
const MAX = 112; // дальше индикатор не опускается
const MIN_SHOW = { spin: 600, train: 1900, light: 1500, wheel: 900 }; // чтобы анимацию успели увидеть
const DONE_SHOW = { spin: 550, train: 700, light: 850, wheel: 550 };

// Ориентир: все рисунки в своих координатах, цвета — из темы
const TIES = Array.from({ length: 15 }, (_, i) => `<rect x="${i * 10 - 10}" y="39.5" width="5" height="3" rx="1"/>`).join('');
const ART = {
  spin: `<svg class="ptr-art" viewBox="0 0 32 32" width="30" height="30">
    <circle class="ptr-arc" cx="16" cy="16" r="11" fill="none" stroke-width="3.2" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
    <path class="ptr-ok" d="M10 16.5l4 4 8-9" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>`,
  train: `<svg class="ptr-art" viewBox="0 -6 120 50" width="120" height="50">
    <g class="ptr-ties">${TIES}</g>
    <line class="ptr-rail" x1="0" y1="39.5" x2="120" y2="39.5"/>
    <g class="ptr-loco">
      <g class="ptr-smoke"><circle cx="68" cy="7" r="3"/><circle cx="68" cy="7" r="3"/><circle cx="68" cy="7" r="3"/></g>
      <text class="ptr-chuh c1" x="78" y="5">чух</text><text class="ptr-chuh c2" x="97" y="-1">чух</text>
      <rect class="ptr-dark" x="64" y="9" width="8" height="10" rx="1"/><rect class="ptr-dark" x="62" y="7" width="12" height="3" rx="1.5"/>
      <rect class="ptr-body" x="38" y="17" width="40" height="14" rx="6"/>
      <rect class="ptr-body" x="24" y="10" width="18" height="21" rx="3"/>
      <rect class="ptr-dark" x="22" y="7.5" width="22" height="4" rx="2"/>
      <rect class="ptr-win" x="28" y="14" width="10" height="7" rx="2"/>
      <circle class="ptr-lamp" cx="79" cy="23" r="2.4"/>
      <path class="ptr-dark" d="M77 30h4l5 7h-9z"/>
      <rect class="ptr-dark" x="24" y="30" width="56" height="3" rx="1.5"/>
      <g class="ptr-wh"><circle cx="32" cy="35.5" r="4"/><line x1="32" y1="31.5" x2="32" y2="39.5"/></g>
      <g class="ptr-wh"><circle cx="50" cy="35" r="4.6"/><line x1="50" y1="30.4" x2="50" y2="39.6"/></g>
      <g class="ptr-wh"><circle cx="64" cy="35" r="4.6"/><line x1="64" y1="30.4" x2="64" y2="39.6"/></g>
      <line class="ptr-rod" x1="50" y1="37" x2="64" y2="37"/>
    </g></svg>`,
  light: `<svg class="ptr-art" viewBox="0 0 30 70" width="30" height="70">
    <rect class="ptr-mast" x="13" y="52" width="4" height="18" rx="1"/>
    <rect class="ptr-box" x="3" y="2" width="24" height="52" rx="12"/>
    <circle class="ptr-bulb" cx="15" cy="14" r="5.5"/><circle class="ptr-bulb" cx="15" cy="28" r="5.5"/><circle class="ptr-bulb" cx="15" cy="42" r="5.5"/>
    ${[['r', 14], ['y', 28], ['g', 42]].map(([c, y]) => `<g class="ptr-on ${c}"><circle class="ptr-halo" cx="15" cy="${y}" r="9"/><circle cx="15" cy="${y}" r="5.5"/></g>`).join('')}</svg>`,
  wheel: `<svg class="ptr-art" viewBox="0 0 40 40" width="34" height="34"><g class="ptr-wheel">
    <circle class="ptr-tire" cx="20" cy="20" r="16.5"/><circle class="ptr-rim" cx="20" cy="20" r="13"/>
    ${[0, 45, 90, 135].map((a) => `<line class="ptr-spoke" x1="20" y1="7.5" x2="20" y2="32.5" transform="rotate(${a} 20 20)"/>`).join('')}
    <path class="ptr-weight" d="M10.5 26.5a11 11 0 0 0 19 0a14 14 0 0 1-19 0z"/>
    <circle class="ptr-hub" cx="20" cy="20" r="4.2"/><circle class="ptr-pin" cx="20" cy="11" r="2.2"/></g></svg>`,
};

let el = null;
let content = null; // экран приложения: пока тянем, он сдвигается вниз, чтобы индикатор ничего не закрывал
let state = { busy: false, demo: false, gen: 0 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ensure() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'ptr';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}
function show(style) {
  ensure();
  el.dataset.style = style;
  el.className = 'ptr on';
  el.innerHTML = `<div class="ptr-bubble">${ART[style]}</div><div class="ptr-note">Обновлено</div>`;
  progress(0, 0);
}
// p — от 0 до 1 (1 — можно отпускать), y — насколько опущен индикатор
function progress(p, y) {
  el.style.setProperty('--p', p.toFixed(3));
  el.style.setProperty('--over', `${Math.round(Math.max(0, y - ARM) * 0.6)}px`);
  el.classList.toggle('armed', p >= 1);
  if (content && !el.classList.contains('demo')) {
    const h = el.firstElementChild?.offsetHeight || 0;
    const shift = Math.round(p * (h + 22) + Math.max(0, y - ARM) * 0.6);
    content.style.transform = shift ? `translateY(${shift}px)` : '';
  }
  const arc = el.querySelector('.ptr-arc');
  if (arc) arc.setAttribute('stroke-dasharray', `${Math.round(p * 82)} 100`);
}
function hide() {
  if (!el) return;
  if (content) { content.classList.add('ptr-glide'); content.style.transform = ''; setTimeout(() => content.classList.remove('ptr-glide'), 300); }
  el.classList.add('leaving');
  el.classList.remove('on');
  const node = el;
  setTimeout(() => { if (node.classList.contains('leaving')) { node.className = 'ptr'; node.innerHTML = ''; } }, 260);
}

// Обновление с анимацией. refresh() возвращает false, если не получилось (тогда без «Обновлено»).
async function run(style, refresh) {
  const gen = ++state.gen; // новый показ (другой вариант в Настройках) прерывает прежний
  const stale = () => gen !== state.gen;
  state.busy = true;
  content?.classList.add('ptr-glide');
  progress(1, ARM);
  el.classList.remove('armed');
  el.classList.add('loading', 'settle');
  const t0 = Date.now();
  let ok = false;
  try { ok = (await refresh()) !== false; } catch { ok = false; }
  const left = MIN_SHOW[style] - (Date.now() - t0);
  if (left > 0) await wait(left);
  if (stale()) return ok;
  el.classList.remove('loading');
  el.classList.add(ok ? 'done' : 'fail');
  // «Обновлено» под индикатором — экран сдвигается ещё чуть ниже, чтобы надпись ничего не закрывала
  if (ok && content && !el.classList.contains('demo')) {
    const room = (el.firstElementChild?.offsetHeight || 0) + 22 + (el.querySelector('.ptr-note')?.offsetHeight || 0) + 8;
    content.style.transform = `translateY(${room}px)`;
  }
  await wait(ok ? DONE_SHOW[style] : 350);
  if (stale()) return ok;
  hide();
  await wait(260);
  if (stale()) return ok;
  state.busy = false; state.demo = false;
  return ok;
}

// Показать анимацию без жеста (Настройки → выбор анимации)
export async function pullDemo(style) {
  if (state.busy && !state.demo) return; // идёт настоящее обновление
  state.demo = true;
  show(pullStyle(style));
  el.classList.add('demo');
  await run(pullStyle(style), () => wait(700));
}
export const pullBusy = () => state.busy;

// can(target) — можно ли сейчас тянуть (нет открытых окон, подсказок и т.п.); style() — какая анимация
export function initPull({ can, refresh, style, screen }) {
  content = screen || null;
  let g = null;
  const reset = () => { if (g?.on && !state.busy) hide(); g = null; };
  document.addEventListener('touchstart', (e) => {
    g = null;
    if (state.busy || e.touches.length !== 1 || window.scrollY > 0 || !can(e.target)) return;
    const t = e.touches[0];
    g = { x0: t.clientX, y0: t.clientY, on: false, p: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!g) return;
    if (e.touches.length !== 1) { reset(); return; }
    const t = e.touches[0];
    const dx = t.clientX - g.x0;
    const dy = t.clientY - g.y0;
    if (!g.on) {
      // только явное движение вниз в самом верху; вбок — это свайп удаления, вверх — обычная прокрутка
      if (dy > 10 && dy > Math.abs(dx) * 1.5 && window.scrollY <= 0) { g.on = true; g.y0 = t.clientY; show(style()); }
      else if (Math.abs(dx) > 10 || dy < -6) { g = null; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    const d = Math.max(0, t.clientY - g.y0);
    const y = MAX * (1 - Math.exp(-d / (MAX * 1.6))); // чем дальше, тем туже
    g.p = Math.min(1, y / ARM);
    progress(g.p, y);
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (!g?.on) { g = null; return; }
    const armed = g.p >= 1;
    g = null;
    if (armed) run(el.dataset.style, refresh); else hide();
  });
  document.addEventListener('touchcancel', reset);
}
