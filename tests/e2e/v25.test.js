// Браузерные проверки CABINA 2.5: явка заранее, вид движения, ожидание над следованием, учёба,
// заработок по среднему, настройки, медкомиссия в отвлечении, «Пропустить» в подсказках. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const store = (page, fn) => page.evaluate(fn);
const PAY = { assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
async function workPage(page, name) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  if (name) await page.locator(`.screen [data-act=go][data-page=${name}]`).click();
}

test('явка заранее: «Ждёт явки», «До явки осталось» на главном, «Скоро явка» в профиле, не больше 3 суток', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  await f.locator('#tf-sd').fill('2026-10-21');
  await f.locator('#tf-st').fill('06:00');
  assert.match(await f.locator('#tf-end-hint').innerText(), /Явка ещё не наступила/);
  assert.match(await text(f, '#tf-calc'), /До явки осталось\s+18 ч 00 мин/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const ban = await text(page, '.rest-banner.pending');
  assert.match(ban, /До явки осталось 18 ч/);
  assert.match(ban, /Явка завтра, 06:00/);
  assert.match(await text(page, '.trip'), /Явка в 06:00[\s\S]*Ждёт явки/);
  // в часы месяца не попадает
  assert.match(await text(page, '.hero'), /0ч00мин/);
  await tab(page, 'profile');
  assert.match(await text(page, '#pr-status'), /Скоро явка/);
  assert.match(await text(page, '.profile-tiles'), /0\s+поездок в октябре/, 'до явки поездка в счёт не идёт');
  // вторая открытая поездка невозможна, а явка дальше 3 суток — ошибка
  await tab(page, 'home');
  await page.locator('.trip').first().click();
  assert.match(await text(sheet(page), '.sheet-head, .sheet h2, h2'), /Ждёт явки/);
  assert.equal(await sheet(page).locator('[data-act=finish-now]').count() === 0 || await sheet(page).locator('[data-act=finish-now]').isHidden(), true, '«Завершить» до явки не показывается');
  await sheet(page).locator('#tf-sd').fill('2026-10-24');
  await sheet(page).locator('#tf-st').fill('13:00');
  await sheet(page).locator('[data-act=save-trip]').click();
  assert.match(await text(sheet(page), '[data-error]'), /не больше чем за 3 суток/);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // время явки наступило — поездка сама «в пути»
  await page.clock.setFixedTime(new Date('2026-10-21T07:00:00+03:00'));
  await page.reload();
  await page.waitForSelector('.screen');
  assert.equal(await page.locator('.rest-banner.pending').count(), 0);
  assert.match(await text(page, '.trip'), /В пути/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test('вид движения: список из трёх, запоминается последний, резерв — отдельной строкой в зарплате и в статистике', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { settings: { pay: PAY } });
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  assert.match(await text(f, '#tf-kind'), /Грузовой/);
  assert.equal(await f.locator('#tf-kind-list').isHidden(), true);
  // кнопка — перед типом локомотива
  const kb = await f.locator('#tf-kind').boundingBox();
  const lb = await f.locator('#tf-lt').boundingBox();
  assert.ok(kb.y < lb.y, '«Вид движения» выше типа локомотива');
  await f.locator('#tf-kind').click();
  assert.deepEqual((await f.locator('#tf-kind-list [data-kind]').allInnerTexts()).map((s) => s.split('\n')[0].trim()), ['Грузовой', 'Пассажирский', 'Резерв']);
  await f.locator('#tf-kind-list [data-kind=reserve]').click();
  assert.equal(await f.locator('#tf-kind-list').isHidden(), true);
  assert.match(await text(f, '#tf-kind'), /Резерв/);
  await f.locator('#tf-sd').fill('2026-10-14');
  await f.locator('#tf-st').fill('08:00');
  await f.locator('#tf-et').fill('11:00');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = await store(page, async () => (await import('./js/store.js')).S.trips[0]);
  assert.equal(t.kind, 'reserve');
  // следующая поездка — сразу «Резерв»
  await page.locator('[data-act=add-trip]').click();
  assert.match(await text(sheet(page), '#tf-kind'), /Резерв/);
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // статистика: строка «Резервом»
  await page.locator('.hero').click();
  await page.waitForSelector('#st-kind');
  assert.match(await text(page, '.screen'), /Резервом\s+1 поездка\s+3 ч/);
  await page.locator('#st-kind button').nth(1).click();
  assert.match(await text(page, '.screen'), /Следование резервом[\s\S]*900/);
  assert.doesNotMatch(await text(page, '.screen'), /Оплата по тарифу/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ожидание следования: блок выше следования пассажиром, окончание подставляется из начала следования', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  await f.locator('[data-act=add-pass]').click();
  const pass = f.locator('#tf-pass .interval').last();
  await pass.locator('[data-pf=st]').fill('14:30');
  await pass.locator('[data-pf=et]').fill('16:00');
  await f.locator('#tf-add-wait').click();
  const w = f.locator('.interval.wait');
  assert.equal(await w.locator('[data-pf=et]').inputValue(), '14:30');
  const wy = (await w.boundingBox()).y;
  const py = (await f.locator('#tf-pass').boundingBox()).y;
  assert.ok(wy < py, 'ожидание выше следования пассажиром');
  assert.ok((await f.locator('#tf-add-wait').boundingBox()).y < py, 'кнопка ожидания тоже выше');
  await w.locator('[data-pf=st]').fill('12:00');
  assert.match(await text(f, '#tf-calc'), /В том числе ожидание следования\s+2 ч 30 мин/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.deepEqual(errors, []);
  await context.close();
});

test('учёба: вычитается из нормы с расшифровкой, предлагает указать средний за день, строка в зарплате', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { settings: { pay: PAY } });
  await page.locator('[data-act=absences]').click();
  await sheet(page).locator('[data-type=study]').click();
  await page.fill('#af-start', '2026-10-30');
  await page.fill('#af-end', '2026-11-05');
  const calc = await text(sheet(page), '#af-hours');
  assert.match(calc, /Из нормы вычтется\s+31 ч/);
  assert.match(calc, /8 \+ 8 \+ 7 \+ 8, выходные и праздник — 0/);
  await sheet(page).locator('[data-act=save-abs]').click();
  const dlg = sheet(page);
  await dlg.getByRole('button', { name: 'Указать' }).click();
  await page.waitForSelector('#pf-studyDay');
  // экран сам прокручивается к «Учёбе»
  await page.waitForFunction(() => { const r = document.querySelector('#pay-study').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 });
  await page.fill('#pf-studyDay', '3500');
  await page.locator('#pf-studyDay').blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.pay.assistant?.studyDay === 3500);
  await tab(page, 'home');
  assert.match(await text(page, '.hero'), /Норма: 168 ч/, 'в октябре из 31 ч только 30-е, 8 ч: 176 − 8');
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  assert.match(await text(page, '.screen'), /Учёба \(сессия\)[\s\S]*7\s000/, '2 дня октября × 3 500');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Как считать заработок»: по среднему за час — свои поля, ставки сохраняются, в зарплате одна строка', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { settings: { pay: PAY }, trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await workPage(page, 'tariffs');
  const seg = page.locator('#pay-mode button');
  assert.deepEqual(await seg.allInnerTexts(), ['По тарифной ставке', 'По среднему за час']);
  assert.equal(await seg.first().getAttribute('aria-pressed'), 'true');
  // мода выше ставок
  assert.ok((await page.locator('#pay-mode').boundingBox()).y < (await page.locator('#pf-rate').boundingBox()).y);
  assert.equal(await page.locator('#pf-oklad').count(), 0, 'оклад теперь в «Карьере»');
  await seg.nth(1).click();
  await page.waitForSelector('#pay-avg');
  assert.equal(await page.locator('#pf-rate').count(), 0);
  assert.match(await text(page, '#pay-avg'), /техучёбу[\s\S]*Упрощённо/);
  await page.fill('#pf-avgHour', '600');
  await page.locator('#pf-avgHour').blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.pay.assistant?.avgHour === 600);
  await tab(page, 'home');
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  const s = await text(page, '.screen');
  assert.match(s, /Заработок по среднему[\s\S]*2\s400/);
  assert.doesNotMatch(s, /Оплата по тарифу|Премия/);
  // обратно — ставка на месте
  await workPage(page, 'tariffs');
  await page.locator('#pay-mode button').first().click();
  await page.waitForSelector('#pf-rate');
  assert.equal(await page.locator('#pf-rate').inputValue(), '300');
  assert.deepEqual(errors, []);
  await context.close();
});

test('настройки: новый порядок, календарь и часовой пояс — одной строкой с окном', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  const titles = (await page.locator('.screen .group-title').allInnerTexts()).map((s) => s.trim().toLowerCase());
  assert.deepEqual(titles, ['оформление', 'профиль', 'данные и резервная копия', 'производственный календарь', 'часовой пояс', 'установка на экран', 'о приложении']);
  assert.equal(await page.locator('#tz').count(), 0, 'длинного списка в самих настройках нет');
  assert.match(await text(page, '#tz-row'), /Москва \(МСК\)/);
  await page.locator('#tz-row').click();
  const list = sheet(page).locator('#tz-list');
  assert.equal(await list.locator('[aria-pressed=true]').innerText(), 'Москва (МСК)');
  await list.locator('[data-tz="Europe/Samara"]').click();
  await waitNoLayers(page);
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.tz === 'Europe/Samara');
  assert.match(await text(page, '#tz-row'), /Самара \(МСК\+1\)/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('подсказки: «Пропустить» слева закрывает подсказки экрана, стрелка статистики — прямо между разделами', async () => {
  const { context, page, errors } = await openApp(env, { tours: true });
  await page.waitForFunction(() => document.querySelector('.tour-next')?.textContent === 'Дальше');
  const skip = page.locator('.tour-skip');
  const next = page.locator('.tour-next');
  assert.equal(await skip.innerText(), 'Пропустить');
  assert.ok((await skip.boundingBox()).x < (await next.boundingBox()).x, '«Пропустить» слева от «Дальше»');
  assert.equal(await next.innerText(), 'Дальше');
  await skip.click();
  await page.waitForFunction(() => !document.querySelector('.tour'));
  const done = await page.evaluate(async () => (await (await import('./js/db.js')).get('meta', 'tours'))?.done || []);
  assert.ok(done.includes('home2'));
  // перерисовка того же экрана (сохранение настроек) не показывает новую подсказку сразу после «Пропустить»
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ minRest: 240 }); });
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.tour').count(), 0, 'после «Пропустить» на этом экране подсказок больше нет');
  // меню из трёх разделов — новая подсказка в один шаг (без «Пропустить»)
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.tour-title')?.textContent === 'Разделы внизу');
  assert.match(await text(page, '.tour-card'), /Разделы внизу[\s\S]*Главная[\s\S]*Ещё[\s\S]*Профиль/);
  assert.doesNotMatch(await text(page, '.tour-card'), /Обучение|Чаты/);
  assert.equal(await skip.isHidden(), true, 'на последнем шаге только «Понятно»');
  await next.click();
  await page.waitForFunction(() => !document.querySelector('.tour'));
  // статистика: прямая стрелка ровно по центру переключателя
  await page.locator('.hero').click();
  await page.waitForSelector('.tour-arrow:not([hidden]) svg');
  await page.waitForTimeout(500);
  const seg = await page.locator('#st-kind').boundingBox();
  const arrow = await page.locator('.tour-arrow').boundingBox();
  const gap = await page.locator('#st-kind button').nth(1).boundingBox();
  assert.ok(Math.abs(arrow.x + arrow.width / 2 - (seg.x + seg.width / 2)) <= 2, 'стрелка по центру');
  assert.ok(Math.abs(arrow.x + arrow.width / 2 - gap.x) <= 6, 'между «Поездная статистика» и «Заработная плата»');
  assert.equal(await page.locator('.tour-arrow path').count(), 2);
  assert.match(await page.locator('.tour-arrow path').first().getAttribute('d'), /^M20 49V6/, 'стрелка прямая');
  assert.equal(await page.locator('.tour-arrow').getAttribute('data-dir'), 'up');
  assert.deepEqual(errors, []);
  await context.close();
});
