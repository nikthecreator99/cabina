// Браузерные проверки CABINA 2.19.3: подсказок меньше и по одной за раз, переключатель «Подсказки» в Настройках,
// крупное «Войти в аккаунт», короткая плашка о хранении данных с подробностями в окне.
// Станции и поездки — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startEnv, openApp, seed, text, waitNoLayers, openSettings } from './helpers.js';
import { ready } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка', distanceKm: 100 }];
const trip = (n) => ({ id: `t${n}`, routeId: 'r1', start: `2026-10-0${n}T06:00`, end: `2026-10-0${n}T14:00`, locoType: '2ЭС5К', locoNumber: '355' });
const ALL_IDS = [...readFileSync(new URL('../../js/tours.js', import.meta.url), 'utf8').matchAll(/runTour\('([\w-]+)'/g)].map((m) => m[1]);
const setDone = (page, done) => page.evaluate(async (d) => { const db = await import('./js/db.js'); await db.put('meta', { id: 'tours', done: d }); }, done);
const tourTitle = (page, t) => page.waitForFunction((x) => document.querySelector('.tour .tour-title')?.textContent === x, t, { timeout: 4000 });
const closeTour = async (page) => { await page.locator('.tour .tour-next').click(); await page.waitForFunction(() => !document.querySelector('.tour')); };
const noTour = async (page, why) => { await page.waitForTimeout(1500); assert.equal(await page.locator('.tour').count(), 0, why); };
// уйти на другую вкладку и вернуться — новое посещение главной
const revisitHome = async (page) => { await tab(page, 'profile'); await page.waitForSelector('.profile-card'); await tab(page, 'home'); await page.waitForSelector('.hero'); };

test('подсказок меньше: в tours.js только нужные, у главной — два шага', () => {
  assert.ok(ALL_IDS.length <= 20, `подсказок ${ALL_IDS.length}`);
  for (const gone of ['search', 'tabs3', 'pending', 'awards3', 'stats', 'profile6', 'accountTile3', 'privacy1', 'pull', 'colleaguesPage1',
    'profileEdit3', 'avatar1', 'avatarChars1', 'extra', 'notes', 'docs', 'tripKind2', 'tripPlus', 'absStudy2', 'routeTimes', 'sickPay', 'slipPdf', 'fixTile', 'phonesTile', 'stats210']) {
    assert.ok(!ALL_IDS.includes(gone), `подсказки «${gone}» больше нет`);
  }
  // устаревшая подсказка про «Машинист или помощник» (#pay-role нет с 2.6) убрана
  assert.doesNotMatch(readFileSync(new URL('../../js/tours.js', import.meta.url), 'utf8'), /pay-role|Машинист или помощник/);
});

test('по одной подсказке за посещение экрана; «Отправить напарнику» — от 3 поездок; «экраном вниз» — только если переворот включён', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  await seed(page, { routes: ROUTES, trips: [trip(1), trip(2), trip(3)], settings: { pay: PAY } });
  await page.reload(); await page.waitForSelector('.hero-pay .eye-btn');
  // главная: меню и карточка месяца — и всё; «Выбор месяца», «Отвлечения», «Главная кнопка» больше не объясняем
  await tourTitle(page, 'Меню ☰');
  assert.equal(await text(page, '.tour-count'), '1 из 2');
  await page.locator('.tour .tour-next').click();
  await tourTitle(page, 'Ваш месяц');
  assert.doesNotMatch(await text(page, '.tour-card'), /Выбор месяца|Отвлечения|Главная кнопка/);
  await closeTour(page);
  await noTour(page, 'следующая подсказка сразу не выскакивает');
  // новое посещение — следующая подсказка
  await revisitHome(page);
  await tourTitle(page, 'Ваша поездка');
  await closeTour(page);
  await noTour(page, 'и снова одна');
  await revisitHome(page);
  await tourTitle(page, 'Отправить напарнику');
  assert.match(await text(page, '.tour-card'), /Удержите палец[\s\S]*Заработок напарник не увидит/);
  await closeTour(page);
  await revisitHome(page);
  await tourTitle(page, 'Скрыть суммы');
  assert.match(await text(page, '.tour-card'), /экраном вниз/);
  await closeTour(page);
  await revisitHome(page);
  await noTour(page, 'на главной всё показано');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Отправить напарнику» не показываем, пока поездок меньше трёх; «Скрыть суммы» — если переворот выключен', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  await setDone(page, ['home2', 'swipe']);
  await seed(page, { routes: ROUTES, trips: [trip(1), trip(2)], settings: { pay: PAY, flipHide: false } });
  await page.reload(); await page.waitForSelector('.hero-pay .eye-btn');
  await noTour(page, 'две поездки — рано; переворот выключен — про глаз не рассказываем');
  await seed(page, { trips: [trip(3)] });
  await revisitHome(page);
  await tourTitle(page, 'Отправить напарнику');
  await closeTour(page);
  assert.deepEqual(errors, []);
  await context.close();
});

test('форма поездки: подсказка из двух шагов — окончание и вид отдыха', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  await setDone(page, ['home2']);
  await page.reload(); await page.waitForSelector('.hero');
  await page.locator('[data-act=add-trip]').click();
  await tourTitle(page, 'Окончание поездки');
  assert.equal(await text(page, '.tour-count'), '1 из 2');
  assert.match(await text(page, '.tour-card'), /ещё идёт[\s\S]*в пути/);
  await page.locator('.tour .tour-next').click();
  await tourTitle(page, 'Вид отдыха');
  await closeTour(page);
  await noTour(page, 'в форме больше ничего не объясняем');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Настройки: переключатель «Подсказки», «Войти в аккаунт» крупно, короткая плашка о хранении и окно подробностей; 320 px, обе темы', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  await setDone(page, ALL_IDS); // чтобы подсказки не закрывали кнопки
  await page.reload(); await page.waitForSelector('.hero');
  await tab(page, 'profile');
  await openSettings(page, 'set-about');
  await page.waitForSelector('#tours-sw');
  // подсказки включены по умолчанию; «Показать заново» — рядом
  assert.equal(await page.locator('#tours-sw').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('[data-act=tours-reset]').count(), 1);
  await page.locator('#tours-sw').click();
  await page.waitForSelector('#tours-sw[aria-checked=false]');
  assert.equal(await page.locator('[data-act=tours-reset]').count(), 0, 'выключены — «Показать заново» не нужна');
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-tours-off')), '1');
  await page.locator('#tours-sw').click();
  await page.waitForSelector('#tours-sw[aria-checked=true]');
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-tours-off')), null);
  await openSettings(page); // 2.21: аккаунт — на главном экране Настроек
  // аккаунт: без входа — одна крупная строка
  const acc = page.locator('.screen [data-page=account]');
  assert.equal((await acc.innerText()).trim(), 'Войти в аккаунт');
  assert.equal(await acc.locator('.t1').evaluate((e) => getComputedStyle(e).fontSize), '18px');
  // данные: короткая плашка вместо двух длинных текстов, подробности — по нажатию
  await openSettings(page, 'set-data'); // 2.21: данные — в своём разделе
  const note = page.locator('#storage-note');
  assert.match(await note.innerText(), /Записи — только в этом телефоне[\s\S]*Без копии их не вернуть/);
  assert.doesNotMatch(await text(page, '.screen'), /Локальное хранение|Файл \.json/);
  assert.match(await text(page, '.screen [data-act=export]'), /Создать резервную копию\s+Ещё не сохранялась/);
  await note.click();
  const info = top(page);
  await info.locator('#storage-info').waitFor();
  assert.match(await info.innerText(), /Где хранятся данные[\s\S]*В этом телефоне[\s\S]*По сети не передаются[\s\S]*На сервере в России[\s\S]*Почта, даты входа и число дней в CABINA[\s\S]*приглашения и идеи[\s\S]*Без копии записи не вернуть[\s\S]*удалить приложение[\s\S]*Резервная копия[\s\S]*Чужим не пересылайте/);
  await info.getByRole('button', { name: 'Понятно' }).click();
  await waitNoLayers(page);
  // 320 px и светлая тема
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await fits(page), '320 px без прокрутки вбок');
  const nb = await note.boundingBox();
  assert.ok(nb.height < 100, `плашка компактная: ${nb.height}`);
  await openSettings(page, 'set-look'); // 2.21: тема — в «Оформлении»
  await page.locator('[data-act=theme][data-v=light]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('настройки аккаунта после входа: вместо длинной плашки — строка «Мои данные на сервере», подробности — в её окне', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page);
  await context.route('https://api.cabina-app.ru/rest/v1/rpc/export_my_data', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ivan@example.com', email_confirmed: true, created_on: '2026-10-19', last_seen: '2026-10-20', platform: 'web', app_version: '2.19.3', consents: [] }) }));
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  const acc = page.locator('.screen [data-page=account]');
  assert.match(await acc.innerText(), /Настройки аккаунта[\s\S]*Вы вошли: ivan@example\.com/);
  await acc.click();
  await page.waitForSelector('[data-act=acc-export]');
  const screen = await text(page, '.screen');
  assert.doesNotMatch(screen, /На сервере о вас только/, 'длинной плашки нет');
  assert.match(screen, /ivan@example\.com[\s\S]*Мои данные на сервере\s+Поездок и заработка там нет[\s\S]*Документы[\s\S]*Согласие[\s\S]*Политика/i);
  await page.locator('[data-act=acc-export]').click();
  const s = top(page);
  await s.getByText('Что сервер знает о вас').waitFor();
  assert.match(await s.innerText(), /Почта[\s\S]*Не на сервере:[\s\S]*поездки, заработок, отвлечения/);
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await fits(page));
  assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
  await context.close();
});
