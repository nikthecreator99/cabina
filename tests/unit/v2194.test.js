// CABINA 2.19.4: награда «Свой человек» за аккаунт. Хранится только день в профиле телефона. Данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { computeAwards, grantAccountAward, awardArt, AWARDS, AWARD_GROUPS, MEDALS_TOTAL } from '../../js/awards.js';

beforeEach(() => { S.trips = []; S.routes = []; S.profile = { id: 'profile' }; });

test('«Свой человек»: особая награда в группе «Особые», одна ступень; всего наград — 40 (с 2.20: «Наставник» и «Идейный», с 2.30 — «Полезный совет»)', () => {
  const a = AWARDS.find((x) => x.id === 'account');
  assert.ok(a);
  assert.equal(a.name, 'Свой человек');
  assert.deepEqual(a.goals, [1]);
  assert.equal(a.repeat, undefined, 'не повторяется — без «×N»');
  assert.ok(AWARD_GROUPS.some(([g, t]) => g === a.g && t === 'Особые'));
  assert.equal(MEDALS_TOTAL, 41); // с 2.32.1 — «Своя бригада»
  assert.match(awardArt('account', 64, 1), /<svg/);
});

test('считается только по отметке в телефоне; без поездок тоже; чужая строка из копии не принимается', () => {
  assert.equal(computeAwards().aw.account.tier, 0);
  S.profile.accountAward = '2026-10-31';
  const { aw, c } = computeAwards();
  assert.equal(aw.account.tier, 1);
  assert.deepEqual(aw.account.days, ['2026-10-31']);
  assert.equal(c.account, 1);
  for (const bad of ['<img src=x onerror=alert(1)>', '31.10.2026', 20261031, true, '2026-10-31T00:00']) {
    S.profile.accountAward = bad;
    assert.equal(computeAwards().aw.account.tier, 0, String(bad));
  }
});

test('выдаётся один раз и только с правильной датой', async () => {
  S.profile.accountAward = '2026-10-30';
  assert.equal(await grantAccountAward('2026-10-31'), false, 'уже есть — дата не меняется');
  assert.equal(S.profile.accountAward, '2026-10-30');
  S.profile = { id: 'profile' };
  assert.equal(await grantAccountAward('вчера'), false);
  assert.equal(await grantAccountAward(undefined), false);
  assert.equal(S.profile.accountAward, undefined);
});
