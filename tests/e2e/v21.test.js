// Браузерные проверки CABINA 2.1: «Пойти на выходной», выходные в календаре, ожидание следования
// пассажиром, профиль (просмотр и редактирование), статус и приватность. Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const stored = (page, id) => page.evaluate(async (id) => (await import('./js/store.js')).S.trips.find((t) => t.id === id), id);
const PAY = { assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };

test('«Пойти на выходной»: таймер на главном, длительность из настроек, выходные в календаре', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-19T22:00', end: '2026-10-20T06:00', restType: 'home' }] });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  const btn = f.locator('[data-choice=dayOff]');
  assert.match(await btn.innerText(), /Пойти на выходной\s+на 60 ч/);
  // кнопка ниже «На очередь» (после того как окно доехало)
  await page.waitForTimeout(500);
  const q = await f.locator('[data-choice=queue]').boundingBox();
  const d = await btn.boundingBox();
  assert.ok(d.y > q.y + q.height - 1, '«Пойти на выходной» под «На очередь»');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  assert.match(await text(f, '#tf-calc'), /Выходной до[\s\S]*22 окт, 18:00/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.rest-banner'), /На выходном · до 22 окт, 18:00/);
  assert.match(await text(page, '.rest-banner'), /Осталось 54 ч/);
  assert.equal((await stored(page, 'a')).dayOffMin, 3600);

  // ☰ → «Выходной»: своя длительность депо; уже выбранный выходной не меняется
  await page.locator('.home-head [data-page=work]').click();
  // 2.2: панель свёрнута — видно значение, настройка открывается нажатием
  assert.equal(await page.locator('#day-off').count(), 0);
  assert.match(await text(page, '#dayoff-panel'), /60 ч/);
  await page.locator('[data-act=wk-toggle][data-k=dayoff]').click();
  const inp = page.locator('#day-off');
  assert.equal(await inp.inputValue(), '60');
  await inp.fill('0');
  await inp.blur();
  await page.waitForFunction(() => document.querySelector('#day-off').value === '60');
  await inp.fill('72');
  await inp.blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.dayOffMin === 72 * 60);
  await tab(page, 'home');
  assert.match(await text(page, '.rest-banner'), /до 22 окт, 18:00/);

  // календарь в статистике: 20, 21 и 22 октября — выходные (20-е — день с поездкой)
  await page.locator('.hero').click();
  await page.waitForSelector('#st-kind');
  const off = await page.locator('.cal-grid .cal-d.dayoff').allInnerTexts();
  assert.deepEqual(off, ['21', '22']);
  assert.match(await text(page, '.screen'), /выходной/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ожидание следования пассажиром: кнопка после следования, часы в поездке и в зарплате', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }],
    settings: { pay: PAY },
  });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  assert.equal(await f.locator('#tf-add-wait').isVisible(), false, 'без следования пассажиром кнопки нет');
  await f.locator('[data-act=add-pass]').click();
  const pass = f.locator('#tf-pass .interval').last();
  await pass.locator('[data-pf=st]').fill('14:30');
  await pass.locator('[data-pf=et]').fill('16:00');
  await f.locator('#tf-add-wait').click();
  const w = f.locator('.interval.wait');
  assert.equal(await w.count(), 1);
  assert.match(await w.innerText(), /Ожидание №1/);
  await w.locator('[data-pf=st]').fill('12:00');
  await w.locator('[data-pf=et]').fill('14:30');
  assert.match(await text(f, '#tf-calc'), /В том числе ожидание следования\s+2 ч 30 мин/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = await stored(page, 'a');
  assert.deepEqual(t.waiting.map(({ start, end }) => ({ start, end })), [{ start: '2026-10-14T12:00', end: '2026-10-14T14:30' }]);
  // зарплата: 5,5 ч по тарифу + 2,5 ч ожидания по тарифу
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  const s = await text(page, '.screen');
  assert.match(s, /Ожидание следования пассажиром[\s\S]*750/);
  // удалить ожидание
  await tab(page, 'home');
  await page.locator('.trip').first().click();
  await sheet(page).locator('.interval.wait [data-act=del-pass]').click();
  assert.equal(await sheet(page).locator('.interval.wait').count(), 0);
  assert.equal(await sheet(page).locator('#tf-pass .interval').count(), 1, 'следование пассажиром осталось');
  await sheet(page).locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await stored(page, 'a')).waiting.length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('профиль: статус по порядку — в пути, на отвлечении, на выходном, между поездками', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  assert.equal(await page.locator('#pr-status').count(), 0, 'без поездок статуса нет');
  assert.match(await text(page, '.profile-card'), /Имя не указано/);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-19T04:00', end: '2026-10-19T10:00', restType: 'home', homeChoice: 'queue' }] });
  await tab(page, 'profile');
  assert.match(await text(page, '#pr-status'), /Между поездками/);
  assert.match(await text(page, '.profile-tiles'), /1\s+поездка в октябре/);
  await seed(page, { trips: [{ id: 'b', start: '2026-10-19T22:00', end: '2026-10-20T06:00', restType: 'home', homeChoice: 'dayOff', dayOffMin: 3600 }] });
  await tab(page, 'profile');
  assert.match(await text(page, '#pr-status'), /На выходном\s*до 22 окт, 18:00/);
  await seed(page, { absences: [{ id: 'x', type: 'sick', start: '2026-10-20', end: '2026-10-23' }] });
  await tab(page, 'profile');
  const abs = await text(page, '#pr-status');
  assert.match(abs, /На отвлечении\s*до 23 октября включительно/);
  assert.doesNotMatch(abs, /больнич/i, 'причина отвлечения не показывается');
  await seed(page, { trips: [{ id: 'l', start: '2026-10-20T11:00', end: '' }] });
  await tab(page, 'profile');
  assert.match(await text(page, '#pr-status'), /В пути/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('приватность: по умолчанию всё скрыто, переключатели сохраняются', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('[data-page=profile-edit]').click();
  const sw = page.locator('#pr-privacy [data-act=pr-priv]');
  assert.deepEqual(await sw.evaluateAll((a) => a.map((b) => b.getAttribute('aria-checked'))), ['false', 'false', 'false', 'false', 'false'], 'меня можно найти, статус, депо, персонаж, номер телефона');
  assert.match(await text(page, '.screen'), /Причину отвлечения[\s\S]*не увидят никогда/);
  await page.locator('[data-act=pr-priv][data-k=depot]').click();
  await page.waitForFunction(() => document.querySelector('[data-k=depot]')?.getAttribute('aria-checked') === 'true');
  await page.reload();
  await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('[data-page=profile-edit]').click();
  assert.equal(await page.locator('[data-k=depot]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('[data-k=status]').getAttribute('aria-checked'), 'false');
  assert.deepEqual(errors, []);
  await context.close();
});
