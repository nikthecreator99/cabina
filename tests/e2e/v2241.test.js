// Браузерные проверки CABINA 2.24.1: кнопка «Отвлечения» — в карточке «Отработано», справа внизу; «Заработано» — под нормой (по фото Никиты).
// Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const PAY = { main: { mode: 'tariff', rates: [{ from: null, rate: 300 }], bonus: 12, harm: 4, night: 40 } };
const TRIPS = [{ id: 't1', start: '2026-10-05T19:30', end: '2026-10-06T08:10', routeLabel: 'Кемь → Беломорск', locoType: '2ЭС5К', locoNumber: '384' }];

test('«Заработано» под нормой; «Отвлечения» — в карточке месяца, на одной строке с ночными, справа; открывает отвлечения, а не статистику', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: TRIPS, settings: { pay: PAY } });
  await page.reload(); await page.waitForSelector('.hero');
  const btn = page.locator('.hero .hero-foot [data-act=absences]');
  assert.equal(await btn.count(), 1);
  assert.equal(await page.locator('[data-act=absences]').count(), 1, 'кнопка одна — вне карточки её больше нет');
  const b = await btn.boundingBox();
  const n = await page.locator('.hero-lines .hl-night').boundingBox();
  const hero = await page.locator('.hero').boundingBox();
  assert.ok(b.y < n.y + n.height && n.y < b.y + b.height, 'кнопка на одной строке с «Ночные»');
  assert.ok(b.x > n.x + n.width, 'кнопка справа от «Ночные»');
  assert.ok(hero.x + hero.width - (b.x + b.width) < 24, 'прижата к правому краю карточки');
  // 2.24.9: кнопка компактнее (40 px), но зона нажатия по-прежнему 44 px (::before)
  assert.ok(b.height >= 40, 'удобно нажать пальцем');
  assert.ok(await page.locator('.hero-abs').evaluate((el) => parseFloat(getComputedStyle(el, '::before').height) >= 44), 'зона нажатия не меньше 44 px');
  // «Заработано» — под нормой, выше линии (над ночными и кнопкой)
  assert.equal(await page.locator('.hero-left .hero-pay').count(), 1);
  const pay = await page.locator('.hero-pay').boundingBox();
  const foot = await page.locator('.hero-foot').boundingBox();
  const norm = await page.locator('.hero .big').boundingBox(); // 2.24.9: норма — вверху карточки, под ней часы
  assert.ok(pay.y > norm.y && pay.y + pay.height <= foot.y, '«Заработано» между нормой и линией');
  // карточка ниже — «Добавить поездку»
  const add = await page.locator('[data-act=add-trip]').boundingBox();
  assert.ok(add.y > hero.y + hero.height - 1);
  await btn.click();
  await sheet(page).locator('#af-start').waitFor();
  assert.equal(await page.locator('.screen[data-page=stats]').count(), 0, 'статистика не открылась');
  await sheet(page).locator('.type-pick button').filter({ hasText: 'Отпуск' }).click();
  await sheet(page).locator('#af-start').fill('2026-10-19');
  await sheet(page).locator('#af-end').fill('2026-10-20');
  await sheet(page).locator('[data-act=save-abs]').click();
  await waitNoLayers(page);
  assert.equal(await text(page, '.hero [data-act=absences] .count'), '1');
  // нажатие на карточку мимо кнопки по-прежнему открывает статистику
  await page.locator('.hero .big').click();
  await page.locator('.screen[data-page=stats]').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px, светлая тема, очень крупный текст: кнопка в карточке, без прокрутки вбок; без поездок кнопка тоже есть', async () => {
  for (const [textSize, trips] of [['xl', TRIPS], ['m', []]]) {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 760 });
    await seed(page, { trips, settings: { theme: 'light', textSize, pay: trips.length ? PAY : undefined } });
    await page.evaluate((t) => localStorage.setItem('cabina-text', t), textSize);
    await page.reload(); await page.waitForSelector('.hero');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
    const b = await page.locator('.hero [data-act=absences]').boundingBox();
    const hero = await page.locator('.hero').boundingBox();
    assert.ok(b.x >= hero.x && b.x + b.width <= hero.x + hero.width, 'кнопка внутри карточки');
    assert.deepEqual(errors, []);
    await context.close();
  }
});
