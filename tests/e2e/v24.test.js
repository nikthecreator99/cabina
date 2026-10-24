// Браузерные проверки CABINA 2.4: оплата больничного по дням. Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const PAY = { assistant: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };

test('больничный: после добавления подсказывает указать оплату дня, в квитке — дни × оплата', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-02T08:00', end: '2026-10-02T16:00' }], settings: { pay: PAY } });
  await page.locator('[data-act=absences]').click();
  await sheet(page).locator('[data-type=sick]').click();
  await page.fill('#af-start', '2026-10-05');
  await page.fill('#af-end', '2026-10-14');
  await sheet(page).locator('[data-act=save-abs]').click();
  const dlg = sheet(page);
  await dlg.getByText('Посчитать оплату больничного?').waitFor();
  await dlg.getByRole('button', { name: 'Указать' }).click();
  await waitNoLayers(page);
  assert.match(await text(page, '.page-head'), /Тарифные ставки и надбавки/);
  const box = page.locator('#pay-sick');
  assert.match(await box.innerText(), /Оплата одного дня больничного[\s\S]*календарный день/);
  await page.fill('#pf-sickDay', '2500');
  await page.locator('#pf-sickDay').blur();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.settings.pay.assistant.sickDay === 2500);
  // квиток за октябрь: 8 ч × 300 = 2 400 и больничный 10 дней × 2 500 = 25 000
  await page.locator('[data-act=back]').first().click();
  await page.locator('[data-act=back]').first().click();
  await page.locator('.hero').click();
  await page.locator('#st-kind button').filter({ hasText: 'Заработная плата' }).click();
  const s = await text(page, '.screen');
  assert.match(s, /Больничный\s*10 дней\s*25\s000,00\s₽/);
  assert.match(s, /Всего начислено\s*27\s400,00\s₽/);
  assert.match(s, /НДФЛ 13%\s*3\s562,00\s₽/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('больничный: без оплаты дня в квитке его нет, в пояснении сказано, где её указать', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    trips: [{ id: 'a', start: '2026-10-02T08:00', end: '2026-10-02T16:00' }],
    absences: [{ id: 's', type: 'sick', start: '2026-10-05', end: '2026-10-14', auto: true, monthHours: {} }],
    settings: { pay: PAY },
  });
  await page.locator('.hero').click();
  await page.locator('#st-kind button').filter({ hasText: 'Заработная плата' }).click();
  const s = await text(page, '.screen');
  assert.doesNotMatch(s, /Больничный\s*10 дней/);
  assert.match(s, /Больничный — если в «Тарифных ставках» указана оплата одного дня/);
  assert.deepEqual(errors, []);
  await context.close();
});
