// «Коллеги» (с 2.15): найти коллегу по имени, предложить стать коллегами, показывать коллегам свой статус.
// Работает только с аккаунтом и через наш сервер в России (server/migrations/0002_colleagues.sql).
// Что уходит на сервер, решает сам человек, и всё по умолчанию выключено:
//   карточка — имя, должность и, если включено в «Приватности», депо и персонаж (набор деталей, не фото);
//   «Меня можно найти» — отдельное согласие на распространение (152-ФЗ, ст. 10.1); выключил — согласие отозвано;
//   статус — одна строка без истории: вид, станции или дом отдыха, часть суток, «до …»; сам стирается через 48 часов.
//   часы (2.31) — только два числа: отработано в этом месяце и итог прошлого; кому — выбирает человек (по умолчанию никому).
// Номер поезда и локомотива, точное время явки, причина и даты отвлечения, норма, заработок, телефон на сервер не уходят никогда.
// Всё, что пришло с сервера, — непроверенное: текст только через esc(), персонаж — через normalizeAvatar.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, whenShort, plural, layerCount, MONTHS_GEN, hm } from './ui.js';
import { S, saveProfile, nowLocal, onChange, legEnds } from './store.js';
import { DAY, monthSummary } from './calc.js';
import { session, rpc, restGet, errorText } from './auth.js';
import { GROUPS_LIVE, CONSENT_VERSION, PUBLISH_VERSION, OPERATOR, consentHtml, policyHtml, publishConsentHtml, legalReady } from './legal.js';
import { statusFacts, privacyOf, normDepot } from './profile.js';
import { routeEnds } from './rest.js';
import { avatarSvg, normalizeAvatar } from './avatar.js';
import { hasAvatar, avatarRights } from './avatar-edit.js';
import { normPic } from './grp-pic.js';

export const ROLE_NAMES = { assistant: 'Помощник машиниста', driver: 'Машинист', other: 'Другая должность' };
const KINDS = ['soon', 'trip', 'rest', 'wait', 'dayoff', 'between', 'abs'];
// часть суток вместо точного времени: «Скоро явка · завтра утром», «В пути · … · с утра»
const PARTS = { night: ['ночью', 'с ночи'], morning: ['утром', 'с утра'], day: ['днём', 'с обеда'], evening: ['вечером', 'с вечера'] };
// какой отдых дома выбран после поездки (только «Между поездками»)
const NOTES = { queue: 'на очередь с', full: 'полный отдых до', fullOff: 'полный отдых с выходным до', dayOff: 'выходной до' };
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arr = (v) => (Array.isArray(v) ? v : []);
const RESEND = 6 * 3600e3; // статус переотправляем раз в 6 часов, пока приложение открывают: сервер стирает его через 48 ч
const HOURS_GAP = 10 * 60e3; // часы во время поездки «в пути» — не чаще раза в 10 минут (сервер стирает их через 7 дней)

// ---------------------------------------------------------------- время

// Сдвиг часового пояса из настроек: «настенное» время (как в поездках) = настоящее + сдвиг
export const tzOffset = () => Math.round((nowLocal() - Date.now()) / 900000) * 900000;
// Часть суток по настенному времени
export function partOf(ms) {
  const h = new Date(ms).getUTCHours();
  return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'day' : 'evening';
}
// Начало части суток (00, 06, 12, 18 часов) — дальше этого точность явки не уходит
export function partStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(d.getUTCHours() / 6) * 6);
}

// ---------------------------------------------------------------- что уходит на сервер

// Текст так же, как его чистит сервер (private.clean): без служебных символов и лишних пробелов
export const cleanText = (v, max = 60) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\s]+/g, ' ').trim().slice(0, max).trim();

// Статус для коллег из того, что считает телефон (statusFacts в profile.js). off — сдвиг часового пояса.
// Сервер ещё раз отбрасывает лишнее для каждого вида (set_status), но приложение лишнего и не шлёт.
export function statusPayload(f, off = tzOffset()) {
  if (!f || !KINDS.includes(f.kind)) return null;
  const iso = (ms) => (Number.isFinite(ms) ? new Date(ms - off).toISOString() : null);
  const p = { p_kind: f.kind, p_place: null, p_dest: null, p_part: null, p_note: null, p_until: null };
  if (f.kind === 'soon') { p.p_part = partOf(f.start); p.p_until = iso(partStart(f.start)); }
  if (f.kind === 'trip') {
    // сменили локомотив — станции того плеча, по которому едут сейчас (2.19.7); новых данных это не добавляет
    const e = f.leg ? legEnds(f.leg) : f.trip ? routeEnds(f.trip) : null;
    if (e) { p.p_place = cleanText(e.from) || null; p.p_dest = cleanText(e.to) || null; }
    p.p_part = partOf(f.start);
  }
  if (f.kind === 'rest') { p.p_place = cleanText(f.house) || null; p.p_until = iso(f.until); }
  if (f.kind === 'wait') p.p_place = cleanText(f.house) || null;
  if (f.kind === 'dayoff') p.p_until = iso(f.until);
  if (f.kind === 'between' && f.rest && own(NOTES, f.rest.kind)) { p.p_note = f.rest.kind; p.p_until = iso(f.rest.until); }
  return p;
}
// То же, но в виде, в каком статус вернётся с сервера: для строки «Так вас видят коллеги»
export function payloadStatus(p) {
  if (!p) return null;
  return cleanStatus({ kind: p.p_kind, place: p.p_place, dest: p.p_dest, part: p.p_part, note: p.p_note, until_at: p.p_until,
    after_kind: p.p_kind === 'rest' ? 'wait' : p.p_kind === 'dayoff' ? 'between' : null });
}

// Карточка: имя и должность всегда, депо и персонаж — только если включены в «Приватности». Телефона здесь нет.
export function cardPayload(p = S.profile, { findable = false, premium = false, invited = 0 } = {}) {
  const pv = privacyOf(p);
  const name = cleanText(p.name);
  if (!name) return null;
  return {
    p_name: name,
    p_role: own(ROLE_NAMES, p.role) ? p.role : null,
    p_depot: pv.depot ? cleanText(normDepot(p.depot)) || null : null,
    p_avatar: pv.avatar && hasAvatar(p) ? normalizeAvatar(p.avatar, { premium, invited }) : null,
    p_searchable: findable,
  };
}

// ---------------------------------------------------------------- что пришло с сервера

const txt = (v, max = 60) => (typeof v === 'string' ? cleanText(v, max) : '');
const time = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

function cardFields(x) {
  const av = x.avatar && typeof x.avatar === 'object' && !Array.isArray(x.avatar) ? normalizeAvatar(x.avatar, { premium: true }) : null;
  return { name: txt(x.name) || 'Без имени', role: own(ROLE_NAMES, x.role) ? x.role : '', depot: txt(x.depot), avatar: av, searchable: x.searchable === true };
}
export function cleanCard(x) {
  const id = String(x?.user_id ?? x?.id ?? '');
  if (!x || typeof x !== 'object' || !UUID.test(id)) return null;
  return { id: id.toLowerCase(), ...cardFields(x) };
}

export function cleanStatus(x) {
  if (!x || typeof x !== 'object' || !KINDS.includes(x.kind)) return null;
  return {
    kind: x.kind, place: txt(x.place), dest: txt(x.dest),
    part: own(PARTS, x.part) ? x.part : '', note: own(NOTES, x.note) ? x.note : '',
    until: time(x.until_at), after: x.after_kind === 'wait' || x.after_kind === 'between' ? x.after_kind : '', at: time(x.updated_at),
  };
}

// Часы коллеги (2.31): месяц 'YYYY-MM', минуты за него и за прошлый месяц. Всё с сервера — проверяем.
const HOURS_MAX = 31 * 24 * 60;
const minOk = (v) => Number.isInteger(v) && v >= 0 && v <= HOURS_MAX;
export function cleanHours(x) {
  if (!x || typeof x !== 'object' || typeof x.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) || !minOk(x.cur_min)) return null;
  return { month: x.month, cur: x.cur_min, prev: minOk(x.prev_min) ? x.prev_min : null, at: time(x.updated_at) };
}
// Что уходит на сервер: месяц по настенному времени, отработано в нём и итог прошлого (как «Отработано» на главной)
export function hoursPayload(trips = S.trips, absences = S.absences, now = nowLocal()) {
  const d = new Date(now);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1;
  const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
  const cap = (v) => Math.min(HOURS_MAX, Math.max(0, Math.round(v || 0)));
  return { p_month: `${y}-${String(m).padStart(2, '0')}`, p_cur: cap(monthSummary(y, m, trips, absences).work), p_prev: cap(monthSummary(py, pm, trips, absences).work) };
}
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const hNum = (min) => { const h = Math.floor(min / 60); const r = min % 60; return r ? `${h} ч ${r} мин` : `${h} ч`; };
// «112 ч 30 мин в ноябре» и строка прошлого месяца «179 ч в октябре» (если прислали)
export function hoursLines(h) {
  if (!h) return [];
  const [y, m] = h.month.split('-').map(Number);
  const out = [`${hNum(h.cur)} в ${MONTHS_PREP[m - 1]}`];
  if (h.prev != null) out.push(`${hNum(h.prev)} в ${MONTHS_PREP[(m + 10) % 12]}${m === 1 ? ` ${y - 1}` : ''}`);
  return out;
}

// Свои правила «кому видно» (чужие сервер не отдаёт): all — всем коллегам, ids — выбранным
function accessRows(rows, me) {
  const a = { status: { all: false, ids: [] }, place: { all: false, ids: [] }, hours: { all: false, ids: [] } };
  for (const r of arr(rows)) {
    if (!r || typeof r !== 'object' || !own(a, r.item) || (r.user_id != null && String(r.user_id).toLowerCase() !== me)) continue;
    if (r.viewer_id == null) a[r.item].all = true;
    else if (UUID.test(String(r.viewer_id))) a[r.item].ids.push(String(r.viewer_id).toLowerCase());
  }
  return a;
}

// Снимок с сервера: согласия, моя карточка, предложения мне, мои предложения, коллеги со статусом, кому что видно.
// Станции статуса (с 2.16) приходят отдельно — их сервер отдаёт только тем, кому человек показывает, где он.
// Группы (2.22): groups/members/ginvites — null, если на сервере их ещё нет (тогда groupsOn = false).
// Часы (2.31): hours — null, если на сервере их ещё нет (тогда hoursOn = false и выбора «Мои часы» нет).
export function buildSnapshot(me, { consents, links, cards, statuses, places, access, groups = null, members = null, ginvites = null, asks = null, hours = null }) {
  me = String(me).toLowerCase();
  const ok = (doc) => arr(consents).some((c) => c && c.document === doc && !c.withdrawn_at);
  const cardOf = new Map();
  for (const c of arr(cards)) { const k = cleanCard(c); if (k) cardOf.set(k.id, k); }
  const placeOf = new Map();
  for (const p of arr(places)) if (p && UUID.test(String(p.user_id))) placeOf.set(p.user_id.toLowerCase(), p);
  const statusOf = new Map();
  for (const s of arr(statuses)) {
    if (!s || !UUID.test(String(s.user_id))) continue;
    const id = s.user_id.toLowerCase();
    const p = placeOf.get(id);
    const v = cleanStatus(p ? { ...s, place: p.place, dest: p.dest } : s);
    if (v) statusOf.set(id, v);
  }
  const hoursOf = new Map();
  for (const h of arr(hours)) { const v = h && UUID.test(String(h.user_id)) ? cleanHours(h) : null; if (v) hoursOf.set(h.user_id.toLowerCase(), v); }
  const out = { consent: { main: ok(CONSENT_VERSION), publish: ok(PUBLISH_VERSION) }, card: cardOf.get(me) || null, myStatus: statusOf.get(me) || null,
    hoursOn: Array.isArray(hours), myHours: hoursOf.get(me) || null,
    access: accessRows(access, me), incoming: [], outgoing: [], colleagues: [] };
  const seen = new Set();
  for (const l of arr(links)) {
    if (!l || !UUID.test(String(l.from_id)) || !UUID.test(String(l.to_id))) continue;
    const from = l.from_id.toLowerCase(); const to = l.to_id.toLowerCase();
    if ((from !== me && to !== me) || from === to) continue;
    const other = from === me ? to : from;
    if (seen.has(other)) continue;
    seen.add(other);
    const item = { id: other, card: cardOf.get(other) || { id: other, name: 'Без имени', role: '', depot: '', avatar: null, searchable: false } };
    if (l.state === 'accepted') out.colleagues.push({ ...item, status: statusOf.get(other) || null, hours: hoursOf.get(other) || null });
    else if (l.state === 'pending') (from === me ? out.outgoing : out.incoming).push(item);
  }
  const byName = (a, b) => a.card.name.localeCompare(b.card.name, 'ru');
  out.colleagues.sort(byName); out.incoming.sort(byName); out.outgoing.sort(byName);
  // Просьбы показать им мой статус (2.28): только от моих коллег, не больше 20; старый сервер без таблицы — asksOn: false
  out.asksOn = Array.isArray(asks);
  out.asks = arr(asks).filter((a) => a && a.state === 'open' && UUID.test(String(a.asker)))
    .map((a) => ({ id: a.asker.toLowerCase(), at: Date.parse(a.asked_at) || 0 }))
    .map((a) => ({ ...a, card: out.colleagues.find((c) => c.id === a.id)?.card }))
    .filter((a) => a.card).sort((a, b) => b.at - a.at).slice(0, 20);
  Object.assign(out, buildGroups(me, { groups, members, ginvites, cardOf, statusOf }));
  return out;
}

const noCard = (id) => ({ id, name: 'Без имени', role: '', depot: '', avatar: null, searchable: false });
// Группы: в каких я, кто в них (статус участника — только если он показывает его этой группе), приглашения мне.
// Всё — непроверенное: id только uuid, название — через txt (не длиннее 30), роли — из списка.
function buildGroups(me, { groups, members, ginvites, cardOf, statusOf }) {
  if (!Array.isArray(groups) || !Array.isArray(members) || !Array.isArray(ginvites)) return { groupsOn: false, groups: [], groupInvites: [] };
  const gname = new Map();
  const gpic = new Map();
  for (const g of groups) {
    if (!g || !UUID.test(String(g.id))) continue;
    gname.set(String(g.id).toLowerCase(), txt(g.name, 30) || 'Группа');
    gpic.set(String(g.id).toLowerCase(), normPic(g.pic));
  }
  const by = new Map();
  for (const m of members) {
    if (!m || !UUID.test(String(m.group_id)) || !UUID.test(String(m.user_id))) continue;
    const gid = m.group_id.toLowerCase(); const uid = m.user_id.toLowerCase();
    if (!gname.has(gid)) continue;
    if (!by.has(gid)) by.set(gid, new Map());
    const st = m.show_status === true;
    by.get(gid).set(uid, { id: uid, card: cardOf.get(uid) || noCard(uid), admin: m.role === 'admin', show: { status: st, place: st && m.show_place === true },
      joined: time(m.joined_at), status: st && uid !== me ? statusOf.get(uid) || null : null });
  }
  const out = [];
  for (const [gid, mm] of by) {
    const mine = mm.get(me);
    if (!mine) continue; // приглашённый видит только название, участников — нет
    const list = [...mm.values()].sort((a, b) => (b.admin - a.admin) || a.card.name.localeCompare(b.card.name, 'ru'));
    const pending = arr(ginvites).filter((i) => i && String(i.group_id).toLowerCase() === gid && UUID.test(String(i.user_id)) && String(i.user_id).toLowerCase() !== me)
      .map((i) => { const id = String(i.user_id).toLowerCase(); return { id, card: cardOf.get(id) || noCard(id) }; });
    out.push({ id: gid, name: gname.get(gid), pic: gpic.get(gid), admin: mine.admin, me: mine.show, members: list, pending });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const invites = [];
  for (const i of arr(ginvites)) {
    if (!i || !UUID.test(String(i.group_id)) || String(i.user_id).toLowerCase() !== me) continue;
    const gid = i.group_id.toLowerCase();
    if (!gname.has(gid) || out.some((g) => g.id === gid)) continue;
    const from = UUID.test(String(i.invited_by)) ? String(i.invited_by).toLowerCase() : '';
    invites.push({ id: gid, name: gname.get(gid), pic: gpic.get(gid), from: from ? (cardOf.get(from) || noCard(from)) : null });
  }
  return { groupsOn: true, groups: out, groupInvites: invites };
}
// Показываю ли я статус ('status') или «где я» ('place') хоть одной группе, где есть кто-то кроме меня
export const groupShare = (snap, item) => !!snap?.groups?.some((g) => g.me[item] && g.members.length > 1);

// Кому сейчас виден статус ('status') или «где я» ('place'): none — никому, all — всем коллегам,
// some — выбранным (только тем, кто и сейчас коллега). Статус выключен в телефоне — никому, «где я» без статуса — тоже.
export function accessMode(snap, item, pv = privacyOf()) {
  const none = { mode: 'none', ids: [] };
  if (!snap) return none;
  if (item === 'status' && !pv.status) return none;
  if (item === 'place' && accessMode(snap, 'status', pv).mode === 'none') return none;
  const a = snap.access?.[item];
  if (!a) return none;
  if (a.all) return { mode: 'all', ids: [] };
  const ids = a.ids.filter((id) => snap.colleagues.some((c) => c.id === id));
  return ids.length ? { mode: 'some', ids } : none;
}
// Видит ли этот коллега: «где я» — только вместе со статусом
export function sees(snap, item, id, pv = privacyOf()) {
  if (item === 'place' && !sees(snap, 'status', id, pv)) return false;
  const m = accessMode(snap, item, pv);
  return m.mode === 'all' ? snap.colleagues.some((c) => c.id === id) : m.ids.includes(id);
}
// «Никто», «Все коллеги», «Анна, Олег», «5 коллег»
export function accessText(snap, item, pv = privacyOf()) {
  const m = accessMode(snap, item, pv);
  if (m.mode === 'none') return 'Никто';
  if (m.mode === 'all') return item === 'place' && accessMode(snap, 'status', pv).mode === 'some' ? 'Все, кто видит статус' : 'Все коллеги';
  const names = snap.colleagues.filter((c) => sees(snap, item, c.id, pv)).map((c) => c.card.name);
  if (!names.length) return 'Никто';
  return names.length <= 2 ? names.join(', ') : `${names.length} ${plural(names.length, 'коллега', 'коллеги', 'коллег')}`;
}

// ---------------------------------------------------------------- строка статуса коллеги

// Как коллега видит статус. Время с сервера — настоящее, показываем в своём часовом поясе (off).
// Отдых или выходной закончился, а коллега ещё не открывал CABINA — показываем то, что идёт следом («Ждёт явку»).
export function colleagueLine(st, nowAbs = Date.now(), off = tzOffset()) {
  if (!st) return null;
  const now = nowAbs + off;
  const when = (ms) => whenShort(ms + off, now).replace(/^сегодня, /, '');
  const kind = st.until != null && st.until <= nowAbs && st.after ? st.after : st.kind;
  const line = (label, ...sub) => ({ kind, label, sub: sub.filter(Boolean).join(' · ') });
  switch (kind) {
    case 'soon': return line('Скоро явка', st.part ? soonWhen(st, now, off) : '');
    case 'trip': return line('В пути', st.place && st.dest ? `${st.place} → ${st.dest}` : st.place || st.dest, st.part ? PARTS[st.part][1] : '');
    case 'rest': return line('На отдыхе', st.place, st.until != null ? `до ${when(st.until)}` : '');
    case 'wait': return line('Ждёт явку', st.place);
    case 'dayoff': return line('На выходном', st.until != null ? `до ${when(st.until)}` : '');
    case 'abs': return line('На отвлечении');
    default: return line('Между поездками', kind === st.kind && st.note && st.until != null && st.until > nowAbs ? `${NOTES[st.note]} ${when(st.until)}` : '');
  }
}
// «сегодня утром», «завтра днём», «этой ночью», «1 ноября утром»
function soonWhen(st, now, off) {
  const word = PARTS[st.part][0];
  if (st.until == null) return word;
  const at = st.until + off;
  const d = Math.floor(at / DAY); const n = Math.floor(now / DAY); const h = new Date(now).getUTCHours();
  if (st.part === 'night' && ((d === n + 1 && h >= 18) || (d === n && h < 6))) return 'этой ночью';
  if (d === n) return `сегодня ${word}`;
  if (d === n + 1) return `завтра ${word}`;
  if (d === n - 1) return `вчера ${word}`;
  const x = new Date(at);
  return `${x.getUTCDate()} ${MONTHS_GEN[x.getUTCMonth()]} ${word}`;
}
// «обновлено в 09:10», «обновлено вчера, 21:40»
export function updatedText(at, nowAbs = Date.now(), off = tzOffset()) {
  if (at == null) return '';
  const w = whenShort(at + off, nowAbs + off);
  return /^сегодня, /.test(w) ? `обновлено в ${w.slice(9)}` : `обновлено ${w}`;
}

// ---------------------------------------------------------------- состояние

const C = { sub: null, snap: null, at: 0, failAt: 0, err: '', loading: null, busy: false,
  q: { name: '', depot: '', role: '' }, results: null, searching: false, teamQ: '' };
let hooks = { rerender: () => {}, go: () => {}, active: () => false };
const SYNC_KEY = 'cabina-colleagues';

function reset(sub) {
  Object.assign(C, { sub, snap: null, at: 0, failAt: 0, err: '', loading: null, busy: false, q: { name: '', depot: '', role: '' }, results: null, searching: false, teamQ: '' });
}
// Текущий вход; сменился человек или вышел — всё, что знали о коллегах, забываем
function mine() {
  const s = session();
  const sub = s?.sub ? String(s.sub).toLowerCase() : null;
  if (sub !== C.sub) {
    reset(sub);
    if (!sub) { try { localStorage.removeItem(SYNC_KEY); } catch {} }
  }
  return sub ? s : null;
}

// Что и когда последний раз отправили (только отпечатки, сами данные не храним)
function readSync(sub) {
  try { const x = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); if (x && x.sub === sub) return x; } catch {}
  return { sub, card: '', status: '', statusAt: 0 };
}
function writeSync(x) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(x)); } catch {} }
const mark = (v) => { let h = 0x811c9dc5; for (const c of JSON.stringify(v)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

export function initColleagues(h) {
  hooks = { ...hooks, ...h };
  onChange(() => { if (C.snap) scheduleSync(); });
}

const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const SERVER_OFF = 'Раздел «Коллеги» на сервере ещё не включён. Попробуйте позже.';
const HOURS_OFF = 'Часы для коллег на сервере ещё не включены. Попробуйте позже.';
const notReady = (r) => r && (r.status === 404 || /^(PGRST20\d|42883|42P01|42703)$/.test(String(r.data?.code || '')));

// Понятная причина отказа сервера
export function colError(r, what = '') {
  if (!r) return OFFLINE;
  if (notReady(r)) return SERVER_OFF;
  const m = String(r.data?.message || '');
  if (/name too short/.test(m)) return 'Введите не меньше 3 букв имени.';
  if (/name required/.test(m)) return 'Сначала укажите имя в профиле.';
  if (/publish consent required/.test(m)) return 'Чтобы вас можно было найти, нужно отдельное согласие.';
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  if (/cabina: later/.test(m)) return 'Предложить этому человеку снова можно будет позже: после отказа или удаления из коллег — через 30 дней.';
  if (/cabina: not found/.test(m)) return 'Этого человека уже нет в поиске.';
  if (/cabina: limit/.test(m)) return what === 'search' ? 'На сегодня поисков слишком много. Попробуйте завтра.' : 'На сегодня предложений слишком много: не больше 10 в день. Попробуйте завтра.';
  return errorText(r);
}

// Снимок с сервера. Таблицы читаем обычными запросами: что видно, решают правила базы (RLS).
export function loadColleagues({ force = false } = {}) {
  const s = mine();
  if (!s || !legalReady()) return Promise.resolve(null);
  if (C.loading) return C.loading;
  if (!force && C.snap && Date.now() - C.at < 30e3) return Promise.resolve(C.snap);
  const sub = C.sub;
  C.loading = (async () => {
    // просьбы показать статус (2.28) — отдельно и необязательно: сервер без шага 10 «Коллег» не ломает
    const asking = restGet('status_asks?select=asker,state,asked_at&state=eq.open&order=asked_at.desc&limit=50');
    // часы коллег (2.31) — тоже отдельно: сервер без шага 11 «Коллег» не ломает
    const hrs = restGet('hours?select=user_id,month,cur_min,prev_min,updated_at');
    const rs = await Promise.all([
      restGet('consents?select=document,withdrawn_at'),
      restGet('links?select=from_id,to_id,state'),
      restGet('cards?select=user_id,name,role,depot,avatar,searchable'),
      restGet('statuses?select=user_id,kind,part,note,until_at,after_kind,updated_at'),
      restGet('status_places?select=user_id,place,dest'),
      restGet('access?select=user_id,item,viewer_id'),
    ]);
    // группы (2.22) — отдельно: старый сервер без них не должен ломать «Коллег»
    const gs = !GROUPS_LIVE ? [{ ok: false, status: 404 }] : await Promise.all([
      restGet('groups?select=*'), // * — чтобы сервер без картинок групп (до шага 9) не отвечал ошибкой
      restGet('group_members?select=group_id,user_id,role,show_status,show_place,joined_at'),
      restGet('group_invites?select=group_id,user_id,invited_by'),
    ]);
    if (mine()?.sub?.toLowerCase() !== sub) return null; // за это время вышли из аккаунта
    const gBad = gs.find((r) => !r?.ok);
    if (gBad !== undefined && !notReady(gBad)) rs.push(gBad);
    const bad = rs.find((r) => !r?.ok);
    if (bad !== undefined) {
      C.err = !bad ? 'offline' : notReady(bad) ? 'server' : 'error';
      C.failAt = Date.now();
      return C.snap;
    }
    const [consents, links, cards, statuses, places, access] = rs.map((r) => r.data);
    const [groups, members, ginvites] = gBad === undefined ? gs.map((r) => r.data) : [null, null, null];
    const ar = await asking;
    const hr = await hrs;
    C.snap = buildSnapshot(sub, { consents, links, cards, statuses, places, access, groups, members, ginvites,
      asks: ar?.ok && Array.isArray(ar.data) ? ar.data : null, hours: hr?.ok && Array.isArray(hr.data) ? hr.data : null });
    C.at = Date.now(); C.err = '';
    return C.snap;
  })().finally(() => { C.loading = null; });
  return C.loading.then((snap) => {
    if (hooks.active() && !layerCount()) hooks.rerender();
    if (snap) scheduleSync(0);
    return snap;
  });
}
// Что случилось при последней загрузке: '' — всё хорошо, 'offline' — нет связи, 'server' / 'error' — сервер отказал
export const colleaguesError = () => C.err;
function ensureFresh() {
  if (C.loading) return;
  if (C.err && Date.now() - C.failAt < 30e3) return;
  if (!C.snap || Date.now() - C.at > 60e3) loadColleagues({ force: true });
}
// Раз в минуту (приложение открыто): свежий снимок, пока виден раздел, и отправка изменившегося статуса
export function colleaguesTick() {
  if (!mine() || document.visibilityState !== 'visible') return;
  if (hooks.active() && Date.now() - C.at > 120e3) loadColleagues({ force: true });
  else if (!C.snap && !C.loading && Date.now() - C.failAt > 300e3) loadColleagues({ force: true });
  else if (C.snap) scheduleSync(0);
}
// Приложение открыли или вернулись в него
export function colleaguesWake() {
  if (!mine()) return;
  loadColleagues({ force: Date.now() - C.at > 60e3 });
}

// ---------------------------------------------------------------- отправка своего

let syncTimer = null;
let syncing = false;
function scheduleSync(ms = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { sync().catch(() => {}); }, ms);
}

// Сводим то, что на сервере, с выбором человека. При любом расхождении побеждает «выключено».
async function sync() {
  const s = mine();
  const snap = C.snap;
  if (!s || !snap || !snap.consent.main) return;
  if (syncing) { scheduleSync(3000); return; }
  syncing = true;
  try {
    const last = readSync(C.sub);
    const pv = privacyOf();
    // «Меня можно найти» выключили на другом устройстве или вышли из «Коллег» — выключаем и здесь
    if (pv.find && !snap.consent.publish) { await saveProfile({ privacy: { ...pv, find: false } }); return; }
    const want = cardPayload(S.profile, { findable: pv.find, ...avatarRights() })
      // имя стёрли, а из поиска убрать нужно: сервер без имени карточку не сохранит
      || (snap.card?.searchable ? { p_name: snap.card.name, p_role: snap.card.role || null, p_depot: null, p_avatar: null, p_searchable: false } : null);
    // новую карточку создаём только по действию человека («Меня можно найти», предложить, принять), здесь — лишь обновляем
    if (want && (snap.card || want.p_searchable)) {
      const m = mark(want);
      if (!snap.card || snap.card.searchable !== want.p_searchable || last.card !== m) {
        const r = await rpc('save_card', want);
        if (r?.ok) { last.card = m; snap.card = cleanCard({ user_id: C.sub, name: want.p_name, role: want.p_role, depot: want.p_depot, avatar: want.p_avatar, searchable: want.p_searchable }); }
        else if (/publish consent required/.test(String(r?.data?.message))) { await saveProfile({ privacy: { ...pv, find: false } }); return; }
      }
    }
    // статус включён, а показывать некому (выбрали «никто» на другом устройстве, удалили всех выбранных) — выключаем
    // (группы, 2.22: показываю статус группе — значит, показывать есть кому)
    if (pv.status && accessMode(snap, 'status', pv).mode === 'none' && !groupShare(snap, 'status')) { await saveProfile({ privacy: { ...pv, status: false } }); return; }
    let st = pv.status && (snap.colleagues.length || groupShare(snap, 'status')) ? statusPayload(statusFacts()) : null;
    // «где я» никому не показываем — станции не отправляем вовсе
    if (st && accessMode(snap, 'place', pv).mode === 'none' && !groupShare(snap, 'place')) st = { ...st, p_place: null, p_dest: null };
    if (st) {
      const m = mark(st);
      if (m !== last.status || Date.now() - last.statusAt > RESEND) {
        const r = await rpc('set_status', st);
        if (r?.ok) { last.status = m; last.statusAt = Date.now(); snap.myStatus = payloadStatus(st); }
      }
    } else if (last.status || snap.myStatus) {
      const r = await rpc('clear_status');
      if (r?.ok) { last.status = ''; last.statusAt = 0; snap.myStatus = null; }
    }
    // часы (2.31): только если кому-то из коллег их показываю. Во время поездки «в пути» минуты растут —
    // отправляем не чаще раза в 10 минут; поправили запись — сразу.
    if (snap.hoursOn && snap.colleagues.length && accessMode(snap, 'hours', pv).mode !== 'none') {
      const h = hoursPayload();
      const m = mark(h);
      const live = S.trips.some((t) => !t.end);
      if ((m !== last.hours && (!live || Date.now() - (last.hoursAt || 0) > HOURS_GAP || h.p_month !== last.hoursMonth)) || Date.now() - (last.hoursAt || 0) > RESEND) {
        const r = await rpc('set_hours', h);
        if (r?.ok) { last.hours = m; last.hoursAt = Date.now(); last.hoursMonth = h.p_month; snap.myHours = cleanHours({ month: h.p_month, cur_min: h.p_cur, prev_min: h.p_prev, updated_at: new Date().toISOString() }); }
      }
    }
    writeSync(last);
  } finally { syncing = false; }
}

// ---------------------------------------------------------------- окна

// Согласие с галочкой (не отмечена заранее). true — человек согласился.
function askConsent({ title, html, label, ok, policy = false }) {
  return new Promise((resolve) => {
    let result = false;
    const el = openLayer(sheet({ title, tall: true,
      body: `${html}${policy ? `<div class="acc-docs"><button type="button" class="link-btn" data-act="col-policy">${small(I.book, 16)} Прочитать политику</button></div>` : ''}
        <div class="acc-consent col-agree"><input type="checkbox" id="col-agree"><label for="col-agree">${label}</label></div>
        <div id="col-agree-err" class="acc-err" role="alert" aria-live="assertive"></div>`,
      foot: `<button class="btn btn-primary" data-act="col-agree-ok">${esc(ok)}</button>` }), { onClose: () => resolve(result) });
    el.querySelector('[data-act="col-policy"]')?.addEventListener('click', () => openLayer(sheet({ title: 'Политика обработки персональных данных', body: policyHtml(), tall: true, back: true })));
    el.querySelector('[data-act="col-agree-ok"]').addEventListener('click', () => {
      const box = el.querySelector('#col-agree');
      if (!box.checked) {
        el.querySelector('#col-agree-err').innerHTML = `<div class="error-box">${I.alert}<span>Отметьте галочку, если согласны.</span></div>`;
        box.focus();
        return;
      }
      result = true;
      closeLayer(el);
    });
  });
}

function needAccount() {
  const el = openLayer(sheet({ title: 'Нужен аккаунт CABINA', body: `
    <p class="hint">Коллеги работают через аккаунт: так предложения и ваш статус доходят только до тех, кого вы сами добавили.</p>
    <div class="notice ok">${I.shield}<div>Без аккаунта CABINA работает как раньше: все записи остаются в этом телефоне.</div></div>`,
  foot: '<button class="btn btn-primary" data-act="col-to-account">Настройки аккаунта</button>' }));
  el.querySelector('[data-act="col-to-account"]').addEventListener('click', () => { closeLayer(el); hooks.go('account'); });
}

const snapOrSay = async () => {
  const snap = C.snap || await loadColleagues({ force: true });
  if (!snap) toast(C.err === 'server' ? SERVER_OFF : OFFLINE, { error: true, ms: 5000 });
  return snap;
};

// Новая редакция согласия — для тех, кто зарегистрировался раньше (privacy-2: «Коллеги», privacy-3: приглашения и идеи).
// Нужна и для приглашений и идей (invites.js, ideas.js)
export async function ensureConsent() {
  const snap = await snapOrSay();
  if (!snap) return false;
  if (snap.consent.main) return true;
  const ok = await askConsent({ title: 'Новая редакция согласия', html: consentHtml(), policy: true, ok: 'Принять',
    label: 'Мне исполнилось 18 лет. Даю согласие на обработку моих персональных данных в этой редакции.' });
  if (!ok) return false;
  const r = await rpc('give_consent', { p_document: CONSENT_VERSION });
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return false; }
  snap.consent.main = true;
  toast('Согласие принято');
  hooks.rerender();
  scheduleSync(0);
  return true;
}

// Без имени коллеги не поймут, кто это: сервер карточку без имени не принимает
export async function ensureCard() {
  const pv = privacyOf();
  const want = cardPayload(S.profile, { findable: pv.find && !!C.snap?.consent.publish, ...avatarRights() });
  if (!want) {
    toast('Сначала укажите имя в профиле — по нему вас узнают коллеги', { error: true, ms: 5000 });
    hooks.go('profile-edit');
    setTimeout(() => document.getElementById('pr-name')?.focus(), 350);
    return false;
  }
  if (C.snap?.card) return true;
  const r = await rpc('save_card', want);
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return false; }
  const last = readSync(C.sub); last.card = mark(want); writeSync(last);
  return true;
}

// Что видит этот коллега: два переключателя в его окне
function colAccessRows(id) {
  const st = sees(C.snap, 'status', id);
  const row = (item, title, sub, on, off = false) => `<div class="row"><div class="grow"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
    <button class="switch" role="switch" data-item="${item}" aria-checked="${on}" aria-label="${title}" ${off ? 'disabled' : ''}></button></div>`;
  return row('status', 'Мой статус', 'В пути, на отдыхе, между поездками', st)
    + row('place', 'Где я', st ? 'Станции и дом отдыха' : 'Сначала включите статус', st && sees(C.snap, 'place', id), !st)
    + (C.snap.hoursOn ? row('hours', 'Мои часы', 'Отработано за месяц, без нормы и заработка', sees(C.snap, 'hours', id)) : '');
}

// «Попросить показать статус» (2.28): отметка в телефоне, кого и когда просили, — чтобы не звать чаще раза в 7 дней
const ASK_KEY = 'cabina-asked';
const ASK_DAYS = 7;
const askedAt = (id) => {
  try { return Number((JSON.parse(localStorage.getItem(ASK_KEY) || '{}') || {})[id]) || 0; } catch { return 0; }
};
const noteAsked = (id) => {
  try {
    const m = JSON.parse(localStorage.getItem(ASK_KEY) || '{}') || {};
    const now = Date.now();
    for (const k of Object.keys(m)) if (!(now - Number(m[k]) < ASK_DAYS * 864e5)) delete m[k];
    m[id] = now;
    localStorage.setItem(ASK_KEY, JSON.stringify(m));
  } catch {}
};
const askedRecently = (id) => Date.now() - askedAt(id) < ASK_DAYS * 864e5;
const askHtml = (id) => (askedRecently(id)
  ? '<div class="hint col-asked">Вы уже попросили показать статус. Коллега увидит просьбу, когда откроет CABINA.</div>'
  : '<button class="btn btn-plain col-ask" data-act="col-ask">Попросить показать статус</button>');
function askError(r) {
  if (!r) return OFFLINE;
  if (notReady(r)) return 'Просьбы на сервере ещё не включены. Попробуйте позже.';
  const m = String(r.data?.message || '');
  if (/cabina: not found/.test(m)) return 'Вы больше не коллеги: просить некого.';
  if (/cabina: limit/.test(m)) return 'На сегодня просьб слишком много. Попробуйте завтра.';
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  return errorText(r);
}
async function askStatus(id) {
  if (!(await ensureConsent())) return false;
  const r = await rpc('ask_status', { p_to: id });
  if (!r?.ok) { toast(askError(r), { error: true, ms: 5000 }); return false; }
  if (r.data === 'already') { toast('Коллега уже разрешил вам видеть статус. Он появится, когда коллега откроет CABINA.', { ms: 5000 }); return true; }
  noteAsked(id);
  toast(r.data === 'later' ? 'Вы уже просили недавно. Повторить можно через неделю.' : 'Просьба отправлена. Коллега увидит её, когда откроет CABINA.', { ms: 5000 });
  return true;
}
// Ответ на просьбу: «не сейчас» или «больше не просить от него» — просящему об этом не сообщается
export async function answerAsk(id, mute) {
  const r = await rpc('answer_status_ask', { p_asker: id, p_mute: !!mute });
  if (!r?.ok) { toast(askError(r), { error: true, ms: 5000 }); return false; }
  if (C.snap) C.snap.asks = C.snap.asks.filter((a) => a.id !== id);
  toast(mute ? 'Больше не будем показывать просьбы от этого коллеги' : 'Хорошо, просьба убрана');
  hooks.rerender();
  return true;
}
// Просьбы мне — для колокольчика
export const colAsks = () => C.snap?.asks || [];

// Окно коллеги: персонаж, имя, статус, что он видит, «Удалить из коллег». С просьбой (из колокольчика) — сверху пояснение:
// ничего не включено, пока человек сам не включит ниже.
export function openColleague(id, { ask = false } = {}) {
  const c = C.snap?.colleagues.find((x) => x.id === id);
  if (!c) return;
  const line = colleagueLine(c.status);
  const el = openLayer(sheet({ title: 'Коллега', body: `
    ${ask ? `<div class="notice col-ask-note">${I.bell}<div><b>${esc(c.card.name)} просит показать ему ваш статус.</b> Пока вы сами не включите переключатель ниже, он ничего не увидит. Решаете вы.</div></div>` : ''}
    <section class="profile-card col-card">
      <span class="avatar view big">${cardAvatar(c.card, 132)}</span>
      <div class="profile-name">${esc(c.card.name)}</div>
      ${cardSub(c.card) ? `<div class="profile-sub">${esc(cardSub(c.card))}</div>` : ''}
      ${line ? `${pill(line, 'pr-status')}<div class="hint">${esc(updatedText(c.status.at))}</div>` : `<div class="hint">Статус не показан: коллега его не включил или давно не открывал CABINA.</div><div id="col-ask-box">${askHtml(c.id)}</div>`}
    </section>
    ${hoursBox(c)}
    <div class="group-title">Что видит ${esc(c.card.name)}</div>
    <div class="panel" id="col-acc">${colAccessRows(c.id)}</div>
    <div class="notice ok">${I.shield}<div>Номер поезда и локомотива, точное время явки и причину отвлечения CABINA коллегам не показывает.</div></div>`,
  foot: `<button class="btn btn-danger" data-act="col-drop">${small(I.trash, 18)} Удалить из коллег</button>` }),
  { onClose: ask ? () => hooks.rerender() : undefined });
  el.querySelector('#col-acc').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-item]');
    if (!b || C.busy) return;
    C.busy = true;
    try { await setAccessFor(b.dataset.item, c.id, b.getAttribute('aria-checked') !== 'true'); } finally { C.busy = false; }
    const box = el.querySelector('#col-acc');
    if (box) box.innerHTML = colAccessRows(c.id);
    if (ask) loadColleagues({ force: true }); // включил — просьба выполнена и на сервере стёрта
  });
  el.querySelector('#col-ask-box')?.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="col-ask"]') || C.busy) return;
    C.busy = true;
    try { if (await askStatus(c.id)) { const box = el.querySelector('#col-ask-box'); if (box) box.innerHTML = askHtml(c.id); } } finally { C.busy = false; }
  });
  el.querySelector('[data-act="col-drop"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Удалить из коллег?', ok: 'Удалить',
      text: `${c.card.name} перестанет видеть ваш статус, а вы — его. Снова предложить вам стать коллегами этот человек сможет только через 30 дней.` });
    if (!ok) return;
    const r = await rpc('drop_colleague', { p_other: c.id });
    if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return; }
    closeLayer(el);
    toast('Удалён из коллег');
    await loadColleagues({ force: true });
  });
}

// ---------------------------------------------------------------- разметка

// Мои часы так, как их увидит коллега: «112 ч в ноябре»
const myHoursLine = () => { const h = hoursPayload(); return hoursLines(cleanHours({ month: h.p_month, cur_min: h.p_cur }))[0]; };
// Часы коллеги в его окне (2.31): только если он сам мне их показывает
function hoursBox(c) {
  const ls = hoursLines(c.hours);
  if (!ls.length) return '';
  return `<div class="panel col-hours-box" id="col-hours"><div class="row"><span class="ico" style="--c:var(--ok)">${I.clock}</span>
    <div class="grow"><div class="t2">Отработано</div><div class="t1">${esc(ls[0])}</div>${ls[1] ? `<div class="t2">${esc(ls[1])}</div>` : ''}</div></div></div>
    <div class="hint col-hours-upd">${esc(updatedText(c.hours.at))}</div>`;
}

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
function cardAvatar(card, size = 44) {
  if (card.avatar) return avatarSvg(card.avatar, { size, cls: 'ava-svg' });
  const ini = initials(card.name);
  return ini ? `<span class="ava-txt">${esc(ini)}</span>` : I.user;
}
export const colSnap = () => C.snap;
export const colSub = () => C.sub;
export const colMarkStatusCleared = () => { const last = readSync(C.sub); last.status = ''; last.statusAt = 0; writeSync(last); if (C.snap) C.snap.myStatus = null; };
export const colSync = () => scheduleSync(0);
export const colRerender = () => hooks.rerender();
export const colGo = (p) => hooks.go(p);
export const colBack = () => hooks.back?.();
export { cardAvatar, cardSub, pill, avaBox, mine as colMine, snapOrSay, notReady, OFFLINE, needAccount };
const cardSub = (card) => [card.role === 'other' ? '' : ROLE_NAMES[card.role], card.depot ? `депо ${card.depot}` : ''].filter(Boolean).join(' · ');
const pill = (line, cls = 'col-st') => `<span class="${cls} st-${line.kind}"><span class="dot"></span><b>${esc(line.label)}</b>${line.sub ? `<small>${esc(line.sub)}</small>` : ''}</span>`;
const avaBox = (card) => `<span class="col-ava" aria-hidden="true">${cardAvatar(card)}</span>`;
const idAttr = (id) => `data-id="${esc(id)}"`;

function colleagueRow(c) {
  const line = colleagueLine(c.status);
  return `<button class="row col-row" data-act="col-open" ${idAttr(c.id)}>${avaBox(c.card)}
    <div class="grow"><div class="t1">${esc(c.card.name)}</div>
      ${line ? `<div class="t2">${pill(line)}</div><div class="col-upd">${esc(updatedText(c.status.at))}</div>` : '<div class="t2">Статус не показан</div>'}
      ${c.hours ? `<div class="col-upd col-hrs">${small(I.clock, 14)} ${esc(hoursLines(c.hours)[0])}</div>` : ''}</div>${small(I.right, 18)}</button>`;
}
function offerRow(o) {
  return `<div class="col-offer">
    <div class="col-who">${avaBox(o.card)}<div class="grow"><div class="t1">${esc(o.card.name)}</div><div class="t2">${esc(cardSub(o.card) || 'Предлагает стать коллегами')}</div></div></div>
    ${cardSub(o.card) ? '<div class="t2">Предлагает стать коллегами</div>' : ''}
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="col-decline" ${idAttr(o.id)}>Отклонить</button><button class="btn btn-primary btn-sm" data-act="col-accept" ${idAttr(o.id)}>Принять</button></div>
  </div>`;
}
function sentRow(o) {
  return `<div class="row col-row">${avaBox(o.card)}<div class="grow"><div class="t1">${esc(o.card.name)}</div><div class="t2">Ждёт ответа</div></div>
    <button class="btn btn-plain btn-sm" data-act="col-cancel" ${idAttr(o.id)} aria-label="Отменить предложение: ${esc(o.card.name)}">Отменить</button></div>`;
}

function loadingHtml() {
  const body = C.err
    ? `<div class="grow t2">${esc(C.err === 'server' ? SERVER_OFF : C.err === 'offline' ? 'Нет связи с сервером — коллег покажем, когда появится интернет.' : 'Не удалось загрузить коллег.')}</div><button class="btn btn-plain btn-sm" data-act="col-retry">Повторить</button>`
    : '<div class="grow t2">Загружаем коллег…</div>';
  return `<div class="panel"><div class="row col-row">${body}</div></div>`;
}

// Порядок в списке (просьба Никиты, 2.19.1): сверху — в пути, ниже — на отдыхе (и ждут явку в доме отдыха),
// ещё ниже — на выходном, на очереди и на полном отдыхе, потом все остальные. Внутри — по имени.
export const TEAM_GROUPS = ['В пути', 'На отдыхе', 'На выходном и на очереди', 'Остальные'];
export function teamGroup(st, nowAbs = Date.now()) {
  if (!st) return 3;
  const kind = st.until != null && st.until <= nowAbs && st.after ? st.after : st.kind;
  if (kind === 'trip') return 0;
  if (kind === 'rest' || kind === 'wait') return 1;
  if (kind === 'dayoff') return 2;
  if (kind === 'between' && st.kind === 'between' && st.note && st.until != null && st.until > nowAbs) return 2;
  return 3;
}
// Поиск среди своих: по имени и депо, без учёта регистра, «ё» и знаков («тд64» найдёт «ТД-64»)
const fold = (v) => String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
export function teamMatch(c, q) {
  const words = String(q || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).map(fold).filter(Boolean);
  if (!words.length) return true;
  const hay = `${fold(c.card.name)} ${fold(c.card.depot)} ${fold(normDepot(c.card.depot))}`;
  const depot = fold(normDepot(q)); // «td 64» → «тд64»
  return words.every((w) => hay.includes(w)) || (depot.length > 1 && hay.includes(depot));
}
function teamListHtml(snap) {
  const now = Date.now();
  const list = snap.colleagues.filter((c) => teamMatch(c, C.teamQ));
  if (!list.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Никого не нашли</b><p>Поиск идёт по именам и депо ваших коллег.</p></div>`;
  const groups = TEAM_GROUPS.map(() => []);
  for (const c of list) groups[teamGroup(c.status, now)].push(c);
  const titled = groups.filter((g) => g.length).length > 1;
  return groups.map((g, i) => (g.length ? `${titled ? `<div class="group-title col-gt">${TEAM_GROUPS[i]} <span class="hint">${g.length}</span></div>` : ''}<div class="panel">${g.map(colleagueRow).join('')}</div>` : '')).join('');
}

// Строка «Коллеги» на экране «Профиль»: открывает экран со списком. Без аккаунта её нет.
// extra — ещё строки в той же группе («Пригласить коллег» из invites.js, через app.js — без круговых импортов)
export function colleaguesHtml(extra = '') {
  if (!legalReady() || !mine()) return '';
  ensureFresh();
  const snap = C.snap;
  let sub = 'Загружаем…'; let badge = '';
  if (!snap) sub = C.err ? 'Нет связи с сервером' : 'Загружаем…';
  else if (!snap.consent.main) sub = 'Нужно принять новую редакцию согласия';
  else {
    const n = snap.colleagues.length;
    const onTrip = snap.colleagues.filter((c) => teamGroup(c.status) === 0).length;
    sub = n ? `${n} ${plural(n, 'коллега', 'коллеги', 'коллег')}${onTrip ? ` · ${onTrip} в пути` : ''}` : 'Пока никого — найдите коллег по имени';
    const k = snap.incoming.length;
    if (k) badge = `<span class="col-badge" aria-label="Новых предложений: ${k}">${k}</span>`;
  }
  return `<div class="group" id="col-entry-sec"><div class="group-title">Коллеги</div>
    <button class="col-search" data-act="go" data-page="colleagues" id="col-find" aria-label="Найти коллегу">${small(I.search, 20)}<span>Найти</span></button>
    <div class="panel"><button class="row" data-act="go" data-page="team" id="col-entry"><span class="ico" style="--c:var(--ok)">${I.users}</span>
      <div class="grow"><div class="t1">Мои коллеги</div><div class="t2">${esc(sub)}</div></div>${badge}${small(I.right, 18)}</button>${extra}</div></div>`;
}

export function teamReset() { C.teamQ = ''; }

// Экран «Коллеги»: поиск среди своих (в самом верху), предложения, список по статусам, «Ждут ответа».
// Найти нового коллегу — строкой «Найти коллегу» в профиле (здесь кнопка только пока коллег нет)
export function renderTeam() {
  const head = pageHead('Коллеги', { back: true });
  if (!legalReady() || !mine()) {
    return `${head}<div class="notice ok">${I.shield}<div><b>Нужен аккаунт CABINA.</b> Коллеги работают через аккаунт: так предложения и статус доходят только до тех, кого вы добавили.</div></div>
      <button class="btn btn-primary" data-act="go" data-page="account">Настройки аккаунта</button>`;
  }
  ensureFresh();
  const snap = C.snap;
  if (!snap) return `${head}<div class="col-sec" id="col-sec">${loadingHtml()}</div>`;
  if (!snap.consent.main) {
    return `${head}<div class="col-sec" id="col-sec">
      <div class="notice ok">${I.shield}<div><b>Новая редакция согласия.</b> В ней появились группы коллег. Чтобы пользоваться «Коллегами», прочитайте и примите согласие.</div></div>
      <button class="btn btn-primary" data-act="col-consent">Прочитать и принять</button></div>`;
  }
  const q = C.teamQ;
  const n = snap.colleagues.length;
  return `${head}<div class="col-sec" id="col-sec">
    ${n ? `<div class="search"><span aria-hidden="true">${small(I.search, 18)}</span><input type="search" class="input" id="team-q" placeholder="Поиск: имя или депо" autocomplete="off" enterkeyhint="search" value="${esc(q)}" aria-label="Поиск среди коллег">${q ? `<button class="search-x" data-act="col-team-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>` : ''}</div>` : ''}
    ${snap.incoming.length ? `<div class="group-title">Предлагают стать коллегами</div><div class="panel col-offers">${snap.incoming.map(offerRow).join('')}</div>` : ''}
    ${n ? `<div id="col-list">${teamListHtml(snap)}</div>`
      : '<div class="hint col-empty">Пока никого. Найдите коллегу по имени и предложите стать коллегами — когда он согласится, появится здесь.</div>'}
    ${snap.outgoing.length ? `<div class="group-title">Ждут ответа</div><div class="panel">${snap.outgoing.map(sentRow).join('')}</div>` : ''}
    ${n ? '' : `<button class="col-search" data-act="go" data-page="colleagues">${small(I.search, 20)}<span>Найти коллегу</span></button>`}
  </div>`;
}

// «Настройки аккаунта» → группа «Коллеги»: приватность и «Выйти из „Коллег“»
export function colleaguesAccountHtml() {
  if (!legalReady() || !mine()) return '';
  ensureFresh();
  const snap = C.snap;
  const linked = snap && (snap.card || snap.colleagues.length + snap.incoming.length + snap.outgoing.length > 0);
  return `<div class="group" id="acc-col"><div class="group-title">Коллеги</div>
    <div class="panel"><button class="row" data-act="go" data-page="privacy"><span class="ico" style="--c:var(--ok)">${I.lock}</span>
      <div class="grow"><div class="t1">Приватность</div><div class="t2">Кто из коллег что видит: статус, где вы, часы, депо, персонаж, поиск</div></div>${small(I.right, 18)}</button></div>
    ${linked ? '<button class="link-btn col-leave" data-act="col-leave">Выйти из «Коллег»</button>' : ''}
  </div>`;
}

const accessRow = (item, ico, color, snap) => `<button class="row" data-act="col-access" data-item="${item}"><span class="ico" style="--c:var(${color})">${ico}</span>
  <div class="grow"><div class="t1">${ACCESS_ITEMS[item].what}</div><div class="t2">Видят: <b>${esc(snap ? accessText(snap, item) : '…')}</b></div></div>${small(I.right, 18)}</button>`;

// Экран «Приватность» (Настройки → Настройки аккаунта): что и кому из коллег видно. По умолчанию — ничего.
export function renderPrivacy() {
  const head = pageHead('Приватность', { back: true });
  if (!legalReady() || !mine()) {
    return `${head}<div class="notice ok">${I.shield}<div><b>Нужен аккаунт CABINA.</b> Коллеги работают через аккаунт: так ваш статус доходит только до тех, кого вы выберете.</div></div>
      <button class="btn btn-primary" data-act="go" data-page="account">Настройки аккаунта</button>`;
  }
  ensureFresh();
  const snap = C.snap;
  const pv = privacyOf();
  let mineLine = null;
  const toGroups = snap ? snap.groups.filter((g) => g.me.status && pv.status) : [];
  if (snap && (accessMode(snap, 'status', pv).mode !== 'none' || toGroups.length)) {
    let st = statusPayload(statusFacts());
    if (st && accessMode(snap, 'place', pv).mode === 'none' && !groupShare(snap, 'place')) st = { ...st, p_place: null, p_dest: null };
    mineLine = colleagueLine(payloadStatus(st));
  }
  const findSub = pv.find ? `Включено: вас найдут по имени «${esc(cleanText(S.profile.name))}».` : 'Выключено: в поиске вас нет, предложить стать коллегами можете только вы.';
  const cardRow = (k, title, sub, on) => `<div class="row"><div class="grow"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
    <button class="switch" role="switch" data-act="pr-priv" data-k="${k}" aria-checked="${on}" aria-label="${title}"></button></div>`;
  return `${head}
    <p class="hint">Что видят коллеги, решаете вы. По умолчанию — ничего. Номер поезда и локомотива, точное время явки, заработок, норму, причину отвлечения и телефон коллеги не видят никогда.</p>
    ${snap && !snap.consent.main ? `<div class="notice ok">${I.shield}<div><b>Новая редакция согласия.</b> Чтобы показывать что-то коллегам, прочитайте и примите её.</div></div>
      <button class="btn btn-primary" data-act="col-consent">Прочитать и принять</button>` : ''}
    <div class="group"><div class="group-title">Статус для коллег</div>
      <div class="panel" id="pv-access">
        ${accessRow('status', I.train, '--accent', snap)}
        ${accessRow('place', I.route, '--night', snap)}
      </div>
      ${toGroups.length ? `<div class="hint" id="pv-groups">Ещё статус видят группы: ${esc(toGroups.map((g) => `«${g.name}»`).join(', '))}. Это меняется в самой группе.</div>` : ''}
      ${!snap ? `<div class="hint">${C.err ? esc(C.err === 'server' ? SERVER_OFF : 'Нет связи с сервером — покажем, когда появится интернет.') : 'Загружаем…'}</div>`
        : mineLine ? `<div class="hint pv-preview">Так вас видят: ${pill(mineLine)}</div>`
        : accessMode(snap, 'status', pv).mode !== 'none' ? '<div class="hint">Пока нечего показать: добавьте поездку.</div>' : ''}
      ${snap && accessMode(snap, 'status', pv).mode !== 'none' ? '<div class="hint">CABINA не работает в фоне: статус обновляется, когда приложение открыто.</div>' : ''}
    </div>
    ${snap?.hoursOn ? `<div class="group" id="pv-hours"><div class="group-title">Часы для коллег</div>
      <div class="panel">${accessRow('hours', I.clock, '--ok', snap)}</div>
      ${accessMode(snap, 'hours').mode !== 'none' ? `<div class="hint pv-preview">Так вас видят: <b>${esc(myHoursLine())}</b> и итог прошлого месяца.</div>`
        : '<div class="hint">Сколько часов вы отработали за месяц. Только два числа — без нормы, отвлечений и заработка.</div>'}
    </div>` : ''}
    <div class="group"><div class="group-title">Поиск и карточка</div>
      <div class="panel" id="pv-card">
        ${cardRow('find', 'Меня можно найти', findSub, pv.find)}
        ${cardRow('depot', 'Депо', 'Видят коллеги, участники ваших групп, те, с кем есть предложение, и поиск — если вас можно найти.', pv.depot)}
        ${cardRow('avatar', 'Персонаж', 'Без этого вместо персонажа — первые буквы имени.', pv.avatar)}
      </div>
      <div class="hint">Имя и должность видят коллеги, участники ваших групп и те, с кем есть предложение. Изменить их — «Редактировать профиль».</div>
    </div>`;
}

// ---------------------------------------------------------------- «Что сервер знает о вас»

// Выгрузка export_my_data — понятным языком (ст. 14 152-ФЗ: человек вправе знать, что о нём хранится).
// Всё пришло с сервера — значит, только через esc() и проверенные списки.
const PLATFORMS = { web: 'Сайт (браузер)', android: 'Android', ios: 'iPhone (iOS)' };
function dateText(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof v === 'string' ? v : '');
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${+m[3]} ${MONTHS_GEN[+m[2] - 1]} ${m[1]}` : '';
}
function momentText(v, off) {
  const t = time(v);
  if (t == null) return '';
  const x = new Date(t + off);
  return `${x.getUTCDate()} ${MONTHS_GEN[x.getUTCMonth()]} ${x.getUTCFullYear()}, ${hm(t + off)}`;
}
function consentRow(c, off) {
  const m = /^(privacy|publish)-(\d{1,3})$/.exec(typeof c.document === 'string' ? c.document : '');
  const title = !m ? 'Согласие' : m[1] === 'privacy' ? 'Согласие на обработку персональных данных' : 'Согласие на распространение: поиск коллег';
  const current = m && c.document === (m[1] === 'privacy' ? CONSENT_VERSION : PUBLISH_VERSION);
  const given = momentText(c.given_at, off); const gone = momentText(c.withdrawn_at, off);
  const sub = [m ? `редакция ${m[2]}` : txt(c.document), given && `принято ${given}`, gone ? `отозвано ${gone}` : m && !current && 'прежняя редакция'].filter(Boolean);
  return `<div class="row"><div class="grow"><div class="t1">${esc(title)}</div><div class="t2">${esc(sub.join(' · '))}</div></div></div>`;
}
const fact = (label, value, note = '') => `<div class="row"><div class="grow"><div class="t2">${esc(label)}</div><div class="t1 my-val">${esc(value)}</div>${note ? `<div class="t2">${esc(note)}</div>` : ''}</div></div>`;

export function myDataHtml(d, nowAbs = Date.now(), off = tzOffset()) {
  d = d && typeof d === 'object' ? d : {};
  const email = typeof d.email === 'string' ? d.email : '';
  const where = own(PLATFORMS, d.platform) ? PLATFORMS[d.platform] : '';
  const ver = txt(d.app_version, 20);
  const account = [
    email && fact('Почта', email, d.email_confirmed === true ? 'подтверждена' : 'не подтверждена'),
    fact('Пароль', 'Только в зашифрованном виде', 'сам пароль не знает никто, даже мы'),
    dateText(d.created_on) && fact('Аккаунт создан', dateText(d.created_on)),
    dateText(d.last_seen) && fact('Последний заход', dateText(d.last_seen), 'только дата, без времени'),
    (where || ver) && fact('Устройство', [where, ver && `CABINA ${ver}`].filter(Boolean).join(' · ')),
    Number.isInteger(d.active_days) && d.active_days > 0 && fact('Заходили в CABINA', `${d.active_days} ${plural(d.active_days, 'день', 'дня', 'дней')}`, 'только число, без дат — для подсчёта приглашений'),
    d.invited_by != null && fact('Как пришли', d.invited_by === 'admin' ? 'По приглашению разработчика' : 'По приглашению коллеги', 'кто именно — видно только в файле, номером аккаунта'),
  ].filter(Boolean).join('');
  // приглашения и идеи (2.20): числа и свои тексты
  const inv = d.invites && typeof d.invites === 'object' ? d.invites : {};
  const invOpen = arr(inv.open).filter((x) => x && typeof x === 'object').length;
  const n0 = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const invRows = [
    [invOpen, 'Неиспользованные приглашения', 'сам код на сервере не хранится; стираются через 14 дней'],
    [n0(inv.joined), 'Зарегистрировались по вашим приглашениям', 'без почты и имён'],
    [n0(inv.counted), 'Из них засчитано', 'подтвердили почту и заходили в CABINA в 3 разных дня'],
  ].filter(([n]) => n > 0).map(([n, label, note]) => `<div class="row"><div class="grow"><div class="t1">${label}</div><div class="t2">${note}</div></div><b class="num">${n}</b></div>`).join('');
  const IDEA_ST = { new: 'на рассмотрении', accepted: 'принята', declined: 'не подошла' };
  const ideas = arr(d.ideas).filter((x) => x && typeof x === 'object' && typeof x.body === 'string').map((x) => `<div class="row"><div class="grow"><div class="t1 my-val">${esc(cleanText(x.body, 500))}</div>
      <div class="t2">${esc([momentText(x.created_at, off), own(IDEA_ST, x.state) ? IDEA_ST[x.state] : ''].filter(Boolean).join(' · '))}</div></div></div>`).join('');
  const consents = arr(d.consents).filter((c) => c && typeof c === 'object').map((c) => consentRow(c, off)).join('');

  const card = d.colleagues_card && typeof d.colleagues_card === 'object' ? cardFields(d.colleagues_card) : null;
  const st = d.colleagues_status && typeof d.colleagues_status === 'object' ? cleanStatus(d.colleagues_status) : null;
  const line = st && colleagueLine(st, nowAbs, off);
  const links = arr(d.colleagues).filter((l) => l && typeof l === 'object');
  const count = (f) => links.filter(f).length;
  const nums = [
    [count((l) => l.state === 'accepted'), 'Коллеги', ''],
    [count((l) => l.state === 'pending' && l.offered_by_me === true), 'Ваши предложения без ответа', 'стираются через 30 дней'],
    [count((l) => l.state === 'pending' && l.offered_by_me !== true), 'Предложения вам', 'стираются через 30 дней'],
    [count((l) => l.state === 'declined'), 'Отказы и удалённые коллеги', 'стираются через 30 дней'],
  ].filter(([n]) => n > 0).map(([n, label, note]) => `<div class="row"><div class="grow"><div class="t1">${label}</div>${note ? `<div class="t2">${note}</div>` : ''}</div><b class="num">${n}</b></div>`).join('');
  const gone = st && momentText(d.colleagues_status.expires_at, off);
  // кому что видно: без идентификаторов коллег, только «все коллеги» или сколько выбрано
  const rules = arr(d.colleagues_access).filter((a) => a && typeof a === 'object');
  const whom = (item) => {
    const r = rules.filter((a) => a.item === item);
    if (!r.length) return '';
    if (r.some((a) => a.to === 'all')) return 'все коллеги';
    return `${r.length} ${plural(r.length, 'выбранный коллега', 'выбранных коллеги', 'выбранных коллег')}`;
  };
  const shown = [['status', 'Статус видят'], ['place', 'Где вы, видят'], ['hours', 'Часы видят']].filter(([k]) => whom(k)).map(([k, label]) => fact(label, whom(k))).join('');
  const hrs = d.colleagues_hours && typeof d.colleagues_hours === 'object' ? cleanHours(d.colleagues_hours) : null;
  const hrsRow = hrs ? fact('Часы для коллег', hoursLines(hrs).join(', '), [updatedText(hrs.at, nowAbs, off), momentText(d.colleagues_hours.expires_at, off) && `сотрутся сами ${momentText(d.colleagues_hours.expires_at, off)}`].filter(Boolean).join(' · ')) : '';
  const col = card || st || hrs || links.length || rules.length ? `${card ? `<div class="row col-row">${avaBox(card)}<div class="grow"><div class="t1">${esc(card.name)}</div>
        <div class="t2">${esc(cardSub(card) || 'Должность и депо коллеги не видят')}</div></div></div>
      ${fact('В поиске', card.searchable ? 'Да' : 'Нет', card.searchable ? 'вас можно найти по имени' : 'найти вас нельзя, предложить можете только вы')}` : ''}
      ${line ? `<div class="row"><div class="grow"><div class="t2">Статус для коллег</div><div class="t1">${pill(line)}</div>
        <div class="t2">${esc([updatedText(st.at, nowAbs, off), gone && `сотрётся сам ${gone}`].filter(Boolean).join(' · '))}</div></div></div>` : fact('Статус для коллег', 'Не хранится')}
      ${hrsRow}
      ${shown}
      ${nums || fact('Коллеги', 'Пока нет')}`
    : '<div class="row"><div class="grow t2">Вы не включали «Коллеги» — о коллегах на сервере ничего нет.</div></div>';

  // группы (2.22): название, роль, сколько участников, показываю ли статус
  const grs = arr(d.groups).filter((g) => g && typeof g === 'object').map((g) => {
    const m = Number.isInteger(g.members) && g.members > 0 ? g.members : 0;
    const shown = g.show_status === true ? (g.show_place === true ? 'видят статус и где вы' : 'видят статус') : 'статус не видят';
    return `<div class="row"><div class="grow"><div class="t1">${esc(txt(g.name, 30) || 'Группа')}</div>
      <div class="t2">${esc([g.role === 'admin' ? 'вы администратор' : 'участник', m ? `${m} ${plural(m, 'участник', 'участника', 'участников')}` : '', shown].filter(Boolean).join(' · '))}</div></div></div>`;
  }).join('');
  const ginv = arr(d.group_invites).filter((g) => g && typeof g === 'object');
  const ginvRows = [[ginv.filter((g) => g.to_me === true).length, 'Приглашения вам в группы'], [ginv.filter((g) => g.to_me !== true).length, 'Ваши приглашения в группы без ответа']]
    .filter(([k]) => k > 0).map(([k, label]) => `<div class="row"><div class="grow"><div class="t1">${label}</div><div class="t2">стираются через 30 дней</div></div><b class="num">${k}</b></div>`).join('');
  return `<p class="hint">Это всё, что хранится о вас на сервере CABINA в России.</p>
    <div class="group-title">Аккаунт</div><div class="panel">${account}</div>
    ${consents ? `<div class="group-title">Согласия</div><div class="panel">${consents}</div>` : ''}
    <div class="group-title">Коллеги</div><div class="panel">${col}</div>
    ${grs || ginvRows ? `<div class="group-title">Группы</div><div class="panel" id="my-groups">${grs}${ginvRows}</div>` : ''}
    ${invRows ? `<div class="group-title">Приглашения</div><div class="panel">${invRows}</div>` : ''}
    ${ideas ? `<div class="group-title">Ваши идеи</div><div class="panel">${ideas}</div>` : ''}
    <div class="notice ok">${I.shield}<div><b>Не на сервере:</b> поездки, заработок, отвлечения, норма часов, документы, заметки и телефонная книжка — они только в вашем телефоне.</div></div>
    <div class="hint">Ещё 30 дней сервер хранит журнал входов (IP-адрес, браузер, время) — для защиты от взлома. Его можно запросить на ${esc(OPERATOR.email)}.</div>`;
}

// Экран «Найти коллегу»: имя (от 3 букв), депо и должность — по желанию
const ROLE_FILTER = [['', 'Любая'], ['driver', 'Машинист'], ['assistant', 'Помощник']];
function resultRow(c) {
  const snap = C.snap;
  const rel = snap?.colleagues.some((x) => x.id === c.id) ? 'col' : snap?.outgoing.some((x) => x.id === c.id) ? 'sent' : snap?.incoming.some((x) => x.id === c.id) ? 'in' : '';
  const act = rel === 'col' ? '<span class="col-tag ok">Коллега</span>'
    : rel === 'sent' ? '<span class="col-tag">Ждёт ответа</span>'
    : rel === 'in' ? `<button class="btn btn-primary btn-sm" data-act="col-accept" ${idAttr(c.id)}>Принять</button>`
    : `<button class="btn btn-primary btn-sm" data-act="col-offer" ${idAttr(c.id)} aria-label="Предложить стать коллегами: ${esc(c.name)}">Предложить</button>`;
  return `<div class="row col-row">${avaBox(c)}<div class="grow"><div class="t1">${esc(c.name)}</div>${cardSub(c) ? `<div class="t2">${esc(cardSub(c))}</div>` : ''}</div>${act}</div>`;
}
function resultsHtml() {
  if (C.results == null) return '';
  if (!C.results.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Никого не нашли</b><p>Проверьте имя. В поиске только те, кто сам включил «Меня можно найти».</p></div>`;
  const n = C.results.length;
  return `<div class="group-title">Нашли ${n} ${plural(n, 'человека', 'человек', 'человек')}${n >= 20 ? ' — уточните имя или депо' : ''}</div><div class="panel" id="col-found">${C.results.map(resultRow).join('')}</div>`;
}

// Поиск взаимный (2.26, решение Никиты 10.11.2026): искать коллег может тот, кого самого можно найти.
// Переключатели не включены заранее: «Меня можно найти» — с отдельным согласием на распространение (152-ФЗ, ст. 10.1),
// статус — кому из коллег (как в «Приватности»). Выключить можно в любой момент — тогда поиск снова закрыт.
function gateHtml() {
  const st = C.snap ? accessMode(C.snap, 'status').mode !== 'none' : false;
  const row = (title, sub, attrs, on) => `<div class="row"><div class="grow"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
    <button class="switch" role="switch" ${attrs} aria-checked="${on}" aria-label="${title}"></button></div>`;
  return `${pageHead('Найти коллегу', { back: true })}
    <section class="gp-hero col-gate" id="col-gate">
      <span class="gp-lock-ico" style="--c:var(--ok)">${I.users}</span>
      <h2>Сначала покажите себя</h2>
      <p>Поиск взаимный: найти можно только тех, кто сам это разрешил. Разрешите — и ищите коллег.</p>
    </section>
    <div class="panel" id="col-gate-rows">
      ${row('Меня можно найти', 'Коллеги найдут вас по имени', 'data-act="pr-priv" data-k="find"', false)}
      ${row('Показывать статус коллегам', 'В пути, на отдыхе или дома — только вашим коллегам', 'data-act="col-gate-status"', st)}
    </div>
    <button class="btn btn-primary" data-act="col-gate-go" id="col-gate-go">Разрешить и искать</button>
    <p class="hint">Номер поезда и точное время явки не видит никто. Выключить — в любой момент: Настройки аккаунта → «Приватность».</p>`;
}

// «Да, показывать»: «Меня можно найти» (с согласием) и статус — всем коллегам. true — если найти теперь можно.
async function showMe({ status = true } = {}) {
  if (!privacyOf().find) await setFind(true);
  if (!privacyOf().find) return false;
  const snap = C.snap || await loadColleagues({ force: true });
  if (status && snap && accessMode(snap, 'status').mode === 'none') await setAccess('status', 'all');
  hooks.rerender();
  return true;
}

// Сразу после регистрации (2.26, просьба Никиты): один вопрос — показывать ли себя коллегам. «Не сейчас» — ничего не включаем.
export function openShowMe() {
  if (!mine() || privacyOf().find || layerCount()) return;
  const noName = !cleanText(S.profile.name);
  const el = openLayer(sheet({ title: 'Коллеги', body: `<div class="col-showme" id="col-showme">
      <h3 class="sm-q">Показывать коллегам, что вы в поездке или дома?</h3>
      <p>Так коллеги найдут вас, а вы — их. Без этого вы не найдёте коллег, а они не увидят вас.</p>
      ${noName ? `<div class="pay-field"><label for="sm-name">Как вас зовут</label><input class="input" id="sm-name" maxlength="60" autocomplete="name" placeholder="Например, Иван Петров"><div class="hint">По имени вас узнают коллеги.</div></div>` : ''}
      <p class="hint">Номер поезда и точное время явки не видит никто. Выключить — в любой момент в «Приватности».</p>
      <div id="sm-err" class="acc-err" role="alert" aria-live="assertive"></div></div>`,
  foot: '<button class="btn btn-primary" data-act="sm-yes">Да, показывать</button><button class="link-btn sm-later" data-act="sm-later">Не сейчас</button>' }));
  el.querySelector('[data-act="sm-later"]').addEventListener('click', () => closeLayer(el));
  el.querySelector('[data-act="sm-yes"]').addEventListener('click', async () => {
    if (noName) {
      const name = cleanText(el.querySelector('#sm-name')?.value || '');
      if (!name) { el.querySelector('#sm-err').innerHTML = `<div class="error-box">${I.alert}<span>Впишите имя — по нему вас найдут.</span></div>`; el.querySelector('#sm-name')?.focus(); return; }
      await saveProfile({ name: name.slice(0, 60) });
    }
    closeLayer(el);
    if (C.busy) return;
    C.busy = true;
    try { if (await showMe()) toast('Готово: коллеги найдут вас, а вы — их', { ms: 4000 }); } finally { C.busy = false; }
  });
}

export function renderColleagues() {
  if (mine()) ensureFresh();
  else {
    return `${pageHead('Найти коллегу', { back: true })}
      <div class="notice ok">${I.shield}<div><b>Нужен аккаунт CABINA.</b> Коллеги работают через аккаунт: так предложения и статус доходят только до тех, кого вы добавили.</div></div>
      <button class="btn btn-primary" data-act="go" data-page="account">Настройки аккаунта</button>`;
  }
  if (!privacyOf().find) return gateHtml();
  const q = C.q;
  return `${pageHead('Найти коллегу', { back: true })}
    <form class="panel pay-panel" id="col-form" novalidate role="search">
      <div class="pay-field"><label for="col-name">Имя</label><input class="input" id="col-name" type="search" maxlength="60" autocomplete="off" enterkeyhint="search" placeholder="Не меньше 3 букв" value="${esc(q.name)}"></div>
      <div class="pay-field"><label for="col-depot">Депо</label><input class="input" id="col-depot" maxlength="60" autocomplete="off" enterkeyhint="search" placeholder="Необязательно" value="${esc(q.depot)}"></div>
      <div class="pay-field"><div class="label" id="col-role-l">Должность</div>
        <div class="seg col-roles" id="col-role" role="group" aria-labelledby="col-role-l">${ROLE_FILTER.map(([k, v]) => `<button type="button" data-act="col-role" data-role="${k}" aria-pressed="${q.role === k}">${v}</button>`).join('')}</div></div>
    </form>
    <div id="col-err" class="acc-err" role="alert" aria-live="assertive"></div>
    <button class="btn btn-primary" type="submit" form="col-form" id="col-submit">${small(I.search, 18)} ${C.searching ? 'Ищем…' : 'Найти'}</button>
    <div id="col-results">${resultsHtml()}</div>
    <div class="notice ok">${I.shield}<div>В поиске только те, кто сам включил «Меня можно найти». Показываем не больше 20 человек. ${privacyOf().find ? 'Вас тоже можно найти по имени.' : 'Вас в поиске нет — это включается в Настройках аккаунта → «Приватность».'}</div></div>`;
}

// ---------------------------------------------------------------- действия

function showErr(text, focusId) {
  const box = document.getElementById('col-err');
  if (box) box.innerHTML = text ? `<div class="error-box">${I.alert}<span>${esc(text)}</span></div>` : '';
  if (focusId) document.getElementById(focusId)?.focus();
}

export function colleaguesInput(t) {
  if (t.id === 'team-q') {
    C.teamQ = t.value;
    const box = document.getElementById('col-list');
    if (box && C.snap) box.innerHTML = teamListHtml(C.snap);
    const x = t.parentElement.querySelector('.search-x');
    if (C.teamQ && !x) t.parentElement.insertAdjacentHTML('beforeend', `<button class="search-x" data-act="col-team-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>`);
    else if (!C.teamQ && x) x.remove();
    return true;
  }
  if (t.id === 'col-name') { C.q.name = t.value; return true; }
  if (t.id === 'col-depot') { C.q.depot = t.value; return true; }
  return false;
}

export async function colleaguesSubmit(e) {
  if (e.target.id !== 'col-form') return false;
  e.preventDefault();
  if (C.searching || !mine()) return true;
  C.q.name = document.getElementById('col-name')?.value ?? C.q.name;
  C.q.depot = document.getElementById('col-depot')?.value ?? C.q.depot;
  if (cleanText(C.q.name).toLowerCase().replace(/[^a-zа-яё0-9]/g, '').length < 3) { showErr('Введите не меньше 3 букв имени.', 'col-name'); return true; }
  showErr('');
  if (!(await ensureConsent())) return true;
  C.searching = true;
  const btn = document.getElementById('col-submit');
  if (btn) { btn.disabled = true; btn.lastChild.textContent = ' Ищем…'; }
  let r;
  try { r = await rpc('find_colleagues', { p_name: cleanText(C.q.name), p_depot: cleanText(normDepot(C.q.depot)) || null, p_role: C.q.role || null }); } finally { C.searching = false; }
  if (!r?.ok) { hooks.rerender(); showErr(colError(r, 'search')); return true; }
  C.results = arr(r.data).map(cleanCard).filter((c) => c && c.id !== C.sub).slice(0, 20);
  document.activeElement?.blur?.();
  hooks.rerender();
  return true;
}

async function setFind(on) {
  const pv = privacyOf();
  if (!on) {
    await saveProfile({ privacy: { ...pv, find: false } });
    if (!mine()) return;
    const snap = C.snap || await loadColleagues({ force: true });
    if (!snap?.card?.searchable) { toast('Вас больше нет в поиске'); return; }
    const want = cardPayload(S.profile, { findable: false, ...avatarRights() }) || { p_name: snap.card.name, p_role: snap.card.role || null, p_depot: null, p_avatar: null, p_searchable: false };
    const r = await rpc('save_card', want);
    if (r?.ok) { snap.card = { ...snap.card, searchable: false }; snap.consent.publish = false; const last = readSync(C.sub); last.card = mark(want); writeSync(last); toast('Вас больше нет в поиске'); }
    else toast('Нет связи: уберём вас из поиска, как только появится интернет', { error: true, ms: 5000 });
    hooks.rerender();
    return;
  }
  if (!mine()) { needAccount(); return; }
  if (!cleanText(S.profile.name)) {
    toast('Сначала укажите имя — по нему вас найдут', { error: true, ms: 4000 });
    if (!document.getElementById('pr-name')) hooks.go('profile-edit');
    setTimeout(() => document.getElementById('pr-name')?.focus(), 350);
    return;
  }
  if (!(await ensureConsent())) return;
  const want = cardPayload(S.profile, { findable: true, ...avatarRights() });
  const shown = ['имя', want.p_role ? 'должность' : '', want.p_depot ? 'депо' : '', want.p_avatar ? 'персонаж' : ''].filter(Boolean);
  const ok = await askConsent({ title: 'Меня можно найти', ok: 'Включить',
    html: `<div class="notice ok">${I.users}<div>Пользователи CABINA смогут найти вас по имени и увидят: <b>${shown.join(', ')}</b>. Статус, список коллег, почту и телефон в поиске не видно.</div></div>${publishConsentHtml(session()?.email || '')}`,
    label: 'Даю согласие на распространение этих данных, чтобы коллеги могли найти меня в поиске CABINA.' });
  if (!ok) return;
  let r = await rpc('give_consent', { p_document: PUBLISH_VERSION });
  if (r?.ok) r = await rpc('save_card', want);
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return; }
  if (C.snap) { C.snap.consent.publish = true; C.snap.card = cleanCard({ user_id: C.sub, name: want.p_name, role: want.p_role, depot: want.p_depot, avatar: want.p_avatar, searchable: true }); }
  const last = readSync(C.sub); last.card = mark(want); writeSync(last);
  await saveProfile({ privacy: { ...privacyOf(), find: true } });
  toast('Теперь вас можно найти по имени');
}

// Кому показывать статус или «где я»: none — никому, all — всем коллегам, some — выбранным (ids).
// Сначала сервер, потом телефон: если сервер не принял, ничего не меняется. Дать доступ — только с согласием.
async function setAccess(item, mode, ids = []) {
  if (!mine()) { needAccount(); return false; }
  const snap = await snapOrSay();
  if (!snap) return false;
  ids = [...new Set(ids)].filter((id) => snap.colleagues.some((c) => c.id === id));
  if (mode === 'some' && !ids.length) mode = 'none';
  if (mode !== 'none' && !(await ensureConsent())) return false;
  const r = await rpc('set_access', { p_item: item, p_all: mode === 'all', p_ids: mode === 'some' ? ids : null });
  if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); return false; }
  snap.access[item] = { all: mode === 'all', ids: mode === 'some' ? ids : [] };
  if (item === 'status') {
    const on = mode !== 'none' || groupShare(snap, 'status'); // группе показываю — статус продолжает уходить
    if (!on) {
      // сервер стёр статус сам: никому не показываю — и хранить незачем
      const last = readSync(C.sub); last.status = ''; last.statusAt = 0; writeSync(last); snap.myStatus = null;
    }
    if (privacyOf().status !== on) await saveProfile({ privacy: { ...privacyOf(), status: on } });
  }
  if (item === 'hours' && mode === 'none') {
    // сервер стёр часы сам
    const last = readSync(C.sub); last.hours = ''; last.hoursAt = 0; writeSync(last); snap.myHours = null;
  }
  scheduleSync(0);
  hooks.rerender();
  return true;
}

// Переключатель в окне коллеги: видит ли именно он. «Все коллеги» без одного — становится «выбранные».
async function setAccessFor(item, id, on) {
  const snap = C.snap;
  if (!snap) return false;
  if (on && item === 'place' && !sees(snap, 'status', id) && !(await setAccessFor('status', id, true))) return false;
  const m = accessMode(snap, item);
  const all = snap.colleagues.map((c) => c.id);
  if (on) return m.mode === 'all' ? true : setAccess(item, 'some', [...m.ids, id]);
  const ids = (m.mode === 'all' ? all : m.ids).filter((x) => x !== id);
  return setAccess(item, ids.length ? 'some' : 'none', ids);
}

const ACCESS_ITEMS = {
  status: { title: 'Кто видит мой статус', what: 'Мой статус', sub: '«В пути», «На отдыхе», «Между поездками» — без станций, точного времени явки и номера поезда.' },
  place: { title: 'Кто видит, где я', what: 'Где я', sub: 'Станции в пути и дом отдыха — в статусе. Только тем, кто видит и сам статус.' },
  hours: { title: 'Кто видит мои часы', what: 'Мои часы', sub: 'Сколько часов вы отработали в этом месяце и в прошлом. Норму, переработку, отвлечения и заработок коллеги не видят. Группам часы не показываются.' },
};

// Выбор «кому видно» для статуса или «где я»: никому, всем коллегам или выбранным
async function openAccess(item) {
  if (!own(ACCESS_ITEMS, item)) return;
  if (!mine()) { needAccount(); return; }
  const snap = await snapOrSay();
  if (!snap) return;
  if (item === 'hours' && !snap.hoursOn) { toast(HOURS_OFF, { ms: 5000 }); return; }
  if (item === 'place' && accessMode(snap, 'status').mode === 'none') { toast('Сначала выберите, кто видит ваш статус', { ms: 4000 }); return; }
  const cur = accessMode(snap, item);
  const pool = item === 'place' ? snap.colleagues.filter((c) => sees(snap, 'status', c.id)) : snap.colleagues;
  const picked = new Set(cur.mode === 'some' ? cur.ids.filter((id) => pool.some((c) => c.id === id)) : []);
  let mode = cur.mode === 'some' && !picked.size ? 'none' : cur.mode;
  const it = ACCESS_ITEMS[item];
  const opt = (v, label, sub, off = false) => `<button type="button" class="radio-row" data-mode="${v}" aria-pressed="${mode === v}" ${off ? 'disabled' : ''}><span class="dot"></span><span class="grow">${label}<small>${sub}</small></span><span></span></button>`;
  const allSub = item === 'place' && accessMode(snap, 'status').mode === 'some' ? 'Все, кто видит ваш статус' : 'И те, кто станет коллегой потом';
  const el = openLayer(sheet({ title: it.title, tall: true, body: `
    <p class="hint">${it.sub}</p>
    <div class="acc-modes" role="radiogroup" aria-label="${esc(it.title)}">
      ${opt('none', 'Никто', 'Не показывать')}
      ${opt('all', 'Все коллеги', allSub)}
      ${opt('some', 'Только выбранные', pool.length ? 'Отметьте, кому показывать' : 'Пока некого выбрать', !pool.length)}
    </div>
    <div class="acc-who" id="acc-who" ${mode === 'some' ? '' : 'hidden'}>
      ${pool.map((c) => `<button type="button" class="pick-row" role="checkbox" aria-checked="${picked.has(c.id)}" ${idAttr(c.id)}><span class="box">${I.check}</span>${avaBox(c.card)}<span class="t1">${esc(c.card.name)}</span></button>`).join('')}
    </div>
    <div id="acc-err" class="acc-err" role="alert" aria-live="assertive"></div>`,
  foot: '<button class="btn btn-primary" data-act="access-save">Сохранить</button>' }));
  el.addEventListener('click', async (e) => {
    const m = e.target.closest('.radio-row[data-mode]');
    if (m && !m.disabled) {
      mode = m.dataset.mode;
      el.querySelectorAll('.radio-row[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === m)));
      el.querySelector('#acc-who').hidden = mode !== 'some';
      el.querySelector('#acc-err').innerHTML = '';
      return;
    }
    const p = e.target.closest('.pick-row');
    if (p) {
      const id = p.dataset.id;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      p.setAttribute('aria-checked', String(picked.has(id)));
      el.querySelector('#acc-err').innerHTML = '';
      return;
    }
    if (!e.target.closest('[data-act="access-save"]') || C.busy) return;
    if (mode === 'some' && !picked.size) {
      el.querySelector('#acc-err').innerHTML = `<div class="error-box">${I.alert}<span>Отметьте хотя бы одного коллегу или выберите «Никто».</span></div>`;
      return;
    }
    C.busy = true;
    try {
      if (await setAccess(item, mode, [...picked])) { closeLayer(el); toast('Сохранено'); }
    } finally { C.busy = false; }
  });
}

export async function colleaguesClick(act, b) {
  if (act === 'pr-priv' && b.dataset.k === 'find') {
    if (C.busy) return true;
    C.busy = true;
    try { await setFind(!privacyOf().find); } finally { C.busy = false; }
    return true;
  }
  if (!act.startsWith('col-')) return false;
  if (act === 'col-access') { openAccess(b.dataset.item); return true; }
  if (act === 'col-gate-status' || act === 'col-gate-go') {
    if (C.busy) return true;
    C.busy = true;
    try {
      if (act === 'col-gate-go') await showMe();
      else {
        const snap = await snapOrSay();
        if (snap) await setAccess('status', accessMode(snap, 'status').mode === 'none' ? 'all' : 'none');
      }
    } finally { C.busy = false; }
    return true;
  }
  if (act === 'col-role') {
    C.q.role = own(ROLE_NAMES, b.dataset.role) ? b.dataset.role : '';
    document.querySelectorAll('#col-role button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    return true;
  }
  if (act === 'col-open') { openColleague(b.dataset.id); return true; }
  if (act === 'col-team-clear') { C.teamQ = ''; hooks.rerender(); document.getElementById('team-q')?.focus(); return true; }
  if (act === 'col-retry') { C.err = ''; C.failAt = 0; loadColleagues({ force: true }); hooks.rerender(); return true; }
  if (C.busy) return true;
  C.busy = true;
  try {
    const id = String(b.dataset.id || '').toLowerCase();
    const who = C.results?.find((x) => x.id === id) || [...(C.snap?.incoming || []), ...(C.snap?.outgoing || [])].find((x) => x.id === id)?.card;
    switch (act) {
      case 'col-consent': await ensureConsent(); break;
      case 'col-offer': {
        if (!UUID.test(id) || !(await ensureConsent())) break;
        const ok = await confirmDialog({ title: 'Предложить стать коллегами?', ok: 'Предложить', danger: false,
          text: `${who?.name || 'Человек'} получит предложение. Если согласится, вы станете коллегами. Свой статус каждый показывает сам — кому захочет.` });
        if (!ok || !(await ensureCard())) break;
        const r = await rpc('offer_colleague', { p_to: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 6000 }); break; }
        toast(r.data === 'accepted' ? 'Теперь вы коллеги' : r.data === 'already' ? 'Вы уже коллеги' : 'Предложение отправлено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-accept': {
        if (!UUID.test(id) || !(await ensureConsent()) || !(await ensureCard())) break;
        const r = await rpc('answer_colleague', { p_from: id, p_accept: true });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast(accessMode(C.snap, 'status').mode === 'all' ? 'Теперь вы коллеги' : 'Теперь вы коллеги. Видит ли он ваш статус — решаете вы в «Приватности»', { ms: 5000 });
        await loadColleagues({ force: true });
        break;
      }
      case 'col-decline': {
        const ok = await confirmDialog({ title: 'Отклонить предложение?', ok: 'Отклонить',
          text: `Повторное предложение от ${who?.name ? `«${who.name}»` : 'этого человека'} сможет прийти только через 30 дней.` });
        if (!ok) break;
        const r = await rpc('drop_colleague', { p_other: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast('Предложение отклонено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-cancel': {
        const r = await rpc('drop_colleague', { p_other: id });
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        toast('Предложение отменено');
        await loadColleagues({ force: true });
        break;
      }
      case 'col-leave': {
        const ok = await confirmDialog({ title: 'Выйти из «Коллег»?', ok: 'Выйти',
          text: 'С сервера сразу сотрутся ваша карточка, статус, предложения и список коллег, вас не будет в поиске. Аккаунт и записи в телефоне останутся.' });
        if (!ok) break;
        const r = await rpc('leave_colleagues');
        if (!r?.ok) { toast(colError(r), { error: true, ms: 5000 }); break; }
        writeSync({ sub: C.sub, card: '', status: '', statusAt: 0 });
        C.results = null;
        await saveProfile({ privacy: { ...privacyOf(), find: false, status: false } });
        toast('Данные «Коллег» стёрты с сервера');
        await loadColleagues({ force: true });
        break;
      }
      default: return false;
    }
  } finally { C.busy = false; }
  return true;
}
