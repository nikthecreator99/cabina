// 2.26 (решение Никиты 10.11.2026): профиль гостя, персонаж и награды — с аккаунтом, окно награды для гостя,
// «Пригласить коллег» без аккаунта, поиск коллег — только после «Меня можно найти», вопрос после регистрации.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';
import { mockServer, signIn, setProfile, CUR } from './mock-colleagues.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const sheet = (page) => page.locator('#layers .layer:not(.closing)').last();
const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const toastHas = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.toast-wrap')?.innerText || ''), re.source);
const trips = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, start: `2026-10-${String(1 + i).padStart(2, '0')}T20:00`, end: `2026-10-${String(2 + i).padStart(2, '0')}T06:00`, routeLabel: 'Сосновка → Ольховка', locoType: '2ЭС5К', locoNumber: String(100 + i) }));
const AVATAR = { sex: 'm', skin: 2, hair: 'short', hairC: 1, outfit: 'vest', bg: 'sky' };
const go = (page, where) => page.evaluate((w) => document.dispatchEvent(new CustomEvent('cabina:go', { detail: w })), where);

test('профиль гостя: как в макете — регистрация, что даёт аккаунт, «не следим»; без персонажа и наград; после входа всё на месте', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await seed(page, { trips: trips(3) });
  await setProfile(page, { name: 'Иван Тестовый', avatar: AVATAR });
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  const hero = page.locator('#gp-hero');
  assert.match(await hero.innerText(), /Ваша CABINA — больше возможностей[\s\S]*Зарегистрироваться[\s\S]*Войти[\s\S]*Бесплатно/);
  const perks = await text(page, '#gp-perks');
  assert.match(perks, /Награды и рекорды[\s\S]*Уже заработано: \d+ наград[аы]? — жд(ёт|ут) вас/, 'заработанные награды зовут зарегистрироваться');
  assert.match(perks, /Свой персонаж[\s\S]*Ваш персонаж сохранён — ждёт вас/, 'персонаж не стёрт');
  assert.match(perks, /Коллеги[\s\S]*Группы депо[\s\S]*Вещи за приглашения/);
  assert.match(await text(page, '#gp-trust'), /Мы за вами не следим\.[\s\S]*Геолокации нет\.[\s\S]*номер поезда и точное время явки остаются в телефоне/);
  assert.equal(await page.locator('.screen .ava-svg, #pr-awards, [data-act=av-open]').count(), 0, 'гостю нет персонажа и наград');
  assert.equal(await page.locator('.tab .tab-face').count(), 0, 'на вкладке — обычный значок, а не персонаж');
  // персонаж хранится как был
  const kept = await page.evaluate(async () => (await import('./js/store.js')).S.profile.avatar);
  assert.equal(kept.outfit, 'vest');
  // «Должность, депо и стаж» — свои данные для заработка остаются
  await page.locator('#gp-edit').click();
  await page.locator('#pr-role').waitFor();
  assert.equal(await page.locator('#pr-avatar').count(), 0, 'в «Моих данных» нет персонажа');
  await page.locator('[data-act=back]').click();
  // «Зарегистрироваться» и «Войти» — сразу нужная форма
  await page.locator('#gp-signup').click();
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  assert.match(await text(page, '.screen'), /Создать аккаунт/);
  await page.locator('[data-act=back]').click();
  await page.locator('#gp-login').click();
  await page.waitForSelector('.screen[data-page=account] #acc-pass[autocomplete=current-password]');
  await page.locator('[data-act=back]').click();
  // вошли — прежний профиль: персонаж и награды
  await mockServer(context);
  await signIn(page);
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('#pr-awards').waitFor();
  assert.equal(await page.locator('.pr-card .ava-svg').count(), 1, 'после входа персонаж снова на месте');
  assert.equal(await page.locator('#gp-hero').count(), 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('награды — закрытый экран с регистрацией; помощь ведёт туда же', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await seed(page, { trips: trips(2) });
  await page.reload(); await page.waitForSelector('.screen');
  await go(page, 'awards');
  await page.locator('#gp-lock').waitFor();
  assert.match(await text(page, '#gp-lock'), /Награды — с аккаунтом[\s\S]*Вы уже заработали \d+ наград[уы]?\. Зарегистрируйтесь — и увидите (её|их)/);
  await page.locator('#gp-lock [data-mode=signup]').click();
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  // «Помощь» → «Как получить награды?» → «Открыть» — тот же закрытый экран
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=back]').click();
  await tab(page, 'extra');
  await page.locator('.screen [data-page=help]').first().click();
  await page.locator('#help-q').fill('награды');
  await page.locator('[data-act=go][data-page=awards]').first().click();
  await page.locator('#gp-lock').waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('окно награды для гостя: «Новая награда!», какая — не видно; «Зарегистрироваться» ведёт в форму; второе — не раньше чем через 3 дня', async () => {
  const { context, page, errors } = await openApp(env, { guest: true, awards: true });
  const fire = (ts) => page.evaluate(async (t) => {
    const a = await import('./js/awards.js'); const s = await import('./js/store.js');
    const before = a.awardSnapshot();
    for (const x of t) await s.saveTrip({ passenger: [], restType: 'turnaround', ...x });
    a.celebrate(a.awardNews(before));
  }, ts);
  await fire(trips(1));
  const dlg = page.locator('.gp-nudge');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /Новая награда![\s\S]*ждёт вас в аккаунте/);
  assert.equal(await dlg.locator('.gp-blur').count(), 1, 'рисунок награды размыт');
  assert.doesNotMatch(await dlg.innerText(), /Первая поездка/, 'название не показываем');
  await dlg.locator('[data-act=aw-signup]').click();
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  // следующая награда через день — только сообщение внизу
  await fire(trips(12).slice(1));
  await toastHas(page, /ждёт вас в аккаунте/);
  assert.equal(await page.locator('.layer:not(.closing) .gp-nudge').count(), 0, 'второго окна нет');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Пригласить коллег» без аккаунта: QR и ссылка на сайт, без имени; вещи — с аккаунтом', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setProfile(page, { name: 'Иван Тестовый', phone: '+7 900 111-22-33' });
  await tab(page, 'profile');
  await page.locator('#inv-guest').click();
  const s = sheet(page);
  await s.locator('#inv-qr svg').waitFor();
  assert.match(await s.innerText(), /Покажите QR-код коллеге[\s\S]*Вещи для персонажа за приглашения[\s\S]*с аккаунтом/);
  await s.locator('[data-act=inv-copy]').click();
  await toastHas(page, /Ссылка скопирована/);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /^CABINA — учёт поездок[\s\S]*https:\/\/cabina-app\.ru\/$/);
  assert.doesNotMatch(clip, /Иван|900/, 'в ссылке нет данных человека');
  await s.locator('[data-act=acc-start]').click();
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('поиск коллег — только после «Меня можно найти»: подсказка, переключатели не включены, «Разрешить и искать»', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await mockServer(context, { consents: [{ document: CUR, withdrawn_at: null }] });
  await signIn(page);
  await setProfile(page, { name: 'Иван Тестовый' });
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('#col-find').click();
  const gate = page.locator('#col-gate');
  await gate.waitFor();
  assert.match(await gate.innerText(), /Сначала покажите себя[\s\S]*Поиск взаимный/);
  assert.equal(await page.locator('#col-form').count(), 0, 'поиска пока нет');
  assert.deepEqual(await page.locator('#col-gate-rows .switch').evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked'))), ['false', 'false'], 'ничего не включено заранее');
  await page.locator('#col-gate-go').click();
  // отдельное согласие на распространение — галочку ставит сам человек
  await sheet(page).locator('#col-agree').waitFor();
  assert.equal(await sheet(page).locator('#col-agree').isChecked(), false);
  await sheet(page).locator('#col-agree').check();
  await sheet(page).locator('[data-act=col-agree-ok]').click();
  await page.locator('#col-form').waitFor();
  assert.ok(srv.calls('give_consent').some((c) => /^publish-/.test(c.body.p_document)), 'согласие на поиск отправлено');
  assert.ok(srv.calls('set_access').some((c) => c.body.p_item === 'status' && c.body.p_all === true), 'статус — всем коллегам');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('после регистрации — «Показывать коллегам…?»: «Не сейчас» ничего не включает; «Да, показывать» с именем и согласием', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await mockServer(context, { consents: [{ document: CUR, withdrawn_at: null }] });
  await signIn(page);
  await page.reload(); await page.waitForSelector('.screen');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('cabina:signed-up')));
  let s = sheet(page);
  await s.locator('#col-showme').waitFor();
  assert.match(await s.innerText(), /Коллеги[\s\S]*Показывать коллегам, что вы в поездке или дома\?[\s\S]*Без этого вы не найдёте коллег, а они не увидят вас/);
  await s.locator('[data-act=sm-later]').click();
  await page.waitForFunction(() => !document.querySelector('#col-showme'));
  assert.equal(srv.calls('give_consent').length + srv.calls('set_access').length, 0, '«Не сейчас» — ничего не ушло');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('cabina:signed-up')));
  s = sheet(page);
  await s.locator('#sm-name').waitFor();
  await s.locator('[data-act=sm-yes]').click();
  await s.getByText('Впишите имя').waitFor();
  await s.locator('#sm-name').fill('Пётр Пробный');
  await s.locator('[data-act=sm-yes]').click();
  await sheet(page).locator('#col-agree').check();
  await sheet(page).locator('[data-act=col-agree-ok]').click();
  await toastHas(page, /коллеги найдут вас, а вы — их/);
  const pv = await page.evaluate(async () => (await import('./js/store.js')).S.profile);
  assert.equal(pv.name, 'Пётр Пробный');
  assert.equal(pv.privacy.find, true);
  assert.ok(srv.calls('set_access').some((c) => c.body.p_item === 'status' && c.body.p_all === true));
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('320 px, светлая и тёмная тема, очень крупный текст: профиль гостя и закрытый экран не вылезают', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { trips: trips(3) });
  for (const theme of ['light', 'dark']) {
    await seed(page, { settings: { theme, textSize: 'xl' } });
    await page.reload(); await page.waitForSelector('.screen');
    await tab(page, 'profile');
    await page.locator('#gp-hero').waitFor();
    assert.ok(await fits(page), `профиль, ${theme}`);
    const box = await page.locator('#gp-signup').boundingBox();
    assert.ok(box.width <= 320 && box.height >= 44, 'кнопка в экран и крупная');
    await go(page, 'awards');
    await page.locator('#gp-lock').waitFor();
    assert.ok(await fits(page), `закрытый экран, ${theme}`);
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
