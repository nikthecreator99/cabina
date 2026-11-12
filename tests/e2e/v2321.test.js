// Браузерные проверки CABINA 2.32.1: напарник вверху формы, ожидание следования — в карточке следования пассажиром,
// небо главной без опор и проводов с солнцем слева от лупы, награда «Своя бригада». Данные выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const stored = (page, id) => page.evaluate(async (id) => JSON.parse(JSON.stringify((await import('./js/store.js')).S.trips.find((t) => t.id === id))), id);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const setTheme = (page, t) => page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t }); document.documentElement.dataset.theme = t; }, t);

test('напарник — самым первым полем формы, над участком', async () => {
  const { context, page, errors } = await openApp(env);
  await page.locator('[data-act=add-trip]').click();
  const f = sheet(page);
  const order = await f.locator('.field').evaluateAll((els) => els.slice(0, 2).map((e) => (e.querySelector('#tf-mates') ? 'mates' : e.querySelector('#tf-route-cap') ? 'route' : '?')));
  assert.deepEqual(order, ['mates', 'route']);
  const yM = (await f.locator('#tf-add-mate').boundingBox()).y;
  const yR = (await f.locator('[data-act=pick-route]').boundingBox()).y;
  assert.ok(yM < yR, 'кнопка «Напарник» выше участка');
  assert.deepEqual(errors, []);
  await context.close();
});

test('ожидание следования: отдельной кнопки нет, указывается в карточке следования пассажиром и сохраняется', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await page.locator('.trip').first().click();
  const f = sheet(page);
  assert.equal(await f.locator('#tf-add-wait').count(), 0, 'без следования пассажиром ожидания нет');
  await f.locator('[data-act=add-pass]').click();
  const card = f.locator('#tf-pass .interval').first();
  // кнопка ожидания — внутри карточки следования
  assert.equal(await card.locator('#tf-add-wait').count(), 1);
  await card.locator('> .dt [data-pf=st]').fill('14:30');
  await card.locator('> .dt [data-pf=et]').fill('16:00');
  await card.locator('#tf-add-wait').click();
  const w = card.locator('.iv-wait');
  assert.equal(await w.count(), 1);
  assert.match(await w.innerText(), /Ожидание следования/);
  assert.equal(await w.locator('[data-pf=et]').inputValue(), '14:30', 'окончание ожидания — начало следования');
  await w.locator('[data-pf=st]').fill('12:00');
  assert.equal(await f.locator('#tf-add-wait').count(), 0, 'второе ожидание к тому же следованию не добавить');
  assert.match(await text(f, '#tf-calc'), /В том числе ожидание следования\s+2 ч 30 мин/);
  // второе следование — у него своя кнопка ожидания
  await f.locator('[data-act=add-pass]').click();
  assert.equal(await f.locator('#tf-pass .interval').nth(1).locator('#tf-add-wait').count(), 1);
  await f.locator('#tf-pass .interval').nth(1).locator('[data-act=del-pass]').click();
  await f.locator('[data-rest=turnaround]').click();
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  let t = await stored(page, 'a');
  assert.deepEqual(t.waiting.map(({ start, end }) => ({ start, end })), [{ start: '2026-10-14T12:00', end: '2026-10-14T14:30' }]);
  assert.deepEqual(t.passenger.map(({ start, end }) => ({ start, end })), [{ start: '2026-10-14T14:30', end: '2026-10-14T16:00' }]);
  // снова открыли: свёрнутая строка показывает и ожидание; развернули — убрали ожидание
  await page.locator('.trip').first().click();
  const short = sheet(page).locator('#tf-pass .interval.short');
  assert.match(await short.innerText(), /Пассажиром[\s\S]*ожидание 12:00 – 14:30 · 2 ч 30/);
  for (const theme of ['dark', 'light']) {
    await setTheme(page, theme);
    for (const wd of [320, 390]) { await page.setViewportSize({ width: wd, height: 800 }); assert.equal(await fits(page), true, `${theme} ${wd}`); }
  }
  await short.click();
  await sheet(page).locator('[data-act=del-wait]').click();
  assert.equal(await sheet(page).locator('.iv-wait').count(), 0);
  // удалить следование — уходит и его ожидание
  await sheet(page).locator('#tf-add-wait').click();
  await sheet(page).locator('#tf-pass .interval [data-act=del-pass]').click();
  await sheet(page).locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  t = await stored(page, 'a');
  assert.equal((t.passenger || []).length, 0);
  assert.equal((t.waiting || []).length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('небо главной: без опор и проводов; днём солнце слева от лупы и видно, ночью солнца нет', async () => {
  for (const [now, sun] of [['2026-10-20T12:00:00+03:00', true], ['2026-10-20T17:00:00+03:00', true], ['2026-10-20T23:00:00+03:00', false]]) {
    const { context, page, errors } = await openApp(env, { now });
    assert.equal(await page.locator('.sky svg line').count(), 0, 'опор нет');
    assert.equal(await page.locator('.home-sun').count(), sun ? 1 : 0, now);
    for (const theme of ['dark', 'light']) {
      await setTheme(page, theme);
      for (const w of [320, 360, 390, 430]) {
        await page.setViewportSize({ width: w, height: 800 });
        assert.equal(await fits(page), true);
        if (!sun) continue;
        const s = await page.locator('.home-sun').boundingBox();
        const q = await page.locator('.home-head [data-page=search]').boundingBox();
        const m = await page.locator('.home-head .month-switch').boundingBox();
        const cx = s.x + s.width / 2;
        assert.ok(cx < q.x && cx > m.x + m.width, `${w}: центр солнца между месяцем и лупой`);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('награда «Своя бригада»: со днём в телефоне — получена, в «Особых», с картинкой', async () => {
  const { context, page, errors } = await openApp(env);
  await page.evaluate(async () => { await (await import('./js/store.js')).saveProfile({ groupAward: '2026-10-20' }); });
  await page.locator('.tab[data-tab=profile]').click();
  assert.match(await text(page, '#pr-awards'), /1 из 41/);
  await page.locator('#pr-awards-all').click();
  await page.waitForSelector('.aw-grid');
  const aw = page.locator('.aw[data-id=group]');
  assert.doesNotMatch(await aw.getAttribute('class'), /locked/);
  assert.match(await aw.innerText(), /Своя бригада/);
  const ok = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = 'icons/awards/group.webp'; }));
  assert.equal(ok, 192);
  assert.deepEqual(errors, []);
  await context.close();
});
