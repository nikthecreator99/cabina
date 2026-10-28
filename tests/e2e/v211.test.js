// Браузерные проверки CABINA 2.11: нормативное время маршрута — начало приёмки и отправление после явки,
// сколько положено на сдачу и ходьбу до дома отдыха. Только справка. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const flat = (s) => s.replace(/\s+/g, ' ');
const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка' }];

test('маршрут: нормативное время сохраняется, неверное значение — ошибка', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES });
  await page.locator('.home-head [data-page=work]').click();
  await page.locator('.screen [data-act=go][data-page=routes]').click();
  await page.locator('.route-pts[data-id=r1]').click();
  const f = sheet(page);
  await f.locator('#rf-accept').fill('30');
  await f.locator('#rf-depart').fill('9000');
  await f.locator('[data-act=save-route]').click();
  assert.match(await text(f, '[data-error]'), /Нормативное время — целое число минут/);
  await f.locator('#rf-depart').fill('90');
  await f.locator('#rf-hand').fill('30');
  await f.locator('#rf-walk').fill('15');
  await f.locator('[data-act=save-route]').click();
  await waitNoLayers(page);
  const r = await page.evaluate(async () => (await import('./js/store.js')).S.routes[0]);
  assert.deepEqual([r.acceptMin, r.departMin, r.handMin, r.walkMin], [30, 90, 30, 15]);
  await page.locator('.route-pts[data-id=r1]').click();
  assert.equal(await sheet(page).locator('#rf-walk').inputValue(), '15');
  assert.deepEqual(errors, []);
  await context.close();
});

test('до явки и в пути — начало приёмки и отправление; после поездки — сколько положено', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    routes: [{ ...ROUTES[0], acceptMin: 30, departMin: 90, handMin: 30, walkMin: 15 }],
    trips: [{ id: 'p', routeId: 'r1', start: '2026-10-20T13:00', end: '', restType: null }, { id: 'a', routeId: 'r1', start: '2026-10-18T04:20', end: '2026-10-18T12:00' }],
  });
  // ждёт явки
  assert.match(flat(await text(page, '.rest-banner.pending')), /До явки осталось 1 ч 00 мин.*Начало приёмки 13:30 · отправление 14:30/);
  await page.locator('.rest-banner.pending').click();
  assert.match(flat(await text(sheet(page), '#tf-calc')), /Явка сегодня, 13:00 Начало приёмки 13:30 Отправление через 2 ч 30 мин 14:30/);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // в пути, до отправления по нормативу
  await page.clock.setFixedTime(new Date('2026-10-20T13:50:00+03:00'));
  await page.reload(); await page.waitForSelector('.screen');
  assert.match(flat(await text(page, '.rest-banner.depart')), /До отправления 40 мин Начало приёмки 13:30 · отправление 14:30/);
  await page.locator('.trip.is-live').click();
  assert.match(flat(await text(sheet(page), '#tf-calc')), /По нормативу Начало приёмки 13:30 Отправление через 40 мин 14:30/i);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // отправление прошло — баннера нет
  await page.clock.setFixedTime(new Date('2026-10-20T14:31:00+03:00'));
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('.rest-banner.depart').count(), 0);
  // завершённая поездка — только нормы, без расчёта часов
  await page.locator('.trip:not(.is-live)').first().click();
  const calc = flat(await text(sheet(page), '#tf-calc'));
  assert.match(calc, /Положено по нормативу Сдача после прибытия 30 мин Ходьба до дома отдыха 15 мин/i);
  assert.doesNotMatch(calc, /Начало приёмки/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('без нормативов ничего лишнего не показывается', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: [{ id: 'l', routeId: 'r1', start: '2026-10-20T11:00', end: '', restType: null }] });
  assert.equal(await page.locator('.rest-banner.depart').count(), 0);
  await page.locator('.trip.is-live').click();
  assert.doesNotMatch(await text(sheet(page), '#tf-calc'), /нормативу/i);
  assert.deepEqual(errors, []);
  await context.close();
});
