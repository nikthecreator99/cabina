// Браузерные проверки CABINA 2.21.10 (просьба Никиты 05.11.2026): «Мой год в CABINA» — итоги года картинками.
// Все данные выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const DEC = '2026-12-10T12:00:00+03:00';
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const ROUTES = [{ id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 312 }];
const trips = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 3 + i * 9)).toISOString().slice(0, 10);
  return { id: `y${i}`, routeId: 'r1', start: `${d}T19:00`, end: `${d}T23:59`, locoType: '2ЭС5К', locoNumber: String(300 + (i % 4)), restType: 'turnaround' };
});

// прочитать QR-код с картинки в окне (jsQR из приложения)
const readQr = (page, sel) => page.evaluate(async (sel) => {
  const img = document.querySelector(sel);
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const jsQR = (await import('./js/vendor/jsqr.js')).default;
  const d = cx.getImageData(0, 0, cv.width, cv.height);
  return jsQR(d.data, d.width, d.height)?.data || null;
}, sel);

test('декабрь: плашка «Мой год» на главной, 6 картинок 1080×1920, QR на сайт, «Скрыть»', async () => {
  const { context, page, errors } = await openApp(env, { now: DEC });
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { routes: ROUTES, trips: trips(30) });
  await page.reload(); await page.waitForSelector('.screen');
  const nag = page.locator('#year-nag');
  await nag.waitFor();
  assert.match(await nag.innerText(), /Мой 2026 год в CABINA/);
  assert.ok(await fits(page));
  await nag.locator('[data-act=year-open]').click();
  const sh = top(page);
  await sh.locator('.year-img').first().waitFor();
  assert.equal(await sh.locator('.year-img').count(), 6);
  const size = await sh.locator('.year-img').evaluateAll((els) => Promise.all(els.map(async (e) => { await e.decode(); return `${e.naturalWidth}x${e.naturalHeight}`; })));
  assert.deepEqual([...new Set(size)], ['1080x1920']);
  assert.match(await sh.innerText(), /Без сумм, имени, депо, станций и номеров локомотивов/);
  assert.equal(await readQr(page, '.year-card:last-child .year-img'), 'https://cabina-app.ru/');
  assert.ok(await fits(page));
  // сохранить одну картинку
  const [dl] = await Promise.all([page.waitForEvent('download'), sh.locator('[data-act=year-one]').first().click()]);
  assert.equal(dl.suggestedFilename(), 'CABINA-2026-1.png');
  await sh.locator('button[data-close]').first().click();
  // скрыть — больше не показываем в этом году
  await page.locator('#year-nag [data-act=year-hide]').click();
  assert.equal(await page.locator('#year-nag').count(), 0);
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('#year-nag').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('плашки нет в октябре и при малом числе поездок; в статистике за год — кнопка', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: trips(5) });
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('#year-nag').count(), 0);
  await page.locator('.hero[data-act=stats]').click();
  assert.equal(await page.locator('#st-year').count(), 0, 'за месяц кнопки нет');
  await page.locator('#st-period button').filter({ hasText: 'Год' }).click();
  await page.locator('#st-year').click();
  const sh = top(page);
  await sh.locator('.year-img').first().waitFor();
  assert.ok(await sh.locator('.year-img').count() >= 5);
  await sh.locator('button[data-close]').first().click();
  await context.close();
  const B = await openApp(env, { now: DEC });
  await seed(B.page, { routes: ROUTES, trips: trips(5) });
  await B.page.reload(); await B.page.waitForSelector('.screen');
  assert.equal(await B.page.locator('#year-nag').count(), 0, 'меньше 10 поездок за год — плашки нет');
  assert.deepEqual([...errors, ...B.errors], []);
  await B.context.close();
});
