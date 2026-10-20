// CABINA — главный модуль: экраны, навигация, настройки.
import { I, esc, openLayer, closeLayer, sheet, toast, confirmDialog, actionSheet, MONTHS, MONTHS_PREP, MONTHS_SHORT, WD, hm, whenShort, dateRange, dayMonth, plural, fmtSize, layerCount } from './ui.js';
import { S, loadAll, onChange, emit, statsOf, nowLocal, routeOf, locoLabel, locoKey, saveSettings, setOnboarded, deleteNote, deleteTrip, deleteRoute } from './store.js';
import { monthSummary, fmtDur, fmtHours, parseLocal, turnaroundRest } from './calc.js';
import { yearInfo, officialYears, mergeCalendarData } from './calendar.js';
import { openTripForm, openAbsenceForm, openRouteForm, openNoteForm, ABS_TYPES, setNavigator, computeHomeRest, fmtDate } from './forms.js';
import { renderDocs, hydrateThumbs, uploadFiles, mkdir, openDoc, docMenu, docState, docsCount } from './docs.js';
import { exportBackup, importBackup } from './backup.js';
import { skyPhase } from './sun.js';
import { loadTours, resetTours, tourActive } from './tour.js';
import { homeTour, swipeTour, routesTour, extraTour, docsTour, settingsTour } from './tours.js';
import { isMemoryMode } from './db.js';

export const VERSION = '1.5.0';
const app = document.getElementById('app');
const V = { tab: 'home', y: 2026, m: 10, extra: null };

const small = (svg, s = 14) => svg.replace('width="22" height="22"', `width="${s}" height="${s}"`);
const p2 = (n) => String(n).padStart(2, '0');
export const fmtKm = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} км`;

// ---------------------------------------------------------------- тема
const mql = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = S.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  const dark = t === 'dark' || (t !== 'light' && mql.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07090f' : '#eef1f7');
}
mql.addEventListener?.('change', applyTheme);

// ---------------------------------------------------------------- небо
// Сцены неба по положению солнца: рассвет, день, закат; ночь — исходная сцена темы.
const SCENES = {
  sunrise: { vars: { '--sky-1': '#22305a', '--sky-2': '#7a5b8f', '--sky-3': '#f2956b', '--sky-4': '#ffd99a', '--silhouette': '#0e1424', '--star': 'rgba(255,255,255,.28)', '--rail': '#ffd08a' }, sun: [88, 175, 19], core: '#fff6d8', mid: '#ffc46e', glowR: 190, clouds: 0.35, dip: [52, 128] },
  day: { vars: { '--sky-1': '#2a66cf', '--sky-2': '#4f8fe3', '--sky-3': '#8fc0f0', '--sky-4': '#d4eafc', '--silhouette': '#15304a', '--star': 'transparent', '--rail': '#ffffff' }, sun: [236, 100, 11], core: '#fffdf2', mid: '#fff1a8', glowR: 120, clouds: 0.8 },
  sunset: { vars: { '--sky-1': '#1a1436', '--sky-2': '#5c1f48', '--sky-3': '#d9482c', '--sky-4': '#ffab45', '--silhouette': '#08060e', '--star': 'rgba(255,255,255,.35)', '--rail': '#ffb070' }, sun: [300, 177, 16], core: '#ffe1a0', mid: '#ff7a2e', glowR: 170, clouds: 0.25 },
  night: { vars: null, sun: null, glowR: 150, clouds: 0 },
};
export const sceneVars = (phase) => (SCENES[phase]?.vars ? Object.entries(SCENES[phase].vars).map(([k, v]) => `${k}:${v}`).join(';') : '');
function skySVG(phase = 'night') {
  const S0 = SCENES[phase] || SCENES.night;
  // лес по горизонту (детерминированный)
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let d = 'M0 250 L0 186';
  for (let x = 0; x <= 400; x += 6 + rnd() * 6) {
    const inDip = S0.dip && x > S0.dip[0] && x < S0.dip[1];
    const h = inDip ? 180 + rnd() * 4 : 166 + rnd() * 16 - (x > 260 && x < 340 ? 6 : 0);
    d += ` L${x.toFixed(1)} ${(186 - rnd() * 3).toFixed(1)} L${(x + 3).toFixed(1)} ${h.toFixed(1)} L${(x + 6).toFixed(1)} ${(186 - rnd() * 3).toFixed(1)}`;
  }
  d += ' L400 186 L400 250 Z';
  const stars = Array.from({ length: 26 }, () => `<circle cx="${(rnd() * 400).toFixed(0)}" cy="${(rnd() * 90).toFixed(0)}" r="${(0.4 + rnd() * 0.8).toFixed(2)}" style="fill:var(--star)" opacity="${(0.3 + rnd() * 0.7).toFixed(2)}"/>`).join('');
  const vp = [318, 183];
  const masts = [[394, 58], [366, 104], [349, 134], [338, 152], [331, 163], [326, 170]];
  const mastSvg = masts.map(([x, y], i) => {
    const arm = 22 - i * 3.2;
    return `<line x1="${x}" y1="${y}" x2="${x}" y2="${190 + (5 - i) * 10}" stroke-width="${2.6 - i * 0.35}"/><line x1="${x}" y1="${y + 6 - i}" x2="${x - arm}" y2="${y + 8 - i}" stroke-width="${1.6 - i * 0.2}"/>`;
  }).join('');
  const wire = `M${masts.map(([x, y], i) => `${x - (22 - i * 3.2)} ${y + 8 - i}`).join(' L')} L${vp[0] + 2} ${vp[1] - 18}`;
  return `<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky-1)"/><stop offset=".42" style="stop-color:var(--sky-2)"/><stop offset=".68" style="stop-color:var(--sky-3)"/><stop offset=".76" style="stop-color:var(--sky-4)"/></linearGradient>
      <radialGradient id="sun" cx="${S0.sun ? S0.sun[0] : vp[0]}" cy="${S0.sun ? S0.sun[1] : vp[1] - 4}" r="${S0.glowR}" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--sky-4)" stop-opacity=".95"/><stop offset=".35" style="stop-color:var(--sky-3)" stop-opacity=".45"/><stop offset="1" style="stop-color:var(--sky-3)" stop-opacity="0"/></radialGradient>
      <radialGradient id="lamp" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".3" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/></radialGradient>
      <linearGradient id="railg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--rail)" stop-opacity=".15"/><stop offset="1" style="stop-color:var(--rail)" stop-opacity=".9"/></linearGradient>
    </defs>
    <rect width="400" height="250" fill="url(#sk)"/>${stars}
    <rect width="400" height="250" fill="url(#sun)"/>
    ${S0.sun ? `<radialGradient id="disc" r=".5"><stop offset="0" stop-color="${S0.core}"/><stop offset=".55" stop-color="${S0.core}"/><stop offset=".72" stop-color="${S0.mid}" stop-opacity=".55"/><stop offset="1" stop-color="${S0.mid}" stop-opacity="0"/></radialGradient>
      <circle cx="${S0.sun[0]}" cy="${S0.sun[1]}" r="${S0.sun[2] * 2.2}" fill="url(#disc)"/>` : ''}
    ${S0.clouds ? [[60, 112, 1], [170, 128, 0.8], [300, 104, 0.9], [120, 150, 0.6]].map(([cx, cy, k]) => `<g fill="#fff" opacity="${(S0.clouds * k * 0.75).toFixed(2)}"><ellipse cx="${cx}" cy="${cy}" rx="${26 * k}" ry="${5 * k}"/><ellipse cx="${cx - 8 * k}" cy="${cy - 4 * k}" rx="${11 * k}" ry="${6 * k}"/><ellipse cx="${cx + 7 * k}" cy="${cy - 5 * k}" rx="${13 * k}" ry="${7.5 * k}"/></g>`).join('') : ''}
    <path d="${d}" style="fill:var(--silhouette)"/>
    <g style="stroke:var(--silhouette)" stroke-linecap="round">${mastSvg}</g>
    <path d="${wire}" fill="none" style="stroke:var(--silhouette)" stroke-width=".8"/>
    <g stroke="url(#railg)" stroke-width="1.4" fill="none"><path d="M168 250 L${vp[0] - 4} ${vp[1] + 3}"/><path d="M276 250 L${vp[0] + 4} ${vp[1] + 3}"/></g>
    <g>
      <rect x="${vp[0] - 11}" y="${vp[1] - 18}" width="22" height="20" rx="6" style="fill:var(--silhouette)"/>
      <rect x="${vp[0] - 7.5}" y="${vp[1] - 15}" width="15" height="6" rx="2.6" fill="#ff8a4a" opacity=".35"/>
      <circle cx="${vp[0] - 5.5}" cy="${vp[1] - 3}" r="9" fill="url(#lamp)"/><circle cx="${vp[0] + 5.5}" cy="${vp[1] - 3}" r="9" fill="url(#lamp)"/>
      <circle cx="${vp[0] - 5.5}" cy="${vp[1] - 3}" r="1.6" fill="#fff"/><circle cx="${vp[0] + 5.5}" cy="${vp[1] - 3}" r="1.6" fill="#fff"/>
    </g>
  </svg>`;
}
const SKY_CACHE = {};
const skyFor = (phase) => SKY_CACHE[phase] || (SKY_CACHE[phase] = skySVG(phase));


// ---------------------------------------------------------------- главная
function ring(pct) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = pct == null ? 1 : Math.min(1, Math.max(0, pct));
  const label = pct == null ? '—' : `${Math.round(pct * 100)}%`;
  const done = pct != null && pct >= 1;
  return `<div class="ring" role="img" aria-label="Выполнение нормы ${label}">
    <svg viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${done ? '#6be3b2' : '#ff7a3d'}"/><stop offset="1" stop-color="${done ? '#2fd08a' : '#ff3d3d'}"/></linearGradient></defs>
      <circle class="ring-track" cx="50" cy="50" r="${r}" fill="none" stroke-width="9"/>
      ${pct == null ? '' : `<circle class="ring-val" cx="50" cy="50" r="${r}" fill="none" stroke="url(#rg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(2)}" ${frac === 0 ? 'opacity="0"' : ''}/>`}
    </svg><div class="ring-label">${label}</div></div>`;
}

function bigDur(min) {
  const v = Math.round(min);
  return `<span>${Math.floor(v / 60)}</span><small>ч</small><span>${p2(v % 60)}</span><small>мин</small>`;
}

function statCard(cls, icon, label, min, wide, absType) {
  const tag = absType ? 'button' : 'div';
  const attrs = absType ? ` data-act="abs-type" data-type="${absType}" aria-label="${label}: открыть"` : '';
  return `<${tag} class="stat ${cls} ${wide ? 'wide' : ''}"${attrs}><span class="tile">${icon}</span><div><div class="lbl">${label}</div><div class="val">${fmtDur(min)}</div></div>${absType ? `<span class="chev stat-chev">${small(I.right, 16)}</span>` : ''}</${tag}>`;
}

function tripRow(t, mk) {
  const st = statsOf(t);
  const s = new Date(st.start);
  const loco = locoLabel(t.locoType, t.locoNumber);
  const route = routeOf(t);
  const part = st.byMonth[mk];
  const partial = part && Math.round(part.work) !== Math.round(st.work);
  const chips = [
    loco ? `<span class="chip loco">${small(I.train, 13)} ${esc(loco)}</span>` : '',
    st.night ? `<span class="chip" style="--c:var(--night)">${small(I.moon, 13)} ${fmtDur(st.night, { short: true })}</span>` : '',
    st.holiday ? `<span class="chip" style="--c:var(--holiday)">${small(I.calStar, 13)} ${fmtDur(st.holiday, { short: true })}</span>` : '',
    (t.passenger || []).length ? `<span class="chip" style="--c:var(--medical)">${small(I.passenger, 13)} пасс.</span>` : '',
  ].join('');
  return `<div class="swipe" data-swipe="${t.id}">
  <button class="swipe-del" data-act="trip-del" data-id="${t.id}" aria-label="Удалить поездку" tabindex="-1">${I.trash}<span>Удалить</span></button>
  <button class="trip swipe-row" data-act="trip" data-id="${t.id}">
    <div class="date-block"><div class="d">${s.getUTCDate()}</div><div class="mo">${MONTHS_SHORT[s.getUTCMonth()]}</div><div class="wd">${WD[s.getUTCDay()]}</div></div>
    <div class="trip-mid">
      <div class="trip-time">${hm(st.start)} — ${hm(st.end)}</div>
      <div class="trip-route">${small(I.route, 15)}<span>${route ? esc(route) : 'Маршрут не указан'}</span></div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>
    <div class="trip-right"><div class="dur">${fmtDur(st.work, { short: true })}${partial ? `<small>в этом мес. ${fmtDur(part.work, { short: true })}</small>` : ''}</div><span class="chev">${small(I.right, 18)}</span></div>
  </button></div>`;
}

function currentRest(now) {
  // последняя поездка и её отдых, если он ещё продолжается
  let last = null;
  for (const t of S.trips) { const st = statsOf(t); if (st.end <= now && (!last || st.end > statsOf(last).end)) last = t; }
  if (!last) return null;
  const st = statsOf(last);
  if (last.restType === 'home') {
    const r = computeHomeRest(last, last.homeRest?.ids, S.trips);
    if (!r || r.missing || !r.valid || r.fullUntil <= now) return null;
    return { trip: last, kind: 'Домашний отдых', until: r.fullUntil, left: (r.fullUntil - now) / 60000 };
  }
  const r = turnaroundRest(st.work, st.end, S.settings.minRest);
  if (r.until <= now) return null;
  return { trip: last, kind: 'Отдых в пункте оборота', until: r.until, left: (r.until - now) / 60000 };
}

function renderHome() {
  const now = nowLocal();
  const nd = new Date(now);
  const isCurrent = nd.getUTCFullYear() === V.y && nd.getUTCMonth() + 1 === V.m;
  const sum = monthSummary(V.y, V.m, S.trips, S.absences);
  const yi = yearInfo(V.y);
  const pct = sum.pct;
  const remain = sum.normMin - sum.work;
  const over = sum.normMin > 0 && remain < 0;
  const barW = sum.normMin === 0 ? 100 : Math.min(100, (sum.work / sum.normMin) * 100);

  let normHtml;
  if (sum.normMin === 0 && sum.base > 0) normHtml = `<div class="norm-full">Норма на этот месяц полностью покрыта отвлечениями.</div>`;
  else {
    normHtml = `<div class="norm-line">Норма: <b class="num">${fmtHours(sum.norm)}</b></div>`;
    if (sum.absTotal > 0) normHtml += `<div class="norm-sub">${fmtHours(sum.base)} по календарю − ${fmtHours(sum.absTotal)} отвлечений</div>`;
    else if (!yi.official) normHtml += `<div class="norm-sub">Предварительно: календарь на ${V.y} год ещё не утверждён</div>`;
  }
  let remainHtml;
  if (sum.normMin === 0) remainHtml = sum.work > 0 ? `<div class="remain over">Сверх нормы<b>+${fmtDur(sum.work)}</b></div>` : `<div class="remain">Норма<b>покрыта</b></div>`;
  else if (over) remainHtml = `<div class="remain over">Сверх нормы<b>+${fmtDur(-remain)}</b></div>`;
  else if (remain === 0) remainHtml = `<div class="remain over">Норма<b>выполнена</b></div>`;
  else remainHtml = `<div class="remain">Осталось<b>${fmtDur(remain)}</b></div>`;

  const absCards = Object.entries(ABS_TYPES).filter(([k]) => sum.absByType[k] > 0)
    .map(([k, v]) => ({ cls: v.cls, icon: v.icon, label: v.label, min: Math.round(sum.absByType[k] * 60), type: k }));
  const cards = [
    { cls: 'c-night', icon: I.moon, label: 'Ночные часы', min: sum.night },
    { cls: 'c-holiday', icon: I.calStar, label: 'Праздничные часы', min: sum.holiday },
    ...(sum.work > sum.normMin && sum.work > 0 ? [{ cls: 'c-over', icon: I.overtime, label: 'Переработка', min: sum.work - sum.normMin }] : []),
    ...absCards,
  ];
  const statsHtml = cards.map((c, i) => statCard(c.cls, c.icon, c.label, c.min, cards.length % 2 === 1 && i === cards.length - 1, c.type)).join('');

  const rest = isCurrent ? currentRest(now) : null;
  const trips = [...sum.monthTrips].sort((a, b) => statsOf(b).start - statsOf(a).start);
  const mk = sum.mk;

  const phase = skyPhase(Date.now(), S.settings.tz);
  app.innerHTML = `<div class="sky" data-phase="${phase}" style="${sceneVars(phase)}">${skyFor(phase)}</div>
  <div class="screen">
    <div class="home-top ${phase !== 'night' ? 'on-sky' : ''}">
      <div class="brand-row">
        <div class="brand"><img src="icons/icon-192.png" alt="" width="26" height="26">CABINA</div>
        ${isCurrent ? '' : `<button class="chip-btn" data-act="today">${small(I.calendar, 15)} Текущий месяц</button>`}
      </div>
      <div class="month-switch">
        <button class="round-btn" data-act="prev" aria-label="Предыдущий месяц">${I.left}</button>
        <div class="month-title" aria-live="polite">${MONTHS[V.m - 1]} ${V.y}</div>
        <button class="round-btn" data-act="next" aria-label="Следующий месяц">${I.right}</button>
      </div>
      <section class="glass hero" aria-label="Итоги месяца">
        <div class="eyebrow">Отработано в ${MONTHS_PREP[V.m - 1]}</div>
        <div class="hero-left">
          <div class="big num ${Math.floor(Math.round(sum.work) / 60) >= 100 ? 'long' : ''}">${bigDur(sum.work)}</div>
          ${normHtml}
        </div>
        <div>${ring(sum.normMin === 0 ? null : pct)}</div>
        <div class="bar ${over || (pct != null && pct >= 1) || sum.normMin === 0 ? 'full' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(barW)}"><i style="width:${barW}%"></i></div>
        ${remainHtml}
      </section>
    </div>
    <button class="btn btn-ghost" data-act="add-absence"><span class="ico-wrap" style="color:var(--vacation)">${I.vacation}</span> Добавить отвлечение</button>
    <div class="stats">${statsHtml}</div>
    <button class="btn btn-primary" data-act="add-trip">${I.plus} Добавить поездку</button>
    ${rest ? `<button class="rest-banner" data-act="trip" data-id="${rest.trip.id}"><span class="pulse"></span><div class="grow" style="flex:1;min-width:0"><div class="t1">${rest.kind} · до ${whenShort(rest.until, now)}</div><div class="t2">Осталось ${fmtDur(rest.left)}</div></div><span class="chev">${small(I.right, 18)}</span></button>` : ''}
    <div class="sec-head"><h2>Поездки в ${MONTHS_PREP[V.m - 1]}</h2><span class="meta">${trips.length ? `${trips.length} ${plural(trips.length, 'поездка', 'поездки', 'поездок')}` : ''}</span></div>
    ${trips.length ? `<div class="list">${trips.map((t) => tripRow(t, mk)).join('')}</div>`
      : `<div class="empty"><div class="em-ico">${I.train}</div><b>В ${MONTHS_PREP[V.m - 1]} поездок нет</b><p>Нажмите «Добавить поездку» — время, ночные и праздничные часы посчитаются автоматически.</p></div>`}
  </div>`;
}

// ---------------------------------------------------------------- маршруты
function renderRoutes() {
  const use = new Map();
  S.trips.forEach((t) => t.routeId && use.set(t.routeId, (use.get(t.routeId) || 0) + 1));
  const list = [...S.routes].sort((a, b) => (use.get(b.id) || 0) - (use.get(a.id) || 0) || a.from.localeCompare(b.from, 'ru'));
  app.innerHTML = `<div class="screen">
    <div class="page-head"><h1>Маршруты</h1></div>
    <div class="page-sub">${list.length ? `${list.length} ${plural(list.length, 'сохранённый маршрут', 'сохранённых маршрута', 'сохранённых маршрутов')}` : 'Сохраните маршруты, чтобы выбирать их одним касанием'}</div>
    <button class="btn btn-primary" data-act="add-route">${I.plus} Добавить маршрут</button>
    ${list.length ? `<div class="list">${list.map((r) => {
      const n = use.get(r.id) || 0;
      const hasReverse = S.routes.some((x) => x.from.toLowerCase() === r.to.toLowerCase() && x.to.toLowerCase() === r.from.toLowerCase());
      return `<div class="swipe" data-swipe="${r.id}">
      <button class="swipe-del" data-act="route-del" data-id="${r.id}" aria-label="Удалить маршрут" tabindex="-1">${I.trash}<span>Удалить</span></button>
      <div class="route-card swipe-row">
        <div class="route-line"><i></i><s></s><i class="b"></i></div>
        <button class="route-pts" data-act="route" data-id="${r.id}">
          <div><div class="lbl">Откуда</div><div class="pt">${esc(r.from)}</div></div>
          <div><div class="lbl">Куда</div><div class="pt">${esc(r.to)}</div></div>
          <div class="route-meta">${r.distanceKm ? `<span class="km">${fmtKm(r.distanceKm)}</span> · ` : ''}${n ? `${n} ${plural(n, 'поездка', 'поездки', 'поездок')}` : 'Поездок пока нет'}</div>
        </button>
        <div class="route-actions">
          <button class="icon-btn" data-act="route" data-id="${r.id}" aria-label="Изменить маршрут">${I.edit}</button>
          ${hasReverse ? '' : `<button class="icon-btn" data-act="route-reverse" data-id="${r.id}" aria-label="Создать обратный маршрут" title="Обратный маршрут">${I.swap}</button>`}
        </div>
      </div></div>`;
    }).join('')}</div>`
      : `<div class="empty"><div class="em-ico">${I.route}</div><b>Маршрутов пока нет</b><p>Например: Москва → Рязань. Маршрут можно выбрать первым полем при добавлении поездки.</p></div>`}
  </div>`;
}

// ---------------------------------------------------------------- дополнительно
function renderNotes() {
  const groups = new Map();
  for (const n of S.notes) {
    const k = locoKey(n.type, n.number);
    if (!groups.has(k)) groups.set(k, { type: n.type, number: n.number, notes: [] });
    groups.get(k).notes.push(n);
  }
  const arr = [...groups.values()].map((g) => ({ ...g, notes: g.notes.sort((a, b) => b.createdAt - a.createdAt) }))
    .sort((a, b) => b.notes[0].createdAt - a.notes[0].createdAt);
  return `<div class="page-head"><button class="icon-btn" data-act="extra-back" aria-label="Назад">${I.left}</button><h1>Заметки о локомотивах</h1></div>
    <button class="btn btn-primary" data-act="note-add">${I.plus} Новая заметка</button>
    ${arr.length ? arr.map((g) => {
      const trips = S.trips.filter((t) => locoKey(t.locoType, t.locoNumber) === locoKey(g.type, g.number)).length;
      return `<section class="loco-group">
        <div class="loco-head"><span class="ico" style="color:var(--accent)">${I.train}</span>
          <div class="name">${esc(locoLabel(g.type, g.number))}<small>Тип ${esc(g.type)} · номер ${esc(g.number)}${trips ? ` · поездок: ${trips}` : ''}</small></div>
          <button class="icon-btn" data-act="note-add" data-type="${esc(g.type)}" data-number="${esc(g.number)}" aria-label="Добавить заметку">${I.plus}</button></div>
        ${g.notes.map((n) => `<div class="note"><div><div class="txt">${esc(n.text)}</div><div class="when">${fmtDate(n.createdAt)}${n.updatedAt && n.updatedAt - n.createdAt > 60000 ? ' · изменена' : ''}</div></div>
          <div class="acts"><button class="icon-btn" data-act="note-edit" data-id="${n.id}" aria-label="Изменить заметку">${I.edit}</button><button class="icon-btn danger" data-act="note-del" data-id="${n.id}" aria-label="Удалить заметку">${I.trash}</button></div></div>`).join('')}
      </section>`;
    }).join('') : `<div class="empty"><div class="em-ico">${I.note}</div><b>Заметок пока нет</b><p>Добавляйте заметки о локомотивах прямо в поездке или здесь.</p></div>`}`;
}

function renderExtra() {
  let html;
  if (V.extra === 'notes') html = renderNotes();
  else if (V.extra === 'docs') html = renderDocs();
  else {
    const locos = new Set(S.notes.map((n) => locoKey(n.type, n.number))).size;
    const docs = docsCount();
    html = `<div class="page-head"><h1>Дополнительно</h1></div>
      <button class="tile-link" data-act="extra-notes"><span class="big-ico" style="--c:var(--accent)">${I.note}</span>
        <div><div class="t1">Заметки о локомотивах</div><div class="t2">${S.notes.length ? `${S.notes.length} ${plural(S.notes.length, 'заметка', 'заметки', 'заметок')} · ${locos} ${plural(locos, 'локомотив', 'локомотива', 'локомотивов')}` : 'Пока пусто'}</div></div><span class="chev">${I.right}</span></button>
      <button class="tile-link" data-act="extra-docs"><span class="big-ico" style="--c:var(--warn)">${I.folder}</span>
        <div><div class="t1">Рабочие документы</div><div class="t2">${docs ? `${docs} ${plural(docs, 'файл', 'файла', 'файлов')} · доступны без интернета` : 'Схемы, перемычки, фото, PDF'}</div></div><span class="chev">${I.right}</span></button>`;
  }
  app.innerHTML = `<div class="screen">${html}</div>`;
  if (V.extra === 'docs') hydrateThumbs(app);
}

// ---------------------------------------------------------------- настройки
const TZ = [
  ['Europe/Kaliningrad', 'Калининград (МСК−1)'], ['Europe/Moscow', 'Москва (МСК)'], ['Europe/Samara', 'Самара (МСК+1)'],
  ['Asia/Yekaterinburg', 'Екатеринбург (МСК+2)'], ['Asia/Omsk', 'Омск (МСК+3)'], ['Asia/Krasnoyarsk', 'Красноярск (МСК+4)'],
  ['Asia/Novosibirsk', 'Новосибирск (МСК+4)'], ['Asia/Irkutsk', 'Иркутск (МСК+5)'], ['Asia/Yakutsk', 'Якутск (МСК+6)'],
  ['Asia/Chita', 'Чита (МСК+6)'], ['Asia/Vladivostok', 'Владивосток (МСК+7)'], ['Asia/Magadan', 'Магадан (МСК+8)'],
  ['Asia/Kamchatka', 'Камчатка (МСК+9)'], ['auto', 'Как на устройстве'],
];
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (V.tab === 'settings') render(); });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let storageInfo = null;
async function refreshStorage() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    storageInfo = { usage: est?.usage || 0, quota: est?.quota || 0, persisted: !!persisted };
  } catch { storageInfo = null; }
}

function renderSettings() {
  const s = S.settings;
  const y = new Date(nowLocal()).getUTCFullYear();
  const yi = yearInfo(y);
  const nextYi = yearInfo(y + 1);
  const off = officialYears();
  const themeBtn = (v, label, ic) => `<button data-act="theme" data-v="${v}" aria-pressed="${s.theme === v}">${small(ic, 16)} ${label}</button>`;
  app.innerHTML = `<div class="screen">
    <div class="page-head"><h1>Настройки</h1></div>
    <div class="group"><div class="group-title">Оформление</div>
      <div class="seg">${themeBtn('light', 'Светлая', I.sun)}${themeBtn('dark', 'Тёмная', I.moon)}${themeBtn('system', 'Как в системе', I.phone)}</div>
    </div>
    <div class="group"><div class="group-title">Работа</div>
      <div class="panel">
        <div class="row"><span class="ico" style="--c:var(--ok)">${I.bed2}</span><div class="grow"><div class="t1">Минимальный отдых в пункте оборота</div><div class="t2">Отдых = больше из 50% рабочего времени и этого значения</div></div></div>
        <div class="row" style="justify-content:center"><div class="stepper">
          <button class="icon-btn" data-act="rest-minus" aria-label="Уменьшить на 30 минут"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
          <output id="min-rest" class="num">${fmtDur(s.minRest)}</output>
          <button class="icon-btn" data-act="rest-plus" aria-label="Увеличить на 30 минут">${small(I.plus, 18)}</button></div></div>
        <div class="row"><span class="ico" style="--c:var(--night)">${I.globe}</span><div class="grow"><label class="t1" for="tz">Часовой пояс</label><div class="t2">Для отметки «сейчас» и статуса отдыха</div></div></div>
        <div class="row"><select class="input" id="tz">${TZ.map(([v, l]) => `<option value="${v}" ${s.tz === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
    </div>
    <div class="group"><div class="group-title">Данные</div>
      <div class="notice">${I.alert}<div><b>Данные хранятся только на этом устройстве.</b> Если удалить приложение или очистить данные браузера без резервной копии, поездки, отвлечения и документы будут потеряны.</div></div>
      <div class="panel">
        <div class="row"><span class="ico" style="--c:var(--warn)">${I.folder}</span><div class="grow"><div class="t1">Включить рабочие документы</div><div class="t2">Копия будет больше, но сохранит все файлы</div></div>
          <button class="switch" role="switch" id="bk-docs" aria-checked="${V.bkDocs !== false}" aria-label="Включить документы в копию" data-act="bk-docs"></button></div>
        <button class="row" data-act="export"><span class="ico" style="--c:var(--accent)">${I.download}</span><div class="grow"><div class="t1">Создать резервную копию</div><div class="t2">Файл .json — сохраните его в «Файлы», облако или отправьте себе</div></div>${small(I.right, 18)}</button>
        <label class="row" style="cursor:pointer"><span class="ico" style="--c:var(--night)">${I.upload}</span><div class="grow"><div class="t1">Восстановить из копии</div><div class="t2">Текущие данные будут заменены</div></div>${small(I.right, 18)}<input type="file" id="bk-import" accept=".json,application/json" hidden></label>
        <div class="row"><span class="ico" style="--c:var(--ok)">${I.shield}</span><div class="grow"><div class="t1">Локальное хранение</div>
          <div class="t2">${isMemoryMode() ? 'Хранилище браузера недоступно — данные пропадут после закрытия. Откройте CABINA в обычном (не приватном) окне.'
            : `Без регистрации и серверов. Данные не передаются по сети.${storageInfo ? ` Занято ${fmtSize(storageInfo.usage)}${storageInfo.persisted ? ' · защищено от автоочистки' : ''}.` : ''}`}</div></div></div>
      </div>
    </div>
    <div class="group"><div class="group-title">Производственный календарь</div>
      <div class="panel">
        <div class="row"><span class="ico" style="--c:var(--holiday)">${I.calendar}</span><div class="grow"><div class="t1">${y} год: ${yi.hours} ч</div><div class="t2">${yi.official ? esc(yi.source) : 'Предварительный расчёт по ТК РФ'}</div></div></div>
        <div class="row"><span class="ico">${I.calendar}</span><div class="grow"><div class="t1">${y + 1} год: ${nextYi.hours} ч</div><div class="t2">${nextYi.official ? 'Утверждён' : 'Предварительный расчёт по ТК РФ'}</div></div></div>
        <div class="row"><span class="ico">${I.info}</span><div class="grow"><div class="t2">Пятидневная неделя, 40 часов. Рабочий день — 8 ч, предпраздничный — 7 ч. Праздничные часы — только в официальные нерабочие праздничные дни. Официальные данные: ${off.join(', ')}. Календарь обновляется вместе с приложением и не затрагивает ваши записи.</div></div></div>
      </div>
    </div>
    <div class="group"><div class="group-title">Установка на экран</div>
      <div class="panel">
        ${(() => { try { return window.top !== window; } catch { return true; } })() ? `<div class="row"><span class="ico" style="--c:var(--accent)">${I.phone}</span><div class="grow"><div class="t1">Установка на экран</div><div class="t2">Иконка CABINA на главном экране и работа без интернета доступны, когда приложение открыто по своему прямому адресу.</div></div></div>`
          : isStandalone() ? `<div class="row"><span class="ico" style="--c:var(--ok)">${I.check}</span><div class="grow"><div class="t1">CABINA установлена</div><div class="t2">Работает как отдельное приложение, в том числе без интернета</div></div></div>`
          : deferredInstall ? `<button class="row" data-act="install"><span class="ico" style="--c:var(--accent)">${I.phone}</span><div class="grow"><div class="t1">Установить CABINA</div><div class="t2">Добавить иконку на главный экран</div></div>${small(I.right, 18)}</button>`
          : `<div class="row"><span class="ico" style="--c:var(--accent)">${I.phone}</span><div class="grow"><div class="t1">${isIOS() ? 'iPhone: Safari → «Поделиться» → «На экран „Домой“»' : 'Android: Chrome → меню ⋮ → «Добавить на гл. экран»'}</div><div class="t2">После установки приложение запускается с иконки и работает без интернета</div></div></div>`}
      </div>
    </div>
    <div class="group"><div class="group-title">О приложении</div>
      <div class="panel">
        <button class="row" data-act="whats-new"><span class="ico" style="--c:var(--ok)">${I.check}</span><div class="grow"><div class="t1">Что нового</div><div class="t2">Изменения по версиям</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="tours-reset"><span class="ico" style="--c:var(--accent)">${I.info}</span><div class="grow"><div class="t1">Показать подсказки заново</div><div class="t2">Объяснения по каждому разделу при первом открытии</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="about"><span class="ico">${I.info}</span><div class="grow"><div class="t1">CABINA ${VERSION}</div><div class="t2">Личный учёт поездок. Не является официальной системой ОАО «РЖД».</div></div>${small(I.right, 18)}</button>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- рендер и навигация
function renderTabbar() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.tab === V.tab ? 'page' : 'false'));
}
function render() {
  if (V.tab === 'home') renderHome();
  else if (V.tab === 'routes') renderRoutes();
  else if (V.tab === 'extra') renderExtra();
  else renderSettings();
  renderTabbar();
  scheduleTours();
}

// Подсказки первого запуска для экранов (не поверх открытых окон)
let tourTimer = null;
function scheduleTours() {
  clearTimeout(tourTimer);
  tourTimer = setTimeout(() => {
    if (layerCount() || tourActive() || !S.onboarded) return;
    if (V.tab === 'home') { homeTour(); if (app.querySelector('.swipe')) swipeTour(); }
    else if (V.tab === 'routes') routesTour();
    else if (V.tab === 'extra') (V.extra === 'docs' ? docsTour() : V.extra ? null : extraTour());
    else if (V.tab === 'settings') settingsTour();
  }, 500);
}
export { scheduleTours };
onChange(render);

setNavigator((startStr) => {
  const ms = parseLocal(startStr);
  if (!Number.isFinite(ms)) return;
  const d = new Date(ms);
  V.y = d.getUTCFullYear(); V.m = d.getUTCMonth() + 1;
  if (V.tab !== 'home') { V.tab = 'home'; }
  render();
});

function shiftMonth(delta) {
  let m = V.m + delta;
  let y = V.y;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  V.m = m; V.y = y;
  render();
}
function goToday() { const d = new Date(nowLocal()); V.y = d.getUTCFullYear(); V.m = d.getUTCMonth() + 1; }

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (V.tab === b.dataset.tab) {
    if (b.dataset.tab === 'extra') { V.extra = null; docState.folder = null; }
    if (b.dataset.tab === 'home') goToday();
  }
  V.tab = b.dataset.tab;
  if (V.tab === 'settings') refreshStorage().then(() => V.tab === 'settings' && render());
  render();
  window.scrollTo(0, 0);
});

// ---------------------------------------------------------------- свайп влево для удаления поездки
const SWIPE_W = 92;
let sw = null;          // текущий жест
let swallowClick = false;
const openSwipes = () => [...app.querySelectorAll('.swipe.open')];
function setSwipe(el, x, animate) {
  const row = el.querySelector('.swipe-row');
  row.style.transition = animate ? '' : 'none';
  row.style.transform = x ? `translateX(${x}px)` : '';
  el.classList.toggle('open', x <= -SWIPE_W + 1);
  el.classList.toggle('revealing', x < 0);
}
function closeSwipes(except) { openSwipes().forEach((s) => { if (s !== except) setSwipe(s, 0, true); }); }
app.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.swipe > .swipe-row');
  if (!row || (e.pointerType === 'mouse' && e.button !== 0)) { if (!e.target.closest('.swipe-del')) closeSwipes(); return; }
  const el = row.parentElement;
  closeSwipes(el);
  sw = { el, row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: el.classList.contains('open') ? -SWIPE_W : 0, lock: null, x: 0 };
});
app.addEventListener('pointermove', (e) => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x0;
  const dy = e.clientY - sw.y0;
  if (!sw.lock) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.lock = 'h'; try { sw.row.setPointerCapture(e.pointerId); } catch {} }
    else if (Math.abs(dy) > 8) { sw = null; return; }
    else return;
  }
  e.preventDefault();
  let x = Math.min(0, sw.base + dx);
  if (x < -SWIPE_W) x = -SWIPE_W - (Math.min(60, -SWIPE_W - x) * 0.35); // упругость
  sw.x = x;
  setSwipe(sw.el, x, false);
});
function endSwipe(e) {
  if (!sw || e.pointerId !== sw.id) return;
  if (sw.lock === 'h') {
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 350);
    setSwipe(sw.el, sw.x < -SWIPE_W / 2 ? -SWIPE_W : 0, true);
  }
  sw = null;
}
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', (e) => { if (sw && sw.lock === 'h') endSwipe(e); else sw = null; });

app.addEventListener('click', async (e) => {
  if (swallowClick) { swallowClick = false; e.preventDefault(); return; }
  const openRow = e.target.closest('.swipe.open > .swipe-row');
  if (openRow) { closeSwipes(); e.preventDefault(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  switch (act) {
    case 'prev': shiftMonth(-1); break;
    case 'next': shiftMonth(1); break;
    case 'today': goToday(); render(); break;
    case 'add-trip': openTripForm(); break;
    case 'trip': openTripForm(id); break;
    case 'trip-del': {
      const t = S.trips.find((x) => x.id === id);
      if (!t) break;
      const st = statsOf(t);
      const ok = await confirmDialog({ title: 'Вы действительно хотите удалить поездку?', text: `${dayMonth(st.start)}, ${hm(st.start)} — ${hm(st.end)}${routeOf(t) ? ` · ${routeOf(t)}` : ''}`, ok: 'Да', cancel: 'Нет' });
      if (ok) { await deleteTrip(id); toast('Поездка удалена'); } else closeSwipes();
      break;
    }
    case 'add-absence': {
      const now = new Date(nowLocal());
      const cur = now.getUTCFullYear() === V.y && now.getUTCMonth() + 1 === V.m;
      openAbsenceForm(null, { defaultDate: cur ? undefined : `${V.y}-${p2(V.m)}-01` });
      break;
    }
    case 'absence': openAbsenceForm(id); break;
    case 'abs-type': {
      const sum = monthSummary(V.y, V.m, S.trips, S.absences);
      const list = sum.monthAbs.filter(({ a, hours }) => a.type === b.dataset.type && hours > 0).sort((x, y) => (x.a.start < y.a.start ? 1 : -1));
      if (list.length === 1) openAbsenceForm(list[0].a.id);
      else if (list.length > 1) {
        const T = ABS_TYPES[b.dataset.type];
        const pick = await actionSheet(`${T.label} в ${MONTHS_PREP[V.m - 1]}`, list.map(({ a, hours }) => ({ id: a.id, label: `${dateRange(a.start, a.end)} · −${fmtHours(hours)}`, icon: T.icon })));
        if (pick) openAbsenceForm(pick);
      }
      break;
    }
    case 'add-route': openRouteForm(); break;
    case 'route': openRouteForm(id); break;
    case 'route-del': {
      const r = S.routes.find((x) => x.id === id);
      if (!r) break;
      const used = S.trips.filter((t) => t.routeId === id).length;
      const ok = await confirmDialog({ title: 'Вы действительно хотите удалить маршрут?', text: `${r.from} → ${r.to}${used ? `. Поездки с этим маршрутом сохранят его название.` : ''}`, ok: 'Да', cancel: 'Нет' });
      if (ok) { await deleteRoute(id); toast('Маршрут удалён'); } else closeSwipes();
      break;
    }
    case 'route-reverse': {
      const r = S.routes.find((x) => x.id === id);
      if (r) openRouteForm(null, { from: r.to, to: r.from, distanceKm: r.distanceKm });
      break;
    }
    case 'extra-notes': V.extra = 'notes'; render(); window.scrollTo(0, 0); break;
    case 'extra-docs': V.extra = 'docs'; render(); window.scrollTo(0, 0); break;
    case 'extra-back': V.extra = null; render(); break;
    case 'note-add': openNoteForm(null, { type: b.dataset.type, number: b.dataset.number }); break;
    case 'note-edit': openNoteForm(id); break;
    case 'note-del': {
      if (await confirmDialog({ title: 'Удалить заметку?', text: 'Это действие нельзя отменить.' })) { await deleteNote(id); toast('Заметка удалена'); }
      break;
    }
    case 'doc-back': {
      if (docState.folder) { const f = S.files.find((x) => x.id === docState.folder); docState.folder = f?.parentId || null; }
      else V.extra = null;
      render(); break;
    }
    case 'doc-go': docState.folder = id || null; render(); break;
    case 'doc-open': openDoc(id); break;
    case 'doc-menu': docMenu(id); break;
    case 'doc-mkdir': mkdir(); break;
    case 'theme': await saveSettings({ theme: b.dataset.v }); applyTheme(); break;
    case 'rest-minus': if (S.settings.minRest > 0) await saveSettings({ minRest: Math.max(0, S.settings.minRest - 30) }); break;
    case 'rest-plus': if (S.settings.minRest < 24 * 60) await saveSettings({ minRest: S.settings.minRest + 30 }); break;
    case 'bk-docs': V.bkDocs = V.bkDocs === false; render(); break;
    case 'export': {
      try {
        const r = await exportBackup({ withDocs: V.bkDocs !== false, version: VERSION });
        if (r) toast(r.shared ? 'Резервная копия готова' : `Копия сохранена: ${r.name} (${fmtSize(r.size)})`, { ms: 4000 });
      } catch { toast('Не удалось создать копию', { error: true }); }
      break;
    }
    case 'install': {
      if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; render(); }
      break;
    }
    case 'about': showOnboarding(true); break;
    case 'whats-new': showWhatsNew(); break;
    case 'tours-reset': await resetTours(); V.tab = 'home'; goToday(); render(); window.scrollTo(0, 0); break;
    default: break;
  }
});

app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'tz') { await saveSettings({ tz: t.value }); toast('Часовой пояс сохранён'); }
  else if (t.id === 'doc-upload' && t.files?.length) { await uploadFiles(t.files); t.value = ''; }
  else if (t.id === 'bk-import' && t.files?.[0]) { const f = t.files[0]; t.value = ''; if (await importBackup(f)) applyTheme(); }
});

// ---------------------------------------------------------------- приветствие
function showOnboarding(again = false) {
  const el = openLayer(sheet({
    title: again ? 'О приложении' : 'Добро пожаловать',
    body: `<div class="onb">
      <div class="onb-hero"><img src="icons/icon-192.png" alt="" width="84" height="84"><h2>CABINA</h2><div class="hint">Личный учёт поездок, часов и отдыха</div></div>
      <div class="onb-item"><span class="ico" style="--c:var(--ok)">${I.shield}</span><div><b>Без регистрации</b><span>Все данные хранятся только на этом устройстве и никуда не передаются.</span></div></div>
      <div class="onb-item"><span class="ico" style="--c:var(--night)">${I.globe}</span><div><b>Работает без интернета</b><span>После первого открытия CABINA доступна в дороге и вне зоны связи.</span></div></div>
      <div class="onb-item"><span class="ico" style="--c:var(--warn)">${I.download}</span><div><b>Делайте резервные копии</b><span>Удаление приложения или очистка данных браузера сотрёт записи. Копия — в «Настройках».</span></div></div>
      <div class="onb-item"><span class="ico" style="--c:var(--accent)">${I.phone}</span><div><b>Установите на экран</b><span>${isIOS() ? 'Safari → «Поделиться» → «На экран „Домой“».' : 'Chrome → меню ⋮ → «Добавить на главный экран».'}</span></div></div>
      <div class="hint">CABINA ${VERSION}. Не является официальной системой ОАО «РЖД» и не использует корпоративные учётные записи.</div>
    </div>`,
    foot: `<button class="btn btn-primary" data-act="onb-ok">${again ? 'Закрыть' : 'Начать'}</button>`,
  }));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'onb-ok' || b.hasAttribute('data-close')) { closeLayer(el); setTimeout(scheduleTours, 250); }
  });
  el.querySelector('.scrim').addEventListener('click', () => setTimeout(scheduleTours, 250));
  if (!again) { S.onboarded = true; setOnboarded().catch(() => {}); }
}

// ---------------------------------------------------------------- старт
async function start() {
  goToday();
  try { await loadAll(); } catch (e) { console.error(e); }
  await loadTours();
  applyTheme();
  render();
  if (!S.onboarded) showOnboarding();
  // обновление календаря отдельно от приложения
  fetch('data/calendar.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { mergeCalendarData(j); render(); } }).catch(() => {});
  // обновлять «сейчас» (статус отдыха) раз в минуту
  setInterval(() => { if (V.tab === 'home' && !layerCount() && !sw && !app.querySelector('.swipe.revealing')) render(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !layerCount()) render(); });
  registerSW();
}

// ---------------------------------------------------------------- обновление с описанием изменений
const verNum = (v) => String(v).split('.').map((x) => parseInt(x, 10) || 0);
const verGt = (a, b) => { const x = verNum(a); const y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function loadChangelog() {
  try { const r = await fetch(`data/changelog.json?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) return (await r.json()).versions || []; } catch {}
  return null;
}
function changelogHtml(versions) {
  return versions.map((v) => `<section class="news-ver"><div class="news-head"><span class="news-badge">${esc(v.version)}</span></div>
    <ul class="news-list">${(v.items || []).map((it) => `<li>${esc(it)}</li>`).join('')}</ul></section>`).join('');
}
let updateWorker = null;
let updateRequested = false;
let updateShown = false;
async function showUpdate(worker, { force = false } = {}) {
  updateWorker = worker;
  const prompt = () => toast('Доступна новая версия CABINA', { action: 'Что нового', onAction: () => showUpdate(updateWorker, { force: true }) });
  // не перебивать открытую форму или подсказку — сначала тихое уведомление
  if (!force && (layerCount() || tourActive() || updateShown)) { prompt(); return; }
  updateShown = true;
  const all = await loadChangelog();
  const fresh = all ? all.filter((v) => verGt(v.version, VERSION)) : [];
  const newest = fresh[0]?.version;
  const el = openLayer(sheet({
    title: 'Новая версия CABINA',
    body: `<div class="news-intro">${newest ? `Вышла версия <b>${esc(newest)}</b>. Вот что изменилось:` : 'Вышло обновление с исправлениями и улучшениями.'}</div>
      ${fresh.length ? changelogHtml(fresh) : ''}
      <div class="hint">Ваши поездки, отвлечения и документы при обновлении сохранятся.</div>`,
    foot: `<button class="btn btn-primary" data-act="do-update">${I.download} Обновить</button>`,
  }), { onClose: () => { if (!updating) prompt(); } });
  let updating = false;
  el.querySelector('[data-act=do-update]').onclick = () => {
    updating = true;
    el.querySelector('[data-act=do-update]').innerHTML = 'Обновляем…';
    updateRequested = true;
    if (updateWorker) updateWorker.postMessage('skip');
    setTimeout(() => location.reload(), 3000); // на случай, если смена версии не пришла
  };
}
async function showWhatsNew() {
  const all = await loadChangelog();
  openLayer(sheet({
    title: 'Что нового',
    body: all && all.length ? `<div class="news-intro">У вас версия <b>${esc(VERSION)}</b>.</div>${changelogHtml(all.filter((v) => !verGt(v.version, VERSION)))}` : '<div class="hint">Список изменений будет доступен при подключении к интернету.</div>',
  }));
}

function registerSW() {
  let inFrame = false;
  try { inFrame = window.top !== window; } catch { inFrame = true; }
  if (!('serviceWorker' in navigator) || inFrame) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // проверять обновление, когда приложение снова открыто
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
  }).catch(() => {});
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if ((hadController || updateRequested) && !reloaded) { reloaded = true; location.reload(); } });
}

window.__cabina = { S, V, render, emit };
start();
