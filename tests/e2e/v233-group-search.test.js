// Браузерные проверки CABINA 2.33 (решения Никиты 12.11.2026): поиск групп по названию. В поиске — только название и картинка,
// в открытую группу вступают сразу, в закрытую — по заявке, администратор принимает или отклоняет; «Показывать в поиске» и
// «Открытая группа» — в карандаше группы; заявки — в группе и в колокольчике. Сервер подменён (mock-colleagues.js),
// люди и группы выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, closeTop, waitNoLayers } from './helpers.js';
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
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const G1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const OPEN = 'bbbbbbbb-0000-4000-8000-000000000011';
const SHUT = 'bbbbbbbb-0000-4000-8000-000000000012';
const HIDDEN = 'bbbbbbbb-0000-4000-8000-000000000013';
const at = '2026-10-01T08:00:00Z';
const member = (group_id, user_id, extra = {}) => ({ group_id, user_id, role: 'member', show_status: false, show_place: false, joined_at: at, ...extra });
// Я — администратор «ТД-64»; чужие группы Анны: открытая, закрытая и скрытая из поиска
const WORLD = (db) => {
  db.groups = [{ id: G1, name: 'ТД-64', pic: null },
    { id: OPEN, name: 'Колонна Сосновка', pic: { k: 'text', t: 'КС', f: 'u', sz: 2, sh: 'rnd', bg: 2 }, listed: true, open: true },
    { id: SHUT, name: 'Бригада Сосновка', pic: null, listed: true, open: false },
    { id: HIDDEN, name: 'Сосновка тайная', pic: null, listed: false, open: false }];
  db.members = [member(G1, ME, { role: 'admin' }), member(OPEN, ANNA, { role: 'admin' }), member(OPEN, OLEG),
    member(SHUT, ANNA, { role: 'admin' }), member(HIDDEN, ANNA, { role: 'admin' })];
};
async function openGroups(page) {
  await tab(page, 'profile');
  await page.locator('#grp-entry').click();
  await page.locator('#grp-list').waitFor();
}
async function find(page, q) {
  // 2.33.1: отдельной кнопки нет — поиск по всем группам внутри строки «Найти группу»
  await page.locator('#grp-q').fill(q);
  return page;
}

test('поиск: только видимые в поиске, только название и картинка; открытая — сразу, закрытая — заявка', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, WORLD);
  await openGroups(page);
  // короткий запрос на сервер не уходит
  let s = await find(page, 'со');
  assert.equal(await page.locator('#grp-q').getAttribute('placeholder'), 'Найти группу');
  assert.equal(await page.locator('#grp-find').count(), 0, 'отдельной кнопки «Найти группу» нет');
  await page.waitForTimeout(1000);
  assert.equal(srv.calls('find_groups').length, 0);
  await s.locator('#grp-q').fill('сосновка');
  await s.locator('#grp-find-list').waitFor();
  const res = await text(page, '#grp-find-list');
  assert.match(res, /Колонна Сосновка[\s\S]*Открытая — вступить сразу[\s\S]*Бригада Сосновка[\s\S]*по заявке/);
  assert.doesNotMatch(res, /тайная/, 'скрытая группа не находится');
  assert.doesNotMatch(res, /участник|Анна|Олег/, 'состава и числа участников нет');
  assert.equal(await s.locator('#grp-find-list .gpic-svg text').first().innerHTML(), 'КС');
  await shot(page, 'find-dark-390');
  // закрытая: заявка с объяснением, кто что увидит
  await s.locator('.grp-find-row', { hasText: 'Бригада' }).locator('[data-act=grp-find-join]').click();
  const d = top(page);
  assert.match(await d.innerText(), /Администратор группы увидит ваше имя, должность/);
  await d.getByRole('button', { name: 'Подать заявку' }).click();
  await page.locator('.grp-find-row', { hasText: 'Бригада' }).getByText('Заявка отправлена').waitFor();
  assert.deepEqual(srv.calls('request_group').at(-1).body, { p_group: SHUT });
  assert.equal(srv.db.members.some((m) => m.group_id === SHUT && m.user_id === ME), false);
  // открытая: сразу в группе
  await page.locator('.grp-find-row', { hasText: 'Колонна' }).locator('[data-act=grp-find-join]').click();
  assert.match(await top(page).innerText(), /открытая группа/i);
  await top(page).getByRole('button', { name: 'Вступить' }).click();
  await page.locator('#grp-members').waitFor();
  assert.match(await text(page, '#grp-members'), /Анна Тестовая[\s\S]*Олег Пробный/);
  assert.match(await text(page, '#grp-mode'), /Открытая группа/);
  // заявка видна на экране «Группы», её можно отозвать
  await page.locator('.page-head [data-act=back]').click();
  await page.locator('#grp-myreq').waitFor();
  assert.match(await text(page, '#grp-myreq'), /Бригада Сосновка[\s\S]*Ждёт решения администратора/);
  await page.locator('#grp-myreq [data-act=grp-unrequest]').click();
  await page.locator('#grp-myreq').waitFor({ state: 'detached' });
  assert.equal(srv.db.greqs.length, 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('администратор: «Показывать в поиске» и «Открытая» в карандаше, заявки в группе и в колокольчике', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => {
    WORLD(db);
    db.greqs = [{ group_id: G1, user_id: ANNA, state: 'pending', created_at: at }, { group_id: G1, user_id: OLEG, state: 'pending', created_at: at }];
  });
  await tab(page, 'profile');
  // кружки: на строке «Группы» и на колокольчике
  await page.locator('#grp-entry .col-badge').getByText('2').waitFor();
  assert.match(await page.locator('#pr-bell').getAttribute('aria-label'), /новых 2/);
  await page.locator('#pr-bell').click();
  await page.locator('#ntc-groups').getByText('Хотят вступить: 2').waitFor();
  await page.locator('#ntc-groups [data-act=grp-open]').click();
  await page.locator('#grp-reqs').waitFor();
  assert.match(await text(page, '#grp-reqs'), /Анна Тестовая[\s\S]*Олег Пробный/);
  await shot(page, 'requests-dark-390');
  await page.locator('#grp-reqs [data-act=grp-req-yes][data-id="' + ANNA + '"]').click();
  await page.locator('#grp-members').getByText('Анна Тестовая').waitFor();
  await page.locator('#grp-reqs [data-act=grp-req-no]').click();
  await page.locator('#grp-reqs').waitFor({ state: 'detached' });
  assert.equal(srv.db.greqs.find((r) => r.user_id === OLEG).state, 'declined');
  // старая группа не в поиске: включаем с предупреждением
  assert.equal(await page.locator('#grp-mode').count(), 0);
  await page.locator('#grp-edit').click();
  assert.equal(await top(page).locator('#grp-listed').getAttribute('aria-checked'), 'false');
  assert.equal(await top(page).locator('#grp-open-sw').isDisabled(), true);
  await top(page).locator('#grp-listed').click();
  assert.match(await top(page).innerText(), /увидят все пользователи CABINA[\s\S]*не увидит никто, кроме участников/);
  await top(page).getByRole('button', { name: 'Показывать' }).click();
  await page.locator('#grp-listed[aria-checked=true]').waitFor();
  assert.deepEqual(srv.calls('set_group_search').at(-1).body, { p_group: G1, p_listed: true, p_open: false });
  await page.locator('#grp-open-sw').click();
  assert.match(await top(page).innerText(), /сразу увидит имена участников/);
  await top(page).getByRole('button', { name: 'Сделать открытой' }).click();
  await page.locator('#grp-open-sw[aria-checked=true]').waitFor();
  // убрать из поиска — сразу, без вопроса, и группа уже не открытая
  await page.locator('#grp-listed').click();
  await page.locator('#grp-listed[aria-checked=false]').waitFor();
  assert.deepEqual(srv.calls('set_group_search').at(-1).body, { p_group: G1, p_listed: false, p_open: false });
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('новая группа — с переключателем «Показывать в поиске» (включён); старый сервер — без поиска', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, NEW, (db) => { db.cards[ME] = { user_id: ME, name: 'Иван Тестов', role: 'driver', depot: null, avatar: null, searchable: false }; });
  await tab(page, 'profile');
  await page.locator('#grp-entry').click();
  await page.locator('#grp-q').waitFor();
  await page.locator('#grp-gear').click();
  await top(page).locator('#gear-new').click();
  const s = top(page);
  await s.locator('#grp-name').fill('Колонна 9');
  assert.equal(await s.locator('#grp-name-listed').getAttribute('aria-checked'), 'true');
  await s.locator('[data-act=grp-name-ok]').click();
  await page.locator('#grp-members').waitFor();
  const g = srv.db.groups.find((x) => x.name === 'Колонна 9');
  assert.equal(g.listed, true);
  assert.equal(g.open, false);
  await page.locator('#grp-mode').getByText('по заявке').waitFor();
  await context.close();

  // старый сервер без шага 13: кнопки поиска нет, группы работают
  const b = await openApp(env);
  await ready(b.context, b.page, NEW, (db) => { WORLD(db); db.searchOff = true; });
  await openGroups(b.page);
  await b.page.locator('#grp-q').fill('сосновка');
  await b.page.waitForTimeout(1000);
  assert.equal(await b.page.locator('#grp-find-list').count(), 0, 'старый сервер: чужих групп не ищем');
  await b.page.locator('#grp-gear').click();
  assert.equal(await top(b.page).locator('#gear-find').count(), 0);
  assert.deepEqual(realErrors([...errors, ...b.errors]), []);
  await b.context.close();
});

test('320 px, очень крупный текст, обе темы: поиск и заявки помещаются', async () => {
  for (const theme of ['dark', 'light']) {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 700 });
    await ready(context, page, NEW, (db) => { WORLD(db); db.greqs = [{ group_id: SHUT, user_id: ME, state: 'pending', created_at: at }, { group_id: G1, user_id: OLEG, state: 'pending', created_at: at }]; });
    await page.evaluate((t) => { document.documentElement.dataset.text = 'xl'; document.documentElement.dataset.theme = t; }, theme);
    await openGroups(page);
    assert.ok(await fits(page), `экран «Группы» помещается (${theme})`);
    await shot(page, `groups-320-${theme}`);
    const s = await find(page, 'сосновка');
    await s.locator('#grp-find-list').waitFor();
    assert.ok(await fits(page), `поиск помещается (${theme})`);
    const row = await s.locator('.grp-find-row').first().boundingBox();
    assert.ok(row.x >= 0 && row.x + row.width <= 320, 'строка результата в экране');
    await shot(page, `find-320-${theme}`);
    await page.locator('[data-act=grp-q-clear]').click();
    await page.locator('[data-act=grp-open]', { hasText: 'ТД-64' }).click();
    await page.locator('#grp-reqs').waitFor();
    assert.ok(await fits(page), `заявки помещаются (${theme})`);
    await shot(page, `requests-320-${theme}`);
    assert.deepEqual(realErrors(errors), []);
    await context.close();
  }
});
