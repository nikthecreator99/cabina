// 2.9: аккаунт CABINA — что и как уходит на сервер, вход в телефоне, ссылки из писем, тексты согласия.
// Сервер подменён: настоящие запросы не отправляются. Все данные — выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as auth from '../../js/auth.js';
import { CONSENT_VERSION, OPERATOR, legalReady, consentHtml, policyHtml } from '../../js/legal.js';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(claims)}.c2ln`;
const SUB = '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d';
const token = (exp = Math.floor(Date.now() / 1000) + 3600) => jwt({ sub: SUB, email: 'ivan@example.com', role: 'authenticated', exp });
const authReply = (exp) => ({ access_token: token(exp), refresh_token: 'r-1', expires_in: 3600, expires_at: exp, user: { email: 'ivan@example.com' } });

// Память телефона и сервер — подменные
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let calls = [];
let reply = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, opts) => {
  calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : undefined });
  const r = await reply(url, opts);
  if (r === 'offline') throw new TypeError('Failed to fetch');
  return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
};
beforeEach(() => { mem.clear(); calls = []; reply = () => ({ status: 200, body: {} }); });

test('ключ в приложении — только публичный (anon), адрес — наш сервер в России по HTTPS', () => {
  const c = auth.jwtClaims(auth.ANON_KEY);
  assert.equal(c.role, 'anon');
  assert.notEqual(c.role, 'service_role');
  assert.equal(auth.API, 'https://api.cabina-app.ru');
  for (const f of ['js/auth.js', 'js/account.js', 'js/legal.js', 'js/app.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'), /service_role.*eyJ|SERVICE_ROLE_KEY\s*=/, `${f}: секретного ключа нет`);
  }
});

test('редакция согласия совпадает с той, которую требует сервер', () => {
  const sql = readFileSync(new URL('../../server/migrations/0001_accounts.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`\\('consent_version', '${CONSENT_VERSION}'\\)`));
  assert.equal(auth.PASS_MIN, 10, 'как GOTRUE_PASSWORD_MIN_LENGTH на сервере');
});

test('регистрация отправляет только почту, пароль, согласие, приглашение, устройство и версию', async () => {
  reply = () => ({ status: 200, body: { id: SUB, email: 'ivan@example.com' } });
  const r = await auth.signUp({ email: ' ivan@example.com ', password: 'Probnyj-parol-1', invite: ' 7f3a-9c21 b4 ', version: '2.9.0' });
  assert.deepEqual(r, { ok: true, signedIn: false });
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'https://api.cabina-app.ru/auth/v1/signup');
  assert.equal(c.headers.apikey, auth.ANON_KEY);
  assert.equal(c.headers.Authorization, undefined);
  assert.deepEqual(c.body, { email: 'ivan@example.com', password: 'Probnyj-parol-1', data: { consent: 'privacy-1', invite: '7F3A9C21B4', platform: 'web', version: '2.9.0' } });
  assert.equal(auth.session(), null, 'до подтверждения почты вход не появляется');
});

test('ответы настоящего сервера понятны человеку', () => {
  const e = (status, body) => auth.errorText({ status, data: body });
  assert.match(e(500, { code: 'P0001', message: 'cabina: invite required' }), /Код приглашения неверный/);
  assert.match(e(500, { code: 'P0001', message: 'cabina: consent required' }), /Без согласия/);
  assert.match(e(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 10 characters.' }), /не меньше 10/);
  assert.match(e(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), /Неверная почта или пароль/);
  assert.match(e(400, { error_code: 'email_not_confirmed' }), /не подтверждена/);
  assert.match(e(429, { error_code: 'over_email_send_rate_limit' }), /Слишком много попыток/);
  assert.match(e(403, { code: '42501', message: 'permission denied for function admin_stats' }), /Войдите в аккаунт заново/);
  assert.match(e(400, { code: '42501', message: 'cabina: forbidden' }), /Нет доступа/);
  assert.match(auth.errorText(null), /Нет связи/);
  assert.match(e(500, {}), /попробуйте позже/i);
});

test('вход хранится в телефоне, выход стирает его даже без связи', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  reply = () => ({ status: 200, body: authReply(exp) });
  assert.deepEqual(await auth.signIn({ email: 'ivan@example.com', password: 'Probnyj-parol-1' }), { ok: true });
  assert.equal(calls[0].url, 'https://api.cabina-app.ru/auth/v1/token?grant_type=password');
  const s = auth.session();
  assert.equal(s.email, 'ivan@example.com');
  assert.equal(s.exp, exp * 1000);
  reply = () => 'offline';
  await auth.signOut();
  assert.equal(auth.session(), null);
  assert.equal(mem.size, 0, 'в памяти телефона ничего не осталось');
});

test('неверный пароль и нет связи — вход не сохраняется', async () => {
  reply = () => ({ status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
  let r = await auth.signIn({ email: 'ivan@example.com', password: 'x' });
  assert.equal(r.ok, false); assert.match(r.error, /Неверная/);
  reply = () => 'offline';
  r = await auth.signIn({ email: 'ivan@example.com', password: 'x' });
  assert.match(r.error, /Нет связи/);
  assert.equal(auth.session(), null);
});

test('устаревший ключ входа обновляется один раз, даже при двух запросах сразу', async () => {
  const old = authReply(Math.floor(Date.now() / 1000) - 10);
  mem.set('cabina-account', JSON.stringify(auth.fromAuth(old)));
  const fresh = authReply(Math.floor(Date.now() / 1000) + 3600);
  fresh.refresh_token = 'r-2';
  reply = (url) => (url.includes('refresh_token') ? { status: 200, body: fresh } : { status: 204 });
  const [a, b] = await Promise.all([auth.accessToken(), auth.accessToken()]);
  assert.equal(a, fresh.access_token); assert.equal(b, fresh.access_token);
  assert.equal(calls.filter((c) => c.url.includes('refresh_token')).length, 1);
  assert.deepEqual(calls[0].body, { refresh_token: 'r-1' });
  assert.equal(auth.session().refresh, 'r-2');
});

test('сервер отозвал вход — телефон его забывает; нет связи — вход остаётся', async () => {
  const old = authReply(Math.floor(Date.now() / 1000) - 10);
  mem.set('cabina-account', JSON.stringify(auth.fromAuth(old)));
  reply = () => 'offline';
  assert.equal(await auth.accessToken(), null);
  assert.ok(auth.session(), 'без связи вход не теряется');
  const r = await auth.exportMyData();
  assert.match(r.error, /Нет связи/);
  reply = () => ({ status: 400, body: { error_code: 'refresh_token_not_found' } });
  assert.equal(await auth.accessToken(), null);
  assert.equal(auth.session(), null);
});

test('«заходил сегодня» — не чаще раза в день и только платформа и версия', async () => {
  assert.equal(await auth.touch('2.9.0', '2026-10-20'), false, 'без аккаунта ничего не отправляется');
  assert.equal(calls.length, 0);
  mem.set('cabina-account', JSON.stringify(auth.fromAuth(authReply(Math.floor(Date.now() / 1000) + 3600))));
  reply = () => ({ status: 204 });
  assert.equal(await auth.touch('2.9.0', '2026-10-20'), true);
  assert.equal(await auth.touch('2.9.0', '2026-10-20'), false);
  assert.equal(await auth.touch('2.9.0', '2026-10-21'), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.cabina-app.ru/rest/v1/rpc/touch');
  assert.deepEqual(calls[0].body, { p_platform: 'web', p_version: '2.9.0' });
  assert.match(calls[0].headers.Authorization, /^Bearer /);
});

test('удаление аккаунта: вход стирается только когда сервер подтвердил удаление', async () => {
  mem.set('cabina-account', JSON.stringify(auth.fromAuth(authReply(Math.floor(Date.now() / 1000) + 3600))));
  reply = () => ({ status: 500, body: {} });
  assert.equal((await auth.deleteAccount()).ok, false);
  assert.ok(auth.session());
  reply = () => ({ status: 204 });
  assert.deepEqual(await auth.deleteAccount(), { ok: true });
  assert.equal(calls.at(-1).url, 'https://api.cabina-app.ru/rest/v1/rpc/delete_my_account');
  assert.equal(auth.session(), null);
});

test('ссылка из письма: вход, сброс пароля, устаревшая ссылка, мусор', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const ok = auth.parseAuthHash(`#access_token=${token(exp)}&expires_at=${exp}&expires_in=3600&refresh_token=r-9&token_type=bearer&type=signup`);
  assert.equal(ok.type, 'signup');
  assert.equal(ok.session.refresh, 'r-9');
  assert.equal(ok.session.email, 'ivan@example.com');
  assert.equal(auth.parseAuthHash(`#access_token=${token(exp)}&refresh_token=r&type=recovery`).type, 'recovery');
  assert.deepEqual(auth.parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), { error: 'otp_expired' });
  assert.deepEqual(auth.parseAuthHash('#access_token=abc&refresh_token=r'), { error: 'bad_link' });
  assert.equal(auth.parseAuthHash(''), null);
  assert.equal(auth.parseAuthHash('#top'), null);
});

test('ссылка из письма убирается из адресной строки и сохраняет вход', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const loc = { hash: `#access_token=${token(exp)}&refresh_token=r-5&type=signup`, pathname: '/cabina/', search: '' };
  let replaced = null;
  const hist = { state: null, replaceState: (st, t, url) => { replaced = url; } };
  const r = auth.consumeAuthRedirect(loc, hist);
  assert.equal(r.type, 'signup');
  assert.equal(replaced, '/cabina/');
  assert.equal(auth.session().refresh, 'r-5');
  assert.equal(auth.consumeAuthRedirect({ hash: '', pathname: '/', search: '' }, hist), null);
});

test('согласие и политика: оператор указан, без незаполненных мест, совпадают с тем, что хранит сервер', () => {
  assert.equal(legalReady(), true);
  const c = consentHtml();
  const p = policyHtml();
  for (const html of [c, p]) {
    assert.ok(html.includes(OPERATOR.name));
    assert.ok(html.includes(OPERATOR.inn));
    assert.ok(html.includes('privacy@cabina-app.ru'));
    assert.doesNotMatch(html, /\[|…\]|TODO/, 'нет незаполненных мест');
    assert.match(html, /Российской Федерации/);
    assert.match(html, /Трансграничная передача не производится/);
  }
  assert.ok(c.includes(CONSENT_VERSION));
  for (const x of ['адрес электронной почты', 'дата регистрации', 'версия приложения', 'IP-адрес']) assert.ok(c.includes(x), x);
  assert.match(c, /не более 30 дней/);
  assert.match(c, /не позднее 14 дней/);
  assert.match(p, /больничные/);
  assert.match(OPERATOR.inn, /^\d{12}$/);
});
