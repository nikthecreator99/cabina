// Код для входа (по желанию): 4 цифры при открытии CABINA и после возвращения в неё через минуту и больше.
// Сам код нигде не хранится: в localStorage лежит только его хеш (PBKDF2 с солью). В резервную копию он не попадает.
// Это защита от посторонних глаз, а не от взлома телефона. Забытый код восстановить нельзя — только стереть записи.
import { I, small, esc, toast, openLayer, closeLayer, sheet } from './ui.js';
import { replaceAll } from './db.js';
import { forget } from './auth.js';

const KEY = 'cabina-lock';
const TRIES_KEY = 'cabina-lock-tries';
const LEN = 4;
const ITER = 150000;
const RELOCK_MS = 60 * 1000;
const FREE_TRIES = 5; // дальше — пауза, каждый раз вдвое дольше (до 15 минут)

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const stored = () => { const v = ls.get(KEY); return v && typeof v.salt === 'string' && typeof v.hash === 'string' ? v : null; };
export const lockOn = () => !!stored();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hashOf(code, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}
async function matches(code) {
  const v = stored();
  if (!v) return true;
  return (await hashOf(code, unb64(v.salt), v.iter || ITER)) === v.hash;
}
async function saveCode(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  ls.set(KEY, { salt: b64(salt), hash: await hashOf(code, salt, ITER), iter: ITER });
  ls.set(TRIES_KEY, null);
}
export function removeLock() { ls.set(KEY, null); ls.set(TRIES_KEY, null); }

// неверные попытки переживают перезапуск: иначе паузу легко обойти
const tries = () => { const t = ls.get(TRIES_KEY); return { n: Number(t?.n) || 0, until: Number(t?.until) || 0 }; };
function failed() {
  const t = tries(); t.n++;
  if (t.n >= FREE_TRIES) t.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (t.n - FREE_TRIES)) * 1000;
  ls.set(TRIES_KEY, t);
}
const waitLeft = () => Math.max(0, Math.ceil((tries().until - Date.now()) / 1000));
const waitText = (s) => (s >= 60 ? `${Math.ceil(s / 60)} мин` : `${s} с`);

// ---------------------------------------------------------------- клавиатура из цифр
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
const padHtml = (title) => `<div class="pin">
  <div class="pin-title">${esc(title)}</div>
  <div class="pin-dots" aria-hidden="true">${'<i></i>'.repeat(LEN)}</div>
  <div class="pin-msg" role="status" aria-live="polite"></div>
  <div class="pin-keys">${KEYS.map((k) => (k === '' ? '<span></span>'
    : k === 'del' ? `<button type="button" class="pin-key del" data-k="del" aria-label="Стереть цифру">${small(I.left, 22)}</button>`
      : `<button type="button" class="pin-key" data-k="${k}">${k}</button>`)).join('')}</div></div>`;

// Ввод кода в контейнере box. onCode(code) возвращает сообщение об ошибке (строку) или ничего.
function runPad(box, title, onCode) {
  box.innerHTML = padHtml(title);
  let code = '';
  let busy = false;
  const dots = box.querySelectorAll('.pin-dots i');
  const msg = box.querySelector('.pin-msg');
  const show = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));
  const say = (t, bad = true) => { msg.textContent = t || ''; msg.classList.toggle('bad', bad); };
  async function press(k) {
    if (busy) return;
    if (k === 'del') { code = code.slice(0, -1); show(); return; }
    if (code.length >= LEN) return;
    code += k; show(); say('');
    if (code.length < LEN) return;
    busy = true;
    const err = await onCode(code);
    busy = false;
    if (err) {
      say(err);
      box.querySelector('.pin-dots').classList.add('shake');
      setTimeout(() => box.querySelector('.pin-dots')?.classList.remove('shake'), 400);
      try { navigator.vibrate?.(60); } catch {}
    }
    code = ''; show();
  }
  box.addEventListener('click', (e) => { const b = e.target.closest('.pin-key'); if (b) press(b.dataset.k); });
  const onKey = (e) => {
    if (!box.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
  return { say };
}

// Проверка текущего кода с паузой после неверных попыток
async function checkCode(code) {
  const w = waitLeft();
  if (w) return `Слишком много попыток. Подождите ${waitText(w)}`;
  if (await matches(code)) { ls.set(TRIES_KEY, null); return null; }
  failed();
  const w2 = waitLeft();
  return w2 ? `Неверный код. Подождите ${waitText(w2)}` : 'Неверный код';
}

// ---------------------------------------------------------------- экран блокировки
let screen = null;
export function lockScreen() {
  if (screen) return screen.promise;
  const el = document.createElement('div');
  el.className = 'lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Вход в CABINA');
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  screen = { el, promise };
  const main = () => {
    el.innerHTML = `<img class="lock-logo" src="icons/icon-192.png" alt="" width="64" height="64"><div class="lock-pad"></div>
      <button type="button" class="lock-forgot" data-act="lock-forgot">Забыли код?</button>`;
    runPad(el.querySelector('.lock-pad'), 'Введите код', async (code) => {
      const err = await checkCode(code);
      if (err) return err;
      el.remove(); screen = null; document.documentElement.classList.remove('lock-cover');
      resolve();
      return null;
    });
  };
  const forgot = () => {
    el.innerHTML = `<div class="lock-forget">
      <div class="lock-warn">${small(I.alert, 28)}</div>
      <h2>Забыли код?</h2>
      <p>Код восстановить нельзя. Можно стереть все записи в этом телефоне — поездки, отвлечения, документы, профиль и настройки — и затем вернуть их из резервной копии.</p>
      <button type="button" class="btn btn-danger" data-act="lock-wipe">Стереть всё</button>
      <button type="button" class="btn btn-plain" data-act="lock-back">Назад</button></div>`;
  };
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'lock-forgot') forgot();
    else if (act === 'lock-back') main();
    else if (act === 'lock-wipe') {
      e.target.closest('button').disabled = true;
      await replaceAll({});
      forget(); // вход в аккаунт на этом телефоне тоже убираем
      removeLock();
      location.reload();
    }
  });
  main();
  document.body.appendChild(el);
  return promise;
}

// Ушли из приложения — экран сразу закрывается заставкой (чтобы записи не были видны в списке приложений);
// вернулись через минуту и больше — снова код.
let hiddenAt = 0;
export function initLock() {
  document.addEventListener('visibilitychange', () => {
    if (!lockOn() || screen) return;
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); document.documentElement.classList.add('lock-cover'); return; }
    if (Date.now() - hiddenAt >= RELOCK_MS) lockScreen();
    else document.documentElement.classList.remove('lock-cover');
  });
}

// ---------------------------------------------------------------- Настройки: включить, сменить, выключить
export function openLockSettings(onChange) {
  const on = lockOn();
  const el = openLayer(sheet({
    title: 'Код для входа',
    body: on ? `<div class="hint">Код спрашивается при открытии CABINA и после возвращения в неё через минуту.</div>
      <div class="panel">
        <button class="row" data-act="lk-change"><span class="ico" style="--c:var(--accent)">${I.lock}</span><div class="grow"><div class="t1">Сменить код</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="lk-off"><span class="ico" style="--c:var(--holiday)">${I.x}</span><div class="grow"><div class="t1">Выключить код</div></div>${small(I.right, 18)}</button>
      </div><div class="lk-pad"></div>`
      : `<div class="notice">${I.alert}<div><b>Если забудете код, восстановить его нельзя.</b> Останется только стереть записи в этом телефоне и вернуть их из резервной копии. Поэтому сначала сохраните резервную копию: Настройки → «Создать резервную копию».</div></div>
      <div class="hint">Код защищает от посторонних глаз, но не от взлома телефона. Он хранится только в этом телефоне и в резервную копию не попадает.</div>
      <div class="lk-pad"></div>`,
    foot: on ? '' : '<button class="btn btn-primary" data-act="lk-set">Задать код</button>',
  }));
  const box = el.querySelector('.lk-pad');
  const done = (text) => { closeLayer(el); toast(text); onChange?.(); };
  // новый код: два раза одинаково
  const newCode = () => {
    el.querySelector('.panel')?.remove();
    el.querySelector('.sheet-foot, [data-act=lk-set]')?.remove();
    let first = '';
    const pad = runPad(box, 'Придумайте код из 4 цифр', async (code) => {
      if (!first) { first = code; box.querySelector('.pin-title').textContent = 'Повторите код'; return null; }
      if (code !== first) { first = ''; box.querySelector('.pin-title').textContent = 'Придумайте код из 4 цифр'; return 'Коды не совпали. Попробуйте ещё раз'; }
      await saveCode(code);
      done(on ? 'Код изменён' : 'Код для входа включён');
      return null;
    });
    return pad;
  };
  // сначала текущий код
  const current = (next) => {
    el.querySelector('.panel')?.remove();
    runPad(box, 'Введите текущий код', async (code) => {
      const err = await checkCode(code);
      if (err) return err;
      next();
      return null;
    });
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'lk-set') newCode();
    else if (b.dataset.act === 'lk-change') current(newCode);
    else if (b.dataset.act === 'lk-off') current(() => { removeLock(); done('Код для входа выключен'); });
  });
}
