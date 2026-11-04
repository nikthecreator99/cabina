// Браузерные проверки CABINA 2.19.9: прошлая работа в «Карьере» и общий стаж. Места и даты выдуманные.
// «Сейчас» — 20.10.2026 12:00 (helpers.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, text, waitNoLayers } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const careerNow = (page) => page.evaluate(async () => JSON.parse(JSON.stringify((await import('./js/store.js')).S.profile.career)));
const setCareer = (page, career) => page.evaluate(async (career) => { const s = await import('./js/store.js'); await s.saveProfile({ career }); }, career);
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const lastToast = (page) => page.locator('.toast').last().innerText();
const openCareer = async (page) => {
  await tab(page, 'profile');
  await page.locator('.screen [data-page=profile-edit]').click();
  await page.locator('[data-page=career]').click();
  await page.locator('#cr-past-add').waitFor();
};

test('прошлая работа: добавить, стаж за период сразу виден, общий стаж в Карьере и Профиле; ошибки дат понятные', async () => {
  const { context, page, errors } = await openApp(env);
  await setCareer(page, { hired: '2023-02-10', jobs: [
    { id: 'j1', role: 'assistant', title: '', from: '2018-03-01' },
    { id: 'j2', role: 'assistant', title: '', from: '2023-02-10' },
    { id: 'j3', role: 'driver', title: '', from: '2025-03-01' },
  ] });
  await openCareer(page);
  // пока прошлой работы нет — общего стажа нет, есть подсказка, когда это нужно
  assert.match(await text(page, '.screen'), /Непрерывный стаж\s+3 года 8 месяцев/);
  assert.equal(await page.locator('#cr-total').count(), 0);
  assert.match(await text(page, '.screen'), /Работали на ЖД раньше, уволились и вернулись — эти годы войдут в общий стаж/);
  // добавляем
  await page.locator('#cr-past-add').click();
  const f = sheet(page);
  assert.match(await f.innerText(), /Где работали[\s\S]*Должность[\s\S]*С какого числа[\s\S]*По какое число/);
  assert.equal(await f.locator('#pw-role [aria-pressed=true]').innerText(), 'Помощник машиниста', 'по умолчанию — должность из профиля');
  await f.locator('#pw-place').fill('Депо Сосновка');
  await f.locator('#pw-from').fill('2018-03-01');
  await f.locator('#pw-to').fill('2019-08-31');
  assert.equal(await f.locator('#pw-len').innerText(), 'Стаж за это время: 1 год 6 месяцев');
  // ошибка: «по» позже даты устройства
  await f.locator('#pw-to').fill('2023-02-10');
  await f.locator('[data-act=pw-save]').click();
  assert.match(await lastToast(page), /Прошлая работа должна закончиться раньше даты устройства — 10 февраля 2023/);
  await f.locator('#pw-to').fill('2019-08-31');
  await f.locator('[data-act=pw-save]').click();
  await waitNoLayers(page);
  let c = await careerNow(page);
  assert.equal(c.past.length, 1);
  assert.deepEqual([c.past[0].place, c.past[0].role, c.past[0].from, c.past[0].to], ['Депо Сосновка', 'assistant', '2018-03-01', '2019-08-31']);
  assert.equal(c.hired, '2023-02-10', 'дата устройства не меняется');
  assert.equal(c.jobs.length, 3, 'должности на месте');
  // список и стаж: 1 г. 6 мес. + 3 г. 8 мес. 10 дн. = 5 лет 2 месяца
  assert.match(await text(page, '#cr-past'), /Депо Сосновка\s+Помощник машиниста · 1 год 6 месяцев\s+с 1 марта 2018 по 31 августа 2019/);
  assert.equal(await text(page, '#cr-tenure'), '3 года 8 месяцев');
  assert.equal(await text(page, '#cr-total'), '5 лет 2 месяца');
  // должность, начатая на прошлой работе, заканчивается вместе с ней, а не через перерыв
  assert.match(await text(page, '#cr-jobs'), /Машинист\s+с 1 марта 2025 · сейчас[\s\S]*Помощник машиниста\s+с 10 февраля 2023 по 28 февраля 2025[\s\S]*Помощник машиниста\s+с 1 марта 2018 по 31 августа 2019/);
  // вознаграждение — по-прежнему от даты устройства: 3 года прошли (выплата в апреле), следующее — 5 лет, 10 февраля 2028
  assert.match(await text(page, '.loyal-next'), /5\s+лет стажа[\s\S]*10 февраля 2028/);
  // вторая прошлая работа пересекается с первой — нельзя
  await page.locator('#cr-past-add').click();
  const f2 = sheet(page);
  await f2.locator('#pw-role [data-role=other]').click();
  assert.equal(await f2.locator('#pw-title-box').isHidden(), false);
  await f2.locator('#pw-title').fill('Слесарь');
  await f2.locator('#pw-from').fill('2016-01-01');
  await f2.locator('#pw-to').fill('2018-03-01');
  await f2.locator('[data-act=pw-save]').click();
  assert.match(await lastToast(page), /Даты пересекаются с другой прошлой работой: Депо Сосновка \(с 1 марта 2018 по 31 августа 2019\)/);
  await f2.locator('#pw-to').fill('2017-12-31');
  await f2.locator('[data-act=pw-save]').click();
  await waitNoLayers(page);
  // без места — понятная подпись; новые сверху; 2 г. + 1 г. 6 мес. + 3 г. 8 мес. 10 дн.
  assert.match(await text(page, '#cr-past'), /Депо Сосновка[\s\S]*Место не указано\s+Слесарь · 2 года\s+с 1 января 2016 по 31 декабря 2017/);
  assert.equal(await text(page, '#cr-total'), '7 лет 2 месяца');
  // дату устройства нельзя поставить раньше конца прошлой работы
  await page.fill('#cr-hired', '2019-08-01');
  await page.locator('#cr-hired').dispatchEvent('change');
  assert.match(await lastToast(page), /Дата устройства должна быть позже прошлой работы — она закончилась 31 августа 2019/);
  assert.equal(await page.locator('#cr-hired').inputValue(), '2023-02-10');
  assert.equal((await careerNow(page)).hired, '2023-02-10');
  // Профиль и «Редактировать профиль» — общий стаж
  await page.locator('[data-act=back]').first().click();
  assert.match(await text(page, '[data-page=career]'), /Стаж 7 лет 2 месяца/);
  await page.locator('[data-act=back]').first().click();
  assert.match(await text(page, '.profile-card'), /Стаж 7 лет 2 месяца/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('изменить и удалить прошлую работу (вопрос «Да / Нет»); без неё — как раньше; текст экранируется', async () => {
  const { context, page, errors } = await openApp(env);
  await setCareer(page, { hired: '2023-02-10', jobs: [], past: [{ id: 'p1', place: '<img src=x onerror=alert(1)>', role: 'driver', title: '', from: '2018-03-01', to: '2019-08-31' }] });
  await openCareer(page);
  assert.equal(await page.locator('#cr-past img').count(), 0, 'текст места — не разметка');
  assert.match(await text(page, '#cr-past'), /<img src=x onerror=alert\(1\)>\s+Машинист · 1 год 6 месяцев/);
  await page.locator('[data-act=past-edit]').click();
  const f = sheet(page);
  assert.equal(await f.locator('#pw-place').inputValue(), '<img src=x onerror=alert(1)>');
  assert.equal(await f.locator('#pw-len').innerText(), 'Стаж за это время: 1 год 6 месяцев', 'у сохранённой — сразу видно');
  await f.locator('#pw-place').fill('Депо Ольховка');
  await f.locator('#pw-from').fill('2018-09-01');
  await f.locator('[data-act=pw-save]').click();
  await waitNoLayers(page);
  assert.match(await text(page, '#cr-past'), /Депо Ольховка\s+Машинист · 1 год\s+с 1 сентября 2018 по 31 августа 2019/);
  assert.equal(await text(page, '#cr-total'), '4 года 8 месяцев');
  await page.locator('[data-act=past-edit]').click();
  await sheet(page).locator('[data-act=pw-del]').click();
  assert.match(await text(page, '.dialog'), /Вы действительно хотите удалить прошлую работу\?[\s\S]*Депо Ольховка/);
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.career.past.length === 0);
  await waitNoLayers(page);
  assert.equal(await page.locator('#cr-total').count(), 0);
  assert.equal(await page.locator('#cr-past').count(), 0);
  await page.locator('[data-act=back]').first().click();
  assert.match(await text(page, '[data-page=career]'), /Стаж 3 года 8 месяцев/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px, обе темы: «Карьера» с прошлой работой и окно прошлой работы помещаются', async () => {
  for (const theme of ['light', 'dark']) {
    const { context, page, errors } = await openApp(env);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(async (t) => { await (await import('./js/store.js')).saveSettings({ theme: t }); localStorage.setItem('cabina-theme', t); }, theme);
    await page.reload(); await page.waitForSelector('.screen');
    await setCareer(page, { hired: '2023-02-10', jobs: [{ id: 'j1', role: 'assistant', title: '', from: '2023-02-10' }],
      past: [{ id: 'p1', place: 'Локомотивное эксплуатационное депо Сосновка-Сортировочная', role: 'other', title: 'Слесарь по ремонту подвижного состава', from: '2012-03-01', to: '2019-08-31' }] });
    await openCareer(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    await page.locator('#cr-past').scrollIntoViewIfNeeded();
    assert.ok(await fits(page));
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/career-${theme}.png`, fullPage: true });
    await page.locator('[data-act=past-edit]').click();
    await sheet(page).locator('#pw-to').waitFor();
    assert.ok(await fits(page));
    const over = await sheet(page).evaluate((el) => [...el.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > window.innerWidth + 0.5).length);
    assert.equal(over, 0, 'ничего не вылезает за край');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/past-form-${theme}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
});
