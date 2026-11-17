// Замер скорости CABINA на «медленном телефоне»: запуск, вкладки, перерисовка главной.
// Запуск: node tests/perf/measure.mjs [число поездок]. В обычные тесты не входит.
import { startEnv, openApp, seed } from '../e2e/helpers.js';
import { makeTrips } from './data.mjs';

const N = Number(process.argv[2]) || 600;
const SLOW = Number(process.env.SLOW) || 6;
const env = await startEnv();
const { page, context } = await openApp(env);

await seed(page, makeTrips(N));

const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
const out = {};

const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
await cdp.send('Performance.enable');
const busy = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; const g = (n) => m.find((x) => x.name === n).value * 1000; return { task: g('TaskDuration'), script: g('ScriptDuration'), layout: g('LayoutDuration') + g('RecalcStyleDuration') }; };
const diff = (a, b) => ({ task: Math.round(b.task - a.task), script: Math.round(b.script - a.script), layout: Math.round(b.layout - a.layout) });

// 1) запуск: от начала загрузки до первого экрана (часы снаружи) и сколько процессор был занят
const runs = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('.screen .hero, .screen');
  const wall = Date.now() - t0;
  await page.waitForTimeout(1500);
  runs.push({ wall, ...(await busy()) });
}
out.start = { wall: med(runs.map((r) => r.wall)), task: Math.round(med(runs.map((r) => r.task))), script: Math.round(med(runs.map((r) => r.script))) };

// 2) вкладки и экраны: сколько процессор занят от нажатия до покоя
const tap = async (sel) => {
  const a = await busy(); const t0 = Date.now();
  await page.evaluate((sel) => new Promise((r) => { document.querySelector(sel).click(); requestAnimationFrame(() => requestAnimationFrame(r)); }), sel);
  const wall = Date.now() - t0;
  await page.waitForTimeout(400);
  return { wall, ...diff(a, await busy()) };
};
const tabs = {};
for (let k = 0; k < 3; k++) for (const tab of ['profile', 'learn', 'extra', 'home']) (tabs[tab] ||= []).push(await tap(`.tab[data-tab=${tab}]`));
out.tabs = Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, { wall: med(v.map((x) => x.wall)), script: med(v.map((x) => x.script)), layout: med(v.map((x) => x.layout)) }]));
// тяжёлые экраны
out.screens = {};
const once = async (name, sel) => { out.screens[name] = await tap(sel); };
await tap('.tab[data-tab=home]');
await once('stats', '.hero[data-act=stats]');
await once('statsYear', '#st-period [data-v=year]');
await once('statsAll', '#st-period [data-v=all]');
await tap('.screen .page-head [data-act=back]');
await once('search', '[data-act=go][data-page=search]');
{ const a = await busy(); await page.locator('#trip-q').pressSequentially('Альфа', { delay: 60 }); await page.waitForTimeout(500); out.screens.searchType = diff(a, await busy()); }
await tap('.screen .page-head [data-act=back]');
await tap('.tab[data-tab=profile]');
if (await page.locator('[data-act=go][data-page=awards], #pr-awards-all').count()) await once('awards', '[data-act=go][data-page=awards], #pr-awards-all');
// простой: минута без нажатий
{ const a = await busy(); await page.waitForTimeout(3000); out.idle3s = diff(a, await busy()); }

console.log(JSON.stringify({ trips: N, slow: SLOW, ...out }));
await env.stop();
