// «Обучение» (2.23.0): урок на весь экран. Вопросы по одному: выбрать ответ или ввести самому → «Проверить» →
// «Верно» / «Неверно» с правильным ответом, объяснением (если есть) и пунктом документа с цитатой. Ошибка уходит в конец урока
// и повторяется, пока не будет верного ответа. Время считается, только пока урок на экране.
// Ничего не хранит и не отправляет: итог урока передаётся в finish(), прогресс сохраняет learn.js.
import { I, esc, small, openLayer, closeLayer, confirmDialog, plural } from './ui.js';
import * as L from './learn-state.js';

const OK_WORDS = ['Верно!', 'Правильно!', 'Точно!'];
// Цитата из документа после ответа раскрыта; свернул её — следующие показываем свёрнутыми (только удобство этого телефона)
const QUOTE_KEY = 'cabina-learn-quote';
const quoteOpen = () => { try { return localStorage.getItem(QUOTE_KEY) !== '0'; } catch { return true; } };
const rememberQuote = (open) => { try { localStorage.setItem(QUOTE_KEY, open ? '1' : '0'); } catch { /* хранилище недоступно — не страшно */ } };
const flame = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21.2c-3.9 0-6.6-2.7-6.6-6.3 0-3.4 2.4-5.4 3.7-7.8.5 1.7 1.4 2.8 2.5 3.4-.2-3 .9-5.8 3.4-8.1.2 3.5 1.7 5.5 3.2 7.4 1 1.4 1.6 3 1.6 5.1 0 3.6-3.2 6.3-7.8 6.3z" fill="currentColor" fill-opacity=".2"/></svg>';
const snow = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2"/></svg>';
// Картинка в конце урока: поезд прибывает к платформе (рисуем сами)
const ARRIVE = `<svg class="lp-scene" viewBox="0 0 320 120" aria-hidden="true">
  <path class="lp-sc-wire" d="M0 27h320"/><path class="lp-sc-mast" d="M300 92V18M290 22h16"/>
  <path class="lp-sc-plat" d="M30 72h270v26H30z"/><path class="lp-sc-edge" d="M30 72h270"/>
  <path class="lp-sc-post" d="M232 72V52M268 72V52"/><rect class="lp-sc-sign" x="220" y="36" width="60" height="18" rx="3"/>
  <path class="lp-sc-signline" d="M230 45h40"/>
  <path class="lp-sc-ballast" d="M0 100h320v10H0z"/>
  <path class="lp-sc-sleep" d="M0 104h320"/>
  <path class="lp-sc-rail" d="M0 99.5h320"/>
  <g class="lp-sc-train">
    <path class="lp-sc-panto" d="M40 50 52 39 42 27.5M34 27.5h16M80 50 92 39 82 27.5M74 27.5h16"/>
    <rect class="lp-sc-car" x="-6" y="50" width="96" height="38" rx="6"/>
    <path class="lp-sc-win" d="M6 58h16v12H6zM30 58h16v12H30zM54 58h16v12H54z"/>
    <path class="lp-sc-cab" d="M96 50h44c10 0 18 8 18 18v20H96z"/>
    <path class="lp-sc-win" d="M120 58h18c4 0 8 4 8 8v4h-26z"/>
    <path class="lp-sc-stripe" d="M-6 80h164"/>
    <circle class="lp-sc-lamp" cx="150" cy="80" r="3.5"/>
    <circle class="lp-sc-wheel" cx="20" cy="92" r="6"/><circle class="lp-sc-wheel" cx="66" cy="92" r="6"/><circle class="lp-sc-wheel" cx="112" cy="92" r="6"/><circle class="lp-sc-wheel" cx="140" cy="92" r="6"/>
  </g>
</svg>`;

// questions — вопросы урока (из файла модуля), finish(r) → news из completeLesson, onClose(пройден ли урок)
export function playLesson({ title, kicker, questions, finish, onClose }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  let run = L.newRun(questions.map((q) => q.id));
  let phase = 'q'; // 'q' — отвечаем, 'fb' — разбор ответа, 'busy' — сохраняем, 'end' — итог
  let pick = null; // номер выбранного варианта в вопросе
  let order = []; // порядок показа вариантов
  let done = false;

  // время — только пока урок виден (свернули приложение — часы стоят)
  let acc = 0;
  let shown = document.visibilityState !== 'hidden';
  let t0 = performance.now();
  const onVis = () => {
    const now = performance.now();
    if (document.visibilityState === 'hidden') { if (shown) { acc += now - t0; shown = false; } } else if (!shown) { t0 = now; shown = true; }
  };
  const elapsed = () => acc + (shown ? performance.now() - t0 : 0);
  document.addEventListener('visibilitychange', onVis);

  const el = openLayer(`<section class="lp" role="dialog" aria-modal="true" aria-label="Урок: ${esc(title)}">
      <header class="lp-head"><button class="icon-btn lp-x" data-lp="quit" aria-label="Выйти из урока">${I.x}</button>
        <div class="lp-bar" role="progressbar" aria-label="Пройдено вопросов" aria-valuemin="0" aria-valuemax="${run.ids.length}" aria-valuenow="0"><i></i></div></header>
      <div class="lp-main" id="lp-main"></div>
      <footer class="lp-foot" id="lp-foot"></footer>
    </section>`, { kind: 'full', onClose: cleanup, onBack: () => { quit(); return false; } });
  const main = el.querySelector('#lp-main');
  const foot = el.querySelector('#lp-foot');
  const bar = el.querySelector('.lp-bar');

  // клавиатура на телефоне: урок занимает только видимую часть экрана, кнопка не прячется под клавиатуру
  const vv = window.visualViewport;
  const fit = () => { if (!vv) return; el.style.setProperty('--vvh', `${Math.round(vv.height)}px`); el.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`); };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  function cleanup() {
    document.removeEventListener('visibilitychange', onVis);
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    onClose?.(done);
  }
  function setBar() {
    bar.querySelector('i').style.width = `${(L.runProgress(run) * 100).toFixed(1)}%`;
    bar.setAttribute('aria-valuenow', String(run.correct));
  }
  const q = () => byId.get(L.runCurrent(run));
  const optHtml = (cur) => `<div class="lp-opts" role="group" aria-label="Варианты ответа">${order.map((i, k) => `<button class="lp-opt" data-lp="opt" data-i="${i}" aria-pressed="false">
      <span class="lp-opt-n num" aria-hidden="true">${k + 1}</span><span class="lp-opt-t">${esc(cur.options[i])}</span></button>`).join('')}</div>`;
  // unit — подпись после поля («км/ч», «мм», «°»): человек вписывает только число
  const inputHtml = (cur) => {
    const num = typeof cur.answer === 'number';
    return `<label class="lp-in-l" for="lp-input">${esc(cur.prompt || (num ? 'Введите число' : 'Введите ответ'))}</label>
      <div class="lp-in-w"><input class="input lp-input" id="lp-input" type="text" ${num ? `inputmode="${Number.isInteger(cur.answer) ? 'numeric' : 'decimal'}"` : ''}${cur.unit ? ' aria-describedby="lp-unit"' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" maxlength="60">${cur.unit ? `<span class="lp-unit" id="lp-unit">${esc(cur.unit)}</span>` : ''}</div>`;
  };
  function show() {
    const cur = q();
    phase = 'q';
    pick = null;
    const n = cur.type === 'choice' ? cur.options.length : 0;
    order = cur.fixed ? Array.from({ length: n }, (_, i) => i) : L.shuffleOrder(n);
    const again = L.runRepeat(run);
    main.innerHTML = `<div class="lp-card lp-in">
      <div class="lp-kicker">${again ? `<span class="lp-again">${small(I.refresh, 14)} Повтор ошибки</span>` : esc(kicker)}</div>
      <h2 class="lp-q">${esc(cur.text)}</h2>
      ${cur.type === 'choice' ? optHtml(cur) : inputHtml(cur)}</div>`;
    foot.className = 'lp-foot';
    foot.innerHTML = `<button class="btn btn-primary lp-go" data-lp="check" disabled>Проверить</button>`;
    main.scrollTop = 0;
    const inp = main.querySelector('#lp-input');
    if (inp) {
      inp.addEventListener('input', () => { foot.querySelector('[data-lp=check]').disabled = !inp.value.trim(); });
      setTimeout(() => inp.focus(), 260);
    }
  }
  function check() {
    if (phase !== 'q') return;
    const cur = q();
    let ok = false;
    let typo = false;
    if (cur.type === 'choice') {
      if (pick == null) return;
      ok = L.checkChoice(cur, pick);
      main.querySelectorAll('.lp-opt').forEach((b) => {
        const i = +b.dataset.i;
        b.disabled = true;
        if (i === cur.answer) b.classList.add('is-ok');
        else if (i === pick) b.classList.add('is-bad');
        else b.classList.add('is-off');
      });
    } else {
      const inp = main.querySelector('#lp-input');
      if (!inp.value.trim()) return;
      ({ ok, typo } = L.checkInput(cur, inp.value));
      inp.readOnly = true;
      inp.classList.add(ok ? 'is-ok' : 'is-bad');
      inp.blur();
    }
    run = L.answerRun(run, ok);
    phase = 'fb';
    setBar();
    if (ok) { bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash'); }
    const right = cur.type === 'choice' ? cur.options[cur.answer] : `${cur.answer}${!cur.unit ? '' : cur.unit === '°' ? '°' : ` ${cur.unit}`}`;
    // «Где написано»: пункт документа виден всегда (просьба Никиты), цитата под ним — раскрыта, пока человек её не свернёт
    const src = L.srcLabel(cur.src?.ref);
    const quote = src ? `<details class="lp-src"${quoteOpen() ? ' open' : ''}>
        <summary><span class="lp-src-ico">${small(I.file, 20)}</span><span class="lp-src-t"><small>Где написано</small><b>${esc(src.title)}</b>${src.doc ? `<span>${esc(src.doc)}</span>` : ''}</span><span class="lp-src-chev" aria-hidden="true">${small(I.down, 18)}</span></summary>
        ${cur.src.quote ? `<blockquote>«${esc(cur.src.quote)}»</blockquote>` : ''}</details>` : '';
    foot.className = `lp-foot ${ok ? 'ok' : 'bad'}`;
    foot.innerHTML = `<div class="lp-fb" role="status">
        <div class="lp-fb-h"><span class="lp-fb-ico">${ok ? small(I.check, 20) : small(I.x, 20)}</span><b>${ok ? OK_WORDS[run.answers.length % OK_WORDS.length] : 'Неверно'}</b></div>
        ${!ok ? `<div class="lp-fb-a">Правильный ответ: <b>${esc(right)}</b></div>${L.runDone(run) ? '' : '<div class="lp-fb-later">Этот вопрос повторится в конце урока.</div>'}`
          : typo ? `<div class="lp-fb-a">Есть опечатка, правильно: <b>${esc(right)}</b></div>` : ''}
        ${cur.explain ? `<p class="lp-fb-x">${esc(cur.explain)}</p>` : ''}${quote}
      </div>
      <button class="btn lp-go ${ok ? 'lp-go-ok' : 'lp-go-bad'}" data-lp="next">${L.runDone(run) ? 'Завершить урок' : 'Дальше'}</button>`;
    foot.querySelector('.lp-src')?.addEventListener('toggle', (e) => rememberQuote(e.currentTarget.open));
    setTimeout(() => foot.querySelector('[data-lp=next]')?.focus({ preventScroll: true }), 60);
  }
  async function next() {
    if (phase !== 'fb') return;
    if (!L.runDone(run)) { show(); return; }
    phase = 'busy';
    const sec = Math.max(1, Math.round(elapsed() / 1000));
    document.removeEventListener('visibilitychange', onVis);
    let news = null;
    try { news = await finish({ sec, total: run.ids.length, firstOk: run.firstOk, answers: run.answers }); } catch (e) { console.error(e); }
    done = !!news;
    end(news, sec);
  }
  function end(news, sec) {
    phase = 'end';
    bar.querySelector('i').style.width = '100%';
    const total = run.ids.length;
    const lines = [];
    if (news?.restored) lines.push(`<li class="lp-li-fire">${flame}<span>Серия вернулась: ${news.streak} ${plural(news.streak, 'день', 'дня', 'дней')}!</span></li>`);
    if (news?.topicDone) lines.push(`<li class="lp-li-ok">${small(I.check, 20)}<span>Тема «${esc(title)}» пройдена</span></li>`);
    if (news?.freezesGot) lines.push(`<li class="lp-li-ice">${snow}<span>+${news.freezesGot} ${plural(news.freezesGot, 'заморозка', 'заморозки', 'заморозок')} за серию. В запасе: ${news.freezes}</span></li>`);
    const streak = news ? `<div class="lp-streak${news.extended ? ' up' : ''}"><span class="lp-streak-ico">${flame}</span><b class="num">${news.streak}</b><span>${plural(news.streak, 'день', 'дня', 'дней')} подряд</span>${news.extended ? '<em>+1</em>' : ''}</div>` : '';
    main.innerHTML = `<div class="lp-end lp-in">
      ${ARRIVE}
      <h2>Урок пройден!</h2>
      <p class="lp-end-sub">${esc(title)}</p>
      <div class="lp-stats">
        <div class="lp-stat"><small>Время</small><b class="num">${L.fmtSec(sec)}</b>${news?.record ? '<span class="lp-rec">Рекорд!</span>' : news && !news.first && news.best ? `<span>Лучшее ${L.fmtSec(news.best)}</span>` : ''}</div>
        <div class="lp-stat"><small>С первого раза</small><b class="num">${run.firstOk} из ${total}</b>${run.firstOk === total ? '<span class="lp-rec">Без ошибок</span>' : ''}</div>
      </div>
      ${streak}
      ${lines.length ? `<ul class="lp-news">${lines.join('')}</ul>` : ''}
      ${news ? '' : '<p class="hint warn">Не удалось сохранить прогресс в телефоне. Попробуйте пройти урок ещё раз.</p>'}
    </div>`;
    foot.className = 'lp-foot';
    foot.innerHTML = `<button class="btn btn-primary lp-go" data-lp="close">Дальше</button>`;
    setTimeout(() => foot.querySelector('[data-lp=close]')?.focus({ preventScroll: true }), 60);
  }
  async function quit() {
    if (phase === 'end' || !run.answers.length) { closeLayer(el); return; }
    if (phase === 'busy') return;
    const ok = await confirmDialog({ title: 'Выйти из урока?', text: 'Ответы этого урока не сохранятся. Урок можно пройти заново в любое время.', ok: 'Выйти', cancel: 'Продолжить' });
    if (ok && document.body.contains(el)) closeLayer(el);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lp]');
    if (!b || !el.contains(b)) return;
    const a = b.dataset.lp;
    if (a === 'quit') quit();
    else if (a === 'opt' && phase === 'q') {
      pick = +b.dataset.i;
      main.querySelectorAll('.lp-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      foot.querySelector('[data-lp=check]').disabled = false;
    } else if (a === 'check') check();
    else if (a === 'next') next();
    else if (a === 'close') closeLayer(el);
  });
  // клавиатура: 1–4 — вариант, Enter — проверить / дальше
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.target.closest('summary')) {
      if (phase === 'q' && !foot.querySelector('[data-lp=check]')?.disabled) { e.preventDefault(); check(); }
      else if (phase === 'fb' && e.target.tagName !== 'BUTTON') { e.preventDefault(); next(); }
      return;
    }
    if (phase === 'q' && /^[1-4]$/.test(e.key) && e.target.tagName !== 'INPUT') main.querySelectorAll('.lp-opt')[+e.key - 1]?.click();
  });
  show();
  return el;
}
