// Браузерные проверки CABINA 2.43.2: на главной норма — по выбранной неделе (шестидневка), а переработка в заработке —
// от нормы по закону (пятидневка), как в расчётном листке: первые 2 ч ×1,5, дальше ×2. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

// сентябрь 2026: 20 будних дней по 10 ч = 200 ч; норма по шестидневке 174 ч, по закону (пятидневка) 176 ч
const DAYS = ['01', '02', '03', '04', '07', '08', '09', '10', '11', '14', '15', '16', '17', '18', '21', '22', '23', '24', '25', '28'];
const TRIPS = DAYS.map((d) => ({ id: `s${d}`, restType: 'turnaround', routeLabel: 'А → Б', start: `2026-09-${d}T06:00`, end: `2026-09-${d}T16:00` }));
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };

const overflow = (page) => page.evaluate(() => {
  const bad = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('страница ' + document.documentElement.scrollWidth);
  for (const el of document.querySelectorAll('.screen *')) {
    if (el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.right > innerWidth + 1) bad.push(el.className + ' ' + Math.round(r.right));
  }
  return bad.slice(0, 5);
});

for (const [width, size, theme] of [[390, 'm', 'dark'], [320, 'xl', 'dark'], [320, 'xl', 'light']]) {
  test(`норма на главной — как раньше, переработка в заработке — как в листке (${width} px, ${size}, ${theme})`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width, height: 800 });
    await seed(page, { settings: { pay: PAY, theme, textSize: size }, trips: TRIPS });
    await page.evaluate(([t, x]) => { document.documentElement.dataset.theme = t; document.documentElement.dataset.text = x; }, [theme, size]);
    await page.locator('.tab[data-tab=home]').click();
    await page.locator('[data-act=prev]').click();
    assert.match(await text(page, '#hero-norm'), /^Норма: 174 ч/, 'на главной — шестидневка, как раньше');
    assert.match(await text(page, '.hero-lines'), /Переработка:\s*26 ч 00 мин/);
    await page.locator('.hero').click();
    await page.locator('#st-kind button').nth(1).click();
    const s = (await text(page, '.screen')).replace(/\s+/g, ' ');
    assert.match(s, /Переработка, первые 2 ч 50% 2 ч 300,00 ₽/, '2 ч × 300 × 0,5');
    assert.match(s, /Переработка сверх 2 ч 100% 22 ч 6 600,00 ₽/, '200 − 176 = 24 ч: остальные 22 ч × 300');
    assert.deepEqual(await overflow(page), [], `${width} ${size} ${theme}`);
    assert.deepEqual(errors, []);
    await context.close();
  });
}
