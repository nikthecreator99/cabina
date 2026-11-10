// Браузерные проверки CABINA 2.24.8 (просьба Никиты 10.11.2026):
// — на главной отдых в пункте оборота: положенный → «Отдых 100 %» → «Переотдых», пока не добавлена новая явка;
// — полный отдых: если отдыхали в домах отдыха два раза, второй отдых не вычитается; кнопка «!» с правилами.
// Все данные выдуманные. «Сейчас» по умолчанию — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// 8 ч работы, закончили в 06:00 → положенный отдых 4 ч (до 10:00), 100 % — до 14:00
const TURN = { id: 'tA', start: '2026-10-19T22:00', end: '2026-10-20T06:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround' };

async function bannerAt(now) {
  const { context, page, errors } = await openApp(env, { now });
  await seed(page, { trips: [TURN] });
  await page.waitForSelector('.trip');
  const n = await page.locator('.rest-banner').count();
  const t = n ? await text(page, '.rest-banner') : '';
  const bell = n ? await page.locator('.banner-row .remind-btn').count() : 0;
  return { context, page, errors, t, n, bell };
}

test('главная: отдых в пункте оборота → отдых 100 % → переотдых', async () => {
  // 08:00 — идёт положенный отдых
  let r = await bannerAt('2026-10-20T08:00:00+03:00');
  assert.match(r.t, /Отдых в пункте оборота · до сегодня, 10:00/);
  assert.match(r.t, /Осталось 2 ч 00 мин · Ольховка/);
  assert.equal(r.bell, 1);
  assert.deepEqual(r.errors, []);
  await r.context.close();
  // 12:00 — положенный вышел, до 100 % ещё 2 часа
  r = await bannerAt('2026-10-20T12:00:00+03:00');
  assert.match(r.t, /Отдых 100 % · до сегодня, 14:00/);
  assert.match(r.t, /Осталось 2 ч 00 мин · Ольховка/);
  assert.equal(r.bell, 1, 'напомнить о конце 100 %');
  assert.equal(await r.page.locator('.remind-btn').getAttribute('data-at'), String(Date.UTC(2026, 9, 20, 14, 0)));
  await r.context.close();
  // 15:30 — 100 % вышли час тридцать назад
  r = await bannerAt('2026-10-20T15:30:00+03:00');
  assert.match(r.t, /Переотдых 1 ч 30 мин/);
  assert.match(r.t, /Отдых 100 % вышел сегодня, 14:00 · Ольховка/);
  assert.equal(r.bell, 0, 'у переотдыха напоминания нет');
  assert.match(await r.page.locator('.rest-banner').getAttribute('class'), /over/);
  // добавили новую явку — плашки отдыха больше нет, есть «До явки осталось»
  await seed(r.page, { trips: [{ id: 'tB', start: '2026-10-20T18:00', end: '', routeLabel: 'Ольховка → Сосновка', restType: null }] });
  await r.page.waitForFunction(() => /До явки осталось/.test(document.querySelector('.rest-banner')?.innerText || ''));
  assert.equal(await r.page.locator('.rest-banner').count(), 1);
  assert.deepEqual(r.errors, []);
  await r.context.close();
  // больше 48 ч после поездки — это уже не отдых в пункте оборота
  r = await bannerAt('2026-10-22T07:00:00+03:00');
  assert.equal(r.n, 0);
  await r.context.close();
});

test('полный отдых: второй отдых не вычитается, «!» — правила с примерами', async () => {
  const { context, page, errors } = await openApp(env);
  // туда 6 ч, отдых 6 ч, дальше 5 ч, отдых 7 ч, домой 6 ч → (17 ч × 2,6) − 6 ч = 38 ч 12 мин
  await seed(page, { trips: [
    { id: 'h1', start: '2026-10-18T08:00', end: '2026-10-18T14:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround' },
    { id: 'h2', start: '2026-10-18T20:00', end: '2026-10-19T01:00', routeLabel: 'Ольховка → Берёзовка', restType: 'turnaround' },
    { id: 'h3', start: '2026-10-19T08:00', end: '2026-10-19T14:00', routeLabel: 'Берёзовка → Сосновка', restType: 'home', homeChoice: 'full', homeRest: { ids: ['h1', 'h2', 'h3'] } },
  ] });
  await page.waitForSelector('.trip');
  await page.locator('.trip[data-id=h3]').click();
  const f = sheet(page);
  await f.locator('#tf-gap').waitFor();
  assert.match(await text(f, '#tf-gap'), /Первый отдых — вычитается\s*6 ч 00 мин/);
  assert.match(await text(f, '#tf-gap-kept'), /Второй отдых — не вычитается\s*7 ч 00 мин/);
  assert.equal(await text(f, '#tf-full-formula'), '17 ч × 2,6 − 6 ч = 38 ч 12 мин');
  assert.match(await f.locator('[data-choice=full]').innerText(), /до 21 окт\., 04:12|до 21 окт, 04:12|до вчера|04:12/);
  assert.equal(await fits(page), true);
  // «!» — окно с правилами
  await f.locator('[data-act=full-rest-info]').click();
  const info = sheet(page);
  await info.getByText('Расчёт полного отдыха').waitFor();
  const body = await info.innerText();
  assert.match(body, /рабочее время × 2,6 − первый отдых/);
  assert.match(body, /Второй и следующие не вычитаются/);
  assert.match(body, /25 ч 12 мин/);
  assert.match(body, /38 ч 12 мин/);
  await info.getByRole('button', { name: 'Понятно' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#layers .layer:not(.closing)').length === 1);
  // на главной полный отдых — до 04:12 следующего дня после окончания (19.10 14:00 + 38 ч 12 мин)
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const saved = await page.evaluate(async () => (await import('./js/rest.js')).chosenRest((await import('./js/store.js')).S.trips.find((t) => t.id === 'h3')).until);
  assert.equal(saved, Date.UTC(2026, 9, 21, 4, 12));
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px, светлая тема: расчёт и правила помещаются', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page, { trips: [
    { id: 'h1', start: '2026-10-18T08:00', end: '2026-10-18T14:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround' },
    { id: 'h2', start: '2026-10-18T20:00', end: '2026-10-19T01:00', routeLabel: 'Ольховка → Берёзовка', restType: 'turnaround' },
    { id: 'h3', start: '2026-10-19T08:00', end: '2026-10-19T14:00', routeLabel: 'Берёзовка → Сосновка', restType: 'home', homeChoice: 'full', homeRest: { ids: ['h1', 'h2', 'h3'] } },
  ], settings: { theme: 'light', textSize: 'xl' } });
  await page.reload();
  await page.waitForSelector('.trip');
  await page.locator('.trip[data-id=h3]').click();
  const f = sheet(page);
  await f.locator('#tf-gap-kept').scrollIntoViewIfNeeded();
  assert.equal(await fits(page), true);
  const w = await f.locator('#tf-gap-kept').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  assert.equal(w, true, 'строка «не вычитается» не вылезает');
  await f.locator('[data-act=full-rest-info]').click();
  await sheet(page).getByText('Расчёт полного отдыха').waitFor();
  assert.equal(await fits(page), true);
  assert.deepEqual(errors, []);
  await context.close();
});
