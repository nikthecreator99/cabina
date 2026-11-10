// Браузерные проверки CABINA 2.19.4: награда «Свой человек» за аккаунт CABINA.
// Сервер подменён (mock-colleagues.js), люди и поездки выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { mockServer, signIn, TRIP } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const award = (page) => page.locator('.aw[data-id=account]');
async function openAwards(page) {
  await tab(page, 'profile');
  await page.locator('#pr-awards .aw-strip').click();
  await page.waitForSelector('.aw-grid');
}

test('без аккаунта «Свой человек» закрыт и честно пишет, как его получить', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [TRIP] });
  await openAwards(page);
  assert.match(await text(page, '.screen'), /Особые[\s\S]*Свой человек/i);
  assert.match(await award(page).getAttribute('class'), /locked/);
  await award(page).click();
  const s = top(page);
  assert.match(await s.innerText(), /Свой человек[\s\S]*Создать аккаунт CABINA\.[\s\S]*Пока не получена/);
  assert.doesNotMatch(await s.innerText(), /0 из 1/, 'без полоски «0 из 1»');
  assert.deepEqual(errors, []);
  await context.close();
});

test('вошли в аккаунт — поздравление и награда; после выхода награда остаётся; на сервер о ней ничего не уходит; 320 px, обе темы', async () => {
  const { context, page, errors } = await openApp(env, { awards: true });
  const srv = await mockServer(context);
  await seed(page, { trips: [TRIP] });
  await signIn(page);
  await page.reload(); await page.waitForSelector('.screen');
  // поздравление окном
  const d = top(page);
  await d.locator('.aw-dialog').waitFor({ timeout: 5000 });
  assert.match(await d.innerText(), /Свой человек[\s\S]*Пропуск выдан[\s\S]*Новая награда!/);
  await d.locator('[data-act=aw-see]').click();
  await waitNoLayers(page);
  await page.waitForSelector('.aw-grid');
  assert.doesNotMatch(await award(page).getAttribute('class'), /locked/);
  const day = await page.evaluate(async () => (await import('./js/store.js')).S.profile.accountAward);
  assert.equal(day, '2026-10-20', 'хранится только день получения');
  await award(page).click();
  assert.match(await top(page).innerText(), /Свой человек[\s\S]*Пропуск выдан[\s\S]*Получена 20 октября/);
  await top(page).locator('[data-close]').first().click();
  await waitNoLayers(page);
  // на сервер о награде ничего не уходит
  assert.ok(!JSON.stringify(srv.log).includes('accountAward') && !JSON.stringify(srv.log).includes('Свой человек'));
  // вышли из аккаунта — награда остаётся (отзыв согласия ничем не наказывается), второго поздравления нет
  await page.evaluate(() => localStorage.removeItem('cabina-account'));
  await page.reload(); await page.waitForSelector('.screen');
  await openAwards(page);
  assert.doesNotMatch(await award(page).getAttribute('class'), /locked/);
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.aw-dialog').count(), 0);
  // 320 px, светлая тема
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await fits(page));
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ theme: 'light' }); });
  assert.ok(await fits(page));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
