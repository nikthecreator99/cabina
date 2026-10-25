// Поиск по поездкам: станции маршрута, локомотив (серия и номер), номер маршрута, вид движения, дата
// и заметка к поездке. Совпадения подсвечены, нажатие открывает поездку. Ищет только в этом телефоне.
import { I, esc, small, pageHead, highlight, searchWords, normSearch, MONTHS, MONTHS_GEN, hm, plural } from './ui.js';
import { S, statsOf, routeOf, locoLabel, isLive, nowLocal } from './store.js';
import { fmtDur } from './calc.js';
import { TRIP_KINDS, kindOf } from './forms.js';

export const SEARCH_LIMIT = 100;
const p2 = (n) => String(n).padStart(2, '0');

function dateParts(ms) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  return { text: `${day} ${MONTHS_GEN[m]} ${y}`, alt: `${p2(day)}.${p2(m + 1)}.${y} ${p2(day)}.${p2(m + 1)} ${MONTHS[m]}` };
}

// Всё, по чему ищется поездка, одной строкой
export function tripHaystack(t) {
  const st = statsOf(t);
  const d = Number.isFinite(st.start) ? dateParts(st.start) : { text: '', alt: '' };
  const note = S.notes.find((n) => n.tripId === t.id)?.text || '';
  return normSearch([routeOf(t), locoLabel(t.locoType, t.locoNumber), t.locoType, t.locoNumber, t.routeNo ? `маршрут ${t.routeNo}` : '',
    TRIP_KINDS[kindOf(t)].label, d.text, d.alt, note].join(' '));
}

export function searchTrips(q, trips = S.trips) {
  const words = searchWords(q);
  if (!words.length) return [];
  return trips.filter((t) => { const hay = tripHaystack(t); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

export function searchResultsHtml(q) {
  const words = searchWords(q);
  if (!S.trips.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Поездок пока нет</b><p>Когда вы добавите поездки, здесь можно будет найти любую из них.</p></div>`;
  if (!words.length) return `<div class="hint search-tip">Например: станция, серия или номер локомотива, номер маршрута, «14 октября» или «14.10».</div>`;
  const found = searchTrips(q);
  if (!found.length) return `<div class="empty"><div class="em-ico">${I.search}</div><b>Ничего не найдено</b><p>Попробуйте другое слово, номер или дату.</p></div>`;
  const shown = found.slice(0, SEARCH_LIMIT);
  return `<div class="hint" aria-live="polite">Найдено: ${found.length} ${plural(found.length, 'поездка', 'поездки', 'поездок')}${found.length > shown.length ? `, показаны последние ${shown.length}` : ''}</div>
    <div class="panel found-list">${shown.map((t) => {
      const st = statsOf(t);
      const live = isLive(t);
      const thisYear = new Date(nowLocal()).getUTCFullYear();
      const d = Number.isFinite(st.start) ? dateParts(st.start).text.replace(` ${thisYear}`, '') : '';
      const loco = locoLabel(t.locoType, t.locoNumber);
      const note = S.notes.find((n) => n.tripId === t.id)?.text || '';
      const noteHit = note && words.some((w) => normSearch(note).includes(w));
      const kind = kindOf(t);
      const kindHit = words.some((w) => normSearch(TRIP_KINDS[kind].label).includes(w));
      const sub = [
        loco ? `<span class="nw">${small(I.train, 13)} ${highlight(loco, words)}</span>` : '',
        t.routeNo ? `<span class="nw">маршрут № ${highlight(t.routeNo, words)}</span>` : '',
        kind !== 'freight' || kindHit ? highlight(TRIP_KINDS[kind].label, words) : '',
      ].filter(Boolean).join(' · ');
      return `<button class="row found" data-act="trip" data-id="${esc(t.id)}">
        <div class="grow"><div class="t1">${highlight(d, words)} · ${Number.isFinite(st.start) ? `${hm(st.start)} — ${live ? 'в пути' : hm(st.end)}` : ''}</div>
          <div class="t2">${small(I.route, 13)} ${routeOf(t) ? highlight(routeOf(t), words) : 'Маршрут не указан'}</div>
          ${sub ? `<div class="t2">${sub}</div>` : ''}
          ${noteHit ? `<div class="t2 found-note">${small(I.note, 13)} ${highlight(note.length > 120 ? `${note.slice(0, 120)}…` : note, words)}</div>` : ''}</div>
        <span class="found-dur">${fmtDur(st.work, { short: true })}</span>${small(I.right, 18)}</button>`;
    }).join('')}</div>`;
}

export function renderSearch(q) {
  return `${pageHead('Поиск', { back: true })}
    <div class="search"><span aria-hidden="true">${small(I.search, 18)}</span><input type="search" class="input" id="trip-q" placeholder="Станция, локомотив, маршрут, дата" autocomplete="off" enterkeyhint="search" value="${esc(q)}" aria-label="Поиск по поездкам">${q ? `<button class="search-x" data-act="trip-q-clear" aria-label="Очистить поиск">${small(I.x, 16)}</button>` : ''}</div>
    <div id="search-list" class="screen-list">${searchResultsHtml(q)}</div>`;
}
