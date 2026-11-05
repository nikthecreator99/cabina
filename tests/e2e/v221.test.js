// Браузерные проверки CABINA 2.21: вид отдыха внизу и обязателен сразу после поездки, окончание выходного руками,
// «Ещё» одним списком с порядком удержанием пальца, Настройки по разделам, Карьера, вещи за приглашения.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// страница запрещает eval (CSP), поэтому каждое чтение — своей функцией
const trips = (page) => page.evaluate(async () => (await import('./js/store.js')).S.trips.map(({ _stats, _statsAt, ...t }) => JSON.parse(JSON.stringify(t))));
const saveProfile = (page, p) => page.evaluate(async (x) => { await (await import('./js/store.js')).saveProfile(x); }, p);
const settingsOf = (page) => page.evaluate(async () => JSON.parse(JSON.stringify((await import('./js/store.js')).S.settings)));
// сервер аккаунтов в тестах недоступен: ответы «нет связи», в консоли это ошибки загрузки — их не считаем
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource|ERR_|503/.test(e));
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function signedSharing(context, page, share = true) {
  await context.route('https://api.cabina-app.ru/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  const exp = Math.floor(Date.parse('2026-10-20T12:00:00+03:00') / 1000) + 30 * 86400;
  const access = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', email: 'ivan@example.com', role: 'authenticated', exp })}.c2ln`;
  await page.evaluate((s) => localStorage.setItem('cabina-account', JSON.stringify(s)), { access, refresh: 'r', exp: exp * 1000, email: 'ivan@example.com', sub: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d' });
  await saveProfile(page, { privacy: { find: false, status: share, depot: false, avatar: false, phone: false } });
}
async function fillTrip(page, st, et) {
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-st').fill(st);
  await f.locator('#tf-et').fill(et);
  return f;
}

test('вид отдыха: кнопки внизу формы, после рабочего времени; обязателен всегда, кнопки пульсируют', async () => {
  const { context, page, errors } = await openApp(env);
  await signedSharing(context, page, true);
  const f = await fillTrip(page, '07:00', '11:00');
  // порядок: сначала расчёт часов, ниже — вид отдыха
  const y = (sel) => f.locator(sel).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  assert.ok(await y('#tf-calc') < await y('#tf-rest'), 'вид отдыха — под рабочим временем');
  assert.ok(await y('[data-act=add-pass]') < await y('#tf-rest'));
  assert.equal(await f.locator('#tf-rest-req').isVisible(), true, '«обязательно» видно');
  assert.match(await text(f, '#tf-rest-why'), /не посчитаются отдых/);
  // пока не выбран — кнопки пульсируют; без выбора не сохраняется, форма открыта
  assert.match(await f.locator('#tf-rest').getAttribute('class'), /rest-pulse/);
  await f.locator('[data-act=save-trip]').click();
  await page.waitForTimeout(300);
  assert.match(await f.locator('#tf-rest-field').getAttribute('class'), /need/);
  assert.equal((await trips(page)).length, 0);
  // выбрали — сохраняется, отдых посчитан под кнопками
  await f.locator('[data-rest=turnaround]').click();
  assert.doesNotMatch(await f.locator('#tf-rest').getAttribute('class'), /rest-pulse/, 'выбрали — пульс выключен');
  assert.match(await text(f, '#tf-rest-calc'), /Отдых в пункте оборота[\s\S]*4 ч/i);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].restType, 'turnaround');
  // вносит поездку позже (закончилась давно) — тоже обязательно (решение Никиты: всегда и у всех)
  const g = await fillTrip(page, '01:00', '05:30');
  await g.locator('#tf-sd').fill('2026-10-12');
  await g.locator('#tf-ed').fill('2026-10-12');
  assert.equal(await g.locator('#tf-rest-req').isVisible(), true);
  assert.match(await g.locator('#tf-rest').getAttribute('class'), /rest-pulse/);
  await g.locator('[data-act=save-trip]').click();
  await page.waitForTimeout(300);
  assert.equal((await trips(page)).length, 1, 'без выбора не сохранилась');
  await g.locator('[data-rest=home]').click();
  await g.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page)).length, 2);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('вид отдыха: обязателен у всех — и без аккаунта, и без статуса для коллег', async () => {
  for (const signed of [false, true]) {
    const { context, page, errors } = await openApp(env);
    if (signed) await signedSharing(context, page, false);
    const f = await fillTrip(page, '07:00', '11:30');
    assert.equal(await f.locator('#tf-rest-req').isVisible(), true);
    assert.match(await f.locator('#tf-rest').getAttribute('class'), /rest-pulse/, 'кнопки пульсируют');
    assert.match(await text(f, '#tf-rest-why'), /не посчитаются отдых, переотдых и его оплата/);
    await f.locator('[data-act=save-trip]').click();
    await page.waitForTimeout(300);
    assert.equal((await trips(page)).length, 0, 'без выбора не сохранилась');
    await f.locator('[data-rest=home]').click();
    await f.locator('[data-act=save-trip]').click();
    await waitNoLayers(page);
    assert.equal((await trips(page))[0].restType, 'home');
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  }
});

test('выходной: нажатием на главной и в профиле можно поправить, когда он заканчивается', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'd1', start: '2026-10-20T01:00', end: '2026-10-20T08:00', routeLabel: 'Сосновка → Ольховка', restType: 'home', homeChoice: 'dayOff', dayOffMin: 3600 }] });
  const banner = page.locator('.rest-banner[data-act=dayoff-edit]');
  assert.match(await banner.innerText(), /На выходном · до 22 окт, 20:00/);
  await banner.click();
  let f = sheet(page);
  assert.match(await f.innerText(), /Окончание выходного[\s\S]*Выходной — 2 сут 12 ч|Окончание выходного[\s\S]*Выходной — 60 ч/);
  assert.equal(await f.locator('#do-d').inputValue(), '2026-10-22');
  assert.equal(await f.locator('#do-t').inputValue(), '20:00');
  // раньше окончания поездки — нельзя
  await f.locator('#do-d').fill('2026-10-20');
  await f.locator('#do-t').fill('07:00');
  await f.locator('[data-act=do-save]').click();
  assert.match(await text(f, '[data-error]'), /после окончания поездки/);
  await f.locator('#do-d').fill('2026-10-21');
  await f.locator('#do-t').fill('18:00');
  await f.locator('[data-act=do-save]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].dayOffMin, 34 * 60);
  assert.match(await page.locator('.rest-banner').innerText(), /На выходном · до завтра, 18:00|На выходном · до 21 окт, 18:00/);
  // профиль: статус «На выходном» — кнопка, открывает то же окно; «Как в настройках» возвращает 60 ч
  await tab(page, 'profile');
  const st = page.locator('#pr-status');
  assert.equal(await st.getAttribute('data-act'), 'dayoff-edit');
  await st.click();
  f = sheet(page);
  await f.locator('[data-act=do-reset]').click();
  assert.equal(await f.locator('#do-t').inputValue(), '20:00');
  await f.locator('[data-act=do-save]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].dayOffMin, 3600);
  // форма поездки длительность не теряет
  await tab(page, 'home');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

async function hold(page, cdp, locator, dy) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await page.waitForTimeout(650);
  const steps = 10;
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps, id: 1 }] }); await page.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
}
const extraKeys = (page) => page.locator('#extra-list > .row').evaluateAll((a) => a.map((b) => b.dataset.key));

test('«Ещё»: все пункты одним списком, порядок меняется удержанием пальца и сохраняется', async () => {
  const { context, page, errors } = await openApp(env);
  const cdp = await context.newCDPSession(page);
  await tab(page, 'extra');
  assert.deepEqual(await extraKeys(page), ['learn', 'notes', 'docs', 'phones', 'fix', 'help', 'ideas']);
  assert.equal(await page.locator('.screen .panel').count(), 1, 'один общий список');
  // «Помощь» — на четыре строки выше (сразу под «Обучением»)
  const help = page.locator('#extra-list > .row[data-key=help]');
  const h = (await help.boundingBox()).height;
  await hold(page, cdp, help, -h * 4.2);
  assert.deepEqual(await extraKeys(page), ['learn', 'help', 'notes', 'docs', 'phones', 'fix', 'ideas']);
  assert.equal(await page.locator('.screen[data-page]').count(), 0, 'отпустили — экран «Помощь» не открылся');
  assert.deepEqual((await settingsOf(page)).extraOrder, ['learn', 'help', 'notes', 'docs', 'phones', 'fix', 'ideas']);
  // после перезапуска — тот же порядок; обычное нажатие по-прежнему открывает пункт
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'extra');
  assert.deepEqual(await extraKeys(page), ['learn', 'help', 'notes', 'docs', 'phones', 'fix', 'ideas']);
  await page.locator('#extra-list > .row[data-key=phones]').click();
  await page.waitForFunction(() => /Телефоны/.test(document.querySelector('.screen').innerText));
  assert.deepEqual(errors, []);
  await context.close();
});

test('Настройки: разделы спрятаны по строкам, внутри — прежние кнопки; аккаунт сверху', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  const rows = await page.locator('#set-list > .row .t1').allInnerTexts();
  assert.deepEqual(rows, ['Оформление', 'Конфиденциальность', 'Данные и резервная копия', 'Календарь и часовой пояс', 'Установка на экран', 'О приложении']);
  assert.equal(await page.locator('#theme-seg').count(), 0, 'тема — внутри «Оформления»');
  await page.locator('#set-look-row').click();
  await page.locator('#theme-seg [data-v=light]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.locator('.screen[data-page=set-look]').count(), 1, 'после выбора темы остаёмся в разделе');
  await page.locator('.screen .page-head [data-act=back]').click();
  assert.match(await text(page, '#set-look-row'), /Светлая тема/);
  await page.locator('#set-privacy-row').click();
  await page.locator('#lock-row').waitFor();
  await page.locator('.screen .page-head [data-act=back]').click();
  await page.locator('#set-data-row').click();
  assert.match(await text(page, '.screen'), /Создать резервную копию[\s\S]*Восстановить из копии/);
  await page.locator('.screen .page-head [data-act=back]').click();
  await page.locator('#set-about-row').click();
  assert.match(await text(page, '.screen'), /Помощь[\s\S]*Что нового[\s\S]*Подсказки[\s\S]*CABINA 2\.\d+\.\d+/);
  for (const w of [320, 390]) { await page.setViewportSize({ width: w, height: 760 }); assert.equal(await fits(page), true); }
  assert.deepEqual(errors, []);
  await context.close();
});

test('Карьера: сверху стаж, потом нынешняя и прошлая работа вместе, должности, вознаграждение', async () => {
  const { context, page, errors } = await openApp(env);
  await saveProfile(page, { career: { hired: '2023-02-10', jobs: [{ id: 'j1', role: 'driver', title: '', from: '2023-02-10' }], past: [{ id: 'p1', place: 'Депо Сосновка', role: 'assistant', title: '', from: '2018-03-01', to: '2019-08-31' }] } });
  await tab(page, 'profile');
  await page.locator('.screen [data-page=profile-edit]').click();
  await page.locator('[data-page=career]').click();
  await page.locator('#cr-sum').waitFor();
  const all = await text(page, '.screen');
  assert.match(all, /Всего на железной дороге\s+5 лет 2 месяца[\s\S]*Непрерывный, на нынешней работе\s+3 года 8 месяцев[\s\S]*Где и когда работали[\s\S]*Нынешняя работа — дата устройства[\s\S]*Раньше[\s\S]*Депо Сосновка[\s\S]*Добавить прошлую работу[\s\S]*Должности[\s\S]*Машинист[\s\S]*Добавить должность[\s\S]*Вознаграждение за преданность[\s\S]*Оклад/i);
  for (const w of [320, 390]) { await page.setViewportSize({ width: w, height: 760 }); assert.equal(await fits(page), true); }
  assert.deepEqual(errors, []);
  await context.close();
});

test('вещи за приглашения: с Премиумом (admin) — тоже только примерка; кнопка «Отправить приглашение»', async () => {
  const { context, page, errors } = await openApp(env);
  const EXP = Math.floor(Date.parse('2026-10-20T12:00:00+03:00') / 1000) + 30 * 86400;
  const SUB = '0d2b6c1e-7a44-4f1b-9c3e-5a6b7c8d9e0f';
  const access = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: SUB, email: 'dev@example.com', role: 'authenticated', exp: EXP })}.c2ln`;
  await context.route('https://api.cabina-app.ru/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/rest/v1/profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role: 'admin' }]) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });
  await page.evaluate((s) => localStorage.setItem('cabina-account', JSON.stringify(s)), { access, refresh: 'r', exp: EXP * 1000, email: 'dev@example.com', sub: SUB });
  await tab(page, 'profile');
  await page.locator('[data-act=av-open]').click();
  await page.waitForFunction(() => !!localStorage.getItem('cabina-premium-dev'));
  await page.locator('[data-act=av-group][data-g=wear]').click();
  const leather = page.locator('[data-k=outfit][data-v=leather]');
  assert.match(await leather.innerText(), /За 3/, 'значок «За 3» виден и с Премиумом');
  await leather.click();
  const note = page.locator('.av-rwnote');
  await note.waitFor();
  assert.match(await note.innerText(), /Только за приглашения\.[\s\S]*Кожанка машиниста — за 3 приглашения, сейчас засчитано 0[\s\S]*Отправить приглашение/);
  assert.match(await text(page, '.av-try'), /Кожанка машиниста/);
  // сохранить нельзя: окно «Пока только примерка», вещь снимается
  await page.locator('[data-act=av-save]').click();
  const dlg = page.locator('.dialog');
  assert.match(await dlg.innerText(), /Пока только примерка/);
  await dlg.locator('[data-act=yes]').click();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.avatar?.outfit === 'vestO');
  // «Отправить приглашение» без согласия новой редакции на сервере → экран приглашений не ломается
  await page.locator('[data-act=av-open]').click();
  await page.locator('[data-act=av-group][data-g=wear]').click();
  await page.locator('[data-k=outfit][data-v=leather]').click();
  for (const w of [320]) { await page.setViewportSize({ width: w, height: 700 }); assert.equal(await fits(page), true); }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('вещи за приглашения: без аккаунта «Отправить приглашение» ведёт на экран с объяснением', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('[data-act=av-open]').click();
  await page.locator('[data-act=av-group][data-g=bg]').click();
  await page.locator('[data-k=bg][data-v=beam]').click();
  await page.locator('.av-rwnote [data-act=av-invite]').click();
  await page.locator('.screen[data-page=invites]').waitFor();
  assert.match(await text(page, '.screen'), /Нужен аккаунт CABINA/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('идея: галочка «Можно ответить мне на почту» — по умолчанию снята; почту администратор видит только у отмеченной', async () => {
  const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW);
  await tab(page, 'extra');
  await page.locator('#extra-ideas').click();
  await page.waitForSelector('#idea-reply');
  assert.equal(await page.locator('#idea-reply').isChecked(), false, 'по умолчанию — без почты');
  assert.match(await text(page, '.screen'), /Можно ответить мне на почту[\s\S]*только у этой идеи/);
  await page.locator('#idea-text').fill('Ответьте мне про виджет');
  await page.locator('label[for=idea-reply]').click();
  await page.locator('#idea-send').click();
  await page.locator('.toast', { hasText: 'Спасибо! Идея отправлена' }).waitFor();
  assert.deepEqual(srv.calls('send_idea')[0].body, { p_body: 'Ответьте мне про виджет', p_reply: true });
  await page.waitForFunction(() => document.querySelectorAll('#idea-list .idea').length === 1);
  assert.match(await text(page, '#idea-list'), /можно ответить на почту/);
  assert.equal(await page.locator('#idea-reply').isChecked(), false, 'после отправки галочка снова снята');
  await page.locator('#idea-text').fill('А эту — без ответа');
  await page.locator('#idea-send').click();
  await page.waitForFunction(() => document.querySelectorAll('#idea-list .idea').length === 2);
  assert.deepEqual(srv.calls('send_idea')[1].body, { p_body: 'А эту — без ответа' });
  assert.equal(await fits(page), true);
  // администратор: почта — только у первой
  srv.db.role = 'admin';
  await page.evaluate(async () => { await (await import('./js/ideas.js')).openAdminIdeas(); });
  const s = sheet(page);
  await s.locator('.idea').first().waitFor();
  const rows = s.locator('.idea');
  assert.equal(await s.locator('.idea-mail').count(), 1);
  assert.match(await s.locator('.idea-mail').innerText(), /Можно ответить: avtor@example\.com/);
  assert.match(await s.innerText(), /Почта автора видна, только если он сам отметил/);
  assert.equal(await rows.count(), 2);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
