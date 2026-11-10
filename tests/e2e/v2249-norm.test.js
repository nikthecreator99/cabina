// Браузерные проверки CABINA 2.24.9: норма и отвлечения — по листку нормы часов депо (шестидневка),
// вверху карточки «Норма 159 ч (46 ч)», кнопка «Отвлечения» без пальмы и свечения. Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers, openSettings } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const NOV10 = '2026-11-10T12:00:00+03:00';

test('«Норма 159 ч (46 ч)» вместо «Отработано в ноябре»; отвлечение — по 7 ч, как на листке', async () => {
  const { context, page, errors } = await openApp(env, { now: NOV10 });
  assert.equal(await text(page, '#hero-norm'), 'Норма 159 ч (46 ч)');
  assert.doesNotMatch(await text(page, '.hero'), /Отработано в/);
  assert.equal(await page.locator('.hero .norm-line').count(), 0, 'норма не повторяется второй строкой');
  // отпуск 9–10 ноября (пн, вт): 7 + 7
  await page.locator('[data-act=absences]').click();
  const f = sheet(page);
  await f.locator('.type-pick button').filter({ hasText: 'Отпуск' }).click();
  await f.locator('#af-start').fill('2026-11-07');
  await f.locator('#af-end').fill('2026-11-10');
  // суббота 5 ч, воскресенье 0
  assert.equal(await text(f, '#af-breakdown'), '5 + 7 + 7, выходной — 0');
  assert.match(await f.locator('#af-hours').innerText(), /Из нормы вычтется\s*19 ч/);
  await f.locator('[data-act=save-abs]').click();
  await waitNoLayers(page);
  // норма 159 − 19 = 140; на сегодня 46 − 19 = 27
  assert.equal(await text(page, '#hero-norm'), 'Норма 140 ч (27 ч)');
  assert.match(await text(page, '.hero'), /159 ч по календарю − 19 ч отвлечений/);
  // прошлый месяц — без скобок; октябрь по шестидневке — 179 ч
  await page.locator('[data-act=prev]').click();
  assert.equal(await text(page, '#hero-norm'), 'Норма 179 ч');
  assert.deepEqual(errors, []);
  await context.close();
});

test('пятидневка для других депо: переключатель в «Календарь и часовой пояс», норма и отвлечения пересчитываются', async () => {
  const { context, page, errors } = await openApp(env, { now: NOV10 });
  await seed(page, { absences: [{ id: 'v1', type: 'vacation', start: '2026-11-09', end: '2026-11-10' }] });
  assert.equal(await text(page, '#hero-norm'), 'Норма 145 ч (32 ч)');
  await openSettings(page, 'set-time');
  assert.equal(await page.locator('#week-seg [aria-pressed=true]').innerText(), 'Шестидневка');
  assert.match(await text(page, '#week-hint'), /по 7 ч, суббота 5 ч/);
  await page.locator('[data-act=norm-week][data-v="5"]').click();
  await page.waitForFunction(() => document.querySelector('#week-seg [aria-pressed=true]')?.textContent === 'Пятидневка');
  assert.match(await text(page, '[data-act=cal-info]'), /пятидневка[\s\S]*2026 год — 1972 ч/);
  await page.reload(); await page.waitForSelector('.hero');
  // пятидневка: 159 − 16 = 143; со 2 по 10 ноября: 8 + 7 + 8 + 8 (+ 8 + 8 — отпуск) = 31
  assert.equal(await text(page, '#hero-norm'), 'Норма 143 ч (31 ч)');
  assert.deepEqual(errors, []);
  await context.close();
});

test('кнопка «Отвлечения»: без пальмы и синего свечения, компактная; 320 px, светлая тема, очень крупный текст', async () => {
  const { context, page, errors } = await openApp(env, { now: NOV10 });
  await seed(page, { settings: { theme: 'light', textSize: 'xl' }, absences: [{ id: 'v1', type: 'sick', start: '2026-11-02', end: '2026-11-03' }] });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.reload(); await page.waitForSelector('.hero');
  const btn = page.locator('.hero-abs');
  assert.equal(await btn.locator('svg').count(), 0, 'без значка-пальмы');
  assert.equal(await btn.evaluate((el) => getComputedStyle(el).boxShadow), 'none', 'без свечения');
  const b = await btn.boundingBox();
  assert.ok(b.height < 44 && b.height >= 40, `компактнее: ${b.height}`);
  assert.match(await btn.innerText(), /^Отвлечения\s*1$/);
  const hero = await page.locator('.hero').boundingBox();
  const norm = await page.locator('#hero-norm').boundingBox();
  assert.ok(norm.x + norm.width <= hero.x + hero.width, 'норма не вылезает из карточки');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'нет прокрутки вбок');
  await btn.click();
  assert.match(await sheet(page).innerText(), /Больничный/);
  assert.deepEqual(errors, []);
  await context.close();
});
