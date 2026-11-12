// Браузерные проверки CABINA 2.29.1: алименты в удержаниях, станции участка без стрелочек.
// Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS;
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
async function workPage(page, name) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  if (name) await page.locator(`.screen [data-act=go][data-page=${name}]`).click();
}
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
const theme = (page, t) => page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t }); document.documentElement.setAttribute('data-theme', t); }, t);

test('алименты: поле в удержаниях, не больше 70%, строка в квитке после НДФЛ', async () => {
  const { context, page, errors } = await openApp(env);
  // 10 ч × 300 = 3000 ₽; НДФЛ 390; алименты 25% от 2610 = 652,50
  await seed(page, { settings: { pay: PAY }, trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T18:00', restType: 'turnaround' }] });
  await workPage(page, 'tariffs');
  const f = page.locator('#pf-alimony');
  assert.equal(await f.count(), 1);
  // поле — в блоке «Удержания», после профсоюза и пенсии
  assert.ok((await f.boundingBox()).y > (await page.locator('#pf-pension').boundingBox()).y);
  assert.match(await text(page, '.screen'), /Алименты[\s\S]*после вычета НДФЛ/);
  await f.fill('80');
  await f.blur();
  await page.locator('.toast', { hasText: 'не больше 70%' }).waitFor();
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.settings.pay.main.alimony), undefined);
  await f.fill('25');
  await f.blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.pay.main?.alimony === 25);
  for (const t of ['dark', 'light']) {
    await theme(page, t);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('#pf-alimony').scrollIntoViewIfNeeded();
    const box = await page.locator('#pf-alimony').boundingBox();
    assert.ok(box.x + box.width <= 320, 'поле влезает в 320 px');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/alimony-${t}-320.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await theme(page, 'dark');
  await tab(page, 'home');
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  const s = (await text(page, '.screen')).replace(/\s+/g, ' ');
  assert.match(s, /Удержано НДФЛ 13% 390,00 ₽ Алименты 25% 652,50 ₽ На руки ≈ 1 958 ₽/i);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/alimony-slip.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
});

test('станции участка: без стрелочек, «Убрать станцию» работает, 320 px в обеих темах', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: [{ id: 'r1', from: 'Малошуйка', to: 'Обозерская', distanceKm: 100, stations: ['Нименга', 'Шастинский', 'Поньга'] }] });
  for (const t of ['dark', 'light']) {
    await theme(page, t);
    await page.setViewportSize({ width: t === 'dark' ? 390 : 320, height: 760 });
    await workPage(page, 'routes');
    await page.locator('[data-act=route][data-id=r1]').click();
    const f = sheet(page);
    await f.locator('[data-act=st-open]').click();
    assert.equal(await f.locator('[data-st-name]').count(), 3);
    assert.equal(await f.locator('[data-act=st-up]').count(), 0, 'стрелочек нет');
    assert.equal(await f.locator('.st-item [data-act=st-del]').count(), 3);
    const inp = await f.locator('[data-st-name]').first().boundingBox();
    const del = await f.locator('.st-item [data-act=st-del]').first().boundingBox();
    assert.ok(del.x > inp.x + inp.width, 'кнопка справа от поля');
    assert.ok(del.x + del.width <= (t === 'dark' ? 390 : 320), 'влезает в экран');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/stations-${t}.png` });
    if (t === 'light') {
      await f.locator('.st-item', { has: page.locator('input[value="Шастинский"]') }).locator('[data-act=st-del]').click();
      assert.equal(await f.locator('[data-st-name]').count(), 2);
      await f.locator('[data-act=save-route]').click();
      await waitNoLayers(page);
      assert.deepEqual(await page.evaluate(async () => (await import('./js/store.js')).S.routes[0].stations), ['Нименга', 'Поньга']);
    } else {
      await f.locator('button[data-close]').first().click();
      await waitNoLayers(page);
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
});
