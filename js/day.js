// Нажатие на день календаря в статистике.
// Рабочий день — краткая сводка по поездкам этого дня (куда, сколько, ночные, локомотив, поезд) и «Открыть поездку».
// Пустой день — можно поставить отвлечение или отметку «Выходной» (только отметка: на норму и заработок не влияет).
import { I, esc, small, sheet, openLayer, closeLayer, toast, hm, dayMonth, WD } from './ui.js';
import { S, statsOf, routeOf, locoLabel, myPay, overRestByTrip, setDayOff, isPending } from './store.js';
import { fmtDur, parseLocal, dateKeyOf, DAY, MIN } from './calc.js';
import { tripPay, hasRate, fmtRub } from './pay.js';
import { dayOffIntervals } from './rest.js';
import { TRIP_KINDS, ABS_TYPES, openTripForm, openAbsenceForm } from './forms.js';

const dayStart = (key) => parseLocal(`${key}T00:00`);

// Поездки, рабочее время которых задевает этот день (поездка «Ждёт явки» — нет: она ещё не началась)
export function tripsOnDay(key, trips = S.trips) {
  const s = dayStart(key); const e = s + DAY;
  return trips.filter((t) => !isPending(t) && (statsOf(t).intervals || []).some(([a, b]) => a < e && b > s))
    .sort((a, b) => statsOf(a).start - statsOf(b).start);
}

export const absenceOnDay = (key) => S.absences.find((a) => a.start <= key && a.end >= key) || null;
const depotDayOff = (key) => { const s = dayStart(key); return dayOffIntervals().find((x) => x.s < s + DAY && x.e > s) || null; };

// Время со стороны выбранного дня: в тот же день — только часы, иначе с датой
const at = (ms, key) => (dateKeyOf(ms) === key ? hm(ms) : `${dayMonth(ms)}, ${hm(ms)}`);

function tripCard(t, key, ctx) {
  const st = statsOf(t);
  const kind = TRIP_KINDS[t.kind] || TRIP_KINDS.freight;
  const route = routeOf(t);
  const loco = locoLabel(t.locoType, t.locoNumber);
  const pass = (t.passenger || []).reduce((sum, p) => { const a = parseLocal(p.start); const b = parseLocal(p.end); return b > a ? sum + (b - a) / MIN : sum; }, 0);
  const train = [t.weight ? `${t.weight.toLocaleString('ru-RU')} т` : '', t.axles ? `${t.axles} осей` : '', t.length ? `${t.length} усл. ваг.` : ''].filter(Boolean).join(' · ');
  const pay = ctx ? tripPay(t, st, ctx.cfg, { overRestMin: ctx.or.get(t.id) || 0 }) : null;
  const kv = (label, value) => `<div class="kv"><span>${label}</span><b>${value}</b></div>`;
  return `<section class="day-trip">
    <div class="day-trip-head">${small(I.route, 16)}<b>${route ? esc(route) : 'Маршрут не указан'}</b><span class="chip">${esc(kind.label)}</span></div>
    <div class="kv-grid">
      ${kv('Явка', at(st.start, key))}
      ${kv('Окончание', st.end ? at(st.end, key) : 'в пути')}
      ${kv('Рабочее время', fmtDur(st.work))}
      ${st.night ? kv(`${small(I.moon, 14)} Ночные`, fmtDur(st.night)) : ''}
      ${st.holiday ? kv(`${small(I.calStar, 14)} Праздничные`, fmtDur(st.holiday)) : ''}
      ${pass ? kv(`${small(I.passenger, 14)} Пассажиром`, fmtDur(pass)) : ''}
      ${loco ? kv(`${small(I.train, 14)} Локомотив`, esc(loco)) : ''}
      ${t.routeNo ? kv('Номер маршрута', esc(t.routeNo)) : ''}
      ${pay && pay.net > 0 ? kv(`${small(I.wallet, 14)} Заработок`, `≈ ${fmtRub(pay.net)}`) : ''}
    </div>
    ${train ? `<div class="hint">Поезд: ${esc(train)}</div>` : ''}
    <button class="btn btn-ghost btn-sm" data-act="day-trip" data-id="${esc(t.id)}">Открыть поездку ${small(I.right, 16)}</button>
  </section>`;
}

export function openDay(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return;
  const abs = absenceOnDay(key);
  if (abs) { openAbsenceForm(abs.id); return; }
  const d = dayStart(key);
  const title = `${dayMonth(d)}, ${WD[new Date(d).getUTCDay()]}`;
  const trips = tripsOnDay(key);
  const marked = S.daysOff.includes(key);
  const depot = !trips.length && !marked ? depotDayOff(key) : null;
  let body;
  if (trips.length) {
    const cfg = myPay();
    const ctx = hasRate(cfg) ? { cfg, or: overRestByTrip() } : null;
    body = trips.map((t) => tripCard(t, key, ctx)).join('');
  } else if (depot) {
    body = `<div class="notice">${I.info}<div><b>Выходной после поездки</b> — до ${dayMonth(depot.e)}, ${hm(depot.e)}. Его можно изменить в самой поездке.</div></div>`;
  } else {
    body = `${marked ? `<div class="notice ok">${I.home2}<div><b>Отмечен как выходной.</b> Это только отметка: на норму и заработок она не влияет.</div></div>` : '<div class="hint">В этот день нет поездок и отвлечений. Что это был за день?</div>'}
      <div class="panel day-pick">
        <button class="row" data-act="day-abs"><span class="ico" style="--c:var(--sick)">${ABS_TYPES.sick.icon}</span>
          <div class="grow"><div class="t1">Отвлечение</div><div class="t2">Больничный, отпуск, медкомиссия, учёба</div></div>${small(I.right, 18)}</button>
        <button class="row" data-act="day-off" aria-pressed="${marked}"><span class="ico" style="--c:var(--night)">${I.home2}</span>
          <div class="grow"><div class="t1">${marked ? 'Убрать отметку «Выходной»' : 'Выходной'}</div><div class="t2">${marked ? 'День снова станет пустым' : 'Отметка в календаре, норму не меняет'}</div></div></button>
      </div>`;
  }
  const el = openLayer(sheet({ title, body }));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    const act = b.dataset.act;
    if (act === 'day-trip') { closeLayer(el); openTripForm(b.dataset.id); }
    else if (act === 'day-abs') { closeLayer(el); openAbsenceForm(null, { defaultDate: key }); }
    else if (act === 'day-off') {
      await setDayOff(key, !marked);
      closeLayer(el);
      toast(marked ? 'Отметка убрана' : 'День отмечен как выходной');
    }
  });
}
