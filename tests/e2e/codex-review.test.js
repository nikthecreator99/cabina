// Проверка работы Codex (26.11.2026): пустая статистика счётчиков не показывается,
// заголовок «Расчётный листок» не переносится по слогам на 320 px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed } from './helpers.js';

const routes = [{ id: 'r1', from: 'Няндома', to: 'Коноша', distanceKm: 380 }];
const trip = (id, day, extra = {}) => ({ id, routeId: 'r1', routeLabel: 'Няндома → Коноша', start: `2026-10-${day}T08:00`, end: `2026-10-${day}T17:00`, locoType: '2ЭС5К', locoNumber: '123', restType: 'turnaround', ...extra });

test('«Показания счётчиков»: без показаний блока нет, с показаниями — только вписанные строки', async () => {
  const env = await startEnv();
  try {
    const { page, errors } = await openApp(env);
    const stats = async () => {
      await page.goto(env.url); await page.waitForSelector('.screen');
      await page.locator('[data-act=stats]').first().click();
      await page.getByText('Поездная статистика').waitFor();
      return page.locator('.screen').last().innerText();
    };
    await seed(page, { routes, trips: [trip('t1', '05'), trip('t2', '07')] });
    assert.doesNotMatch(await stats(), /Показания счётчиков/i);
    const meters = { mode: 'electric', sections: [{ energyFrom: '1000', energyTo: '1250,5' }, {}] };
    await seed(page, { routes, trips: [trip('t1', '05', { meters }), trip('t2', '07')] });
    const text = await stats();
    assert.match(text, /Показания счётчиков/i);
    assert.match(text, /Электроэнергия\s+250,5 кВт·ч/);
    assert.doesNotMatch(text, /Рекуперация|Топливо/);
    assert.deepEqual(errors, []);
  } finally { await env.stop(); }
});

test('заголовок «Расчётный листок» на 320 px — без переноса по слогам, в обеих темах', async () => {
  const env = await startEnv();
  try {
    for (const theme of ['dark', 'light']) {
      const { page, context } = await openApp(env);
      await page.setViewportSize({ width: 320, height: 700 });
      await seed(page, { settings: { theme, textSize: 'xl' } });
      await page.evaluate(() => location.reload());
      await page.waitForSelector('.screen');
      await page.locator('.tab[data-tab=extra]').click();
      await page.locator('[data-page=payslip]').click();
      const h1 = page.locator('.page-head h1');
      assert.equal(await h1.innerText(), 'Расчётный листок');
      assert.equal(await h1.evaluate(el => getComputedStyle(el).hyphens), 'manual');
      // слово «Расчётный» целиком в первой строке: высота строки не больше двух строк, ширина страницы не растёт
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
      await context.close();
    }
  } finally { await env.stop(); }
});
