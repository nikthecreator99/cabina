// Награды и рекорды (2.19, просьба Никиты): считаются в телефоне по записанным поездкам, никуда не отправляются.
// Два вида (со слов Никиты): со ступенями — бронза, серебро, золото, собирать долго; и повторяемые — без ступеней,
// даются каждый раз и копятся счётчиком «×N» (Новый год в поездке, поездка от 12 часов…). Закрытые — тёмные силуэты.
// Награда — состояние, а не запись: её всегда можно пересчитать из поездок (в резервную копию отдельно не попадает).
import { S, statsOf, isLive, myPay, routeOf, locoKey, normNum } from './store.js';
import { parseLocal, MIN, DAY, monthKeyOf, dateKeyOf, fmtDur } from './calc.js';
import { isHoliday } from './calendar.js';
import { isHeavy } from './pay.js';
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, plural, dayMonth, toast, MONTHS } from './ui.js';

const IRON_MIN = 12 * 60; // «Железная пятая точка»: поездка от 12 часов (согласовано с Никитой)
const WAIT_MIN = 4 * 60; // «Ждём-с»: ожидание следования за одну поездку
const CABIN_MIN = 200 * 60; // «Живу в кабине»: часов работы за месяц
const FAST_RATIO = 0.85; // «Ракета»: на 15% быстрее обычного по этому маршруту
const FAST_MIN_TRIPS = 3; // ...если до неё по маршруту уже было хотя бы 3 поездки
const H = 60;

// ---- рисунки: 64×64, круг-медаль цвета ступени и картинка поверх ----
export const TIER_NAMES = ['Бронза', 'Серебро', 'Золото'];
const TIER_KEYS = ['bronze', 'silver', 'gold'];
const TIER = { bronze: ['#b8733d', '#7d4a22'], silver: ['#9ea9b5', '#66727f'], gold: ['#e6b325', '#a67a0c'], special: ['#4f8fe6', '#2a5ea8'], repeat: ['#7c5cd6', '#4f35a3'], legend: ['#7fd3e6', '#3d8fa3'] };
const txt = (x, y, s, size = 9, fill = '#222') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Onest, sans-serif" font-size="${size}" font-weight="800" fill="${fill}">${s}</text>`;
const ties = (y, x0, x1, step = 6) => { let s = ''; for (let x = x0; x <= x1; x += step) s += `<rect x="${x}" y="${y}" width="3" height="3" rx=".6" fill="#fff" opacity=".75"/>`; return s; };
const sheets = (n) => `<rect x="19" y="15" width="22" height="29" rx="2.5" fill="#fff" opacity=".55" transform="rotate(-9 30 30)"/>
  <rect x="22" y="17" width="22" height="29" rx="2.5" fill="#fff"/><path d="M26 23h14M26 27h14M26 31h9" stroke="#9aa3ad" stroke-width="1.6" stroke-linecap="round"/>${txt(33, 42.5, n, n.length > 3 ? 7.5 : 9)}`;
const post = (n) => `<rect x="29" y="23" width="6" height="26" fill="#fff"/><path d="M29 29h6M29 35h6M29 41h6" stroke="#222" stroke-width="3"/>
  <rect x="14" y="12" width="36" height="13" rx="2" fill="#fff" stroke="#222" stroke-width="1.5"/>${txt(32, 21.5, n, n.length > 5 ? 7 : 8.5)}`;
const ART = {
  key: `<circle cx="24" cy="26" r="8" fill="none" stroke="#fff" stroke-width="4"/><path d="M30 32l14 14M38 40l4-4M42 44l4-4" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
  iron: `<rect x="11" y="47" width="42" height="5" rx="2.5" fill="#5a3a22"/>
    <ellipse cx="24.5" cy="35" rx="11.5" ry="12" fill="#d3d9e0" stroke="#4f5964" stroke-width="2"/><ellipse cx="39.5" cy="35" rx="11.5" ry="12" fill="#d3d9e0" stroke="#4f5964" stroke-width="2"/>
    <path d="M32 27.5c-1.6 4-1.6 12 0 17" fill="none" stroke="#4f5964" stroke-width="2" stroke-linecap="round"/><rect x="13.5" y="21" width="37" height="5.5" rx="2" fill="#6f7b88" stroke="#4f5964" stroke-width="1.5"/>
    <path d="M17 32c1-3.5 3.5-5.5 7-6M35 31.5c1-3 3-4.8 6-5.3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>
    ${[[16, 38], [19.5, 44], [26, 46.5], [38, 46.5], [44.5, 44], [48, 38], [18, 23.8], [25, 23.8], [32, 23.8], [39, 23.8], [46, 23.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#4f5964"/>`).join('')}`,
  rocket: `<path d="M32 10c7 6 9 15 7 25H25c-2-10 0-19 7-25z" fill="#fff"/><circle cx="32" cy="23" r="3.6" fill="#3b82f6"/>
    <path d="M25 29l-6 7v4l7-3zM39 29l6 7v4l-7-3z" fill="#ff5a3c"/><path d="M28 36l4 9 4-9z" fill="#ffd166"/>
    <path d="M12 51h40" stroke="#fff" stroke-width="2"/>${ties(52, 14, 50)}`,
  s50: sheets('50'), s300: sheets('300'), s1000: sheets('1000'),
  k10: post('10 000'), k100: post('100 000'),
  loco: `<rect x="18" y="13" width="28" height="35" rx="6" fill="#fff"/><rect x="22" y="17" width="20" height="11" rx="2" fill="#2b4a6f"/><rect x="31.2" y="17" width="1.6" height="11" fill="#fff"/>
    <circle cx="32" cy="34" r="3" fill="#ffd166"/><circle cx="24" cy="42" r="2.3" fill="#ffd166"/><circle cx="40" cy="42" r="2.3" fill="#ffd166"/>
    <rect x="15" y="47" width="34" height="3.5" rx="1" fill="#2b2f36"/><path d="M11 54h42" stroke="#fff" stroke-width="2"/>`,
  cal: `<rect x="16" y="18" width="32" height="30" rx="3.5" fill="#fff"/><path d="M16 21.5a3.5 3.5 0 0 1 3.5-3.5h25a3.5 3.5 0 0 1 3.5 3.5V27H16z" fill="#ff5a3c"/>
    <path d="M23 14v8M41 14v8" stroke="#2b2f36" stroke-width="3" stroke-linecap="round"/>${txt(32, 40.5, '200', 11)}${txt(32, 46, 'часов', 5)}`,
  earth: `<circle cx="32" cy="32" r="15" fill="#3b8fd9"/><path d="M24 21c4 0 6 3 5 6s-5 3-6 6-3 2-4-1 1-11 5-11zM36 36c3-1 7 0 7 3s-3 6-6 6-4-2-4-4 1-4 3-5zM37 20c3 0 5 2 4 4s-4 1-5-1z" fill="#4fbf6a"/>
    <ellipse cx="32" cy="32" rx="23" ry="7" fill="none" stroke="#fff" stroke-width="2.4" transform="rotate(-20 32 32)"/>`,
  moon: `<path d="M41 12a15 15 0 1 0 9 25a12 12 0 1 1-9-25z" fill="#fff3c4"/><circle cx="20" cy="18" r="1.3" fill="#fff"/><circle cx="16" cy="30" r="1" fill="#fff"/><circle cx="27" cy="12" r="1" fill="#fff"/>
    <path d="M18 55l9-16M34 55l-3-16" stroke="#fff" stroke-width="2"/><path d="M20 51h12M22.5 46h9.5M25 42h6.5" stroke="#fff" stroke-width="1.6" opacity=".8"/>`,
  owl: `<ellipse cx="32" cy="37" rx="13" ry="14" fill="#8b5e3c"/><ellipse cx="32" cy="41" rx="7" ry="8" fill="#c79a6b"/>
    <circle cx="26" cy="33" r="5" fill="#fff"/><circle cx="38" cy="33" r="5" fill="#fff"/><circle cx="26.5" cy="33.5" r="2.3" fill="#222"/><circle cx="37.5" cy="33.5" r="2.3" fill="#222"/>
    <path d="M30.5 37.5l1.5 3 1.5-3z" fill="#ffb020"/><path d="M20 25h24l-3-7H23z" fill="#1f3a5f"/><rect x="19" y="24" width="26" height="3" rx="1.2" fill="#14273f"/><path d="M25 27h14l-2 3H27z" fill="#111"/>`,
  lark: `<path d="M14 47a18 18 0 0 1 36 0z" fill="#ffd166"/><path d="M32 22v-6M18 30l-4-3M46 30l4-3M23 24l-2-5M41 24l2-5" stroke="#ffd166" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M24 37c4-5 10-5 13-1l7-3-3 6c-2 5-9 6-13 3l-6 1 2-4z" fill="#fff"/><circle cx="35.5" cy="35.5" r="1" fill="#222"/>`,
  case: `<path d="M26 25v-4c0-1 1-2 2-2h8c1 0 2 1 2 2v4" fill="none" stroke="#5a3a22" stroke-width="3"/><rect x="15" y="24" width="34" height="23" rx="4" fill="#8b5e3c"/>
    <circle cx="23" cy="33" r="4.2" fill="#ff5a3c"/><rect x="31" y="29" width="11" height="7" rx="1.5" fill="#3b82f6"/><circle cx="39" cy="41.5" r="2.8" fill="#ffd166"/><path d="M15 39h34" stroke="#5a3a22" stroke-width="1.5"/>`,
  sand: `<path d="M22 14h20M22 50h20" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M24 16c0 8 8 10 8 16s-8 8-8 16h16c0-8-8-10-8-16s8-8 8-16z" fill="none" stroke="#fff" stroke-width="2.5"/>
    <path d="M27 21h10c-1 4-5 6-5 8 0-2-4-4-5-8zM26 47c1-5 6-7 6-9 0 2 5 4 6 9z" fill="#ffd166"/>`,
  weight: `<path d="M26 26c0-8 12-8 12 0" fill="none" stroke="#2b2f36" stroke-width="4"/><circle cx="32" cy="32" r="9.5" fill="#2b2f36"/>${txt(32, 35.5, '32', 8, '#fff')}
    <rect x="11" y="42" width="42" height="5" rx="1" fill="#4f5964"/><circle cx="19" cy="49.5" r="3.6" fill="#222"/><circle cx="45" cy="49.5" r="3.6" fill="#222"/>`,
  tree: `<path d="M32 13l-9 11h5l-8 10h6l-9 11h30l-9-11h6l-8-10h5z" fill="#2e9e55"/><rect x="29" y="45" width="6" height="5" fill="#7a4a24"/>
    <path d="M32 7l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#ffd166"/>
    <circle cx="28" cy="28" r="1.9" fill="#ff5a3c"/><circle cx="36" cy="37" r="1.9" fill="#3b82f6"/><circle cx="27" cy="40" r="1.9" fill="#ffd166"/><circle cx="37" cy="27" r="1.6" fill="#fff"/>`,
  party: `<path d="M15 51l9-24 15 15z" fill="#ffb020"/><path d="M19 40l9 9M22 32l11 11" stroke="#ff5a3c" stroke-width="2.4"/>
    <rect x="38" y="14" width="4" height="4" rx="1" fill="#3b82f6" transform="rotate(20 40 16)"/><rect x="45" y="27" width="4" height="4" rx="1" fill="#4fbf6a" transform="rotate(-25 47 29)"/>
    <circle cx="31" cy="17" r="2" fill="#ff5a3c"/><circle cx="48" cy="18" r="1.8" fill="#fff"/><path d="M36 24c3-2 6-2 8 0M40 35c2-2 5-3 8-2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  tea: `<path d="M27 15c-2-3 2-4 0-7M33 15c-2-3 2-4 0-7" stroke="#fff" fill="none" stroke-width="1.6" opacity=".8" stroke-linecap="round"/><path d="M37 11l-4 15" stroke="#eee" stroke-width="1.6"/>
    <path d="M23 18h18l-2 23H25z" fill="#fff" opacity=".9"/><path d="M24.5 23h15l-1.6 17h-11.8z" fill="#c8641e"/>
    <path d="M42 31c7 0 7 11 0 11" fill="none" stroke="#c9ccd1" stroke-width="3"/><path d="M22 29h20l-2 17H24z" fill="#c9ccd1" stroke="#6f7b88" stroke-width="1.5"/>
    <path d="M25 34h14M25.5 39h13" stroke="#6f7b88" stroke-width="1.2"/><rect x="21" y="45" width="22" height="3" rx="1.2" fill="#6f7b88"/>`,
};

// ---- список наград ----
// goals — ступени: три (бронза, серебро, золото) или одна (особая награда, цвет color).
// kind: count — штуки, km — километры, dur — минуты. repeat — без ступеней, даётся каждый раз, показываем «×N».
const kmText = (v) => `${Math.round(v).toLocaleString('ru-RU')} км`;
const hText = (min) => `${Math.floor(min / 60).toLocaleString('ru-RU')} ч`;
export const AWARD_GROUPS = [['trips', 'Поездки'], ['km', 'Путь'], ['time', 'Время'], ['holidays', 'Праздники']];
export const AWARDS = [
  { id: 'first', g: 'trips', art: 'key', color: 'special', name: 'Добро пожаловать в кабину', how: 'Первая записанная поездка', fun: 'Ключ от кабины ваш. Дальше — только вперёд.', key: 'trips', goals: [1], unit: (n) => plural(n, 'поездка', 'поездки', 'поездок') },
  { id: 'trips', g: 'trips', art: ['s50', 's300', 's1000'], name: 'Маршрутные листы', how: 'Записанные поездки', fun: 'Маршрутными листами уже можно обклеить кабину.', key: 'trips', goals: [50, 300, 1000], unit: (n) => plural(n, 'поездка', 'поездки', 'поездок') },
  { id: 'iron', g: 'trips', art: 'iron', color: 'repeat', name: 'Железная пятая точка', how: 'Поездка 12 часов и дольше. Даётся за каждую такую поездку.', fun: '12 часов в кресле машиниста — тут любая точка станет железной.', key: 'iron', repeat: true, goals: [1] },
  { id: 'rocket', g: 'trips', art: 'rocket', color: 'repeat', name: 'Ракета', how: 'Поездка на 15% быстрее обычного по этому маршруту (когда по нему уже есть 3 поездки). Даётся каждый раз.', fun: 'Пролетели участок быстрее обычного.', key: 'rocket', repeat: true, goals: [1] },
  { id: 'heavy', g: 'trips', art: 'weight', name: 'Тяжеловес', how: 'Поезда тяжелее или длиннее нормы участка (норма — в маршруте)', fun: 'Локомотив кряхтел, но вёз.', key: 'heavy', goals: [10, 50, 200], unit: (n) => plural(n, 'поезд', 'поезда', 'поездов') },
  { id: 'loco', g: 'trips', art: 'loco', name: 'Знаток техники', how: 'Разные локомотивы — по серии и номеру', fun: 'У каждого локомотива свой характер, и вы с ними знакомы.', key: 'locos', goals: [10, 50, 150], unit: (n) => plural(n, 'локомотив', 'локомотива', 'локомотивов') },
  { id: 'km', g: 'km', art: ['k10', 'earth', 'k100'], name: 'Вёрсты', how: 'Пройденный путь по расстояниям маршрутов', fun: 'Километр к километру — и вот уже тысячи.', key: 'km', kind: 'km', goals: [10000, 40075, 100000], notes: ['', 'вокруг Земли', ''] },
  { id: 'moon', g: 'km', art: 'moon', color: 'legend', name: 'До Луны', how: '384 400 км — среднее расстояние до Луны', fun: 'Приехали! Дальше рельсы не проложены.', key: 'km', kind: 'km', goals: [384400] },
  { id: 'hours', g: 'time', art: 'tea', name: 'Часы в кабине', how: 'Всё отработанное время', fun: 'Чай в подстаканнике — лучший напарник.', key: 'work', kind: 'dur', goals: [500 * H, 2000 * H, 10000 * H] },
  { id: 'owl', g: 'time', art: 'owl', name: 'Ночная сова', how: 'Ночные часы — с 22:00 до 6:00', fun: 'Совы завидуют.', key: 'night', kind: 'dur', goals: [100 * H, 500 * H, 1000 * H] },
  { id: 'lark', g: 'time', art: 'lark', name: 'Жаворонок', how: 'Явки с 3 до 6 утра', fun: 'Будильник вас боится.', key: 'lark', goals: [10, 50, 150], unit: (n) => plural(n, 'явка', 'явки', 'явок') },
  { id: 'cabin', g: 'time', art: 'cal', color: 'repeat', name: 'Живу в кабине', how: 'Месяц, в котором 200 часов работы и больше. Даётся за каждый такой месяц.', fun: 'Дома спрашивают, кто это.', key: 'cabin', repeat: true, goals: [1] },
  { id: 'wait', g: 'time', art: 'sand', color: 'repeat', name: 'Ждём-с', how: 'Ожидание следования 4 часа и дольше за одну поездку. Даётся каждый раз.', fun: 'Терпение — железное.', key: 'wait', repeat: true, goals: [1] },
  { id: 'pass', g: 'time', art: 'case', name: 'Профессиональный пассажир', how: 'Следования пассажиром', fun: 'Проводники здороваются первыми.', key: 'pass', goals: [20, 100, 300], unit: (n) => plural(n, 'следование', 'следования', 'следований') },
  { id: 'newyear', g: 'holidays', art: 'tree', color: 'repeat', name: 'Дед Мороз', how: 'Встретить Новый год в поездке. Даётся за каждый такой Новый год.', fun: 'С праздником, коллега!', key: 'newyear', repeat: true, goals: [1] },
  { id: 'holiday', g: 'holidays', art: 'party', color: 'repeat', name: 'Праздник в кабине', how: 'Работа в официальный праздничный день. Даётся за каждый такой день.', fun: 'Пока все отдыхали, вы работали.', key: 'holiday', repeat: true, goals: [1] },
];
export const MEDALS_TOTAL = AWARDS.reduce((s, a) => s + a.goals.length, 0);

// Рисунок награды на ступени tier (0 — ещё не получена: рисуем первую ступень, тёмной её делает CSS)
export function awardArt(id, size = 64, tier = 1) {
  const a = AWARDS.find((x) => x.id === id);
  if (!a) return '';
  const i = Math.max(0, Math.min(a.goals.length, tier) - 1);
  const [fill, rim] = TIER[a.goals.length > 1 ? TIER_KEYS[i] : a.color];
  const art = ART[Array.isArray(a.art) ? a.art[i] : a.art];
  return `<svg class="aw-art" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${fill}" stroke="${rim}" stroke-width="3"/>
    <circle cx="32" cy="32" r="25.5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/>${art}</svg>`;
}
const goalText = (a, g) => (a.kind === 'km' ? kmText(g) : a.kind === 'dur' ? hText(g)
  : a.repeat ? `${g} ${plural(g, 'раз', 'раза', 'раз')}` : `${g.toLocaleString('ru-RU')} ${a.unit(g)}`);
const tierName = (a, tier) => (a.goals.length > 1 && tier > 0 ? TIER_NAMES[tier - 1] : '');

// ---- подсчёт ----
// медиана уже отсортированного списка; вставка в отсортированный — двоичным поиском (быстро и на тысячах поездок)
const median = (a) => { const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const insertSorted = (a, v) => { let lo = 0; let hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] <= v) lo = mid + 1; else hi = mid; } a.splice(lo, 0, v); };
const routeKey = (t) => t.routeId || routeOf(t).toLowerCase();

// trips — список поездок (по умолчанию все записанные).
// Возвращает { c: итоги, aw: { id: { tier — сколько ступеней, n — сколько раз (у повторяемых), days — день каждой ступени, last } }, records }.
export function computeAwards(trips = S.trips) {
  const done = trips.filter((t) => t.end && !isLive(t) && Number.isFinite(parseLocal(t.end)))
    .map((t) => ({ t, st: statsOf(t) })).filter((x) => x.st.work > 0)
    .sort((a, b) => a.st.end - b.st.end);
  const routes = new Map(S.routes.map((r) => [r.id, r]));
  const cfg = myPay();
  const c = { trips: 0, km: 0, noKm: 0, work: 0, night: 0, lark: 0, pass: 0, locos: 0, iron: 0, rocket: 0, heavy: 0, wait: 0, cabin: 0, newyear: 0, holiday: 0 };
  const aw = Object.fromEntries(AWARDS.map((a) => [a.id, { tier: 0, n: 0, days: [], last: null }]));
  const locos = new Set(); const years = new Set(); const hdays = new Set();
  const months = {}; const monthTrips = {}; const byRoute = new Map();
  const rec = { longest: null, monthHours: null, monthTrips: null, fastest: null };
  const check = (day) => {
    for (const a of AWARDS) {
      const s = aw[a.id];
      const v = c[a.key];
      while (s.tier < a.goals.length && v >= a.goals[s.tier]) { s.days.push(day); s.tier++; }
      if (a.repeat && v > s.n) { s.n = v; s.last = day; }
    }
  };
  for (const { t, st } of done) {
    const day = dateKeyOf(st.end);
    c.trips++;
    const dist = Number(routes.get(t.routeId)?.distanceKm) || 0;
    if (t.kind !== 'shunt') { if (dist > 0) c.km += dist; else c.noKm++; }
    c.work += st.work;
    c.night += st.night;
    c.pass += (t.passenger || []).length;
    const h = new Date(parseLocal(t.start)).getUTCHours();
    if (h >= 3 && h < 6) c.lark++;
    if (normNum(t.locoNumber)) { locos.add(locoKey(t.locoType, t.locoNumber)); c.locos = locos.size; }
    if (st.work >= IRON_MIN) c.iron++;
    const wait = (t.waiting || []).reduce((s, w) => s + Math.max(0, (parseLocal(w.end) - parseLocal(w.start)) / MIN || 0), 0);
    if (wait >= WAIT_MIN) c.wait++;
    if (!rec.longest || st.work > rec.longest.min) rec.longest = { t, min: st.work };
    if (isHeavy(t, cfg)) c.heavy++;
    if (st.holiday > 0) {
      for (const [s, e] of st.intervals) for (let d = Math.floor(s / DAY); d * DAY < e; d++) { const k = dateKeyOf(d * DAY); if (isHoliday(k)) hdays.add(k); }
      c.holiday = hdays.size;
    }
    const y = new Date(st.end).getUTCFullYear();
    if (st.start < parseLocal(`${y}-01-01T00:00`) && st.end > parseLocal(`${y}-01-01T00:00`)) { years.add(y); c.newyear = years.size; }
    for (const [mk, b] of Object.entries(st.byMonth)) {
      const was = months[mk] || 0;
      months[mk] = was + b.work;
      if (was < CABIN_MIN && months[mk] >= CABIN_MIN) c.cabin++;
      if (!rec.monthHours || months[mk] > rec.monthHours.min) rec.monthHours = { mk, min: months[mk] };
    }
    const smk = monthKeyOf(st.start);
    monthTrips[smk] = (monthTrips[smk] || 0) + 1;
    if (!rec.monthTrips || monthTrips[smk] > rec.monthTrips.n) rec.monthTrips = { mk: smk, n: monthTrips[smk] };
    // «Ракета»: быстрее обычного по маршруту на момент поездки — поздние поездки не отбирают уже полученную награду
    if (t.kind !== 'reserve' && t.kind !== 'shunt') {
      const k = routeKey(t);
      const d = (parseLocal(t.end) - parseLocal(t.start)) / MIN;
      if (k && d > 0) {
        const r = byRoute.get(k) || { list: [], sorted: [] };
        if (r.sorted.length >= FAST_MIN_TRIPS && d / median(r.sorted) <= FAST_RATIO) c.rocket++;
        r.list.push({ t, d });
        insertSorted(r.sorted, d);
        byRoute.set(k, r);
      }
    }
    check(day);
  }
  // рекорд «самая быстрая»: по маршруту, где хотя бы 3 поездки, — та, что короче всех относительно обычной (медианы)
  for (const { list, sorted } of byRoute.values()) {
    if (list.length < FAST_MIN_TRIPS) continue;
    const med = median(sorted);
    for (const x of list) {
      const ratio = x.d / med;
      if (ratio < 1 && (!rec.fastest || ratio < rec.fastest.ratio)) rec.fastest = { t: x.t, min: x.d, usual: med, ratio };
    }
  }
  return { c, aw, records: rec };
}
const medalsOf = (aw) => AWARDS.reduce((s, a) => s + aw[a.id].tier, 0);

// Что изменилось после сохранения: новые ступени, повторы («×N») и новый рекорд «самая долгая поездка»
export function awardSnapshot() {
  const { aw, records } = computeAwards();
  const state = Object.fromEntries(AWARDS.map((a) => [a.id, { tier: aw[a.id].tier, n: aw[a.id].n }]));
  return { state, longest: records.longest?.min || 0, longestId: records.longest?.t.id || null, trips: S.trips.filter((t) => t.end).length };
}
export function awardNews(before) {
  if (!before) return null;
  const now = awardSnapshot();
  const fresh = []; const repeats = [];
  for (const a of AWARDS) {
    const was = before.state[a.id] || { tier: 0, n: 0 };
    const cur = now.state[a.id];
    if (cur.tier > was.tier) fresh.push({ a, tier: cur.tier, n: cur.n });
    else if (a.repeat && cur.n > was.n) repeats.push({ a, tier: cur.tier, n: cur.n });
  }
  // рекорд — когда уже было с чем сравнить (хотя бы 5 поездок до этого)
  const record = before.trips >= 5 && now.longest > before.longest && now.longestId !== before.longestId ? now.longest : 0;
  return fresh.length || repeats.length || record ? { fresh, repeats, record } : null;
}

// Поздравление: новая ступень или рекорд — окном; повтор («Железная пятая точка ×3») — коротким сообщением внизу
const timesText = (n) => `×${n}`;
export function celebrate(news) {
  if (!news) return;
  try { if (localStorage.getItem('cabina-awards-quiet')) return; } catch { /* без хранилища — поздравляем как обычно */ } // для автотестов
  const repeats = news.repeats || [];
  if (!news.fresh.length && !news.record) {
    if (repeats.length) toast(`Награда: ${repeats.map((x) => `${x.a.name} ${timesText(x.n)}`).join(', ')}`);
    return;
  }
  const items = news.fresh.slice(0, 2);
  const more = news.fresh.length - items.length;
  const sub = (x) => [tierName(x.a, x.tier), x.a.repeat && x.n > 1 ? timesText(x.n) : ''].filter(Boolean).join(' · ');
  const el = openLayer(`<div class="dialog aw-dialog" role="dialog" aria-modal="true" aria-label="Новая награда">
    ${items.length ? `<div class="aw-row">${items.map((x) => `<div class="aw-pop">${awardArt(x.a.id, 84, x.tier)}<b>${esc(x.a.name)}</b>${sub(x) ? `<span class="aw-tier-name">${esc(sub(x))}</span>` : ''}<small>${esc(x.a.fun)}</small></div>`).join('')}</div>` : ''}
    ${more > 0 ? `<p>И ещё ${more} ${plural(more, 'награда', 'награды', 'наград')} — в профиле.</p>` : ''}
    ${repeats.length ? `<p class="t2">Ещё: ${esc(repeats.map((x) => `${x.a.name} ${timesText(x.n)}`).join(', '))}</p>` : ''}
    ${news.record ? `<p class="aw-record">${small(I.medal, 16)} Новый рекорд: самая долгая поездка — ${esc(fmtDur(news.record))}</p>` : ''}
    <h3>${items.length ? (items.length > 1 ? 'Новые награды!' : 'Новая награда!') : 'Новый рекорд!'}</h3>
    <div class="btns"><button class="btn btn-plain btn-sm" data-act="aw-later">Позже</button><button class="btn btn-primary btn-sm" data-act="aw-see">Награды</button></div></div>`, { kind: 'dialog' });
  el.querySelector('[data-act=aw-later]').onclick = () => closeLayer(el);
  el.querySelector('[data-act=aw-see]').onclick = () => { closeLayer(el); document.dispatchEvent(new CustomEvent('cabina:go', { detail: 'awards' })); };
}

// ---- значок награды: рисунок ступени, «×N» у повторяемых, точки ступеней ----
const pic = (a, s, size) => `<span class="aw-pic">${awardArt(a.id, size, s.tier)}${a.repeat && s.n > 0 ? `<span class="aw-n">${timesText(s.n)}</span>` : ''}</span>`;
const pips = (a, s) => (a.goals.length > 1 ? `<span class="aw-pips" aria-hidden="true">${TIER_KEYS.map((k, i) => `<i class="${i < s.tier ? k : ''}"></i>`).join('')}</span>` : '');
const awardLabel = (a, s) => [a.name, s.tier ? (tierName(a, s.tier) || 'получена') : 'пока не получена', a.repeat && s.n ? `${s.n} ${plural(s.n, 'раз', 'раза', 'раз')}` : ''].filter(Boolean).join(', ');

// ---- в профиле: полоска с наградами ----
const order = (aw) => [...AWARDS].sort((a, b) => (aw[b.id].tier > 0) - (aw[a.id].tier > 0)
  || aw[b.id].tier / b.goals.length - aw[a.id].tier / a.goals.length
  || (aw[b.id].last || aw[b.id].days.at(-1) || '').localeCompare(aw[a.id].last || aw[a.id].days.at(-1) || ''));
export function awardsStripHtml() {
  if (!S.trips.length) return '';
  const { aw, records } = computeAwards();
  const n = medalsOf(aw);
  const shown = order(aw).slice(0, 6);
  return `<div class="group" id="pr-awards"><div class="group-title">Награды <span class="hint">${n} из ${MEDALS_TOTAL}</span></div>
    <button class="panel aw-strip" data-act="go" data-page="awards" aria-label="Все награды: получено ${n} из ${MEDALS_TOTAL}">
      ${shown.map((a) => `<span class="aw-mini ${aw[a.id].tier ? '' : 'locked'}">${pic(a, aw[a.id], 44)}</span>`).join('')}<span class="chev">${small(I.right, 18)}</span></button>
    ${recordsRowHtml(records, 'pr-records')}</div>`;
}

// ---- экран «Награды» ----
const monthName = (mk) => `${MONTHS[Number(mk.slice(5, 7)) - 1].toLowerCase()} ${mk.slice(0, 4)}`;
const dayText = (key) => `${dayMonth(parseLocal(`${key}T00:00`))} ${key.slice(0, 4)}`;
const shortDay = (key) => `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
function recordsHtml(rec) {
  const rows = [];
  if (rec.longest) rows.push(['Самая долгая поездка', fmtDur(rec.longest.min), [routeOf(rec.longest.t), dayMonth(statsOf(rec.longest.t).start)].filter(Boolean).join(' · ')]);
  if (rec.fastest) rows.push(['Самая быстрая поездка', fmtDur(rec.fastest.min), `${routeOf(rec.fastest.t)} · обычно ${fmtDur(Math.round(rec.fastest.usual))}`]);
  if (rec.monthHours) rows.push(['Больше всего часов за месяц', fmtDur(rec.monthHours.min, { short: true }), monthName(rec.monthHours.mk)]);
  if (rec.monthTrips) rows.push(['Больше всего поездок за месяц', `${rec.monthTrips.n}`, monthName(rec.monthTrips.mk)]);
  if (!rows.length) return '';
  return `<div class="panel" id="aw-records">
    ${rows.map(([t, v, sub]) => `<div class="row"><span class="ico" style="--c:var(--warn)">${I.medal}</span><div class="grow"><div class="t1">${esc(t)}</div><div class="t2">${esc(sub)}</div></div><b class="num">${esc(v)}</b></div>`).join('')}
  </div>`;
}
// Строка «Рекорды» — открывает экран с рекордами (в профиле и на экране наград)
function recordsRowHtml(rec, id = 'aw-rec-row') {
  if (!rec.longest) return '';
  return `<div class="panel aw-rec-panel"><button class="row" data-act="go" data-page="records" id="${id}"><span class="ico" style="--c:var(--warn)">${I.medal}</span>
    <div class="grow"><div class="t1">Рекорды</div><div class="t2">Самая долгая поездка — ${esc(fmtDur(rec.longest.min))}</div></div>${small(I.right, 18)}</button></div>`;
}
export function renderRecords() {
  const { records } = computeAwards();
  const body = recordsHtml(records);
  return `${pageHead('Рекорды', { back: true })}
    ${body || `<div class="empty"><div class="em-ico">${I.medal}</div><b>Рекордов пока нет</b><p>Они появятся после первой законченной поездки.</p></div>`}
    ${body ? '<p class="lead-hint">Самая быстрая — по сравнению с обычным временем по этому маршруту, когда по нему есть хотя бы 3 поездки.</p>' : ''}`;
}
export function renderAwards() {
  const { aw, records } = computeAwards();
  const n = medalsOf(aw);
  return `${pageHead('Награды', { back: true })}
    <p class="lead-hint">Получено ${n} из ${MEDALS_TOTAL}. У наград со ступенями — бронза, серебро и золото. Остальные можно получать снова и снова: «×3» — сколько раз. Считаются по вашим поездкам в этом телефоне, никуда не отправляются.</p>
    ${recordsRowHtml(records)}
    ${AWARD_GROUPS.map(([g, title]) => `<div class="group"><div class="group-title">${title}</div><div class="aw-grid">
      ${AWARDS.filter((a) => a.g === g).map((a) => `<button class="aw ${aw[a.id].tier ? '' : 'locked'}" data-act="aw-open" data-id="${a.id}" aria-label="${esc(awardLabel(a, aw[a.id]))}">${pic(a, aw[a.id], 64)}<span class="aw-name">${esc(a.name)}</span>${pips(a, aw[a.id])}</button>`).join('')}
    </div></div>`).join('')}`;
}

function progressHtml(a, s, c) {
  if (a.repeat || s.tier >= a.goals.length) return '';
  const v = c[a.key] || 0;
  const goal = a.goals[s.tier];
  const pct = Math.min(100, (v / goal) * 100);
  const val = a.kind === 'km' ? kmText(v) : a.kind === 'dur' ? hText(v) : `${v}`;
  const to = a.goals.length > 1 ? `До ${['бронзы', 'серебра', 'золота'][s.tier]}: ` : '';
  return `<div class="aw-prog"><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="t2">${esc(`${to}${val} из ${goalText(a, goal)}`)}</div></div>`;
}
function tiersHtml(a, s) {
  if (a.goals.length < 2) return '';
  return `<div class="aw-tiers">${a.goals.map((g, i) => `<div class="aw-tier ${i < s.tier ? 'on' : ''}">${awardArt(a.id, 44, i + 1)}
    <b>${TIER_NAMES[i]}</b><small>${esc(goalText(a, g))}${a.notes?.[i] ? ` — ${esc(a.notes[i])}` : ''}</small>${i < s.tier ? `<small class="ok">${esc(shortDay(s.days[i]))}</small>` : ''}</div>`).join('')}</div>`;
}
export function openAward(id) {
  const a = AWARDS.find((x) => x.id === id);
  if (!a) return;
  const { aw, c } = computeAwards();
  const s = aw[a.id];
  const got = s.tier > 0;
  const gotLine = a.repeat && s.n
    ? `${small(I.check, 16)} Получали ${s.n} ${plural(s.n, 'раз', 'раза', 'раз')} · последний ${esc(dayText(s.last))}`
    : got && a.goals.length === 1 ? `${small(I.check, 16)} Получена ${esc(dayText(s.days[0]))}` : '';
  const done = s.tier >= a.goals.length && a.goals.length > 1 ? `<p class="ok-line">${small(I.check, 16)} Все ступени собраны</p>` : '';
  const kmHint = a.kind === 'km' && c.noKm > 0 ? `<div class="notice">${I.alert}<div>В ${c.noKm} ${plural(c.noKm, 'поездке', 'поездках', 'поездках')} у маршрута нет расстояния — они не идут в километры. Расстояние указывается в ☰ → «Маршруты».</div></div>` : '';
  const el = openLayer(sheet({
    title: 'Награда',
    body: `<div class="aw-detail ${got ? '' : 'locked'}">${pic(a, s, 120)}<h3>${esc(a.name)}</h3>
      ${tierName(a, s.tier) ? `<span class="aw-tier-name">${esc(tierName(a, s.tier))}</span>` : ''}
      <p class="t2">${esc(a.how)}</p>
      ${got ? `<p class="aw-fun">${esc(a.fun)}</p>` : ''}
      ${gotLine ? `<p class="ok-line">${gotLine}</p>` : ''}
      ${tiersHtml(a, s)}${progressHtml(a, s, c)}${done}
      ${!got && a.goals.length === 1 ? `<p class="t2">${a.repeat ? 'Пока не получали.' : 'Пока не получена.'}</p>` : ''}
      ${kmHint}</div>`,
  }));
  return el;
}
