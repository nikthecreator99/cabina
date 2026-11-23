// Браузерные проверки CABINA 2.18: тестовый режим «оплата по сменам» в «Тарифных ставках» и плавный светофор.
// Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
async function tariffs(page) {
  await tab(page, 'home');
  await page.locator('.home-head [data-page=work]').click();
  await page.locator('.screen [data-act=go][data-page=tariffs]').click();
}
async function payView(page) {
  await tab(page, 'home');
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  return (await text(page, '.screen')).replace(/\s+/g, ' ');
}

test('тестовый режим «оплата по сменам»: переключатель, строки квитка, пометки «тест»; выключили — как раньше', async () => {
  const { context, page, errors } = await openApp(env);
  // норма октября — 179 ч (шестидневка, 2.24.9); 10 смен по 20 ч = 200 ч → переработка 21 ч: 10 × 1,5 = 15 ч ×1,5, остальные 6 ч ×2
  const days = ['01', '03', '05', '07', '09', '11', '13', '15', '17', '19'];
  const list = days.map((d) => ({ id: `t${d}`, restType: 'home', routeLabel: 'Депо → Депо', start: `2026-10-${d}T06:00`, end: `2026-10-${String(+d + 1).padStart(2, '0')}T02:00` }));
  await seed(page, { settings: { pay: PAY }, trips: list });
  await tariffs(page);
  const sw = page.locator('#pay-shift [data-act=pay-shift]');
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  assert.match(await text(page, '#pay-shift'), /Тестовый режим: оплата по сменам[\s\S]*На каждую явку до 1,5 часа месячной переработки/);
  await sw.click();
  await page.waitForFunction(() => document.querySelector('#pay-shift [data-act=pay-shift]')?.getAttribute('aria-checked') === 'true');
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.settings.pay.main.shiftTest), true);

  let s = await payView(page);
  assert.match(s, /Тестовый режим: оплата по сменам/);
  assert.match(s, /Переработка, до 1,5 ч на явку 50% 15 ч 2 250,00 ₽/, '15 ч × 300 × 0,5');
  assert.match(s, /Переработка сверх 1,5 ч на явку 100% 6 ч 1 800,00 ₽/, '6 ч × 300');
  assert.doesNotMatch(s, /Переработка \d/);
  await tab(page, 'home');
  assert.match(await text(page, '.hero-pay'), /тест/i);

  // выключили — пометок нет, строк нет
  await tariffs(page);
  await page.locator('#pay-shift [data-act=pay-shift]').click();
  await page.waitForFunction(() => document.querySelector('#pay-shift [data-act=pay-shift]')?.getAttribute('aria-checked') === 'false');
  s = await payView(page);
  assert.doesNotMatch(s, /Тестовый режим|на смену/);
  assert.match(s, /Переработка/, 'обычный режим — как раньше');
  await tab(page, 'home');
  assert.doesNotMatch(await text(page, '.hero-pay'), /тест/i);

  // по среднему переключателя нет — режим только для расчёта по тарифу
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ pay: { main: { ...s.S.settings.pay.main, mode: 'avg', avgHour: 500 } } }); });
  await tariffs(page);
  assert.equal(await page.locator('#pay-shift').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('светофор: тянете — красный, отпустили — плавно жёлтый, обновилось — зелёный', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ pullAnim: 'light' }); });
  const lit = () => page.evaluate(() => Object.fromEntries(['r', 'y', 'g'].map((c) => [c, Number(getComputedStyle(document.querySelector(`.ptr-on.${c}`)).opacity).toFixed(2)])));
  const cdp = await context.newCDPSession(page);
  const pt = (y) => [{ x: 195, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(200) });
  for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(200 + i * 18) }); await new Promise((r) => setTimeout(r, 16)); }
  assert.deepEqual(await lit(), { r: '1.00', y: '0.00', g: '0.00' }, 'дотянули — горит красный, без жёлтого');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await new Promise((r) => setTimeout(r, 250));
  assert.equal((await lit()).r, '1.00', 'после отпускания красный ещё горит');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ptr-on.y')).opacity === '1');
  assert.equal((await lit()).r, '0.00');
  await page.locator('.ptr.done').waitFor({ state: 'attached' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ptr-on.g')).opacity === '1');
  assert.deepEqual(errors, []);
  await context.close();
});

test('переход к ставке и калькулятор среднего за день', async () => {
  const { context, page, errors } = await openApp(env);
  try {
    await seed(page, { trips: [{ id: 'one', start: '2026-10-19T06:00', end: '2026-10-19T16:00' }] });
    await page.getByRole('button', { name: /Заполните тарифную ставку/ }).click();
    await page.getByRole('button', { name: 'Формула среднего заработка за день' }).click();
    assert.match(await text(page, '.dialog'), /12 ÷ 29,3/);
    await page.getByRole('button', { name: 'Понятно' }).click();
    await page.getByRole('button', { name: 'Рассчитать средний за день' }).click();
    const amount = page.getByLabel('Заработок за 12 месяцев, ₽');
    await amount.fill('1 200 000');
    assert.equal((await text(page, 'output')).replace(/\s/g, ''), '3412,97₽задень');
    await amount.fill('351 600,00');
    assert.equal((await text(page, 'output')).replace(/\s/g, ''), '1000,00₽задень');
    await page.getByRole('button', { name: 'Готово' }).click();
    assert.equal(await page.locator('#pf-avgHour').inputValue(), '');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
