// Браузерные проверки CABINA 2.19.7: смена локомотива в одной поездке и следование пассажиром без окончания.
// Данные выдуманные. «Сейчас» — 20.10.2026 12:00 (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers, closeTop } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const ROUTES = [{ id: 'ab', from: 'Сосновка', to: 'Ольховка', distanceKm: 120, weightNorm: 6000, createdAt: 1 }];
const PAY = { main: { rates: [{ from: null, rate: 300 }] } };
const top = (page) => page.locator('.layer').last();
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const tripOf = (page, id) => page.evaluate(async (id) => { const t = (await import('./js/store.js')).S.trips.find((x) => x.id === id); return JSON.parse(JSON.stringify(t)); }, id);

test('в пути: «Добавить локомотив» — время «сейчас», обратный маршрут одним нажатием; пассажиром без окончания; потом окончание поездки', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, settings: { pay: PAY },
    trips: [{ id: 'v', routeId: 'ab', start: '2026-10-20T05:00', end: '', locoType: '2ЭС5К', locoNumber: '355', kind: 'freight', restType: null }] });
  await page.locator('.trip[data-id=v]').click();
  const f = top(page);
  await f.locator('#tf-add-leg').waitFor();
  assert.equal(await f.locator('#tf-lt-cap').innerText(), 'Тип локомотива', 'пока локомотив один — подписи прежние');
  await f.locator('#tf-add-leg').click();
  const card = f.locator('#tf-legs .leg');
  assert.match(await card.innerText(), /Второй локомотив[\s\S]*Когда сменили локомотив[\s\S]*Участок[\s\S]*Тип локомотива[\s\S]*Номер/);
  assert.equal(await card.locator('[data-lf=sd]').inputValue(), '2026-10-20');
  assert.equal(await card.locator('[data-lf=st]').inputValue(), '12:00', 'поездка идёт — сменили только что');
  assert.equal(await f.locator('#tf-lt-cap').innerText(), 'Тип первого локомотива');
  assert.match(await f.locator('#tf-route-cap').innerText(), /Участок первого локомотива/);
  // 2.25: «Обратно» — тот же участок в другую сторону, новый не создаётся
  assert.equal(await card.locator('[data-lrev]').innerText(), 'Обратно: Ольховка → Сосновка');
  await card.locator('[data-lf=st]').fill('10:30');
  await card.locator('[data-lrev]').click();
  await card.locator('[data-leg-route]', { hasText: 'Ольховка → Сосновка' }).waitFor();
  assert.equal(await card.locator('[data-lrev]').count(), 0);
  await card.locator('[data-ltype="2ЭС5К"]').click();
  assert.equal(await card.locator('[data-lf=locoType]').inputValue(), '2ЭС5К');
  await card.locator('[data-lf=locoType]').fill('ВЛ80С');
  await card.locator('[data-lf=locoNumber]').fill('1234');
  await card.locator('[data-act=leg-train]').click();
  await card.locator('[data-lf=weight]').fill('5000');
  // пассажиром — с этой минуты, окончание пустое
  await f.locator('[data-act=add-pass]').click();
  const pass = f.locator('#tf-pass .interval');
  assert.equal(await pass.locator('[data-pf=st]').inputValue(), '12:00');
  assert.equal(await pass.locator('[data-pf=et]').inputValue(), '');
  // 2.21.2 (Никита): без пояснения, только «Номер поезда (необязательно)»
  assert.doesNotMatch(await pass.innerText(), /Окончание можно не указывать/);
  assert.match(await pass.innerText(), /Номер поезда \(необязательно\)/);
  await pass.locator('[data-pf=st]').fill('11:00');
  assert.match(await text(f, '#tf-calc'), /В пути\s+7 ч 00 мин/);
  assert.match(await f.locator('[data-act=save-trip]').innerText(), /В путь/);
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  let t = await tripOf(page, 'v');
  assert.equal(t.end, '', 'поездка осталась «в пути»');
  assert.deepEqual(t.passenger.map((p) => [p.start, p.end]), [['2026-10-20T11:00', '']]);
  assert.equal(t.legs.length, 1);
  assert.deepEqual([t.legs[0].start, t.legs[0].locoType, t.legs[0].locoNumber, t.legs[0].weight], ['2026-10-20T10:30', 'ВЛ80С', '1234', 5000]);
  assert.deepEqual([t.legs[0].routeId, t.legs[0].stFrom, t.legs[0].stTo], ['ab', 'Ольховка', 'Сосновка']);
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.routes.length), 1);
  // главная: весь путь и оба локомотива
  const row = page.locator('.trip[data-id=v]');
  assert.match(await row.innerText(), /Сосновка → Ольховка → Сосновка/);
  assert.deepEqual(await row.locator('.chip.loco').allInnerTexts(), ['2ЭС5К №355', 'ВЛ80С №1234']);
  // профиль: в пути — по маршруту второго локомотива
  await page.locator('.tab[data-tab=profile]').click();
  assert.match(await text(page, "#pr-status"), /В пути с\s05:00\s*Ольховка → Сосновка/);
  // вернулись: окончание поездки — следование пассажиром заканчивается вместе с ней
  await page.locator('.tab[data-tab=home]').click();
  await page.locator('.trip[data-id=v]').click();
  const f2 = top(page);
  await f2.locator('#tf-et').fill('11:50');
  await f2.locator('[data-rest=turnaround]').click();
  assert.match(await text(f2, '#tf-calc'), /Рабочее время\s+6 ч 50 мин/);
  assert.match(await text(f2, '#tf-rest-calc'), /Дом отдыха\s+Сосновка/); // 2.21: отдых — под кнопками внизу
  await f2.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  t = await tripOf(page, 'v');
  assert.deepEqual(t.passenger.map((p) => [p.start, p.end]), [['2026-10-20T11:00', '2026-10-20T11:50']]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('законченная поездка: ошибки времени смены понятные; карточку можно убрать — подписи и запись как раньше', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { routes: ROUTES, settings: { pay: PAY },
    trips: [{ id: 'p', routeId: 'ab', start: '2026-10-14T05:00', end: '2026-10-14T17:00', locoType: '2ЭС5К', locoNumber: '355', kind: 'freight', weight: 6100 }] });
  await page.locator('.trip[data-id=p]').click();
  const f = top(page);
  await f.locator('#tf-add-leg').click();
  const card = f.locator('#tf-legs .leg');
  assert.equal(await card.locator('[data-lf=sd]').inputValue(), '2026-10-14');
  assert.equal(await card.locator('[data-lf=st]').inputValue(), '', 'законченная поездка — время смены вписывает человек');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await text(f, '[data-error]'), /Второй локомотив: укажите дату и время смены локомотива или удалите его/);
  await card.locator('[data-lf=st]').fill('18:00');
  await f.locator('[data-act=save-trip]').click();
  assert.match(await text(f, '[data-error]'), /смена должна быть раньше окончания поездки/);
  await card.locator('[data-lf=st]').fill('11:00');
  await card.locator('[data-lf=locoNumber]').fill('77');
  await f.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await tripOf(page, 'p')).legs[0].locoNumber, '77');
  // открыли снова — карточка на месте; убрали — подписи прежние, в записи смены нет
  await page.locator('.trip[data-id=p]').click();
  const f2 = top(page);
  assert.equal(await f2.locator('#tf-legs .leg [data-lf=locoNumber]').inputValue(), '77');
  assert.equal(await f2.locator('#tf-ln-cap').innerText(), 'Номер первого локомотива');
  await f2.locator('#tf-legs [data-act=del-leg]').click();
  assert.equal(await f2.locator('#tf-legs .leg').count(), 0);
  assert.equal(await f2.locator('#tf-ln-cap').innerText(), 'Номер локомотива');
  await f2.locator('[data-act=save-trip]').click();
  await waitNoLayers(page);
  assert.equal((await tripOf(page, 'p')).legs, undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test('оба локомотива — в календаре дня, статистике и поиске; 320 px, обе темы, без сдвига вбок', async () => {
  for (const theme of ['light', 'dark']) {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 700 });
    await seed(page, {
      routes: [...ROUTES, { id: 'ba', from: 'Ольховка', to: 'Сосновка', distanceKm: 120, createdAt: 2 }],
      settings: { pay: PAY, theme },
      trips: [{ id: 'p', routeId: 'ab', start: '2026-10-14T05:00', end: '2026-10-14T17:00', locoType: '2ЭС5К', locoNumber: '355', kind: 'freight', weight: 6100, axles: 280,
        legs: [{ id: 'l', start: '2026-10-14T11:00', routeId: 'ba', routeLabel: 'Ольховка → Сосновка', locoType: 'ВЛ80С', locoNumber: '1234', weight: 5000 }] }],
    });
    await page.evaluate((t) => localStorage.setItem('cabina-theme', t), theme);
    await page.reload(); await page.waitForSelector('.screen');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.ok(await fits(page));
    // форма с карточкой второго локомотива помещается в 320 px
    await page.locator('.trip[data-id=p]').click();
    await top(page).locator('#tf-legs .leg').waitFor();
    assert.ok(await fits(page));
    // ничего не вылезает за край (подсказки маршрута в ряду .quick прокручиваются внутри него)
    const over = await top(page).evaluate((el) => [...el.querySelectorAll('#tf-legs .leg *')].filter((x) => !x.closest('.quick > *') && x.getBoundingClientRect().right > window.innerWidth + 0.5).length);
    assert.equal(over, 0, 'ничего не вылезает за край');
    await closeTop(page);
    await waitNoLayers(page);
    // календарь дня
    await page.evaluate(async () => (await import('./js/day.js')).openDay('2026-10-14'));
    const day = top(page);
    assert.match(await day.innerText(), /Сосновка → Ольховка → Сосновка[\s\S]*Первый локомотив\s+2ЭС5К №355[\s\S]*Сосновка → Ольховка · 6\s100 т · 280 осей[\s\S]*Второй локомотив · с 11:00\s+ВЛ80С №1234[\s\S]*Ольховка → Сосновка · 5\s000 т/);
    assert.ok(await fits(page));
    await closeTop(page);
    await waitNoLayers(page);
    // статистика: локомотивы по сериям, плечи и километры
    await page.locator('.hero').click();
    await page.waitForSelector('#st-kind');
    assert.deepEqual((await page.locator('.st-series').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()), ['2ЭС5К 1 раз', 'ВЛ80С 1 раз']);
    assert.match(await text(page, '.screen'), /240 км/);
    assert.ok(await fits(page));
    await page.locator('[data-act=back]').first().click();
    // поиск по второму локомотиву
    await page.locator('.home-head [data-page=search]').click();
    await page.fill('#trip-q', '1234');
    assert.match(await text(page, '#search-list'), /Найдено: 1 поездка[\s\S]*2ЭС5К №355, ВЛ80С №1234/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});
