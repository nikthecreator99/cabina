// Браузерные проверки CABINA 2.26.2 (просьба Никиты 10.11.2026): статус поездки важнее выбранного отдыха —
// полного, выходного и др. — на главной и в профиле (из него же — статус для коллег). Все данные выдуманные.
// «Сейчас» по умолчанию — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const FULL = [
  { id: 'a', start: '2026-10-19T08:00', end: '2026-10-19T14:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround' },
  { id: 'b', start: '2026-10-19T20:00', end: '2026-10-20T02:00', routeLabel: 'Ольховка → Сосновка', restType: 'home', homeChoice: 'full', homeRest: { ids: ['a', 'b'] } },
];
const status = async (page) => {
  await page.locator('.tab[data-tab=profile]').click();
  await page.waitForSelector('#pr-status');
  return text(page, '#pr-status');
};

test('полный отдых, а поездку записали сразу с окончанием — на главной нет отдыха, в профиле «В пути»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: FULL });
  await page.waitForFunction(() => /Полный отдых/.test(document.querySelector('.rest-banner')?.innerText || ''));
  assert.match(await status(page), /Между поездками[\s\S]*полный отдых/);
  await page.locator('.tab[data-tab=home]').click();
  await seed(page, { trips: [{ id: 'c', start: '2026-10-20T10:00', end: '2026-10-20T18:00', routeLabel: 'Сосновка → Ольховка', restType: null }] });
  await page.waitForFunction(() => !/Полный отдых/.test(document.querySelector('.home-screen')?.innerText || ''));
  assert.equal(await page.locator('.rest-banner').count(), 0);
  const st = await status(page);
  assert.match(st, /В пути с\s*10:00/);
  assert.match(st, /Сосновка → Ольховка/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('явка на записанную поездку завтра — «До явки осталось», а не полный отдых', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [...FULL, { id: 'c', start: '2026-10-21T06:00', end: '2026-10-21T14:00', routeLabel: 'Сосновка → Ольховка', restType: null }] });
  await page.waitForFunction(() => /До явки осталось/.test(document.querySelector('.rest-banner')?.innerText || ''));
  assert.equal(await page.locator('.rest-banner').count(), 1);
  assert.match(await status(page), /Скоро явка/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('выходной, но вызвали и отдыхаем в пункте оборота — «На отдыхе»; 320 px, светлая тема', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 720 });
  await seed(page, { settings: { theme: 'light' }, trips: [
    { id: 'd', start: '2026-10-18T22:00', end: '2026-10-19T06:00', routeLabel: 'Ольховка → Сосновка', restType: 'home', homeChoice: 'dayOff' },
    { id: 'e', start: '2026-10-20T01:00', end: '2026-10-20T09:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround' },
  ] });
  await page.waitForFunction(() => /Отдых в пункте оборота/.test(document.querySelector('.rest-banner')?.innerText || ''));
  assert.doesNotMatch(await text(page, '.home-screen'), /На выходном/);
  assert.equal(await fits(page), true);
  const st = await status(page);
  assert.match(st, /На отдыхе[\s\S]*Ольховка/);
  assert.equal(await fits(page), true);
  assert.deepEqual(errors, []);
  await context.close();
});
