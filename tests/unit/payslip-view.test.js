// 2.43: наглядный разбор листка — итог, «из чего сложилась», главные числа и сверка с поездками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, slipFacts, verdict, compareVerdict, verdictHtml, breakdownHtml, compareRowHtml, moneyHtml, plural } from '../../js/payslip-view.js';
import { compareTrips } from '../../js/payslip-compare.js';

const earn = (code, amount, hours, month = 'март') => ({kind: 'earnings', code, amount, hours, month});
// выдуманный листок: тариф, ночные, переработка, северные, суточные и перерасчёт с минусом
const sheet = {period: 'март 2026', worked: 180, norm: 168, rate: 200, gross: 60000,
  rows: [earn('004L', 30000, 150), earn('018L', 2000, 10), earn('023L', 2400, 30), earn('023Q', 100), earn('072L', 3000, 12),
    earn('026A', 12000), earn('027A', 8000), earn('349A', 2600), earn('004L', -100, -0.5, 'февраль'),
    {kind: 'deductions', code: '883A', amount: 7465}]};

test('из чего сложилась зарплата: группы по кодам, доли, минусы не рисуем', () => {
  const b = breakdown(sheet);
  assert.deepEqual(b.parts.map(p => p.key), ['work', 'night', 'over', 'north', 'comp']);
  assert.equal(b.parts[0].amount, 31900); // тариф и следование, минус перерасчёта
  assert.equal(b.parts.find(p => p.key === 'north').amount, 20000);
  assert.ok(Math.abs(b.parts.reduce((a, p) => a + p.share, 0) - 1) < 1e-9);
  const html = breakdownHtml(b, 60100);
  assert.match(html, /class="money"/);
  assert.match(html, /Перерасчёты/); // сумма групп не равна «Всего начислено»
  assert.equal(breakdownHtml({parts: [b.parts[0]], total: 1}, 1), '', 'одна группа — полосы нет');
});

test('главное за месяц: только то, что есть в листке', () => {
  const f = Object.fromEntries(slipFacts(sheet, {total: 45000}).map(x => [x.key, x]));
  assert.equal(f.worked.value, '180 ч');
  assert.match(f.worked.sub, /норма 168 ч · сверх нормы 12 ч/);
  assert.equal(f.hour.money, true);
  assert.equal(f.night.value, '30 ч');
  assert.match(f.north.sub, /^33 % начисленного$/);
  assert.match(f.tax.sub, /^12,4 % начисленного$/);
  assert.deepEqual(slipFacts({period: 'март 2026', rows: []}, null), []);
});

test('итог проверки одной фразой', () => {
  const st = s => ({status: s});
  assert.equal(verdict([], [st('ok'), st('ok')]).tone, 'ok');
  assert.match(verdict([], [st('ok'), st('ok')]).text, /Проверили 2 строки/);
  const warn = verdict([{code: '004L', status: 'diff'}], [st('ok'), st('approx'), st('none')]);
  assert.equal(warn.tone, 'warn', 'строки с кодом в checks не считаются дважды');
  assert.deepEqual(warn.counts, {ok: 1, approx: 1, diff: 0, none: 1});
  assert.equal(verdict([], [st('diff'), st('ok')]).title, 'Нашли расхождение');
  assert.equal(verdict([], [st('none')]).tone, 'none');
  const html = verdictHtml(warn);
  assert.match(html, /data-verdict="warn"/);
  assert.doesNotMatch(html, /Не сошлось/, 'нулевые строки легенды не показываем');
  assert.equal(plural(21, 'строка', 'строки', 'строк'), 'строка');
  assert.equal(plural(12, 'строка', 'строки', 'строк'), 'строк');
});

test('сверка: итог, полоски и прогноз начисленного', () => {
  assert.equal(compareVerdict([{status: 'ok'}, {status: 'diff'}, {status: 'diff'}]).title, 'Часы расходятся: 2 строки');
  assert.equal(compareVerdict([{status: 'ok'}, {status: 'approx'}]).tone, 'warn');
  assert.equal(compareVerdict([{status: 'unknown'}]).tone, 'none');
  const row = compareRowHtml({title: 'Всего отработано', cabina: 7, sheet: 8, delta: 1, status: 'diff', detail: 'В листке больше на 1 ч.'});
  assert.match(row, /Разница \+1 ч/);
  assert.match(row, /width:100%/);
  assert.doesNotMatch(compareRowHtml({title: 'Ночные часы', cabina: null, sheet: null, status: 'unknown', detail: '—'}), /ps-cmp-track/);
  assert.match(moneyHtml({cabina: 50000, sheet: 51000}), /больше на <span class="money">/);
  assert.equal(moneyHtml(null), '');
});

test('строка без часов (023Q) не мешает сверить ночные по остальным', () => {
  const trip = {start: '2026-03-02T21:00', end: '2026-03-03T03:00'};
  const s = {period: 'март 2026', worked: 6, rows: [earn('023L', 100, 5), earn('023Q', 20)]};
  const night = compareTrips(s, '2026-03', [trip], [], {}).rows.find(r => r.title === 'Ночные часы');
  assert.equal(night.sheet, 5);
  assert.equal(night.status, 'approx');
  assert.match(night.detail, /023Q/);
});

test('норма по закону — по пятидневке, как в листке', () => {
  const trip = {start: '2026-10-02T08:00', end: '2026-10-02T20:00'};
  const norm = compareTrips({period: 'октябрь 2026', worked: 12, norm: 170, rows: []}, '2026-10', [trip], [], {}).rows.find(r => /Норма/.test(r.title));
  assert.equal(norm.status, 'diff');
  assert.match(norm.detail, /пятидневки/);
  const same = compareTrips({period: 'октябрь 2026', worked: 12, norm: 176, rows: []}, '2026-10', [trip], [], {}).rows.find(r => /Норма/.test(r.title));
  assert.equal(same.status, 'ok', 'октябрь 2026: 176 ч по пятидневке, хотя на экране — 179 по шестидневке');
});
