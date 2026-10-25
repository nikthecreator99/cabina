// Браузерные проверки CABINA на экране телефона (390×844): главные сценарии пользователя.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
// ☰ → «Настройки работы» → нужный экран; «Профиль» → шестерёнка → «Настройки»
async function workPage(page, name) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  if (name) await page.locator(`.screen [data-act=go][data-page=${name}]`).click();
}
async function settingsPage(page) {
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.waitForSelector('#theme-seg');
}

test('первый запуск: приветствие, затем пустой октябрь с нормой 176 ч', async () => {
  const { context, page, errors } = await openApp(env, { onboard: false });
  assert.match(await sheet(page).innerText(), /Добро пожаловать/);
  await page.getByRole('button', { name: 'Начать' }).click();
  await waitNoLayers(page);
  assert.equal(await text(page, '.month-title'), 'Октябрь');
  assert.match(await text(page, '.hero'), /Норма: 176 ч/);
  // ставка не указана — вместо заработка ссылка на тарифные ставки
  assert.match(await text(page, '.hero'), /Указать ставку/);
  assert.match(await text(page, '.empty'), /В октябре поездок нет/);
  // после перезапуска приветствие больше не показывается
  await page.reload();
  await page.waitForSelector('.screen');
  assert.equal(await page.locator('#layers .layer').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('добавление поездки через форму: часы, ночные, отдых, сохранение после перезапуска', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-sd').fill('2026-10-14');
  await f.locator('#tf-st').fill('20:00');
  await f.locator('#tf-et').fill('07:30');
  // окончание после полуночи — дата сама на следующий день
  assert.equal(await f.locator('#tf-ed').inputValue(), '2026-10-15');
  assert.match(await f.locator('#tf-end-hint').innerText(), /следующий день/);
  await f.locator('#tf-lt').fill('2ЭС5К');
  await f.locator('#tf-ln').fill('355');
  const calc = await f.locator('#tf-calc').innerText();
  assert.match(calc, /Рабочее время\s+11 ч 30 мин/);
  assert.match(calc, /Ночные \(22:00–06:00\)\s+8 ч 00 мин/);
  assert.match(calc, /Отдых в пункте оборота\s+Длительность\s+5 ч 45 мин/i);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.toast-wrap'), /Поездка добавлена/);

  assert.match(await text(page, '.hero .big'), /11\s*ч\s*30\s*мин/);
  assert.match(await text(page, '.hero-lines'), /Ночные:\s*8 ч 00 мин/);
  const row = await text(page, '.trip');
  assert.match(row, /20:00 — 07:30/);
  assert.match(row, /2ЭС5К №355/);
  assert.match(row, /11 ч 30/);

  await page.reload();
  await page.waitForSelector('.trip');
  assert.match(await text(page, '.trip'), /2ЭС5К №355/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ошибки в форме поездки показываются и не дают сохранить', async () => {
  const { context, page } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('[data-act=save-trip]').click();
  assert.match(await f.locator('[data-error]').innerText(), /Укажите дату и время начала/);
  await f.locator('#tf-st').fill('08:00');
  await f.locator('#tf-et').fill('08:00');
  await f.locator('#tf-ed').fill('2026-10-20');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await f.locator('[data-error]').innerText(), /0 минут/);
  await f.locator('#tf-et').fill('12:00');
  await f.locator('#tf-note').fill('Течёт кран');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await f.locator('[data-error]').innerText(), /укажите тип и номер локомотива/);
  await context.close();
});

test('отвлечение уменьшает норму и открывается из карточки', async () => {
  const { context, page } = await openApp(env);
  // отвлечений нет — кнопка сразу открывает форму
  await page.locator('[data-act=absences]').click();
  const f = sheet(page);
  await f.locator('.type-pick button').filter({ hasText: 'Отпуск' }).click();
  await f.locator('#af-start').fill('2026-10-19');
  await f.locator('#af-end').fill('2026-10-20');
  assert.match(await f.locator('#af-hours').innerText(), /16 ч/);
  await f.locator('[data-act=save-abs]').click();
  await waitNoLayers(page);
  const hero = await text(page, '.hero');
  assert.match(hero, /Норма: 160 ч/);
  assert.match(hero, /176 ч по календарю − 16 ч отвлечений/);
  assert.match(await text(page, '.hero-lines'), /Отпуск:\s*−16 ч/);
  assert.equal(await text(page, '[data-act=absences] .count'), '1');
  // теперь кнопка открывает список; пересечение с существующим отвлечением не сохраняется
  await page.locator('[data-act=absences]').click();
  assert.match(await sheet(page).innerText(), /Отпуск[\s\S]*19/);
  await sheet(page).locator('[data-act=al-new]').click();
  const g = sheet(page);
  await g.locator('#af-start').fill('2026-10-20');
  await g.locator('#af-end').fill('2026-10-21');
  await g.locator('[data-act=save-abs]').click();
  assert.match(await g.locator('[data-error]').innerText(), /пересекается/);
  await g.locator('button[data-close]').first().click();
  // из списка отвлечение открывается нажатием
  await sheet(page).locator('[data-act=al-open]').first().click();
  assert.equal(await sheet(page).locator('#af-start').inputValue(), '2026-10-19');
  await context.close();
});

test('переработка и отпуск: итоги месяца по записанным данным', async () => {
  const { context, page } = await openApp(env);
  const trips = [];
  for (let d = 1; d <= 23; d++) trips.push({ id: `t${d}`, start: `2026-10-${String(d).padStart(2, '0')}T08:00`, end: `2026-10-${String(d).padStart(2, '0')}T16:00` });
  await seed(page, { trips });
  assert.match(await text(page, '.hero'), /184\s*ч\s*00\s*мин/);
  assert.match(await text(page, '.hero'), /Сверх нормы\s*\+8 ч 00 мин/);
  assert.match(await text(page, '.hero-lines'), /Переработка:\s*8 ч 00 мин/);
  assert.match(await text(page, '.sec-head'), /23 поездки/);
  await context.close();
});

test('удаление поездки свайпом влево и подтверждением', async () => {
  const { context, page } = await openApp(env);
  await seed(page, { trips: [{ id: 'x', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  const row = page.locator('.swipe .swipe-row').first();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, box.y + box.height / 2);
  await page.mouse.up();
  await page.locator('.swipe.open [data-act=trip-del]').click();
  const dlg = sheet(page);
  assert.match(await dlg.innerText(), /удалить поездку/);
  await dlg.getByRole('button', { name: 'Да' }).click();
  await page.waitForSelector('.empty');
  assert.match(await text(page, '.hero .big'), /0\s*ч\s*00\s*мин/);
  await context.close();
});

test('маршруты: добавить, создать обратный, выбрать в поездке', async () => {
  const { context, page } = await openApp(env);
  await workPage(page, 'routes');
  await page.locator('[data-act=add-route]').click();
  let f = sheet(page);
  await f.locator('#rf-from').fill('Малошуйка');
  await f.locator('#rf-to').fill('Сумский Посад');
  await f.locator('#rf-km').fill('98.5');
  await f.locator('[data-act=save-route]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.screen'), /Малошуйка[\s\S]*Сумский Посад/);
  assert.match(await text(page, '.screen'), /98,5 км/);
  await page.locator('[data-act=route-reverse]').first().click();
  f = sheet(page);
  assert.equal(await f.locator('#rf-from').inputValue(), 'Сумский Посад');
  assert.equal(await f.locator('#rf-to').inputValue(), 'Малошуйка');
  await f.locator('[data-act=save-route]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('[data-act=route-reverse]').count(), 0, 'у обоих маршрутов уже есть обратный');

  await tab(page, 'home');
  await page.locator('[data-act=add-trip]').click();
  f = sheet(page);
  await f.locator('#tf-route-quick .qchip').filter({ hasText: 'Малошуйка → Сумский Посад' }).click();
  await f.locator('#tf-st').fill('08:00');
  await f.locator('#tf-et').fill('11:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.trip'), /Малошуйка → Сумский Посад/);
  await context.close();
});

test('полный отдых по поездке туда и обратно', async () => {
  const { context, page } = await openApp(env);
  await seed(page, {
    routes: [{ id: 'r1', from: 'А', to: 'Б' }, { id: 'r2', from: 'Б', to: 'А' }],
    trips: [{ id: 'a', routeId: 'r1', start: '2026-10-19T08:00', end: '2026-10-19T14:00', restType: 'turnaround' }],
  });
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-route-quick .qchip').filter({ hasText: 'Б → А' }).click();
  await f.locator('#tf-sd').fill('2026-10-19');
  await f.locator('#tf-st').fill('20:00');
  await f.locator('#tf-et').fill('02:00');
  await f.locator('[data-rest=home]').click();
  await f.locator('[data-act=home-calc]').click();
  let home = await f.locator('#tf-home').innerText();
  assert.match(home, /Поездка туда и обратно/);
  assert.match(home, /А → Б → А/);
  // (6 ч + 6 ч) × 2,6 − 6 ч = 25 ч 12 мин
  assert.match(home, /Полный отдых\s+25 ч 12 мин/);
  assert.match(home, /С выходным \(\+24 ч\)\s+49 ч 12 мин/);
  // ничего не выбрано — на главном экране отдых не показывается
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('.rest-banner').count(), 0);
  // выбираем «Пойти на полный отдых»: кнопка подсвечена, отдых виден на главном
  await page.locator('.trip').first().click();
  const g = sheet(page);
  await g.locator('[data-choice=full]').click();
  assert.equal(await g.locator('[data-choice=full]').getAttribute('aria-pressed'), 'true');
  assert.equal(await g.locator('[data-choice=fullOff]').getAttribute('aria-pressed'), 'false');
  await g.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  // «сейчас» 20 октября 12:00 — отдых до 21 октября 03:12 ещё идёт
  assert.match(await text(page, '.rest-banner'), /Полный отдых · до завтра, 03:12/);
  assert.match(await text(page, '.rest-banner'), /Осталось 15 ч 12 мин/);
  // передумали — с выходным
  await page.locator('.trip').first().click();
  await sheet(page).locator('[data-choice=fullOff]').click();
  await sheet(page).locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.rest-banner'), /Полный отдых с выходным · до 22 окт, 03:12/);
  await context.close();
});

test('статус отдыха в пункте оборота на главном экране', async () => {
  const { context, page } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-20T04:00', end: '2026-10-20T10:00' }] });
  const b = await text(page, '.rest-banner');
  assert.match(b, /Отдых в пункте оборота · до сегодня, 14:00/);
  assert.match(b, /Осталось 2 ч 00 мин/);
  await context.close();
});

test('переключение месяцев и возврат к текущему', async () => {
  const { context, page } = await openApp(env);
  assert.equal(await page.locator('[data-act=today]').count(), 0);
  await page.locator('[data-act=next]').click();
  assert.equal(await text(page, '.month-title'), 'Ноябрь');
  assert.match(await text(page, '.hero'), /Норма: 159 ч/);
  await page.locator('[data-act=next]').click();
  await page.locator('[data-act=next]').click();
  assert.equal(await text(page, '.month-title'), 'Январь 2027');
  await page.locator('[data-act=today]').click();
  assert.equal(await text(page, '.month-title'), 'Октябрь');
  await context.close();
});

test('настройки: тема и минимальный отдых сохраняются', async () => {
  const { context, page } = await openApp(env);
  // по умолчанию тёмная тема, вариантов два
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await settingsPage(page);
  assert.equal(await page.locator('#theme-seg button').count(), 2);
  await page.locator('[data-act=theme][data-v=light]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  // 2.5: календарь — одной строкой, пояснения в отдельном окне
  assert.match(await text(page, '[data-act=cal-info]'), /РФ, 40-часовая неделя[\s\S]*2026 год — 1972 ч/);
  await page.locator('[data-act=cal-info]').click();
  assert.match(await text(page, '#layers'), /2026 год: 1972 ч[\s\S]*Пятидневная неделя, 40 часов/);
  await page.locator('#layers [data-close]').first().click();
  await waitNoLayers(page);
  await workPage(page, 'houses');
  assert.equal(await text(page, '#min-rest'), '4 ч 00 мин');
  await page.locator('[data-act=rest-plus]').click();
  await page.waitForFunction(() => document.querySelector('#min-rest')?.textContent === '4 ч 30 мин');
  await page.reload();
  await page.waitForSelector('.screen');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await workPage(page, 'houses');
  assert.equal(await text(page, '#min-rest'), '4 ч 30 мин');
  await context.close();
});

test('резервная копия: сохранить и восстановить на «новом телефоне»', async () => {
  const one = await openApp(env);
  await seed(one.page, {
    routes: [{ id: 'r1', from: 'Няндома', to: 'Коноша' }],
    trips: [{ id: 'a', routeId: 'r1', start: '2026-10-14T08:00', end: '2026-10-14T12:00', locoType: '2ЭС5К', locoNumber: '355' }],
    absences: [{ id: 'v', type: 'vacation', start: '2026-10-19', end: '2026-10-20' }],
  });
  await settingsPage(one.page);
  await one.page.locator('[data-act=export]').click();
  // перед сохранением — предупреждение о личных данных
  assert.match(await sheet(one.page).innerText(), /личные данные[\s\S]*Не пересылайте его другим/);
  const [download] = await Promise.all([one.page.waitForEvent('download'), sheet(one.page).getByRole('button', { name: 'Сохранить копию' }).click()]);
  assert.match(download.suggestedFilename(), /^cabina-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = join(await mkdtemp(join(tmpdir(), 'cabina-')), download.suggestedFilename());
  await download.saveAs(file);
  const payload = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(payload.app, 'CABINA');
  assert.equal(payload.format, 2);
  assert.equal(payload.data.trips.length, 1);
  assert.equal(payload.data.trips[0]._stats, undefined);
  await one.context.close();

  const two = await openApp(env);
  await settingsPage(two.page);
  await two.page.locator('#bk-import').setInputFiles(file);
  const dlg = sheet(two.page);
  assert.match(await dlg.innerText(), /1 поездка/);
  await dlg.getByRole('button', { name: 'Восстановить' }).click();
  await two.page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Данные восстановлены'));
  await tab(two.page, 'home');
  assert.match(await text(two.page, '.trip'), /Няндома → Коноша/);
  assert.match(await text(two.page, '.hero'), /Норма: 160 ч/);
  await two.context.close();
});

test('чужой файл вместо копии не трогает данные', async () => {
  const { context, page } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await settingsPage(page);
  await page.locator('#bk-import').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Это не файл резервной копии'));
  await tab(page, 'home');
  assert.equal(await page.locator('.trip').count(), 1);
  await context.close();
});

test('заметки о локомотивах и раздел «Дополнительно»', async () => {
  const { context, page } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-notes]').click();
  await page.locator('[data-act=note-add]').first().click();
  const f = sheet(page);
  await f.locator('#nf-type').fill('2ЭС5К');
  await f.locator('#nf-num').fill('355');
  await f.locator('#nf-text').fill('Часто ломается компрессор');
  await f.locator('[data-act=save-note]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.screen'), /Часто ломается компрессор/);
  // в форме поездки появляется ссылка на заметки по этой машине
  await tab(page, 'home');
  await page.locator('[data-act=add-trip]').click();
  const t = sheet(page);
  await t.locator('#tf-lt').fill('2ЭС5К');
  await t.locator('#tf-ln').fill('№355');
  assert.match(await t.locator('#tf-loco-notes').innerText(), /Посмотреть заметки по этому локомотиву \(1\)/);
  await context.close();
});

test('экран телефона: ничего не вылезает за ширину на всех вкладках', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T20:00', end: '2026-10-15T07:30', locoType: '2ЭС5К', locoNumber: '355', routeLabel: 'Очень длинное название станции → Ещё более длинное название станции' }] });
  const check = async (name) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 390, `экран ${name}: ширина ${w}`);
  };
  for (const name of ['home', 'extra', 'profile']) { await tab(page, name); await check(name); }
  for (const name of ['routes', 'tariffs', 'houses']) { await workPage(page, name); await check(name); }
  await settingsPage(page); await check('settings');
  await tab(page, 'home'); await page.locator('.hero').click(); await page.waitForSelector('#st-kind'); await check('stats');
  assert.deepEqual(errors, []);
  await context.close();
});
