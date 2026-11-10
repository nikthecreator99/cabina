// «Обучение» (2.23.0; конец урока по макету Никиты — 2.24.0): урок на весь экран. Вопросы по одному: выбрать ответ или ввести
// самому → «Проверить» → «Верно» / «Неверно» с правильным ответом, объяснением (если есть) и пунктом документа с цитатой. Ошибка
// уходит в конец урока и повторяется, пока не будет верного ответа. Время считается, только пока урок на экране. В конце —
// «Урок завершён!»: опыт, точность, время, монеты и серия набегают от нуля; «Поделиться» (только название урока, точность и время)
// и «Забрать опыт».
// Ничего не хранит и не отправляет: итог урока передаётся в finish(), прогресс сохраняет learn.js.
// Под ответом — «Сообщить об ошибке» (onReport, окно и отправка — в learn.js) и, если вопрос не проверен экспертом
// (нет checked), пометка «Не проверен экспертом»: решение Никиты 06.11.2026 — уроки открыты и до такой проверки.
import { I, esc, small, openLayer, closeLayer, confirmDialog, plural, toast } from './ui.js';
import * as L from './learn-state.js';
import { ART, END_SCENE } from './learn-art.js';

const OK_WORDS = ['Верно!', 'Правильно!', 'Точно!'];
// Цитата из документа после ответа раскрыта; свернул её — следующие показываем свёрнутыми (только удобство этого телефона)
const QUOTE_KEY = 'cabina-learn-quote';
const quoteOpen = () => { try { return localStorage.getItem(QUOTE_KEY) !== '0'; } catch { return true; } };
const rememberQuote = (open) => { try { localStorage.setItem(QUOTE_KEY, open ? '1' : '0'); } catch { /* хранилище недоступно — не страшно */ } };
// Итоги урока набегают по очереди (просьба Никиты 10.11.2026): сначала опыт, дошёл — точность, дошла — время. Каждое [data-count]
// растёт от data-from до data-count за data-dur мс (чуть быстрее в начале, мягко к концу — счёт виден всё время), начиная через
// data-delay мс; дошло — короткий «щелчок» (.lp-hit). Светофор: красный горит с начала, у числа с data-lit (первое из трёх) на
// финише — жёлтый, у последнего (время) — зелёный. Когда числа на месте, у экрана появляется .is-counted. В телефоне включено
// «Уменьшить движение» — сразу итог и зелёный свет, без анимации.
const COUNT_MS = 1250;
const SEQ = { start: 350, dur: 650, gap: 120 }; // начало счёта, длительность одного числа, пауза между числами (мс)
const COUNT_FMT = {
  plus: (n) => `+${n}`,
  pct: (n) => `${n}%`,
  time: (n) => L.fmtSec(n),
  days: (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`,
};
function countUp(root) {
  if (!root) return;
  const items = [...root.querySelectorAll('[data-count]')].map((el) => ({
    el, from: +el.dataset.from || 0, to: +el.dataset.count || 0, delay: +el.dataset.delay || 0, dur: +el.dataset.dur || COUNT_MS,
    lit: el.dataset.lit || '', fmt: COUNT_FMT[el.dataset.fmt] || String, shown: null, end: false,
  }));
  const light = (c) => { if (c) root.dataset.light = c; };
  const done = () => { root.classList.add('is-counted'); root.removeAttribute('aria-busy'); };
  let still = false;
  try { still = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* нет такой настройки — с анимацией */ }
  if (still || !items.length) { items.forEach((x) => { x.el.textContent = x.fmt(x.to); }); light('green'); done(); return; }
  root.setAttribute('aria-busy', 'true');
  const t0 = performance.now();
  const step = (t) => {
    if (!root.isConnected) return;
    let left = 0;
    for (const x of items) {
      if (x.end) continue;
      const k = Math.min(1, Math.max(0, (t - t0 - x.delay) / x.dur));
      const v = Math.round(x.from + (x.to - x.from) * (1 - (1 - k) ** 2));
      if (v !== x.shown) { x.shown = v; x.el.textContent = x.fmt(v); }
      if (k >= 1) { x.end = true; x.el.classList.add('lp-hit'); light(x.lit); } else left++;
    }
    if (left) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
}

// questions — вопросы урока (из файла модуля), finish(r) → news из completeLesson, onClose(пройден ли урок),
// onReport(вопрос) — «Сообщить об ошибке», course — название курса для «Поделиться» («ПТЭ»)
export function playLesson({ title, kicker, course = '', questions, finish, onClose, onReport }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  let run = L.newRun(questions.map((q) => q.id));
  let phase = 'q'; // 'q' — отвечаем, 'fb' — разбор ответа, 'busy' — сохраняем, 'end' — итог
  let pick = null; // номер выбранного варианта в вопросе
  let order = []; // порядок показа вариантов
  let curQ = null; // вопрос на экране (после ответа run уже смотрит на следующий)
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
    curQ = cur;
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
    const rep = onReport ? `<div class="lp-rep">${cur.checked ? '' : '<span class="lp-unchk">Не проверен экспертом</span>'}<button class="lp-rep-btn" type="button" data-lp="report">Сообщить об ошибке</button></div>` : '';
    foot.className = `lp-foot ${ok ? 'ok' : 'bad'}`;
    foot.innerHTML = `<div class="lp-fb" role="status">
        <div class="lp-fb-h"><span class="lp-fb-ico">${ok ? small(I.check, 20) : small(I.x, 20)}</span><b>${ok ? OK_WORDS[run.answers.length % OK_WORDS.length] : 'Неверно'}</b></div>
        ${!ok ? `<div class="lp-fb-a">Правильный ответ: <b>${esc(right)}</b></div>${L.runDone(run) ? '' : '<div class="lp-fb-later">Этот вопрос повторится в конце урока.</div>'}`
          : typo ? `<div class="lp-fb-a">Есть опечатка, правильно: <b>${esc(right)}</b></div>` : ''}
        ${cur.explain ? `<p class="lp-fb-x">${esc(cur.explain)}</p>` : ''}${quote}${rep}
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
  // «Урок завершён!» (макет Никиты 06.11.2026): светофор зелёный; плитки «Очки опыта», «Точность», «Время»; ниже — монеты, серия,
  // тема, заморозки; внизу — «Поделиться» и «Забрать опыт». Не сохранилось (news нет) — без опыта, с предупреждением.
  // Числа итога «набегают» от нуля примерно за полторы секунды, плашки появляются по очереди (просьба Никиты 06.11.2026) — countUp.
  let result = null;
  function end(news, sec) {
    phase = 'end';
    bar.querySelector('i').style.width = '100%';
    const total = run.ids.length;
    // точность — всегда по самому уроку (так же считает completeLesson); опыт и монеты — только если урок сохранился
    const acc = total ? Math.round((Math.min(run.firstOk, total) / total) * 100) : 0;
    const xp = Number.isFinite(news?.xp) ? news.xp : null;
    const coins = Number.isFinite(news?.coins) ? news.coins : 0;
    result = { sec, acc };
    const sub = acc >= 100 ? 'Отлично! Движемся дальше.' : acc >= 70 ? 'Хорошо! Движемся дальше.' : 'Ошибки — тоже опыт. Движемся дальше.';
    const dd = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
    // число, которое набегает: от from до to, через delay мс после появления экрана
    // ширина — по итоговому числу, чтобы значок рядом не «ездил», пока число растёт
    const cnt = (to, fmt, delay, from = 0, dur = SEQ.dur, lit = '') => `<b class="num lp-cnt" style="min-width:${COUNT_FMT[fmt](to).length}ch" data-from="${from}" data-count="${to}" data-fmt="${fmt}" data-delay="${delay}" data-dur="${dur}"${lit ? ` data-lit="${lit}"` : ''}>${COUNT_FMT[fmt](from)}</b>`;
    // очередь: опыт (если урок сохранился) → точность → время; плитка появляется чуть раньше своего числа
    const order = xp != null ? ['xp', 'acc', 'time'] : ['acc', 'time'];
    const at = (k) => SEQ.start + order.indexOf(k) * (SEQ.dur + SEQ.gap);
    const lit = (k) => (k === order[0] ? 'yellow' : k === 'time' ? 'green' : '');
    const timeEnd = at('time') + SEQ.dur;
    const appear = (k) => Math.max(0, at(k) - 250);
    const chipAt = at('time'); // монеты и серия — одновременно со временем, чтобы к зелёному свету всё было на месте
    const chips = [];
    if (coins > 0) chips.push(`<li class="lp-c-coin">${ART.nut(20)}<span>Монеты ${cnt(coins, 'plus', chipAt, 0, 600)}</span></li>`);
    if (news?.restored) chips.push(`<li class="lp-c-fire on">${ART.flame(20)}<span>Серия вернулась: ${dd(news.streak)}!</span></li>`);
    else if (news) {
      const from = news.extended ? Math.max(0, Math.min(news.streak, news.streakBefore || 0)) : news.streak;
      chips.push(`<li class="lp-c-fire${news.streak ? ' on' : ''}">${ART.flame(20)}<span>Серия: ${cnt(news.streak, 'days', chipAt, from, 600)}${news.extended ? ' <em>+1</em>' : ''}</span></li>`);
    }
    if (news?.topicDone) chips.push(`<li class="lp-c-ok">${small(I.check, 18)}<span>Тема «${esc(title)}» пройдена</span></li>`);
    if (news?.freezesGot) chips.push(`<li class="lp-c-ice">${ART.snow(18)}<span>+${news.freezesGot} ${plural(news.freezesGot, 'заморозка', 'заморозки', 'заморозок')} за серию · в запасе ${news.freezes}</span></li>`);
    const tile = (cls, k, label, icon, value, extra = '') => `<div class="lp-tile ${cls}" style="--t:${appear(k)}ms"><small>${label}</small><span class="lp-tile-v">${icon}${value}</span>${extra}</div>`;
    main.innerHTML = `<div class="lp-end" data-light="red" style="--chip:${chipAt}ms;--rec:${timeEnd + 100}ms">
      ${END_SCENE}
      <h2>Урок завершён!</h2>
      <p class="lp-end-sub">${sub}</p>
      <div class="lp-tiles${xp != null ? '' : ' two'}">
        ${xp != null ? tile('lp-t-xp', 'xp', 'Очки опыта', ART.bolt(26), cnt(xp, 'plus', at('xp'), 0, SEQ.dur, lit('xp'))) : ''}
        ${tile('lp-t-acc', 'acc', 'Точность', ART.target(26), cnt(acc, 'pct', at('acc'), 0, SEQ.dur, lit('acc')))}
        ${tile('lp-t-time', 'time', 'Время', ART.watch(26), cnt(sec, 'time', at('time'), 0, SEQ.dur, lit('time')), news?.record ? '<span class="lp-rec">Рекорд!</span>' : '')}
      </div>
      ${chips.length ? `<ul class="lp-chips">${chips.map((c, i) => c.replace('<li ', `<li style="--i:${i}" `)).join('')}</ul>` : ''}
      ${news ? '' : '<p class="hint warn">Не удалось сохранить прогресс в телефоне. Попробуйте пройти урок ещё раз.</p>'}
    </div>`;
    main.scrollTop = 0;
    countUp(main.querySelector('.lp-end'));
    foot.className = 'lp-foot';
    foot.innerHTML = `<div class="lp-end-foot">${news ? `<button class="icon-btn lp-share" data-lp="share" aria-label="Поделиться результатом">${ART.share(24)}</button>` : ''}
      <button class="btn btn-primary lp-go" data-lp="close">${xp ? 'Забрать опыт' : news ? 'Дальше' : 'Закрыть'}</button></div>`;
    setTimeout(() => foot.querySelector('[data-lp=close]')?.focus({ preventScroll: true }), 60);
  }
  // «Поделиться»: только название урока, точность и время — без имени и других данных; где «Поделиться» нет — копируем текст
  async function share() {
    if (!result) return;
    const text = `Урок «${title}»${course ? ` по ${course}` : ''} в CABINA пройден: точность ${result.acc}%, время ${L.fmtSec(result.sec)}.`;
    const url = 'https://cabina-app.ru/';
    if (navigator.share) {
      try { await navigator.share({ title: 'CABINA', text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Текст скопирован — вставьте его в сообщение'); } catch { toast('Не получилось поделиться', { error: true }); }
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
    else if (a === 'report' && phase === 'fb' && curQ) onReport?.(curQ);
    else if (a === 'share' && phase === 'end') share();
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
