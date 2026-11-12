// Браузерные проверки CABINA 2.32 (просьба Никиты 11.11.2026): напарник в поездке — из своих коллег, из тех,
// с кем уже ездили, или вписанное имя; «С кем ездил» в статистике. Напарник только в телефоне — на сервер не уходит.
// Сервер подменён (mock-colleagues.js), люди выдуманные. «Сейчас» — 20.10.2026 12:00 МСК.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const link = (a, b) => ({ from_id: a, to_id: b, state: 'accepted' });
const stored = (page, id) => page.evaluate(async (x) => { const s = await import('./js/store.js'); return s.S.trips.find((t) => t.id === x) || null; }, id);
const openStats = async (page) => { await page.evaluate(() => { const c = window.__cabina; c.V.pages = ['stats']; c.render(); }); await page.waitForSelector('#st-kind'); };

test('напарник из коллег и вписанное имя: компактно в форме, сохраняется, на сервер не уходит, «С кем ездил» в статистике', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { consents: [{ document: CUR, withdrawn_at: null }] }, (db) => { db.links = [link(ME, ANNA), link(ME, OLEG)]; });
  await page.locator('[data-act=add-trip]').click();
  const f = top(page);
  await f.locator('#tf-sd').fill('2026-10-18');
  await f.locator('#tf-st').fill('08:00');
  await f.locator('#tf-et').fill('16:00');
  // пока напарника нет — одна кнопка «+»
  assert.equal(await f.locator('#tf-mates .add-btn').count(), 1);
  assert.match(await f.locator('#tf-add-mate').innerText(), /Напарник/);
  await f.locator('#tf-add-mate').click();
  const p = top(page);
  await p.locator('#mt-cols').waitFor();
  assert.match(await p.innerText(), /Мои коллеги[\s\S]*Анна Тестовая[\s\S]*Олег Пробный/i);
  assert.match(await p.locator('.mt-why').innerText(), /только в этом телефоне[\s\S]*ничего не отправляется/);
  await shot(page, 'mates-picker');
  await p.locator(`[data-mate-id="${ANNA}"]`).click();
  await f.locator('.mate-chip').first().waitFor();
  assert.match(await f.locator('#tf-mates').innerText(), /Напарник\s+Анна Тестовая/);
  // ещё одного — вписанным именем; уже выбранной Анны в окне нет
  await f.locator('.mate-more').click();
  const p2 = top(page);
  await p2.locator('#mt-name').waitFor();
  assert.equal(await p2.locator(`[data-mate-id="${ANNA}"]`).count(), 0);
  await p2.locator('#mt-name').fill('  Пётр  Выдуманный ');
  await p2.locator('[data-act=mt-add]').click();
  await page.waitForFunction(() => document.querySelectorAll('#tf-mates .mate-chip').length === 2);
  assert.match(await f.locator('#tf-mates').innerText(), /Напарники\s+Анна Тестовая\s+Пётр Выдуманный/);
  // вписали имя коллеги — это он и есть (по id)
  await f.locator('.mate-more').click();
  await top(page).locator('#mt-name').fill('олег пробный');
  await top(page).locator('[data-act=mt-add]').click();
  await page.waitForFunction(() => document.querySelectorAll('#tf-mates .mate-chip').length === 3);
  assert.equal(await f.locator('.mate-more').count(), 0, 'больше трёх нельзя');
  await f.locator('.mate-x[aria-label*="Олег"]').click();
  assert.equal(await f.locator('.mate-chip').count(), 2);
  await f.locator('#tf-mates').scrollIntoViewIfNeeded(); await shot(page, 'mates-form');
  await f.locator('[data-rest=turnaround]').click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const all = await page.evaluate(async () => { const s = await import('./js/store.js'); return s.S.trips; });
  const t = all.find((x) => x.mates);
  assert.deepEqual(t.mates, [{ id: ANNA, name: 'Анна Тестовая' }, { id: '', name: 'Пётр Выдуманный' }]);
  // ничего о напарниках не ушло на сервер
  await page.waitForTimeout(300);
  assert.equal(srv.log.filter((r) => /Пётр|Выдуманный/.test(JSON.stringify(r.body || '')) || /Пётр/.test(decodeURIComponent(r.search || ''))).length, 0);
  // снова открыли — напарники на месте
  await page.locator('.trip').filter({ hasText: '08:00' }).first().click();
  await top(page).locator('.mate-chip').first().waitFor();
  assert.equal(await top(page).locator('.mate-chip').count(), 2);
  await top(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // статистика: «С кем ездил»
  await openStats(page);
  const b = page.locator('.st-mates-b');
  await b.waitFor();
  assert.match(await b.innerText(), /С кем ездил[\s\S]*Анна Тестовая[\s\S]*8 ч[\s\S]*1 поездка/i);
  await b.scrollIntoViewIfNeeded(); await shot(page, 'mates-stats');
  await b.locator('[data-act=st-mate]').first().click();
  assert.match(await top(page).innerText(), /Анна Тестовая[\s\S]*18 окт/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('без аккаунта: «Ездили вместе» из прошлых поездок, поиск по напарнику; 320 px, светлая тема, очень крупный текст', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await page.setViewportSize({ width: 320, height: 720 });
  await seed(page, { settings: { theme: 'light', textSize: 'xl' }, trips: [
    { id: 'm1', start: '2026-10-15T08:00', end: '2026-10-15T16:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround', mates: [{ id: '', name: 'Константин Длиннофамильный-Выдуманный' }] },
    { id: 'm2', start: '2026-10-16T08:00', end: '2026-10-16T14:00', routeLabel: 'Ольховка → Сосновка', restType: 'turnaround', mates: [{ id: '<bad>', name: '<b>Семён</b>' }, 'мусор'] },
  ] });
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.locator('[data-act=add-trip]').click();
  const f = top(page);
  // напарник последней поездки уже стоит; чужая разметка в имени — просто текст
  await f.locator('.mate-chip').first().waitFor();
  assert.match(await f.locator('#tf-mates').innerText(), /как в прошлой поездке[\s\S]*<b>Семён<\/b>/);
  await f.locator('.mate-x').click();
  await f.locator('#tf-add-mate').click();
  const p = top(page);
  await p.locator('#mt-recent').waitFor();
  assert.equal(await p.locator('#mt-cols').count(), 0, 'без аккаунта коллег нет');
  assert.match(await p.locator('#mt-recent').innerText(), /<b>Семён<\/b>[\s\S]*Константин/);
  assert.equal(await p.locator('#mt-recent b').count(), 0, 'чужая разметка не рисуется');
  assert.equal(await fits(page), true);
  await shot(page, 'mates-picker-320-light');
  await p.locator('[data-mate-key]').filter({ hasText: 'Константин' }).click();
  await f.locator('.mate-chip').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#layers .layer').length === 1);
  const chip = await f.locator('.mate-chip').boundingBox();
  assert.ok(chip.x + chip.width <= 320, 'длинное имя не вылезает за экран');
  assert.equal(await fits(page), true);
  await f.locator('#tf-mates').scrollIntoViewIfNeeded(); await shot(page, 'mates-form-320-light');
  await top(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // поиск находит поездку по напарнику
  const hits = await page.evaluate(async () => { const s = await import('./js/search.js'); return s.searchTrips('константин').map((t) => t.id); });
  assert.deepEqual(hits, ['m1']);
  await openStats(page);
  await page.locator('.st-mates-b').waitFor();
  await page.locator('.st-mates-b').scrollIntoViewIfNeeded();
  assert.equal(await fits(page), true);
  await shot(page, 'mates-stats-320-light');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('напарник прошлой поездки стоит сам; убрали — поля mates нет, блока в статистике нет; «Поделиться напарнику» его не передаёт', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 's1', start: '2026-10-15T08:00', end: '2026-10-15T16:00', routeLabel: 'Сосновка → Ольховка', restType: 'turnaround', mates: [{ id: '', name: 'Пётр Выдуманный' }] }] });
  const shared = await page.evaluate(async () => {
    const sh = await import('./js/share.js'); const s = await import('./js/store.js');
    const code = await sh.encodeTrips(s.S.trips);
    return JSON.stringify(await sh.decodeShare(code));
  });
  assert.doesNotMatch(shared, /Пётр|mates/);
  await page.locator('[data-act=add-trip]').click();
  const f = top(page);
  await f.locator('#tf-sd').fill('2026-10-18'); await f.locator('#tf-st').fill('08:00'); await f.locator('#tf-et').fill('16:00');
  // просьба Никиты 12.11: напарник из прошлой поездки уже стоит — уберём его, поездка без напарника
  assert.match(await f.locator('#tf-mates').innerText(), /Напарник · как в прошлой поездке\s+Пётр Выдуманный/i);
  await f.locator('.mate-x').click();
  assert.equal(await f.locator('.mate-chip').count(), 0);
  await f.locator('[data-rest=turnaround]').click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const t = (await page.evaluate(async () => (await import('./js/store.js')).S.trips)).find((x) => x.id !== 's1');
  assert.equal('mates' in t, false);
  // следующая — снова с напарником из последней поездки, где он был (s1), и сохраняется с ним
  await page.locator('[data-act=add-trip]').click();
  const g = top(page);
  await g.locator('#tf-sd').fill('2026-10-19'); await g.locator('#tf-st').fill('08:00'); await g.locator('#tf-et').fill('16:00');
  assert.equal(await g.locator('.mate-chip').count(), 1);
  await g.locator('[data-rest=turnaround]').click();
  await g.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  const u = (await page.evaluate(async () => (await import('./js/store.js')).S.trips)).find((x) => x.start === '2026-10-19T08:00');
  assert.deepEqual(u.mates, [{ id: '', name: 'Пётр Выдуманный' }]);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
