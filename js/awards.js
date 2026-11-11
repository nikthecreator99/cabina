// Награды и рекорды (2.19, просьба Никиты): считаются в телефоне по записанным поездкам, никуда не отправляются.
// Два вида (со слов Никиты): со ступенями — бронза, серебро, золото, собирать долго; и повторяемые — без ступеней,
// даются каждый раз и копятся счётчиком «×N» (Новый год в поездке, поездка от 12 часов…). Закрытые — тёмные силуэты.
// Награда — состояние, а не запись: её всегда можно пересчитать из поездок (в резервную копию отдельно не попадает).
import { S, statsOf, isLive, myPay, routeOf, locoKey, normNum, saveProfile, locosOf, legKm, legKey } from './store.js';
import { parseLocal, MIN, DAY, monthKeyOf, dateKeyOf, fmtDur, hasLegs, legsOf } from './calc.js';
import { isHoliday } from './calendar.js';
import { heavyCount } from './pay.js';
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, plural, dayMonth, toast, MONTHS } from './ui.js';
import { isGuest } from './auth.js';

const IRON_MIN = 12 * 60; // «Железная пятая точка»: поездка от 12 часов (согласовано с Никитой)
const WAIT_MIN = 4 * 60; // «Ждём-с»: ожидание следования за одну поездку
const CABIN_MIN = 200 * 60; // «Рвач» (до 2.19.8 — «Живу в кабине»): часов работы за месяц
const FAST_RATIO = 0.85; // «Ракета»: на 15% быстрее обычного по этому пути (участок или его часть)
const FAST_MIN_TRIPS = 3; // ...если до неё по маршруту уже было хотя бы 3 поездки
const H = 60;

// ---- рисунки: 64×64, круг-медаль цвета ступени и картинка поверх ----
export const TIER_NAMES = ['Бронза', 'Серебро', 'Золото'];
const TIER_KEYS = ['bronze', 'silver', 'gold'];
const TIER = { bronze: ['#b8733d', '#7d4a22'], silver: ['#9ea9b5', '#66727f'], gold: ['#e6b325', '#a67a0c'], special: ['#4f8fe6', '#2a5ea8'], repeat: ['#7c5cd6', '#4f35a3'], legend: ['#7fd3e6', '#3d8fa3'] };
// Рисунки наград — картинки в icons/awards/ (192 px, WebP). Медаль (кольцо и цвет ступени) рисуем сами.
// Своя картинка у каждой ступени, если art — список; иначе одна картинка по id награды. Новый файл — добавить в SHELL (sw.js).
export const awardImg = (a, i = 0) => `icons/awards/${Array.isArray(a.art) ? a.art[i] : a.id}.webp`;

// ---- список наград ----
// goals — ступени: три (бронза, серебро, золото) или одна (особая награда, цвет color).
// kind: count — штуки, km — километры, dur — минуты. repeat — без ступеней, даётся каждый раз, показываем «×N».
const kmText = (v) => `${Math.round(v).toLocaleString('ru-RU')} км`;
const hText = (min) => `${Math.floor(min / 60).toLocaleString('ru-RU')} ч`;
export const AWARD_GROUPS = [['trips', 'Поездки'], ['km', 'Путь'], ['time', 'Время'], ['holidays', 'Праздники'], ['special', 'Особые']];
export const AWARDS = [
  { id: 'first', g: 'trips', color: 'special', name: 'Добро пожаловать в кабину', how: 'Первая записанная поездка', fun: 'Ключ от кабины ваш. Дальше — только вперёд.', key: 'trips', goals: [1], unit: (n) => plural(n, 'поездка', 'поездки', 'поездок') },
  { id: 'trips', g: 'trips', art: ['s50', 's300', 's1000'], name: 'Маршрутные листы', how: 'Записанные поездки', fun: 'Маршрутными листами уже можно обклеить кабину.', key: 'trips', goals: [50, 300, 1000], unit: (n) => plural(n, 'поездка', 'поездки', 'поездок') },
  { id: 'iron', g: 'trips', color: 'repeat', name: 'Железная пятая точка', how: 'Поездка 12 часов и дольше. Даётся за каждую такую поездку.', fun: '12 часов в кресле машиниста — тут любая точка станет железной.', key: 'iron', repeat: true, goals: [1] },
  { id: 'rocket', g: 'trips', color: 'repeat', name: 'Ракета', how: 'Поездка на 15% быстрее обычного между этими станциями (когда так уже ездили 3 раза). Даётся каждый раз.', fun: 'Пролетели участок быстрее обычного.', key: 'rocket', repeat: true, goals: [1] },
  { id: 'heavy', g: 'trips', name: 'Тяжеловес', how: 'Поезда тяжелее или длиннее нормы участка (норма — в настройках участка)', fun: 'Локомотив кряхтел, но вёз.', key: 'heavy', goals: [10, 50, 200], unit: (n) => plural(n, 'поезд', 'поезда', 'поездов') },
  { id: 'loco', g: 'trips', name: 'Знаток техники', how: 'Разные локомотивы — по серии и номеру', fun: 'У каждого локомотива свой характер, и вы с ними знакомы.', key: 'locos', goals: [10, 50, 150], unit: (n) => plural(n, 'локомотив', 'локомотива', 'локомотивов') },
  { id: 'km', g: 'km', art: ['k10', 'earth', 'k100'], name: 'Вёрсты', how: 'Пройденный путь по длине участков', fun: 'Километр к километру — и вот уже тысячи.', key: 'km', kind: 'km', goals: [10000, 40075, 100000], notes: ['', 'вокруг Земли', ''] },
  { id: 'moon', g: 'km', color: 'legend', name: 'До Луны', how: '384 400 км — среднее расстояние до Луны', fun: 'Приехали! Дальше рельсы не проложены.', key: 'km', kind: 'km', goals: [384400] },
  { id: 'hours', g: 'time', name: 'Часы в кабине', how: 'Всё отработанное время', fun: 'Чай в подстаканнике — лучший напарник.', key: 'work', kind: 'dur', goals: [500 * H, 2000 * H, 10000 * H] },
  { id: 'owl', g: 'time', name: 'Ночная сова', how: 'Ночные часы — с 22:00 до 6:00', fun: 'Совы завидуют.', key: 'night', kind: 'dur', goals: [100 * H, 500 * H, 1000 * H] },
  { id: 'lark', g: 'time', name: 'Жаворонок', how: 'Явки с 3 до 6 утра', fun: 'Будильник вас боится.', key: 'lark', goals: [10, 50, 150], unit: (n) => plural(n, 'явка', 'явки', 'явок') },
  { id: 'cabin', g: 'time', color: 'repeat', name: 'Рвач', how: 'Месяц, в котором 200 часов работы и больше. Даётся за каждый такой месяц.', fun: 'Дома спрашивают, кто это.', key: 'cabin', repeat: true, goals: [1] },
  { id: 'wait', g: 'time', color: 'repeat', name: 'Ждём-с', how: 'Ожидание следования 4 часа и дольше за одну поездку. Даётся каждый раз.', fun: 'Терпение — железное.', key: 'wait', repeat: true, goals: [1] },
  { id: 'pass', g: 'time', name: 'Профессиональный пассажир', how: 'Следования пассажиром', fun: 'Проводники здороваются первыми.', key: 'pass', goals: [20, 100, 300], unit: (n) => plural(n, 'следование', 'следования', 'следований') },
  { id: 'newyear', g: 'holidays', color: 'repeat', name: 'Дед Мороз', how: 'Встретить Новый год в поездке. Даётся за каждый такой Новый год.', fun: 'С праздником, коллега!', key: 'newyear', repeat: true, goals: [1] },
  { id: 'holiday', g: 'holidays', color: 'repeat', name: 'Праздник в кабине', how: 'Работа в официальный праздничный день. Даётся за каждый такой день.', fun: 'Пока все отдыхали, вы работали.', key: 'holiday', repeat: true, goals: [1] },
  // 2.19.4, просьба Никиты: за аккаунт CABINA. flag — «да или нет», без счёта и полоски прогресса
  { id: 'account', g: 'special', color: 'special', name: 'Свой человек', how: 'Создать аккаунт CABINA.', fun: 'Пропуск выдан — добро пожаловать в команду!', key: 'account', flag: true, goals: [1] },
  // 2.20: числа с сервера (засчитанные приглашения, принятые идеи) хранятся в телефоне и только растут — полученное не отбираем
  { id: 'mentor', g: 'special', name: 'Наставник', how: 'Коллеги, пришедшие по вашему личному приглашению: подтвердили почту и заходили в CABINA в 3 разных дня', fun: 'Вы привели коллег — теперь вы наставник.', key: 'invited', goals: [1, 5, 10], unit: (n) => plural(n, 'коллега', 'коллеги', 'коллег') },
  // 2.29, просьба Никиты: коллеги отметили «Полезно» вашу заметку о локомотиве. Число с сервера, только растёт; даётся каждый раз
  { id: 'useful', g: 'special', color: 'repeat', art: ['idea'], name: 'Полезный совет', how: 'Коллега отметил «Полезно» вашу заметку о локомотиве. Даётся за каждую такую отметку.', fun: 'Ваш совет пригодился коллеге в рейсе.', key: 'useful', repeat: true, goals: [1] },
  { id: 'idea', g: 'special', name: 'Идейный', how: 'Ваши идеи, которые приняли в CABINA («Ещё» → «Предложить идею»)', fun: 'Ваша идея сделала CABINA лучше.', key: 'ideas', goals: [1, 3, 10], unit: (n) => plural(n, 'идея', 'идеи', 'идей') },
];
export const MEDALS_TOTAL = AWARDS.reduce((s, a) => s + a.goals.length, 0);

// Рисунок награды на ступени tier (0 — ещё не получена: рисуем первую ступень, тёмной её делает CSS)
export function awardArt(id, size = 64, tier = 1) {
  const a = AWARDS.find((x) => x.id === id);
  if (!a) return '';
  const i = Math.max(0, Math.min(a.goals.length, tier) - 1);
  const [fill, rim] = TIER[a.goals.length > 1 ? TIER_KEYS[i] : a.color];
  return `<svg class="aw-art" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="${fill}" stroke="${rim}" stroke-width="3"/>
    <circle cx="32" cy="32" r="25.5" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/><image href="${awardImg(a, i)}" x="9" y="9" width="46" height="46"/></svg>`;
}
// цвета медали [заливка, кольцо] на ступени tier (1…3) — для картинок «Мой год»
export function awardColors(a, tier = 1) {
  const i = Math.max(0, Math.min(a.goals.length, tier) - 1);
  return TIER[a.goals.length > 1 ? TIER_KEYS[i] : a.color];
}
const goalText = (a, g) => (a.kind === 'km' ? kmText(g) : a.kind === 'dur' ? hText(g)
  : a.repeat ? `${g} ${plural(g, 'раз', 'раза', 'раз')}` : `${g.toLocaleString('ru-RU')} ${a.unit(g)}`);
const tierName = (a, tier) => (a.goals.length > 1 && tier > 0 ? TIER_NAMES[tier - 1] : '');

// ---- подсчёт ----
// медиана уже отсортированного списка; вставка в отсортированный — двоичным поиском (быстро и на тысячах поездок)
const median = (a) => { const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const insertSorted = (a, v) => { let lo = 0; let hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] <= v) lo = mid + 1; else hi = mid; } a.splice(lo, 0, v); };
// у поездки со сменой локомотива — свой «маршрут» из всех плеч: её время с обычной поездкой по одному плечу не сравниваем
// участок и его часть (2.25): Малошуйка → Поньга и весь участок — разные пути
const routeKey = (t) => (hasLegs(t) ? legsOf(t).map(legKey).join('+') : legKey(legsOf(t)[0]) || routeOf(t).toLowerCase());

// trips — список поездок (по умолчанию все записанные).
// Возвращает { c: итоги, aw: { id: { tier — сколько ступеней, n — сколько раз (у повторяемых), days — день каждой ступени, last } }, records }.
export function computeAwards(trips = S.trips) {
  const done = trips.filter((t) => t.end && !isLive(t) && Number.isFinite(parseLocal(t.end)))
    .map((t) => ({ t, st: statsOf(t) })).filter((x) => x.st.work > 0)
    .sort((a, b) => a.st.end - b.st.end);
  const cfg = myPay();
  const c = { account: 0, invited: 0, ideas: 0, useful: 0, trips: 0, km: 0, noKm: 0, work: 0, night: 0, lark: 0, pass: 0, locos: 0, iron: 0, rocket: 0, heavy: 0, wait: 0, cabin: 0, newyear: 0, holiday: 0 };
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
    // километры — по маршруту каждого локомотива; если у какого-то нет расстояния — подсказка в награде
    const dists = legsOf(t).map(legKm);
    if (t.kind !== 'shunt') { c.km += dists.reduce((a, b) => a + b, 0); if (dists.some((x) => !(x > 0))) c.noKm++; }
    c.work += st.work;
    c.night += st.night;
    c.pass += (t.passenger || []).length;
    const h = new Date(parseLocal(t.start)).getUTCHours();
    if (h >= 3 && h < 6) c.lark++;
    for (const l of locosOf(t)) if (normNum(l.number)) { locos.add(locoKey(l.type, l.number)); c.locos = locos.size; }
    if (st.work >= IRON_MIN) c.iron++;
    const wait = (t.waiting || []).reduce((s, w) => s + Math.max(0, (parseLocal(w.end) - parseLocal(w.start)) / MIN || 0), 0);
    if (wait >= WAIT_MIN) c.wait++;
    if (!rec.longest || st.work > rec.longest.min) rec.longest = { t, min: st.work };
    c.heavy += heavyCount(t, cfg);
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
  // «Свой человек»: отметка в телефоне (profile.accountAward — день получения), с сервера ничего не берём.
  // Из резервной копии — непроверенное, поэтому только строка-дата.
  const acc = S.profile?.accountAward;
  if (typeof acc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(acc)) { c.account = 1; Object.assign(aw.account, { tier: 1, days: [acc] }); }
  // «Наставник» и «Идейный»: числа, запомненные в телефоне (countOf), и день каждой ступени
  for (const [id, key] of [['mentor', 'invited'], ['idea', 'ideas']]) {
    const x = countOf(key);
    const a = AWARDS.find((y) => y.id === id);
    c[key] = x.n;
    const tier = a.goals.filter((g) => x.n >= g).length;
    Object.assign(aw[id], { tier, days: a.goals.slice(0, tier).map((g, i) => x.days[i] || x.days[x.days.length - 1] || null) });
  }
  // «Полезный совет» (2.29): повторяемая — счётчик «×N» отметок «Полезно» к моим заметкам
  { const x = countOf('useful'); c.useful = x.n; if (x.n > 0) Object.assign(aw.useful, { tier: 1, n: x.n, days: [x.days[0] || null], last: x.days[1] || x.days[0] || null }); }
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

// Отметить «Свой человек», когда в телефоне есть вход в аккаунт. Хранится только день; на сервер не уходит.
// После выхода или удаления аккаунта награда остаётся: отзыв согласия ничем не наказывается (152-ФЗ, ст. 9).
export async function grantAccountAward(day) {
  if (S.profile?.accountAward || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false;
  await saveProfile({ accountAward: day });
  return true;
}

// Числа с сервера, запомненные в телефоне: invited — засчитанные приглашения, ideas — принятые идеи,
// useful — отметки «Полезно» к моим заметкам о локомотивах (2.29; days — [первый раз, последний раз]).
// Из резервной копии — непроверенное: только целое число и даты. days[i] — день, когда достигнута i-я ступень.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function countOf(key, p = S.profile) {
  const x = p?.[key];
  const n = x && Number.isInteger(x.n) && x.n >= 0 && x.n <= 100000 ? x.n : 0;
  const days = Array.isArray(x?.days) ? x.days.filter((d) => typeof d === 'string' && DAY_RE.test(d)).slice(0, 3) : [];
  return { n, days };
}
// Запомнить новое число, если оно больше прежнего (меньше — не уменьшаем: коллега удалил аккаунт, идею стёрли — награда остаётся)
export async function noteCount(key, n, day) {
  if (!['invited', 'ideas', 'useful'].includes(key) || !Number.isInteger(n) || n < 0 || n > 100000 || !DAY_RE.test(day || '')) return false;
  const cur = countOf(key);
  if (n <= cur.n) return false;
  const a = AWARDS.find((x) => x.key === key);
  const days = a.repeat ? [cur.days[0] || day, day] : a.goals.map((g, i) => cur.days[i] || (n >= g ? day : null)).filter(Boolean);
  await saveProfile({ [key]: { n, days } });
  return true;
}

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
  if (isGuest()) { guestNudge(news); return; }
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

// Гость (2.26, просьба Никиты): награда заработана, но видна с аккаунтом. Окно — не чаще раза в 3 дня
// (сначала «Позже» → следующее только через 3 дня), в остальное время — короткое сообщение внизу. Какая именно награда — не говорим.
const NUDGE_KEY = 'cabina-guest-award';
export const NUDGE_EVERY = 3 * DAY;
function guestNudge(news) {
  let last = 0;
  try { last = Number(localStorage.getItem(NUDGE_KEY)) || 0; } catch {}
  const now = Date.now();
  const big = news.fresh.length || news.record;
  if (!big || now - last < NUDGE_EVERY) { toast(news.record && !news.fresh.length ? 'Новый рекорд — он ждёт вас в аккаунте' : 'Новая награда — она ждёт вас в аккаунте', { ms: 4000 }); return; }
  try { localStorage.setItem(NUDGE_KEY, String(now)); } catch {}
  const x = news.fresh[0];
  const many = news.fresh.length > 1;
  const title = x ? (many ? 'Новые награды!' : 'Новая награда!') : 'Новый рекорд!';
  const el = openLayer(`<div class="dialog aw-dialog gp-nudge" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="aw-row"><span class="gp-blur" aria-hidden="true">${x ? awardArt(x.a.id, 96, x.tier) : `<span class="gp-rec">${I.medal}</span>`}</span><span class="gp-lock-badge">${small(I.lock, 18)}</span></div>
    <h3>${title}</h3>
    <p>${!x ? 'Он ждёт' : many ? 'Они ждут' : 'Она ждёт'} вас в аккаунте. Зарегистрируйтесь бесплатно — и увидите.</p>
    <div class="btns"><button class="btn btn-plain btn-sm" data-act="aw-later">Позже</button><button class="btn btn-primary btn-sm" data-act="aw-signup">Зарегистрироваться</button></div></div>`, { kind: 'dialog' });
  el.querySelector('[data-act=aw-later]').onclick = () => closeLayer(el);
  el.querySelector('[data-act=aw-signup]').onclick = () => { closeLayer(el); document.dispatchEvent(new CustomEvent('cabina:go', { detail: 'signup' })); };
}

// ---- значок награды: рисунок ступени, «×N» у повторяемых, точки ступеней ----
const pic = (a, s, size) => `<span class="aw-pic">${awardArt(a.id, size, s.tier)}${a.repeat && s.n > 0 ? `<span class="aw-n">${timesText(s.n)}</span>` : ''}</span>`;
const pips = (a, s) => (a.goals.length > 1 ? `<span class="aw-pips" aria-hidden="true">${TIER_KEYS.map((k, i) => `<i class="${i < s.tier ? k : ''}"></i>`).join('')}</span>` : '');
const awardLabel = (a, s) => [a.name, s.tier ? (tierName(a, s.tier) || 'получена') : 'пока не получена', a.repeat && s.n ? `${s.n} ${plural(s.n, 'раз', 'раза', 'раз')}` : ''].filter(Boolean).join(', ');

// ---- в профиле: полоска с наградами ----
const order = (aw) => [...AWARDS].sort((a, b) => (aw[b.id].tier > 0) - (aw[a.id].tier > 0)
  || aw[b.id].tier / b.goals.length - aw[a.id].tier / a.goals.length
  || (aw[b.id].last || aw[b.id].days.at(-1) || '').localeCompare(aw[a.id].last || aw[a.id].days.at(-1) || ''));
// 2.22 (пример Никиты): заголовок «Награды» и справа «Все N из 39 ›»; в полоске — только полученные награды
// (пока полученных нет — первые, которые можно получить, серыми)
export function awardsStripHtml() {
  const { aw } = computeAwards();
  const n = medalsOf(aw);
  // без поездок полоска пустая, но награды без поездок бывают («Свой человек», «Идейный», «Наставник») — тогда показываем
  if (!S.trips.length && !n) return '';
  const all = order(aw);
  const got = all.filter((a) => aw[a.id].tier);
  const shown = (got.length ? got : all).slice(0, 6);
  return `<div class="group" id="pr-awards"><div class="group-title pr-gt"><span>Награды</span><button class="pr-all" data-act="go" data-page="awards" id="pr-awards-all">Все ${n} из ${MEDALS_TOTAL}${small(I.right, 16)}</button></div>
    <button class="panel aw-strip" data-act="go" data-page="awards" aria-label="Все награды: получено ${n} из ${MEDALS_TOTAL}">
      ${shown.map((a) => `<span class="aw-mini ${aw[a.id].tier ? '' : 'locked'}">${pic(a, aw[a.id], 52)}</span>`).join('')}</button></div>`;
}

// ---- экран «Награды» ----
const monthName = (mk) => `${MONTHS[Number(mk.slice(5, 7)) - 1].toLowerCase()} ${mk.slice(0, 4)}`;
// день неизвестен (число пришло из старой копии без дат) — без даты
const dayText = (key) => (key ? `${dayMonth(parseLocal(`${key}T00:00`))} ${key.slice(0, 4)}` : '');
const shortDay = (key) => (key ? `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}` : '✓');
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
    ${body ? '<p class="lead-hint">Самая быстрая — по сравнению с обычным временем между этими же станциями, когда так ездили хотя бы 3 раза.</p>' : ''}`;
}
export function renderAwards() {
  const { aw, records } = computeAwards();
  const n = medalsOf(aw);
  return `${pageHead('Награды', { back: true })}
    <p class="lead-hint">Получено ${n} из ${MEDALS_TOTAL}. У наград со ступенями — бронза, серебро и золото. Остальные можно получать снова и снова: «×3» — сколько раз. Считаются в этом телефоне по вашим записям, никуда не отправляются.</p>
    ${recordsRowHtml(records)}
    ${AWARD_GROUPS.map(([g, title]) => `<div class="group"><div class="group-title">${title}</div><div class="aw-grid">
      ${AWARDS.filter((a) => a.g === g).map((a) => `<button class="aw ${aw[a.id].tier ? '' : 'locked'}" data-act="aw-open" data-id="${a.id}" aria-label="${esc(awardLabel(a, aw[a.id]))}">${pic(a, aw[a.id], 64)}<span class="aw-name">${esc(a.name)}</span>${pips(a, aw[a.id])}</button>`).join('')}
    </div></div>`).join('')}`;
}

function progressHtml(a, s, c) {
  if (a.repeat || a.flag || s.tier >= a.goals.length) return '';
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
  const kmHint = a.kind === 'km' && c.noKm > 0 ? `<div class="notice">${I.alert}<div>В ${c.noKm} ${plural(c.noKm, 'поездке', 'поездках', 'поездках')} у участка нет длины — они не идут в километры. Длина указывается в ☰ → «Участки».</div></div>` : '';
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
