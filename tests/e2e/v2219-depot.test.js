// Браузерные проверки CABINA 2.21.9 (просьба Никиты 05.11.2026): настройки депо одним QR-кодом.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const ROUTES = [
  { id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 198, weightNorm: 5199, lengthNorm: 59, acceptMin: 20, departMin: 60 },
  { id: 'r2', from: 'Ольховка', to: 'Сосновка', distanceKm: 198 },
];
const SETTINGS = { houses: { 'ольховка': { name: 'Ольховка', minRest: 300 } }, dayOffMin: 48 * 60, minShiftRest: 960,
  pay: { main: { mode: 'tariff', rates: [{ from: '2020-01-01', rate: 437 }], oklad: 51234 } } };
const openWork = async (page) => {
  await page.evaluate(() => { const c = window.__cabina; c.V.tab = 'home'; c.V.pages = ['work']; c.render(); });
  await page.locator('#depot-share').waitFor();
};

test('поделиться настройками депо: QR и ссылка; у коллеги — список, выбор, добавление; ставки и поездки не уходят', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cabina-depot-'));
  const A = await openApp(env);
  await A.page.setViewportSize({ width: 320, height: 700 });
  await seed(A.page, { routes: ROUTES, settings: SETTINGS, trips: [{ id: 't1', routeId: 'r1', start: '2026-10-14T06:00', end: '2026-10-14T15:30' }] });
  await A.page.reload(); await A.page.waitForSelector('.screen');
  await openWork(A.page);
  await A.page.locator('#depot-share').click();
  const sh = top(A.page);
  await sh.locator('svg.qr').waitFor();
  assert.match(await sh.innerText(), /2 участка и 1 дом отдыха/);
  assert.match(await sh.innerText(), /Ставок, оклада, поездок и заработка там нет/);
  assert.ok(await fits(A.page));
  const qrPath = join(dir, 'qr.png');
  await sh.locator('svg.qr').screenshot({ path: qrPath });
  const url = await A.page.evaluate(async () => { const d = await import('./js/depot.js'); return d.depotUrl(await d.encodeDepot()); });
  assert.match(url, /#d=[zj][A-Za-z0-9_-]+$/);
  const json = await A.page.evaluate(async () => JSON.stringify((await import('./js/depot.js')).depotPayload()));
  assert.doesNotMatch(json, /437|51234|2026-10-14/);
  assert.deepEqual(A.errors, []);

  // коллега открывает ссылку: у него уже есть Сосновка → Ольховка без норм и свой выходной
  const B = await openApp(env);
  await B.page.setViewportSize({ width: 320, height: 700 });
  await seed(B.page, { routes: [{ id: 'm1', from: 'сосновка', to: 'Ольховка', distanceKm: 198 }], settings: { dayOffMin: 60 * 60, minShiftRest: 960 } });
  await B.page.goto(env.url.replace(/\/?$/, '/') + url.slice(url.indexOf('#')));
  await B.page.waitForSelector('.imp-list');
  assert.equal(await B.page.evaluate(() => location.hash), '', 'код убран из адреса');
  const pv = top(B.page);
  const txt = await pv.innerText();
  assert.match(txt, /Проверьте сами/);
  assert.match(txt, /Участок Ольховка — Сосновка/);
  assert.match(txt, /Участок Сосновка — Ольховка[\s\S]*норма 5199 т[\s\S]*У вас уже есть — обновить нормы/);
  assert.match(txt, /Дом отдыха · Ольховка[\s\S]*Минимум 5 ч/);
  assert.match(txt, /Выходной депо[\s\S]*48 ч[\s\S]*У вас 60 ч — заменить/);
  assert.match(txt, /2 настройки совпадают с вашими/);
  assert.ok(await fits(B.page));
  // по умолчанию выбраны новое (маршрут и дом отдыха); «обновить» и выходной — нет
  assert.match(await B.page.locator('#dp-add').innerText(), /Добавить 2 пункта/);
  await pv.locator('.imp-row', { hasText: 'обновить нормы' }).click();
  assert.match(await B.page.locator('#dp-add').innerText(), /Добавить 3 пункта/);
  await B.page.locator('#dp-add').click();
  await waitNoLayers(B.page);
  const got = await B.page.evaluate(async () => { const s = await import('./js/store.js'); return { routes: s.S.routes.map((r) => [r.id === 'm1' ? 'm1' : 'new', r.from, r.to, r.distanceKm, r.weightNorm || null, r.departMin || null]).sort(), houses: s.S.settings.houses, off: s.S.settings.dayOffMin, rate: s.S.settings.pay?.main?.rates || null }; });
  assert.deepEqual(got.routes, [['m1', 'сосновка', 'Ольховка', 198, 5199, 60], ['new', 'Ольховка', 'Сосновка', 198, null, null]]);
  assert.deepEqual(got.houses, { 'ольховка': { name: 'Ольховка', minRest: 300 } });
  assert.equal(got.off, 60 * 60, 'выходной не выбран — не менялся');
  assert.equal(got.rate, null, 'ставки не пришли');

  // тот же код по фото QR: новое уже есть — «Всё уже как у вас» или только выходной
  await openWork(B.page);
  await B.page.locator('#depot-receive').click();
  await B.page.waitForSelector('#rc-photo', { state: 'attached' });
  assert.match(await top(B.page).innerText(), /Получить настройки депо/);
  await B.page.locator('#rc-photo').setInputFiles(qrPath);
  await B.page.waitForSelector('.imp-list');
  assert.equal(await top(B.page).locator('.imp-row').count(), 1);
  assert.match(await top(B.page).innerText(), /Выходной депо/);
  assert.deepEqual(B.errors, []);
  await A.context.close(); await B.context.close();
});

test('чужой код (поездки) в «Получить настройки депо» — понятная ошибка', async () => {
  const { context, page, errors } = await openApp(env);
  await openWork(page);
  await page.locator('#depot-receive').click();
  await page.locator('#rc-link').fill('https://cabina-app.ru/#t=zabcdefghijk');
  await page.locator('[data-act=rc-open]').click();
  assert.match(await top(page).locator('[data-error]').innerText(), /не код CABINA с настройками депо/);
  // пустые настройки — поделиться нечем
  await page.locator('#layers .layer:not(.closing) button[data-close]').first().click();
  await waitNoLayers(page);
  await page.locator('#depot-share').click();
  await page.locator('.toast', { hasText: 'Сначала добавьте участки' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});
