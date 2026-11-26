// «По фото» (2.43): только синяя ручка и числа по смыслу.
import test from 'node:test';
import assert from 'node:assert/strict';
import { penMask, penImage, tsvWords, kindOf, classify, trainDoubt, readingOrder } from '../../js/route-ink.js';

// картинка: жёлтая бумага, чёрная печать слева, синяя ручка справа
function sheet(w = 96, h = 64) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([238, 228, 190, 255], 4 * i);
  const box = (x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d.set([...rgb, 255], 4 * (y * w + x)); };
  box(4, 10, 40, 14, [25, 25, 28]);      // печатная линия
  box(50, 10, 90, 14, [40, 60, 150]);    // шариковая синяя
  box(50, 30, 90, 33, [110, 130, 205]);  // бледная гелевая
  box(4, 30, 40, 33, [120, 118, 110]);   // серая тень/карандаш
  return { d, w, h };
}

test('маска оставляет только синюю ручку: печать, тень и жёлтая бумага уходят', () => {
  const { d, w, h } = sheet();
  const { mask, count } = penMask(d, w, h);
  const at = (x, y) => mask[y * w + x];
  assert.equal(at(60, 12), 1);
  assert.equal(at(60, 31), 1);
  assert.equal(at(20, 12), 0);
  assert.equal(at(20, 31), 0);
  assert.equal(at(70, 50), 0);
  assert.equal(count, 40 * 4 + 40 * 3);
  const img = penImage(mask, w, h);
  assert.equal(img[4 * (12 * w + 60)], 0);
  assert.equal(img[4 * (12 * w + 20)], 255);
});

test('синяя бумага в тени не становится ручкой', () => {
  const w = 64, h = 64, d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([170, 185, 215, 255], 4 * i);
  assert.equal(penMask(d, w, h).count, 0);
});

test('слова из TSV распознавания', () => {
  const tsv = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '4\t1\t1\t1\t1\t0\t10\t10\t200\t30\t-1\t',
    '5\t1\t1\t1\t1\t1\t10\t10\t80\t30\t91.5\t5200',
    '5\t1\t1\t1\t1\t2\t120\t12\t50\t28\t88\t216'].join('\n');
  assert.deepEqual(tsvWords(tsv), [{ text: '5200', x: 10, y: 10, w: 80, h: 30, conf: 91.5 }, { text: '216', x: 120, y: 12, w: 50, h: 28, conf: 88 }]);
});

test('что за число: время, дата, просто число', () => {
  assert.deepEqual(kindOf('8:29'), { time: '08:29', sure: true });
  assert.equal(kindOf('829').time, '08:29');
  assert.equal(kindOf('2019').time, '20:19');
  assert.equal(kindOf('5200').time, undefined);
  assert.equal(kindOf('5200').n, 5200);
  assert.deepEqual(kindOf('10.11.26').date, { d: 10, m: 11, y: 2026 });
  assert.deepEqual(kindOf('25:70'), {});
  assert.equal(kindOf('О216').n, 216);
});

const tok = (text, x, y, h = 30) => ({ text, x, y, w: 20 * String(text).length, h });

test('пример Никиты: 216 осей и 5200 — это вес брутто, длина сходится с осями', () => {
  const rows = classify([tok('5200', 400, 500), tok('216', 520, 500), tok('57', 600, 500), tok('8', 100, 500)]);
  const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
  assert.equal(by.weight, '5200');
  assert.equal(by.axles, '216');
  assert.equal(by.length, '57');
  assert.match(rows.find(r => r.key === 'axles').why, /24,1 т на ось/);
});

test('вес и оси, которые не сходятся, не подставляются', () => {
  // 5200 т на 30 осей = 173 т на ось — не поезд
  const rows = classify([tok('5200', 100, 100), tok('30', 200, 100)]);
  assert.deepEqual(rows.map(r => r.key), ['weight']); // 5200 — только «похоже на вес», без осей
  assert.match(trainDoubt({ weight: '5200', axles: '30' }), /^Вес 5.200 т на 30 осей — 173,3 т на ось, так не бывает$/);
  assert.equal(trainDoubt({ weight: '5200', axles: '216', length: '57' }), '');
  assert.equal(trainDoubt({ axles: '215' }), 'Осей обычно чётное число');
  assert.match(trainDoubt({ axles: '216', length: '12' }), /не сходится/);
});

test('явка и окончание — первое и последнее время, даты — по порядку', () => {
  const rows = classify([tok('10.11.2026', 50, 40), tok('8:29', 300, 40), tok('11.11.2026', 50, 400), tok('20:19', 300, 400), tok('5200', 50, 600), tok('216', 200, 600)]);
  const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
  assert.deepEqual([by.sd, by.ed, by.st, by.et, by.weight, by.axles], ['2026-11-10', '2026-11-11', '08:29', '20:19', '5200', '216']);
});

test('показания счётчиков: пары «было → стало» по строкам — секции', () => {
  const rows = classify([tok('123450', 50, 100), tok('124100', 250, 100), tok('5000', 450, 100), tok('5120', 650, 100),
    tok('223450', 50, 160), tok('224010', 250, 160)]);
  const by = Object.fromEntries(rows.map(r => [r.key, r.value]));
  assert.equal(by['0_energyFrom'], '123450');
  assert.equal(by['0_energyTo'], '124100');
  assert.equal(by['1_energyFrom'], '223450');
  assert.equal(by['1_energyTo'], '224010');
});

test('порядок чтения: строки сверху вниз, в строке слева направо, с наклоном', () => {
  const order = readingOrder([tok('b', 300, 104), tok('a', 10, 98), tok('c', 20, 200)]).map(l => l.map(t => t.text).join(''));
  assert.deepEqual(order, ['ab', 'c']);
});
