// Связь с сервером аккаунтов CABINA (Supabase на сервере в России, api.cabina-app.ru).
// На сервер уходят только почта, пароль (сервер хранит лишь его хеш), согласие, код приглашения,
// тип устройства и версия приложения, а если человек сам включил «Коллеги» — ещё карточка и статус (colleagues.js).
// Поездки, заработок, отвлечения, документы и телефон — никогда.
// Вход хранится в localStorage, а не в базе приложения: так он не попадает в резервную копию.
import { CONSENT_VERSION } from './legal.js';

export const API = 'https://api.cabina-app.ru';
// Публичный ключ приложения (роль anon). Его видят все: доступ к данным ограничивают правила базы (RLS).
// Ключ service_role в приложение не кладём никогда.
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyOTcyODAwLCJleHAiOjE5NTA3MzkyMDB9.tjeCWTSIQwYdbEaSryQosWO3bi__VN9rvaVzqj4EK-c';
export const PLATFORM = 'web';
export const PASS_MIN = 10;
const KEY = 'cabina-account';
const TOUCH_KEY = 'cabina-account-touch';
// отпечатки того, что уже отправлено коллегам (colleagues.js): при выходе тоже стираются
const COLLEAGUES_KEY = 'cabina-colleagues';

// ---------------------------------------------------------------- вход в этом телефоне

export function jwtClaims(token) {
  try {
    const p = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
}
const isJwt = (t) => typeof t === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t) && !!jwtClaims(t)?.sub;

export function session() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && isJwt(s.access) && typeof s.refresh === 'string' ? s : null;
  } catch { return null; }
}
function store(s) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else { localStorage.removeItem(KEY); localStorage.removeItem(TOUCH_KEY); localStorage.removeItem(COLLEAGUES_KEY); }
  } catch {}
}
export const forget = () => store(null);

// Ответ сервера о входе → то, что храним в телефоне
export function fromAuth(d, now = Date.now()) {
  if (!d || !isJwt(d.access_token) || typeof d.refresh_token !== 'string' || !d.refresh_token) return null;
  const c = jwtClaims(d.access_token);
  const exp = d.expires_at ? d.expires_at * 1000 : c.exp ? c.exp * 1000 : now + (Number(d.expires_in) || 3600) * 1000;
  return { access: d.access_token, refresh: d.refresh_token, exp, email: String(d.user?.email || c.email || ''), sub: c.sub };
}

// ---------------------------------------------------------------- запросы

async function call(path, { method = 'POST', body, token, timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const headers = { apikey: ANON_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(API + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return null; } finally { clearTimeout(timer); }
}

// Понятное объяснение ответа сервера. null — нет связи.
export function errorText(res) {
  if (!res) return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  const d = res.data && typeof res.data === 'object' ? res.data : {};
  const code = String(d.error_code || d.code || d.error || '');
  const msg = String(d.msg || d.message || d.error_description || '');
  if (code === 'otp_expired' || /Token has expired or is invalid/i.test(msg)) return 'Код неверный или устарел. Проверьте цифры или запросите новое письмо.';
  if (/invite required/.test(msg)) return 'Код приглашения неверный, уже использован или устарел.';
  if (/consent required/.test(msg)) return 'Без согласия на обработку данных аккаунт создать нельзя.';
  if (/Database error saving new user/i.test(msg)) return 'Не удалось создать аккаунт. Проверьте код приглашения.';
  // «New password should be different…» тоже начинается с «password should» — поэтому раньше проверки длины
  if (code === 'same_password' || /different from the old password/i.test(msg)) return 'Этот пароль у вас уже был. Придумайте другой.';
  if (code === 'weak_password' || /Password should/i.test(msg)) return `Пароль слишком простой: нужно не меньше ${PASS_MIN} символов.`;
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return 'Эта почта уже зарегистрирована. Войдите или восстановите пароль.';
  if (code === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return 'Неверная почта или пароль.';
  if (code === 'email_not_confirmed' || /Email not confirmed/i.test(msg)) return 'Почта ещё не подтверждена. Введите код из письма от CABINA.';
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return 'Проверьте адрес почты.';
  if (res.status === 429 || /rate.?limit/i.test(code + msg)) return 'Слишком много попыток. Подождите несколько минут и попробуйте снова.';
  if (code === 'signup_disabled') return 'Регистрация сейчас закрыта.';
  if (/cabina: forbidden/.test(msg)) return 'Нет доступа.';
  if (res.status === 401 || res.status === 403 || code === '42501') return 'Вход устарел. Войдите в аккаунт заново.';
  return 'Сервер не смог выполнить запрос. Попробуйте позже.';
}
export const errorCode = (res) => String(res?.data?.error_code || res?.data?.code || '');

// Действующий ключ входа; при необходимости обновляется. Одновременно — только одно обновление:
// повторное использование старого ключа сервер считает взломом и закрывает вход.
let refreshing = null;
export async function accessToken() {
  const s = session();
  if (!s) return null;
  if (s.exp - 60000 > Date.now()) return s.access;
  if (!refreshing) {
    refreshing = (async () => {
      const r = await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh } });
      if (r?.ok) { const n = fromAuth(r.data); if (n) { store(n); return n.access; } }
      if (r && (r.status === 400 || r.status === 401)) forget(); // вход отозван или устарел
      return null;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

const NO_SESSION = { ok: false, status: 401, data: { code: '42501' } };
async function withToken(path, opts = {}) {
  const token = await accessToken();
  if (!token) return session() ? null : NO_SESSION; // есть вход, но нет связи — null
  return call(path, { ...opts, token });
}
export const rpc = (name, args = {}) => withToken(`/rest/v1/rpc/${name}`, { body: args });
// Чтение своих строк из таблиц (что видно — решают правила базы, RLS): 'links?select=id,state'
export const restGet = (path) => withToken(`/rest/v1/${path}`, { method: 'GET' });

// ---------------------------------------------------------------- действия

export const normInvite = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');
export const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '')) && String(s).length <= 254;

export async function signUp({ email, password, invite, version }) {
  const r = await call('/auth/v1/signup', { body: {
    email: email.trim(), password,
    data: { consent: CONSENT_VERSION, invite: normInvite(invite), platform: PLATFORM, version },
  } });
  if (r?.ok) { const s = fromAuth(r.data); if (s) store(s); return { ok: true, signedIn: !!s }; }
  return { ok: false, error: errorText(r), code: errorCode(r) };
}

export async function signIn({ email, password }) {
  const r = await call('/auth/v1/token?grant_type=password', { body: { email: email.trim(), password } });
  const s = r?.ok ? fromAuth(r.data) : null;
  if (s) { store(s); return { ok: true }; }
  return { ok: false, error: r?.ok ? errorText({ status: 500 }) : errorText(r), code: errorCode(r) };
}

// Выход: в телефоне — сразу, на сервере — по возможности. Статус для коллег стираем до выхода:
// без входа приложение уже не сможет его обновлять, и коллеги видели бы устаревший.
export async function signOut() {
  const token = session() ? await accessToken().catch(() => null) || session()?.access : null;
  forget();
  if (!token) return;
  await call('/rest/v1/rpc/clear_status', { token, body: {}, timeout: 5000 });
  await call('/auth/v1/logout', { token, timeout: 5000 });
}

export async function recover(email) {
  const r = await call('/auth/v1/recover', { body: { email: email.trim() } });
  return r?.ok ? { ok: true } : { ok: false, error: errorText(r) };
}

export async function resend(email) {
  const r = await call('/auth/v1/resend', { body: { type: 'signup', email: email.trim() } });
  return r?.ok ? { ok: true } : { ok: false, error: errorText(r) };
}

// Код из письма (подтверждение почты или новый пароль): цифры без пробелов
export const normCode = (s) => String(s || '').replace(/\D/g, '');

// type: 'signup' — подтвердить почту, 'recovery' — войти, чтобы задать новый пароль
export async function verifyCode({ email, code, type }) {
  const r = await call('/auth/v1/verify', { body: { type, email: email.trim(), token: normCode(code) } });
  const s = r?.ok ? fromAuth(r.data) : null;
  if (s) { store(s); return { ok: true }; }
  return { ok: false, error: r?.ok ? errorText({ status: 500 }) : errorText(r) };
}

export async function setPassword(password) {
  const r = await withToken('/auth/v1/user', { method: 'PUT', body: { password } });
  return r?.ok ? { ok: true } : { ok: false, error: errorText(r) };
}

export async function exportMyData() {
  const r = await rpc('export_my_data');
  return r?.ok ? { ok: true, data: r.data } : { ok: false, error: errorText(r) };
}

// Удаление аккаунта на сервере = отзыв согласия. Записи в телефоне не трогаем.
export async function deleteAccount() {
  const r = await rpc('delete_my_account');
  if (r?.ok) { forget(); return { ok: true }; }
  return { ok: false, error: errorText(r) };
}

export async function myRole() {
  const r = await withToken('/rest/v1/profiles?select=role', { method: 'GET' });
  return r?.ok && Array.isArray(r.data) ? r.data[0]?.role || null : null;
}

export async function adminStats() {
  const r = await rpc('admin_stats');
  return r?.ok ? { ok: true, data: r.data } : { ok: false, error: errorText(r) };
}

// Новое приглашение (только администратор): сервер возвращает код один раз, у себя хранит лишь его хеш
export async function createInvite() {
  const r = await rpc('admin_create_invite');
  const code = r?.ok && typeof r.data === 'string' ? normInvite(r.data) : '';
  if (/^[0-9A-Z]{6,32}$/.test(code)) return { ok: true, code };
  return { ok: false, error: r?.ok ? errorText({ status: 500 }) : errorText(r) };
}

// Отметка «заходил сегодня» для статистики: не чаще раза в день, только дата, платформа и версия
export async function touch(version, today = new Date().toISOString().slice(0, 10)) {
  const s = session();
  if (!s) return false;
  const mark = `${s.sub}|${today}`;
  try { if (localStorage.getItem(TOUCH_KEY) === mark) return false; } catch {}
  const r = await rpc('touch', { p_platform: PLATFORM, p_version: version });
  if (r?.ok) { try { localStorage.setItem(TOUCH_KEY, mark); } catch {} return true; }
  return false;
}

// ---------------------------------------------------------------- ссылки из писем

// Ссылка из письма (подтверждение почты, сброс пароля) открывает приложение с данными входа
// после «#». Разбираем их и сразу убираем из адресной строки.
export function parseAuthHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  if (!/(^|&)(access_token|error|error_code)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  if (p.get('error') || p.get('error_code')) return { error: p.get('error_code') || p.get('error') };
  const s = fromAuth({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
    expires_at: Number(p.get('expires_at')) || undefined, expires_in: Number(p.get('expires_in')) || undefined });
  return s ? { type: p.get('type') || 'signup', session: s } : { error: 'bad_link' };
}

export function consumeAuthRedirect(loc = globalThis.location, hist = globalThis.history) {
  const r = parseAuthHash(loc?.hash);
  if (!r) return null;
  try { hist.replaceState(hist.state, '', loc.pathname + loc.search); } catch {}
  if (r.session) store(r.session);
  return r;
}

export function linkErrorText(code) {
  if (code === 'otp_expired') return 'Ссылка из письма устарела или уже использована. Запросите новое письмо.';
  return 'Ссылка из письма не сработала. Запросите новое письмо.';
}
