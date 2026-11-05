// Браузерные проверки CABINA 2.22: после «Домашний отдых» обязательно выбрать, какой именно
// («На очередь», «Пойти на выходной», полный отдых или «Другое»). Старые поездки без выбора не ломаются.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const layers = (page) => page.locator('#layers .layer:not(.closing)').count();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const trips = (page) => page.evaluate(async () => (await import('./js/store.js')).S.trips.map(({ _stats, _statsAt, ...t }) => JSON.parse(JSON.stringify(t))));
const cls = (loc) => loc.getAttribute('class').then((c) => c || '');

test('домашний отдых: без выбора, какой именно, не сохраняется; «Другое» — отдыха на главной нет', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-st').fill('01:00');
  await f.locator('#tf-et').fill('07:00');
  await f.locator('[data-rest=home]').click();
  // четыре варианта, кнопки пульсируют, подсказка — что выбрать
  for (const c of ['queue', 'dayOff', 'other']) assert.equal(await f.locator(`[data-choice=${c}]`).isVisible(), true, c);
  assert.equal(await f.locator('[data-act=home-calc]').isVisible(), true);
  assert.match(await cls(f.locator('#tf-home')), /rest-pulse/);
  assert.match(await text(f, '#tf-home-why'), /какой домашний отдых[\s\S]*«Другое»/);
  await f.locator('[data-act=save-trip]').click();
  await page.waitForTimeout(300);
  assert.equal((await trips(page)).length, 0, 'без выбора не сохранилась');
  assert.equal(await layers(page), 1, 'форма открыта');
  assert.match(await cls(f.locator('#tf-rest-field')), /need-home/);
  // выбрали и сняли выбор — снова обязательно
  await f.locator('[data-choice=queue]').click();
  assert.doesNotMatch(await cls(f.locator('#tf-home')), /rest-pulse/, 'выбрали — пульс выключен');
  assert.equal(await f.locator('#tf-home-why').count(), 0);
  await f.locator('[data-choice=queue]').click();
  assert.match(await cls(f.locator('#tf-home')), /rest-pulse/);
  // «Другое» — сохраняется, на главной отдыха нет
  await f.locator('[data-choice=other]').click();
  assert.equal(await f.locator('[data-choice=other]').getAttribute('aria-pressed'), 'true');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = (await trips(page))[0];
  assert.equal(t.restType, 'home');
  assert.equal(t.homeChoice, 'other');
  assert.equal(await page.locator('.rest-banner').count(), 0);
  // открыли снова — «Другое» отмечено, можно сохранить без вопросов
  await page.locator('.trip').first().click();
  const g = sheet(page);
  assert.equal(await g.locator('[data-choice=other]').getAttribute('aria-pressed'), 'true');
  assert.equal(await g.locator('#tf-home-why').count(), 0);
  await g.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.deepEqual(errors, []);
  await context.close();
});

test('домашний отдых: старая поездка без выбора не ломается, при правке спрашивает, какой именно', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'old', start: '2026-10-20T01:00', end: '2026-10-20T08:00', routeLabel: 'Сосновка → Ольховка', restType: 'home', homeChoice: null }] });
  assert.equal(await page.locator('.trip').count(), 1);
  assert.equal(await page.locator('.rest-banner').count(), 0);
  await page.locator('.trip').first().click();
  const f = sheet(page);
  assert.equal(await f.locator('[data-rest=home]').getAttribute('aria-pressed'), 'true');
  assert.match(await cls(f.locator('#tf-home')), /rest-pulse/);
  await f.locator('[data-act=save-trip]').click();
  await page.waitForTimeout(300);
  assert.equal(await layers(page), 1, 'без выбора не сохранилась');
  assert.equal((await trips(page))[0].homeChoice, null, 'старая запись не тронута');
  await f.locator('[data-choice=queue]').click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].homeChoice, 'queue');
  assert.match(await text(page, '.rest-banner'), /На очереди · вызов не раньше/);
  // отдых в пункте оборота подвида не требует
  await page.locator('.trip').first().click();
  const g = sheet(page);
  await g.locator('[data-rest=turnaround]').click();
  assert.equal(await g.locator('#tf-home-why').count(), 0);
  await g.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].restType, 'turnaround');
  assert.equal((await trips(page))[0].homeChoice, null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('домашний отдых: кнопки помещаются на 320 px с очень крупным текстом, в обеих темах', async () => {
  for (const theme of ['dark', 'light']) {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(async (th) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: th, textSize: 'xl' }); }, theme).catch(() => {});
    await page.evaluate(([th]) => { document.documentElement.dataset.theme = th; document.documentElement.dataset.text = 'xl'; }, [theme]);
    await page.locator('[data-act=add-trip]').click();
    const f = sheet(page);
    await f.locator('#tf-st').fill('01:00');
    await f.locator('#tf-et').fill('07:00');
    await f.locator('[data-rest=home]').click();
    await f.locator('[data-choice=other]').scrollIntoViewIfNeeded();
    assert.equal(await fits(page), true, `${theme}: без прокрутки вбок`);
    const row = await f.locator('#tf-home .choice-row').boundingBox();
    const other = await f.locator('[data-choice=other]').boundingBox();
    assert.ok(other.x >= row.x - 1 && other.x + other.width <= row.x + row.width + 1, '«Другое» внутри ряда');
    assert.ok(other.width > row.width - 4, '«Другое» — во всю ширину');
    assert.deepEqual(errors, []);
    await context.close();
  }
});
