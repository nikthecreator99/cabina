// Браузерные проверки CABINA 2.29.0: вечернее напоминание об ударном режиме (просьба Никиты 11.11.2026:
// «ближе к вечеру напоминать, если не продлил ударный режим — всего минута твоего времени»). Только внутри приложения:
// плашка на главной и точка на вкладке «Обучение». Данные выдуманные. CABINA_SHOTS=папка — снимки экрана.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, closeTop } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });
const EVENING = '2026-10-20T19:00:00+03:00';
const shot = async (page, name) => { if (process.env.CABINA_SHOTS) await page.screenshot({ path: `${process.env.CABINA_SHOTS}/${name}.png` }); };

async function prepare(page, { days = ['2026-10-18', '2026-10-19'], freezes = 0, theme = 'dark', text = 'm' } = {}) {
  await page.evaluate(async ({ days, freezes, theme, text }) => {
    const L = await import('./js/learn-state.js');
    const s = await import('./js/store.js');
    await s.saveSettings({ theme, textSize: text });
    localStorage.setItem('cabina-text', text);
    await s.saveLearn(L.normalizeLearn({ ...L.emptyLearn(), days, freezes }));
  }, { days, freezes, theme, text });
  await page.reload();
  await page.waitForSelector('.screen');
}
const nag = (page) => page.locator('#streak-nag');
const dot = (page) => page.locator('.tab[data-tab=learn]').evaluate((t) => t.classList.contains('has-dot'));

test('вечером серия не продлена — плашка на главной и точка на «Обучении»; «Пройти» ведёт к уроку', async () => {
  const { context, page, errors } = await openApp(env, { now: EVENING });
  await prepare(page, { freezes: 1 });
  await nag(page).waitFor();
  const t = await nag(page).innerText();
  assert.match(t, /Ударный режим: 2 дня/);
  assert.match(t, /Сегодня ещё без урока — всего минута/);
  assert.match(t, /Заморозка в запасе/, 'заморозка — честно');
  assert.equal(await dot(page), true);
  await shot(page, 'nudge-dark-390');
  await nag(page).locator('[data-act=streak-go]').click();
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node.is-current');
  assert.equal(await page.locator('.tab[data-tab=learn]').getAttribute('aria-current'), 'page');
  assert.deepEqual(errors, []);
  await context.close();
});

test('днём, после урока сегодня и без серии — не напоминаем', async () => {
  for (const o of [{ now: '2026-10-20T17:59:00+03:00', days: ['2026-10-19'] }, { now: EVENING, days: ['2026-10-19', '2026-10-20'] }, { now: EVENING, days: ['2026-10-10'] }, { now: EVENING, days: [] }]) {
    const { context, page, errors } = await openApp(env, { now: o.now });
    await prepare(page, { days: o.days });
    assert.equal(await nag(page).count(), 0, JSON.stringify(o));
    assert.equal(await dot(page), false, JSON.stringify(o));
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('крестик — до завтра; выключатель в окне «Ударный режим» — совсем', async () => {
  const { context, page, errors } = await openApp(env, { now: EVENING });
  await prepare(page);
  await nag(page).locator('[data-act=streak-hide]').click();
  await page.waitForSelector('#streak-nag', { state: 'detached' });
  assert.equal(await dot(page), false);
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await nag(page).count(), 0, 'сегодня — больше нет');
  // завтра вечером — снова (серия ещё жива: вчера урок был… нет — позавчера; продлим вчерашним днём)
  await page.evaluate(() => localStorage.setItem('cabina-streak-nag', JSON.stringify({ hid: '2026-10-19' })));
  await page.reload(); await page.waitForSelector('#streak-nag');
  // выключаем совсем
  await page.locator('.tab[data-tab=learn]').click();
  await page.locator('[data-act=lr-streak]').first().click();
  const sw = page.locator('#lr-nudge-sw');
  assert.equal(await sw.getAttribute('aria-checked'), 'true');
  await sw.click();
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  await closeTop(page);
  assert.equal(await dot(page), false);
  await page.locator('.tab[data-tab=home]').click();
  await page.waitForSelector('.home-screen');
  assert.equal(await nag(page).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'dark' ? 'тёмная' : 'светлая'} тема: плашка помещается`, async () => {
    const { context, page, errors } = await openApp(env, { now: EVENING });
    await page.setViewportSize({ width: 320, height: 700 });
    await prepare(page, { theme, text: 'xl', freezes: 2 });
    await nag(page).waitFor();
    const box = await nag(page).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, `ширина ${JSON.stringify(box)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, 'нет прокрутки вбок');
    await nag(page).scrollIntoViewIfNeeded();
    await shot(page, `nudge-${theme}-320-xl`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
