// Заметки о локомотивах от коллег (2.30, просьба Никиты 11.11.2026).
// Свою заметку человек сам отмечает «Показать коллегам» (по умолчанию — нет) и сам выбирает, кто из коллег её видит
// («Приватность» → «Заметки о локомотивах»). Заметки коллег скачиваются в телефон целиком, нужный локомотив ищется здесь же —
// сервер не знает, на каком локомотиве кто едет. Под заметкой коллеги — «Полезно» (автору — награда «Полезный совет»,
// много раз) и «Не помогло» (ничего не происходит, помнится только в этом телефоне).
// Всё, что пришло с сервера, уже проверено в colleagues.js (buildNotes), а на экран — только через esc().
import { I, esc, openLayer, closeLayer, sheet, MONTHS } from './ui.js';
import { nowLocal, notesFor, locoLabel } from './store.js';
import { colNotesFor, colNotesAll, colNoteVoted, rateColNote, colNotesOn, notesAudience, notesAccessMode, prepareNoteShare, notesUseful, NOTE_SHARE_MAX } from './colleagues.js';

const NOHELP_KEY = 'cabina-note-nohelp'; // «Не помогло» — только в этом телефоне (удобство), на сервер не уходит
const noHelp = () => { try { const x = JSON.parse(localStorage.getItem(NOHELP_KEY) || '[]'); return Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []; } catch { return []; } };
function setNoHelp(id, on) {
  const list = noHelp().filter((x) => x !== id);
  if (on) list.push(id);
  try { localStorage.setItem(NOHELP_KEY, JSON.stringify(list.slice(-500))); } catch {}
}

export const OLD_MONTHS = 12;
// «ноябрь 2026»; старше года — «давняя, могла устареть» (на локомотивах работают годами, но после ремонта всё меняется)
export function monthText(ym, now = nowLocal()) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(now);
  const age = (d.getUTCFullYear() - y) * 12 + (d.getUTCMonth() + 1 - m);
  return { label: `${MONTHS[m - 1].toLowerCase()} ${y}`, old: age >= OLD_MONTHS };
}

// Кнопка в форме поездки под номером локомотива: свои заметки и заметки коллег.
// Есть заметки коллег — кнопка заметнее: человек сам может и не догадаться их посмотреть.
export function locoNotesButton(type, number, mine, act = 'loco-notes') {
  const col = colNotesFor(type, number).length;
  if (!mine && !col) return '';
  if (!col) return `<button type="button" class="link-btn" data-act="${act}">${I.note} Посмотреть заметки по этому локомотиву (${mine})</button>`;
  const what = mine ? `ваши — ${mine}, коллег — ${col}` : `${col}`;
  return `<button type="button" class="link-btn ln-col-btn" data-act="${act}">${I.users} Заметки коллег по этому локомотиву (${what})</button>`;
}

function colNoteHtml(n) {
  const mt = monthText(n.month);
  const up = colNoteVoted(n.id);
  const down = !up && noHelp().includes(n.id);
  return `<div class="ln-col" data-note="${esc(n.id)}">
    <div class="txt">${esc(n.text)}</div>
    <div class="when"><b>${esc(n.name)}</b> · ${esc(mt.label)}${mt.old ? ' · <span class="ln-old">давняя, могла устареть</span>' : ''}${n.useful ? ` · полезно: ${n.useful}` : ''}</div>
    <div class="ln-rate" role="group" aria-label="Оценить заметку">
      <button type="button" class="ln-vote" data-vote="up" aria-pressed="${up}">${I.check} Полезно</button>
      <button type="button" class="ln-vote" data-vote="down" aria-pressed="${down}">Не помогло</button>
    </div>
  </div>`;
}

// Окно заметок по локомотиву: сначала свои, потом от коллег (с оценкой)
export function openLocoNotesSheet(type, number, excludeTripId, fmtDate) {
  const mine = notesFor(type, number).filter((n) => n.tripId !== excludeTripId);
  const col = colNotesFor(type, number);
  const body = () => `${mine.length ? `${col.length ? '<div class="group-title">Ваши</div>' : ''}<div class="loco-group">${mine.map((n) => `<div class="note"><div><div class="txt">${esc(n.text)}</div>
      <div class="when">${fmtDate(n.createdAt)}${n.shared ? ' · видят коллеги' : ''}</div></div><span></span></div>`).join('')}</div>` : ''}
    ${col.length ? `<div class="group-title">От коллег</div><div class="loco-group" id="ln-col-list">${col.map(colNoteHtml).join('')}</div>
      <div class="hint">Отметка «Полезно» приносит автору награду «Полезный совет». «Не помогло» никто не видит. Заметки коллег не заменяют журнал технического состояния локомотива и его приёмку.</div>` : ''}
    ${mine.length ? '<div class="hint">Изменить или удалить свои заметки можно в «Ещё» → «Заметки о локомотивах».</div>' : ''}`;
  const el = openLayer(sheet({ title: locoLabel(type, number), back: true, body: `<div id="ln-body">${body()}</div>` }));
  let busy = false;
  el.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-vote]');
    if (!v || busy) return;
    const id = v.closest('[data-note]').dataset.note;
    const up = v.dataset.vote === 'up';
    const pressed = v.getAttribute('aria-pressed') === 'true';
    busy = true;
    try {
      if (up) {
        if (await rateColNote(id, !pressed)) setNoHelp(id, false);
      } else {
        // «Не помогло»: снимаем «Полезно», если стояло (на сервере остаётся только «полезно»)
        if (colNoteVoted(id) && !(await rateColNote(id, false))) return;
        setNoHelp(id, !pressed);
      }
    } finally { busy = false; }
    const n = colNotesFor(type, number).find((x) => x.id === id);
    const row = el.querySelector(`[data-note="${CSS.escape(id)}"]`);
    if (n && row) row.outerHTML = colNoteHtml(n);
  });
  return el;
}

// ---------------------------------------------------------------- «Показать коллегам» в заметке

// Переключатель под текстом заметки. Только с аккаунтом (без него — ничего не показываем: заметка в телефоне, как раньше).
export function shareSwitchHtml(id, on, noteId = null) {
  if (!colNotesOn()) return '';
  return `<div class="ln-share" id="${id}-box">
    <div class="switch-row"><div class="grow"><div class="t1">Показать коллегам</div><div class="t2" id="${id}-sub">${shareSub(on, noteId)}</div></div>
      <button type="button" class="switch" role="switch" id="${id}" aria-checked="${on}" aria-label="Показать заметку коллегам"></button></div>
    <div class="hint ln-warn" id="${id}-warn" ${on ? '' : 'hidden'}>Не пишите имена, телефоны и служебную информацию. Для коллег — до ${NOTE_SHARE_MAX} знаков. Заметка не заменяет журнал технического состояния локомотива.</div>
  </div>`;
}
function shareSub(on, noteId) {
  if (!on) return 'Увидят коллеги, когда впишут этот локомотив в поездку';
  const who = notesAccessMode() === 'none' ? '' : notesAudience();
  const n = noteId ? notesUseful(noteId) : 0;
  return [who ? `Видят: ${who}` : 'Видят коллеги', n ? `полезно: ${n}` : ''].filter(Boolean).join(' · ');
}
// Нажатие на переключатель: включить — только после аккаунта, согласия и выбора, кто видит. Возвращает новое значение.
export async function toggleShare(root, id, noteId = null) {
  const sw = root.querySelector(`#${id}`);
  if (!sw) return false;
  let on = sw.getAttribute('aria-checked') !== 'true';
  if (on && !(await prepareNoteShare())) on = false;
  sw.setAttribute('aria-checked', String(on));
  root.querySelector(`#${id}-sub`).textContent = shareSub(on, noteId);
  root.querySelector(`#${id}-warn`).hidden = !on;
  return on;
}
// Ошибка для формы: текст для коллег длиннее, чем уходит на сервер
export const shareTooLong = (text) => `Для коллег заметка — не длиннее ${NOTE_SHARE_MAX} знаков (сейчас ${text.length}). Сократите её или выключите «Показать коллегам».`;

// Заметки коллег — отдельным списком на экране «Заметки о локомотивах». match(текст) — подходит ли под поиск.
export function colNotesListHtml(match, highlight) {
  const hits = colNotesAll().filter((n) => match(`${locoLabel(n.type, n.number)} ${n.type} ${n.number} ${n.text} ${n.name}`));
  if (!hits.length) return '';
  const groups = new Map();
  for (const n of hits) { const k = `${n.type}|${n.number}`; if (!groups.has(k)) groups.set(k, { type: n.type, number: n.number, list: [] }); groups.get(k).list.push(n); }
  return `<div class="group-title ln-from">От коллег</div><div class="screen-list" id="col-notes-list">${[...groups.values()].map((g) => `<section class="loco-group">
    <div class="loco-head"><span class="ico" style="color:var(--night)">${I.users}</span><div class="name">${highlight(locoLabel(g.type, g.number))}</div>
      <button class="icon-btn" data-act="col-notes-open" data-type="${esc(g.type)}" data-number="${esc(g.number)}" aria-label="Оценить заметки коллег">${I.right}</button></div>
    ${g.list.map((n) => { const mt = monthText(n.month); return `<div class="note"><div><div class="txt">${highlight(n.text)}</div><div class="when">${esc(n.name)} · ${esc(mt.label)}${mt.old ? ' · давняя' : ''}${n.useful ? ` · полезно: ${n.useful}` : ''}</div></div><span></span></div>`; }).join('')}
  </section>`).join('')}</div>`;
}
