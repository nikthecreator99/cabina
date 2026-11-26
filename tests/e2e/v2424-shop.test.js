// Страница магазина (2.42.4, просьба Никиты 26.11.2026 — «посимпатичнее» для проверки Робокассой):
// товары плитками по группам, карточка ведёт к оформлению, реквизиты продавца видны сразу, 320 px с очень крупным текстом.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp } from './helpers.js';

async function shopPage(env, { width = 390, theme = 'dark', text = 'm', mode = 'off' } = {}) {
  const context = await env.browser.newContext({ viewport: { width, height: 800 }, locale: 'ru-RU', serviceWorkers: 'block' });
  await context.addInitScript(([t, x]) => { try { localStorage.setItem('cabina-theme', t); localStorage.setItem('cabina-text', x); } catch {} }, [theme, text]);
  // Сервер магазина подменён: в тестах никуда не ходим
  await context.route('https://api.cabina-app.ru/**', (r) => r.fulfill({ json: { terms: '2026-11-25', mode }, headers: { 'access-control-allow-origin': '*' } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(env.url + 'data/shop.html');
  await page.locator('#status:not(:empty)').waitFor();
  return { context, page, errors };
}

test('магазин: группы, цены, реквизиты продавца видны, карточка ведёт к оформлению', async () => {
  const env = await startEnv();
  try {
    const { page, errors, context } = await shopPage(env);
    assert.deepEqual(await page.locator('.shop-group').allInnerTexts(), ['Персонажи', 'Фоны', 'Детали', 'Условия покупки']);
    assert.deepEqual(await page.locator('.shop-grid').evaluateAll((gs) => gs.map((g) => [...g.children].map((c) => c.dataset.sku).join(','))),
      ['robot,horse,skeleton', 'ocean,depot', 'mazut,peaked']);
    assert.equal(await page.locator('[data-sku=ocean] .product-price').innerText(), '459 ₽');
    assert.equal(await page.locator('#status').innerText(), 'Приём оплаты скоро откроется.');
    // Робокасса проверяет реквизиты, почту и телефон — они на виду, без нажатий
    const seller = await page.locator('footer').innerText();
    assert.match(seller, /Продавец[\s\S]*Самозанятый Григорьев Никита Сергеевич\s+ИНН 291802561037 · г\. Няндома/);
    assert.match(seller, /cabina\.help@mail\.ru[\s\S]*\+7 952 301-43-38/);
    assert.ok(await page.locator('footer a[href^="mailto:"]').isVisible());
    // Оферта и возврат раскрываются
    await page.locator('#terms summary').click();
    assert.ok(await page.getByText('простое неисключительное право').isVisible());
    await page.locator('#returns summary').click();
    assert.ok(await page.getByText('оформит возврат').isVisible());
    // Карточка целиком — к оформлению этого предмета
    await page.locator('[data-sku=depot] .product-link').click();
    await page.waitForURL(/\?item=depot$/);
    assert.equal(await page.locator('h1').innerText(), 'Оформление покупки');
    assert.equal(await page.locator('[data-sku]').count(), 1);
    assert.match(await page.locator('.checkout-pay').innerText(), /Оплата недоступна · 459 ₽/);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await env.stop(); }
});

test('магазин на 320 px с очень крупным текстом в обеих темах — без прокрутки вбок, по две плитки в ряд', async () => {
  const env = await startEnv();
  try {
    for (const theme of ['dark', 'light']) {
      const { page, errors, context } = await shopPage(env, { width: 320, theme, text: 'xl', mode: 'test' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
      const [a, b] = await page.locator('.shop-grid').first().locator('.product').evaluateAll((cs) => cs.slice(0, 2).map((c) => c.getBoundingClientRect().top));
      assert.equal(a, b, 'робот и конь — в одном ряду');
      // Цена и стрелка не вылезают за плитку
      const out = await page.locator('.product').evaluateAll((cs) => cs.filter((c) => {
        const r = c.getBoundingClientRect();
        return [...c.querySelectorAll('.product-foot > *, h2, p')].some((x) => x.getBoundingClientRect().right > r.right + 0.5);
      }).map((c) => c.dataset.sku));
      assert.deepEqual(out, []);
      assert.equal(await page.locator('#status').innerText(), 'Тестовый режим оплаты.');
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await env.stop(); }
});

test('«Ещё» → «Магазин» открывает страницу магазина, «Назад» возвращает в приложение', async () => {
  const env = await startEnv();
  try {
    const { page, errors, context } = await openApp(env);
    await context.route('https://api.cabina-app.ru/shop/**', (r) => r.fulfill({ json: { terms: '2026-11-25', mode: 'off' }, headers: { 'access-control-allow-origin': '*' } }));
    await page.locator('.tab[data-tab=extra]').click();
    const row = page.locator('#extra-list > .row[data-key=shop]');
    assert.match(await row.innerText(), /Магазин\s+Персонажи, фоны и детали для профиля/);
    await row.click();
    await page.waitForURL(/\/data\/shop\.html$/);
    await page.locator('.shop-grid').first().waitFor();
    assert.equal(await page.locator('h1').innerText(), 'Магазин оформления');
    await page.locator('.checkout-back').click();
    await page.waitForSelector('#extra-list');
    assert.deepEqual(errors.filter((e) => !/api\.cabina-app\.ru/.test(e)), []);
    await context.close();
  } finally { await env.stop(); }
});

// 2.43.1 (просьба Никиты 26.11.2026): в оформлении — тот персонаж, которого человек настроил, а «Назад» — туда, откуда пришёл
test('редактор персонажа → «Оформить»: в оформлении настроенный робот, «Назад» — в редактор с той же примеркой', async () => {
  const env = await startEnv();
  try {
    const { page, errors, context } = await openApp(env);
    await context.route('https://api.cabina-app.ru/shop/**', (r) => r.fulfill({ json: { terms: '2026-11-25', mode: 'off', owned: [] }, headers: { 'access-control-allow-origin': '*' } }));
    await page.locator('.tab[data-tab=profile]').click();
    await page.locator('[data-act=av-open]').first().click();
    await page.locator('.screen[data-page=avatar]').waitFor();
    await page.locator('[data-act=av-chars]').click();
    await page.locator('[data-act=av-set][data-k=sex][data-v=robot]').click();
    await page.locator('[data-act=av-set][data-k=metal][data-v="3"]').click();
    const order = page.locator('[data-act=av-order][data-sku=robot]');
    assert.match(await order.innerText(), /Оформить за 299 ₽/);
    await order.click();
    await page.waitForURL(/\/data\/shop\.html\?item=robot$/);
    await page.locator('.checkout-info .preview svg').waitFor();
    // Картинка — из примерки (корпус цвета 3), а не робот по умолчанию
    const same = await page.evaluate(async () => {
      const A = await import('/js/avatar.js');
      const d0 = document.createElement('div'); const htmlOf = (svg) => { d0.innerHTML = svg; return d0.innerHTML.replace(/\b[a-z]+\d+_/g, 'x_'); };
      const back = JSON.parse(sessionStorage.getItem('cabina-back'));
      const html = document.querySelector('.checkout-info .preview').innerHTML.replace(/\b[a-z]+\d+_/g, 'x_');
      return { mine: html === htmlOf(A.avatarSvg(A.normalizeAvatar(back.look, { premium: true }))), plain: html === htmlOf(A.avatarSvg({ sex: 'robot' })), metal: back.look.metal };
    });
    assert.deepEqual(same, { mine: true, plain: false, metal: 3 });
    await page.locator('.checkout-back').click();
    await page.locator('.screen[data-page=avatar]').waitFor();
    assert.equal(await page.locator('[data-act=av-set][data-k=metal][data-v="3"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.tab[data-tab=profile]').getAttribute('aria-current'), 'page');
    assert.ok(await page.evaluate(() => document.body.classList.contains('av-editing')));
    assert.deepEqual(errors.filter((e) => !/api\.cabina-app\.ru/.test(e)), []);
    await context.close();
  } finally { await env.stop(); }
});

test('магазин: предмет → «Назад» возвращает в общий список, оттуда «Назад» — в «Ещё»', async () => {
  const env = await startEnv();
  try {
    const { page, errors, context } = await openApp(env);
    await context.route('https://api.cabina-app.ru/shop/**', (r) => r.fulfill({ json: { terms: '2026-11-25', mode: 'off' }, headers: { 'access-control-allow-origin': '*' } }));
    await page.locator('.tab[data-tab=extra]').click();
    await page.locator('#extra-list > .row[data-key=shop]').click();
    await page.waitForURL(/\/data\/shop\.html$/);
    await page.locator('[data-sku=horse] .product-link').click();
    await page.waitForURL(/\?item=horse$/);
    // без примерки — обычная картинка предмета
    assert.ok(await page.evaluate(async () => {
      const A = await import('/js/avatar.js');
      const d0 = document.createElement('div'); const htmlOf = (svg) => { d0.innerHTML = svg; return d0.innerHTML.replace(/\b[a-z]+\d+_/g, 'x_'); };
      return document.querySelector('.checkout-info .preview').innerHTML.replace(/\b[a-z]+\d+_/g, 'x_') === htmlOf(A.avatarSvg({ sex: 'horse' }));
    }));
    await page.locator('.checkout-back').click();
    await page.waitForURL(/\/data\/shop\.html$/);
    await page.locator('.shop-grid').first().waitFor();
    assert.equal(await page.locator('h1').innerText(), 'Магазин оформления');
    await page.locator('.checkout-back').click();
    await page.waitForSelector('#extra-list');
    assert.deepEqual(errors.filter((e) => !/api\.cabina-app\.ru/.test(e)), []);
    await context.close();
  } finally { await env.stop(); }
});

test('оформление по прямой ссылке: «Назад» ведёт в общий список магазина', async () => {
  const env = await startEnv();
  try {
    const { page, errors, context } = await shopPage(env);
    await page.goto(env.url + 'data/shop.html?item=ocean');
    await page.locator('.checkout-info').waitFor();
    assert.ok(await page.evaluate(async () => {
      const A = await import('/js/avatar.js');
      const d0 = document.createElement('div'); const htmlOf = (svg) => { d0.innerHTML = svg; return d0.innerHTML.replace(/\b[a-z]+\d+_/g, 'x_'); };
      return document.querySelector('.checkout-info .preview').innerHTML.replace(/\b[a-z]+\d+_/g, 'x_') === htmlOf(A.bgSvg('ocean'));
    }));
    await page.locator('.checkout-back').click();
    await page.waitForURL(/\/data\/shop\.html$/);
    await page.locator('.shop-grid').first().waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await env.stop(); }
});
