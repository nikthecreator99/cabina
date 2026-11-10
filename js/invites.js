// Личные приглашения (2.20, решение Никиты): экран «Пригласить коллег» — ссылка с кодом и QR-код, сколько засчитано,
// вещи для персонажа за 1, 3, 5 и 10 засчитанных приглашений (решение Никиты, тред «Конструктор аватаров»).
// Засчитано — приглашённый подтвердил почту и заходил в CABINA в 3 разных дня (так считает сервер).
// На сервере: хеш кода, кто создал, срок. Пригласивший видит только числа — без почты, имён и дат приглашённых.
// Код показывается один раз, в телефоне не хранится. Число засчитанных запоминается в телефоне и только растёт.
// Здесь же — плашки «кто из коллег сейчас в пути» для тех, кто без аккаунта: только в этом телефоне, не чаще раза в неделю.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, plural, dayMonth, layerCount } from './ui.js';
import { S, nowLocal } from './store.js';
import { dateKeyOf, DAY } from './calc.js';
import { legalReady, APP_URL } from './legal.js';
import { startAccount } from './account.js';
import { guestMedals } from './guest.js';
import { session, rpc, normInvite, inviteOk, inviteUrl, errorText, isGuest } from './auth.js';
import { avatarSvg, REWARDS, REWARD_TIERS, rewardReady } from './avatar.js';
import { hasAvatar } from './avatar-edit.js';
import { countOf, noteCount, awardSnapshot, awardNews, celebrate } from './awards.js';
import { ensureConsent, tzOffset } from './colleagues.js';
import { qrSvg } from './share.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
const when = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

// Ответ my_invites — непроверенное: только известные поля и простые значения
export function cleanMine(d) {
  d = d && typeof d === 'object' ? d : {};
  const open = (Array.isArray(d.open) ? d.open : []).filter((x) => x && UUID.test(String(x.id)) && when(x.expires_at) != null)
    .map((x) => ({ id: String(x.id).toLowerCase(), created: when(x.created_at), expires: when(x.expires_at) })).slice(0, 50);
  return { open, joined: int(d.joined, 0, 100000, 0), counted: int(d.counted, 0, 100000, 0), limit: int(d.limit, 1, 100, 10), needDays: int(d.need_days, 1, 30, 3) };
}

const N = { sub: null, data: null, at: 0, err: '', loading: null, busy: false };
let rerender = () => {};
export function initInvites(h) { rerender = h.rerender || rerender; }

const notReady = (r) => r && (r.status === 404 || /^(PGRST20\d|42883|42P01|42703)$/.test(String(r.data?.code || '')));
const msgOf = (r) => String(r?.data?.message || '');
const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const SERVER_OFF = 'Приглашения на сервере ещё не включены. Попробуйте позже.';
export function inviteError(r, limit = 10) {
  if (!r) return OFFLINE;
  if (notReady(r)) return SERVER_OFF;
  const m = msgOf(r);
  if (/cabina: limit/.test(m)) return `Неиспользованных приглашений уже ${limit}. Отмените ненужное или подождите, пока им воспользуются.`;
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  return errorText(r);
}

// Вещи, которые откроются при n засчитанных (только уже нарисованные)
const itemsOf = (n) => REWARDS.filter((r) => r.n === n && rewardReady(r));

// Запомнить число засчитанных: новая ступень «Наставника» — поздравление, новые вещи — сообщение
async function noteInvited(n) {
  const was = countOf('invited').n;
  const before = awardSnapshot();
  if (!(await noteCount('invited', n, dateKeyOf(nowLocal())))) return;
  const opened = REWARDS.filter((r) => was < r.n && n >= r.n && rewardReady(r));
  const news = awardNews(before);
  setTimeout(() => {
    if (news && !layerCount()) celebrate(news);
    if (opened.length) toast(`Открыто для персонажа: ${opened.map((r) => r.name).join(', ')}`, { ms: 5000 });
  }, 600);
}

// Свежие числа с сервера: при открытии приложения и экрана приглашений
export function loadInvites({ force = false } = {}) {
  const s = session();
  if (!s || !legalReady()) return Promise.resolve(null);
  if (N.sub !== s.sub) Object.assign(N, { sub: s.sub, data: null, at: 0, err: '' });
  if (N.loading) return N.loading;
  if (!force && N.data && Date.now() - N.at < 30e3) return Promise.resolve(N.data);
  const sub = N.sub;
  N.loading = (async () => {
    const r = await rpc('my_invites');
    if (session()?.sub !== sub) return null;
    if (!r?.ok) { N.err = !r ? 'offline' : notReady(r) ? 'server' : 'error'; return N.data; }
    N.data = cleanMine(r.data); N.at = Date.now(); N.err = '';
    await noteInvited(N.data.counted);
    return N.data;
  })().finally(() => { N.loading = null; });
  return N.loading.then((d) => { if (!layerCount()) rerender(); return d; });
}

// ---------------------------------------------------------------- экран «Пригласить коллег»

const wall = (abs) => abs + tzOffset();
const leftText = (n) => `ещё ${n} ${plural(n, 'приглашение', 'приглашения', 'приглашений')}`;

function tierHtml(t, counted) {
  const items = itemsOf(t.n);
  const got = counted >= t.n;
  const base = hasAvatar() ? S.profile.avatar : {};
  const patch = Object.fromEntries(items.map((r) => [r.k, r.id]));
  const pic = items.length ? avatarSvg({ ...base, ...patch }, { size: 72, crop: 'bust', bg: items.some((r) => r.k === 'bg'), cls: 'inv-pic' }) : `<span class="inv-gift">${I.gift}</span>`;
  const names = items.length ? items.map((r, i) => (i ? r.name.toLowerCase() : r.name)).join(' и ') : 'Вещь для персонажа — скоро';
  return `<div class="inv-tier${got ? ' got' : ''}" data-n="${t.n}">${pic}
    <div class="grow"><div class="t1">${esc(t.title)} <span class="hint">· ${t.n} ${plural(t.n, 'приглашение', 'приглашения', 'приглашений')}</span></div>
      <div class="t2">${esc(names)}</div></div>
    <span class="inv-state">${got ? `${small(I.check, 16)} Открыто` : esc(leftText(t.n - counted))}</span></div>`;
}

function openRow(x) {
  return `<div class="row inv-open"><span class="ico" style="--c:var(--accent)">${I.link}</span>
    <div class="grow"><div class="t1">Приглашение от ${esc(dayMonth(wall(x.created ?? Date.now())))}</div><div class="t2">Действует до ${esc(dayMonth(wall(x.expires)))}</div></div>
    <button class="btn btn-plain btn-sm" data-act="inv-drop" data-id="${esc(x.id)}">Отменить</button></div>`;
}

// Без входа (2.26): ссылку на CABINA отправить можно всем; вещи за приглашения — только из аккаунта (засчитывает сервер)
const needAccountHtml = () => `<p class="lead-hint">Отправьте коллеге ссылку на CABINA — это бесплатно.</p>
  <button class="btn btn-primary" data-act="inv-guest" id="inv-guest-send">${small(I.share, 18)} Отправить ссылку</button>
  ${rewardsNote()}`;
const rewardsNote = () => `<div class="notice ok gp-gift" id="inv-guest-gift">${I.gift}<div><b>Вещи для персонажа за приглашения</b> — с аккаунтом: за 1, 3, 5 и 10 коллег. Приглашение из аккаунта засчитается вам.
  <div class="gp-gift-btn"><button class="btn btn-primary btn-sm" data-act="acc-start" data-mode="signup">Зарегистрироваться</button></div></div></div>`;

// Окно «Пригласить коллег» для гостя: QR-код и ссылка на сайт CABINA, без кода и без данных человека
export const GUEST_SHARE_TEXT = `CABINA — учёт поездок, часов, отдыха и заработка для локомотивных бригад. Бесплатно: ${APP_URL}`;
export async function openGuestInvite() {
  const canShare = typeof navigator.share === 'function';
  const el = openLayer(sheet({ title: 'Пригласить коллег', tall: true, body: `<div class="share-box">
      <div class="qr-wrap" id="inv-qr"><div class="hint">Готовим QR-код…</div></div>
      <p class="share-how">Покажите QR-код коллеге — он наведёт камеру телефона. Или отправьте ссылку.</p>
      ${rewardsNote()}</div>`,
  foot: `${canShare ? `<button class="btn btn-primary" data-act="inv-share">${small(I.share, 18)} Отправить</button>` : ''}<button class="btn ${canShare ? 'btn-plain' : 'btn-primary'}" data-act="inv-copy">Скопировать</button>` }));
  el.querySelector('[data-act="inv-share"]')?.addEventListener('click', async () => {
    try { await navigator.share({ title: 'CABINA', text: GUEST_SHARE_TEXT }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
  });
  el.querySelector('[data-act="inv-copy"]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(GUEST_SHARE_TEXT); toast('Ссылка скопирована'); } catch { toast(`Не удалось скопировать. Адрес: ${APP_URL}`, { error: true, ms: 6000 }); }
  });
  // «Зарегистрироваться» внутри окна: окно закрываем и открываем форму
  el.querySelector('[data-act="acc-start"]').addEventListener('click', () => { closeLayer(el); document.dispatchEvent(new CustomEvent('cabina:go', { detail: 'signup' })); });
  const svg = await qrSvg(APP_URL, 'QR-код со ссылкой на CABINA').catch(() => '');
  const box = el.querySelector('#inv-qr');
  if (box) box.innerHTML = svg || '<div class="hint">Не удалось нарисовать QR-код — отправьте ссылку.</div>';
  return el;
}

export function renderInvites() {
  const head = pageHead('Пригласить коллег', { back: true });
  if (!legalReady() || !session()) return `${head}${needAccountHtml()}`;
  if (!N.data && !N.loading && !(N.err && Date.now() - N.at < 30e3)) loadInvites({ force: true });
  const d = N.data;
  const counted = Math.max(d?.counted || 0, countOf('invited').n);
  const need = d?.needDays || 3;
  const full = d && d.open.length >= d.limit;
  const status = !d ? `<div class="hint" id="inv-load">${N.err ? esc(N.err === 'server' ? SERVER_OFF : N.err === 'offline' ? OFFLINE : 'Не удалось загрузить приглашения. Попробуйте позже.') : 'Загружаем…'}</div>` : '';
  // 2.21.2 (Никита): «Создать приглашение» — в самом верху, лишнего текста нет
  return `${head}
    <button class="btn btn-primary" data-act="inv-new" id="inv-new"${full || !d ? ' disabled' : ''}>${I.plus} Создать приглашение</button>
    ${full ? `<div class="hint">Неиспользованных приглашений — ${d.limit}, больше нельзя. Отмените ненужное или подождите, пока им воспользуются.</div>` : ''}
    <p class="hint" id="inv-how">Засчитается, когда коллега подтвердит почту и зайдёт в CABINA в ${need} ${plural(need, 'разный день', 'разных дня', 'разных дней')}. Кто именно пришёл, не видно — только сколько.</p>
    ${status}
    ${d && d.open.length ? `<div class="group-title">Ждут коллегу <span class="hint">${d.open.length}</span></div><div class="panel" id="inv-open">${d.open.map(openRow).join('')}</div>` : ''}
    <div class="panel inv-sum" id="inv-sum">
      <div class="row"><span class="ico" style="--c:var(--ok)">${I.users}</span><div class="grow"><div class="t1">Засчитано</div></div><b class="num inv-n">${counted}</b></div>
      ${d && d.joined > d.counted ? `<div class="row"><div class="grow"><div class="t1">Ещё не засчитаны</div><div class="t2">Ждём подтверждения почты и ${need} ${plural(need, 'дня', 'дня', 'дней')} в CABINA</div></div><b class="num">${d.joined - d.counted}</b></div>` : ''}
    </div>
    <div class="group-title">Вещи для персонажа</div>
    <div class="panel inv-tiers" id="inv-tiers">${REWARD_TIERS.map((t) => tierHtml(t, counted)).join('')}</div>`;
}

// Приглашение готово: QR-код со ссылкой, код для ручного ввода, «Отправить» и «Скопировать». Показывается один раз.
export function inviteText(code, url) {
  return `Приглашаю в CABINA — учёт поездок, часов, отдыха и заработка для локомотивных бригад.\nОткройте ссылку и создайте аккаунт: ${url}\nЕсли ссылка не откроется: CABINA → Профиль → ⚙ Настройки → «Войти в аккаунт» → «Создать аккаунт», код приглашения: ${code}\nДействует 14 дней и только для одного человека.`;
}
async function showInvite(code, expires) {
  const url = inviteUrl(code);
  const nice = code.replace(/(.{5})(?=.)/g, '$1 ');
  const until = expires ? dayMonth(wall(expires)) : '';
  const canShare = typeof navigator.share === 'function';
  const el = openLayer(sheet({ title: 'Приглашение готово', tall: true, body: `<div class="share-box">
      <div class="qr-wrap" id="inv-qr"><div class="hint">Готовим QR-код…</div></div>
      <p class="share-how">Покажите QR-код коллеге — он наведёт камеру телефона. Или отправьте ссылку.</p>
      <div class="acc-code num" aria-label="Код приглашения">${esc(nice)}</div>
      <p class="share-ttl">${small(I.clock, 16)} Действует ${until ? `до ${esc(until)}` : '14 дней'}, только для одного человека</p>
      <div class="notice">${I.shield}<div>Код виден только сейчас: на сервере хранится лишь его зашифрованный отпечаток. Отправляйте тому, кого приглашаете.</div></div></div>`,
  foot: `${canShare ? `<button class="btn btn-primary" data-act="inv-share">${small(I.share, 18)} Отправить</button>` : ''}<button class="btn ${canShare ? 'btn-plain' : 'btn-primary'}" data-act="inv-copy">Скопировать</button>` }),
  { onClose: () => { if (!layerCount()) rerender(); } }); // окно закрыли — в списке уже новое приглашение
  const text = inviteText(code, url);
  el.querySelector('[data-act="inv-share"]')?.addEventListener('click', async () => {
    try { await navigator.share({ title: 'Приглашение в CABINA', text }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
  });
  el.querySelector('[data-act="inv-copy"]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Приглашение скопировано'); } catch { toast('Не удалось скопировать. Перепишите код вручную', { error: true, ms: 5000 }); }
  });
  const svg = await qrSvg(url, 'QR-код с приглашением').catch(() => '');
  const box = el.querySelector('#inv-qr');
  if (box) box.innerHTML = svg || '<div class="hint">Не удалось нарисовать QR-код — отправьте ссылку.</div>';
  return el;
}

async function createInvite() {
  let r = await rpc('create_invite');
  if (r && !r.ok && /consent required/.test(msgOf(r))) {
    if (!(await ensureConsent())) return;
    r = await rpc('create_invite');
  }
  if (!r?.ok) { toast(inviteError(r, N.data?.limit), { error: true, ms: 6000 }); if (/cabina: limit/.test(msgOf(r))) loadInvites({ force: true }); return; }
  const code = normInvite(r.data?.code);
  if (!inviteOk(code)) { toast(errorText({ status: 500 }), { error: true, ms: 5000 }); return; }
  await showInvite(code, when(r.data?.expires_at));
  loadInvites({ force: true });
}

// «Отправить приглашение» из других экранов (персонаж, 2.21): сразу окно с QR и ссылкой. Без входа — false (покажите экран приглашений).
export async function inviteNow() {
  if (!legalReady() || !session()) return false;
  if (N.busy) return true;
  N.busy = true;
  try { await createInvite(); } finally { N.busy = false; }
  return true;
}

export async function invitesClick(act, b) {
  if (act === 'inv-guest') { await openGuestInvite(); return true; }
  if (!act.startsWith('inv-') || !['inv-new', 'inv-drop'].includes(act)) return false;
  if (N.busy) return true;
  N.busy = true;
  try {
    if (act === 'inv-new') await createInvite();
    else {
      const id = String(b.dataset.id || '').toLowerCase();
      if (!UUID.test(id)) return true;
      const ok = await confirmDialog({ title: 'Отменить приглашение?', text: 'Код перестанет работать. Если коллега ещё не создал аккаунт, ему понадобится новое приглашение.', ok: 'Отменить приглашение', cancel: 'Оставить' });
      if (!ok) return true;
      const r = await rpc('drop_invite', { p_id: id });
      if (!r?.ok) { toast(inviteError(r), { error: true, ms: 5000 }); return true; }
      toast('Приглашение отменено');
      await loadInvites({ force: true });
    }
  } finally { N.busy = false; }
  return true;
}

// Строка «Пригласить коллег» в профиле (группа «Коллеги»), когда есть вход
export function inviteRowHtml() {
  if (!legalReady() || !session()) return '';
  // 2.21.2 (Никита): без подписи под строкой
  return `<button class="row" data-act="go" data-page="invites" id="inv-entry"><span class="ico" style="--c:var(--warn)">${I.gift}</span>
    <div class="grow"><div class="t1">Пригласить коллег</div></div>${small(I.right, 18)}</button>`;
}

// ---------------------------------------------------------------- плашки для тех, кто без аккаунта
// Только в этом телефоне (localStorage): когда показали, «Не сейчас» (30 дней), «Больше не показывать».
// Показываем, когда человек уже пользуется приложением (от 5 законченных поездок), не чаще раза в неделю,
// весь день показа; экран не закрываем, ничем не пугаем.
const NAG_KEY = 'cabina-signup-nag';
export const NAG_WEEK = 7 * DAY;
export const NAG_SNOOZE = 30 * DAY;
export const NAG_TRIPS = 3; // с 2.26 — с 3 законченных поездок (было 5): цель — больше регистраций
function nagState() {
  try { const x = JSON.parse(localStorage.getItem(NAG_KEY) || 'null'); return x && typeof x === 'object' ? x : {}; } catch { return {}; }
}
function saveNag(x) { try { localStorage.setItem(NAG_KEY, JSON.stringify(x)); } catch {} }
// Пора ли показать: st — что запомнено, now — миллисекунды, trips — сколько законченных поездок
export function nagDue(st, now, trips) {
  if (st.off || trips < NAG_TRIPS || now < (Number(st.snooze) || 0)) return false;
  const shown = Number(st.shown) || 0;
  return !shown || now - shown < DAY || now - shown >= NAG_WEEK;
}
const finished = () => S.trips.filter((t) => t.end).length;

// На главной: под карточкой месяца, если нет других плашек
export function signupNagHtml() {
  if (!isGuest()) return '';
  const st = nagState();
  const now = Date.now();
  if (!nagDue(st, now, finished())) return '';
  if (!st.shown || now - st.shown >= NAG_WEEK) saveNag({ ...st, shown: now });
  // 2.26: есть заработанные награды — зовём ими (они ждут в аккаунте), иначе — коллегами
  const n = guestMedals();
  const [ico, c, t1, t2] = n
    ? [I.medal, 'warn', `У вас уже ${n} ${plural(n, 'награда', 'награды', 'наград')}`, `${n === 1 ? 'Она ждёт' : 'Они ждут'} вас в аккаунте. Это бесплатно, поездки остаются в телефоне.`]
    : [I.users, 'ok', 'Кто из коллег сейчас в пути?', 'С аккаунтом это видно — если коллеги сами показывают вам статус. Записи остаются в телефоне.'];
  return `<div class="nag signup-nag" role="status" id="signup-nag"><span class="ico" style="--c:var(--${c})">${ico}</span>
    <div class="grow"><div class="t1">${t1}</div><div class="t2">${t2}</div></div>
    <div class="nag-btns"><button class="btn btn-primary btn-sm" data-act="nag-signup">Зарегистрироваться</button><button class="btn btn-ghost btn-sm" data-act="nag-snooze">Не сейчас</button>
      <button class="link-btn nag-off" data-act="nag-off">Больше не показывать</button></div></div>`;
}

export function nagClick(act, ctx) {
  if (act === 'nag-signup') { startAccount('signup'); ctx.go('account'); return true; }
  if (act === 'nag-snooze') { saveNag({ ...nagState(), snooze: Date.now() + NAG_SNOOZE }); toast('Хорошо, напомним через месяц'); ctx.rerender(); return true; }
  if (act === 'nag-off') { saveNag({ ...nagState(), off: true }); toast('Больше не покажем. Аккаунт — в Настройках'); ctx.rerender(); return true; }
  return false;
}
