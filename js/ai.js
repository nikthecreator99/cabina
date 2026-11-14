// CABINA AI (2.34, решения Никиты 14.11.2026): справочный помощник по открытым документам — Трудовой кодекс, приказ № 339
// о режиме работы бригад, колдоговор ОАО «РЖД», Положение о дисциплине, ПТЭ. Нейросеть (YandexGPT, через наш сервер)
// отвечает только по найденным пунктам и показывает их; нет ответа в документах — так и говорит.
//
// Где: «Ещё», в самом верху, крупная плашка (aiCardHtml); экран вопросов — страница 'ai'.
// Кто видит: этап 2 — только администратор (premiumOk). Перед открытием всем (этап 4) — уведомление в Роскомнадзор,
// новая редакция согласия, и только потом показывать плашку всем с аккаунтом.
// Данные: на сервер уходит только текст вопроса (сервер вырезает телефоны, почту, длинные номера; Яндекс запрос не
// сохраняет). История вопросов — только в этом телефоне (localStorage, не в резервной копии), стирается при выходе.
import { I, esc, pageHead, small, toast } from './ui.js';
import { askAi, session } from './auth.js';
import { premiumOk } from './avatar-edit.js';

export const AI_Q_MAX = 500;
const HIST_KEY = 'cabina-ai-history';
const HIST_MAX = 20;
export const AI_EXAMPLES = ['Сколько дней отпуска?', 'Отдых после ночи'];
const ERRORS = {
  limit: 'На сегодня вопросы закончились. Завтра можно снова.',
  busy: 'Сегодня помощник уже ответил на очень много вопросов. Попробуйте завтра.',
  forbidden: 'CABINA AI пока открыт только для проверки.',
  auth: 'Вход устарел. Войдите в аккаунт заново.',
  bad_question: 'Напишите вопрос словами — от 3 до 500 знаков.',
  ai_off: 'Помощник ещё не подключён на сервере.',
};
const LOGO = '<img class="ai-logo" src="icons/ai-loco.webp" alt="" width="56" height="56" decoding="sync">';

let rerender = () => {};
export function initAi(h) { rerender = h.rerender || rerender; }

const S = { q: '', busy: false, cur: null, err: '', left: null };

export const aiVisible = () => !!session() && premiumOk();

// ---------------------------------------------------------------- история (только в телефоне)

export function cleanHistory(v) {
  if (!Array.isArray(v)) return [];
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
  return v.slice(0, HIST_MAX).map((h) => ({
    q: str(h?.q, AI_Q_MAX),
    a: h?.a == null ? null : str(h.a, 3000),
    at: Number.isFinite(h?.at) ? h.at : 0,
    sources: cleanSources(h?.sources),
  })).filter((h) => h.q);
}
export function cleanSources(v) {
  if (!Array.isArray(v)) return [];
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : '');
  return v.slice(0, 10).map((s) => ({
    n: Number.isInteger(s?.n) && s.n > 0 && s.n < 100 ? s.n : 0,
    title: str(s?.title, 200), edition: str(s?.edition, 100), ref: str(s?.ref, 200), quote: str(s?.quote, 1500),
    source: typeof s?.source === 'string' && /^https:\/\/[^\s"'<>]+$/.test(s.source) ? s.source.slice(0, 500) : '',
  })).filter((s) => s.n && s.title && s.ref);
}
function history() { try { return cleanHistory(JSON.parse(localStorage.getItem(HIST_KEY) || '[]')); } catch { return []; } }
function saveHistory(list) { try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX))); } catch {} }

// ---------------------------------------------------------------- вид

// Ответ: текст через esc(), ссылки [1] → кружки с номером источника
export function answerHtml(text) {
  return esc(text).replace(/\[(\d{1,2}(?:, \d{1,2})*)\]/g, (m, nums) => nums.split(', ').map((n) => `<sup class="ai-ref">${n}</sup>`).join(''))
    .replace(/\n+/g, '<br>');
}

function sourcesHtml(sources) {
  return `<div class="ai-srcs">${sources.map((s) => `<details class="ai-src">
    <summary><span class="ai-src-n">${s.n}</span><span class="ai-src-t"><b>${esc(s.title)}</b>, ${esc(s.ref)}<small>${esc(s.edition)}</small></span></summary>
    <blockquote class="ai-quote">${esc(s.quote)}</blockquote>
    ${s.source ? `<a class="ai-src-link" href="${esc(s.source)}" target="_blank" rel="noopener noreferrer">Открыть документ</a>` : ''}
  </details>`).join('')}</div>`;
}

const NOTE = 'Справочная информация, не юридическая консультация. Ответ составлен нейросетью — сверяйтесь с действующим документом.';

function resultHtml(r, cur = false) {
  if (!r) return '';
  const id = cur ? ' id="ai-ans"' : '';
  if (!r.a) return `<div class="ai-ans ai-none"${id}><div class="ai-q-echo">${esc(r.q)}</div>
    <p>В загруженных документах ответа на этот вопрос нет. Попробуйте спросить иначе — или уточните у нарядчика или в профкоме.</p></div>`;
  return `<div class="ai-ans"${id}><div class="ai-q-echo">${esc(r.q)}</div>
    <div class="ai-a">${answerHtml(r.a)}</div>
    ${sourcesHtml(r.sources)}
    <p class="ai-note">${NOTE}</p></div>`;
}

export function aiCardHtml() {
  if (!aiVisible()) return '';
  return `<button class="ai-card" id="extra-ai" data-act="go" data-page="ai" aria-label="CABINA AI: задать вопрос по документам">
    <span class="ai-top">${LOGO}<span class="ai-head"><span class="ai-k">CABINA AI</span><span class="ai-t">Спросите по документам</span></span></span>
    <span class="ai-s">Нейросеть отвечает на вопросы о работе: отпуск, отдых, переработка. Ищет ответ в Трудовом кодексе и колдоговоре и показывает пункт.</span>
    <span class="ai-ask"><span>Задать вопрос…</span><b class="ai-go">${small(I.right, 20)}</b></span>
    <span class="ai-chips">${AI_EXAMPLES.map((x) => `<i>${esc(x)}</i>`).join('')}</span>
  </button>`;
}

export function renderAi() {
  if (!aiVisible()) return `${pageHead('CABINA AI', { back: true })}<div class="notice">${I.alert}<div>CABINA AI пока открыт только для проверки.</div></div>`;
  const all = history();
  const hist = S.cur && all[0]?.at === S.cur.at && all[0]?.q === S.cur.q ? all.slice(1) : all; // текущий ответ — уже на экране
  return `${pageHead('CABINA AI', { back: true })}
    <div class="ai-intro">${LOGO}<p>Спросите о работе и отдыхе. Отвечаю только по документам и показываю пункт, откуда ответ.</p></div>
    <div class="ai-form">
      <textarea id="ai-q" class="input ai-input" aria-label="Ваш вопрос" rows="3" maxlength="${AI_Q_MAX}" placeholder="Например: сколько можно работать без отдыха?" enterkeyhint="send"${S.busy ? ' disabled' : ''}>${esc(S.q)}</textarea>
      <p class="hint ai-warn">Не пишите имена, телефоны, номера поездов и служебную информацию.</p>
      <button class="btn btn-primary" id="ai-send" data-act="ai-ask"${S.busy ? ' disabled aria-busy="true"' : ''}>${S.busy ? 'Ищу в документах…' : 'Спросить'}</button>
      ${S.left != null ? `<p class="hint" id="ai-left">Сегодня осталось вопросов: ${S.left}</p>` : ''}
    </div>
    ${!S.cur && !S.busy ? `<div class="ai-chips ai-chips-page">${AI_EXAMPLES.map((x) => `<button class="ai-pchip" data-act="ai-chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
    ${S.err ? `<div class="notice" id="ai-err" role="alert">${I.alert}<div>${esc(S.err)}</div></div>` : ''}
    <div aria-live="polite">${resultHtml(S.cur, true)}</div>
    ${hist.length ? `<div class="group-title ai-hist-t">Раньше спрашивали</div>
      <div class="ai-hist" id="ai-hist">${hist.map((h) => `<details class="ai-h"><summary>${esc(h.q)}</summary>${resultHtml(h)}</details>`).join('')}</div>
      <button class="btn btn-ghost" data-act="ai-clear" id="ai-clear">Стереть историю</button>` : ''}
    <p class="hint ai-docs">Документы: Трудовой кодекс РФ, приказ Минтранса № 339 о режиме работы и отдыха, коллективный договор ОАО «РЖД» 2026–2028, Положение о дисциплине работников ж/д транспорта, ПТЭ. Ответы только в справочных целях. Вопрос уходит на наш сервер и в Яндекс Облако (Россия) без вашего имени и почты и там не хранится. История — только в этом телефоне.</p>`;
}

// ---------------------------------------------------------------- действия

async function ask() {
  const q = S.q.replace(/\s+/g, ' ').trim();
  if (S.busy) return;
  if (q.length < 3) { S.err = ERRORS.bad_question; rerender(); return; }
  S.busy = true; S.err = ''; S.cur = null; rerender();
  const r = await askAi(q);
  S.busy = false;
  if (!r) { S.err = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'; rerender(); return; }
  if (!r.ok) { S.err = ERRORS[r.data?.error] || 'Помощник сейчас не может ответить. Попробуйте позже.'; rerender(); return; }
  const d = r.data || {};
  const item = { q, a: typeof d.answer === 'string' && d.answer ? d.answer.slice(0, 3000) : null, at: Date.now(), sources: cleanSources(d.sources) };
  if (item.a && !item.sources.length) item.a = null; // ответ без источника не показываем
  if (Number.isInteger(d.left)) S.left = Math.max(0, d.left);
  S.cur = item; S.q = '';
  saveHistory([item, ...history()]);
  rerender();
}

export function aiClick(act, b) {
  switch (act) {
    case 'ai-ask': ask(); return true;
    case 'ai-chip': S.q = b.dataset.q || ''; ask(); return true;
    case 'ai-clear': saveHistory([]); S.cur = null; toast('История стёрта'); rerender(); return true;
    default: return false;
  }
}
export function aiInput(t) {
  if (t.id !== 'ai-q') return false;
  S.q = t.value.slice(0, AI_Q_MAX);
  return true;
}
export function aiKey(e) {
  if (e.target?.id !== 'ai-q' || e.key !== 'Enter' || e.shiftKey) return false;
  e.preventDefault();
  ask();
  return true;
}
export function aiEnter() { S.err = ''; S.cur = null; }
