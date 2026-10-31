// Общие помощники браузерных тестов: сервер, браузер, «телефон», фиксированное время.
import { chromium } from 'playwright';
import { serve } from '../serve.js';

// «Сейчас» во всех тестах: вторник, 20 октября 2026, 12:00 по Москве
export const NOW = '2026-10-20T12:00:00+03:00';

export async function startEnv() {
  const { server, url } = await serve(0);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  return { server, url, browser, async stop() { await browser.close(); server.close(); } };
}

// Новый «телефон»: пустые данные, подсказки и поздравления с наградами выключены, приветствие закрыто.
export async function openApp(env, { onboard = true, tours = false, awards = false, now = NOW, sw = false } = {}) {
  const context = await env.browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', serviceWorkers: sw ? 'allow' : 'block', acceptDownloads: true,
  });
  if (!tours) await context.addInitScript(() => { try { localStorage.setItem('cabina-tours-off', '1'); } catch {} });
  if (!awards) await context.addInitScript(() => { try { localStorage.setItem('cabina-awards-quiet', '1'); } catch {} });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(now));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(env.url);
  await page.waitForSelector('.screen');
  if (onboard) {
    await page.getByRole('button', { name: 'Начать' }).click();
    await page.waitForSelector('.layer', { state: 'detached' });
  }
  return { context, page, errors };
}

// Записать данные напрямую через модуль хранилища приложения (быстрее, чем через формы).
export async function seed(page, { trips = [], absences = [], routes = [], settings } = {}) {
  await page.evaluate(async ({ trips, absences, routes, settings }) => {
    const s = await import('./js/store.js');
    for (const r of routes) await s.saveRoute(r);
    for (const a of absences) await s.saveAbsence(a);
    for (const t of trips) await s.saveTrip({ passenger: [], restType: 'turnaround', ...t });
    if (settings) await s.saveSettings(settings);
  }, { trips, absences, routes, settings });
}

export const text = (page, sel) => page.locator(sel).first().innerText();
export const closeTop = (page) => page.locator('.layer').last().locator('button[data-close]').first().click();
export const waitNoLayers = (page) => page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing)'));
