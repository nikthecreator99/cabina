// Браузерные проверки CABINA 2.22: группы коллег (создать, код и QR, вступить по ссылке, приглашение, статус только
// по выбору человека, права администратора, выйти и удалить) и новый вид профиля (по примеру Никиты).
// Сервер подменён (mock-colleagues.js), люди, станции и группы выдуманные.
import { GROUPS_LIVE } from '../../js/legal.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { ME, ANNA, OLEG, ready, CUR, signIn, mockServer } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const box = async (loc) => { for (let i = 0; i < 20; i++) { const b = await loc.boundingBox().catch(() => null); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; };
const profileOf = (page) => page.evaluate(async () => (await import('./js/store.js')).S.profile);
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const G1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const at = '2026-10-01T08:00:00Z';
const member = (group_id, user_id, extra = {}) => ({ group_id, user_id, role: 'member', show_status: false, show_place: false, joined_at: at, ...extra });
// Анна — в пути и показывает статус (и станции) группе; Олег — в группе, но статус группе не показывает
const STATUSES = {
  [ANNA]: { kind: 'trip', place: 'Сосновка', dest: 'Ольховка', part: 'morning', note: null, until_at: null, after_kind: null, updated_at: '2026-10-20T08:50:00Z' },
  [OLEG]: { kind: 'rest', place: 'Ольховка', dest: null, part: null, note: null, until_at: '2026-10-20T13:00:00Z', after_kind: 'wait', updated_at: '2026-10-20T08:00:00Z' },
};
const readQr = (page) => page.evaluate(async () => {
  const svg = document.querySelector('#grp-qr svg');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"'))}`;
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 600;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 600, 600);
  const jsQR = (await import('./js/vendor/jsqr.js')).default;
  return jsQR(cx.getImageData(0, 0, 600, 600).data, 600, 600)?.data || null;
});

// Группы ждут сервера (GROUPS_LIVE в legal.js): пока выключены, их сценарии не запускаем
const gtest = (name, fn) => test(name, { skip: !GROUPS_LIVE && 'группы выключены до шага на сервере' }, fn);

test('профиль по примеру Никиты: персонаж слева, сведения справа, «В пути с …», Коллеги → Награды; 320 px, обе темы', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, { ...NEW, links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }] });
  await seed(page, { routes: [{ id: 'r1', from: 'Малошуйка', to: 'Сумский Посад', distanceKm: 120 }],
    trips: [{ id: 'live', routeId: 'r1', start: '2026-10-20T07:30', end: '', locoType: '2ТЭ116', locoNumber: '1' }] });
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ role: 'assistant', depot: 'ТД-64', career: { hired: '2021-09-01', jobs: [], past: [] } }); });
  await tab(page, 'profile');
  await page.locator('#col-entry').getByText('1 коллега').waitFor();
  const ava = await box(page.locator('.pr-card .avatar'));
  const name = await box(page.locator('.pr-card .profile-name > span'));
  assert.ok(ava.x + ava.width < name.x, 'персонаж слева от имени');
  assert.match(await text(page, '.pr-info'), /Иван Тестовый[\s\S]*Помощник машиниста[\s\S]*депо ТД-64 · Стаж\s5\sлет\s1\sмес\.[\s\S]*\+7 900 111-22-33/);
  const st = (await text(page, '#pr-status')).replace(/\s+/g, ' ');
  assert.match(st, /^В пути с 07:30 Малошуйка → Сумский Посад$/);
  const stBox = await box(page.locator('#pr-status'));
  const card = await box(page.locator('.pr-card'));
  assert.ok(stBox.width > card.width - 40, 'статус — во всю ширину карточки');
  assert.equal((await text(page, '#col-find')).trim(), 'Найти'); // 2.21.2
  const order = GROUPS_LIVE
    ? /Профиль[\s\S]*Коллеги[\s\S]*Найти[\s\S]*Мои коллеги[\s\S]*Группы[\s\S]*Пригласить коллег[\s\S]*Награды[\s\S]*Все \d+ из 41/
    : /Профиль[\s\S]*Коллеги[\s\S]*Найти[\s\S]*Мои коллеги[\s\S]*Пригласить коллег[\s\S]*Награды[\s\S]*Все \d+ из 41/;
  assert.match(await text(page, '.screen'), order);
  assert.equal(await page.locator('#pr-awards .aw-mini.locked').count(), 0, 'в полоске — только полученные награды');
  assert.equal(await page.locator('.screen .notice').count(), 0, 'длинной зелёной плашки внизу больше нет');
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('#col-entry').getByText('1 коллега').waitFor();
    assert.ok(await fits(page), `профиль на 320 px, ${theme}`);
    const pen = await box(page.locator('#pr-edit'));
    assert.ok(pen.x + pen.width <= 320 - 16, `✎ не вылезает, ${theme}`);
    const a2 = await box(page.locator('.pr-card .avatar'));
    const n2 = await box(page.locator('.pr-card .profile-name > span'));
    assert.ok(a2.x + a2.width < n2.x, `и на 320 px персонаж слева, ${theme}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-awards-all').click();
  await page.waitForSelector('.screen[data-page=awards]');
  await page.locator('.screen [data-act=back]').click();
  assert.equal(await page.locator('#pr-privacy').count(), 0, '2.21.2: «Приватность профиля» — только в Настройках');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('профиль без аккаунта: без групп и без строки «Приватность профиля»', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ name: 'Пётр Пробный' }); });
  await tab(page, 'profile');
  await page.locator('.pr-card').waitFor();
  assert.equal(await page.locator('#pr-privacy').count(), 0);
  assert.equal(await page.locator('#grp-entry').count(), 0, 'групп без аккаунта нет');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

gtest('создать группу: согласие новой редакции, название до 30 знаков, код и QR-код со ссылкой, сменить код', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { consents: [{ document: 'privacy-3', withdrawn_at: null }] });
  await tab(page, 'profile');
  await page.locator('#col-entry').waitFor();
  assert.equal(await page.locator('#grp-entry').count(), 0, 'без новой редакции строки «Группы» нет — сначала согласие');
  await page.locator('#col-entry').click();
  await page.locator('[data-act=col-consent]').click();
  await top(page).locator('#col-agree').check();
  await top(page).locator('[data-act=col-agree-ok]').click();
  await waitNoLayers(page);
  assert.deepEqual(srv.calls('give_consent').at(-1).body, { p_document: CUR });
  assert.equal(CUR, 'privacy-6');
  await page.locator('.screen [data-act=back]').click();
  await page.locator('#grp-entry').click();
  await page.waitForSelector('.screen[data-page=groups] #grp-new');
  assert.match(await text(page, '#grp-sec'), /Вы пока не в группе/); // 2.27: макет Никиты
  await page.locator('#grp-new').click();
  await top(page).locator('[data-act=grp-name-ok]').click();
  assert.match(await text(page, '#grp-name-err'), /Введите название/);
  assert.equal(await top(page).locator('#grp-name').getAttribute('maxlength'), '30');
  await top(page).locator('#grp-name').fill('Колонна <b>3</b>');
  await top(page).locator('[data-act=grp-name-ok]').click();
  await page.waitForSelector('.screen[data-page=group] #grp-page');
  assert.deepEqual(srv.calls('create_group')[0].body, { p_name: 'Колонна <b>3</b>' });
  assert.equal(await page.locator('.screen h1').innerText(), 'Колонна <b>3</b>', 'название — текстом, не разметкой');
  assert.match(await text(page, '.grp-sub'), /1 участник · вы администратор/);
  // 2.28: настройки — за кнопкой «Приватность»
  await page.locator('#grp-priv-btn').click();
  await page.locator('#grp-share').waitFor();
  assert.match(await text(page, '#grp-share'), /Показывать мой статус группе/);
  assert.equal(await page.locator('#grp-share [data-item=status]').getAttribute('aria-checked'), 'false', 'по умолчанию группа статус не видит');
  await top(page).locator('.sheet-head [data-close]').click();
  // код и QR
  await page.locator('#grp-code').click();
  await top(page).locator('#grp-qr svg').waitFor();
  const code = (await text(page, '#grp-code-text')).replace(/\s/g, '');
  assert.match(code, /^[0-9A-Z]{10}$/);
  assert.equal(await readQr(page), `${env.url.replace(/\/$/, '')}/#group=${code}`);
  await top(page).locator('#grp-code-new').click();
  await top(page).getByRole('button', { name: 'Сменить' }).click();
  await top(page).locator('#grp-qr svg').waitFor();
  const code2 = (await top(page).locator('#grp-code-text').innerText()).replace(/\s/g, '');
  assert.notEqual(code2, code);
  assert.deepEqual(srv.calls('group_code').map((c) => c.body.p_new), [false, true]);
  // 320 px, обе темы
  await top(page).locator('.sheet-head [data-close]').click();
  await waitNoLayers(page);
  for (const theme of ['dark', 'light']) {
    await seed(page, { settings: { theme } });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForSelector('#grp-page');
    assert.ok(await fits(page), `группа на 320 px, ${theme}`);
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

gtest('в группе: статус участника виден, только если он сам показывает его группе; мой статус — по переключателю', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    db.groups = [{ id: G1, name: 'Бригада 7' }];
    db.members = [member(G1, ME), member(G1, ANNA, { role: 'admin', show_status: true, show_place: true }), member(G1, OLEG)];
    db.statuses = { ...STATUSES };
  });
  await tab(page, 'profile');
  await page.locator('#grp-entry').getByText('1 группа').waitFor();
  await page.locator('#grp-entry').click();
  await page.locator('[data-act=grp-open]').click();
  await page.waitForSelector('#grp-members');
  // 2.27: статус в группе — взаимно. Пока я свой не показываю, статус Анны скрыт
  assert.match(await text(page, '#grp-members'), /Анна Тестовая[\s\S]*администратор[\s\S]*Статус скрыт/);
  // включаю показ своего статуса группе (окно «Приватность» остаётся открытым до конца проверки)
  await page.locator('#grp-priv-btn').click();
  await page.locator('#grp-share').waitFor();
  await page.locator('#grp-share [data-item=status]').click();
  await page.waitForFunction(() => document.querySelector('#grp-share [data-item=status]')?.getAttribute('aria-checked') === 'true');
  await page.waitForFunction(() => /В пути/.test(document.querySelector('#grp-members')?.innerText || ''));
  const list = await text(page, '#grp-members');
  assert.match(list, /в пути[\s\S]*Анна Тестовая[\s\S]*администратор[\s\S]*В пути/i);
  assert.doesNotMatch(list, /Сосновка/, 'станции — только тем, кто показывает свои');
  assert.match(list, /Олег Пробный[\s\S]*Статус группе не показывает|Олег Пробный\s*(Машинист|Статус)/);
  assert.doesNotMatch(list, /На отдыхе/, 'Олег статус группе не показывает — его не видно, хотя сервер его хранит');
  assert.deepEqual(srv.calls('set_group_share').at(-1).body, { p_group: G1, p_status: true, p_place: false });
  assert.equal((await profileOf(page)).privacy.status, true, 'общий выключатель статуса включился');
  await page.waitForTimeout(400);
  for (let i = 0; i < 30 && !srv.calls('set_status').length; i++) await page.waitForTimeout(200);
  const sent = srv.calls('set_status').at(-1)?.body;
  assert.ok(sent, 'статус ушёл на сервер (группе)');
  assert.equal(sent.p_place, null, '«где я» не включено — станции не уходят');
  await page.locator('#grp-share [data-item=place]').click();
  await page.waitForFunction(() => document.querySelector('#grp-share [data-item=place]')?.getAttribute('aria-checked') === 'true');
  assert.deepEqual(srv.calls('set_group_share').at(-1).body, { p_group: G1, p_status: true, p_place: true });
  // выключаю статус — выключается и «где я», сервер стирает статус
  await page.locator('#grp-share [data-item=status]').click();
  await page.waitForFunction(() => document.querySelector('#grp-share [data-item=status]')?.getAttribute('aria-checked') === 'false');
  assert.deepEqual(srv.calls('set_group_share').at(-1).body, { p_group: G1, p_status: false, p_place: false });
  assert.equal(srv.db.statuses[ME], undefined);
  await top(page).locator('.sheet-head [data-close]').click();
  // участник — не администратор: кнопок администратора нет
  assert.equal(await page.locator('#grp-invite, #grp-code, #grp-delete, #grp-edit').count(), 0);
  // «Что сервер знает о вас» — тоже с группами (как отвечает export_my_data)
  const html = await page.evaluate(async () => (await import('./js/colleagues.js')).myDataHtml({ email: 'ivan@example.com', groups: [{ name: 'Бригада <7>', role: 'member', members: 3, show_status: true, show_place: false }] }));
  assert.match(html, /Бригада &lt;7&gt;[\s\S]*участник · 3 участника · видят статус/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

gtest('вступить по ссылке группы: код убирается из адреса, видно название и что увидят участники', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    db.groups = [{ id: G1, name: 'Депо Сосновка' }];
    db.members = [member(G1, ANNA, { role: 'admin' }), member(G1, OLEG)];
    db.codes = { [G1]: 'ABCDE12345' };
  });
  await page.evaluate(() => { location.hash = 'group=abcde-12345'; });
  await top(page).getByText('Вступить в «Депо Сосновка»?').waitFor();
  assert.equal(await page.evaluate(() => location.hash), '', 'код сразу убран из адреса');
  assert.match(await text(page, '.dialog'), /В группе 2 участника\. Участники увидят ваше имя, должность\. Свой статус группе вы показываете, только если сами включите/);
  await top(page).getByRole('button', { name: 'Вступить' }).click();
  await page.waitForSelector('.screen[data-page=group] #grp-members');
  assert.deepEqual(srv.calls('join_group')[0].body, { p_code: 'ABCDE12345' });
  assert.match(await text(page, '.grp-sub'), /3 участника/);
  // неверный код
  await page.evaluate(() => { location.hash = 'group=ZZZZZ00000'; });
  await page.locator('.toast').getByText(/не найдена/).waitFor();
  // исключённый
  srv.db.members = srv.db.members.filter((m) => m.user_id !== ME);
  srv.db.bans.push({ group_id: G1, user_id: ME });
  await page.evaluate(() => { location.hash = 'group=ABCDE12345'; });
  await top(page).getByRole('button', { name: 'Вступить' }).click();
  await page.locator('.toast').getByText(/исключил вас/).waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

gtest('приглашение в группу: принять или отказаться; администратор приглашает только своих коллег', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { ...NEW, links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }, { from_id: ME, to_id: OLEG, state: 'accepted' }] }, (db) => {
    db.groups = [{ id: G1, name: 'Бригада 7' }];
    db.members = [member(G1, ANNA, { role: 'admin' })];
    db.ginvites = [{ group_id: G1, user_id: ME, invited_by: ANNA }];
  });
  await tab(page, 'profile');
  await page.locator('#grp-entry .col-badge').waitFor();
  await page.locator('#grp-entry').click();
  assert.match(await text(page, '#grp-invites'), /Бригада 7[\s\S]*Приглашает Анна Тестовая/);
  await page.locator('[data-act=grp-accept]').click();
  await page.waitForSelector('.screen[data-page=group] #grp-members');
  assert.deepEqual(srv.calls('answer_group_invite')[0].body, { p_group: G1, p_accept: true });
  // я создаю свою и приглашаю Олега
  await page.locator('.screen [data-act=back]').click();
  await page.locator('#grp-gear').click();           // 2.29: «Создать» — в шестерёнке, пока есть группы
  await top(page).locator('#gear-new').click();
  await top(page).locator('#grp-name').fill('Моя');
  await top(page).locator('[data-act=grp-name-ok]').click();
  await page.waitForSelector('#grp-invite');
  await page.locator('#grp-invite').click();
  const pick = top(page).locator('#grp-pick');
  assert.match(await pick.innerText(), /Анна Тестовая[\s\S]*Олег Пробный/);
  await top(page).locator('[data-act=grp-invite-ok]').click();
  assert.match(await text(page, '#grp-pick-err'), /Отметьте/);
  await pick.locator('.pick-row', { hasText: 'Олег' }).click();
  await top(page).locator('[data-act=grp-invite-ok]').click();
  await waitNoLayers(page);
  assert.equal(srv.calls('invite_to_group').at(-1).body.p_user, OLEG);
  await page.locator('#grp-pending').getByText('Олег Пробный').waitFor();
  await page.locator('#grp-pending [data-act=grp-uninvite]').click();
  await page.waitForFunction(() => !document.querySelector('#grp-pending'));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

gtest('администратор: переименовать, исключить, передать права, выйти; удалить группу', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    db.groups = [{ id: G1, name: 'Бригада 7' }];
    db.members = [member(G1, ME, { role: 'admin', joined_at: '2026-09-01T00:00:00Z' }), member(G1, ANNA, { joined_at: '2026-09-02T00:00:00Z' }), member(G1, OLEG, { joined_at: '2026-09-03T00:00:00Z' })];
  });
  await tab(page, 'profile');
  await page.locator('#grp-entry').click();
  await page.locator('[data-act=grp-open]').click();
  await page.locator('#grp-edit').click();      // 2.29: карандаш вверху — название и картинка в одном окне
  await top(page).locator('#edit-name').click();
  await top(page).locator('#grp-name').fill('Колонна 3');
  await top(page).locator('[data-act=grp-name-ok]').click();
  await page.locator('.screen h1', { hasText: 'Колонна 3' }).waitFor();
  // исключить Олега
  await page.locator('[data-act=grp-member]', { hasText: 'Олег' }).click();
  await top(page).locator('[data-act=grp-remove]').click();
  assert.match(await text(page, '.dialog'), /30 дней/);
  await top(page).getByRole('button', { name: 'Исключить' }).click();
  await page.waitForFunction(() => !/Олег/.test(document.querySelector('#grp-members')?.innerText || 'Олег'));
  // передать права Анне
  await page.locator('[data-act=grp-member]', { hasText: 'Анна' }).click();
  await top(page).locator('[data-act=grp-make-admin]').click();
  await top(page).getByRole('button', { name: 'Передать' }).click();
  await page.waitForFunction(() => !document.querySelector('#grp-invite'));
  assert.deepEqual(srv.calls('make_group_admin')[0].body, { p_group: G1, p_user: ANNA });
  // выйти
  await page.locator('#grp-leave').click();
  await top(page).getByRole('button', { name: 'Выйти' }).click();
  await page.waitForSelector('.screen[data-page=groups]');
  assert.match(await text(page, '#grp-sec'), /Вы пока не в группе/);
  // своя группа — удалить
  await page.locator('#grp-new').click();
  await top(page).locator('#grp-name').fill('Временная');
  await top(page).locator('[data-act=grp-name-ok]').click();
  await page.waitForSelector('#grp-delete');
  await page.locator('#grp-delete').click();
  await top(page).getByRole('button', { name: 'Удалить группу' }).click();
  await page.waitForSelector('.screen[data-page=groups]');
  assert.equal(srv.db.groups.some((g) => g.name === 'Временная'), false);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('старый сервер без групп: «Коллеги» работают как раньше, строки «Группы» нет', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, { ...NEW, links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }], groupsOff: true });
  await tab(page, 'profile');
  await page.locator('#col-entry').getByText('1 коллега').waitFor();
  assert.equal(await page.locator('#grp-entry').count(), 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('пока группы выключены: строки «Группы» нет, приложение их даже не запрашивает, ссылка группы только убирается из адреса', { skip: GROUPS_LIVE && 'группы включены' }, async () => {
  const { context, page, errors } = await openApp(env);
  const asked = [];
  page.on('request', (r) => { if (/\/(groups|group_members|group_invites)\?/.test(r.url())) asked.push(r.url()); });
  await ready(context, page, { ...NEW, links: [{ from_id: ME, to_id: ANNA, state: 'accepted' }] }, (db) => {
    db.groups = [{ id: G1, name: 'Депо Сосновка' }];
    db.members = [member(G1, ME, { role: 'admin' }), member(G1, ANNA)];
  });
  await tab(page, 'profile');
  await page.locator('#col-entry').getByText('1 коллега').waitFor();
  assert.equal(await page.locator('#grp-entry').count(), 0);
  await page.evaluate(() => { location.hash = 'group=abcde-12345'; });
  await page.waitForFunction(() => !location.hash);
  assert.equal(await page.locator('.screen[data-page=groups]').count(), 0);
  assert.deepEqual(asked, []);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
