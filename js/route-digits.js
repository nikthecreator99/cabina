// Рукописные цифры синей ручкой (2.43). Tesseract обучен на печатном тексте и рукописные цифры
// почти не читает, поэтому слово, выделенное из синей ручки (route-ink.js), делится здесь на цифры,
// и каждую цифру узнаёт маленькая свёрточная сеть. Всё — в телефоне, без сервера.
// Веса сети (route-digits-w.js) обучены нами на открытом наборе MNIST (CC BY-SA 3.0) с искажениями
// под почерк ручкой: наклон, толщина, разрывы штриха.

const S = 20; // большая сторона цифры в клетке 28×28 — так же, как при обучении

// Маска цифры (Uint8Array w×h) → 28×28 Float32Array, 0…1: обрезка, большая сторона — 20, по центру.
export function normDigit(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = new Float32Array(784);
  if (x1 < 0) return out;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, sc = S / Math.max(cw, ch);
  const nw = Math.max(1, Math.round(cw * sc)), nh = Math.max(1, Math.round(ch * sc));
  const oy = Math.floor((28 - nh) / 2), ox = Math.floor((28 - nw) / 2);
  for (let Y = 0; Y < nh; Y++) for (let X = 0; X < nw; X++) {
    let s = 0;
    for (let a = 0; a < 4; a++) {
      const sy = Math.min(ch - 1, Math.floor((Y * 4 + a + 0.5) / (nh * 4) * ch));
      for (let b = 0; b < 4; b++) {
        const sx = Math.min(cw - 1, Math.floor((X * 4 + b + 0.5) / (nw * 4) * cw));
        s += m[(y0 + sy) * w + x0 + sx];
      }
    }
    out[(oy + Y) * 28 + ox + X] = s / 16;
  }
  return out;
}

let NET = null;
// Веса: размеры сети [C1, C2, F, классов] (uint16), дальше w1 b1 w2 b2 w3 b3 w4 b4 —
// у каждого масштаб (float32) и значения int8 (так файл весов вчетверо меньше)
function unpack(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const dv = new DataView(u8.buffer), [C1, C2, F, NC] = [0, 1, 2, 3].map(i => dv.getUint16(i * 2, true));
  let o = 8;
  const take = (n) => {
    const sc = dv.getFloat32(o, true), a = new Float32Array(n); o += 4;
    for (let i = 0; i < n; i++) a[i] = dv.getInt8(o + i) * sc;
    o += n; return a;
  };
  return { C1, C2, F, NC, w1: take(C1 * 25), b1: take(C1), w2: take(C2 * C1 * 25), b2: take(C2),
    w3: take(C2 * 16 * F), b3: take(F), w4: take(F * NC), b4: take(NC) };
}

export async function loadDigits() {
  if (!NET) NET = unpack((await import('./route-digits-w.js')).WEIGHTS);
  return NET;
}
export function useDigitWeights(b64) { NET = unpack(b64); }

function conv(x, c, size, w, b, f) {
  const o = size - 4, out = new Float32Array(f * o * o);
  for (let k = 0; k < f; k++) for (let i = 0; i < o; i++) for (let j = 0; j < o; j++) {
    let s = b[k];
    for (let ci = 0; ci < c; ci++) for (let u = 0; u < 5; u++) {
      const xr = (ci * size + i + u) * size + j, wr = ((k * c + ci) * 5 + u) * 5;
      for (let v = 0; v < 5; v++) s += x[xr + v] * w[wr + v];
    }
    out[(k * o + i) * o + j] = s > 0 ? s : 0;
  }
  return out;
}
function pool(x, c, size) {
  const o = size / 2, out = new Float32Array(c * o * o);
  for (let k = 0; k < c; k++) for (let i = 0; i < o; i++) for (let j = 0; j < o; j++) {
    const r = (k * size + 2 * i) * size + 2 * j;
    out[(k * o + i) * o + j] = Math.max(x[r], x[r + 1], x[r + size], x[r + size + 1]);
  }
  return out;
}

// 28×28 → вероятности: 0…9 — цифры, 10 — «не одна цифра» (две слитные или половинка)
export function digitProbs(img, net = NET) {
  const { C1, C2, F, NC: C } = net, P = C2 * 16;
  const p1 = pool(conv(img, 1, 28, net.w1, net.b1, C1), C1, 24);
  const p2 = pool(conv(p1, C1, 12, net.w2, net.b2, C2), C2, 8);
  const h = new Float32Array(F);
  for (let j = 0; j < F; j++) { let s = net.b3[j]; for (let i = 0; i < P; i++) s += p2[i] * net.w3[i * F + j]; h[j] = s > 0 ? s : 0; }
  const z = new Float32Array(C); let mx = -Infinity;
  for (let j = 0; j < C; j++) { let s = net.b4[j]; for (let i = 0; i < F; i++) s += h[i] * net.w4[i * C + j]; z[j] = s; if (s > mx) mx = s; }
  let sum = 0; for (let j = 0; j < C; j++) { z[j] = Math.exp(z[j] - mx); sum += z[j]; }
  for (let j = 0; j < C; j++) z[j] /= sum;
  return z;
}

// ------------------------------------------------------------ слово → цифры

function parts(m, w, h) {
  const seen = new Uint8Array(w * h), out = [], q = new Int32Array(w * h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!m[s0] || seen[s0]) continue;
    let hd = 0, tl = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; q[tl++] = s0; seen[s0] = 1;
    const px = [];
    while (hd < tl) {
      const i = q[hd++], x = i % w, y = (i - x) / w; px.push(i);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (m[j] && !seen[j]) { seen[j] = 1; q[tl++] = j; }
      }
    }
    out.push({ x0, y0, x1, y1, px });
  }
  return out;
}

// Слово → {text, conf}. Слитные цифры («31» в «3120») делим перебором: режем слово по просветам
// и по тонким местам, и из всех нарезок берём ту, где каждый кусок сеть уверенней всего считает
// одной цифрой (у сети есть ответ «это не одна цифра» — так «31» не выдаётся за «4»).
// «:» — точка между цифрами (часы пишут «10.45» и «10:45»). conf — самая неуверенная цифра.
export function readDigits(m, w, h, net = NET) {
  const ps = parts(m, w, h);
  if (!ps.length) return { text: '', conf: 0, digits: 0 };
  const H = Math.max(...ps.map(p => p.y1 - p.y0 + 1));
  const ink = new Uint8Array(w * h), dots = [];
  const big = ps.filter(p => p.y1 - p.y0 + 1 >= H * 0.35 || p.x1 - p.x0 + 1 >= H * 0.45);
  const top = Math.min(...big.map(p => p.y0)), bot = Math.max(...big.map(p => p.y1)), lh = Math.max(1, bot - top);
  for (const p of ps) {
    const pw = p.x1 - p.x0 + 1, ph = p.y1 - p.y0 + 1;
    if (ph < H * 0.35 && pw < H * 0.45) {
      // точка двоеточия — в средней части строки; сверху — это оторванная «шапка» цифры (у 5), её рисуем с цифрой
      const cy = ((p.y0 + p.y1) / 2 - top) / lh;
      if (cy > 0.25 && cy < 0.95) { dots.push((p.x0 + p.x1) / 2); continue; }
    }
    for (const i of p.px) ink[i] = 1;
  }
  const prof = new Int32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) prof[x] += ink[y * w + x];
  const nz = [...prof].filter(v => v > 0).sort((a, b) => a - b), med = nz[Math.floor(nz.length / 2)] || 1;
  const cut = new Set([0, w]);
  for (let x = 1; x < w; x++) {
    if ((prof[x] === 0) !== (prof[x - 1] === 0)) cut.add(x);
    if (prof[x] > 0 && prof[x] <= med * 0.6 && prof[x] <= prof[x - 1] && prof[x] <= (prof[x + 1] ?? 0)) cut.add(x);
  }
  const cuts = [...cut].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] >= 2 || x === w);
  const seg = new Map();
  const score = (i, j) => {
    const key = i * 1000 + j; if (seg.has(key)) return seg.get(key);
    const a = cuts[i], b = cuts[j]; let y0 = h, y1 = -1, n = 0;
    for (let y = 0; y < h; y++) for (let x = a; x < b; x++) if (ink[y * w + x]) { n++; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    let r;
    if (!n) r = { s: 0 };
    else if (y1 - y0 + 1 < H * 0.45) r = { s: -0.7 }; // обрывок штриха, не цифра
    else {
      const cw = b - a, ch = y1 - y0 + 1, cell = new Uint8Array(cw * ch);
      for (let y = y0; y <= y1; y++) for (let x = a; x < b; x++) cell[(y - y0) * cw + x - a] = ink[y * w + x];
      const pr = digitProbs(normDigit(cell, cw, ch), net);
      let d = 0; for (let k = 1; k < 10; k++) if (pr[k] > pr[d]) d = k;
      r = { s: Math.log(pr[d] + 1e-6), d, p: pr[d], x: (a + b) / 2, a, b };
    }
    seg.set(key, r); return r;
  };
  // через просвет шире пикселя кусок не тянем: отдельно написанные цифры не склеиваем обратно
  const spansGap = (a, b) => { for (let x = a + 1; x < b - 2; x++) if (!prof[x] && !prof[x + 1] && prof.subarray(a, x).some(Boolean) && prof.subarray(x + 2, b).some(Boolean)) return true; return false; };
  const N = cuts.length, best = new Float64Array(N).fill(-Infinity), from = new Int32Array(N).fill(-1);
  best[0] = 0;
  for (let j = 1; j < N; j++) for (let i = Math.max(0, j - 6); i < j; i++) {
    if (best[i] === -Infinity || cuts[j] - cuts[i] > H * 1.4 || spansGap(cuts[i], cuts[j])) continue;
    const v = best[i] + score(i, j).s;
    if (v > best[j]) { best[j] = v; from[j] = i; }
  }
  const out = [];
  for (let j = N - 1; j > 0 && from[j] >= 0; j = from[j]) { const r = score(from[j], j); if (r.d !== undefined) out.unshift(r); }
  let text = '', conf = 1;
  out.forEach((r, k) => {
    if (k && dots.some(x => x > out[k - 1].b - 2 && x < r.a + 2) && !text.includes(':')) text += ':';
    text += r.d; conf = Math.min(conf, r.p);
  });
  return { text, conf: out.length ? conf : 0, digits: out.length };
}
