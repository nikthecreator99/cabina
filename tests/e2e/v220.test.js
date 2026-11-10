// Браузерные проверки CABINA 2.20: «Пригласить коллег» (ссылка, QR, счёт, вещи персонажа, «Наставник»),
// ссылка-приглашение у нового человека, «Предложить идею» («Идейный»), идеи для администратора,
// плашка «кто из коллег в пути» без аккаунта. Сервер подменён (mock-colleagues.js), люди и тексты выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text, waitNoLayers } from './helpers.js';
import { mockServer, signIn, ready, CUR, TRIP } from './mock-colleagues.js';
import { SIGNUP_OPEN } from '../../js/legal.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const top = (page) => page.locator('#layers .layer:not(.closing)').last();
const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
// Размер элемента; экран мог перерисоваться между поиском и замером — тогда повторяем
const box = async (loc) => { for (let i = 0; i < 20; i++) { const b = await loc.boundingBox().catch(() => null); if (b) return b; await new Promise((r) => setTimeout(r, 100)); } return null; };
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const profileOf = (page) => page.evaluate(async () => (await import('./js/store.js')).S.profile);
const OLD = { consents: [{ document: 'privacy-2', withdrawn_at: null }] };
const NEW = { consents: [{ document: CUR, withdrawn_at: null }] };
const trips = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, start: `2026-10-${String(1 + i * 2).padStart(2, '0')}T08:00`, end: `2026-10-${String(1 + i * 2).padStart(2, '0')}T16:00`, routeLabel: 'Сосновка → Ольховка' }));

// Поздравления с наградами появляются с задержкой: ждём, пока полторы секунды подряд нет нового, и закрываем «Позже»
const drainAwards = async (page, quiet = 1500) => {
  const seen = [];
  for (let idle = 0; idle < quiet;) {
    const d = page.locator('#layers .layer:not(.closing) .aw-dialog');
    if (await d.count()) {
      seen.push(await d.last().innerText().catch(() => ''));
      await d.last().getByRole('button', { name: 'Позже' }).click({ timeout: 3000 }).catch(() => {});
      await waitNoLayers(page);
      idle = 0;
    } else { await page.waitForTimeout(150); idle += 150; }
  }
  return seen.join('\n');
};

// QR-код из окна читаем тем же jsQR, что и приложение (картинка → холст → текст)
const readQr = (page) => page.evaluate(async () => {
  const svg = document.querySelector('#inv-qr svg');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"'))}`;
  await img.decode();
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 600;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 600, 600);
  const jsQR = (await import('./js/vendor/jsqr.js')).default;
  return jsQR(cx.getImageData(0, 0, 600, 600).data, 600, 600)?.data || null;
});

test('«Пригласить коллег»: строка в профиле, ступени 1 / 5 / 10, новая редакция согласия, QR-код со ссылкой, отмена приглашения', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, OLD);
  await tab(page, 'profile');
  await page.locator('#inv-entry').waitFor();
  assert.equal((await text(page, '#inv-entry')).trim(), 'Пригласить коллег', '2.21.2: без подписи');
  await page.locator('#inv-entry').click();
  await page.waitForSelector('.screen[data-page=invites] #inv-new:not([disabled])');
  const scr = await text(page, '.screen');
  assert.match(scr, /подтвердит почту и зайдёт в CABINA в 3 разных дня/);
  assert.match(scr, /Напарник · 1 приглашение[\s\S]*Бригада · 5 приглашений[\s\S]*Машинист-инструктор · 10 приглашений/);
  assert.match(scr, /Кто именно пришёл, не видно — только сколько/);
  // согласие прежней редакции: сначала новая (в ней приглашения и идеи)
  await page.locator('#inv-new').click();
  const c = top(page);
  await c.locator('#col-agree').waitFor();
  assert.match(await c.innerText(), new RegExp(`Редакция ${CUR}[\\s\\S]*личные приглашения[\\s\\S]*Идеи читает только Оператор`));
  await c.locator('#col-agree').check();
  await c.locator('[data-act=col-agree-ok]').click();
  // приглашение готово: код и QR-код со ссылкой на этот же сайт
  await page.locator('#inv-qr svg').waitFor({ timeout: 5000 });
  const sheetText = await top(page).innerText();
  assert.match(sheetText, /Приглашение готово[\s\S]*7F3A9 C21B\d[\s\S]*Действует до 3 ноября[\s\S]*только для одного человека/);
  const link = await readQr(page);
  assert.match(link, new RegExp(`^${env.url.replace(/\/$/, '')}/#invite=7F3A9C21B\\d$`));
  assert.deepEqual(srv.calls('give_consent').map((x) => x.body), [{ p_document: CUR }]);
  assert.equal(srv.calls('create_invite').length, 2, 'первый раз сервер отказал из-за старой редакции, после согласия — повтор');
  assert.equal(srv.db.invites.open.length, 1);
  await page.locator('#layers .layer:not(.closing) .scrim').last().click({ position: { x: 10, y: 10 } });
  await waitNoLayers(page);
  // в списке «Ждут коллегу»; код больше нигде не виден
  await page.locator('#inv-open .inv-open').waitFor();
  assert.match(await text(page, '#inv-open'), /Приглашение от 20 октября[\s\S]*Действует до 3 ноября/);
  assert.doesNotMatch(await text(page, '.screen'), /7F3A9C21B/);
  await page.locator('[data-act=inv-drop]').click();
  await top(page).getByRole('button', { name: 'Отменить приглашение' }).click();
  await page.waitForFunction(() => !document.querySelector('#inv-open'));
  assert.equal(srv.db.invites.open.length, 0);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('ссылка-приглашение у нового человека: сразу «Создать аккаунт» с кодом, код убран из адреса; если уже вошли — подсказка', async () => {
  const { context, page, errors } = await openApp(env);
  await page.goto(`${env.url}#invite=7f3a9c21b4`);
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  assert.equal(await page.locator('#acc-invite').inputValue(), '7F3A9C21B4');
  assert.equal(await page.evaluate(() => location.hash), '', 'код убран из адресной строки');
  // ушли и вернулись (или перезапустили) — код помнится до регистрации
  await page.reload(); await page.waitForSelector('.screen');
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('[data-act=acc-mode][data-mode=signup]').first().click();
  assert.equal(await page.locator('#acc-invite').inputValue(), '7F3A9C21B4');
  assert.deepEqual(errors, []);
  await context.close();

  const b = await openApp(env);
  await ready(b.context, b.page, NEW);
  await b.page.goto(`${env.url}#invite=7F3A9C21B4`);
  await b.page.waitForSelector('.screen');
  await b.page.locator('.toast', { hasText: 'Вы уже вошли в аккаунт' }).waitFor();
  assert.equal(await b.page.locator('.screen[data-page=account]').count(), 0);
  await b.context.close();
});

test('засчитанные приглашения: число запоминается в телефоне, «Наставник», ступень «Напарник» открыта; вещь за 5 — только примерка', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, { ...NEW, invites: { open: [], joined: 2, counted: 1 } });
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.invited?.n === 1);
  assert.deepEqual((await profileOf(page)).invited, { n: 1, days: ['2026-10-20'] });
  await tab(page, 'profile');
  assert.equal((await text(page, '#inv-entry')).trim(), 'Пригласить коллег');
  await page.locator('#inv-entry').click();
  await page.waitForSelector('#inv-tiers');
  assert.match(await text(page, '#inv-sum'), /Засчитано[\s\S]*1[\s\S]*Ещё не засчитаны[\s\S]*1/);
  assert.match(await page.locator('.inv-tier[data-n="1"]').getAttribute('class'), /got/);
  assert.match(await text(page, '.inv-tier[data-n="1"]'), /Открыто/);
  assert.match(await text(page, '.inv-tier[data-n="1"]'), /Напарник[\s\S]*Фон «Прожектор»/);
  assert.match(await text(page, '.inv-tier[data-n="3"]'), /Сменщик · 3 приглашения[\s\S]*Кожанка машиниста[\s\S]*ещё 2 приглашения/);
  assert.match(await text(page, '.inv-tier[data-n="5"]'), /ещё 4 приглашения/);
  // награда «Наставник», бронза
  await page.locator('[data-act=back]').click();
  await page.locator('#pr-awards .aw-strip').click();
  await page.waitForSelector('.aw-grid');
  assert.doesNotMatch(await page.locator('.aw[data-id=mentor]').getAttribute('class'), /locked/);
  // фон за 1 — уже открыт (без значка), кожанка за 3 — значок «За 3»; ушанка за 5 — сохранить нельзя, примерить можно
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=av-open]').first().click();
  await page.waitForSelector('.screen[data-page=avatar]');
  await page.locator('[data-act=av-group][data-g=bg]').click();
  await page.locator('.av-tile[data-k=bg][data-v=beam]').waitFor();
  assert.doesNotMatch(await page.locator('.av-tile[data-k=bg][data-v=beam]').innerText(), /За \d/);
  await page.locator('[data-act=av-group][data-g=wear]').click();
  await page.locator('.av-tile[data-k=outfit][data-v=leather]').waitFor();
  assert.match(await page.locator('.av-tile[data-k=outfit][data-v=leather]').innerText(), /За 3[\s\S]*Кожанка/);
  await page.locator('[data-act=av-group][data-g=acc]').click();
  const t = page.locator('.av-tile[data-k=hat][data-v=ushanka]');
  await t.waitFor();
  assert.match(await t.innerText(), /За 5[\s\S]*Ушанка/);
  assert.match(await t.getAttribute('aria-label'), /за 5 приглашений/);
  await t.click();
  await page.locator('.av-try', { hasText: 'Ушанка (за 5)' }).waitFor();
  await page.locator('[data-act=av-save]').click();
  const d = top(page);
  assert.match(await d.innerText(), /Пока только примерка[\s\S]*Ушанка — за 5 приглашений[\s\S]*Сейчас засчитано: 1/);
  await d.getByRole('button', { name: 'Снять и сохранить' }).click();
  await page.waitForFunction(async () => { const p = (await import('./js/store.js')).S.profile; return p.avatar && p.avatar.hat === null; });
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('засчитано 5 — ушанку можно сохранить без Премиума; коллегам уходит; меньше с сервера — не отбираем', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { ...NEW, invites: { open: [], joined: 5, counted: 5 } });
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.invited?.n === 5);
  await tab(page, 'profile');
  await page.locator('[data-act=av-open]').first().click();
  await page.locator('[data-act=av-group][data-g=acc]').click();
  const t = page.locator('.av-tile[data-k=hat][data-v=ushanka]');
  assert.doesNotMatch(await t.innerText(), /За 5/);
  await t.click();
  assert.equal(await page.locator('.av-try').count(), 0);
  await page.locator('[data-act=av-save]').click();
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.avatar?.hat === 'ushanka');
  // коллега удалил аккаунт — сервер считает 4, а открытое остаётся
  srv.db.invites.counted = 4;
  await page.evaluate(async () => (await import('./js/invites.js')).loadInvites({ force: true }));
  assert.equal((await profileOf(page)).invited.n, 5);
  assert.equal((await profileOf(page)).avatar.hat, 'ushanka');
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('«Предложить идею»: без аккаунта — объяснение; с аккаунтом — отправить, ответ, стереть; предупреждение о служебном; лимит', async () => {
  const a = await openApp(env);
  await tab(a.page, 'extra');
  await a.page.locator('#extra-ideas').click();
  await a.page.waitForSelector('.screen[data-page=ideas]');
  assert.match(await text(a.page, '.screen'), /Идеи — с аккаунтом[\s\S]*Настройки аккаунта/);
  assert.equal(await a.page.locator('#idea-text').count(), 0);
  assert.deepEqual(a.errors, []);
  await a.context.close();

  const { context, page, errors } = await openApp(env, { awards: true });
  const srv = await ready(context, page, { ...NEW, ideas: [{ id: 'aaaaaaaa-0000-4000-8000-999999999999', body: 'Тёмная тема для квитка', state: 'accepted', created_at: '2026-10-18T09:00:00Z', answered_at: '2026-10-19T09:00:00Z' }] });
  await drainAwards(page); // «Свой человек» за аккаунт
  await tab(page, 'extra');
  await page.locator('#extra-ideas').click();
  await page.locator('#idea-list').waitFor();
  assert.match(await text(page, '#idea-list'), /Тёмная тема для квитка[\s\S]*18 октября · Принята/);
  await page.waitForFunction(async () => (await import('./js/store.js')).S.profile.ideas?.n === 1);
  assert.match(await drainAwards(page), /Идейный[\s\S]*Бронза/, 'за принятую идею — поздравление');
  assert.match(await text(page, '.screen'), /Не пишите имена, телефоны, номера поездов и служебную информацию/);
  await page.locator('#idea-text').fill('Напоминание   за час до конца отдыха');
  assert.match(await text(page, '#idea-count'), /36 \/ 500/);
  await page.locator('#idea-send').click();
  await page.locator('.toast', { hasText: 'Спасибо! Идея отправлена' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#idea-list .idea').length === 2);
  assert.equal(srv.calls('send_idea')[0].body.p_body, 'Напоминание за час до конца отдыха', 'лишние пробелы убраны ещё в телефоне');
  assert.equal('p_reply' in srv.calls('send_idea')[0].body, false, 'без галочки — как раньше, только текст');
  assert.equal(await page.locator('#idea-text').inputValue(), '');
  assert.match(await text(page, '#idea-list .idea:first-child'), /Напоминание за час до конца отдыха[\s\S]*На рассмотрении/);
  // пусто — не отправляем
  await page.locator('#idea-send').click();
  await page.locator('.toast', { hasText: 'несколько слов' }).waitFor();
  // стереть
  await page.locator('#idea-list .idea:first-child [data-act=idea-del]').click();
  await top(page).getByRole('button', { name: 'Стереть' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#idea-list .idea').length === 1);
  // не больше 5 в день
  for (let i = 0; i < 5; i++) {
    await page.locator('#idea-text').fill(`Идея номер ${i + 2}`);
    await page.locator('#idea-send').click();
    await page.waitForTimeout(150);
  }
  await page.locator('.toast', { hasText: 'не больше 5 в день' }).waitFor();
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('администратор: «Идеи пользователей» без автора, «Принять» / «Не подошла»; статистика с приглашениями', async () => {
  const { context, page, errors } = await openApp(env);
  const srv = await ready(context, page, { ...NEW, role: 'admin', ideas: [{ id: 'aaaaaaaa-0000-4000-8000-000000000777', body: 'Ночные часы на главной <b>жирно</b>', state: 'new', created_at: '2026-10-19T09:00:00Z', answered_at: null }] });
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('.screen [data-page=account]').click();
  await page.locator('[data-act=acc-ideas]').click();
  const s = top(page);
  await s.locator('.idea').waitFor();
  assert.match(await s.innerText(), /Новых: 1[\s\S]*Ночные часы на главной <b>жирно<\/b>/);
  assert.equal(await s.locator('.idea b').count(), 0, 'текст идеи экранирован');
  await s.getByRole('button', { name: 'Принять' }).click();
  await page.locator('.toast', { hasText: 'Идея принята' }).waitFor();
  assert.equal(srv.db.ideas[0].state, 'accepted');
  assert.match(await s.innerText(), /Новых: 0[\s\S]*Принята/);
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});

test('плашка для гостя: с 3 поездок; зовёт наградами; «Зарегистрироваться» — сразу форма; «Не сейчас»; «Больше не показывать»', async () => {
  const { context, page, errors } = await openApp(env, { guest: true });
  await seed(page, { trips: trips(2) });
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('#signup-nag').count(), 0, 'мало поездок — не показываем');
  await seed(page, { trips: trips(4).slice(2) });
  await tab(page, 'profile'); await tab(page, 'home');
  await page.locator('#signup-nag').waitFor();
  // с 2.26: награды уже есть («Первая поездка» и др.) — зовём ими
  assert.match(await text(page, '#signup-nag'), /У вас уже \d+ наград[аы]?[\s\S]*жд(ёт|ут) вас в аккаунте[\s\S]*поездки остаются в телефоне/);
  assert.ok(await fits(page));
  await page.locator('[data-act=nag-signup]').click();
  await page.waitForSelector('.screen[data-page=account] #acc-invite');
  assert.match(await text(page, '.screen'), SIGNUP_OPEN ? /Код приглашения · если есть/ : /Код приглашения[\s\S]*только по приглашению/);
  await page.locator('[data-act=back]').click();
  await page.locator('[data-act=nag-snooze]').click();
  await page.waitForFunction(() => !document.querySelector('#signup-nag'));
  await page.reload(); await page.waitForSelector('.screen');
  assert.equal(await page.locator('#signup-nag').count(), 0, '«Не сейчас» — на месяц');
  // через месяц — снова; «Больше не показывать»
  await page.clock.setFixedTime(new Date('2026-11-25T12:00:00+03:00'));
  await page.reload(); await page.waitForSelector('.screen');
  // напоминание о резервной копии важнее: пока оно на экране, плашки нет
  assert.match(await text(page, '.screen'), /не сохраняли резервную копию/);
  assert.equal(await page.locator('#signup-nag').count(), 0);
  await page.locator('[data-act=nag-later]').click();
  await page.locator('#signup-nag').waitFor();
  await page.locator('[data-act=nag-off]').click();
  await page.waitForFunction(() => !document.querySelector('#signup-nag'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('320 px и светлая тема: «Пригласить коллег», окно приглашения, «Предложить идею», плашка; ничего не вылезает', async () => {
  const { context, page, errors } = await openApp(env);
  await ready(context, page, { ...NEW, invites: { open: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', created_at: '2026-10-19T09:00:00Z', expires_at: '2026-11-02T09:00:00Z' }], joined: 3, counted: 2 },
    ideas: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', body: 'Очень длинная идея без пробелов: ' + 'ш'.repeat(120), state: 'declined', created_at: '2026-10-18T09:00:00Z', answered_at: null }] });
  await page.setViewportSize({ width: 320, height: 700 });
  for (const theme of ['dark', 'light']) {
    await page.evaluate(async (t) => { const s = await import('./js/store.js'); await s.saveSettings({ theme: t }); document.documentElement.setAttribute('data-theme', t); }, theme);
    await tab(page, 'profile');
    await page.locator('#inv-entry').click();
    await page.locator('#inv-open').waitFor();
    assert.ok(await fits(page), `приглашения, ${theme}`);
    const btn = await box(page.locator('[data-act=inv-drop]').first());
    assert.ok(btn.x + btn.width <= 320, 'кнопка «Отменить» в ширину экрана');
    await page.locator('#inv-new').click();
    await page.locator('#inv-qr svg').waitFor({ timeout: 5000 });
    assert.ok(await fits(page), `окно приглашения, ${theme}`);
    await page.locator('#layers .layer:not(.closing) .scrim').last().click({ position: { x: 5, y: 5 } });
    await waitNoLayers(page);
    await tab(page, 'extra');
    await page.locator('#extra-ideas').click();
    await page.locator('#idea-list').waitFor();
    assert.ok(await fits(page), `идеи, ${theme}`);
    const send = await box(page.locator('#idea-send'));
    assert.ok(send.height >= 44, 'крупная кнопка');
  }
  assert.deepEqual(realErrors(errors), []);
  await context.close();
});
