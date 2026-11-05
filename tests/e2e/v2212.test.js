// Браузерные проверки CABINA 2.21.2 (просьбы Никиты 05.11.2026): пассажиром в начале поездки — без приёмки и отправления,
// заполненное следование и ожидание сворачиваются, номер поезда, «Праздничные» только в праздник, окончание полного отдыха,
// главная без «появления», короче профиль и приглашения, «Мои данные на сервере» — в «Документах».
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const trips = (page) => page.evaluate(async () => (await import('./js/store.js')).S.trips.map(({ _stats, _statsAt, ...t }) => JSON.parse(JSON.stringify(t))));
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource|ERR_|503/.test(e));
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const ROUTE = { id: 'r1', from: 'Сосновка', to: 'Ольховка', acceptMin: 20, departMin: 60 };

test('поехали пассажиром в начале поездки — на главной нет «До отправления» и приёмки; без пассажира — есть', async () => {
  const { context, page, errors } = await openApp(env);
  // явка 11:30, отправление по нормативу в 12:30 — «сейчас» 12:00
  await seed(page, { routes: [ROUTE], trips: [{ id: 't1', routeId: 'r1', start: '2026-10-20T11:30', end: '' }] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.rest-banner.depart').waitFor();
  assert.match(await text(page, '.rest-banner.depart'), /До отправления 30 мин[\s\S]*Начало приёмки 11:50 · отправление 12:30/);
  // пассажиром с 11:45 (раньше отправления по нормативу) — локомотив не принимаем
  await seed(page, { routes: [ROUTE], trips: [{ id: 't1', routeId: 'r1', start: '2026-10-20T11:30', end: '', passenger: [{ id: 'p1', start: '2026-10-20T11:45', end: '' }] }] });
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('.rest-banner.depart').count(), 0);
  assert.doesNotMatch(await text(page, '.screen'), /Начало приёмки|До отправления/);
  // и в форме поездки — тоже без приёмки и отправления
  await page.locator('.trip[data-id=t1], [data-act=trip][data-id=t1]').first().click();
  const f = sheet(page);
  await f.locator('#tf-st').waitFor();
  assert.doesNotMatch(await f.innerText(), /Начало приёмки/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('следование и ожидание: заполненные — короткой строкой, нажатие разворачивает; номер поезда сохраняется', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 't1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-19T06:00', end: '2026-10-19T14:00', restType: 'turnaround',
    passenger: [{ id: 'p1', start: '2026-10-19T11:00', end: '2026-10-19T14:00', train: '6501' }], waiting: [{ id: 'w1', start: '2026-10-19T10:00', end: '2026-10-19T11:00' }] }] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('[data-act=trip][data-id=t1]').first().click();
  const f = sheet(page);
  const pass = f.locator('#tf-pass .interval.short[data-pid=p1]');
  await pass.waitFor();
  assert.match(await pass.innerText(), /Пассажиром[\s\S]*11:00 – 14:00[\s\S]*3 ч[\s\S]*поезд 6501/);
  assert.match(await f.locator('#tf-wait .interval.short[data-pid=w1]').innerText(), /Ожидание[\s\S]*10:00 – 11:00/);
  assert.equal(await f.locator('#tf-pass input[data-pf=st]').count(), 0, 'свёрнуто — полей нет');
  // компактная строка ниже карточки
  const h = (await pass.boundingBox()).height;
  assert.ok(h < 90, `строка невысокая: ${h}`);
  // развернуть — все поля и номер поезда; меняем номер
  await pass.click();
  const open = f.locator('#tf-pass .interval[data-pid=p1]:not(.short)');
  await open.waitFor();
  assert.equal(await open.locator('input[data-pf=train]').inputValue(), '6501');
  await open.locator('input[data-pf=train]').fill('012а');
  // ушли из карточки — снова строка
  await f.locator('#tf-st').focus();
  await f.locator('#tf-pass .interval.short[data-pid=p1]').waitFor();
  assert.match(await f.locator('#tf-pass .interval.short[data-pid=p1]').innerText(), /поезд 012А/);
  // новое следование: только начало — карточка целиком, не сворачивается
  await f.locator('[data-act=add-pass]').click();
  const fresh = f.locator('#tf-pass .interval:not(.short)').last();
  await fresh.locator('input[data-pf=st]').fill('15:00');
  await f.locator('#tf-st').focus();
  await page.waitForTimeout(100);
  assert.equal(await fresh.locator('input[data-pf=st]').count(), 1, 'только начало — не сворачиваем');
  await f.locator('[data-act=del-pass]').last().click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = (await trips(page))[0];
  assert.deepEqual(t.passenger, [{ id: 'p1', start: '2026-10-19T11:00', end: '2026-10-19T14:00', train: '012А' }]);
  // номер поезда — в карточке дня и в поиске
  await page.locator('[data-act=go][data-page=search]').click();
  await page.locator('#trip-q').fill('012а');
  await page.locator('.screen [data-act=trip][data-id=t1]').first().waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Праздничные» в форме поездки — только если в поездке есть праздничные часы', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [
    { id: 'a', routeLabel: 'Сосновка → Ольховка', start: '2026-10-19T06:00', end: '2026-10-19T14:00', restType: 'turnaround' },
    { id: 'b', routeLabel: 'Сосновка → Ольховка', start: '2026-11-04T06:00', end: '2026-11-04T14:00', restType: 'turnaround' },
  ] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('[data-act=trip][data-id=a]').first().click();
  let f = sheet(page);
  await f.locator('.calc').first().waitFor();
  assert.match(await f.innerText(), /Ночные/);
  assert.doesNotMatch(await f.innerText(), /Праздничные/);
  await f.locator('button[data-close]').first().click();
  await waitNoLayers(page);
  await page.locator('[data-act=next]').click();
  await page.locator('[data-act=trip][data-id=b]').first().click();
  f = sheet(page);
  await f.locator('.calc').first().waitFor();
  assert.match(await f.innerText(), /Праздничные\s*8 ч/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('полный отдых: окончание правится нажатием на главной и в профиле; «Как по расчёту» возвращает расчёт', async () => {
  const { context, page, errors } = await openApp(env);
  // 7 ч работы × 2,6 = 18 ч 12 мин → до 21 окт, 02:12
  await seed(page, { trips: [{ id: 'f1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-20T01:00', end: '2026-10-20T08:00', restType: 'home', homeChoice: 'full', homeRest: { ids: ['f1'] } }] });
  await page.reload(); await page.waitForSelector('.screen');
  const banner = page.locator('.rest-banner[data-act=dayoff-edit]');
  assert.match(await banner.innerText(), /Полный отдых · до завтра, 02:12|Полный отдых · до 21 окт, 02:12/);
  await banner.click();
  let f = sheet(page);
  assert.match(await f.innerText(), /Окончание полного отдыха/);
  assert.equal(await f.locator('#do-t').inputValue(), '02:12');
  assert.equal(await f.locator('[data-act=do-reset]').count(), 0, 'пока не правили — «Как по расчёту» не нужно');
  await f.locator('#do-d').fill('2026-10-20'); await f.locator('#do-t').fill('07:00');
  await f.locator('[data-act=do-save]').click();
  assert.match(await text(f, '[data-error]'), /Отдых заканчивается после окончания поездки/);
  await f.locator('#do-d').fill('2026-10-21'); await f.locator('#do-t').fill('08:00');
  await f.locator('[data-act=do-save]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].restEndMin, 24 * 60);
  assert.match(await banner.innerText(), /до (завтра|21 окт), 08:00/);
  // в форме поездки — пометка, что окончание поправлено
  await page.locator('[data-act=trip][data-id=f1]').first().click();
  f = sheet(page);
  await f.locator('#tf-rest-own').waitFor();
  assert.match(await f.locator('#tf-rest-own').innerText(), /08:00/);
  await f.locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // профиль: статус — кнопка с тем же окном; «Как по расчёту»
  await tab(page, 'profile');
  const st = page.locator('#pr-status');
  assert.equal(await st.getAttribute('data-act'), 'dayoff-edit');
  await st.click();
  f = sheet(page);
  await f.locator('[data-act=do-reset]').click();
  assert.equal(await f.locator('#do-t').inputValue(), '02:12');
  await f.locator('[data-act=do-save]').click();
  await waitNoLayers(page);
  assert.equal((await trips(page))[0].restEndMin, undefined, 'совпало с расчётом — своего окончания нет');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('главная без «появления»: карточка статистики не просвечивает небо и не сдвигается при переключении вкладок', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await tab(page, 'home');
  const anim = await page.locator('.screen.home-screen').evaluate((e) => getComputedStyle(e).animationName);
  assert.equal(anim, 'none');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('профиль: «Найти», «Пригласить коллег» без подписи, без «Приватности профиля»; приглашения — кнопка сверху; «Мои данные» в «Документах»', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, NEW);
  await tab(page, 'profile');
  await page.locator('#col-entry').waitFor();
  assert.equal((await text(page, '#col-find')).trim(), 'Найти');
  assert.equal(await page.locator('#inv-entry .t2').count(), 0);
  assert.equal(await page.locator('#pr-privacy').count(), 0);
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.setViewportSize({ width: 320, height: 700 });
    assert.ok(await fits(page), `профиль на 320 px, ${theme}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#inv-entry').click();
  await page.locator('#inv-new:not([disabled])').waitFor();
  const btn = await page.locator('#inv-new').boundingBox();
  assert.ok(btn.y + btn.height < 844 * 0.4, `«Создать приглашение» видно сразу: y=${btn.y}`);
  assert.ok(btn.y < (await page.locator('#inv-sum').boundingBox()).y, 'кнопка выше счётчиков');
  assert.equal(await page.locator('.screen .notice').count(), 0, 'длинной плашки нет');
  // Настройки аккаунта: «Мои данные на сервере» — в группе «Документы»
  await page.locator('.screen [data-act=back]').click();
  await page.locator('[data-act=go][data-page=settings]').click();
  await page.locator('[data-act=go][data-page=account]').first().click();
  await page.locator('[data-act=acc-export]').waitFor();
  const docs = page.locator('.group', { has: page.locator('.group-title', { hasText: 'Документы' }) });
  assert.equal(await docs.locator('[data-act=acc-export]').count(), 1);
  assert.match(await docs.innerText(), /Мои данные на сервере[\s\S]*Согласие на обработку данных[\s\S]*Политика обработки данных/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
