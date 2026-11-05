// «Обучение» (2.21.11): прогресс, ударный режим, заморозки, энергия, ход урока и проверка ответов.
// Только чистые функции — без экрана и без базы, поэтому всё проверяется автотестами (tests/unit/learn.test.js).
// Прогресс хранится только в телефоне (meta 'learn' в IndexedDB) и попадает в резервную копию; на сервер не уходит.
// Всё, что пришло из базы или из копии, — непроверенное: читается только через normalizeLearn.
//
// Модель прогресса (meta 'learn', v: 1):
//   done   { [id урока]: { n — сколько раз пройден, best — лучшее время (с), last — последнее (с), acc — % верных с первого раза, at — день } }
//   qs     { [id вопроса]: { a — сколько раз отвечали, w — сколько раз ошиблись } } — для будущего повторения ошибок
//   days   ['YYYY-MM-DD'] — дни, когда пройден хотя бы один урок (по часовому поясу из настроек)
//   frozen ['YYYY-MM-DD'] — пропущенные дни, которые закрыла заморозка (или возврат серии)
//   freezes — заморозок в запасе (0…FREEZE_MAX), best — лучшая серия, sec — всего секунд в уроках
//   giftAt — день последней подаренной заморозки, lost — прерванная серия, которую ещё можно вернуть { n, last, until },
//   note — что показать на экране «Обучение» сегодня { k: 'froze' | 'gift', n — сколько дней закрыто, left — заморозок осталось, at },
//   energy { n, at } — запас энергии и когда он был таким (мс; нужен только при конечной энергии)
//
// Серия (решения Никиты 05.11.2026: серию нужно беречь — человек, потерявший серию в 10–20 дней, редко начинает снова):
//   • заморозка — за каждые 10 дней серии, в запасе не больше двух; пропущенный день она закрывает сама;
//   • серия от 10 дней, а заморозок не хватает — CABINA дарит одну (не чаще раза в 14 дней);
//   • серия от 10 дней всё же прервалась (пропуск до 7 дней) — её можно вернуть: пройти урок 3 дня подряд.
//   Всё это человек видит: что закрыла заморозка, что подарено и сколько осталось. Закрытые дни серию не удлиняют.

export const LEARN_V = 1;
export const FREEZE_MAX = 2;
export const FREEZE_EVERY = 10;
export const GIFT_FROM = 10;
export const GIFT_EVERY = 14;
export const REPAIR_FROM = 10;
export const REPAIR_GAP = 7;
export const REPAIR_DAYS = 3;
// Энергия тратится на урок. Пока она бесконечная (решение Никиты 05.11.2026); конечный режим готов и проверен тестами.
export const ENERGY = { unlimited: true, max: 25, perLesson: 5, regenMin: 30 };
export const LESSON_MAX_SEC = 3 * 3600; // урок дольше трёх часов (телефон забыли с открытым уроком) — время не запоминаем

const DAY_MS = 86400000;
const DK = /^\d{4}-\d{2}-\d{2}$/;
export const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const isDayKey = (k) => typeof k === 'string' && DK.test(k) && dayKey(dayNum(k)) === k;
export const dayNum = (k) => { const [y, m, d] = String(k).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); };
export const dayKey = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const daysList = (v, cap = 5000) => (Array.isArray(v) ? [...new Set(v.filter(isDayKey))].sort().slice(-cap) : []);
const range = (a, b) => { const out = []; for (let d = a; d <= b; d++) out.push(dayKey(d)); return out; };
const NOTES = ['froze', 'gift'];

export function emptyLearn() {
  return { v: LEARN_V, done: {}, qs: {}, days: [], frozen: [], freezes: 0, best: 0, sec: 0, giftAt: null, lost: null, note: null, energy: { n: ENERGY.max, at: 0 } };
}

// Прогресс из базы или из резервной копии: только известные поля, числа — в своих пределах, id — из безопасных символов
export function normalizeLearn(raw) {
  const s = emptyLearn();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.done && typeof raw.done === 'object') {
    for (const [k, v] of Object.entries(raw.done)) {
      if (!ID.test(k) || !v || typeof v !== 'object') continue;
      const best = int(v.best, 1, LESSON_MAX_SEC, 0);
      const last = int(v.last, 1, LESSON_MAX_SEC, 0);
      s.done[k] = { n: int(v.n, 1, 1e6, 1), best: best || null, last: last || null, acc: int(v.acc, 0, 100, 0), at: isDayKey(v.at) ? v.at : null };
    }
  }
  if (raw.qs && typeof raw.qs === 'object') {
    for (const [k, v] of Object.entries(raw.qs)) {
      if (!ID.test(k) || !v || typeof v !== 'object') continue;
      const a = int(v.a, 0, 1e6, 0);
      if (a) s.qs[k] = { a, w: Math.min(a, int(v.w, 0, 1e6, 0)) };
    }
  }
  s.days = daysList(raw.days);
  const real = new Set(s.days);
  s.frozen = daysList(raw.frozen).filter((d) => !real.has(d));
  s.freezes = int(raw.freezes, 0, FREEZE_MAX, 0);
  s.best = int(raw.best, 0, 1e5, 0);
  s.sec = int(raw.sec, 0, 1e10, 0);
  s.giftAt = isDayKey(raw.giftAt) ? raw.giftAt : null;
  const l = raw.lost;
  if (l && typeof l === 'object' && isDayKey(l.last) && isDayKey(l.until) && l.until > l.last) {
    const n = int(l.n, 0, 1e5, 0);
    if (n >= 1) s.lost = { n, last: l.last, until: l.until };
  }
  const nt = raw.note;
  if (nt && typeof nt === 'object' && NOTES.includes(nt.k) && isDayKey(nt.at)) {
    s.note = { k: nt.k, n: int(nt.n, 1, 1e4, 1), left: int(nt.left, 0, FREEZE_MAX, 0), at: nt.at };
  }
  const e = raw.energy && typeof raw.energy === 'object' ? raw.energy : {};
  s.energy = { n: int(e.n, 0, ENERGY.max, ENERGY.max), at: int(e.at, 0, 1e14, 0) };
  return s;
}

// ---------------------------------------------------------------- ударный режим
// Цепочка дней, которая заканчивается сегодня (или вчера — сегодняшний день ещё не потерян).
// n — сколько в ней дней с уроком (закрытые заморозкой дни цепочку не рвут, но и не считаются), start — первый день.
export function chainAt(s, today) {
  const real = new Set(s.days);
  const any = new Set([...s.days, ...s.frozen]);
  const t = dayNum(today);
  let d = any.has(today) ? t : any.has(dayKey(t - 1)) ? t - 1 : null;
  if (d == null) return { n: 0, start: null };
  let n = 0;
  for (; any.has(dayKey(d)); d--) if (real.has(dayKey(d))) n++;
  return { n, start: dayKey(d + 1) };
}
export const streakAt = (s, today) => chainAt(s, today).n;
export const doneToday = (s, today) => s.days.includes(today);
// Можно ли сегодня подарить заморозку серии длиной streak
export const giftReady = (s, today, streak) => streak >= GIFT_FROM && (!s.giftAt || dayNum(today) - dayNum(s.giftAt) >= GIFT_EVERY);

// Проверка при открытии «Обучения» и перед записью урока (можно звать сколько угодно раз за день — результат тот же).
// 1) Пропущенные дни до сегодняшнего закрываются заморозками — только если их хватает на все пропуски (с подарком,
//    если серия от GIFT_FROM дней); иначе серия прервалась, а заморозки остаются целы.
// 2) Прервалась серия от REPAIR_FROM дней с пропуском до REPAIR_GAP дней — запоминаем её в lost: её можно вернуть.
// 3) Возврат больше невозможен (срок вышел или новая цепочка снова прервалась) — lost стираем.
export function dailyCheck(s0, today) {
  let s = s0;
  const t = dayNum(today);
  const marks = [...s.days, ...s.frozen].map(dayNum).filter((n) => n < t);
  if (marks.length) {
    const last = Math.max(...marks);
    const missed = t - last - 1;
    if (missed >= 1) {
      const before = streakAt(s, dayKey(last));
      const gift = giftReady(s, today, before);
      if (before >= 1 && missed <= s.freezes + (gift ? 1 : 0)) {
        const fromStock = Math.min(missed, s.freezes);
        const gifted = missed > s.freezes;
        const left = s.freezes - fromStock;
        s = {
          ...s,
          frozen: [...s.frozen, ...range(last + 1, t - 1)].sort(),
          freezes: left,
          giftAt: gifted ? today : s.giftAt,
          note: { k: gifted ? 'gift' : 'froze', n: missed, left, at: today },
        };
      } else if (before >= REPAIR_FROM && missed <= REPAIR_GAP && !(s.lost && s.lost.last === dayKey(last))) {
        s = { ...s, lost: { n: before, last: dayKey(last), until: dayKey(last + REPAIR_GAP + REPAIR_DAYS + 1) } };
      }
    }
  }
  if (s.lost) {
    const back = s.days.filter((d) => d > s.lost.last)[0];
    const alive = !back || chainAt(s, today).start === back;
    if (today > s.lost.until || !alive) s = { ...s, lost: null };
  }
  return { state: s, changed: s !== s0 };
}
// Сколько дней с уроком осталось до возврата серии (0 — возврата нет)
export function repairLeft(s, today) {
  if (!s.lost) return 0;
  const ch = chainAt(s, today);
  const n = ch.start && ch.start > s.lost.last ? ch.n : 0;
  return Math.max(1, REPAIR_DAYS - n);
}

// Неделя для окна серии: 7 дней с понедельника текущей недели — 'done' | 'frozen' | 'today' | 'missed' | 'future'
export function weekView(s, today) {
  const t = dayNum(today);
  const wd = (new Date(t * DAY_MS).getUTCDay() + 6) % 7; // 0 — понедельник
  const real = new Set(s.days);
  const fr = new Set(s.frozen);
  return Array.from({ length: 7 }, (_, i) => {
    const n = t - wd + i;
    const k = dayKey(n);
    return { key: k, state: real.has(k) ? 'done' : fr.has(k) ? 'frozen' : n === t ? 'today' : n > t ? 'future' : 'missed' };
  });
}

// ---------------------------------------------------------------- энергия
// Сколько энергии сейчас: копится по одной за regenMin минут до max. Бесконечная — Infinity.
export function energyNow(s, nowMs, cfg = ENERGY) {
  if (cfg.unlimited) return Infinity;
  const e = s.energy || { n: cfg.max, at: 0 };
  if (e.n >= cfg.max || !e.at) return Math.min(cfg.max, e.n);
  const add = Math.floor(Math.max(0, nowMs - e.at) / (cfg.regenMin * 60000));
  return Math.min(cfg.max, e.n + add);
}
export const canStart = (s, nowMs, cfg = ENERGY) => energyNow(s, nowMs, cfg) >= cfg.perLesson;
// Списать энергию за начатый урок. Отсчёт восстановления сохраняет уже накопленную часть интервала.
export function spendEnergy(s, nowMs, cfg = ENERGY) {
  if (cfg.unlimited) return s;
  const have = energyNow(s, nowMs, cfg);
  if (have < cfg.perLesson) return s;
  const step = cfg.regenMin * 60000;
  const e = s.energy || { n: cfg.max, at: 0 };
  const carried = e.n < cfg.max && e.at ? (nowMs - e.at) % step : 0;
  return { ...s, energy: { n: have - cfg.perLesson, at: have >= cfg.max ? nowMs : nowMs - carried } };
}

// ---------------------------------------------------------------- урок пройден
// r: { lessonId, topicLessons — id уроков темы, today, sec — время, total — вопросов, firstOk — верных с первого раза,
//      answers: [{ id, ok }] — все ответы по порядку }
// Возвращает новое состояние и что произошло (для экрана «Урок пройден»).
export function completeLesson(s0, r) {
  let s = dailyCheck(s0, r.today).state;
  const lessons = r.topicLessons || [];
  const topicWas = lessons.length > 0 && lessons.every((id) => s.done[id]);
  const before = streakAt(s, r.today);
  if (!s.days.includes(r.today)) s = { ...s, days: [...s.days, r.today].sort(), frozen: s.frozen.filter((d) => d !== r.today) };
  let streak = streakAt(s, r.today);
  // рубежи серии для заморозок считаются от base: при возврате серии — от её прежней длины
  let base = before;
  let restored = 0;
  if (s.lost) {
    const ch = chainAt(s, r.today);
    if (ch.start > s.lost.last && ch.n >= REPAIR_DAYS) {
      restored = s.lost.n;
      base = s.lost.n;
      s = { ...s, frozen: [...s.frozen, ...range(dayNum(s.lost.last) + 1, dayNum(ch.start) - 1)].sort(), lost: null };
      streak = streakAt(s, r.today);
    }
  }
  const prev = s.done[r.lessonId];
  const sec = int(r.sec, 1, LESSON_MAX_SEC + 1, 1);
  const timed = sec <= LESSON_MAX_SEC;
  const entry = {
    n: (prev?.n || 0) + 1,
    best: timed ? (prev?.best ? Math.min(prev.best, sec) : sec) : prev?.best || null,
    last: timed ? sec : prev?.last || null,
    acc: r.total ? Math.round((Math.max(0, Math.min(r.firstOk, r.total)) / r.total) * 100) : 0,
    at: r.today,
  };
  const qs = { ...s.qs };
  for (const a of r.answers || []) {
    if (!ID.test(String(a.id))) continue;
    const q = qs[a.id] || { a: 0, w: 0 };
    qs[a.id] = { a: q.a + 1, w: q.w + (a.ok ? 0 : 1) };
  }
  s = { ...s, done: { ...s.done, [r.lessonId]: entry }, qs, sec: s.sec + (timed ? sec : 0), best: Math.max(s.best, streak) };
  const miles = Math.max(0, Math.floor(streak / FREEZE_EVERY) - Math.floor(base / FREEZE_EVERY));
  let freezes = s.freezes;
  let got = 0;
  let full = 0;
  for (let i = 0; i < miles; i++) { if (freezes < FREEZE_MAX) { freezes++; got++; } else full++; }
  return {
    state: { ...s, freezes },
    news: {
      first: !prev,
      record: !!(prev?.best && timed && sec < prev.best),
      best: entry.best,
      sec, timed, acc: entry.acc,
      streakBefore: before, streak, extended: streak > before, restored,
      freezesGot: got, freezesFull: full, freezes,
      topicDone: !topicWas && lessons.length > 0 && lessons.every((id) => s.done[id]),
    },
  };
}

// ---------------------------------------------------------------- ход урока
// Вопросы идут по порядку; на ошибку вопрос уходит в конец урока, пока на него не ответят верно.
// Полоса прогресса — сколько вопросов уже решено верно.
export function newRun(ids) {
  const list = [...new Set(ids)];
  return { ids: list, queue: [...list], pos: 0, tries: {}, correct: 0, firstOk: 0, answers: [] };
}
export const runCurrent = (run) => run.queue[run.pos] ?? null;
export const runRepeat = (run) => (run.tries[runCurrent(run)] || 0) > 0; // этот вопрос уже был с ошибкой — «Повтор ошибки»
export const runDone = (run) => run.pos >= run.queue.length;
export const runProgress = (run) => (run.ids.length ? run.correct / run.ids.length : 0);
export function answerRun(run, ok) {
  const id = runCurrent(run);
  if (id == null) return run;
  const tries = (run.tries[id] || 0) + 1;
  return {
    ...run,
    queue: ok ? run.queue : [...run.queue, id],
    pos: run.pos + 1,
    tries: { ...run.tries, [id]: tries },
    correct: run.correct + (ok ? 1 : 0),
    firstOk: run.firstOk + (ok && tries === 1 ? 1 : 0),
    answers: [...run.answers, { id, ok: !!ok }],
  };
}

// ---------------------------------------------------------------- проверка ответа
// Ввод ответа: без учёта регистра, «ё», кавычек и знаков препинания. Числовой ответ: в тексте ровно одно число,
// и оно равно правильному; слова рядом допустимы («6 лет», «приложение № 2»). «4 100» — то же, что 4100; «6,5» — 6.5.
// Текстовый ответ: точное совпадение с ответом или вариантом из accept; одна опечатка в длинном слове прощается (typo).
export const normText = (v) => String(v ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'„“”`.,;:!?()№–—-]/g, ' ').replace(/\s+/g, ' ').trim();
export function numbersIn(v) {
  const s = String(v ?? '').replace(/(\d)[\s  ]+(?=\d{3}(?!\d))/g, '$1');
  return [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
}
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// q — вопрос с type 'input': answer (число или строка), accept — другие верные записи. → { ok, typo }
export function checkInput(q, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, typo: false };
  const text = normText(raw);
  const variants = [q.answer, ...(q.accept || [])].map((x) => normText(x)).filter(Boolean);
  if (variants.includes(text)) return { ok: true, typo: false };
  if (typeof q.answer === 'number') {
    const nums = numbersIn(raw);
    const rest = normText(raw.replace(/\d+(?:[.,\s  ]\d+)*/g, ' '));
    // рядом с числом — только слова и единицы: «км/ч», «%», «‰»
    const ok = nums.length === 1 && Math.abs(nums[0] - q.answer) < 1e-9 && /^[a-zа-я /%‰]*$/.test(rest);
    return { ok, typo: false };
  }
  const typo = variants.some((v) => v.length >= 6 && editDistance(v, text) === 1);
  return { ok: typo, typo };
}
export const checkChoice = (q, index) => Number.isInteger(index) && index === q.answer;
// Перемешать варианты ответа: порядок показа → номер варианта в вопросе. rnd — для тестов.
export function shuffleOrder(n, rnd = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------- курс: порядок, доступ, прогресс
// opts.drafts — показывать и черновики (только для проверки уроков: localStorage 'cabina-learn-drafts' = '1')
const ready = (t, opts = {}) => (t.lessons || []).filter((l) => opts.drafts || !l.draft);
// Уроки курса по порядку: модуль → тема → урок
export function lessonsOf(course, opts = {}) {
  const out = [];
  for (const m of course.modules) for (const t of m.topics) for (const l of ready(t, opts)) out.push({ lesson: l, topic: t, module: m });
  return out;
}
// Статус урока: 'done' — пройден, 'current' — первый непройденный (его и можно начать), 'locked' — дальше.
// Пройденные уроки можно повторять всегда.
export function lessonStates(course, s, opts = {}) {
  let cur = false;
  return lessonsOf(course, opts).map((x) => {
    let st = 'locked';
    if (s.done[x.lesson.id]) st = 'done';
    else if (!cur) { st = 'current'; cur = true; }
    return { ...x, state: st };
  });
}
export const currentLesson = (course, s, opts = {}) => lessonStates(course, s, opts).find((x) => x.state === 'current') || null;
// Прогресс курса — доля пройденных тем всего документа (тема без готовых уроков считается непройденной).
// Тему, пройденную частично, считаем долей пройденных уроков. 0…1.
export function courseProgress(course, s, opts = {}) {
  let total = 0;
  let sum = 0;
  for (const m of course.modules) {
    for (const t of m.topics) {
      total++;
      const ls = ready(t, opts);
      if (ls.length) sum += ls.filter((l) => s.done[l.id]).length / ls.length;
    }
  }
  return total ? sum / total : 0;
}
// Проценты для подписи: 0 — «0%», меньше процента, но не ноль — «меньше 1%», иначе целые вниз (100% — только если всё пройдено)
export function progressLabel(p) {
  if (!(p > 0)) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.01) return 'меньше 1%';
  return `${Math.floor(p * 100)}%`;
}
// Тема: сколько уроков готово и сколько пройдено
export function topicProgress(t, s, opts = {}) {
  const ls = ready(t, opts);
  return { total: ls.length, done: ls.filter((l) => s.done[l.id]).length };
}

// Время урока «1:05» / «12:40» / «1:02:03»
export function fmtSec(sec) {
  const v = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const x = String(v % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}
