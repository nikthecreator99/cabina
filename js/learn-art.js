// «Обучение» (2.24.0): рисунки в стиле макетов Никиты 06.11.2026 — ночной лес с закатом, дорога с шпалами, «шайбы» уроков,
// сундуки, фонари и светофоры, красная книга «ПТЭ», светофор в конце урока. Всё рисуем сами в SVG (без логотипов и надписей РЖД);
// цвета — из CSS (переменные --rd-*, --lr-*), поэтому рисунки работают в тёмной и светлой темах. Только строки разметки —
// без состояния и без обращений к данным. Электровоз с книгой на карточке курса (2.24.3) — не здесь: это картинка
// icons/learn/pte-course.webp из макета Никиты (он сделал его в ChatGPT), без надписей и логотипов.

const svg = (vb, w, h, body, cls = '') => `<svg class="${cls}" viewBox="${vb}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${body}</svg>`;

// ---------------------------------------------------------------- значки (24×24)
export const ART = {
  // серия: огонь (цвет — по классу: горит, если сегодня был урок)
  flame: (w = 22) => svg('0 0 24 24', w, w, `<path class="ic-fl-o" d="M12 22c-4.3 0-7.2-2.9-7.2-6.8 0-3.6 2.5-5.7 3.9-8.3.5 1.8 1.5 3 2.7 3.6-.2-3.2 1-6.2 3.6-8.6.2 3.7 1.8 5.8 3.4 7.9 1.1 1.5 1.7 3.2 1.7 5.4 0 3.9-3.4 6.8-8.1 6.8z"/><path class="ic-fl-i" d="M12 22c-1.9 0-3.2-1.3-3.2-3.1 0-1.8 1.2-2.8 2.2-4.2.4 1.1 1.1 1.6 1.7 1.9.1-1.2.7-2.3 1.5-3.1.8 1.7 1.9 2.8 1.9 4.8 0 2.2-1.7 3.7-4.1 3.7z"/>`, 'ic-flame'),
  // монеты: гайка, как на макете
  nut: (w = 22) => svg('0 0 24 24', w, w, `<path class="ic-nut-b" d="M7 3.3h10l5 8.7-5 8.7H7L2 12z"/><path class="ic-nut-t" d="M7 3.3h10l5 8.7H2z"/><circle class="ic-nut-h" cx="12" cy="12" r="4.3"/><path class="ic-nut-r" d="M8.6 10.6a3.6 3.6 0 0 1 6.8 0"/>`, 'ic-nut'),
  // очки опыта: молния
  bolt: (w = 22) => svg('0 0 24 24', w, w, '<path class="ic-bolt-p" d="M13.6 1.8 4.4 13.6h6.4l-1.3 8.6 10.1-12.5h-6.5z"/>', 'ic-bolt'),
  // профиль обучения (2.24.3): человек — закрашенный, двухцветный (просьба Никиты: «ярче, не просто белый контур»)
  person: (w = 24) => svg('0 0 24 24', w, w, '<path class="ic-me-b" d="M3.7 20.6c.9-4.5 4.1-7.2 8.3-7.2s7.4 2.7 8.3 7.2c.15.8-.45 1.5-1.25 1.5H4.95c-.8 0-1.4-.7-1.25-1.5z"/><circle class="ic-me-h" cx="12" cy="7.6" r="4.7"/><path class="ic-me-l" d="M9.4 6.1a3 3 0 0 1 2.3-1.6"/>', 'ic-me'),
  trophy: (w = 22) => svg('0 0 24 24', w, w, '<path class="ic-cup-h" d="M7 6.2H3.8v1.3c0 2.6 1.7 4.3 4.3 4.6M17 6.2h3.2v1.3c0 2.6-1.7 4.3-4.3 4.6"/><path class="ic-cup" d="M6.6 3.2h10.8v5.1a5.4 5.4 0 0 1-10.8 0z"/><path class="ic-cup-s" d="M10.3 13.4h3.4l.6 4H9.7z"/><rect class="ic-cup" x="7.4" y="17.2" width="9.2" height="3.6" rx="1.2"/><path class="ic-cup-l" d="M9.4 5.4v2.6"/>', 'ic-trophy'),
  target: (w = 22) => svg('0 0 24 24', w, w, '<circle class="ic-tg" cx="11" cy="13" r="8.2"/><circle class="ic-tg" cx="11" cy="13" r="4.4"/><circle class="ic-tg-c" cx="11" cy="13" r="1.5"/><path class="ic-tg" d="m11 13 8.4-8.4M16.6 4.4l2.8-2.8.3 3 3 .3-2.8 2.8"/>', 'ic-target'),
  watch: (w = 22) => svg('0 0 24 24', w, w, '<circle class="ic-sw" cx="12" cy="13.6" r="7.8"/><path class="ic-sw" d="M10 2.6h4M12 2.6v3.2M12 13.6V9.4M18.4 6.8l1.6-1.6"/>', 'ic-watch'),
  snow: (w = 22) => svg('0 0 24 24', w, w, '<path class="ic-snow" d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2"/><path class="ic-snow" d="m9.4 4.6 2.6 1.9 2.6-1.9M9.4 19.4l2.6-1.9 2.6 1.9M4.4 10.6l2.9-.9-.3-3M19.6 13.4l-2.9.9.3 3M4.4 13.4l2.9.9-.3 3M19.6 10.6l-2.9-.9.3-3"/>', 'ic-snowf'),
  battery: (w = 22) => svg('0 0 24 24', w, w, '<rect class="ic-bat" x="2.8" y="7" width="16.4" height="10" rx="2.4"/><path class="ic-bat" d="M21.2 10.4v3.2"/><path class="ic-bat-f" d="M6.2 9.8h6.4v4.4H6.2z"/>', 'ic-battery'),
  share: (w = 24) => svg('0 0 24 24', w, w, '<path class="ic-line" d="M12 15.5V3.6M7.6 7.8 12 3.4l4.4 4.4M8 10.6H6.4a1.6 1.6 0 0 0-1.6 1.6v7.2A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.6-1.6v-7.2a1.6 1.6 0 0 0-1.6-1.6H16"/>', 'ic-share'),
  chevDown: (w = 16) => svg('0 0 24 24', w, w, '<path class="ic-line" d="m6 9 6 6 6-6"/>', 'ic-chev'),
  // шайбы на дороге: открытая книга (текущий урок), замок (впереди), галочка (пройден)
  book: (w = 34) => svg('0 0 32 32', w, w, '<path class="nd-book" d="M3.4 7.4c4.2-1.5 8.4-1.2 12.6 1.2v17.2c-4.2-2.4-8.4-2.7-12.6-1.2zM28.6 7.4c-4.2-1.5-8.4-1.2-12.6 1.2v17.2c4.2-2.4 8.4-2.7 12.6-1.2z"/><path class="nd-book-l" d="M6.6 11.4c2.3-.5 4.6-.2 6.6.8M6.6 15.4c2.3-.5 4.6-.2 6.6.8M6.6 19.4c2.3-.5 4.6-.2 6.6.8M25.4 11.4c-2.3-.5-4.6-.2-6.6.8M25.4 15.4c-2.3-.5-4.6-.2-6.6.8M25.4 19.4c-2.3-.5-4.6-.2-6.6.8"/>', 'nd-ico'),
  lock: (w = 30) => svg('0 0 32 32', w, w, '<path class="nd-lock-s" d="M10.6 14.6v-3.4a5.4 5.4 0 0 1 10.8 0v3.4"/><rect class="nd-lock-b" x="7.4" y="14" width="17.2" height="13.2" rx="3"/><path class="nd-lock-k" d="M16 18.6a1.7 1.7 0 0 0-1 3.1v2.1h2v-2.1a1.7 1.7 0 0 0-1-3.1z"/>', 'nd-ico'),
  check: (w = 32) => svg('0 0 32 32', w, w, '<path class="nd-check" d="m8 16.6 5.2 5.2L24.4 10.4"/>', 'nd-ico'),
};

// ---------------------------------------------------------------- сундук (64×56): закрыт / открыт
const CHEST_BODY = `<ellipse class="ch-shadow" cx="32" cy="52" rx="26" ry="3.6"/>
  <rect class="ch-wood" x="6" y="25" width="52" height="25" rx="3"/>
  <path class="ch-plank" d="M8 33.5h48M8 42h48"/>
  <rect class="ch-gold" x="11" y="25" width="6" height="25"/><rect class="ch-gold" x="47" y="25" width="6" height="25"/>
  <rect class="ch-gold" x="6" y="24" width="52" height="4" rx="1.5"/>`;
export const CHEST = {
  closed: () => svg('0 0 64 56', 64, 56, `${CHEST_BODY}
    <path class="ch-lid" d="M6 26v-8.5C6 10.6 11.6 6 18.4 6h27.2C52.4 6 58 10.6 58 17.5V26z"/>
    <path class="ch-plank" d="M8 17.5h48"/>
    <path class="ch-gold" d="M11 26V8.6c1.8-1 3.9-1.8 6-2.2V26zM53 26V8.6c-1.8-1-3.9-1.8-6-2.2V26z"/>
    <path class="ch-shine" d="M14 10.6c4-2.6 10-3.4 18-3.4"/>
    <rect class="ch-gold" x="26.5" y="20" width="11" height="14" rx="2.2"/><path class="ch-key" d="M32 24.2a1.6 1.6 0 0 0-.9 2.9v2.6h1.8v-2.6a1.6 1.6 0 0 0-.9-2.9z"/>`, 'chest'),
  open: () => svg('0 0 64 56', 64, 56, `<path class="ch-in" d="M9 25 14.5 6.5h35L55 25z"/><path class="ch-gold-s" d="M9 25 14.5 6.5h35L55 25"/>
    <circle class="ch-coin" cx="24" cy="22.5" r="4"/><circle class="ch-coin" cx="32" cy="20" r="4"/><circle class="ch-coin" cx="40" cy="22.5" r="4"/>
    ${CHEST_BODY}<rect class="ch-gold" x="26.5" y="24" width="11" height="9" rx="2"/>`, 'chest is-open'),
};

// ---------------------------------------------------------------- красная книга «ПТЭ» (модуль на дороге)
export const PTE_BOOK = (w = 56) => svg('0 0 60 66', w, Math.round(w * 1.1), `<g transform="rotate(-8 30 34)">
    <rect class="bk-pages" x="13" y="11" width="38" height="50" rx="3"/>
    <path class="bk-pages-l" d="M48 16v41M45.5 16v41"/>
    <rect class="bk-mark1" x="47" y="17" width="9" height="7" rx="1.5"/><rect class="bk-mark2" x="47" y="27" width="9" height="7" rx="1.5"/>
    <rect class="bk-cover" x="8" y="6" width="40" height="52" rx="4"/>
    <rect class="bk-spine" x="8" y="6" width="6" height="52" rx="2"/>
    <text class="bk-t" x="31" y="26" text-anchor="middle">ПТЭ</text>
    <path class="bk-rail" d="M26.5 33v13M35.5 33v13M23.5 36h15M23.5 40h15M23.5 44h15"/>
  </g>`, 'pte-book');

// ---------------------------------------------------------------- конец урока: путь уходит вдаль, светофор — зелёный
export const END_SCENE = svg('0 0 240 156', 240, 156, `
  <defs><radialGradient id="es-glow"><stop offset="0" stop-color="#3ee06a" stop-opacity=".75"/><stop offset="1" stop-color="#3ee06a" stop-opacity="0"/></radialGradient></defs>
  <path class="es-hz" d="M24 104h66M138 104h80"/>
  <path class="es-tree" d="M58 104 66 84h-4l8-14h-3l7-12 7 12h-3l8 14h-4l8 20z"/>
  <path class="es-tree" d="M84 104l5-12h-3l5-8h-2l5-8 5 8h-2l5 8h-3l5 12z"/>
  <path class="es-sleep" d="M104 108h32M100 114h40M95 121h50M89 130h62M82 141h76"/>
  <path class="es-rail" d="M113 104 76 154M127 104l37 50"/>
  <path class="es-mast" d="M180 104V82"/><rect class="es-base" x="172" y="100" width="16" height="8" rx="1.5"/>
  <circle class="es-glow" cx="180" cy="62" r="22"/>
  <rect class="es-head" x="163" y="10" width="34" height="66" rx="11"/>
  <circle class="es-off" cx="180" cy="26" r="8"/><circle class="es-off" cx="180" cy="44" r="8"/><circle class="es-on" cx="180" cy="62" r="8.4"/>
`, 'lp-scene');

// ---------------------------------------------------------------- дорога: украшения по сторонам (символы для <use>)
// Ёлки, кусты, камни, фонари со светом, светофор, флажок у начала пути, опоры контактной сети на горизонте.
export const ROAD_DEFS = `<defs>
  <radialGradient id="rd-g-warm"><stop offset="0" stop-color="#ffcf70" stop-opacity=".55"/><stop offset=".45" stop-color="#ffb347" stop-opacity=".18"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
  <radialGradient id="rd-g-red"><stop offset="0" stop-color="#ff3b30" stop-opacity=".7"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>
  <pattern id="rd-gravel" width="14" height="14" patternUnits="userSpaceOnUse"><rect class="rd-bal" width="14" height="14"/><circle class="rd-grv" cx="3" cy="4" r="1.3"/><circle class="rd-grv2" cx="10" cy="2.5" r="1"/><circle class="rd-grv2" cx="8" cy="10" r="1.4"/><circle class="rd-grv" cx="1.5" cy="11" r="1"/></pattern>
  <symbol id="rd-s-tree" viewBox="0 0 40 72"><path class="rd-tree" d="M20 0 8 18h5L3 34h6L0 52h17v12h6V52h17l-9-18h6L27 18h5z"/><path class="rd-tree-l" d="M20 0 8 18h5L3 34h6L0 52h20z"/></symbol>
  <symbol id="rd-s-trees" viewBox="0 0 80 84"><use href="#rd-s-tree" x="0" y="10" width="40" height="72"/><use href="#rd-s-tree" x="34" y="0" width="46" height="84"/></symbol>
  <symbol id="rd-s-bush" viewBox="0 0 56 30"><path class="rd-bush" d="M6 30c-6 0-7-8-2-11 0-7 8-10 13-6 3-6 12-6 15 0 5-3 12 0 12 6 6 0 9 7 4 11z"/><path class="rd-bush-l" d="M14 16c2-2 5-3 8-2M30 11c2-1 5-1 7 1"/><circle class="rd-leaf" cx="18" cy="21" r="1.6"/><circle class="rd-leaf" cx="34" cy="18" r="1.4"/><circle class="rd-leaf" cx="42" cy="24" r="1.6"/></symbol>
  <symbol id="rd-s-grass" viewBox="0 0 30 16"><path class="rd-grass" d="M2 16c2-6 4-10 7-14M8 16c0-5 1-9 4-12M14 16c1-6 3-10 7-13M20 16c1-4 4-8 8-10M5 16c-1-4-1-7-3-9"/></symbol>
  <symbol id="rd-s-rock" viewBox="0 0 48 30"><path class="rd-rock" d="M4 29c-4 0-5-4-2-8 2-6 6-11 12-13 6-3 13-2 19 1 7 3 13 9 14 15 1 3-1 5-4 5z"/><path class="rd-rock-l" d="M11 13c4-3 9-5 15-4"/></symbol>
  <symbol id="rd-s-lamp" viewBox="0 0 70 110" overflow="visible"><circle cx="35" cy="22" r="34" fill="url(#rd-g-warm)"/><rect class="rd-pole" x="33" y="22" width="4" height="82"/><rect class="rd-pole" x="28" y="100" width="14" height="6" rx="2"/><path class="rd-lamp-h" d="M27 14h16l-2 14H29z"/><rect class="rd-lamp-c" x="26" y="11" width="18" height="4" rx="2"/><rect class="rd-lamp-l" x="30" y="16" width="10" height="10" rx="2"/></symbol>
  <symbol id="rd-s-signal" viewBox="0 0 60 120" overflow="visible"><circle cx="30" cy="20" r="26" fill="url(#rd-g-red)"/><rect class="rd-pole" x="27" y="40" width="6" height="70"/><rect class="rd-pole-b" x="16" y="106" width="28" height="12" rx="2"/><rect class="rd-sig-h" x="17" y="4" width="26" height="40" rx="9"/><circle class="rd-sig-r" cx="30" cy="16" r="6"/><circle class="rd-sig-o" cx="30" cy="32" r="6"/></symbol>
  <symbol id="rd-s-flag" viewBox="0 0 50 90"><rect class="rd-pole" x="6" y="4" width="3.4" height="80"/><path class="rd-flag" d="M9.4 6c8 3 14-3 24 0 6 2 9 1 12 0v20c-3 1-6 2-12 0-10-3-16 3-24 0z"/><ellipse class="rd-shadow" cx="8" cy="86" rx="8" ry="3"/></symbol>
</defs>`;

// Горизонт в начале дороги: небо с закатом (солнце село справа), облака в его свете, дальний лес, опоры контактной сети с проводами,
// ближний лес зубчатой кромкой
export const ROAD_SKY = (w) => {
  const masts = [w * 0.62, w * 0.78, w * 0.93].map((x, i) => `<path class="sk-mast" d="M${x.toFixed(0)} ${132 - i * 6}V${62 - i * 4}M${(x - 9).toFixed(0)} ${66 - i * 4}h22"/>`).join('');
  // зубчатая кромка леса: ёлки разной высоты
  let edge = `M0 150V120`;
  for (let x = 0; x <= w + 16; x += 16) {
    const h = 18 + ((x * 7919) % 23);
    edge += `L${x + 8} ${120 - h}L${x + 16} 120`;
  }
  edge += `V150z`;
  let far = `M0 150V112`;
  for (let x = 0; x <= w + 22; x += 22) far += `L${x + 11} ${92 - ((x * 104729) % 17)}L${x + 22} 112`;
  far += 'V150z';
  const cloud = (x, y, k) => `M${x.toFixed(0)} ${y}c${8 * k} ${-6 * k} ${22 * k} ${-6 * k} ${30 * k} 0c${10 * k} ${-4 * k} ${24 * k} ${-2 * k} ${30 * k} ${4 * k}H${(x - 6 * k).toFixed(0)}z`;
  return `<svg class="rd-sky" viewBox="0 0 ${w} 150" width="${w}" height="150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><linearGradient id="rd-sky-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sk-1"/><stop offset=".5" class="sk-2"/><stop offset=".8" class="sk-3"/><stop offset="1" class="sk-4"/></linearGradient>
      <radialGradient id="rd-sun-g" cx=".8" cy=".66" r=".5"><stop offset="0" class="sk-sun"/><stop offset="1" class="sk-sun0"/></radialGradient></defs>
    <rect width="${w}" height="150" fill="url(#rd-sky-g)"/><rect width="${w}" height="150" fill="url(#rd-sun-g)"/>
    <path class="sk-cloud" d="${cloud(w * 0.56, 42, 1)}"/><path class="sk-cloud sk-cloud2" d="${cloud(w * 0.8, 60, 0.8)}"/><path class="sk-cloud sk-cloud3" d="${cloud(w * 0.12, 34, 0.7)}"/>
    <path class="sk-far" d="${far}"/>
    <path class="sk-wire" d="M${w * 0.55} 66 ${w + 4} 56M${w * 0.55} 72 ${w + 4} 61"/>${masts}
    <path class="sk-edge" d="${edge}"/>
  </svg>`;
};
