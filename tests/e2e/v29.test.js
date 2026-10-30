// Браузерные проверки CABINA 2.9: аккаунт. Сервер подменён (настоящие запросы не уходят),
// он отвечает так же, как наш Supabase. Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, NOW, waitNoLayers } from './helpers.js';

const VERSION = (await readFile(new URL('../../js/app.js', import.meta.url), 'utf8')).match(/VERSION = '([\d.]+)'/)[1];

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast-wrap')?.innerText || ''), re.source);
const errBox = (page) => page.locator('#acc-err');
// ответы сервера с кодом 4xx браузер пишет в консоль — это ожидаемо и ошибкой страницы не считается
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.parse(NOW) / 1000) + 30 * 86400;
const jwt = (email) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', email, role: 'authenticated', exp: EXP })}.c2ln`;
const ACCESS = jwt('ivan@example.com');
const authReply = { access_token: ACCESS, refresh_token: 'refresh-secret-1', token_type: 'bearer', expires_in: 3600, expires_at: EXP, user: { email: 'ivan@example.com', email_confirmed_at: '2026-10-19T10:00:00Z' } };

// Подменный сервер аккаунтов: отвечает как GoTrue/PostgREST и записывает всё, что ему прислали
async function mockServer(context, { role = 'user', offline = false } = {}) {
  const log = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
  await context.route('https://api.cabina-app.ru/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (offline) return route.abort('internetdisconnected');
    const url = new URL(req.url());
    const path = url.pathname + url.search;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    const h = req.headers();
    log.push({ path, method: req.method(), body, apikey: h.apikey, auth: h.authorization || null });
    const send = (status, b) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: b === undefined ? '' : JSON.stringify(b) });
    const bearer = h.authorization === `Bearer ${ACCESS}`;
    if (path === '/auth/v1/signup') {
      if (body?.data?.consent !== 'privacy-2') return send(500, { code: 'P0001', message: 'cabina: consent required' });
      if (body.data.invite !== 'GOODCODE01') return send(500, { code: 'P0001', message: 'cabina: invite required' });
      if (String(body.password).length < 10) return send(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 10 characters.' });
      return send(200, { id: 'u1', email: body.email });
    }
    if (path === '/auth/v1/token?grant_type=password') {
      if (body.email === 'new@example.com') return send(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      if (body.email === 'ivan@example.com' && body.password === 'Probnyj-parol-1') return send(200, authReply);
      return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (path === '/auth/v1/token?grant_type=refresh_token') return send(200, authReply);
    if (path === '/auth/v1/logout') return send(204);
    if (path === '/auth/v1/recover' || path === '/auth/v1/resend') return send(200, {});
    if (path === '/auth/v1/verify') {
      if (body?.token === '123456' && ['signup', 'recovery'].includes(body.type)) return send(200, authReply);
      return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    }
    if (path === '/auth/v1/user' && bearer) return send(200, { email: 'ivan@example.com' });
    if (path === '/rest/v1/profiles?select=role' && bearer) return send(200, [{ role }]);
    if (path === '/rest/v1/rpc/touch' && bearer) return send(204);
    // «Коллеги» (2.15–2.16): у этого человека их нет
    if (/^\/rest\/v1\/(consents|links|cards|statuses|status_places|access)\?select=/.test(path) && bearer) return send(200, path.startsWith('/rest/v1/consents') ? [{ document: 'privacy-2', withdrawn_at: null }] : []);
    if (path === '/rest/v1/rpc/export_my_data' && bearer) return send(200, { email: 'ivan@example.com', email_confirmed: true, created_on: '2026-10-19', last_seen: '2026-10-20', platform: 'web', app_version: '2.9.0', consents: [{ document: 'privacy-1', given_at: '2026-10-19T10:00:00+00:00' }] });
    if (path === '/rest/v1/rpc/delete_my_account' && bearer) return send(204);
    if (path === '/rest/v1/rpc/admin_stats' && bearer) {
      if (role !== 'admin') return send(400, { code: '42501', message: 'cabina: forbidden' });
      return send(200, { today: '2026-10-20', total: 2, confirmed: 2, active_1: 1, active_7: 2, active_30: 2, platforms: { web: 2 }, versions: { '2.9.0': 2 }, daily: [{ day: '2026-10-19', signup: 2, confirmed: 2, deleted: null }] });
    }
    if (path === '/rest/v1/rpc/admin_create_invite' && bearer) {
      if (role !== 'admin') return send(400, { code: '42501', message: 'cabina: forbidden' });
      return send(200, '7F3A9C21B4');
    }
    return send(401, { code: '42501', message: 'permission denied' });
  });
  return log;
}

// с 2.16 — Профиль → ⚙ Настройки → «Настройки аккаунта»
async function openAccount(page) {
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('.page-head h1', { hasText: 'Настройки аккаунта' }).waitFor();
}
async function login(page, email = 'ivan@example.com', password = 'Probnyj-parol-1') {
  await page.locator('[data-act=acc-mode][data-mode=login]').first().click();
  await page.locator('#acc-email').fill(email);
  await page.locator('#acc-pass').fill(password);
  await page.locator('#acc-submit').click();
}

test('без аккаунта приложение ничего не отправляет; экран аккаунта объясняет, что хранится, и показывает документы', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context);
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  const row = page.locator('.screen [data-page=account]');
  assert.match(await row.innerText(), /Настройки аккаунта[\s\S]*не обязателен/);
  await row.click();
  assert.match(await page.locator('.screen').innerText(), /Аккаунт не обязателен[\s\S]*только в этом телефоне/);
  await page.locator('[data-act=acc-policy]').first().click();
  const doc = sheet(page);
  assert.match(await doc.innerText(), /Политика обработки персональных данных[\s\S]*Григорьев Никита Сергеевич[\s\S]*ИНН 291802561037[\s\S]*privacy@cabina-app\.ru/);
  await doc.getByRole('button', { name: 'Понятно' }).click();
  await waitNoLayers(page);
  await page.locator('[data-act=acc-consent-doc]').first().click();
  assert.match(await sheet(page).innerText(), /Редакция privacy-2[\s\S]*адрес электронной почты/);
  await sheet(page).getByRole('button', { name: 'Понятно' }).click();
  await waitNoLayers(page);
  // политика доступна и из Настроек; текст о хранении данных честный
  await page.locator('[data-act=back]').click();
  await page.locator('.page-head h1', { hasText: 'Настройки' }).waitFor();
  assert.match(await page.locator('.screen').innerText(), /Записи хранятся только в этом телефоне[\s\S]*Аккаунт — по желанию/);
  await page.locator('[data-act=policy]').click();
  assert.match(await sheet(page).innerText(), /Григорьев Никита Сергеевич/);
  await sheet(page).getByRole('button', { name: 'Понятно' }).click();
  await page.waitForTimeout(200);
  assert.equal(log.length, 0, 'ни одного запроса на сервер');
  assert.deepEqual(errors, []);
  await context.close();
});

test('регистрация: проверки формы, согласие, приглашение; на сервер уходит только почта, пароль, согласие, код, устройство и версия', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context);
  await seed(page, {
    routes: [{ id: 'r1', from: 'Сосновка', to: 'Ольховка' }],
    trips: [{ id: 't1', routeId: 'r1', start: '2026-10-14T08:00', end: '2026-10-14T16:00' }],
  });
  await page.evaluate(async () => (await import('./js/store.js')).saveProfile({ name: 'Иван Тестовый', depot: 'Сосновка-депо' }));
  await openAccount(page);
  await page.locator('[data-act=acc-mode][data-mode=signup]').click();
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /Проверьте адрес почты/);
  await page.locator('#acc-email').fill('ivan@example.com');
  await page.locator('#acc-pass').fill('короткий');
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /не меньше 10 символов/);
  // «Показать пароль»
  await page.locator('#acc-pass').fill('Probnyj-parol-1');
  await page.locator('[data-act=acc-eye]').click();
  assert.equal(await page.locator('#acc-pass').getAttribute('type'), 'text');
  await page.locator('[data-act=acc-eye]').click();
  assert.equal(await page.locator('#acc-pass').getAttribute('type'), 'password');
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /Введите код приглашения/);
  await page.locator('#acc-invite').fill('bad-code');
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /Отметьте согласие/);
  assert.equal(log.length, 0, 'пока форма не заполнена, на сервер ничего не уходит');
  assert.equal(await page.locator('#acc-consent').isChecked(), false, 'согласие не отмечено заранее');
  assert.equal(await page.locator('#acc-policy-ok').isChecked(), false, 'политика не отмечена заранее');
  await page.locator('#acc-consent').check();
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /ознакомились с политикой/);
  assert.equal(log.length, 0, 'без второй галочки на сервер ничего не уходит');
  await page.locator('#acc-policy-ok').check();
  await page.locator('#acc-submit').click();
  await page.waitForFunction(() => /Код приглашения неверный/.test(document.getElementById('acc-err')?.innerText || ''));
  assert.equal(await page.locator('#acc-pass').inputValue(), 'Probnyj-parol-1', 'после ошибки сервера пароль не стирается');
  await page.locator('#acc-invite').fill(' goodcode01 ');
  await page.locator('#acc-submit').click();
  await page.locator('.screen', { hasText: 'Мы отправили код на ivan@example.com' }).waitFor();
  const sent = log.filter((r) => r.path === '/auth/v1/signup');
  assert.equal(sent.length, 2);
  const last = sent.at(-1);
  assert.deepEqual(Object.keys(last.body).sort(), ['data', 'email', 'password']);
  assert.deepEqual(last.body.data, { consent: 'privacy-2', invite: 'GOODCODE01', platform: 'web', version: VERSION });
  assert.equal(last.apikey, (await page.evaluate(async () => (await import('./js/auth.js')).ANON_KEY)));
  assert.equal(last.auth, null);
  const everything = JSON.stringify(log);
  for (const secret of ['Сосновка', 'Ольховка', 'Иван Тестовый', 'Сосновка-депо']) assert.ok(!everything.includes(secret), `«${secret}» не ушло на сервер`);
  // письмо ещё раз
  await page.locator('[data-act=acc-resend]').click();
  await toastHas(page, /Новый код отправлен/);
  assert.deepEqual(log.at(-1), { path: '/auth/v1/resend', method: 'POST', body: { type: 'signup', email: 'ivan@example.com' }, apikey: last.apikey, auth: null });
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-account')), null, 'до подтверждения почты входа нет');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('вход, отметка «заходил сегодня» раз в день, мои данные с сервера, вход не попадает в резервную копию, выход', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context);
  await openAccount(page);
  await login(page, 'ivan@example.com', 'неверный-пароль');
  await page.waitForFunction(() => /Неверная почта или пароль/.test(document.getElementById('acc-err')?.innerText || ''));
  await page.locator('#acc-pass').fill('Probnyj-parol-1');
  await page.locator('#acc-submit').click();
  await toastHas(page, /Вы вошли в аккаунт/);
  assert.match(await page.locator('.screen').innerText(), /ivan@example\.com[\s\S]*Вы вошли в аккаунт CABINA[\s\S]*На сервере о вас только/);
  assert.equal(await page.locator('[data-act=acc-stats]').count(), 0, 'обычный человек статистику не видит');
  assert.equal(await page.locator('[data-act=acc-invite-new]').count(), 0, 'обычный человек приглашения не создаёт');
  // строка в Настройках показывает почту
  await page.locator('[data-act=back]').click();
  assert.match(await page.locator('.screen [data-page=account]').innerText(), /Настройки аккаунта[\s\S]*Вы вошли: ivan@example\.com/);
  // перезапуск: вход сохранился, «заходил сегодня» — один раз в день
  await page.reload(); await page.waitForSelector('.screen');
  await page.waitForFunction(() => !!localStorage.getItem('cabina-account-touch'));
  await page.reload(); await page.waitForSelector('.screen'); await page.waitForTimeout(500);
  const touches = log.filter((r) => r.path === '/rest/v1/rpc/touch');
  assert.equal(touches.length, 1);
  assert.deepEqual(touches[0].body, { p_platform: 'web', p_version: VERSION });
  assert.equal(touches[0].auth, `Bearer ${ACCESS}`);
  // мои данные на сервере: сначала понятный экран, файл — отдельной кнопкой
  await openAccount(page);
  await page.locator('[data-act=acc-export]').click();
  await sheet(page).getByText('Что сервер знает о вас').waitFor();
  const shown = await sheet(page).innerText();
  assert.match(shown, /ivan@example\.com[\s\S]*подтверждена[\s\S]*19 октября 2026[\s\S]*20 октября 2026[\s\S]*Сайт \(браузер\) · CABINA 2\.9\.0/);
  assert.match(shown, /Согласие на обработку персональных данных[\s\S]*редакция 1 · принято 19 октября 2026, 13:00 · прежняя редакция/);
  assert.match(shown, /Вы не включали «Коллеги»/);
  assert.match(shown, /Не на сервере:[\s\S]*поездки, заработок, отвлечения/);
  const [dl] = await Promise.all([page.waitForEvent('download'), sheet(page).locator('[data-act=my-file]').click()]);
  assert.match(dl.suggestedFilename(), /^cabina-account-data-\d{4}-\d{2}-\d{2}\.json$/);
  const dir = await mkdtemp(join(tmpdir(), 'cabina-'));
  await dl.saveAs(join(dir, 'acc.json'));
  const mine = JSON.parse(await readFile(join(dir, 'acc.json'), 'utf8'));
  assert.equal(mine.kind, 'account-data');
  assert.equal(mine.data.email, 'ivan@example.com');
  await sheet(page).getByRole('button', { name: 'Понятно' }).click();
  await waitNoLayers(page);
  // резервная копия приложения не содержит данных входа
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=export]').click();
  const [bk] = await Promise.all([page.waitForEvent('download'), sheet(page).getByRole('button', { name: 'Сохранить копию' }).click()]);
  await bk.saveAs(join(dir, 'bk.json'));
  const backup = await readFile(join(dir, 'bk.json'), 'utf8');
  assert.ok(!backup.includes('refresh-secret-1') && !backup.includes(ACCESS) && !backup.includes('ivan@example.com'), 'данных входа в копии нет');
  // выход
  await waitNoLayers(page);
  await page.locator('.screen [data-page=account]').click();
  await page.locator('[data-act=acc-logout]').click();
  await sheet(page).getByRole('button', { name: 'Выйти' }).click();
  await toastHas(page, /Вы вышли из аккаунта/);
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-account')), null);
  assert.equal(log.at(-1).path, '/auth/v1/logout');
  assert.ok(await page.locator('[data-act=acc-mode][data-mode=signup]').isVisible());
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('почта не подтверждена — экран с письмом; нет связи — понятная ошибка, вход не сохраняется', async () => {
  const one = await openApp(env);
  await mockServer(one.context);
  await openAccount(one.page);
  await login(one.page, 'new@example.com', 'Probnyj-parol-1');
  await one.page.locator('.screen', { hasText: 'Почта ещё не подтверждена' }).waitFor();
  assert.match(await one.page.locator('.screen').innerText(), /Мы отправили код на new@example\.com/);
  assert.deepEqual(realErrors(one.errors), []);
  await one.context.close();

  const two = await openApp(env);
  await mockServer(two.context, { offline: true });
  await openAccount(two.page);
  await login(two.page);
  await two.page.waitForFunction(() => /Нет связи с сервером/.test(document.getElementById('acc-err')?.innerText || ''));
  assert.equal(await two.page.evaluate(() => localStorage.getItem('cabina-account')), null);
  assert.equal(await two.page.locator('#acc-submit').isDisabled(), false, 'кнопку можно нажать ещё раз');
  assert.deepEqual(realErrors(two.errors), []);
  await two.context.close();
});

test('администратор видит статистику (только числа); удаление аккаунта не трогает записи в телефоне', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context, { role: 'admin' });
  await seed(page, { trips: [{ id: 't1', start: '2026-10-14T08:00', end: '2026-10-14T16:00' }] });
  await openAccount(page);
  await login(page);
  await page.locator('[data-act=acc-stats]').waitFor();
  await page.locator('[data-act=acc-stats]').click();
  const st = await sheet(page).innerText();
  assert.match(st, /2\s*аккаунта[\s\S]*подтвердили почту[\s\S]*Сайт[\s\S]*2\.9\.0[\s\S]*19\.10\.2026/);
  assert.doesNotMatch(st, /@/, 'почт в статистике нет');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // приглашение: код показывается один раз, «Скопировать» кладёт готовый текст с адресом и кодом
  await page.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); navigator.share = async (d) => { window.__shared = d; }; });
  await page.locator('[data-act=acc-invite-new]').click();
  await sheet(page).locator('.acc-code').waitFor();
  assert.equal((await sheet(page).locator('.acc-code').innerText()).replace(/\s/g, ''), '7F3A9C21B4');
  assert.match(await sheet(page).innerText(), /14 дней[\s\S]*одного человека/);
  assert.equal(log.filter((r) => r.path === '/rest/v1/rpc/admin_create_invite').length, 1);
  assert.equal(log.find((r) => r.path === '/rest/v1/rpc/admin_create_invite').auth, `Bearer ${ACCESS}`);
  await sheet(page).locator('[data-act=inv-share]').click();
  await page.waitForFunction(() => !!window.__shared);
  assert.match((await page.evaluate(() => window.__shared)).text, /Код приглашения: 7F3A9C21B4/);
  await sheet(page).locator('[data-act=inv-copy]').click();
  await toastHas(page, /Приглашение скопировано/);
  const copied = await page.evaluate(() => window.__copied);
  assert.match(copied, /https:\/\/cabina-app\.ru\/[\s\S]*Код приглашения: 7F3A9C21B4/);
  assert.doesNotMatch(copied, /ivan@example\.com/, 'почты администратора в приглашении нет');
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('7F3A9C21B4'), 'код в телефоне не сохраняется');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // удаление: сначала вопрос, «Отмена» ничего не делает
  await page.locator('[data-act=acc-delete]').click();
  assert.match(await sheet(page).innerText(), /Удалить аккаунт\?[\s\S]*отзыв согласия[\s\S]*Записи в этом телефоне не пострадают/);
  await sheet(page).getByRole('button', { name: 'Отмена' }).click();
  await waitNoLayers(page);
  assert.equal(log.filter((r) => r.path === '/rest/v1/rpc/delete_my_account').length, 0);
  await page.locator('[data-act=acc-delete]').click();
  await sheet(page).getByRole('button', { name: 'Удалить аккаунт' }).click();
  await toastHas(page, /Аккаунт удалён/);
  const del = log.filter((r) => r.path === '/rest/v1/rpc/delete_my_account');
  assert.equal(del.length, 1);
  assert.equal(del[0].auth, `Bearer ${ACCESS}`);
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-account')), null);
  await tab(page, 'home');
  assert.equal(await page.locator('.trip').count(), 1, 'поездка в телефоне на месте');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('код из письма: подтверждение почты и новый пароль, неверный код, шаг помнится после перезапуска', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context);
  await openAccount(page);
  // почта не подтверждена → поле для кода
  await login(page, 'new@example.com', 'Probnyj-parol-1');
  await page.locator('#acc-code').waitFor();
  assert.equal(await page.locator('#acc-code').getAttribute('inputmode'), 'numeric');
  assert.equal(await page.locator('#acc-code').getAttribute('autocomplete'), 'one-time-code');
  const size = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('acc-code')).fontSize));
  assert.ok(size >= 28, `цифры кода крупные (${size}px)`);
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /6 цифр/);
  assert.equal(log.filter((r) => r.path === '/auth/v1/verify').length, 0, 'пустой код на сервер не уходит');
  // перезапуск (например, ушли в почту) — снова поле для кода, та же почта
  await page.reload(); await page.waitForSelector('.screen');
  await openAccount(page);
  await page.locator('#acc-code').waitFor();
  assert.match(await page.locator('.screen').innerText(), /Мы отправили код на new@example\.com/);
  await page.locator('#acc-code').fill('111 111');
  await page.locator('#acc-submit').click();
  await page.waitForFunction(() => /Код неверный или устарел/.test(document.getElementById('acc-err')?.innerText || ''));
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-account')), null);
  await page.locator('#acc-code').fill('123 456');
  await page.locator('#acc-submit').click();
  await toastHas(page, /Почта подтверждена/);
  const v = log.filter((r) => r.path === '/auth/v1/verify').at(-1);
  assert.deepEqual(v.body, { type: 'signup', email: 'new@example.com', token: '123456' });
  assert.ok(await page.evaluate(() => !!localStorage.getItem('cabina-account')));
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-account-pending')), null, 'шаг с кодом забыт');
  await page.locator('[data-act=acc-logout]').click();
  await sheet(page).getByRole('button', { name: 'Выйти' }).click();
  await waitNoLayers(page);
  // забыли пароль → код + новый пароль сразу
  await page.locator('[data-act=acc-mode][data-mode=login]').first().click();
  await page.locator('[data-act=acc-mode][data-mode=reset]').click();
  await page.locator('#acc-email').fill('ivan@example.com');
  await page.locator('#acc-submit').click();
  await page.locator('#acc-code').waitFor();
  assert.deepEqual(log.at(-1).body, { email: 'ivan@example.com' });
  await page.locator('[data-act=acc-resend]').click();
  await toastHas(page, /Новый код отправлен/);
  assert.equal(log.at(-1).path, '/auth/v1/recover', 'новый код для пароля — через восстановление');
  await page.locator('#acc-code').fill('123456');
  await page.locator('#acc-pass').fill('короткий');
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /не меньше 10/);
  await page.locator('#acc-pass').fill('Novyj-parol-12345');
  await page.locator('#acc-submit').click();
  await toastHas(page, /Пароль изменён/);
  assert.deepEqual(log.filter((r) => r.path === '/auth/v1/verify').at(-1).body, { type: 'recovery', email: 'ivan@example.com', token: '123456' });
  const put = log.filter((r) => r.path === '/auth/v1/user').at(-1);
  assert.deepEqual(put.body, { password: 'Novyj-parol-12345' });
  assert.equal(put.auth, `Bearer ${ACCESS}`);
  assert.match(await page.locator('.screen').innerText(), /Вы вошли в аккаунт CABINA/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('ссылки из писем: подтверждение почты входит в аккаунт, сброс пароля, устаревшая ссылка; данные входа убираются из адреса', async () => {
  const { context, page, errors } = await openApp(env);
  const log = await mockServer(context);
  await page.goto(`${env.url}?from=mail#access_token=${ACCESS}&expires_at=${EXP}&expires_in=3600&refresh_token=refresh-secret-1&token_type=bearer&type=signup`);
  await toastHas(page, /Почта подтверждена/);
  assert.ok(!page.url().includes('access_token'), 'данные входа убраны из адресной строки');
  assert.match(await page.locator('.screen').innerText(), /ivan@example\.com[\s\S]*Вы вошли в аккаунт CABINA/);
  // сброс пароля
  await page.goto(`${env.url}?from=mail2#access_token=${ACCESS}&refresh_token=refresh-secret-1&type=recovery`);
  await page.locator('#acc-pass').waitFor();
  assert.ok(!page.url().includes('refresh_token'));
  await page.locator('#acc-pass').fill('коротко');
  await page.locator('#acc-submit').click();
  assert.match(await errBox(page).innerText(), /не меньше 10 символов/);
  await page.locator('#acc-pass').fill('Novyj-parol-12345');
  await page.locator('#acc-submit').click();
  await toastHas(page, /Пароль изменён/);
  const put = log.find((r) => r.path === '/auth/v1/user');
  assert.deepEqual(put.body, { password: 'Novyj-parol-12345' });
  assert.equal(put.method, 'PUT');
  assert.equal(put.auth, `Bearer ${ACCESS}`);
  // устаревшая ссылка
  await page.goto(`${env.url}?from=mail3#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await toastHas(page, /устарела или уже использована/);
  assert.ok(!page.url().includes('error'));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('экраны аккаунта помещаются на 320 px в тёмной и светлой теме', async () => {
  const { context, page, errors } = await openApp(env);
  await mockServer(context);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.reload(); await page.waitForSelector('.screen');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    await openAccount(page);
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(await fits(), `меню, ${theme}`);
    await page.locator('[data-act=acc-mode][data-mode=signup]').click();
    await page.locator('#acc-email').fill('ochen.dlinnyj.adres.pochty.dlya.proverki@example.com');
    await page.locator('#acc-submit').click();
    assert.ok(await fits(), `регистрация с ошибкой, ${theme}`);
    const box = await page.locator('#acc-consent').boundingBox();
    assert.ok(box.width >= 20 && box.height >= 20, 'галочка согласия крупная');
    const box2 = await page.locator('#acc-policy-ok').boundingBox();
    assert.ok(box2.width >= 20 && box2.height >= 20, 'галочка политики крупная');
    await page.locator('[data-act=acc-mode][data-mode=login]').click();
    await page.locator('#acc-email').fill('ivan@example.com');
    await page.locator('#acc-pass').fill('Probnyj-parol-1');
    await page.locator('#acc-submit').click();
    await toastHas(page, /Вы вошли/);
    assert.ok(await fits(), `вошли, ${theme}`);
    await page.locator('[data-act=acc-logout]').click();
    await sheet(page).getByRole('button', { name: 'Выйти' }).click();
    await waitNoLayers(page);
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
