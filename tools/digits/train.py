import gzip, numpy as np, json, sys, time, base64
rng = np.random.default_rng(7)
import os
D = os.path.dirname(os.path.abspath(__file__)) + '/'  # здесь же — файлы MNIST и веса
def imgs(f): return np.frombuffer(gzip.open(D + f).read(), np.uint8, offset=16).reshape(-1, 28, 28)
def labs(f): return np.frombuffer(gzip.open(D + f).read(), np.uint8, offset=8)
Xtr, Ytr = imgs('train-images-idx3-ubyte.gz'), labs('train-labels-idx1-ubyte.gz')
Xte, Yte = imgs('t10k-images-idx3-ubyte.gz'), labs('t10k-labels-idx1-ubyte.gz')

S = 20  # большая сторона цифры в клетке 28x28 — то же делает route-digits.js

def normalize(m):
    """Бинарная маска любого размера -> 28x28 float: обрезка, масштаб большей стороны до S (усреднение по площади), по центру рамки."""
    ys, xs = np.nonzero(m)
    out = np.zeros((28, 28), np.float32)
    if len(ys) == 0: return out
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.float32)
    h, w = m.shape
    sc = S / max(h, w)
    nh, nw = max(1, round(h * sc)), max(1, round(w * sc))
    # усреднение по площади: каждой клетке результата — доля закрашенных точек под ней (через суперсэмплинг 4x)
    yy = (np.arange(nh * 4) + 0.5) / (nh * 4) * h
    xx = (np.arange(nw * 4) + 0.5) / (nw * 4) * w
    big = m[np.clip(yy.astype(int), 0, h - 1)][:, np.clip(xx.astype(int), 0, w - 1)]
    small = big.reshape(nh, 4, nw, 4).mean(axis=(1, 3))
    oy, ox = (28 - nh) // 2, (28 - nw) // 2
    out[oy:oy + nh, ox:ox + nw] = small
    return out

def dilate(m):
    p = np.pad(m, 1)
    return (p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])

def line(m, x0, y0, x1, y1, r=2):
    for t in np.linspace(0, 1, 40):
        x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
        m[max(0, y - r + 1):y + r, max(0, x - r + 1):x + r] = True

def russian(m, label):
    """Единица с длинным носиком и семёрка с перекладиной — так пишут у нас, в MNIST таких мало."""
    ys, xs = np.nonzero(m)
    if len(ys) == 0: return m
    top, bot = ys.min(), ys.max(); hgt = bot - top
    if label == 1 and rng.random() < 0.6:
        tx = int(xs[ys <= top + 2].mean())
        L = hgt * rng.uniform(0.3, 0.5); a = rng.uniform(0.5, 1.1)
        line(m, tx, top, tx - L * np.cos(a), top + L * np.sin(a))
    if label == 7 and rng.random() < 0.35:
        y = int(top + hgt * rng.uniform(0.45, 0.6)); row = xs[np.abs(ys - y) <= 2]
        if len(row): c = row.mean(); line(m, c - hgt * 0.2, y, c + hgt * 0.2, y)
    return m

def augment(img, label=-1):
    return normalize(augment_mask((img, label)))

def augment_mask(pair):
    img, label = pair
    # увеличиваем в 2 раза, чтобы поворот и толщина были плавнее
    m = russian(np.kron(img > 100, np.ones((2, 2), bool)), label)
    a = rng.uniform(-0.25, 0.25); sh = rng.uniform(-0.35, 0.35); sx = rng.uniform(0.75, 1.25)
    c, s = np.cos(a), np.sin(a)
    A = np.array([[c, -s], [s, c]]) @ np.array([[1, sh], [0, 1]]) @ np.array([[sx, 0], [0, 1]])
    Ai = np.linalg.inv(A)
    H = 84; yy, xx = np.mgrid[0:H, 0:H] - H / 2
    src = Ai @ np.stack([xx.ravel(), yy.ravel()])
    sxp = np.round(src[0] + 28).astype(int); syp = np.round(src[1] + 28).astype(int)
    ok = (sxp >= 0) & (sxp < 56) & (syp >= 0) & (syp < 56)
    out = np.zeros(H * H, bool); out[ok] = m[syp[ok], sxp[ok]]
    out = out.reshape(H, H)
    for _ in range(rng.integers(0, 4)): out = dilate(out)
    # незамкнутые «0», «6», «8»: стираем кусочек штриха
    if rng.random() < 0.3:
        ys, xs = np.nonzero(out)
        if len(ys):
            k = rng.integers(len(ys)); r = rng.integers(3, 8)
            out[max(0, ys[k] - r):ys[k] + r, max(0, xs[k] - r):xs[k] + r] = False
    # обрывы штриха ручки
    if rng.random() < 0.3:
        holes = rng.random(out.shape) < 0.04
        out &= ~holes
    return out

def two(a, b):
    A = augment_mask(a); B = augment_mask(b)
    ya, xa = np.nonzero(A); yb, xb = np.nonzero(B)
    if len(ya) == 0 or len(yb) == 0: return normalize(A | B)
    A = A[ya.min():ya.max() + 1, xa.min():xa.max() + 1]; B = B[yb.min():yb.max() + 1, xb.min():xb.max() + 1]
    H = max(A.shape[0], B.shape[0]); ov = int(rng.integers(-2, max(1, min(A.shape[1], B.shape[1]) // 3)))
    W = A.shape[1] + B.shape[1] - ov; m = np.zeros((H + 4, W + 4), bool)
    oa, ob = rng.integers(0, H - A.shape[0] + 1), rng.integers(0, H - B.shape[0] + 1)
    m[oa:oa + A.shape[0], :A.shape[1]] |= A; m[ob:ob + B.shape[0], A.shape[1] - ov:A.shape[1] - ov + B.shape[1]] |= B
    return normalize(m)

def half(a):
    A = augment_mask(a); ys, xs = np.nonzero(A)
    if len(ys) == 0: return normalize(A)
    x0, x1 = xs.min(), xs.max(); w = x1 - x0
    if rng.random() < 0.5: A[:, x0 + int(w * rng.uniform(0.35, 0.6)):] = False
    else: A[:, :x0 + int(w * rng.uniform(0.4, 0.65))] = False
    return normalize(A)

def junk(n):
    out = []
    for _ in range(n):
        i, j = rng.integers(len(Xtr), size=2)
        out.append(two((Xtr[i], Ytr[i]), (Xtr[j], Ytr[j])) if rng.random() < 0.65 else half((Xtr[i], Ytr[i])))
    return np.stack(out)

def build(X, aug):
    return np.stack([augment(x) if aug else normalize(dilate(np.kron(x > 100, np.ones((2, 2), bool)))) for x in X])

# --- сеть: conv5x5xC1 -> relu -> pool2 -> conv5x5xC2 -> relu -> pool2 -> fcF -> relu -> fc11
def he(*shape, fan): return (rng.standard_normal(shape) * np.sqrt(2 / fan)).astype(np.float32)
C1, C2, F = 12, 24, 64
P = {'w1': he(C1, 1, 5, 5, fan=25), 'b1': np.zeros(C1, np.float32),
     'w2': he(C2, C1, 5, 5, fan=25 * C1), 'b2': np.zeros(C2, np.float32),
     'w3': he(C2 * 16, F, fan=C2 * 16), 'b3': np.zeros(F, np.float32),
     'w4': he(F, 11, fan=F), 'b4': np.zeros(11, np.float32)}

def im2col(x, k):
    n, c, h, w = x.shape; oh, ow = h - k + 1, w - k + 1
    s = np.lib.stride_tricks.sliding_window_view(x, (k, k), axis=(2, 3))  # n c oh ow k k
    return s.transpose(0, 2, 3, 1, 4, 5).reshape(n * oh * ow, c * k * k), oh, ow

def conv_f(x, w, b):
    n = x.shape[0]; col, oh, ow = im2col(x, w.shape[2])
    out = col @ w.reshape(w.shape[0], -1).T + b
    return out.reshape(n, oh, ow, -1).transpose(0, 3, 1, 2), col

def conv_b(dout, x, w, col):
    n, f, oh, ow = dout.shape; k = w.shape[2]
    d = dout.transpose(0, 2, 3, 1).reshape(-1, f)
    dw = (d.T @ col).reshape(w.shape); db = d.sum(0)
    dcol = d @ w.reshape(f, -1)  # (n*oh*ow, c*k*k)
    dcol = dcol.reshape(n, oh, ow, x.shape[1], k, k)
    dx = np.zeros_like(x)
    for i in range(k):
        for j in range(k):
            dx[:, :, i:i + oh, j:j + ow] += dcol[:, :, :, :, i, j].transpose(0, 3, 1, 2)
    return dx, dw, db

def pool_f(x):
    n, c, h, w = x.shape; r = x.reshape(n, c, h // 2, 2, w // 2, 2)
    out = r.max(axis=(3, 5)); mask = (r == out[:, :, :, None, :, None])
    return out, mask

def pool_b(d, mask):
    return (mask * d[:, :, :, None, :, None]).reshape(mask.shape[0], mask.shape[1], mask.shape[2] * 2, mask.shape[4] * 2)

def forward(x, P, train=False):
    c1, col1 = conv_f(x, P['w1'], P['b1']); r1 = np.maximum(c1, 0); p1, m1 = pool_f(r1)
    c2, col2 = conv_f(p1, P['w2'], P['b2']); r2 = np.maximum(c2, 0); p2, m2 = pool_f(r2)
    f = p2.reshape(len(x), -1); h = np.maximum(f @ P['w3'] + P['b3'], 0)
    z = h @ P['w4'] + P['b4']
    return z, (x, c1, col1, m1, p1, c2, col2, m2, f, h)

def backward(z, y, cache, P):
    x, c1, col1, m1, p1, c2, col2, m2, f, h = cache
    e = np.exp(z - z.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
    loss = -np.log(pr[np.arange(len(y)), y] + 1e-9).mean()
    dz = pr; dz[np.arange(len(y)), y] -= 1; dz /= len(y)
    G = {'w4': h.T @ dz, 'b4': dz.sum(0)}
    dh = dz @ P['w4'].T * (h > 0)
    G['w3'] = f.T @ dh; G['b3'] = dh.sum(0)
    df = (dh @ P['w3'].T).reshape(len(x), C2, 4, 4)
    dr2 = pool_b(df, m2) * (c2 > 0)
    dp1, G['w2'], G['b2'] = conv_b(dr2, p1, P['w2'], col2)
    dr1 = pool_b(dp1, m1) * (c1 > 0)
    _, G['w1'], G['b1'] = conv_b(dr1, x, P['w1'], col1)
    return loss, G

def accuracy(X, Y):
    acc = 0
    for i in range(0, len(X), 1000):
        z, _ = forward(X[i:i + 1000, None], P); acc += (z.argmax(1) == Y[i:i + 1000]).sum()
    return acc / len(X)

t0 = time.time()
Xte_n = build(Xte[:3000], False); Xte_a = np.stack([augment(x, y) for x, y in zip(Xte[:3000], Yte[:3000])])
Jte = junk(1000)
M = {k: np.zeros_like(v) for k, v in P.items()}; V = {k: np.zeros_like(v) for k, v in P.items()}; step = 0
EP = int(sys.argv[1]) if len(sys.argv) > 1 else 4
for ep in range(EP):
    idx = rng.permutation(len(Xtr))
    Xa = np.stack([augment(Xtr[i], Ytr[i]) for i in idx]); Ya = Ytr[idx].astype(np.int64)
    J = junk(9000); Xa = np.concatenate([Xa, J]); Ya = np.concatenate([Ya, np.full(len(J), 10)])
    p2 = rng.permutation(len(Xa)); Xa, Ya = Xa[p2], Ya[p2]
    print('ep', ep, 'aug ready', round(time.time() - t0), flush=True)
    lr = 2e-3 if ep < EP - 2 else (7e-4 if ep < EP - 1 else 2.5e-4)
    for i in range(0, len(Xa), 128):
        z, cache = forward(Xa[i:i + 128, None], P, True)
        loss, G = backward(z, Ya[i:i + 128], cache, P)
        step += 1
        for k in P:
            M[k] = 0.9 * M[k] + 0.1 * G[k]; V[k] = 0.999 * V[k] + 0.001 * G[k] ** 2
            P[k] -= lr * (M[k] / (1 - 0.9 ** step)) / (np.sqrt(V[k] / (1 - 0.999 ** step)) + 1e-8)
        if i % 12800 == 0: print(ep, i, round(float(loss), 3), round(time.time() - t0), flush=True)
    zj, _ = forward(Jte[:, None], P)
    print('epoch', ep, 'test clean', accuracy(Xte_n, Yte[:3000]), 'test aug', accuracy(Xte_a, Yte[:3000]), 'junk', (zj.argmax(1) == 10).mean(), flush=True)

# веса — float32 в base64, порядок: w1 b1 w2 b2 w3 b3 w4 b4
blob = np.array([C1, C2, F, 11], np.float32).tobytes() + b''.join(P[k].astype(np.float32).tobytes() for k in ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4'])
open(D + 'weights.b64', 'w').write(base64.b64encode(blob).decode())
np.save(D + 'sample_in.npy', Xte_n[:5]); np.save(D + 'sample_out.npy', forward(Xte_n[:5, None], P)[0])
print('done', len(blob), 'bytes')
