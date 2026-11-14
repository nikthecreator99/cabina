// Браузерные проверки CABINA 2.32.2: «Статистика роста» для администратора — периоды, сравнение, графики, PDF,
// старый сервер без шага 14, 320 px с очень крупным текстом в обеих темах. Сервер подменён, все числа выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { startEnv, openApp, NOW, waitNoLayers } from './helpers.js';
import { CONSENT_VERSION } from '../../js/legal.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.parse(NOW) / 1000) + 30 * 86400;
const ACCESS = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', email: 'admin@example.com', role: 'authenticated', exp: EXP })}.c2ln`;
const authReply = { access_token: ACCESS, refresh_token: 'refresh-1', token_type: 'bearer', expires_in: 3600, expires_at: EXP, user: { email: 'admin@example.com', email_confirmed_at: '2026-10-01T10:00:00Z' } };

// Ответ admin_growth: числа зависят от периода, чтобы видно было, что экран их меняет
function growthReply(a) {
  const days = [];
  const from = a.p_from || '2026-09-03';
  for (let t = Date.parse(`${from}T00:00Z`); t <= Date.parse(`${a.p_to}T00:00Z`); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const k = +d.slice(8, 10);
    days.push({ d, signup: k % 3 === 0 ? 2 : undefined, joined: k % 3 === 0 ? 2 : undefined, active: d >= '2026-10-05' ? 3 + (k % 4) : undefined, invited: k === 12 ? 1 : undefined });
  }
  for (let t = a.p_prev_from ? Date.parse(`${a.p_prev_from}T00:00Z`) : 0; a.p_prev_from && t <= Date.parse(`${a.p_prev_to}T00:00Z`); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (+d.slice(8, 10) % 5 === 0) days.push({ d, signup: 1, joined: 1 });
  }
  const sum = (f, t, signup) => ({ from: f, to: t, signup, confirmed: signup - 1, deleted: 1, invited: 2, invited_admin: 3, groups: 1, active_sum: 60, active_days: 15,
    cohort: { n: signup, age7: signup - 2, back7: Math.floor((signup - 2) / 2), age30: 4, back30: 1 } });
  return {
    today: '2026-10-20', first_day: '2026-09-03', active_since: '2026-10-05', base: 9,
    cur: sum(a.p_from || '2026-09-03', a.p_to, 14),
    prev: a.p_prev_from ? { ...sum(a.p_prev_from, a.p_prev_to, 8), deleted: 0, active_sum: 0, active_days: 0 } : null,
    days,
    now: { total: 23, confirmed: 21, active_1: 6, active_7: 15, active_30: 20, colleagues: 12, findable: 7, links: 9, status: 5, place: 3, hours: 2, notes: 4, groups: 3, in_groups: 10, group_status: 6,
      platforms: { web: 15, android: 8 }, versions: { '2.32.1': 17, '2.31.0': 6 } },
    email: 'leak@example.com', // лишнее с сервера экран не показывает (cleanGrowth)
  };
}

async function mockServer(context, { oldServer = false } = {}) {
  const log = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  await context.route('https://api.cabina-app.ru/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname + url.search;
    let body = null;
    try { body = req.postDataJSON(); } catch {}
    log.push({ path, body });
    const send = (status, b) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: b === undefined ? '' : JSON.stringify(b) });
    const bearer = req.headers().authorization === `Bearer ${ACCESS}`;
    if (path === '/auth/v1/token?grant_type=password') return send(200, authReply);
    if (path === '/auth/v1/token?grant_type=refresh_token') return send(200, authReply);
    if (path === '/auth/v1/user' && bearer) return send(200, { email: 'admin@example.com' });
    if (path === '/rest/v1/profiles?select=role' && bearer) return send(200, [{ role: 'admin' }]);
    if (path === '/rest/v1/rpc/touch' && bearer) return send(204);
    if (/^\/rest\/v1\/consents\?select=/.test(path) && bearer) return send(200, [{ document: CONSENT_VERSION, withdrawn_at: null }]);
    if (/^\/rest\/v1\/\w+\?select=/.test(path) && bearer) return send(200, []);
    if (path === '/rest/v1/rpc/admin_growth' && bearer) {
      if (oldServer) return send(404, { code: 'PGRST202', message: 'Could not find the function public.admin_growth' });
      return send(200, growthReply(body));
    }
    if (path === '/rest/v1/rpc/admin_stats' && bearer) return send(200, { today: '2026-10-20', total: 2, confirmed: 2, active_1: 1, active_7: 2, active_30: 2, platforms: { web: 2 }, versions: { '2.31.0': 2 }, daily: [] });
    if (path.startsWith('/rest/v1/rpc/') && bearer) return send(200, null);
    return send(401, { code: '42501', message: 'permission denied' });
  });
  return log;
}

async function openAdmin(env, opts = {}) {
  const app = await openApp(env, opts);
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
  await app.page.locator('.tab[data-tab=profile]').click();
  await app.page.locator('.screen [data-page=settings]').click();
  await app.page.locator('.screen [data-page=account]').click();
  await app.page.locator('[data-act=acc-mode][data-mode=login]').first().click();
  await app.page.locator('#acc-email').fill('admin@example.com');
  await app.page.locator('#acc-pass').fill('Probnyj-parol-1');
  await app.page.locator('#acc-submit').click();
  await app.page.locator('[data-act=acc-stats]').waitFor();
  return { ...app, log };
}
const calls = (log) => log.filter((r) => r.path === '/rest/v1/rpc/admin_growth').map((r) => r.body);
const waitLoaded = (page) => page.waitForFunction(() => document.querySelector('.screen[data-page=growth]') && !document.querySelector('.gr-loading'));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('администратор: месяц со сравнением, графики, «остаются», чем пользуются; только числа', async () => {
  const { context, page, errors, log } = await openAdmin(env);
  await page.locator('[data-act=acc-stats]').click();
  await page.locator('.page-head h1', { hasText: 'Статистика роста' }).waitFor();
  await waitLoaded(page);
  assert.deepEqual(calls(log)[0], { p_from: '2026-10-01', p_to: '2026-10-20', p_prev_from: '2026-09-01', p_prev_to: '2026-09-20' }, 'идущий месяц — с теми же днями прошлого');
  assert.equal(calls(log).length, 1, 'первый экран — без второго запроса');
  const scr = page.locator('.screen');
  const all = await scr.innerText();
  assert.match(all, /Октябрь 2026/);
  assert.match(all, /1–20 октября 2026[\s\S]*Сравнение: 1–20 сентября — столько же дней от начала/);
  assert.match(await page.locator('.gr-hero').innerText(), /23\s*аккаунта сейчас[\s\S]*6\s*сегодня[\s\S]*15\s*за 7 дней/);
  const signup = page.locator('.gr-tile[data-k=signup]');
  assert.match(await signup.innerText(), /14[\s\S]*Регистраций[\s\S]*▲ \+6 · \+75%[\s\S]*было 8/);
  assert.equal(await signup.locator('.gr-d.good').count(), 1);
  assert.equal(await page.locator('.gr-tile[data-k=deleted] .gr-d.bad').count(), 1, 'удалений больше — красным');
  assert.match(await page.locator('.gr-tile[data-k=active]').innerText(), /^4\s/, 'заходят в день: 60 / 15');
  assert.equal(await page.locator('.gr-tile[data-k=active] .gr-d').count(), 0, 'в прошлом периоде заходы ещё не считались — не сравниваем');
  // графики: 20 дней месяца, прошлый период пунктиром, подсказка по нажатию
  assert.equal(await page.locator('#gr-ch-signup .bar-g').count(), 20);
  assert.ok(await page.locator('#gr-ch-signup .gr-bar').count() >= 6);
  assert.equal(await page.locator('#gr-ch-signup .gr-prev').count(), 1);
  assert.equal(await page.locator('#gr-ch-active .gr-line').count(), 1);
  assert.match(all, /Заходы по дням сервер считает с 5 октября 2026/);
  await page.locator('#gr-ch-signup .bar-g[data-bar="2"] .bar-hit').click();
  assert.match(await page.locator('#gr-ch-signup .chart-tip').innerText(), /3 октября 2026: 2 · 1–20 сентября: 0/);
  // остаются и чем пользуются
  assert.match(await page.locator('#gr-ret').innerText(), /Из 14 зарегистрировавшихся[\s\S]*через неделю\s*50%[\s\S]*6 из 12 человек · 1–20 сентября: 50%[\s\S]*через месяц\s*25%[\s\S]*Примерно/);
  assert.match(await page.locator('#gr-usage').innerText(), /Включили «Коллег»\s*12\s*52%[\s\S]*Показывают статус\s*5\s*22%[\s\S]*Пар «коллеги»: 9[\s\S]*Групп: 3/);
  assert.match(all, /Устройства[\s\S]*Сайт\s*15[\s\S]*Android\s*8[\s\S]*Версии приложения[\s\S]*2\.32\.1/i);
  assert.doesNotMatch(all, /@|leak/, 'ни почты, ни лишнего с сервера');
  assert.equal(await page.locator('[data-act=gr-next]').isDisabled(), true, 'вперёд от текущего месяца нельзя');
  assert.ok(await noOverflow(page));
  if (SHOTS) { await mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/1-mesyac-temnaya.png`, fullPage: true }); }
  assert.deepEqual(errors, []);
  await context.close();
});

test('периоды: прошлый месяц, квартал, год, всё время — запросы и подписи', async () => {
  const { context, page, errors, log } = await openAdmin(env);
  await page.locator('[data-act=acc-stats]').click();
  await waitLoaded(page);
  await page.locator('[data-act=gr-prev]').click();
  await waitLoaded(page);
  assert.match(await page.locator('.period-title').innerText(), /Сентябрь 2026/);
  assert.deepEqual(calls(log).at(-1), { p_from: '2026-09-01', p_to: '2026-09-30', p_prev_from: '2026-08-01', p_prev_to: '2026-08-31' });
  assert.equal(await page.locator('#gr-ch-signup .bar-g').count(), 30);
  assert.equal(await page.locator('[data-act=gr-next]').isDisabled(), false);
  await page.locator('[data-act=gr-period][data-v=quarter]').click();
  await waitLoaded(page);
  assert.match(await page.locator('.period-title').innerText(), /IV квартал 2026/);
  assert.deepEqual(calls(log).at(-1), { p_from: '2026-10-01', p_to: '2026-10-20', p_prev_from: '2026-07-01', p_prev_to: '2026-07-20' });
  assert.equal(await page.locator('#gr-ch-signup .bar-g').count(), 4, 'по неделям: 1–4, 5–11, 12–18, 19–20');
  await page.locator('[data-act=gr-period][data-v=year]').click();
  await waitLoaded(page);
  assert.match(await page.locator('.period-title').innerText(), /2026 год/);
  assert.deepEqual(calls(log).at(-1), { p_from: '2026-01-01', p_to: '2026-10-20', p_prev_from: '2025-01-01', p_prev_to: '2025-10-20' });
  assert.equal(await page.locator('#gr-ch-signup .bar-g').count(), 10, 'по месяцам');
  await page.locator('[data-act=gr-period][data-v=all]').click();
  await waitLoaded(page);
  assert.deepEqual(calls(log).at(-1), { p_from: null, p_to: '2026-10-20', p_prev_from: null, p_prev_to: null });
  assert.equal(await page.locator('.period-switch').count(), 0);
  assert.match(await page.locator('.gr-span').innerText(), /с 3 сентября 2026 по сегодня[\s\S]*без сравнения/);
  assert.equal(await page.locator('.gr-d').count(), 0, 'без сравнения — без стрелок');
  assert.equal(await page.locator('#gr-ch-signup .bar-g').count(), 2, 'сентябрь и октябрь');
  assert.deepEqual(errors, []);
  await context.close();
});

test('PDF: собирается в телефоне, одна страница A4, без почты', async () => {
  const { context, page, errors, log } = await openAdmin(env);
  await page.locator('[data-act=acc-stats]').click();
  await waitLoaded(page);
  const before = log.length;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#gr-pdf').click()]);
  assert.equal(dl.suggestedFilename(), 'CABINA-rost-2026-10.pdf');
  const buf = await readFile(await dl.path());
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.match(s, /\/Count 1/);
  assert.match(s, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.doesNotMatch(s, /admin@example|leak/);
  assert.equal(log.length, before, 'PDF не ходит на сервер');
  // квартал — своё имя файла
  await page.locator('[data-act=gr-period][data-v=quarter]').click();
  await waitLoaded(page);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('#gr-pdf').click()]);
  assert.equal(dl2.suggestedFilename(), 'CABINA-rost-2026-q4.pdf');
  if (SHOTS) {
    // картинка страницы PDF — для просмотра глазами
    const png = await page.evaluate(async () => {
      const g = await import('./js/growth.js'); const { growthRange } = await import('./js/growth-data.js'); const { drawGrowth } = await import('./js/growth-pdf.js');
      const st = g.growthState();
      const cv = document.createElement('canvas'); cv.width = 1191; cv.height = 1684;
      const ctx = cv.getContext('2d'); ctx.scale(2, 2);
      drawGrowth(ctx, st.data, growthRange(st.period, st.y, st.m, st.data.today));
      return cv.toDataURL('image/png');
    });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`${SHOTS}/4-pdf.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('сервер без шага 14: прежнее окно статистики и честная пометка', async () => {
  const { context, page, errors } = await openAdmin(env, { oldServer: true });
  await page.locator('[data-act=acc-stats]').click();
  await sheet(page).locator('#acc-stats-old').waitFor();
  assert.match(await sheet(page).innerText(), /2\s*аккаунта[\s\S]*после обновления сервера/);
  assert.equal(await page.locator('.screen[data-page=growth]').count(), 0);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  assert.deepEqual(errors.filter((e) => !/Failed to load resource/.test(e)), []);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'light' ? 'светлая' : 'тёмная'} тема: ничего не вылезает`, async () => {
    const { context, page, errors } = await openAdmin(env, { theme, text: 'xl' });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.locator('[data-act=acc-stats]').click();
    await waitLoaded(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.text), 'xl');
    assert.ok(await noOverflow(page), 'нет прокрутки вбок');
    // плитки в один столбец, числа и стрелки не обрезаны по ширине экрана
    const boxes = await page.locator('.gr-tile').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]));
    for (const [l, r] of boxes) assert.ok(l >= 0 && r <= 320, `плитка в экране: ${l}–${r}`);
    const seg = await page.locator('#gr-period button').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    assert.deepEqual(seg, [], 'названия периодов помещаются');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${theme === 'light' ? '2-svetlaya' : '3-temnaya'}-320-xl.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  });
}
