// CABINA 2.32.1: награда «Своя бригада» за созданную группу, вещи за приглашения (ушанка за 3, кожанка за 5). Данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { computeAwards, grantGroupAward, awardArt, awardImg, AWARDS } from '../../js/awards.js';
import * as A from '../../js/avatar.js';

beforeEach(() => { S.trips = []; S.routes = []; S.profile = { id: 'profile' }; });

test('«Своя бригада»: особая, одна ступень, без «×N», свой рисунок', () => {
  const a = AWARDS.find((x) => x.id === 'group');
  assert.ok(a);
  assert.equal(a.g, 'special');
  assert.deepEqual(a.goals, [1]);
  assert.equal(a.repeat, undefined);
  assert.equal(awardImg(a), 'icons/awards/group.webp');
  assert.match(awardArt('group', 64, 1), /group\.webp/);
});

test('«Своя бригада» считается только по дню в телефоне; мусор из копии не принимается', () => {
  assert.equal(computeAwards().aw.group.tier, 0);
  S.profile.groupAward = '2026-11-12';
  assert.equal(computeAwards().aw.group.tier, 1);
  assert.deepEqual(computeAwards().aw.group.days, ['2026-11-12']);
  for (const bad of ['<b>x</b>', '12.11.2026', 1, true]) { S.profile.groupAward = bad; assert.equal(computeAwards().aw.group.tier, 0, String(bad)); }
});

test('«Своя бригада» выдаётся один раз и только с правильной датой', async () => {
  S.profile.groupAward = '2026-11-10';
  assert.equal(await grantGroupAward('2026-11-12'), false);
  assert.equal(S.profile.groupAward, '2026-11-10');
  S.profile = { id: 'profile' };
  assert.equal(await grantGroupAward('сегодня'), false);
  assert.equal(S.profile.groupAward, undefined);
});

test('ушанка — за 3 приглашения, кожанка — за 5; администратор (большое число) надевает всё', () => {
  const worn = { sex: 'm', outfit: 'leather', hat: 'ushanka', bg: 'beam' };
  const n3 = A.normalizeAvatar(worn, { invited: 3 });
  assert.equal(n3.hat, 'ushanka'); assert.equal(n3.outfit, 'vestO');
  const n5 = A.normalizeAvatar(worn, { invited: 5 });
  assert.equal(n5.outfit, 'leather');
  const all = A.normalizeAvatar({ ...worn, outfit: 'kitel', hat: 'retro' }, { premium: true, invited: 1000 });
  assert.equal(all.outfit, 'kitel'); assert.equal(all.hat, 'retro'); assert.equal(all.bg, 'beam');
});
