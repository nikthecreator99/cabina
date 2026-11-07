// «Обучение» (2.23.0; новый вид — 2.24.0 по макетам Никиты 06.11.2026): своя вкладка в нижнем меню (с 2.24.0 — слева от «Профиля»).
// Экран «Обучение» (серия, монеты, опыт, карточка курса), дорога курса — одной лентой вниз через ночной лес до конца курса,
// «Все модули», профиль обучения, окна серии, магазина и курсов. Вкладка помнит, где человек был: ушёл с дороги на другую
// вкладку — вернётся на дорогу, к своему уроку (просьба Никиты 06.11.2026).
// Прогресс — только в телефоне (meta 'learn'), правила — в learn-state.js, курс — в js/learn/pte.js, урок — в learn-play.js,
// рисунки — в learn-art.js. Тексты курса — наши, но всё равно выводятся через esc().
import { I, esc, small, sheet, openLayer, closeLayer, toast, plural, confirmDialog, MONTHS_GEN } from './ui.js';
import { S, nowLocal, saveLearn } from './store.js';
import { dateKeyOf } from './calc.js';
import * as L from './learn-state.js';
import { PTE } from './learn/pte.js';
import { playLesson } from './learn-play.js';
import { ART, CHEST, PTE_BOOK, ROAD_DEFS, ROAD_SKY } from './learn-art.js';
import { avatarHtml } from './profile.js';
import { session } from './auth.js';
import { legalReady } from './legal.js';
import { sendIdea, IDEA_MAX } from './ideas.js';

let ctx = { rerender: () => {}, go: () => {} };
export function initLearn(c) { ctx = { ...ctx, ...c }; warmCovers(); }
// Картинки курсов загружаем и расшифровываем заранее (2.24.5, Никита: «при переходе в „Обучение“ на доли секунды мелькает
// другой экран»): иначе карточка курса на миг показывалась без электровоза, и он «впрыгивал» следующим кадром.
const warm = [];
function warmCovers() {
  if (warm.length) return;
  for (const src of Object.values(COVERS)) {
    const im = new Image();
    im.src = src;
    im.decode?.().catch(() => {});
    warm.push(im);
  }
}

const today = () => dateKeyOf(nowLocal());
// черновики уроков видны только проверяющему (и автотестам): localStorage 'cabina-learn-drafts' = '1'
const opts = () => { try { return { drafts: localStorage.getItem('cabina-learn-drafts') === '1' }; } catch { return {}; } };
const course = () => PTE;
const days = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const num = (n) => Number(n || 0).toLocaleString('ru-RU');
const coinsText = (n) => `${num(n)} ${plural(n, 'монета', 'монеты', 'монет')}`;
const xpText = (n) => `${num(n)} ${plural(n, 'очко опыта', 'очка опыта', 'очков опыта')}`;
const lessonsText = (done, total) => `${done} из ${total} ${plural(total, 'урока', 'уроков', 'уроков')}`;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Значки «Обучения» без цвета (обводка цветом текста): магазин, «путь строится», заморозка в окне серии
const ic = (d, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const LI = {
  bag: (w) => ic('<path d="M5.2 8.2h13.6l-1.1 12.3H6.3z"/><path d="M9 8.2V6.6a3 3 0 0 1 6 0v1.6"/><path d="M9 11.5v.2M15 11.5v.2"/>', w),
  lessons: (w) => ic('<path d="M2.8 5.6c3.1-1.2 6.2-1 9.2 1 3-2 6.1-2.2 9.2-1v13.2c-3.1-1.2-6.2-1-9.2 1-3-2-6.1-2.2-9.2-1z"/><path d="M12 6.6v13.2"/>', w),
  barrier: (w) => ic('<rect x="2.8" y="7.2" width="18.4" height="6" rx="1.4"/><path d="m6.6 7.2-3 6M11.4 7.2l-3 6M16.2 7.2l-3 6M21 8.6l-2.3 4.6M6 13.2v7.3M18 13.2v7.3M4.4 20.5h3.2M16.4 20.5h3.2"/>', w),
};

// ---------------------------------------------------------------- состояние
// Проверка дня (заморозки, подарок, возврат серии) — при каждом показе экранов «Обучения»; сохраняем, только если что-то изменилось
function daily() {
  const r = L.dailyCheck(S.learn, today());
  if (r.changed) saveLearn(r.state).catch(() => {});
  return S.learn;
}
const ready = (t) => (t.lessons || []).filter((l) => opts().drafts || !l.draft);
function find(id) {
  for (const m of course().modules) for (const t of m.topics) {
    const i = (t.lessons || []).findIndex((l) => l.id === id);
    if (i >= 0) return { module: m, topic: t, lesson: t.lessons[i], no: i + 1 };
  }
  return null;
}
// урок для повторения: где меньше всего верных ответов с первого раза, при равенстве — пройденный раньше всех
function weakest(s) {
  const list = L.lessonsOf(course(), opts()).map((x) => ({ id: x.lesson.id, d: s.done[x.lesson.id] })).filter((x) => x.d);
  list.sort((a, b) => a.d.acc - b.d.acc || String(a.d.at || '').localeCompare(String(b.d.at || '')));
  return list[0]?.id || null;
}
const topicNo = (id) => { let n = 0; for (const m of course().modules) for (const t of m.topics) { n++; if (t.id === id) return n; } return 0; };
const topicsTotal = () => course().modules.reduce((s, m) => s + m.topics.length, 0);
const chests = () => L.chestsOf(course(), opts());
function modCount(m, s) {
  const ls = m.topics.flatMap((t) => ready(t));
  return { done: ls.filter((l) => s.done[l.id]).length, total: ls.length };
}

// Где человек был во вкладке: на дороге или на экране «Обучение» (только удобство этого телефона)
const VIEW_KEY = 'cabina-learn-view';
const viewNow = () => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } };
function rememberView(v) { try { if (viewNow() !== v) localStorage.setItem(VIEW_KEY, v); } catch { /* хранилище недоступно — не страшно */ } }
// Открыли вкладку «Обучение»: если в прошлый раз были на дороге — сразу дорога, прокрученная к своему уроку
export function learnResume() {
  if (viewNow() !== 'road') return [];
  road.target = 'current';
  return ['learn-road'];
}

// ---------------------------------------------------------------- серия · заморозки · монеты · опыт · лига
// По макетам Никиты: огонь, снежинка, гайка, молния, кубок. С 2.24.3 (его макет 06.11.2026) — снежинка: сколько заморозок
// в запасе, нет ни одной — «0» красным; нажатие — магазин. Кубок — окно «Лига коллег» (скоро); профиль обучения открывают
// кнопка с человеком в шапке экрана и молния.
function statsHtml(s) {
  const t = today();
  const streak = L.streakAt(s, t);
  const lit = L.doneToday(s, t);
  return `<div class="lr-stats">
    <button class="lr-st lr-st-fire${lit ? ' on' : ''}" data-act="lr-streak" aria-label="Серия: ${days(streak)}${lit ? ', сегодня урок пройден' : ''}">${ART.flame(24)}<b class="num">${num(streak)}</b></button>
    <button class="lr-st lr-st-ice${s.freezes ? '' : ' none'}" data-act="lr-shop" aria-label="Заморозки: ${s.freezes} из ${L.FREEZE_MAX}. Магазин">${ART.snow(23)}<b class="num">${num(s.freezes)}</b></button>
    <button class="lr-st lr-st-coin" data-act="lr-shop" aria-label="Монеты: ${coinsText(s.coins)}. Магазин">${ART.nut(24)}<b class="num">${num(s.coins)}</b></button>
    <button class="lr-st lr-st-xp" data-act="lr-me" aria-label="Опыт: ${xpText(s.xp)}">${ART.bolt(24)}<b class="num">${num(s.xp)}</b></button>
    <button class="lr-cup" data-act="lr-league" aria-label="Лига коллег — скоро">${ART.trophy(24)}</button>
  </div>`;
}
function noteHtml(s) {
  const n = s.note;
  if (!n || n.at !== today()) return '';
  const missed = n.n === 1 ? 'Вчера не было урока' : `${days(n.n)} без урока`;
  const text = n.k === 'gift'
    ? `${missed}, а заморозок не хватало — CABINA подарила заморозку, и серия цела. В запасе: ${n.left} из ${L.FREEZE_MAX}.`
    : `${missed} — серию ${n.n === 1 ? 'сохранила заморозка' : 'сохранили заморозки'}. Осталось: ${n.left} из ${L.FREEZE_MAX}.`;
  return `<div class="lr-note ${n.k}" role="status"><span class="lr-note-ico">${n.k === 'gift' ? I.gift : ART.snow(22)}</span><p>${text}</p>
    <button class="icon-btn" data-act="lr-note-x" aria-label="Понятно">${small(I.x, 18)}</button></div>`;
}
function repairHtml(s) {
  const left = L.repairLeft(s, today());
  if (!left) return '';
  return `<div class="lr-repair"><span class="lr-repair-ico on">${ART.flame(28)}</span>
    <div class="grow"><b>Верните серию ${days(s.lost.n)}</b><p>Пройдите урок ${left === L.REPAIR_DAYS ? `${L.REPAIR_DAYS} дня подряд` : `ещё ${days(left)} подряд`} — и серия вернётся.</p>
    <div class="lr-dots" aria-hidden="true">${Array.from({ length: L.REPAIR_DAYS }, (_, i) => `<i class="${i < L.REPAIR_DAYS - left ? 'on' : ''}"></i>`).join('')}</div></div></div>`;
}

// ---------------------------------------------------------------- экран «Обучение»
// Обложки курсов (2.24.3): ПТЭ — электровоз с книгой на закате из макета Никиты (он сделал его в ChatGPT). Новый файл — в SHELL.
const COVERS = { pte: 'icons/learn/pte-course.webp' };
export function renderLearn() {
  const s = daily();
  const c = course();
  const p = L.courseProgress(c, s, opts());
  // Блока «Следующий урок» нет (просьба Никиты 06.11.2026): вся карточка курса — одна кнопка, она открывает дорогу у текущего урока.
  const cur = L.currentLesson(c, s, opts());
  const f = cur && find(cur.lesson.id);
  const go = !f ? `Курс ${c.title}: все готовые уроки пройдены. Открыть дорогу курса`
    : `Курс ${c.title}. ${Object.keys(s.done).length ? 'Продолжить' : 'Начать'}: ${f.topic.title}, урок ${f.no}`;
  // Вид экрана — по макету Никиты 06.11.2026 (2.24.3): в шапке магазин и профиль обучения (кнопка профиля — яркая, его просьба),
  // карточка курса — тёмная «афиша» в обеих темах: картинка справа, рамка-градиент, прогресс — красная точка на полоске.
  const cover = COVERS[c.id];
  return `<div class="page-head lr-head"><h1>Обучение</h1>
      <button class="icon-btn lr-hbtn" data-act="lr-shop" aria-label="Магазин">${LI.bag(24)}</button>
      <button class="icon-btn lr-hbtn lr-me-btn" data-act="lr-me" aria-label="Профиль обучения">${ART.person(28)}</button></div>
    ${statsHtml(s)}
    ${noteHtml(s)}
    ${repairHtml(s)}
    <div class="lr-course">
      ${cover ? `<img class="lr-cover" src="${cover}" alt="" width="658" height="485" decoding="sync" draggable="false">` : ''}
      <button class="lr-course-main" data-act="lr-road" aria-label="${esc(go)}">
        <span class="lr-course-txt"><span class="lr-kicker">Твой курс</span><span class="lr-title">${esc(c.title)}</span><span class="lr-sub">${esc(c.name)}</span></span>
      </button>
      <div class="lr-course-foot lr-prog">
        <div class="bar${p >= 1 ? ' full' : ''}"><i class="${p > 0 ? 'on' : ''}" style="width:${p > 0 ? Math.max(2, p * 100).toFixed(1) : 0}%"></i></div>
        <div class="lr-prog-row"><span class="lr-prog-t">Пройдено <b>${L.progressLabel(p)}</b></span>
          <button class="lr-all" data-act="go" data-page="learn-modules">Все модули ${small(I.right, 18)}</button></div>
      </div>
    </div>
    <p class="hint lr-foot">Вопросы составлены по тексту ПТЭ (${esc(c.edition)}) и сверены с ним, но экспертом пока не проверены. Нашли ошибку — нажмите «Сообщить об ошибке» под ответом. Учебник не заменяет обучение и аттестацию: в работе сверяйтесь с действующими документами.</p>`;
}

// ---------------------------------------------------------------- дорога курса
// Одна длинная дорога вниз — весь курс (просьба Никиты 06.11.2026: без страниц и стрелок). Вверху — небо с закатом и лес,
// модули — щиты поперёк пути, темы — синие таблички-станции, уроки — «шайбы» на рельсах (пройден — зелёная, текущий — красная
// с книгой, впереди — с замком), сундуки с монетами — в конце модулей и примерно через каждые 6 уроков. Темы, где уроков ещё нет, —
// «путь строится»: шпалы без рельсов. Наверху всегда видно: курс, серия, монеты, опыт и модуль, по которому сейчас едем.
// y — где была дорога, когда с неё ушли на другой экран (профиль обучения): «Назад» вернёт туда же (2.24.5)
let road = { target: null, pop: null, just: null, count: null, y: null };
const DX = [0, 56, 84, 56, 0, -56, -84, -56];
function nodeHtml(x, i) {
  const { lesson, state } = x;
  const f = find(lesson.id);
  const label = `Урок ${f.no}. ${f.topic.title}. ${state === 'done' ? 'Пройден' : state === 'current' ? 'Можно начать' : 'Закрыт'}`;
  return `<div class="rd-row${state === 'current' ? ' rd-row-cur' : ''}" style="--dx:${DX[i % 8]}px">
    ${state === 'current' ? '<span class="rd-start" aria-hidden="true">Начать</span>' : ''}
    <button class="rd-node is-${state}${road.just === lesson.id ? ' rd-just' : ''}" data-act="lr-node" data-id="${esc(lesson.id)}" data-rd-pt="1" aria-label="${esc(label)}" aria-haspopup="dialog">
      <span class="rd-ped"></span><span class="rd-puck">${state === 'done' ? ART.check(34) : state === 'current' ? ART.book(40) : ART.lock(32)}</span></button>
  </div>`;
}
function chestHtml(ch, st, i) {
  const label = st === 'open' ? `Сундук открыт: было ${coinsText(L.COINS.chest)}` : st === 'ready' ? `Сундук: откройте — внутри ${coinsText(L.COINS.chest)}` : 'Сундук: откроется, когда пройдёте уроки до него';
  return `<div class="rd-row rd-row-chest" style="--dx:${DX[i % 8]}px">
    <button class="rd-chest is-${st}" data-act="lr-chest" data-id="${esc(ch.id)}" data-rd-pt="1" aria-label="${esc(label)}">
      <span class="rd-ped"></span><span class="rd-chest-art">${st === 'open' ? CHEST.open() : CHEST.closed()}</span></button></div>`;
}
function stationHtml(t, s) {
  const tp = L.topicProgress(t, s, opts());
  const done = tp.total && tp.done === tp.total;
  return `<div class="rd-st${done ? ' done' : ''}" id="rd-${esc(t.id)}" data-rd-pt="1"><div class="rd-board">
    <span class="rd-board-k">Тема ${topicNo(t.id)}${done ? ` · ${small(I.check, 12)} пройдена` : ''}</span><b>${esc(t.title)}</b></div></div>`;
}
function buildHtml(list, last) {
  const names = list.slice(0, 3).map((x) => `«${esc(x.t.title)}»`).join(', ');
  const more = list.length - 3;
  return `<div class="rd-build" data-rd-pt="plan"><div class="rd-build-in">
    <span class="rd-build-ico" aria-hidden="true">${LI.barrier(24)}</span>
    <b>Путь строится</b>
    <p>${last ? 'Дальше по маршруту' : 'Следующие темы'}: ${names}${more > 0 ? ` и ещё ${more} ${plural(more, 'тема', 'темы', 'тем')}` : ''}.</p>
    <button class="lr-all" data-act="go" data-page="learn-modules">Весь маршрут ${small(I.right, 16)}</button></div></div>`;
}
// модуль — щит поперёк пути; в data-* — то, что показывает карточка модуля наверху, когда до него доехали
function modHtml(m, mi, s) {
  const { done, total } = modCount(m, s);
  return `<div class="rd-mod" data-mod="${mi + 1}" data-title="${esc(m.title)}" data-src="${esc(m.src)}" data-done="${done}" data-total="${total}">
    <span class="rd-mod-k">Модуль ${mi + 1}</span><b>${esc(m.title)}</b><span class="rd-mod-s">${done ? `${lessonsText(done, total)} пройдено` : `${total} ${plural(total, 'урок', 'урока', 'уроков')} · ${esc(m.src)}`}</span></div>`;
}
// карточка модуля наверху (по макету: красная книга «ПТЭ», модуль, название, полоска «2 из 10 уроков»)
function modCardHtml(m, mi, s) {
  const { done, total } = modCount(m, s);
  return `<button class="rd-mc" data-act="go" data-page="learn-modules" aria-label="Все модули курса">
    <span class="rd-mc-art">${PTE_BOOK(44)}</span>
    <span class="rd-mc-t"><small id="rd-mc-k">Модуль ${mi + 1} · ${esc(m.src)}</small><b id="rd-mc-m">${esc(m.title)}</b>
      <span class="rd-mc-p"><span class="bar"><i id="rd-mc-bar" style="width:${pct(done, total)}%"></i></span><span id="rd-mc-n">${lessonsText(done, total)}</span></span></span>
    <span class="rd-mc-chev">${small(I.right, 20)}</span></button>`;
}
export function renderLearnRoad() {
  const s = daily();
  const c = course();
  const states = L.lessonStates(c, s, opts());
  const byId = new Map(states.map((x) => [x.lesson.id, x]));
  const boxes = new Map(chests().map((x) => [x.id, x]));
  let html = '';
  let gap = [];
  let n = 0;
  c.modules.forEach((m, mi) => {
    // щит модуля — перед его первой темой (даже если она ещё «строится»); модуль совсем без уроков — весь в «строится»
    if (m.topics.some((t) => ready(t).length)) {
      if (gap.length) { html += buildHtml(gap, false); gap = []; }
      html += modHtml(m, mi, s);
    }
    for (const t of m.topics) {
      const ls = ready(t);
      if (!ls.length) { gap.push({ t, m }); continue; }
      if (gap.length) { html += buildHtml(gap, false); gap = []; }
      html += stationHtml(t, s);
      for (const l of ls) html += nodeHtml(byId.get(l.id), n++);
      const ch = boxes.get(t.id);
      if (ch) html += chestHtml(ch, L.chestState(s, ch), n++);
    }
  });
  const complete = !gap.length && n > 0;
  if (gap.length) html += buildHtml(gap, n > 0);
  else if (complete) html += `<div class="rd-end" data-rd-pt="1"><span class="rd-buffer" aria-hidden="true"></span><b>Конечная</b><p>Курс ${esc(c.title)} пройден до конца.</p></div>`;
  const cur = states.find((x) => x.state === 'current') || states[states.length - 1];
  const mi = cur ? c.modules.indexOf(cur.module) : 0;
  return `<div class="rd-top">
      <div class="rd-bar"><button class="icon-btn" data-act="back" aria-label="Назад">${I.left}</button><h1>Обучение</h1>
        <button class="lr-cpill" data-act="lr-courses" aria-haspopup="dialog" aria-label="Курс ${esc(c.title)}. Выбрать курс">${esc(c.title)}${ART.chevDown(16)}</button></div>
      ${statsHtml(s)}
      ${modCardHtml(c.modules[Math.max(0, mi)], Math.max(0, mi), s)}
    </div>
    <div class="rd" id="rd"><svg class="rd-svg" aria-hidden="true" focusable="false"></svg><div class="rd-skybox"></div>${html}</div>`;
}

// Украшения по сторонам пути: у каждого ряда (урок, сундук) — крупное там, где просторнее (фонарь, ёлки, светофор, дерево),
// и мелкое с другой стороны (куст, камень, трава); между рядами — трава. Выбор — по номеру ряда, а не случайно:
// после перерисовки всё стоит на своих местах.
const BIG = [['rd-s-lamp', 70, 110], ['rd-s-trees', 80, 84], ['rd-s-signal', 60, 120], ['rd-s-tree', 40, 72], ['rd-s-trees', 80, 84], ['rd-s-lamp', 70, 110], ['rd-s-tree', 40, 72], ['rd-s-trees', 80, 84]];
const SMALL = [['rd-s-bush', 56, 30], ['rd-s-rock', 48, 30], ['rd-s-grass', 30, 16], ['rd-s-bush', 56, 30], ['rd-s-grass', 30, 16], ['rd-s-rock', 48, 30]];
function decosOf(el, box, W) {
  let out = '';
  const put = (id, x, y, w, h) => { out += `<use href="#${id}" x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w}" height="${h}"/>`; };
  const HALF = 56; // половина подставки «шайбы»
  const spots = [...el.querySelectorAll('.rd-row')].map((row) => row.querySelector('[data-rd-pt]')).filter(Boolean).map((b) => {
    const r = b.getBoundingClientRect();
    return { cx: r.left + r.width / 2 - box.left, top: r.top - box.top, base: r.top - box.top + r.height * 0.8 };
  });
  spots.forEach(({ cx, base }, i) => {
    const roomL = cx - HALF - 8;
    const roomR = W - cx - HALF - 8;
    const bigR = roomR >= roomL;
    const room = bigR ? roomR : roomL;
    const big = BIG[i % BIG.length];
    const [id, w, h] = room >= big[1] ? big : room >= 50 ? ['rd-s-bush', 46, 25] : [null, 0, 0];
    if (id) {
      const slack = Math.max(0, room - w);
      const off = slack ? (i * 37) % Math.min(slack + 1, 70) : 0;
      put(id, bigR ? cx + HALF + 8 + off : cx - HALF - 8 - w - off, base - h + ((i * 7) % 12), w, h);
    }
    const [sid, sw, sh] = SMALL[(i * 5 + 2) % SMALL.length];
    const room2 = bigR ? roomL : roomR;
    if (room2 >= sw) {
      const slack = room2 - sw;
      const off = slack ? (i * 23) % Math.min(slack + 1, 90) : 0;
      put(sid, bigR ? cx - HALF - 8 - sw - off : cx + HALF + 8 + off, base - sh + 8, sw, sh);
    }
    // трава между рядами — в стороне от пути
    const nx = spots[i + 1];
    if (nx && nx.top - base < 140) {
      const tx = (cx + nx.cx) / 2;
      const side = i % 2 ? 1 : -1;
      const gx = tx + side * (64 + ((i * 41) % 70)) - (side < 0 ? 30 : 0);
      if (gx > 6 && gx + 30 < W - 6) put('rd-s-grass', gx, (base + nx.top) / 2 + 6, 30, 16);
    }
  });
  // красный флажок у начала пути
  const first = spots[0];
  if (first) put('rd-s-flag', first.cx < W / 2 ? first.cx + 54 : first.cx - 90, first.top - 34, 40, 72);
  return out;
}

// Рисуем путь по точкам (станции, «шайбы», сундуки, «строится»): кривая с вертикальными касательными в каждой точке.
// Готовые участки — щебень, шпалы и два рельса, строящиеся — одни шпалы. Рельсы без маски (на длинной дороге маска во весь
// экран тяжела для телефона): широкая линия рельсов, поверх — колея щебнем и снова шпалы, только внутри колеи.
function drawTrack(el) {
  const svg = el.querySelector('.rd-svg');
  if (!svg) return;
  const box = el.getBoundingClientRect();
  const W = Math.round(box.width);
  const H = Math.round(el.scrollHeight);
  const sky = el.querySelector('.rd-skybox');
  if (sky && sky.dataset.w !== String(W)) { sky.innerHTML = ROAD_SKY(W); sky.dataset.w = String(W); }
  const pts = [...el.querySelectorAll('[data-rd-pt]')].flatMap((n) => {
    const r = n.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left;
    if (n.dataset.rdPt === 'plan') return [{ x, y: r.top - box.top + 6, plan: true }, { x, y: r.bottom - box.top - 6, plan: true }];
    return [{ x, y: r.top + r.height / 2 - box.top, plan: false }];
  });
  // путь выходит из леса на горизонте
  if (pts.length && sky) pts.unshift({ x: W * 0.44, y: sky.offsetTop + sky.offsetHeight - 26, plan: false });
  let built = '';
  let plan = '';
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const k = (b.y - a.y) / 2;
    const seg = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}C${a.x.toFixed(1)} ${(a.y + k).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    if (a.plan || b.plan) plan += seg; else built += seg;
  }
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.innerHTML = `${ROAD_DEFS}<g class="rd-decos">${decosOf(el, box, W)}</g>
    <path class="rd-plan-bed" d="${plan}"/>
    <path class="rd-plan" d="${plan}"/>
    <path class="rd-ballast" d="${built}"/>
    <path class="rd-sleep" d="${built}"/>
    <path class="rd-rail" d="${built}"/>
    <path class="rd-gauge" d="${built}"/>
    <path class="rd-sleep rd-sleep-in" d="${built}"/>`;
}
// Карточка модуля наверху показывает модуль, по которому сейчас едем (последний щит модуля выше края шапки)
function topLabel() {
  const el = document.getElementById('rd');
  const k = document.getElementById('rd-mc-k');
  if (!el || !k) return;
  const top = document.querySelector('.rd-top')?.getBoundingClientRect().bottom || 0;
  let cur = null;
  for (const m of el.querySelectorAll('.rd-mod')) { if (!cur || m.getBoundingClientRect().top < top + 60) cur = m; else break; }
  if (!cur || k.dataset.mod === cur.dataset.mod) return;
  const d = cur.dataset;
  k.dataset.mod = d.mod;
  k.textContent = `Модуль ${d.mod} · ${d.src}`;
  document.getElementById('rd-mc-m').textContent = d.title;
  document.getElementById('rd-mc-bar').style.width = `${pct(+d.done, +d.total)}%`;
  document.getElementById('rd-mc-n').textContent = lessonsText(+d.done, +d.total);
}
let scrollRaf = 0;
window.addEventListener('scroll', () => {
  if (!scrollRaf && document.getElementById('rd')) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; if (document.getElementById('rd')) road.y = window.scrollY; topLabel(); });
}, { passive: true });
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const el = document.getElementById('rd'); if (el) { closePop(); drawTrack(el); } }, 150); });

// Числа опыта и монет наверху «добегают» до новых после урока или сундука
function countUp() {
  const c = road.count;
  road.count = null;
  if (!c) return;
  const run = (sel, from, to) => {
    const b = document.querySelector(sel);
    if (!b || from === to) return;
    const btn = b.closest('button');
    btn?.classList.add('lr-st-up');
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 800);
      b.textContent = num(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step); else setTimeout(() => btn?.classList.remove('lr-st-up'), 600);
    };
    b.textContent = num(from);
    requestAnimationFrame(step);
  };
  setTimeout(() => { run('.lr-st-xp b', c.xp, S.learn.xp); run('.lr-st-coin b', c.coins, S.learn.coins); }, 250);
}

// После отрисовки экрана (вызывает app.js): путь, подпись модуля, прокрутка к нужному месту; вкладка запоминает, где человек
// Строка серии, заморозок, монет и опыта: если большие числа не влезают вместе с кубком — прячем кубок (.tight),
// чтобы числа не обрезались. Меряем после отрисовки и ещё раз, когда загрузятся шрифты.
function fitStats() {
  for (const row of document.querySelectorAll('.lr-stats')) {
    row.classList.remove('tight');
    if ([...row.querySelectorAll('.lr-st b')].some((b) => b.scrollWidth > b.clientWidth + 1)) row.classList.add('tight');
  }
}
// Прокрутка дороги к своему уроку (или к теме из «Всех модулей»). Сразу, до первого кадра (2.24.5): раньше прокрутка ждала
// следующего шага, и на доли секунды был виден верх дороги — «другой экран», потом прыжок к уроку. Поэтому app.js теперь
// прокручивает наверх ДО отрисовки, а не после.
function roadScroll(el, target) {
  const cur = el.querySelector('.rd-node.is-current') || el.querySelector('.rd-chest.is-ready') || el.querySelector('.rd-build') || el.querySelector('.rd-end') || [...el.querySelectorAll('.rd-node')].pop();
  const t = target === 'current' || target === 'next' ? cur : document.getElementById(`rd-${target}`);
  if (!t) return;
  const r = t.getBoundingClientRect();
  const head = document.querySelector('.rd-top')?.getBoundingClientRect().bottom || 0;
  const y = window.scrollY + r.top - head - (window.innerHeight - head) * (target === 'current' || target === 'next' ? 0.36 : 0.12);
  // после урока — плавно и только если следующий урок не виден
  if (target === 'next') { if (r.top < head || r.bottom > window.innerHeight - 80) window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
  else window.scrollTo(0, Math.max(0, y));
}
// still — перерисовка того же экрана (rerender в app.js сам возвращает прокрутку)
// Шрифты ещё грузятся? Смотрим после разметки: она и запрашивает шрифты. Обычно они уже в телефоне — тогда второй раз не рисуем.
const fontsLate = () => !!document.fonts && document.fonts.status !== 'loaded';
export function learnAfter(p, tab, still = false) {
  fitStats();
  if (fontsLate()) document.fonts.ready.then(fitStats);
  if (tab === 'learn' && !p) rememberView('hub');
  if (tab === 'learn' && p === 'learn-road') rememberView('road');
  if (p !== 'learn-road') { road.pop = null; countUp(); return; }
  const el = document.getElementById('rd');
  if (!el) return;
  road.pop = null;
  drawTrack(el);
  if (fontsLate()) document.fonts.ready.then(() => { if (document.getElementById('rd') === el) drawTrack(el); });
  const target = road.target;
  road.target = null;
  if (target === 'next') {
    // после урока: rerender сначала вернёт прежнюю прокрутку, а уже потом — плавно к следующему уроку
    setTimeout(() => { roadScroll(el, target); topLabel(); countUp(); }, 0);
  } else {
    if (target) roadScroll(el, target);
    else if (!still && road.y != null) window.scrollTo(0, road.y); // «Назад» на дорогу — туда, где были
    topLabel();
    countUp();
  }
  if (road.just) setTimeout(() => { road.just = null; }, 1200);
}

// Окошко над «шайбой» или сундуком: что это и кнопка «Начать» / «Повторить»
function closePop() { document.querySelector('.rd-pop')?.remove(); road.pop = null; }
function showPop(btn, key, cls, html) {
  const el = document.getElementById('rd');
  if (!el) return;
  if (road.pop === key) { closePop(); return; }
  closePop();
  const pop = document.createElement('div');
  pop.className = `rd-pop ${cls}`;
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `${html}<i class="rd-pop-arrow"></i>`;
  el.appendChild(pop);
  const box = el.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, box.width - 24);
  const cx = r.left + r.width / 2 - box.left;
  const left = Math.max(12, Math.min(box.width - w - 12, cx - w / 2));
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom - box.top + 10}px`;
  pop.querySelector('.rd-pop-arrow').style.left = `${cx - left}px`;
  pop.setAttribute('aria-label', pop.querySelector('.rd-pop-k')?.textContent || 'Урок');
  road.pop = key;
  const pr = pop.getBoundingClientRect();
  if (pr.bottom > window.innerHeight - 90) window.scrollBy({ top: pr.bottom - window.innerHeight + 100, behavior: 'smooth' });
}
function openPop(btn) {
  const id = btn.dataset.id;
  const f = find(id);
  const x = L.lessonStates(course(), S.learn, opts()).find((y) => y.lesson.id === id);
  if (!f || !x) return;
  const d = S.learn.done[id];
  const total = ready(f.topic).length;
  const q = f.lesson.q.length;
  let body;
  if (x.state === 'locked') body = '<p>Откроется, когда пройдёте уроки до него.</p>';
  else if (x.state === 'done') {
    body = `<p>Пройден ${d.n} ${plural(d.n, 'раз', 'раза', 'раз')}${d.best ? ` · лучшее время ${L.fmtSec(d.best)}` : ''} · верно с первого раза ${d.acc}%</p>
      <button class="btn btn-plain btn-sm" data-act="lr-start" data-id="${esc(id)}">${small(I.refresh, 18)} Повторить · +${L.XP.repeat} ${ART.bolt(16)}</button>`;
  } else body = `<p>${q} ${plural(q, 'вопрос', 'вопроса', 'вопросов')} · 1–2 минуты · +${L.XP.lesson} опыта</p><button class="btn btn-primary btn-sm" data-act="lr-start" data-id="${esc(id)}">Начать урок</button>`;
  showPop(btn, id, `is-${x.state}`, `<div class="rd-pop-k">Урок ${f.no}${total > 1 ? ` из ${total}` : ''}</div><b>${esc(f.topic.title)}</b>${body}`);
}
document.addEventListener('click', (e) => {
  if (!road.pop) return;
  if (e.target.closest('.rd-pop') || e.target.closest('.rd-node') || e.target.closest('.rd-chest')) return;
  closePop();
}, true);

// Сундук: дошли — открывается сразу (монеты — в запас), иначе — окошко, что внутри и когда откроется
async function chestTap(btn) {
  const ch = chests().find((x) => x.id === btn.dataset.id);
  if (!ch || btn.classList.contains('rd-opening')) return;
  const st = L.chestState(S.learn, ch);
  if (st !== 'ready') {
    showPop(btn, `chest:${ch.id}`, `is-chest is-${st}`, `<div class="rd-pop-k">Сундук</div><b>${st === 'open' ? 'Уже открыт' : `Внутри — ${coinsText(L.COINS.chest)}`}</b>
      <p>${st === 'open' ? `Из него было ${coinsText(L.COINS.chest)}. Следующий сундук — дальше по дороге.` : 'Откроется, когда пройдёте все уроки до него.'}</p>`);
    return;
  }
  closePop();
  const r = L.openChest(S.learn, ch);
  if (!r.coins) return;
  road.count = { xp: S.learn.xp, coins: S.learn.coins };
  btn.classList.add('rd-opening');
  try { await saveLearn(r.state); } catch { btn.classList.remove('rd-opening'); road.count = null; toast('Не удалось сохранить. Попробуйте ещё раз', { error: true }); return; }
  setTimeout(() => {
    if (!btn.isConnected) return;
    btn.classList.remove('is-ready', 'rd-opening');
    btn.classList.add('is-open', 'rd-opened');
    btn.querySelector('.rd-chest-art').innerHTML = CHEST.open();
    btn.setAttribute('aria-label', `Сундук открыт: было ${coinsText(L.COINS.chest)}`);
    btn.insertAdjacentHTML('beforeend', `<span class="rd-fx" aria-hidden="true">+${r.coins} ${ART.nut(20)}</span>`);
    toast(`Сундук открыт: +${coinsText(r.coins)}`);
    countUp();
  }, 420);
}

// ---------------------------------------------------------------- «Все модули»
export function renderLearnModules() {
  const s = daily();
  const c = course();
  const states = new Map(L.lessonStates(c, s, opts()).map((x) => [x.lesson.id, x.state]));
  const mods = c.modules.map((m, mi) => {
    const rows = m.topics.map((t) => {
      const tp = L.topicProgress(t, s, opts());
      const done = tp.total && tp.done === tp.total;
      const open = tp.total && ready(t).some((l) => states.get(l.id) !== 'locked');
      const st = !tp.total ? 'soon' : done ? 'done' : open ? 'open' : 'locked';
      const sub = !tp.total ? 'Уроки готовятся' : done ? `Пройдена · ${tp.total} ${plural(tp.total, 'урок', 'урока', 'уроков')}` : `${tp.done} из ${tp.total} ${plural(tp.total, 'урока', 'уроков', 'уроков')}`;
      return `<button class="row lr-topic is-${st}" data-act="lr-topic" data-id="${esc(t.id)}"><span class="lr-topic-ico">${st === 'done' ? small(I.check, 18) : st === 'soon' ? small(I.clock, 16) : st === 'locked' ? small(I.lock, 16) : topicNo(t.id)}</span>
        <div class="grow"><div class="t1">${esc(t.title)}</div><div class="t2">${sub} · ${esc(t.src)}</div></div>${st === 'soon' ? '' : small(I.right, 18)}</button>`;
    }).join('');
    const done = m.topics.filter((t) => { const tp = L.topicProgress(t, s, opts()); return tp.total && tp.done === tp.total; }).length;
    return `<section class="lr-mod"><div class="lr-mod-h"><span class="lr-mod-n num">${mi + 1}</span><div class="grow"><b>${esc(m.title)}</b><small>${esc(m.src)}</small></div><span class="lr-mod-p num">${done}/${m.topics.length}</span></div>
      <div class="panel">${rows}</div></section>`;
  }).join('');
  const any = Object.keys(s.done).some((id) => find(id));
  return `<div class="page-head"><button class="icon-btn" data-act="back" aria-label="Назад">${I.left}</button><h1>Все модули</h1></div>
    <p class="hint lr-mods-sub">${esc(c.full)}. ${c.modules.length} ${plural(c.modules.length, 'модуль', 'модуля', 'модулей')}, ${topicsTotal()} ${plural(topicsTotal(), 'тема', 'темы', 'тем')}. Уроки добавляются по мере проверки вопросов.</p>
    ${mods}
    ${any ? '<button class="btn btn-plain lr-reset" data-act="lr-reset">Пройти курс заново</button>' : ''}`;
}

// ---------------------------------------------------------------- профиль обучения (просьба Никиты 06.11.2026)
// Опыт, неделя, серия, монеты, заморозки, уроки, точность, время. Всё — только из телефона и только для самого человека.
const WDS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WDF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
function weekChart(week, t) {
  const max = Math.max(10, ...week.map((d) => d.xp));
  const W = 320; const H = 136; const top = 20; const base = H - 22;
  const bw = W / 7; const w = Math.min(24, bw - 12);
  const tips = week.map((d, i) => { const [, m, dd] = d.key.split('-').map(Number); return `${WDF[i]}, ${dd} ${MONTHS_GEN[m - 1]}: ${d.state === 'future' ? 'ещё впереди' : xpText(d.xp)}`; });
  const bars = week.map((d, i) => {
    const h = d.xp ? Math.max(4, (d.xp / max) * (base - top)) : 0;
    const x = i * bw + (bw - w) / 2;
    const y = base - h;
    const r = Math.min(4, w / 2, h);
    const path = h ? `M${x} ${base}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${base}Z` : '';
    const isToday = d.key === t;
    return `<g class="bar-g${isToday ? ' is-today' : ''}${d.state === 'future' ? ' is-future' : ''}" data-bar="${i}"><rect class="bar-hit" x="${i * bw}" y="0" width="${bw}" height="${H}"/>${path ? `<path class="bar" d="${path}"/>` : ''}
      ${isToday && d.xp ? `<text class="bar-v" x="${x + w / 2}" y="${y - 6}">${d.xp}</text>` : ''}<text class="bar-x" x="${x + w / 2}" y="${H - 5}">${WDS[i]}</text></g>`;
  }).join('');
  return `<figure class="chart lm-week" data-tips='${esc(JSON.stringify(tips))}'>
    <div class="chart-tip" aria-live="polite">Нажмите на столбец — опыт за день</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Опыт за эту неделю: ${tips.join('; ')}`)}"><line class="bar-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>${bars}</svg></figure>`;
}
const tile = (cls, icon, label, value) => `<div class="lm-tile ${cls}"><span class="lm-tile-ico">${icon}</span><span class="lm-tile-t"><b class="num">${value}</b><small>${label}</small></span></div>`;
export function renderLearnMe() {
  const s = daily();
  const c = course();
  const t = today();
  const streak = L.streakAt(s, t);
  const all = L.lessonsOf(c, opts());
  const doneN = all.filter((x) => s.done[x.lesson.id]).length;
  const topics = c.modules.flatMap((m) => m.topics);
  const topicsDone = topics.filter((tp) => { const x = L.topicProgress(tp, s, opts()); return x.total && x.done === x.total; }).length;
  const ans = L.answerStats(s);
  const week = L.weekXp(s, t);
  const weekSum = week.reduce((a, d) => a + d.xp, 0);
  const p = L.courseProgress(c, s, opts());
  const name = String(S.profile?.name || '').trim();
  const weak = weakest(s);
  const wd = weak && s.done[weak];
  const wf = weak && find(weak);
  return `<div class="page-head"><button class="icon-btn" data-act="back" aria-label="Назад">${I.left}</button><h1>Профиль обучения</h1></div>
    <div class="lm-hero">
      <span class="lm-ava">${avatarHtml(S.profile, 64)}</span>
      <span class="lm-who"><b>${name ? esc(name) : 'Мой прогресс'}</b><small>Курс ${esc(c.title)} · пройдено ${L.progressLabel(p)}</small></span>
    </div>
    <div class="lm-xp">
      <span class="lm-xp-ico">${ART.bolt(44)}</span>
      <span class="lm-xp-all"><b class="num">${num(s.xp)}</b><small>${plural(s.xp, 'очко опыта', 'очка опыта', 'очков опыта')}</small></span>
      <span class="lm-xp-week"><b class="num">+${num(weekSum)}</b><small>за эту неделю</small></span>
    </div>
    <section class="lm-sec"><h2 class="group-title">Статистика</h2>
      <div class="lm-grid">
        ${tile(`lm-fire${L.doneToday(s, t) ? ' on' : ''}`, ART.flame(26), 'серия', days(streak))}
        ${tile('lm-fire on', ART.flame(26), 'лучшая серия', days(Math.max(s.best, streak)))}
        ${tile('lm-coin', ART.nut(26), plural(s.coins, 'монета', 'монеты', 'монет'), num(s.coins))}
        ${tile('lm-snow', ART.snow(24), 'заморозки в запасе', `${s.freezes} из ${L.FREEZE_MAX}`)}
        ${tile('lm-les', LI.lessons(22), 'уроков пройдено', `${doneN} из ${all.length}`)}
        ${tile('lm-top', I.medal, 'тем пройдено', `${topicsDone} из ${topics.length}`)}
        ${tile('lm-acc', ART.target(26), 'верных ответов', ans.acc == null ? '—' : `${ans.acc}%`)}
        ${tile('lm-time', ART.watch(26), 'всего в уроках', L.fmtSec(s.sec))}
        ${tile('lm-days', I.calendar, plural(s.days.length, 'день с уроком', 'дня с уроками', 'дней с уроками'), num(s.days.length))}
        ${tile('lm-ans', I.check, plural(ans.answers, 'ответ', 'ответа', 'ответов'), num(ans.answers))}
      </div></section>
    <section class="lm-sec"><h2 class="group-title">Опыт за неделю</h2><div class="panel lm-chart">${weekChart(week, t)}</div></section>
    ${wd && wd.acc < 100 && wf ? `<div class="panel"><button class="row" data-act="lr-start" data-id="${esc(weak)}"><span class="ico" style="--c:var(--warn)">${I.refresh}</span>
      <div class="grow"><div class="t1">Повторить трудный урок</div><div class="t2">${esc(wf.topic.title)} · урок ${wf.no} · с первого раза ${wd.acc}%</div></div>${small(I.right, 18)}</button></div>` : ''}
    <p class="hint lm-foot">Опыт, монеты и статистика — только в этом телефоне и в резервной копии. На сервер не уходят и работодателю не показываются.</p>`;
}

// ---------------------------------------------------------------- окна: серия, магазин, курсы
function openStreak() {
  const s = daily();
  const t = today();
  const streak = L.streakAt(s, t);
  const lit = L.doneToday(s, t);
  const week = L.weekView(s, t).map((d, i) => `<div class="lr-wd is-${d.state}"><i class="${d.state === 'done' ? 'on' : ''}">${d.state === 'done' ? ART.flame(20) : d.state === 'frozen' ? ART.snow(16) : ''}</i><small>${WDS[i]}</small></div>`).join('');
  openLayer(sheet({
    title: 'Ударный режим',
    body: `<div class="lr-big${lit ? ' on' : ''}"><span class="lr-big-ico${lit ? ' on' : ''}">${ART.flame(68)}</span><b class="num">${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')} подряд</span>
        <p>${lit ? 'Сегодня урок пройден — серия продлена.' : streak ? 'Пройдите урок сегодня, чтобы продлить серию.' : 'Пройдите урок — и начнётся серия.'}</p></div>
      <div class="lr-week" aria-label="Эта неделя">${week}</div>
      ${repairHtml(s)}
      <div class="panel">
        <div class="row"><span class="ico lr-ico-fire on">${ART.flame(22)}</span><div class="grow"><div class="t1">Лучшая серия</div></div><b class="num">${days(Math.max(s.best, streak))}</b></div>
        <div class="row"><span class="ico" style="--c:var(--night)">${ART.snow(20)}</span><div class="grow"><div class="t1">Заморозки в запасе</div></div><b class="num">${s.freezes} из ${L.FREEZE_MAX}</b></div>
        ${s.sec ? `<div class="row"><span class="ico">${I.clock}</span><div class="grow"><div class="t1">Всего в уроках</div></div><b class="num">${L.fmtSec(s.sec)}</b></div>` : ''}
      </div>
      <div class="lr-how"><b>Как это работает</b>
        <p>Серия растёт, если за день пройден хотя бы один урок. День считается по часовому поясу из настроек.</p>
        <p>Пропустили день — серию сохранит заморозка, она срабатывает сама. Заморозка даётся за каждые ${L.FREEZE_EVERY} дней серии, её можно купить за монеты в магазине; в запасе — до двух.</p>
        <p>Если серия уже ${L.GIFT_FROM} дней и больше, а заморозок нет, CABINA подарит заморозку (не чаще раза в две недели). А если серия всё же прервалась, её можно вернуть: пройдите урок ${L.REPAIR_DAYS} дня подряд.</p></div>`,
  }));
}
// Магазин (просьба Никиты 06.11.2026): сверху — сколько заморозок, ниже — купить за монеты. Монеты — только за учёбу.
function shopBody(s) {
  const full = s.freezes >= L.FREEZE_MAX;
  const short = L.FREEZE_PRICE - s.coins;
  const why = full ? `В запасе уже ${L.FREEZE_MAX} — больше не нужно` : short > 0 ? `Не хватает ${coinsText(short)}` : '';
  return `<div class="lr-shop">
    <div class="lr-shop-top">
      <div class="lr-frz" aria-hidden="true">${Array.from({ length: L.FREEZE_MAX }, (_, i) => `<span class="lr-frz-s${i < s.freezes ? ' on' : ''}">${ART.snow(30)}</span>`).join('')}</div>
      <b class="lr-frz-n">Заморозки: ${s.freezes} из ${L.FREEZE_MAX}</b>
      <p>Сохраняют серию, если вы пропустили день. Срабатывают сами.</p>
      <div class="lr-wallet">${ART.nut(22)}<span>У вас <b class="num">${coinsText(s.coins)}</b></span></div>
    </div>
    <div class="lr-item">
      <span class="lr-item-ico snow">${ART.snow(30)}</span>
      <div class="grow"><b>Заморозка серии</b><p>+1 в запас</p></div>
      <button class="btn btn-primary btn-sm lr-buy" data-shop="buy"${why ? ' disabled' : ''}>${ART.nut(18)} ${L.FREEZE_PRICE}</button>
    </div>
    ${why ? `<p class="hint lr-why">${why}.</p>` : ''}
    <div class="lr-earn"><b>Как заработать монеты</b>
      <ul>
        <li><span>Новый урок</span><b>+${L.COINS.lesson}</b></li>
        <li><span>Повтор пройденного урока</span><b>+${L.COINS.repeat}</b></li>
        <li><span>Урок без единой ошибки</span><b>+${L.COINS.perfect}</b></li>
        <li><span>Сундук на дороге курса</span><b>+${L.COINS.chest}</b></li>
      </ul>
      <p class="hint">Монеты даются только за учёбу и за деньги не продаются. Заморозки по-прежнему бывают и бесплатно: за каждые ${L.FREEZE_EVERY} дней серии.</p></div>
    <div class="lr-item" id="lr-energy"><span class="lr-item-ico bolt">${ART.battery(28)}</span><div class="grow"><div class="lr-item-h"><b>Энергия</b><span class="lr-have num">${L.ENERGY.unlimited ? '∞' : `${L.energyNow(s, Date.now())} из ${L.ENERGY.max}`}</span></div>
      <p>${L.ENERGY.unlimited ? 'Сейчас без ограничений — занимайтесь сколько хотите.' : `Нужна, чтобы начать урок: ${L.ENERGY.perLesson} за урок. Восстанавливается: 1 за ${L.ENERGY.regenMin} минут.`}</p></div></div>
  </div>`;
}
function openShop(focus) {
  const el = openLayer(sheet({ title: 'Магазин', body: shopBody(daily()) }));
  const body = el.querySelector('.sheet-body');
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-shop=buy]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const r = L.buyFreeze(S.learn);
    if (!r.ok) { body.innerHTML = shopBody(S.learn); return; }
    const before = { xp: S.learn.xp, coins: S.learn.coins };
    try { await saveLearn(r.state); } catch { toast('Не удалось сохранить покупку. Попробуйте ещё раз', { error: true }); body.innerHTML = shopBody(S.learn); return; }
    body.innerHTML = shopBody(S.learn);
    body.querySelectorAll('.lr-frz-s.on')[S.learn.freezes - 1]?.classList.add('lr-new');
    toast(`Заморозка куплена. В запасе: ${S.learn.freezes} из ${L.FREEZE_MAX}`);
    road.count = before;
    ctx.rerender();
  });
  if (focus === 'energy') setTimeout(() => el.querySelector('#lr-energy')?.scrollIntoView({ block: 'center' }), 60);
}
// Кубок (2.24.3): «Лига коллег» — пока только объяснение. Лига появится позже: только по согласию человека и после
// изменения уведомления в Роскомнадзор (раздел 3.4 CLAUDE.md); до этого опыт не покидает телефон.
function openLeague() {
  openLayer(sheet({
    title: 'Лига коллег',
    body: `<div class="lr-league"><span class="lr-league-ico">${ART.trophy(64)}</span><b>Скоро</b>
      <p>Соревнование по очкам опыта за неделю с коллегами, которые тоже этого захотят. Включится позже и только по вашему согласию.</p>
      <p class="hint">Пока опыт хранится только в этом телефоне: на сервер не уходит и работодателю не показывается.</p></div>`,
  }));
}
function openCourses() {
  const s = daily();
  const c = course();
  openLayer(sheet({
    title: 'Курсы',
    body: `<div class="panel"><button class="row lr-crs" data-close aria-current="true"><span class="lr-crs-art">${PTE_BOOK(34)}</span>
        <div class="grow"><div class="t1">${esc(c.title)} · ${esc(c.name)}</div><div class="t2">Пройдено ${L.progressLabel(L.courseProgress(c, s, opts()))}</div></div>${small(I.check, 20)}</button></div>
      <p class="hint">Другие курсы появятся в обновлениях — здесь же, во вкладке «Обучение».</p>`,
  }));
}

// ---------------------------------------------------------------- урок
let starting = false; // двойное нажатие на «Начать» не открывает урок дважды
async function start(id) {
  if (starting) return;
  starting = true;
  try { await begin(id); } finally { starting = false; }
}
async function begin(id) {
  const f = find(id);
  if (!f || (f.lesson.draft && !opts().drafts)) return;
  const x = L.lessonStates(course(), S.learn, opts()).find((y) => y.lesson.id === id);
  if (!x || x.state === 'locked') { toast('Сначала пройдите уроки до этого'); return; }
  let s = daily();
  const nowMs = Date.now();
  if (!L.canStart(s, nowMs)) { toast('Энергия закончилась — она восстановится'); return; }
  closePop();
  let bank;
  try { bank = (await f.module.bank()).QUESTIONS; } catch { toast('Не удалось открыть урок. Проверьте интернет и попробуйте ещё раз', { error: true }); return; }
  const byId = new Map(bank.map((q) => [q.id, q]));
  const qs = f.lesson.q.map((q) => byId.get(q)).filter(Boolean);
  if (qs.length !== f.lesson.q.length) { toast('Урок пока недоступен', { error: true }); return; }
  s = L.spendEnergy(s, nowMs);
  if (s !== S.learn) await saveLearn(s);
  const wasCurrent = x.state === 'current';
  const before = { xp: S.learn.xp, coins: S.learn.coins };
  playLesson({
    title: f.topic.title,
    kicker: `${course().title} · урок ${f.no}`,
    course: course().title,
    questions: qs,
    finish: async (r) => {
      const res = L.completeLesson(S.learn, { ...r, lessonId: id, topicLessons: ready(f.topic).map((l) => l.id), today: today() });
      await saveLearn(res.state);
      return res.news;
    },
    onClose: (doneOk) => {
      if (doneOk) {
        road.count = before;
        if (wasCurrent) { road.just = id; road.target = 'next'; }
      }
      ctx.rerender();
    },
    onReport: openReport,
  });
}

// «Сообщить об ошибке» под ответом (решение Никиты 06.11.2026: уроки открыты до проверки экспертом). Сообщение уходит
// как идея на наш сервер (тот же лимит в день и согласие): номер вопроса, начало его текста и слова человека — больше ничего.
// Без аккаунта — только объяснение: записи из телефона никуда не уходят.
const cut = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
export const reportHead = (q) => `Ошибка в вопросе ${q.id} («${cut(String(q.text), 70)}»): `;
function openReport(q) {
  const can = legalReady() && !!session();
  const head = reportHead(q);
  const body = `<div class="lr-rep"><blockquote class="lr-rep-q">${esc(q.text)}</blockquote>${can
    ? `<label class="lr-rep-l" for="lr-rep-text">Что не так?</label>
      <textarea class="input" id="lr-rep-text" rows="4" maxlength="${IDEA_MAX - head.length}" placeholder="Например: по ПТЭ правильный ответ другой — …"></textarea>
      <div class="notice">${I.alert}<div>Сообщение прочитает разработчик. Оно появится в «Предложить идею» — там его можно стереть. Не пишите имена, телефоны, номера поездов и служебную информацию.</div></div>`
    : `<p class="hint">${legalReady() ? 'Сообщить об ошибке можно с аккаунтом CABINA: так разработчик сможет ответить, а вы — стереть сообщение. Войти можно в Настройках → «Настройки аккаунта». Записи из телефона при этом никуда не уходят.' : 'Скоро отсюда можно будет сообщить об ошибке разработчику.'}</p>`}</div>`;
  const el = openLayer(sheet({ title: 'Ошибка в вопросе', body,
    foot: can ? '<button class="btn btn-primary" data-rep="send">Отправить</button>' : '<button class="btn btn-primary" data-close>Понятно</button>' }));
  const btn = el.querySelector('[data-rep=send]');
  btn?.addEventListener('click', async () => {
    const box = el.querySelector('#lr-rep-text');
    const words = box.value.trim();
    if (words.length < 3) { toast('Напишите, что не так', { error: true }); box.focus(); return; }
    btn.disabled = true;
    const r = await sendIdea(head + words);
    btn.disabled = false;
    if (!r.ok) { if (r.msg) toast(r.msg, { error: true, ms: 6000 }); return; }
    closeLayer(el);
    toast('Спасибо! Сообщение отправлено разработчику');
  });
}

// ---------------------------------------------------------------- нажатия
export async function learnClick(act, b) {
  if (!act || !act.startsWith('lr-')) return false;
  switch (act) {
    case 'lr-road': road.target = 'current'; ctx.go('learn-road'); break;
    case 'lr-me': ctx.go('learn-me'); break;
    case 'lr-streak': openStreak(); break;
    case 'lr-shop': openShop(b.dataset.focus); break;
    case 'lr-courses': openCourses(); break;
    case 'lr-league': openLeague(); break;
    case 'lr-node': openPop(b); break;
    case 'lr-chest': await chestTap(b); break;
    case 'lr-start': await start(b.dataset.id); break;
    case 'lr-note-x': await saveLearn({ ...S.learn, note: null }); ctx.rerender(); break;
    case 'lr-topic': {
      const t = course().modules.flatMap((m) => m.topics).find((x) => x.id === b.dataset.id);
      if (!t) break;
      if (!ready(t).length) { toast('Уроки по этой теме готовятся'); break; }
      road.target = t.id;
      ctx.go('learn-road');
      break;
    }
    case 'lr-reset': {
      const ok = await confirmDialog({ title: 'Пройти курс заново?', text: `Отметки о пройденных уроках и открытых сундуках курса ${course().title} сотрутся, дорога начнётся сначала. Серия, заморозки, опыт и монеты останутся.`, ok: 'Начать заново', cancel: 'Отмена' });
      if (!ok) break;
      const mine = new Set(L.lessonsOf(course(), { drafts: true }).map((x) => x.lesson.id));
      const qids = new Set(L.lessonsOf(course(), { drafts: true }).flatMap((x) => x.lesson.q));
      const tids = new Set(course().modules.flatMap((m) => m.topics.map((t) => t.id)));
      const done = Object.fromEntries(Object.entries(S.learn.done).filter(([k]) => !mine.has(k)));
      const qs = Object.fromEntries(Object.entries(S.learn.qs).filter(([k]) => !qids.has(k)));
      const opened = (S.learn.chests || []).filter((k) => !tids.has(k));
      await saveLearn({ ...S.learn, done, qs, chests: opened });
      toast('Прогресс курса стёрт');
      ctx.rerender();
      break;
    }
    default: return false;
  }
  return true;
}
