// Браузерные проверки CABINA 2.16: «Настройки аккаунта», «Приватность» — кому из коллег что видно,
// окно коллеги «что он видит», поиск без «Другая», «Мои данные на сервере». Сервер подменён (mock-colleagues.js),
// все люди и станции — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, waitNoLayers, seed } from './helpers.js';
import { ME, ANNA, OLEG, ready, openPrivacy, chooseAccess } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast-wrap')?.innerText || ''), re.source);
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`не дождались: ${what}`); };
const privacy = (page) => page.evaluate(async () => (await import('./js/store.js')).S.profile.privacy || {});
const two = {
  consents: [{ document: 'privacy-2', withdrawn_at: null }],
  links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }, { from_id: OLEG, to_id: ME, state: 'accepted' }],
};
const meCard = (db) => { db.cards[ME] = { user_id: ME, name: 'Иван Тестовый', role: 'assistant', depot: null, avatar: null, searchable: false }; };

test('Настройки аккаунта — вверху Настроек; в профиле только поиск и коллеги; в поиске нет «Другая»', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, two, meCard);
  await tab(page, 'profile');
  const sec = page.locator('#col-sec');
  await sec.locator('#col-list').waitFor();
  assert.match(await sec.innerText(), /Коллеги[\s\S]*Найти коллегу[\s\S]*Анна Тестовая[\s\S]*Олег Пробный/i);
  assert.equal(await sec.locator('.switch, [data-act=col-leave]').count(), 0, 'переключателей и «Выйти» в профиле нет');
  assert.equal(await page.locator('.screen [data-page=account]').count(), 0, 'строки аккаунта в профиле нет');
  // Настройки: первая группа — аккаунт
  await page.locator('.screen [data-page=settings]').click();
  const first = page.locator('.screen .group').first();
  assert.match(await first.innerText(), /Аккаунт[\s\S]*Настройки аккаунта[\s\S]*Вы вошли: ivan@example\.com/i);
  await first.locator('[data-page=account]').click();
  const acc = page.locator('.screen');
  await acc.locator('#acc-col').waitFor();
  assert.match(await acc.innerText(), /Настройки аккаунта[\s\S]*Коллеги[\s\S]*Приватность[\s\S]*Выйти из «Коллег»[\s\S]*Мои данные/i);
  // поиск: должность — любая, машинист или помощник
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=back]').click();
  await page.locator('.col-search').click();
  assert.deepEqual(await page.locator('[data-act=col-role]').allInnerTexts(), ['Любая', 'Машинист', 'Помощник']);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('Приватность: статус только выбранным; окно коллеги — включить и выключить для него; «никто» стирает статус', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, two, meCard);
  await openPrivacy(page);
  // «Только выбранные» без единой галочки — подсказка, на сервер ничего
  await page.locator('[data-act=col-access][data-item=status]').click();
  const s = sheet(page);
  assert.match(await s.innerText(), /Кто видит мой статус[\s\S]*Никто[\s\S]*Все коллеги[\s\S]*Только выбранные/);
  assert.ok(await s.locator('#acc-who').isHidden(), 'список коллег — только для «Только выбранные»');
  await s.locator('.radio-row[data-mode=some]').click();
  assert.match(await s.locator('#acc-who').innerText(), /Анна Тестовая[\s\S]*Олег Пробный/);
  await s.locator('[data-act=access-save]').click();
  await s.getByText('Отметьте хотя бы одного коллегу').waitFor();
  assert.equal(srv.calls('set_access').length, 0);
  await s.locator('.pick-row', { hasText: 'Анна' }).click();
  assert.equal(await s.locator('.pick-row', { hasText: 'Анна' }).getAttribute('aria-checked'), 'true');
  await s.locator('[data-act=access-save]').click();
  await toastHas(page, /Сохранено/);
  assert.deepEqual(srv.calls('set_access')[0].body, { p_item: 'status', p_all: false, p_ids: [ANNA] });
  assert.match(await page.locator('#pv-access').innerText(), /Мой статус[\s\S]*Видят: Анна Тестовая/);
  assert.equal((await privacy(page)).status, true);
  await until(() => srv.calls('set_status').length === 1, 'статус ушёл');
  assert.equal(srv.calls('set_status')[0].body.p_place, null, 'станции никому — не уходят');
  // «где я» — только среди тех, кто видит статус
  await page.locator('[data-act=col-access][data-item=place]').click();
  await sheet(page).locator('.radio-row[data-mode=some]').click();
  assert.match(await sheet(page).locator('#acc-who').innerText(), /Анна Тестовая/);
  assert.equal(await sheet(page).locator('.pick-row').count(), 1, 'Олег статус не видит — и «где я» ему не выбрать');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);

  // окно Олега: статус выключен, «где я» недоступно
  await tab(page, 'profile');
  await page.locator(`[data-act=col-open][data-id="${OLEG}"]`).click();
  const w = sheet(page);
  assert.match(await w.innerText(), /Что видит Олег Пробный[\s\S]*Мой статус[\s\S]*Где я[\s\S]*Сначала включите статус/i);
  assert.equal(await w.locator('[data-item=status]').getAttribute('aria-checked'), 'false');
  assert.ok(await w.locator('[data-item=place]').isDisabled());
  await w.locator('[data-item=status]').click();
  await until(() => srv.calls('set_access').length === 2, 'доступ Олегу');
  assert.deepEqual(srv.calls('set_access')[1].body, { p_item: 'status', p_all: false, p_ids: [ANNA, OLEG] });
  await page.waitForFunction(() => document.querySelector('#col-acc [data-item=status]')?.getAttribute('aria-checked') === 'true');
  // и «где я» — одному Олегу
  await w.locator('[data-item=place]').click();
  await until(() => srv.calls('set_access').length === 3, '«где я» Олегу');
  assert.deepEqual(srv.calls('set_access')[2].body, { p_item: 'place', p_all: false, p_ids: [OLEG] });
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // окно Анны: выключить статус — остаётся только Олег
  await page.locator(`[data-act=col-open][data-id="${ANNA}"]`).click();
  assert.equal(await sheet(page).locator('[data-item=status]').getAttribute('aria-checked'), 'true');
  assert.equal(await sheet(page).locator('[data-item=place]').getAttribute('aria-checked'), 'false');
  await sheet(page).locator('[data-item=status]').click();
  await until(() => srv.calls('set_access').length === 4, 'Анне выключили');
  assert.deepEqual(srv.calls('set_access')[3].body, { p_item: 'status', p_all: false, p_ids: [OLEG] });
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // «Все коллеги» без одного: выключить Олегу при «все коллеги» — становится «выбранные» (Анна)
  await openPrivacy(page);
  await chooseAccess(page, 'status', 'all');
  await toastHas(page, /Сохранено/);
  assert.match(await page.locator('#pv-access').innerText(), /Видят: Все коллеги/);
  await tab(page, 'profile');
  await page.locator(`[data-act=col-open][data-id="${OLEG}"]`).click();
  await sheet(page).locator('[data-item=status]').click();
  await until(() => srv.calls('set_access').some((c) => c.body.p_item === 'status' && !c.body.p_all && c.body.p_ids?.length === 1 && c.body.p_ids[0] === ANNA), '«все» без Олега');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // никому — статус стёрт сервером, в телефоне выключено
  await openPrivacy(page);
  await chooseAccess(page, 'status', 'none');
  await toastHas(page, /Сохранено/);
  assert.equal(srv.db.statuses[ME], undefined);
  assert.equal((await privacy(page)).status, false);
  // экран перерисовывается после ответа сервера — ждём, а не читаем один раз
  await page.waitForFunction(() => /Мой статус[\s\S]*Видят: Никто[\s\S]*Где я[\s\S]*Видят: Никто/.test(document.querySelector('#pv-access')?.innerText || ''));
  // «где я» без статуса не выбрать
  await page.locator('[data-act=col-access][data-item=place]').click();
  await toastHas(page, /Сначала выберите, кто видит ваш статус/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('статус включён, а показывать некому (выбрали «никто» на другом устройстве) — выключается и здесь', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, two, meCard);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ privacy: { ...(s.S.profile.privacy || {}), status: true } }); });
  await tab(page, 'profile');
  await page.locator('#col-list').waitFor();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.privacy.status === false);
  assert.equal(srv.calls('set_status').length, 0, 'статус не ушёл');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Мои данные на сервере»: кому что видно — без идентификаторов коллег', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, two, meCard);
  // поверх подменного сервера: ответ выгрузки (последний добавленный обработчик главнее)
  await context.route('https://api.cabina-app.ru/rest/v1/rpc/export_my_data', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ivan@example.com', email_confirmed: true, created_on: '2026-10-19', last_seen: '2026-10-20', platform: 'web', app_version: '2.16.0',
      consents: [{ document: 'privacy-2', given_at: '2026-10-19T10:00:00+00:00', withdrawn_at: null }],
      colleagues_card: { name: 'Иван Тестовый', role: 'assistant', depot: null, avatar: null, searchable: false },
      colleagues_status: null,
      colleagues: [{ with: ANNA, state: 'accepted', offered_by_me: true }, { with: OLEG, state: 'accepted', offered_by_me: false }],
      colleagues_access: [{ item: 'status', to: 'all' }, { item: 'place', to: ANNA }] }) }));
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('[data-act=acc-export]').click();
  const s = sheet(page);
  await s.getByText('Что сервер знает о вас').waitFor();
  const t = await s.innerText();
  assert.match(t, /Иван Тестовый[\s\S]*В поиске[\s\S]*Нет[\s\S]*Статус для коллег[\s\S]*Не хранится[\s\S]*Статус видят[\s\S]*все коллеги[\s\S]*Где вы, видят[\s\S]*1 выбранный коллега[\s\S]*Коллеги[\s\S]*2/i);
  assert.ok(!t.includes(ANNA) && !t.includes(OLEG));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('сервер ещё без шага 3 (миграция 0003): «Коллеги» пишут «не включён», статус не уходит, «Мои данные» открываются', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, two, meCard);
  // так отвечает сервер 2.15: новых таблиц ещё нет (последний добавленный обработчик главнее)
  const json = (status, b) => (route) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const missing = json(404, { code: 'PGRST205', message: 'Could not find the table' });
  await context.route('https://api.cabina-app.ru/rest/v1/status_places**', missing);
  await context.route('https://api.cabina-app.ru/rest/v1/access**', missing);
  await context.route('https://api.cabina-app.ru/rest/v1/rpc/export_my_data', json(200, { email: 'ivan@example.com', email_confirmed: true, created_on: '2026-10-19', last_seen: '2026-10-20', platform: 'web', app_version: '2.15.0',
    consents: [{ document: 'privacy-2', given_at: '2026-10-19T10:00:00+00:00', withdrawn_at: null }],
    colleagues_card: { name: 'Иван Тестовый', role: 'assistant', depot: null, avatar: null, searchable: false },
    colleagues_status: { kind: 'rest', place: 'Ольховка', dest: null, part: null, note: null, until_at: '2026-10-20T11:00:00+00:00', after_kind: 'wait', updated_at: '2026-10-20T08:50:00+00:00', expires_at: '2026-10-22T08:50:00+00:00' },
    colleagues: [{ with: ANNA, state: 'accepted', offered_by_me: true }] }));
  // статус был включён в 2.15
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ privacy: { ...(s.S.profile.privacy || {}), status: true } }); });
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('#col-sec').getByText(/ещё не включён/).waitFor();
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('.screen [data-page=privacy]').click();
  await page.locator('.screen').getByText(/ещё не включён/).first().waitFor();
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=acc-export]').click();
  const s = sheet(page);
  await s.getByText('Что сервер знает о вас').waitFor();
  assert.match(await s.innerText(), /Статус для коллег[\s\S]*На отдыхе[\s\S]*Ольховка/i);
  for (const name of ['set_status', 'set_access', 'clear_status']) assert.equal(srv.calls(name).length, 0, `${name} не вызывался`);
  assert.equal((await privacy(page)).status, true, 'выключатель не тронут: сервер просто ещё не обновлён');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('Приватность и выбор коллег — на 320 px в обеих темах, без горизонтальной прокрутки', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, two, (db) => { meCard(db); db.cards[ANNA].name = 'Анна-Мария Константинопольская-Тестовая'; });
  await page.setViewportSize({ width: 320, height: 700 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async (th) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: th }); }, theme);
    await openPrivacy(page);
    assert.ok(await fits(), `приватность, ${theme}`);
    await page.locator('[data-act=col-access][data-item=status]').click();
    await sheet(page).locator('.radio-row[data-mode=some]').click();
    assert.ok(await fits(), `выбор коллег, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
    await tab(page, 'profile');
    await page.locator(`[data-act=col-open][data-id="${ANNA}"]`).click();
    assert.ok(await fits(), `окно коллеги, ${theme}`);
    const sw = await sheet(page).locator('[data-item=status]').boundingBox();
    assert.ok(sw.x + sw.width <= 320, 'переключатель на экране');
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('2.16.1: на старом адресе (GitHub) — плашка «CABINA переехала»: сохранить копию и открыть cabina-app.ru; на новом её нет', async () => {
  const context = await env.browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', serviceWorkers: 'block', acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem('cabina-tours-off', '1'); } catch {} });
  // старый адрес отдаёт те же файлы, что и наш сервер
  await context.route('https://nikthecreator99.github.io/cabina/**', async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: env.url + u.pathname.replace(/^\/cabina\//, '') + u.search }) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('https://nikthecreator99.github.io/cabina/');
  await page.getByRole('button', { name: 'Начать' }).click();
  await waitNoLayers(page);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await page.reload(); await page.waitForSelector('.screen');
  const nag = page.locator('.move-nag');
  assert.match(await nag.innerText(), /CABINA переехала на cabina-app\.ru[\s\S]*Восстановить из копии/);
  assert.equal(await nag.locator('a').getAttribute('href'), 'https://cabina-app.ru/');
  assert.equal(await page.locator('.nag:not(.move-nag)').count(), 0, 'обычного напоминания о копии рядом нет');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальной прокрутки на 320 px');
  await nag.getByRole('button', { name: 'Сохранить копию' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), sheet(page).getByRole('button', { name: 'Сохранить копию' }).click()]);
  assert.match(dl.suggestedFilename(), /^cabina-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
  // на новом адресе (здесь — локальный сервер) плашки нет
  const fresh = await openApp(env);
  assert.equal(await fresh.page.locator('.move-nag').count(), 0);
  await fresh.context.close();
});

test('2.16.2: права на премиум-персонажа — сразу при запуске с аккаунтом, без захода в «Мой персонаж»', async () => {
  for (const role of ['admin', 'user']) {
    const { context, page, errors } = await openApp(env);
    await ready(context, page, two, meCard);
    // как после переезда на новый адрес: отметки о правах нет, а сохранён премиум-персонаж «Робот»
    await context.route('https://api.cabina-app.ru/rest/v1/profiles**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify([{ role }]) }));
    await page.evaluate(async () => {
      localStorage.removeItem('cabina-premium-dev');
      const s = await import('./js/store.js');
      await s.saveProfile({ avatar: { sex: 'robot', metal: 1, glow: 2 } });
    });
    await page.reload(); await page.waitForSelector('.screen');
    await page.waitForFunction((r) => (localStorage.getItem('cabina-premium-dev') !== null) === (r === 'admin'), role);
    await tab(page, 'profile');
    const shown = await page.locator('.profile-card svg.ava-svg').first().evaluate((el) => el.outerHTML);
    const want = await page.evaluate(async ({ premium, size }) => {
      const A = await import('./js/avatar.js'); const s = await import('./js/store.js');
      const box = document.createElement('div');
      box.innerHTML = A.avatarSvg(A.normalizeAvatar(s.S.profile.avatar, { premium }), { size, cls: 'ava-svg' });
      return box.firstElementChild.outerHTML;
    }, { premium: role === 'admin', size: Number(await page.locator('.profile-card svg.ava-svg').first().getAttribute('width')) });
    const ids = (h) => h.replace(/v\d+_/g, 'v_');
    assert.equal(ids(shown), ids(want), role === 'admin' ? 'у администратора — робот' : 'без прав — человек');
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  }
});
