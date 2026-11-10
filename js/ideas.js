// «Идеи для CABINA» (2.20, просьба Никиты): человек с аккаунтом отправляет идею, видит ответ («принята» / «не подошла»),
// за принятые — награда «Идейный». Идею видят только автор и администратор; это не переписка между людьми.
// На сервере — текст до 500 знаков, дата и ответ. Стереть свою идею можно в любой момент.
// С 2.21 (просьба Никиты) — галочка «Можно ответить мне на почту» у каждой идеи (по умолчанию снята): только у таких
// идей администратор видит почту автора (миграция 0006). Без галочки — как раньше, без почты.
// Просим не писать имена, телефоны, номера поездов и служебную информацию (ДСП) — это предупреждение рядом с полем.
import { I, esc, small, pageHead, openLayer, closeLayer, sheet, toast, confirmDialog, dayMonth, layerCount } from './ui.js';
import { nowLocal } from './store.js';
import { dateKeyOf } from './calc.js';
import { legalReady } from './legal.js';
import { session, rpc, restGet, errorText } from './auth.js';
import { countOf, noteCount, awardSnapshot, awardNews, celebrate } from './awards.js';
import { ensureConsent, tzOffset, cleanText } from './colleagues.js';

export const IDEA_MAX = 500;
export const IDEAS_PER_DAY = 5;
export const NOTE_MAX = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = { new: 'На рассмотрении', accepted: 'Принята', declined: 'Не подошла' };
const when = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

// Идеи с сервера — непроверенное: известные состояния, текст через cleanText (без служебных символов) и esc() при выводе
export function cleanIdeas(rows) {
  return (Array.isArray(rows) ? rows : []).filter((x) => x && UUID.test(String(x.id)) && Object.hasOwn(STATES, x.state))
    .map((x) => ({ id: String(x.id).toLowerCase(), body: cleanText(x.body, IDEA_MAX), state: x.state, created: when(x.created_at), answered: when(x.answered_at),
      reply: x.reply_ok === true, email: cleanEmail(x.email),
      // комментарий администратора (2.28) и «ответ ещё не открыт автором» (seen_at пусто); сервер без шага 10 их не отдаёт
      note: cleanText(x.admin_note ?? x.note, NOTE_MAX), unseen: x.seen_at === null && x.state !== 'new' }))
    .filter((x) => x.body).slice(0, 200);
}
// Почта автора (только у администратора и только у идей с галочкой): простая проверка вида, иначе — нет почты
export function cleanEmail(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length <= 254 && /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(s) ? s : '';
}
// Что отправим: без лишних пробелов и служебных символов (сервер чистит так же)
export const ideaText = (v) => cleanText(v, IDEA_MAX);

const D = { sub: null, list: null, at: 0, err: '', loading: null, busy: false, draft: '', reply: false };
let rerender = () => {};
export function initIdeas(h) { rerender = h.rerender || rerender; }

const notReady = (r) => r && (r.status === 404 || /^(PGRST20\d|42883|42P01|42703)$/.test(String(r.data?.code || '')));
const msgOf = (r) => String(r?.data?.message || '');
const OFFLINE = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const SERVER_OFF = '«Идеи» на сервере ещё не включены. Попробуйте позже.';
export function ideaError(r) {
  if (!r) return OFFLINE;
  if (notReady(r)) return SERVER_OFF;
  const m = msgOf(r);
  if (/cabina: limit/.test(m)) return `На сегодня идей достаточно: не больше ${IDEAS_PER_DAY} в день. Завтра можно ещё.`;
  if (/cabina: empty/.test(m)) return 'Напишите идею хотя бы в несколько слов.';
  if (/consent required/.test(m)) return 'Сначала примите новую редакцию согласия.';
  return errorText(r);
}

async function noteAccepted(list) {
  const n = list.filter((x) => x.state === 'accepted').length;
  const before = awardSnapshot();
  if (await noteCount('ideas', n, dateKeyOf(nowLocal()))) {
    const news = awardNews(before);
    // с 2.28 ответы подтягиваются и при запуске — окно может быть уже занято другим (например, «Свой человек»): ждём, пока освободится
    if (news) { let tries = 0; const show = () => { if (!layerCount()) celebrate(news); else if (++tries < 40) setTimeout(show, 1000); }; setTimeout(show, 600); }
  }
}

export function loadIdeas({ force = false } = {}) {
  const s = session();
  if (!s || !legalReady()) return Promise.resolve(null);
  if (D.sub !== s.sub) Object.assign(D, { sub: s.sub, list: null, at: 0, err: '' });
  if (D.loading) return D.loading;
  if (!force && D.list && Date.now() - D.at < 30e3) return Promise.resolve(D.list);
  if (!force && D.err && Date.now() - D.at < 60e3) return Promise.resolve(D.list); // не получилось — не долбим сервер на каждой перерисовке
  const sub = D.sub;
  D.loading = (async () => {
    // reply_ok — с сервера 2.21; на старом сервере его нет (42703) — читаем без него
    // admin_note и seen_at — с сервера 2.28 (шаг 10); без них — как раньше
    const q = 'order=created_at.desc&limit=200';
    const bad = (x) => x && !x.ok && String(x.data?.code || '') === '42703';
    let r = await restGet(`ideas?select=id,body,state,created_at,answered_at,reply_ok,admin_note,seen_at&${q}`);
    if (bad(r)) r = await restGet(`ideas?select=id,body,state,created_at,answered_at,reply_ok&${q}`);
    if (bad(r)) r = await restGet(`ideas?select=id,body,state,created_at,answered_at&${q}`);
    if (session()?.sub !== sub) return null;
    if (!r?.ok) { D.err = !r ? 'offline' : notReady(r) ? 'server' : 'error'; D.at = Date.now(); return D.list; }
    D.list = cleanIdeas(r.data); D.at = Date.now(); D.err = '';
    await noteAccepted(D.list);
    return D.list;
  })().finally(() => { D.loading = null; });
  return D.loading.then((l) => { if (!layerCount()) rerender(); return l; });
}

const wall = (abs) => abs + tzOffset();
function ideaRow(x) {
  const meta = [x.created != null ? dayMonth(wall(x.created)) : '', STATES[x.state], x.reply ? 'можно ответить на почту' : ''].filter(Boolean).join(' · ');
  return `<div class="idea st-${x.state}" data-id="${esc(x.id)}"><div class="grow"><div class="idea-body">${esc(x.body)}</div>
      <div class="t2 idea-meta">${x.state === 'accepted' ? small(I.check, 14) : ''}${esc(meta)}</div>
      ${x.note ? `<div class="idea-note"><b>Ответ:</b> ${esc(x.note)}</div>` : ''}</div>
    <button class="icon-btn idea-del" data-act="idea-del" data-id="${esc(x.id)}" aria-label="Стереть идею">${small(I.trash, 18)}</button></div>`;
}

export function renderIdeas() {
  const head = pageHead('Предложить идею', { back: true });
  const intro = '<p class="hint">Есть идея, как сделать CABINA удобнее? Напишите — каждую прочитаем и ответим: «принята» или «не подошла». За принятые идеи — награда «Идейный».</p>';
  if (!legalReady()) return `${head}<p class="hint">Скоро здесь можно будет предложить идею.</p>`;
  if (!session()) {
    return `${head}${intro}
      <div class="notice ok">${I.shield}<div><b>Идеи — с аккаунтом.</b> Так мы сможем ответить именно вам. Записи из телефона при этом никуда не уходят.</div></div>
      <button class="btn btn-primary" data-act="go" data-page="account">Настройки аккаунта</button>`;
  }
  if (!D.list && !D.loading && !(D.err && Date.now() - D.at < 30e3)) loadIdeas({ force: true });
  const n = D.draft.length;
  const accepted = Math.max(countOf('ideas').n, (D.list || []).filter((x) => x.state === 'accepted').length);
  return `${head}${intro}
    <div class="idea-form">
      <textarea class="input idea-text" id="idea-text" aria-label="Ваша идея" rows="5" maxlength="${IDEA_MAX}" placeholder="Например: напоминание за час до конца отдыха">${esc(D.draft)}</textarea>
      <div class="idea-count hint" id="idea-count" aria-live="polite">${n} / ${IDEA_MAX}</div>
    </div>
    <div class="acc-consent idea-reply"><input type="checkbox" id="idea-reply"${D.reply ? ' checked' : ''}><label for="idea-reply">Можно ответить мне на почту<span class="hint">Разработчик увидит вашу почту только у этой идеи</span></label></div>
    <div class="notice">${I.alert}<div>Не пишите имена, телефоны, номера поездов и служебную информацию. Идею читает только разработчик — без вашей почты, если не отметите «Можно ответить».</div></div>
    <button class="btn btn-primary" data-act="idea-send" id="idea-send">${small(I.idea, 18)} Отправить</button>
    <div class="hint">Не больше ${IDEAS_PER_DAY} идей в день.${accepted ? ` Принято ваших идей: ${accepted}.` : ''}</div>
    ${D.list && D.list.length ? `<div class="group-title">Мои идеи <span class="hint">${D.list.length}</span></div><div class="panel idea-list" id="idea-list">${D.list.map(ideaRow).join('')}</div>`
      : !D.list ? `<div class="hint" id="idea-load">${D.err ? esc(D.err === 'server' ? SERVER_OFF : D.err === 'offline' ? OFFLINE : 'Не удалось загрузить идеи. Попробуйте позже.') : 'Загружаем ваши идеи…'}</div>` : ''}`;
}

// Набор текста: счётчик и черновик (черновик — только в памяти, до закрытия приложения)
export function ideasInput(t) {
  if (t.id === 'idea-reply') { D.reply = t.checked === true; return true; }
  if (t.id !== 'idea-text') return false;
  D.draft = t.value.slice(0, IDEA_MAX);
  const c = document.getElementById('idea-count');
  if (c) c.textContent = `${D.draft.length} / ${IDEA_MAX}`;
  return true;
}

async function send() {
  const box = document.getElementById('idea-text');
  const text = ideaText(box ? box.value : D.draft);
  if (text.length < 3) { toast('Напишите идею хотя бы в несколько слов', { error: true }); box?.focus(); return; }
  const tick = document.getElementById('idea-reply');
  const reply = tick ? tick.checked === true : D.reply;
  // без галочки — как раньше, одним текстом (работает и со старым сервером)
  const args = reply ? { p_body: text, p_reply: true } : { p_body: text };
  let r = await rpc('send_idea', args);
  if (r && !r.ok && /consent required/.test(msgOf(r))) {
    if (!(await ensureConsent())) return;
    r = await rpc('send_idea', args);
  }
  if (!r?.ok) { toast(ideaError(r), { error: true, ms: 6000 }); return; }
  D.draft = ''; D.reply = false;
  toast('Спасибо! Идея отправлена');
  await loadIdeas({ force: true });
}

// Готовый текст — как идея (2.23.0: «Сообщить об ошибке» в уроке «Обучения»): тот же сервер, лимит в день и согласие.
// Сообщение потом видно в «Предложить идею» — там его можно стереть. → { ok, msg } (msg пустой — человек сам отказался)
export async function sendIdea(text) {
  const body = ideaText(text);
  if (body.length < 3) return { ok: false, msg: 'Напишите хотя бы несколько слов' };
  let r = await rpc('send_idea', { p_body: body });
  if (r && !r.ok && /consent required/.test(msgOf(r))) {
    if (!(await ensureConsent())) return { ok: false, msg: '' };
    r = await rpc('send_idea', { p_body: body });
  }
  if (!r?.ok) return { ok: false, msg: ideaError(r) };
  D.at = 0; // список «Мои идеи» обновится при следующем открытии
  return { ok: true };
}

export async function ideasClick(act, b) {
  if (act !== 'idea-send' && act !== 'idea-del') return false;
  if (D.busy) return true;
  D.busy = true;
  try {
    if (act === 'idea-send') await send();
    else {
      const id = String(b.dataset.id || '').toLowerCase();
      if (!UUID.test(id)) return true;
      const ok = await confirmDialog({ title: 'Стереть идею?', text: 'Она удалится с сервера. Награду за принятую идею это не отменит.', ok: 'Стереть' });
      if (!ok) return true;
      const r = await rpc('delete_idea', { p_id: id });
      if (!r?.ok) { toast(ideaError(r), { error: true, ms: 5000 }); return true; }
      toast('Идея стёрта');
      await loadIdeas({ force: true });
    }
  } finally { D.busy = false; }
  return true;
}

// ---------------------------------------------------------------- для администратора (Настройки аккаунта)
// Без id автора; почта — только у идей, где автор отметил «Можно ответить мне на почту»
// Новые идеи для колокольчика администратора: число считаем раз в минуту, пока открыт «Профиль» или «Уведомления»
const AD = { sub: null, n: null, at: 0, loading: null };
export const adminNewIdeas = () => AD.n || 0;
export function checkAdminIdeas({ force = false } = {}) {
  const s = session();
  if (!s || !legalReady()) return Promise.resolve(null);
  if (AD.sub !== s.sub) Object.assign(AD, { sub: s.sub, n: null, at: 0 });
  if (AD.loading) return AD.loading;
  if (!force && Date.now() - AD.at < 60e3) return Promise.resolve(AD.n);
  const sub = AD.sub;
  AD.loading = (async () => {
    const r = await rpc('admin_ideas');
    if (session()?.sub !== sub) return null;
    AD.at = Date.now();
    const before = AD.n;
    AD.n = r?.ok ? cleanIdeas(r.data).filter((x) => x.state === 'new').length : null;
    return before !== AD.n;
  })().finally(() => { AD.loading = null; });
  return AD.loading.then((changed) => { if (changed && !layerCount()) rerender(); return AD.n; });
}

// Мои идеи, на которые ответили, но я ещё не открывал уведомления (2.28); открыл — отмечаем прочитанными
export const ideasUnseen = () => (D.list || []).filter((x) => x.unseen);
let seenBusy = null;   // два вызова подряд (открыли экран и пришёл свежий список) шлют на сервер один запрос
export function markIdeasSeen() {
  if (!session() || !ideasUnseen().length) return Promise.resolve();
  if (seenBusy) return seenBusy;
  seenBusy = (async () => {
    try {
      const r = await rpc('mark_ideas_seen');
      if (r?.ok) D.list = D.list.map((x) => (x.unseen ? { ...x, unseen: false } : x));
    } finally { seenBusy = null; }
  })();
  return seenBusy;
}

// Комментарий администратора к идее: до 300 знаков, увидит только автор идеи
function commentSheet(x) {
  return new Promise((resolve) => {
    let result;
    const el = openLayer(sheet({ title: 'Комментарий к идее', body: `<div class="idea-quote">${esc(x.body)}</div>
      <div class="pay-field"><label for="idea-note">Ваш комментарий автору</label>
        <textarea class="input idea-text" id="idea-note" rows="4" maxlength="${NOTE_MAX}" placeholder="Например: сделали в 2.28, спасибо!">${esc(x.note || '')}</textarea>
        <div class="hint">До ${NOTE_MAX} знаков. Увидит только автор идеи, в колокольчике. Ответить комментарием он не сможет. Не пишите чужие данные. Пустое поле — стереть комментарий.</div></div>`,
    foot: '<button class="btn btn-primary" data-act="idea-note-ok">Сохранить</button>' }), { onClose: () => resolve(result) });
    el.querySelector('[data-act="idea-note-ok"]').addEventListener('click', () => {
      result = cleanText(el.querySelector('#idea-note').value, NOTE_MAX);
      closeLayer(el);
    });
  });
}

export async function openAdminIdeas(onClose) {
  const r = await rpc('admin_ideas');
  if (!r?.ok) { toast(ideaError(r), { error: true, ms: 5000 }); return; }
  let list = cleanIdeas(r.data);
  const fresh = () => list.filter((x) => x.state === 'new').length;
  AD.n = fresh(); AD.at = Date.now();
  const rowHtml = (x) => `<div class="idea st-${x.state}" data-id="${esc(x.id)}"><div class="grow"><div class="idea-body">${esc(x.body)}</div>
      <div class="t2 idea-meta">${esc([x.created != null ? dayMonth(wall(x.created)) : '', STATES[x.state]].filter(Boolean).join(' · '))}</div>
      ${x.email ? `<div class="t2 idea-mail">${small(I.mail, 14)} Можно ответить: <b class="sel">${esc(x.email)}</b></div>` : ''}
      ${x.note ? `<div class="idea-note"><b>Ваш комментарий:</b> ${esc(x.note)}</div>` : ''}
      <div class="idea-ans">${x.state === 'new' ? `<button class="btn btn-primary btn-sm" data-ans="1" data-id="${esc(x.id)}">Принять</button><button class="btn btn-plain btn-sm" data-ans="0" data-id="${esc(x.id)}">Не подошла</button>` : ''}
        <button class="btn btn-plain btn-sm" data-cm="1" data-id="${esc(x.id)}">${x.note ? 'Изменить комментарий' : 'Комментарий'}</button></div></div></div>`;
  const body = () => (list.length ? `<div class="hint">Новых: ${fresh()}. Почта автора видна, только если он сам отметил «Можно ответить мне на почту».</div><div class="panel idea-list">${list.map(rowHtml).join('')}</div>`
    : '<div class="hint">Идей пока нет.</div>');
  const el = openLayer(sheet({ title: 'Идеи пользователей', tall: true, body: `<div id="adm-ideas">${body()}</div>` }), { onClose });
  let busy = false;
  el.addEventListener('click', async (e) => {
    const cm = e.target.closest('[data-cm]');
    const b = cm || e.target.closest('[data-ans]');
    if (!b || busy) return;
    const id = String(b.dataset.id || '').toLowerCase();
    if (!UUID.test(id)) return;
    busy = true;
    try {
      if (cm) {
        const idea = list.find((x) => x.id === id);
        const note = idea ? await commentSheet(idea) : undefined;
        if (note === undefined) return;
        const a = await rpc('admin_answer_idea', { p_id: id, p_note: note });
        if (!a?.ok) { toast(ideaError(a), { error: true, ms: 5000 }); return; }
        list = list.map((x) => (x.id === id ? { ...x, note } : x));
        toast(note ? 'Комментарий сохранён' : 'Комментарий стёрт');
      } else {
        const a = await rpc('admin_answer_idea', { p_id: id, p_accept: b.dataset.ans === '1' });
        if (!a?.ok) { toast(ideaError(a), { error: true, ms: 5000 }); return; }
        list = list.map((x) => (x.id === id ? { ...x, state: b.dataset.ans === '1' ? 'accepted' : 'declined', answered: Date.now() } : x));
        toast(b.dataset.ans === '1' ? 'Идея принята' : 'Ответ отправлен');
      }
      AD.n = fresh();
      el.querySelector('#adm-ideas').innerHTML = body();
    } finally { busy = false; }
  });
  return el;
}

// Строки-входы: «Ещё» и Настройки → «О приложении»
export const ideasRowHtml = (id) => `<button class="row" data-act="go" data-page="ideas" id="${id}"><span class="ico" style="--c:var(--warn)">${I.idea}</span>
  <div class="grow"><div class="t1">Предложить идею</div><div class="t2">Как сделать CABINA удобнее — ответим каждому</div></div>${small(I.right, 18)}</button>`;
