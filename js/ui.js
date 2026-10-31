// Общие элементы интерфейса: иконки, форматирование, слои (листы/диалоги), тосты.
const sv = (d, extra = '') => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const I = {
  home: sv('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
  route: sv('<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>'),
  grid: sv('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  moon: sv('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  calStar: sv('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m12 12 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke-width="1"/>'),
  sick: sv('<path d="M3 18v-8M3 15h18v3M21 15v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="12" r="1.8"/><path d="M15 3.5v4M13 5.5h4"/>'),
  vacation: sv('<path d="M12.6 10.2c-.2 3.6-.9 7.3-2.4 10.6" stroke-width="2.2"/><path d="M12.6 10.2C11.4 7 8.2 5.4 4.6 6.4c3 .1 5.5 1.5 8 3.8z" fill="currentColor"/><path d="M12.6 10.2c-2.9-.6-6 .9-7.3 4.1 2.2-1.9 4.6-2.8 7.3-4.1z" fill="currentColor"/><path d="M12.6 10.2c1.5-3.2 4.7-4.6 8.2-3.4-3 0-5.5 1.3-8.2 3.4z" fill="currentColor"/><path d="M12.6 10.2c2.9-.4 5.8 1.4 6.9 4.6-2.1-2-4.4-3.1-6.9-4.6z" fill="currentColor"/><circle cx="12" cy="11.6" r="1" fill="currentColor" stroke="none"/><path d="M4 21h16" stroke-width="1.8"/>'),
  medical: sv('<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="10" r="2"/><path d="M5 3h2M13 3h2"/>'),
  overtime: sv('<path d="M20 12.5A8 8 0 1 1 12 4.5"/><path d="M12 8.5V12l2.5 1.6"/><path d="M18 3v6M15 6h6"/>'),
  clock: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  train: sv('<rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 10h14"/><circle cx="9" cy="13.5" r="1" fill="currentColor"/><circle cx="15" cy="13.5" r="1" fill="currentColor"/><path d="m8 21 2-4M16 21l-2-4"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  left: sv('<path d="m15 5-7 7 7 7"/>'),
  right: sv('<path d="m9 5 7 7-7 7"/>'),
  x: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  trash: sv('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
  edit: sv('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  swap: sv('<path d="M7 4 4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/>'),
  folder: sv('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
  folderPlus: sv('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>'),
  file: sv('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/>'),
  pdf: sv('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path d="M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M12.5 12.5v4h.8a2 2 0 0 0 0-4zM16.5 16.5v-4h1.6M16.5 14.5h1.2" stroke-width="1.4"/>'),
  image: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>'),
  upload: sv('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"/>'),
  download: sv('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"/>'),
  share: sv('<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M6 11H5a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-6.5A1.5 1.5 0 0 0 19 11h-1"/>'),
  more: sv('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  note: sv('<path d="M5 4.5h14v10l-5 5H5z"/><path d="M14 19.5v-5h5M8.5 9h7M8.5 12.5h4"/>'),
  info: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>'),
  lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2"/>'),
  eye: sv('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: sv('<path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.7 3.4M6.6 7.2C4 8.9 2.5 12 2.5 12S6 18 12 18a9 9 0 0 0 4.4-1.1M3 3l18 18"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  excl: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V13M12 16.2v.2"/>'),
  shield: sv('<path d="M12 3.5 5 6v5.5c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
  alert: sv('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  monitor: sv('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>'),
  phone: sv('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  bed: sv('<path d="M3 18v-8M3 15h18v3M21 15v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="12" r="1.8"/>'),
  home2: sv('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M10 20v-5h4v5"/>'),
  passenger: sv('<circle cx="12" cy="5" r="2"/><path d="M9 21v-6l-2-1 1.5-5.5h7L17 14l-2 1v6"/>'),
  calendar: sv('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  database: sv('<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>'),
  globe: sv('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>'),
  wallet: sv('<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><path d="M16 13.5h1.5"/>'),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  user: sv('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>'),
  users: sv('<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c1-3.2 3.3-4.9 6.2-4.9s5.2 1.7 6.2 4.9"/><path d="M15.5 5.4a3.3 3.3 0 0 1 0 6.3M17.6 14.8c1.8.6 3 2.1 3.6 4.7"/>'),
  chart: sv('<path d="M4 20h16"/><rect x="6" y="11" width="3" height="7" rx="1"/><rect x="11" y="6" width="3" height="12" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  camera: sv('<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>'),
  qr: sv('<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 19.5h1.5M19.5 14v1.5M17 17h1"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  medal: sv('<circle cx="12" cy="15" r="5.5"/><path d="M8 3.5 11 9.6M16 3.5 13 9.6M7 3.5h3M14 3.5h3"/><path d="m12 12.4.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke-width="1"/>'),
  briefcase: sv('<rect x="3.5" y="7.5" width="17" height="12" rx="2.2"/><path d="M9 7.5v-2a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3.5 12.5h17M11 12.5v2h2v-2"/>'),
  learn: sv('<path d="M2.5 9.2 12 4.5l9.5 4.7L12 14z"/><path d="M6.5 11.3v4.3c1.6 1.5 3.5 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.3M21.5 9.2v5.3"/>'),
  chat: sv('<path d="M5 5h14a1.8 1.8 0 0 1 1.8 1.8v8.4A1.8 1.8 0 0 1 19 17h-8.5L6 20.5V17H5a1.8 1.8 0 0 1-1.8-1.8V6.8A1.8 1.8 0 0 1 5 5z"/><path d="M8 10h8M8 13h5"/>'),
  shoe: sv('<path d="M2.5 19.5h19"/><path d="M4 19.5 14.5 10H18v9.5"/><path d="M14.5 10V6.5H20"/><path d="M8 19.5l3.5-3.2"/>'),
  call: sv('<path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>'),
  book: sv('<path d="M6.5 3.5H18a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><circle cx="12" cy="10" r="2.3"/><path d="M8.5 16c.6-1.6 1.9-2.5 3.5-2.5s2.9.9 3.5 2.5M3 8h3M3 12h3M3 16h3"/>'),
  mail: sv('<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="m4 7 8 6 8-6"/>'),
  dice: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  refresh: sv('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>'),
  undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  face: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9 10.5h.01M15 10.5h.01" stroke-width="2.6"/><path d="M8.8 14.8q3.2 2.6 6.4 0"/>'),
  hair: sv('<path d="M5 15c0-6.2 3.1-10.5 7-10.5s7 4.3 7 10.5"/><path d="M5 15c2.2-1.2 4-4 5-7.2M19 15c-3-1-5.6-3.2-6.8-6.2"/><path d="M8.5 19.5c1 .6 2.2 1 3.5 1s2.5-.4 3.5-1"/>'),
  shirt: sv('<path d="M8 3.5l4 2.8 4-2.8 4.5 2.8-1.8 4.8-2.2-1V20.5H7.5V10.1l-2.2 1L3.5 6.3z"/>'),
  glasses: sv('<circle cx="7" cy="14" r="3.6"/><circle cx="17" cy="14" r="3.6"/><path d="M10.6 14q1.4-1.4 2.8 0M3.4 13 4.5 8M20.6 13 19.5 8"/>'),
  idea: sv('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  bed2: sv('<path d="M2.5 19v-9M2.5 15h19v4M21.5 15v-1.5a3 3 0 0 0-3-3H10v4.5"/><circle cx="6.5" cy="12" r="1.8"/>'),
};

export const small = (svg, s = 14) => svg.replace('width="22" height="22"', `width="${s}" height="${s}"`);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Поиск без учёта регистра и буквы «ё». Длина строки не меняется, поэтому позиции совпадений
// в нормализованном тексте совпадают с позициями в исходном.
export const normSearch = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
export const searchWords = (q) => normSearch(q).split(/\s+/).filter(Boolean);
// Текст с подсвеченными совпадениями (<mark>), всё остальное экранировано.
export function highlight(text, words) {
  const src = String(text ?? '');
  if (!words?.length) return esc(src);
  const low = normSearch(src);
  const marks = new Array(src.length).fill(false);
  for (const w of words) {
    let i = low.indexOf(w);
    while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = low.indexOf(w, i + w.length); }
  }
  let out = '';
  let k = 0;
  while (k < src.length) {
    const on = marks[k];
    let j = k;
    while (j < src.length && marks[j] === on) j++;
    out += on ? `<mark>${esc(src.slice(k, j))}</mark>` : esc(src.slice(k, j));
    k = j;
  }
  return out;
}

// ---- Даты ----
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const D = (ms) => new Date(ms);
export const hm = (ms) => `${String(D(ms).getUTCHours()).padStart(2, '0')}:${String(D(ms).getUTCMinutes()).padStart(2, '0')}`;
export const dayMonth = (ms) => `${D(ms).getUTCDate()} ${MONTHS_GEN[D(ms).getUTCMonth()]}`;
export function whenShort(ms, nowMs) {
  const d = Math.floor(ms / 86400000);
  const n = Math.floor(nowMs / 86400000);
  let day;
  if (d === n) day = 'сегодня';
  else if (d === n + 1) day = 'завтра';
  else if (d === n - 1) day = 'вчера';
  else day = `${D(ms).getUTCDate()} ${MONTHS_SHORT[D(ms).getUTCMonth()]}`;
  return `${day}, ${hm(ms)}`;
}
export function dateRange(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  if (a === b) return `${ad} ${MONTHS_GEN[am - 1]}`;
  if (ay === by && am === bm) return `${ad}–${bd} ${MONTHS_GEN[am - 1]}`;
  if (ay === by) return `${ad} ${MONTHS_SHORT[am - 1]} – ${bd} ${MONTHS_SHORT[bm - 1]}`;
  return `${ad}.${String(am).padStart(2, '0')}.${ay} – ${bd}.${String(bm).padStart(2, '0')}.${by}`;
}
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function fmtSize(b) {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} КБ`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} ГБ`;
}

// ---- Слои ----
const layersEl = () => document.getElementById('layers');
const stack = [];
const useHistory = (() => { try { return window.top === window; } catch { return false; } })();
let suppressPop = 0;

if (useHistory) {
  window.addEventListener('popstate', () => {
    if (suppressPop > 0) { suppressPop--; if (stack.length && !suppressPop) history.pushState({ cabina: 1 }, ''); return; }
    if (stack.length) {
      removeTop();
      if (stack.length) history.pushState({ cabina: 1 }, '');
    }
  });
}

function removeTop() {
  const top = stack.pop();
  if (!top) return;
  top.el.classList.add('closing');
  setTimeout(() => top.el.remove(), 180);
  if (!stack.length) document.body.style.overflow = '';
  top.onClose?.();
}

export function openLayer(html, { kind = 'sheet', onClose } = {}) {
  const el = document.createElement('div');
  el.className = `layer ${kind === 'dialog' ? 'dialog-layer' : ''}`;
  el.innerHTML = `<div class="scrim" data-close></div>${html}`;
  layersEl().appendChild(el);
  if (!stack.length && useHistory && !suppressPop) history.pushState({ cabina: 1 }, '');
  stack.push({ el, onClose });
  document.body.style.overflow = 'hidden';
  el.querySelector('.scrim').addEventListener('click', () => closeLayer(el));
  el.addEventListener('click', (e) => { if (e.target.closest('button[data-close]')) closeLayer(el); });
  return el;
}

export function closeLayer(el) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (el && top.el !== el) {
    if (!stack.some((s) => s.el === el)) return;
    while (stack.length && stack[stack.length - 1].el !== el) closeLayer();
  }
  if (stack.length === 1 && useHistory) { suppressPop++; history.back(); }
  removeTop();
}

export const topLayer = () => stack[stack.length - 1]?.el;
export const layerCount = () => stack.length;

export function sheet({ title, body, foot = '', tall = false, headRight = '', back = false }) {
  return `<section class="sheet ${tall ? 'tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="sheet-head">
      <button class="icon-btn" data-close aria-label="${back ? 'Назад' : 'Закрыть'}">${back ? I.left : I.x}</button>
      <h2>${esc(title)}</h2>${headRight}
    </header>
    <div class="sheet-body">${body}</div>
    ${foot ? `<footer class="sheet-foot">${foot}</footer>` : ''}
  </section>`;
}

export function confirmDialog({ title, text, ok = 'Удалить', cancel = 'Отмена', danger = true }) {
  return new Promise((resolve) => {
    let result = false;
    const el = openLayer(`<div class="dialog" role="alertdialog" aria-modal="true">
      <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="btns"><button class="btn btn-plain btn-sm" data-act="no">${esc(cancel)}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="yes">${esc(ok)}</button></div></div>`,
    { kind: 'dialog', onClose: () => resolve(result) });
    el.querySelector('[data-act="no"]').onclick = () => closeLayer(el);
    el.querySelector('[data-act="yes"]').onclick = () => { result = true; closeLayer(el); };
    el.querySelector('[data-act="yes"]').focus();
  });
}

// Пояснение по кнопке «!»: заголовок, текст и одна кнопка «Понятно»
export function infoDialog({ title, text }) {
  return new Promise((resolve) => {
    const el = openLayer(`<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="btns"><button class="btn btn-primary btn-sm" data-act="yes">Понятно</button></div></div>`,
    { kind: 'dialog', onClose: () => resolve() });
    el.querySelector('[data-act="yes"]').onclick = () => closeLayer(el);
    el.querySelector('[data-act="yes"]').focus();
  });
}

export function promptDialog({ title, value = '', placeholder = '', ok = 'Сохранить' }) {
  return new Promise((resolve) => {
    let result = null;
    const el = openLayer(`<form class="dialog" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      <input class="input" id="prompt-input" maxlength="120" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
      <div class="btns"><button type="button" class="btn btn-plain btn-sm" data-act="no">Отмена</button>
      <button type="submit" class="btn btn-primary btn-sm">${esc(ok)}</button></div></form>`,
    { kind: 'dialog', onClose: () => resolve(result) });
    const input = el.querySelector('input');
    el.querySelector('[data-act="no"]').onclick = () => closeLayer(el);
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) { input.classList.add('err'); input.focus(); return; }
      result = v; closeLayer(el);
    };
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}

export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    let result = null;
    const el = openLayer(sheet({
      title,
      body: `<div class="panel">${actions.map((a, i) => `<button class="row" data-i="${i}" style="${a.danger ? 'color:var(--holiday)' : ''}">
        <span class="ico" style="${a.danger ? '--c:var(--holiday)' : ''}">${a.icon || ''}</span><span class="grow t1">${esc(a.label)}</span></button>`).join('')}</div>`,
    }), { onClose: () => resolve(result) });
    el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { result = actions[+b.dataset.i].id; closeLayer(el); }; });
  });
}

// ---- Тосты ----
export function toast(text, { error = false, action, onAction, ms = 2800 } = {}) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  wrap.querySelectorAll('.toast:not(.sticky)').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = `toast ${error ? 'err' : ''} ${action ? 'sticky' : ''}`;
  t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { onAction?.(); t.remove(); };
  wrap.appendChild(t);
  if (!action) setTimeout(() => t.remove(), ms);
}

// ---- Сохранение файла на устройство ----
const inFrame = (() => { try { return window.top !== window; } catch { return true; } })();
let dlNs;
async function downloadsNs() {
  if (dlNs !== undefined) return dlNs;
  try { dlNs = window.claude?.use ? await window.claude.use('downloads') : null; } catch { dlNs = null; }
  return dlNs;
}
// Возвращает 'saved' | 'declined' | 'failed'
export async function saveToDevice(blob, filename) {
  if (inFrame) {
    const ns = await downloadsNs();
    if (ns) {
      try { await ns.save({ filename, data: blob }); return 'saved'; }
      catch (e) { return e?.code === 'declined' ? 'declined' : 'failed'; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'saved';
}

// ---- Долгое нажатие (≈0,5 с) по строке: onLong(row). Сдвинули палец — это прокрутка или свайп, не нажатие.
// После срабатывания обычное «нажатие» (click) этой строки гасится, чтобы не открылась форма.
export function attachLongPress(root, selector, onLong, ms = 520) {
  // swallow — «съесть» клик, который браузер может прислать, когда палец отпустили после долгого нажатия.
  // Новое касание его отменяет: следующее нажатие человека не должно пропасть.
  let p = null; let swallow = 0;
  const cancel = () => { if (p) clearTimeout(p.timer); p = null; };
  root.addEventListener('pointerdown', (e) => {
    cancel();
    swallow = 0;
    const row = e.target.closest(selector);
    if (!row || !root.contains(row) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    p = { x: e.clientX, y: e.clientY, id: e.pointerId, timer: setTimeout(() => { p = null; swallow = Date.now() + 1500; onLong(row); }, ms) };
  });
  root.addEventListener('pointermove', (e) => { if (p && e.pointerId === p.id && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => root.addEventListener(t, cancel));
  window.addEventListener('scroll', cancel, { passive: true });
  root.addEventListener('click', (e) => { if (Date.now() < swallow && e.target.closest(selector)) { swallow = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // долгое нажатие в браузере открывает своё меню — на этих строках оно не нужно
  root.addEventListener('contextmenu', (e) => { if (e.target.closest(selector)) e.preventDefault(); });
}

// ---- Свайп влево по строке списка (.swipe > .swipe-row) открывает кнопку удаления ----
// Возвращает { closeAll, busy }. Клик сразу после свайпа и тап по открытой строке «съедаются».
export function attachSwipe(root, W = 92) {
  let sw = null;
  let swallow = false;
  const opened = () => [...root.querySelectorAll('.swipe.open')];
  function set(el, x, animate) {
    const row = el.querySelector('.swipe-row');
    row.style.transition = animate ? '' : 'none';
    row.style.transform = x ? `translateX(${x}px)` : '';
    el.classList.toggle('open', x <= -W + 1);
    el.classList.toggle('revealing', x < 0);
  }
  const closeAll = (except) => opened().forEach((s) => { if (s !== except) set(s, 0, true); });
  root.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('selecting')) return; // режим выбора поездок: свайп выключен
    const row = e.target.closest('.swipe > .swipe-row');
    if (!row || !root.contains(row) || (e.pointerType === 'mouse' && e.button !== 0)) { if (!e.target.closest('.swipe-del')) closeAll(); return; }
    const el = row.parentElement;
    closeAll(el);
    sw = { el, row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: el.classList.contains('open') ? -W : 0, lock: null, x: 0 };
  });
  root.addEventListener('pointermove', (e) => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x0;
    const dy = e.clientY - sw.y0;
    if (!sw.lock) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.lock = 'h'; try { sw.row.setPointerCapture(e.pointerId); } catch {} }
      else if (Math.abs(dy) > 8) { sw = null; return; }
      else return;
    }
    e.preventDefault();
    let x = Math.min(0, sw.base + dx);
    if (x < -W) x = -W - (Math.min(60, -W - x) * 0.35); // упругость
    sw.x = x;
    set(sw.el, x, false);
  });
  function end(e) {
    if (!sw || e.pointerId !== sw.id) return;
    if (sw.lock === 'h') {
      swallow = true;
      setTimeout(() => { swallow = false; }, 350);
      set(sw.el, sw.x < -W / 2 ? -W : 0, true);
    }
    sw = null;
  }
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', (e) => { if (sw && sw.lock === 'h') end(e); else sw = null; });
  root.addEventListener('click', (e) => {
    if (swallow) { swallow = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.target.closest('.swipe.open > .swipe-row')) { closeAll(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  return { closeAll, busy: () => !!sw || !!root.querySelector('.swipe.revealing') };
}

// Заголовок экрана: кнопка «Назад» (data-act="back"), название, справа — кнопка по желанию
export function pageHead(title, { back = false, right = '' } = {}) {
  return `<div class="page-head">${back ? `<button class="icon-btn" data-act="back" aria-label="Назад">${I.left}</button>` : ''}<h1>${esc(title)}</h1>${right}</div>`;
}

// Кнопки −/+ со значением в часах и минутах
export function stepperHtml(id, value, { minus, plus, step = '30 минут', fmt }) {
  return `<div class="stepper">
    <button class="icon-btn" data-act="${minus}" aria-label="Уменьшить на ${step}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
    <output id="${id}" class="num">${fmt(value)}</output>
    <button class="icon-btn" data-act="${plus}" aria-label="Увеличить на ${step}">${small(I.plus, 18)}</button></div>`;
}
