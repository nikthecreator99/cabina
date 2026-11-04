// CABINA 2.21: вещи за приглашения не открывает Премиум, вид отдыха обязателен сразу после поездки,
// порядок «Ещё», окончание выходного руками, скелет без подглазников. Данные выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { S, EXTRA_KEYS, extraOrder } = await import('../../js/store.js');
const A = await import('../../js/avatar.js');
const { restRequired, REST_REQUIRED_MIN } = await import('../../js/rest.js');
const { dayOffEditError, DAYOFF_MAX_MIN } = await import('../../js/forms.js');

const MIN = 60000;

test('вещи за приглашения: Премиум их не открывает, открывают только засчитанные приглашения', () => {
  const worn = { sex: 'm', outfit: 'leather', hat: 'ushanka', bg: 'beam' };
  const prem0 = A.normalizeAvatar(worn, { premium: true, invited: 0 });
  assert.equal(prem0.outfit, 'vestO');
  assert.equal(prem0.hat, null);
  assert.equal(prem0.bg, 'mist');
  const prem3 = A.normalizeAvatar(worn, { premium: true, invited: 3 });
  assert.equal(prem3.outfit, 'leather');
  assert.equal(prem3.bg, 'beam');
  assert.equal(prem3.hat, null, 'ушанка — за 5');
  const free5 = A.normalizeAvatar(worn, { premium: false, invited: 5 });
  assert.equal(free5.hat, 'ushanka');
  // без invited и с premium — «нарисовать как есть»: примерка в редакторе и карточка коллеги
  assert.equal(A.normalizeAvatar(worn, { premium: true }).outfit, 'leather');
  // без Премиума и без числа — вещи снимаются
  assert.equal(A.normalizeAvatar(worn).outfit, 'vestO');
  // премиум-детали по-прежнему остаются у Премиума
  assert.equal(A.normalizeAvatar({ sex: 'robot', hat: 'peaked' }, { premium: true, invited: 0 }).sex, 'robot');
});

test('скелет: у глаз «Уставшие» больше нет подглазников', () => {
  const svg = A.avatarSvg({ sex: 'skeleton', sEyes: 'tired' }, { size: 120 });
  assert.doesNotMatch(svg, /#8b7aa8/);
  assert.match(svg, /<svg/);
});

test('вид отдыха обязателен: только кто делится статусом и не позже 2 ч после окончания', () => {
  const end = Date.UTC(2026, 9, 20, 10, 0);
  assert.equal(REST_REQUIRED_MIN, 120);
  assert.equal(restRequired(end, end + 5 * MIN, true), true);
  assert.equal(restRequired(end, end + 120 * MIN, true), true);
  assert.equal(restRequired(end, end + 121 * MIN, true), false, 'вносит позже — не обязателен');
  assert.equal(restRequired(end, end - 30 * MIN, true), true, 'окончание ещё впереди');
  assert.equal(restRequired(end, end + 5 * MIN, false), false, 'не делится статусом — не обязателен');
  assert.equal(restRequired(NaN, end, true), false);
});

test('«Ещё»: порядок — сохранённый, новые пункты в конце, чужое отбрасывается', () => {
  assert.deepEqual(extraOrder(undefined), EXTRA_KEYS);
  assert.deepEqual(extraOrder(['help', 'phones']), ['help', 'phones', 'notes', 'docs', 'fix', 'ideas']);
  assert.deepEqual(extraOrder(['fix', '<img>', 'fix', 7, 'notes']), ['fix', 'notes', 'docs', 'phones', 'help', 'ideas']);
  assert.deepEqual(extraOrder('notes'), EXTRA_KEYS);
  S.settings = { extraOrder: ['ideas'] };
  assert.equal(extraOrder()[0], 'ideas');
});

test('окончание выходного: после поездки и не дольше двух недель', () => {
  const end = Date.UTC(2026, 9, 20, 10, 0);
  assert.equal(dayOffEditError(end, end + 60 * 60 * MIN), null);
  assert.match(dayOffEditError(end, end), /после окончания поездки/);
  assert.match(dayOffEditError(end, end - MIN), /после окончания поездки/);
  assert.match(dayOffEditError(end, end + (DAYOFF_MAX_MIN + 1) * MIN), /двух недель/);
  assert.match(dayOffEditError(end, NaN), /Укажите/);
});
