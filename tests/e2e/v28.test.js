// Браузерные проверки CABINA 2.8: отдых выбирается после окончания поездки и кнопка «В путь»,
// один вход в «Редактировать профиль», группы и несколько номеров в «Телефонах». Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const store = (page, fn) => page.evaluate(fn);

test('новая поездка: отдых не выбран и недоступен до окончания, кнопка «В путь» / «Сохранить явку» / «Сохранить»', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  const save = f.locator('[data-act=save-trip]');
  await f.locator('#tf-sd').fill('2026-10-20');
  await f.locator('#tf-st').fill('10:00');
  assert.equal(await f.locator('[data-rest][aria-pressed=true]').count(), 0, 'ничего не выбрано');
  assert.equal(await f.locator('[data-rest=turnaround]').isDisabled(), true);
  assert.equal(await f.locator('[data-rest=home]').isDisabled(), true);
  assert.match(await text(f, '#tf-rest-hint'), /когда укажете время окончания/);
  assert.match(await save.innerText(), /^В путь$/);
  // явка позже «сейчас» — «Сохранить явку»
  await f.locator('#tf-st').fill('18:00');
  assert.match(await save.innerText(), /^Сохранить явку$/);
  // указали окончание — отдых можно выбрать, кнопка «Сохранить»
  await f.locator('#tf-st').fill('06:00');
  await f.locator('#tf-et').fill('11:00');
  assert.equal(await f.locator('[data-rest=turnaround]').isDisabled(), false);
  assert.equal(await f.locator('#tf-rest-hint').isHidden(), true);
  assert.match(await save.innerText(), /^Сохранить$/);
  assert.equal(await f.locator('[data-rest][aria-pressed=true]').count(), 0, 'и всё ещё ничего не выбрано');
  // стёрли окончание — выбор отдыха сбрасывается
  await f.locator('[data-rest=home]').click();
  await f.locator('#tf-et').fill('');
  assert.equal(await f.locator('[data-rest][aria-pressed=true]').count(), 0);
  await f.locator('#tf-et').fill('11:00');
  await save.click();
  await waitNoLayers(page);
  const t = await store(page, async () => (await import('./js/store.js')).S.trips[0]);
  assert.equal(t.restType, null, 'без выбора отдых не записывается');
  assert.equal(await page.locator('.rest-banner').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('поездка «в пути»: сохраняется кнопкой «В путь», при завершении отдых выбирается заново', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-20T08:00', end: '', restType: 'turnaround' }] });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  assert.match(await f.locator('[data-act=save-trip]').innerText(), /^В путь$/);
  assert.equal(await f.locator('[data-rest][aria-pressed=true]').count(), 0, 'старый выбор у поездки «в пути» не показывается');
  await f.locator('#tf-et').fill('11:30');
  await f.locator('[data-rest=turnaround]').click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '.rest-banner'), /Отдых в пункте оборота/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('профиль меняется в одном месте: в Настройках — сразу «Карьера»', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  assert.equal(await page.locator('.screen [data-page=profile-edit]').count(), 1);
  await page.locator('[data-page=settings]').click();
  assert.equal(await page.locator('[data-page=profile-settings], .screen [data-page=profile-edit]').count(), 0);
  await page.locator('.screen [data-page=career]').click();
  await page.waitForSelector('#cr-hired');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Телефоны»: группа запоминается и становится папкой, у контакта несколько номеров', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-phones]').click();
  await page.locator('[data-act=phone-add]').click();
  let f = sheet(page);
  // группа — перед именем
  assert.ok((await f.locator('#ph-group').boundingBox()).y < (await f.locator('#ph-name').boundingBox()).y);
  await f.locator('#ph-group').fill('Обозерская');
  await f.locator('#ph-name').fill('Дежурный по депо');
  await f.locator('#ph-tel').fill('+7 900 000-00-01');
  await f.locator('[data-act=ph-more]').click();
  await f.locator('#ph-tel-1').fill('8 800 000 00 02');
  await f.locator('[data-act=save-phone]').click();
  await waitNoLayers(page);
  assert.deepEqual(await store(page, async () => (await import('./js/store.js')).S.contactGroups), ['Обозерская']);
  // папка с группой
  assert.match(await text(page, '.phone-groups'), /Обозерская\s+1 контакт/);
  // второй номер — группа одним нажатием, регистр подхватывается
  await page.locator('[data-act=phone-add]').click();
  f = sheet(page);
  await f.locator('#ph-groups [data-group="Обозерская"]').click();
  assert.equal(await f.locator('#ph-group').inputValue(), 'Обозерская');
  await f.locator('#ph-name').fill('Нарядчик');
  await f.locator('#ph-tel').fill('+7 900 000-00-03');
  await f.locator('[data-act=save-phone]').click();
  await waitNoLayers(page);
  await page.locator('[data-act=phones-group]').click();
  assert.match(await text(page, '.page-head'), /Обозерская/);
  assert.deepEqual(await page.locator('.phone-list a[href^="tel:"]').evaluateAll((a) => a.map((x) => x.getAttribute('href'))),
    ['tel:+79000000001', 'tel:88000000002', 'tel:+79000000003']);
  // новый номер изнутри папки — сразу в эту группу
  await page.locator('[data-act=phone-add]').click();
  assert.equal(await sheet(page).locator('#ph-group').inputValue(), 'Обозерская');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // убрать группу: номера остаются без группы
  await page.locator('[data-act=phones-forget]').click();
  await sheet(page).getByRole('button', { name: 'Убрать' }).click();
  await page.waitForFunction(() => !document.querySelector('.phone-groups'));
  assert.match(await text(page, '#phones-list'), /Дежурный по депо[\s\S]*Нарядчик/);
  assert.equal(await store(page, async () => (await import('./js/store.js')).S.contacts.length), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('экраны 2.8 на 320 px в обеих темах', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { const s = await import('./js/store.js');
    await s.saveContact({ id: 'c1', group: 'Обозерская', name: 'Сергей Петрович', who: 'Дежурный', phones: ['+7 900 000-00-01', '+7 900 000-00-02', '8 800 000 00 03'], note: '' }); });
  await page.setViewportSize({ width: 320, height: 640 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t }); document.documentElement.dataset.theme = t; }, theme);
    await tab(page, 'extra');
    await page.locator('[data-act=extra-phones]').click();
    await page.locator('[data-act=phones-group]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, `папка, ${theme}`);
    await page.locator('[data-act=phone-edit]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, `форма, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
    await page.locator('[data-act=phones-up]').click();
    await page.locator('[data-act=extra-back]').click();
    await tab(page, 'home');
    await page.locator('[data-act=add-trip]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, `поездка, ${theme}`);
    await sheet(page).locator('button[data-close]').first().click();
    await waitNoLayers(page);
  }
  assert.deepEqual(errors, []);
  await context.close();
});
