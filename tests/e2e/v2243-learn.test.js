// Браузерные проверки CABINA 2.24.3: экран «Обучение» по макету Никиты 06.11.2026 (картинку он сделал в ChatGPT).
// В шапке — магазин и яркая кнопка профиля обучения; в строке — серия, заморозки (нет ни одной — «0» красным), монеты, опыт и кубок
// («Лига коллег» — скоро); карточка курса — тёмная «афиша» в обеих темах с электровозом из макета, рамкой-градиентом и красной точкой
// прогресса. Большие числа не обрезаются: если не влезают с кубком — кубок прячется. Данные ниже выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const statNums = (page) => page.locator('.lr-hub .lr-stats .lr-st b').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
const seedLearn = (page, st, n = 0) => page.evaluate(async ({ st, n }) => {
  const L = await import('./js/learn-state.js');
  const { PTE } = await import('./js/learn/pte.js');
  const s = await import('./js/store.js');
  const done = {};
  for (const x of L.lessonsOf(PTE, {}).slice(0, n)) done[x.lesson.id] = { n: 1, best: 60, last: 60, acc: 100, at: '2026-10-20' };
  await s.saveLearn(L.normalizeLearn({ ...L.emptyLearn(), ...st, done }));
}, { st, n });
async function openHub(page, { theme = 'dark', text = 'm' } = {}) {
  await page.evaluate(async ({ theme, text }) => { const s = await import('./js/store.js'); await s.saveSettings({ theme, textSize: text }); }, { theme, text });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  await page.waitForFunction(() => document.querySelector('.lr-cover')?.complete);
}
const colorOf = (page, sel, prop = 'color') => page.locator(sel).first().evaluate((e, prop) => getComputedStyle(e)[prop], prop);
const shown = (page, sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).display !== 'none');
// размеры нескольких элементов — в одном кадре (экран может ещё въезжать после «Назад»)
const boxes = (page, sels) => page.evaluate((sels) => sels.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }), sels);

test('шапка, строка и карточка курса — как на макете Никиты: профиль яркий, снежинка, кубок — «Лига коллег», картинка электровоза', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, { days: ['2026-10-20'], best: 1, xp: 40, coins: 70, freezes: 0 }, 3);
  await openHub(page);
  // шапка: «Обучение», магазин и профиль обучения — одинаковые квадратные кнопки; профиль — закрашенный яркий значок
  assert.equal(await page.locator('.lr-head h1').innerText(), 'Обучение');
  assert.deepEqual(await page.locator('.lr-head .lr-hbtn').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['Магазин', 'Профиль обучения']);
  assert.equal(await colorOf(page, '.lr-me-btn .ic-me-b', 'fill'), 'rgb(139, 107, 255)', 'профиль — яркий, не белый контур');
  const [bag, me, cup] = await boxes(page, ['.lr-head [data-act=lr-shop]', '.lr-me-btn', '.lr-hub .lr-cup']);
  assert.deepEqual([bag.width, me.width, cup.width, me.height, cup.height].map(Math.round), [48, 48, 48, 48, 48]);
  assert.ok(Math.abs(me.x - cup.x) < 1, 'кубок — ровно под кнопкой профиля');
  // строка: огонь, снежинка, гайка, молния, кубок; заморозок нет — «0» красным
  assert.deepEqual(await page.locator('.lr-hub .lr-stats > *').evaluateAll((els) => els.map((e) => e.className.split(' ')[1] || e.className)),
    ['lr-st-fire', 'lr-st-ice', 'lr-st-coin', 'lr-st-xp', 'lr-cup']);
  assert.deepEqual(await statNums(page), ['1', '0', '70', '40']);
  assert.equal(await colorOf(page, '.lr-hub .lr-st-ice b'), 'rgb(255, 77, 79)');
  assert.equal(await page.locator('.lr-hub .lr-st-ice').getAttribute('aria-label'), 'Заморозки: 0 из 2. Магазин');
  // снежинка — магазин, где покупают заморозки
  await page.locator('.lr-hub .lr-st-ice').click();
  await top(page).locator('.lr-shop').waitFor();
  assert.match(await top(page).locator('.lr-shop-top').innerText(), /Заморозки: 0 из 2/);
  await top(page).locator('button[data-close]').first().click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  // кубок — «Лига коллег»: пока только объяснение, по согласию, опыт — только в телефоне
  await page.locator('.lr-hub .lr-cup').click();
  await top(page).locator('.lr-league').waitFor();
  const league = await top(page).innerText();
  assert.match(league, /Лига коллег[\s\S]*Скоро[\s\S]*только по вашему согласию[\s\S]*только в этом телефоне/);
  await top(page).locator('button[data-close]').first().click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  // кнопка профиля — профиль обучения
  await page.locator('.lr-me-btn').click();
  await page.waitForSelector('.screen[data-page=learn-me] .lm-xp');
  await page.locator('.page-head [data-act=back]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  await page.waitForFunction(() => document.querySelector('.lr-cover')?.complete);
  // картинка электровоза из макета: загрузилась, справа сверху, без подписи для чтения с экрана
  const img = await page.locator('.lr-cover').evaluate((e) => ({ w: e.naturalWidth, h: e.naturalHeight, alt: e.getAttribute('alt'), src: e.getAttribute('src') }));
  assert.deepEqual(img, { w: 658, h: 485, alt: '', src: 'icons/learn/pte-course.webp' });
  const [card, cov, dot, t, all] = await boxes(page, ['.lr-course', '.lr-cover', '.lr-course .bar > i', '.lr-prog-t', '.lr-all']);
  assert.ok(Math.abs(card.x + card.width - 1.5 - (cov.x + cov.width)) < 1 && Math.abs(card.y + 1.5 - cov.y) < 1, 'картинка прижата к правому верхнему углу');
  assert.ok(cov.height / card.height > 0.6 && cov.height / card.height < 0.8, `картинка — около 70% высоты карточки, сейчас ${(cov.height / card.height).toFixed(2)}`);
  // прогресс — красная точка, «Пройдено» и «Все модули» — на одной линии
  assert.ok(dot.width >= 9 && dot.width < 20, 'малый прогресс — круглая точка');
  assert.ok(Math.abs(t.y + t.height / 2 - (all.y + all.height / 2)) < 2, '«Пройдено» и «Все модули» на одной линии');
  // нажатие на картинку — тоже дорога у текущего урока (картинка — часть карточки-кнопки)
  await page.mouse.click(cov.x + cov.width / 2, cov.y + cov.height / 2);
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node.is-current');
  // та же строка — в шапке дороги
  assert.equal(await page.locator('.rd-top .lr-st-ice b').innerText(), '0');
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('светлая тема: карточка курса остаётся тёмной «афишей»; заморозки есть — число голубое; прогресса нет — точки нет', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, { freezes: 2 });
  await openHub(page, { theme: 'light' });
  assert.match(await colorOf(page, '.lr-course', 'backgroundImage'), /rgb\(19, 27, 46\)/, 'фон карточки — тёмно-синий и в светлой теме');
  assert.equal(await colorOf(page, '.lr-course .lr-title'), 'rgb(246, 246, 250)');
  assert.equal(await colorOf(page, '.lr-course .lr-all'), 'rgb(255, 255, 255)');
  assert.equal(await colorOf(page, '.lr-hub .lr-st-ice b'), 'rgb(31, 127, 224)', 'две заморозки — голубым, а не красным');
  assert.equal(await page.locator('.lr-course .bar > i.on').count(), 0);
  assert.equal((await page.locator('.lr-course .bar > i').boundingBox())?.width || 0, 0, 'без пройденных уроков точки нет');
  assert.match(await page.locator('.lr-prog').innerText(), /Пройдено 0%/);
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('большие числа и узкий экран: числа целиком (кубок прячется, если не влезает); подпись курса не наезжает на электровоз и книгу', async () => {
  const { context, page, errors } = await openApp(env);
  const unclipped = () => page.locator('.lr-hub .lr-stats .lr-st b').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  // подпись «Правила технической эксплуатации» — левее непрозрачной части картинки (слева треть картинки уходит в прозрачность)
  const subClear = () => page.evaluate(() => {
    const s = document.querySelector('.lr-course .lr-sub').getBoundingClientRect();
    const c = document.querySelector('.lr-cover').getBoundingClientRect();
    return s.right <= c.left + c.width * 0.32 + 2;
  });
  // обычные числа на 390 px — кубок на месте
  await seedLearn(page, { days: ['2026-10-20'], xp: 40, coins: 70 }, 3);
  await openHub(page);
  assert.ok(await shown(page, '.lr-hub .lr-cup'));
  assert.ok(await subClear(), 'подпись, 390 px');
  // большие числа на 390 px — кубок прячется, числа целиком
  await seedLearn(page, { days: ['2026-10-20'], best: 365, xp: 12345, coins: 1234, freezes: 2 }, 3);
  await openHub(page);
  assert.deepEqual(await statNums(page), ['1', '2', '1 234', '12 345']);
  assert.equal(await page.locator('.lr-hub .lr-stats.tight').count(), 1);
  assert.equal(await shown(page, '.lr-hub .lr-cup'), false);
  assert.ok(await unclipped(), 'числа целиком, 390 px');
  for (const [w, text] of [[320, 'm'], [320, 'xl'], [360, 'l'], [390, 'l'], [412, 'xl']]) {
    await page.setViewportSize({ width: w, height: 760 });
    await openHub(page, { text });
    assert.ok(await unclipped(), `числа целиком, ${w} px, текст ${text}`);
    assert.ok(await subClear(), `подпись, ${w} px, текст ${text}`);
    assert.ok(await fits(page), `${w} px, текст ${text}`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});
