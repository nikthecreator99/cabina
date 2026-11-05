// Браузерные проверки CABINA 2.21.11 (просьба Никиты 05.11.2026): «Обучение» — курс ПТЭ.
// Экран курса, дорога от станции к станции, урок с повтором ошибок и временем, серия, заморозки, магазин, «Все модули».
// Вопросы курса берутся из js/learn/pte-q01.js. Выдуманные вопросы ниже — только для проверки ввода ответа, в курс они не попадают.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, openSettings } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const learnOf = (page) => page.evaluate(async () => (await import('./js/store.js')).S.learn);
const stored = (page) => page.evaluate(async () => (await (await import('./js/db.js')).getAll('meta')).find((m) => m.id === 'learn') || null);
// уроки-черновики (вопросы ещё не проверены машинистом) видны только с этой отметкой
const drafts = (page) => page.evaluate(() => localStorage.setItem('cabina-learn-drafts', '1'));
// «Обучение» — своя вкладка внизу (2.21.11, справа от «Главной»); нажатие на открытую вкладку перерисовывает экран
async function openLearn(page) {
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
}
async function openRoad(page) {
  await page.locator('.lr-course-main').click();
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node');
}
// ответить на вопрос урока: верно или неверно (варианты перемешаны — ищем по тексту)
async function answer(page, right) {
  const info = await page.evaluate(async () => {
    const { QUESTIONS } = await import('./js/learn/pte-q01.js');
    const q = QUESTIONS.find((x) => x.text === document.querySelector('.lp-q').textContent);
    return { id: q.id, right: q.options[q.answer] };
  });
  const opts = page.locator('.lp-opt');
  const n = await opts.count();
  let picked = false;
  for (let i = 0; i < n && !picked; i++) {
    const t = (await opts.nth(i).locator('.lp-opt-t').innerText()).trim();
    if ((t === info.right) === right) { await opts.nth(i).click(); picked = true; }
  }
  assert.ok(picked);
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector(right ? '.lp-foot.ok' : '.lp-foot.bad');
  return info.id;
}
const next = (page) => page.locator('[data-lp=next]').click();
// записать состояние «Обучения» напрямую (как будто человек занимался раньше)
const seedLearn = (page, st) => page.evaluate(async (st) => {
  const L = await import('./js/learn-state.js');
  const s = await import('./js/store.js');
  await s.saveLearn(L.normalizeLearn({ ...L.emptyLearn(), ...st }));
}, st);
const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test('«Обучение» — своя вкладка справа от «Главной»; урок без проверки машинистом виден только проверяющему', async () => {
  const { context, page, errors } = await openApp(env);
  // в «Ещё» строки «Обучение» нет — всё обучение во вкладке
  await page.locator('.tab[data-tab=extra]').click();
  assert.equal(await page.locator('#extra-list > .row[data-key=learn]').count(), 0);
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  assert.equal(await page.locator('.tab[data-tab=learn]').getAttribute('aria-current'), 'page');
  // экран вкладки: без «Назад», справа — магазин
  assert.equal(await page.locator('.screen .page-head [data-act=back]').count(), 0);
  assert.match(await page.locator('.screen .page-head').innerText(), /^Обучение$/);
  assert.equal(await page.locator('.screen .page-head [data-act=lr-shop]').count(), 1);
  assert.match(await page.locator('.lr-course').innerText(), /Твой курс[\s\S]*ПТЭ[\s\S]*Правила технической эксплуатации[\s\S]*Пройдено 0%[\s\S]*Все модули/i);
  assert.match(await page.locator('.lr-pills').innerText(), /0\s*дней[\s\S]*0[\s\S]*∞/);
  const gate = await page.evaluate(async () => {
    const { PTE } = await import('./js/learn/pte.js');
    const { QUESTIONS } = await import('./js/learn/pte-q01.js');
    const l = PTE.modules[0].topics[0].lessons[0];
    return { draft: !!l.draft, checked: l.q.every((id) => QUESTIONS.find((q) => q.id === id)?.checked) };
  });
  if (gate.draft) {
    assert.match(await page.locator('.lr-next').innerText(), /Первые уроки скоро/i);
    assert.equal(await page.locator('[data-act=lr-start]').count(), 0, 'черновик начать нельзя');
  } else {
    assert.ok(gate.checked, 'урок открыт для всех — значит, все его вопросы проверены');
    assert.match(await page.locator('.lr-next').innerText(), /Что такое ПТЭ/);
  }
  // проверяющему черновики видны
  await drafts(page);
  await openLearn(page);
  await page.waitForSelector('.lr-next [data-act=lr-start]');
  assert.match(await page.locator('.lr-next').innerText(), /Начните с первого урока[\s\S]*Что такое ПТЭ[\s\S]*Урок 1 · 5 вопросов/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test('урок: ошибка уходит в конец и повторяется, время и серия в конце, прогресс — в телефоне', async () => {
  const { context, page, errors } = await openApp(env);
  await drafts(page);
  await openLearn(page);
  await openRoad(page);
  // дорога: модуль, станция, огонь «Начать», путь нарисован, дальше «Путь строится»
  assert.match(await page.locator('.rd-mod').first().innerText(), /Модуль 1[\s\S]*Общие положения/i);
  assert.match(await page.locator('.rd-st').first().innerText(), /Тема 1[\s\S]*Что такое ПТЭ/i);
  assert.equal(await page.locator('.rd-node.is-current').count(), 1);
  assert.match(await page.locator('.rd-start').innerText(), /Начать/i);
  assert.match(await page.locator('.rd-build').innerText(), /Путь строится[\s\S]*Обязанности работников/);
  assert.ok((await page.locator('.rd-svg .rd-rail').getAttribute('d')).length > 10, 'рельсы нарисованы');
  assert.ok((await page.locator('.rd-svg .rd-plan').getAttribute('d')).length > 10, 'строящийся путь нарисован');
  assert.ok(await fits(page));
  // окошко урока
  await page.locator('.rd-node.is-current').click();
  const pop = page.locator('.rd-pop');
  await pop.waitFor();
  assert.match(await pop.innerText(), /Урок 1[\s\S]*Что такое ПТЭ[\s\S]*5 вопросов · 1–2 минуты/i);
  // нажатие мимо окошка — закрывает
  await page.locator('.rd-mod').first().click();
  await pop.waitFor({ state: 'detached' });
  await page.locator('.rd-node.is-current').click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-opt');
  assert.equal(await page.locator('[data-lp=check]').isDisabled(), true, '«Проверить» — только после выбора');

  // 1-й вопрос — неверно
  const first = await answer(page, false);
  const fb = await page.locator('.lp-foot').innerText();
  assert.match(fb, /Неверно[\s\S]*Правильный ответ:[\s\S]*Этот вопрос повторится в конце урока/);
  assert.match(fb, /Где написано:/);
  assert.equal(await page.locator('.lp-opt.is-ok').count(), 1, 'верный вариант подсвечен');
  assert.equal(await page.locator('.lp-opt.is-bad').count(), 1);
  assert.equal(await page.locator('.lp-bar').getAttribute('aria-valuenow'), '0');
  // цитата из документа раскрывается
  await page.locator('.lp-src summary').click();
  assert.match(await page.locator('.lp-src blockquote').innerText(), /^«.+»$/s);
  await next(page);
  // остальные четыре — верно
  const seen = [first];
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector('.lp .lp-opt:not([disabled])');
    seen.push(await answer(page, true));
    assert.match(await page.locator('.lp-foot').innerText(), /Верно!|Правильно!|Точно!/);
    assert.match(await page.locator('[data-lp=next]').innerText(), /Дальше/);
    await next(page);
  }
  assert.equal(new Set(seen).size, 5, 'все пять вопросов по одному разу');
  // ошибка — в конце
  await page.waitForSelector('.lp .lp-opt:not([disabled])');
  assert.match(await page.locator('.lp-kicker').innerText(), /Повтор ошибки/i);
  assert.equal(await answer(page, true), first);
  assert.match(await page.locator('[data-lp=next]').innerText(), /Завершить урок/);
  await next(page);
  await page.waitForSelector('.lp-end');
  const end = await page.locator('.lp-end').innerText();
  assert.match(end, /Урок пройден![\s\S]*Что такое ПТЭ/);
  assert.match(end, /Время\s*\d+:\d\d/i);
  assert.match(end, /С первого раза\s*4 из 5/i);
  assert.match(end, /1\s*день подряд\s*\+1/);
  assert.match(end, /Тема «Что такое ПТЭ» пройдена/);
  assert.ok(await fits(page));

  // прогресс сохранён в телефоне
  const st = await stored(page);
  assert.equal(st.done['pte-l001'].n, 1);
  assert.equal(st.done['pte-l001'].acc, 80);
  assert.ok(st.done['pte-l001'].best >= 1);
  assert.deepEqual(st.days, ['2026-10-20']);
  assert.deepEqual(st.qs[first], { a: 2, w: 1 });
  assert.equal(Object.keys(st.qs).length, 5);

  // «Дальше» — снова дорога: огонь зелёный, табличка «пройдена»
  await page.locator('[data-lp=close]').click();
  await page.waitForSelector('.rd-node.is-done');
  assert.match(await page.locator('.rd-st').first().innerText(), /пройдена/i);
  assert.match(await page.locator('.rd-top .lr-p-streak').innerText(), /1/);
  assert.ok(await page.locator('.rd-top .lr-p-streak.on').count());
  // обратно на экран курса: 1% курса, следующий урок — повторить
  await page.locator('.rd-top [data-act=back]').click();
  await page.waitForSelector('.lr-course');
  assert.match(await page.locator('.lr-prog').innerText(), /Пройдено 1%/);
  assert.match(await page.locator('.lr-next').innerText(), /Все готовые уроки пройдены[\s\S]*Повторить урок/i);
  assert.match(await page.locator('.lr-pills').innerText(), /1\s*день/);
  // с другой вкладки и обратно — тот же экран курса, дорога не открыта
  await page.locator('.tab[data-tab=home]').click();
  await openLearn(page);
  assert.equal(await page.locator('.screen[data-page=learn-road]').count(), 0);
  // после перезапуска всё на месте
  await page.reload(); await page.waitForSelector('.screen');
  await openLearn(page);
  assert.match(await page.locator('.lr-prog').innerText(), /Пройдено 1%/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('выйти из урока можно только с вопросом; «Назад» на телефоне — тоже вопрос', async () => {
  const { context, page, errors } = await openApp(env);
  await drafts(page);
  await openLearn(page);
  // ещё ни одного ответа — закрывается сразу
  await page.locator('.lr-next [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-opt');
  await page.locator('[data-lp=quit]').click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  // после ответа — «Выйти из урока?»
  await page.locator('.lr-next [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-opt');
  await answer(page, true);
  await page.locator('[data-lp=quit]').click();
  await page.waitForSelector('.dialog');
  assert.match(await top(page).innerText(), /Выйти из урока\?[\s\S]*Ответы этого урока не сохранятся/);
  await top(page).getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForSelector('.dialog', { state: 'detached' });
  assert.equal(await page.locator('.lp').count(), 1, 'урок продолжается');
  // системная «Назад» (Android): тот же вопрос, а повторная «Назад» — остаться в уроке
  await page.goBack();
  await page.waitForSelector('.dialog');
  assert.match(await top(page).innerText(), /Выйти из урока\?/);
  await page.goBack();
  await page.waitForSelector('.dialog', { state: 'detached' });
  assert.equal(await page.locator('.lp').count(), 1);
  await page.goBack();
  await page.waitForSelector('.dialog');
  await top(page).getByRole('button', { name: 'Выйти' }).click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  assert.equal(await page.locator('.screen.lr-hub').count(), 1, 'остались на экране «Обучение»');
  // прерванный урок не засчитан, серии нет
  const st = await learnOf(page);
  assert.deepEqual(st.done, {});
  assert.deepEqual(st.days, []);
  // после выхода из урока лишнего шага в истории нет: системная «Назад» уходит с экрана «Обучение», урок не возвращается
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('.screen.lr-hub'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('серия: окно «Ударный режим», магазин, «Все модули», «Пройти курс заново» не трогает серию', async () => {
  const { context, page, errors } = await openApp(env);
  await drafts(page);
  await seedLearn(page, {
    days: days('2026-10-10', 10), freezes: 1, best: 10, sec: 410,
    done: { 'pte-l001': { n: 2, best: 64, last: 70, acc: 60, at: '2026-10-19' } },
    qs: { 'pte-q0001': { a: 3, w: 1 } },
  });
  await openLearn(page);
  assert.match(await page.locator('.lr-pills').innerText(), /10\s*дней[\s\S]*1[\s\S]*∞/);
  // серия
  await page.locator('.lr-pills [data-act=lr-streak]').click();
  let s = top(page);
  await s.locator('.lr-big').waitFor();
  const st = await s.innerText();
  assert.match(st, /Ударный режим[\s\S]*10\s*дней подряд[\s\S]*Пройдите урок сегодня, чтобы продлить серию/);
  assert.match(st, /Лучшая серия\s*10 дней[\s\S]*Заморозки в запасе\s*1 из 2[\s\S]*Всего в уроках\s*6:50/);
  assert.match(st, /каждые 10 дней[\s\S]*подарит заморозку[\s\S]*3 дня подряд/);
  assert.equal(await s.locator('.lr-wd.is-done').count(), 1, 'на этой неделе — понедельник');
  assert.equal(await s.locator('.lr-wd.is-today').count(), 1);
  await s.locator('button[data-close]').first().click();
  // магазин: заморозки не продаются, энергия бесконечная
  await page.locator('.page-head [data-act=lr-shop]').click();
  s = top(page);
  await s.locator('.lr-shop').waitFor();
  const shop = await s.innerText();
  assert.match(shop, /Заморозка серии\s*1 из 2[\s\S]*не продаются[\s\S]*Энергия\s*∞[\s\S]*бесконечная/);
  await s.locator('button[data-close]').first().click();
  // «Все модули»: 18 модулей, 85 тем, тема 1 пройдена, без уроков — «Уроки готовятся»
  await page.locator('.lr-all').click();
  await page.waitForSelector('.lr-mod');
  assert.equal(await page.locator('.lr-mod').count(), 18);
  assert.equal(await page.locator('.lr-topic').count(), 85);
  assert.match(await page.locator('.lr-mods-sub').innerText(), /18 модулей, 85 тем/);
  assert.match(await page.locator('.lr-topic').first().innerText(), /Что такое ПТЭ[\s\S]*Пройдена · 1 урок/);
  await page.locator('.lr-topic.is-soon').first().click();
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Уроки по этой теме готовятся'));
  // тема с уроками — открывает дорогу на её станции
  await page.locator('.lr-topic').first().click();
  await page.waitForSelector('.screen[data-page=learn-road] #rd-pte-t01');
  await page.locator('.rd-top [data-act=back]').click();
  await page.waitForSelector('.lr-mod');
  // заново: отметки курса стёрлись, серия и заморозки остались
  await page.locator('[data-act=lr-reset]').click();
  await top(page).getByRole('button', { name: 'Начать заново' }).click();
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Прогресс курса стёрт'));
  const after = await stored(page);
  assert.deepEqual(after.done, {});
  assert.deepEqual(after.qs, {});
  assert.equal(after.days.length, 10);
  assert.equal(after.freezes, 1);
  assert.equal(after.best, 10);
  assert.equal(await page.locator('[data-act=lr-reset]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('пропуск дня: заморозка и подарок — открыто, с объяснением; сгоревшую серию можно вернуть', async () => {
  const { context, page, errors } = await openApp(env);
  // серия 12 дней, вчера урока не было, заморозок нет → подарок
  await seedLearn(page, { days: days('2026-10-07', 12), freezes: 0, best: 12 });
  await openLearn(page);
  const note = page.locator('.lr-note.gift');
  await note.waitFor();
  assert.match(await note.innerText(), /Вчера не было урока, а заморозок не хватало — CABINA подарила заморозку, и серия цела/);
  assert.match(await page.locator('.lr-pills').innerText(), /12\s*дней/);
  let st = await stored(page);
  assert.deepEqual(st.frozen, ['2026-10-19']);
  assert.equal(st.giftAt, '2026-10-20');
  // «Понятно» — плашка больше не показывается
  await note.locator('[data-act=lr-note-x]').click();
  await note.waitFor({ state: 'detached' });
  await page.reload(); await page.waitForSelector('.screen');
  await openLearn(page);
  assert.equal(await page.locator('.lr-note').count(), 0);

  // серия 9 дней, вчера пропуск, есть заморозка → сработала заморозка
  await seedLearn(page, { days: days('2026-10-10', 9), freezes: 1, best: 9 });
  await openLearn(page);
  await page.locator('.lr-note.froze').waitFor();
  assert.match(await page.locator('.lr-note.froze').innerText(), /Вчера не было урока — серию сохранила заморозка. Осталось: 0 из 2/);

  // серия 15 дней, три дня пропуска, заморозок нет, подарок был недавно → серия сгорела, но её можно вернуть
  await seedLearn(page, { days: days('2026-10-02', 15), freezes: 0, best: 15, giftAt: '2026-10-12' });
  await openLearn(page);
  const rep = page.locator('.lr-repair');
  await rep.waitFor();
  assert.match(await rep.innerText(), /Верните серию 15 дней[\s\S]*Пройдите урок 3 дня подряд — и серия вернётся/);
  assert.match(await page.locator('.lr-pills').innerText(), /0\s*дней/);
  st = await stored(page);
  assert.deepEqual(st.lost, { n: 15, last: '2026-10-16', until: '2026-10-27' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('ввод ответа: число со словами вокруг, опечатка в длинном слове, неверное число', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => {
    const { playLesson } = await import('./js/learn-play.js');
    window.__res = null;
    playLesson({
      title: 'Проверка ввода', kicker: 'Тест',
      questions: [
        { id: 'pte-q9001', type: 'input', text: 'Тестовый вопрос: сколько будет 40 + 40?', prompt: 'Введите число', answer: 80, explain: 'Сорок и сорок — восемьдесят.' },
        { id: 'pte-q9002', type: 'input', text: 'Тестовый вопрос: какое слово написано на этой строке — «переключатель»?', answer: 'переключатель', explain: 'Слово в кавычках.' },
        { id: 'pte-q9003', type: 'input', text: 'Тестовый вопрос: сколько будет 2 + 2?', answer: 4, explain: 'Два и два — четыре.' },
      ],
      finish: async (r) => { window.__res = r; return { first: true, record: false, streak: 1, extended: true, timed: true, acc: 67, sec: r.sec }; },
      onClose: () => {},
    });
  });
  const inp = page.locator('#lp-input');
  await inp.waitFor();
  assert.equal(await inp.getAttribute('inputmode'), 'numeric');
  assert.equal(await page.locator('[data-lp=check]').isDisabled(), true);
  await inp.fill('80 км/ч');
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector('.lp-foot.ok');
  await next(page);
  await page.waitForFunction(() => !document.querySelector('#lp-input')?.readOnly);
  assert.equal(await inp.getAttribute('inputmode'), null, 'для слова — обычная клавиатура');
  await inp.fill('выключатель');
  await inp.press('Enter');
  await page.waitForSelector('.lp-foot.bad');
  assert.match(await page.locator('.lp-foot').innerText(), /Неверно[\s\S]*Правильный ответ:\s*переключатель/);
  await next(page);
  await page.waitForFunction(() => !document.querySelector('#lp-input')?.readOnly);
  await inp.fill('5');
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector('.lp-foot.bad');
  await next(page);
  // повторы ошибок: опечатка в одну букву засчитывается с пометкой
  await page.waitForFunction(() => !document.querySelector('#lp-input')?.readOnly);
  assert.match(await page.locator('.lp-kicker').innerText(), /Повтор ошибки/i);
  await inp.fill('переключатль');
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector('.lp-foot.ok');
  assert.match(await page.locator('.lp-foot').innerText(), /Есть опечатка, правильно:\s*переключатель/);
  await next(page);
  await page.waitForFunction(() => !document.querySelector('#lp-input')?.readOnly);
  await inp.fill('четыре');
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector('.lp-foot.bad');
  await next(page);
  await page.waitForFunction(() => !document.querySelector('#lp-input')?.readOnly);
  await inp.fill('4');
  await page.locator('[data-lp=check]').click();
  await page.waitForSelector('.lp-foot.ok');
  await next(page);
  await page.waitForSelector('.lp-end');
  const res = await page.evaluate(() => window.__res);
  assert.equal(res.total, 3);
  assert.equal(res.firstOk, 1);
  assert.equal(res.answers.length, 6);
  assert.match(await page.locator('.lp-end').innerText(), /С первого раза\s*1 из 3/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px, светлая тема, очень крупный текст: всё помещается', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  await drafts(page);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ theme: 'light', textSize: 'xl' }); });
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.text), 'xl');
  await openLearn(page);
  assert.ok(await fits(page), 'экран «Обучение»');
  await openRoad(page);
  assert.ok(await fits(page), 'дорога');
  await page.locator('.rd-node.is-current').click();
  const pop = await page.locator('.rd-pop').boundingBox();
  assert.ok(pop.x >= 0 && pop.x + pop.width <= 320, 'окошко урока в пределах экрана');
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-opt');
  assert.ok(await fits(page), 'урок');
  await answer(page, false);
  const go = await page.locator('[data-lp=next]').boundingBox();
  assert.ok(go.y + go.height <= 640, 'кнопка «Дальше» видна без прокрутки');
  await page.locator('[data-lp=quit]').click();
  await top(page).getByRole('button', { name: 'Выйти' }).click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  await page.locator('.rd-top [data-act=back]').click();
  await page.locator('.lr-all').click();
  await page.waitForSelector('.lr-mod');
  assert.ok(await fits(page), '«Все модули»');
  assert.deepEqual(errors, []);
  await context.close();
});

test('резервная копия: прогресс обучения переносится, а мусор из копии отбрасывается', async () => {
  const one = await openApp(env);
  await seedLearn(one.page, { days: days('2026-10-15', 6), freezes: 1, best: 6, done: { 'pte-l001': { n: 1, best: 80, last: 80, acc: 100, at: '2026-10-19' } } });
  await openSettings(one.page, 'set-data');
  await one.page.locator('[data-act=export]').click();
  const [download] = await Promise.all([one.page.waitForEvent('download'), top(one.page).getByRole('button', { name: 'Сохранить копию' }).click()]);
  const file = join(await mkdtemp(join(tmpdir(), 'cabina-')), download.suggestedFilename());
  await download.saveAs(file);
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const rec = payload.data.meta.find((m) => m.id === 'learn');
  assert.equal(rec.freezes, 1);
  assert.equal(rec.days.length, 6);
  await one.context.close();

  // подправленная копия: чужие поля и опасный текст в обучении не восстанавливаются
  rec.freezes = 99;
  rec.done['<img src=x onerror="window.__pwned=1">'] = { n: 1, best: 1, last: 1, acc: 100, at: '2026-10-19' };
  rec.note = { k: '<b>x</b>', n: 1, left: 0, at: '2026-10-20' };
  rec.extra = 'лишнее';
  const two = await openApp(env);
  await openSettings(two.page, 'set-data');
  await two.page.locator('#bk-import').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await top(two.page).getByRole('button', { name: 'Восстановить' }).click();
  await two.page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Данные восстановлены'));
  const st = await learnOf(two.page);
  assert.equal(st.freezes, 2, 'не больше двух заморозок');
  assert.deepEqual(Object.keys(st.done), ['pte-l001']);
  assert.equal(st.note, null);
  assert.equal(st.extra, undefined);
  assert.equal(st.days.length, 6);
  await openLearn(two.page);
  assert.match(await two.page.locator('.lr-pills').innerText(), /6\s*дней/);
  assert.equal(await two.page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(two.errors, []);
  await two.context.close();
});
