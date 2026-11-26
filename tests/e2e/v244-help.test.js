// Браузерные проверки CABINA 2.44: «Помощь и поддержка» — первой в «Ещё», вопрос своими словами, подсказки при наборе,
// ответ с ошибками в словах, Enter, ничего не уходит в сеть; 320 px с очень крупным текстом в обеих темах.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page, name) => { if (process.env.CABINA_SHOTS) await page.screenshot({ path: `${process.env.CABINA_SHOTS}/${name}.png`, fullPage: false }); };
const foundIds = (page) => page.locator('#help-found details.faq').evaluateAll((a) => a.map((d) => d.dataset.id));
const openIds = (page) => page.locator('#help-found details.faq[open]').evaluateAll((a) => a.map((d) => d.dataset.id));

async function openHelp(page) {
  await tab(page, 'extra');
  await page.locator('#extra-list > .row').first().click();
  await page.waitForSelector('#help-q');
}

test('«Ещё»: «Помощь и поддержка» — первой; «как считает…» — подсказки при наборе; дописал с ошибками — открыт нужный ответ; в сеть ничего не уходит', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  assert.equal(await page.locator('#extra-list > .row').first().getAttribute('data-key'), 'help');
  assert.match(await text(page, '#extra-help'), /Помощь и поддержка/);
  await openHelp(page);
  assert.match(await text(page, '.screen'), /Спросите своими словами[\s\S]*никуда не отправляется[\s\S]*Частые вопросы/i);
  const sent = [];
  page.on('request', (r) => { if (!/\/(js|css|fonts|icons|data)\//.test(new URL(r.url()).pathname)) sent.push(r.url()); });
  // печатает по буквам — подсказки появляются по ходу
  await page.locator('#help-q').pressSequentially('как считает', { delay: 15 });
  await page.waitForSelector('#help-found');
  assert.match(await text(page, '#help-found .group-title'), /Похоже на ваш вопрос/i);
  const sug = await foundIds(page);
  assert.ok(sug.includes('rest-full') && sug.includes('rest-turn'), String(sug));
  assert.deepEqual(await openIds(page), [], 'пока вопрос не ясен — ничего не раскрыто');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'help-q', 'фокус в поле');
  // дописал с ошибками
  await page.locator('#help-q').pressSequentially('ся полный атдых', { delay: 15 });
  await page.waitForFunction(() => document.querySelector('#help-found details.faq[open]')?.dataset.id === 'rest-full');
  assert.match(await text(page, '#help-found .group-title'), /^Ответ$/i);
  assert.match(await text(page, '#help-found details[open] .faq-a'), /× 2,6/);
  assert.ok(await page.locator('#help-found details[open] mark').count() >= 2, 'совпавшие слова подсвечены');
  // Enter — клавиатура прячется, ответ на месте
  await page.locator('#help-q').press('Enter');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'help-q');
  assert.deepEqual(await openIds(page), ['rest-full']);
  // нажал на подсказку — она раскрылась
  await page.locator('#help-q').fill('сверхурочка');
  await page.waitForFunction(() => document.querySelector('#help-found details.faq[open]')?.dataset.id === 'hours-over');
  await page.locator('#help-q').fill('как считает');
  await page.locator('#help-found details[data-id=rest-turn] summary').click();
  assert.match(await text(page, '#help-found details[data-id=rest-turn] .faq-a'), /Половина рабочего времени/);
  // только «как» — снова все частые вопросы
  await page.locator('#help-q').fill('как ');
  await page.waitForSelector('.faq-top');
  assert.deepEqual(sent, [], 'вопрос никуда не отправляется');
  assert.deepEqual(errors, []);
  await context.close();
});

for (const theme of ['dark', 'light']) {
  test(`320 px, очень крупный текст, ${theme === 'dark' ? 'тёмная' : 'светлая'} тема: поле, подсказки и ответ помещаются`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t, textSize: 'xl' }); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await page.setViewportSize({ width: 320, height: 640 });
    await openHelp(page);
    assert.ok(await fits(page), 'экран без прокрутки вбок');
    await shot(page, `help-${theme}-320-xl`);
    await page.locator('#help-q').pressSequentially('как щитаеца', { delay: 10 });
    await page.waitForSelector('#help-found');
    assert.ok(await fits(page));
    await shot(page, `help-typing-${theme}-320-xl`);
    await page.locator('#help-q').fill('атдых в аборотном');
    await page.locator('#help-q').press('Enter');
    await page.waitForSelector('#help-found details[open] .faq-go');
    assert.ok(await fits(page));
    const go = await page.locator('#help-found details[open] .faq-go').boundingBox();
    assert.ok(go.x >= 0 && go.x + go.width <= 320, 'кнопка «Открыть» в ширину экрана');
    const input = await page.locator('#help-q').boundingBox();
    assert.ok(input.x >= 0 && input.x + input.width <= 320 && input.height >= 44, 'поле крупное и в экране');
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `help-answer-${theme}-320-xl`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
