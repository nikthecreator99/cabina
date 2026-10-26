// Защита от подменённых резервных копий и чужого кода на странице. Все данные — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { backupSafe, safeMime } from '../../js/backup.js';

const good = {
  trips: [{ id: 'id-k1x2', routeId: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', start: '2026-10-02T08:00', end: '2026-10-02T16:00',
    passenger: [{ id: 'p1', start: '2026-10-02T06:00', end: '2026-10-02T08:00' }], waiting: [], homeRest: { ids: ['id-k1x2'] } }],
  absences: [{ id: 'a1', type: 'sick', start: '2026-10-05', end: '2026-10-14', monthHours: { '2026-10': 64 } }],
  routes: [{ id: '6f1c2a9e-0b7d-4c55-9a43-1e2f3a4b5c6d', from: 'Сосновка "Узловая" <1>', to: 'Ольховка' }],
  notes: [{ id: 'n1', tripId: null, text: '<b>не работает</b> ГВ' }],
  meta: [{ id: 'settings', houses: { 'Ольховка': { name: 'Ольховка', minRest: 300 } } }, { id: 'onboarded', value: true }],
  files: [{ id: 'f1', kind: 'file', parentId: null, name: 'Схема.pdf', mime: 'application/pdf' }],
  blobs: [{ id: 'f1', b64: '' }],
};

test('копия из CABINA проходит проверку, текст пользователя может быть любым', () => {
  assert.equal(backupSafe(good), true);
  assert.equal(backupSafe({ trips: [] }), true);
});

test('копия с опасными ссылками (id) не восстанавливается', () => {
  const bad = (patch) => backupSafe({ ...good, ...patch });
  assert.equal(bad({ trips: [{ ...good.trips[0], id: 'x"><img src=x onerror=alert(1)>' }] }), false);
  assert.equal(bad({ trips: [{ ...good.trips[0], routeId: 'a b' }] }), false);
  assert.equal(bad({ trips: [{ ...good.trips[0], passenger: [{ id: '"><svg onload=1>' }] }] }), false);
  assert.equal(bad({ trips: [{ ...good.trips[0], homeRest: { ids: ['<x>'] } }] }), false);
  assert.equal(bad({ files: [{ ...good.files[0], parentId: "'onfocus=1" }] }), false);
  assert.equal(bad({ notes: [{ id: 5, text: 'x' }] }), true, 'числовой id безопасен');
  assert.equal(bad({ notes: [{ text: 'без id' }] }), false);
  assert.equal(bad({ routes: 'не список' }), false);
});

test('тип файла документа из копии — только из простого списка', () => {
  assert.equal(safeMime('application/pdf'), 'application/pdf');
  assert.equal(safeMime('image/jpeg'), 'image/jpeg');
  assert.equal(safeMime('text/html'), 'application/octet-stream');
  assert.equal(safeMime('image/svg+xml'), 'application/octet-stream');
  assert.equal(safeMime(undefined), 'application/octet-stream');
});

test('страница запрещает чужие скрипты и обращения к сторонним сайтам', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'без unsafe-inline и unsafe-eval для скриптов');
  assert.match(csp, /connect-src 'self' https:\/\/api\.cabina-app\.ru;/, 'запросы — только к своему сайту и своему серверу аккаунтов в России');
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(html, /<script>/, 'скриптов внутри страницы нет');
  assert.doesNotMatch(html.replace("connect-src 'self' https://api.cabina-app.ru;", ''), /https?:\/\//, 'других внешних адресов нет');
});
