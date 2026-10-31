// Браузерные проверки CABINA 2.19: награды со ступенями и счётчиком, поездки напарнику (долгое нажатие → QR или ссылка),
// карьера в «Редактировать профиль», депо пишется одинаково, у поезда обновления нет «чух».
// Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, text, closeTop, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer').last();
const ROUTES = [{ id: 'r1', from: 'Сосновка', to: 'Ольховка', distanceKm: 180 }, { id: 'r2', from: 'Ольховка', to: 'Сосновка', distanceKm: 180 }];
const TRIPS = [
  { id: 'a', routeId: 'r1', start: '2026-10-14T06:00', end: '2026-10-14T15:30', locoType: '2ТЭ116', locoNumber: '1234' },
  { id: 'b', routeId: 'r2', start: '2026-10-15T03:10', end: '2026-10-15T12:00', locoType: '2ТЭ116', locoNumber: '1234' },
  { id: 'c', routeId: 'r1', start: '2026-10-17T20:00', end: '2026-10-18T08:30' },
  { id: 's', routeId: 'r2', start: '2026-09-28T08:00', end: '2026-09-28T16:00' },
];

// Долгое нажатие пальцем (как на телефоне)
async function longPress(page, cdp, locator) {
  const box = await locator.boundingBox();
  const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await page.waitForTimeout(750);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
}
async function swipeLeft(page, cdp, locator) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2; const x = box.x + box.width - 30;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 25, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('карьера — в «Редактировать профиль», депо «тд64» → «ТД-64», у поезда обновления нет «чух»', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('.screen [data-page=profile-edit]').click();
  const dep = page.locator('#pr-depot');
  assert.equal(await dep.getAttribute('placeholder'), 'Например, ТЧ-13');
  await dep.fill('тд64');
  await dep.blur();
  await page.waitForFunction(() => document.querySelector('#pr-depot')?.value === 'ТД-64');
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.profile.depot), 'ТД-64');
  await dep.fill('tch 13 Няндома');
  await dep.blur();
  await page.waitForFunction(() => document.querySelector('#pr-depot')?.value === 'ТЧ-13 Няндома');
  // карьера открывается отсюда, в настройках её больше нет
  await page.locator('#pr-career').click();
  await page.waitForSelector('.screen h1:text("Карьера")');
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  assert.equal(await page.locator('.screen [data-page=career]').count(), 0);
  const pull = await page.evaluate(async () => { const m = await import('./js/pull.js'); return JSON.stringify(m.PULL_STYLES) + await (await fetch('./js/pull.js')).text(); });
  assert.doesNotMatch(pull, /чух/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test('выбор поездок долгим нажатием: кружки, «Весь месяц», свайп выключен, «Отмена»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS });
  const cdp = await context.newCDPSession(page);
  const rows = page.locator('.swipe > .trip');
  assert.equal(await rows.count(), 3, 'октябрь');
  await longPress(page, cdp, rows.nth(0));
  assert.ok(await page.evaluate(() => document.body.classList.contains('selecting')));
  assert.equal(await page.locator('#layers .layer').count(), 0, 'форма поездки не открылась');
  assert.equal(await page.locator('.swipe > .trip[aria-pressed=true]').count(), 1);
  assert.match(await text(page, '.sel-bar'), /Выбрано: 1/);
  // нажатие в режиме выбора отмечает, а не открывает
  await rows.nth(1).click();
  assert.equal(await page.locator('.swipe > .trip[aria-pressed=true]').count(), 2);
  assert.equal(await page.locator('#layers .layer').count(), 0);
  // свайп влево не открывает «Удалить»
  await swipeLeft(page, cdp, rows.nth(2));
  assert.equal(await page.locator('.swipe.open').count(), 0);
  // все законченные за этот месяц
  await page.locator('[data-act=sel-all]').click();
  assert.equal(await page.locator('.swipe > .trip[aria-pressed=true]').count(), 3);
  // 320 px: панель помещается
  await page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await noHScroll(page));
  const bar = await page.locator('.sel-bar').boundingBox();
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 320);
  await page.locator('[data-act=sel-cancel]').click();
  assert.equal(await page.evaluate(() => document.body.classList.contains('selecting')), false);
  assert.equal(await page.locator('.sel-bar').count(), 0);
  // обычное нажатие снова открывает поездку
  await rows.nth(0).click();
  await page.waitForSelector('#layers .layer #tf-sd');
  assert.deepEqual(errors, []);
  await context.close();
});

test('поездки напарнику: QR и ссылка; у напарника — просмотр, «проверьте цифры», добавление; по фото — повторы не отмечены', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cabina-qr-'));
  const A = await openApp(env);
  await seed(A.page, { routes: ROUTES, trips: TRIPS });
  await A.page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveTrip({ ...s.S.trips.find((t) => t.id === 'a'), note: 'секретная заметка' }); });
  const cdp = await A.context.newCDPSession(A.page);
  const rows = A.page.locator('.swipe > .trip');
  await longPress(A.page, cdp, rows.nth(1));
  await rows.nth(2).click();
  await A.page.locator('[data-act=sel-share]').click();
  const sh = top(A.page);
  await sh.locator('svg.qr').waitFor();
  assert.match(await sh.innerText(), /2 поездки напарнику/);
  assert.match(await sh.innerText(), /Заработка, заметок и отвлечений там нет/);
  assert.match(await sh.innerText(), /«Добавить поездку» → «Получить поездки от напарника»/);
  assert.equal(await sh.locator('#sh-link').isDisabled(), false);
  const qrPath = join(dir, 'qr.png');
  await sh.locator('svg.qr').screenshot({ path: qrPath });
  // ссылка — та же, что в QR; заметки и денег в ней нет
  const url = await A.page.evaluate(async () => { const s = await import('./js/share.js'); const st = await import('./js/store.js'); return s.shareUrl(await s.encodeTrips(st.S.trips.filter((t) => ['a', 'b'].includes(t.id)))); });
  assert.match(url, /#t=[zj][A-Za-z0-9_-]+$/);
  await A.page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await noHScroll(A.page));
  await closeTop(A.page);
  await waitNoLayers(A.page);
  assert.equal(await A.page.evaluate(() => document.body.classList.contains('selecting')), false, 'после отправки выбор снят');
  assert.deepEqual(A.errors, []);

  // напарник открывает ссылку
  const B = await openApp(env, { awards: true });
  await B.page.goto(env.url.replace(/\/?$/, '/') + url.slice(url.indexOf('#')));
  await B.page.waitForSelector('.imp-list');
  assert.equal(await B.page.evaluate(() => location.hash), '', 'код убран из адреса');
  const pv = top(B.page);
  assert.match(await pv.innerText(), /Проверьте цифры сами/);
  assert.equal(await pv.locator('.imp-row').count(), 2);
  assert.doesNotMatch(await pv.innerText(), /секрет/);
  // одну можно снять
  await pv.locator('.imp-row').nth(0).click();
  assert.match(await text(B.page, '#imp-add'), /Добавить 1 поездку/);
  await pv.locator('.imp-row').nth(0).click();
  assert.match(await text(B.page, '#imp-add'), /Добавить 2 поездки/);
  await B.page.locator('#imp-add').click();
  await B.page.waitForSelector('.aw-dialog');
  assert.match(await text(B.page, '.aw-dialog'), /Добро пожаловать в кабину/);
  await B.page.locator('[data-act=aw-later]').click();
  await waitNoLayers(B.page);
  const got = await B.page.evaluate(async () => { const s = await import('./js/store.js'); return { trips: s.S.trips.map((t) => [t.start, t.end, t.locoNumber, t.note || '']), routes: s.S.routes.map((r) => `${r.from}→${r.to} ${r.distanceKm}`) }; });
  assert.deepEqual(got.trips.sort(), [['2026-10-14T06:00', '2026-10-14T15:30', '1234', ''], ['2026-10-15T03:10', '2026-10-15T12:00', '1234', '']], 'заметка не передаётся');
  assert.deepEqual(got.routes.sort(), ['Ольховка→Сосновка 180', 'Сосновка→Ольховка 180']);

  // те же поездки по фото QR-кода: уже есть — галочки сняты, добавить нечего
  await B.page.locator('[data-act=add-trip]').click();
  await B.page.locator('[data-act=tf-receive]').click();
  await B.page.waitForSelector('#rc-photo', { state: 'attached' });
  await B.page.locator('#rc-photo').setInputFiles(qrPath);
  await B.page.waitForSelector('.imp-list');
  assert.equal(await top(B.page).locator('.warn-line').count(), 2);
  assert.equal(await B.page.locator('#imp-add').isDisabled(), true);
  assert.match(await text(B.page, '#imp-add'), /Ничего не выбрано/);
  await B.page.setViewportSize({ width: 320, height: 700 });
  assert.ok(await noHScroll(B.page));
  assert.deepEqual(B.errors, []);
  await A.context.close(); await B.context.close();
  await rm(dir, { recursive: true, force: true });
});

test('чужой и испорченный код: понятное сообщение, ничего не добавляется', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  await page.locator('[data-act=tf-receive]').click();
  await page.locator('#rc-link').fill('https://example.com/#t=z!!!');
  await page.locator('[data-act=rc-open]').click();
  await page.waitForSelector('.error-box');
  await page.locator('#rc-link').fill('https://cabina-app.ru/#t=zAAAA');
  await page.locator('[data-act=rc-open]').click();
  await page.waitForFunction(() => document.querySelector('.error-box') && !document.querySelector('.imp-list'));
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.trips.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('награды: в профиле над коллегами, своих часов нет; повторяемые — только «×N», со ступенями — без счётчика; рекорды — отдельным экраном; поздравления; 320 px, обе темы', async () => {
  const { context, page, errors } = await openApp(env, { awards: true });
  const trips = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, routeId: 'r1', start: `2026-10-0${i + 1}T08:00`, end: `2026-10-0${i + 1}T16:00`, weight: 6000 }));
  trips.push({ id: 'long', routeId: 'r1', start: '2026-10-08T06:00', end: '2026-10-08T18:30' });
  await seed(page, { routes: [{ ...ROUTES[0], weightNorm: 5199 }, ROUTES[1]], trips });
  await tab(page, 'profile');
  assert.match(await text(page, '#pr-awards .group-title'), /Награды\s+\d+ из 32/i);
  assert.equal(await page.locator('.profile-tiles').count(), 0, 'своих часов и поездок в профиле нет');
  assert.match(await text(page, '#pr-records'), /Рекорды[\s\S]*Самая долгая поездка — 12 ч 30 мин/);
  // рекорды — по нажатию
  await page.locator('#pr-records').click();
  await page.waitForSelector('#aw-records');
  assert.match(await text(page, '.screen'), /Рекорды[\s\S]*Самая долгая поездка[\s\S]*12 ч 30 мин[\s\S]*Больше всего поездок за месяц[\s\S]*7/);
  await page.locator('[data-act=back]').click();
  await page.locator('#pr-awards .aw-strip').click();
  await page.waitForSelector('.aw-grid');
  assert.equal(await page.locator('.screen #aw-records').count(), 0, 'на экране наград рекорды — строкой, не списком');
  assert.equal(await page.locator('.screen #aw-rec-row').count(), 1);
  // повторяемая: только счётчик, без ступеней
  assert.equal(await text(page, '[data-id=iron] .aw-n'), '×1');
  assert.equal(await page.locator('[data-id=iron] .aw-pips').count(), 0);
  // со ступенями: без счётчика, точки ступеней
  assert.equal(await page.locator('[data-id=heavy] .aw-n').count(), 0, 'у тяжеловеса ступени — счётчика нет');
  assert.equal(await page.locator('[data-id=heavy] .aw-pips i').count(), 3);
  assert.equal(await page.locator('[data-id=moon].locked').count(), 1);
  await page.locator('[data-act=aw-open][data-id=iron]').click();
  let s = top(page);
  assert.match(await s.innerText(), /Железная пятая точка[\s\S]*Получали 1 раз/);
  assert.equal(await s.locator('.aw-tier').count(), 0, 'ступеней нет');
  assert.doesNotMatch(await s.innerText(), /Бронза|Серебро|Золото|До серебра/);
  await closeTop(page); await waitNoLayers(page);
  await page.locator('[data-act=aw-open][data-id=heavy]').click();
  s = top(page);
  assert.match(await s.innerText(), /Тяжеловес[\s\S]*Бронза[\s\S]*10 поездов[\s\S]*Серебро[\s\S]*50 поездов[\s\S]*Золото[\s\S]*200 поездов[\s\S]*До бронзы: 6 из 10 поездов/);
  assert.equal(await s.locator('.aw-n').count(), 0);
  await closeTop(page); await waitNoLayers(page);

  // ещё одна поездка от 12 ч через форму — счётчик «×2» сообщением внизу
  const addTrip = async (day, from, to) => {
    await tab(page, 'home');
    await page.locator('[data-act=add-trip]').click();
    const f = top(page);
    await f.locator('#tf-sd').fill(day);
    await f.locator('#tf-st').fill(from);
    await f.locator('#tf-et').fill(to);
    await f.locator('[data-rest=turnaround]').click();
    await f.locator('[data-act=save-trip]').click();
  };
  await addTrip('2026-10-19', '06:00', '18:00');
  await page.waitForFunction(() => /Награда: Железная пятая точка ×2/.test(document.querySelector('.toast-wrap')?.innerText || ''));
  assert.equal(await page.locator('.aw-dialog').count(), 0, 'повтор — без окна');
  // 13 ч — новый рекорд: окно, в нём и счётчик
  await addTrip('2026-10-12', '06:00', '19:00');
  await page.waitForSelector('.aw-dialog');
  assert.match(await text(page, '.aw-dialog'), /Железная пятая точка ×3[\s\S]*Новый рекорд: самая долгая поездка — 13 ч 00 мин/);
  await page.locator('[data-act=aw-see]').click();
  await page.waitForSelector('.aw-grid');
  assert.equal(await text(page, '[data-id=iron] .aw-n'), '×3');

  for (const theme of ['dark', 'light']) {
    await page.evaluate(async (theme) => { const s = await import('./js/store.js'); await s.saveSettings({ theme }); document.documentElement.dataset.theme = theme; }, theme);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.ok(await noHScroll(page), `награды, ${theme}`);
    await page.locator('[data-act=aw-open][data-id=km]').click();
    assert.match(await top(page).innerText(), /Вёрсты[\s\S]*Бронза[\s\S]*10\s000 км[\s\S]*Серебро[\s\S]*40\s075 км — вокруг Земли/);
    assert.ok(await noHScroll(page), `награда, ${theme}`);
    await closeTop(page); await waitNoLayers(page);
  }
  assert.deepEqual(errors, []);
  await context.close();
});
