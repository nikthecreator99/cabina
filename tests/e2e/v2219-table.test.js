// Браузерные проверки CABINA 2.21.9 (просьба Никиты 05.11.2026): выгрузка в Excel (CSV) и загрузка из таблицы.
// Все данные выдуманные. «Сейчас» — 20.10.2026 12:00 МСК (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startEnv, openApp, seed, waitNoLayers, openSettings } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const TRIPS = [
  { id: 'a', routeLabel: 'Сосновка → Ольховка', start: '2026-10-14T20:30', end: '2026-10-15T05:10', locoType: '2ЭС5К', locoNumber: '0123', weight: 6100, restType: 'turnaround' },
  { id: 'b', routeLabel: 'Ольховка → Сосновка', start: '2026-10-16T08:00', end: '2026-10-16T16:00', kind: 'reserve', restType: 'home', homeChoice: 'queue', homeRest: { ids: ['a', 'b'] } },
  { id: 'c', routeLabel: 'Сосновка → Ольховка', start: '2025-12-30T08:00', end: '2025-12-30T16:00', restType: 'turnaround' },
];

test('выгрузка: предупреждение, период, заработок по желанию; файл открывается обратно как поездки', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cabina-csv-'));
  const A = await openApp(env);
  await A.page.setViewportSize({ width: 320, height: 700 });
  await seed(A.page, { trips: TRIPS, settings: { pay: { main: { mode: 'tariff', rates: [{ from: '2020-01-01', rate: 400 }] } } } });
  await A.page.reload(); await A.page.waitForSelector('.screen');
  await openSettings(A.page, 'set-data');
  await A.page.locator('#table-export').click();
  const f = top(A.page);
  await f.locator('#tx-per').waitFor();
  assert.match(await f.innerText(), /Файл не защищён паролем[\s\S]*Не выкладывайте его в общие чаты/);
  assert.match(await f.locator('#tx-count').innerText(), /2 поездки/);
  await f.locator('[data-per=all]').click();
  assert.match(await f.locator('#tx-count').innerText(), /3 поездки/);
  await f.locator('[data-per=month]').click();
  assert.ok(await fits(A.page));
  let [dl] = await Promise.all([A.page.waitForEvent('download'), f.locator('#tx-save').click()]);
  assert.equal(dl.suggestedFilename(), 'cabina-poezdki-2026-10.csv');
  let csv = readFileSync(await dl.path(), 'utf8');
  assert.ok(csv.startsWith('﻿Дата явки;'));
  assert.doesNotMatch(csv, /Заработок/);
  assert.equal(csv.trim().split('\r\n').length, 3);
  await waitNoLayers(A.page);
  // с заработком
  await A.page.locator('#table-export').click();
  await top(A.page).locator('#tx-money').click();
  [dl] = await Promise.all([A.page.waitForEvent('download'), top(A.page).locator('#tx-save').click()]);
  csv = readFileSync(await dl.path(), 'utf8');
  assert.match(csv.split('\r\n')[0], /Заработок на руки, ₽ \(ориентировочно\)$/);
  assert.match(csv.split('\r\n')[1], /;\d+$/);
  const path = join(dir, 'poezdki.csv');
  writeFileSync(path, csv);
  assert.deepEqual(A.errors, []);

  // загрузка этого файла в чистый телефон
  const B = await openApp(env);
  await B.page.setViewportSize({ width: 320, height: 700 });
  await openSettings(B.page, 'set-data');
  await B.page.locator('#tbl-import').setInputFiles(path);
  await B.page.waitForSelector('.imp-list');
  const pv = top(B.page);
  assert.match(await pv.innerText(), /Поездки из таблицы[\s\S]*Проверьте цифры/);
  assert.equal(await pv.locator('.imp-row').count(), 2);
  assert.ok(await fits(B.page));
  await B.page.locator('#imp-add').click();
  await waitNoLayers(B.page);
  const got = await B.page.evaluate(async () => { const s = await import('./js/store.js'); return { t: s.S.trips.map((t) => [t.start, t.end, t.locoNumber, t.kind || '']).sort(), r: s.S.routes.map((r) => `${r.from}→${r.to}`).sort() }; });
  assert.deepEqual(got.t, [['2026-10-14T20:30', '2026-10-15T05:10', '0123', ''], ['2026-10-16T08:00', '2026-10-16T16:00', '', 'reserve']]);
  assert.deepEqual(got.r, ['Ольховка→Сосновка', 'Сосновка→Ольховка']);
  // файл Excel (.xlsx) — объяснение, как сохранить в CSV
  const x = join(dir, 'tab.xlsx'); writeFileSync(x, 'PK');
  await openSettings(B.page, 'set-data');
  await B.page.locator('#tbl-import').setInputFiles(x);
  await B.page.locator('.toast', { hasText: 'Сохраните таблицу в формате CSV' }).waitFor();
  assert.deepEqual(B.errors, []);
  await A.context.close(); await B.context.close();
});
