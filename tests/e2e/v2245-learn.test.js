// Браузерные проверки CABINA 2.24.5 (просьба Никиты 07.11.2026: «при переходе в „Обучение“ на доли секунды мелькает другой экран»).
// Вкладка «Обучение» и дорога курса открываются сразу готовыми: первый кадр — уже у своего урока (раньше на миг был виден верх
// дороги, потом прыжок), экран «Обучение» — сразу целиком, с картинкой курса и без «проявления». «Назад» с профиля обучения —
// туда же на дороге, где были. Что попадёт в первый кадр, смотрим сразу после обработчика нажатия, до любой отрисовки.
// Данные ниже выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

// n первых уроков курса пройдено; view — где человек был во вкладке в прошлый раз (дорога или экран «Обучение»)
async function prepare(page, { n = 30, view = null, theme = 'dark', width = 390 } = {}) {
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate(async ({ n, view, theme }) => {
    const L = await import('./js/learn-state.js');
    const { PTE } = await import('./js/learn/pte.js');
    const s = await import('./js/store.js');
    await s.saveSettings({ theme });
    const done = {};
    for (const x of L.lessonsOf(PTE, {}).slice(0, n)) done[x.lesson.id] = { n: 1, best: 60, last: 60, acc: 100, at: '2026-10-19' };
    await s.saveLearn(L.normalizeLearn({ ...L.emptyLearn(), done }));
    if (view) localStorage.setItem('cabina-learn-view', view); else localStorage.removeItem('cabina-learn-view');
  }, { n, view, theme });
  await page.reload();
  await page.waitForSelector('.screen');
}
// нажать и посмотреть, что будет в первом кадре: какой экран, «проявляется» ли он, прокрутка, виден ли текущий урок, готова ли
// картинка. Вкладки и карточка курса срабатывают сразу — смотрим сразу после нажатия; «Назад» срабатывает чуть позже (после
// других обработчиков), поэтому frame: true — смотрим перед самой отрисовкой первого кадра
const tapNow = (page, sel, { frame = false } = {}) => page.evaluate(({ sel, frame }) => new Promise((ok) => {
  const look = () => {
    const scr = document.querySelector('#app > .screen');
    const cur = document.querySelector('.rd-node.is-current')?.getBoundingClientRect();
    const head = document.querySelector('.rd-top')?.getBoundingClientRect().bottom || 0;
    const foot = document.querySelector('.tabbar').getBoundingClientRect().top;
    const img = document.querySelector('.lr-cover');
    return {
      page: scr.dataset.page || (scr.classList.contains('lr-hub') ? 'hub' : '?'),
      anim: getComputedStyle(scr).animationName,
      y: Math.round(window.scrollY),
      cur: cur ? cur.top >= head - 1 && cur.bottom <= foot + 1 : null,
      img: img ? img.complete && img.naturalWidth === 658 : null,
    };
  };
  document.querySelector(sel).click();
  if (frame) requestAnimationFrame(() => ok(look())); else ok(look());
}), { sel, frame });
const frames = (page, n = 2) => page.evaluate((n) => new Promise((ok) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : ok()); f(n); }), n);
const scrollNow = (page) => page.evaluate(() => Math.round(window.scrollY));

for (const o of [{ theme: 'dark', width: 390 }, { theme: 'light', width: 320 }]) {
  test(`вкладка «Обучение», ${o.theme === 'dark' ? 'тёмная' : 'светлая'} тема, ${o.width} px: дорога — сразу у своего урока, верх дороги не мелькает`, async () => {
    const { context, page, errors } = await openApp(env);
    await prepare(page, { ...o, view: 'road' });
    const first = await tapNow(page, '.tab[data-tab=learn]');
    assert.equal(first.page, 'learn-road');
    assert.equal(first.anim, 'none', 'без «проявления»');
    assert.ok(first.y > 2000, `сразу вниз, к своему уроку, а не с начала дороги (прокрутка ${first.y})`);
    assert.equal(first.cur, true, 'текущий урок — в первом же кадре');
    await page.waitForTimeout(400);
    assert.equal(await scrollNow(page), first.y, 'и потом никуда не прыгает');
    // на «Главную» и обратно — так же
    await page.locator('.tab[data-tab=home]').click();
    await page.waitForSelector('.screen.home-screen');
    const again = await tapNow(page, '.tab[data-tab=learn]');
    assert.deepEqual([again.page, again.anim, again.cur, again.y], ['learn-road', 'none', true, first.y]);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('экран «Обучение» — сразу целиком, картинка курса загружена заранее; карточка → дорога сразу у урока; «Назад» с профиля обучения — туда же, где были', async () => {
  const { context, page, errors } = await openApp(env);
  await prepare(page);
  // картинку курса приложение загружает само при запуске, ещё до входа во вкладку: при первом же входе после запуска
  // она готова сразу (без этого новая картинка не может быть готова в тот же миг — её ещё надо загрузить)
  await page.waitForTimeout(500);
  const hub = await tapNow(page, '.tab[data-tab=learn]');
  assert.deepEqual(hub, { page: 'hub', anim: 'none', y: 0, cur: null, img: true }, 'в первом кадре карточка уже с электровозом');
  assert.equal(await page.locator('.lr-cover').getAttribute('decoding'), 'sync');
  // вся карточка курса — к своему уроку, тоже сразу
  const road = await tapNow(page, '.lr-course-main');
  assert.deepEqual([road.page, road.anim, road.cur], ['learn-road', 'none', true]);
  assert.ok(road.y > 2000);
  // прокрутили дорогу назад, к началу курса, открыли профиль обучения (молния) и вернулись — дорога там же, где была
  await page.evaluate(() => window.scrollTo(0, 1500));
  await frames(page);
  const y0 = await scrollNow(page);
  assert.equal(y0, 1500);
  await page.locator('.rd-top .lr-st-xp').click();
  await page.waitForSelector('.screen[data-page=learn-me] .lm-xp');
  assert.equal(await scrollNow(page), 0, 'профиль обучения — сверху');
  const back = await tapNow(page, '.page-head [data-act=back]', { frame: true });
  assert.deepEqual([back.page, back.anim, back.y], ['learn-road', 'none', y0], 'первый кадр после «Назад» — там же на дороге');
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node');
  await page.waitForTimeout(300);
  assert.equal(await scrollNow(page), y0);
  // «Назад» с дороги — экран «Обучение», сверху и без «проявления»
  const hub2 = await tapNow(page, '.rd-bar [data-act=back]', { frame: true });
  assert.deepEqual([hub2.page, hub2.anim, hub2.y, hub2.img], ['hub', 'none', 0, true]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Все модули» — сверху, как раньше; тема из списка — дорога открывается сразу у этой темы', async () => {
  const { context, page, errors } = await openApp(env);
  await prepare(page);
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  await page.locator('.lr-all').click();
  await page.waitForSelector('.screen[data-page=learn-modules] [data-act=lr-topic]');
  assert.equal(await scrollNow(page), 0);
  // тема из середины курса, где уроки уже есть
  const id = await page.evaluate(() => [...document.querySelectorAll('[data-act=lr-topic]:not(.is-soon)')][20]?.dataset.id);
  assert.ok(id);
  const r = await page.evaluate((id) => {
    document.querySelector(`[data-act=lr-topic][data-id="${id}"]`).click();
    const b = document.getElementById(`rd-${id}`).getBoundingClientRect();
    const head = document.querySelector('.rd-top').getBoundingClientRect().bottom;
    return { y: Math.round(window.scrollY), top: b.top - head, h: window.innerHeight - head };
  }, id);
  assert.ok(r.y > 1000, `сразу вниз, к теме (прокрутка ${r.y})`);
  assert.ok(r.top >= 0 && r.top < r.h * 0.3, `табличка темы — у верха дороги (${Math.round(r.top)} из ${Math.round(r.h)})`);
  await page.waitForTimeout(300);
  assert.equal(await scrollNow(page), r.y, 'потом никуда не прыгает');
  assert.deepEqual(errors, []);
  await context.close();
});
