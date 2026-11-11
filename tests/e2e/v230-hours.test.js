// Браузерные проверки CABINA 2.30 (просьба Никиты 11.11.2026): часы коллег — только по их разрешению.
// Свои часы: «Приватность» → «Мои часы» (никому / всем коллегам / выбранным) и переключатель в окне коллеги; по умолчанию — никому,
// и тогда на сервер ничего не уходит. Часы коллеги — в его окне и в списке «Мои коллеги». Сервер подменён, люди выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, waitNoLayers } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR, openTeam, openPrivacy, chooseAccess } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const link = (a, b) => ({ from_id: a, to_id: b, state: 'accepted' });
const AT = '2026-10-20T08:10:00Z';
// Анна показывает мне свои часы (112 ч 30 мин в октябре, 179 ч в сентябре), Олег — нет
const friends = (db) => {
  db.links = [link(ME, ANNA), link(OLEG, ME)];
  db.hours = { [ANNA]: { month: '2026-10', cur_min: 6750, prev_min: 10740, updated_at: AT } };
};

test('часы коллеги: видны в списке и в его окне, только если он их показывает; мои — по умолчанию никому и не уходят', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, friends);
  await openTeam(page);
  await page.locator('.col-row[data-id="' + ANNA + '"] .col-hrs').waitFor();
  assert.equal(await text(page, `.col-row[data-id="${ANNA}"] .col-hrs`), '112 ч 30 мин в октябре');
  assert.equal(await page.locator(`.col-row[data-id="${OLEG}"] .col-hrs`).count(), 0, 'Олег часы не показывает — их нет');
  await shot(page, 'hours-team-dark-390');
  await page.locator(`.col-row[data-id="${ANNA}"]`).click();
  await top(page).locator('#col-hours').waitFor();
  assert.match(await text(page, '#layers #col-hours'), /Отработано\s+112 ч 30 мин в октябре\s+179 ч в сентябре/);
  assert.match(await text(page, '#layers .col-hours-upd'), /обновлено в 11:10/);
  // мои часы Анне не видны: переключатель выключен
  assert.equal(await top(page).locator('#col-acc [data-item=hours]').getAttribute('aria-checked'), 'false');
  await page.waitForTimeout(500);
  await shot(page, 'hours-sheet-dark-390');
  await top(page).locator('.sheet-head [data-close]').click();
  await waitNoLayers(page);
  await page.waitForTimeout(2500);
  assert.equal(srv.calls('set_hours').length, 0, 'никому не показываю — на сервер не ушло');
  assert.equal(srv.db.hours[ME], undefined);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Приватность» → «Мои часы»: всем коллегам — уходят только месяц и два числа; «Никто» — стираются', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, friends);
  await openPrivacy(page);
  await page.locator('#pv-hours').waitFor();
  assert.match(await text(page, '#pv-hours'), /Часы для коллег[\s\S]*Мои часы[\s\S]*Видят: Никто/i);
  await chooseAccess(page, 'hours', 'all');
  await page.waitForFunction(() => /Видят: Все коллеги/.test(document.querySelector('#pv-hours')?.innerText || ''));
  assert.deepEqual(srv.calls('set_access').at(-1).body, { p_item: 'hours', p_all: true, p_ids: null });
  await page.waitForFunction(() => /Так вас видят: 8 ч в октябре/.test(document.querySelector('#pv-hours')?.innerText || ''));
  for (let i = 0; i < 40 && !srv.calls('set_hours').length; i++) await page.waitForTimeout(100);
  // поездка 20.10 02:00–10:00 — 8 ч в октябре, в сентябре — ничего
  assert.deepEqual(srv.calls('set_hours').at(-1).body, { p_month: '2026-10', p_cur: 480, p_prev: 0 });
  assert.deepEqual(Object.keys(srv.calls('set_hours').at(-1).body).sort(), ['p_cur', 'p_month', 'p_prev'], 'больше ничего не уходит');
  assert.equal(srv.db.hours[ME].cur_min, 480);
  await shot(page, 'hours-privacy-dark-390');
  await chooseAccess(page, 'hours', 'none');
  await page.waitForFunction(() => /Видят: Никто/.test(document.querySelector('#pv-hours')?.innerText || ''));
  assert.equal(srv.db.hours[ME], undefined, '«Никто» — сервер стёр часы');
  // только выбранным: Анне
  await chooseAccess(page, 'hours', 'some', ['Анна Тестовая']);
  await page.waitForFunction(() => /Видят: Анна Тестовая/.test(document.querySelector('#pv-hours')?.innerText || ''));
  assert.deepEqual(srv.calls('set_access').at(-1).body, { p_item: 'hours', p_all: false, p_ids: [ANNA] });
  // статус при этом никому не включился
  assert.equal(srv.db.access.some((a) => a.item === 'status'), false);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('без новой редакции согласия — сначала согласие; переключатель «Мои часы» в окне коллеги', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { consents: [{ document: 'privacy-4', withdrawn_at: null }] }, friends);
  await openTeam(page);
  // новая редакция: в ней есть часы; без неё «Коллеги» просят сначала принять её
  await page.locator('[data-act=col-consent]').click();
  await page.locator('#col-agree').waitFor();
  assert.match(await text(page, '#layers .layer:last-child'), /privacy-5[\s\S]*отработанные часы/);
  await top(page).locator('#col-agree').check();
  await top(page).locator('[data-act=col-agree-ok]').click();
  await waitNoLayers(page);
  await page.locator(`.col-row[data-id="${OLEG}"]`).click();
  await top(page).locator('#col-acc [data-item=hours]').click();
  await page.waitForFunction(() => document.querySelector('#layers #col-acc [data-item=hours]')?.getAttribute('aria-checked') === 'true');
  assert.deepEqual(srv.calls('give_consent').at(-1).body, { p_document: 'privacy-5' });
  assert.deepEqual(srv.calls('set_access').at(-1).body, { p_item: 'hours', p_all: false, p_ids: [OLEG] });
  assert.equal(await top(page).locator('#col-acc [data-item=status]').getAttribute('aria-checked'), 'false', 'статус — отдельно, не включился');
  await top(page).locator('#col-acc [data-item=hours]').click();
  await page.waitForFunction(() => document.querySelector('#layers #col-acc [data-item=hours]')?.getAttribute('aria-checked') === 'false');
  assert.deepEqual(srv.calls('set_access').at(-1).body, { p_item: 'hours', p_all: false, p_ids: null });
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('сервер без шага 11: «Коллеги» работают как раньше, выбора «Мои часы» нет', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { ...NEW, hoursOff: true }, friends);
  await openTeam(page);
  await page.locator(`.col-row[data-id="${ANNA}"]`).waitFor();
  assert.equal(await page.locator('.col-hrs').count(), 0);
  await page.locator(`.col-row[data-id="${ANNA}"]`).click();
  await top(page).locator('#col-acc [data-item=status]').waitFor();
  assert.equal(await top(page).locator('#col-acc [data-item=hours]').count(), 0);
  await top(page).locator('.sheet-head [data-close]').click();
  await waitNoLayers(page);
  await openPrivacy(page);
  assert.equal(await page.locator('#pv-hours').count(), 0);
  assert.equal(srv.calls('set_hours').length, 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Что сервер знает о вас»: свои часы и кому они видны', async () => {
  const { context, page } = await openApp(env);
  await ready(context, page, NEW);
  const html = await page.evaluate(async () => {
    const m = await import('./js/colleagues.js');
    return m.myDataHtml({ email: 'ivan@example.com', colleagues_hours: { month: '2026-10', cur_min: 480, prev_min: 0, updated_at: '2026-10-20T09:00:00Z', expires_at: '2026-10-27T09:00:00Z' },
      colleagues_access: [{ item: 'hours', to: 'all' }] });
  });
  assert.match(html, /Часы для коллег[\s\S]*8 ч в октябре, 0 ч в сентябре/);
  assert.match(html, /сотрутся сами 27 октября 2026/);
  assert.match(html, /Часы видят[\s\S]*все коллеги/);
  // чужое и мусор с сервера не рисуется
  const bad = await page.evaluate(async () => {
    const m = await import('./js/colleagues.js');
    return [m.cleanHours({ month: '2026-13', cur_min: 1 }), m.cleanHours({ month: '2026-10', cur_min: -5 }), m.cleanHours({ month: '<b>', cur_min: 1 }), m.cleanHours({ month: '2026-10', cur_min: 1e9 })];
  });
  assert.deepEqual(bad, [null, null, null, null]);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'light' ? 'светлая' : 'тёмная'} тема: список, окно коллеги, «Приватность»`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(context, page, NEW, friends);
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t, textSize: 'xl' }); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await openTeam(page);
    await page.locator('.col-hrs').first().waitFor();
    assert.ok(await fits(page), 'список без прокрутки вбок');
    await shot(page, `hours-team-${theme}-320-xl`);
    await page.locator(`.col-row[data-id="${ANNA}"]`).click();
    await top(page).locator('#col-hours').waitFor();
    await page.waitForTimeout(500);
    assert.ok(await fits(page));
    await shot(page, `hours-sheet-${theme}-320-xl`);
    await top(page).locator('.sheet-head [data-close]').click();
    await waitNoLayers(page);
    await openPrivacy(page);
    await page.locator('#pv-hours').scrollIntoViewIfNeeded();
    assert.ok(await fits(page));
    await shot(page, `hours-privacy-${theme}-320-xl`);
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  });
}
