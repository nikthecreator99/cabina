// «Напомнить в календаре» (2.21.7, просьба Никиты): файл .ics с одним событием — конец отдыха, явка, медкомиссия.
// Файл создаётся в телефоне и открывается календарём телефона; на наш сервер ничего не уходит.
// Календарь человека может копироваться в облако (Google, Apple), поэтому в событии только «CABINA: …» и время —
// без станций, номеров поездов и локомотивов.
import { I, esc, openLayer, closeLayer, sheet, toast, uid, whenShort } from './ui.js';
import { dateText as uiDate } from './career.js';
import { nowLocal } from './store.js';
import { MIN } from './calc.js';

// Смещение часового пояса из настроек относительно UTC, мс (как в colleagues.js, без кругового импорта)
const tzOff = () => Math.round((nowLocal() - Date.now()) / 900000) * 900000;
const p2 = (n) => String(n).padStart(2, '0');
const utcStamp = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`; };
// Текст в .ics: обратная косая, запятая, точка с запятой и перевод строки — экранируются (RFC 5545)
export const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Событие: at — «настенное» время (мс, как parseLocal), date — 'YYYY-MM-DD' (событие на весь день).
// before — за сколько минут напомнить. off — смещение пояса (мс), id — уникальный номер события.
export function icsText({ title, at, date, before = 0, durMin = 15, off = 0, id = 'x', stamp = Date.now() }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CABINA//cabina-app.ru//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${id}@cabina-app.ru`, `DTSTAMP:${utcStamp(stamp)}`];
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    lines.push(`DTSTART;VALUE=DATE:${y}${p2(m)}${p2(d)}`, `DTEND;VALUE=DATE:${next.getUTCFullYear()}${p2(next.getUTCMonth() + 1)}${p2(next.getUTCDate())}`);
  } else {
    const s = at - off;
    lines.push(`DTSTART:${utcStamp(s)}`, `DTEND:${utcStamp(s + durMin * MIN)}`);
  }
  lines.push(`SUMMARY:${icsEsc(title)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`,
    `TRIGGER:${before > 0 ? `-PT${Math.round(before)}M` : 'PT0M'}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Что напоминаем
export const REMIND = {
  yavka: { title: 'CABINA: явка', file: 'cabina-yavka', befores: [[0, 'В это время'], [60, 'За 1 ч'], [120, 'За 2 ч'], [180, 'За 3 ч']], def: 120 },
  queue: { title: 'CABINA: могут вызвать на явку', file: 'cabina-ochered', befores: [[0, 'В это время'], [30, 'За 30 мин'], [60, 'За 1 ч'], [120, 'За 2 ч']], def: 0 },
  rest: { title: 'CABINA: конец отдыха', file: 'cabina-otdyh', befores: [[0, 'В это время'], [30, 'За 30 мин'], [60, 'За 1 ч'], [120, 'За 2 ч']], def: 60 },
  dayOff: { title: 'CABINA: конец выходного', file: 'cabina-vyhodnoy', befores: [[0, 'В это время'], [60, 'За 1 ч'], [120, 'За 2 ч'], [720, 'За 12 ч']], def: 120 },
  med: { title: 'CABINA: срок медкомиссии', file: 'cabina-medkomissiya', befores: [[1440, 'За день'], [4320, 'За 3 дня'], [10080, 'За неделю'], [20160, 'За 2 недели']], def: 10080 },
};
// вид отдыха (currentRest().kind) → что напоминаем
export const restRemindKind = (kind) => (kind === 'queue' ? 'queue' : kind === 'dayOff' ? 'dayOff' : 'rest');

// Когда звенит напоминание (настенное время, мс) — для подсказки про будильник
export function alarmAt({ at, date, before }) {
  if (date) { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d, 9, 0) - before * MIN; }
  return at - before * MIN;
}

function download(text, name) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.ics`; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Окно «Напомнить в календаре». what — ключ REMIND; at (настенное, мс) или date ('YYYY-MM-DD').
export function openRemind({ what, at, date }) {
  const R = REMIND[what];
  if (!R || (!Number.isFinite(at) && !date)) return null;
  let before = R.def;
  const now = nowLocal();
  const whenText = date ? uiDate(date) : whenShort(at, now);
  const el = openLayer(sheet({
    title: 'Напомнить в календаре',
    body: `
      <div class="remind-when"><span class="ico">${I.bell}</span><div><b>${esc(R.title.replace('CABINA: ', '').replace(/^./, (c) => c.toUpperCase()))}</b><small>${esc(whenText)}</small></div></div>
      <div class="field"><div class="label">Напомнить</div>
        <div class="seg" id="rm-before">${R.befores.map(([v, l]) => `<button type="button" data-before="${v}" aria-pressed="${v === before}">${l}</button>`).join('')}</div></div>
      <div class="hint" id="rm-alarm"></div>
      <div class="hint">В календарь попадёт только «${esc(R.title)}» и время — без станций и номеров.</div>`,
    foot: `<button class="btn btn-primary" data-act="rm-save">${I.calStar} Добавить в календарь</button>`,
  }));
  const paint = () => {
    for (const b of el.querySelectorAll('[data-before]')) b.setAttribute('aria-pressed', String(+b.dataset.before === before));
    const t = alarmAt({ at, date, before });
    el.querySelector('#rm-alarm').innerHTML = t > now
      ? `Календарь не открылся? Поставьте будильник сами на <b>${esc(whenShort(t, now))}</b> (на iPhone — «Часы» → «Будильник»).`
      : 'Это время уже прошло — выберите напоминание поближе.';
  };
  paint();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-before], [data-act]');
    if (!b) return;
    if (b.dataset.before != null) { before = +b.dataset.before; paint(); return; }
    if (b.dataset.act === 'rm-save') {
      if (alarmAt({ at, date, before }) <= nowLocal()) { toast('Это время уже прошло — выберите напоминание поближе'); return; }
      download(icsText({ title: R.title, at, date, before, off: tzOff(), id: uid() }), R.file);
      closeLayer(el);
      toast('Откройте скачанный файл — событие добавится в календарь');
    }
  });
  return el;
}

