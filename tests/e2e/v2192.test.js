// Браузерные проверки CABINA 2.19.2: профиль компактнее (значок ✎ у имени, рекорды — внутри наград, «Найти коллегу»
// над «Мои коллеги»), на экране коллег поиск — в самом верху, светофор по умолчанию, QR на Android без камеры в окне,
// QR-код и ссылка действуют сутки.
// Люди, станции и поездки — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, text, closeTop, waitNoLayers, openSettings } from './helpers.js';
import { ME, ANNA, OLEG, ready, openTeam, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const box = (page, sel) => page.locator(sel).first().boundingBox();
const ROUTES = [{ id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 180 }, { id: 'r2', from: 'Ольховка', to: 'Сосновка', distanceKm: 180 }];
const TRIPS = [
  { id: 'a', routeId: 'r1', start: '2026-10-14T06:00', end: '2026-10-14T15:30', locoType: '2ТЭ116', locoNumber: '1234' },
  { id: 'b', routeId: 'r2', start: '2026-10-15T03:10', end: '2026-10-15T12:00', locoType: '2ТЭ116', locoNumber: '1234' },
];

test('профиль: ✎ у имени вместо большой кнопки, рекордов нет (они в наградах), «Найти коллегу» над «Мои коллеги»; 320 px, обе темы', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, {
    consents: [{ document: CUR, withdrawn_at: null }],
    links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }],
  });
  await seed(page, { routes: ROUTES, trips: TRIPS });
  await tab(page, 'profile');
  await page.locator('#col-entry').getByText('1 коллега').waitFor();
  const card = page.locator('.profile-card');
  assert.equal(await card.locator('.btn').count(), 0, 'большой кнопки «Редактировать профиль» нет');
  assert.equal(await page.locator('#pr-edit').getAttribute('aria-label'), 'Редактировать профиль');
  const name = await box(page, '.profile-name > span');
  const pen = await box(page, '#pr-edit');
  assert.ok(pen.x > name.x + name.width - 1 && Math.abs((pen.y + pen.height / 2) - (name.y + name.height / 2)) < 6, 'значок — справа от имени, на одной строке');
  assert.deepEqual(await page.locator('#pr-edit').evaluate((b) => [b.offsetWidth, b.offsetHeight]), [38, 38], 'на значок легко попасть');
  // порядок: карточка → награды → «Найти коллегу» → «Мои коллеги»; рекордов в профиле нет
  // 2.22 (пример Никиты): карточка → «Коллеги» → «Награды»
  assert.match(await text(page, ".screen"), /Иван Тестовый[\s\S]*Коллеги[\s\S]*Найти[\s\S]*Мои коллеги[\s\S]*Награды/i);
  assert.equal((await text(page, '#col-find')).trim(), 'Найти', 'с 2.21.2 — снова просто «Найти» (просьба Никиты)');
  assert.equal(await page.locator('#pr-records').count(), 0);
  assert.ok((await box(page, '#col-find')).y < (await box(page, '#col-entry')).y);
  assert.doesNotMatch(await text(page, '#col-find'), /нов/i, 'без слова «новых»');
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('#col-entry').getByText('1 коллега').waitFor();
    assert.ok(await fits(page), `профиль на 320 px, ${theme}`);
    const n2 = await box(page, '.profile-name > span');
    const p2 = await box(page, '#pr-edit');
    assert.ok(p2.x + p2.width <= 320 - 16, `значок не вылезает, ${theme}`);
    assert.ok(n2.x > 100, `имя справа от персонажа (2.22), ${theme}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // ✎ открывает «Редактировать профиль»
  await page.locator('#pr-edit').click();
  await page.locator('#pr-name').waitFor();
  assert.match(await text(page, '.page-head'), /Редактировать профиль/);
  await page.locator('[data-act=back]').click();
  // «Найти коллегу» — сразу экран поиска
  await page.locator('#col-find').click();
  await page.locator('#col-form').waitFor();
  assert.match(await text(page, '.page-head'), /Найти коллегу/);
  await page.locator('[data-act=back]').click();
  // рекорды — на экране наград
  await page.locator('#pr-awards .aw-strip').click();
  await page.locator('#aw-rec-row').click();
  await page.waitForSelector('#aw-records');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Мои коллеги»: поиск в самом верху даже при одном коллеге, под ним предложения и коллеги; кнопки «Найти» нет, пока есть коллеги', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, {
    consents: [{ document: CUR, withdrawn_at: null }],
    links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }, { from_id: OLEG, to_id: ME, state: 'pending' }],
    statuses: { [ANNA]: { kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning', updated_at: '2026-10-20T06:10:00Z' } },
  });
  await openTeam(page);
  const sec = page.locator('#col-sec');
  await sec.locator('#col-list').waitFor();
  const first = await sec.evaluate((el) => el.firstElementChild.className);
  assert.match(first, /\bsearch\b/, 'первым на экране — поиск');
  assert.ok((await box(page, '#team-q')).y < (await box(page, '.col-offers')).y, 'поиск выше предложений');
  assert.ok((await box(page, '.col-offers')).y < (await box(page, '#col-list')).y, 'предложения выше списка');
  assert.equal(await sec.locator('.col-search').count(), 0, 'искать новых — строкой в профиле');
  await page.locator('#team-q').fill('анна');
  assert.match(await text(page, '#col-list'), /Анна Тестовая/);
  await page.locator('#team-q').fill('тч-13');
  await page.locator('#col-list').getByText('Никого не нашли').waitFor();
  // отклонили предложение и удалили коллегу — пусто: поиска нет, есть «Найти коллегу»
  await page.locator('#team-q').fill('');
  await page.locator('.col-offers [data-act=col-decline]').click();
  await top(page).getByRole('button', { name: 'Отклонить' }).click();
  await page.locator('.col-offers').waitFor({ state: 'detached' });
  await page.locator('[data-act=col-open]').click();
  await top(page).locator('[data-act=col-drop]').click();
  await top(page).getByRole('button', { name: 'Удалить' }).click();
  await waitNoLayers(page);
  await sec.locator('.col-empty').waitFor();
  assert.equal(await page.locator('#team-q').count(), 0);
  await sec.locator('.col-search').click();
  await page.locator('#col-form').waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('анимация обновления по умолчанию — светофор', async () => {
  const { context, page, errors } = await openApp(env);
  assert.equal(await page.evaluate(async () => (await import('./js/pull.js')).pullStyle(undefined)), 'light');
  await tab(page, 'profile');
  await openSettings(page, 'set-look');
  assert.match(await text(page, '#pull-row'), /Светофор/);
  // кто сам выбрал другую — у того она и остаётся
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ pullAnim: 'train' }); });
  await page.locator('[data-act=back]').click();
  await openSettings(page, 'set-look');
  assert.match(await text(page, '#pull-row'), /Поезд/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('QR на Android: сайт запрещает камеру в окне — главная кнопка «Сфотографировать» открывает камеру телефона, снимок читается', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cabina-qr-'));
  const { context, page, errors } = await openApp(env);
  // так отвечает наш сервер сейчас: Chrome на Android слушается этого правила, Safari на iPhone — нет
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch();
    return route.fulfill({ response: r, headers: { ...r.headers(), 'permissions-policy': 'camera=()' } });
  });
  await page.reload(); await page.waitForSelector('.screen');
  await seed(page, { routes: ROUTES, trips: TRIPS });
  // QR-код — как у напарника на экране
  await page.evaluate(async () => { const s = await import('./js/share.js'); const st = await import('./js/store.js'); await s.openShareSheet(st.S.trips); });
  const qrPath = join(dir, 'qr.png');
  await top(page).locator('svg.qr').waitFor();
  assert.match(await text(page, '#sh-ttl'), /Код и ссылка действуют сутки — до 12:00, 21 октября/);
  await top(page).locator('svg.qr').screenshot({ path: qrPath });
  await closeTop(page);
  await waitNoLayers(page);
  await page.locator('[data-act=add-trip]').click();
  await page.locator('[data-act=tf-receive]').click();
  const s = top(page);
  await s.locator('#rc-shot-btn').waitFor();
  assert.equal(await s.locator('#rc-cam-btn').isVisible(), false, 'сканировать в окне нельзя — кнопки нет');
  assert.equal(await s.locator('#rc-shot').getAttribute('capture'), 'environment', 'открывается задняя камера телефона');
  assert.match(await s.locator('#rc-shot-btn').getAttribute('class'), /btn-primary/);
  assert.match(await text(page, '#rc-photo-btn'), /Выбрать картинку/);
  assert.ok(await fits(page));
  await page.setViewportSize({ width: 320, height: 700 });
  for (const b of ['#rc-shot-btn', '#rc-photo-btn']) assert.ok((await box(page, b)).height < 64, `${b}: надпись в одну строку на 320 px`);
  assert.ok(await fits(page));
  await page.setViewportSize({ width: 390, height: 844 });
  await s.locator('#rc-shot').setInputFiles(qrPath);
  await page.waitForSelector('.imp-list');
  assert.equal(await top(page).locator('.imp-row').count(), 2);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
  await rm(dir, { recursive: true, force: true });
});

test('QR, где камера в окне разрешена (iPhone): «Сканировать камерой» главная, «Сфотографировать» спрятана до отказа камеры', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  await page.locator('[data-act=tf-receive]').click();
  const s = top(page);
  await s.locator('#rc-cam-btn').waitFor();
  assert.equal(await s.locator('#rc-shot-btn').isVisible(), false);
  // человек не разрешил камеру — появляется «Сфотографировать QR-код»
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await s.locator('#rc-cam-btn').click();
  await s.locator('#rc-shot-btn').waitFor();
  assert.equal(await s.locator('#rc-cam-btn').isVisible(), false);
  assert.match(await s.innerText(), /откроется обычная камера телефона/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ссылка напарнику действует сутки: через 25 часов — «срок истёк», ничего не добавляется', async () => {
  const A = await openApp(env);
  await seed(A.page, { routes: ROUTES, trips: TRIPS });
  const url = await A.page.evaluate(async () => { const s = await import('./js/share.js'); const st = await import('./js/store.js'); return s.shareUrl(await s.encodeTrips(st.S.trips)); });
  await A.context.close();
  // на следующий день, через 23 часа — ещё действует
  const B = await openApp(env, { now: '2026-10-21T11:00:00+03:00' });
  await B.page.locator('[data-act=add-trip]').click();
  await B.page.locator('[data-act=tf-receive]').click();
  await B.page.locator('#rc-link').fill(url);
  await B.page.locator('[data-act=rc-open]').click();
  await B.page.waitForSelector('.imp-list');
  await B.context.close();
  // через 25 часов — уже нет, и по ссылке, и вставкой
  const C = await openApp(env, { now: '2026-10-21T13:00:00+03:00' });
  await C.page.goto(env.url.replace(/\/?$/, '/') + url.slice(url.indexOf('#')));
  await C.page.waitForSelector('.screen');
  await C.page.waitForFunction(() => /Срок кода истёк/.test(document.querySelector('.toast-wrap')?.innerText || ''));
  assert.equal(await C.page.evaluate(() => location.hash), '', 'код из адреса убран');
  await C.page.locator('[data-act=add-trip]').click();
  await C.page.locator('[data-act=tf-receive]').click();
  await C.page.locator('#rc-link').fill(url);
  await C.page.locator('[data-act=rc-open]').click();
  await top(C.page).locator('.error-box').getByText('Срок кода истёк').waitFor();
  assert.equal(await C.page.locator('.imp-list').count(), 0);
  assert.equal(await C.page.evaluate(async () => (await import('./js/store.js')).S.trips.length), 0);
  assert.deepEqual(realErrors(C.errors), []);
  await C.context.close();
});
