// Формы: поездка, отвлечение, маршрут, заметки о локомотивах.
import { I, esc, openLayer, closeLayer, sheet, confirmDialog, toast, uid, MONTHS, MONTHS_SHORT, hm, whenShort, dayMonth } from './ui.js';
import {
  S, statsOf, nowLocal, routeText, routeOf, knownTypes, notesFor, locoKey, locoLabel, normNum,
  saveTrip, deleteTrip, saveAbsence, deleteAbsence, saveRoute, deleteRoute, saveNote, deleteNote,
} from './store.js';
import {
  tripStats, validateTrip, parseLocal, fmtLocal, fmtDur, fmtHours, turnaroundRest, homeRestMulti,
  autoAbsenceHours, absenceMonths, validateAbsence, DAY,
} from './calc.js';
import { dayInfo } from './calendar.js';
import { tripFormTour, homeRestButtonTour, homeRestPickTour, absenceTour } from './tours.js';

const $ = (root, sel) => root.querySelector(sel);
const setHTML = (node, html) => { if (node && node.__html !== html) { node.innerHTML = html; node.__html = html; } };
const addDays = (key, n) => fmtLocal(parseLocal(`${key}T00:00`) + n * DAY).slice(0, 10);
const monthName = (mk) => `${MONTHS[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`;

export let navigateToMonth = () => {};
export const setNavigator = (fn) => { navigateToMonth = fn; };

export const ABS_TYPES = {
  sick: { label: 'Больничный', icon: I.sick, cls: 'c-sick', color: 'var(--sick)' },
  vacation: { label: 'Отпуск', icon: I.vacation, cls: 'c-vacation', color: 'var(--vacation)' },
  medical: { label: 'Медкомиссия', icon: I.medical, cls: 'c-medical', color: 'var(--medical)' },
};

function errorBox(msg) { return msg ? `<div class="error-box" role="alert">${I.alert}<span>${esc(msg)}</span></div>` : ''; }
function showError(el, msg) {
  const box = $(el, '[data-error]');
  box.innerHTML = errorBox(msg);
  if (msg) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =====================================================================
// ПОЕЗДКА
// =====================================================================
export function tripLabelShort(t) {
  const st = statsOf(t);
  if (!Number.isFinite(st.start)) return 'Поездка';
  const d = new Date(st.start);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} · ${hm(st.start)} — ${hm(st.end)}`;
}

export function computeHomeRest(trip, ids, pool) {
  if (!ids || ids.length < 1) return null;
  const trips = ids.map((id) => (id === trip.id ? trip : pool.find((x) => x.id === id)));
  if (trips.some((t) => !t)) return { missing: true };
  const stats = trips.map((t) => (t === trip ? tripStats(trip) : statsOf(t)));
  const r = homeRestMulti(stats);
  r.earlyTrip = trips[stats.indexOf(r.early)];
  r.lateTrip = trips[stats.indexOf(r.late)];
  return r;
}

// Концы маршрута поездки: из сохранённого маршрута или из подписи «А → Б»
function routeEnds(trip) {
  const r = trip.routeId && S.routes.find((x) => x.id === trip.routeId);
  if (r) return { from: r.from, to: r.to };
  const m = String(trip.routeLabel || '').split(/\s*(?:→|—|->)\s*/);
  return m.length === 2 && m[0] && m[1] ? { from: m[0], to: m[1] } : null;
}
const sameSt = (a, b) => String(a).trim().toLowerCase().replace(/ё/g, 'е') === String(b).trim().toLowerCase().replace(/ё/g, 'е');

// Вся поездка «туда и обратно»: эта поездка и предыдущие подряд, после которых был отдых в пункте оборота.
// Цепочка рвётся на домашнем отдыхе, на разрыве больше 48 ч или если маршруты не стыкуются.
export function suggestChain(draft) {
  const ds = tripStats(draft);
  const chain = [{ id: draft.id, trip: draft, stats: ds }];
  const before = S.trips.filter((t) => t.id !== draft.id).map((t) => ({ id: t.id, trip: t, stats: statsOf(t) }))
    .filter((x) => Number.isFinite(x.stats.end) && x.stats.end <= ds.start).sort((a, b) => b.stats.end - a.stats.end);
  let cur = chain[0];
  for (const o of before) {
    if (o.trip.restType !== 'turnaround') break;
    if (cur.stats.start - o.stats.end > 48 * 3600000) break;
    const a = routeEnds(o.trip);
    const b = routeEnds(cur.trip);
    if (a && b && !sameSt(a.to, b.from)) break;
    chain.push(o);
    cur = o;
    if (chain.length >= 8) break;
  }
  chain.reverse();
  const ends = chain.map((c) => routeEnds(c.trip));
  const path = ends.every(Boolean) ? [ends[0].from, ...ends.map((e) => e.to)].join(' → ') : '';
  const roundTrip = ends.every(Boolean) && chain.length > 1 && sameSt(ends[0].from, ends[ends.length - 1].to);
  return { chain, path, roundTrip };
}

function homeCandidates(draft, draftValid) {
  const now = nowLocal();
  const others = S.trips.filter((t) => t.id !== draft.id).map((t) => ({ id: t.id, trip: t, stats: statsOf(t) }))
    .filter((x) => Number.isFinite(x.stats.end));
  if (draftValid) {
    const ds = tripStats(draft);
    const before = others.filter((x) => x.stats.end <= ds.end && x.stats.end <= Math.max(now, ds.end)).sort((a, b) => b.stats.end - a.stats.end).slice(0, 3);
    return [{ id: draft.id, trip: draft, stats: ds, self: true }, ...before];
  }
  return others.filter((x) => x.stats.end <= now).sort((a, b) => b.stats.end - a.stats.end).slice(0, 4);
}

export function restBlock(trip, { now = nowLocal(), pool = S.trips } = {}) {
  const st = tripStats(trip);
  if (!Number.isFinite(st.end)) return '';
  if (trip.restType === 'home') {
    const r = computeHomeRest(trip, trip.homeRest?.ids, pool);
    if (!r) return `<div class="calc-head">Домашний отдых</div><div class="calc-row"><span>Выберите поездки для расчёта полного отдыха</span></div>`;
    if (r.missing) return `<div class="calc-head">Домашний отдых</div><div class="calc-row"><span>Одна из выбранных поездок удалена. Выберите поездки заново.</span></div>`;
    if (!r.valid) return `<div class="calc-head">Домашний отдых</div><div class="calc-row"><span>Эти поездки не подходят для расчёта. Выберите другие поездки.</span></div>`;
    const status = now < st.end ? '<span class="status off">Начнётся после поездки</span>' : r.fullUntil > now ? '<span class="status on">● Отдых ещё продолжается</span>' : '<span class="status off">Отдых завершён</span>';
    return `<div class="calc-head">Домашний отдых</div>
      <div class="calc-row"><span>${r.count > 1 ? `Поездки${r.count > 2 ? ` (${r.count})` : ''}` : 'Поездка'}</span><b>${r.count > 1 ? `${esc(tripLabelShort(r.earlyTrip).split(' · ')[0])} → ${esc(tripLabelShort(r.lateTrip).split(' · ')[0])}` : esc(tripLabelShort(r.lateTrip))}</b></div>
      <div class="calc-row"><span>${r.count > 1 ? 'Рабочее время всего' : 'Рабочее время'}</span><b>${fmtDur(r.work)}</b></div>
      ${r.count > 1 ? `<div class="calc-row"><span>${r.count > 2 ? 'Промежутки между ними' : 'Промежуток между ними'}</span><b>${fmtDur(r.gap)}</b></div>` : ''}
      <div class="calc-row main"><span>Полный отдых</span><b>${fmtDur(r.full)}</b></div>
      <div class="calc-row"><span>Окончание</span><b>${whenShort(r.fullUntil, now)}</b></div>
      <div class="calc-row main"><span>С выходным (+24 ч)</span><b>${fmtDur(r.withDayOff)}</b></div>
      <div class="calc-row"><span>Окончание</span><b>${whenShort(r.withDayOffUntil, now)}</b></div>
      <div class="calc-row"><span>Статус</span>${status}</div>`;
  }
  const r = turnaroundRest(st.work, st.end, S.settings.minRest);
  const status = now < st.end ? '<span class="status off">Начнётся после поездки</span>' : r.until > now ? '<span class="status on">● Отдых ещё продолжается</span>' : '<span class="status off">Отдых завершён</span>';
  return `<div class="calc-head">Отдых в пункте оборота</div>
    <div class="calc-row main"><span>Длительность</span><b>${fmtDur(r.rest)}</b></div>
    <div class="calc-row"><span>Окончание</span><b>${whenShort(r.until, now)}</b></div>
    <div class="calc-row"><span>Статус</span>${status}</div>`;
}

export function openTripForm(tripId) {
  const existing = tripId ? S.trips.find((t) => t.id === tripId) : null;
  const now = nowLocal();
  const today = fmtLocal(now).slice(0, 10);
  const base = existing ? JSON.parse(JSON.stringify({ ...existing, _stats: undefined })) : {
    id: uid(), routeId: null, routeLabel: '', start: '', end: '', passenger: [], locoType: '', locoNumber: '',
    restType: 'turnaround', homeRest: null, createdAt: Date.now(),
  };
  const linkedNote = existing ? S.notes.find((n) => n.tripId === existing.id) : null;
  const F = {
    routeId: base.routeId && S.routes.some((r) => r.id === base.routeId) ? base.routeId : null,
    routeLabel: base.routeLabel || '',
    sd: base.start ? base.start.slice(0, 10) : today,
    st: base.start ? base.start.slice(11, 16) : '',
    ed: base.end ? base.end.slice(0, 10) : today,
    et: base.end ? base.end.slice(11, 16) : '',
    endTouched: !!existing,
    locoType: base.locoType || '', locoNumber: base.locoNumber || '',
    passenger: (base.passenger || []).map((p) => ({ id: p.id || uid(), sd: p.start.slice(0, 10), st: p.start.slice(11, 16), ed: p.end.slice(0, 10), et: p.end.slice(11, 16) })),
    note: linkedNote?.text || '',
    restType: base.restType || 'turnaround',
    homeSel: base.homeRest?.ids ? [...base.homeRest.ids] : [],
    homeOpen: !!base.homeRest?.ids,
  };

  const draft = () => ({
    ...base,
    routeId: F.routeId, routeLabel: F.routeId ? routeText(S.routes.find((r) => r.id === F.routeId)) : F.routeLabel,
    start: F.sd && F.st ? `${F.sd}T${F.st}` : '',
    end: F.ed && F.et ? `${F.ed}T${F.et}` : '',
    passenger: F.passenger.map((p) => ({ id: p.id, start: p.sd && p.st ? `${p.sd}T${p.st}` : '', end: p.ed && p.et ? `${p.ed}T${p.et}` : '' })),
    locoType: F.locoType.trim(), locoNumber: normNum(F.locoNumber),
    restType: F.restType,
    homeRest: F.restType === 'home' && F.homeSel.length >= 1 ? { ids: [...F.homeSel] } : null,
  });

  const types = knownTypes();
  const title = existing ? `Поездка ${dayMonth(parseLocal(existing.start))}` : 'Новая поездка';

  const body = `
    ${existing ? '<div class="summary-top" id="tf-summary"></div>' : ''}
    <div class="field">
      <div class="label"><span class="step-n">1</span>Маршрут <span class="opt">· необязательно</span></div>
      <button class="pick" type="button" data-act="pick-route">${I.route}<span class="grow" id="tf-route-label"></span>${I.right}</button>
      <div class="quick" id="tf-route-quick"></div>
    </div>
    <div class="field">
      <label for="tf-sd"><span class="step-n">2</span>Начало поездки</label>
      <div class="dt"><input type="date" id="tf-sd" class="input" aria-label="Дата начала"><input type="time" id="tf-st" class="input" aria-label="Время начала"></div>
    </div>
    <div class="field">
      <label for="tf-ed"><span class="step-n">3</span>Окончание поездки</label>
      <div class="dt"><input type="date" id="tf-ed" class="input" aria-label="Дата окончания"><input type="time" id="tf-et" class="input" aria-label="Время окончания"></div>
      <div class="hint" id="tf-end-hint"></div>
    </div>
    <div class="field">
      <label for="tf-lt"><span class="step-n">4</span>Тип локомотива</label>
      <input id="tf-lt" class="input" list="tf-types" placeholder="Например, 2ЭС5К" autocomplete="off" autocapitalize="characters" maxlength="30">
      <datalist id="tf-types">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      ${types.length ? `<div class="quick" id="tf-type-quick">${types.slice(0, 10).map((t) => `<button type="button" class="qchip" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="field">
      <label for="tf-ln"><span class="step-n">5</span>Номер локомотива</label>
      <input id="tf-ln" class="input" inputmode="numeric" placeholder="Например, 355" autocomplete="off" maxlength="12">
      <div id="tf-loco-notes"></div>
    </div>
    <div class="field">
      <label for="tf-note"><span class="step-n">6</span>Заметка о локомотиве <span class="opt">· необязательно</span></label>
      <textarea id="tf-note" class="input" placeholder="Например: часто ломается" maxlength="1000"></textarea>
      <div class="hint">Заметка привяжется к локомотиву и будет видна в следующих поездках на нём.</div>
    </div>
    <div class="field">
      <div class="label"><span class="step-n">7</span>Следование пассажиром <span class="opt">· необязательно</span></div>
      <div class="list" id="tf-pass"></div>
      <button type="button" class="add-btn" data-act="add-pass">${I.plus} Добавить следование пассажиром</button>
    </div>
    <div class="field">
      <div class="label"><span class="step-n">8</span>Вид отдыха после поездки</div>
      <div class="seg accent" id="tf-rest">
        <button type="button" data-rest="turnaround">${I.bed2}<span>Отдых в пункте оборота</span></button>
        <button type="button" data-rest="home">${I.home2}<span>Домашний отдых</span></button>
      </div>
      <div id="tf-calc"></div>
      <div class="list" id="tf-home"></div>
    </div>
    <div data-error></div>`;

  const el = openLayer(sheet({
    title, body, tall: true,
    headRight: existing ? `<button class="icon-btn danger" data-act="del-trip" aria-label="Удалить поездку">${I.trash}</button>` : '',
    foot: `<button class="btn btn-primary" data-act="save-trip">${I.check} Сохранить</button>`,
  }));

  // начальные значения
  $(el, '#tf-sd').value = F.sd; $(el, '#tf-st').value = F.st;
  $(el, '#tf-ed').value = F.ed; $(el, '#tf-et').value = F.et;
  $(el, '#tf-lt').value = F.locoType; $(el, '#tf-ln').value = F.locoNumber;
  $(el, '#tf-note').value = F.note;

  function renderRoute() {
    const r = F.routeId && S.routes.find((x) => x.id === F.routeId);
    const label = r ? routeText(r) : F.routeLabel;
    $(el, '#tf-route-label').innerHTML = label ? esc(label) : '<span class="ph">Выберите маршрут</span>';
    const recent = recentRoutes(5);
    $(el, '#tf-route-quick').innerHTML = recent.map((x) => `<button type="button" class="qchip" data-route="${x.id}" aria-pressed="${x.id === F.routeId}">${esc(routeText(x))}</button>`).join('');
    $(el, '#tf-route-quick').hidden = !recent.length;
  }
  function renderEndHint() {
    const h = $(el, '#tf-end-hint');
    if (F.sd && F.ed && F.ed > F.sd) h.textContent = F.ed === addDays(F.sd, 1) ? 'Окончание на следующий день' : `Окончание через ${Math.round((parseLocal(`${F.ed}T00:00`) - parseLocal(`${F.sd}T00:00`)) / DAY)} дн.`;
    else h.textContent = '';
  }
  function renderTypeChips() {
    el.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(locoKey(b.dataset.type, '') === locoKey(F.locoType, ''))));
  }
  function renderLocoNotes() {
    const box = $(el, '#tf-loco-notes');
    if (!F.locoType.trim() || !normNum(F.locoNumber)) { setHTML(box, ''); return; }
    const notes = notesFor(F.locoType, F.locoNumber).filter((n) => n.tripId !== base.id);
    const key = locoKey(F.locoType, F.locoNumber);
    const tripsOn = S.trips.filter((t) => t.id !== base.id && locoKey(t.locoType, t.locoNumber) === key).length;
    if (notes.length) setHTML(box, `<button type="button" class="link-btn" data-act="loco-notes">${I.note} Посмотреть заметки по этому локомотиву (${notes.length})</button>`);
    else if (tripsOn) setHTML(box, `<div class="hint">Вы уже ездили на этом локомотиве (${tripsOn}). Заметок о нём пока нет.</div>`);
    else setHTML(box, '');
  }
  function renderPass() {
    $(el, '#tf-pass').innerHTML = F.passenger.map((p, i) => `
      <div class="interval" data-pid="${p.id}">
        <div class="interval-head"><span>${I.passenger} Пассажиром №${i + 1}</span>
          <button type="button" class="icon-btn danger" data-act="del-pass" data-pid="${p.id}" aria-label="Удалить интервал">${I.trash}</button></div>
        <div class="mini-label">Начало</div>
        <div class="dt"><input type="date" class="input" data-pf="sd" value="${p.sd}" aria-label="Дата начала"><input type="time" class="input" data-pf="st" value="${p.st}" aria-label="Время начала"></div>
        <div class="mini-label">Окончание</div>
        <div class="dt"><input type="date" class="input" data-pf="ed" value="${p.ed}" aria-label="Дата окончания"><input type="time" class="input" data-pf="et" value="${p.et}" aria-label="Время окончания"></div>
      </div>`).join('');
  }
  function renderRest() {
    el.querySelectorAll('[data-rest]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rest === F.restType)));
  }
  const ico = (svg, n) => svg.replace('width="22" height="22"', `width="${n}" height="${n}"`);
  function renderCalc() {
    const d = draft();
    const err = validateTrip(d);
    const box = $(el, '#tf-calc');
    const home = $(el, '#tf-home');
    if (err) {
      const incomplete = !d.start || !d.end;
      setHTML(box, `<div class="calc"><div class="calc-row"><span>${incomplete ? 'Заполните начало и окончание поездки — здесь появится рабочее время.' : esc(err)}</span></div></div>`);
      setHTML(home, '');
      if (existing) $(el, '#tf-summary').innerHTML = `<div><div class="eyebrow">Рабочее время</div><div class="v">—</div></div>`;
      return;
    }
    const st = tripStats(d);
    const months = Object.keys(st.byMonth).sort();
    let html = `<div class="calc">
      <div class="calc-row main"><span>Рабочее время</span><b>${fmtDur(st.work)}</b></div>
      <div class="calc-row"><span>${ico(I.moon, 17)} Ночные (22:00–06:00)</span><b>${fmtDur(st.night)}</b></div>
      <div class="calc-row"><span>${ico(I.calStar, 17)} Праздничные</span><b>${fmtDur(st.holiday)}</b></div>`;
    if (months.length > 1) {
      html += `<div class="calc-head">По месяцам</div>` + months.map((mk) => `<div class="calc-row"><span>${monthName(mk)}</span><b>${fmtDur(st.byMonth[mk].work)}</b></div>`).join('');
    }
    if (F.restType === 'turnaround') html += restBlock(d);
    html += '</div>';
    setHTML(box, html);

    // Домашний отдых: только по кнопке
    if (F.restType !== 'home') setHTML(home, '');
    else if (!F.homeOpen) { setHTML(home, `<button type="button" class="btn btn-ghost" data-act="home-calc">${I.home2} Рассчитать полный отдых</button>`); setTimeout(() => homeRestButtonTour(el), 300); }
    else {
      const sug = suggestChain(d);
      const cands = homeCandidates(d, true);
      sug.chain.forEach((c) => { if (!cands.some((x) => x.id === c.id)) cands.push(c); });
      cands.sort((a, b) => b.stats.end - a.stats.end);
      F.homeSel = F.homeSel.filter((id) => cands.some((c) => c.id === id));
      const chainIds = sug.chain.map((c) => c.id);
      const isChainSel = chainIds.length > 1 && chainIds.length === F.homeSel.length && chainIds.every((id) => F.homeSel.includes(id));
      let h = '';
      if (chainIds.length > 1) {
        h += `<div class="suggest ${isChainSel ? 'on' : ''}">
          <div class="suggest-ico">${I.route}</div>
          <div style="min-width:0"><div class="suggest-t">${sug.roundTrip ? 'Поездка туда и обратно' : `Вся поездка: ${chainIds.length} ${chainIds.length < 5 ? 'части' : 'частей'}`}</div>
          <div class="suggest-s">${sug.path ? esc(sug.path) : 'Поездки подряд с отдыхом в пункте оборота'}</div>
          ${isChainSel ? '<div class="suggest-ok">Отмечены все части — отдых посчитан по всей поездке</div>' : `<button type="button" class="link-btn" data-act="home-chain">Считать по всей поездке</button>`}</div></div>`;
      }
      h += `<div class="hint" style="font-weight:700;color:var(--text)">Выберите поездки для расчёта полного отдыха</div>`;
      h += cands.map((c) => {
        const on = F.homeSel.includes(c.id);
        return `<button type="button" class="cand" data-cand="${c.id}" aria-pressed="${on}">
          <span class="box">${on ? '✓' : ''}</span>
          <span style="min-width:0"><div class="t1">${esc(tripLabelShort({ ...c.trip, _stats: c.stats }))}</div>
          <div class="t2">${c.self ? '<span class="tag">эта поездка</span>' : ''}${esc(routeOf(c.trip) || 'Маршрут не указан')}</div></span>
          <span class="w">${fmtDur(c.stats.work, { short: true })}</span></button>`;
      }).join('');
      if (F.homeSel.length >= 1) h += `<div class="calc">${restBlock(d)}</div>`;
      else h += '<div class="hint">Отметьте хотя бы одну поездку.</div>';
      setHTML(home, h);
      setTimeout(() => homeRestPickTour(el), 300);
    }
    if (existing) {
      $(el, '#tf-summary').innerHTML = `<div><div class="eyebrow">Рабочее время</div><div class="v">${fmtDur(st.work)}</div></div>
        <div class="chips" style="justify-content:flex-end">${st.night ? `<span class="chip" style="--c:var(--night)">${ico(I.moon, 14)} ${fmtDur(st.night, { short: true })}</span>` : ''}${st.holiday ? `<span class="chip" style="--c:var(--holiday)">${ico(I.calStar, 14)} ${fmtDur(st.holiday, { short: true })}</span>` : ''}</div>`;
    }
  }
  function refreshAll() { renderEndHint(); renderLocoNotes(); renderTypeChips(); renderRest(); renderCalc(); }

  renderRoute(); renderPass(); refreshAll();
  setTimeout(() => tripFormTour(el), 450);

  // автодата окончания
  function autoEnd() {
    if (F.endTouched) return;
    let ed = F.sd;
    if (F.st && F.et && F.et <= F.st) ed = addDays(F.sd, 1);
    F.ed = ed; $(el, '#tf-ed').value = ed;
  }

  const onTripField = (e) => {
    const t = e.target;
    const map = { 'tf-sd': 'sd', 'tf-st': 'st', 'tf-ed': 'ed', 'tf-et': 'et', 'tf-lt': 'locoType', 'tf-ln': 'locoNumber', 'tf-note': 'note' };
    let obj = F;
    let key = map[t.id];
    if (!key && t.dataset.pf) { obj = F.passenger.find((x) => x.id === t.closest('[data-pid]')?.dataset.pid); key = t.dataset.pf; }
    if (!key || !obj || obj[key] === t.value) return; // значение не изменилось — ничего не перерисовываем
    obj[key] = t.value;
    if (key === 'note') return;
    if (obj === F && key === 'ed') F.endTouched = true;
    if (obj === F && (key === 'sd' || key === 'st' || key === 'et')) autoEnd();
    $(el, '[data-error]').innerHTML = '';
    refreshAll();
  };
  el.addEventListener('input', onTripField);
  el.addEventListener('change', onTripField);

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.route) { F.routeId = b.dataset.route; renderRoute(); refreshAll(); return; }
    if (b.dataset.type) { F.locoType = b.dataset.type; $(el, '#tf-lt').value = b.dataset.type; refreshAll(); return; }
    if (b.dataset.rest) { F.restType = b.dataset.rest; refreshAll(); return; }
    if (b.dataset.cand) {
      const id = b.dataset.cand;
      if (F.homeSel.includes(id)) F.homeSel = F.homeSel.filter((x) => x !== id);
      else F.homeSel.push(id);
      refreshAll(); return;
    }
    const act = b.dataset.act;
    if (act === 'pick-route') {
      const res = await pickRoute(F.routeId);
      if (res !== undefined) { F.routeId = res; if (!res) F.routeLabel = ''; renderRoute(); refreshAll(); }
    } else if (act === 'home-calc') {
      F.homeOpen = true;
      if (!F.homeSel.length) F.homeSel = suggestChain(draft()).chain.map((c) => c.id); // сразу вся поездка (или одна эта)
      refreshAll();
    } else if (act === 'home-chain') {
      F.homeSel = suggestChain(draft()).chain.map((c) => c.id); refreshAll();
    } else if (act === 'add-pass') {
      F.passenger.push({ id: uid(), sd: F.sd || today, st: '', ed: F.sd || today, et: '' });
      renderPass(); refreshAll();
      const last = el.querySelectorAll('.interval'); last[last.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (act === 'del-pass') {
      F.passenger = F.passenger.filter((p) => p.id !== b.dataset.pid);
      renderPass(); refreshAll();
    } else if (act === 'loco-notes') {
      openLocoNotesSheet(F.locoType, F.locoNumber, base.id);
    } else if (act === 'del-trip') {
      const ok = await confirmDialog({ title: 'Удалить поездку?', text: 'Поездка и её часы будут удалены из учёта. Заметки о локомотиве сохранятся.' });
      if (!ok) return;
      await deleteTrip(base.id);
      closeLayer(el);
      toast('Поездка удалена');
    } else if (act === 'save-trip') {
      const d = draft();
      const err = validateTrip(d);
      if (err) { showError(el, err); return; }
      const text = F.note.trim();
      if (text && (!d.locoType || !d.locoNumber)) { showError(el, 'Чтобы сохранить заметку, укажите тип и номер локомотива.'); return; }
      let noteOp = null;
      if (text) {
        noteOp = { put: linkedNote
          ? { ...linkedNote, text, type: d.locoType, number: d.locoNumber, updatedAt: Date.now() }
          : { id: uid(), tripId: d.id, type: d.locoType, number: d.locoNumber, text, createdAt: Date.now() } };
        if (linkedNote && linkedNote.text === text && linkedNote.type === d.locoType && linkedNote.number === d.locoNumber) noteOp = null;
      } else if (linkedNote) noteOp = { del: linkedNote.id };
      d.updatedAt = Date.now();
      delete d._stats;
      try {
        await saveTrip(d, noteOp);
      } catch (ex) {
        showError(el, 'Не удалось сохранить. Возможно, на устройстве закончилась память.');
        return;
      }
      closeLayer(el);
      navigateToMonth(d.start);
      toast(existing ? 'Изменения сохранены' : 'Поездка добавлена');
    }
  });
  return el;
}

function recentRoutes(n) {
  const used = new Map();
  for (const t of S.trips) if (t.routeId) used.set(t.routeId, Math.max(used.get(t.routeId) || 0, parseLocal(t.start) || 0));
  return [...S.routes].sort((a, b) => (used.get(b.id) || b.createdAt / 1e3 || 0) - (used.get(a.id) || a.createdAt / 1e3 || 0)).slice(0, n);
}

// Выбор маршрута. Возвращает id, null (без маршрута) или undefined (отмена).
function pickRoute(current) {
  return new Promise((resolve) => {
    let result;
    const routes = recentRoutes(1000);
    const el = openLayer(sheet({
      title: 'Маршрут', back: true,
      body: `
        ${routes.length ? `<div class="list">${routes.map((r) => `<button class="radio-row" data-rid="${r.id}" aria-pressed="${r.id === current}"><span class="dot"></span><span class="grow">${esc(routeText(r))}</span><span class="hint">${r.distanceKm ? `${String(r.distanceKm).replace('.', ',')} км` : ''}</span></button>`).join('')}
          <button class="radio-row" data-rid="" aria-pressed="${!current}"><span class="dot"></span><span class="grow" style="color:var(--text-2)">Без маршрута</span><span></span></button></div>`
        : '<div class="hint">Сохранённых маршрутов пока нет. Создайте первый ниже — он сохранится в разделе «Маршруты».</div>'}
        <div class="field"><div class="label">${I.plus} Новый маршрут</div>
          <div class="two"><input class="input" id="pr-from" placeholder="Откуда (А)" maxlength="60" autocomplete="off"><input class="input" id="pr-to" placeholder="Куда (Б)" maxlength="60" autocomplete="off"></div>
          <button class="btn btn-plain btn-sm" data-act="pr-add">Добавить и выбрать</button>
          <div data-error></div>
        </div>`,
    }), { onClose: () => resolve(result) });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-close')) { closeLayer(el); return; }
      if (b.dataset.rid !== undefined) { result = b.dataset.rid || null; closeLayer(el); return; }
      if (b.dataset.act === 'pr-add') {
        const from = $(el, '#pr-from').value.trim();
        const to = $(el, '#pr-to').value.trim();
        if (!from || !to) { showError(el, 'Укажите обе точки: откуда и куда.'); return; }
        const dup = S.routes.find((r) => r.from.toLowerCase() === from.toLowerCase() && r.to.toLowerCase() === to.toLowerCase());
        if (dup) { result = dup.id; closeLayer(el); return; }
        const r = { id: uid(), from, to, createdAt: Date.now() };
        await saveRoute(r);
        result = r.id; closeLayer(el);
        toast('Маршрут сохранён');
      }
    });
  });
}

// =====================================================================
// ЗАМЕТКИ О ЛОКОМОТИВЕ (просмотр из формы поездки)
// =====================================================================
function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()]} ${d.getFullYear()}`;
}
export { fmtDate };

function openLocoNotesSheet(type, number, excludeTripId) {
  const notes = notesFor(type, number).filter((n) => n.tripId !== excludeTripId);
  const el = openLayer(sheet({
    title: locoLabel(type, number), back: true,
    body: `<div class="loco-group">${notes.map((n) => `<div class="note"><div><div class="txt">${esc(n.text)}</div><div class="when">${fmtDate(n.createdAt)}</div></div><span></span></div>`).join('')}</div>
      <div class="hint">Изменить или удалить заметки можно в разделе «Дополнительно» → «Заметки о локомотивах».</div>`,
  }));
}

// =====================================================================
// ОТВЛЕЧЕНИЕ
// =====================================================================
export function openAbsenceForm(id, { defaultDate } = {}) {
  const existing = id ? S.absences.find((a) => a.id === id) : null;
  const today = defaultDate || fmtLocal(nowLocal()).slice(0, 10);
  const A = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid(), type: 'sick', start: today, end: today, auto: true, monthHours: {}, createdAt: Date.now() };
  if (A.auto === undefined) A.auto = true;
  const el = openLayer(sheet({
    title: existing ? 'Отвлечение' : 'Новое отвлечение', tall: false,
    headRight: existing ? `<button class="icon-btn danger" data-act="del-abs" aria-label="Удалить отвлечение">${I.trash}</button>` : '',
    body: `
      <div class="field"><div class="label">Тип отвлечения</div>
        <div class="type-pick">${Object.entries(ABS_TYPES).map(([k, v]) => `<button type="button" data-type="${k}" style="--c:${v.color}"><span class="tile">${v.icon}</span>${v.label}</button>`).join('')}</div>
        <div class="hint" id="af-sick-hint">Диагноз и медицинские подробности не указываются.</div>
      </div>
      <div class="two">
        <div class="field"><label for="af-start">Дата начала</label><input type="date" id="af-start" class="input"></div>
        <div class="field"><label for="af-end">Дата окончания</label><input type="date" id="af-end" class="input"></div>
      </div>
      <div class="field"><div class="label">Часы, вычитаемые из нормы</div>
        <div class="switch-row"><div class="grow"><div style="font-weight:700">По производственному календарю</div><div class="hint">Выходные и праздники не вычитаются</div></div>
          <button type="button" class="switch" role="switch" id="af-auto" aria-label="Автоматический расчёт"></button></div>
        <div id="af-hours"></div>
      </div>
      <div data-error></div>`,
    foot: `<button class="btn btn-primary" data-act="save-abs">${I.check} Сохранить</button>`,
  }));
  $(el, '#af-start').value = A.start;
  $(el, '#af-end').value = A.end;
  setTimeout(() => absenceTour(el), 450);

  function render() {
    el.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === A.type)));
    $(el, '#af-sick-hint').hidden = A.type !== 'sick';
    $(el, '#af-auto').setAttribute('aria-checked', String(A.auto !== false));
    const box = $(el, '#af-hours');
    if (!A.start || !A.end || A.end < A.start) { box.innerHTML = '<div class="hint">Укажите корректный период — расчёт появится здесь.</div>'; return; }
    const auto = autoAbsenceHours(A.start, A.end);
    const months = absenceMonths(A.start, A.end);
    if (A.auto !== false) {
      let work = 0, short = 0, off = 0;
      let guard = 0;
      for (let t = parseLocal(`${A.start}T00:00`); t <= parseLocal(`${A.end}T00:00`) && guard++ < 3700; t += DAY) {
        const k = dayInfo(fmtLocal(t).slice(0, 10)).kind;
        if (k === 'work') work++; else if (k === 'short') short++; else off++;
      }
      const total = Object.values(auto).reduce((s, v) => s + v, 0);
      box.innerHTML = `<div class="calc">
        <div class="calc-row main"><span>Будет вычтено</span><b>${fmtHours(total)}</b></div>
        ${months.length > 1 ? months.map((mk) => `<div class="calc-row"><span>${monthName(mk)}</span><b>${fmtHours(auto[mk])}</b></div>`).join('') : ''}
        <div class="calc-row"><span>Рабочих дней</span><b>${work + short}${short ? ` (сокращённых: ${short})` : ''}</b></div>
        <div class="calc-row"><span>Выходных и праздников</span><b>${off}</b></div></div>`;
    } else {
      box.innerHTML = `${months.map((mk) => `<div class="field"><label for="af-h-${mk}">${months.length > 1 ? monthName(mk) : 'Количество часов'} <span class="opt">· по календарю ${fmtHours(auto[mk])}</span></label>
        <input class="input" id="af-h-${mk}" data-mk="${mk}" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(A.monthHours?.[mk] ?? auto[mk])}"></div>`).join('')}
        <button type="button" class="link-btn" data-act="abs-auto">${I.calendar} Вернуть автоматический расчёт</button>`;
    }
  }
  render();

  const onAbsField = (e) => {
    const t = e.target;
    if ((t.id === 'af-start' && A.start === t.value) || (t.id === 'af-end' && A.end === t.value)) return;
    if (t.id === 'af-start') { A.start = t.value; if (A.end && A.end < A.start) { A.end = A.start; $(el, '#af-end').value = A.end; } render(); }
    else if (t.id === 'af-end') { A.end = t.value; render(); }
    else if (t.dataset.mk) { A.monthHours = { ...A.monthHours, [t.dataset.mk]: t.value }; return; }
    else return;
    $(el, '[data-error]').innerHTML = '';
  };
  el.addEventListener('input', onAbsField);
  el.addEventListener('change', onAbsField);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.type) { A.type = b.dataset.type; render(); return; }
    if (b.id === 'af-auto') {
      if (A.auto !== false) {
        A.auto = false;
        if (A.start && A.end && A.end >= A.start) {
          const auto = autoAbsenceHours(A.start, A.end);
          A.monthHours = { ...auto, ...Object.fromEntries(Object.entries(A.monthHours || {}).filter(([k]) => k in auto)) };
        }
      } else A.auto = true;
      render(); return;
    }
    const act = b.dataset.act;
    if (act === 'abs-auto') { A.auto = true; render(); }
    else if (act === 'del-abs') {
      const ok = await confirmDialog({ title: 'Удалить отвлечение?', text: 'Норма месяца будет пересчитана без него.' });
      if (!ok) return;
      await deleteAbsence(A.id); closeLayer(el); toast('Отвлечение удалено');
    } else if (act === 'save-abs') {
      const obj = { ...A };
      if (obj.auto !== false) obj.monthHours = {};
      else {
        const months = absenceMonths(obj.start, obj.end);
        obj.monthHours = Object.fromEntries(months.map((mk) => [mk, obj.monthHours?.[mk] === '' ? '' : Number(obj.monthHours?.[mk])]));
      }
      const err = validateAbsence(obj, S.absences);
      if (err) { showError(el, err); return; }
      obj.updatedAt = Date.now();
      try { await saveAbsence(obj); } catch { showError(el, 'Не удалось сохранить. Попробуйте ещё раз.'); return; }
      closeLayer(el);
      navigateToMonth(`${obj.start}T00:00`);
      toast(existing ? 'Изменения сохранены' : 'Отвлечение добавлено');
    }
  });
}

// =====================================================================
// МАРШРУТ
// =====================================================================
export function openRouteForm(id, preset) {
  const existing = id ? S.routes.find((r) => r.id === id) : null;
  const used = existing ? S.trips.filter((t) => t.routeId === id).length : 0;
  const el = openLayer(sheet({
    title: existing ? 'Маршрут' : 'Новый маршрут',
    headRight: existing ? `<button class="icon-btn danger" data-act="del-route" aria-label="Удалить маршрут">${I.trash}</button>` : '',
    body: `
      <div class="field"><label for="rf-from">Точка А — откуда</label><input class="input" id="rf-from" placeholder="Например, Москва" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="rf-to">Точка Б — куда</label><input class="input" id="rf-to" placeholder="Например, Рязань" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="rf-km">Расстояние <span class="opt">· км, необязательно</span></label>
        <div class="input-unit"><input class="input" id="rf-km" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Например, 198"><span>км</span></div>
        <div class="hint">Длина плеча между точками А и Б.</div></div>
      ${existing ? `<div class="hint">Используется в ${used} ${used % 10 === 1 && used % 100 !== 11 ? 'поездке' : 'поездках'}. Изменение названия обновит все эти поездки.</div>` : ''}
      <div data-error></div>`,
    foot: `<button class="btn btn-primary" data-act="save-route">${I.check} Сохранить</button>`,
  }));
  $(el, '#rf-from').value = existing?.from || preset?.from || '';
  $(el, '#rf-to').value = existing?.to || preset?.to || '';
  const km0 = existing?.distanceKm ?? preset?.distanceKm;
  $(el, '#rf-km').value = km0 != null && km0 !== '' ? String(km0) : '';
  if (!existing) setTimeout(() => $(el, '#rf-from').focus(), 250);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.act === 'save-route') {
      const from = $(el, '#rf-from').value.trim();
      const to = $(el, '#rf-to').value.trim();
      if (!from) { showError(el, 'Укажите точку А — откуда отправление.'); return; }
      if (!to) { showError(el, 'Укажите точку Б — куда прибытие.'); return; }
      const dup = S.routes.find((r) => r.id !== id && r.from.toLowerCase() === from.toLowerCase() && r.to.toLowerCase() === to.toLowerCase());
      if (dup) { showError(el, 'Такой маршрут уже сохранён.'); return; }
      const kmRaw = $(el, '#rf-km').value.trim().replace(',', '.');
      let distanceKm = null;
      if (kmRaw !== '') {
        distanceKm = Number(kmRaw);
        if (!Number.isFinite(distanceKm) || distanceKm < 0) { showError(el, 'Расстояние должно быть числом не меньше нуля.'); return; }
        if (distanceKm > 20000) { showError(el, 'Проверьте расстояние — слишком большое значение.'); return; }
        distanceKm = Math.round(distanceKm * 10) / 10;
      }
      await saveRoute({ ...(existing || { id: uid(), createdAt: Date.now() }), from, to, distanceKm, updatedAt: Date.now() });
      closeLayer(el); toast(existing ? 'Маршрут изменён' : 'Маршрут сохранён');
    } else if (b.dataset.act === 'del-route') {
      const ok = await confirmDialog({ title: 'Удалить маршрут?', text: used ? 'Поездки с этим маршрутом сохранят его название.' : 'Маршрут будет удалён из списка.' });
      if (!ok) return;
      await deleteRoute(id); closeLayer(el); toast('Маршрут удалён');
    }
  });
}

// =====================================================================
// ЗАМЕТКА (раздел «Дополнительно»)
// =====================================================================
export function openNoteForm(id, preset = {}) {
  const existing = id ? S.notes.find((n) => n.id === id) : null;
  const types = knownTypes();
  const el = openLayer(sheet({
    title: existing ? 'Заметка' : 'Новая заметка',
    headRight: existing ? `<button class="icon-btn danger" data-act="del-note" aria-label="Удалить заметку">${I.trash}</button>` : '',
    body: `
      <div class="two">
        <div class="field"><label for="nf-type">Тип локомотива</label><input class="input" id="nf-type" list="nf-types" placeholder="2ЭС5К" autocapitalize="characters" autocomplete="off" maxlength="30"></div>
        <div class="field"><label for="nf-num">Номер</label><input class="input" id="nf-num" inputmode="numeric" placeholder="355" autocomplete="off" maxlength="12"></div>
      </div>
      <datalist id="nf-types">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      ${types.length ? `<div class="quick">${types.slice(0, 10).map((t) => `<button type="button" class="qchip" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <div class="field"><label for="nf-text">Заметка</label><textarea class="input" id="nf-text" placeholder="Например: часто ломается" maxlength="1000"></textarea></div>
      ${existing ? `<div class="hint">Добавлена ${fmtDate(existing.createdAt)}</div>` : ''}
      <div data-error></div>`,
    foot: `<button class="btn btn-primary" data-act="save-note">${I.check} Сохранить</button>`,
  }));
  $(el, '#nf-type').value = existing?.type || preset.type || '';
  $(el, '#nf-num').value = existing?.number || preset.number || '';
  $(el, '#nf-text').value = existing?.text || '';
  setTimeout(() => $(el, existing || preset.type ? '#nf-text' : '#nf-type').focus(), 250);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.type) { $(el, '#nf-type').value = b.dataset.type; $(el, '#nf-num').focus(); return; }
    if (b.dataset.act === 'save-note') {
      const type = $(el, '#nf-type').value.trim();
      const number = normNum($(el, '#nf-num').value);
      const text = $(el, '#nf-text').value.trim();
      if (!type || !number) { showError(el, 'Укажите тип и номер локомотива.'); return; }
      if (!text) { showError(el, 'Напишите текст заметки.'); return; }
      await saveNote({ ...(existing || { id: uid(), tripId: null, createdAt: Date.now() }), type, number, text, updatedAt: Date.now() });
      closeLayer(el); toast(existing ? 'Заметка изменена' : 'Заметка добавлена');
    } else if (b.dataset.act === 'del-note') {
      const ok = await confirmDialog({ title: 'Удалить заметку?', text: 'Это действие нельзя отменить.' });
      if (!ok) return;
      await deleteNote(id); closeLayer(el); toast('Заметка удалена');
    }
  });
}
