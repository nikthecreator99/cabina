// CABINA 2.19.2: QR-код и ссылка напарнику действуют сутки; анимация обновления по умолчанию — светофор.
// Все данные выдуманные.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../js/store.js';
import { parseLocal, MIN } from '../../js/calc.js';
import { encodeTrips, decodeShare, SHARE_TTL_MIN } from '../../js/share.js';
import { pullStyle, PULL_STYLES } from '../../js/pull.js';

const NOW = parseLocal('2026-10-20T12:00');
const ABS = Date.UTC(2026, 9, 20, 9, 0); // то же «сейчас» по UTC (Москва +3)
const H = 60 * MIN;
const T = (id, start, end) => ({ id, start, end, passenger: [], waiting: [], restType: 'turnaround', routeId: null, routeLabel: 'Сосновка → Ольховка', locoType: '2ТЭ116', locoNumber: '1234' });
const enc = (obj) => `j${Buffer.from(JSON.stringify(obj)).toString('base64url')}`;
const unz = async (code) => {
  const bytes = Buffer.from(code.slice(1), 'base64url');
  if (code[0] === 'j') return JSON.parse(bytes.toString());
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  return JSON.parse(out);
};

beforeEach(() => { S.trips = []; S.routes = []; });

test('код действует сутки: в срок — читается, через сутки и минуту — «срок истёк»', async () => {
  assert.equal(SHARE_TTL_MIN, 24 * 60);
  const code = await encodeTrips([T('a', '2026-10-14T06:00', '2026-10-14T15:30')], ABS);
  const data = await unz(code);
  assert.equal(data.v, 2);
  assert.equal(data.e, Math.round(ABS / MIN) + 24 * 60, 'срок — в минутах по UTC, ровно сутки');
  assert.equal((await decodeShare(code, NOW, ABS)).items.length, 1, 'сразу');
  assert.equal((await decodeShare(code, NOW, ABS + 23 * H + 59 * MIN)).items.length, 1, 'через 23 ч 59 мин');
  await assert.rejects(decodeShare(code, NOW, ABS + 24 * H + MIN), /Срок кода истёк[\s\S]*сутки[\s\S]*поделиться ещё раз/);
  await assert.rejects(decodeShare(code, NOW, ABS + 30 * 24 * H), /Срок кода истёк/);
});

test('код без срока (2.19.0–2.19.1), со сбитым или подделанным сроком — не принимается', async () => {
  const base = Math.round(parseLocal('2026-10-14T06:00') / MIN);
  const now = Math.round(ABS / MIN);
  const t = [{ a: 0, d: 600 }];
  await assert.rejects(decodeShare(enc({ v: 1, b: base, t }), NOW, ABS), /прежней версии CABINA[\s\S]*обновить/);
  await assert.rejects(decodeShare(enc({ v: 2, b: base, t }), NOW, ABS), /повреждена/, 'нет срока');
  await assert.rejects(decodeShare(enc({ v: 2, b: base, e: 'завтра', t }), NOW, ABS), /повреждена/);
  await assert.rejects(decodeShare(enc({ v: 2, b: base, e: now + 1.5, t }), NOW, ABS), /повреждена/);
  await assert.rejects(decodeShare(enc({ v: 2, b: base, e: now + 3 * 24 * 60, t }), NOW, ABS), /неверный срок/, 'срок на трое суток вперёд');
  // часы у напарника спешат меньше чем на сутки — код читается
  assert.equal((await decodeShare(enc({ v: 2, b: base, e: now + 47 * 60, t }), NOW, ABS)).items.length, 1);
});

test('анимация обновления: по умолчанию и для чужого значения — светофор, свой выбор остаётся', () => {
  assert.equal(PULL_STYLES[0].id, 'light');
  assert.equal(pullStyle(undefined), 'light');
  assert.equal(pullStyle(''), 'light');
  assert.equal(pullStyle('<b>x</b>'), 'light');
  for (const s of ['spin', 'train', 'wheel', 'light']) assert.equal(pullStyle(s), s);
});
