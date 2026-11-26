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
export function penMask(data, w, h) {
  const { paper, tx } = paperColors(data, w, h), mask = new Uint8Array(w * h);
  let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = 4 * (y * w + x), p = 3 * (Math.floor(y / TILE) * tx + Math.floor(x / TILE));
    const r = Math.min(1, data[k] / paper[p]), g = Math.min(1, data[k + 1] / paper[p + 1]), b = Math.min(1, data[k + 2] / paper[p + 2]);
    const dark = 1 - (r + g + b) / 3, blue = b - Math.max(r, g);
    // синяя паста: заметно темнее бумаги и синий канал выше красного и зелёного; у гелевой и выцветшей — слабее
    if (dark > 0.1 && blue > 0.07 && b - r > 0.12) { mask[y * w + x] = 1; count++; }
  }
  return { mask, count };
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

// tokens: [{text, x, y, w, h}] → rows [{key, value, why}] — предложения, человек сверяет их со снимком.
export function classify(tokens, { year = null } = {}) {
  const lines = readingOrder(tokens.map(t => ({ ...t, ...kindOf(t.text) })));
  const all = lines.flat(), used = new Set(), rows = [];
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
    const s = trainFit(W.n, A.n, L?.n);
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
