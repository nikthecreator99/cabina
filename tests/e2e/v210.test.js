// Браузерные проверки CABINA 2.10: скрытие сумм (глаз и переворот), код для входа, переотдых по домам отдыха,
// локомотивы по сериям, время явки, итоги картинкой, «Минимальный междусменный отдых». Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const store = (page, fn) => page.evaluate(fn);
const PAY = { main: { rates: [{ from: null, rate: 300 }], bonus: 0, harm: 0, night: 0 } };
const ROUTES = [{ id: 'r1', from: 'Ёлкино', to: 'Сосновка', distanceKm: 100 }, { id: 'r2', from: 'Сосновка', to: 'Ёлкино', distanceKm: 100 }];
// туда (отдых в Сосновке) и обратно (домой, на очередь); после 8 ч работы явка через 10 ч — 2 ч переотдыха
const pair = (i, d, loco, num, hour = '08') => [
  { id: `a${i}`, routeId: 'r1', start: `2026-10-${d}T${hour}:00`, end: `2026-10-${d}T${String(+hour + 8).padStart(2, '0')}:00`, restType: 'turnaround', locoType: loco, locoNumber: num },
  { id: `b${i}`, routeId: 'r2', start: `2026-10-${String(+d + 1).padStart(2, '0')}T${String(+hour - 6).padStart(2, '0')}:00`, end: `2026-10-${String(+d + 1).padStart(2, '0')}T${String(+hour + 1).padStart(2, '0')}:00`, restType: 'home', homeChoice: 'queue', locoType: loco, locoNumber: num },
];
const TRIPS = [...pair(1, '02', '2ЭС5К', '355'), ...pair(2, '06', '2ЭС5К', '355'), ...pair(3, '10', '2ЭС5К', '101'), ...pair(4, '14', 'ВЛ80С', '2140')];
const flip = (page, beta) => page.evaluate((b) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: b, gamma: 1 })), beta);
const hidden = (page) => page.evaluate(() => document.documentElement.classList.contains('money-off'));
const pin = async (page, code) => { for (const c of code) await page.locator(`.pin-key[data-k="${c}"]`).last().click(); await page.waitForTimeout(600); };

test('статистика: переотдых по домам отдыха, локомотивы по сериям, время явки', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS, settings: { pay: PAY } });
  await page.locator('.hero').click();
  await page.waitForSelector('#st-kind');
  const s = await text(page, '.screen');
  // 4 раза в Сосновке, каждый раз 2 ч сверх привезённых 8 ч: 8 ч переотдыха, 8 × 300 × 2/3 = 1 600 ₽
  assert.match(s, /Переотдых\s+8\sч\s+4\sраза\s·\s≈\s1\s600\s₽/);
  assert.match(await text(page, '.st-house'), /Сосновка[\s\S]*Переотдых\s8\sч\s·\s4\sраза/);
  // серии с числом раз, по убыванию
  assert.deepEqual((await page.locator('.st-series').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()), ['2ЭС5К 6 раз', 'ВЛ80С 2 раза']);
  await page.locator('.st-series[data-k="2ЭС5К"]').click();
  assert.equal(await page.locator('.st-series[data-k="2ЭС5К"]').getAttribute('aria-expanded'), 'true');
  assert.deepEqual((await page.locator('.st-nums .r').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()), ['№355 4 раза', '№101 2 раза']);
  await page.locator('.st-nums [data-act=st-loco]').first().click();
  const sh = sheet(page);
  assert.match(await text(sh, '.sheet-head'), /2ЭС5К №355/);
  assert.match(await sh.innerText(), /4 раза в октябре 2026/);
  assert.equal(await sh.locator('[data-act=loco-trip]').count(), 4);
  assert.match(await sh.locator('[data-act=loco-trip]').first().innerText(), /7 окт, 02:00 · 7 ч[\s\S]*Сосновка → Ёлкино/, 'новые сверху');
  await sh.locator('[data-act=loco-trip]').first().click();
  await page.waitForSelector('#tf-sd');
  assert.equal(await sheet(page).locator('#tf-sd').inputValue(), '2026-10-07');
  await sheet(page).locator('button[data-close]').first().click();
  await waitNoLayers(page);
  // время явки: по 4 раза в 02:00 и 08:00 — чаще всего 02:00–04:00 (раньше по часам)
  assert.match(await text(page, '.screen'), /Время явки\s+Чаще всего вызывают\s+с 02:00 до 04:00\s+4 из 8 явок/i);
  assert.equal(await page.locator('#ch-calls .bar').count(), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('итоги картинкой: без сумм и станций, «Сохранить»', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS, settings: { pay: PAY } });
  await page.locator('.hero').click();
  await page.locator('[data-act=st-recap]').click();
  await page.waitForSelector('.recap-img');
  const size = await page.evaluate(() => { const i = document.querySelector('.recap-img'); return [i.naturalWidth, i.naturalHeight]; });
  assert.deepEqual(size, [1080, 1350]);
  const data = await store(page, async () => {
    const { ST } = await import('./js/stats.js');
    return ST.period;
  });
  assert.equal(data, 'month');
  assert.match(await sheet(page).innerText(), /Без сумм, имени, депо и станций/);
  const [dl] = await Promise.all([page.waitForEvent('download'), sheet(page).locator('[data-act=recap-save]').click()]);
  assert.equal(dl.suggestedFilename(), 'CABINA-itogi-2026-10.png');
  assert.deepEqual(errors, []);
  await context.close();
});

test('скрытие сумм: глаз, переворот экраном вниз, запоминается; переворот можно выключить', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, trips: TRIPS, settings: { pay: PAY } });
  await page.waitForSelector('.hero-pay .eye-btn');
  assert.equal(await hidden(page), false);
  await page.locator('.hero-pay .eye-btn').click();
  await page.waitForFunction(() => document.documentElement.classList.contains('money-off'));
  await page.waitForSelector('.hero-pay .eye-btn[aria-pressed=true]');
  const blur = await page.evaluate(() => getComputedStyle(document.querySelector('.hero-pay .money')).filter);
  assert.match(blur, /blur/);
  // после перезапуска суммы по-прежнему скрыты
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await hidden(page), true);
  // экраном вниз — видны; подняли и снова вниз — скрыты
  await flip(page, 179); await page.waitForTimeout(450);
  assert.equal(await hidden(page), false);
  await flip(page, -178); await page.waitForTimeout(450);
  assert.equal(await hidden(page), false, 'пока телефон не подняли, второй раз не срабатывает');
  await flip(page, 10); await flip(page, -178); await page.waitForTimeout(450);
  assert.equal(await hidden(page), true);
  // короткий поворот — не считается
  await flip(page, 10); await flip(page, 179); await flip(page, 20); await page.waitForTimeout(450);
  assert.equal(await hidden(page), true);
  // в статистике зарплата тоже скрыта, глаз есть и там
  await page.locator('.hero').click();
  await page.locator('#st-kind button').nth(1).click();
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.money-area .st-big')).filter), /blur/);
  await page.locator('.st-hero .eye-btn').click();
  await page.waitForFunction(() => !document.documentElement.classList.contains('money-off'));
  // выключили переворот — телефон экраном вниз ничего не меняет
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  assert.equal(await page.locator('#flip-sw').getAttribute('aria-checked'), 'true', 'на Android включено сразу');
  await page.locator('#flip-sw').click();
  await page.waitForFunction(() => document.querySelector('#flip-sw')?.getAttribute('aria-checked') === 'false');
  await flip(page, 10); await flip(page, 179); await page.waitForTimeout(450);
  assert.equal(await hidden(page), false);
  assert.equal(await store(page, async () => (await import('./js/store.js')).S.settings.flipHide), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('код для входа: предупреждение, два раза одинаково, экран при запуске, ошибка, выключение по текущему коду', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: TRIPS.slice(0, 2) });
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  assert.match(await text(page, '#lock-row'), /Код для входа\s+Выключен/);
  await page.locator('#lock-row').click();
  assert.match(await sheet(page).innerText(), /Если забудете код, восстановить его нельзя[\s\S]*резервной копии[\s\S]*не от взлома телефона/);
  await sheet(page).locator('[data-act=lk-set]').click();
  await pin(page, '1234');
  assert.match(await text(sheet(page), '.pin-title'), /Повторите код/);
  await pin(page, '1235');
  assert.match(await text(sheet(page), '.pin-msg'), /Коды не совпали/);
  await pin(page, '1234'); await pin(page, '1234');
  await waitNoLayers(page);
  assert.match(await text(page, '#lock-row'), /Включён/);
  // в хранилище — только хеш, не сам код; в резервную копию не попадает
  const saved = await page.evaluate(() => localStorage.getItem('cabina-lock'));
  assert.doesNotMatch(saved, /1234/);
  assert.equal(await store(page, async () => JSON.stringify((await import('./js/store.js')).S.settings).includes('cabina-lock')), false);
  // перезапуск: сначала код, записей не видно
  await page.reload();
  await page.waitForSelector('.lock');
  assert.equal(await page.locator('.screen').count(), 0, 'пока код не введён, приложение не рисуется');
  await pin(page, '0000');
  assert.match(await text(page, '.lock .pin-msg'), /Неверный код/);
  await pin(page, '1234');
  await page.waitForSelector('.lock', { state: 'detached' });
  await page.waitForSelector('.screen');
  // выключить можно только с текущим кодом
  await tab(page, 'profile');
  await page.locator('[data-page=settings]').click();
  await page.locator('#lock-row').click();
  await sheet(page).locator('[data-act=lk-off]').click();
  await pin(page, '9999');
  assert.match(await text(sheet(page), '.pin-msg'), /Неверный код/);
  await pin(page, '1234');
  await waitNoLayers(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-lock')), null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('код для входа: пауза после пяти ошибок, «Забыли код?» стирает записи и вход', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: TRIPS.slice(0, 2) });
  await page.evaluate(async () => {
    // код 4321 и «вход в аккаунт» — как будто их задали раньше
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode('4321'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
    const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
    localStorage.setItem('cabina-lock', JSON.stringify({ salt: b64(salt), hash: b64(bits), iter: 150000 }));
    localStorage.setItem('cabina-account', JSON.stringify({ access: 'x', refresh: 'y' }));
  });
  await page.reload();
  await page.waitForSelector('.lock');
  for (let i = 0; i < 5; i++) await pin(page, '1111');
  assert.match(await text(page, '.lock .pin-msg'), /Подождите 30 с/);
  await pin(page, '4321');
  assert.match(await text(page, '.lock .pin-msg'), /Слишком много попыток/, 'во время паузы даже верный код не принимается');
  await page.locator('[data-act=lock-forgot]').click();
  assert.match(await text(page, '.lock'), /Код восстановить нельзя[\s\S]*Стереть всё/);
  await page.locator('[data-act=lock-wipe]').click();
  await page.waitForSelector('.screen');
  assert.equal(await page.locator('.lock').count(), 0);
  assert.equal(await store(page, async () => (await import('./js/store.js')).S.trips.length), 0);
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('cabina-lock'), localStorage.getItem('cabina-account')]), [null, null]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('междусменный отдых: подпись «Минимальный междусменный отдых», по умолчанию 16 ч', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('.home-head [data-page=work]').click();
  const row = await text(page, '[data-k=shift]');
  assert.match(row, /Междусменный отдых\s+Минимальный междусменный отдых\s+16 ч/);
  assert.doesNotMatch(row, /Минимум дома/);
  assert.deepEqual(errors, []);
  await context.close();
});
