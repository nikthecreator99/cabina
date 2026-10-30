// Браузерные проверки CABINA 2.6: шапка главной и поиск, форма поездки без шагов (манёвры, вес/оси/длина,
// номер маршрута, заметка после номера локомотива), день календаря, «Телефоны», номер в профиле. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const store = (page, fn) => page.evaluate(fn);
const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка' }];
const TRIPS = [
  { id: 'a', routeId: 'r1', start: '2026-10-14T05:40', end: '2026-10-14T17:10', locoType: '2ЭС5К', locoNumber: '355', routeNo: '1742', weight: 5200, axles: 220, length: 57 },
  { id: 'b', start: '2026-10-03T08:00', end: '2026-10-03T15:00', routeLabel: 'Ольховка — Берёзово', kind: 'shunt' },
];

test('шапка главной: ☰ · месяц · поиск ровно по краям и по одной линии, 320 px', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  const box = (sel) => page.locator(sel).boundingBox();
  const menu = await box('.home-head [data-page=work]');
  const search = await box('.home-head [data-page=search]');
  const month = await box('.home-head .month-switch');
  const cy = (b) => b.y + b.height / 2;
  assert.ok(Math.abs(cy(menu) - cy(search)) < 1 && Math.abs(cy(menu) - cy(month)) < 2, 'на одной линии');
  assert.ok(Math.abs(menu.x - (320 - search.x - search.width)) < 1, 'одинаковые отступы слева и справа');
  assert.ok(Math.abs((month.x + month.width / 2) - 160) < 2, 'месяц по центру');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  assert.deepEqual(errors, []);
  await context.close();
});

test('поиск по поездкам: подсветка, номер маршрута, манёвры, дата; нажатие открывает поездку', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS });
  await page.locator('.home-head [data-page=search]').click();
  await page.waitForSelector('#trip-q');
  await page.waitForFunction(() => document.activeElement?.id === 'trip-q', null, { timeout: 2000 }); // поле сразу в фокусе
  assert.match(await text(page, '#search-list'), /станция, серия или номер локомотива/);
  await page.fill('#trip-q', 'елкино 355');
  assert.match(await text(page, '#search-list'), /Найдено: 1 поездка/);
  assert.deepEqual(await page.locator('#search-list mark').allInnerTexts(), ['Ёлкино', '355']);
  await page.fill('#trip-q', '1742');
  assert.match(await text(page, '#search-list'), /маршрут № 1742/);
  await page.fill('#trip-q', 'манёвры');
  assert.match(await text(page, '#search-list'), /3 октября[\s\S]*Берёзово/);
  await page.fill('#trip-q', 'нет такого');
  assert.match(await text(page, '#search-list'), /Ничего не найдено/);
  await page.locator('[data-act=trip-q-clear]').click();
  assert.equal(await page.inputValue('#trip-q'), '');
  await page.fill('#trip-q', '14 октября');
  await page.locator('#search-list [data-act=trip]').first().click();
  assert.equal(await sheet(page).locator('#tf-rn').inputValue(), '1742');
  assert.deepEqual(errors, []);
  await context.close();
});

test('форма поездки: без номеров шагов и «Завершить», вес/оси/длина и номер маршрута по «+», заметка — после номера локомотива', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  assert.equal(await f.locator('.step-n').count(), 0);
  assert.equal(await f.locator('[data-act=finish-now]').count(), 0);
  // вес, оси, длина — сразу после вида движения
  const add = f.locator('[data-act=add-train]');
  assert.ok((await add.boundingBox()).y > (await f.locator('#tf-kind').boundingBox()).y);
  await add.click();
  await f.locator('#tf-weight').fill('5 200');
  await f.locator('#tf-axles').fill('220');
  await f.locator('#tf-length').fill('57');
  // манёвры: поля поезда скрываются, но введённое не теряется
  await f.locator('#tf-kind').click();
  await f.locator('#tf-kind-list [data-kind=shunt]').click();
  assert.match(await text(f, '#tf-kind'), /Манёвры/);
  await f.locator('#tf-kind').click();
  await f.locator('#tf-kind-list [data-kind=freight]').click();
  // номер маршрута — после следования пассажиром
  const rn = f.locator('#tf-add-routeno');
  assert.ok((await rn.boundingBox()).y > (await f.locator('[data-act=add-pass]').boundingBox()).y);
  await rn.click();
  await f.locator('#tf-rn').fill('1742');
  // заметка: только после номера локомотива
  assert.equal(await f.locator('#tf-note-box').isHidden(), true);
  await f.locator('#tf-lt').fill('2ЭС5К');
  await f.locator('#tf-ln').fill('355');
  assert.equal(await f.locator('#tf-add-note').isVisible(), true);
  assert.equal(await f.locator('#tf-note').isVisible(), false);
  await f.locator('#tf-add-note').click();
  await f.locator('#tf-note').fill('Течёт кран');
  await f.locator('#tf-sd').fill('2026-10-19');
  await f.locator('#tf-st').fill('08:00');
  await f.locator('#tf-et').fill('16:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = await store(page, async () => (await import('./js/store.js')).S.trips[0]);
  assert.deepEqual({ weight: t.weight, axles: t.axles, length: t.length, routeNo: t.routeNo, kind: t.kind }, { weight: 5200, axles: 220, length: 57, routeNo: '1742', kind: 'freight' });
  assert.equal((await store(page, async () => (await import('./js/store.js')).S.notes))[0].text, 'Течёт кран');
  // при открытии заполненные поля уже раскрыты
  await page.locator('.trip').first().click();
  assert.equal(await sheet(page).locator('#tf-weight').inputValue(), '5200');
  assert.equal(await sheet(page).locator('#tf-rn').isVisible(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('календарь: рабочий день — сводка и «Открыть поездку»; пустой — отвлечение или «Выходной»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS, settings: { pay: { main: { rates: [{ from: null, rate: 300 }] } } } });
  await page.locator('.hero').click();
  await page.waitForSelector('.cal-grid');
  await page.locator('.cal-grid [data-d="2026-10-14"]').click();
  const s = await text(sheet(page), '.day-trip');
  assert.match(s, /Ёлкино → Сосновка[\s\S]*Грузовой/);
  assert.match(s, /Явка\s+05:40[\s\S]*Окончание\s+17:10[\s\S]*Рабочее время\s+11 ч 30 мин/);
  assert.match(s, /2ЭС5К №355[\s\S]*1742[\s\S]*Заработок\s+≈/);
  assert.match(s, /5\s200 т · 220 осей · 57 усл\. ваг\./);
  await sheet(page).locator('[data-act=day-trip]').click();
  assert.equal(await sheet(page).locator('#tf-rn').inputValue(), '1742');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // пустой день: отметка «Выходной» — только отметка, норма та же
  const norm = await text(page, '.screen');
  await page.locator('.cal-grid [data-d="2026-10-07"]').click();
  assert.match(await text(sheet(page), '.day-pick'), /Отвлечение[\s\S]*Выходной/);
  await sheet(page).locator('[data-act=day-off]').click();
  await waitNoLayers(page);
  await page.waitForSelector('.cal-grid [data-d="2026-10-07"].dayoff');
  assert.deepEqual(await store(page, async () => (await import('./js/store.js')).S.daysOff), ['2026-10-07']);
  assert.equal((await text(page, '.screen')).match(/Норма[^\n]*/)?.[0], norm.match(/Норма[^\n]*/)?.[0]);
  await page.locator('.cal-grid [data-d="2026-10-07"]').click();
  assert.match(await text(sheet(page), '.day-pick'), /Убрать отметку/);
  await sheet(page).locator('[data-act=day-off]').click();
  await waitNoLayers(page);
  await page.waitForSelector('.cal-grid [data-d="2026-10-07"].free');
  // отвлечение с этой датой
  await page.locator('.cal-grid [data-d="2026-10-08"]').click();
  await sheet(page).locator('[data-act=day-abs]').click();
  assert.equal(await sheet(page).locator('#af-start').inputValue(), '2026-10-08');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Телефоны»: добавить, позвонить, найти, изменить, удалить; номер в профиле скрыт от коллег по умолчанию', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-phones]').click();
  assert.match(await text(page, '.screen'), /Номеров пока нет[\s\S]*только в этом телефоне/);
  await page.locator('[data-act=phone-add]').click();
  let f = sheet(page);
  await f.locator('[data-act=save-phone]').click();
  assert.match(await text(f, '[data-error]'), /Напишите имя/);
  await f.locator('#ph-name').fill('Сергей <b>Петрович</b>');
  await f.locator('[data-act=save-phone]').click();
  assert.match(await text(f, '[data-error]'), /Укажите номер/);
  await f.locator('#ph-who').fill('Нарядчик');
  await f.locator('#ph-tel').fill('+7 (900) 000-00-01');
  await f.locator('[data-act=save-phone]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('.phone-row b').count(), 0, 'текст экранирован');
  assert.match(await text(page, '#phones-list'), /Сергей <b>Петрович<\/b>[\s\S]*Нарядчик · \+7 \(900\) 000-00-01/);
  assert.equal(await page.locator('.call-btn').getAttribute('href'), 'tel:+79000000001');
  await page.locator('[data-act=phone-edit]').click();
  f = sheet(page);
  await f.locator('#ph-note').fill('после 8:00');
  await f.locator('[data-act=save-phone]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '#phones-list'), /после 8:00/);
  await page.locator('[data-act=phone-edit]').click();
  await sheet(page).locator('[data-act=del-phone]').click();
  await sheet(page).getByRole('button', { name: 'Да' }).click();
  await waitNoLayers(page);
  assert.match(await text(page, '#phones-list'), /Номеров пока нет/);
  // профиль: номер хранится в телефоне и виден только самому человеку
  await tab(page, 'profile');
  await page.locator('[data-page=profile-edit]').click();
  await page.fill('#pr-phone', '+7 900 000-00-09');
  await page.locator('#pr-phone').blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.phone === '+7 900 000-00-09');
  assert.match(await text(page, '.screen'), /Хранится только в этом телефоне и никому не передаётся/);
  assert.equal(await page.evaluate(async () => (await import('./js/profile.js')).privacyOf().phone), false);
  await tab(page, 'profile');
  assert.match(await text(page, '.profile-card'), /\+7 900 000-00-09/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('экраны 2.6 на 320 px в обеих темах: ничего не вылезает за ширину', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS });
  await page.setViewportSize({ width: 320, height: 640 });
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t }); document.documentElement.dataset.theme = t; }, theme);
    await page.locator('.home-head [data-page=search]').click();
    await page.fill('#trip-q', '2026');
    assert.equal(await wide(), 320, `поиск, ${theme}`);
    await tab(page, 'home');
    await page.locator('[data-act=add-trip]').click();
    await sheet(page).locator('[data-act=add-train]').click();
    await sheet(page).locator('#tf-add-routeno').click();
    assert.equal(await wide(), 320, `форма поездки, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
    await page.locator('.hero').click();
    await page.locator('.cal-grid [data-d="2026-10-14"]').click();
    assert.equal(await wide(), 320, `сводка дня, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
    await tab(page, 'extra');
    await page.locator('[data-act=extra-phones]').click();
    assert.equal(await wide(), 320, `телефоны, ${theme}`);
    await page.locator('[data-act=extra-back]').click();
    await tab(page, 'home');
  }
  assert.deepEqual(errors, []);
  await context.close();
});
