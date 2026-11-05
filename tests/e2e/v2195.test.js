// Браузерные проверки CABINA 2.19.5: раздел «Помощь» — частые вопросы, поиск, кнопки «Открыть».
// Сервер подменён (mock-colleagues.js), данные выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, openSettings } from './helpers.js';
import { ready } from './mock-colleagues.js';
import { helpCount } from '../../js/help.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const faq = (page, id) => page.locator(`details.faq[data-id=${id}]`);
const isOpen = (page, id) => faq(page, id).evaluate((d) => d.open);
async function openHelpFromExtra(page) {
  await tab(page, 'extra');
  await page.locator('#extra-help').click();
  await page.waitForSelector('#help-q');
}

test('«Ещё» → «Помощь»: вопросы по группам, ответ раскрывается, «Открыть» ведёт на экран и подсвечивает строку, «Назад» — к открытому ответу', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  assert.match(await text(page, '#extra-help'), /Помощь\s+Частые вопросы/);
  await page.locator('#extra-help').click();
  await page.waitForSelector('#help-q');
  assert.match(await text(page, '.page-head'), /Помощь/);
  assert.equal(await page.locator('details.faq').count(), helpCount(), 'аккаунт есть в приложении — видны все вопросы');
  assert.match(await text(page, '.screen'), /Поездки[\s\S]*Отдых[\s\S]*Часы и заработок[\s\S]*Отвлечения[\s\S]*Данные и безопасность[\s\S]*Аккаунт и коллеги[\s\S]*Прочее/i);
  assert.match(await text(page, '.screen'), /ориентировочные[\s\S]*только в этом телефоне/);
  // ответ свёрнут, по нажатию — раскрыт
  assert.equal(await isOpen(page, 'abs-sick'), false);
  assert.equal(await faq(page, 'abs-sick').locator('.faq-a').isVisible(), false);
  await faq(page, 'abs-sick').locator('summary').click();
  assert.equal(await isOpen(page, 'abs-sick'), true);
  assert.match(await faq(page, 'abs-sick').innerText(), /Календарные дни больничного × оплата одного дня[\s\S]*Открыть «Тарифные ставки»/);
  // «Открыть» — экран ставок, прокрутка к больничному и подсветка
  await faq(page, 'abs-sick').locator('.faq-go').click();
  await page.waitForSelector('.screen[data-page=tariffs]');
  await page.waitForSelector('#pay-sick.spot-flash', { timeout: 3000 });
  const box = await page.locator('#pay-sick').boundingBox();
  const vh = page.viewportSize().height;
  assert.ok(box.y < vh && box.y + box.height > 0, `блок больничного на экране: ${box.y}`);
  // назад — снова «Помощь», ответ остался открытым
  await page.locator('[data-act=back]').click();
  await page.waitForSelector('#help-q');
  assert.equal(await isOpen(page, 'abs-sick'), true);
  // ещё раз назад — «Ещё»
  await page.locator('[data-act=back]').click();
  await page.waitForSelector('#extra-help');
  assert.deepEqual(errors, []);
  await context.close();
});

test('поиск: «копия» — три ответа и сразу открыты; лишнее слово — «Ничего не нашлось»; крестик очищает', async () => {
  const { context, page, errors } = await openApp(env);
  await openHelpFromExtra(page);
  await page.locator('#help-q').fill('копия');
  // с 2.21.9 ещё «Выгрузить в Excel» — он в разделе «Данные и резервная копия»
  await page.waitForFunction(() => document.querySelectorAll('details.faq').length === 3);
  assert.equal(await isOpen(page, 'table-excel'), true);
  assert.equal(await isOpen(page, 'data-lost'), true);
  assert.equal(await isOpen(page, 'data-move'), true);
  assert.ok(await page.locator('details.faq mark').count() > 0 || await page.locator('#help-list').innerText().then((t) => /копи/i.test(t)));
  // поле поиска не теряет фокус при наборе
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'help-q');
  await page.locator('#help-q').pressSequentially(' абракадабра');
  await page.waitForSelector('.faq-none');
  assert.match(await text(page, '.faq-none'), /Ничего не нашлось/);
  await page.locator('[data-act=help-clear]').click();
  await page.waitForFunction((n) => document.querySelectorAll('details.faq').length === n, helpCount());
  assert.equal(await page.locator('#help-q').inputValue(), '');
  assert.equal(await page.locator('[data-act=help-clear]').count(), 0);
  // открытые поиском ответы не запоминаются как открытые человеком
  assert.equal(await isOpen(page, 'data-lost'), false);
  // «Открыть «Резервная копия»» — Настройки, строка копии подсвечена
  await faq(page, 'data-lost').locator('summary').click();
  await faq(page, 'data-lost').locator('.faq-go').click();
  await page.waitForSelector('.screen[data-page=set-data] [data-act=export].spot-flash', { timeout: 3000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('Настройки → «Помощь»; без входа нет кнопки «Приватность», после входа — есть; 320 px и обе темы', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'profile');
  await openSettings(page, 'set-about');
  await page.locator('#settings-help').click();
  await page.waitForSelector('#help-q');
  await faq(page, 'col-see').locator('summary').click();
  assert.match(await faq(page, 'col-see').innerText(), /Номер поезда, точное время явки и причину отвлечения коллеги не видят никогда/);
  assert.equal(await faq(page, 'col-see').locator('.faq-go').count(), 0, 'не вошли — «Приватность» не открываем');
  // узкий экран: всё помещается, кнопка «Открыть» не вылезает
  await page.setViewportSize({ width: 320, height: 700 });
  await faq(page, 'pay-heavy').locator('summary').click();
  assert.ok(await fits(page), '320 px без прокрутки вбок');
  const go = await faq(page, 'pay-heavy').locator('.faq-go').boundingBox();
  assert.ok(go.x >= 0 && go.x + go.width <= 320, `кнопка в ширину экрана: ${go.x}+${go.width}`);
  const sum = await faq(page, 'data-lost').locator('summary').boundingBox();
  assert.ok(sum.height >= 48, `вопрос — крупная зона нажатия: ${sum.height}`);
  // светлая тема
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ theme: 'light' }); document.documentElement.setAttribute('data-theme', 'light'); });
  assert.ok(await fits(page));
  assert.deepEqual(errors, []);
  await context.close();

  // после входа — кнопка «Приватность» ведёт на экран приватности
  const b = await openApp(env);
  await ready(b.context, b.page);
  await tab(b.page, 'extra');
  await b.page.locator('#extra-help').click();
  await b.page.waitForSelector('#help-q');
  await faq(b.page, 'col-see').locator('summary').click();
  await faq(b.page, 'col-see').locator('.faq-go').click();
  await b.page.waitForSelector('.screen[data-page=privacy]');
  assert.deepEqual(realErrors(b.errors), []);
  await b.context.close();
});

test('каждая кнопка «Открыть» (без входа) открывает свой экран, нужная строка подсвечена, ошибок нет', async () => {
  const { context, page, errors } = await openApp(env);
  await openHelpFromExtra(page);
  const btns = await page.locator('.faq-go').evaluateAll((els) => els.map((b) => ({ id: b.closest('details').dataset.id, page: b.dataset.page, focus: b.dataset.focus || null })));
  assert.ok(btns.length >= 10, `кнопок ${btns.length}`);
  for (const b of btns) {
    await faq(page, b.id).locator('summary').click();
    await faq(page, b.id).locator('.faq-go').click();
    await page.waitForSelector(`.screen[data-page=${b.page}]`);
    if (b.focus) await page.waitForSelector(`.spot-flash :is(${b.focus}), ${b.focus}.spot-flash`, { timeout: 3000 });
    await page.locator('[data-act=back]').first().click();
    await page.waitForSelector('#help-q');
    assert.equal(await isOpen(page, b.id), true, `${b.id}: после «Назад» ответ открыт`);
    await faq(page, b.id).locator('summary').click(); // свернуть обратно
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
