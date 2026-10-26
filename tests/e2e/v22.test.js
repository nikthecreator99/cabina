// Браузерные проверки CABINA 2.2: пять разделов внизу, закрепление состава, карьера и вознаграждение
// за преданность, свёрнутые настройки, перерисовка без «дёрганья». Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();

test('нижнее меню (2.5): Главная · Ещё · Профиль, помещается на 320 px', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 640 });
  const labels = await page.locator('.tab').allInnerTexts();
  assert.deepEqual(labels.map((s) => s.trim()), ['Главная', 'Ещё', 'Профиль']);
  const fits = await page.$$eval('.tab', (els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  assert.ok(fits, 'подписи вкладок не обрезаются');
  // три вкладки делят ширину поровну
  const xs = await page.$$eval('.tab', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 1 && xs[0] >= 100, `ширины вкладок: ${xs}`);
  await tab(page, 'extra');
  assert.match(await text(page, '.page-head'), /^Ещё$/);
  // пункты одним списком (2.6: + «Телефоны»)
  assert.deepEqual(await page.locator('.extra-list > .row').evaluateAll((a) => a.map((b) => b.dataset.act)), ['extra-notes', 'extra-docs', 'extra-phones', 'extra-fix']);
  await tab(page, 'profile');
  await page.locator('.screen [data-page=profile-edit]').click();
  assert.match(await text(page, '.page-head'), /Редактировать профиль/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('закрепление состава: башмаки по таблице, нехватка — ручными тормозами', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-fix]').click();
  assert.match(await text(page, '#fix-result'), /Впишите вес состава/);
  await page.fill('#fx-weight', '5200');
  await page.fill('#fx-axles', '216');
  await page.fill('#fx-shoes', '30');
  await page.locator('[data-act=fix-slope][data-v="4"]').click();
  let r = await text(page, '#fix-result');
  assert.match(r, /Башмаков на локомотиве достаточно/);
  assert.match(r, /11\s+уложить башмаков/);
  assert.match(r, /24,07 тс/);
  assert.match(r, /гружёный/);
  // поле остаётся в фокусе при наборе (экран не перерисовывается целиком)
  await page.locator('#fx-shoes').fill('3');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fx-shoes');
  await page.locator('[data-act=fix-slope][data-v="12"]').click();
  assert.equal(await page.locator('[data-act=fix-slope][data-v="12"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-act=fix-slope][data-v="4"]').getAttribute('aria-pressed'), 'false');
  r = await text(page, '#fix-result');
  assert.match(r, /Не хватает башмаков: 18/);
  assert.match(r, /54 оси/);
  assert.match(r, /вагонов по 4 оси\s+14/);
  // таблица норм открывается
  await page.locator('.fix-table summary').click();
  assert.match(await text(page, '.fix-table tbody'), /40‰\s+1,3\s+3,8\s+—/);
  await page.locator('[data-act=extra-back]').click();
  assert.match(await text(page, '.page-head'), /Ещё/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('карьера: дата устройства, должности, оклад, напоминание о преданности на главной', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  await page.locator('[data-page=career]').click();
  await page.fill('#cr-hired', '2021-12-15');
  await page.locator('#cr-hired').dispatchEvent('change');
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.career?.hired === '2021-12-15');
  assert.match(await text(page, '.screen'), /Непрерывный стаж\s+4 года 10 месяцев/);
  const next = await text(page, '.loyal-next');
  assert.match(next, /5\s+лет стажа/);
  assert.match(next, /15 декабря 2026/);
  assert.match(next, /январь 2027/);
  assert.match(next, /3 оклада/);
  // должность: машинист с 1 марта 2025 — должность в профиле меняется тоже
  await page.locator('[data-act=job-add]').click();
  const f = sheet(page);
  await f.locator('#jf-role [data-role=driver]').click();
  await f.locator('#jf-from').fill('2025-03-01');
  await f.locator('[data-act=jf-save]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '#cr-jobs'), /Машинист\s+с 1 марта 2025 · сейчас/);
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.role === 'driver');
  // 2.5: оклад — здесь же, в «Карьере», после стажа; в тарифных ставках его больше нет
  assert.match(await text(page, '#cr-oklad >> xpath=ancestor::div[contains(@class,"pay-field")]'), /Нужен для расчёта вознаграждения за преданность/);
  await page.locator('[data-act=career-oklad]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cr-oklad');
  await page.fill('#cr-oklad', '50000');
  await page.locator('#cr-oklad').blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.pay.driver?.oklad === 50000);
  assert.match(await text(page, '.loyal-next'), /150\s000\s₽[\s\S]*130\s500\s₽/);
  // на главной — напоминание (до права 56 дней), скрывается крестиком
  await tab(page, 'home');
  const ban = await text(page, '.loyal-banner');
  assert.match(ban, /Через 56 дней — 5 лет стажа/);
  assert.match(ban, /3 оклада ≈ 150\s000\s₽ · выплата в январе 2027/);
  await page.locator('[data-act=loyal-hide]').click();
  await page.waitForFunction(() => !document.querySelector('.loyal-banner'));
  // в профиле — стаж
  await tab(page, 'profile');
  assert.match(await text(page, '.profile-card'), /Машинист[\s\S]*Стаж 4 года 10 месяцев/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('удаление должности спрашивает «Да / Нет»; дата устройства не может быть в будущем', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ career: { hired: '2010-05-01', jobs: [{ id: 'j1', role: 'other', title: 'Слесарь', from: '2010-05-01' }] } }); });
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  // 2.8: «Карьера» — сразу в Настройках, профиль меняется только с экрана «Профиль»
  assert.equal(await page.locator('[data-page=profile-settings], .screen [data-page=profile-edit]').count(), 0);
  assert.match(await text(page, '[data-page=career]'), /Стаж 16 лет 5 месяцев/);
  await page.locator('[data-page=career]').click();
  await page.locator('[data-act=job-edit]').click();
  await sheet(page).locator('[data-act=jf-del]').click();
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.career.jobs.length === 0);
  await page.fill('#cr-hired', '2027-01-01');
  await page.locator('#cr-hired').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('#cr-hired').value === '2010-05-01');
  assert.deepEqual(errors, []);
  await context.close();
});

test('обновление раз в минуту и сохранение — без анимации появления экрана', async () => {
  const { context, page, errors } = await openApp(env);
  const anim = () => page.evaluate(() => getComputedStyle(document.querySelector('.screen')).animationName);
  await tab(page, 'profile');
  assert.equal(await anim(), 'fadeIn'); // переход на экран — с анимацией
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ minRest: 300 }); });
  assert.equal(await anim(), 'none'); // перерисовка того же экрана — без неё
  await tab(page, 'extra');
  assert.equal(await anim(), 'fadeIn');
  assert.deepEqual(errors, []);
  await context.close();
});
