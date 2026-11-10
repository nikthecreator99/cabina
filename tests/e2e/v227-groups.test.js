// Браузерные проверки CABINA 2.27 (просьбы Никиты 10.11.2026): экран «Группы» по его макету («Вы администратор» / «Вы участник»,
// «Создать» и «Вступить по коду» рядом), картинка группы, статус в группе — взаимно (напоминание со стрелкой к переключателю,
// честный текст про геолокацию), «Предложить стать коллегами» из окна участника. Сервер подменён (mock-colleagues.js),
// люди, станции и группы выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const SHOTS = process.env.CABINA_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const box = async (loc) => { for (let i = 0; i < 30; i++) { const b = await loc.boundingBox().catch(() => null); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; };
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const G1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const G2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const at = '2026-10-01T08:00:00Z';
const member = (group_id, user_id, extra = {}) => ({ group_id, user_id, role: 'member', show_status: false, show_place: false, joined_at: at, ...extra });
const STATUSES = {
  [ANNA]: { kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning', note: null, until_at: null, after_kind: null, updated_at: '2026-10-20T08:50:00Z' },
  [OLEG]: { kind: 'rest', place: 'Ольховка', dest: null, part: null, note: null, until_at: '2026-10-20T13:00:00Z', after_kind: 'wait', updated_at: '2026-10-20T08:00:00Z' },
};
// Я — администратор «ТД-64» (с картинкой) и участник «Колонна № 3»; Анна показывает статус и станции в «Колонне», Олег — нет
const TWO = (db) => {
  db.groups = [{ id: G1, name: 'ТД-64', pic: { k: 'text', t: 'ТД-64', f: 'u', sz: 2, sh: 'rnd', bg: 0 } }, { id: G2, name: 'Колонна № 3', pic: null }];
  db.members = [member(G1, ME, { role: 'admin' }), member(G1, OLEG),
    member(G2, ANNA, { role: 'admin', show_status: true, show_place: true }), member(G2, ME), member(G2, OLEG)];
  db.statuses = { ...STATUSES };
};
async function openGroups(page) {
  await tab(page, 'profile');
  await page.locator('#grp-entry').click();
  await page.locator('#grp-list').waitFor();
}
const openGroup = async (page, name) => {
  await page.locator('[data-act=grp-open]', { hasText: name }).click();
  await page.locator('#grp-members').waitFor();
};

test('«Группы» по макету: «Создать» и «Вступить по коду» рядом, «Вы администратор» / «Вы участник», приватность и «?»', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, NEW, TWO);
  await openGroups(page);
  // кнопки — рядом, «Создать» слева
  const cr = await box(page.locator('#grp-new'));
  const jn = await box(page.locator('#grp-join'));
  assert.ok(Math.abs(cr.y - jn.y) < 2 && cr.x < jn.x, 'кнопки в одну строку');
  assert.match(await text(page, '#grp-new'), /Создать/);
  assert.match(await text(page, '#grp-join'), /Вступить по коду/);
  // разделы и порядок
  const all = await text(page, '#grp-list');
  assert.match(all, /Вы администратор\s*1[\s\S]*ТД-64[\s\S]*2 участника[\s\S]*Вы участник\s*1[\s\S]*Колонна № 3[\s\S]*3 участника/);
  assert.equal(await page.locator('#grp-admin [data-act=grp-open]').count(), 1);
  assert.equal(await page.locator('#grp-mem [data-act=grp-open]').count(), 1);
  // картинка: своя у «ТД-64» (текст), по умолчанию у «Колонны»
  assert.equal(await page.locator('#grp-admin .gpic-svg text').innerHTML(), 'ТД-64');
  assert.equal(await page.locator('#grp-mem .gpic-svg text').count(), 0);
  // напоминание у групп, где я свой статус не показываю
  assert.match(await text(page, '#grp-mem'), /Покажите свой статус — увидите коллег/);
  await shot(page, 'groups-dark-390');
  // «?» — как работают группы
  await page.locator('#grp-help').click();
  assert.match(await text(page, '#grp-help-body'), /Вы администратор[\s\S]*Вы участник[\s\S]*Статус — взаимно[\s\S]*геолокации в приложении нет/);
  await top(page).locator('.sheet-head [data-close]').click();
  // «Настройки приватности» ведут в «Приватность»
  assert.match(await text(page, '.grp-priv'), /Вы сами решаете, кому виден ваш статус/);
  await page.locator('#grp-privacy').click();
  await page.locator('#pv-access').waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('статус в группе — взаимно: скрыт, пока не покажу свой; напоминание со стрелкой; станции — за станции', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, TWO);
  await openGroups(page);
  await openGroup(page, 'Колонна № 3');
  // свой не показываю: статус Анны скрыт (хотя она его показывает), Олег статус не показывает вовсе
  const list = await text(page, '#grp-members');
  assert.match(list, /Анна Тестовая[\s\S]*Статус скрыт\. Покажите свой — увидите его/);
  assert.doesNotMatch(list, /В пути|Сосновка/);
  assert.match(list, /Олег Пробный[\s\S]*Машинист/);
  // напоминание над переключателем, стрелка указывает на него
  assert.match(await text(page, '#grp-nudge'), /Хотите видеть, где коллеги\?[\s\S]*Покажите группе свой статус — и увидите их\. Уже показывают: 1 из 2\./);
  const arrow = await box(page.locator('#grp-nudge .grp-arrow'));
  const sw = await box(page.locator('#grp-share [data-item=status]'));
  assert.ok(arrow.y + arrow.height <= sw.y + 4, 'стрелка — над переключателем');
  assert.ok(Math.abs((arrow.x + arrow.width / 2) - (sw.x + sw.width / 2)) < sw.width, 'и прямо над ним');
  // честный текст: геолокации нет, станции — только по «Где я»
  assert.match(await text(page, '#grp-truth'), /CABINA не знает, где вы находитесь: геолокации в приложении нет[\s\S]*станции из поездки — только если включите «Где я»[\s\S]*Номер поезда и локомотива, точное время явки и причину отвлечения не видит никто/);
  await shot(page, 'group-locked-dark-390');
  // окно участника: тоже скрыто
  await page.locator('[data-act=grp-member]', { hasText: 'Анна' }).click();
  assert.match(await text(page, '#layers .sheet'), /Статус скрыт: покажите группе свой — и увидите его/);
  await top(page).locator('.sheet-head [data-close]').click();
  // показываю статус — вижу статус Анны, но без станций (я свои не показываю)
  await page.locator('#grp-share [data-item=status]').click();
  await page.waitForFunction(() => document.querySelector('#grp-share [data-item=status]')?.getAttribute('aria-checked') === 'true');
  assert.deepEqual(srv.calls('set_group_share').at(-1).body, { p_group: G2, p_status: true, p_place: false });
  await page.waitForFunction(() => /В пути/.test(document.querySelector('#grp-members')?.innerText || ''));
  assert.equal(await page.locator('#grp-nudge').count(), 0, 'напоминание пропало');
  assert.doesNotMatch(await text(page, '#grp-members'), /Сосновка/, 'станций нет — свои не показываю');
  assert.match(await text(page, '#grp-share'), /Станции коллег видны тем, кто показывает свои/);
  // показываю «где я» — вижу станции
  await page.locator('#grp-share [data-item=place]').click();
  await page.waitForFunction(() => /Сосновка → Ольховка/.test(document.querySelector('#grp-members')?.innerText || ''));
  // в списке групп напоминания у этой группы больше нет
  await page.locator('.page-head [data-act=back]').click();
  await page.locator('#grp-list').waitFor();
  assert.doesNotMatch(await text(page, '#grp-mem'), /Покажите свой статус/);
  assert.match(await text(page, '#grp-mem'), /видят ваш статус/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('коллега в группе виден по правилам коллег; «Предложить стать коллегами» — участнику, которого нельзя найти поиском', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    TWO(db);
    db.cards[OLEG].searchable = false;
    db.links = [{ from_id: ANNA, to_id: ME, state: 'accepted' }];
    db.access = [];
  });
  await openGroups(page);
  await openGroup(page, 'Колонна № 3');
  assert.match(await text(page, '#grp-members'), /Анна Тестовая[\s\S]*коллега/);
  // Олег — не коллега: окно с «Предложить стать коллегами»
  await page.locator('[data-act=grp-member]', { hasText: 'Олег' }).click();
  const sh = top(page);
  await sh.locator('#grp-offer').waitFor();
  assert.match(await text(page, '#grp-offer'), /Предложить стать коллегами/);
  await sh.locator('#grp-offer').click();
  await top(page).getByText('Предложить стать коллегами?').waitFor();
  await top(page).getByRole('button', { name: 'Предложить' }).click();
  await page.locator('.toast').getByText(/Предложение отправлено/).waitFor();
  assert.deepEqual(srv.calls('offer_colleague').at(-1).body, { p_to: OLEG });
  // снова открыть Олега — «ждём ответа», кнопки нет
  await page.waitForFunction(() => !document.querySelector('#layers .layer:not(.closing) .sheet'));
  await page.locator('[data-act=grp-member]', { hasText: 'Олег' }).click();
  assert.match(await text(page, '#grp-rel'), /ждём ответа/);
  assert.equal(await top(page).locator('#grp-offer').count(), 0);
  await top(page).locator('.sheet-head [data-close]').click();
  // Анна — уже коллега: кнопки нет
  await page.locator('[data-act=grp-member]', { hasText: 'Анна' }).click();
  assert.match(await text(page, '#grp-rel'), /Вы коллеги/);
  assert.equal(await top(page).locator('#grp-offer').count(), 0);
  await top(page).locator('.sheet-head [data-close]').click();
  // Олег сам предложил мне — «Принять»
  srv.db.links = srv.db.links.filter((l) => l.to_id !== OLEG).concat({ from_id: OLEG, to_id: ME, state: 'pending' });
  await page.evaluate(async () => { await (await import('./js/colleagues.js')).loadColleagues({ force: true }); });
  await page.locator('[data-act=grp-member]', { hasText: 'Олег' }).click();
  await top(page).locator('#grp-offer', { hasText: 'Принять' }).click();
  await page.locator('.toast').getByText('Теперь вы коллеги').waitFor();
  assert.deepEqual(srv.calls('answer_colleague').at(-1).body, { p_from: OLEG, p_accept: true });
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('картинка группы: текст «ТД-64» (размер, шрифт, форма, цвет), цифра, рисунок, убрать; только администратор', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, TWO);
  await openGroups(page);
  await openGroup(page, 'Колонна № 3');
  assert.equal(await page.locator('#grp-pic, [data-act=grp-pic]').count(), 0, 'участник картинку не меняет');
  await page.locator('.page-head [data-act=back]').click();
  await openGroup(page, 'ТД-64');
  await page.locator('#grp-pic').click();
  const sh = top(page);
  await sh.locator('#gpic-preview').waitFor();
  // текст уже выбран (такая картинка у группы); меняем
  await sh.locator('#gpic-text').fill('тд-64 <b>');
  assert.equal(await sh.locator('#gpic-preview text').innerHTML(), 'тд-64 b', 'лишние знаки отброшены, до 8');
  await sh.locator('#gpic-text').fill('ТД-64');
  await sh.locator('[data-act=gpic-sz][data-v="3"]').click();
  await sh.locator('[data-act=gpic-font][data-v=o]').click();
  await sh.locator('[data-act=gpic-sh][data-v=circle]').click();
  await sh.locator('[data-act=gpic-bg][data-v="2"]').click();
  assert.equal(await sh.locator('#gpic-preview text').getAttribute('font-family'), 'Onest, Onest, sans-serif');
  assert.equal(await sh.locator('#gpic-preview circle').count(), 1, 'форма — круг');
  await shot(page, 'pic-editor-text');
  await sh.locator('#gpic-save').click();
  await page.locator('.toast').getByText('Картинка группы сохранена').waitFor();
  assert.deepEqual(srv.calls('set_group_pic').at(-1).body, { p_group: G1, p_pic: { k: 'text', t: 'ТД-64', f: 'o', sz: 3, sh: 'circle', bg: 2 } });
  // пустой текст — не сохраняем
  await page.locator('#grp-pic').click();
  await top(page).locator('#gpic-text').fill('  ');
  await top(page).locator('#gpic-save').click();
  await top(page).getByText(/Впишите текст/).waitFor();
  // цифра
  await top(page).locator('[data-act=gpic-kind][data-v=num]').click();
  await top(page).locator('[data-act=gpic-n][data-v="7"]').click();
  assert.equal(await top(page).locator('#gpic-preview text').innerHTML(), '7');
  await shot(page, 'pic-editor-num');
  // рисунок: восемь своих
  await top(page).locator('[data-act=gpic-kind][data-v=art]').click();
  assert.equal(await top(page).locator('[data-act=gpic-a]').count(), 8);
  await top(page).locator('[data-act=gpic-a][data-v=steam]').click();
  await shot(page, 'pic-editor-art');
  await top(page).locator('#gpic-save').click();
  await page.locator('.toast').getByText('Картинка группы сохранена').waitFor();
  assert.deepEqual(srv.calls('set_group_pic').at(-1).body, { p_group: G1, p_pic: { k: 'art', a: 'steam', sh: 'circle', bg: 2 } });
  // убрать
  await page.locator('#grp-pic').click();
  await top(page).locator('#gpic-clear').click();
  await page.locator('.toast').getByText('Картинка убрана').waitFor();
  assert.equal(srv.calls('set_group_pic').at(-1).body.p_pic, null);
  // с сервера — только известное: чужой текст не рисуется
  srv.db.groups[0].pic = { k: 'text', t: '<img src=x onerror=alert(1)>' };
  await page.evaluate(async () => { await (await import('./js/colleagues.js')).loadColleagues({ force: true }); });
  await page.waitForFunction(() => !document.querySelector('#grp-page .gpic-svg text'));
  // сервер без шага 9
  srv.db.oldGroups = true;
  await page.locator('#grp-pic').click();
  await top(page).locator('#gpic-save').click();
  await page.locator('.toast').getByText(/Картинки групп на сервере ещё не включены/).waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

for (const theme of ['light', 'dark']) {
  test(`320 px, очень крупный текст, ${theme === 'light' ? 'светлая' : 'тёмная'} тема: всё влезает`, async () => {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 640 });
    await ready(context, page, NEW, TWO);
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t, textSize: 'xl' }); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await openGroups(page);
    assert.ok(await fits(page), 'экран «Группы» без прокрутки вбок');
    await shot(page, `groups-${theme}-320-xl`);
    await openGroup(page, 'Колонна № 3');
    assert.ok(await fits(page), 'группа без прокрутки вбок');
    await page.waitForSelector('#grp-nudge');
    await page.evaluate(() => document.querySelector('#grp-nudge').scrollIntoView({ block: 'center' }));
    await shot(page, `group-${theme}-320-xl`);
    await page.locator('.page-head [data-act=back]').click();
    await openGroup(page, 'ТД-64');
    await page.locator('#grp-pic').click();
    await top(page).locator('#gpic-preview').waitFor();
    await page.waitForTimeout(500); // окно доехало
    const fitSheet = await page.evaluate(() => { const b = document.querySelector('#layers .sheet-body'); return b.scrollWidth <= b.clientWidth + 1; });
    assert.ok(fitSheet, 'окно картинки без прокрутки вбок');
    await shot(page, `pic-${theme}-320-xl`);
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  });
}
