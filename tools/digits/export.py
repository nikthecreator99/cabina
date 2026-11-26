# float32 веса (weights.b64) -> int8 с масштабом на каждый тензор -> js/route-digits-w.js
import base64, numpy as np, sys
import os
D = os.path.dirname(os.path.abspath(__file__)) + '/'  # здесь же — файлы MNIST и веса
f = np.frombuffer(base64.b64decode(open(D + 'weights.b64').read()), np.float32)
C1, C2, F, NC = map(int, f[:4]); o = 4
sizes = [C1 * 25, C1, C2 * C1 * 25, C2, C2 * 16 * F, F, F * NC, NC]
out = bytearray(np.array([C1, C2, F, NC], np.uint16).tobytes())
for n in sizes:
    t = f[o:o + n]; o += n
    sc = float(np.abs(t).max() / 127) or 1.0
    out += np.array([sc], np.float32).tobytes() + np.clip(np.round(t / sc), -127, 127).astype(np.int8).tobytes()
b64 = base64.b64encode(bytes(out)).decode()
open(D + 'weights-q.b64', 'w').write(b64)
open(sys.argv[1], 'w').write('// Веса сети для рукописных цифр (route-digits.js): размеры [C1, C2, F, классов] (uint16),\n'
  '// дальше для каждого тензора масштаб (float32) и значения int8. Обучено на MNIST (CC BY-SA 3.0,\n'
  '// Y. LeCun, C. Cortes, C. Burges) с искажениями под почерк ручкой. Обучение — tools/digits/train.py.\n'
  f'export const WEIGHTS = \'{b64}\';\n')
print(len(b64))
