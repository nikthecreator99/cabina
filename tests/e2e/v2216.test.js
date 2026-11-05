// Браузерные проверки CABINA 2.21.6 (просьба Никиты 05.11.2026): Настройки → «Оформление» → «Размер текста».
// «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, openSettings } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const fs = (page) => page.evaluate(() => [document.documentElement.getAttribute('data-text'), getComputedStyle(document.body).fontSize]);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('размер текста: крупный и очень крупный, запоминается после перезапуска, «Обычный» возвращает как было', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page, { trips: [{ id: 't1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-19T06:00', end: '2026-10-19T14:00', restType: 'turnaround', locoType: '2ЭС5К', locoNumber: '0123' }] });
  await page.reload(); await page.waitForSelector('.screen');
  assert.deepEqual(await fs(page), [null, '16px']);
  await openSettings(page, 'set-look');
  await page.locator('#text-seg [data-v=l]').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-text') === 'l');
  assert.deepEqual(await fs(page), ['l', '18.4px']);
  assert.equal(await page.locator('#text-seg [data-v=l]').getAttribute('aria-pressed'), 'true');
  await page.locator('#text-seg [data-v=xl]').click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-text') === 'xl');
  assert.deepEqual(await fs(page), ['xl', '20.8px']);
  assert.ok(await fits(page));
  // после перезапуска — сразу крупный (до отрисовки, js/boot.js) и в настройках сохранён
  await page.reload(); await page.waitForSelector('.screen');
  assert.deepEqual(await fs(page), ['xl', '20.8px']);
  assert.equal(await page.evaluate(() => window.__cabina.S.settings.textSize), 'xl');
  // главная: часы и заработок поездки — строкой ниже, ничего не вылезает за экран
  await page.locator('.tab[data-tab=home]').click();
  const card = page.locator('.trip[data-id=t1]');
  await card.waitFor();
  const [mid, right] = await Promise.all([card.locator('.trip-mid').boundingBox(), card.locator('.trip-right').boundingBox()]);
  assert.ok(right.y >= mid.y + mid.height - 1, 'часы — под поездкой');
  assert.ok(await fits(page));
  // строка в Настройках подсказывает выбранный размер
  await openSettings(page);
  assert.match(await page.locator('#set-look-row').innerText(), /очень крупный текст/);
  await openSettings(page, 'set-look');
  await page.locator('#text-seg [data-v=m]').click();
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-text'));
  assert.deepEqual(await fs(page), [null, '16px']);
  assert.deepEqual(errors, []);
  await context.close();
});
