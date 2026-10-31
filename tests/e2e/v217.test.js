// Браузерные проверки CABINA 2.17: обновление свайпом вниз (статусы коллег без перезапуска), выбор анимации в Настройках.
// Жест — настоящие касания через Chromium (CDP). Сервер «Коллег» подменён (mock-colleagues.js), все люди и станции — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { ME, ANNA, ready } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Провести пальцем от (x, y0) до (x + dx, y1) и (по желанию) не отпускать
async function drag(page, { x = 195, y0 = 200, y1 = 420, dx = 0, steps = 12, release = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x1, y) => [{ x: x1, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps, y0 + ((y1 - y0) * i) / steps) });
    await wait(16);
  }
  if (!release) return cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return null;
}
const statusReads = (srv) => srv.log.filter((r) => r.path === '/rest/v1/statuses').length;
const two = { consents: [{ document: 'privacy-2', withdrawn_at: null }], links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }] };

test('свайп вниз в профиле — свежий статус коллеги без перезапуска; короткий свайп и свайп вбок не обновляют', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, two, (db) => {
    db.statuses[ANNA] = { kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning', until_at: null, after_kind: null, updated_at: '2026-10-20T06:10:00Z' };
  });
  await tab(page, 'profile');
  await page.locator('#col-list').waitFor();
  assert.match(await text(page, '#col-list'), /Сосновка → Ольховка/);
  // коллега вернулась домой — на сервере уже новый статус
  srv.db.statuses[ANNA] = { kind: 'home', place: null, dest: null, part: null, until_at: null, after_kind: null, updated_at: '2026-10-20T08:55:00Z' };
  // короткий свайп — не обновляем, индикатор прячется
  let before = statusReads(srv);
  await drag(page, { y1: 250 });
  await wait(400);
  assert.equal(statusReads(srv), before, 'короткий свайп ничего не загружает');
  assert.equal(await page.locator('.ptr.on').count(), 0);
  // свайп вбок — тоже нет
  await drag(page, { y1: 230, dx: 160 });
  await wait(300);
  assert.equal(statusReads(srv), before);
  // настоящий свайп: держим — индикатор опущен и «можно отпускать»
  const cdp = await drag(page, { release: false });
  assert.equal(await page.locator('.ptr.on.armed[data-style=spin]').count(), 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('.ptr.loading').waitFor({ state: 'attached' });
  await page.waitForFunction(() => /Обновлено/.test(document.querySelector('.ptr.done')?.innerText || ''));
  assert.ok(statusReads(srv) > before, 'статусы загружены заново');
  assert.doesNotMatch(await text(page, '#col-list'), /Ольховка/);
  await page.waitForSelector('.ptr.on', { state: 'detached' }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.ptr.on'));
  // пролистали вниз — свайп вниз прокручивает, а не обновляет
  await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.scrollTo(0, 400); });
  before = statusReads(srv);
  await drag(page);
  await wait(400);
  assert.equal(statusReads(srv), before);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('без аккаунта свайп работает и ничего не отправляет; поверх открытого окна — не срабатывает', async () => {
  const { context, page, errors } = await openApp(env);
  const sent = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) sent.push(r.url()); });
  await seed(page, { trips: [{ id: 't', start: '2026-10-19T08:00', end: '2026-10-19T16:00' }] });
  await drag(page);
  await page.waitForFunction(() => /Обновлено/.test(document.querySelector('.ptr.done')?.innerText || ''));
  await page.waitForFunction(() => !document.querySelector('.ptr.on'));
  assert.deepEqual(sent, [], 'без аккаунта никуда не ходим');
  // открыта поездка — свайп по экрану не обновляет
  await page.locator('.trip').first().click();
  await sheet(page).waitFor();
  await drag(page, { y0: 120, y1: 380 });
  await wait(200);
  assert.equal(await page.locator('.ptr.on').count(), 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('Настройки → «Анимация обновления»: четыре варианта, выбор сохраняется и показывается', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  assert.match(await text(page, '#pull-row'), /Анимация обновления[\s\S]*Круг/);
  await page.locator('#pull-row').click();
  const s = sheet(page);
  assert.deepEqual((await s.locator('[data-act=pull-pick] .t1').allInnerTexts()).map((t) => t.replace(' ✓', '')), ['Круг', 'Поезд', 'Светофор', 'Колесо']);
  for (const [name, style] of [['Поезд', 'train'], ['Светофор', 'light'], ['Колесо', 'wheel']]) {
    await s.locator('[data-act=pull-pick]', { hasText: name }).click();
    await page.locator(`.ptr.on.loading[data-style=${style}]`).waitFor();
    assert.equal(await s.locator(`[data-act=pull-pick][data-v=${style}]`).getAttribute('aria-pressed'), 'true');
  }
  await page.waitForFunction(() => !document.querySelector('.ptr.on'), null, { timeout: 5000 });
  const st = await page.evaluate(async () => (await import('./js/store.js')).S.settings.pullAnim);
  assert.equal(st, 'wheel');
  await s.locator('button[data-close]').first().click();
  await waitNoLayers(page);
  assert.match(await text(page, '#pull-row'), /Колесо/);
  // жест берёт выбранную анимацию
  await page.locator('[data-act=back]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  // предыдущий показ анимации должен закончиться (waitForFunction не ждёт async-проверок, поэтому опрашиваем сами)
  for (let i = 0; i < 60 && await page.evaluate(async () => (await import('./js/pull.js')).pullBusy()); i++) await wait(50);
  await drag(page);
  await page.waitForFunction(() => document.querySelector('.ptr.on')?.dataset.style === 'wheel');
  // чужое значение из копии — обычный круг
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ pullAnim: '<b>x</b>' }); });
  await page.waitForFunction(() => !document.querySelector('.ptr.on'), null, { timeout: 5000 });
  await page.locator('.screen [data-page=settings]').click();
  assert.match(await text(page, '#pull-row'), /Круг/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
