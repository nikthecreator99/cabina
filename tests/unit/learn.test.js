// «Обучение» (2.21.11): серия, заморозки, подарок и возврат серии, энергия, ход урока, проверка ответов,
// порядок и прогресс курса — и проверка самого курса ПТЭ: id, формат вопросов, проверка человеком, дословные цитаты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as L from '../../js/learn-state.js';
import { PTE, COURSES, courseById } from '../../js/learn/pte.js';

const root = new URL('../../', import.meta.url);
const day = (k, n) => L.dayKey(L.dayNum(k) + n);
// серия из n дней подряд, последний — end
const run = (end, n) => Array.from({ length: n }, (_, i) => day(end, i - n + 1));
const st = (patch) => ({ ...L.emptyLearn(), ...patch });

test('прогресс из базы и копии: только известные поля и безопасные значения', () => {
  assert.deepEqual(L.normalizeLearn(null), L.emptyLearn());
  assert.deepEqual(L.normalizeLearn('мусор'), L.emptyLearn());
  const s = L.normalizeLearn({
    done: { 'pte-l001': { n: 3, best: 61, last: 70, acc: 140, at: '2026-11-05' }, '<img src=x>': { n: 1 }, 'pte-l002': 'x' },
    qs: { 'pte-q0001': { a: 2, w: 5 }, 'pte-q0002': { a: 0, w: 0 }, 'a b': { a: 1 } },
    days: ['2026-11-05', '2026-11-04', '2026-11-04', '2026-02-30', 'вчера'],
    frozen: ['2026-11-03', '2026-11-05'],
    freezes: 9, best: -4, sec: 'много', giftAt: '2026-13-01',
    lost: { n: 15, last: '2026-11-01', until: '2026-10-01' },
    note: { k: 'шутка', n: 1, at: '2026-11-05' },
    energy: { n: 999, at: -5 }, tops: ['pte-t01'], extra: 1,
  });
  assert.deepEqual(Object.keys(s.done), ['pte-l001']);
  assert.deepEqual(s.done['pte-l001'], { n: 3, best: 61, last: 70, acc: 100, at: '2026-11-05' });
  assert.deepEqual(s.qs, { 'pte-q0001': { a: 2, w: 2 } });
  assert.deepEqual(s.days, ['2026-11-04', '2026-11-05']);
  assert.deepEqual(s.frozen, ['2026-11-03'], 'день с уроком не может быть «замороженным»');
  assert.equal(s.freezes, L.FREEZE_MAX);
  assert.equal(s.best, 0);
  assert.equal(s.sec, 0);
  assert.equal(s.giftAt, null);
  assert.equal(s.lost, null, 'срок возврата раньше прерванного дня — не принимаем');
  assert.equal(s.note, null);
  assert.deepEqual(s.energy, { n: L.ENERGY.max, at: 0 });
  assert.equal('tops' in s || 'extra' in s, false);
  const ok = L.normalizeLearn({ lost: { n: 15, last: '2026-11-01', until: '2026-11-12' }, note: { k: 'gift', n: 1, left: 0, at: '2026-11-05' } });
  assert.deepEqual(ok.lost, { n: 15, last: '2026-11-01', until: '2026-11-12' });
  assert.deepEqual(ok.note, { k: 'gift', n: 1, left: 0, at: '2026-11-05' });
});

test('серия: сегодня или вчера, закрытые заморозкой дни не рвут и не прибавляют', () => {
  const t = '2026-11-05';
  assert.equal(L.streakAt(st({ days: run(t, 3) }), t), 3);
  assert.equal(L.streakAt(st({ days: run(day(t, -1), 3) }), t), 3, 'сегодня ещё не потерян');
  assert.equal(L.streakAt(st({ days: run(day(t, -2), 3) }), t), 0, 'позавчера — серия прервалась');
  const bridged = st({ days: [...run(day(t, -3), 4), t], frozen: [day(t, -2), day(t, -1)] });
  assert.equal(L.streakAt(bridged, t), 5);
  assert.deepEqual(L.chainAt(bridged, t), { n: 5, start: day(t, -6) });
  assert.equal(L.doneToday(bridged, t), true);
});

test('пропуск: запас заморозок закрывает дни, если хватает на все', () => {
  const t = '2026-11-05';
  const one = L.dailyCheck(st({ days: run(day(t, -2), 4), freezes: 1 }), t);
  assert.equal(one.changed, true);
  assert.deepEqual(one.state.frozen, [day(t, -1)]);
  assert.equal(one.state.freezes, 0);
  assert.deepEqual(one.state.note, { k: 'froze', n: 1, left: 0, at: t });
  assert.equal(L.streakAt(one.state, t), 4);
  assert.equal(L.dailyCheck(one.state, t).changed, false, 'второй раз за день ничего не меняет');
  // два пропуска, одна заморозка, серия короче 10 — серия прервалась, заморозка осталась
  const two = L.dailyCheck(st({ days: run(day(t, -3), 4), freezes: 1 }), t);
  assert.equal(two.changed, false);
  assert.equal(two.state.freezes, 1);
  assert.equal(L.streakAt(two.state, t), 0);
  assert.equal(two.state.lost, null, 'серию до 10 дней не возвращаем');
});

test('подарок: серия от 10 дней и нет заморозок — CABINA дарит одну, не чаще раза в 14 дней', () => {
  const t = '2026-11-20';
  const s = L.dailyCheck(st({ days: run(day(t, -2), 12) }), t).state;
  assert.deepEqual(s.frozen, [day(t, -1)]);
  assert.equal(s.giftAt, t);
  assert.deepEqual(s.note, { k: 'gift', n: 1, left: 0, at: t });
  assert.equal(L.streakAt(s, t), 12);
  // серия 9 дней — подарка нет
  assert.equal(L.dailyCheck(st({ days: run(day(t, -2), 9) }), t).changed, false);
  // одна заморозка + подарок закрывают два дня
  const both = L.dailyCheck(st({ days: run(day(t, -3), 15), freezes: 1 }), t).state;
  assert.deepEqual(both.frozen, [day(t, -2), day(t, -1)]);
  assert.equal(both.freezes, 0);
  assert.equal(both.note.k, 'gift');
  // прошлый подарок 10 дней назад — нового нет, серия прервалась, но её можно вернуть
  const again = L.dailyCheck(st({ days: run(day(t, -2), 15), giftAt: day(t, -10) }), t).state;
  assert.deepEqual(again.frozen, []);
  assert.deepEqual(again.lost, { n: 15, last: day(t, -2), until: day(t, -2 + L.REPAIR_GAP + L.REPAIR_DAYS + 1) });
  // 14 дней прошло — снова можно
  assert.equal(L.dailyCheck(st({ days: run(day(t, -2), 15), giftAt: day(t, -14) }), t).state.giftAt, t);
});

test('возврат серии: 3 дня подряд после пропуска возвращают серию от 10 дней', () => {
  const last = '2026-11-10';
  const base = st({ days: run(last, 15) });
  const d1 = day(last, 4); // пропущено 3 дня, заморозок нет, подарок был недавно
  const s0 = { ...base, giftAt: day(last, -3) };
  let s = L.dailyCheck(s0, d1).state;
  assert.equal(s.lost.n, 15);
  assert.equal(L.repairLeft(s, d1), 3);
  const lesson = (state, today) => L.completeLesson(state, { lessonId: 'pte-l001', topicLessons: ['pte-l001'], today, sec: 60, total: 5, firstOk: 5, answers: [] });
  let r = lesson(s, d1);
  assert.equal(r.news.streak, 1);
  assert.equal(r.news.restored, 0);
  assert.equal(L.repairLeft(r.state, d1), 2);
  r = lesson(r.state, day(d1, 1));
  assert.equal(L.repairLeft(r.state, day(d1, 1)), 1);
  r = lesson(r.state, day(d1, 2));
  assert.equal(r.news.restored, 15);
  assert.equal(r.news.streak, 18);
  assert.equal(r.state.lost, null);
  assert.deepEqual(r.state.frozen, [day(last, 1), day(last, 2), day(last, 3)]);
  assert.equal(r.state.best, 18);
  assert.equal(r.news.freezesGot, 0, 'рубеж 10 уже был в прежней серии');
  // возврат через рубеж 20 даёт заморозку
  const s19 = L.dailyCheck({ ...st({ days: run(last, 19) }), giftAt: day(last, -1) }, d1).state;
  let q = lesson(s19, d1);
  q = lesson(q.state, day(d1, 1));
  q = lesson(q.state, day(d1, 2));
  assert.equal(q.news.streak, 22);
  assert.equal(q.news.freezesGot, 1);
});

test('возврат серии пропадает, если новая цепочка прервалась или вышел срок', () => {
  const last = '2026-11-10';
  const s0 = { ...st({ days: run(last, 12) }), giftAt: day(last, -1) };
  const d1 = day(last, 3);
  let s = L.dailyCheck(s0, d1).state;
  assert.ok(s.lost);
  s = L.completeLesson(s, { lessonId: 'pte-l001', today: d1, sec: 50, total: 5, firstOk: 4, answers: [] }).state;
  // пропустили день в новой цепочке
  s = L.dailyCheck(s, day(d1, 2)).state;
  assert.equal(s.lost, null);
  // не вернулся вовремя
  const late = L.dailyCheck(s0, d1).state;
  assert.equal(L.dailyCheck(late, day(late.lost.until, 1)).state.lost, null);
  // пропуск больше 7 дней — вернуть нельзя
  assert.equal(L.dailyCheck(s0, day(last, L.REPAIR_GAP + 2)).state.lost, null);
});

test('урок пройден: время, точность, рекорд, серия и заморозки за каждые 10 дней', () => {
  const t = '2026-11-05';
  const r1 = L.completeLesson(L.emptyLearn(), { lessonId: 'pte-l001', topicLessons: ['pte-l001'], today: t, sec: 83, total: 5, firstOk: 4, answers: [{ id: 'pte-q0001', ok: true }, { id: 'pte-q0002', ok: false }, { id: 'pte-q0002', ok: true }] });
  assert.deepEqual(r1.state.done['pte-l001'], { n: 1, best: 83, last: 83, acc: 80, at: t });
  assert.deepEqual(r1.state.qs['pte-q0002'], { a: 2, w: 1 });
  assert.deepEqual(r1.state.days, [t]);
  assert.equal(r1.news.first, true);
  assert.equal(r1.news.streak, 1);
  assert.equal(r1.news.extended, true);
  assert.equal(r1.news.topicDone, true);
  const r2 = L.completeLesson(r1.state, { lessonId: 'pte-l001', topicLessons: ['pte-l001'], today: t, sec: 61, total: 5, firstOk: 5, answers: [] });
  assert.equal(r2.news.record, true);
  assert.equal(r2.news.extended, false, 'второй урок за день серию не удлиняет');
  assert.equal(r2.news.topicDone, false, 'тему поздравляем один раз');
  assert.equal(r2.state.done['pte-l001'].best, 61);
  assert.equal(r2.state.sec, 144);
  // забыли телефон с открытым уроком — время не запоминаем
  const r3 = L.completeLesson(r2.state, { lessonId: 'pte-l001', today: t, sec: 5 * 3600, total: 5, firstOk: 5, answers: [] });
  assert.equal(r3.news.timed, false);
  assert.equal(r3.state.done['pte-l001'].best, 61);
  assert.equal(r3.state.sec, 144);
  // рубежи: 9 → 10 даёт заморозку, 19 → 20 ещё одну, третьей нет (в запасе максимум 2)
  const at10 = L.completeLesson(st({ days: run(day(t, -1), 9) }), { lessonId: 'x', today: t, sec: 60, total: 5, firstOk: 5, answers: [] });
  assert.equal(at10.news.streak, 10);
  assert.equal(at10.news.freezesGot, 1);
  assert.equal(at10.state.freezes, 1);
  const at11 = L.completeLesson(at10.state, { lessonId: 'x', today: day(t, 1), sec: 60, total: 5, firstOk: 5, answers: [] });
  assert.equal(at11.news.freezesGot, 0);
  const full = L.completeLesson(st({ days: run(day(t, -1), 29), freezes: 2 }), { lessonId: 'x', today: t, sec: 60, total: 5, firstOk: 5, answers: [] });
  assert.equal(full.news.freezesGot, 0);
  assert.equal(full.news.freezesFull, 1);
  assert.equal(full.state.freezes, 2);
});

test('ход урока: ошибка уходит в конец, пока не ответят верно', () => {
  let r = L.newRun(['a', 'b', 'c', 'b']);
  assert.deepEqual(r.ids, ['a', 'b', 'c']);
  r = L.answerRun(r, true); // a
  r = L.answerRun(r, false); // b — ошибка
  assert.equal(L.runProgress(r), 1 / 3);
  r = L.answerRun(r, true); // c
  assert.equal(L.runCurrent(r), 'b');
  assert.equal(L.runRepeat(r), true);
  r = L.answerRun(r, false); // b — снова ошибка
  assert.equal(L.runCurrent(r), 'b');
  r = L.answerRun(r, true);
  assert.equal(L.runDone(r), true);
  assert.equal(L.runProgress(r), 1);
  assert.equal(r.firstOk, 2);
  assert.equal(r.answers.length, 5);
  assert.equal(L.answerRun(r, true), r, 'после конца урока ответы не принимаются');
});

test('ввод ответа: числа со словами, пробелы в тысячах, формы слова и одна опечатка', () => {
  const n = { type: 'input', answer: 6, accept: ['шесть'] };
  for (const v of ['6', ' 6 ', '6 лет', 'Шесть', 'шесть.', '№6', '6,0']) assert.equal(L.checkInput(n, v).ok, true, v);
  for (const v of ['', '5', '6 и 7', '16', '6/7', '6+', 'шест']) assert.equal(L.checkInput(n, v).ok, false, v);
  assert.equal(L.checkInput({ answer: 4100 }, '4 100 т').ok, true);
  assert.equal(L.checkInput({ answer: 4100 }, '4100').ok, true);
  assert.equal(L.checkInput({ answer: 2.5 }, '2,5').ok, true);
  // единицы рядом с числом
  for (const v of ['80 км/ч', '80км/ч', 'скорость 80 км/ч']) assert.equal(L.checkInput({ answer: 80 }, v).ok, true, v);
  assert.equal(L.checkInput({ answer: 2.5 }, '2,5 ‰').ok, true);
  assert.equal(L.checkInput({ answer: 80 }, '80/100').ok, false);
  const w = { type: 'input', answer: 'звуковые', accept: ['звуковых'] };
  assert.deepEqual(L.checkInput(w, 'Звуковые'), { ok: true, typo: false });
  assert.deepEqual(L.checkInput(w, 'звукавые'), { ok: true, typo: true });
  assert.deepEqual(L.checkInput(w, 'звуковых'), { ok: true, typo: false });
  assert.equal(L.checkInput(w, 'звонкие').ok, false);
  assert.equal(L.checkInput({ answer: 'ПТЭ' }, 'пте').ok, false, 'в коротком слове опечатку не прощаем');
  assert.equal(L.checkChoice({ answer: 1 }, 1), true);
  assert.equal(L.checkChoice({ answer: 1 }, '1'), false);
});

test('варианты перемешиваются без потерь', () => {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 20; i++) assert.deepEqual([...L.shuffleOrder(4, rnd)].sort(), [0, 1, 2, 3]);
});

test('энергия: бесконечная сейчас, конечная копится и тратится', () => {
  const s = L.emptyLearn();
  assert.equal(L.energyNow(s, Date.now()), Infinity);
  assert.equal(L.spendEnergy(s, Date.now()), s);
  const cfg = { unlimited: false, max: 25, perLesson: 5, regenMin: 30 };
  const t0 = Date.UTC(2026, 10, 5, 10, 0);
  let e = L.spendEnergy(s, t0, cfg);
  assert.deepEqual(e.energy, { n: 20, at: t0 });
  assert.equal(L.energyNow(e, t0 + 61 * 60000, cfg), 22);
  e = L.spendEnergy(e, t0 + 61 * 60000, cfg);
  assert.equal(L.energyNow(e, t0 + 61 * 60000, cfg), 17);
  assert.equal(L.energyNow(e, t0 + 90 * 60000, cfg), 18, 'начатые полчаса не теряются');
  const empty = { ...s, energy: { n: 2, at: t0 } };
  assert.equal(L.canStart(empty, t0, cfg), false);
  assert.equal(L.spendEnergy(empty, t0, cfg), empty);
  assert.equal(L.energyNow(empty, t0 + 100 * 3600000, cfg), 25);
});

test('курс: порядок уроков, текущий урок, черновики и прогресс всего документа', () => {
  const course = { modules: [
    { id: 'm1', topics: [{ id: 't1', lessons: [{ id: 'l1' }, { id: 'l2' }] }, { id: 't2', lessons: [] }] },
    { id: 'm2', topics: [{ id: 't3', lessons: [{ id: 'l3', draft: true }] }, { id: 't4', lessons: [{ id: 'l4' }] }] },
  ] };
  const s = st({ done: { l1: { n: 1 } } });
  assert.deepEqual(L.lessonStates(course, s).map((x) => [x.lesson.id, x.state]), [['l1', 'done'], ['l2', 'current'], ['l4', 'locked']]);
  assert.deepEqual(L.lessonsOf(course, { drafts: true }).map((x) => x.lesson.id), ['l1', 'l2', 'l3', 'l4']);
  assert.equal(L.currentLesson(course, st({ done: { l1: {}, l2: {} } })).lesson.id, 'l4');
  assert.equal(L.currentLesson(course, st({ done: { l1: {}, l2: {}, l4: {} } })), null);
  assert.equal(L.courseProgress(course, s), 0.5 / 4);
  assert.deepEqual(L.topicProgress(course.modules[0].topics[0], s), { total: 2, done: 1 });
  assert.equal(L.progressLabel(0), '0%');
  assert.equal(L.progressLabel(0.004), 'меньше 1%');
  assert.equal(L.progressLabel(0.129), '12%');
  assert.equal(L.progressLabel(0.999), '99%');
  assert.equal(L.progressLabel(1), '100%');
  assert.equal(L.fmtSec(65), '1:05');
  assert.equal(L.fmtSec(3723), '1:02:03');
});

// ---------------------------------------------------------------- сам курс ПТЭ
const fixture = gunzipSync(readFileSync(new URL('tests/fixtures/pte-250-2022.txt.gz', root))).toString('utf8');
// так же, как при подготовке текста: «№» в тексте приказа записан как N, сноски <12> убраны
const norm = (s) => s.replace(/№/g, 'N').replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/[«»“”„]/g, '"').replace(/<\d+>/g, '')
  .replace(/\s+/g, ' ').replace(/ ([,.;:)])/g, '$1').trim();
const TEXT = norm(fixture);
const banks = new Map();
for (const m of PTE.modules) if (m.bank) banks.set(m.id, (await m.bank()).QUESTIONS);
const allQs = [...banks.values()].flat();

test('курс ПТЭ: id по правилам и без повторов', () => {
  assert.deepEqual(COURSES.map((c) => c.id), ['pte']);
  assert.equal(courseById('pte'), PTE);
  assert.equal(courseById('нет'), null);
  const ids = [];
  for (const m of PTE.modules) {
    assert.match(m.id, /^pte-m\d{2,}$/);
    assert.ok(m.title && m.src, m.id);
    ids.push(m.id);
    for (const t of m.topics) {
      assert.match(t.id, /^pte-t\d{2,}$/);
      assert.ok(t.title && t.src, t.id);
      ids.push(t.id);
      for (const l of t.lessons) {
        assert.match(l.id, /^pte-l\d{3,}$/);
        ids.push(l.id);
        if (l.q.length) assert.ok(m.bank, `у модуля ${m.id} нет файла вопросов`);
      }
    }
  }
  for (const q of allQs) { assert.match(q.id, /^pte-q\d{4,}$/); ids.push(q.id); }
  assert.equal(new Set(ids).size, ids.length, 'повторяются id');
  for (const id of ids) assert.match(id, L.ID, 'id подходит для хранения прогресса');
});

test('курс ПТЭ: каждый урок — 5–7 вопросов из своего модуля, каждый вопрос — ровно в одном уроке', () => {
  const used = new Map();
  for (const m of PTE.modules) {
    const bank = new Map((banks.get(m.id) || []).map((q) => [q.id, q]));
    for (const t of m.topics) {
      for (const l of t.lessons) {
        assert.ok(l.q.length >= 5 && l.q.length <= 7, `${l.id}: ${l.q.length} вопросов`);
        for (const id of l.q) {
          assert.ok(bank.has(id), `${l.id}: вопроса ${id} нет в файле модуля ${m.id}`);
          assert.ok(!used.has(id), `${id} уже есть в уроке ${used.get(id)}`);
          used.set(id, l.id);
        }
      }
    }
  }
  for (const q of allQs) assert.ok(used.has(q.id), `вопрос ${q.id} не входит ни в один урок`);
});

test('курс ПТЭ: вопросы заполнены правильно, верный ответ проходит проверку', () => {
  for (const q of allQs) {
    const at = q.id;
    assert.ok(['choice', 'input'].includes(q.type), at);
    for (const f of ['text', 'explain']) assert.ok(typeof q[f] === 'string' && q[f].trim().length > 5, `${at}: ${f}`);
    assert.ok(q.src && q.src.ref && q.src.quote, `${at}: нет источника`);
    assert.equal(q.ed, PTE.ed, `${at}: вопрос проверен по другой редакции — сверьте с действующей`);
    for (const s of [q.text, q.explain, q.prompt || '', ...(q.options || [])]) assert.doesNotMatch(s, /[<>]/, `${at}: в тексте разметка`);
    if (q.type === 'choice') {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4, `${at}: 2–4 варианта`);
      assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, q.options.length, `${at}: одинаковые варианты`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${at}: номер верного`);
      assert.ok(L.checkChoice(q, q.answer));
    } else {
      assert.ok(typeof q.answer === 'number' || (typeof q.answer === 'string' && q.answer.trim()), `${at}: ответ`);
      for (const v of [String(q.answer), ...(q.accept || [])]) assert.equal(L.checkInput(q, v).ok, true, `${at}: «${v}» не принимается`);
    }
    if (q.checked != null) {
      assert.ok(typeof q.checked.by === 'string' && q.checked.by.trim(), `${at}: кто проверил`);
      assert.ok(L.isDayKey(q.checked.on), `${at}: когда проверил`);
    }
  }
});

test('курс ПТЭ: урок без проверки человеком — только черновик', () => {
  const byId = new Map(allQs.map((q) => [q.id, q]));
  for (const m of PTE.modules) for (const t of m.topics) for (const l of t.lessons) {
    if (l.draft) continue;
    for (const id of l.q) assert.ok(byId.get(id)?.checked, `${l.id}: вопрос ${id} не проверен — урок должен быть draft: true`);
  }
});

test('курс ПТЭ: цитаты дословно есть в тексте приказа', () => {
  assert.ok(TEXT.length > 1e6, 'текст приказа на месте');
  for (const q of allQs) {
    const parts = q.src.quote.split('…').map((p) => p.trim()).filter(Boolean);
    assert.ok(parts.length, q.id);
    for (const p of parts) assert.ok(TEXT.includes(norm(p)), `${q.id}: нет в тексте приказа: «${p.slice(0, 80)}»`);
  }
});
