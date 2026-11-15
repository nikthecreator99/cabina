// Группы коллег (2.22, решения Никиты 31.10 и 05.11.2026): бригада, колонна, депо — список людей с названием.
// Создать может любой, у кого есть аккаунт и «Коллеги»; создатель — администратор: переименовать, пригласить коллегу,
// показать или сменить код группы (QR), исключить, передать права, удалить группу. Вступить — только по приглашению
// администратора или по коду группы. Переписки и описания нет. Не больше 10 групп у человека и 200 участников в группе.
// Участники видят имена (и то, что человек разрешил в «Приватности») друг друга. Статус — только если человек сам
// включил «Показывать моей группе» именно в этой группе. Всё с сервера — непроверенное: текст только через esc().
// 2.27 (просьбы Никиты 10.11.2026): экран «Группы» по его макету («Вы администратор» / «Вы участник»), картинка группы (grp-pic.js),
// статус в группе — взаимно (видишь чужие, только если показываешь свой; станции — за станции; на сервере — private.allowed, шаг 9),
// постоянное напоминание со стрелкой к переключателю, «Предложить стать коллегами» из окна участника.
// 2.33 (решения Никиты 12.11.2026): поиск групп по названию. В поиске — только название и картинка (состава и числа участников нет).
// Администратор сам решает, видна ли группа в поиске (у новой — да, у старых — нет, пока не включит) и открытая ли она:
// в открытую вступают сразу, в закрытую — по заявке, которую администратор принимает или отклоняет (сервер — шаг 13).
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, plural, layerCount } from './ui.js';
import { privacyOf } from './profile.js';
import { S, saveProfile, nowLocal } from './store.js';
import { dateKeyOf } from './calc.js';
import { awardSnapshot, awardNews, celebrate, grantGroupAward } from './awards.js';
import { rpc, errorText } from './auth.js';
import { legalReady } from './legal.js';
import { qrSvg } from './share.js';
import { picSvg, openPicEditor, normPic } from './grp-pic.js';
import {
  colSnap, colSub, colMine, colSync, colRerender, colGo, colBack, colMarkStatusCleared, loadColleagues, ensureConsent, ensureCard, snapOrSay,
  notReady, OFFLINE, needAccount, cardAvatar, cardSub, pill, avaBox, colleagueLine, updatedText, teamGroup, TEAM_GROUPS, cleanText, groupShare, colError,
} from './colleagues.js';

export const GROUPS_MAX = 10;
export const GROUP_NAME_MAX = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const G = { id: null, busy: false, q: '', open: { status: false, place: false } };
const SERVER_OFF = 'Группы на сервере ещё не включены. Попробуйте позже.';

// Код группы: 10 знаков, буквы и цифры; в ссылке — после «#» (сервер сайта его не видит)
export const normGroupCode = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '');
export const groupCodeOk = (c) => /^[0-9A-Z]{10}$/.test(c);
export function groupFromHash(hash) {
  const m = /^#?group=([0-9A-Za-z-]{6,40})$/.exec(String(hash || ''));
  const c = m ? normGroupCode(m[1]) : '';
  return groupCodeOk(c) ? c : null;
}
export const groupUrl = (code, loc = globalThis.location) => `${loc.origin}${loc.pathname}#group=${code}`;

export function groupError(r) {
  if (!r) return OFFLINE;
  if (notReady(r)) return SERVER_OFF;
  const m = String(r.data?.message || '');
  if (/groups limit/.test(m)) return `Вы уже в ${GROUPS_MAX} группах — это наибольшее число. Выйдите из ненужной, чтобы вступить в новую.`;
  if (/group full/.test(m)) return 'В группе уже 200 человек — больше нельзя.';
  if (/short query/.test(m)) return 'Введите хотя бы 3 буквы или цифры.';
  if (/cabina: later/.test(m)) return 'Сейчас нельзя: администратор отклонил вашу заявку или исключил вас. Попробовать снова можно через 30 дней.';
  if (/banned/.test(m)) return 'Администратор исключил вас из этой группы. Вернуться можно только по его приглашению.';
  if (/cabina: limit/.test(m)) return 'На сегодня слишком много попыток. Попробуйте завтра.';
  if (/name required/.test(m)) return 'Сначала укажите имя в профиле.';
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  if (/forbidden/.test(m)) return 'Это может только администратор группы.';
  if (/not found/.test(m)) return 'Группа или человек не найдены. Обновите экран.';
  return errorText(r);
}
const fail = (r) => toast(groupError(r), { error: true, ms: 6000 });
const members = (n) => `${n} ${plural(n, 'участник', 'участника', 'участников')}`;
const groupOf = (id) => colSnap()?.groups.find((g) => g.id === id) || null;
const reload = () => loadColleagues({ force: true });
// Заявок в мои группы (я администратор) — для красного кружка и колокольчика
export const groupRequestsCount = (snap = colSnap()) => (snap?.groups || []).reduce((n, g) => n + (g.admin ? g.requests.length : 0), 0);

// ---------------------------------------------------------------- профиль: строка «Группы»

export function groupsRowHtml() {
  if (!legalReady() || !colMine()) return '';
  const snap = colSnap();
  if (snap && (!snap.groupsOn || !snap.consent.main)) return '';
  const n = snap?.groups.length || 0;
  const k = snap?.groupInvites.length || 0;
  const r = groupRequestsCount(snap);
  const sub = !snap ? 'Загружаем…' : n ? `${n} ${plural(n, 'группа', 'группы', 'групп')}${k ? ` · приглашений: ${k}` : ''}${r ? ` · заявок: ${r}` : ''}` : k ? 'Вас пригласили в группу' : 'Бригада, колонна или депо — списком';
  const badge = k + r;
  return `<button class="row" data-act="go" data-page="groups" id="grp-entry"><span class="ico" style="--c:var(--night)">${I.grid}</span>
    <div class="grow"><div class="t1">Группы</div><div class="t2">${esc(sub)}</div></div>${badge ? `<span class="col-badge" aria-label="Приглашений и заявок: ${badge}">${badge}</span>` : ''}${small(I.right, 18)}</button>`;
}

// ---------------------------------------------------------------- кто что видит в группе

// Что я показываю этой группе (общий выключатель статуса выключен — не показываю никому)
export function myShare(g) {
  const st = !!(g?.me?.status && privacyOf().status);
  return { status: st, place: st && !!g.me.place };
}
const relOf = (id) => {
  const snap = colSnap();
  if (snap?.colleagues.some((c) => c.id === id)) return 'colleague';
  if (snap?.outgoing.some((c) => c.id === id)) return 'out';
  if (snap?.incoming.some((c) => c.id === id)) return 'in';
  return 'none';
};
// Статус участника, который я вижу в группе. Взаимно (2.27, просьба Никиты 10.11.2026): только если я сам показываю этой группе
// свой статус, станции — только за свои станции (то же правило — на сервере, private.allowed). Коллега — по правилам коллег.
export function seenStatus(g, m) {
  if (!m?.status || m.id === colSub()) return null;
  if (relOf(m.id) === 'colleague') return m.status;
  const mine = myShare(g);
  if (!mine.status) return null;
  return mine.place ? m.status : { ...m.status, place: '', dest: '' };
}
const others = (g) => g.members.filter((m) => m.id !== colSub());
const showing = (g) => others(g).filter((m) => m.show.status).length;
// Статус коллег скрыт, потому что я свой не показываю: тогда — напоминание
const hiddenForMe = (g) => others(g).length > 0 && !myShare(g).status;

// Правда о том, что видно (проверено по statusPayload и colleagueLine): геолокации нет, станции — только из поездки и по «Где я»
const TRUTH = 'CABINA не знает, где вы находитесь: геолокации в приложении нет. Группа увидит только статус — «в пути», «на отдыхе», «между поездками», '
  + 'а станции из поездки — только если включите «Где я». Номер поезда и локомотива, точное время явки и причину отвлечения не видит никто.';
const ARROW = '<svg class="grp-arrow" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v15M6 13l6 6 6-6"/></svg>';

// ---------------------------------------------------------------- экран «Группы» (по макету Никиты 10.11.2026)

function inviteRow(i) {
  return `<div class="col-offer">
    <div class="col-who"><span class="grp-pic" aria-hidden="true">${picSvg(i.pic, { size: 44 })}</span><div class="grow"><div class="t1">${esc(i.name)}</div>
      <div class="t2">${i.from ? `Приглашает ${esc(i.from.name)}` : 'Вас пригласили в группу'}</div></div></div>
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="grp-decline" data-id="${esc(i.id)}">Отказаться</button><button class="btn btn-primary btn-sm" data-act="grp-accept" data-id="${esc(i.id)}">Вступить</button></div>
  </div>`;
}
function myRequestRow(r) {
  return `<div class="col-offer">
    <div class="col-who"><span class="grp-pic" aria-hidden="true">${picSvg(r.pic, { size: 44 })}</span><div class="grow"><div class="t1">${esc(r.name)}</div>
      <div class="t2">Ждёт решения администратора</div></div></div>
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="grp-unrequest" data-id="${esc(r.id)}">Отозвать заявку</button></div>
  </div>`;
}
function groupRow(g) {
  const sh = myShare(g);
  const nudge = hiddenForMe(g) ? `<div class="grp-row-nudge">${small(I.lock, 14)}<span>Покажите свой статус — увидите коллег</span></div>` : '';
  const r = g.admin ? g.requests.length : 0;
  return `<button class="row col-row grp-row" data-act="grp-open" data-id="${esc(g.id)}"><span class="grp-pic" aria-hidden="true">${picSvg(g.pic, { size: 48 })}</span>
    <div class="grow"><div class="t1">${esc(g.name)}</div><div class="t2">${esc([members(g.members.length), sh.status ? 'видят ваш статус' : '', r ? `заявок: ${r}` : ''].filter(Boolean).join(' · '))}</div>${nudge}</div>${r ? `<span class="col-badge" aria-label="Заявок: ${r}">${r}</span>` : ''}${small(I.right, 18)}</button>`;
}
const section = (title, list, id) => (list.length ? `<div class="grp-sec-title"><h2>${title}</h2><span class="grp-count">${list.length}</span></div>
  <div class="grp-cards" id="${id}">${list.map(groupRow).join('')}</div>` : '');

const needAccountHtml = (head) => `${head}<div class="notice ok">${I.shield}<div><b>Нужен аккаунт CABINA.</b> Группы работают через аккаунт. Без него CABINA работает как раньше: записи остаются в этом телефоне.</div></div>
  <button class="btn btn-primary" data-act="go" data-page="account">Настройки аккаунта</button>`;

export function renderGroups() {
  const head = pageHead('Группы', { back: true, right: `<button class="icon-btn grp-gear-btn" data-act="grp-gear" id="grp-gear" aria-label="Настройки групп">${I.gear}</button>` });
  if (!legalReady() || !colMine()) return needAccountHtml(head);
  const snap = colSnap();
  if (!snap) { if (!layerCount()) loadColleagues(); return `${head}<div class="hint" id="grp-sec">Загружаем…</div>`; }
  if (!snap.groupsOn) return `${head}<div class="notice">${I.info}<div>${SERVER_OFF}</div></div>`;
  if (!snap.consent.main) {
    return `${head}<div id="grp-sec"><div class="notice ok">${I.shield}<div><b>Новая редакция согласия.</b> В ней появились поиск групп и заявки. Чтобы создать группу или вступить в неё, прочитайте и примите согласие.</div></div>
      <button class="btn btn-primary" data-act="col-consent">Прочитать и принять</button></div>`;
  }
  if (!S.profile?.groupAward && snap.groups.some((g) => g.admin) && !layerCount()) setTimeout(groupAward, 0);
  const full = snap.groups.length >= GROUPS_MAX;
  const q = G.q;
  return `${head}<div id="grp-sec">
    <p class="grp-lead">Бригада, колонна, депо — все ваши люди одним списком</p>
    ${snap.groups.length ? '' : `<div class="grp-top">
      <button class="btn btn-primary" data-act="grp-new" id="grp-new">${I.plus} Создать</button>
      <button class="btn btn-plain" data-act="grp-code-enter" id="grp-join">${small(I.qr, 20)} Вступить по коду</button>
    </div>`}
    ${full ? `<div class="hint">Групп уже ${GROUPS_MAX} — больше нельзя. Выйдите из ненужной, чтобы вступить в новую.</div>` : ''}
    ${snap.myRequests.length ? `<div class="grp-sec-title"><h2>Ваши заявки</h2><span class="grp-count">${snap.myRequests.length}</span></div><div class="panel col-offers" id="grp-myreq">${snap.myRequests.map(myRequestRow).join('')}</div>` : ''}
    ${snap.groupInvites.length ? `<div class="grp-sec-title"><h2>Приглашают в группу</h2><span class="grp-count">${snap.groupInvites.length}</span></div><div class="panel col-offers" id="grp-invites">${snap.groupInvites.map(inviteRow).join('')}</div>` : ''}
    ${snap.groups.length || snap.searchOn ? `<div class="search grp-search"><span aria-hidden="true">${small(I.search, 18)}</span><input type="search" class="input" id="grp-q" placeholder="Найти группу" autocomplete="off" enterkeyhint="search" maxlength="${GROUP_NAME_MAX}" value="${esc(q)}" aria-label="Найти группу">${q ? `<button class="search-x" data-act="grp-q-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>` : ''}</div>` : ''}
    ${snap.groups.length ? `<div id="grp-list">${groupsListHtml(snap)}</div>`
      : `<div class="hint grp-empty">Вы пока не в группе. Создайте свою${snap.searchOn ? ', найдите по названию' : ''} или вступите по коду, который даст администратор группы.</div>`}
    <div id="grp-found">${foundHtml(snap)}</div>
  </div>`;
}

// Поиск (2.33.1): одна строка «Найти группу» — свои группы сразу, остальные (открытые и показанные в поиске) — с сервера. Название, без учёта регистра, «ё» и знаков («тд64» найдёт «ТД-64»)
const foldName = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export const groupMatch = (g, q) => {
  const words = String(q || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).map(foldName).filter(Boolean);
  const hay = foldName(g.name);
  return words.every((w) => hay.includes(w));
};
function groupsListHtml(snap) {
  const list = snap.groups.filter((g) => groupMatch(g, G.q));
  if (!list.length) return G.q && snap.searchOn && searchable(G.q) ? '' : `<div class="hint grp-empty" id="grp-none">Группы с таким названием нет.</div>`;
  return `${section('Вы администратор', list.filter((g) => g.admin), 'grp-admin')}${section('Вы участник', list.filter((g) => !g.admin), 'grp-mem')}`;
}
// Ввод в строке поиска (вызывает app.js): перерисовываем только список, чтобы не терять фокус
export function groupsInput(t) {
  if (t.id !== 'grp-q') return false;
  G.q = t.value;
  const snap = colSnap();
  const box = document.getElementById('grp-list');
  if (box && snap) box.innerHTML = groupsListHtml(snap);
  scheduleFind();
  const x = t.parentElement.querySelector('.search-x');
  if (G.q && !x) t.parentElement.insertAdjacentHTML('beforeend', `<button class="search-x" data-act="grp-q-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>`);
  else if (!G.q && x) x.remove();
  return true;
}
export function groupsReset() { G.q = ''; G.found = null; clearTimeout(findTimer); }

// Остальные группы — с сервера (rpc find_groups: только открытые и показанные в поиске, без состава). От 3 знаков, с паузой,
// чтобы не тратить дневной лимит поиска на каждую букву; повторный запрос с тем же текстом не уходит
const searchable = (q) => cleanText(q, 60).replace(/[^0-9a-zа-яё]/gi, '').length >= 3;
let findTimer = 0;
function foundHtml(snap) {
  if (!snap?.searchOn || !G.found || !searchable(G.q)) return '';
  const f = G.found;
  if (f.err) return `<div class="hint grp-empty" id="grp-find-err">${esc(f.err)}</div>`;
  if (!f.list) return '<div class="hint grp-empty" id="grp-find-wait">Ищем…</div>';
  const mine = new Set(snap.groups.map((g) => g.id));
  const list = f.list.filter((x) => !mine.has(x.id));
  if (!list.length) return snap.groups.some((g) => groupMatch(g, G.q)) ? '' : '<div class="hint grp-empty" id="grp-find-none">Группы с таким названием нет. Возможно, администратор не показывает её в поиске — попросите у него код.</div>';
  return `<div class="grp-sec-title"><h2>Найдены в поиске</h2></div><div class="panel" id="grp-find-list">${list.map(findRow).join('')}</div>
    <p class="hint grp-find-how">Видно только название и картинку — кто в группе, не видно.</p>`;
}
function paintFound() {
  const box = document.getElementById('grp-found');
  const snap = colSnap();
  if (box && snap) box.innerHTML = foundHtml(snap);
}
function scheduleFind() {
  clearTimeout(findTimer);
  const snap = colSnap();
  if (!snap?.searchOn || !searchable(G.q)) { G.found = null; paintFound(); return; }
  const q = cleanText(G.q, 60);
  if (G.found && G.found.q === q && !G.found.err) { paintFound(); return; }
  G.found = { q, list: null }; paintFound();
  findTimer = setTimeout(() => doFind(q), 700);
}
async function doFind(q) {
  if (!document.getElementById('grp-q') || cleanText(G.q, 60) !== q) return;
  if (!(await ready())) { G.found = null; paintFound(); return; }
  const r = await rpc('find_groups', { p_q: q });
  if (cleanText(G.q, 60) !== q) return; // пока ждали, человек уже печатает другое
  G.found = r?.ok ? { q, list: cleanFound(r.data) } : { q, err: groupError(r) };
  paintFound();
}

// ---------------------------------------------------------------- экран одной группы

function memberRow(m, g) {
  const me = m.id === colSub();
  // своя карточка могла ещё не прийти с сервера — своё имя берём из профиля
  if (me && m.card.name === 'Без имени' && cleanText(S.profile.name)) m = { ...m, card: { ...m.card, name: cleanText(S.profile.name) } };
  const rel = me ? '' : relOf(m.id);
  const st = seenStatus(g, m);
  const line = st ? colleagueLine(st) : null;
  const locked = !me && !line && m.show.status && !myShare(g).status && rel !== 'colleague';
  const tag = [m.admin ? '<span class="col-tag ok">администратор</span>' : '', me ? '<span class="col-tag">вы</span>' : '', rel === 'colleague' ? '<span class="col-tag">коллега</span>' : ''].join('');
  const sub = line ? `<div class="t2">${pill(line)}</div><div class="col-upd">${esc(updatedText(st.at))}</div>`
    : locked ? `<div class="t2 grp-lock">${small(I.lock, 14)}<span>Статус скрыт. Покажите свой — увидите его</span></div>`
      : `<div class="t2">${esc(me ? (myShare(g).status ? 'Группа видит ваш статус' : 'Группа не видит ваш статус') : cardSub(m.card) || 'Статус группе не показывает')}</div>`;
  const body = `${avaBox(m.card)}<div class="grow"><div class="t1">${esc(m.card.name)} ${tag}</div>${sub}</div>`;
  return me ? `<div class="row col-row">${body}</div>` : `<button class="row col-row" data-act="grp-member" data-id="${esc(m.id)}">${body}${small(I.right, 18)}</button>`;
}
function membersHtml(g) {
  const now = Date.now();
  const groups = TEAM_GROUPS.map(() => []);
  for (const m of g.members) groups[m.id === colSub() ? 3 : teamGroup(seenStatus(g, m), now)].push(m);
  const titled = groups.filter((x) => x.length).length > 1;
  return groups.map((x, i) => (x.length ? `${titled ? `<div class="group-title col-gt">${TEAM_GROUPS[i]} <span class="hint">${x.length}</span></div>` : ''}<div class="panel">${x.map((m) => memberRow(m, g)).join('')}</div>` : '')).join('');
}
function shareRows(g) {
  const { status: st, place: pl } = myShare(g);
  const placeSub = !st ? 'Сначала включите статус' : !pl && others(g).some((m) => m.show.place) ? 'Станции коллег видны тем, кто показывает свои' : 'Станции из вашей поездки и дом отдыха';
  const row = (item, title, sub, on, off = false) => `<div class="row"><div class="grow"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
    <button class="switch" role="switch" data-act="grp-share" data-item="${item}" aria-checked="${on}" aria-label="${title}" ${off ? 'disabled' : ''}></button></div>`;
  return row('status', 'Показывать мой статус группе', 'В пути, на отдыхе, между поездками — без станций', st)
    + row('place', 'Где я', placeSub, pl, !st);
}
// Коротко, что группа видит сейчас — подпись у кнопки «Приватность»
function privSummary(g) {
  const { status: st, place: pl } = myShare(g);
  return !st ? 'Свой статус группе не показываю' : pl ? 'Показываю статус и где я' : 'Показываю статус, без станций';
}
// Окно «Приватность в группе» (2.28, просьба Никиты: не занимать полэкрана): переключатели и честный текст про геолокацию
const privBody = (g) => `<div class="panel" id="grp-share">${shareRows(g)}</div>
  <div class="notice ok grp-truth" id="grp-truth">${I.shield}<div>${TRUTH}</div></div>`;
function openPriv(g) {
  const el = openLayer(sheet({ title: 'Приватность в группе', body: `<p class="hint grp-priv-lead">Что видят участники группы «${esc(g.name)}». Всё выключено, пока вы сами не включите.</p><div id="grp-priv-body">${privBody(g)}</div>` }),
    { onClose: () => colRerender() });
  // окна не входят в общий разбор нажатий экрана — переключатели обрабатываем здесь
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="grp-share"]');
    if (b) groupsClick('grp-share', b);
  });
}
// Постоянное напоминание над кнопкой «Приватность», пока я свой статус не показываю: стрелка — на переключатель
function nudgeHtml(g) {
  if (!hiddenForMe(g)) return '';
  const n = showing(g);
  const all = others(g).length;
  return `<button class="grp-nudge" id="grp-nudge" data-act="grp-priv"><div class="grow"><b>Хотите видеть, где коллеги?</b>
    <span>Покажите группе свой статус — и увидите их.${n ? ` Уже показывают: ${n} из ${all}.` : ''} Нажмите «Приватность» ниже.</span></div>${ARROW}</button>`;
}

export function renderGroup() {
  const g = groupOf(G.id);
  if (!g) {
    return `${pageHead('Группа', { back: true })}<div class="empty"><div class="em-ico">${I.grid}</div><b>Группы больше нет</b><p>Вас исключили, вы вышли или группу удалили.</p></div>`;
  }
  const pic = picSvg(g.pic, { size: 64 });
  return `${pageHead(g.name, { back: true, right: g.admin ? `<button class="icon-btn" data-act="grp-edit" id="grp-edit" aria-label="Изменить название и картинку группы">${I.edit}</button>` : '' })}
    <div id="grp-page" data-id="${esc(g.id)}">
    <div class="grp-hero">
      ${g.admin ? `<button class="grp-pic grp-pic-big" data-act="grp-pic" id="grp-pic" aria-label="Изменить картинку группы">${pic}</button>` : `<span class="grp-pic grp-pic-big" aria-hidden="true">${pic}</span>`}
      <div class="grow"><p class="hint grp-sub">${esc(members(g.members.length))}${g.admin ? ' · вы администратор' : ''}</p>
        ${g.listed ? `<p class="hint grp-mode" id="grp-mode">${g.open ? 'Открытая группа: её найдут по названию, вступить может любой' : `Группу найдут по названию. Вступить — по заявке${g.admin ? '' : ', которую одобряет администратор'}`}</p>` : ''}</div>
    </div>
    ${g.admin ? `<div class="grp-btns"><button class="btn btn-primary" data-act="grp-invite" id="grp-invite">${I.plus} Пригласить коллегу</button>
      <button class="btn btn-plain" data-act="grp-code" id="grp-code" aria-label="Код и QR-код группы">${small(I.qr, 18)} QR-код</button></div>` : ''}
    ${g.admin && g.requests.length ? `<div class="grp-sec-title"><h2>Заявки на вступление</h2><span class="grp-count">${g.requests.length}</span></div>
      <div class="panel col-offers" id="grp-reqs">${g.requests.map(requestRow).join('')}</div>` : ''}
    ${nudgeHtml(g)}
    <div class="panel grp-privpanel"><button class="row" data-act="grp-priv" id="grp-priv-btn"><span class="ico" style="--c:var(--ok)">${I.shield}</span>
      <div class="grow"><div class="t1">Приватность</div><div class="t2">${esc(privSummary(g))}</div></div>${small(I.right, 18)}</button></div>
    <div class="group-title">Участники</div>
    <div id="grp-members">${membersHtml(g)}</div>
    ${g.admin && g.pending.length ? `<div class="group-title">Ждут ответа</div><div class="panel" id="grp-pending">${g.pending.map((p) => `<div class="row col-row">${avaBox(p.card)}<div class="grow"><div class="t1">${esc(p.card.name)}</div><div class="t2">Приглашён в группу</div></div>
      <button class="btn btn-plain btn-sm" data-act="grp-uninvite" data-id="${esc(p.id)}" aria-label="Отменить приглашение: ${esc(p.card.name)}">Отменить</button></div>`).join('')}</div>` : ''}
    <div class="grp-foot">
      <button class="link-btn col-leave" data-act="grp-leave" id="grp-leave">Выйти из группы</button>
      ${g.admin ? '<button class="link-btn col-leave" data-act="grp-delete" id="grp-delete">Удалить группу</button>' : ''}
    </div></div>`;
}
export const openGroupPage = (id) => { G.id = id; colGo('group'); };

// Заявка в мою группу (администратор): имя, должность и то, что человек разрешил в «Приватности»
function requestRow(r) {
  return `<div class="col-offer grp-req" data-id="${esc(r.id)}">
    <div class="col-who">${avaBox(r.card)}<div class="grow"><div class="t1">${esc(r.card.name)}</div><div class="t2">${esc(cardSub(r.card) || 'Хочет вступить в группу')}</div></div></div>
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="grp-req-no" data-id="${esc(r.id)}" aria-label="Отклонить заявку: ${esc(r.card.name)}">Отклонить</button><button class="btn btn-primary btn-sm" data-act="grp-req-yes" data-id="${esc(r.id)}" aria-label="Принять в группу: ${esc(r.card.name)}">Принять</button></div>
  </div>`;
}

// ---------------------------------------------------------------- окна

// Название группы: создать или переименовать
// listed — показать переключатель «Показывать в поиске» (у новой группы — включён, решение Никиты 12.11.2026)
function nameSheet({ title, value = '', ok, listed = null }) {
  return new Promise((resolve) => {
    let result = null;
    let inSearch = listed === true;
    const el = openLayer(sheet({ title, body: `<div class="pay-field"><label for="grp-name">Название группы</label>
        <input class="input" id="grp-name" maxlength="${GROUP_NAME_MAX}" autocomplete="off" enterkeyhint="done" placeholder="Например, Колонна 3" value="${esc(value)}">
        <div class="hint">До ${GROUP_NAME_MAX} знаков. Не пишите в названии имена, телефоны и служебную информацию.</div></div>
      ${listed === null ? '' : `<div class="panel"><div class="row"><div class="grow"><div class="t1">Показывать в поиске</div>
        <div class="t2">Найдут по названию и подадут заявку. Видны только название и картинка, кто в группе — нет</div></div>
        <button class="switch" role="switch" id="grp-name-listed" aria-checked="${inSearch}" aria-label="Показывать в поиске"></button></div></div>`}
      <div id="grp-name-err" class="acc-err" role="alert" aria-live="assertive"></div>`,
    foot: `<button class="btn btn-primary" data-act="grp-name-ok">${esc(ok)}</button>` }), { onClose: () => resolve(result) });
    const input = el.querySelector('#grp-name');
    const done = () => {
      const v = cleanText(input.value, GROUP_NAME_MAX);
      if (!v) { el.querySelector('#grp-name-err').innerHTML = `<div class="error-box">${I.alert}<span>Введите название.</span></div>`; input.focus(); return; }
      result = listed === null ? v : { name: v, listed: inSearch }; closeLayer(el);
    };
    el.querySelector('#grp-name-listed')?.addEventListener('click', (e) => { inSearch = !inSearch; e.currentTarget.setAttribute('aria-checked', String(inSearch)); });
    el.querySelector('[data-act="grp-name-ok"]').addEventListener('click', done);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    setTimeout(() => input.focus(), 60);
  });
}

async function ready() {
  if (!colMine()) { needAccount(); return null; }
  const snap = await snapOrSay();
  if (!snap) return null;
  if (!snap.groupsOn) { toast(SERVER_OFF, { error: true, ms: 5000 }); return null; }
  if (!(await ensureConsent())) return null;
  return snap;
}

// «Своя бригада» (2.32.1): награда за созданную группу; тем, кто уже администратор группы, — при открытии «Групп»
let awardBusy = false;
async function groupAward() {
  if (awardBusy || S.profile?.groupAward) return;
  awardBusy = true;
  try {
    const before = awardSnapshot();
    if (await grantGroupAward(dateKeyOf(nowLocal()))) { const news = awardNews(before); if (news) setTimeout(() => celebrate(news), 900); }
  } catch {} finally { awardBusy = false; }
}

async function createGroup() {
  if (!(await ready()) || !(await ensureCard())) return;
  const searchOn = !!colSnap()?.searchOn;
  const res = await nameSheet({ title: 'Новая группа', ok: 'Создать', listed: searchOn ? true : null });
  const name = typeof res === 'string' ? res : res?.name;
  if (!name) return;
  const r = await rpc('create_group', { p_name: name });
  if (!r?.ok) { fail(r); return; }
  let listed = false;
  if (res?.listed && UUID.test(String(r.data))) {
    const s2 = await rpc('set_group_search', { p_group: String(r.data), p_listed: true, p_open: false });
    listed = !!s2?.ok;
    if (!listed) toast('Группа создана, но в поиск не попала. Включите это в карандаше вверху группы', { error: true, ms: 6000 });
  }
  await reload();
  toast(listed ? 'Группа создана и видна в поиске. Заявки появятся в группе' : 'Группа создана. Пригласите коллег — или покажите им код группы');
  groupAward();
  if (UUID.test(String(r.data))) openGroupPage(String(r.data).toLowerCase());
}

// Код группы: показать (или сменить) QR-код и ссылку
async function showCode(g, fresh = false) {
  const r = await rpc('group_code', { p_group: g.id, p_new: fresh });
  const code = r?.ok ? normGroupCode(r.data) : '';
  if (!groupCodeOk(code)) { fail(r); return; }
  const url = groupUrl(code);
  const nice = code.replace(/(.{5})(?=.)/g, '$1 ');
  const canShare = typeof navigator.share === 'function';
  const text = `Вступайте в группу «${g.name}» в CABINA: ${url}\nЕсли ссылка не откроется: CABINA → Профиль → «Группы» → «Вступить по коду», код: ${code}`;
  const el = openLayer(sheet({ title: 'Код группы', tall: true, body: `<div class="share-box">
      <div class="qr-wrap" id="grp-qr"><div class="hint">Готовим QR-код…</div></div>
      <p class="share-how">Покажите QR-код коллеге — он наведёт камеру телефона. Или отправьте ссылку.</p>
      <div class="acc-code num" aria-label="Код группы" id="grp-code-text">${esc(nice)}</div>
      <div class="notice">${I.shield}<div>Вступить по коду может любой, у кого он есть. Отправляйте только своим. Если код попал не туда — смените его: старый сразу перестанет работать.</div></div>
      <button class="link-btn" data-act="grp-code-new" id="grp-code-new">Сменить код</button></div>`,
  foot: `${canShare ? `<button class="btn btn-primary" data-act="grp-code-share">${small(I.share, 18)} Отправить</button>` : ''}<button class="btn ${canShare ? 'btn-plain' : 'btn-primary'}" data-act="grp-code-copy">Скопировать</button>` }));
  el.querySelector('[data-act="grp-code-share"]')?.addEventListener('click', async () => {
    try { await navigator.share({ title: `Группа «${g.name}» в CABINA`, text }); } catch (err) { if (err?.name !== 'AbortError') toast('Не удалось открыть «Поделиться»', { error: true }); }
  });
  el.querySelector('[data-act="grp-code-copy"]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Ссылка скопирована'); } catch { toast('Не удалось скопировать. Перепишите код вручную', { error: true, ms: 5000 }); }
  });
  el.querySelector('[data-act="grp-code-new"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Сменить код?', ok: 'Сменить', danger: false, text: 'Старый код и ссылка сразу перестанут работать. Те, кто уже в группе, в ней останутся.' });
    if (!ok) return;
    closeLayer(el);
    await showCode(g, true);
    toast('Код сменён');
  });
  const svg = await qrSvg(url, 'QR-код группы').catch(() => '');
  const box = el.querySelector('#grp-qr');
  if (box) box.innerHTML = svg || '<div class="hint">Не удалось нарисовать QR-код — отправьте ссылку.</div>';
}

// Вступить по коду: сначала показываем, что за группа, и что увидят её участники
export async function joinByCode(raw) {
  const snap = await ready();
  if (!snap) return;
  const code = normGroupCode(raw);
  if (!groupCodeOk(code)) { toast('Код группы — 10 букв и цифр. Проверьте его.', { error: true, ms: 5000 }); return; }
  const r = await rpc('peek_group', { p_code: code });
  if (!r?.ok) { fail(r); return; }
  const x = r.data && typeof r.data === 'object' ? r.data : null;
  if (!x || !UUID.test(String(x.id))) { toast('Группа с таким кодом не найдена. Возможно, администратор сменил код.', { error: true, ms: 6000 }); return; }
  const id = String(x.id).toLowerCase();
  const name = cleanText(typeof x.name === 'string' ? x.name : '', GROUP_NAME_MAX) || 'Группа';
  if (x.member === true) { await reload(); openGroupPage(id); return; }
  const pv = privacyOf();
  const shown = ['имя', 'должность', pv.depot ? 'депо' : '', pv.avatar ? 'персонажа' : ''].filter(Boolean).join(', ');
  const n = Number.isInteger(x.members) && x.members > 0 ? x.members : 0;
  const ok = await confirmDialog({ title: `Вступить в «${name}»?`, ok: 'Вступить', danger: false,
    text: `${n ? `В группе ${members(n)}. ` : ''}Участники увидят ваше ${shown}. Свой статус группе вы показываете, только если сами включите.` });
  if (!ok || !(await ensureCard())) return;
  const j = await rpc('join_group', { p_code: code });
  if (!j?.ok) { fail(j); return; }
  if (!UUID.test(String(j.data))) { toast('Группа с таким кодом не найдена. Возможно, администратор сменил код.', { error: true, ms: 6000 }); return; }
  await reload();
  toast(`Вы в группе «${name}»`);
  openGroupPage(id);
}

function enterCode() {
  const el = openLayer(sheet({ title: 'Вступить по коду', body: `<div class="pay-field"><label for="grp-code-in">Код группы</label>
      <input class="input num" id="grp-code-in" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="10 букв и цифр"></div>
    <div class="hint">Код даёт администратор группы. Если у вас QR-код — наведите на него обычную камеру телефона, откроется CABINA.</div>`,
  foot: '<button class="btn btn-primary" data-act="grp-code-go">Дальше</button>' }));
  const input = el.querySelector('#grp-code-in');
  const go = () => { const v = input.value; closeLayer(el); joinByCode(v); };
  el.querySelector('[data-act="grp-code-go"]').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  setTimeout(() => input.focus(), 60);
}

// Пригласить коллег (администратор): только те, кто уже ваш коллега и ещё не в группе
function inviteSheet(g) {
  const snap = colSnap();
  const pool = (snap?.colleagues || []).filter((c) => !g.members.some((m) => m.id === c.id) && !g.pending.some((p) => p.id === c.id));
  const picked = new Set();
  const el = openLayer(sheet({ title: 'Пригласить в группу', tall: true, body: pool.length
    ? `<p class="hint">Пригласить можно своих коллег. Каждый получит приглашение и сам решит, вступать ли. Остальным покажите код группы.</p>
      <div class="acc-who" id="grp-pick">${pool.map((c) => `<button type="button" class="pick-row" role="checkbox" aria-checked="false" data-id="${esc(c.id)}"><span class="box">${I.check}</span>${avaBox(c.card)}<span class="t1">${esc(c.card.name)}</span></button>`).join('')}</div>
      <div id="grp-pick-err" class="acc-err" role="alert" aria-live="assertive"></div>`
    : `<p class="hint">Все ваши коллеги уже в группе или приглашены. Новых людей пригласите кодом группы.</p>`,
  foot: pool.length ? '<button class="btn btn-primary" data-act="grp-invite-ok">Пригласить</button>' : '<button class="btn btn-primary" data-act="grp-invite-code">Код и QR-код группы</button>' }));
  el.addEventListener('click', async (e) => {
    const p = e.target.closest('.pick-row');
    if (p) { const id = p.dataset.id; if (picked.has(id)) picked.delete(id); else picked.add(id); p.setAttribute('aria-checked', String(picked.has(id))); return; }
    if (e.target.closest('[data-act="grp-invite-code"]')) { closeLayer(el); showCode(g); return; }
    if (!e.target.closest('[data-act="grp-invite-ok"]') || G.busy) return;
    if (!picked.size) { el.querySelector('#grp-pick-err').innerHTML = `<div class="error-box">${I.alert}<span>Отметьте, кого пригласить.</span></div>`; return; }
    G.busy = true;
    try {
      let sent = 0;
      for (const id of picked) {
        const r = await rpc('invite_to_group', { p_group: g.id, p_user: id });
        if (!r?.ok) { fail(r); break; }
        sent++;
      }
      if (sent) { closeLayer(el); toast(sent === 1 ? 'Приглашение отправлено' : `Отправлено приглашений: ${sent}`); }
      await reload();
    } finally { G.busy = false; }
  });
}

// Участник: статус (взаимно), «Предложить стать коллегами» (2.27); администратору — «Сделать администратором» и «Исключить»
function memberSheet(g, id) {
  const m = g.members.find((x) => x.id === id);
  if (!m) return;
  const st = seenStatus(g, m);
  const line = st ? colleagueLine(st) : null;
  const rel = relOf(m.id);
  const locked = !line && m.show.status && !myShare(g).status && rel !== 'colleague';
  const relHtml = rel === 'colleague' ? '<div class="hint grp-rel" id="grp-rel">Вы коллеги</div>'
    : rel === 'out' ? '<div class="hint grp-rel" id="grp-rel">Вы предложили стать коллегами — ждём ответа</div>'
      : rel === 'in' ? '<div class="hint grp-rel" id="grp-rel">Предлагает вам стать коллегами</div>' : '';
  const offerBtn = rel === 'none' ? `<button class="btn btn-primary" data-act="grp-offer" id="grp-offer">${small(I.users, 18)} Предложить стать коллегами</button>`
    : rel === 'in' ? `<button class="btn btn-primary" data-act="grp-offer" id="grp-offer">${small(I.check, 18)} Принять: стать коллегами</button>` : '';
  const adminBtns = g.admin && !m.admin ? `<button class="btn btn-plain" data-act="grp-make-admin">Сделать администратором</button><button class="btn btn-danger" data-act="grp-remove">${small(I.trash, 18)} Исключить из группы</button>` : '';
  const el = openLayer(sheet({ title: 'Участник группы', body: `
    <section class="profile-card col-card">
      <span class="avatar view big">${cardAvatar(m.card, 132)}</span>
      <div class="profile-name">${esc(m.card.name)}</div>
      ${cardSub(m.card) ? `<div class="profile-sub">${esc(cardSub(m.card))}</div>` : ''}
      ${m.admin ? '<div class="profile-sub">Администратор группы</div>' : ''}
      ${line ? `${pill(line, 'pr-status')}<div class="hint">${esc(updatedText(st.at))}</div>`
    : locked ? `<div class="hint grp-lock">${small(I.lock, 14)}<span>Статус скрыт: покажите группе свой — и увидите его.</span></div>` : '<div class="hint">Статус этой группе не показывает.</div>'}
      ${relHtml}
    </section>
    ${offerBtn}
    ${rel === 'none' ? '<p class="hint">Коллеги видят друг друга в «Мои коллеги». Свой статус каждый показывает сам — кому захочет.</p>' : ''}`,
  foot: adminBtns }));
  el.querySelector('[data-act="grp-offer"]')?.addEventListener('click', async () => {
    if (G.busy) return;
    G.busy = true;
    try { if (await offerColleague(m, rel)) closeLayer(el); } finally { G.busy = false; }
  });
  el.querySelector('[data-act="grp-make-admin"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Передать права?', ok: 'Передать', danger: false,
      text: `Администратором станет ${m.card.name}. Вы останетесь в группе обычным участником. Администратор в группе один.` });
    if (!ok) return;
    const r = await rpc('make_group_admin', { p_group: g.id, p_user: m.id });
    if (!r?.ok) { fail(r); return; }
    closeLayer(el); toast('Права администратора переданы'); await reload();
  });
  el.querySelector('[data-act="grp-remove"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Исключить из группы?', ok: 'Исключить',
      text: `${m.card.name} перестанет видеть группу и её участников. По коду вернуться не сможет 30 дней — только по вашему приглашению.` });
    if (!ok) return;
    const r = await rpc('remove_from_group', { p_group: g.id, p_user: m.id });
    if (!r?.ok) { fail(r); return; }
    closeLayer(el); toast('Исключён из группы'); await reload();
  });
}

// Предложить участнику группы стать коллегами (или принять его предложение). Сервер (шаг 9) разрешает это участнику общей группы,
// даже если его нельзя найти поиском. true — получилось.
async function offerColleague(m, rel) {
  if (!(await ensureConsent())) return false;
  if (rel === 'none') {
    const ok = await confirmDialog({ title: 'Предложить стать коллегами?', ok: 'Предложить', danger: false,
      text: `${m.card.name} получит предложение и сам решит. Если согласится, вы увидите друг друга в «Мои коллеги». Свой статус каждый показывает сам — кому захочет.` });
    if (!ok) return false;
  }
  if (!(await ensureCard())) return false;
  const r = rel === 'in' ? await rpc('answer_colleague', { p_from: m.id, p_accept: true }) : await rpc('offer_colleague', { p_to: m.id });
  if (!r?.ok) {
    const msg = /cabina: not found/.test(String(r?.data?.message || '')) ? 'Не получилось: возможно, он уже не в группе. Обновите экран и попробуйте ещё раз.' : colError(r);
    toast(msg, { error: true, ms: 6000 });
    return false;
  }
  toast(rel === 'in' || r.data === 'accepted' ? 'Теперь вы коллеги' : r.data === 'already' ? 'Вы уже коллеги' : 'Предложение отправлено. Когда согласится — появится в «Мои коллеги»', { ms: 5000 });
  await reload();
  return true;
}

// Картинка группы: только администратор. Сервер без шага 9 — «ещё не включено».
async function editPic(g) {
  const pic = await openPicEditor({ name: g.name, pic: g.pic });
  if (pic === undefined) return;
  const r = await rpc('set_group_pic', { p_group: g.id, p_pic: pic });
  if (!r?.ok) { toast(notReady(r) ? 'Картинки групп на сервере ещё не включены. Попробуйте позже.' : groupError(r), { error: true, ms: 6000 }); return; }
  g.pic = normPic(pic);
  toast(pic ? 'Картинка группы сохранена' : 'Картинка убрана');
  await reload();
}

// Карандаш вверху группы (администратор): название и картинка — в одном окне
function searchRows(g) {
  return `<div class="group-title">Поиск</div><div class="panel" id="grp-search-set">
    <div class="row"><div class="grow"><div class="t1">Показывать в поиске</div><div class="t2">${g.listed ? 'Группу находят по названию' : 'Найти можно только по коду и приглашению'}</div></div>
      <button class="switch" role="switch" data-act="grp-listed" id="grp-listed" aria-checked="${g.listed}" aria-label="Показывать в поиске"></button></div>
    <div class="row"><div class="grow"><div class="t1">Открытая группа</div><div class="t2">${!g.listed ? 'Сначала включите «Показывать в поиске»' : g.open ? 'Вступают сразу, без вашего одобрения' : 'Вступают по заявке — вы принимаете или отклоняете'}</div></div>
      <button class="switch" role="switch" data-act="grp-open-sw" id="grp-open-sw" aria-checked="${g.open}" aria-label="Открытая группа" ${g.listed ? '' : 'disabled'}></button></div></div>
  <p class="hint">В поиске видны только название и картинка. Кто в группе и сколько вас, не видит никто, кроме участников.</p>`;
}
function editSheet(g) {
  const searchOn = !!colSnap()?.searchOn;
  const el = openLayer(sheet({ title: 'Изменить группу', body: `<div class="panel">
    <button class="row" data-act="grp-rename" id="edit-name"><div class="grow"><div class="t1">Название</div><div class="t2">${esc(g.name)}</div></div>${small(I.right, 18)}</button>
    <button class="row" data-act="grp-pic" id="edit-pic"><span class="grp-pic" aria-hidden="true">${picSvg(g.pic, { size: 36 })}</span><div class="grow"><div class="t1">Картинка</div><div class="t2">${g.pic ? 'Изменить' : 'Сделать картинку'}</div></div>${small(I.right, 18)}</button></div>
    ${searchOn ? `<div id="grp-search-box">${searchRows(g)}</div>` : ''}` }), { onClose: () => colRerender() });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'grp-listed' || b.dataset.act === 'grp-open-sw') {
      if (G.busy) return;
      G.busy = true;
      try { await setSearch(g.id, b.dataset.act === 'grp-listed' ? 'listed' : 'open'); } finally { G.busy = false; }
      const fresh = groupOf(g.id);
      const box = el.querySelector('#grp-search-box');
      if (box && fresh) box.innerHTML = searchRows(fresh);
      return;
    }
    closeLayer(el);
    groupsClick(b.dataset.act, b);
  });
}

// «Показывать в поиске» и «Открытая группа» (администратор). Включить — с предупреждением, выключить — сразу.
async function setSearch(id, what) {
  const g = groupOf(id);
  if (!g?.admin) return;
  let listed = g.listed; let open = g.open;
  if (what === 'listed') { listed = !listed; if (!listed) open = false; } else { if (!listed) return; open = !open; }
  if (what === 'listed' && listed) {
    const ok = await confirmDialog({ title: 'Показывать группу в поиске?', ok: 'Показывать', danger: false,
      text: `Название «${g.name}» и картинку увидят все пользователи CABINA с аккаунтом. Кто в группе и сколько вас, не увидит никто, кроме участников. Проверьте, что в названии нет имён и телефонов. Вступать будут по заявке — вы решаете.` });
    if (!ok) return;
  }
  if (what === 'open' && open) {
    const ok = await confirmDialog({ title: 'Сделать группу открытой?', ok: 'Сделать открытой', danger: false,
      text: 'Вступить сможет любой, кто найдёт группу, без вашего одобрения, и сразу увидит имена участников. Если хотите решать сами, оставьте заявки.' });
    if (!ok) return;
  }
  if ((listed || open) && !(await ensureConsent())) return;
  const r = await rpc('set_group_search', { p_group: g.id, p_listed: listed, p_open: open });
  if (!r?.ok) { fail(r); return; }
  g.listed = listed; g.open = open;
  toast(what === 'listed' ? (listed ? 'Группа видна в поиске' : 'Группа убрана из поиска') : (open ? 'Группа открытая: вступают сразу' : 'Вступают по заявке'));
  await reload();
}

// ---------------------------------------------------------------- поиск групп (2.33)

const MODE = { member: 'Вы в группе', pending: 'Заявка отправлена', declined: 'Заявку отклонили' };
function findRow(x) {
  const btn = x.me === 'member' ? `<button class="btn btn-plain btn-sm" data-act="grp-find-open" data-id="${esc(x.id)}">Открыть группу</button>`
    : x.me ? `<span class="hint grp-find-state">${MODE[x.me]}</span>`
      : `<button class="btn btn-primary btn-sm" data-act="grp-find-join" data-id="${esc(x.id)}">${x.open ? 'Вступить' : 'Подать заявку'}</button>`;
  return `<div class="col-offer grp-find-row" data-id="${esc(x.id)}">
    <div class="col-who"><span class="grp-pic" aria-hidden="true">${picSvg(x.pic, { size: 44 })}</span><div class="grow"><div class="t1">${esc(x.name)}</div>
      <div class="t2">${x.open ? 'Открытая — вступить сразу' : 'Закрытая — вступить по заявке'}</div></div></div>
    <div class="col-btns">${btn}</div></div>`;
}
// Ответ сервера — непроверенный: только uuid, название через cleanText, картинка через normPic, состояния из списка
export const cleanFound = (data) => (Array.isArray(data) ? data : []).filter((x) => x && typeof x === 'object' && UUID.test(String(x.id))).slice(0, 10)
  .map((x) => ({ id: String(x.id).toLowerCase(), name: cleanText(typeof x.name === 'string' ? x.name : '', GROUP_NAME_MAX) || 'Группа', pic: normPic(x.pic),
    open: x.open === true, me: ['member', 'pending', 'declined'].includes(x.me) ? x.me : null }));

// Вступить в найденную группу: открытая — сразу, закрытая — заявка. Сначала говорим, кто что увидит.
async function requestGroup(x) {
  const pv = privacyOf();
  const shown = ['имя', 'должность', pv.depot ? 'депо' : '', pv.avatar ? 'персонажа' : ''].filter(Boolean).join(', ');
  const ok = await confirmDialog(x.open
    ? { title: `Вступить в «${x.name}»?`, ok: 'Вступить', danger: false,
      text: `Это открытая группа. Участники увидят ваше ${shown}, вы — их. Свой статус группе вы показываете, только если сами включите.` }
    : { title: `Подать заявку в «${x.name}»?`, ok: 'Подать заявку', danger: false,
      text: `Администратор группы увидит ваше ${shown} и решит, принять ли вас. Участников вы увидите после того, как вас примут.` });
  if (!ok || !(await ensureCard())) return null;
  const r = await rpc('request_group', { p_group: x.id });
  if (!r?.ok) { fail(r); return null; }
  await reload();
  if (r.data === 'joined' || r.data === 'member') { toast(`Вы в группе «${x.name}»`); return r.data; }
  toast('Заявка отправлена. Когда администратор примет её, группа появится у вас', { ms: 5000 });
  return 'sent';
}

// «Как работают группы» — строка в шестерёнке экрана «Группы»
function openGroupsHelp() {
  openLayer(sheet({ title: 'Как работают группы', body: `<div class="grp-help" id="grp-help-body">
    <p><b>Группа</b> — список ваших людей с названием: бригада, колонна, депо. Переписки в группе нет.</p>
    <p><b>Вы администратор</b> — группы, которые вы создали (или вам передали права): приглашаете коллег, показываете код и QR-код, меняете название и картинку (карандаш вверху группы), исключаете.</p>
    <p><b>Вы участник</b> — группы, в которые вы вступили по коду, приглашению или из поиска.</p>
    <p><b>Поиск.</b> Группу можно найти по названию, если администратор показывает её в поиске. Видно только название и картинку — кто в группе, не видно. В закрытую группу подают заявку, администратор принимает или отклоняет; в открытую вступают сразу.</p>
    <p><b>Шестерёнка</b> на экране «Группы»: создать группу, вступить по коду и приватность сразу по всем группам — кому из групп виден ваш статус и где вы.</p>
    <p><b>Статус — взаимно.</b> Пока вы не показываете группе свой статус, вы не видите статус участников. Станции видят только те, кто показывает свои.</p>
    <p><b>Коллеги.</b> Нажмите на участника — и предложите стать коллегами. Он сам решит.</p>
    <div class="notice ok">${I.shield}<div>${TRUTH}</div></div></div>` }));
}

// Показывать ли этой группе мой статус и где я. Включить — с согласием; включение статуса включает и общий выключатель.
async function setShare(g, item) {
  const pv = privacyOf();
  const curSt = g.me.status && pv.status;
  let st = curSt; let pl = curSt && g.me.place;
  if (item === 'status') { st = !curSt; if (!st) pl = false; } else { if (!curSt) return; pl = !pl; }
  if ((st || pl) && !(await ensureConsent())) return;
  const r = await rpc('set_group_share', { p_group: g.id, p_status: st, p_place: pl });
  if (!r?.ok) { fail(r); return; }
  g.me = { status: st, place: pl };
  const snap = colSnap();
  if (st && !pv.status) await saveProfile({ privacy: { ...privacyOf(), status: true } });
  if (!st && snap && !groupShare(snap, 'status') && !snap.colleagues.length) colMarkStatusCleared();
  toast(item === 'status' ? (st ? 'Группа видит ваш статус' : 'Группа больше не видит ваш статус') : (pl ? 'Группа видит, где вы' : 'Группа больше не видит, где вы'));
  colSync();
  await reload();
  const box = document.querySelector('#grp-priv-body');
  const fresh = groupOf(g.id);
  if (box && fresh) { box.innerHTML = privBody(fresh); colRerender(); } // и сам экран группы за окном — тоже
  const gear = document.querySelector('#grp-gear-priv');
  if (gear) gear.innerHTML = gearPrivHtml();
}

// ---------------------------------------------------------------- шестерёнка на экране «Группы» (2.29, просьба Никиты 11.11.2026)
// Создать, вступить по коду, «как работают группы» и приватность по всем группам сразу — выпадающие списки своих групп.
// Из самих групп эти кнопки не убраны.
function gearRow(g, item) {
  const { status: st, place: pl } = myShare(g);
  const on = item === 'status' ? st : pl;
  const off = item === 'place' && !st;
  return `<div class="row"><div class="grow"><div class="t1">${esc(g.name)}</div><div class="t2">${off ? 'Сначала включите «Кто меня видит»' : on ? 'Видят' : 'Не видят'}</div></div>
    <button class="switch" role="switch" data-act="grp-share" data-item="${item}" data-id="${esc(g.id)}" aria-checked="${on}" aria-label="${esc(g.name)}" ${off ? 'disabled' : ''}></button></div>`;
}
function gearDrop(item, title, sub) {
  const list = colSnap()?.groups || [];
  const n = list.filter((g) => (item === 'status' ? myShare(g).status : myShare(g).place)).length;
  const open = !!G.open[item];
  return `<div class="grp-drop"><button class="row grp-drop-head" data-act="grp-drop" data-k="${item}" aria-expanded="${open}" aria-controls="grp-drop-${item}">
      <div class="grow"><div class="t1">${title}</div><div class="t2">${n ? `${n} из ${list.length} ${plural(list.length, 'группы', 'групп', 'групп')}` : 'Никто'} · ${sub}</div></div>
      <span class="grp-chev" aria-hidden="true">${small(I.down, 18)}</span></button>
    ${open ? `<div class="panel grp-drop-list" id="grp-drop-${item}">${list.map((g) => gearRow(g, item)).join('')}</div>` : ''}</div>`;
}
function gearPrivHtml() {
  const list = colSnap()?.groups || [];
  if (!list.length) return '<div class="hint">Появится, когда вы вступите в группу.</div>';
  return `${gearDrop('status', 'Кто меня видит', 'статус группе')}${gearDrop('place', 'Видят, где я', 'станции и дом отдыха')}
    <div class="notice ok grp-truth">${I.shield}<div>${TRUTH}</div></div>`;
}
function openGear() {
  const snap = colSnap();
  const full = (snap?.groups.length || 0) >= GROUPS_MAX;
  const el = openLayer(sheet({ title: 'Настройки групп', tall: true, body: `<div id="grp-gear-body">
    <div class="panel">
      <button class="row" data-act="grp-new" id="gear-new"${full ? ' disabled' : ''}><span class="ico" style="--c:var(--ok)">${I.plus}</span><div class="grow"><div class="t1">Создать группу</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="grp-code-enter" id="gear-join"${full ? ' disabled' : ''}><span class="ico" style="--c:var(--info, var(--ok))">${small(I.qr, 20)}</span><div class="grow"><div class="t1">Вступить по коду</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="grp-help" id="gear-help"><span class="ico" style="--c:var(--muted)">${I.help}</span><div class="grow"><div class="t1">Как работают группы</div></div>${small(I.right, 18)}</button>
    </div>
    ${full ? `<div class="hint">Групп уже ${GROUPS_MAX} — больше нельзя.</div>` : ''}
    <div class="group-title">Приватность</div>
    <p class="hint grp-priv-lead">Кому из групп виден ваш статус. Всё выключено, пока вы сами не включите.</p>
    <div id="grp-gear-priv">${gearPrivHtml()}</div>
    <button class="link-btn grp-col-priv" data-act="grp-col-priv" id="gear-col-priv">Приватность для коллег</button></div>` }),
    { onClose: () => colRerender() });
  // окна не входят в общий разбор нажатий экрана — разбираем здесь
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'grp-drop') { const k = b.dataset.k === 'place' ? 'place' : 'status'; G.open[k] = !G.open[k]; document.querySelector('#grp-gear-priv').innerHTML = gearPrivHtml(); return; }
    if (act === 'grp-share') { groupsClick(act, b); return; }
    if (act === 'grp-col-priv') { closeLayer(el); colGo('privacy'); return; }
    if (act === 'grp-new' || act === 'grp-code-enter' || act === 'grp-help') { closeLayer(el); groupsClick(act, b); }
  });
}

// ---------------------------------------------------------------- действия

export async function groupsClick(act, b) {
  if (!act.startsWith('grp-')) return false;
  if (act === 'grp-open') { if (UUID.test(String(b.dataset.id))) openGroupPage(String(b.dataset.id).toLowerCase()); return true; }
  const g = groupOf(G.id);
  if (act === 'grp-member') { if (g) memberSheet(g, String(b.dataset.id || '').toLowerCase()); return true; }
  if (act === 'grp-help') { openGroupsHelp(); return true; }
  if (act === 'grp-gear') { openGear(); return true; }
  if (act === 'grp-q-clear') { G.q = ''; colRerender(); document.getElementById('grp-q')?.focus(); return true; }
  if (act === 'grp-code-enter') { if (await ready()) enterCode(); return true; }
  if (act === 'grp-find-open') {
    const id = String(b.dataset.id || '').toLowerCase();
    if (UUID.test(id)) { await reload(); openGroupPage(id); }
    return true;
  }
  if (act === 'grp-find-join') {
    const x = G.found?.list?.find((v) => v.id === String(b.dataset.id || '').toLowerCase());
    if (!x || G.busy) return true;
    G.busy = true;
    try {
      const res = await requestGroup(x);
      if (res === 'joined' || res === 'member') { openGroupPage(x.id); return true; }
      if (res === 'sent') { x.me = 'pending'; colRerender(); }
    } finally { G.busy = false; }
    return true;
  }
  if (G.busy) return true;
  G.busy = true;
  try {
    switch (act) {
      case 'grp-new': await createGroup(); break;
      case 'grp-accept': case 'grp-decline': {
        const id = String(b.dataset.id || '').toLowerCase();
        if (!UUID.test(id)) break;
        const accept = act === 'grp-accept';
        if (accept && (!(await ready()) || !(await ensureCard()))) break;
        const r = await rpc('answer_group_invite', { p_group: id, p_accept: accept });
        if (!r?.ok) { fail(r); break; }
        await reload();
        if (accept) { toast('Вы в группе. Свой статус группе вы показываете, только если сами включите'); openGroupPage(id); } else toast('Приглашение отклонено');
        break;
      }
      case 'grp-share': {
        const target = UUID.test(String(b.dataset.id || '')) ? groupOf(String(b.dataset.id).toLowerCase()) : g;
        if (target && !b.disabled) await setShare(target, b.dataset.item === 'place' ? 'place' : 'status');
        break;
      }
      case 'grp-priv': if (g) openPriv(g); break;
      case 'grp-req-yes': case 'grp-req-no': {
        if (!g?.admin) break;
        const id = String(b.dataset.id || '').toLowerCase();
        const who = g.requests.find((x) => x.id === id);
        if (!who) break;
        const yes = act === 'grp-req-yes';
        const r = await rpc('answer_group_request', { p_group: g.id, p_user: id, p_accept: yes });
        if (!r?.ok) { fail(r); break; }
        toast(yes ? `${who.card.name} теперь в группе` : 'Заявка отклонена. Снова подать её можно через 30 дней');
        await reload();
        break;
      }
      case 'grp-unrequest': {
        const id = String(b.dataset.id || '').toLowerCase();
        if (!UUID.test(id)) break;
        const r = await rpc('cancel_group_request', { p_group: id });
        if (!r?.ok) { fail(r); break; }
        toast('Заявка отозвана'); await reload();
        break;
      }
      case 'grp-invite': if (g?.admin) inviteSheet(g); break;
      case 'grp-pic': if (g?.admin) await editPic(g); break;
      case 'grp-edit': if (g?.admin) editSheet(g); break;
      case 'grp-code': if (g?.admin) await showCode(g); break;
      case 'grp-rename': {
        if (!g?.admin) break;
        const name = await nameSheet({ title: 'Переименовать группу', value: g.name, ok: 'Сохранить' }); // без переключателя — строка
        if (!name || name === g.name) break;
        const r = await rpc('rename_group', { p_group: g.id, p_name: name });
        if (!r?.ok) { fail(r); break; }
        toast('Название изменено'); await reload();
        break;
      }
      case 'grp-uninvite': {
        if (!g?.admin) break;
        const r = await rpc('cancel_group_invite', { p_group: g.id, p_user: String(b.dataset.id || '').toLowerCase() });
        if (!r?.ok) { fail(r); break; }
        toast('Приглашение отменено'); await reload();
        break;
      }
      case 'grp-leave': {
        if (!g) break;
        const next = g.admin ? [...g.members].filter((m) => m.id !== colSub()).sort((a, c) => (a.joined ?? 0) - (c.joined ?? 0))[0] : null;
        const ok = await confirmDialog({ title: `Выйти из «${g.name}»?`, ok: 'Выйти',
          text: g.admin ? (next ? `Администратором станет ${next.card.name}. Вернуться можно по коду группы или приглашению.` : 'Вы последний участник — группа удалится.') : 'Вы перестанете видеть группу, а участники — вас. Вернуться можно по коду группы или приглашению.' });
        if (!ok) break;
        const r = await rpc('leave_group', { p_group: g.id });
        if (!r?.ok) { fail(r); break; }
        toast('Вы вышли из группы'); await reload(); colBack();
        break;
      }
      case 'grp-delete': {
        if (!g?.admin) break;
        const ok = await confirmDialog({ title: `Удалить «${g.name}»?`, ok: 'Удалить группу',
          text: 'Группа удалится у всех участников, код перестанет работать. Это нельзя отменить.' });
        if (!ok) break;
        const r = await rpc('delete_group', { p_group: g.id });
        if (!r?.ok) { fail(r); break; }
        toast('Группа удалена'); await reload(); colBack();
        break;
      }
      default: return false;
    }
  } finally { G.busy = false; }
  colRerender();
  return true;
}
