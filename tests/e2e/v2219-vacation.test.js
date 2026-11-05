// Браузерные проверки CABINA 2.21.9 (просьба Никиты 05.11.2026): отпускные ориентировочно в форме отпуска.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const monthly = (n, from = [2025, 10]) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(from[0], from[1] - 1 + i, 10)); const k = d.toISOString().slice(0, 10); return { id: `t${i}`, routeLabel: 'Сосновка → Ольховка', start: `${k}T08:00`, end: `${k}T16:00`, restType: 'turnaround' }; });
const PAY = { pay: { main: { mode: 'tariff', rates: [{ from: '2020-01-01', rate: 300 }], bonus: 0, harm: 0, night: 0 } } };

async function vacationForm(page, start, end) {
  await page.locator('[data-act=absences]').click();
  const f = top(page);
  await f.locator('.type-pick button').filter({ hasText: 'Отпуск' }).click();
  await f.locator('#af-start').fill(start);
  await f.locator('#af-end').fill(end);
  return f;
}

test('отпуск: ориентировочные отпускные, пояснение по «!», скрытие сумм', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { trips: monthly(12), settings: PAY });
  await page.reload(); await page.waitForSelector('.screen');
  const f = await vacationForm(page, '2026-11-02', '2026-11-15');
  const calc = f.locator('#af-vac-calc');
  await calc.waitFor();
  const t = await calc.innerText();
  assert.match(t, /Отпускные на руки[\s\S]*≈/);
  assert.match(t, /Дней отпуска \(без праздников\)\s*13/, '4 ноября — праздник');
  assert.match(t, /по поездкам за 11 месяцев/);
  assert.ok(await fits(page));
  await f.locator('[data-act=vac-info]').click();
  assert.match(await page.locator('.dialog').innerText(), /статье 139 ТК РФ[\s\S]*29,3/);
  await page.locator('.dialog [data-act=yes]').click();
  // другой вид отвлечения — блока нет
  await f.locator('.type-pick button').filter({ hasText: 'Учёба' }).click();
  assert.equal(await f.locator('#af-vac').isHidden(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('поездок меньше чем за полгода — объяснение вместо суммы; без ставки — подсказка', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: monthly(4, [2026, 6]), settings: PAY });
  await page.reload(); await page.waitForSelector('.screen');
  let f = await vacationForm(page, '2026-11-02', '2026-11-15');
  assert.match(await f.locator('#af-vac').innerText(), /хотя бы за 6 месяцев из 12 до отпуска \(сейчас — 4\)/);
  await f.locator('button[data-close]').first().click();
  await context.close();
  const B = await openApp(env);
  await seed(B.page, { trips: monthly(12) });
  await B.page.reload(); await B.page.waitForSelector('.screen');
  f = await vacationForm(B.page, '2026-11-02', '2026-11-15');
  assert.match(await f.locator('#af-vac').innerText(), /Укажите ставку/);
  assert.deepEqual([...errors, ...B.errors], []);
  await B.context.close();
});

test('«Время явки» в статистике — уже с первой поездки', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', routeLabel: 'Сосновка → Ольховка', start: '2026-10-14T05:30', end: '2026-10-14T14:00', restType: 'turnaround' }] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.evaluate(() => { const c = window.__cabina; c.V.pages = ['stats']; c.render(); });
  await page.locator('#ch-calls').waitFor();
  assert.match(await page.locator('.screen').innerText(), /Время явки\s+Чаще всего вызывают\s+с 04:00 до 06:00\s+1 из 1 явки/i);
  assert.deepEqual(errors, []);
  await context.close();
});
