// Рисунки наград (2.21.8): картинки в icons/awards/, у каждой ступени — своя или общая; все в офлайн-кэше, лишних нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { AWARDS, awardArt, awardImg } from '../../js/awards.js';

const root = new URL('../../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('рисунки наград: файл есть для каждой ступени, лежит в SHELL, не тяжёлый', () => {
  const used = new Set();
  for (const a of AWARDS) {
    if (Array.isArray(a.art)) assert.equal(a.art.length, a.goals.length, `${a.id}: картинка на каждую ступень`);
    for (let i = 0; i < a.goals.length; i++) {
      const p = awardImg(a, i);
      used.add(p);
      assert.ok(existsSync(new URL(p, root)), `${a.id}: нет файла ${p}`);
      assert.ok(shell.includes(p), `${p} нет в SHELL (sw.js) — без интернета медаль будет пустой`);
      assert.ok(statSync(new URL(p, root)).size < 40 * 1024, `${p} больше 40 КБ`);
    }
  }
  const files = readdirSync(new URL('icons/awards/', root)).map((f) => `icons/awards/${f}`);
  assert.deepEqual(files.filter((f) => !used.has(f)), [], 'лишние картинки в icons/awards/');
  assert.equal(used.size, 23);
});

test('медаль: кольцо и цвет ступени рисуем сами, внутри — картинка ступени', () => {
  const trips = AWARDS.find((a) => a.id === 'trips');
  assert.match(awardArt('trips', 64, 1), /fill="#b8733d"[\s\S]*href="icons\/awards\/s50\.webp"/);
  assert.match(awardArt('trips', 64, 3), /fill="#e6b325"[\s\S]*href="icons\/awards\/s1000\.webp"/);
  assert.match(awardArt('owl', 64, 2), /fill="#9ea9b5"[\s\S]*href="icons\/awards\/owl\.webp"/);
  assert.match(awardArt('account', 64, 1), /href="icons\/awards\/account\.webp"/);
  assert.match(awardArt('pass', 64, 1), /href="icons\/awards\/pass\.webp"/);
  assert.equal(awardArt('trips', 64, 0), awardArt('trips', 64, 1), 'не полученная — как первая ступень (тёмной её делает CSS)');
  assert.ok(trips);
});
