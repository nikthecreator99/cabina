// Браузерные проверки защиты: подменённая резервная копия, чужой код на странице, файлы-страницы в документах.
// Все данные — выдуманные.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openApp, seed, text } from './helpers.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.stop(); });

const tab = (page, name) => page.locator(`.tab[data-tab=${name}]`).click();
const EVIL = 'x"><img src=x onerror="window.__pwned=1">';

test('подменённая резервная копия не восстанавливается, текущие данные целы', async () => {
  const { context, page, errors } = await openApp(env);
  await seed(page, { trips: [{ id: 'a', start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  const evil = { app: 'CABINA', format: 2, withDocs: false, data: {
    trips: [{ id: EVIL, start: '2026-10-02T08:00', end: '2026-10-02T16:00', passenger: [], restType: 'turnaround' }],
    absences: [], routes: [], notes: [], meta: [] } };
  await tab(page, 'profile');
  await page.locator('.screen [data-page=settings]').click();
  await page.locator('#bk-import').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
  await page.waitForFunction(() => document.querySelector('.toast-wrap')?.innerText.includes('повреждён или изменён вручную'));
  assert.equal(await page.locator('#layers .layer').count(), 0, 'вопроса «Восстановить?» нет');
  await tab(page, 'home');
  assert.equal(await page.locator('.trip').count(), 1);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});

test('даже если опасная запись попала в телефон, её код не выполняется', async () => {
  const { context, page } = await openApp(env);
  const violations = [];
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) violations.push(m.text()); });
  await seed(page, { trips: [{ id: EVIL, start: '2026-10-14T08:00', end: '2026-10-14T12:00' }] });
  await page.locator('.trip').first().waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('.trip img').count(), 0, 'id выведен как текст атрибута, а не как разметка');
  // и сама страница запрещает вписанный код и запросы на сторонние сайты
  const blocked = await page.evaluate(async () => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:," onerror="window.__inline=1">';
    document.body.append(d);
    let net = 'ok';
    try { await fetch('https://example.org/'); } catch { net = 'blocked'; }
    await new Promise((r) => setTimeout(r, 200));
    d.remove();
    return { inline: window.__inline, net };
  });
  assert.deepEqual(blocked, { inline: undefined, net: 'blocked' });
  assert.ok(violations.length >= 1, 'браузер сообщил о нарушении правил страницы');
  await context.close();
});

test('документы: файл-страницу нельзя открыть внутри CABINA, только скачать; PDF открывается', async () => {
  const { context, page, errors } = await openApp(env);
  await tab(page, 'extra');
  await page.locator('[data-act=extra-docs]').click();
  await page.locator('#doc-upload').setInputFiles([
    { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<script>opener.__pwned=1</script>') },
    { name: 'Схема.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('[data-act=doc-open]').length === 2);
  const open = async (name) => {
    await page.locator('[data-act=doc-open]').filter({ hasText: name }).click();
    await page.locator('#layers .layer').last().getByText('Открыть', { exact: true }).click();
  };
  const [dl] = await Promise.all([page.waitForEvent('download'), open('page.html')]);
  assert.equal(dl.suggestedFilename(), 'page.html');
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  const [popup] = await Promise.all([page.waitForEvent('popup'), open('Схема.pdf')]);
  assert.ok(popup, 'PDF открылся в новой вкладке');
  await popup.close();
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.deepEqual(errors, []);
  await context.close();
});
