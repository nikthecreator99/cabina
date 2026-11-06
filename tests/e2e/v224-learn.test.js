// Браузерные проверки CABINA 2.24.0 (просьбы Никиты 06.11.2026, по его макетам): новый вид «Обучения».
// Вкладка слева от «Профиля» и помнит, где человек остановился; дорога курса вниз без страниц; очки опыта и монеты за уроки;
// сундуки на дороге; магазин (сверху — заморозки, ниже — купить за монеты); профиль обучения; «Урок завершён!» и «Поделиться».
// Всё — только в телефоне: на сервер ничего не уходит. Данные ниже выдуманные.
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
const stored = (page) => page.evaluate(async () => (await (await import('./js/db.js')).getAll('meta')).find((m) => m.id === 'learn') || null);
const statLabels = (page) => page.locator('.lr-stats').first().locator('.lr-st').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
// числа — с пробелом между тысячами (неразрывным: «12 345» не переносится)
const statNums = (page) => page.locator('.lr-stats').first().locator('.lr-st b').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s/g, ' ')));
// прогресс «Обучения» напрямую (как будто человек занимался раньше); n — сколько первых уроков курса пройдено
const seedLearn = (page, st, n = 0) => page.evaluate(async ({ st, n }) => {
  const L = await import('./js/learn-state.js');
  const { PTE } = await import('./js/learn/pte.js');
  const s = await import('./js/store.js');
  const done = { ...(st.done || {}) };
  for (const x of L.lessonsOf(PTE, {}).slice(0, n)) done[x.lesson.id] ||= { n: 1, best: 60, last: 60, acc: 100, at: '2026-10-19' };
  await s.saveLearn(L.normalizeLearn({ ...L.emptyLearn(), ...st, done }));
}, { st, n });
async function openLearn(page) {
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course, .screen[data-page=learn-road] .rd-node');
}
async function openRoad(page) {
  await page.locator('.lr-course-main').click();
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node');
}
// текущий урок виден между шапкой дороги и нижним меню
const inView = (page, sel) => page.evaluate((sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  const head = document.querySelector('.rd-top')?.getBoundingClientRect().bottom || 0;
  const foot = document.querySelector('.tabbar')?.getBoundingClientRect().top || window.innerHeight;
  return !!r && r.top >= head - 1 && r.bottom <= foot + 1;
}, sel);
// пройти открытый урок: верно на всё (или первый вопрос — неверно); в конце ждём, пока итоги «набегут» (2.24.1)
async function passLesson(page, { wrongFirst = false } = {}) {
  for (let k = 0; k < 20; k++) {
    if (await page.locator('.lp-end').count()) break;
    const right = await page.evaluate(async () => {
      const { PTE } = await import('./js/learn/pte.js');
      const t = document.querySelector('.lp-q')?.textContent;
      for (const m of PTE.modules) {
        if (!m.bank) continue;
        const q = (await m.bank()).QUESTIONS.find((x) => x.text === t);
        if (q) return q.type === 'choice' ? { opt: q.options[q.answer] } : { val: String(q.answer) };
      }
      return null;
    });
    assert.ok(right, 'вопрос из курса');
    const wrong = k === 0 && wrongFirst;
    if (right.val != null) await page.locator('#lp-input').fill(wrong ? '-1' : right.val);
    else {
      const opts = page.locator('.lp-opt');
      const n = await opts.count();
      for (let i = 0; i < n; i++) {
        if (((await opts.nth(i).locator('.lp-opt-t').innerText()).trim() === right.opt) !== wrong) { await opts.nth(i).click(); break; }
      }
    }
    await page.locator('[data-lp=check]').click();
    await page.waitForSelector('.lp-foot.ok, .lp-foot.bad');
    await page.locator('[data-lp=next]').click();
    await page.waitForFunction(() => document.querySelector('.lp-end') || !document.querySelector('.lp-foot.ok, .lp-foot.bad'));
  }
  await page.waitForSelector('.lp-end.is-counted');
}

test('вкладки: Главная · Ещё · Обучение · Профиль; «Обучение» помнит дорогу и открывает её у текущего урока', async () => {
  const { context, page, errors } = await openApp(env);
  assert.deepEqual(await page.locator('.tabbar .tab').evaluateAll((els) => els.map((e) => e.dataset.tab)), ['home', 'extra', 'learn', 'profile']);
  await seedLearn(page, { days: ['2026-10-19'], best: 1 }, 30);
  await openLearn(page);
  assert.equal(await page.locator('.screen.lr-hub').count(), 1, 'в первый раз — экран курса');
  await openRoad(page);
  await page.waitForFunction(() => window.scrollY > 300);
  assert.ok(await inView(page, '.rd-node.is-current'), 'дорога прокручена к текущему уроку');
  assert.match(await page.locator('.rd-node.is-current').getAttribute('aria-label'), /^Урок \d+\. .+\. Можно начать$/);
  // ушли на «Главную» и вернулись — снова дорога, у того же урока
  await page.locator('.tab[data-tab=home]').click();
  await page.waitForSelector('.screen.home, .screen:not(.lr-hub):not([data-page=learn-road])');
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node.is-current');
  await page.waitForFunction(() => window.scrollY > 300);
  assert.ok(await inView(page, '.rd-node.is-current'));
  // после перезапуска приложения — тоже
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node.is-current');
  await page.waitForFunction(() => window.scrollY > 300);
  assert.ok(await inView(page, '.rd-node.is-current'));
  // вышли с дороги «Назад» — в следующий раз экран курса
  await page.locator('.rd-top [data-act=back]').click();
  await page.waitForSelector('.screen.lr-hub');
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  assert.equal(await page.locator('.screen[data-page=learn-road]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('дорога: модули, станции, уроки и сундуки по порядку; закрытый урок и сундук — подсказка; «Путь строится» в конце', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, {}, 3);
  await openLearn(page);
  await openRoad(page);
  const road = page.locator('#rd');
  // порядок: щит модуля 1 → станция темы 1 → урок 1 → … → урок 3 → сундук
  const seq = await road.evaluate((el) => [...el.querySelectorAll('.rd-mod, .rd-board, .rd-node, .rd-chest')].slice(0, 8).map((n) => n.className.split(' ')[0]));
  assert.deepEqual(seq, ['rd-mod', 'rd-board', 'rd-node', 'rd-board', 'rd-node', 'rd-board', 'rd-node', 'rd-chest']);
  assert.equal(await road.locator('.rd-node.is-done').count(), 3);
  assert.equal(await road.locator('.rd-node.is-current').count(), 1);
  assert.equal(await road.locator('.rd-node').count(), 120, 'весь курс одной дорогой, без страниц');
  assert.equal(await road.locator('.rd-chest').count(), 23);
  assert.equal(await road.locator('.rd-chest.is-ready').count(), 1);
  // шапка: курс, серия, монеты, опыт и модуль текущего урока (урок 4 — уже модуль 2)
  assert.match(await page.locator('.rd-top').innerText(), /Обучение[\s\S]*ПТЭ[\s\S]*Модуль 2 · ПТЭ, разделы III–IV[\s\S]*Сооружения и устройства[\s\S]*0 из 5 уроков/);
  // закрытый урок — «Сначала пройдите уроки до этого»
  await road.locator('.rd-node.is-locked').first().scrollIntoViewIfNeeded();
  await road.locator('.rd-node.is-locked').first().click();
  await page.locator('.rd-pop').waitFor();
  assert.match(await page.locator('.rd-pop').innerText(), /Урок 2 из 2\s*Габариты и междупутья[\s\S]*Откроется, когда пройдёте уроки до него/i);
  assert.equal(await page.locator('.rd-pop [data-act=lr-start]').count(), 0, 'закрытый урок не начать');
  // закрытый сундук — что внутри и когда откроется
  await road.locator('.rd-chest.is-locked').first().scrollIntoViewIfNeeded();
  await road.locator('.rd-chest.is-locked').first().click();
  await page.waitForFunction(() => /Внутри — 30 монет[\s\S]*Откроется, когда пройдёте все уроки до него/.test(document.querySelector('.rd-pop')?.innerText || ''));
  // шапка показывает модуль, мимо которого едем
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.rd-mod[data-mod="5"]').getBoundingClientRect().top + window.scrollY - 200));
  await page.waitForFunction(() => /Модуль 5/.test(document.getElementById('rd-mc-k')?.textContent || ''));
  // в конце дороги — модуль, где уроков ещё нет: «Путь строится»
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  assert.match(await road.locator('.rd-build').last().innerText(), /Путь строится/i);
  assert.equal(await road.locator('.rd-end').count(), 0);
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('сундук: после пройденных уроков открывается один раз — +30 монет, числа наверху добегают', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, { coins: 40, xp: 45 }, 3);
  await openLearn(page);
  assert.deepEqual(await statNums(page), ['0', '40', '45']);
  await openRoad(page);
  const chest = page.locator('.rd-chest.is-ready');
  assert.equal(await chest.getAttribute('data-id'), 'pte-t03');
  assert.match(await chest.getAttribute('aria-label'), /откройте — внутри 30 монет/);
  await chest.scrollIntoViewIfNeeded();
  await chest.click();
  await page.waitForSelector('.rd-chest.is-open.rd-opened .rd-fx');
  assert.match(await page.locator('.rd-chest.rd-opened .rd-fx').innerText(), /\+30/);
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Сундук открыт: +30 монет'));
  await page.waitForFunction(() => document.querySelector('.rd-top .lr-st-coin b')?.textContent === '70');
  let st = await stored(page);
  assert.equal(st.coins, 70);
  assert.deepEqual(st.chests, ['pte-t03']);
  // второй раз — не открывается, только подсказка
  await page.locator('.rd-chest.is-open').click();
  await page.waitForFunction(() => /Уже открыт/.test(document.querySelector('.rd-pop')?.innerText || ''));
  st = await stored(page);
  assert.equal(st.coins, 70);
  // после перезапуска сундук открыт
  await page.reload(); await page.waitForSelector('.screen');
  await openLearn(page);
  await page.waitForSelector('.rd-chest[data-id="pte-t03"].is-open');
  assert.equal(await page.locator('.rd-chest.is-ready').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('магазин: сверху — сколько заморозок, ниже — купить за 100 монет; больше двух не купить, без монет — не купить', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, { coins: 250 });
  await openLearn(page);
  // монеты наверху открывают магазин
  await page.locator('.lr-stats [data-act=lr-shop]').click();
  let s = top(page);
  await s.locator('.lr-shop').waitFor();
  assert.match(await s.locator('.lr-shop-top').innerText(), /Заморозки: 0 из 2[\s\S]*Сохраняют серию[\s\S]*У вас\s*250 монет/);
  assert.equal(await s.locator('.lr-frz-s.on').count(), 0);
  const buy = s.locator('[data-shop=buy]');
  assert.match(await buy.innerText(), /100/);
  await buy.click();
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Заморозка куплена. В запасе: 1 из 2'));
  await page.waitForFunction(() => /Заморозки: 1 из 2/.test(document.querySelector('.lr-shop-top')?.innerText || ''));
  assert.match(await s.locator('.lr-wallet').innerText(), /150 монет/);
  assert.equal(await s.locator('.lr-frz-s.on').count(), 1);
  await s.locator('[data-shop=buy]').click();
  await page.waitForFunction(() => /Заморозки: 2 из 2/.test(document.querySelector('.lr-shop-top')?.innerText || ''));
  assert.equal(await s.locator('[data-shop=buy]').isDisabled(), true);
  assert.match(await s.locator('.lr-why').innerText(), /В запасе уже 2 — больше не нужно/);
  let st = await stored(page);
  assert.deepEqual([st.freezes, st.coins], [2, 50]);
  // как заработать — открыто; монеты за деньги не продаются
  assert.match(await s.locator('.lr-earn').innerText(), /Новый урок\s*\+10[\s\S]*Повтор пройденного урока\s*\+5[\s\S]*без единой ошибки\s*\+5[\s\S]*Сундук на дороге курса\s*\+30[\s\S]*за деньги не продаются/);
  assert.ok(await fits(page));
  await s.locator('button[data-close]').first().click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  assert.equal((await statNums(page))[1], '50');
  // одна заморозка, монет мало — «Не хватает …»
  await seedLearn(page, { coins: 60, freezes: 1 });
  await page.reload(); await page.waitForSelector('.screen');
  await openLearn(page);
  await page.locator('.page-head [data-act=lr-shop]').click();
  s = top(page);
  await s.locator('.lr-shop').waitFor();
  assert.equal(await s.locator('[data-shop=buy]').isDisabled(), true);
  assert.match(await s.locator('.lr-why').innerText(), /Не хватает 40 монет/);
  st = await stored(page);
  assert.deepEqual([st.freezes, st.coins], [1, 60]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('профиль обучения: опыт всего и за неделю, лига — позже и по согласию, статистика, опыт по дням', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ name: 'Тест Тестов' }); });
  await seedLearn(page, {
    days: ['2026-10-18', '2026-10-19', '2026-10-20'], best: 4, freezes: 1, sec: 640, xp: 145, coins: 95,
    xpDays: { '2026-10-18': 50, '2026-10-19': 30, '2026-10-20': 25 },
    qs: { 'pte-q0001': { a: 3, w: 1 }, 'pte-q0002': { a: 1, w: 0 } },
    done: { 'pte-l001': { n: 1, best: 70, last: 70, acc: 100, at: '2026-10-19' }, 'pte-l002': { n: 1, best: 90, last: 90, acc: 60, at: '2026-10-20' } },
  });
  await openLearn(page);
  assert.deepEqual(await statLabels(page), ['Серия: 3 дня, сегодня урок пройден', 'Монеты: 95 монет. Магазин', 'Опыт: 145 очков опыта']);
  // молния (опыт) — профиль обучения
  await page.locator('.lr-stats .lr-st-xp').click();
  await page.waitForSelector('.screen[data-page=learn-me] .lm-xp');
  assert.match(await page.locator('.page-head').innerText(), /Профиль обучения/);
  assert.match(await page.locator('.lm-hero').innerText(), /Тест Тестов[\s\S]*Курс ПТЭ · пройдено 2%/);
  assert.match(await page.locator('.lm-xp').innerText(), /145\s*очков опыта[\s\S]*\+55\s*за эту неделю/, 'неделя — с понедельника 19 октября');
  assert.match(await page.locator('.lm-league').innerText(), /Лига коллег\s*скоро[\s\S]*только по вашему согласию[\s\S]*только в этом телефоне/i);
  const grid = await page.locator('.lm-grid').innerText();
  for (const re of [/3 дня\s*серия/, /4 дня\s*лучшая серия/, /95\s*монет/, /1 из 2\s*заморозки в запасе/, /2 из 120\s*уроков пройдено/,
    /2 из 85\s*тем пройдено/, /75%\s*верных ответов/, /10:40\s*всего в уроках/, /3\s*дня с уроками/, /4\s*ответа/]) assert.match(grid, re);
  // опыт за неделю: 7 столбцов, подписано только сегодня; нажатие на столбец — сколько опыта в тот день
  assert.equal(await page.locator('.lm-week [data-bar]').count(), 7);
  assert.equal(await page.locator('.lm-week .bar').count(), 2);
  assert.deepEqual(await page.locator('.lm-week .bar-v').allTextContents(), ['25']);
  await page.locator('.lm-week [data-bar="0"]').click();
  assert.equal(await page.locator('.lm-week .chart-tip').innerText(), 'понедельник, 19 октября: 30 очков опыта');
  await page.locator('.lm-week [data-bar="5"]').click();
  assert.equal(await page.locator('.lm-week .chart-tip').innerText(), 'суббота, 24 октября: ещё впереди');
  assert.match(await page.locator('.lm-week svg').getAttribute('aria-label'), /^Опыт за эту неделю: понедельник, 19 октября: 30 очков опыта; вторник, 20 октября: 25 очков опыта/);
  // трудный урок — повторить
  assert.match(await page.locator('[data-act=lr-start]').innerText(), /Повторить трудный урок[\s\S]*Обязанности работников · урок 1 · с первого раза 60%/);
  assert.match(await page.locator('.lm-foot').innerText(), /только в этом телефоне и в резервной копии. На сервер не уходят и работодателю не показываются/);
  assert.ok(await fits(page));
  // «Назад» — на экран курса
  await page.locator('.page-head [data-act=back]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  // кубок справа — тоже профиль обучения
  await page.locator('.lr-cup').click();
  await page.waitForSelector('.screen[data-page=learn-me]');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Урок завершён!»: опыт, точность, время, монеты и серия; «Поделиться» — только урок, точность и время; «Забрать опыт»', async () => {
  const { context, page, errors } = await openApp(env);
  await openLearn(page);
  await openRoad(page);
  await page.locator('.rd-node.is-current').click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-q');
  await passLesson(page);
  const end = await page.locator('.lp-end').innerText();
  assert.match(end, /Урок завершён![\s\S]*Отлично! Движемся дальше/);
  assert.match(end, /Очки опыта\s*\+15/i, 'новый урок без ошибок: 10 + 5');
  assert.match(end, /Точность\s*100%/i);
  assert.match(end, /Время\s*\d+:\d\d/i);
  assert.match(end, /Монеты\s*\+15[\s\S]*Серия: 1 день\s*\+1[\s\S]*Тема «Что такое ПТЭ» пройдена/);
  assert.ok(await fits(page));
  // «Поделиться»: системное окно телефона
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  await page.locator('[data-lp=share]').click();
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => window.__shared);
  assert.match(shared.text, /^Урок «Что такое ПТЭ» по ПТЭ в CABINA пройден: точность 100%, время \d+:\d\d\.$/);
  assert.equal(shared.url, 'https://cabina-app.ru/');
  // где «Поделиться» нет — текст копируется
  await page.evaluate(() => {
    window.__clip = null;
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip = t; } }, configurable: true });
  });
  await page.locator('[data-lp=share]').click();
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Текст скопирован — вставьте его в сообщение'));
  assert.match(await page.evaluate(() => window.__clip), /^Урок «Что такое ПТЭ» по ПТЭ в CABINA пройден: точность 100%, время \d+:\d\d\. https:\/\/cabina-app\.ru\/$/);
  // «Забрать опыт» — дорога: урок зелёный, числа наверху добегают до новых
  assert.equal((await page.locator('[data-lp=close]').innerText()).trim(), 'Забрать опыт');
  await page.locator('[data-lp=close]').click();
  await page.waitForSelector('.rd-node.is-done');
  await page.waitForFunction(() => document.querySelector('.rd-top .lr-st-xp b')?.textContent === '15' && document.querySelector('.rd-top .lr-st-coin b')?.textContent === '15');
  assert.ok(await inView(page, '.rd-node.is-current'), 'следующий урок виден');
  const st = await stored(page);
  assert.deepEqual([st.xp, st.coins, st.xpDays], [15, 15, { '2026-10-20': 15 }]);
  // повтор пройденного урока с ошибкой — 5 опыта и 5 монет
  await page.locator('.rd-node.is-done').first().click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-q');
  await passLesson(page, { wrongFirst: true });
  assert.match(await page.locator('.lp-end').innerText(), /Очки опыта\s*\+5[\s\S]*Точность\s*83%/i);
  await page.locator('[data-lp=close]').click();
  await page.waitForFunction(() => document.querySelector('.rd-top .lr-st-xp b')?.textContent === '20');
  assert.deepEqual(errors, []);
  await context.close();
});

// 2.24.1 (просьба Никиты 06.11.2026): блока «Следующий урок» нет — вся карточка курса ведёт к своему уроку
test('экран «Обучение» без «Следующего урока»: вся карточка курса открывает дорогу у своего урока, «Все модули» — список', async () => {
  const { context, page, errors } = await openApp(env);
  await seedLearn(page, {}, 5);
  await openLearn(page);
  assert.equal(await page.locator('.lr-next').count(), 0);
  assert.doesNotMatch(await page.locator('.screen').innerText(), /Следующий урок|Начните с первого урока/);
  assert.equal(await page.locator('.lr-course-main').getAttribute('aria-label'), 'Курс ПТЭ. Продолжить: Переходы, время, АСУ, урок 1');
  // нажатие внизу карточки, на полоску «Пройдено …», — тоже дорога, прокрученная к текущему уроку
  const bar = await page.locator('.lr-prog').boundingBox();
  await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.waitForSelector('.screen[data-page=learn-road] .rd-node.is-current');
  await page.waitForFunction(() => window.scrollY > 300);
  assert.ok(await inView(page, '.rd-node.is-current'));
  assert.equal(await page.locator('.rd-node.is-current').getAttribute('data-id'), 'pte-l006');
  // «Все модули» — поверх карточки, открывает список, а не дорогу
  await page.locator('.rd-top [data-act=back]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  await page.locator('.lr-all').click();
  await page.waitForSelector('.screen[data-page=learn-modules] .lr-mod');
  // все готовые уроки пройдены — карточка так и говорит
  await seedLearn(page, {}, 120);
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.tab[data-tab=learn]').click();
  await page.waitForSelector('.screen.lr-hub .lr-course');
  assert.equal(await page.locator('.lr-course-main').getAttribute('aria-label'), 'Курс ПТЭ: все готовые уроки пройдены. Открыть дорогу курса');
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Урок завершён!»: опыт, точность, время и монеты набегают от нуля примерно за полторы секунды; «Уменьшить движение» — сразу итог', async () => {
  const { context, page, errors } = await openApp(env);
  // как меняются числа итога: каждое новое значение и когда числа встали на место
  const record = () => page.evaluate(() => {
    const seq = { xp: [], acc: [], time: [], coins: [], days: [], t0: 0, t1: 0, busy: false };
    window.__seq = seq;
    const pick = { xp: '.lp-t-xp .lp-cnt', acc: '.lp-t-acc .lp-cnt', time: '.lp-t-time .lp-cnt', coins: '.lp-c-coin .lp-cnt', days: '.lp-c-fire .lp-cnt' };
    const mo = new MutationObserver(() => {
      const end = document.querySelector('.lp-end');
      if (!end || seq.t1) return;
      if (!seq.t0) { seq.t0 = performance.now(); seq.busy = end.getAttribute('aria-busy') === 'true'; }
      for (const [k, sel] of Object.entries(pick)) {
        const v = document.querySelector(sel)?.textContent;
        if (v != null && seq[k][seq[k].length - 1] !== v) seq[k].push(v);
      }
      if (end.classList.contains('is-counted')) { seq.t1 = performance.now(); mo.disconnect(); }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  });
  await openLearn(page);
  await openRoad(page);
  await page.locator('.rd-node.is-current').click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-q');
  await record();
  await passLesson(page);
  let seq = await page.evaluate(() => window.__seq);
  const nums = (a) => a.map((x) => Number(x.replace(/\D/g, '')));
  const rising = (a) => nums(a).every((v, i, n) => !i || v >= n[i - 1]);
  assert.equal(seq.xp[0], '+0');
  assert.equal(seq.xp.at(-1), '+15');
  assert.ok(seq.xp.length >= 6, `опыт набегает по шагам: ${seq.xp.join(' ')}`);
  assert.equal(seq.acc[0], '0%');
  assert.equal(seq.acc.at(-1), '100%');
  assert.ok(seq.acc.length >= 10, `точность набегает: ${seq.acc.length} шагов`);
  assert.equal(seq.time[0], '0:00');
  assert.match(seq.time.at(-1), /^0:\d\d$/);
  assert.equal(seq.coins[0], '+0');
  assert.equal(seq.coins.at(-1), '+15');
  assert.deepEqual(seq.days, ['0 дней', '1 день'], 'серия — с прежней до новой');
  for (const k of ['xp', 'acc', 'time', 'coins']) assert.ok(rising(seq[k]), `${k} только растёт`);
  assert.ok(seq.busy, 'пока числа бегут, экран помечен «занят» для экранного диктора');
  const ms = seq.t1 - seq.t0;
  assert.ok(ms >= 1100 && ms <= 2600, `итоги набегают за ${Math.round(ms)} мс`);
  assert.equal(await page.locator('.lp-end').getAttribute('aria-busy'), null);
  assert.equal(await page.locator('.lp-end .lp-hit').count(), 5, 'каждое число в конце «щёлкает»');
  // в телефоне включено «Уменьшить движение» — сразу итог, без анимации
  await page.locator('[data-lp=close]').click();
  await page.waitForSelector('.rd-node.is-current');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.rd-node.is-current').click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-q');
  await record();
  await passLesson(page);
  seq = await page.evaluate(() => window.__seq);
  assert.deepEqual([seq.xp, seq.acc, seq.coins], [['+15'], ['100%'], ['+15']]);
  assert.equal(seq.busy, false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px, тёмная тема, очень крупный текст и большие числа: всё помещается и не обрезается', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ theme: 'dark', textSize: 'xl' }); });
  await seedLearn(page, { days: ['2026-10-19'], best: 128, xp: 12345, coins: 1234, freezes: 1 }, 3);
  await page.reload(); await page.waitForSelector('.screen');
  const unclipped = (sel) => page.locator(sel).evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  await openLearn(page);
  assert.ok(await fits(page), 'экран курса');
  assert.deepEqual(await statNums(page), ['1', '1 234', '12 345']);
  assert.ok(await unclipped('.lr-stats .lr-st b'), 'числа наверху целиком');
  await openRoad(page);
  assert.ok(await fits(page), 'дорога');
  assert.ok(await unclipped('.rd-top .lr-st b'));
  assert.ok(await unclipped('.rd-bar h1'), '«Обучение» в шапке дороги целиком');
  await page.locator('.rd-top [data-act=lr-shop]').click();
  await top(page).locator('.lr-shop').waitFor();
  assert.ok(await fits(page), 'магазин');
  await top(page).locator('button[data-close]').first().click();
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
  await page.locator('.rd-top [data-act=lr-me]').first().click();
  await page.waitForSelector('.lm-xp');
  assert.ok(await fits(page), 'профиль обучения');
  assert.ok(await unclipped('.lm-xp b'));
  await page.locator('.page-head [data-act=back]').click();
  await page.waitForSelector('.screen[data-page=learn-road]');
  await page.locator('.rd-node.is-current').click();
  await page.locator('.rd-pop [data-act=lr-start]').click();
  await page.waitForSelector('.lp .lp-q');
  await passLesson(page);
  assert.ok(await fits(page), 'конец урока');
  const go = await page.locator('[data-lp=close]').boundingBox();
  assert.ok(go.y + go.height <= 640, '«Забрать опыт» видна без прокрутки');
  assert.ok(await unclipped('.lp-tile b'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('переход с 2.23.0 и резервная копия: опыт за пройденные раньше уроки; опыт, монеты и сундуки переносятся', async () => {
  const one = await openApp(env);
  // прогресс версии 2.23.0 — прямо в базе, без опыта и монет
  await one.page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.put('meta', { id: 'learn', v: 1, done: { 'pte-l001': { n: 2, best: 60, last: 70, acc: 100, at: '2026-10-19' }, 'pte-l002': { n: 1, best: 50, last: 50, acc: 80, at: '2026-10-20' } },
      qs: {}, days: ['2026-10-19', '2026-10-20'], frozen: [], freezes: 0, best: 2, sec: 180 });
  });
  await one.page.reload(); await one.page.waitForSelector('.screen');
  await openLearn(one.page);
  // l001: 10 + 5 (без ошибок) + повтор 5; l002: 10
  assert.deepEqual(await statLabels(one.page), ['Серия: 2 дня, сегодня урок пройден', 'Монеты: 30 монет. Магазин', 'Опыт: 30 очков опыта']);
  await one.page.locator('.lr-stats .lr-st-xp').click();
  await one.page.waitForSelector('.lm-xp');
  assert.match(await one.page.locator('.lm-xp').innerText(), /30\s*очков опыта[\s\S]*\+30\s*за эту неделю/);
  // открыть сундук, купить нечего — затем копия
  await seedLearn(one.page, { xp: 300, coins: 150, xpDays: { '2026-10-20': 40 }, chests: ['pte-t03'], freezes: 1, days: ['2026-10-20'] }, 3);
  await openSettings(one.page, 'set-data');
  await one.page.locator('[data-act=export]').click();
  const [download] = await Promise.all([one.page.waitForEvent('download'), top(one.page).getByRole('button', { name: 'Сохранить копию' }).click()]);
  const file = join(await mkdtemp(join(tmpdir(), 'cabina-')), download.suggestedFilename());
  await download.saveAs(file);
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const rec = payload.data.meta.find((m) => m.id === 'learn');
  assert.deepEqual([rec.v, rec.xp, rec.coins, rec.chests, rec.xpDays], [2, 300, 150, ['pte-t03'], { '2026-10-20': 40 }]);
  await one.context.close();
  // подправленная копия: опыт и монеты — в своих пределах, чужие сундуки — только с безопасными id
  rec.coins = -5;
  rec.chests = ['pte-t03', '<img src=x onerror="window.__pwned=1">'];
  const two = await openApp(env);
  await openSettings(two.page, 'set-data');
  await two.page.locator('#bk-import').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await top(two.page).getByRole('button', { name: 'Восстановить' }).click();
  await two.page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('Данные восстановлены'));
  const st = await two.page.evaluate(async () => (await import('./js/store.js')).S.learn);
  assert.deepEqual([st.xp, st.coins, st.chests, st.xpDays], [300, 0, ['pte-t03'], { '2026-10-20': 40 }]);
  await openLearn(two.page);
  assert.deepEqual(await statNums(two.page), ['1', '0', '300']);
  assert.equal(await two.page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(two.errors, []);
  await two.context.close();
});
