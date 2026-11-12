// Уведомления — «колокольчик» в Профиле (2.28, просьба Никиты 10.11.2026): слева от шестерёнки, у каждого, у кого есть аккаунт.
// Пока в нём три вида: «коллега просит показать ему ваш статус», «ответили на вашу идею» (принята / не подошла + комментарий)
// и — только у администратора — «новые идеи». Телефон не звонит: приложение в фоне не работает, а push через Google и Apple —
// это передача данных за границу. Просьбы и ответы видны, когда человек открывает CABINA: красная точка на колокольчике
// и на кнопке «Профиль» внизу. Ничего не включается само: «Включить» открывает окно коллеги, где человек сам решает.
import { I, esc, small, pageHead } from './ui.js';
import { session } from './auth.js';
import { legalReady } from './legal.js';
import { colAsks, colSnap, answerAsk, openColleague, avaBox, cardSub } from './colleagues.js';
import { picSvg } from './grp-pic.js';
import { ideasUnseen, markIdeasSeen, adminNewIdeas, openAdminIdeas, loadIdeas } from './ideas.js';

const N = { shown: null };   // ответы на идеи, которые человек видит на экране (после открытия они «прочитаны», но с экрана не пропадают)
let admin = () => false;
let rerender = () => {};
export function initNotices(h) { admin = h.isAdmin || admin; rerender = h.rerender || rerender; }

const isAdmin = () => !!session() && admin();
// Заявки в группы, где я администратор (2.33): по группам
const groupReqs = () => (colSnap()?.groups || []).filter((g) => g.admin && g.requests?.length);
// Сколько всего новых: просьбы мне + ответы на мои идеи + заявки в мои группы + (админу) новые идеи
export function noticeCount() {
  if (!session() || !legalReady()) return 0;
  return colAsks().length + ideasUnseen().length + groupReqs().reduce((n, g) => n + g.requests.length, 0) + (isAdmin() ? adminNewIdeas() : 0);
}
export const noticesOn = () => !!session() && legalReady();

// Колокольчик слева от шестерёнки: такого же размера
export function bellHtml() {
  if (!noticesOn()) return '';
  const n = noticeCount();
  return `<button class="icon-btn bell-btn" id="pr-bell" data-act="go" data-page="notices" aria-label="Уведомления${n ? `: новых ${n}` : ''}">${I.bell}${n ? `<span class="bell-dot" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
}

const STATE_TITLE = { accepted: 'Ваша идея принята', declined: 'Ваша идея не подошла' };
const brief = (t, n = 90) => (t.length > n ? `${t.slice(0, n).trim()}…` : t);

function askRow(a) {
  return `<div class="col-offer ntc-ask" data-id="${esc(a.id)}">
    <div class="col-who">${avaBox(a.card)}<div class="grow"><div class="t1">${esc(a.card.name)} просит показать ему ваш статус</div>
      <div class="t2">${esc(cardSub(a.card) || 'Ваш коллега')}. Ничего не включится, пока вы сами не включите.</div></div></div>
    <div class="col-btns"><button class="btn btn-plain btn-sm" data-act="ntc-later" data-id="${esc(a.id)}">Не сейчас</button><button class="btn btn-primary btn-sm" data-act="ntc-on" data-id="${esc(a.id)}">Включить</button></div>
    <button class="link-btn ntc-mute" data-act="ntc-mute" data-id="${esc(a.id)}">Больше не просить от него</button>
  </div>`;
}
function ideaRow(x) {
  return `<button class="row ntc-idea" data-act="go" data-page="ideas"><span class="ico" style="--c:var(--${x.state === 'accepted' ? 'ok' : 'warn'})">${I.idea}</span>
    <div class="grow"><div class="t1">${STATE_TITLE[x.state] || 'Ответ на вашу идею'}</div><div class="t2">«${esc(brief(x.body))}»</div>
      ${x.note ? `<div class="idea-note"><b>Ответ:</b> ${esc(x.note)}</div>` : ''}</div>${small(I.right, 18)}</button>`;
}

export function renderNotices() {
  const head = pageHead('Уведомления', { back: true });
  if (!noticesOn()) return `${head}<div class="empty"><div class="em-ico">${I.bell}</div><b>Уведомления — с аккаунтом</b><p>Здесь появятся просьбы коллег и ответы на ваши идеи.</p></div>`;
  const asks = colAsks();
  const ideas = N.shown || [];
  const adm = isAdmin() ? adminNewIdeas() : 0;
  const parts = [];
  if (asks.length) parts.push(`<div class="group-title">Просят показать статус</div><div class="panel ntc-list" id="ntc-asks">${asks.map(askRow).join('')}</div>`);
  const reqs = groupReqs();
  if (reqs.length) {
    parts.push(`<div class="group-title">Заявки в ваши группы</div><div class="panel" id="ntc-groups">${reqs.map((g) => `<button class="row" data-act="grp-open" data-id="${esc(g.id)}">
      <span class="grp-pic" aria-hidden="true">${picSvg(g.pic, { size: 40 })}</span><div class="grow"><div class="t1">${esc(g.name)}</div>
      <div class="t2">Хотят вступить: ${g.requests.length}</div></div>${small(I.right, 18)}</button>`).join('')}</div>`);
  }
  if (ideas.length) parts.push(`<div class="group-title">Ответы на ваши идеи</div><div class="panel" id="ntc-ideas">${ideas.map(ideaRow).join('')}</div>`);
  if (isAdmin()) {
    parts.push(`<div class="group-title">Для администратора</div><div class="panel"><button class="row" data-act="ntc-admin" id="ntc-admin"><span class="ico" style="--c:var(--warn)">${I.idea}</span>
      <div class="grow"><div class="t1">Идеи пользователей</div><div class="t2">${adm ? `Новых: ${adm}` : 'Новых нет'}</div></div>${small(I.right, 18)}</button></div>`);
  }
  if (!asks.length && !ideas.length && !reqs.length) parts.unshift(`<div class="empty ntc-empty"><div class="em-ico">${I.bell}</div><b>Пока уведомлений нет</b><p>Здесь появятся просьбы коллегов показать статус и ответы на ваши идеи.</p></div>`);
  parts.push('<p class="hint ntc-hint">Телефон не звонит: уведомления видны, когда вы открываете CABINA.</p>');
  return `${head}<div id="ntc-page">${parts.join('')}</div>`;
}

// Открыли «Уведомления»: ответы на идеи запоминаем для показа и сразу отмечаем прочитанными
export function noticesEnter() {
  N.shown = ideasUnseen();
  const mine = N.shown;
  loadIdeas({ force: true }).then(async () => {
    if (N.shown !== mine) return;                      // за это время ушли с экрана и вернулись
    const fresh = ideasUnseen();
    if (!fresh.length) return;
    N.shown = [...new Map([...mine, ...fresh].map((x) => [x.id, x])).values()];
    await markIdeasSeen();
    rerender();
  });
  if (mine.length) markIdeasSeen().then(() => rerender());
}

export async function noticesClick(act, b) {
  if (!act.startsWith('ntc-')) return false;
  const id = String(b.dataset.id || '').toLowerCase();
  if (act === 'ntc-on') { openColleague(id, { ask: true }); return true; }
  if (act === 'ntc-later') { await answerAsk(id, false); return true; }
  if (act === 'ntc-mute') { await answerAsk(id, true); return true; }
  if (act === 'ntc-admin') { await openAdminIdeas(() => rerender()); return true; }
  return false;
}
