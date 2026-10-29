// Браузерные проверки CABINA 2.12: персонаж вместо фото профиля — конструктор, «Случайный», «Назад»,
// примерка Премиума, старое фото, защита от испорченных данных. Данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, NOW, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const dialog = (page) => page.locator('#layers .layer:not(.closing) .dialog').last();
const stage = (page) => page.locator('#av-stage .av-big').innerHTML();
const saved = (page) => page.evaluate(async () => (await import('./js/store.js')).S.profile);
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast-wrap')?.innerText || ''), re.source);
// фоновая дорисовка разделов закончилась
const settled = (page) => page.waitForFunction(() => new Promise((r) => setTimeout(() => r(true), 400)));

async function openEditor(page) {
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.profile-card [data-act=av-open]').click();
  await page.waitForSelector('#av-stage');
}

test('персонаж: собрать, отменить, случайный, сохранить — виден в профиле и на вкладке', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('.tab[data-tab=profile]').click();
  assert.equal(await page.locator('.avatar svg.ava-svg').count(), 0, 'пока персонажа нет — значок');
  await page.locator('[data-page=profile-edit]').click();
  assert.match(await page.locator('.profile-card .hint').innerText(), /Создайте своего персонажа/);
  assert.equal(await page.locator('#pr-photo').count(), 0, 'фото больше не загружается');
  await page.locator('#pr-avatar').click();
  await page.waitForSelector('#av-stage');
  assert.equal(await page.locator('.tabbar').isVisible(), false, 'в конструкторе нижнее меню спрятано');
  assert.equal(await page.locator('[data-act=av-undo]').isDisabled(), true);

  const first = await stage(page);
  await page.locator('[data-k=eyes][data-v=big]').click();
  assert.equal(await page.locator('[data-k=eyes][data-v=big]').getAttribute('aria-pressed'), 'true');
  assert.notEqual(await stage(page), first);
  await page.locator('[data-act=av-undo]').click();
  assert.equal(await page.locator('[data-k=eyes][data-v=almond]').getAttribute('aria-pressed'), 'true', '«Назад» вернул глаза');
  assert.equal(await page.locator('[data-act=av-undo]').isDisabled(), true);

  // ползунок возраста: меняется надпись и персонаж
  await page.locator('#av-r-age').fill('52');
  assert.equal(await page.locator('#av-o-age').innerText(), '52 года');
  await page.locator('[data-k=skin][data-v="9"]').click();
  await page.locator('[data-act=av-group][data-g=hair]').click();
  assert.equal(await page.locator('[data-k=hair]').count(), 13, 'у мужчины 13 причёсок');
  await page.locator('[data-k=hair][data-v=curly]').click();
  await page.locator('[data-k=beard][data-v=full]').click();
  await page.locator('[data-act=av-group][data-g=wear]').click();
  await page.locator('[data-k=outfit][data-v=work]').click();
  await page.locator('[data-k=outfitC][data-v="3"]').click();
  await page.locator('[data-act=av-group][data-g=acc]').click();
  await page.locator('[data-k=hat][data-v=helmet]').click();
  await page.locator('[data-k=hatC][data-v="2"]').click();
  await page.locator('[data-act=av-mark][data-v=freckles]').click();
  await page.locator('[data-act=av-group][data-g=bg]').click();
  await page.locator('[data-k=bg][data-v=pine]').click();
  await settled(page);

  // «Случайный» меняет персонажа, «Назад» возвращает собранного
  const mine = await stage(page);
  await page.locator('[data-act=av-rand]').click();
  assert.notEqual(await stage(page), mine);
  await page.locator('[data-act=av-undo]').click();
  assert.equal((await stage(page)).replace(/v\d+_/g, ''), mine.replace(/v\d+_/g, ''));

  await page.locator('[data-act=av-save]').click();
  await toastHas(page, /Персонаж сохранён/);
  const p = await saved(page);
  assert.deepEqual(
    [p.avatar.age, p.avatar.skin, p.avatar.hair, p.avatar.beard, p.avatar.outfit, p.avatar.outfitC, p.avatar.hat, p.avatar.hatC, p.avatar.marks, p.avatar.bg],
    [52, 9, 'curly', 'full', 'work', 3, 'helmet', 2, ['freckles'], 'pine'],
  );
  assert.equal(await page.locator('.tabbar').isVisible(), true);
  assert.match(await page.locator('.profile-card .hint').innerText(), /изменить персонажа/);

  await page.reload();
  await page.waitForSelector('.screen');
  await page.locator('.tab[data-tab=profile]').click();
  assert.equal(await page.locator('.profile-card .avatar.view svg.ava-svg').count(), 1, 'персонаж в профиле после перезапуска');
  assert.equal(await page.locator('.tab[data-tab=profile] svg.tab-face').count(), 1, 'лицо на вкладке «Профиль»');
  assert.deepEqual(errors, []);
  await context.close();
});

test('персонаж: выйти без сохранения — спрашивает, ничего не сохраняет', async () => {
  const { context, page, errors } = await openApp(env);
  await openEditor(page);
  // без изменений закрывается сразу
  await page.locator('[data-act=av-close]').click();
  await page.waitForSelector('.profile-card');
  await page.locator('.profile-card [data-act=av-open]').click();
  await page.locator('[data-k=mouth][data-v=laugh]').click();
  await page.locator('[data-act=av-close]').click();
  assert.match(await dialog(page).innerText(), /Выйти без сохранения\?/);
  await dialog(page).locator('[data-act=no]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('#av-stage').count(), 1, '«Остаться» — конструктор открыт');
  await page.locator('[data-act=av-close]').click();
  await dialog(page).locator('[data-act=yes]').click();
  await waitNoLayers(page);
  await page.waitForSelector('.profile-card');
  assert.equal((await saved(page)).avatar, undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test('персонаж: Премиум можно примерить, но без разрешения он не сохраняется', async () => {
  const { context, page, errors } = await openApp(env);
  await openEditor(page);
  await page.locator('[data-act=av-group][data-g=acc]').click();
  assert.match(await page.locator('[data-k=hat][data-v=peaked]').innerText(), /Премиум/);
  await page.locator('[data-k=hat][data-v=peaked]').click();
  await page.locator('[data-act=av-toggle][data-k=mazut]').click();
  assert.match(await page.locator('.av-try').innerText(), /Примерка: фуражка, мазут/);
  await page.locator('[data-act=av-save]').click();
  assert.match(await dialog(page).innerText(), /Это Премиум[\s\S]*фуражка, мазут[\s\S]*Снять их и сохранить остальное\?/);
  await dialog(page).locator('[data-act=no]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('#av-stage').count(), 1, '«Ещё примерю» — остаёмся в конструкторе');
  await page.locator('[data-act=av-save]').click();
  await dialog(page).locator('[data-act=yes]').click();
  await toastHas(page, /Персонаж сохранён/);
  const p = await saved(page);
  assert.equal(p.avatar.hat, null);
  assert.equal(p.avatar.mazut, false);
  // подложенная вручную фуражка не показывается без разрешения
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveProfile({ avatar: { ...s.S.profile.avatar, hat: 'peaked' } }); });
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.profile-card [data-act=av-open]').click();
  await page.locator('[data-act=av-group][data-g=acc]').click();
  assert.equal(await page.locator('.av-try').count(), 0);
  assert.equal(await page.locator('[data-k=hat][data-v=""]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  await context.close();
});

test('персонаж: разработчику (роль admin на сервере) Премиум сохраняется', async () => {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const EXP = Math.floor(Date.parse(NOW) / 1000) + 30 * 86400;
  const SUB = '0d2b6c1e-7a44-4f1b-9c3e-5a6b7c8d9e0f';
  const access = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: SUB, email: 'dev@example.com', role: 'authenticated', exp: EXP })}.c2ln`;
  for (const role of ['admin', 'user']) {
    const { context, page, errors } = await openApp(env);
    await context.route('https://api.cabina-app.ru/**', (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/rest/v1/profiles') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role }]) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    await page.evaluate((s) => localStorage.setItem('cabina-account', JSON.stringify(s)), { access, refresh: 'r', exp: EXP * 1000, email: 'dev@example.com', sub: SUB });
    await openEditor(page);
    await page.waitForFunction((r) => (localStorage.getItem('cabina-premium-dev') === null) === (r !== 'admin'), role);
    await page.locator('[data-act=av-group][data-g=bg]').click();
    await page.locator('[data-k=bg][data-v=depot]').click();
    assert.equal(await page.locator('.av-try').count(), role === 'admin' ? 0 : 1);
    await page.locator('[data-act=av-save]').click();
    if (role !== 'admin') await dialog(page).locator('[data-act=yes]').click();
    await toastHas(page, /Персонаж сохранён/);
    assert.equal((await saved(page)).avatar.bg, role === 'admin' ? 'depot' : 'mist');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('персонаж: старое фото удаляется только с согласия', async () => {
  const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  for (const keep of [true, false]) {
    const { context, page, errors } = await openApp(env);
    await page.evaluate(async (photo) => { const s = await import('./js/store.js'); await s.saveProfile({ photo }); }, PHOTO);
    await page.locator('.tab[data-tab=profile]').click();
    assert.equal(await page.locator('.profile-card .avatar img').count(), 1, 'до персонажа видно старое фото');
    await page.locator('.profile-card [data-act=av-open]').click();
    await page.locator('[data-act=av-save]').click();
    assert.match(await dialog(page).innerText(), /Удалить старое фото\?/);
    await dialog(page).locator(keep ? '[data-act=no]' : '[data-act=yes]').click();
    await waitNoLayers(page);
    const p = await saved(page);
    assert.equal(p.photo, keep ? PHOTO : '');
    assert.equal(await page.locator('.profile-card .avatar img').count(), 0, 'показывается персонаж, а не фото');
    assert.equal(await page.locator('.profile-card .avatar svg.ava-svg').count(), 1);
    await page.locator('[data-page=profile-edit]').click();
    assert.equal(await page.locator('[data-act=photo-del]').count(), keep ? 1 : 0);
    if (keep) assert.equal(await page.locator('[data-act=photo-del]').innerText(), 'Удалить старое фото');
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('персонаж: испорченные данные из копии не попадают на страницу', async () => {
  const { context, page, errors } = await openApp(env);
  const evil = '"><img src=x id=pwn><script>window.__pwn=1</script>';
  await page.evaluate(async (evil) => {
    const s = await import('./js/store.js');
    await s.saveProfile({ avatar: { sex: evil, hair: evil, skin: evil, bg: evil, marks: [evil], hat: evil, outfitC: evil, age: evil }, privacy: { photo: true } });
  }, evil);
  await page.locator('.tab[data-tab=profile]').click();
  await page.locator('.profile-card [data-act=av-open]').click();
  await page.waitForSelector('#av-stage');
  for (const g of ['face', 'hair', 'wear', 'acc', 'bg']) await page.locator(`[data-act=av-group][data-g=${g}]`).click();
  await settled(page);
  assert.equal(await page.locator('#pwn').count(), 0);
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  // прежнее «показывать фото» стало «показывать персонажа»
  await page.locator('[data-act=av-close]').click();
  await page.locator('[data-page=profile-edit]').click();
  assert.equal(await page.locator('[data-act=pr-priv][data-k=avatar]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('[data-act=pr-priv][data-k=photo]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('персонаж: экран 320 px без прокрутки вбок, светлая тема', async () => {
  const { context, page, errors } = await openApp(env);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(async () => { const s = await import('./js/store.js'); await s.saveSettings({ theme: 'light' }); });
  await openEditor(page);
  for (const g of ['face', 'hair', 'wear', 'acc', 'bg']) {
    await page.locator(`[data-act=av-group][data-g=${g}]`).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320), `вкладка ${g} шире экрана`);
  }
  assert.ok(await page.locator('[data-act=av-save]').isVisible());
  const box = await page.locator('[data-act=av-save]').boundingBox();
  assert.ok(box.x + box.width <= 320, '«Готово» помещается');
  assert.deepEqual(errors, []);
  await context.close();
});

test('робот (2.13): «Премиум» → робот, свои настройки, «Случайный» оставляет робота, без разрешения сохраняется человек', async () => {
  const { context, page, errors } = await openApp(env);
  await openEditor(page);
  assert.equal(await page.locator('[data-k=sex][data-v=robot]').count(), 0, 'роботы спрятаны за кнопкой «Премиум»');
  await page.locator('[data-act=av-chars]').click();
  assert.match(await page.locator('[data-k=sex][data-v=robot]').innerText(), /Премиум[\s\S]*Робот/);
  await page.locator('[data-act=av-chars]').click();
  assert.equal(await page.locator('[data-k=sex][data-v=robot]').count(), 0, 'повторное нажатие сворачивает');
  await page.locator('[data-act=av-group][data-g=wear]').click();
  await page.locator('[data-k=outfit][data-v=jacket]').click();
  await page.locator('[data-act=av-group][data-g=face]').click();
  await page.locator('[data-act=av-chars]').click();
  await page.locator('[data-k=sex][data-v=robot]').click();
  assert.match(await page.locator('.av-try').innerText(), /Примерка: робот/);
  const face = await page.locator('#av-panel').innerText();
  assert.match(face, /Цвет корпуса[\s\S]*Глаза[\s\S]*Цвет свечения[\s\S]*Рот[\s\S]*Уши/i);
  assert.doesNotMatch(face, /Цвет кожи|Брови|Возраст/i);
  await page.locator('[data-act=av-chars]').click();
  assert.equal(await page.locator('[data-k=sex][data-v=robot]').count(), 1, 'пока выбран робот, список не сворачивается');
  await page.locator('[data-k=metal][data-v="6"]').click();
  await page.locator('[data-k=rEyes][data-v=visor]').click();
  assert.equal(await page.locator('[data-k=rEyes][data-v=visor]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-act=av-group][data-g=hair]').click();
  assert.match(await page.locator('[data-act=av-group][data-g=hair]').innerText(), /Макушка/);
  await page.locator('[data-k=rTop][data-v=""]').click();
  assert.equal(await page.locator('[data-k=rTop][data-v=""]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-act=av-group][data-g=acc]').click();
  assert.doesNotMatch(await page.locator('#av-panel').innerText(), /Серьги|Пирсинг|Приметы/i);
  await page.locator('[data-act=av-rand]').click();
  assert.match(await page.locator('.av-try').innerText(), /робот/);
  await page.locator('[data-act=av-undo]').click();
  await page.locator('[data-act=av-save]').click();
  assert.match(await dialog(page).innerText(), /Робот — премиум-персонаж[\s\S]*Сохранить человека/);
  await dialog(page).locator('[data-act=no]').click();
  await waitNoLayers(page);
  assert.equal(await page.locator('#av-stage').count(), 1);
  await page.locator('[data-act=av-save]').click();
  await dialog(page).locator('[data-act=yes]').click();
  await toastHas(page, /Персонаж сохранён/);
  const a = (await saved(page)).avatar;
  assert.equal(a.sex, 'm');
  assert.equal(a.outfit, 'jacket', 'одежда остаётся');
  assert.deepEqual(errors, []);
  await context.close();
});
