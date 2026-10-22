// Выпуск версии: номер версии, список изменений и офлайн-кэш согласованы между собой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const appVersion = read('js/app.js').match(/export const VERSION = '([\d.]+)'/)[1];
const sw = read('sw.js');
const swVersion = sw.match(/const VERSION = 'cabina-v([\d.]+)'/)[1];
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const changelog = JSON.parse(read('data/changelog.json'));

test('версия одинакова в app.js, sw.js и первой записи «Что нового»', () => {
  assert.equal(swVersion, appVersion, 'sw.js VERSION');
  assert.equal(changelog.versions[0].version, appVersion, 'data/changelog.json');
});

test('список «Что нового» заполнен и идёт от новых версий к старым', () => {
  const num = (v) => v.split('.').map(Number).reduce((s, x) => s * 1000 + x, 0);
  for (const v of changelog.versions) {
    assert.match(v.version, /^\d+\.\d+\.\d+$/);
    assert.match(v.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(v.items.length > 0, `пустой список у ${v.version}`);
  }
  for (let i = 1; i < changelog.versions.length; i++) {
    assert.ok(num(changelog.versions[i - 1].version) > num(changelog.versions[i].version), `порядок версий около ${changelog.versions[i].version}`);
  }
});

test('офлайн-кэш содержит все файлы приложения, и все они существуют', () => {
  for (const p of shell) if (p !== './') assert.ok(existsSync(new URL(p, root)), `нет файла ${p}`);
  for (const f of readdirSync(new URL('js/', root))) assert.ok(shell.includes(`js/${f}`), `js/${f} не добавлен в SHELL в sw.js`);
  assert.ok(shell.includes('css/app.css'));
  assert.ok(shell.includes('data/calendar.json'));
  assert.ok(!shell.includes('data/changelog.json'), 'список изменений всегда берётся с сервера');
});

test('календарь в data/calendar.json совпадает с встроенным', async () => {
  const cal = JSON.parse(read('data/calendar.json'));
  const src = read('js/calendar.js');
  for (const [y, v] of Object.entries(cal.years)) {
    for (const d of [...v.off, ...v.short, ...(v.work || [])]) assert.ok(src.includes(`'${d}'`), `${y}: дата ${d} есть в calendar.json, но нет в js/calendar.js`);
  }
});
