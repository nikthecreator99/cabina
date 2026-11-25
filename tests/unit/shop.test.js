import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAvatar, premiumParts } from '../../js/avatar.js';
import { policyHtml } from '../../js/legal.js';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('цены публичной витрины совпадают с серверным каталогом', () => {
  const html = read('data/shop.html');
  const catalog = JSON.parse(read('data/shop-catalog.json'));
  assert.equal(Object.keys(catalog).length, 7);
  for (const [sku, item] of Object.entries(catalog)) {
    const article = html.split('data-sku="' + sku + '">')[1].split('</article>')[0];
    assert.ok(article.includes('<strong>' + item.price + ' ₽</strong>'));
    assert.ok(article.includes(item.name));
  }
  assert.ok(read('data/shop-privacy.html').includes(policyHtml()));
});

test('покупка мазута и фуражки даёт независимые права', () => {
  const source = {hat:'peaked', mazut:true};
  for (const owned of [[], ['peaked'], ['mazut'], ['peaked','mazut']]) {
    const avatar = normalizeAvatar(source, {owned});
    assert.equal(avatar.mazut, owned.includes('mazut'));
    assert.equal(avatar.hat === 'peaked', owned.includes('peaked'));
    assert.equal(premiumParts(source, owned).length, 2 - owned.length);
  }
});
