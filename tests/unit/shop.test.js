import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAvatar, premiumParts } from '../../js/avatar.js';
import { policyHtml, consentHtml } from '../../js/legal.js';

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
});

test('политика для магазина — тот же текст, что в приложении, страницы магазина под CSP', () => {
  const privacy = read('data/shop-privacy.html');
  assert.ok(privacy.includes('src="../js/shop-privacy.js"'));
  assert.ok(read('js/shop-privacy.js').includes("import { policyHtml } from './legal.js'"));
  const csp = html => html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
  for (const page of [privacy, read('data/shop.html')]) {
    assert.match(csp(page), /script-src 'self';/);
    assert.match(csp(page), /object-src 'none'/);
  }
  // форма оплаты уходит только в Робокассу
  assert.match(csp(read('data/shop.html')), /form-action https:\/\/auth\.robokassa\.ru$/);
  assert.match(csp(privacy), /form-action 'none'/);
});

test('покупки: в политике названы основание и Робокасса, согласие на аккаунт не изменено', () => {
  const policy = policyHtml();
  assert.match(policy, /<b>6\. Передача\.<\/b>[^<]*ООО «РОБОКАССА» при оплате покупки/);
  assert.match(policy, /исполнение договора[^<]*п\. 5 ч\. 1 ст\. 6 152-ФЗ/);
  // согласие privacy-6 — прежний текст: про покупки в нём ничего нет, ссылки «описанной выше» тоже
  assert.doesNotMatch(consentHtml(), /покупк/i);
  assert.match(consentHtml(), /Передача третьим лицам не производится, кроме случаев, прямо предусмотренных законом\./);
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
