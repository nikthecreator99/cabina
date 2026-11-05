// Браузерные проверки CABINA 2.21.5 (просьба Никиты 05.11.2026): проверки перед сохранением.
// Поездка налезла на другую — сохранить нельзя; на больничный / отпуск или длиннее суток — «Проверьте…», сохранить можно.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const trips = (page) => page.evaluate(async () => (await import('./js/store.js')).S.trips.map(({ id, start, end }) => ({ id, start, end })));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const T1 = { id: 't1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-14T08:00', end: '2026-10-14T16:00', restType: 'turnaround' };
const T2 = { id: 't2', routeLabel: 'Ольховка → Сосновка', start: '2026-10-15T08:00', end: '2026-10-15T16:00', restType: 'home', homeChoice: 'queue' };
const SICK = { id: 'a1', type: 'sick', start: '2026-10-08', end: '2026-10-09', auto: true, monthHours: {}, createdAt: 1 };

async function setTimes(f, sd, st, ed, et) {
  await f.locator('#tf-sd').fill(sd); await f.locator('#tf-st').fill(st);
  await f.locator('#tf-ed').fill(ed); await f.locator('#tf-et').fill(et);
}
async function openTrip(page, id) {
  await page.locator(`[data-act=trip][data-id=${id}]`).first().click();
  const f = sheet(page);
  await f.locator('#tf-st').waitFor();
  return f;
}

test('поездка налезла на другую — не сохраняется, видно, на какую', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [T1, T2] });
  await page.reload(); await page.waitForSelector('.screen');
  const f = await openTrip(page, 't2');
  await setTimes(f, '2026-10-14', '15:00', '2026-10-14', '20:00');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await f.locator('[data-error]').innerText(), /налезает на другую: 14 окт · 08:00 — 16:00/);
  assert.ok(await fits(page));
  // касается концом — можно
  await setTimes(f, '2026-10-14', '16:00', '2026-10-14', '20:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.deepEqual((await trips(page)).find((t) => t.id === 't2'), { id: 't2', start: '2026-10-14T16:00', end: '2026-10-14T20:00' });
  // новая поездка «в пути», начатая внутри законченной, — тоже нельзя
  await page.locator('[data-act=add-trip], .fab').first().click();
  const g = sheet(page);
  await g.locator('#tf-st').waitFor();
  await g.locator('#tf-sd').fill('2026-10-14'); await g.locator('#tf-st').fill('10:00');
  await g.locator('[data-act=save-trip]').click();
  assert.match(await g.locator('[data-error]').innerText(), /налезает на другую/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('на больничном и длиннее суток — спросить; «Исправить» не сохраняет, «Сохранить» сохраняет; без изменений — не спрашивать', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [T1, T2], absences: [SICK] });
  await page.reload(); await page.waitForSelector('.screen');
  let f = await openTrip(page, 't2');
  await setTimes(f, '2026-10-08', '20:00', '2026-10-10', '03:05');
  await f.locator('[data-act=save-trip]').click();
  const dlg = page.locator('.dialog');
  await dlg.waitFor();
  const msg = await dlg.innerText();
  assert.match(msg, /Проверьте поездку/);
  assert.match(msg, /попадает на больничный \(8–9 октября\)/);
  assert.match(msg, /длиной 31 ч 05 — точно так\?/);
  assert.ok(await fits(page));
  await dlg.locator('[data-act=no]').click();
  assert.equal((await trips(page)).find((t) => t.id === 't2').start, T2.start, '«Исправить» — не сохранено');
  await f.locator('#tf-st').waitFor();
  await f.locator('[data-act=save-trip]').click();
  await page.locator('.dialog [data-act=yes]').click();
  await waitNoLayers(page);
  assert.deepEqual((await trips(page)).find((t) => t.id === 't2'), { id: 't2', start: '2026-10-08T20:00', end: '2026-10-10T03:05' });
  // открыли и сохранили, не меняя время, — второй раз не спрашиваем
  await page.evaluate(async () => (await import('./js/forms.js')).openTripForm('t2'));
  f = sheet(page);
  await f.locator('#tf-st').waitFor();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('.dialog').count(), 0);
  // обычная поездка — без вопросов
  f = await openTrip(page, 't1');
  await f.locator('#tf-et').fill('17:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page)).find((t) => t.id === 't1').end, '2026-10-14T17:00');
  assert.deepEqual(errors, []);
  await context.close();
});

test('отпуск на дни с поездкой — спросить', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [T1] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('[data-act=absences]').click();
  const f = sheet(page);
  await f.locator('.type-pick button').filter({ hasText: 'Отпуск' }).click();
  await f.locator('#af-start').fill('2026-10-13');
  await f.locator('#af-end').fill('2026-10-14');
  await f.locator('[data-act=save-abs]').click();
  const dlg = page.locator('.dialog');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /Проверьте даты[\s\S]*есть поездка: 14 окт · 08:00 — 16:00[\s\S]*Отпуск и поездка в одно время/);
  await dlg.locator('[data-act=no]').click();
  await f.locator('#af-end').fill('2026-10-13');
  await f.locator('[data-act=save-abs]').click();
  await waitNoLayers(page);
  const abs = await page.evaluate(async () => (await import('./js/store.js')).S.absences.map((a) => [a.type, a.start, a.end]));
  assert.deepEqual(abs, [['vacation', '2026-10-13', '2026-10-13']]);
  assert.deepEqual(errors.filter((e) => !/Failed to load resource|ERR_/.test(e)), []);
  await context.close();
});

test('поездка в день медкомиссии — тоже «Проверьте…» (2.21.7)', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [T1, T2], absences: [{ id: 'm1', type: 'medical', start: '2026-10-12', end: '2026-10-12', auto: true, monthHours: {}, createdAt: 1 }] });
  await page.reload(); await page.waitForSelector('.screen');
  const f = await openTrip(page, 't2');
  await setTimes(f, '2026-10-12', '08:00', '2026-10-12', '16:00');
  await f.locator('[data-act=save-trip]').click();
  const dlg = page.locator('.dialog');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /попадает на медкомиссию \(12 октября\)/);
  await dlg.locator('[data-act=no]').click();
  assert.deepEqual(errors, []);
  await context.close();
});
