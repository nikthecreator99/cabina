// Браузерные проверки CABINA 2.20.1: полоска наград в профиле видна и без поездок, если есть награда
// («Идейный», «Наставник», «Свой человек»). Данные выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();

test('без поездок и без наград — полоски наград в профиле нет', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.waitForSelector('.screen');
  assert.equal(await page.locator('#pr-awards').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('без поездок, но с принятой идеей — полоска видна, «Идейный» получен', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    await s.saveProfile({ ideas: { n: 1, days: ['2026-10-20'] } });
  });
  await tab(page, 'profile');
  await page.waitForSelector('#pr-awards .aw-strip');
  assert.match(await text(page, '#pr-awards .group-title'), /Награды\s+Все 1 из 40/i);
  await page.locator('#pr-awards .aw-strip').click();
  await page.waitForSelector('.aw-grid');
  assert.doesNotMatch(await page.locator('.aw[data-id=idea]').getAttribute('class'), /locked/);
  assert.deepEqual(errors, []);
  await context.close();
});
