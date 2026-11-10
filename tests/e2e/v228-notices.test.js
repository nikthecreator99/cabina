// Браузерные проверки CABINA 2.28 (просьбы Никиты 10.11.2026): колокольчик слева от шестерёнки у каждого с аккаунтом,
// «Уведомления» (просьбы коллег показать статус, ответы на мои идеи, у администратора — новые идеи), красная точка на «Профиле»,
// «Попросить показать статус» в окне коллеги, комментарий администратора к идее, группы — подписи и «Приватность».
// Сервер подменён (mock-colleagues.js), люди и идеи выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const box = async (loc) => { for (let i = 0; i < 30; i++) { const b = await loc.boundingBox().catch(() => null); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; };
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const link = (a, b) => ({ from_id: a, to_id: b, state: 'accepted' });
const AT = '2026-10-19T09:00:00Z';
const I1 = 'cccccccc-0000-4000-8000-000000000001';
const I2 = 'cccccccc-0000-4000-8000-000000000002';
const I3 = 'cccccccc-0000-4000-8000-000000000003';
const profile = (page) => page.locator('.tab[data-tab=profile]').click();
const openBell = async (page) => { await profile(page); await page.locator('#pr-bell').click(); await page.locator('#ntc-page').waitFor(); };
const withAsk = (db) => {
  db.links = [link(ME, ANNA), link(ME, OLEG)];
  db.asks = [{ asker: ANNA, target: ME, state: 'open', asked_at: AT }];
};

test('колокольчик слева от шестерёнки, такого же размера; у гостя его нет; без уведомлений — пусто и честно', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, NEW);
  await profile(page);
  const bell = await box(page.locator('#pr-bell'));
  const gear = await box(page.locator('.screen [data-page=settings]'));
  assert.ok(bell.x + bell.width <= gear.x + 1, 'колокольчик левее шестерёнки');
  assert.ok(Math.abs(bell.width - gear.width) < 1 && Math.abs(bell.height - gear.height) < 1, 'такого же размера');
  assert.ok(Math.abs(bell.y - gear.y) < 1, 'в одной строке');
  assert.equal(await page.locator('.bell-dot').count(), 0, 'нет уведомлений — нет и точки');
  assert.equal(await page.locator('.tab.has-dot').count(), 0);
  await page.locator('#pr-bell').click();
  await page.locator('#ntc-page').waitFor();
  assert.match(await text(page, '#ntc-page'), /Пока уведомлений нет[\s\S]*Телефон не звонит/);
  assert.equal(await page.locator('#ntc-admin').count(), 0, 'обычному человеку — без «Идей пользователей»');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
  const g = await openApp(env, { guest: true });
  await g.page.locator('.tab[data-tab=profile]').click();
  assert.equal(await g.page.locator('#pr-bell').count(), 0, 'без аккаунта колокольчика нет');
  await g.context.close();
});

test('просьба коллеги: точка на колокольчике и на «Профиле»; «Включить» ничего не включает сам; «Не сейчас» и «Больше не просить»', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, withAsk);
  await profile(page);
  await page.locator('#pr-bell .bell-dot').waitFor();
  assert.equal(await text(page, '#pr-bell .bell-dot'), '1');
  assert.equal(await page.locator('.tab[data-tab=profile].has-dot').count(), 1, 'красная точка на кнопке «Профиль»');
  await page.locator('#pr-bell').click();
  await page.locator('#ntc-asks').waitFor();
  assert.match(await text(page, '#ntc-asks'), /Анна Тестовая просит показать ему ваш статус[\s\S]*Ничего не включится, пока вы сами не включите/);
  await shot(page, 'notices-ask-dark-390');
  // «Включить» — окно коллеги с пояснением; переключатель выключен, на сервер ничего не ушло
  await page.locator('[data-act=ntc-on]').click();
  await top(page).locator('.col-ask-note').waitFor();
  assert.match(await text(page, '#layers .col-ask-note'), /Анна Тестовая просит показать ему ваш статус[\s\S]*Пока вы сами не включите переключатель ниже/);
  assert.equal(await top(page).locator('#col-acc [data-item=status]').getAttribute('aria-checked'), 'false');
  assert.equal(srv.calls('set_access').length, 0, 'просьба сама ничего не включила');
  await shot(page, 'notices-ask-sheet-dark-390');
  await top(page).locator('#col-acc [data-item=status]').click();
  await page.waitForFunction(() => document.querySelector('#layers #col-acc [data-item=status]')?.getAttribute('aria-checked') === 'true');
  assert.equal(srv.calls('set_access').at(-1).body.p_item, 'status');
  await top(page).locator('.sheet-head [data-close]').click();
  await page.waitForFunction(() => !document.querySelector('#ntc-asks'));
  assert.match(await text(page, '#ntc-page'), /Пока уведомлений нет/, 'включил — просьба выполнена');
  // «Не сейчас» и «Больше не просить»
  srv.db.asks = [{ asker: ANNA, target: ME, state: 'open', asked_at: AT }, { asker: OLEG, target: ME, state: 'open', asked_at: AT }];
  await page.locator('.page-head [data-act=back]').click();
  await page.locator('.tab[data-tab=home]').click();
  await profile(page);
  await page.evaluate(async () => { const m = await import('./js/colleagues.js'); await m.loadColleagues({ force: true }); });
  await openBell(page);
  await page.locator(`[data-act=ntc-later][data-id="${ANNA}"]`).click();
  await page.waitForFunction((id) => !document.querySelector(`[data-act=ntc-later][data-id="${id}"]`), ANNA);
  assert.deepEqual(srv.calls('answer_status_ask').at(-1).body, { p_asker: ANNA, p_mute: false });
  await page.locator(`[data-act=ntc-mute][data-id="${OLEG}"]`).click();
  await page.waitForFunction((id) => !document.querySelector(`[data-act=ntc-mute][data-id="${id}"]`), OLEG);
  assert.deepEqual(srv.calls('answer_status_ask').at(-1).body, { p_asker: OLEG, p_mute: true });
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Попросить показать статус»: в окне коллеги, не чаще раза в неделю; «уже разрешил»; старый сервер', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => { db.links = [link(ME, ANNA), link(ME, OLEG)]; });
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('#col-entry').click();
  await page.locator('#col-sec').waitFor();
  await page.locator('[data-act=col-open]', { hasText: 'Анна' }).click();
  await top(page).locator('[data-act=col-ask]').waitFor();
  await shot(page, 'colleague-ask-dark-390');
  await top(page).locator('[data-act=col-ask]').click();
  await top(page).locator('.col-asked').waitFor();
  assert.deepEqual(srv.calls('ask_status').at(-1).body, { p_to: ANNA });
  assert.match(await text(page, '#col-ask-box'), /Вы уже попросили показать статус/);
  await top(page).locator('.sheet-head [data-close]').click();
  // второй раз — просьбы нет, напоминание о том, что уже просили (отметка в телефоне)
  await page.locator('[data-act=col-open]', { hasText: 'Анна' }).click();
  await top(page).locator('.col-asked').waitFor();
  assert.equal(await top(page).locator('[data-act=col-ask]').count(), 0);
  await top(page).locator('.sheet-head [data-close]').click();
  // Олег уже разрешил — сервер отвечает «already»
  srv.db.access.push({ user_id: OLEG, item: 'status', viewer_id: null });
  await page.locator('[data-act=col-open]', { hasText: 'Олег' }).click();
  await top(page).locator('[data-act=col-ask]').click();
  await page.waitForFunction(() => /уже разрешил вам видеть статус/.test(document.querySelector('.toast, #toasts')?.innerText || document.body.innerText));
  assert.equal(srv.calls('ask_status').length, 2);
  await top(page).locator('.sheet-head [data-close]').click();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
  // сервер без шага 10: просьб нет, «Коллеги» работают, при попытке — честное «ещё не включены»
  const old = await openApp(env);
  await ready(old.context, old.page, { ...NEW, asksOff: true }, (db) => { db.links = [link(ME, ANNA)]; });
  await old.page.locator('.tab[data-tab=profile]').click();
  await old.page.locator('#col-entry').click();
  await old.page.locator('#col-sec').waitFor();
  await old.page.locator('[data-act=col-open]', { hasText: 'Анна' }).click();
  await top(old.page).locator('[data-act=col-ask]').click();
  await old.page.waitForFunction(() => /Просьбы на сервере ещё не включены/.test(document.body.innerText));
  assert.deepEqual(realErrors(old.errors), []);
  await old.context.close();
});

test('ответ на мою идею: приходит в колокольчик с комментарием, после открытия «прочитан», виден у самой идеи', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    db.ideas = [
      { id: I1, body: 'Добавьте виджет с отдыхом на главный экран', state: 'accepted', created_at: AT, answered_at: AT, reply_ok: false, admin_note: 'Сделаем в одной из ближайших версий. Спасибо!', seen_at: null },
      { id: I2, body: 'Сделайте звук как в паровозе', state: 'declined', created_at: AT, answered_at: AT, reply_ok: false, admin_note: null, seen_at: AT },
    ];
  });
  await profile(page);
  await page.locator('#pr-bell .bell-dot').waitFor();
  assert.equal(await text(page, '#pr-bell .bell-dot'), '1', 'считается только непрочитанный ответ');
  await page.locator('#pr-bell').click();
  await page.locator('#ntc-ideas').waitFor();
  const t = await text(page, '#ntc-ideas');
  assert.match(t, /Ваша идея принята[\s\S]*Добавьте виджет с отдыхом[\s\S]*Ответ: Сделаем в одной из ближайших версий\. Спасибо!/);
  assert.doesNotMatch(t, /паровозе/, 'уже прочитанное в уведомления не попадает');
  await shot(page, 'notices-idea-dark-390');
  // открыл — прочитано: на сервере seen_at, точек больше нет
  for (let i = 0; i < 30 && srv.calls('mark_ideas_seen').length === 0; i++) await page.waitForTimeout(100);
  assert.equal(srv.calls('mark_ideas_seen').length, 1);
  assert.ok(srv.db.ideas.every((x) => x.seen_at));
  assert.match(await text(page, '#ntc-ideas'), /Ваша идея принята/, 'с экрана не пропала, пока я на нём');
  // идея → «Предложить идею» с комментарием
  await page.locator('.ntc-idea').click();
  await page.locator('.idea-list, #idea-list, .panel .idea').first().waitFor();
  assert.match(await text(page, '.screen'), /Ответ: Сделаем в одной из ближайших версий/);
  await page.locator('.page-head [data-act=back]').click();
  await page.locator('.page-head [data-act=back]').click();
  assert.equal(await page.locator('#pr-bell .bell-dot').count(), 0, 'прочитал — точки нет');
  assert.equal(await page.locator('.tab.has-dot').count(), 0);
  assert.equal(srv.calls('admin_ideas').length, 0, 'обычный человек список идей администратора не запрашивает');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('администратор: новые идеи в колокольчике, комментарий к идее, принять; число меняется', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    db.role = 'admin';
    db.ideas = [
      { id: I1, body: 'Покажите ночные часы крупнее', state: 'new', created_at: AT, answered_at: null, reply_ok: false },
      { id: I2, body: 'Напоминание за час до явки', state: 'new', created_at: AT, answered_at: null, reply_ok: false },
      { id: I3, body: 'Тёмная тема для квитка', state: 'accepted', created_at: AT, answered_at: AT, reply_ok: false, seen_at: AT },
    ];
  });
  await profile(page);
  await page.locator('#pr-bell .bell-dot').waitFor();
  assert.equal(await text(page, '#pr-bell .bell-dot'), '2');
  await page.locator('#pr-bell').click();
  await page.locator('#ntc-admin').waitFor();
  assert.match(await text(page, '#ntc-admin'), /Идеи пользователей[\s\S]*Новых: 2/);
  await shot(page, 'notices-admin-dark-390');
  await page.locator('#ntc-admin').click();
  await page.locator('#adm-ideas').waitFor();
  // комментарий к идее
  await page.locator(`[data-cm][data-id="${I1}"]`).click();
  await top(page).locator('#idea-note').fill('Сделаем в 2.29,   спасибо!');
  assert.equal(await top(page).locator('#idea-note').getAttribute('maxlength'), '300');
  await shot(page, 'admin-comment-dark-390');
  await top(page).locator('[data-act=idea-note-ok]').click();
  await page.waitForFunction(() => /Ваш комментарий:\s*Сделаем в 2\.29, спасибо!/.test(document.querySelector('#adm-ideas')?.innerText || ''));
  assert.deepEqual(srv.calls('admin_answer_idea').at(-1).body, { p_id: I1, p_note: 'Сделаем в 2.29, спасибо!' });
  assert.equal(srv.db.ideas[0].state, 'new', 'комментарий — не ответ');
  // принять вторую
  await page.locator(`[data-ans="1"][data-id="${I2}"]`).click();
  await page.waitForFunction(() => /Принята/.test(document.querySelector(`#adm-ideas [data-id="cccccccc-0000-4000-8000-000000000002"]`)?.innerText || ''));
  // к уже отвеченной тоже можно
  await page.locator(`[data-cm][data-id="${I3}"]`).click();
  await top(page).locator('#idea-note').fill('Уже в работе');
  await top(page).locator('[data-act=idea-note-ok]').click();
  await page.waitForFunction(() => /Уже в работе/.test(document.querySelector('#adm-ideas')?.innerText || ''));
  // закрыл окно — на экране «Уведомления» число 1
  await top(page).locator('.sheet-head [data-close]').click();
  await page.waitForFunction(() => /Новых: 1/.test(document.querySelector('#ntc-admin')?.innerText || ''));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'light' ? 'светлая' : 'тёмная'} тема: колокольчик, уведомления, окно коллеги`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(context, page, NEW, (db) => {
      withAsk(db);
      db.role = 'admin';
      db.ideas = [{ id: I1, body: 'Покажите ночные часы крупнее и ещё что-нибудь длинное', state: 'new', created_at: AT, answered_at: null, reply_ok: false },
        { id: I2, body: 'Ответили', state: 'accepted', created_at: AT, answered_at: AT, reply_ok: false, admin_note: 'Очень длинный комментарий, чтобы проверить перенос строк в узком экране телефона', seen_at: null }];
    });
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t, textSize: 'xl' }); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await profile(page);
    await page.locator('#pr-bell .bell-dot').waitFor();
    assert.ok(await fits(page), 'профиль без прокрутки вбок');
    const bell = await box(page.locator('#pr-bell'));
    const gear = await box(page.locator('.screen [data-page=settings]'));
    assert.ok(bell.x + bell.width <= gear.x + 1 && bell.x >= 0, 'колокольчик на экране, левее шестерёнки');
    await shot(page, `profile-bell-${theme}-320-xl`);
    await page.locator('#pr-bell').click();
    await page.locator('#ntc-asks').waitFor();
    assert.ok(await fits(page), 'уведомления без прокрутки вбок');
    await shot(page, `notices-${theme}-320-xl`);
    await page.locator('[data-act=ntc-on]').click();
    await top(page).locator('.col-ask-note').waitFor();
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => { const b = document.querySelector('#layers .sheet-body'); return b.scrollWidth <= b.clientWidth + 1; });
    assert.ok(ok, 'окно без прокрутки вбок');
    await shot(page, `notices-sheet-${theme}-320-xl`);
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  });
}
