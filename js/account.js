// Экран «Аккаунт» (Профиль → Аккаунт CABINA): регистрация по приглашению с согласием, вход, сброс пароля,
// «Скачать мои данные с сервера», выход и удаление аккаунта; для администратора — статистика (только числа).
// Аккаунт не обязателен: без него CABINA работает как раньше, записи из телефона на сервер не уходят.
import { I, esc, small, pageHead, openLayer, sheet, toast, confirmDialog, saveToDevice, plural } from './ui.js';
import { legalReady, consentHtml, policyHtml } from './legal.js';
import { session, signUp, signIn, signOut, recover, resend, setPassword, exportMyData, deleteAccount, myRole, adminStats, createInvite, verifyCode, normCode,
  emailOk, normInvite, PASS_MIN, linkErrorText } from './auth.js';

// mode: menu | signup | login | reset | sent | reset-sent | newpass. Пароль в состоянии не храним.
// sent — ввести код из письма, чтобы подтвердить почту; reset-sent — код из письма и новый пароль.
const A = { mode: 'menu', email: '', invite: '', role: null, busy: false, note: '' };
let VERSION = '';
export const setAccountVersion = (v) => { VERSION = v; };

// Ждём код из письма: помним почту и шаг час (столько живёт код), чтобы после ухода в почту
// и перезапуска приложения человек вернулся к полю для кода. Пароль и код не храним.
const PENDING = 'cabina-account-pending';
function setPending(on) {
  try {
    if (on) localStorage.setItem(PENDING, JSON.stringify({ mode: A.mode, email: A.email, at: Date.now() }));
    else localStorage.removeItem(PENDING);
  } catch {}
}
function pending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
    if (p && ['sent', 'reset-sent'].includes(p.mode) && emailOk(p.email) && Date.now() - p.at < 3600e3) return p;
  } catch {}
  setPending(false);
  return null;
}

export function accountEnter() {
  if (A.mode !== 'newpass') {
    const p = !session() && pending();
    if (p) { A.mode = p.mode; A.email = p.email; } else { A.mode = 'menu'; A.note = ''; }
  }
  A.busy = false;
  A.role = null;
  if (!session()) return Promise.resolve();
  return myRole().then((r) => { A.role = r; }).catch(() => {});
}

// Строка на экране «Профиль»
export function accountRowHtml() {
  if (!legalReady()) return '';
  const s = session();
  return `<div class="panel"><button class="row" data-act="go" data-page="account">
    <span class="ico" style="--c:var(--night)">${I.user}</span>
    <div class="grow"><div class="t1">Аккаунт CABINA</div><div class="t2">${s ? `Вы вошли: ${esc(s.email)}` : 'Не обязателен · закрытое испытание'}</div></div>${small(I.right, 18)}</button></div>`;
}

const field = (id, label, input, hint = '') => `<div class="pay-field"><label for="${id}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const emailInput = () => `<input class="input" id="acc-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" placeholder="name@yandex.ru" value="${esc(A.email)}">`;
const passInput = (auto) => `<div class="acc-pass"><input class="input" id="acc-pass" type="password" autocomplete="${auto}" maxlength="72" placeholder="${auto === 'new-password' ? `Не меньше ${PASS_MIN} символов` : 'Пароль'}">
  <button type="button" class="acc-eye" data-act="acc-eye" aria-label="Показать пароль" aria-pressed="false">Показать</button></div>`;
const codeInput = () => `<input class="input acc-code-in num" id="acc-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="••••••" aria-label="Код из письма">`;
const errBox = '<div id="acc-err" class="acc-err" role="alert" aria-live="assertive"></div>';
const submitBtn = (label) => `<button class="btn btn-primary" type="submit" form="acc-form" id="acc-submit" data-label="${esc(label)}">${esc(label)}</button>`;
const modeBtn = (mode, label) => `<button class="link-btn" data-act="acc-mode" data-mode="${mode}">${label}</button>`;
// Каждая галочка — отдельно и не отмечена заранее: согласие по 152-ФЗ даётся отдельно от других документов
const consentBox = (id, text, act, icon, btn) => `<div class="pay-field"><div class="acc-consent"><input type="checkbox" id="${id}"><label for="${id}">${text}</label></div>
          <div class="acc-docs"><button type="button" class="link-btn" data-act="${act}">${small(icon, 16)} ${btn}</button></div></div>`;
const docsBtns = `<div class="acc-docs"><button type="button" class="link-btn" data-act="acc-consent-doc">${small(I.shield, 16)} Согласие</button><button type="button" class="link-btn" data-act="acc-policy">${small(I.book, 16)} Политика</button></div>`;
const localNote = `<div class="notice ok">${I.shield}<div><b>Аккаунт не обязателен.</b> Без него CABINA работает как раньше. Поездки, заработок, отвлечения, документы и профиль хранятся только в этом телефоне и на сервер не отправляются — с аккаунтом тоже.</div></div>`;

function signedInHtml(s) {
  return `<div class="panel"><div class="row"><span class="ico" style="--c:var(--ok)">${I.user}</span>
      <div class="grow"><div class="t1 acc-email">${esc(s.email)}</div><div class="t2">Вы вошли в аккаунт CABINA</div></div></div></div>
    <div class="notice ok">${I.shield}<div><b>На сервере о вас только:</b> почта, дата регистрации, дата последнего захода, тип устройства и версия приложения. Поездки, заработок, отвлечения, документы и профиль остаются в этом телефоне.</div></div>
    <div class="group"><div class="group-title">Мои данные</div>
      <div class="panel">
        <button class="row" data-act="acc-export"><span class="ico" style="--c:var(--accent)">${I.download}</span><div class="grow"><div class="t1">Скачать мои данные с сервера</div><div class="t2">Всё, что сервер знает о вас, одним файлом</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="acc-consent-doc"><span class="ico" style="--c:var(--ok)">${I.shield}</span><div class="grow"><div class="t1">Согласие на обработку данных</div><div class="t2">Которое вы дали при регистрации</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="acc-policy"><span class="ico" style="--c:var(--night)">${I.book}</span><div class="grow"><div class="t1">Политика обработки данных</div><div class="t2">Что хранится, где и сколько</div></div>${small(I.right, 18)}</button>
      </div></div>
    ${A.role === 'admin' ? `<div class="group"><div class="group-title">Администратор</div>
      <div class="panel"><button class="row" data-act="acc-stats"><span class="ico" style="--c:var(--warn)">${I.chart}</span><div class="grow"><div class="t1">Статистика</div><div class="t2">Сколько аккаунтов и заходов — только числа</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="acc-invite-new"><span class="ico" style="--c:var(--ok)">${I.plus}</span><div class="grow"><div class="t1">Создать приглашение</div><div class="t2">Код для одного человека, действует 14 дней</div></div>${small(I.right, 18)}</button></div></div>` : ''}
    <div class="acc-btns">
      <button class="btn btn-plain" data-act="acc-logout">Выйти из аккаунта</button>
      <button class="btn btn-danger" data-act="acc-delete">${small(I.trash, 18)} Удалить аккаунт</button>
      <div class="hint">Удаление аккаунта — это и отзыв согласия на обработку данных. Записи в этом телефоне останутся.</div>
    </div>`;
}

function formHtml() {
  switch (A.mode) {
    case 'signup': return `<form class="panel pay-panel" id="acc-form" novalidate>
        ${field('acc-email', 'Почта', emailInput(), 'На неё придёт письмо для подтверждения. Лучше российская почта (Яндекс, Mail.ru).')}
        ${field('acc-pass', 'Придумайте пароль', passInput('new-password'), `Не меньше ${PASS_MIN} символов. Не берите пароль от почты или Госуслуг.`)}
        ${field('acc-invite', 'Код приглашения', `<input class="input" id="acc-invite" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32" placeholder="Например, 7F3A9C21B4" value="${esc(A.invite)}">`, 'Сейчас идёт закрытое испытание: аккаунт создаётся только по приглашению.')}
        ${consentBox('acc-consent', 'Мне исполнилось 18 лет. Даю согласие на обработку моих персональных данных.', 'acc-consent-doc', I.shield, 'Прочитать согласие')}
        ${consentBox('acc-policy-ok', 'Я ознакомлен(а) с политикой обработки персональных данных CABINA.', 'acc-policy', I.book, 'Прочитать политику')}
      </form>${errBox}${submitBtn('Создать аккаунт')}${modeBtn('login', 'У меня уже есть аккаунт')}`;
    case 'login': return `<form class="panel pay-panel" id="acc-form" novalidate>
        ${field('acc-email', 'Почта', emailInput())}
        ${field('acc-pass', 'Пароль', passInput('current-password'))}
      </form>${errBox}${submitBtn('Войти')}
      <div class="acc-docs">${modeBtn('reset', 'Забыли пароль?')}${modeBtn('signup', 'Создать аккаунт')}</div>`;
    case 'reset': return `<div class="hint">Пришлём на почту код. Введёте его здесь и придумаете новый пароль.</div>
      <form class="panel pay-panel" id="acc-form" novalidate>${field('acc-email', 'Почта', emailInput())}</form>
      ${errBox}${submitBtn('Отправить письмо')}${modeBtn('login', 'Вспомнил пароль')}`;
    case 'newpass': return `<div class="hint">Придумайте новый пароль для аккаунта.</div>
      <form class="panel pay-panel" id="acc-form" novalidate>${field('acc-pass', 'Новый пароль', passInput('new-password'), `Не меньше ${PASS_MIN} символов.`)}</form>
      ${errBox}${submitBtn('Сохранить пароль')}`;
    case 'sent': return `<div class="notice ok">${I.mail}<div>${A.note ? `<b>${esc(A.note)}</b><br>` : ''}Мы отправили код на <b class="acc-email">${esc(A.email)}</b>. Введите его здесь. Письма нет — проверьте папку «Спам».</div></div>
      <form class="panel pay-panel" id="acc-form" novalidate>${field('acc-code', 'Код из письма', codeInput())}</form>
      ${errBox}${submitBtn('Подтвердить')}
      <div class="acc-docs"><button class="link-btn" data-act="acc-resend">Отправить код ещё раз</button>${modeBtn('login', 'Ко входу')}</div>`;
    case 'reset-sent': return `<div class="notice ok">${I.mail}<div>Если почта <b class="acc-email">${esc(A.email)}</b> зарегистрирована, на неё придёт код. Письма нет — проверьте папку «Спам».</div></div>
      <form class="panel pay-panel" id="acc-form" novalidate>
        ${field('acc-code', 'Код из письма', codeInput())}
        ${field('acc-pass', 'Новый пароль', passInput('new-password'), `Не меньше ${PASS_MIN} символов.`)}
      </form>${errBox}${submitBtn('Сохранить пароль')}
      <div class="acc-docs"><button class="link-btn" data-act="acc-resend">Отправить код ещё раз</button>${modeBtn('login', 'Ко входу')}</div>`;
    default: return `${localNote}
      <div class="panel"><div class="row"><span class="ico" style="--c:var(--night)">${I.info}</span><div class="grow"><div class="t1">Зачем аккаунт</div>
        <div class="t2">Сейчас идёт закрытое испытание. Позже через аккаунт можно будет по вашему выбору общаться с коллегами.</div></div></div></div>
      <div class="acc-btns"><button class="btn btn-primary" data-act="acc-mode" data-mode="signup">Создать аккаунт</button>
        <button class="btn btn-ghost" data-act="acc-mode" data-mode="login">Войти</button></div>
      ${docsBtns}`;
  }
}

export function renderAccount() {
  const s = session();
  return `${pageHead('Аккаунт CABINA', { back: true })}
    ${s && A.mode !== 'newpass' ? signedInHtml(s) : formHtml()}`;
}

// ---------------------------------------------------------------- действия

function showError(text, focusId) {
  const box = document.getElementById('acc-err');
  if (box) box.innerHTML = text ? `<div class="error-box">${I.alert}<span>${esc(text)}</span></div>` : '';
  document.querySelectorAll('#acc-form .input.err').forEach((x) => x.classList.remove('err'));
  if (focusId) { const el = document.getElementById(focusId); el?.classList.add('err'); el?.focus(); }
}
function setBusy(on) {
  A.busy = on;
  const b = document.getElementById('acc-submit');
  if (b) { b.disabled = on; b.textContent = on ? 'Подождите…' : b.dataset.label; }
}
const val = (id) => document.getElementById(id)?.value ?? '';

function openDoc(title, html) {
  openLayer(sheet({ title, body: html, tall: true, foot: '<button class="btn btn-primary" data-close>Понятно</button>' }));
}

function showStats(d) {
  const n = (v) => Number(v) || 0;
  const list = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row"><div class="grow t1">${esc({ web: 'Сайт', android: 'Android', ios: 'iOS', unknown: 'Неизвестно' }[k] || k)}</div><b class="num">${n(v)}</b></div>`).join('');
  const dayLine = (x) => [n(x.signup) && `+${n(x.signup)} рег.`, n(x.confirmed) && `${n(x.confirmed)} подтв.`, n(x.deleted) && `−${n(x.deleted)} удал.`].filter(Boolean).join(' · ');
  const days = (d.daily || []).slice(-14).reverse().filter(dayLine).map((x) => `<div class="row"><div class="grow t1">${esc(String(x.day || '').split('-').reverse().join('.'))}</div><span class="t2">${dayLine(x)}</span></div>`).join('');
  const tile = (v, l) => `<div class="pt"><b class="num">${n(v)}</b><span>${l}</span></div>`;
  openLayer(sheet({ title: 'Статистика', tall: true, body: `
    <div class="profile-tiles">${tile(d.total, plural(n(d.total), 'аккаунт', 'аккаунта', 'аккаунтов'))}${tile(d.confirmed, 'подтвердили почту')}${tile(d.active_1, 'заходили сегодня')}</div>
    <div class="profile-tiles">${tile(d.active_7, 'за 7 дней')}${tile(d.active_30, 'за 30 дней')}</div>
    ${list(d.platforms) ? `<div class="group-title">Устройства</div><div class="panel">${list(d.platforms)}</div>` : ''}
    ${list(d.versions) ? `<div class="group-title">Версии приложения</div><div class="panel">${list(d.versions)}</div>` : ''}
    ${days ? `<div class="group-title">По дням</div><div class="panel">${days}</div>` : ''}
    <div class="hint">Только числа: почта и идентификаторы людей в статистику не попадают.</div>` }));
}

const SITE = 'https://nikthecreator99.github.io/cabina/';
// Код показываем один раз: в телефоне его не сохраняем, на сервере остаётся только хеш
function showInvite(code) {
  const nice = code.replace(/(.{5})(?=.)/g, '$1 ');
  const text = `Приглашение в CABINA.\n1. Откройте ${SITE}\n2. Профиль → «Аккаунт CABINA» → «Создать аккаунт».\n3. Код приглашения: ${code}\nКод действует 14 дней и только для одного человека.`;
  const canShare = typeof navigator.share === 'function';
  const el = openLayer(sheet({ title: 'Приглашение', body: `
    <div class="acc-code num" aria-label="Код приглашения">${esc(nice)}</div>
    <div class="notice ok">${I.shield}<div>Код действует <b>14 дней</b> и только для <b>одного человека</b>. Он показывается один раз: на сервере хранится только его зашифрованный отпечаток. Отправьте его тому, кого приглашаете.</div></div>
    <div class="hint">Человеку нужно открыть CABINA, зайти в Профиль → «Аккаунт CABINA» → «Создать аккаунт» и ввести этот код.</div>`,
  foot: `${canShare ? `<button class="btn btn-primary" data-act="inv-share">${small(I.share, 18)} Отправить</button>` : ''}<button class="btn ${canShare ? 'btn-plain' : 'btn-primary'}" data-act="inv-copy">Скопировать</button>` }));
  el.querySelector('[data-act="inv-share"]')?.addEventListener('click', async () => {
    try { await navigator.share({ title: 'Приглашение в CABINA', text }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
  });
  el.querySelector('[data-act="inv-copy"]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Приглашение скопировано'); } catch { toast('Не удалось скопировать. Перепишите код вручную', { error: true, ms: 5000 }); }
  });
  return el;
}

let inviting = false;

export async function accountClick(act, b, ctx) {
  if (!act.startsWith('acc-')) return false;
  switch (act) {
    case 'acc-mode':
      A.mode = b.dataset.mode; A.note = ''; setPending(false);
      ctx.rerender(); window.scrollTo(0, 0);
      setTimeout(() => document.getElementById(A.mode === 'newpass' ? 'acc-pass' : 'acc-email')?.focus({ preventScroll: true }), 50);
      break;
    case 'acc-eye': {
      const inp = document.getElementById('acc-pass');
      if (!inp) break;
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? 'Скрыть' : 'Показать';
      b.setAttribute('aria-pressed', String(show));
      b.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      break;
    }
    case 'acc-consent-doc': openDoc('Согласие на обработку персональных данных', consentHtml()); break;
    case 'acc-policy': openDoc('Политика обработки персональных данных', policyHtml()); break;
    case 'acc-resend': {
      const r = A.mode === 'reset-sent' ? await recover(A.email) : await resend(A.email);
      if (r.ok) toast('Новый код отправлен. Старый больше не подходит'); else showError(r.error);
      break;
    }
    case 'acc-export': {
      const r = await exportMyData();
      if (!r.ok) { toast(r.error, { error: true, ms: 5000 }); break; }
      const day = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify({ app: 'CABINA', kind: 'account-data', exportedAt: new Date().toISOString(), data: r.data }, null, 2)], { type: 'application/json' });
      const res = await saveToDevice(blob, `cabina-account-data-${day}.json`);
      if (res === 'saved') toast('Файл с вашими данными сохранён');
      else if (res === 'failed') toast('Не удалось сохранить файл', { error: true });
      break;
    }
    case 'acc-stats': {
      const r = await adminStats();
      if (r.ok) showStats(r.data || {}); else toast(r.error, { error: true, ms: 5000 });
      break;
    }
    case 'acc-invite-new': {
      if (inviting) break;
      inviting = true;
      try {
        const r = await createInvite();
        if (r.ok) showInvite(r.code); else toast(r.error, { error: true, ms: 5000 });
      } finally { inviting = false; }
      break;
    }
    case 'acc-logout': {
      const ok = await confirmDialog({ title: 'Выйти из аккаунта?', text: 'Записи в этом телефоне останутся. Войти снова можно по почте и паролю.', ok: 'Выйти', danger: false });
      if (!ok) break;
      await signOut();
      A.mode = 'menu'; A.role = null;
      toast('Вы вышли из аккаунта');
      ctx.rerender(); window.scrollTo(0, 0);
      break;
    }
    case 'acc-delete': {
      const ok = await confirmDialog({
        title: 'Удалить аккаунт?',
        text: 'С сервера сразу удалится всё, что он о вас знает: почта, согласие, даты входа. Из резервных копий сервера — не позднее чем через 14 дней. Это и есть отзыв согласия. Записи в этом телефоне не пострадают.',
        ok: 'Удалить аккаунт',
      });
      if (!ok) break;
      const r = await deleteAccount();
      if (!r.ok) { toast(r.error, { error: true, ms: 5000 }); break; }
      A.mode = 'menu'; A.role = null;
      toast('Аккаунт удалён. Записи в телефоне на месте', { ms: 4000 });
      ctx.rerender(); window.scrollTo(0, 0);
      break;
    }
    default: return false;
  }
  return true;
}

export async function accountSubmit(e, ctx) {
  if (e.target.id !== 'acc-form') return false;
  e.preventDefault();
  if (A.busy) return true;
  const byCode = A.mode === 'sent' || A.mode === 'reset-sent';
  const email = byCode ? A.email : val('acc-email').trim();
  const pass = val('acc-pass');
  const code = normCode(val('acc-code'));
  if (A.mode !== 'newpass') A.email = email;
  if (A.mode !== 'newpass' && !emailOk(email)) { showError('Проверьте адрес почты.', byCode ? null : 'acc-email'); return true; }
  if (byCode && code.length < 6) { showError('Введите код из письма: 6 цифр.', 'acc-code'); return true; }
  if (['signup', 'newpass', 'reset-sent'].includes(A.mode) && pass.length < PASS_MIN) { showError(`Пароль слишком короткий: нужно не меньше ${PASS_MIN} символов.`, 'acc-pass'); return true; }
  if (A.mode === 'login' && !pass) { showError('Введите пароль.', 'acc-pass'); return true; }
  if (A.mode === 'signup') {
    A.invite = normInvite(val('acc-invite'));
    if (!A.invite) { showError('Введите код приглашения.', 'acc-invite'); return true; }
    if (!document.getElementById('acc-consent')?.checked) { showError('Отметьте согласие: без него аккаунт создать нельзя.'); document.getElementById('acc-consent')?.focus(); return true; }
    if (!document.getElementById('acc-policy-ok')?.checked) { showError('Отметьте, что ознакомились с политикой обработки данных.'); document.getElementById('acc-policy-ok')?.focus(); return true; }
  }
  showError('');
  setBusy(true);
  let r;
  try {
    if (A.mode === 'signup') r = await signUp({ email, password: pass, invite: A.invite, version: VERSION });
    else if (A.mode === 'login') r = await signIn({ email, password: pass });
    else if (A.mode === 'reset') r = await recover(email);
    else if (A.mode === 'newpass') r = await setPassword(pass);
    else if (A.mode === 'sent') r = await verifyCode({ email, code, type: 'signup' });
    else if (A.mode === 'reset-sent') {
      r = await verifyCode({ email, code, type: 'recovery' });
      // код подошёл — вход есть, теперь новый пароль; не сохранился — просим ещё раз на экране нового пароля
      if (r.ok) { r = await setPassword(pass); if (!r.ok) { A.mode = 'newpass'; setPending(false); ctx.rerender(); } }
    }
  } finally { setBusy(false); }
  if (!r) return true;
  if (!r.ok) {
    if (A.mode === 'login' && r.code === 'email_not_confirmed') { A.mode = 'sent'; A.note = 'Почта ещё не подтверждена.'; setPending(true); ctx.rerender(); return true; }
    showError(r.error, A.mode === 'signup' && /приглашени/.test(r.error) ? 'acc-invite' : null);
    return true;
  }
  const signedIn = (text) => { A.mode = 'menu'; A.note = ''; toast(text); ctx.rerender(); window.scrollTo(0, 0); return accountEnter(); };
  if (A.mode === 'signup') { A.invite = ''; A.mode = r.signedIn ? 'menu' : 'sent'; }
  else if (A.mode === 'login') await signedIn('Вы вошли в аккаунт');
  else if (A.mode === 'reset') A.mode = 'reset-sent';
  else if (A.mode === 'sent') await signedIn('Почта подтверждена. Вы вошли в аккаунт');
  else if (A.mode === 'newpass' || A.mode === 'reset-sent') await signedIn('Пароль изменён. Вы вошли в аккаунт');
  setPending(A.mode === 'sent' || A.mode === 'reset-sent');
  ctx.rerender(); window.scrollTo(0, 0);
  return true;
}

// Приложение открыли по ссылке из письма
export function accountRedirect(r) {
  if (!r) return null;
  if (r.error) { toast(linkErrorText(r.error), { error: true, ms: 6000 }); return null; }
  setPending(false);
  if (r.type === 'recovery') { A.mode = 'newpass'; return 'account'; }
  A.mode = 'menu';
  toast(r.type === 'signup' ? 'Почта подтверждена. Вы вошли в аккаунт' : 'Вы вошли в аккаунт', { ms: 4000 });
  return 'account';
}
