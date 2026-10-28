// Персонаж (2.12): каждая деталь рисуется, чужие и испорченные значения не попадают в рисунок,
// Премиум без разрешения снимается.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../js/avatar.js';

const LISTS = {
  head: A.HEADS, build: A.BUILDS, ears: A.EARS, eyes: A.EYES, brows: A.BROWS, nose: A.NOSES, mouth: A.MOUTHS,
  mous: A.MOUS, beard: A.BEARDS, outfit: A.OUTFITS, hat: A.HATS, glasses: A.GLASSES, earrings: A.EARRINGS, piercing: A.PIERCING, bg: A.BG,
};
const ok = (svg) => {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+"/);
  assert.ok(svg.endsWith('</svg>'));
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|null/);
  assert.doesNotMatch(svg, /<script|on\w+=|href|<image|<foreignObject/i);
};

test('персонаж: каждая деталь каждого списка рисуется без ошибок', () => {
  for (const sex of ['m', 'f']) {
    for (const [k, list] of Object.entries(LISTS)) for (const x of list) ok(A.avatarSvg({ sex, [k]: x.id }));
    for (const h of A.hairsOf(sex)) ok(A.avatarSvg({ sex, hair: h.id }));
    for (const h of A.hairsOf(sex)) for (const hat of A.HATS) ok(A.avatarSvg({ sex, hair: h.id, hat: hat.id }));
    for (const m of A.MARKS) ok(A.avatarSvg({ sex, marks: [m.id] }));
    for (const [k, arr] of [['skin', A.SKIN], ['hairC', A.HAIR_C], ['eyeC', A.EYE_C], ['outfitC', A.CLOTH_C], ['hatC', A.HAT_C], ['glassesC', A.FRAME_C], ['lips', A.LIP_C]]) {
      arr.forEach((_, i) => ok(A.avatarSvg({ sex, [k]: i, hat: k === 'hatC' ? 'cap' : null, glasses: k === 'glassesC' ? 'round' : null, outfit: k === 'outfitC' ? 'tee' : 'vestO' })));
    }
    for (const age of [18, 30, 45, 55]) ok(A.avatarSvg({ sex, age }));
    for (const crop of ['full', 'wide', 'face', 'top', 'bust']) ok(A.avatarSvg({ sex }, { crop, bg: false }));
    for (const hat of [null, 'cap', 'helmet']) ok(A.avatarSvg({ sex, goggles: true, defenders: true, mazut: true, hat }));
  }
  A.HELMET_C.forEach((_, i) => ok(A.avatarSvg({ hat: 'helmet', hatC: i })));
  for (const b of A.BG) ok(A.bgSvg(b.id));
});

test('персонаж: случайные персонажи разные, без Премиума и всегда рисуются', () => {
  const rnd = A.rng(42);
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const a = A.randomAvatar(rnd);
    assert.deepEqual(A.premiumParts(a), []);
    assert.deepEqual(A.normalizeAvatar(a), a, 'случайный уже очищен');
    ok(A.avatarSvg(a));
    seen.add(JSON.stringify(a));
  }
  assert.equal(seen.size, 300);
  assert.equal(A.randomAvatar(A.rng(1), { sex: 'f' }).sex, 'f');
  assert.equal(A.randomAvatar(A.rng(1), { sex: 'f' }).beard, null);
});

test('персонаж: неизвестные и опасные значения заменяются значениями по умолчанию', () => {
  const evil = '"/><script>alert(1)</script>';
  const a = A.normalizeAvatar({
    sex: evil, age: 999, skin: evil, head: evil, faceW: 'x', build: { a: 1 }, eyes: evil, eyeC: -1, eyeS: Infinity,
    hair: evil, hairC: 1.5, beard: evil, mous: evil, beardC: evil, marks: [evil, 'mole', 'mole'], outfit: evil, outfitC: 99,
    hat: evil, hatC: evil, glasses: evil, glassesC: evil, goggles: 'yes', defenders: 1, earrings: evil, piercing: evil, mazut: 'true', bg: evil,
    extra: evil, __proto__: { polluted: true },
  });
  assert.equal(a.sex, 'm');
  assert.equal(a.age, 55);
  assert.equal(a.head, 'oval');
  assert.equal(a.skin, 3);
  assert.equal(a.eyeS, 1);
  assert.equal(a.faceW, 1);
  assert.equal(a.hair, 'short');
  assert.equal(a.beardC, null);
  assert.deepEqual(a.marks, ['mole']);
  assert.equal(a.goggles, false);
  assert.equal(a.mazut, false);
  assert.equal(a.bg, 'mist');
  assert.equal('extra' in a, false);
  assert.equal(a.polluted, undefined);
  assert.doesNotMatch(JSON.stringify(a), /script/);
  for (const bad of [null, undefined, 'строка', 5, [], [1, 2]]) assert.deepEqual(A.normalizeAvatar(bad), A.normalizeAvatar({}));
  const svg = A.avatarSvg({ hair: evil }, { size: evil, crop: evil, cls: evil });
  ok(svg);
  assert.match(svg, /viewBox="8 16 184 184"/);
  assert.match(svg, /width="200"/);
  assert.match(svg, / class="[\w -]*" /, 'класс — только буквы и цифры');
  // у женского персонажа бороды и усов не бывает
  const f = A.normalizeAvatar({ sex: 'f', beard: 'full', mous: 'classic', hair: 'bald' });
  assert.equal(f.beard, null);
  assert.equal(f.mous, null);
  assert.equal(f.hair, 'long');
});

test('персонаж: Премиум можно примерить, а без разрешения он снимается', () => {
  const tryOn = { hat: 'peaked', mazut: true, bg: 'depot' };
  assert.deepEqual(A.premiumParts(A.normalizeAvatar(tryOn, { premium: true })), ['фуражка', 'мазут', 'фон «Депо»']);
  const saved = A.normalizeAvatar(tryOn);
  assert.equal(saved.hat, null);
  assert.equal(saved.mazut, false);
  assert.equal(saved.bg, 'mist');
  assert.deepEqual(A.premiumParts(saved), []);
  assert.equal(A.normalizeAvatar({ bg: 'ocean' }).bg, 'mist');
  assert.equal(A.normalizeAvatar({ hat: 'helmet', bg: 'sunset' }).hat, 'helmet');
  // фуражка — с нейтральной эмблемой, без букв и надписей
  assert.doesNotMatch(A.avatarSvg(tryOn), /<text|РЖД|RZD/i);
});

test('персонаж: рисунок не зависит от порядка полей и одинаков при повторе', () => {
  const a = A.randomAvatar(A.rng(7));
  const b = Object.fromEntries(Object.entries(a).reverse());
  const strip = (s) => s.replace(/v\d+_/g, '');
  assert.equal(strip(A.avatarSvg(a)), strip(A.avatarSvg(b)));
});
