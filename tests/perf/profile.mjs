// Где уходит время: профиль процессора для одного действия. node tests/perf/profile.mjs <поездок> <сценарий>
import { startEnv, openApp, seed } from '../e2e/helpers.js';
import { makeTrips } from './data.mjs';
const N = Number(process.argv[2]) || 600; const what = process.argv[3] || 'stats';
const env = await startEnv(); const { page, context } = await openApp(env);
await seed(page, makeTrips(N));
await page.reload(); await page.waitForSelector('.screen');
const cdp = await context.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
const steps = {
  stats: async () => { await page.locator('.hero[data-act=stats]').click(); await page.waitForSelector('#st-period'); },
  statsAll: async () => { await page.locator('.hero[data-act=stats]').click(); await page.locator('#st-period [data-v=all]').click(); await page.waitForTimeout(300); },
  search: async () => { await page.locator('[data-act=go][data-page=search]').click(); await page.locator('#trip-q').pressSequentially('Альфа', { delay: 60 }); await page.waitForTimeout(400); },
  profile: async () => { await page.locator('.tab[data-tab=profile]').click(); await page.waitForTimeout(300); },
  start: async () => { await page.reload(); await page.waitForSelector('.screen'); await page.waitForTimeout(500); },
};
await cdp.send('Profiler.start'); await steps[what](); const { profile } = await cdp.send('Profiler.stop');
const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i] / 1000); });
// суммарное время с вложенными: по функциям
const parent = new Map(); profile.nodes.forEach((n) => (n.children || []).forEach((c) => parent.set(c, n.id)));
const total = new Map();
profile.samples.forEach((id, i) => { const seen = new Set(); for (let x = id; x; x = parent.get(x)) { const n = byId.get(x); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) || 0) + dt[i] / 1000); } } });
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)}\t${k}`).join('\n');
console.log('--- self'); console.log(top(self, 18)); console.log('--- total'); console.log(top(total, 30));
await env.stop();
