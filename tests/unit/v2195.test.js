// CABINA 2.19.5: раздел «Помощь» — частые вопросы, поиск, кнопки «Открыть». Только статичный текст.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HELP, helpCount, helpListHtml, renderHelp } from '../../js/help.js';

const src = (f) => readFileSync(new URL(`../../js/${f}`, import.meta.url), 'utf8');
const ALL = { account: true, signed: true };
const items = HELP.flatMap((g) => g.items);
const ids = (html) => [...html.matchAll(/data-id="([\w-]+)"/g)].map((m) => m[1]);

test('вопросы: уникальные id, есть вопрос и ответ, в ответах только <b>, без восклицаний и угроз', () => {
  assert.ok(helpCount() >= 30, `вопросов ${helpCount()}`);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'id не повторяются');
  for (const it of items) {
    assert.match(it.id, /^[a-z]+-[a-z]+$/);
    assert.ok(it.q.length > 5 && it.a.length > 20, it.id);
    const tags = [...it.a.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
    assert.ok(tags.every((t) => t === 'b'), `${it.id}: только <b> (${tags})`);
    assert.doesNotMatch(it.a, /!/, `${it.id}: без восклицаний`);
  }
});

test('кнопки «Открыть» ведут на существующие экраны, а элементы для прокрутки есть в коде этих экранов', () => {
  const app = src('app.js');
  const pages = app.match(/const PAGES = \{([^\n]+)\};/)[1];
  const code = ['app.js', 'work.js', 'stats.js', 'awards.js', 'account.js', 'colleagues.js'].map(src).join('\n');
  for (const it of items.filter((i) => i.open)) {
    const [label, page, focus] = it.open;
    assert.ok(label.length > 2, it.id);
    assert.ok(new RegExp(`(^|[ ,{'])${page}'?:`).test(pages), `${it.id}: экран «${page}» есть в PAGES`);
    if (focus) {
      const m = focus.match(/^#([\w-]+)$/) || focus.match(/^\[data-act=([\w-]+)\]$/);
      assert.ok(m, `${it.id}: простой селектор ${focus}`);
      const needle = focus.startsWith('#') ? `id="${m[1]}"` : `data-act="${m[1]}"`;
      assert.ok(code.includes(needle), `${it.id}: ${needle} есть в коде`);
    }
  }
});

test('без поиска — все группы; аккаунт: нет раздела — нет вопросов; не вошли — нет кнопок на экраны аккаунта', () => {
  const all = helpListHtml('', new Set(), ALL);
  assert.equal(ids(all).length, helpCount());
  assert.doesNotMatch(all, /<details[^>]* open/, 'без поиска всё свёрнуто');
  for (const g of HELP) assert.ok(all.includes(`<div class="group-title">${g.g}</div>`), g.g);

  const noAcc = helpListHtml('', new Set(), { account: false, signed: false });
  assert.doesNotMatch(noAcc, /Аккаунт и коллеги|data-page="account"|data-page="privacy"/);
  assert.equal(ids(noAcc).length, helpCount() - HELP.find((g) => g.need === 'account').items.length);

  const out = helpListHtml('', new Set(), { account: true, signed: false });
  assert.match(out, /Аккаунт и коллеги/);
  assert.match(out, /data-page="account"/, 'к «Настройкам аккаунта» можно и без входа — там вход');
  assert.doesNotMatch(out, /data-page="privacy"/, '«Приватность» — только после входа');
  assert.match(all, /data-page="privacy"/);
});

test('поиск: без учёта регистра и «ё», все слова; мало найденного — открыто; ничего — понятная подсказка', () => {
  const copy = ids(helpListHtml('КОПИЯ', new Set(), ALL));
  assert.ok(copy.includes('data-lost') && copy.includes('data-move'), String(copy));
  const heavy = helpListHtml('тяжелый поезд', new Set(), ALL);
  assert.deepEqual(ids(heavy), ['pay-heavy']);
  assert.match(heavy, /<details[^>]* open data-auto="1"/, 'один найденный ответ сразу открыт');
  assert.match(heavy, /<mark>/, 'совпадение подсвечено');
  // по ключевым словам тоже
  assert.ok(ids(helpListHtml('зарплата', new Set(), ALL)).includes('pay-approx'));
  assert.ok(ids(helpListHtml('пин', new Set(), ALL)).includes('data-lock'));
  // много найденного — свёрнуто, кроме открытых человеком
  const trips = helpListHtml('поездк', new Set(['trip-share']), ALL);
  assert.ok(ids(trips).length > 3);
  assert.deepEqual([...trips.matchAll(/data-id="([\w-]+)" open/g)].map((m) => m[1]), ['trip-share']);
  // три и меньше — открыты все
  const few = helpListHtml('копия', new Set(), ALL);
  assert.ok(ids(few).length <= 3);
  assert.equal([...few.matchAll(/ open data-auto/g)].length, ids(few).length);
  assert.match(helpListHtml('абракадабра', new Set(), ALL), /Ничего не нашлось/);
});

test('поисковая строка экранируется; на экране — честная строка о хранении и расчёте', () => {
  const html = renderHelp('"><img src=x onerror=alert(1)>', new Set(), ALL);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /value="&quot;&gt;&lt;img/);
  assert.match(html, /ориентировочные[\s\S]*только в этом телефоне/);
});
