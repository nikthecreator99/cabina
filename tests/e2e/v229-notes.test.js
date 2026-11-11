// Браузерные проверки CABINA 2.29 (просьба Никиты 11.11.2026): заметки о локомотивах от коллег.
// Вписал локомотив в поездку — CABINA предлагает заметки коллег; «Полезно» / «Не помогло»; своя заметка — «Показать коллегам»
// (по умолчанию выключено, сначала выбор, кто видит); заметки коллег видны и без связи; награда «Полезный совет».
// Сервер подменён (mock-colleagues.js), люди и заметки выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, waitNoLayers } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource|ERR_FAILED|net::/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const sheetFits = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('#layers .layer:not(.closing) .sheet-body')].pop(); return b.scrollWidth <= b.clientWidth + 1; });
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const link = (a, b) => ({ from_id: a, to_id: b, state: 'accepted' });
const N1 = 'dddddddd-0000-4000-8000-000000000001';
const N2 = 'dddddddd-0000-4000-8000-000000000002';
const withNotes = (db) => {
  db.links = [link(ME, ANNA), link(OLEG, ME)];
  db.colNotes = [
    { id: N1, user_id: ANNA, loco_type: '2ЭС5К', loco_num: '405', body: 'Не работает обогрев кабины, <b>берите</b> тёплую куртку', month: '2026-10-01', useful: 0 },
    { id: N2, user_id: OLEG, loco_type: '2ЭС5К', loco_num: '405', body: 'Слабо держит кран вспомогательного тормоза', month: '2025-06-01', useful: 3 },
  ];
};
async function newTrip(page, num = '405') {
  await page.locator('[data-act=add-trip]').click();
  const f = top(page);
  await f.locator('#tf-lt').fill('2ЭС5К');
  await f.locator('#tf-ln').fill(num);
  return f;
}

test('вписал локомотив — CABINA предлагает заметки коллег; «Полезно» и «Не помогло»; текст коллеги не исполняется', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, withNotes);
  // снимок коллег загружается при открытии — ждём, пока заметки придут
  await page.waitForFunction(() => !!localStorage.getItem('cabina-col-notes'));
  const f = await newTrip(page, '406');
  assert.equal(await f.locator('.ln-col-btn').count(), 0, 'на другом локомотиве заметок нет');
  await f.locator('#tf-ln').fill('405');
  await f.locator('.ln-col-btn').waitFor();
  assert.match(await f.locator('.ln-col-btn').innerText(), /Заметки коллег по этому локомотиву \(2\)/);
  await f.locator('.ln-col-btn').click();
  const s = top(page);
  await s.locator('#ln-col-list').waitFor();
  const body = await s.locator('#ln-col-list').innerText();
  assert.match(body, /Анна[\s\S]*октябрь 2026/);
  assert.match(body, /Олег[\s\S]*июнь 2025 · давняя, могла устареть · полезно: 3/);
  assert.match(body, /<b>берите<\/b>/, 'разметка из заметки показана как текст');
  assert.equal(await s.locator('#ln-col-list b:text("берите")').count(), 0);
  assert.match(await s.innerText(), /не заменяют журнал технического состояния/);
  await shot(page, 'notes-colleagues-sheet');
  const anna = s.locator(`[data-note="${N1}"]`);
  await anna.locator('[data-vote=up]').click();
  await page.waitForFunction((id) => document.querySelector(`[data-note="${id}"] [data-vote=up]`)?.getAttribute('aria-pressed') === 'true', N1);
  assert.deepEqual(srv.calls('rate_loco_note').map((r) => r.body), [{ p_id: N1, p_useful: true }]);
  assert.match(await s.locator(`[data-note="${N1}"]`).innerText(), /полезно: 1/);
  // «Не помогло» снимает «Полезно» (на сервере остаётся только «полезно»); второй раз — ничего не уходит
  await s.locator(`[data-note="${N1}"] [data-vote=down]`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-note="${id}"] [data-vote=down]`)?.getAttribute('aria-pressed') === 'true', N1);
  assert.deepEqual(srv.calls('rate_loco_note').map((r) => r.body.p_useful), [true, false]);
  await s.locator(`[data-note="${N2}"] [data-vote=down]`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-note="${id}"] [data-vote=down]`)?.getAttribute('aria-pressed') === 'true', N2);
  assert.equal(srv.calls('rate_loco_note').length, 2, '«Не помогло» без «Полезно» — на сервер ничего');
  // сервер не узнаёт, какой локомотив я ввёл: в запросах нет номера
  assert.ok(!srv.log.some((r) => /405/.test(`${r.search}${JSON.stringify(r.body || '')}`) && r.path !== '/rest/v1/rpc/sync_loco_notes'), 'номер локомотива на сервер не уходит');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('заметки коллег видны и без связи (скачаны в телефон); вышел из аккаунта — стёрты', async () => {
  const { context, page } = await openApp(env);
  await ready(context, page, NEW, withNotes);
  await page.waitForFunction(() => !!localStorage.getItem('cabina-col-notes'));
  await context.unroute('https://api.cabina-app.ru/**');
  await context.route('https://api.cabina-app.ru/**', (r) => r.abort());
  await page.reload(); await page.waitForSelector('.screen');
  const f = await newTrip(page);
  await f.locator('.ln-col-btn').waitFor();
  assert.match(await f.locator('.ln-col-btn').innerText(), /\(2\)/);
  await f.locator('button[data-close]').first().click();
  await page.evaluate(async () => { const a = await import('./js/auth.js'); a.forget(); });
  await page.reload(); await page.waitForSelector('.screen');
  await page.evaluate(async () => { const c = await import('./js/colleagues.js'); c.colNotesFor('2ЭС5К', '405'); });
  assert.equal(await page.evaluate(() => localStorage.getItem('cabina-col-notes')), null, 'после выхода заметок коллег в телефоне нет');
  await context.close();
});

test('своя заметка: «Показать коллегам» выключено; включить — сначала выбор, кто видит; на сервер — только серия, номер, текст и месяц', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, withNotes);
  await page.waitForFunction(() => !!localStorage.getItem('cabina-col-notes'));
  await page.locator('.tab[data-tab=extra]').click();
  await page.locator('[data-act=extra-notes]').click();
  // заметки коллег — и на экране заметок, с поиском
  assert.match(await text(page, '#col-notes-list'), /2ЭС5К №405[\s\S]*Не работает обогрев/);
  await page.locator('[data-act=note-add]').first().click();
  const f = top(page);
  await f.locator('#nf-type').fill('ВЛ80С');
  await f.locator('#nf-num').fill('1702');
  await f.locator('#nf-text').fill('Песочница справа не работает');
  assert.equal(await f.locator('#nf-share').getAttribute('aria-checked'), 'false', 'по умолчанию — не показывать');
  assert.equal(await f.locator('#nf-share-warn').isHidden(), true);
  await f.locator('#nf-share').click();
  // кому видно ещё не выбрано — сначала окно выбора
  const acc = top(page);
  await acc.locator('[data-mode=all]').waitFor();
  assert.match(await acc.innerText(), /Кто видит мои заметки[\s\S]*Группы их не видят/);
  await acc.locator('[data-mode=all]').click();
  await acc.locator('[data-act=access-save]').click();
  await page.waitForFunction(() => document.querySelector('#nf-share')?.getAttribute('aria-checked') === 'true');
  assert.deepEqual(srv.calls('set_access').map((r) => r.body), [{ p_item: 'notes', p_all: true, p_ids: null }]);
  assert.match(await f.locator('#nf-share-sub').innerText(), /Видят: Все коллеги/);
  assert.match(await f.locator('#nf-share-warn').innerText(), /Не пишите имена, телефоны и служебную информацию/);
  // длиннее 300 знаков — коллегам нельзя
  await f.locator('#nf-text').fill('а'.repeat(301));
  await f.locator('[data-act=save-note]').click();
  assert.match(await f.locator('[data-error]').innerText(), /не длиннее 300 знаков/);
  await f.locator('#nf-text').fill('Песочница справа не работает');
  await f.locator('[data-act=save-note]').click();
  await waitNoLayers(page);
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && !srv.db.myNotes.length; i++) await page.waitForTimeout(100);
  const sent = srv.calls('sync_loco_notes').at(-1).body.p_notes;
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['b', 'k', 'm', 'n', 't']);
  assert.deepEqual({ t: sent[0].t, n: sent[0].n, b: sent[0].b, m: sent[0].m }, { t: 'ВЛ80С', n: '1702', b: 'Песочница справа не работает', m: '2026-10' });
  assert.match(await text(page, '#notes-list'), /видят коллеги/);
  // «Приватность» → «Заметки о локомотивах» → «Никто»: сервер стирает, телефон больше не шлёт
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('.screen [data-page=privacy]').click();
  await page.locator('#pv-notes').waitFor();
  assert.match(await text(page, '#pv-notes'), /Заметки о локомотивах[\s\S]*Видят: Все коллеги/);
  await page.locator('#pv-notes [data-item=notes]').click();
  await top(page).locator('[data-mode=none]').click();
  await top(page).locator('[data-act=access-save]').click();
  await page.waitForFunction(() => /Видят: Никто/.test(document.querySelector('#pv-notes')?.innerText || ''));
  assert.deepEqual(srv.db.myNotes, []);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Полезный совет»: коллеги отметили мои заметки — награда со счётчиком, число только растёт', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    withNotes(db);
    db.access.push({ user_id: ME, item: 'notes', viewer_id: null });
  });
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveNote({ id: 'n1', tripId: null, type: '2ЭС5К', number: '355', text: 'Свистит компрессор', shared: true, createdAt: Date.parse('2026-10-05T10:00:00Z') }); });
  for (let i = 0; i < 50 && !srv.db.myNotes.length; i++) await page.waitForTimeout(100);
  srv.db.myNotes[0].useful = 3; // трое коллег отметили «Полезно»
  await page.evaluate(async () => { const c = await import('./js/colleagues.js'); await c.loadColleagues({ force: true }); });
  await page.waitForFunction(async () => { const s = await import('./js/store.js'); return s.S.profile.useful?.n === 3; });
  srv.db.myNotes[0].useful = 1; // кто-то снял отметку — награду не отбираем
  await page.evaluate(async () => { const c = await import('./js/colleagues.js'); await c.loadColleagues({ force: true }); });
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.profile.useful.n), 3);
  await page.locator('.tab[data-tab=extra]').click();
  await page.locator('[data-act=extra-notes]').click();
  assert.match(await text(page, '#notes-list'), /видят коллеги · полезно: 1/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('без аккаунта и со старым сервером — переключателя нет, заметки работают как раньше', async () => {
  const g = await openApp(env, { guest: true });
  await g.page.locator('.tab[data-tab=extra]').click();
  await g.page.locator('[data-act=extra-notes]').click();
  await g.page.locator('[data-act=note-add]').first().click();
  await top(g.page).locator('#nf-text').waitFor();
  assert.equal(await g.page.locator('#nf-share').count(), 0);
  await g.context.close();
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => { withNotes(db); db.notesOff = true; });
  await page.evaluate(async () => { const c = await import('./js/colleagues.js'); await c.loadColleagues({ force: true }); });
  const f = await newTrip(page);
  await f.locator('[data-act=add-note]').click();
  assert.equal(await f.locator('#tf-note-share').count(), 0, 'старый сервер — делиться нечем');
  assert.equal(await f.locator('.ln-col-btn').count(), 0);
  assert.equal(srv.calls('sync_loco_notes').length, 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'light' ? 'светлая' : 'тёмная'} тема: кнопка в поездке, окно заметок, переключатель`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(context, page, NEW, withNotes);
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t, textSize: 'xl' }); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await page.waitForFunction(() => !!localStorage.getItem('cabina-col-notes'));
    const f = await newTrip(page);
    await f.locator('.ln-col-btn').waitFor();
    await f.locator('[data-act=add-note]').click();
    await f.locator('#tf-note-share').waitFor();
    await f.locator('#tf-note-share').scrollIntoViewIfNeeded();
    assert.ok(await sheetFits(page), 'форма без прокрутки вбок');
    await shot(page, `notes-trip-${theme}-320-xl`);
    await f.locator('.ln-col-btn').click();
    await top(page).locator('#ln-col-list').waitFor();
    await page.waitForTimeout(400);
    assert.ok(await sheetFits(page), 'окно заметок без прокрутки вбок');
    const up = await top(page).locator('[data-vote=up]').first().boundingBox();
    assert.ok(up.height >= 40, 'кнопка «Полезно» — крупная');
    await shot(page, `notes-sheet-${theme}-320-xl`);
    assert.ok(await fits(page));
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  });
}
