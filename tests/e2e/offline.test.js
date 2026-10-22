// Работа без интернета: после первого открытия приложение и данные доступны офлайн.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

test('приложение открывается без сети после первого запуска', async () => {
  const { context, page, errors } = await openApp(env, { sw: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cached = await page.evaluate(async () => (await caches.keys()));
  assert.ok(cached.some((k) => k.startsWith('cabina-v')), `кэш: ${cached}`);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00', locoType: '2ЭС5К', locoNumber: '355' }] });

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.trip');
  assert.match(await text(page, '.trip'), /2ЭС5К №355/);
  assert.equal(await text(page, '.month-title'), 'Октябрь 2026');
  assert.deepEqual(errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), []);
  await context.close();
});
