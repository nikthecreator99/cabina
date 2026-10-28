// Персонаж (аватар) CABINA: рисуется кодом из списка выбранных деталей, без картинок и фото.
// Плоская заливка с мягкой тенью. Форма головы — суперэллипс; причёски, борода и головные уборы строятся
// по контуру головы, поэтому садятся на любую форму. Параметры → строка SVG.
// В SVG попадают только числа и цвета из списков ниже: всё, что пришло извне (база, резервная копия),
// сначала проходит normalizeAvatar.

const f1 = n => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const h2r = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const r2h = r => '#' + r.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
const dk = (c, t) => mix(c, '#2a1530', t);
const lt = (c, t) => mix(c, '#fff7ea', t);

// ── Палитры ────────────────────────────────────────────────────────
export const SKIN = ['#ffe6d6', '#fbd6bf', '#f4c6a5', '#ecb48f', '#e0a37c', '#d39168', '#c07f57', '#a96c47', '#93593a', '#7b4a30', '#653c27', '#4f2f20', '#f6cfc6', '#d9b384'];
export const HAIR_C = ['#1e1a1d', '#3a2620', '#5e3b27', '#87492a', '#a7784d', '#d8b36b', '#efe1bb', '#c7581f', '#922a22', '#9c9ca2', '#e9e7e3', '#3b5bd0', '#d8629f', '#3f8f72'];
export const EYE_C = ['#5b3820', '#2b1d16', '#8a6a2b', '#4d8a48', '#3e78c2', '#7d8a96', '#7cbbe2', '#9a5bc0'];
export const CLOTH_C = ['#f4f4f1', '#262a33', '#8b929e', '#d23b3b', '#2f6bd6', '#2f8f5b', '#e9a23b', '#6c4bb8', '#1f3a5f', '#7a4b2e'];
export const HAT_C = ['#2f6bd6', '#d23b3b', '#262a33', '#f4f4f1', '#e9a23b', '#2f8f5b', '#ff7417'];
export const HELMET_C = ['#f4f4f1', '#ff7417', '#f0d21c', '#d23b3b', '#2f6bd6', '#2f8f5b'];
export const hatColors = (hat) => (hat === 'helmet' ? HELMET_C : HAT_C);
export const FRAME_C = ['#1f2229', '#8a5a33', '#c9a25b', '#c03a3a', '#3a6bd0', '#a7adb7'];
export const LIP_C = [null, '#c9706e', '#c8243a', '#8c2a52', '#e8766a'];

// ── Форма головы ─────────────────────────────────────────────────
export const HEADS = [
  { id: 'oval', name: 'Овальная', n: 2.1, rx: 36, ry: 46, top: 1, jaw: .8 },
  { id: 'round', name: 'Круглая', n: 2, rx: 43, ry: 41, top: 1, jaw: .96 },
  { id: 'square', name: 'Квадратная', n: 4.6, rx: 38, ry: 43, top: .96, jaw: 1 },
  { id: 'long', name: 'Вытянутая', n: 2.6, rx: 31, ry: 52, top: 1, jaw: .86 },
  { id: 'heart', name: 'Сердечком', n: 2.4, rx: 41, ry: 45, top: 1.08, jaw: .44 },
  { id: 'pear', name: 'Грушей', n: 2.9, rx: 37, ry: 44, top: .68, jaw: 1.16 },
  { id: 'diamond', name: 'Ромбом', n: 2, rx: 44, ry: 46, top: .62, jaw: .5 },
];
export const BUILDS = [
  { id: 'slim', name: 'Худощавое', sw: 56, nw: 12.5 },
  { id: 'avg', name: 'Обычное', sw: 67, nw: 14.5 },
  { id: 'stocky', name: 'Крепкое', sw: 79, nw: 17.5 },
  { id: 'big', name: 'Богатырское', sw: 91, nw: 20.5 },
];
export const EARS = [
  { id: 'normal', name: 'Обычные', w: 6, h: 10, out: 2 },
  { id: 'small', name: 'Маленькие', w: 4.6, h: 8, out: 1 },
  { id: 'big', name: 'Большие', w: 7.8, h: 12.5, out: 3 },
  { id: 'out', name: 'Оттопыренные', w: 7.2, h: 11, out: 6.5 },
];
export const EYES = [
  { id: 'almond', name: 'Миндаль' }, { id: 'round', name: 'Круглые' }, { id: 'big', name: 'Большие' },
  { id: 'narrow', name: 'Узкие' }, { id: 'up', name: 'Кошачьи' }, { id: 'down', name: 'Опущенные' },
  { id: 'sleepy', name: 'Сонные' }, { id: 'dots', name: 'Точки' },
];
export const BROWS = [
  { id: 'straight', name: 'Прямые' }, { id: 'arch', name: 'Дугой' }, { id: 'thick', name: 'Густые' },
  { id: 'thin', name: 'Тонкие' }, { id: 'angle', name: 'Изломом' }, { id: 'worry', name: 'Домиком' }, { id: 'bushy', name: 'Лохматые' },
];
export const NOSES = [
  { id: 'button', name: 'Кнопка' }, { id: 'round', name: 'Картошкой' }, { id: 'long', name: 'Длинный' }, { id: 'wide', name: 'Широкий' },
  { id: 'pointy', name: 'Острый' }, { id: 'hook', name: 'С горбинкой' }, { id: 'small', name: 'Маленький' }, { id: 'snub', name: 'Курносый' },
];
export const MOUTHS = [
  { id: 'smile', name: 'Улыбка' }, { id: 'grin', name: 'Широкая' }, { id: 'calm', name: 'Спокойный' }, { id: 'smirk', name: 'Ухмылка' },
  { id: 'laugh', name: 'Смех' }, { id: 'serious', name: 'Серьёзный' }, { id: 'wow', name: 'Удивление' },
];
export const MOUS = [
  { id: null, name: 'Нет' }, { id: 'classic', name: 'Классика' }, { id: 'thick', name: 'Густые' }, { id: 'thin', name: 'Тонкие' },
  { id: 'handle', name: 'Подкрученные' }, { id: 'horse', name: 'Подковой' },
];
export const BEARDS = [
  { id: null, name: 'Нет' }, { id: 'stubble', name: 'Щетина' }, { id: 'short', name: 'Короткая' }, { id: 'full', name: 'Густая' },
  { id: 'long', name: 'Длинная' }, { id: 'goatee', name: 'Эспаньолка' }, { id: 'strap', name: 'Шкиперская' }, { id: 'burns', name: 'Бакенбарды' },
];
export const MARKS = [
  { id: 'freckles', name: 'Веснушки' }, { id: 'blush', name: 'Румянец' }, { id: 'mole', name: 'Родинка' },
  { id: 'scar', name: 'Шрам' }, { id: 'dimple', name: 'Ямочка' },
];

// line — линия роста волос; vol — объём сверху; side — объём по бокам; len — длина; curl/spike — кудри/шипы.
export const HAIR_M = [
  { id: 'bald', name: 'Лысый' },
  { id: 'buzz', name: 'Ёжик', line: 'back', vol: 1, side: 1, buzz: 1 },
  { id: 'short', name: 'Короткая', line: 'back', vol: 5, side: 2.5 },
  { id: 'fringe', name: 'С чёлкой', line: 'fringe', vol: 6, side: 3 },
  { id: 'side', name: 'Набок', line: 'side', vol: 8, side: 3 },
  { id: 'quiff', name: 'Кок', line: 'back', vol: 15, side: 2, front: 1 },
  { id: 'curly', name: 'Кудри', line: 'back', vol: 9, side: 5, curl: 1 },
  { id: 'spiky', name: 'Шипы', line: 'back', vol: 8, side: 2.5, spike: 1 },
  { id: 'mohawk', name: 'Ирокез', line: 'back', vol: 1, side: 1, buzz: 1, extra: 'mohawk' },
  { id: 'recede', name: 'Залысины', line: 'recede', vol: 4, side: 3 },
  { id: 'ring', name: 'Лысина', extra: 'ring' },
  { id: 'mlong', name: 'До плеч', line: 'middle', vol: 6, side: 5, len: 'shoulder' },
  { id: 'mbun', name: 'Пучок', line: 'back', vol: 4, side: 2.5, extra: 'bun' },
];
export const HAIR_F = [
  { id: 'bob', name: 'Каре', line: 'fringe', vol: 7, side: 6, len: 'chin' },
  { id: 'long', name: 'Длинные', line: 'middle', vol: 7, side: 6, len: 'long' },
  { id: 'lside', name: 'Набок', line: 'side', vol: 9, side: 6, len: 'long' },
  { id: 'pony', name: 'Хвост', line: 'back', vol: 6, side: 3, extra: 'pony' },
  { id: 'fbun', name: 'Пучок', line: 'back', vol: 5, side: 3, extra: 'bun' },
  { id: 'braids', name: 'Косы', line: 'middle', vol: 5, side: 3.5, extra: 'braids' },
  { id: 'pixie', name: 'Пикси', line: 'sideLow', vol: 7, side: 3 },
  { id: 'fcurly', name: 'Кудри', line: 'middle', vol: 12, side: 9, curl: 1, len: 'shoulder' },
  { id: 'afro', name: 'Афро', line: 'back', vol: 22, side: 19, curl: 1.3, len: 'afro' },
  { id: 'buns', name: 'Два пучка', line: 'middle', vol: 4, side: 3, extra: 'buns' },
  { id: 'bangs', name: 'С чёлкой', line: 'fringe', vol: 7, side: 6, len: 'long' },
  { id: 'wave', name: 'Волны', line: 'side', vol: 9, side: 7, curl: .45, len: 'shoulder' },
  { id: 'fshort', name: 'Короткая', line: 'back', vol: 6, side: 3 },
];
export const OUTFITS = [
  { id: 'vestO', name: 'Жилет оранжевый', vest: '#ff7417' },
  { id: 'vestY', name: 'Жилет жёлтый', vest: '#f0e11c' },
  { id: 'work', name: 'Рабочая куртка', color: true, def: 8 },
  { id: 'tee', name: 'Футболка', color: true, def: 4 },
  { id: 'hoodie', name: 'Худи', color: true, def: 2 },
  { id: 'shirt', name: 'Рубашка', color: true, def: 0 },
  { id: 'jacket', name: 'Пиджак', color: true, def: 1 },
  { id: 'sweater', name: 'Свитер', color: true, def: 9 },
];
export const HATS = [
  { id: null, name: 'Нет' }, { id: 'cap', name: 'Кепка' }, { id: 'beanie', name: 'Шапка' }, { id: 'helmet', name: 'Каска' },
  { id: 'peaked', name: 'Фуражка', premium: true },
];
export const GLASSES = [
  { id: null, name: 'Нет' }, { id: 'round', name: 'Круглые' }, { id: 'square', name: 'Прямые' }, { id: 'wide', name: 'Широкие' },
  { id: 'aviator', name: 'Капли' }, { id: 'cat', name: 'Кошачьи' }, { id: 'sun', name: 'Тёмные' },
];
export const EARRINGS = [{ id: null, name: 'Нет' }, { id: 'stud', name: 'Гвоздики' }, { id: 'hoop', name: 'Кольца' }, { id: 'drop', name: 'Капли' }];
export const PIERCING = [{ id: null, name: 'Нет' }, { id: 'nose', name: 'В носу' }, { id: 'brow', name: 'В брови' }, { id: 'lip', name: 'В губе' }];
export const BG = [
  { id: 'mist', name: 'Туман', c: '#dde2ea' }, { id: 'sand', name: 'Песок', c: '#f1e2c8' }, { id: 'mint', name: 'Мята', c: '#cfe6d8' },
  { id: 'sky', name: 'Небо', c: '#cddcf3' }, { id: 'rose', name: 'Роза', c: '#f3d3d6' }, { id: 'lilac', name: 'Сирень', c: '#ddd3f2' },
  { id: 'peach', name: 'Персик', c: '#f8d9c2' }, { id: 'night', name: 'Ночь', c: '#262c3d' }, { id: 'pine', name: 'Хвоя', c: '#1f3b36' },
  { id: 'sunset', name: 'Закат', scene: true }, { id: 'ocean', name: 'Океан', scene: true, premium: true }, { id: 'depot', name: 'Депо', scene: true, premium: true },
];
// Премиум-детали: примерить можно, сохранить пока нельзя
export const PREMIUM = { hat: ['peaked'], bg: ['ocean', 'depot'], mazut: true };

// ── Геометрия ────────────────────────────────────────────────────
function smooth(p, closed = true) {
  const n = p.length, m = closed ? n : n - 1;
  let d = `M${f1(p[0][0])},${f1(p[0][1])}`;
  for (let i = 0; i < m; i++) {
    const p0 = p[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[closed ? (i + 2) % n : Math.min(i + 2, n - 1)];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

function geom(a) {
  const H = HEADS.find(h => h.id === a.head) || HEADS[0];
  const young = a.age < 26 ? (26 - a.age) / 8 * .05 : 0;
  const rx = H.rx * (a.faceW ?? 1), ry = H.ry, cx = 100, cy = 86;
  const jaw = Math.min(1.12, H.jaw + young);
  const at = t => {
    const c = Math.cos(t), s = Math.sin(t);
    const x = rx * spow(c, 2 / H.n), y = ry * spow(s, 2 / H.n), v = y / ry;
    const k = v < 0 ? 1 + (H.top - 1) * -v : 1 + (jaw - 1) * Math.pow(v, 1.6);
    return [cx + x * k, cy + y];
  };
  const pts = []; for (let i = 0; i < 120; i++) pts.push(at(i / 120 * Math.PI * 2));
  const hw = y => {
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      if (p[0] < cx || q[0] < cx || (p[1] - y) * (q[1] - y) > 0) continue;
      const t = p[1] === q[1] ? 0 : (y - p[1]) / (q[1] - p[1]);
      best = Math.max(best, p[0] + (q[0] - p[0]) * t - cx);
    }
    return best;
  };
  // угол на контуре для высоты y (с левой стороны: π - α … с правой: 2π + α)
  const tAt = y => { const r = clamp((y - cy) / ry, -1, 1); return Math.asin(spow(r, H.n / 2)); };
  const grow = (t, d) => { const p = at(t), dx = p[0] - cx, dy = p[1] - cy, L = Math.hypot(dx, dy) || 1; return [p[0] + dx / L * d, p[1] + dy / L * d]; };
  return { H, rx, ry, cx, cy, at, pts, hw, tAt, grow, top: cy - ry, chin: cy + ry, path: smooth(pts) };
}

let U = 0;
const cel = (id, d, base, sh, dx = -4, dy = -3) =>
  `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${sh || dk(base, .2)}"/><g clip-path="url(#${id})"><path d="${d}" fill="${base}" transform="translate(${dx} ${dy})"/></g>`;

// ── Фон ──────────────────────────────────────────────────────────
function background(id, u) {
  const b = BG.find(x => x.id === id) || BG[0];
  if (!b.scene) {
    const dark = id === 'night' || id === 'pine';
    return `<rect width="200" height="200" fill="${b.c}"/><circle cx="100" cy="92" r="74" fill="${dark ? lt(b.c, .08) : lt(b.c, .35)}"/>` +
      `<circle cx="100" cy="92" r="52" fill="${dark ? lt(b.c, .13) : lt(b.c, .55)}" opacity=".6"/>`;
  }
  if (id === 'sunset') return `<linearGradient id="${u}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2f63"/><stop offset=".55" stop-color="#e2667a"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>` +
    `<rect width="200" height="200" fill="url(#${u}sk)"/><circle cx="148" cy="128" r="26" fill="#ffd38a"/>` +
    `<path d="M0,150 L14,122 L26,146 L40,112 L54,146 L66,126 L78,150 L122,150 L134,118 L146,146 L160,108 L174,144 L188,120 L200,140 V200 H0Z" fill="#1d2a3a"/>` +
    `<path d="M0,170 H200 V200 H0Z" fill="#142030"/>`;
  if (id === 'ocean') return `<linearGradient id="${u}sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6cc6f0"/><stop offset="1" stop-color="#c9f0ff"/></linearGradient>` +
    `<rect width="200" height="200" fill="url(#${u}sk)"/><circle cx="40" cy="44" r="16" fill="#fff4b8"/>` +
    `<path d="M0,128 H200 V170 H0Z" fill="#1f8fc4"/><path d="M0,134 Q25,130 50,134 T100,134 T150,134 T200,134" fill="none" stroke="#8fdcff" stroke-width="2"/>` +
    `<path d="M0,150 Q30,146 60,150 T120,150 T180,150" fill="none" stroke="#63c1ea" stroke-width="2"/><path d="M0,166 Q100,150 200,166 V200 H0Z" fill="#f3d9a0"/>` +
    `<path d="M170,200 C168,170 172,140 180,110" fill="none" stroke="#7a5333" stroke-width="7" stroke-linecap="round"/>` +
    `<g fill="#2f9b55"><path d="M180,110 C160,98 140,104 128,118 C146,108 162,108 180,112Z"/><path d="M180,110 C190,92 204,90 214,96 C202,98 192,104 181,112Z"/><path d="M180,110 C176,90 162,80 146,82 C162,88 172,98 179,112Z"/><path d="M180,110 C196,108 210,118 212,132 C202,120 192,116 180,113Z"/></g>`;
  // depot
  const loco = (x, c) => `<g transform="translate(${x} 0)"><rect x="-17" y="104" width="34" height="58" rx="7" fill="${c}"/><rect x="-13" y="112" width="26" height="16" rx="3" fill="#bfe3ff"/>` +
    `<rect x="-17" y="140" width="34" height="5" fill="#f2c14e"/><circle cx="-9" cy="152" r="3.4" fill="#fff6c0"/><circle cx="9" cy="152" r="3.4" fill="#fff6c0"/><circle cx="0" cy="108" r="2.6" fill="#fff6c0"/></g>`;
  return `<rect width="200" height="200" fill="#b9d3e8"/><rect y="72" width="200" height="110" fill="#9b5a46"/><path d="M0,72 L100,46 L200,72Z" fill="#7d4535"/>` +
    `<g fill="#3b2a2a"><path d="M10,182 V112 A22,22 0 0 1 54,112 V182Z"/><path d="M146,182 V112 A22,22 0 0 1 190,112 V182Z"/><path d="M78,182 V112 A22,22 0 0 1 122,112 V182Z"/></g>` +
    loco(32, '#2f7a5a') + loco(168, '#c0453a') + `<rect y="168" width="200" height="32" fill="#4a4f5a"/><path d="M0,182 H200 M0,192 H200" stroke="#a9afb9" stroke-width="2"/>`;
}

// ── Причёски ─────────────────────────────────────────────────────
const LINES = {
  back: [[.8, -.47], [.45, -.6], [0, -.64], [-.45, -.6], [-.8, -.47]],
  fringe: [[.84, -.35], [.56, -.31], [.3, -.36], [0, -.32], [-.3, -.36], [-.56, -.31], [-.84, -.35]],
  side: [[.84, -.34], [.5, -.4], [.1, -.5], [-.35, -.62], [-.62, -.6], [-.82, -.5]],
  sideLow: [[.86, -.3], [.45, -.29], [0, -.36], [-.4, -.5], [-.7, -.55], [-.84, -.46]],
  middle: [[.84, -.4], [.5, -.52], [.15, -.64], [0, -.72], [-.15, -.64], [-.5, -.52], [-.84, -.4]],
  recede: [[.6, -.8], [.34, -.66], [0, -.6], [-.34, -.66], [-.6, -.8]],
};
function findHair(a) { return [...HAIR_M, ...HAIR_F].find(h => h.id === a.hair) || HAIR_M[2]; }

function hairParts(a, g, hc, u, clip) {
  const S = findHair(a), out = { back: '', mid: '', front: '' };
  if (!S.line && !S.extra) return out;
  const { cx, cy, ry, hw } = g, sh = dk(hc, .3), hi = lt(hc, .32);
  const len = S.len || 'short';
  const ys = len === 'short' ? cy - 2 : len === 'afro' ? cy + ry * .3 : cy + ry * .38;
  const inset = len === 'short' ? 3 : 5;
  const vol = S.vol || 0, side = S.side || 0, curl = S.curl || 0, spike = S.spike || 0;
  const d = t => {
    const up = -Math.sin(t);
    let v = 1.4 + side * clamp((up + .35) / .6, 0, 1) + vol * Math.pow(Math.max(0, up), 1.3) * (S.front ? 1 + .5 * Math.max(0, Math.cos(t) * -1) : 1);
    if (curl) v += curl * 3.2 * (.5 + .5 * Math.cos(t * 26)) * clamp((up + .5) / .6, 0, 1);
    if (spike) { const s = (t * 30 / Math.PI) % 2; v += spike * 7 * Math.max(0, 1 - Math.abs(s - 1) * 2.2) * Math.max(0, up); }
    return v;
  };
  // задние пряди (длинные волосы за плечами)
  if (len === 'chin' || len === 'shoulder' || len === 'long') {
    const W = hw(cy) + side + 3, yb = len === 'chin' ? cy + ry * .78 : len === 'shoulder' ? 166 : 202, nw = buildOf(a).nw - 1;
    const sideP = s => { const r = []; for (let i = 0; i <= 6; i++) { const y = cy - ry * .2 + (yb - 6 - (cy - ry * .2)) * i / 6; r.push([cx + s * (W + (curl ? curl * 3 * Math.sin(i * 1.7) : i * .6)), y]); } return s > 0 ? r : r.reverse(); };
    const top = []; for (let i = 0; i <= 10; i++) { const t = Math.PI + .25 + i / 10 * (Math.PI - .5); top.push(g.grow(t, d(t) + 1)); }
    const outer = [...sideP(-1), [cx - W + 4, yb], ...top.reverse().reverse()];
    const pts = [[cx - W * .96 + 3, yb], ...sideP(-1).reverse(), ...top, ...sideP(1), [cx + W * .96 - 3, yb]];
    void outer;
    const path = smooth(pts, false) + `L${f1(cx + nw)},${f1(yb)}L${f1(cx + nw)},${cy}L${f1(cx - nw)},${cy}L${f1(cx - nw)},${f1(yb)}Z`;
    out.back += `<g clip-path="url(#${clip})">${cel(u + 'hb', path, dk(hc, .12), dk(hc, .34), -3, -3)}</g>`;
  }
  // элементы позади шапки волос
  if (S.extra === 'bun') { const r = a.sex === 'f' ? 13 : 10, y = g.top - vol - r * .55; out.mid += `<g clip-path="url(#${clip})">${cel(u + 'bn', circ(cx + 1, y, r), hc, sh)}<path d="M${cx - r * .7},${f1(y + r * .75)} Q${cx},${f1(y + r * 1.05)} ${cx + r * .7},${f1(y + r * .75)}" stroke="${dk(hc, .45)}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>`; }
  if (S.extra === 'buns') for (const s of [-1, 1]) out.mid += `<g clip-path="url(#${clip})">${cel(u + 'bs' + s, circ(cx + s * g.rx * .66, g.top + 6, 11), hc, sh)}</g>`;
  if (S.extra === 'pony') {
    const x = cx + g.rx * .55, y = g.top + 4;
    out.back = `<g clip-path="url(#${clip})">${cel(u + 'pn', `M${f1(x - 8)},${f1(y + 4)} C${f1(x + 30)},${f1(y - 8)} ${f1(x + 34)},${f1(cy + 30)} ${f1(x + 16)},${f1(cy + ry + 26)} C${f1(x + 18)},${f1(cy + 20)} ${f1(x + 8)},${f1(y + 26)} ${f1(x - 6)},${f1(y + 20)}Z`, dk(hc, .06), dk(hc, .32), 3, -3)}</g>` + out.back;
  }
  if (S.extra === 'braids') {
    for (const s of [-1, 1]) {
      const x0 = cx + s * (hw(cy + ry * .45) + 1.5); let b = '';
      for (let y = cy + ry * .42, i = 0; y < 192; y += 8.5, i++) b += `<ellipse cx="${f1(x0 + s * Math.min(i, 4) * 1.2)}" cy="${f1(y)}" rx="6" ry="6.4" transform="rotate(${(i % 2 ? 25 : -25) * s} ${f1(x0 + s * Math.min(i, 4) * 1.2)} ${f1(y)})" fill="${i % 2 ? hc : dk(hc, .12)}" stroke="${dk(hc, .35)}" stroke-width="1"/>`;
      out.braids = (out.braids || '') + b;
    }
  }
  if (S.extra === 'ring') {
    const ysr = cy + 3;
    for (const s of [-1, 1]) {
      const t0 = s < 0 ? Math.PI - g.tAt(ysr) : 2 * Math.PI + g.tAt(ysr), t1 = s < 0 ? Math.PI + .78 : 2 * Math.PI - .78, o = [], i2 = [];
      for (let i = 0; i <= 8; i++) { const t = t0 + (t1 - t0) * i / 8; o.push(g.grow(t, 3 - i * .15)); i2.unshift(g.grow(t, -2.6 + i * .25)); }
      out.front += cel(u + 'rg' + s, smooth([...o, ...i2]), hc, sh, -2, -1);
    }
    return out;
  }
  // шапка волос
  const t0 = Math.PI - g.tAt(ys), t1 = 2 * Math.PI + g.tAt(ys), outer = [];
  const N = curl || spike ? 150 : 44;
  for (let i = 0; i <= N; i++) { const t = t0 + (t1 - t0) * i / N; outer.push(g.grow(t, d(t))); }
  const F = hw(cy - ry * .5), L = LINES[S.line] || LINES.back, yt = cy + L[0][1] * ry;
  const inner = [];
  const sideIn = (s, yA, yB, n) => { for (let i = 0; i <= n; i++) { const y = yA + (yB - yA) * i / n; inner.push([cx + s * (hw(y) - inset), y]); } };
  sideIn(1, ys, (ys + yt) / 2, len === 'short' ? 1 : 3);
  for (const [x, y] of L) inner.push([cx + x * F, cy + y * ry + (curl && S.line !== 'back' ? curl * 1.5 * Math.sin(x * 14) : 0)]);
  sideIn(-1, (ys + yt) / 2, ys, len === 'short' ? 1 : 3);
  const cap = smooth([...outer, ...inner]);
  const fill = S.buzz ? mix(hc, SKIN[a.skin] || SKIN[3], .38) : hc;
  let s = cel(u + 'hc', cap, fill, S.buzz ? dk(fill, .12) : sh, -4, -3);
  if (!S.buzz) {
    const hl = []; for (let i = 0; i <= 10; i++) { const t = Math.PI + .5 + i / 10 * 1.0; hl.push(g.grow(t, d(t) - 4.5)); }
    s += `<path d="${smooth(hl, false)}" fill="none" stroke="${hi}" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>`;
    const k = Math.floor(L.length / 2);
    for (const j of [k - 1, k + 1].filter(j => j > 0 && j < L.length - 1)) {
      const p = [cx + L[j][0] * F, cy + L[j][1] * ry], q = g.grow(Math.PI * 1.5 + L[j][0] * .5, d(Math.PI * 1.5) - 3);
      s += `<path d="M${f1(p[0])},${f1(p[1] - 1.5)} Q${f1((p[0] + q[0]) / 2 + 5)},${f1((p[1] + q[1]) / 2)} ${f1(q[0])},${f1(q[1])}" stroke="${dk(hc, .38)}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".55"/>`;
    }
  }
  if (S.extra === 'mohawk') {
    const y0 = cy - ry * .6, tp = g.top - 26;
    s += cel(u + 'mh', `M${cx - 6},${f1(y0)} C${cx - 10},${f1(tp + 18)} ${cx - 8},${f1(tp + 6)} ${cx + 1},${f1(tp)} C${cx + 3},${f1(tp + 10)} ${cx + 10},${f1(tp + 18)} ${cx + 6},${f1(y0)}Z`, hc === fill ? hc : HAIR_C[a.hairC] || hc, sh, -3, -2);
  }
  out.front += `<g clip-path="url(#${clip})">${s}</g>`;
  return out;
}
const circ = (x, y, r) => `M${f1(x - r)},${f1(y)}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`;
const buildOf = a => { const b = BUILDS.find(x => x.id === a.build) || BUILDS[1]; return a.sex === 'f' ? { ...b, sw: b.sw - 6, nw: b.nw - 1.5 } : b; };

// ── Тело и одежда ────────────────────────────────────────────────
function torso(sw, nw, neck, depth) {
  const L = 100 - sw, R = 100 + sw, a = 100 - nw - 3, b = 100 + nw + 3;
  const top = neck === 'v' ? `L100,${150 + depth}L${b},150` : `Q100,${150 + depth * 2} ${b},150`;
  return `M${L},206C${L},176 ${L + 8},160 ${a - 12},154Q${a - 3},151 ${a},150${top}Q${b + 3},151 ${b + 12},154C${R - 8},160 ${R},176 ${R},206Z`;
}
function clothes(a, u) {
  const { sw, nw } = buildOf(a), o = OUTFITS.find(x => x.id === a.outfit) || OUTFITS[0];
  const c = o.vest ? '#2c323e' : CLOTH_C[a.outfitC ?? o.def] || CLOTH_C[o.def];
  const L = 100 - sw, R = 100 + sw, A = 100 - nw - 3, B = 100 + nw + 3;
  const seams = col => `<path d="M${L + 17},158 Q${L + 11},180 ${L + 13},206 M${R - 17},158 Q${R - 11},180 ${R - 13},206" stroke="${col}" stroke-width="1.4" fill="none" opacity=".55"/>`;
  let back = '', s = '';
  if (o.id === 'hoodie') back = `<path d="M${A - 16},158 C${A - 22},128 ${B + 22},128 ${B + 16},158Z" fill="${dk(c, .3)}"/>`;
  if (o.id === 'jacket') {
    s += cel(u + 'sh', torso(sw, nw, 'crew', 2), '#f4f4f1', '#d6d8de');
    s += `<path d="M100,152 L96,160 L100,163 L104,160Z" fill="#b33a3a"/><path d="M98.5,162 L96,190 L100,196 L104,190 L101.5,162Z" fill="#c8423f"/>`;
    s += cel(u + 'cl', torso(sw, nw, 'v', 38), c);
    s += `<path d="M${A - 2},151 L${100 - 5},${186} M${B + 2},151 L${100 + 5},186" stroke="${lt(c, .25)}" stroke-width="2.2" fill="none"/>`;
    s += `<path d="M${A + 1},149 L${A - 7},157 L97,166Z M${B - 1},149 L${B + 7},157 L103,166Z" fill="#fafafa" stroke="#d6d8de" stroke-width=".8"/>`;
    return { back, s: s + seams(dk(c, .35)) };
  }
  if (o.id === 'shirt') {
    s += cel(u + 'cl', torso(sw, nw, 'v', 16), c);
    s += `<path d="M${A + 1},148 L${A - 9},158 L98.5,167Z M${B - 1},148 L${B + 9},158 L101.5,167Z" fill="${lt(c, .3)}" stroke="${dk(c, .2)}" stroke-width=".9"/>`;
    s += `<path d="M100,167 V206" stroke="${dk(c, .18)}" stroke-width="1.2"/>` + [176, 188, 200].map(y => `<circle cx="102.5" cy="${y}" r="1.4" fill="${dk(c, .3)}"/>`).join('');
    return { back, s: s + seams(dk(c, .25)) };
  }
  if (o.id === 'sweater') {
    s += cel(u + 'cl', torso(sw, nw, 'crew', 0), c);
    for (let x = L + 8; x < R - 4; x += 7) s += `<path d="M${x},172 V206" stroke="${dk(c, .14)}" stroke-width="1" opacity=".6"/>`;
    s += cel(u + 'tn', `M${100 - nw - 2},136 Q100,132 ${100 + nw + 2},136 L${100 + nw + 4},153 Q100,158 ${100 - nw - 4},153Z`, lt(c, .06), dk(c, .2), -3, -1);
    for (let i = -2; i <= 2; i++) s += `<path d="M${f1(100 + i * nw / 2.6)},137 L${f1(100 + i * nw / 2.4)},155" stroke="${dk(c, .2)}" stroke-width="1" opacity=".7"/>`;
    return { back, s: s + seams(dk(c, .3)) };
  }
  if (o.id === 'work') {
    s += cel(u + 'cl', torso(sw, nw, 'crew', 1), c);
    s += `<clipPath id="${u}wy"><path d="${torso(sw, nw, 'crew', 1)}"/></clipPath><g clip-path="url(#${u}wy)"><path d="M0,150 H200 V166 Q100,160 0,166Z" fill="#e9702a"/><rect y="182" width="200" height="8" fill="#c9d0d8"/><rect y="183" width="200" height="2" fill="#f4f7fa"/></g>`;
    s += `<path d="M${100 - nw - 3},142 Q100,146 ${100 + nw + 3},142 L${100 + nw + 4},153 Q100,160 ${100 - nw - 4},153Z" fill="${dk(c, .15)}"/><path d="M100,153 V206" stroke="#c9d0d8" stroke-width="1.6"/>`;
    return { back, s: s + seams(dk(c, .4)) };
  }
  // футболка, худи и поддёвка под жилетом
  s += cel(u + 'cl', torso(sw, nw, 'crew', o.id === 'hoodie' ? 6 : 7), c);
  s += `<path d="M${A},150 Q100,${150 + (o.id === 'hoodie' ? 12 : 14)} ${B},150" stroke="${dk(c, .22)}" stroke-width="2.6" fill="none"/>`;
  if (o.id === 'hoodie') {
    s += `<path d="M${A - 9},153 Q100,180 ${B + 9},153" stroke="${lt(c, .12)}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M95,168 Q94,182 95,192 M105,168 Q106,182 105,192" stroke="#f1f1ee" stroke-width="1.6" fill="none"/><rect x="93.6" y="191" width="2.8" height="5" rx="1" fill="#c8ccd3"/><rect x="103.6" y="191" width="2.8" height="5" rx="1" fill="#c8ccd3"/>`;
  }
  s += seams(dk(c, .3));
  if (o.vest) {
    const v = o.vest, panel = sgn => {
      const X = x => 100 + sgn * x;
      return `M${X(nw + 3)},150 Q${X(nw + 14)},153 ${X(sw - 18)},157 Q${X(sw - 10)},178 ${X(sw - 12)},206 L${X(1.5)},206 L${X(1.5)},${172} Q${X(nw * .6)},160 ${X(nw + 3)},150Z`;
    };
    const vp = panel(-1) + panel(1);
    s += `<clipPath id="${u}vs"><path d="${vp}"/></clipPath>` + `<path d="${vp}" fill="${dk(v, .2)}"/><g clip-path="url(#${u}vs)"><path d="${vp}" fill="${v}" transform="translate(-4 -3)"/>` +
      `<rect y="178" width="200" height="8" fill="#b9c1ca"/><rect y="179" width="200" height="2.4" fill="#eef3f7"/><rect y="194" width="200" height="8" fill="#b9c1ca"/><rect y="195" width="200" height="2.4" fill="#eef3f7"/></g>` +
      `<path d="M${100 - sw + 18},157 Q${100 - sw + 10},178 ${100 - sw + 12},206 M${100 + sw - 18},157 Q${100 + sw - 10},178 ${100 + sw - 12},206" stroke="${dk(v, .3)}" stroke-width="1.2" fill="none"/>`;
  }
  return { back, s };
}

// ── Лицо ─────────────────────────────────────────────────────────
function eyes(a, g, u) {
  const s = (a.eyeS ?? 1) * (a.age < 24 ? 1.04 : 1), ey = g.cy + 2;
  const ex = Math.min(g.rx * .41 * (a.eyeGap ?? 1), g.hw(ey) - 10 * s);
  const ink = '#2a1b22', ic = EYE_C[a.eyeC] || EYE_C[0], skin = SKIN[a.skin] || SKIN[3];
  let r = '';
  for (const fl of [-1, 1]) {
    const x0 = g.cx + fl * ex, P = (dx, dy) => `${f1(x0 + fl * dx * s)},${f1(ey + dy * s)}`, id = `${u}e${fl}`;
    if (a.mouth === 'laugh') { r += `<path d="M${P(-6, 1.5)} Q${P(0, -5)} ${P(6, 1.5)}" stroke="${ink}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`; continue; }
    if (a.eyes === 'dots') { r += `<ellipse cx="${f1(x0)}" cy="${ey}" rx="${f1(2.7 * s)}" ry="${f1(3.4 * s)}" fill="${ink}"/><circle cx="${f1(x0 - .9 * s)}" cy="${f1(ey - 1.3 * s)}" r="${f1(.9 * s)}" fill="#fff"/>`; continue; }
    let sc, top, ir = 3.9, ic0 = [0.3, -.2];
    if (a.eyes === 'round' || a.eyes === 'big') {
      const k = a.eyes === 'big' ? 1.16 : 1; ir = a.eyes === 'big' ? 5 : 4.1; ic0 = [0, 0];
      sc = `M${P(-6.4 * k, 0)} A${f1(6.4 * k * s)},${f1(6.7 * k * s)} 0 1 1 ${P(6.4 * k, 0)} A${f1(6.4 * k * s)},${f1(6.7 * k * s)} 0 1 1 ${P(-6.4 * k, 0)}Z`;
      top = `M${P(-6.6 * k, .5)} A${f1(6.6 * k * s)},${f1(6.9 * k * s)} 0 0 ${fl > 0 ? 1 : 0} ${P(6.6 * k, .5)}`;
    } else {
      const hy = a.eyes === 'narrow' ? 3.3 : 5.6, hl = a.eyes === 'narrow' ? 2.6 : 4.6;
      const o = a.eyes === 'up' ? -3 : a.eyes === 'down' ? 2.2 : -1.2, i0 = a.eyes === 'down' ? -.8 : .5;
      sc = `M${P(-7, i0)} Q${P(-.5, -hy * 1.75)} ${P(7.2, o)} Q${P(.5, hl * 1.45)} ${P(-7, i0)}Z`;
      top = `M${P(-7.3, i0 + .2)} Q${P(-.5, -hy * 1.8)} ${P(7.5, o - .2)}`;
      if (a.eyes === 'narrow') ir = 3.2;
    }
    r += `<clipPath id="${id}"><path d="${sc}"/></clipPath><path d="${sc}" fill="#fbfbf8"/><g clip-path="url(#${id})">` +
      `<circle cx="${f1(x0 + fl * ic0[0] * s)}" cy="${f1(ey + ic0[1] * s)}" r="${f1(ir * s)}" fill="${ic}"/><circle cx="${f1(x0 + fl * ic0[0] * s)}" cy="${f1(ey + ic0[1] * s)}" r="${f1(ir * s)}" fill="none" stroke="${dk(ic, .35)}" stroke-width="1"/>` +
      `<circle cx="${f1(x0 + fl * ic0[0] * s)}" cy="${f1(ey + ic0[1] * s)}" r="${f1(ir * .5 * s)}" fill="#160f12"/>` +
      `<path d="${sc}" fill="none" stroke="${dk(skin, .15)}" stroke-width="3" opacity=".35" transform="translate(0 ${f1(-2.2 * s)})"/></g>` +
      `<circle cx="${f1(x0 + fl * (ic0[0] - 1.3) * s)}" cy="${f1(ey + (ic0[1] - 1.6) * s)}" r="${f1(1.25 * s)}" fill="#fff"/>` +
      (a.eyes === 'big' ? `<circle cx="${f1(x0 + fl * 1.8 * s)}" cy="${f1(ey + 1.8 * s)}" r="${f1(.7 * s)}" fill="#fff" opacity=".8"/>` : '');
    if (a.eyes === 'sleepy') r += `<path d="M${P(-7.6, .2)} Q${P(-.5, -10)} ${P(7.8, -1.6)} L${P(7.8, -.6)} Q${P(0, -2.6)} ${P(-7.6, 1)}Z" fill="${dk(skin, .06)}"/><path d="M${P(-7.4, .9)} Q${P(0, -2.4)} ${P(7.6, -.7)}" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
    else r += `<path d="${top}" stroke="${ink}" stroke-width="${a.sex === 'f' ? 2.3 : 1.8}" fill="none" stroke-linecap="round"/>`;
    if (a.sex === 'f' && a.eyes !== 'sleepy') { const e = a.eyes === 'round' || a.eyes === 'big' ? [6.2, -1.5] : [7.2, a.eyes === 'up' ? -3 : a.eyes === 'down' ? 2.2 : -1.2]; r += `<path d="M${P(e[0], e[1])} l${f1(fl * 2.6 * s)},${f1(-2.4 * s)} M${P(e[0] - 1.8, e[1] - 1.5)} l${f1(fl * 1.6 * s)},${f1(-2.6 * s)}" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`; }
  }
  return { r, ey, ex, s };
}
function brows(a, g, E, color) {
  const { ey, ex, s } = E, by = ey - 8.5 * s - 3.5, w = { thick: 3.8, thin: 1.6, bushy: 4.4 }[a.brows] || (a.sex === 'f' ? 2.1 : 2.8);
  let r = '';
  for (const fl of [-1, 1]) {
    const X = dx => f1(g.cx + fl * (ex + dx)), Y = dy => f1(by + dy);
    let d;
    switch (a.brows) {
      case 'arch': d = `M${X(-7)},${Y(1.5)} Q${X(0)},${Y(-4.5)} ${X(8)},${Y(1)}`; break;
      case 'angle': d = `M${X(-7)},${Y(1)} L${X(3)},${Y(-2.6)} L${X(8.5)},${Y(1.6)}`; break;
      case 'worry': d = `M${X(-7)},${Y(-2.5)} Q${X(0)},${Y(-1)} ${X(8)},${Y(2)}`; break;
      default: d = `M${X(-7)},${Y(.6)} Q${X(0)},${Y(-1.6)} ${X(8)},${Y(.4)}`;
    }
    r += `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (a.brows === 'bushy') r += `<path d="M${X(-5)},${Y(-1)} l${fl * -1.5},-2.2 M${X(0)},${Y(-1.8)} l${fl * -.5},-2.6 M${X(5)},${Y(-1.2)} l${fl * 1.2},-2.2" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return { r, by };
}
function nose(a, g, skin, u) {
  const cx = g.cx, ny = g.cy + g.ry * .32, k = a.noseS ?? 1, sh = dk(skin, .28), st = `stroke="${sh}" stroke-width="1.8" fill="none" stroke-linecap="round"`;
  const hl = `<ellipse cx="${f1(cx - 1)}" cy="${f1(ny - .5)}" rx="${f1(1.8 * k)}" ry="${f1(1.3 * k)}" fill="${lt(skin, .5)}" opacity=".7"/>`;
  switch (a.nose) {
    case 'round': return cel(u + 'ns', circ(cx, ny + 1, 5.6 * k), dk(skin, .02), dk(skin, .16), -1.5, -1.5) + hl;
    case 'long': return `<path d="M${cx + 2.5},${f1(g.cy + 4)} Q${f1(cx + 4.5 * k)},${f1(ny - 3)} ${f1(cx + 3.8 * k)},${f1(ny + 3)}" ${st} opacity=".6"/><path d="M${f1(cx - 4 * k)},${f1(ny + 4)} Q${cx},${f1(ny + 7.5 * k)} ${f1(cx + 4.5 * k)},${f1(ny + 3.4)}" ${st}/>` + hl;
    case 'wide': return `<path d="M${f1(cx - 7 * k)},${f1(ny + 1)} Q${f1(cx - 8.5 * k)},${f1(ny + 5.5)} ${f1(cx - 4 * k)},${f1(ny + 5)} Q${cx},${f1(ny + 7.5)} ${f1(cx + 4 * k)},${f1(ny + 5)} Q${f1(cx + 8.5 * k)},${f1(ny + 5.5)} ${f1(cx + 7 * k)},${f1(ny + 1)}" ${st}/><circle cx="${f1(cx - 3 * k)}" cy="${f1(ny + 3.6)}" r="1.1" fill="${sh}"/><circle cx="${f1(cx + 3 * k)}" cy="${f1(ny + 3.6)}" r="1.1" fill="${sh}"/>` + hl;
    case 'pointy': return `<path d="M${cx + .5},${f1(ny - 11 * k)} L${f1(cx + 4.8 * k)},${f1(ny + 3)} Q${cx + 1},${f1(ny + 5.5 * k)} ${f1(cx - 2.5 * k)},${f1(ny + 3.6)}Z" fill="${sh}" opacity=".45"/><path d="M${f1(cx - 2.5 * k)},${f1(ny + 3.6)} Q${cx + 1},${f1(ny + 5.5 * k)} ${f1(cx + 4.8 * k)},${f1(ny + 3)}" ${st}/>`;
    case 'hook': return `<path d="M${cx + 1},${f1(g.cy + 4)} Q${f1(cx + 7 * k)},${f1(ny - 5)} ${f1(cx + 4.5 * k)},${f1(ny + 2.5)} Q${cx + 2},${f1(ny + 6 * k)} ${f1(cx - 3 * k)},${f1(ny + 3.5)}" ${st}/>` + hl;
    case 'small': return `<path d="M${f1(cx - 2.4 * k)},${f1(ny + 3)} Q${cx},${f1(ny + 4.8 * k)} ${f1(cx + 2.4 * k)},${f1(ny + 3)}" ${st}/>`;
    case 'snub': return `<path d="M${f1(cx - 4.2 * k)},${f1(ny + .5)} Q${cx},${f1(ny + 4.6 * k)} ${f1(cx + 4.2 * k)},${f1(ny + .5)}" ${st}/><ellipse cx="${f1(cx - 2 * k)}" cy="${f1(ny + 1.6)}" rx="1.2" ry="1.6" fill="${dk(skin, .4)}"/><ellipse cx="${f1(cx + 2 * k)}" cy="${f1(ny + 1.6)}" rx="1.2" ry="1.6" fill="${dk(skin, .4)}"/>` + hl;
    default: return `<ellipse cx="${cx}" cy="${f1(ny + 1)}" rx="${f1(4.4 * k)}" ry="${f1(3.5 * k)}" fill="${dk(skin, .07)}"/><path d="M${f1(cx - 4.6 * k)},${f1(ny + 1.8)} Q${cx},${f1(ny + 6.2 * k)} ${f1(cx + 4.6 * k)},${f1(ny + 1.8)}" ${st}/>` + hl;
  }
}
function mouth(a, g, skin, u) {
  const cx = g.cx, my = g.cy + g.ry * .56, mw = 8 * (a.faceW ?? 1), ink = dk(skin, .62), lip = LIP_C[a.lips] || null;
  const st = `stroke="${ink}" stroke-width="2.1" fill="none" stroke-linecap="round"`;
  const lips = lip ? `<path d="M${f1(cx - mw * .8)},${f1(my + 1)} Q${cx},${f1(my + 7.5)} ${f1(cx + mw * .8)},${f1(my + 1)}Z" fill="${lip}"/><path d="M${f1(cx - mw * .8)},${f1(my + .6)} Q${f1(cx - mw * .4)},${f1(my - 3)} ${cx},${f1(my - 1)} Q${f1(cx + mw * .4)},${f1(my - 3)} ${f1(cx + mw * .8)},${f1(my + .6)}Z" fill="${dk(lip, .12)}"/>` : '';
  switch (a.mouth) {
    case 'grin': return `<clipPath id="${u}mo"><path d="M${f1(cx - mw - 1)},${f1(my - 1)} Q${cx},${f1(my + 12)} ${f1(cx + mw + 1)},${f1(my - 1)} Q${cx},${f1(my + 1)} ${f1(cx - mw - 1)},${f1(my - 1)}Z"/></clipPath><path d="M${f1(cx - mw - 1)},${f1(my - 1)} Q${cx},${f1(my + 12)} ${f1(cx + mw + 1)},${f1(my - 1)} Q${cx},${f1(my + 1)} ${f1(cx - mw - 1)},${f1(my - 1)}Z" fill="#5a1d25"/><g clip-path="url(#${u}mo)"><rect x="${cx - 12}" y="${f1(my - 2)}" width="24" height="5.2" fill="#fff"/><ellipse cx="${cx}" cy="${f1(my + 8)}" rx="5" ry="3" fill="#e0707a"/></g>` + (lip ? `<path d="M${f1(cx - mw - 1)},${f1(my - 1)} Q${cx},${f1(my + 12)} ${f1(cx + mw + 1)},${f1(my - 1)}" stroke="${lip}" stroke-width="2" fill="none"/>` : '');
    case 'laugh': return `<clipPath id="${u}mo"><path d="M${f1(cx - mw - 2)},${f1(my - 2)} Q${cx},${f1(my + 17)} ${f1(cx + mw + 2)},${f1(my - 2)}Z"/></clipPath><path d="M${f1(cx - mw - 2)},${f1(my - 2)} Q${cx},${f1(my + 17)} ${f1(cx + mw + 2)},${f1(my - 2)}Z" fill="#5a1d25"/><g clip-path="url(#${u}mo)"><rect x="${cx - 12}" y="${f1(my - 3)}" width="24" height="4.6" fill="#fff"/><ellipse cx="${cx}" cy="${f1(my + 10)}" rx="6" ry="4" fill="#e0707a"/></g>`;
    case 'calm': return lips + `<path d="M${f1(cx - mw * .6)},${f1(my + 1)} Q${cx},${f1(my + 3)} ${f1(cx + mw * .6)},${f1(my + 1)}" ${st}/>`;
    case 'smirk': return lips + `<path d="M${f1(cx - mw * .7)},${f1(my + 1.6)} Q${f1(cx + mw * .2)},${f1(my + 3.4)} ${f1(cx + mw)},${f1(my - 2)}" ${st}/>`;
    case 'serious': return lips + `<path d="M${f1(cx - mw * .75)},${f1(my + 1.6)} Q${cx},${f1(my + .6)} ${f1(cx + mw * .75)},${f1(my + 1.6)}" ${st}/>`;
    case 'wow': return `<ellipse cx="${cx}" cy="${f1(my + 2)}" rx="3.6" ry="4.6" fill="#5a1d25"/>` + (lip ? `<ellipse cx="${cx}" cy="${f1(my + 2)}" rx="3.6" ry="4.6" fill="none" stroke="${lip}" stroke-width="1.6"/>` : '');
    default: return lips + `<path d="M${f1(cx - mw)},${f1(my)} Q${cx},${f1(my + 6.5)} ${f1(cx + mw)},${f1(my)}" ${st}/><path d="M${f1(cx - mw - 1.4)},${f1(my - 1.4)} q1,1.2 1.6,2.2 M${f1(cx + mw + 1.4)},${f1(my - 1.4)} q-1,1.2 -1.6,2.2" stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".6"/>`;
  }
}
function facialHair(a, g, bc, u) {
  const { cx, cy, ry, hw } = g, my = cy + ry * .56, mw = 8 * (a.faceW ?? 1), sh = dk(bc, .3);
  let beard = '', mous = '';
  const ys = cy + 3;
  const arc = (dOf, n = 40) => { const t0 = g.tAt(ys), t1 = Math.PI - g.tAt(ys), r = []; for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; r.push(g.grow(t, dOf(t))); } return r; };
  const B = a.beard;
  if (B === 'stubble' || B === 'short' || B === 'full' || B === 'long') {
    const ext = { stubble: 0, short: 2.5, full: 9, long: 24 }[B], base = B === 'stubble' ? .6 : B === 'short' ? 1.6 : 2.6, pw = B === 'long' ? 5 : 3;
    const outer = arc(t => base + ext * Math.pow(Math.max(0, Math.sin(t)), pw));
    const ch = B === 'full' || B === 'long' ? 3 : -1;
    const inner = [[cx - hw(ys) + 3.5, ys + 1], [cx - hw(my - ch) * .8, my - ch], [cx - mw - 2.5, my + 3], [cx, my + 7.6], [cx + mw + 2.5, my + 3], [cx + hw(my - ch) * .8, my - ch], [cx + hw(ys) - 3.5, ys + 1]];
    const d = smooth([...outer, ...inner]);
    beard = B === 'stubble' ? `<path d="${d}" fill="${bc}" opacity=".28"/>` : cel(u + 'bd', d, bc, sh, -3, -3) +
      (B !== 'short' ? `<path d="M${cx - 6},${f1(my + 12)} q2,5 1,10 M${cx + 6},${f1(my + 12)} q-2,5 -1,10 M${cx},${f1(my + 13)} v${B === 'long' ? 18 : 8}" stroke="${sh}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".7"/>` : '');
  } else if (B === 'goatee') {
    beard = cel(u + 'bd', smooth([[cx - mw * .95, my + 3.5], [cx - mw * .8, g.chin - 1], [cx, g.chin + 5], [cx + mw * .8, g.chin - 1], [cx + mw * .95, my + 3.5], [cx, my + 7.8]]), bc, sh, -2, -2);
  } else if (B === 'strap') {
    const o = arc(() => 1.8, 34), i = arc(() => -3.4, 34).reverse(); beard = cel(u + 'bd', smooth([...o, ...i]), bc, sh, -2, -2);
  } else if (B === 'burns') {
    for (const s of [-1, 1]) {
      const tA = g.tAt(cy - 6), tB = g.tAt(cy + ry * .5), o = [], i2 = [];
      for (let i = 0; i <= 8; i++) { const t = s > 0 ? tA + (tB - tA) * i / 8 : Math.PI - tA - (tB - tA) * i / 8; o.push(g.grow(t, 1.2)); i2.unshift(g.grow(t, -(5.5 + i * .5) + (i > 6 ? (i - 6) * 3 : 0))); }
      beard += cel(u + 'bb' + s, smooth([...o, ...i2]), bc, sh, -1.5, -1.5);
    }
  }
  const M = a.mous, y = my - 3.2;
  if (M === 'classic') mous = cel(u + 'ms', `M${cx},${f1(y - 1.5)} C${cx - 5},${f1(y - 4)} ${f1(cx - mw - 3)},${f1(y - 2)} ${f1(cx - mw - 3.5)},${f1(y + 3)} C${cx - 6},${f1(y + 1.5)} ${cx - 3},${f1(y + 2)} ${cx},${f1(y + 1)} C${cx + 3},${f1(y + 2)} ${cx + 6},${f1(y + 1.5)} ${f1(cx + mw + 3.5)},${f1(y + 3)} C${f1(cx + mw + 3)},${f1(y - 2)} ${cx + 5},${f1(y - 4)} ${cx},${f1(y - 1.5)}Z`, bc, sh, -2, -1.5);
  if (M === 'thick') mous = cel(u + 'ms', `M${cx},${f1(y - 3)} C${cx - 7},${f1(y - 6)} ${f1(cx - mw - 5)},${f1(y - 2)} ${f1(cx - mw - 4)},${f1(y + 6)} C${cx - 6},${f1(y + 4)} ${cx - 3},${f1(y + 4)} ${cx},${f1(y + 3)} C${cx + 3},${f1(y + 4)} ${cx + 6},${f1(y + 4)} ${f1(cx + mw + 4)},${f1(y + 6)} C${f1(cx + mw + 5)},${f1(y - 2)} ${cx + 7},${f1(y - 6)} ${cx},${f1(y - 3)}Z`, bc, sh, -2, -2);
  if (M === 'thin') mous = `<path d="M${f1(cx - mw - 1)},${f1(y + 1.5)} Q${cx - 4},${f1(y - 1.2)} ${cx},${f1(y)} Q${cx + 4},${f1(y - 1.2)} ${f1(cx + mw + 1)},${f1(y + 1.5)}" stroke="${bc}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  if (M === 'handle') mous = cel(u + 'ms', `M${cx},${f1(y - 1)} C${cx - 6},${f1(y - 4)} ${f1(cx - mw - 2)},${f1(y + 3)} ${f1(cx - mw - 7)},${f1(y - 3)} C${f1(cx - mw - 8)},${f1(y - 5)} ${f1(cx - mw - 5)},${f1(y - 6)} ${f1(cx - mw - 4)},${f1(y - 4)} C${f1(cx - mw - 3)},${f1(y)} ${cx - 4},${f1(y + 2)} ${cx},${f1(y + 1)} C${cx + 4},${f1(y + 2)} ${f1(cx + mw + 3)},${f1(y)} ${f1(cx + mw + 4)},${f1(y - 4)} C${f1(cx + mw + 5)},${f1(y - 6)} ${f1(cx + mw + 8)},${f1(y - 5)} ${f1(cx + mw + 7)},${f1(y - 3)} C${f1(cx + mw + 2)},${f1(y + 3)} ${cx + 6},${f1(y - 4)} ${cx},${f1(y - 1)}Z`, bc, sh, -1.5, -1);
  if (M === 'horse') mous = cel(u + 'ms', `M${cx},${f1(y - 1.5)} C${cx - 6},${f1(y - 4)} ${f1(cx - mw - 3)},${f1(y - 2)} ${f1(cx - mw - 3)},${f1(y + 3)} L${f1(cx - mw - 3)},${f1(my + 12)} L${f1(cx - mw + .5)},${f1(my + 12)} L${f1(cx - mw + .5)},${f1(y + 3)} Q${cx},${f1(y + 1)} ${f1(cx + mw - .5)},${f1(y + 3)} L${f1(cx + mw - .5)},${f1(my + 12)} L${f1(cx + mw + 3)},${f1(my + 12)} L${f1(cx + mw + 3)},${f1(y + 3)} C${f1(cx + mw + 3)},${f1(y - 2)} ${cx + 6},${f1(y - 4)} ${cx},${f1(y - 1.5)}Z`, bc, sh, -1.5, -1.5);
  return { beard, mous };
}

// ── Головные уборы и аксессуары ──────────────────────────────────
function hatGeom(a, g) {
  const S = findHair(a), bandY = g.cy - g.ry * .44;
  const bulk = S.line ? Math.min(S.side || 0, 6) * .7 + 1.5 : 0, vol = S.line ? Math.min(S.vol || 0, 9) : 0;
  return { bandY, w: g.hw(bandY) + bulk + 3.5, top: g.top - vol * .7 - 6 };
}
function hat(a, g, u) {
  if (!a.hat) return '';
  const { bandY: b, w, top } = hatGeom(a, g), b0 = b, w0 = w, cx = g.cx, c = HAT_C[a.hatC] || HAT_C[0];
  const dome = (y0, tp, ww) => `M${f1(cx - ww)},${f1(y0)} C${f1(cx - ww)},${f1(tp - (y0 - tp) * .3)} ${f1(cx + ww)},${f1(tp - (y0 - tp) * .3)} ${f1(cx + ww)},${f1(y0)} Q${cx},${f1(y0 + 3)} ${f1(cx - ww)},${f1(y0)}Z`;
  if (a.hat === 'cap') {
    const b = b0 - 6, w = g.hw(b) + (w0 - g.hw(b0)), vw = w * 1.1, crown = `M${f1(cx - w)},${f1(b + 2)} C${f1(cx - w)},${f1(top - (b - top) * .32)} ${f1(cx + w)},${f1(top - (b - top) * .32)} ${f1(cx + w)},${f1(b + 2)}Z`;
    const visor = `M${f1(cx - vw)},${f1(b + 1)} Q${cx},${f1(b - 5)} ${f1(cx + vw)},${f1(b + 1)} Q${f1(cx + vw + 2)},${f1(b + 8)} ${f1(cx + w * .72)},${f1(b + 13)} Q${cx},${f1(b + 19)} ${f1(cx - w * .72)},${f1(b + 13)} Q${f1(cx - vw - 2)},${f1(b + 8)} ${f1(cx - vw)},${f1(b + 1)}Z`;
    const shade = `<clipPath id="${u}fs"><path d="${g.path}"/></clipPath><g clip-path="url(#${u}fs)"><path d="M${f1(cx - w)},${f1(b + 10)} Q${cx},${f1(b + 25)} ${f1(cx + w)},${f1(b + 10)} V${f1(b)} H${f1(cx - w)}Z" fill="#2a1530" opacity=".18"/></g>`;
    return shade + cel(u + 'ht', crown, c) +
      `<path d="M${cx},${f1(top + 1)} Q${f1(cx - w * .42)},${f1((top + b) / 2)} ${f1(cx - w * .5)},${f1(b + 1)} M${cx},${f1(top + 1)} Q${f1(cx + w * .42)},${f1((top + b) / 2)} ${f1(cx + w * .5)},${f1(b + 1)} M${cx},${f1(top + 1)} V${f1(b)}" stroke="${dk(c, .22)}" stroke-width="1.1" fill="none" opacity=".8"/>` +
      `<ellipse cx="${cx}" cy="${f1(top + 1.2)}" rx="3.2" ry="1.7" fill="${dk(c, .2)}"/>` +
      `<path d="${visor}" fill="${dk(c, .3)}"/><path d="M${f1(cx - vw + 2)},${f1(b + 1)} Q${cx},${f1(b - 4)} ${f1(cx + vw - 2)},${f1(b + 1)} Q${f1(cx + vw - 4)},${f1(b + 5)} ${f1(cx + w * .6)},${f1(b + 7)} Q${cx},${f1(b + 10)} ${f1(cx - w * .6)},${f1(b + 7)} Q${f1(cx - vw + 4)},${f1(b + 5)} ${f1(cx - vw + 2)},${f1(b + 1)}Z" fill="${dk(c, .08)}"/>`;
  }
  if (a.hat === 'beanie') {
    const cuff = `M${f1(cx - w - 1.5)},${f1(b - 9)} Q${cx},${f1(b - 13)} ${f1(cx + w + 1.5)},${f1(b - 9)} L${f1(cx + w + 1.5)},${f1(b + 2)} Q${cx},${f1(b - 2)} ${f1(cx - w - 1.5)},${f1(b + 2)}Z`;
    let r = cel(u + 'ht', dome(b - 6, top - 5, w * .97), c) + `<circle cx="${cx}" cy="${f1(top - 7)}" r="6.5" fill="${lt(c, .25)}"/>` + cel(u + 'hc2', cuff, lt(c, .06), dk(c, .2), -3, -1);
    for (let x = -w + 4; x < w; x += 5) r += `<path d="M${f1(cx + x)},${f1(b - 9.5)} V${f1(b + 1)}" stroke="${dk(c, .18)}" stroke-width="1.1"/>`;
    return r;
  }
  if (a.hat === 'helmet') {
    const hc = HELMET_C[a.hatC] || HELMET_C[0];
    return cel(u + 'ht', dome(b - 1, top - 3, w + 1), hc) + `<path d="M${cx - 5},${f1(top - 2)} Q${cx},${f1(top - 4)} ${cx + 5},${f1(top - 2)} L${cx + 4},${f1(b - 1)} L${cx - 4},${f1(b - 1)}Z" fill="${dk(hc, .1)}"/>` +
      `<path d="M${f1(cx - w - 7)},${f1(b + 1)} Q${cx},${f1(b - 5)} ${f1(cx + w + 7)},${f1(b + 1)} Q${cx},${f1(b + 5)} ${f1(cx - w - 7)},${f1(b + 1)}Z" fill="${dk(hc, .22)}"/>`;
  }
  // фуражка (Премиум): нейтральная эмблема — колесо с крыльями, без логотипов
  const navy = '#1d2b4a';
  return `<path d="M${f1(cx - w - 12)},${f1(b - 20)} Q${cx},${f1(b - 36)} ${f1(cx + w + 12)},${f1(b - 20)} Q${f1(cx + w + 6)},${f1(b - 10)} ${f1(cx + w)},${f1(b - 7)} L${f1(cx - w)},${f1(b - 7)} Q${f1(cx - w - 6)},${f1(b - 10)} ${f1(cx - w - 12)},${f1(b - 20)}Z" fill="${navy}"/>` +
    `<path d="M${f1(cx - w - 10)},${f1(b - 21)} Q${cx},${f1(b - 34)} ${f1(cx + w + 10)},${f1(b - 21)}" stroke="#34466e" stroke-width="2.4" fill="none"/>` +
    `<path d="M${f1(cx - w)},${f1(b - 8)} L${f1(cx + w)},${f1(b - 8)} L${f1(cx + w)},${f1(b + 1)} Q${cx},${f1(b - 1)} ${f1(cx - w)},${f1(b + 1)}Z" fill="#1a1f2b"/><path d="M${f1(cx - w)},${f1(b - 6)} H${f1(cx + w)}" stroke="#c9a25b" stroke-width="1.2"/>` +
    `<path d="M${f1(cx - w * .9)},${f1(b)} Q${cx},${f1(b + 15)} ${f1(cx + w * .9)},${f1(b)} Q${cx},${f1(b + 4)} ${f1(cx - w * .9)},${f1(b)}Z" fill="#0d0f14"/><path d="M${f1(cx - w * .6)},${f1(b + 4)} Q${cx},${f1(b + 8)} ${f1(cx + w * .6)},${f1(b + 4)}" stroke="#4a5060" stroke-width="1.2" fill="none"/>` +
    `<g transform="translate(${cx} ${f1(b - 17)})"><path d="M-3,0 C-8,-4 -14,-3 -17,-1 C-12,-1 -9,1 -3,2Z M3,0 C8,-4 14,-3 17,-1 C12,-1 9,1 3,2Z" fill="#e0bd6e"/><circle r="4.4" fill="none" stroke="#e0bd6e" stroke-width="1.8"/><circle r="1.3" fill="#e0bd6e"/></g>`;
}
function earPos(a, g) { const E = EARS.find(e => e.id === a.ears) || EARS[0], y = g.cy + 5; return { E, y, x: g.hw(y) - 1 + E.out }; }
function ears(a, g, skin, u) {
  const { E, y, x } = earPos(a, g); let r = '';
  for (const s of [-1, 1]) {
    const ex = g.cx + s * x, d = `M${f1(ex)},${f1(y - E.h)} C${f1(ex + s * E.w * 1.6)},${f1(y - E.h)} ${f1(ex + s * E.w * 1.5)},${f1(y + E.h)} ${f1(ex)},${f1(y + E.h)} C${f1(ex - s * 4)},${f1(y + E.h)} ${f1(ex - s * 4)},${f1(y - E.h)} ${f1(ex)},${f1(y - E.h)}Z`;
    r += cel(u + 'er' + s, d, skin, dk(skin, .16), s * -1.5, -1.5) + `<path d="M${f1(ex + s * E.w * .4)},${f1(y - E.h * .55)} Q${f1(ex + s * E.w * 1)},${f1(y)} ${f1(ex + s * E.w * .3)},${f1(y + E.h * .5)}" stroke="${dk(skin, .25)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  }
  return r;
}
function jewelry(a, g, skin) {
  let r = '';
  if (a.earrings && !a.defenders) {
    const { E, y, x } = earPos(a, g);
    for (const s of [-1, 1]) {
      const ex = g.cx + s * (x + E.w * .35), ly = y + E.h * .8;
      if (a.earrings === 'stud') r += `<circle cx="${f1(ex)}" cy="${f1(ly)}" r="2" fill="#f2d27a" stroke="#b58a2c" stroke-width=".7"/>`;
      if (a.earrings === 'hoop') r += `<circle cx="${f1(ex)}" cy="${f1(ly + 4.5)}" r="4.6" fill="none" stroke="#e2bd5c" stroke-width="1.7"/>`;
      if (a.earrings === 'drop') r += `<path d="M${f1(ex)},${f1(ly)} V${f1(ly + 3)}" stroke="#e2bd5c" stroke-width="1.1"/><path d="M${f1(ex)},${f1(ly + 3)} q3.6,4.6 0,7.6 q-3.6,-3 0,-7.6Z" fill="#5fb7d9" stroke="#e2bd5c" stroke-width=".8"/>`;
    }
  }
  const ny = g.cy + g.ry * .32, my = g.cy + g.ry * .56;
  if (a.piercing === 'nose') r += `<circle cx="${g.cx + 4.2}" cy="${f1(ny + 4.4)}" r="2.1" fill="none" stroke="#d9dde3" stroke-width="1.2"/>`;
  if (a.piercing === 'lip') r += `<circle cx="${g.cx + 3.4}" cy="${f1(my + 5.2)}" r="2.1" fill="none" stroke="#d9dde3" stroke-width="1.2"/>`;
  if (a.piercing === 'brow') { const x = g.cx + g.rx * .41 * (a.eyeGap ?? 1) + 7, y = g.cy + 2 - 8.5 * (a.eyeS ?? 1) - 3.5; r += `<circle cx="${f1(x)}" cy="${f1(y - 3)}" r="1.4" fill="#d9dde3"/><circle cx="${f1(x + 1)}" cy="${f1(y + 3)}" r="1.4" fill="#d9dde3"/>`; }
  return r;
}
function glasses(a, E, g) {
  if (!a.glasses) return '';
  const c = FRAME_C[a.glassesC] || FRAME_C[0], { ey, ex, s } = E, w = 8.6 * s + 2, h = 7 * s + 2, cx = g.cx;
  const sw = a.glasses === 'wide' ? 2.6 : 1.9, sun = a.glasses === 'sun';
  let r = '';
  for (const fl of [-1, 1]) {
    const x = cx + fl * ex; let d;
    switch (a.glasses) {
      case 'round': d = circ(x, ey, Math.max(w, h) * .92); break;
      case 'aviator': d = `M${f1(x - fl * w)},${f1(ey - h * .8)} L${f1(x + fl * w)},${f1(ey - h * .9)} Q${f1(x + fl * w * 1.05)},${f1(ey + h)} ${f1(x)},${f1(ey + h * 1.05)} Q${f1(x - fl * w)},${f1(ey + h)} ${f1(x - fl * w)},${f1(ey - h * .8)}Z`; break;
      case 'cat': d = `M${f1(x - fl * w)},${f1(ey - h * .55)} Q${f1(x)},${f1(ey - h * 1.1)} ${f1(x + fl * w * 1.2)},${f1(ey - h * 1.25)} Q${f1(x + fl * w)},${f1(ey + h)} ${f1(x)},${f1(ey + h * .9)} Q${f1(x - fl * w)},${f1(ey + h * .9)} ${f1(x - fl * w)},${f1(ey - h * .55)}Z`; break;
      case 'wide': d = `M${f1(x - w * 1.12)},${f1(ey - h * .75)} H${f1(x + w * 1.12)} V${f1(ey + h * .7)} Q${f1(x)},${f1(ey + h * 1.05)} ${f1(x - w * 1.12)},${f1(ey + h * .7)}Z`; break;
      default: d = `M${f1(x - w)},${f1(ey - h * .8)} H${f1(x + w)} V${f1(ey + h * .85)} H${f1(x - w)}Z`;
    }
    r += `<path d="${d}" fill="${sun ? '#141821' : '#dff1ff'}" fill-opacity="${sun ? .92 : .22}" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    r += `<path d="M${f1(x - w * .5)},${f1(ey - h * .3)} l${f1(w * .35)},${f1(-h * .25)}" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="${sun ? .55 : .7}"/>`;
    const ox = cx + fl * (ex + w * (a.glasses === 'wide' ? 1.12 : a.glasses === 'round' ? .92 : 1));
    r += `<path d="M${f1(ox)},${f1(ey - h * .3)} L${f1(cx + fl * (g.hw(ey) + 1))},${f1(ey + 1)}" stroke="${c}" stroke-width="1.6"/>`;
  }
  const bx = ex - w * (a.glasses === 'wide' ? 1.12 : a.glasses === 'round' ? .92 : 1);
  return r + `<path d="M${f1(cx - bx)},${f1(ey - 1)} Q${cx},${f1(ey - 4)} ${f1(cx + bx)},${f1(ey - 1)}" stroke="${c}" stroke-width="1.7" fill="none"/>`;
}
function goggles(a, g) {
  if (!a.goggles) return '';
  const y = a.hat && a.hat !== 'peaked' ? hatGeom(a, g).bandY - 5 : g.cy - g.ry * .56, cx = g.cx, W = (a.hat ? hatGeom(a, g).w : g.hw(y) + 2) + 1;
  return `<path d="M${f1(cx - W)},${f1(y + 1)} Q${cx},${f1(y - 3)} ${f1(cx + W)},${f1(y + 1)}" stroke="#2c2f36" stroke-width="5" fill="none"/>` +
    [-1, 1].map(s => `<rect x="${f1(cx + s * 10.5 - 9)}" y="${f1(y - 6.5)}" width="18" height="13" rx="6" fill="#3a3f49"/><rect x="${f1(cx + s * 10.5 - 7)}" y="${f1(y - 4.5)}" width="14" height="9" rx="4.5" fill="#9fd2e6"/><path d="M${f1(cx + s * 10.5 - 4.5)},${f1(y - 2)} l4,-1.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`).join('') +
    `<rect x="${cx - 2.5}" y="${f1(y - 2)}" width="5" height="4" rx="1" fill="#3a3f49"/>`;
}
function defenders(a, g) {
  if (!a.defenders) return '';
  const { y, x, E } = earPos(a, g), cx = g.cx, hg = a.hat ? hatGeom(a, g) : null;
  const tp = hg ? hg.top - (a.hat === 'peaked' ? 30 : a.hat === 'beanie' ? 12 : 6) : g.top - Math.min(findHair(a).vol || 0, 14) - 8;
  const X = x + E.w * .5, c = '#e8462e';
  return `<path d="M${f1(cx - X - 2)},${f1(y - 6)} C${f1(cx - X - 4)},${f1(tp - 4)} ${f1(cx + X + 4)},${f1(tp - 4)} ${f1(cx + X + 2)},${f1(y - 6)}" stroke="#2c2f36" stroke-width="5.5" fill="none" stroke-linecap="round"/>` +
    [-1, 1].map(s => `<rect x="${f1(cx + s * (X + 2) - 7.5)}" y="${f1(y - 12)}" width="15" height="24" rx="7" fill="${c}"/><rect x="${f1(cx + s * (X + 2) - 7.5 + (s < 0 ? 0 : 9))}" y="${f1(y - 12)}" width="6" height="24" rx="3" fill="${dk(c, .25)}"/><rect x="${f1(cx + s * (X + 2) - 4)}" y="${f1(y - 8)}" width="3" height="10" rx="1.5" fill="#fff" opacity=".45"/>`).join('');
}
function mazut(a, g) {
  if (!a.mazut) return '';
  const { cx, cy, ry } = g, c = '#1d1712';
  return `<g fill="${c}" opacity=".55"><path d="M${cx + 13},${f1(cy + ry * .38)} q8,-3 15,1 q-3,3 -9,2.6 q-4,.2 -6,-3.6Z"/><path d="M${cx - 18},${f1(cy - ry * .5)} q4,-3 9,-1 q-1,3 -5,3 q-3,0 -4,-2Z"/><circle cx="${cx - 22}" cy="${f1(cy + ry * .45)}" r="2"/></g>` +
    `<g fill="${c}" opacity=".5"><path d="M${cx + 22},176 q10,-4 18,2 q-6,6 -14,4 q-4,-1 -4,-6Z"/><path d="M${cx - 36},188 q6,-2 10,2 q-4,3 -10,-2Z"/></g>`;
}
function marks(a, g, skin, E) {
  const m = new Set(a.marks || []), { cx, cy, ry } = g, ny = cy + ry * .32, my = cy + ry * .56; let r = '';
  if (m.has('blush')) for (const s of [-1, 1]) r += `<ellipse cx="${f1(cx + s * (E.ex + 2))}" cy="${f1(ny + 2)}" rx="7" ry="4" fill="#ff7a8a" opacity=".3"/>`;
  if (m.has('freckles')) { const c = dk(skin, .38); for (const s of [-1, 1]) for (const [dx, dy] of [[9, -1], [13, 1.5], [17, -.5], [11, 4], [15.5, 4.5], [6, 1.6]]) r += `<circle cx="${f1(cx + s * dx * (g.rx / 38))}" cy="${f1(ny + dy - 2)}" r=".95" fill="${c}" opacity=".7"/>`; }
  if (m.has('mole')) r += `<circle cx="${f1(cx - 14)}" cy="${f1(my - 3)}" r="1.4" fill="${dk(skin, .6)}"/>`;
  if (m.has('scar')) { const x = cx - E.ex + 3, y = cy - 8; r += `<path d="M${f1(x)},${f1(y - 7)} L${f1(x - 3)},${f1(y + 3)}" stroke="${lt(skin, .4)}" stroke-width="2" stroke-linecap="round"/><path d="M${f1(x - 3)},${f1(y - 4)} l3,1 M${f1(x - 3.6)},${f1(y - 1)} l3,1" stroke="${dk(skin, .2)}" stroke-width=".8"/>`; }
  if (m.has('dimple')) r += `<path d="M${cx - 1.6},${f1(g.chin - 5)} q1.6,1.4 3.2,0" stroke="${dk(skin, .25)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  return r;
}
function wrinkles(a, g, skin, E) {
  const k = x => clamp(x, 0, 1), { cx, cy, ry } = g, ny = cy + ry * .32, my = cy + ry * .56, c = dk(skin, .3), mw = 8 * (a.faceW ?? 1); let r = '';
  const naso = k((a.age - 30) / 20) * .55, fore = k((a.age - 38) / 15) * .5, crow = k((a.age - 42) / 12) * .55, bag = k((a.age - 44) / 10) * .5;
  if (naso) r += `<path d="M${f1(cx - 8)},${f1(ny + 1)} Q${f1(cx - mw - 4)},${f1(my - 3)} ${f1(cx - mw - 3)},${f1(my + 3)} M${f1(cx + 8)},${f1(ny + 1)} Q${f1(cx + mw + 4)},${f1(my - 3)} ${f1(cx + mw + 3)},${f1(my + 3)}" stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="${naso}"/>`;
  if (fore) r += `<path d="M${cx - 12},${f1(cy - ry * .42)} Q${cx},${f1(cy - ry * .46)} ${cx + 12},${f1(cy - ry * .42)} M${cx - 9},${f1(cy - ry * .34)} Q${cx},${f1(cy - ry * .37)} ${cx + 9},${f1(cy - ry * .34)}" stroke="${c}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="${fore}"/>`;
  if (crow) for (const s of [-1, 1]) { const x = cx + s * (E.ex + 9 * E.s); r += `<path d="M${f1(x)},${f1(E.ey - 1)} l${s * 3},-1.5 M${f1(x)},${f1(E.ey + 1.5)} l${s * 3},1.2" stroke="${c}" stroke-width="1" stroke-linecap="round" opacity="${crow}"/>`; }
  if (bag) for (const s of [-1, 1]) { const x = cx + s * E.ex; r += `<path d="M${f1(x - 5)},${f1(E.ey + 6 * E.s)} Q${f1(x)},${f1(E.ey + 9 * E.s)} ${f1(x + 5)},${f1(E.ey + 6 * E.s)}" stroke="${c}" stroke-width="1.1" fill="none" opacity="${bag}"/>`; }
  return r;
}

// ── Проверка и очистка параметров ────────────────────────────────
const has = (list, v) => list.some((x) => x.id === v);
const pick = (v, list, def) => (v != null && has(list, v) ? v : def);
const idx = (v, arr, def) => (Number.isInteger(v) && v >= 0 && v < arr.length ? v : def);
const num = (v, lo, hi, def) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, lo, hi) : def);
export const RANGES = { age: [18, 55], faceW: [.88, 1.12], eyeS: [.85, 1.2], eyeGap: [.88, 1.12], noseS: [.8, 1.25] };
export const hairsOf = (sex) => (sex === 'f' ? HAIR_F : HAIR_M);
export const isPremiumHat = (id) => PREMIUM.hat.includes(id);
export const isPremiumBg = (id) => PREMIUM.bg.includes(id);

// Только известные значения; всё неизвестное — по умолчанию. premium: false — премиум-детали снимаются.
export function normalizeAvatar(src, { premium = false } = {}) {
  const a = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
  const sex = a.sex === 'f' ? 'f' : 'm';
  const r = (k, def) => num(a[k], RANGES[k][0], RANGES[k][1], def);
  const o = {
    v: 1, sex, age: Math.round(r('age', 30)), skin: idx(a.skin, SKIN, 3),
    head: pick(a.head, HEADS, 'oval'), faceW: r('faceW', 1), build: pick(a.build, BUILDS, 'avg'), ears: pick(a.ears, EARS, 'normal'),
    eyes: pick(a.eyes, EYES, 'almond'), eyeC: idx(a.eyeC, EYE_C, 0), eyeS: r('eyeS', 1), eyeGap: r('eyeGap', 1),
    brows: pick(a.brows, BROWS, 'straight'), nose: pick(a.nose, NOSES, 'button'), noseS: r('noseS', 1),
    mouth: pick(a.mouth, MOUTHS, 'smile'), lips: idx(a.lips, LIP_C, 0),
    hair: pick(a.hair, hairsOf(sex), sex === 'f' ? 'long' : 'short'), hairC: idx(a.hairC, HAIR_C, 2),
    mous: sex === 'm' ? pick(a.mous, MOUS, null) : null, beard: sex === 'm' ? pick(a.beard, BEARDS, null) : null,
    beardC: a.beardC == null ? null : idx(a.beardC, HAIR_C, null),
    marks: Array.isArray(a.marks) ? MARKS.filter((m) => a.marks.includes(m.id)).map((m) => m.id) : [],
    outfit: pick(a.outfit, OUTFITS, 'vestO'), outfitC: a.outfitC == null ? null : idx(a.outfitC, CLOTH_C, null),
    hat: pick(a.hat, HATS, null), hatC: idx(a.hatC, HAT_C, 0),
    glasses: pick(a.glasses, GLASSES, null), glassesC: idx(a.glassesC, FRAME_C, 0),
    goggles: a.goggles === true, defenders: a.defenders === true,
    earrings: pick(a.earrings, EARRINGS, null), piercing: pick(a.piercing, PIERCING, null),
    mazut: a.mazut === true, bg: pick(a.bg, BG, 'mist'),
  };
  if (!premium) {
    if (isPremiumHat(o.hat)) o.hat = null;
    if (isPremiumBg(o.bg)) o.bg = 'mist';
    o.mazut = false;
  }
  return o;
}

// Какие премиум-детали сейчас надеты (для плашки «Примерка» и окна при сохранении)
export function premiumParts(a) {
  const r = [];
  if (isPremiumHat(a.hat)) r.push('фуражка');
  if (a.mazut) r.push('мазут');
  if (isPremiumBg(a.bg)) r.push(`фон «${BG.find((b) => b.id === a.bg).name}»`);
  return r;
}

// ── Сборка ───────────────────────────────────────────────────────
const CROPS = { full: '8 16 184 184', wide: '0 0 200 200', face: '38 26 124 124', top: '22 0 156 156', bust: '10 20 180 180' };
export function avatarSvg(input, { size = 200, crop = 'full', bg = true, cls = '' } = {}) {
  const a = normalizeAvatar(input, { premium: true }), u = 'v' + (++U) + '_', g = geom(a);
  const skin = SKIN[a.skin];
  const grey = clamp((a.age - 36) / 19, 0, 1) * .62;
  const hc = mix(HAIR_C[a.hairC], '#b9b9bd', grey);
  const bc = mix(HAIR_C[a.beardC ?? a.hairC], '#b4b4b8', clamp((a.age - 34) / 21, 0, 1) * .55);
  const { nw } = buildOf(a);
  const cl = clothes(a, u);
  const hg = hatGeom(a, g);
  const clip = u + 'hcl';
  const hairClip = `<clipPath id="${clip}"><rect x="-20" y="${a.hat ? f1(hg.bandY + (a.hat === 'beanie' ? -6 : 1)) : -50}" width="240" height="300"/></clipPath>`;
  const H = hairParts(a, g, hc, u, clip);
  const E = eyes(a, g, u), Br = brows(a, g, E, a.age > 44 ? mix(hc, '#aaaaaa', .3) : dk(hc, .1));
  const F = facialHair(a, g, bc, u);
  const neck = `M${100 - nw},${f1(g.cy + g.ry * .4)} L${100 - nw - .5},158 Q100,166 ${100 + nw + .5},158 L${100 + nw},${f1(g.cy + g.ry * .4)}Z`;
  const neckSvg = `<clipPath id="${u}nk"><path d="${neck}"/></clipPath><path d="${neck}" fill="${dk(skin, .1)}"/><g clip-path="url(#${u}nk)"><path d="${g.path}" fill="${dk(skin, .3)}" transform="translate(0 6)"/></g>`;
  const head = cel(u + 'hd', g.path, skin, dk(skin, .14), -5, -3) +
    `<ellipse cx="${f1(g.cx - g.rx * .5)}" cy="${f1(g.cy - g.ry * .52)}" rx="${f1(g.rx * .28)}" ry="${f1(g.ry * .14)}" fill="${lt(skin, .4)}" opacity=".45" transform="rotate(-20 ${f1(g.cx - g.rx * .5)} ${f1(g.cy - g.ry * .52)})"/>`;
  const body = [
    bg ? background(a.bg, u) : '', hairClip,
    H.back, cl.back, neckSvg, cl.s, H.braids || '',
    ears(a, g, skin, u), head,
    marks(a, g, skin, E), wrinkles(a, g, skin, E),
    E.r, Br.r, nose(a, g, skin, u), F.beard, mouth(a, g, skin, u), F.mous,
    H.mid, H.front, jewelry(a, g, skin), mazut(a, g),
    glasses(a, E, g), hat(a, g, u), goggles(a, g), defenders(a, g),
  ].join('');
  const px = Math.round(Number(size)) || 200;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CROPS[crop] || CROPS.full}" width="${px}" height="${px}"${cls ? ` class="${cls.replace(/[^\w -]/g, '')}"` : ''} aria-hidden="true" focusable="false">${body}</svg>`;
}
export const bgSvg = (id) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${background(pick(id, BG, 'mist'), 'bg' + (++U) + '_')}</svg>`;

// ── Случайный персонаж (без Премиума). keep — что оставить как есть (например, пол).
export function randomAvatar(rnd = Math.random, keep = {}) {
  const any = (arr) => arr[Math.floor(rnd() * arr.length)], ch = (p) => rnd() < p;
  const sex = keep.sex === 'm' || keep.sex === 'f' ? keep.sex : ch(.5) ? 'm' : 'f';
  const o = any(OUTFITS);
  const hat = ch(.22) ? any(HATS.filter((h) => h.id && !h.premium)).id : null;
  return normalizeAvatar({
    sex, age: 18 + Math.floor(rnd() * 38), skin: Math.floor(rnd() * SKIN.length), head: any(HEADS).id,
    faceW: .88 + rnd() * .24, build: any(BUILDS).id, ears: any(EARS).id,
    eyes: any(EYES).id, eyeC: Math.floor(rnd() * EYE_C.length), eyeS: .85 + rnd() * .35, eyeGap: .88 + rnd() * .24,
    brows: any(BROWS).id, nose: any(NOSES).id, noseS: .8 + rnd() * .45, mouth: any(MOUTHS).id,
    lips: sex === 'f' && ch(.6) ? 1 + Math.floor(rnd() * 4) : 0,
    hair: any(hairsOf(sex)).id, hairC: ch(.85) ? Math.floor(rnd() * 11) : 11 + Math.floor(rnd() * 3),
    beard: sex === 'm' && ch(.55) ? any(BEARDS.slice(1)).id : null, mous: sex === 'm' && ch(.4) ? any(MOUS.slice(1)).id : null,
    marks: MARKS.filter(() => ch(.16)).map((m) => m.id),
    outfit: o.id, outfitC: o.color ? Math.floor(rnd() * CLOTH_C.length) : null,
    hat, hatC: Math.floor(rnd() * hatColors(hat).length),
    glasses: ch(.3) ? any(GLASSES.slice(1)).id : null, glassesC: Math.floor(rnd() * FRAME_C.length),
    goggles: ch(.1), defenders: ch(.08), earrings: ch(sex === 'f' ? .5 : .1) ? any(EARRINGS.slice(1)).id : null,
    piercing: ch(.1) ? any(PIERCING.slice(1)).id : null, bg: any(BG.filter((b) => !b.premium)).id,
  });
}
// Повторяемая последовательность случайных чисел (для тестов)
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
