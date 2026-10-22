// Браузерные проверки функций CABINA 2.0: заработок, поездка «в пути», профиль, статистика,
// дома отдыха, отвлечения списком, поиск в заметках, фото в документах, перенос данных из 1.x.
// Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
async function workPage(page, name) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  if (name) await page.locator(`.screen [data-act=go][data-page=${name}]`).click();
}
async function swipeLeft(page, row) {
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, box.y + box.height / 2);
  await page.mouse.up();
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const PAY = { assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };

test('тарифная ставка: заработок на главном и у поездки, новая ставка — с какого числа', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T16:00' }] });
  await page.locator('[data-act=set-rate]').click();
  await page.waitForSelector('#pf-rate');
  await page.locator('#pf-rate').fill('300');
  await page.locator('#pf-rate').blur();
  await page.locator('#pf-bonus').fill('');
  await page.locator('#pf-bonus').blur();
  await page.locator('#pf-harm').fill('0');
  await page.locator('#pf-harm').blur();
  await tab(page, 'home');
  // 8 ч × 300 = 2400, минус 13% = 2088
  assert.match(await text(page, '.hero-pay'), /Заработано:\s*2\s088\s₽/);
  assert.match(await text(page, '.trip'), /≈\s*2\s088\s₽/);
  // ставка изменилась с 15 октября: старая поездка не пересчитывается
  await workPage(page, 'tariffs');
  await page.locator('#pf-rate').fill('400');
  await page.locator('#pf-rate').blur();
  const dlg = sheet(page);
  assert.match(await dlg.innerText(), /С какого числа ставка 400,00\s₽/);
  await dlg.locator('#rate-from').fill('2026-10-15');
  await dlg.locator('button[type=submit]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.rate-hist'), /с 15 октября 2026[\s\S]*400,00\s₽[\s\S]*раньше[\s\S]*300,00\s₽/);
  await tab(page, 'home');
  assert.match(await text(page, '.trip'), /≈\s*2\s088\s₽/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('поездка «в пути»: только начало, идёт время, «Завершить поездку»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { settings: { pay: PAY } });
  await page.locator('[data-act=add-trip]').click();
  let f = sheet(page);
  await f.locator('#tf-sd').fill('2026-10-20');
  await f.locator('#tf-st').fill('10:00');
  assert.match(await f.locator('#tf-calc').innerText(), /В пути\s+2 ч 00 мин/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const row = await text(page, '.trip');
  assert.match(row, /10:00 — сейчас/);
  assert.match(row, /В пути/);
  // 2 ч × 300 − 13% = 522
  assert.match(row, /≈\s*522\s₽/);
  // вторая поездка «в пути» не сохраняется
  await page.locator('[data-act=add-trip]').click();
  f = sheet(page);
  await f.locator('#tf-sd').fill('2026-10-20');
  await f.locator('#tf-st').fill('11:00');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await f.locator('[data-error]').innerText(), /в пути/i);
  await f.locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // завершить: подставится текущее время
  await page.locator('.trip').first().click();
  f = sheet(page);
  await f.locator('[data-act=finish-now]').click();
  assert.equal(await f.locator('#tf-et').inputValue(), '12:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.trip'), /10:00 — 12:00/);
  assert.match(await text(page, '.rest-banner'), /Отдых в пункте оборота · до сегодня, 16:00/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('«На очередь»: на главном — когда могут вызвать и сколько осталось', async () => {
  const { context, page } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-sd').fill('2026-10-19');
  await f.locator('#tf-st').fill('22:00');
  await f.locator('#tf-et').fill('06:00');
  await f.locator('[data-rest=home]').click();
  await f.locator('[data-choice=queue]').click();
  assert.equal(await f.locator('[data-choice=queue]').getAttribute('aria-pressed'), 'true');
  assert.match(await f.locator('#tf-calc').innerText(), /Вызов не раньше\s+сегодня, 22:00/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const b = await text(page, '.rest-banner');
  assert.match(b, /На очереди · вызов не раньше сегодня, 22:00/);
  assert.match(b, /Осталось 10 ч 00 мин/);
  // междусменный отдых меняется в ☰
  await workPage(page);
  await page.locator('[data-act=shift-plus]').click();
  await page.waitForFunction(() => document.querySelector('#min-shift')?.textContent === '16 ч 30 мин');
  await tab(page, 'home');
  assert.match(await text(page, '.rest-banner'), /вызов не раньше сегодня, 22:30/);
  await context.close();
});

test('дом отдыха со своим минимальным отдыхом', async () => {
  const { context, page } = await openApp(env);
  await seed(page, {
    routes: [{ id: 'r1', from: 'Няндома', to: 'Коноша' }],
    trips: [{ id: 'a', routeId: 'r1', start: '2026-10-20T04:00', end: '2026-10-20T10:00' }],
  });
  assert.match(await text(page, '.rest-banner'), /до сегодня, 14:00[\s\S]*Коноша/);
  await workPage(page, 'houses');
  await page.locator('[data-act=house]').filter({ hasText: 'Коноша' }).click();
  const s = sheet(page);
  for (let i = 0; i < 4; i++) await s.locator('[data-act=hs-plus]').click();
  assert.equal(await s.locator('#hs-val').innerText(), '6 ч 00 мин');
  await s.locator('button[data-close]').first().click();
  await waitNoLayers(page);
  assert.match(await text(page, '[data-act=house]'), /6 ч/);
  await tab(page, 'home');
  assert.match(await text(page, '.rest-banner'), /до сегодня, 16:00/);
  await context.close();
});

test('отвлечения списком: изменить нажатием, удалить свайпом с вопросом', async () => {
  const { context, page } = await openApp(env);
  await seed(page, { absences: [
    { id: 'v', type: 'vacation', start: '2026-10-05', end: '2026-10-06' },
    { id: 'm', type: 'medical', start: '2026-10-15', end: '2026-10-15' },
  ] });
  assert.equal(await text(page, '[data-act=absences] .count'), '2');
  assert.match(await text(page, '.hero-lines'), /Отпуск:\s*−16 ч[\s\S]*Медкомиссия:\s*−8 ч/);
  await page.locator('[data-act=absences]').click();
  const list = sheet(page);
  await swipeLeft(page, list.locator('[data-act=al-open][data-id=m]'));
  await list.locator('[data-act=al-del][data-id=m]').click();
  const q = sheet(page);
  assert.match(await q.innerText(), /Вы действительно хотите удалить/);
  await q.getByRole('button', { name: 'Да' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-act=al-open][data-id=m]'));
  assert.equal(await sheet(page).locator('[data-act=al-open]').count(), 1);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  assert.equal(await text(page, '[data-act=absences] .count'), '1');
  assert.doesNotMatch(await text(page, '.hero-lines'), /Медкомиссия/);
  await context.close();
});

test('профиль: имя, должность, класс, фото — сохраняются', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('#pr-name').fill('Иван');
  await page.locator('#pr-name').blur();
  await page.locator('#pr-depot').fill('Тестовое');
  await page.locator('#pr-depot').blur();
  assert.equal(await page.locator('#pr-klass').count(), 0, 'у помощника класса нет');
  await page.locator('[data-act=pr-role][data-role=driver]').click();
  await page.locator('[data-act=pr-klass][data-klass="2"]').click();
  await page.waitForFunction(() => document.querySelector('[data-act=pr-klass][data-klass="2"]')?.getAttribute('aria-pressed') === 'true');
  await page.locator('#pr-photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.avatar img');
  await page.reload();
  await page.waitForSelector('.screen');
  await tab(page, 'profile');
  assert.match(await text(page, '.profile-card'), /Иван[\s\S]*Машинист, 2 класс · депо Тестовое/);
  const src = await page.locator('.avatar img').getAttribute('src');
  assert.match(src, /^data:image\/jpeg;base64,/);
  assert.match(await text(page, '.notice.ok'), /только в этом телефоне/);
  // тарифы машиниста — свой набор, с надбавкой за класс
  await workPage(page, 'tariffs');
  assert.equal(await page.locator('[data-act=pay-role][data-role=driver]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#pf-klass').count(), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('статистика: открывается с главного, поездки и зарплата, периоды', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    routes: [{ id: 'r1', from: 'Няндома', to: 'Коноша', distanceKm: 100 }],
    trips: [
      { id: 'a', routeId: 'r1', start: '2026-10-14T20:00', end: '2026-10-15T04:00', locoType: '2ЭС5К', locoNumber: '355' },
      { id: 'b', routeId: 'r1', start: '2026-09-10T08:00', end: '2026-09-10T12:00' },
    ],
    settings: { pay: PAY },
  });
  await page.locator('.hero').click();
  await page.waitForSelector('#st-kind');
  let s = await text(page, '.screen');
  assert.match(s, /Октябрь 2026/);
  assert.match(s, /Отработано\s+8 ч/i);
  assert.match(s, /Няндома → Коноша/);
  assert.match(s, /2ЭС5К №355/);
  assert.doesNotMatch(s, /Праздничные/, 'пустые блоки не показываются');
  await page.locator('#st-kind button').filter({ hasText: 'Заработная плата' }).click();
  s = await text(page, '.screen');
  assert.match(s, /Оплата по тарифу[\s\S]*2\s400,00\s₽/);
  assert.match(s, /НДФЛ 13%[\s\S]*312,00\s₽/);
  assert.match(s, /На руки[\s\S]*2\s088\s₽/);
  await page.locator('#st-period button').filter({ hasText: 'Год' }).click();
  s = await text(page, '.screen');
  assert.match(s, /2026 год/);
  assert.match(s, /Сентябрь 2026[\s\S]*Октябрь 2026/);
  await page.locator('[data-act=st-prev]').click();
  assert.match(await text(page, '.screen'), /2025 год/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('поиск в заметках: без учёта регистра и «ё», с подсветкой', async () => {
  const { context, page } = await openApp(env);
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    await s.saveNote({ id: 'n1', type: '2ЭС5К', number: '355', text: 'Тёк кран машиниста', createdAt: 1 });
    await s.saveNote({ id: 'n2', type: 'ВЛ80С', number: '1234', text: 'Слабый компрессор', createdAt: 2 });
  });
  await tab(page, 'extra');
  await page.locator('[data-act=extra-notes]').click();
  await page.locator('#notes-q').fill('ТЕК');
  await page.waitForFunction(() => document.querySelectorAll('#notes-list mark').length > 0);
  let list = await text(page, '#notes-list');
  assert.match(list, /кран машиниста/);
  assert.doesNotMatch(list, /компрессор/);
  assert.equal(await page.locator('#notes-list mark').first().innerText(), 'Тёк');
  await page.locator('#notes-q').fill('1234');
  await page.waitForFunction(() => /компрессор/.test(document.querySelector('#notes-list')?.innerText || ''));
  await page.locator('#notes-q').fill('тормоз');
  await page.waitForFunction(() => /Ничего не найдено/.test(document.querySelector('#notes-list')?.innerText || ''));
  await page.locator('[data-act=notes-clear]').click();
  list = await text(page, '#notes-list');
  assert.match(list, /кран машиниста/);
  assert.match(list, /компрессор/);
  assert.equal(await page.locator('#notes-list mark').count(), 0);
  await context.close();
});

test('документы: фото в папке листаются', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-docs]').click();
  await page.locator('#doc-upload').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('[data-act=doc-open]').length === 2);
  await page.locator('[data-act=doc-open]').first().click();
  await page.waitForSelector('.viewer-count');
  assert.equal(await text(page, '.viewer-count'), '1 из 2');
  const count = (v) => page.waitForFunction((v) => document.querySelector('.viewer-count')?.textContent === v, v);
  await page.locator('[data-v=next]').click();
  await count('2 из 2');
  assert.equal(await page.locator('[data-v=next]').isHidden(), true);
  await page.keyboard.press('ArrowLeft');
  await count('1 из 2');
  assert.deepEqual(errors, []);
  await context.close();
});

test('напоминание о резервной копии через две недели', async () => {
  const { context, page } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    await s.saveBackupInfo({ since: Date.now() - 15 * 86400000, lastAt: 0 });
  });
  await page.reload();
  await page.waitForSelector('.screen');
  assert.match(await text(page, '.nag'), /Вы ещё не сохраняли резервную копию/);
  await page.locator('[data-act=nag-later]').click();
  await page.waitForFunction(() => !document.querySelector('.nag'));
  await page.reload();
  await page.waitForSelector('.screen');
  assert.equal(await page.locator('.nag').count(), 0);
  await context.close();
});

test('обновление с 1.x: данные на месте, тема тёмная, полный отдых остаётся выбранным', async () => {
  const { context, page, errors } = await openApp(env);
  // так данные лежали в версии 1.5: тема «Как в системе», полный отдых без выбора варианта
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('meta', { id: 'settings', theme: 'system', minRest: 240, tz: 'Europe/Moscow' });
    await db.put('routes', { id: 'r1', from: 'А', to: 'Б' });
    await db.put('routes', { id: 'r2', from: 'Б', to: 'А' });
    await db.put('trips', { id: 'a', routeId: 'r1', start: '2026-10-19T08:00', end: '2026-10-19T14:00', passenger: [], restType: 'turnaround', createdAt: 1, updatedAt: 1 });
    await db.put('trips', { id: 'b', routeId: 'r2', start: '2026-10-19T20:00', end: '2026-10-20T02:00', passenger: [], restType: 'home', homeRest: { ids: ['a', 'b'] }, createdAt: 2, updatedAt: 2 });
    await db.put('absences', { id: 'v', type: 'vacation', start: '2026-10-26', end: '2026-10-27' });
  });
  await page.reload();
  await page.waitForSelector('.trip');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.locator('.trip').count(), 2);
  assert.match(await text(page, '.hero'), /Норма: 160 ч/);
  assert.match(await text(page, '.rest-banner'), /Полный отдых · до завтра, 03:12/);
  await page.locator('.trip').first().click();
  assert.equal(await sheet(page).locator('[data-choice=full]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

test('резервная копия из версии 1.x восстанавливается, из более новой — нет', async () => {
  const { context, page } = await openApp(env);
  const v1 = {
    app: 'CABINA', format: 1, version: '1.5.0', exportedAt: '2026-10-01T10:00:00.000Z', withDocs: false,
    data: {
      trips: [{ id: 'a', routeId: 'r1', start: '2026-10-14T08:00', end: '2026-10-14T12:00', passenger: [], restType: 'home', homeRest: { ids: ['a'] }, locoType: '2ЭС5К', locoNumber: '355' }],
      absences: [], routes: [{ id: 'r1', from: 'Няндома', to: 'Коноша' }], notes: [],
      meta: [{ id: 'settings', theme: 'system', minRest: 240, tz: 'Europe/Moscow' }, { id: 'onboarded' }],
    },
  };
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('#bk-import').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...v1, format: 3 })) });
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('более новой версии'));
  await page.locator('#bk-import').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
  await sheet(page).getByRole('button', { name: 'Восстановить' }).click();
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Данные восстановлены'));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await tab(page, 'home');
  assert.match(await text(page, '.trip'), /Няндома → Коноша/);
  await context.close();
});
