// Браузерные проверки CABINA 2.15: «Коллеги». Сервер подменён (настоящие запросы не уходят) и ведёт себя
// как наш Supabase с миграциями 0002–0003: согласия, карточки, предложения, статус. Все люди и станции — выдуманные.
// С 2.16 переключатели — на экране «Приватность» (Настройки → «Настройки аккаунта»), см. также v216.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, waitNoLayers } from './helpers.js';
import { ME, ANNA, OLEG, mockServer, setProfile, ready, openPrivacy, chooseAccess } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast-wrap')?.innerText || ''), re.source);
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`не дождались: ${what}`); };

test('коллеги: новая редакция согласия, поиск, предложение; на сервер — только карточка без телефона', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page);
  await tab(page, 'profile');
  const sec = page.locator('#col-sec');
  await sec.getByText('Новая редакция согласия').waitFor();
  assert.equal(srv.calls('give_consent').length, 0, 'без человека согласие не даётся');
  await page.locator('[data-act=col-consent]').click();
  assert.match(await sheet(page).innerText(), /Редакция privacy-2[\s\S]*Коллеги/);
  await sheet(page).locator('[data-act=col-agree-ok]').click();
  await sheet(page).getByText('Отметьте галочку').waitFor();
  assert.equal(srv.calls('give_consent').length, 0, 'галочка не отмечена — ничего не ушло');
  await sheet(page).locator('#col-agree').check();
  await sheet(page).locator('[data-act=col-agree-ok]').click();
  await toastHas(page, /Согласие принято/);
  assert.deepEqual(srv.calls('give_consent')[0].body, { p_document: 'privacy-2' });
  await page.locator('.col-search').waitFor();
  assert.match(await sec.innerText(), /Пока никого/);
  assert.equal(await sec.locator('.switch').count(), 0, 'переключателей в профиле нет — они в «Приватности»');
  assert.equal(srv.calls('save_card').length + srv.calls('set_status').length, 0, 'пока ничего не включено, карточка и статус не уходят');

  // поиск
  await page.locator('.col-search').click();
  await page.locator('#col-form').waitFor();
  await page.locator('#col-name').fill('ан');
  await page.locator('#col-submit').click();
  await page.locator('#col-err').getByText('не меньше 3 букв').waitFor();
  assert.equal(srv.calls('find_colleagues').length, 0, 'короткое имя на сервер не уходит');
  await page.locator('#col-name').fill('анна');
  await page.locator('[data-act=col-role][data-role=driver]').click();
  await page.locator('#col-submit').click();
  await page.locator('#col-results').getByText('Никого не нашли').waitFor();
  assert.deepEqual(srv.calls('find_colleagues').at(-1).body, { p_name: 'анна', p_depot: null, p_role: 'driver' });
  await page.locator('[data-act=col-role][data-role=""]').click();
  await page.locator('#col-submit').click();
  const found = page.locator('#col-found');
  await found.getByText('Анна Тестовая').waitFor();
  assert.match(await found.innerText(), /Анна Тестовая[\s\S]*депо Сосновка/);
  // предложение
  await found.locator('[data-act=col-offer]').click();
  assert.match(await sheet(page).innerText(), /Предложить стать коллегами\?[\s\S]*Анна Тестовая получит предложение/);
  await sheet(page).getByRole('button', { name: 'Предложить' }).click();
  await toastHas(page, /Предложение отправлено/);
  await found.getByText('Ждёт ответа').waitFor();
  const card = srv.calls('save_card')[0].body;
  assert.deepEqual(card, { p_name: 'Иван Тестовый', p_role: 'assistant', p_depot: null, p_avatar: null, p_searchable: false }, 'депо и персонаж не разрешены — не уходят');
  assert.deepEqual(srv.calls('offer_colleague')[0].body, { p_to: ANNA });
  const everything = JSON.stringify(srv.log);
  for (const secret of ['900', '111-22', '355', '2ЭС5К', '2402', 'Сосновка-депо']) assert.ok(!everything.includes(secret), `«${secret}» не ушло на сервер`);
  await page.locator('[data-act=back]').click();
  await page.locator('#col-sec').getByText('Ждут ответа').waitFor();
  // отменить своё предложение
  await page.locator('[data-act=col-cancel]').click();
  await toastHas(page, /Предложение отменено/);
  assert.deepEqual(srv.calls('drop_colleague')[0].body, { p_other: ANNA });
  await page.locator('#col-sec').getByText('Пока никого').waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('коллеги: статус видит только коллега, без точного времени; выключил — стёрся; удалить из коллег', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, {
    consents: [{ document: 'privacy-2', withdrawn_at: null }],
    links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }],
    statuses: { [ANNA]: { kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning', until_at: null, after_kind: null, updated_at: '2026-10-20T06:10:00Z' } },
  }, (db) => { db.cards[ME] = { user_id: ME, name: 'Иван Тестовый', role: 'assistant', depot: null, avatar: null, searchable: false }; });
  await tab(page, 'profile');
  const list = page.locator('#col-list');
  await list.getByText('Анна Тестовая').waitFor();
  assert.match(await list.innerText(), /Анна Тестовая[\s\S]*В пути[\s\S]*Сосновка → Ольховка · с утра[\s\S]*обновлено в 09:10/);
  assert.equal(srv.calls('set_status').length, 0, 'статус выключен — не уходит');
  // показать статус всем коллегам: станции — пока никому
  await openPrivacy(page);
  assert.match(await page.locator('#pv-access').innerText(), /Мой статус[\s\S]*Видят: Никто[\s\S]*Где я[\s\S]*Видят: Никто/);
  await chooseAccess(page, 'status', 'all');
  await toastHas(page, /Сохранено/);
  assert.deepEqual(srv.calls('set_access')[0].body, { p_item: 'status', p_all: true, p_ids: null });
  await until(() => srv.calls('set_status').length === 1, 'статус ушёл');
  assert.deepEqual(srv.calls('set_status')[0].body, { p_kind: 'rest', p_place: null, p_dest: null, p_part: null, p_note: null, p_until: '2026-10-20T11:00:00.000Z' }, '«где я» никому — станции не уходят');
  await page.locator('.pv-preview').getByText('На отдыхе').waitFor();
  assert.doesNotMatch(await page.locator('.pv-preview').innerText(), /Ольховка/);
  // и где я — тоже всем
  await chooseAccess(page, 'place', 'all');
  await until(() => srv.calls('set_status').length === 2, 'статус со станцией ушёл');
  assert.equal(srv.calls('set_status')[1].body.p_place, 'Ольховка');
  assert.match(await page.locator('.pv-preview').innerText(), /Так вас видят:[\s\S]*На отдыхе[\s\S]*Ольховка · до 14:00/);
  // перерисовка без изменений статус повторно не шлёт
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('#col-list').waitFor();
  await page.waitForTimeout(400);
  assert.equal(srv.calls('set_status').length, 2, 'тот же статус второй раз не отправляется');
  // никому — статус стёрт сервером сразу
  await openPrivacy(page);
  await chooseAccess(page, 'status', 'none');
  await toastHas(page, /Сохранено/);
  assert.deepEqual(srv.calls('set_access').at(-1).body, { p_item: 'status', p_all: false, p_ids: null });
  assert.equal(srv.db.statuses[ME], undefined, 'статус стёрт с сервера');
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.profile.privacy.status), false);
  assert.match(await page.locator('#pv-access').innerText(), /Мой статус[\s\S]*Видят: Никто/);
  // окно коллеги и «Удалить из коллег»
  await tab(page, 'profile');
  await page.locator('[data-act=col-open]').click();
  const s = sheet(page);
  assert.match(await s.innerText(), /Анна Тестовая[\s\S]*В пути[\s\S]*обновлено в 09:10[\s\S]*номер поезда/i);
  await s.locator('[data-act=col-drop]').click();
  assert.match(await sheet(page).innerText(), /Удалить из коллег\?[\s\S]*30 дней/);
  await sheet(page).getByRole('button', { name: 'Удалить' }).click();
  await toastHas(page, /Удалён из коллег/);
  await waitNoLayers(page);
  assert.deepEqual(srv.calls('drop_colleague').at(-1).body, { p_other: ANNA });
  await page.locator('#col-sec').getByText('Пока никого').waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('коллеги: предложение мне — принять или отклонить; чужое имя — только текст', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, {
    consents: [{ document: 'privacy-2', withdrawn_at: null }],
    links: [{ from_id: OLEG, to_id: ME, state: 'pending' }, { from_id: ANNA, to_id: ME, state: 'pending' }],
  }, (db) => { db.cards[ANNA].name = '<img src=x onerror="window.__xss=1">Анна'; });
  await tab(page, 'profile');
  const offers = page.locator('.col-offers');
  await offers.getByText('Олег Пробный').waitFor();
  assert.match(await offers.innerText(), /<img src=x onerror="window.__xss=1">Анна/, 'разметка показана как текст');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await offers.locator('img').count(), 0);
  // Олег — принять (карточка нужна: без неё сервер не примет)
  await offers.locator(`[data-act=col-accept][data-id="${OLEG}"]`).click();
  await toastHas(page, /Теперь вы коллеги/);
  assert.equal(srv.calls('save_card').length, 1);
  assert.deepEqual(srv.calls('answer_colleague')[0].body, { p_from: OLEG, p_accept: true });
  await page.locator('#col-list').getByText('Олег Пробный').waitFor();
  assert.match(await page.locator('#col-list').innerText(), /Статус не показан/);
  // Анна — отклонить
  await page.locator(`.col-offers [data-act=col-decline][data-id="${ANNA}"]`).click();
  assert.match(await sheet(page).innerText(), /Отклонить предложение\?[\s\S]*30 дней/);
  await sheet(page).getByRole('button', { name: 'Отклонить' }).click();
  await toastHas(page, /Предложение отклонено/);
  assert.deepEqual(srv.calls('drop_colleague')[0].body, { p_other: ANNA });
  await page.waitForFunction(() => !document.querySelector('.col-offers'));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Меня можно найти»: отдельное согласие на распространение, выключил — отозвано; «Выйти из „Коллег“»', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { consents: [{ document: 'privacy-2', withdrawn_at: null }] });
  await openPrivacy(page);
  await page.locator('#pv-card [data-k=find]').click();
  const s = sheet(page);
  assert.match(await s.innerText(), /Меня можно найти[\s\S]*увидят: имя, должность[\s\S]*Редакция publish-1[\s\S]*распространение/);
  assert.doesNotMatch(await s.innerText(), /увидят:[^.]*депо/, 'депо не разрешено — в поиске его нет');
  await s.locator('[data-act=col-agree-ok]').click();
  await s.getByText('Отметьте галочку').waitFor();
  await s.locator('#col-agree').check();
  await s.locator('[data-act=col-agree-ok]').click();
  await toastHas(page, /Теперь вас можно найти по имени/);
  assert.deepEqual(srv.calls('give_consent').map((r) => r.body.p_document), ['publish-1']);
  assert.equal(srv.calls('save_card').at(-1).body.p_searchable, true);
  assert.equal(await page.locator('#pv-card [data-k=find]').getAttribute('aria-checked'), 'true');
  assert.match(await page.locator('#pv-card').innerText(), /вас найдут по имени «Иван Тестовый»/);
  // разрешили депо — карточка обновилась
  await page.locator('#pv-card [data-k=depot]').click();
  await until(() => srv.calls('save_card').at(-1).body.p_depot === 'Сосновка-депо', 'депо ушло в карточку');
  // выключить «Меня можно найти»
  await page.locator('#pv-card [data-k=find]').click();
  await toastHas(page, /Вас больше нет в поиске/);
  assert.equal(srv.calls('save_card').at(-1).body.p_searchable, false);
  assert.ok(srv.db.consents.find((c) => c.document === 'publish-1').withdrawn_at, 'согласие на распространение отозвано');
  // выйти из «Коллег» — в Настройках аккаунта
  await page.locator('[data-act=back]').click();
  await page.locator('.page-head h1', { hasText: 'Настройки аккаунта' }).waitFor();
  await page.locator('[data-act=col-leave]').click();
  assert.match(await sheet(page).innerText(), /Выйти из «Коллег»\?[\s\S]*сотрутся/);
  await sheet(page).getByRole('button', { name: 'Выйти' }).click();
  await toastHas(page, /Данные «Коллег» стёрты с сервера/);
  assert.equal(srv.calls('leave_colleagues').length, 1);
  assert.equal(srv.db.cards[ME], undefined);
  const pv = await page.evaluate(async () => (await import('./js/store.js')).S.profile.privacy);
  assert.equal(pv.find, false); assert.equal(pv.status, false);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('без аккаунта раздела нет и на сервер ничего не уходит; «Меня можно найти» просит аккаунт', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await mockServer(context);
  await setProfile(page, { name: 'Иван Тестовый' });
  await tab(page, 'profile');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#col-sec').count(), 0);
  assert.equal(await page.locator('.screen [data-page=account]').count(), 0, 'строки аккаунта в профиле больше нет');
  await page.locator('[data-page=profile-edit]').click();
  assert.equal(await page.locator('#pr-privacy').count(), 0, 'приватность — не в профиле, а в настройках аккаунта');
  await page.locator('[data-act=back]').click();
  await page.locator('.screen [data-page=settings]').click();
  const row = page.locator('.screen [data-page=account]');
  assert.match(await row.innerText(), /Настройки аккаунта[\s\S]*не обязателен/);
  await row.click();
  await page.locator('.page-head h1', { hasText: 'Настройки аккаунта' }).waitFor();
  assert.equal(await page.locator('[data-page=privacy]').count(), 0, 'без входа «Приватности» нет');
  assert.equal(srv.log.length, 0, 'ни одного запроса');
  assert.deepEqual(errors, []);
  await context.close();
});

test('выход из аккаунта стирает статус с сервера; должность «Другая»', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, {
    consents: [{ document: 'privacy-2', withdrawn_at: null }],
    links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }],
  });
  await tab(page, 'profile');
  await page.locator('[data-page=profile-edit]').click();
  await page.locator('[data-act=pr-role][data-role=other]').click();
  await page.locator('[data-act=pr-role][data-role=other][aria-pressed=true]').waitFor();
  await page.locator('[data-act=back]').click();
  assert.doesNotMatch(await page.locator('.profile-card').innerText(), /undefined/);
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('[data-act=acc-logout]').click();
  await sheet(page).getByRole('button', { name: 'Выйти' }).click();
  await toastHas(page, /Вы вышли из аккаунта/);
  const paths = srv.log.map((r) => r.path);
  assert.ok(paths.indexOf('/rest/v1/rpc/clear_status') >= 0 && paths.indexOf('/rest/v1/rpc/clear_status') < paths.lastIndexOf('/auth/v1/logout'), 'статус стёрт до выхода');
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-colleagues')), null, 'в телефоне ничего о коллегах не осталось');
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=back]').click();
  assert.equal(await page.locator('#col-sec').count(), 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('экраны «Коллег» помещаются на 320 px в тёмной и светлой теме', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, {
    consents: [{ document: 'privacy-2', withdrawn_at: null }],
    links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }, { from_id: OLEG, to_id: ME, state: 'pending' }],
    statuses: { [ANNA]: { kind: 'trip', place: 'Очень длинное название станции', dest: 'Ещё более длинное название станции', part: 'evening', updated_at: '2026-10-20T06:10:00Z' } },
  }, (db) => { db.cards[ANNA].name = 'Анна-Мария Константинопольская-Тестовая'; });
  await page.setViewportSize({ width: 320, height: 700 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.reload(); await page.waitForSelector('.screen');
    await tab(page, 'profile');
    await page.locator('#col-list').waitFor();
    assert.ok(await fits(), `профиль с коллегами, ${theme}`);
    const btn = await page.locator('.col-offers [data-act=col-accept]').boundingBox();
    assert.ok(btn.height >= 44, 'кнопки крупные');
    await page.locator('[data-act=col-open]').click();
    assert.ok(await fits(), `окно коллеги, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
    await page.locator('.col-search').click();
    await page.locator('#col-name').fill('Анна');
    await page.locator('#col-submit').click();
    await page.locator('#col-found').waitFor();
    assert.ok(await fits(), `поиск с результатами, ${theme}`);
    await page.locator('[data-act=back]').click();
    await openPrivacy(page);
    assert.ok(await fits(), `приватность, ${theme}`);
    await page.locator('[data-act=col-access][data-item=status]').click();
    await sheet(page).locator('.radio-row[data-mode=some]').click();
    assert.ok(await fits(), `выбор коллег, ${theme}`);
    const pick = await sheet(page).locator('.pick-row').first().boundingBox();
    assert.ok(pick.height >= 44 && pick.width <= 320, 'строки выбора крупные и помещаются');
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
