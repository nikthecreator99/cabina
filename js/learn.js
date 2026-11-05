// «Обучение» (2.21.11): своя вкладка в нижнем меню (справа от «Главной», просьба Никиты 05.11.2026) — экран «Обучение»,
// дорога курса от станции к станции, «Все модули», окна серии и магазина.
// Прогресс — только в телефоне (meta 'learn'), правила серии и проверки — в learn-state.js, курс — в js/learn/pte.js,
// сам урок — в learn-play.js. Тексты курса — наши, но всё равно выводятся через esc().
import { I, esc, small, sheet, openLayer, closeLayer, toast, plural, confirmDialog } from './ui.js';
import { S, nowLocal, saveLearn } from './store.js';
import { dateKeyOf } from './calc.js';
import * as L from './learn-state.js';
import { PTE } from './learn/pte.js';
import { playLesson } from './learn-play.js';

let ctx = { rerender: () => {}, go: () => {} };
export function initLearn(c) { ctx = { ...ctx, ...c }; }

const today = () => dateKeyOf(nowLocal());
// черновики уроков видны только проверяющему (и автотестам): localStorage 'cabina-learn-drafts' = '1'
const opts = () => { try { return { drafts: localStorage.getItem('cabina-learn-drafts') === '1' }; } catch { return {}; } };
const course = () => PTE;
const days = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

// Значки «Обучения»: серия (огонь), заморозка, энергия, магазин
const ic = (d, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const LI = {
  flame: (w) => ic('<path d="M12 21.2c-3.9 0-6.6-2.7-6.6-6.3 0-3.4 2.4-5.4 3.7-7.8.5 1.7 1.4 2.8 2.5 3.4-.2-3 .9-5.8 3.4-8.1.2 3.5 1.7 5.5 3.2 7.4 1 1.4 1.6 3 1.6 5.1 0 3.6-3.2 6.3-7.8 6.3z" fill="currentColor" fill-opacity=".18"/><path d="M12 21.2c-1.7 0-2.9-1.2-2.9-2.9 0-1.6 1.1-2.6 2-3.9.4 1 1 1.5 1.6 1.8.1-1.1.6-2.1 1.4-2.9.7 1.6 1.7 2.6 1.7 4.4 0 2-1.6 3.5-3.8 3.5z"/>', w),
  snow: (w) => ic('<path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2"/><path d="m9.4 4.6 2.6 1.9 2.6-1.9M9.4 19.4l2.6-1.9 2.6 1.9M4.4 10.6l2.9-.9-.3-3M19.6 13.4l-2.9.9.3 3M4.4 13.4l2.9.9-.3 3M19.6 10.6l-2.9-.9.3-3"/>', w),
  bolt: (w) => ic('<path d="M13.2 2.5 5 13.6h6.2l-1.4 7.9L18 10.4h-6.1z" fill="currentColor" fill-opacity=".2"/>', w),
  bag: (w) => ic('<path d="M5.2 8.2h13.6l-1.1 12.3H6.3z"/><path d="M9 8.2V6.6a3 3 0 0 1 6 0v1.6"/><path d="M9 11.5v.2M15 11.5v.2"/>', w),
  barrier: (w) => ic('<rect x="2.8" y="7.2" width="18.4" height="6" rx="1.4"/><path d="m6.6 7.2-3 6M11.4 7.2l-3 6M16.2 7.2l-3 6M21 8.6l-2.3 4.6M6 13.2v7.3M18 13.2v7.3M4.4 20.5h3.2M16.4 20.5h3.2"/>', w),
  loco: (w) => ic('<rect x="6" y="3.5" width="12" height="15" rx="3.5" fill="currentColor" fill-opacity=".14"/><path d="M6 10.5h12M9 3.5V2M15 3.5V2"/><rect x="8.3" y="5.6" width="7.4" height="3.2" rx="1"/><circle cx="9" cy="14.2" r="1.1" fill="currentColor"/><circle cx="15" cy="14.2" r="1.1" fill="currentColor"/><path d="m7.5 18.5-2 3M16.5 18.5l2 3"/>', w),
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

// ---------------------------------------------------------------- экран «Обучение»
function pillsHtml(s) {
  const t = today();
  const streak = L.streakAt(s, t);
  const lit = L.doneToday(s, t);
  return `<div class="lr-pills">
    <button class="lr-pill lr-p-streak${lit ? ' on' : ''}" data-act="lr-streak" aria-label="Серия: ${days(streak)}${lit ? ', сегодня урок пройден' : ''}">${LI.flame(20)}<b class="num">${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')}</span></button>
    <button class="lr-pill lr-p-freeze" data-act="lr-shop" aria-label="Заморозок: ${s.freezes} из ${L.FREEZE_MAX}">${LI.snow(20)}<b class="num">${s.freezes}</b></button>
    <button class="lr-pill lr-p-energy" data-act="lr-shop" data-focus="energy" aria-label="Энергия: ${L.ENERGY.unlimited ? 'бесконечная' : L.energyNow(s, Date.now())}">${LI.bolt(20)}<b class="num">${L.ENERGY.unlimited ? '∞' : L.energyNow(s, Date.now())}</b></button>
  </div>`;
}
function noteHtml(s) {
  const n = s.note;
  if (!n || n.at !== today()) return '';
  const missed = n.n === 1 ? 'Вчера не было урока' : `${days(n.n)} без урока`;
  const text = n.k === 'gift'
    ? `${missed}, а заморозок не хватало — CABINA подарила заморозку, и серия цела. В запасе: ${n.left} из ${L.FREEZE_MAX}.`
    : `${missed} — серию ${n.n === 1 ? 'сохранила заморозка' : 'сохранили заморозки'}. Осталось: ${n.left} из ${L.FREEZE_MAX}.`;
  return `<div class="lr-note ${n.k}" role="status"><span class="lr-note-ico">${n.k === 'gift' ? I.gift : LI.snow(22)}</span><p>${text}</p>
    <button class="icon-btn" data-act="lr-note-x" aria-label="Понятно">${small(I.x, 18)}</button></div>`;
}
function repairHtml(s) {
  const left = L.repairLeft(s, today());
  if (!left) return '';
  return `<div class="lr-repair"><span class="lr-repair-ico">${LI.flame(26)}</span>
    <div class="grow"><b>Верните серию ${days(s.lost.n)}</b><p>Пройдите урок ${left === L.REPAIR_DAYS ? `${L.REPAIR_DAYS} дня подряд` : `ещё ${days(left)} подряд`} — и серия вернётся.</p>
    <div class="lr-dots" aria-hidden="true">${Array.from({ length: L.REPAIR_DAYS }, (_, i) => `<i class="${i < L.REPAIR_DAYS - left ? 'on' : ''}"></i>`).join('')}</div></div></div>`;
}
// Картинка курса: поезд выходит из книги на рельсы (рисуем сами, без логотипов)
const COURSE_ART = `<svg class="lr-art" viewBox="0 0 132 104" aria-hidden="true">
  <circle class="lr-art-glow" cx="70" cy="44" r="40"/>
  <path class="lr-art-rail" d="M57 58 36 104M83 58l21 46"/>
  <path class="lr-art-sleep" d="M53 66h34M49 75h42M45 85h50M40 96h60"/>
  <rect class="lr-art-loco" x="51" y="20" width="38" height="40" rx="9"/>
  <rect class="lr-art-win" x="56" y="26" width="28" height="12" rx="3"/>
  <path class="lr-art-line" d="M51 43h38"/>
  <circle class="lr-art-lamp" cx="58" cy="51" r="3.2"/><circle class="lr-art-lamp" cx="82" cy="51" r="3.2"/><circle class="lr-art-lamp sm" cx="70" cy="23.5" r="1.8"/>
  <path class="lr-art-book" d="M14 70c9-3 19-3 28 1v29c-9-4-19-4-28-1zM42 71c9-4 19-4 28-1v29c-9-3-19-3-28 1z"/>
  <path class="lr-art-page" d="M19 77c6-1.4 12-1.2 18 .6M19 83c6-1.4 12-1.2 18 .6M19 89c6-1.4 12-1.2 18 .6M47 77.6c6-1.8 12-2 18-.6M47 83.6c6-1.8 12-2 18-.6M47 89.6c6-1.8 12-2 18-.6"/>
</svg>`;
function nextHtml(s) {
  const c = course();
  const cur = L.currentLesson(c, s, opts());
  if (!cur) {
    const any = L.lessonsOf(c, opts()).length;
    const again = weakest(s);
    return `<div class="lr-next panel${again ? ' lr-next-wrap' : ''}"><div class="grow"><div class="lr-kicker">${any ? 'Все готовые уроки пройдены' : 'Первые уроки скоро'}</div>
      <p class="hint">${any ? 'Новые темы появятся в обновлениях. Пройденные уроки можно повторять — так знания держатся дольше.' : 'Каждый вопрос проверяет работник локомотивной бригады: в учебнике по безопасности движения не должно быть ошибок.'}</p></div>
      ${again ? `<button class="btn btn-plain btn-sm lr-go" data-act="lr-start" data-id="${esc(again)}">${small(I.refresh, 18)} Повторить урок</button>` : ''}</div>`;
  }
  const f = find(cur.lesson.id);
  const total = ready(cur.topic).length;
  return `<div class="lr-next panel"><div class="grow"><div class="lr-kicker">${Object.keys(s.done).length ? 'Следующий урок' : 'Начните с первого урока'}</div>
      <b>${esc(cur.topic.title)}</b><div class="hint">Урок ${f.no}${total > 1 ? ` из ${total}` : ''} · ${cur.lesson.q.length} ${plural(cur.lesson.q.length, 'вопрос', 'вопроса', 'вопросов')} · 1–2 минуты</div></div>
    <button class="btn btn-primary btn-sm lr-go" data-act="lr-start" data-id="${esc(cur.lesson.id)}">Начать</button></div>`;
}
export function renderLearn() {
  const s = daily();
  const c = course();
  const p = L.courseProgress(c, s, opts());
  return `<div class="page-head"><h1>Обучение</h1><button class="icon-btn" data-act="lr-shop" aria-label="Магазин">${LI.bag(22)}</button></div>
    ${pillsHtml(s)}
    ${noteHtml(s)}
    ${repairHtml(s)}
    <div class="lr-course">
      <button class="lr-course-main" data-act="lr-road" aria-label="Открыть курс ${esc(c.title)}">
        <div class="lr-course-txt"><div class="lr-kicker">Твой курс</div><div class="lr-title">${esc(c.title)}</div><div class="lr-sub">${esc(c.name)}</div></div>
        ${COURSE_ART}
      </button>
      <div class="lr-course-foot">
        <div class="lr-prog"><div class="bar${p >= 1 ? ' full' : ''}"><i style="width:${p > 0 ? Math.max(2, p * 100).toFixed(1) : 0}%"></i></div><span>Пройдено ${L.progressLabel(p)}</span></div>
        <button class="lr-all" data-act="go" data-page="learn-modules">Все модули ${small(I.right, 16)}</button>
      </div>
    </div>
    ${nextHtml(s)}
    <p class="hint lr-foot">Вопросы составлены по тексту ПТЭ (${esc(c.edition)}) и проверены работником локомотивной бригады. Учебник не заменяет обучение и аттестацию: в работе сверяйтесь с действующими документами.</p>`;
}

// ---------------------------------------------------------------- дорога курса
// Дорога идёт от станции (тема) к станции; уроки — светофоры-огни на пути. Пройден — зелёный, текущий — лунно-белый
// (пригласительный), впереди — погашен. Темы, где уроков ещё нет, — «путь строится»: шпалы без рельсов.
let road = { target: null, pop: null, just: null };
function nodeHtml(x, i) {
  const { lesson, state } = x;
  const f = find(lesson.id);
  const dx = [0, 52, 78, 52, 0, -52, -78, -52][i % 8];
  const label = `Урок ${f.no}. ${f.topic.title}. ${state === 'done' ? 'Пройден' : state === 'current' ? 'Можно начать' : 'Закрыт'}`;
  const cls = `rd-node is-${state}${road.just === lesson.id ? ' rd-just' : ''}`;
  return `<div class="rd-row${state === 'current' ? ' rd-row-cur' : ''}" style="--dx:${dx}px">
    ${state === 'current' ? '<span class="rd-start" aria-hidden="true">Начать</span>' : ''}
    <button class="${cls}" data-act="lr-node" data-id="${esc(lesson.id)}" data-rd-pt="1" aria-label="${esc(label)}" aria-haspopup="dialog">
      <span class="rd-lamp">${state === 'done' ? small(I.check, 28) : state === 'current' ? LI.loco(30) : small(I.lock, 22)}</span></button>
  </div>`;
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
function modHtml(m, mi, s) {
  const total = m.topics.length;
  const done = m.topics.filter((t) => { const tp = L.topicProgress(t, s, opts()); return tp.total && tp.done === tp.total; }).length;
  return `<div class="rd-mod" data-mod="${mi + 1}" data-title="${esc(m.title)}"><div class="rd-mod-k">Модуль ${mi + 1} · ${esc(m.src)}</div>
    <b>${esc(m.title)}</b><span>${done ? `${done} из ${total} ${plural(total, 'темы', 'тем', 'тем')} пройдено` : `${total} ${plural(total, 'тема', 'темы', 'тем')}`}</span></div>`;
}
export function renderLearnRoad() {
  const s = daily();
  const c = course();
  const states = L.lessonStates(c, s, opts());
  const byId = new Map(states.map((x) => [x.lesson.id, x]));
  let html = '';
  let gap = [];
  let n = 0;
  c.modules.forEach((m, mi) => {
    let head = false;
    for (const t of m.topics) {
      const ls = ready(t);
      if (!ls.length) { gap.push({ t, m }); continue; }
      if (gap.length) { html += buildHtml(gap, false); gap = []; }
      if (!head) { html += modHtml(m, mi, s); head = true; }
      html += stationHtml(t, s);
      for (const l of ls) html += nodeHtml(byId.get(l.id), n++);
    }
  });
  const complete = !gap.length && n > 0;
  if (gap.length) html += buildHtml(gap, n > 0);
  else if (complete) html += `<div class="rd-end" data-rd-pt="1"><span class="rd-buffer" aria-hidden="true"></span><b>Конечная</b><p>Курс ${esc(c.title)} пройден до конца.</p></div>`;
  const streak = L.streakAt(s, today());
  return `<div class="rd-top"><button class="icon-btn" data-act="back" aria-label="Назад">${I.left}</button>
      <div class="rd-top-t"><small id="rd-top-k">Твой курс</small><b id="rd-top-m">${esc(c.title)}</b></div>
      <button class="lr-pill lr-p-streak${L.doneToday(s, today()) ? ' on' : ''}" data-act="lr-streak" aria-label="Серия: ${days(streak)}">${LI.flame(18)}<b class="num">${streak}</b></button></div>
    <div class="rd" id="rd"><svg class="rd-svg" aria-hidden="true"></svg>${html}</div>`;
}

// Рисуем путь по точкам (станции, огни, «строится»): кривая с вертикальными касательными в каждой точке.
// Готовые участки — шпалы и два рельса, строящиеся — одни шпалы. Рельсы без маски (на длинной дороге маска во весь экран
// тяжела для телефона): широкая линия рельсов, поверх — колея цветом фона и снова шпалы, только внутри колеи.
function drawTrack(el) {
  const svg = el.querySelector('.rd-svg');
  if (!svg) return;
  const box = el.getBoundingClientRect();
  const pts = [...el.querySelectorAll('[data-rd-pt]')].flatMap((n) => {
    const r = n.getBoundingClientRect();
    const x = r.left + r.width / 2 - box.left;
    if (n.dataset.rdPt === 'plan') return [{ x, y: r.top - box.top + 6, plan: true }, { x, y: r.bottom - box.top - 6, plan: true }];
    return [{ x, y: r.top + r.height / 2 - box.top, plan: false }];
  });
  const W = Math.round(box.width);
  const H = Math.round(el.scrollHeight);
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
  svg.innerHTML = `<path class="rd-plan" d="${plan}"/>
    <path class="rd-sleep" d="${built}"/>
    <path class="rd-rail" d="${built}"/>
    <path class="rd-gauge" d="${built}"/>
    <path class="rd-sleep rd-sleep-in" d="${built}"/>`;
}
function topLabel() {
  const el = document.getElementById('rd');
  if (!el) return;
  const top = document.querySelector('.rd-top')?.getBoundingClientRect().bottom || 0;
  let cur = null;
  for (const m of el.querySelectorAll('.rd-mod')) { if (m.getBoundingClientRect().top < top + 8) cur = m; else break; }
  const k = document.getElementById('rd-top-k');
  const t = document.getElementById('rd-top-m');
  if (!k || !t) return;
  if (cur) { k.textContent = `${course().title} · модуль ${cur.dataset.mod} из ${course().modules.length}`; t.textContent = cur.dataset.title; }
  else { k.textContent = 'Твой курс'; t.textContent = course().title; }
}
let scrollRaf = 0;
window.addEventListener('scroll', () => { if (!scrollRaf && document.getElementById('rd')) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; topLabel(); }); }, { passive: true });
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const el = document.getElementById('rd'); if (el) { closePop(); drawTrack(el); } }, 150); });

// После отрисовки экрана (вызывает app.js): путь, подпись модуля и прокрутка к нужному месту
export function learnAfter(p) {
  if (p !== 'learn-road') { road.pop = null; return; }
  const el = document.getElementById('rd');
  if (!el) return;
  road.pop = null;
  drawTrack(el);
  document.fonts?.ready?.then(() => { if (document.getElementById('rd') === el) drawTrack(el); });
  const target = road.target;
  road.target = null;
  if (target) {
    setTimeout(() => {
      const t = target === 'current' ? el.querySelector('.rd-node.is-current') || el.querySelector('.rd-build') || el.querySelector('.rd-node:last-of-type')
        : document.getElementById(`rd-${target}`);
      if (t) {
        const r = t.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, window.scrollY + r.top - window.innerHeight * (target === 'current' ? 0.42 : 0.22)));
      }
      topLabel();
    }, 0);
  } else topLabel();
  if (road.just) setTimeout(() => { road.just = null; }, 1200);
}

// Окошко над огнём: что за урок и кнопка «Начать» / «Повторить»
function closePop() { document.querySelector('.rd-pop')?.remove(); road.pop = null; }
function openPop(btn) {
  const el = document.getElementById('rd');
  const id = btn.dataset.id;
  if (!el || !id) return;
  if (road.pop === id) { closePop(); return; }
  closePop();
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
      <button class="btn btn-plain btn-sm" data-act="lr-start" data-id="${esc(id)}">${small(I.refresh, 18)} Повторить</button>`;
  } else body = `<p>${q} ${plural(q, 'вопрос', 'вопроса', 'вопросов')} · 1–2 минуты</p><button class="btn btn-primary btn-sm" data-act="lr-start" data-id="${esc(id)}">Начать урок</button>`;
  const pop = document.createElement('div');
  pop.className = `rd-pop is-${x.state}`;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `Урок ${f.no}`);
  pop.innerHTML = `<div class="rd-pop-k">Урок ${f.no}${total > 1 ? ` из ${total}` : ''}</div><b>${esc(f.topic.title)}</b>${body}<i class="rd-pop-arrow"></i>`;
  el.appendChild(pop);
  const box = el.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, box.width);
  const cx = r.left + r.width / 2 - box.left;
  const left = Math.max(0, Math.min(box.width - w, cx - w / 2));
  pop.style.width = `${w}px`;
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom - box.top + 14}px`;
  pop.querySelector('.rd-pop-arrow').style.left = `${cx - left}px`;
  road.pop = id;
  const pr = pop.getBoundingClientRect();
  if (pr.bottom > window.innerHeight - 90) window.scrollBy({ top: pr.bottom - window.innerHeight + 100, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  if (!road.pop) return;
  if (e.target.closest('.rd-pop') || e.target.closest('.rd-node')) return;
  closePop();
}, true);

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

// ---------------------------------------------------------------- окна: серия и магазин
function openStreak() {
  const s = daily();
  const t = today();
  const streak = L.streakAt(s, t);
  const lit = L.doneToday(s, t);
  const wd = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const week = L.weekView(s, t).map((d, i) => `<div class="lr-wd is-${d.state}"><i>${d.state === 'done' ? LI.flame(18) : d.state === 'frozen' ? LI.snow(16) : ''}</i><small>${wd[i]}</small></div>`).join('');
  openLayer(sheet({
    title: 'Ударный режим',
    body: `<div class="lr-big${lit ? ' on' : ''}"><span class="lr-big-ico">${LI.flame(64)}</span><b class="num">${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')} подряд</span>
        <p>${lit ? 'Сегодня урок пройден — серия продлена.' : streak ? 'Пройдите урок сегодня, чтобы продлить серию.' : 'Пройдите урок — и начнётся серия.'}</p></div>
      <div class="lr-week" aria-label="Эта неделя">${week}</div>
      ${repairHtml(s)}
      <div class="panel">
        <div class="row"><span class="ico" style="--c:var(--accent-2)">${LI.flame(20)}</span><div class="grow"><div class="t1">Лучшая серия</div></div><b class="num">${days(Math.max(s.best, streak))}</b></div>
        <div class="row"><span class="ico" style="--c:var(--night)">${LI.snow(20)}</span><div class="grow"><div class="t1">Заморозки в запасе</div></div><b class="num">${s.freezes} из ${L.FREEZE_MAX}</b></div>
        ${s.sec ? `<div class="row"><span class="ico">${I.clock}</span><div class="grow"><div class="t1">Всего в уроках</div></div><b class="num">${L.fmtSec(s.sec)}</b></div>` : ''}
      </div>
      <div class="lr-how"><b>Как это работает</b>
        <p>Серия растёт, если за день пройден хотя бы один урок. День считается по часовому поясу из настроек.</p>
        <p>Пропустили день — серию сохранит заморозка, она срабатывает сама. Заморозка даётся за каждые ${L.FREEZE_EVERY} дней серии, в запасе — до двух.</p>
        <p>Если серия уже ${L.GIFT_FROM} дней и больше, а заморозок нет, CABINA подарит заморозку (не чаще раза в две недели). А если серия всё же прервалась, её можно вернуть: пройдите урок ${L.REPAIR_DAYS} дня подряд.</p></div>`,
  }));
}
function openShop(focus) {
  const s = daily();
  const el = openLayer(sheet({
    title: 'Магазин',
    body: `<div class="lr-shop">
      <div class="lr-item"><span class="lr-item-ico snow">${LI.snow(30)}</span><div class="grow"><div class="lr-item-h"><b>Заморозка серии</b><span class="lr-have num">${s.freezes} из ${L.FREEZE_MAX}</span></div><p>Сохраняет серию, если вы пропустили день. Срабатывает сама.</p></div></div>
      <p class="hint">Заморозки не продаются — они даются за каждые ${L.FREEZE_EVERY} дней серии. Если серия ${L.GIFT_FROM} дней и больше, а заморозок нет, CABINA подарит одну.</p>
      <div class="lr-item" id="lr-energy"><span class="lr-item-ico bolt">${LI.bolt(30)}</span><div class="grow"><div class="lr-item-h"><b>Энергия</b><span class="lr-have num">${L.ENERGY.unlimited ? '∞' : `${L.energyNow(s, Date.now())} из ${L.ENERGY.max}`}</span></div><p>Нужна, чтобы начать урок: ${L.ENERGY.perLesson} за урок.</p></div></div>
      <p class="hint">${L.ENERGY.unlimited ? 'Сейчас энергия бесконечная — занимайтесь сколько хотите.' : `Восстанавливается: 1 за ${L.ENERGY.regenMin} минут.`}</p>
    </div>`,
  }));
  if (focus === 'energy') setTimeout(() => el.querySelector('#lr-energy')?.scrollIntoView({ block: 'center' }), 60);
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
  playLesson({
    title: f.topic.title,
    kicker: `${course().title} · урок ${f.no}`,
    questions: qs,
    finish: async (r) => {
      const res = L.completeLesson(S.learn, { ...r, lessonId: id, topicLessons: ready(f.topic).map((l) => l.id), today: today() });
      await saveLearn(res.state);
      return res.news;
    },
    onClose: (doneOk) => {
      if (doneOk && wasCurrent) road.just = id;
      ctx.rerender();
    },
  });
}

// ---------------------------------------------------------------- нажатия
export async function learnClick(act, b) {
  if (!act || !act.startsWith('lr-')) return false;
  switch (act) {
    case 'lr-road': road.target = 'current'; ctx.go('learn-road'); break;
    case 'lr-streak': openStreak(); break;
    case 'lr-shop': openShop(b.dataset.focus); break;
    case 'lr-node': openPop(b); break;
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
      const ok = await confirmDialog({ title: 'Пройти курс заново?', text: `Отметки о пройденных уроках курса ${course().title} сотрутся, дорога начнётся сначала. Серия, лучшая серия и заморозки останутся.`, ok: 'Начать заново', cancel: 'Отмена' });
      if (!ok) break;
      const mine = new Set(L.lessonsOf(course(), { drafts: true }).map((x) => x.lesson.id));
      const qids = new Set(L.lessonsOf(course(), { drafts: true }).flatMap((x) => x.lesson.q));
      const done = Object.fromEntries(Object.entries(S.learn.done).filter(([k]) => !mine.has(k)));
      const qs = Object.fromEntries(Object.entries(S.learn.qs).filter(([k]) => !qids.has(k)));
      await saveLearn({ ...S.learn, done, qs });
      toast('Прогресс курса стёрт');
      ctx.rerender();
      break;
    }
    default: return false;
  }
  return true;
}
