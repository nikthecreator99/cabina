// Браузерные проверки CABINA 2.7: статусы «На отдыхе» / «Жду явку» / «В пути → …», нормы веса и длины в маршруте,
// доплата за тяжёлый поезд, следование пассажиром отдельной строкой, одно ожидание на следование, «!» у среднего.
// Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const store = (page, fn, arg) => page.evaluate(fn, arg);
const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка' }, { id: 'r2', from: 'Сосновка', to: 'Ёлкино' }];
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
async function workPage(page, name) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  if (name) await page.locator(`.screen [data-act=go][data-page=${name}]`).click();
}
async function at(page, when) {
  await page.clock.setFixedTime(new Date(when));
  await page.reload();
  await page.waitForSelector('.screen');
}
const status = async (page) => { await tab(page, 'profile'); return (await text(page, '#pr-status')).replace(/\s+/g, ' '); };

test('статус: на отдыхе в пункте оборота → жду явку → в пути → между поездками после домашнего отдыха', async () => {
  const { context, page, errors } = await openApp(env);
  // приехали в Сосновку в 10:00, работали 10 ч — отдых 5 ч, до 15:00
  await seed(page, { routes: ROUTES, trips: [{ id: 'a', routeId: 'r1', start: '2026-10-20T00:00', end: '2026-10-20T10:00', restType: 'turnaround' }] });
  assert.match(await status(page), /На отдыхе Сосновка · до 15:00/);
  assert.match(await page.locator('#pr-status').getAttribute('class'), /st-rest/);
  // отдых вышел — ждём явку там же
  await at(page, '2026-10-20T16:00:00+03:00');
  assert.match(await status(page), /^Жду явку Сосновка$/);
  // поехали обратно
  await seed(page, { trips: [{ id: 'b', routeId: 'r2', start: '2026-10-20T15:30', end: '' }] });
  // 2.8: откуда → куда
  assert.match(await status(page), /В пути Сосновка → Ёлкино · с 15:30/);
  // дома: домашний отдых, «На очередь» — между поездками
  await seed(page, { trips: [{ id: 'b', routeId: 'r2', start: '2026-10-20T15:30', end: '2026-10-20T23:00', restType: 'home', homeChoice: 'queue' }] });
  await at(page, '2026-10-21T08:00:00+03:00');
  assert.match(await status(page), /Между поездками/);
  // без выбора отдыха дома — тоже между поездками, а не «жду явку»
  await seed(page, { trips: [{ id: 'b', routeId: 'r2', start: '2026-10-20T15:30', end: '2026-10-20T23:00', restType: 'home', homeChoice: null }] });
  assert.match(await status(page), /Между поездками/);
  // больше 48 ч после отдыха в пункте оборота — уже не «жду явку»
  await seed(page, { trips: [{ id: 'b', routeId: 'r2', start: '2026-10-20T15:30', end: '2026-10-20T23:00', restType: 'turnaround' }] });
  await at(page, '2026-10-23T08:00:00+03:00');
  assert.match(await status(page), /Между поездками/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('маршрут: нормы веса и длины; тяжёлый поезд — отдельная строка в зарплате, следование пассажиром — тоже', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    routes: ROUTES, settings: { pay: PAY },
    trips: [{ id: 'a', routeId: 'r1', start: '2026-10-14T08:00', end: '2026-10-14T18:00', weight: 5200, passenger: [{ id: 'p', start: '2026-10-14T19:00', end: '2026-10-14T21:00' }], waiting: [{ id: 'w', start: '2026-10-14T18:00', end: '2026-10-14T19:00' }] }],
  });
  await workPage(page, 'routes');
  await page.locator('.route-pts[data-id=r1]').click();
  const f = sheet(page);
  assert.equal(await f.locator('#rf-wn').inputValue(), '');
  await f.locator('#rf-wn').fill('52,5');
  await f.locator('[data-act=save-route]').click();
  assert.match(await text(f, '[data-error]'), /Норма веса — целое число тонн/);
  await f.locator('#rf-wn').fill('5199');
  await f.locator('#rf-ln').fill('59');
  await f.locator('[data-act=save-route]').click();
  await waitNoLayers(page);
  const r1 = await store(page, async () => (await import('./js/store.js')).S.routes.find((r) => r.id === 'r1'));
  assert.deepEqual([r1.weightNorm, r1.lengthNorm], [5199, 59]);
  // обратный маршрут нормы не получил
  const r2 = await store(page, async () => (await import('./js/store.js')).S.routes.find((r) => r.id === 'r2'));
  assert.equal(r2.weightNorm ?? null, null);

  const pay = async () => { await tab(page, 'home'); await page.locator('.hero').click(); await page.locator('#st-kind button').nth(1).click(); return text(page, '.screen'); };
  let s = await pay();
  assert.match(s, /Оплата по тарифу[\s\S]*10\s*ч[\s\S]*3\s000/);
  assert.match(s, /Следование пассажиром[\s\S]*2\s*ч[\s\S]*600/);
  assert.match(s, /Ожидание следования[\s\S]*1\s*ч[\s\S]*300/);
  assert.match(s, /Тяжёлые и длинносоставные поезда[\s\S]*10\s*ч[\s\S]*450/, '10 ч на локомотиве × 300 × 15%');
  // норма 5200 — поезд уже не тяжёлый
  await workPage(page, 'routes');
  await page.locator('.route-pts[data-id=r1]').click();
  assert.equal(await sheet(page).locator('#rf-wn').inputValue(), '5199');
  await sheet(page).locator('#rf-wn').fill('5200');
  await sheet(page).locator('#rf-ln').fill('');
  await sheet(page).locator('[data-act=save-route]').click();
  await waitNoLayers(page);
  s = await pay();
  assert.doesNotMatch(s, /Тяжёлые/);
  assert.match(s, /Следование пассажиром/);
  // длина больше нормы — снова доплата
  await seed(page, { trips: [{ id: 'a', routeId: 'r1', start: '2026-10-14T08:00', end: '2026-10-14T18:00', weight: 5200, length: 60 }] });
  await store(page, async () => { const s = await import('./js/store.js'); await s.saveRoute({ ...s.S.routes.find((r) => r.id === 'r1'), lengthNorm: 59 }); });
  s = await pay();
  assert.match(s, /Тяжёлые и длинносоставные поезда[\s\S]*450/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('подсказка про нормы показывается при открытии сохранённого маршрута', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  // все остальные подсказки уже показаны — чтобы не зависеть от их порядка и скорости
  const ids = [...readFileSync(new URL('../../js/tours.js', import.meta.url), 'utf8').matchAll(/runTour\('([\w-]+)'/g)].map((m) => m[1]).filter((id) => id !== 'routeNorms');
  await page.evaluate(async (done) => { const db = await import('./js/db.js'); await db.put('meta', { id: 'tours', done }); }, ids);
  await seed(page, { routes: ROUTES.slice(0, 1) });
  await page.reload(); await page.waitForSelector('.screen');
  await workPage(page, 'routes');
  await page.locator('.route-pts[data-id=r1]').click();
  await page.waitForSelector('.tour', { timeout: 3000 });
  assert.match(await text(page, '.tour'), /Тяжёлый поезд[\s\S]*Впишите нормы участка/);
  await page.locator('.tour .tour-next').click();
  await page.waitForSelector('.tour', { state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('ожидание: к одному следованию пассажиром — только одно', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T18:00', passenger: [{ id: 'p', start: '2026-10-14T19:00', end: '2026-10-14T21:00' }] }] });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  await page.waitForTimeout(500);
  assert.equal(await f.locator('#tf-add-wait').isVisible(), true);
  await f.locator('#tf-add-wait').click();
  assert.equal(await f.locator('.interval.wait').count(), 1);
  assert.equal(await f.locator('#tf-add-wait').isVisible(), false, 'второе ожидание к тому же следованию добавить нельзя');
  // удалили ожидание — кнопка вернулась
  await f.locator('.interval.wait [data-act=del-pass]').click();
  assert.equal(await f.locator('#tf-add-wait').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('средний за час: только поле и переключатель, пояснение — по «!»', async () => {
  const { context, page, errors } = await openApp(env);
  await workPage(page, 'tariffs');
  const box = await text(page, '#pay-avg');
  assert.doesNotMatch(box, /учёб|сесси|техучёб/i);
  assert.equal(await page.locator('#pay-avg .hint').count(), 0, 'описаний под полем нет');
  await page.locator('#pay-avg [data-act=avg-info]').click();
  const d = sheet(page);
  const t = await d.innerText();
  assert.match(t, /Средний заработок за час[\s\S]*делённая на отработанные часы/);
  assert.doesNotMatch(t, /учёб|сесси|техучёб/i);
  await d.getByRole('button', { name: 'Понятно' }).click();
  await waitNoLayers(page);
  assert.deepEqual(errors, []);
  await context.close();
});
