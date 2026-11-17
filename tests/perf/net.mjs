// Замер загрузки по медленной сети: сервер как настоящий (HTTP/2, сжатие, ETag по времени файла, как у Caddy).
// Считает, сколько байт скачано и через сколько появился первый экран: первое открытие и обновление версии.
// Запуск: node tests/perf/net.mjs [папка с приложением]. В обычные тесты не входит.
import http2 from 'node:http2';
import http from 'node:http';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync, utimesSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright';

const SRC = normalize(join(process.argv[2] || '.', '/'));
const work = mkdtempSync(join(tmpdir(), 'cabina-net-'));
const ROOT = join(work, 'www/');
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'fonts', 'icons', 'data']) cpSync(join(SRC, f), join(ROOT, f), { recursive: true, preserveTimestamps: true });
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'k.pem'), '-out', join(work, 'c.pem'), '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff' };
const FRESH = /^\/(index\.html|sw\.js|manifest\.webmanifest|data\/.*)?$/;
let sent = 0; let hits = 0; let n304 = 0;
// H2=1 — HTTP/2 со своим сертификатом (как на сайте; годится для времени первого экрана, но браузер при таком
// сертификате ничего не запоминает). Без него — обычный HTTP на localhost: так считаем скачанные байты.
const H2 = process.env.H2 === '1';
const handler = (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'https://x').pathname);
    const fresh = FRESH.test(path);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    const st = statSync(file);
    const etag = `"${Math.round(st.mtimeMs).toString(36)}${st.size.toString(36)}"`;
    const head = { etag, 'last-modified': st.mtime.toUTCString(), 'content-type': TYPES[extname(file)] || 'application/octet-stream', ...(fresh ? { 'cache-control': 'no-cache' } : {}) };
    hits++;
    if (req.headers['if-none-match'] === etag) { n304++; sent += 150; res.writeHead(304, head).end(); return; }
    let body = readFileSync(file);
    if (/\.(js|css|html|json|webmanifest)$/.test(file)) { body = zlib.gzipSync(body); head['content-encoding'] = 'gzip'; }
    sent += body.length + 150;
    res.writeHead(200, head).end(body);
  } catch { res.writeHead(404).end(); }
};
const server = H2 ? http2.createSecureServer({ key: readFileSync(join(work, 'k.pem')), cert: readFileSync(join(work, 'c.pem')) }, handler) : http.createServer(handler);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `${H2 ? 'https' : 'http'}://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-certificate-errors'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, serviceWorkers: 'allow' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
// «плохая связь в пути»: 1,6 Мбит/с, задержка 300 мс; процессор в 4 раза медленнее
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const swIdle = async () => { await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; await new Promise((ok) => { const t = setInterval(() => { if (r.active && r.active.state === 'activated' && !r.installing) { clearInterval(t); ok(); } }, 50); }); }); };
const mb = (b) => (b / 1048576).toFixed(2);

// 1) первое открытие
let t0 = Date.now(); sent = 0; hits = 0; n304 = 0;
await page.goto(url, { waitUntil: 'commit' });
await page.waitForSelector('.screen');
const first = Date.now() - t0; const firstBytes = sent;
await swIdle(); await page.waitForTimeout(500);
const out = { firstScreenMs: first, firstScreenMB: mb(firstBytes), firstTotalMB: mb(sent), firstTotalSec: ((Date.now() - t0) / 1000).toFixed(1), requests: hits, r304: n304 };

// 2) второе открытие (всё из памяти телефона)
t0 = Date.now(); await page.reload({ waitUntil: 'commit' }); await page.waitForSelector('.screen'); out.secondScreenMs = Date.now() - t0;

// 3) обновление версии: поменялись три файла (как в обычном выпуске), остальное то же.
// PRESERVE=0 — сервер выкладывает как сейчас (у всех файлов новое время), PRESERVE=1 — время неизменённых файлов сохраняется.
const bump = (f, fn) => { const p = join(ROOT, f); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
if (process.env.PRESERVE === '0') { const now = new Date(Date.now() + 5000); const walk = (d) => { for (const e of execFileSync('find', [d, '-type', 'f']).toString().trim().split('\n')) utimesSync(e, now, now); }; walk(ROOT); }
bump('sw.js', (s) => s.replace(/cabina-v[\d.]+/, 'cabina-v99.0.0'));
bump('js/app.js', (s) => s + '\n// новая версия\n');
bump('css/app.css', (s) => s + '\n/* новая версия */\n');
sent = 0; hits = 0; n304 = 0; t0 = Date.now();
await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); await new Promise((ok) => { const t = setInterval(() => { if (r.waiting || (r.active && !r.installing)) { clearInterval(t); ok(); } }, 50); }); });
Object.assign(out, { updateMB: mb(sent), updateSec: ((Date.now() - t0) / 1000).toFixed(1), updateRequests: hits, update304: n304 });
console.log(JSON.stringify(out));
await browser.close(); server.close();
