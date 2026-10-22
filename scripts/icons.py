# Génère les icônes PWA de CryptoAnalyze (chandeliers blancs sur indigo #5B3FD9) : python3 scripts/icons.py public/icons
from PIL import Image, ImageDraw
import sys, os
out = sys.argv[1] if len(sys.argv) > 1 else 'public/icons'
INDIGO = (91, 63, 217, 255)
GOLD = (242, 169, 59, 255)
def draw(size, pad_ratio, radius_ratio, path):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=INDIGO)
    pad = S * pad_ratio
    k = (S - 2 * pad) / 24
    w = max(2, int(2.2 * k))
    P = lambda x, y: (pad + x * k, pad + y * k)
    def line(a, b, col='white'):
        d.line([P(*a), P(*b)], fill=col, width=w)
        for p in (P(*a), P(*b)): d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=col)
    # axes
    line((3, 3), (3, 19)); line((5, 21), (21, 21)); d.pieslice([P(3, 19)[0] - 0, P(3, 19)[1] - 0, P(5, 21)[0] + 0, P(5, 21)[1] + 0], 0, 0)
    line((3, 19), (5, 21))
    # bougie 1 (blanche) et bougie 2 (or)
    line((9, 5), (9, 9)); line((9, 15), (9, 17))
    d.rounded_rectangle([*P(7, 9), *P(11, 15)], radius=int(k), outline='white', width=w)
    line((17, 3), (17, 5), GOLD); line((17, 13), (17, 16), GOLD)
    d.rounded_rectangle([*P(15, 5), *P(19, 13)], radius=int(k), fill=GOLD)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, path))
os.makedirs(out, exist_ok=True)
draw(512, 0.24, 0.0, 'icon-maskable-512.png')
draw(192, 0.24, 0.0, 'icon-maskable-192.png')
draw(512, 0.18, 0.22, 'icon-512.png')
draw(192, 0.18, 0.22, 'icon-192.png')
draw(180, 0.2, 0.0, 'apple-touch-icon.png')
draw(32, 0.12, 0.22, 'favicon-32.png')
print('ok')
