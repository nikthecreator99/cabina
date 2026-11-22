import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp } from './helpers.js';

test('процент из PDF сохраняется на телефоне, виден в статистике и удаляется из тарифов', async () => {
  const env = await startEnv();
  try {
    const { page, context } = await openApp(env);
    const doc = await context.newPage();
    await doc.setContent('<p>Расчетный листок за март месяц 2026 года</p><p>февраль Премия 011L 17,50 175,00</p><p>Всего начислено 175,00</p>');
    const buffer = await doc.pdf();
    await doc.close();
    await page.locator('.tab[data-tab=extra]').click();
    await page.locator('button[data-page=payslip]').click();
    await page.locator('#ps-files').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer });
    await page.waitForSelector('#ps-details');
    await page.reload();
    await page.locator('.tab[data-tab=home]').click();
    await page.locator('.hero').click();
    await page.locator('#st-kind button').nth(1).click();
    assert.match(await page.locator('.screen').innerText(), /Средняя премия ≈ 17,5%. Примерно: на основе ваших расчётных листков/);
    await page.locator('.tab[data-tab=home]').click();
    await page.locator('.home-head [data-page=work]').click();
    await page.locator('[data-page=tariffs]').click();
    assert.equal(await page.locator('#pf-bonus').inputValue(), '17,5');
    await page.locator('[data-act=bonus-forget]').click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#pf-bonus')?.value === '10');
    assert.equal(await page.locator('[data-act=bonus-forget]').count(), 0);
  } finally { await env.stop(); }
});
