// Браузерные проверки CABINA 2.3: напоминание о медкомиссии, квиток в PDF, «Настройки работы» одним блоком.
// Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const PAY = { assistant: { rates: [{ from: null, rate: 300 }], bonus: 12, harm: 4, night: 40 } };

test('медкомиссия: после добавления предлагает напомнить о следующей, срок — через год', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=absences]').click();
  await sheet(page).locator('[data-type=medical]').click();
  await page.fill('#af-start', '2026-10-19');
  await page.fill('#af-end', '2026-10-19');
  await sheet(page).locator('[data-act=save-abs]').click();
  const dlg = sheet(page);
  await dlg.getByText('Напомнить о следующей медкомиссии?').waitFor();
  assert.match(await dlg.innerText(), /до 19 октября 2027[\s\S]*за 2 недели, 5 октября 2027/);
  await dlg.getByRole('button', { name: 'Да, напомнить' }).click();
  await waitNoLayers(page);
  const med = await page.evaluate(async () => (await import('./js/store.js')).S.settings.med);
  assert.equal(med.on, true);
  assert.equal(med.months, 12);
  // в настройках видно срок, можно выключить и выбрать периодичность
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  const panel = page.locator('#med-panel');
  assert.match(await panel.innerText(), /Прошлая 19 октября 2026 · следующая до 19 октября 2027/);
  assert.equal(await page.locator('#med-on').getAttribute('aria-checked'), 'true');
  await page.selectOption('#med-period', '6');
  await page.waitForFunction(() => document.querySelector('#med-panel')?.innerText.includes('следующая до 19 апреля 2027'));
  await page.locator('#med-on').click();
  await page.waitForFunction(() => document.querySelector('#med-on')?.getAttribute('aria-checked') === 'false');
  assert.deepEqual(errors, []);
  await context.close();
});

test('медкомиссия: напоминание на главной за 2 недели, скрывается, кнопка открывает форму', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    absences: [{ id: 'm1', type: 'medical', start: '2025-10-25', end: '2025-10-25', auto: true, monthHours: {} }],
    settings: { med: { on: true, months: 12 } },
  });
  const banner = page.locator('.med-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /Медкомиссия через 5 дней[\s\S]*Срок 25 октября 2026 · прошлая 25 октября 2025/);
  await banner.locator('[data-act=med-add]').click();
  assert.equal(await sheet(page).locator('[data-type=medical]').getAttribute('aria-pressed'), 'true');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  await page.locator('[data-act=med-hide]').click();
  await banner.waitFor({ state: 'detached' });
  // без согласия на напоминание баннера нет
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ med: { on: false, months: 12 } }); });
  assert.equal(await page.locator('.med-banner').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('квиток за месяц в PDF: файл собирается в телефоне, с пометкой «ориентировочно»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, {
    trips: [{ id: 'a', start: '2026-10-14T20:00', end: '2026-10-15T04:00' }, { id: 'b', start: '2026-10-17T08:00', end: '2026-10-17T18:30' }],
    settings: { pay: PAY },
  });
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith(env.url)) requests.push(r.url()); });
  await page.locator('.hero').click();
  await page.locator('#st-kind button').filter({ hasText: 'Заработная плата' }).click();
  const btn = page.locator('[data-act=slip-pdf]');
  assert.match(await btn.innerText(), /Скачать квиток в PDF/);
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  assert.equal(dl.suggestedFilename(), 'CABINA-kvitok-2026-10.pdf');
  const pdf = await readFile(await dl.path());
  const s = pdf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.match(s, /\/Filter \/DCTDecode/);
  assert.ok(pdf.length > 30000, `в PDF есть страница-картинка (${pdf.length} байт)`);
  assert.deepEqual(requests, [], 'никаких запросов на сторонние адреса');
  // кнопка только у месяца
  await page.locator('#st-period button').filter({ hasText: 'Год' }).click();
  assert.equal(await page.locator('[data-act=slip-pdf]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('квиток: страница рисуется с названием, месяцем и предупреждением', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T20:00', end: '2026-10-15T04:00' }], settings: { pay: PAY } });
  const drawn = await page.evaluate(async () => {
    const m = await import('./js/slip.js');
    const d = m.slipData(2026, 10);
    const words = [];
    const fake = new Proxy({}, { get: (_, k) => (k === 'fillText' ? (t) => words.push(t) : k === 'measureText' ? (t) => ({ width: t.length * 5 }) : () => {}), set: () => true });
    m.drawSlip(fake, d, { today: new Date(Date.UTC(2026, 9, 20, 12)) });
    return { words, none: m.slipData(2026, 9) };
  });
  const all = drawn.words.join('\n');
  assert.match(all, /^CABINA$/m);
  assert.match(all, /Октябрь 2026/);
  assert.match(all, /ОРИЕНТИРОВОЧНЫЙ РАСЧЁТ/);
  assert.match(all, /Расчёт ориентировочный, итог — по вашему расчётному листку\./);
  assert.match(all, /Оплата по тарифу/);
  assert.match(all, /Не является официальной системой ОАО «РЖД»/);
  assert.equal(drawn.none, null, 'месяц без поездок — квитка нет');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Настройки работы»: все пункты — один сплошной блок, разделы раскрываются', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('.home-head [data-page=work]').click();
  assert.equal(await page.locator('.screen .panel').count(), 1);
  const panel = page.locator('.screen .panel');
  assert.match(await panel.innerText(), /Маршруты[\s\S]*Тарифные ставки[\s\S]*Дома отдыха[\s\S]*Междусменный отдых[\s\S]*16 ч[\s\S]*Выходной[\s\S]*60 ч/);
  await page.locator('[data-act=wk-toggle][data-k=shift]').click();
  assert.equal(await page.locator('.screen .panel').count(), 1);
  assert.ok(await page.locator('.panel #min-shift').count());
  assert.deepEqual(errors, []);
  await context.close();
});
