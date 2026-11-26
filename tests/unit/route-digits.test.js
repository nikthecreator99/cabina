// «По фото» (2.43): своя сеть для рукописных цифр синей ручкой.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDigits, normDigit, digitProbs, readDigits } from '../../js/route-digits.js';

// маска: палочки «1» нужной высоты; между ними — просвет
function sticks(n, { hgt = 40, gap = 14, thick = 4 } = {}) {
  const w = n * (thick + gap) + gap, h = hgt + 8, m = new Uint8Array(w * h);
  for (let k = 0; k < n; k++) for (let y = 4; y < 4 + hgt; y++) for (let x = 0; x < thick; x++) m[y * w + gap + k * (thick + gap) + x] = 1;
  return { m, w, h };
}

// кольцо «0»
function ring(cx, cy, rx, ry, m, w, thick = 4) {
  for (let y = 0; y < m.length / w; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (Math.abs(d - 1) * Math.min(rx, ry) < thick / 2) m[y * w + x] = 1;
  }
}

test('веса загружаются, вероятности в сумме 1, есть ответ «не одна цифра»', async () => {
  const net = await loadDigits();
  assert.equal(net.NC, 11);
  const { m, w, h } = sticks(1);
  const p = digitProbs(normDigit(m, w, h), net);
  assert.equal(p.length, 11);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-4);
});

test('цифра по центру клетки 28×28, большая сторона — 20', () => {
  const { m, w, h } = sticks(1);
  const img = normDigit(m, w, h);
  const rows = [...Array(28).keys()].filter(y => [...Array(28).keys()].some(x => img[y * 28 + x] > 0));
  assert.equal(rows.length, 20);
  assert.equal(rows[0], 4);
});

test('палочки — единицы, кольцо — ноль, отдельно написанные цифры не склеиваются', async () => {
  const net = await loadDigits();
  const one = sticks(1);
  assert.equal(readDigits(one.m, one.w, one.h, net).text, '1');
  const w = 80, h = 48, m = new Uint8Array(w * h);
  for (let y = 4; y < 44; y++) for (let x = 10; x < 14; x++) m[y * w + x] = 1;
  ring(50, 24, 13, 19, m, w);
  const r = readDigits(m, w, h, net);
  assert.equal(r.text, '10');
  assert.equal(r.digits, 2);
  assert.ok(r.conf > 0.5);
});

test('пустое слово — без цифр', async () => {
  const net = await loadDigits();
  assert.deepEqual(readDigits(new Uint8Array(100), 10, 10, net), { text: '', conf: 0, digits: 0 });
});
