// Меню ☰ «Настройки работы»: маршруты, тарифные ставки и надбавки, дома отдыха, междусменный отдых.
import { I, esc, small, pageHead, stepperHtml, openLayer, closeLayer, sheet, toast, confirmDialog, plural, MONTHS_GEN } from './ui.js';
import { S, nowLocal, saveSettings, deleteRoute } from './store.js';
import { fmtDur, fmtLocal } from './calc.js';
import { openRouteForm } from './forms.js';
import { restHouses, dayOffMin } from './rest.js';
import { PAY_FIELDS, ROLES, payCfg, paySet, currentRate, hasRate, fmtRub } from './pay.js';

export const fmtKm = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} км`;
const todayKey = () => fmtLocal(nowLocal()).slice(0, 10);
const dateText = (k) => `${+k.slice(8, 10)} ${MONTHS_GEN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const numText = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));
const parseNum = (s) => { const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.'); if (t === '') return ''; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };

// ---------------------------------------------------------------- меню
// Междусменный отдых и выходной свёрнуты: видно значение, по нажатию открывается настройка
const wkOpen = new Set();
export function renderWork() {
  const cfg = payCfg(S.settings.pay, S.profile.role);
  const rate = currentRate(cfg, todayKey());
  const houses = restHouses();
  const r = S.routes.length;
  return `${pageHead('Настройки работы', { back: true })}
    <div class="panel">
      <button class="row" data-act="go" data-page="routes"><span class="ico" style="--c:var(--accent)">${I.route}</span><div class="grow"><div class="t1">Маршруты</div><div class="t2">${r ? `${r} ${plural(r, 'маршрут', 'маршрута', 'маршрутов')}` : 'Плечи, по которым вы ездите'}</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="go" data-page="tariffs"><span class="ico" style="--c:var(--ok)">${I.wallet}</span><div class="grow"><div class="t1">Тарифные ставки и надбавки</div><div class="t2">${hasRate(cfg) ? `${fmtRub(rate, true)} в час · ${ROLES[cfg.role].toLowerCase()}` : 'Ставка не указана — заработок не считается'}</div></div>${small(I.right, 18)}</button>
      <button class="row" data-act="go" data-page="houses"><span class="ico" style="--c:var(--night)">${I.bed2}</span><div class="grow"><div class="t1">Дома отдыха</div><div class="t2">${houses.length ? `${houses.length} ${plural(houses.length, 'дом отдыха', 'дома отдыха', 'домов отдыха')} · минимум ${fmtDur(S.settings.minRest ?? 240, { short: true })}` : 'Минимальный отдых в пункте оборота'}</div></div>${small(I.right, 18)}</button>
      <div class="wk-sec" id="shift-panel">
        <button class="row wk-head" data-act="wk-toggle" data-k="shift" aria-expanded="${wkOpen.has('shift')}" aria-controls="wk-shift"><span class="ico" style="--c:var(--warn)">${I.clock}</span><div class="grow"><div class="t1">Междусменный отдых</div><div class="t2">Минимум дома перед вызовом «На очередь»</div></div><span class="wk-val">${fmtDur(S.settings.minShiftRest ?? 960, { short: true })}</span><span class="chev">${small(I.right, 18)}</span></button>
        ${wkOpen.has('shift') ? `<div id="wk-shift"><div class="row"><div class="grow"><div class="t2">После домашнего отдыха «На очередь» вызвать на явку могут не раньше, чем через это время. Кнопками − и + меняйте по 30 минут.</div></div></div>
        <div class="row" style="justify-content:center">${stepperHtml('min-shift', S.settings.minShiftRest ?? 960, { minus: 'shift-minus', plus: 'shift-plus', fmt: fmtDur })}</div></div>` : ''}
      </div>
      <div class="wk-sec" id="dayoff-panel">
        <button class="row wk-head" data-act="wk-toggle" data-k="dayoff" aria-expanded="${wkOpen.has('dayoff')}" aria-controls="wk-dayoff"><span class="ico" style="--c:var(--ok)">${I.calendar}</span><div class="grow"><div class="t1">Выходной</div><div class="t2">Сколько длится выходной в вашем депо</div></div><span class="wk-val">${fmtDur(dayOffMin(), { short: true })}</span><span class="chev">${small(I.right, 18)}</span></button>
        ${wkOpen.has('dayoff') ? `<div id="wk-dayoff"><div class="row"><div class="grow"><div class="t2"><label for="day-off">Часы выходного.</label> После поездки нажмите «Пойти на выходной» — на главном экране будет видно, когда он закончится.</div></div></div>
        <div class="row"><div class="input-unit grow"><input class="input" id="day-off" inputmode="decimal" autocomplete="off" value="${esc(numText(Math.round(dayOffMin() / 60 * 100) / 100))}" placeholder="Например, 60"><span>ч</span></div></div></div>` : ''}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- маршруты (компактные карточки)
export function renderRoutes() {
  const use = new Map();
  S.trips.forEach((t) => t.routeId && use.set(t.routeId, (use.get(t.routeId) || 0) + 1));
  const list = [...S.routes].sort((a, b) => (use.get(b.id) || 0) - (use.get(a.id) || 0) || a.from.localeCompare(b.from, 'ru'));
  return `${pageHead('Маршруты', { back: true })}
    <div class="page-sub">${list.length ? `${list.length} ${plural(list.length, 'сохранённый маршрут', 'сохранённых маршрута', 'сохранённых маршрутов')}` : 'Сохраните маршруты, чтобы выбирать их одним касанием'}</div>
    <button class="btn btn-primary" data-act="add-route">${I.plus} Добавить маршрут</button>
    ${list.length ? `<div class="list">${list.map((r) => {
      const n = use.get(r.id) || 0;
      const hasReverse = S.routes.some((x) => x.from.toLowerCase() === r.to.toLowerCase() && x.to.toLowerCase() === r.from.toLowerCase());
      return `<div class="swipe" data-swipe="${esc(r.id)}">
      <button class="swipe-del" data-act="route-del" data-id="${esc(r.id)}" aria-label="Удалить маршрут" tabindex="-1">${I.trash}<span>Удалить</span></button>
      <div class="route-card swipe-row">
        <button class="route-pts" data-act="route" data-id="${esc(r.id)}" aria-label="Изменить маршрут ${esc(r.from)} — ${esc(r.to)}">
          <div class="pt"><span>${esc(r.from)}</span><i aria-hidden="true">→</i><span>${esc(r.to)}</span></div>
          <div class="route-meta">${r.distanceKm ? `<span class="km">${fmtKm(r.distanceKm)}</span> · ` : ''}${n ? `${n} ${plural(n, 'поездка', 'поездки', 'поездок')}` : 'Поездок пока нет'}</div>
        </button>
        ${hasReverse ? '' : `<button class="icon-btn" data-act="route-reverse" data-id="${esc(r.id)}" aria-label="Создать обратный маршрут" title="Обратный маршрут">${I.swap}</button>`}
      </div></div>`;
    }).join('')}</div>`
      : `<div class="empty"><div class="em-ico">${I.route}</div><b>Маршрутов пока нет</b><p>Например: Малошуйка → Сумский Посад. Маршрут можно выбрать первым полем при добавлении поездки.</p></div>`}`;
}

// ---------------------------------------------------------------- тарифные ставки и надбавки
// Набор ставок один (с 2.6): если ставка меняется — человек просто вписывает новую. Надбавка за класс — только машинисту.
const payRole = () => S.profile.role || 'assistant';
// короткие пояснения в режиме «по среднему»
const AVG_HINTS = {
  avgHour: 'Со всеми доплатами, до НДФЛ. Все рабочие часы × эта сумма. Учёба — тоже по ней: часы дней учёбы по календарю × эта сумма.',
  sickDay: 'Сколько начисляют за один календарный день больничного.',
};
// учёба в режиме «по тарифу» — тоже по среднему за час
const STUDY_HINT = 'Учёба оплачивается по среднему: эта сумма × часы дней учёбы по производственному календарю (обычный день — 8 ч). Средний за час — сумма за техучёбу в квитке, делённая на её часы.';
export function renderTariffs() {
  const raw = paySet(S.settings.pay, payRole());
  const cfg = payCfg(S.settings.pay, payRole());
  const today = todayKey();
  const rates = [...cfg.rates].sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')));
  const cur = currentRate(cfg, today);
  const field = (f, hint = f.hint) => {
    const v = raw[f.k];
    const shown = v === undefined || v === null ? (f.def ?? '') : v;
    return `<div class="pay-field">
      <label for="pf-${f.k}">${esc(f.label)}</label>
      <div class="input-unit"><input class="input" id="pf-${f.k}" data-pf="${f.k}" inputmode="decimal" autocomplete="off" value="${esc(numText(shown))}" placeholder="${f.ph || '0'}"><span>${f.unit}</span></div>
      <div class="hint">${esc(hint)}</div></div>`;
  };
  const fields = PAY_FIELDS.filter((f) => !f.role || f.role === payRole());
  const avg = cfg.mode === 'avg';
  return `${pageHead('Тарифные ставки и надбавки', { back: true })}
    <div class="group-title">Как считать заработок</div>
    <div class="seg" id="pay-mode">${[['tariff', 'По тарифу'], ['avg', 'По среднему']].map(([k, v]) => `<button data-act="pay-mode" data-mode="${k}" aria-pressed="${cfg.mode === k}">${v}</button>`).join('')}</div>
    ${avg ? `<div class="panel pay-panel" id="pay-avg">${['avg', 'sick'].map((g) => fields.filter((f) => f.group === g).map((f) => field(f, AVG_HINTS[f.k])).join('')).join('')}</div>
    <div class="hint">Упрощённо: ночные, праздничные и переработка уже внутри среднего. НДФЛ 13% вычитается.</div>` : `
    <div class="panel pay-panel">
      <div class="pay-field">
        <label for="pf-rate">Тарифная ставка, ₽ в час</label>
        <div class="input-unit"><input class="input" id="pf-rate" inputmode="decimal" autocomplete="off" value="${cur ? esc(numText(cur)) : ''}" placeholder="Например, 250,00"><span>₽/ч</span></div>
        <div class="hint">В квитке — «Оклад/Тариф» в шапке. Все часы умножаются на неё, от неё считаются все доплаты.</div>
        ${rates.length > 1 || (rates[0] && rates[0].from) ? `<div class="rate-hist"><div class="mini-label">История ставки</div>${rates.map((r, i) => `<div class="rate-row"><span>${r.from ? `с ${dateText(r.from)}` : rates.length > 1 ? 'раньше' : 'всегда'}</span><b>${fmtRub(r.rate, true)}</b>${rates.length > 1 ? `<button class="icon-btn danger sm" data-act="rate-del" data-i="${cfg.rates.indexOf(r)}" aria-label="Удалить ставку ${fmtRub(r.rate, true)}">${small(I.trash, 16)}</button>` : ''}</div>`).join('')}</div>` : ''}
      </div>
      ${fields.filter((f) => !f.deduct && !f.group).map((f) => field(f)).join('')}
    </div>`}
    ${avg ? '' : `<div class="group-title">Больничный</div>
    <div class="panel pay-panel" id="pay-sick">${fields.filter((f) => f.group === 'sick').map((f) => field(f)).join('')}
      <div class="pay-field"><div class="hint">Тогда в квитке появится строка «Больничный»: число дней больничного в месяце × оплата одного дня. НДФЛ с неё тоже вычитается.</div></div></div>
    <div class="group-title">Учёба (сессия)</div>
    <div class="panel pay-panel" id="pay-study">${fields.filter((f) => f.group === 'avg').map((f) => field(f, STUDY_HINT)).join('')}</div>
    `}<div class="group-title">Удержания (необязательно)</div>
    <div class="panel pay-panel">${fields.filter((f) => f.deduct).map((f) => field(f)).join('')}
      <div class="pay-field"><div class="hint">НДФЛ 13% вычитается всегда.</div></div></div>
    <div class="notice">${I.info}<div><b>Расчёт ориентировочный, итог — по вашему расчётному листку.</b> Пустые поля и нули в расчёт не попадают. Ставки хранятся только в этом телефоне.</div></div>`;
}

// всё пишется в один набор main; прежние наборы по должностям не трогаем
function savePaySet(patch) {
  const pay = { ...(S.settings.pay || {}) };
  pay.main = { ...paySet(pay, payRole()), ...patch };
  return saveSettings({ pay });
}

// Новая ставка: спросить, с какого числа она действует. Возвращает { from } | { fix: true } | null
function askRateDate(rate, current) {
  return new Promise((resolve) => {
    let result = null;
    const now = todayKey();
    const def = `${now.slice(0, 7)}-01`;
    const el = openLayer(`<form class="dialog" role="dialog" aria-modal="true" aria-label="С какого числа новая ставка">
      <h3>С какого числа ставка ${esc(fmtRub(rate, true))}?</h3>
      <p>Месяцы до этой даты останутся по старой ставке ${esc(fmtRub(current, true))} и не пересчитаются.</p>
      <input type="date" class="input" id="rate-from" value="${def}" required>
      <button type="button" class="link-btn" data-act="rate-fix">Это исправление ошибки — заменить старую ставку</button>
      <div class="btns"><button type="button" class="btn btn-plain btn-sm" data-act="no">Отмена</button>
      <button type="submit" class="btn btn-primary btn-sm">Сохранить</button></div></form>`,
    { kind: 'dialog', onClose: () => resolve(result) });
    el.querySelector('[data-act=no]').onclick = () => closeLayer(el);
    el.querySelector('[data-act=rate-fix]').onclick = () => { result = { fix: true }; closeLayer(el); };
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = el.querySelector('#rate-from').value;
      if (!v) return;
      result = { from: v }; closeLayer(el);
    };
  });
}

async function changeRate(input) {
  const cfg = payCfg(S.settings.pay, payRole());
  const v = parseNum(input.value);
  const cur = currentRate(cfg, todayKey());
  if (v === '' || Number.isNaN(v) || v === 0) {
    if (v !== '' && v !== 0) toast('Ставка — это число, например 250,00', { error: true });
    input.value = cur ? numText(cur) : '';
    return;
  }
  if (v > 100000) { toast('Проверьте ставку — слишком большое значение', { error: true }); input.value = cur ? numText(cur) : ''; return; }
  const rate = Math.round(v * 100) / 100;
  if (rate === cur) { input.value = numText(cur); return; }
  let rates = [...cfg.rates];
  if (!rates.length) rates = [{ from: null, rate }];
  else {
    const ans = await askRateDate(rate, cur);
    if (!ans) { input.value = numText(cur); return; }
    if (ans.fix) {
      // заменить ставку, которая действует сегодня
      const today = todayKey();
      const sorted = [...rates].sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')));
      let idx = 0;
      sorted.forEach((r, i) => { if (!r.from || r.from <= today) idx = i; });
      const target = sorted[idx];
      rates = rates.map((r) => (r === target ? { ...r, rate } : r));
    } else {
      rates = rates.filter((r) => r.from !== ans.from);
      rates.push({ from: ans.from, rate });
    }
  }
  await savePaySet({ rates });
  toast('Ставка сохранена');
}

// ---------------------------------------------------------------- дома отдыха
export function renderHouses() {
  const houses = restHouses();
  const gen = S.settings.minRest;
  return `${pageHead('Дома отдыха', { back: true })}
    <div class="panel" id="rest-panel">
      <div class="row"><span class="ico" style="--c:var(--ok)">${I.bed2}</span><div class="grow"><div class="t1">Минимальный отдых в пункте оборота</div><div class="t2">Общий для всех домов отдыха без своего значения. Отдых = больше из 50% рабочего времени и этого значения.</div></div></div>
      <div class="row" style="justify-content:center">${stepperHtml('min-rest', gen, { minus: 'rest-minus', plus: 'rest-plus', fmt: fmtDur })}</div>
    </div>
    <div class="group-title">Ваши дома отдыха</div>
    ${houses.length ? `<div class="panel">${houses.map((h) => `<button class="row" data-act="house" data-key="${esc(h.key)}">
        <span class="ico" style="--c:var(--night)">${I.home2}</span>
        <div class="grow"><div class="t1">${esc(h.name)}</div><div class="t2">${h.count ? `Отдыхали ${h.count} ${plural(h.count, 'раз', 'раза', 'раз')}` : 'Станция прибытия маршрута'}</div></div>
        <span class="house-min ${h.minRest != null ? 'own' : ''}">${fmtDur(h.minRest ?? gen, { short: true })}${h.minRest != null ? '' : '<small>общий</small>'}</span>${small(I.right, 18)}</button>`).join('')}</div>
      <div class="hint">Дом отдыха — станция прибытия поездки с отдыхом в пункте оборота. Список собирается сам из ваших маршрутов.</div>`
      : `<div class="empty"><div class="em-ico">${I.home2}</div><b>Домов отдыха пока нет</b><p>Они появятся сами: дом отдыха — станция прибытия маршрута, где вы отдыхаете в пункте оборота. Например, маршрут «Малошуйка → Сумский Посад» даст дом отдыха «Сумский Посад».</p></div>`}`;
}

function openHouse(key) {
  const h = restHouses().find((x) => x.key === key);
  if (!h) return;
  const get = () => S.settings.houses?.[key]?.minRest ?? null;
  const el = openLayer(sheet({
    title: h.name, back: true,
    body: `<div class="hint">Минимальный отдых в этом доме отдыха. Отдых = больше из 50% рабочего времени и этого значения.</div>
      <div class="row" style="justify-content:center" id="hs-box"></div>
      <button class="btn btn-plain btn-sm" data-act="hs-reset">Как общий (${fmtDur(S.settings.minRest, { short: true })})</button>`,
  }));
  const draw = () => {
    const v = get() ?? S.settings.minRest;
    el.querySelector('#hs-box').innerHTML = stepperHtml('hs-val', v, { minus: 'hs-minus', plus: 'hs-plus', fmt: fmtDur });
    el.querySelector('[data-act=hs-reset]').hidden = get() == null;
  };
  draw();
  const save = async (minRest) => {
    const houses = { ...(S.settings.houses || {}) };
    if (minRest == null) delete houses[key]; else houses[key] = { name: h.name, minRest };
    const saving = saveSettings({ houses }); // S.settings меняется сразу — показываем новое значение, не дожидаясь записи
    draw();
    await saving;
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = get() ?? S.settings.minRest;
    if (b.dataset.act === 'hs-minus' && v > 0) await save(Math.max(0, v - 30));
    else if (b.dataset.act === 'hs-plus' && v < 24 * 60) await save(v + 30);
    else if (b.dataset.act === 'hs-reset') { await save(null); toast('Используется общий минимум'); }
  });
}

// ---------------------------------------------------------------- действия
export async function workClick(act, b, ctx) {
  switch (act) {
    case 'shift-minus': { const v = S.settings.minShiftRest ?? 960; if (v > 0) await saveSettings({ minShiftRest: Math.max(0, v - 30) }); return true; }
    case 'shift-plus': { const v = S.settings.minShiftRest ?? 960; if (v < 48 * 60) await saveSettings({ minShiftRest: v + 30 }); return true; }
    case 'rest-minus': if (S.settings.minRest > 0) await saveSettings({ minRest: Math.max(0, S.settings.minRest - 30) }); return true;
    case 'rest-plus': if (S.settings.minRest < 24 * 60) await saveSettings({ minRest: S.settings.minRest + 30 }); return true;
    case 'wk-toggle': { const k = b.dataset.k; if (wkOpen.has(k)) wkOpen.delete(k); else wkOpen.add(k); ctx.rerender(); if (wkOpen.has(k)) document.getElementById(k === 'dayoff' ? 'day-off' : 'min-shift')?.closest('.wk-sec')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return true; }
    case 'house': openHouse(b.dataset.key); return true;
    case 'add-route': openRouteForm(); return true;
    case 'route': openRouteForm(b.dataset.id); return true;
    case 'route-del': {
      const r = S.routes.find((x) => x.id === b.dataset.id);
      if (!r) return true;
      const used = S.trips.filter((t) => t.routeId === r.id).length;
      const ok = await confirmDialog({ title: 'Вы действительно хотите удалить маршрут?', text: `${r.from} → ${r.to}${used ? '. Поездки с этим маршрутом сохранят его название.' : ''}`, ok: 'Да', cancel: 'Нет' });
      if (ok) { await deleteRoute(r.id); toast('Маршрут удалён'); } else ctx.closeSwipes();
      return true;
    }
    case 'route-reverse': {
      const r = S.routes.find((x) => x.id === b.dataset.id);
      if (r) openRouteForm(null, { from: r.to, to: r.from, distanceKm: r.distanceKm });
      return true;
    }
    case 'pay-mode': { const m = b.dataset.mode === 'avg' ? 'avg' : 'tariff'; await savePaySet({ mode: m }); toast(m === 'avg' ? 'Заработок считается по среднему' : 'Заработок считается по тарифной ставке'); return true; }
    case 'rate-del': {
      const cfg = payCfg(S.settings.pay, payRole());
      const r = cfg.rates[+b.dataset.i];
      if (!r) return true;
      const ok = await confirmDialog({ title: 'Удалить ставку из истории?', text: `${fmtRub(r.rate, true)}${r.from ? ` с ${dateText(r.from)}` : ''}. Эти месяцы будут посчитаны по соседней ставке.` });
      if (ok) {
        const rates = cfg.rates.filter((x) => x !== r);
        if (rates.length && !rates.some((x) => !x.from)) {
          // самая ранняя оставшаяся ставка действует и для всех более ранних дат
          const first = [...rates].sort((a, c) => a.from.localeCompare(c.from))[0];
          first.from = null;
        }
        await savePaySet({ rates });
        toast('Ставка удалена');
      }
      return true;
    }
    default: return false;
  }
}

export async function workChange(e) {
  const t = e.target;
  if (t.id === 'day-off') {
    const v = parseNum(t.value);
    if (v === '' || Number.isNaN(v) || v < 1 || v > 336) {
      toast('Укажите выходной в часах — от 1 до 336, например 60', { error: true });
      t.value = numText(Math.round(dayOffMin() / 60 * 100) / 100);
      return true;
    }
    await saveSettings({ dayOffMin: Math.round(v * 60) });
    toast(`Выходной: ${fmtDur(Math.round(v * 60), { short: true })}`);
    return true;
  }
  if (t.id === 'pf-rate') { await changeRate(t); return true; }
  if (t.dataset.pf) {
    const v = parseNum(t.value);
    if (Number.isNaN(v)) { toast('Введите число, например 12 или 12,5', { error: true }); return true; }
    if (v !== '' && v > (PAY_FIELDS.find((f) => f.k === t.dataset.pf)?.unit === '%' ? 300 : 100000)) { toast('Проверьте значение — слишком большое', { error: true }); return true; }
    await savePaySet({ [t.dataset.pf]: v === '' ? '' : v });
    return true;
  }
  return false;
}


