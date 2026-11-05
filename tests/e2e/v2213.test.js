// Браузерные проверки CABINA 2.21.3: «Дни дома» в статистике — свободные дни и самая длинная серия без выходного.
// «Сейчас» — 20.10.2026 12:00, считаются прошедшие сутки 1–19 октября. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка' }, { id: 'r2', from: 'Сосновка', to: 'Ёлкино' }];
const TRIPS = [
  // 2 окт туда, отдых в Сосновке, 3 окт обратно, 4 окт ещё поездка — 2, 3, 4 подряд
  { id: 'a1', routeId: 'r1', start: '2026-10-02T08:00', end: '2026-10-02T16:00', restType: 'turnaround' },
  { id: 'b1', routeId: 'r2', start: '2026-10-03T02:00', end: '2026-10-03T09:00', restType: 'home', homeChoice: 'queue' },
  { id: 'c1', routeId: 'r1', start: '2026-10-04T20:00', end: '2026-10-04T23:30', restType: 'home', homeChoice: 'queue' },
  // 9 окт 22:00 → 10 окт 06:00 (через полночь), отдых в Сосновке до 11 окт 01:00 — заняты 9, 10, 11
  { id: 'a2', routeId: 'r1', start: '2026-10-09T22:00', end: '2026-10-10T06:00', restType: 'turnaround' },
  { id: 'b2', routeId: 'r2', start: '2026-10-11T01:00', end: '2026-10-11T08:00', restType: 'home', homeChoice: 'queue' },
  // 14 окт: поездка, но день отмечен в календаре «Выходной» — свободный
  { id: 'c2', routeId: 'r1', start: '2026-10-14T00:00', end: '2026-10-14T01:00', restType: 'home', homeChoice: 'queue' },
  // завтрашняя явка в статистику не входит
  { id: 'p1', routeId: 'r1', start: '2026-10-21T08:00', end: '', restType: null },
];
const ABS = [{ id: 'v1', type: 'vacation', start: '2026-10-17', end: '2026-10-18' }];

test('статистика: дни дома и серия без выходного', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS, absences: ABS });
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.setDayOff('2026-10-14', true); });
  await page.locator('.hero').click();
  await page.waitForSelector('#st-kind');
  // 19 прошедших суток: заняты 2, 3, 4, 9, 10, 11 (14-е отмечено выходным), отпуск 17–18 — свободных 19 − 6 − 2 = 11
  const s = (await text(page, '.st-home')).replace(/\s+/g, ' ');
  assert.match(s, /Свободных дней 11 из 19 прошедших дней/);
  assert.match(s, /Дольше всего без выходного 3 дня 2–4 окт/);
  // будущий месяц — блока нет; всё время — с первой поездки (2–19 окт, 18 суток)
  await page.locator('[data-act=st-next]').click();
  assert.equal(await page.locator('.st-home').count(), 0);
  await page.locator('[data-act=st-period][data-v=all]').click();
  assert.match((await text(page, '.st-home')).replace(/\s+/g, ' '), /Свободных дней 10 из 18 прошедших дней/);
  assert.deepEqual(errors, []);
  await context.close();
});
