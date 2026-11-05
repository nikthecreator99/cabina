// Профиль. Хранится в этом телефоне; коллегам (с 2.15, colleagues.js) уходит только то, что человек включил в «Приватности».
// Экран «Профиль» — просмотр и «Коллеги»; изменить персонажа, имя, должность и депо — «Редактировать профиль».
// «Приватность» с 2.16 — в Настройках аккаунта (colleagues.js): там же и кому из коллег что видно.
// С 2.12 вместо фото — нарисованный персонаж (avatar.js). Старое фото показывается, пока человек не создал персонажа.
import { I, esc, small, pageHead, toast, confirmDialog, infoDialog, whenShort, dayMonth } from './ui.js';
import { S, saveProfile, nowLocal, liveTrip, isPending, statsOf, routeOf, legAt, legEnds, legRoute } from './store.js';
import { dateKeyOf, parseLocal, hasLegs } from './calc.js';
import { ROLES, OVERREST_MAX } from './pay.js';
import { currentRest, dayOffIntervals, chosenRest, routeEnds } from './rest.js';
import { careerOf, careerSub, totalTenure, tenureText } from './career.js';
import { normPhone } from './phones.js';
import { avatarSvg, normalizeAvatar } from './avatar.js';
import { hasAvatar, avatarRights } from './avatar-edit.js';
import { awardsStripHtml } from './awards.js';

const CLASSES = ['3', '2', '1'];
// Должность в профиле: для расчёта заработка важны только помощник и машинист, «Другая» — для поиска коллег
export const PROFILE_ROLES = { ...ROLES, other: 'Другая' };
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

const safePhoto = (v) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(v || ''));

// Что видят коллеги (раздел «Коллеги», нужен аккаунт). По умолчанию — ничего. Переключатели — на экране «Приватность»
// (colleagues.js): «Меня можно найти» — с согласием, статус — кому из коллег (правила на сервере), депо и персонаж — здесь же.
// phone пока никуда не уходит.
// До 2.12 вместо персонажа было фото: прежний выбор «показывать фото» переходит к персонажу
export function privacyOf(p = S.profile) {
  const { photo, ...pv } = p.privacy || {};
  return { find: false, status: false, depot: false, avatar: photo === true, phone: false, ...pv };
}

export function avatarHtml(p = S.profile, size = 96) {
  if (hasAvatar(p)) return avatarSvg(normalizeAvatar(p.avatar, avatarRights()), { size, cls: 'ava-svg' });
  return safePhoto(p.photo) ? `<img src="${esc(p.photo)}" alt="" width="${size}" height="${size}">`
    : initials(p.name) ? `<span class="ava-txt">${esc(initials(p.name))}</span>` : I.user;
}

const roleLine = (p) => (ROLES[p.role] ? ROLES[p.role] + (p.role === 'driver' && p.klass ? `, ${p.klass} класс` : '') : '');

// Статус: в пути → на отвлечении → на выходном → на отдыхе в пункте оборота / жду явку → между поездками.
// statusFacts — что происходит (без текста); из этого строится строка в профиле и то, что увидят коллеги (colleagues.js).
// null — пока нечего показать. Причину отвлечения статус не называет: больничный — это сведения о здоровье.
export function statusFacts(now = nowLocal()) {
  const live = liveTrip();
  if (live && isPending(live, now)) return { kind: 'soon', trip: live, start: statsOf(live).start };
  // сменили локомотив — показываем плечо, по которому едут сейчас (2.19.7)
  if (live) return { kind: 'trip', trip: live, start: statsOf(live).start, leg: legAt(live, now) };
  const today = dateKeyOf(now);
  const abs = S.absences.find((a) => a.start <= today && a.end >= today);
  if (abs) return { kind: 'abs', end: abs.end };
  const off = dayOffIntervals().find((x) => x.s <= now && now < x.e);
  if (off) return { kind: 'dayoff', until: off.e, tripId: off.trip.id };
  if (!S.trips.length) return null;
  // после поездки с отдыхом в пункте оборота: «На отдыхе», а когда отдых вышел — «Жду явку» (до 48 ч)
  let last = null;
  for (const t of S.trips) { const st = statsOf(t); if (st.end <= now && (!last || st.end > statsOf(last).end)) last = t; }
  if (last?.restType === 'turnaround') {
    const r = chosenRest(last);
    if (r && now < r.until) return { kind: 'rest', house: r.house || '', until: r.until };
    if (r && now - statsOf(last).end <= OVERREST_MAX) return { kind: 'wait', house: r.house || '' };
  }
  const rest = currentRest(now);
  return { kind: 'between', rest: rest ? { kind: rest.kind, label: rest.label, until: rest.until } : null };
}

// Станцию пишем как есть, без склонения («На отдыхе · Сумский Посад»): склонять названия станций надёжно нельзя.
// «до 15:00», а не «до сегодня, 15:00»
const when = (ms, now) => whenShort(ms, now).replace(/^сегодня, /, '');
export function profileStatus(now = nowLocal()) {
  const f = statusFacts(now);
  if (!f) return null;
  // «В пути: Сумский Посад → Малошуйка · с 05:40» — откуда и куда
  const path = (t) => { if (hasLegs(t)) return routeOf(t); const e = routeEnds(t); return e ? `${e.from} → ${e.to}` : routeOf(t); };
  const legPath = (l) => { const e = legEnds(l); return e ? `${e.from} → ${e.to}` : legRoute(l); };
  const st = (label, sub = '') => ({ kind: f.kind, label, sub, tripId: f.tripId || null });
  switch (f.kind) {
    case 'soon': return st('Скоро явка', [whenShort(f.start, now), path(f.trip)].filter(Boolean).join(' · '));
    // «В пути с 07:30» и ниже — откуда и куда (2.22, по примеру Никиты)
    case 'trip': return st(`В пути с\u00a0${when(f.start, now)}`, f.leg ? legPath(f.leg) : path(f.trip));
    case 'abs': return st('На отвлечении', `до ${dayMonth(parseLocal(`${f.end}T00:00`))} включительно`);
    case 'dayoff': return st('На выходном', `до ${when(f.until, now)}`);
    case 'rest': return st('На отдыхе', [f.house, `до ${when(f.until, now)}`].filter(Boolean).join(' · '));
    case 'wait': return st('Жду явку', f.house);
    default: return st('Между поездками', f.rest ? `${f.rest.label.toLowerCase()} · до ${when(f.rest.until, now)}` : '');
  }
}

// Выходной (2.21): нажатием можно поправить, когда он заканчивается
function statusHtml(st) {
  const inner = `<span class="dot"></span><b>${st.label}</b>${st.sub ? `<small>${esc(st.sub)}</small>` : ''}`;
  if (st.kind === 'dayoff' && st.tripId) return `<button class="pr-status st-dayoff" id="pr-status" data-act="dayoff-edit" data-id="${esc(st.tripId)}" aria-label="${esc(`${st.label} ${st.sub}`)}. Изменить окончание выходного">${inner}${small(I.edit, 14)}</button>`;
  return `<div class="pr-status st-${st.kind}" id="pr-status">${inner}</div>`;
}

// colleagues — раздел «Коллеги» (colleagues.js собирает его в app.js: так модули не зависят друг от друга по кругу)
// colleagues — строка «Коллеги» (colleagues.js), передаётся из app.js без круговых импортов.
// Свои часы и поездки здесь не показываем (просьба Никиты, 2.19.1): они на главной и в статистике.
// 2.22 (пример Никиты): персонаж слева, справа имя с ✎, должность, депо и стаж, телефон; статус — во всю ширину карточки.
// Ниже — «Коллеги», «Награды» и строка «Приватность профиля».
// privacyRow — строка «Приватность профиля» (с аккаунтом ведёт в «Приватность», без — объясняет, где хранится профиль)
export function renderProfile(colleagues = '', privacyRow = '') {
  const p = S.profile;
  const st = profileStatus();
  const t = totalTenure(careerOf(p));
  const line2 = [p.depot ? `депо ${p.depot}` : '', t ? `Стаж ${tenureText(t, { short: true }).replace(/ /g, '\u00a0')}` : ''].filter(Boolean).join(' · ');
  const subs = [roleLine(p) && `<div class="profile-sub">${esc(roleLine(p))}</div>`, line2 && `<div class="profile-sub">${esc(line2)}</div>`,
    p.phone && `<div class="profile-sub pr-phone">${small(I.call, 16)} <span class="nw">${esc(p.phone)}</span></div>`].filter(Boolean).join('');
  return `${pageHead('Профиль', { right: `<button class="icon-btn" data-act="go" data-page="settings" aria-label="Настройки">${I.gear}</button>` })}
    <div class="pr-page">
    <section class="profile-card pr-card">
      <div class="pr-top">
        <button class="avatar view big" data-act="av-open" aria-label="${hasAvatar(p) ? 'Изменить персонажа' : 'Создать персонажа'}">${avatarHtml(p, 132)}</button>
        <div class="pr-info">
          <div class="profile-name with-edit">${p.name ? `<span>${esc(p.name)}</span>` : '<span class="ph">Имя не указано</span>'}<button class="pr-edit" id="pr-edit" data-act="go" data-page="profile-edit" aria-label="Редактировать профиль">${small(I.edit, 18)}</button></div>
          ${subs}
        </div>
      </div>
      ${st ? statusHtml(st) : ''}
    </section>
    ${colleagues}
    ${awardsStripHtml()}
    ${privacyRow || `<div class="panel"><button class="row" data-act="pr-privacy-info" id="pr-privacy"><span class="ico" style="--c:var(--ok)">${I.shield}</span>
      <div class="grow"><div class="t1">Приватность профиля</div><div class="t2">Профиль хранится только в этом телефоне</div></div>${small(I.right, 18)}</button></div>`}
    </div>`;
}

// 2.19: депо пишут по-разному («тд64», «тд 64», «Тд-64»). Код депо (буквы + номер) приводим к виду «ТД-64»;
// латиницу, похожую на кириллицу, — к кириллице. Название словами («Малошуйка») не трогаем.
const LAT = { A: 'А', B: 'В', C: 'С', D: 'Д', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
export function normDepot(v) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const m = /^([a-zа-яё]{1,5})[\s\-\u2010-\u2015_.]*(\d{1,4})(?:\s+(.+))?$/i.exec(s);
  if (!m) return s;
  let code = m[1].toUpperCase().replace(/Ё/g, 'Е');
  if (/[A-Z]/.test(code)) {
    code = code.replace(/CH/g, 'Ч').replace(/[A-Z]/g, (c) => LAT[c] || '?');
    if (code.includes('?')) return s;
  }
  return `${code}-${m[2]}${m[3] ? ` ${m[3]}` : ''}`;
}

export function renderProfileEdit() {
  const p = S.profile;
  return `${pageHead('Редактировать профиль', { back: true })}
    <section class="profile-card">
      <button class="avatar big" id="pr-avatar" data-act="av-open" aria-label="${hasAvatar(p) ? 'Изменить персонажа' : 'Создать персонажа'}">${avatarHtml(p, 132)}<span class="ava-cam">${hasAvatar(p) ? I.edit : I.plus}</span></button>
      <div class="hint">${hasAvatar(p) ? 'Нажмите, чтобы изменить персонажа' : 'Создайте своего персонажа вместо фото'}</div>
      ${p.photo ? `<button class="link-btn" data-act="photo-del">${hasAvatar(p) ? 'Удалить старое фото' : 'Удалить фото'}</button>` : ''}
    </section>
    <div class="panel pay-panel">
      <div class="pay-field"><label for="pr-name">Имя</label><input class="input" id="pr-name" maxlength="60" autocomplete="name" placeholder="Например, Иван" value="${esc(p.name)}"></div>
      <div class="pay-field"><div class="label">Должность</div>
        <div class="seg" id="pr-role">${Object.entries(PROFILE_ROLES).map(([k, v]) => `<button data-act="pr-role" data-role="${k}" aria-pressed="${p.role === k}">${v}</button>`).join('')}</div>
        <div class="hint">Машинисту можно указать класс — от него считается надбавка за класс.</div></div>
      ${p.role === 'driver' ? `<div class="pay-field"><div class="label">Класс</div>
        <div class="seg" id="pr-klass">${CLASSES.map((k) => `<button data-act="pr-klass" data-klass="${k}" aria-pressed="${p.klass === k}">${k} класс</button>`).join('')}</div></div>` : ''}
      <div class="pay-field"><label for="pr-depot">Депо</label><input class="input" id="pr-depot" maxlength="60" autocomplete="off" placeholder="Например, ТЧ-13" value="${esc(p.depot)}"></div>
      <div class="pay-field"><label for="pr-phone">Номер телефона</label><input class="input" id="pr-phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="+7 900 000-00-00" value="${esc(p.phone)}">
        <div class="hint">Хранится только в этом телефоне и никому не передаётся.</div></div>
    </div>
    <div class="panel"><button class="row" data-act="go" data-page="career" id="pr-career"><span class="ico" style="--c:var(--warn)">${I.briefcase}</span><div class="grow"><div class="t1">Карьера</div><div class="t2">${careerSub()}</div></div>${small(I.right, 18)}</button></div>
    <div class="notice ok">${I.shield}<div><b>Коллеги — только с аккаунтом и только по вашему выбору.</b> На наш сервер в России уходят имя, должность и то, что вы разрешили в Настройках аккаунта → «Приватность». Поездки, заработок, номер поезда и локомотива, точное время явки и телефон не уходят. Причину отвлечения — больничный, отпуск или медкомиссия — коллеги не увидят никогда, только «На отвлечении».</div></div>`;
}

export async function profileClick(act, b) {
  if (act === 'pr-role') { await saveProfile({ role: PROFILE_ROLES[b.dataset.role] ? b.dataset.role : 'assistant' }); return true; }
  if (act === 'pr-klass') { await saveProfile({ klass: S.profile.klass === b.dataset.klass ? '' : b.dataset.klass }); return true; }
  if (act === 'pr-priv') {
    const pv = privacyOf();
    await saveProfile({ privacy: { ...pv, [b.dataset.k]: !pv[b.dataset.k] } });
    return true;
  }
  if (act === 'pr-privacy-info') {
    infoDialog({ title: 'Приватность профиля', text: 'Профиль хранится в этом телефоне. Коллеги видят только то, что вы сами включили в «Приватности» (для этого нужен аккаунт). Профиль попадает в резервную копию — не пересылайте её другим людям.' });
    return true;
  }
  if (act === 'photo-del') {
    if (await confirmDialog({ title: 'Удалить фото профиля?', text: hasAvatar() ? 'В профиле останется ваш персонаж.' : '', ok: 'Удалить' })) { await saveProfile({ photo: '' }); toast('Фото удалено'); }
    return true;
  }
  return false;
}

export async function profileChange(e) {
  const t = e.target;
  if (t.id === 'pr-name') { await saveProfile({ name: t.value.trim().slice(0, 60) }); return true; }
  if (t.id === 'pr-depot') { const depot = normDepot(t.value); if (t.value !== depot) t.value = depot; await saveProfile({ depot }); return true; }
  if (t.id === 'pr-phone') { await saveProfile({ phone: normPhone(t.value) }); return true; }
  return false;
}
