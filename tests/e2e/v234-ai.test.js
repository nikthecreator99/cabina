// Браузерные проверки CABINA 2.34: CABINA AI — плашка в «Ещё» только у администратора, вопрос, ответ с источниками,
// «ответа нет», ошибки сервера, история в телефоне, 320 px с очень крупным текстом в обеих темах. Сервер подменён, тексты выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startEnv, openApp, NOW } from './helpers.js';
import { CONSENT_VERSION } from '../../js/legal.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.parse(NOW) / 1000) + 30 * 86400;
const ACCESS = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', email: 'admin@example.com', role: 'authenticated', exp: EXP })}.c2ln`;
const authReply = { access_token: ACCESS, refresh_token: 'refresh-1', token_type: 'bearer', expires_in: 3600, expires_at: EXP, user: { email: 'admin@example.com', email_confirmed_at: '2026-10-01T10:00:00Z' } };

const ANSWER = {
  answer: 'Ежегодный основной отпуск — 28 календарных дней [1]. Работникам с особым режимом положен дополнительный [2].',
  sources: [
    { n: 1, title: 'Трудовой кодекс РФ', edition: 'ред. 2026', ref: 'статья 115', quote: 'Ежегодный основной оплачиваемый отпуск предоставляется продолжительностью 28 календарных дней.', source: 'https://example.test/tk' },
    { n: 2, title: 'Коллективный договор', edition: '2026–2028', ref: 'пункт 4.2', quote: 'Дополнительный отпуск <b>за</b> особый режим.', source: 'javascript:alert(1)' },
  ],
  left: 9,
};

async function mockServer(context, { role = 'admin', ai = () => [200, ANSWER] } = {}) {
  const log = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  await context.route('https://api.cabina-app.ru/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname + url.search;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    log.push({ path, body, auth: req.headers().authorization });
    const send = (status, b) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: b === undefined ? '' : JSON.stringify(b) });
    const bearer = req.headers().authorization === `Bearer ${ACCESS}`;
    if (path.startsWith('/auth/v1/token')) return send(200, authReply);
    if (path === '/auth/v1/user' && bearer) return send(200, { email: 'admin@example.com' });
    if (path === '/rest/v1/profiles?select=role' && bearer) return send(200, [{ role }]);
    if (/^\/rest\/v1\/consents\?select=/.test(path) && bearer) return send(200, [{ document: CONSENT_VERSION, withdrawn_at: null }]);
    if (/^\/rest\/v1\/\w+\?select=/.test(path) && bearer) return send(200, []);
    if (path === '/ai/v1/ask' && bearer) { const [s, b] = ai(body); return send(s, b); }
    if (path.startsWith('/rest/v1/rpc/') && bearer) return send(200, null);
    return send(401, { code: '42501', message: 'permission denied' });
  });
  return log;
}

async function openAs(opts = {}) {
  const app = await openApp(env);
  const log = await mockServer(app.context, opts);
  if (opts.theme || opts.text) {
    await app.page.evaluate(async ({ theme, text }) => {
      const s = await import('./js/store.js');
      await s.saveSettings({ ...(theme ? { theme } : {}), ...(text ? { textSize: text } : {}) });
      if (text) localStorage.setItem('cabina-text', text);
    }, { theme: opts.theme, text: opts.text });
    await app.page.reload();
    await app.page.waitForSelector('.screen');
  }
  if (opts.login !== false) {
    await app.page.locator('.tab[data-tab=profile]').click();
    await app.page.locator('.screen [data-page=settings]').click();
    await app.page.locator('.screen [data-page=account]').click();
    await app.page.locator('[data-act=acc-mode][data-mode=login]').first().click();
    await app.page.locator('#acc-email').fill('admin@example.com');
    await app.page.locator('#acc-pass').fill('Probnyj-parol-1');
    await app.page.locator('#acc-submit').click();
    await app.page.locator('#acc-email').waitFor({ state: 'detached' });
    await app.page.waitForFunction(() => !!localStorage.getItem('cabina-premium-dev') || window.__noPrem, null, { timeout: 3000 }).catch(() => {});
  }
  await app.page.locator('.tab[data-tab=extra]').click();
  return { ...app, log };
}
const asks = (log) => log.filter((r) => r.path === '/ai/v1/ask');
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('без входа и не администратору — плашки нет, экран закрыт', async () => {
  let { context, page, errors } = await openAs({ login: false });
  assert.equal(await page.locator('#extra-ai').count(), 0);
  await context.close();
  ({ context, page, errors } = await openAs({ role: 'user' }));
  assert.equal(await page.locator('#extra-ai').count(), 0, 'обычный пользователь пока не видит');
  assert.deepEqual(errors, []);
  await context.close();
});

test('администратор: плашка вверху «Ещё», вопрос → ответ с источниками, история в телефоне', async () => {
  const { context, page, errors, log } = await openAs();
  const card = page.locator('#extra-ai');
  await card.waitFor();
  const order = await page.evaluate(() => {
    const a = document.querySelector('#extra-ai'); const l = document.querySelector('#extra-list');
    return !!(a.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.ok(order, 'плашка выше списка');
  const ct = await card.innerText();
  assert.match(ct, /CABINA AI[\s\S]*Спросите по документам[\s\S]*Нейросеть/);
  assert.doesNotMatch(ct, /ПТЭ/);
  assert.ok(await page.locator('#extra-ai .ai-logo').evaluate((i) => i.complete && i.naturalWidth > 0), 'значок загрузился');
  await card.click();
  await page.locator('.screen[data-page=ai] #ai-q').waitFor();
  // короткий вопрос — без сервера
  await page.locator('#ai-q').fill('аб');
  await page.locator('#ai-send').click();
  assert.match(await page.locator('#ai-err').innerText(), /от 3 до 500/);
  assert.equal(asks(log).length, 0);
  await page.locator('#ai-q').fill('Сколько дней отпуска?');
  await page.locator('#ai-send').click();
  await page.locator('#ai-ans .ai-a').waitFor();
  assert.deepEqual(asks(log)[0].body, { q: 'Сколько дней отпуска?' });
  assert.equal(asks(log)[0].auth, `Bearer ${ACCESS}`);
  assert.equal(await page.locator('#ai-err').count(), 0);
  assert.equal(await page.locator('#ai-ans .ai-ref').count(), 2, 'ссылки [1] и [2] — кружки');
  assert.equal(await page.locator('#ai-ans .ai-src').count(), 2);
  assert.match(await page.locator('#ai-ans').innerText(), /Справочная информация, не юридическая консультация/);
  assert.match(await page.locator('#ai-left').innerText(), /9/);
  // источник раскрывается; плохая ссылка не выводится, html — текстом
  await page.locator('#ai-ans .ai-src summary').nth(1).click();
  assert.match(await page.locator('#ai-ans .ai-quote').nth(1).innerText(), /<b>за<\/b>/);
  assert.equal(await page.locator('#ai-ans .ai-src').nth(1).locator('a').count(), 0, 'javascript: не ссылка');
  assert.equal(await page.locator('#ai-ans .ai-src').nth(0).locator('a[href="https://example.test/tk"][rel~=noopener]').count(), 1);
  // история: второй вопрос — первый уходит в «Раньше спрашивали»
  await page.locator('#ai-q').fill('Отдых после ночи');
  await page.keyboard.press('Enter');
  await page.locator('#ai-ans .ai-q-echo', { hasText: 'Отдых после ночи' }).waitFor();
  assert.equal(await page.locator('#ai-hist .ai-h').count(), 1);
  assert.match(await page.locator('#ai-hist').innerText(), /Сколько дней отпуска\?/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cabina-ai-history')));
  assert.equal(stored.length, 2);
  assert.ok(await noOverflow(page));
  if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/ai-otvet.png`, fullPage: true }); }
  await page.locator('#ai-clear').click();
  assert.equal(await page.locator('#ai-hist').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-ai-history')), '[]');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«ответа нет», ответ без источников, лимит и нет связи — понятные тексты', async () => {
  let n = 0;
  const replies = [
    [200, { answer: null, sources: [], left: 5 }],
    [200, { answer: 'Выдуманный ответ [1].', sources: [] }],
    [429, { error: 'limit' }],
    [503, { error: 'busy' }],
    [500, {}],
  ];
  const { context, page, errors } = await openAs({ ai: () => replies[n++] });
  await page.locator('#extra-ai').click();
  const ask = async (q) => { await page.locator('#ai-q').fill(q); await page.locator('#ai-send').click(); await page.waitForFunction(() => !document.querySelector('#ai-send[disabled]')); };
  await ask('Какая погода завтра?');
  assert.match(await page.locator('#ai-ans').innerText(), /В загруженных документах ответа на этот вопрос нет/);
  await ask('Сколько платят за ночь?');
  assert.match(await page.locator('#ai-ans').innerText(), /ответа на этот вопрос нет/, 'ответ без источника не показываем');
  await ask('Ещё один вопрос');
  assert.match(await page.locator('#ai-err').innerText(), /вопросы закончились/);
  await ask('Ещё один вопрос');
  assert.match(await page.locator('#ai-err').innerText(), /очень много вопросов/);
  await ask('Ещё один вопрос');
  assert.match(await page.locator('#ai-err').innerText(), /не может ответить/);
  assert.equal(await page.locator('#ai-q').inputValue(), 'Ещё один вопрос', 'при ошибке вопрос не теряется');
  assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), [], 'кроме ответов 429/503/500, которые мы сами подали');
  await context.close();
});

for (const theme of ['dark', 'light']) {
  test(`320 px, очень крупный текст, ${theme === 'dark' ? 'тёмная' : 'светлая'} тема — ничего не вылезает`, async () => {
    const { context, page, errors } = await openAs({ theme, text: 'xl' });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('#extra-ai').waitFor();
    assert.ok(await noOverflow(page), 'плашка');
    const box = await page.locator('#extra-ai').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-plashka-${theme}.png` });
    await page.locator('#extra-ai').click();
    await page.locator('#ai-q').fill('Сколько дней отпуска?');
    await page.locator('#ai-send').click();
    await page.locator('#ai-ans .ai-a').waitFor();
    await page.locator('#ai-ans .ai-src summary').first().click();
    assert.ok(await noOverflow(page), 'экран ответа');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-ekran-${theme}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('выход из аккаунта стирает историю вопросов', async () => {
  const { context, page } = await openAs();
  await page.locator('#extra-ai').click();
  await page.locator('#ai-q').fill('Сколько дней отпуска?');
  await page.locator('#ai-send').click();
  await page.locator('#ai-ans .ai-a').waitFor();
  assert.ok(await page.evaluate(() => localStorage.getItem('cabina-ai-history')));
  await page.evaluate(async () => { const a = await import('./js/auth.js'); await a.signOut?.(); });
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-ai-history')), null);
  await context.close();
});
