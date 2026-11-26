// «По фото» (2.43): чтение только того, что вписано синей ручкой, и раскладка чисел по смыслу.
// Бланк маршрута печатается чёрным, человек пишет синим (просьба Никиты 26.11.2026): поэтому сначала
// оставляем только синие штрихи, а потом смотрим на сами числа — 5200 похоже на вес, 216 рядом с ним —
// на оси (5200 / 216 = 24 т на ось), 08:29 — на время. Всё считается в телефоне, без экрана и сети.

// ---------------------------------------------------------------- синяя ручка

// Бумага на фото бывает жёлтой (лампа) или голубой (тень): цвет бумаги берём по кускам 32×32 —
// самый светлый из обычных пикселей куска — и сравниваем каждый пиксель с бумагой рядом.
const TILE = 32;
function paperColors(data, w, h) {
  const tx = Math.ceil(w / TILE), ty = Math.ceil(h / TILE), paper = new Float32Array(tx * ty * 3);
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    const vals = [[], [], []];
    for (let y = j * TILE; y < Math.min(h, (j + 1) * TILE); y += 2) for (let x = i * TILE; x < Math.min(w, (i + 1) * TILE); x += 2) {
      const k = 4 * (y * w + x); vals[0].push(data[k]); vals[1].push(data[k + 1]); vals[2].push(data[k + 2]);
    }
    for (let c = 0; c < 3; c++) { const v = vals[c].sort((a, b) => a - b); paper[3 * (j * tx + i) + c] = Math.max(60, v[Math.floor(v.length * 0.9)] || 255); }
  }
  return { paper, tx };
}

// Маска синих штрихов: 1 — пиксель ручки. Чёрная печать (r ≈ g ≈ b) и бумага отпадают.
// Синие штампы (медпункт, станция) отличаются оттенком: у шариковой ручки красный и зелёный почти равны,
// у штемпельной краски зелёный заметно выше (голубая) или вся она бледнее. Решаем по целому штриху —
// связной кучке пикселей, — а не по пикселю: по среднему цвету штрихи разделяются надёжно (сверено с фото Никиты 26.11.2026).
export const PEN = { dark: 0.1, blue: 0.07, br: 0.12, grLoose: 0.06, grMean: 0.015, darkMean: 0.35, min: 6 };
export function penMask(data, w, h) {
  const { paper, tx } = paperColors(data, w, h), n = w * h;
  const loose = new Uint8Array(n), gr = new Float32Array(n), dk = new Float32Array(n), ink = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = 4 * i, p = 3 * (Math.floor(y / TILE) * tx + Math.floor(x / TILE));
    const r = Math.min(1, data[k] / paper[p]), g = Math.min(1, data[k + 1] / paper[p + 1]), b = Math.min(1, data[k + 2] / paper[p + 2]);
    const dark = 1 - (r + g + b) / 3;
    if (dark > 0.3 && b - Math.max(r, g) < 0.05) ink[i] = 1; // чёрная печать — для линеек бланка
    if (dark > PEN.dark && b - Math.max(r, g) > PEN.blue && b - r > PEN.br && g - r < PEN.grLoose) { loose[i] = 1; gr[i] = g - r; dk[i] = dark; }
  }
  // связные кучки (8 соседей) обходом в ширину; label хранит номер кучки
  const label = new Int32Array(n), queue = new Int32Array(n), mask = new Uint8Array(n);
  let count = 0, id = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (!loose[s0] || label[s0]) continue;
    id++; let head = 0, tail = 0, sumGr = 0, sumDk = 0; queue[tail++] = s0; label[s0] = id;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = (i - x) / w; sumGr += gr[i]; sumDk += dk[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (loose[j] && !label[j]) { label[j] = id; queue[tail++] = j; }
      }
    }
    if (tail >= PEN.min && sumGr / tail < PEN.grMean && sumDk / tail > PEN.darkMean) {
      for (let q = 0; q < tail; q++) mask[queue[q]] = 1;
      count += tail;
    }
  }
  return { mask, count, walls: wallsOf(ink, w, h) };
}

// Линейки бланка: длинные прямые чёрной печати по вертикали и горизонтали. Через них записи
// не склеиваются — так «2185» и «3120» в соседних графах остаются разными числами.
export function wallsOf(ink, w, h) {
  const L = Math.max(24, Math.round(Math.max(w, h) / 90)), walls = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h;) {
    if (!ink[y * w + x]) { y++; continue; }
    let e = y; while (e < h && ink[e * w + x]) e++;
    if (e - y >= L) for (let q = y; q < e; q++) walls[q * w + x] = 1;
    y = e;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    if (!ink[y * w + x]) { x++; continue; }
    let e = x; while (e < w && ink[y * w + e]) e++;
    if (e - x >= L * 2) for (let q = x; q < e; q++) walls[y * w + q] = 1;
    x = e;
  }
  return walls;
}

// Есть ли линейка бланка на отрезке между центрами двух рамок
function crossesWall(walls, w, a, b) {
  if (!walls) return false;
  const x0 = a.x + a.w / 2, y0 = a.y + a.h / 2, x1 = b.x + b.w / 2, y1 = b.y + b.h / 2;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let t = 0; t <= steps; t++) {
    const x = Math.round(x0 + (x1 - x0) * t / steps), y = Math.round(y0 + (y1 - y0) * t / steps);
    if (walls[y * w + x]) return true;
  }
  return false;
}

// Чистая картинка для распознавания: синие штрихи — чёрным на белом, на 1 пиксель толще (тонкая ручка).
export function penImage(mask, w, h) {
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) { const k = 4 * i; out[k] = out[k + 1] = out[k + 2] = 0; }
  }
  return out;
}

// ---------------------------------------------------------------- записи по кучкам штрихов

// Рамки отдельных записей: штрихи одной записи стоят рядом по горизонтали и на одной высоте.
// Возвращает [{x, y, w, h}] — каждую потом читаем отдельно (так tesseract видит одну строку цифр).
export function inkWords(mask, w, h, { gap: gapK = 0.7, walls = null } = {}) {
  const seen = new Uint8Array(w * h), boxes = [], queue = new Int32Array(w * h);
  for (let s0 = 0; s0 < w * h; s0++) {
    if (!mask[s0] || seen[s0]) continue;
    let head = 0, tail = 0, x0 = w, y0 = h, x1 = 0, y1 = 0; queue[tail++] = s0; seen[s0] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      // соседи через 1 пиксель: разрыв штриха ручки в 1–2 пикселя не делит цифру
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (mask[j] && !seen[j]) { seen[j] = 1; queue[tail++] = j; }
      }
    }
    boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n: tail });
  }
  // мелочь (точки, пыль) не начинает запись, но двоеточие внутри записи сохранится при склейке
  const big = boxes.filter(b => b.n >= 12 && b.h >= 6);
  const hMed = big.length ? big.map(b => b.h).sort((a, b) => a - b)[Math.floor(big.length / 2)] : 10;
  let words = boxes.filter(b => b.h <= hMed * 4 && b.w <= w * 0.5).map(b => ({ ...b }));
  // склеиваем соседей: просвет между рамками меньше доли высоты обычной цифры (hMed — по отдельным
  // кускам, не по склеенным, иначе слово «растёт» и съедает соседние графы). Цифры в узкой графе пишут
  // наискосок, поэтому соседа ищем и выше-ниже, но только по направлению письма: центры не круче ~60°,
  // так не слипаются строки, стоящие друг над другом
  for (let changed = true; changed;) {
    changed = false;
    words.sort((a, b) => a.x - b.x);
    for (let i = 0; i < words.length && !changed; i++) for (let j = i + 1; j < words.length; j++) {
      const a = words[i], b = words[j], gx = Math.max(0, b.x - (a.x + a.w));
      if (gx > hMed * gapK) break;
      const gy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
      if (Math.hypot(gx, gy) > hMed * gapK) continue;
      const dx = Math.abs(b.x + b.w / 2 - a.x - a.w / 2), dy = Math.abs(b.y + b.h / 2 - a.y - a.h / 2);
      if (dy > dx * 2 && dy > hMed * 0.5) continue;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), y2 = Math.max(a.y + a.h, b.y + b.h);
      if (y2 - y > hMed * 4 || crossesWall(walls, w, a, b)) continue;
      words[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: y2 - y, n: a.n + b.n };
      words.splice(j, 1); changed = true; break;
    }
  }
  return words.filter(b => b.n >= 20 && b.h >= hMed * 0.5);
}

// Направление записи: главная ось штрихов слова (по моментам). Цифры, вписанные в узкую
// графу наискосок, лежат под углом; возвращаем угол в радианах (0 — горизонтально).
export function angleOf(mask, w, h, box) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (mask[y * w + x]) {
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < 20) return 0;
  const mx = sx / n, my = sy / n, a = sxx / n - mx * mx, c = syy / n - my * my, b = sxy / n - mx * my;
  const t = 0.5 * Math.atan2(2 * b, a - c);
  const l1 = (a + c) / 2 + Math.sqrt(((a - c) / 2) ** 2 + b * b), l2 = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
  // слово заметно вытянуто — тогда угол надёжен; круглые «0», «8» не поворачиваем
  return l1 > l2 * 2.2 && Math.abs(t) < 1.1 ? t : 0;
}

// Наклон почерка: сдвиг строк, при котором столбцы штрихов самые «острые» (у прямых цифр
// проекция на ось x — частокол). Возвращает k: x' = x + k * (y − середина).
export function slantOf(mask, w, h, box) {
  let best = 0, bestScore = -1;
  const mid = box.y + box.h / 2;
  for (let k = -0.1; k <= 0.7; k += 0.05) {
    const cols = new Map();
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (mask[y * w + x]) {
      const c = Math.round(x + k * (y - mid)); cols.set(c, (cols.get(c) || 0) + 1);
    }
    let score = 0; for (const v of cols.values()) score += v * v;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return Math.round(best * 100) / 100;
}

// Слово отдельной картинкой: повернуть к горизонтали, выпрямить наклон, обрезать по штрихам.
// Возвращает {m, w, h} — маска, готовая к увеличению и распознаванию.
export function wordMask(mask, w, h, box) {
  const t = angleOf(mask, w, h, box), cs = Math.cos(-t), sn = Math.sin(-t);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2, pts = [];
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (mask[y * w + x]) {
    const dx = x - cx, dy = y - cy; pts.push(dx * cs - dy * sn, dx * sn + dy * cs);
  }
  if (!pts.length) return { m: new Uint8Array(0), w: 0, h: 0, angle: t, slant: 0 };
  const bounds = (arr) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < arr.length; i += 2) { x0 = Math.min(x0, arr[i]); x1 = Math.max(x1, arr[i]); y0 = Math.min(y0, arr[i + 1]); y1 = Math.max(y1, arr[i + 1]); }
    return { x0, y0, x1, y1 }; };
  const raster = (arr) => { const b = bounds(arr), W = Math.ceil(b.x1 - b.x0) + 2, H = Math.ceil(b.y1 - b.y0) + 2, m = new Uint8Array(W * H);
    for (let i = 0; i < arr.length; i += 2) { const x = Math.round(arr[i] - b.x0), y = Math.round(arr[i + 1] - b.y0);
      // поворот оставляет дырки между пикселями — закрашиваем и соседа справа и снизу
      m[y * W + x] = 1; if (x + 1 < W) m[y * W + x + 1] = 1; if (y + 1 < H) m[(y + 1) * W + x] = 1; }
    return { m, w: W, h: H }; };
  const r = raster(pts), k = slantOf(r.m, r.w, r.h, { x: 0, y: 0, w: r.w, h: r.h }), mid = r.h / 2;
  if (!k) return { ...r, angle: t, slant: 0 };
  const sh = [];
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.m[y * r.w + x]) sh.push(x + k * (y - mid), y);
  return { ...raster(sh), angle: t, slant: k };
}

// ---------------------------------------------------------------- слова из распознавания

// TSV tesseract: level … left top width height conf text; берём только слова (level 5).
export function tsvWords(tsv) {
  const words = [];
  for (const line of String(tsv || '').split('\n')) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c.slice(11).join(' ').trim();
    const conf = Number(c[10]);
    if (text && conf >= 0) words.push({ text, x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf });
  }
  return words;
}

// ---------------------------------------------------------------- числа по смыслу

const clean = t => String(t).replace(/[OoОо]/g, '0').replace(/[lI|]/g, '1').replace(/[Зз]/g, '3').replace(/\s/g, '').replace(/^[^\d]+|[^\d]+$/g, '');
const pad = n => String(n).padStart(2, '0');

// Одно вписанное значение → что это может быть.
export function kindOf(text) {
  const t = clean(text);
  let m = t.match(/^(\d{1,2})[.,/-](\d{1,2})(?:[.,/-](\d{2}|\d{4}))?$/);
  if (m && t.match(/[.,/-]/g).length === 2 && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) return { date: { d: +m[1], m: +m[2], y: m[3] ? +(m[3].length === 2 ? '20' + m[3] : m[3]) : null } };
  m = t.match(/^(\d{1,2})[:.,-](\d{2})$/);
  if (m) return +m[1] < 24 && +m[2] < 60 ? { time: pad(+m[1]) + ':' + m[2], sure: true } : {};
  if (!/^\d+$/.test(t)) return {};
  const n = Number(t), out = { n, digits: t.length };
  // «8²⁹» — минуты сверху: ручкой часто пишут 829 или 0829
  if (t.length >= 3 && t.length <= 4) { const hh = +t.slice(0, -2), mm = +t.slice(-2); if (hh < 24 && mm < 60) out.time = pad(hh) + ':' + t.slice(-2); }
  return out;
}

// Вес / оси / длина проверяют друг друга: на ось — от 5 т (порожний) до 27 т (гружёный),
// условная длина — примерно оси / 4 (вагон на 4 оси — 1–1,5 условного вагона).
export const PER_AXLE = [5, 27];
function trainFit(weight, axles, length) {
  let score = 0;
  if (weight && axles) { const per = weight / axles; if (per < PER_AXLE[0] || per > PER_AXLE[1]) return -1; score += 2; }
  if (axles && length) { const k = length / (axles / 4); if (k < 0.7 || k > 1.8) return -1; score += 1; }
  if (axles && axles % 4 === 0) score += 0.5;
  if (weight && weight >= 2400) score += 0.5;
  return score;
}

// Порядок чтения: сверху вниз по строкам, в строке — слева направо.
export function readingOrder(tokens) {
  const rows = [];
  for (const t of [...tokens].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))) {
    const mid = t.y + t.h / 2, row = rows.find(r => Math.abs(r.mid - mid) < Math.max(r.h, t.h) * 0.6);
    if (row) row.items.push(t); else rows.push({ mid, h: t.h, items: [t] });
  }
  return rows.map(r => r.items.sort((a, b) => a.x - b.x));
}

const fmt = n => n.toLocaleString('ru-RU');

// Запись иногда склеивает две соседние графы («10:4511:03»): делим на части-числа, рамку — пропорционально.
export function splitToken(t) {
  const text = clean(t.text), parts = [...text.matchAll(/\d{1,2}[.,/-]\d{1,2}[.,/-]\d{2,4}|\d{1,2}[:.]\d{2}(?!\d)|\d+/g)];
  if (parts.length <= 1) return [t];
  return parts.map(m => ({ ...t, text: m[0], x: t.x + Math.round(t.w * m.index / text.length), w: Math.max(1, Math.round(t.w * m[0].length / text.length)) }));
}

// Дату пишут в клеточках: «23 11 26» — три отдельных числа подряд в строке → одна дата.
function joinDate(line) {
  const out = [];
  for (let i = 0; i < line.length; i++) {
    const [a, b, c] = line.slice(i, i + 3);
    const near = (p, q) => q && q.x - (p.x + p.w) < Math.max(p.h, q.h) * 3;
    if (c && a.digits <= 2 && b.digits <= 2 && (c.digits === 2 || c.digits === 4) && !a.date && !b.date && !c.date
      && a.n >= 1 && a.n <= 31 && b.n >= 1 && b.n <= 12 && near(a, b) && near(b, c)) {
      const y = c.digits === 2 ? 2000 + c.n : c.n;
      if (y >= 2020 && y <= 2040) {
        const x = a.x, y0 = Math.min(a.y, b.y, c.y);
        out.push({ text: `${a.n}.${b.n}.${c.n}`, x, y: y0, w: c.x + c.w - x, h: Math.max(a.y + a.h, b.y + b.h, c.y + c.h) - y0, date: { d: a.n, m: b.n, y } });
        i += 2; continue;
      }
    }
    out.push(line[i]);
  }
  return out;
}

// tokens: [{text, x, y, w, h}] → rows [{key, value, why}] — предложения, человек сверяет их со снимком.
export function classify(tokens, { year = null } = {}) {
  const lines = readingOrder(tokens.flatMap(splitToken).map(t => ({ ...t, ...kindOf(t.text) }))).map(joinDate);
  const all = lines.flat(), used = new Set(), rows = [];
  const where = new Map(); lines.forEach((l, i) => l.forEach((t, j) => where.set(t, [i, j])));
  const add = (key, value, why, t) => { rows.push({ key, value: String(value), why, ...(t ? { box: { x: t.x, y: t.y, w: t.w, h: t.h } } : {}) }); if (t) used.add(t); };

  // показания счётчиков: большие числа парами «было → стало» в одной строке; строки сверху вниз — секции
  let section = 0;
  for (const line of lines) {
    const big = line.filter(t => t.n >= 10000 && t.digits <= 8 && !t.date);
    const pairs = [];
    for (let i = 0; i + 1 < big.length; i += 2) if (big[i + 1].n > big[i].n && big[i + 1].n - big[i].n < 50000) pairs.push([big[i], big[i + 1]]);
    if (!pairs.length || section > 1) continue;
    pairs.slice(0, 2).forEach(([a, b], j) => {
      const what = j ? 'regen' : 'energy';
      add(section + '_' + what + 'From', a.n, 'большое число слева в паре — «было»', a);
      add(section + '_' + what + 'To', b.n, `больше соседнего на ${fmt(b.n - a.n)} — «стало»`, b);
    });
    section++;
  }

  // вес, оси, длина — лучшая тройка, которая сходится между собой
  const free = all.filter(t => t.n && !used.has(t) && !t.date && !t.sure);
  const weights = free.filter(t => t.n >= 1000 && t.n <= 15000);
  const axles = free.filter(t => t.n >= 16 && t.n <= 600 && t.n % 2 === 0);
  const lengths = free.filter(t => t.n >= 5 && t.n <= 200);
  let best = null;
  for (const W of [null, ...weights]) for (const A of [null, ...axles]) for (const L of [null, ...lengths]) {
    if (!W || !A) continue; // без пары «вес + оси» числа слишком двусмысленны
    if (new Set([W, A, L].filter(Boolean)).size !== [W, A, L].filter(Boolean).length) continue;
    let s = trainFit(W.n, A.n, L?.n);
    // на обороте маршрута графы идут подряд: № поезда, нетто, брутто, оси — брутто стоит сразу слева
    // от осей, а слева от него — нетто, оно меньше брутто (так проверили на маршрутах Никиты)
    const [wl, wi] = where.get(W) || [], [al, ai] = where.get(A) || [];
    if (s > 0 && wl === al && wi === ai - 1) {
      s += 1.5;
      if (lines[wl].slice(0, wi).some(t => t.n >= 1000 && t.n < W.n && !t.date)) s += 0.5;
    }
    if (s > 0 && (!best || s > best.s)) best = { W, A, L, s };
  }
  if (best) {
    const per = Math.round(best.W.n / best.A.n * 10) / 10;
    add('weight', best.W.n, `${fmt(best.W.n)} т — вес: с осями ${best.A.n} это ${String(per).replace('.', ',')} т на ось`, best.W);
    add('axles', best.A.n, `${best.A.n} — оси: вес ${fmt(best.W.n)} т / ${best.A.n} = ${String(per).replace('.', ',')} т на ось`, best.A);
    if (best.L) add('length', best.L.n, `${best.L.n} — условная длина: примерно оси / 4`, best.L);
  } else {
    const sure = weights.filter(t => t.n >= 2400);
    if (sure.length === 1) add('weight', sure[0].n, `${fmt(sure[0].n)} — по величине похоже на вес поезда, т`, sure[0]);
  }

  // даты и время — по порядку чтения: первая — явка, последняя — окончание
  const dates = all.filter(t => t.date && !used.has(t));
  const ymd = (d) => (d.y || year) ? `${d.y || year}-${pad(d.m)}-${pad(d.d)}` : null;
  const dateVals = [...new Set(dates.map(t => ymd(t.date)).filter(Boolean))];
  const dateTok = v => dates.find(t => ymd(t.date) === v);
  if (dateVals[0]) add('sd', dateVals[0], 'первая дата на листе — явка', dateTok(dateVals[0]));
  if (dateVals.length > 1) add('ed', dateVals.at(-1), 'последняя дата на листе — окончание', dateTok(dateVals.at(-1)));
  // нашлись вес и оси — это оборот маршрута: там время по станциям, а не явка и окончание работы
  if (best) return rows;
  const times = all.filter(t => t.time && !used.has(t));
  const sureTimes = times.filter(t => t.sure), pick = sureTimes.length >= 2 ? sureTimes : times;
  if (pick.length >= 2) {
    add('st', pick[0].time, 'первое время на листе — явка', pick[0]);
    add('et', pick.at(-1).time, 'последнее время на листе — окончание работы', pick.at(-1));
  }
  return rows;
}

// Проверка значений из граф (их читает route-reader.js по разметке бланка): вес и оси, которые
// не сходятся между собой, — явная ошибка чтения. Возвращает причину или ''.
export function trainDoubt({ weight, axles, length }) {
  const W = Number(weight) || 0, A = Number(axles) || 0, L = Number(length) || 0;
  if (A && A % 2) return 'Осей обычно чётное число';
  if (W && A) { const per = W / A; if (per < PER_AXLE[0] || per > PER_AXLE[1]) return `Вес ${fmt(W)} т на ${A} осей — ${String(Math.round(per * 10) / 10).replace('.', ',')} т на ось, так не бывает`; }
  if (A && L) { const k = L / (A / 4); if (k < 0.7 || k > 1.8) return `Условная длина ${L} не сходится с осями ${A}`; }
  return '';
}
