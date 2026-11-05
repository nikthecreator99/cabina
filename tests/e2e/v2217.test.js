// Браузерные проверки CABINA 2.21.7 (просьба Никиты 05.11.2026): «Напомнить в календаре» — файл .ics.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startEnv, openApp, seed, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function save(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), sheet(page).locator('[data-act=rm-save]').click()]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') };
}

test('явка: колокольчик рядом, «за 2 ч» по умолчанию, файл без станций; подсказка про будильник', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { trips: [{ id: 't1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-21T09:30', end: '', locoType: '2ЭС5К', locoNumber: '0123' }] });
  await page.reload(); await page.waitForSelector('.screen');
  const bell = page.locator('.banner-row [data-act=remind][data-what=yavka]');
  await bell.click();
  const f = sheet(page);
  await f.locator('#rm-before').waitFor();
  assert.match(await f.innerText(), /Явка[\s\S]*завтра[\s\S]*09:30/);
  assert.equal(await f.locator('[data-before="120"]').getAttribute('aria-pressed'), 'true');
  assert.match(await f.locator('#rm-alarm').innerText(), /будильник сами на завтра, 07:30/);
  await f.locator('[data-before="60"]').click();
  assert.match(await f.locator('#rm-alarm').innerText(), /завтра, 08:30/);
  assert.ok(await fits(page));
  const { name, text } = await save(page);
  assert.equal(name, 'cabina-yavka.ics');
  assert.match(text, /DTSTART:20261021T063000Z/);
  assert.match(text, /TRIGGER:-PT60M/);
  assert.match(text, /SUMMARY:CABINA: явка/);
  assert.doesNotMatch(text, /Сосновка|Ольховка|0123|2ЭС5К/);
  await waitNoLayers(page);
  assert.deepEqual(errors, []);
  await context.close();
});

test('конец отдыха и «на очередь»; прошедшее время напоминания не сохраняется', async () => {
  const { context, page, errors } = await openApp(env);
  // поездка закончилась в 10:00, «На очередь» — вызов не раньше 02:00 завтра (16 ч)
  await seed(page, { trips: [{ id: 't1', routeLabel: 'Ольховка → Сосновка', start: '2026-10-20T02:00', end: '2026-10-20T10:00', restType: 'home', homeChoice: 'queue', homeRest: { ids: ['t1'] } }] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.banner-row [data-act=remind][data-what=queue]').click();
  const f = sheet(page);
  await f.locator('#rm-before').waitFor();
  assert.match(await f.innerText(), /Могут вызвать на явку[\s\S]*завтра, 02:00/);
  const { name, text } = await save(page);
  assert.equal(name, 'cabina-ochered.ics');
  assert.match(text, /DTSTART:20261020T230000Z/);
  assert.match(text, /TRIGGER:PT0M/);
  // отдых в пункте оборота, который скоро кончится: «за 2 ч» уже в прошлом
  await seed(page, { trips: [{ id: 't1', routeLabel: 'Сосновка → Ольховка', start: '2026-10-20T05:00', end: '2026-10-20T10:00', restType: 'turnaround', homeChoice: null, homeRest: null }] });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.banner-row [data-act=remind][data-what=rest]').click();
  const g = sheet(page);
  await g.locator('#rm-before').waitFor();
  await g.locator('[data-before="120"]').click();
  assert.match(await g.locator('#rm-alarm').innerText(), /уже прошло/);
  await g.locator('[data-act=rm-save]').click();
  assert.equal(await page.locator('#layers .layer:not(.closing) #rm-before').count(), 1, 'окно не закрылось');
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await g.locator('[data-before="0"]').click(); await g.locator('[data-act=rm-save]').click(); })()]);
  assert.equal(dl.suggestedFilename(), 'cabina-otdyh.ics');
  assert.deepEqual(errors, []);
  await context.close();
});

test('медкомиссия: колокольчик на напоминании — событие на весь день', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { absences: [{ id: 'm1', type: 'medical', start: '2025-10-28', end: '2025-10-28', auto: true, monthHours: {}, createdAt: 1 }], settings: { med: { on: true, months: 12 } } });
  await page.reload(); await page.waitForSelector('.screen');
  await page.locator('.med-banner [data-act=remind]').click();
  const f = sheet(page);
  await f.locator('#rm-before').waitFor();
  assert.match(await f.innerText(), /Срок медкомиссии[\s\S]*28 октября 2026/);
  const { name, text } = await save(page);
  assert.equal(name, 'cabina-medkomissiya.ics');
  assert.match(text, /DTSTART;VALUE=DATE:20261028/);
  assert.match(text, /TRIGGER:-PT10080M/);
  assert.deepEqual(errors, []);
  await context.close();
});
