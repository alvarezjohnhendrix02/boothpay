"""BoothPay logo: a cute market booth — striped awning, little counter with a happy face.
One geometry on a 48-unit grid → SVG for the app (python tools/make_icons.py svg) + PNG icons (python tools/make_icons.py).
Preview sheet: python tools/make_icons.py preview <out.png>"""
import os, sys
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')  # app folder
INK, CREAM, CORAL, PINK, LEMON, SHADE = '#2B2342', '#FFF7EA', '#FF8A7A', '#FFA3CF', '#FFE27A', '#4A3F6B'

def shapes():
    s = []
    s.append(('rect', 10, 17, 28, 15, 1, SHADE))                    # inside the booth
    s.append(('rect', 9.2, 17, 2.6, 23, 1.2, INK))                  # poles
    s.append(('rect', 36.2, 17, 2.6, 23, 1.2, INK))
    s.append(('rect', 6, 6.5, 36, 4.5, 2.2, INK))                   # roof cap
    w = 36 / 5
    for i in range(5):                                              # striped awning + scalloped edge
        c = CREAM if i % 2 == 0 else LEMON
        x = 6 + i * w
        s.append(('rect', x, 10, w, 8, 0.4, c))
        s.append(('ellipse', x + w / 2, 18, w / 2, 3.2, c))
    s.append(('rect', 6.5, 29.5, 35, 12, 3, CREAM))                 # counter
    s.append(('ellipse', 19.6, 34.6, 1.6, 2.1, INK))                # face on the counter
    s.append(('ellipse', 28.4, 34.6, 1.6, 2.1, INK))
    s.append(('ellipse', 20.1, 33.8, 0.55, 0.55, CREAM))
    s.append(('ellipse', 28.9, 33.8, 0.55, 0.55, CREAM))
    s.append(('ellipse', 15.6, 37.6, 1.8, 1.0, PINK))
    s.append(('ellipse', 32.4, 37.6, 1.8, 1.0, PINK))
    s.append(('curve', (22.2, 37.2), (24, 39.4), (25.8, 37.2), 1.2, INK))
    return s

def qpts(p0, p1, p2, n=16):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]

def svg():
    o = []
    for sh in shapes():
        k = sh[0]
        if k == 'rect':
            _, x, y, w, h, r, c = sh; o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>')
        elif k == 'ellipse':
            _, cx, cy, rx, ry, c = sh; o.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{c}"/>')
        elif k == 'poly':
            _, pts, c = sh; o.append('<path d="M' + ' L'.join(f'{x} {y}' for x, y in pts) + f'Z" fill="{c}"/>')
        elif k == 'curve':
            _, a, b, d, w, c = sh; o.append(f'<path d="M{a[0]} {a[1]} Q{b[0]} {b[1]} {d[0]} {d[1]}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>')
    return ''.join(o)

def png(size, scale=1.0, full=True):
    S = 4 * size
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if full: d.rectangle([0, 0, S, S], fill=CORAL)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=CORAL)
    u = S / 48 * scale; off = (S - 48 * u) / 2; P = lambda x, y: (off + x * u, off + y * u)
    for sh in shapes():
        k = sh[0]
        if k == 'rect':
            _, x, y, w, h, r, c = sh; d.rounded_rectangle([*P(x, y), *P(x + w, y + h)], radius=r * u, fill=c)
        elif k == 'ellipse':
            _, cx, cy, rx, ry, c = sh; d.ellipse([*P(cx - rx, cy - ry), *P(cx + rx, cy + ry)], fill=c)
        elif k == 'poly':
            _, pts, c = sh; d.polygon([P(x, y) for x, y in pts], fill=c)
        elif k == 'curve':
            _, a, b, e, w, c = sh; pts = [P(x, y) for x, y in qpts(a, b, e)]
            d.line(pts, fill=c, width=max(1, int(w * u)), joint='curve')
            for x, y in (pts[0], pts[-1]): r = w * u / 2; d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    return im.resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    arg = sys.argv[1:]
    if arg[:1] == ['svg']:
        print(svg())
    elif arg[:1] == ['preview']:
        a, b, c, e = png(512, 0.9, False), png(512, 0.7), png(96, 0.9, False), png(48, 0.9, False)
        sh = Image.new('RGBA', (1250, 520), CREAM); sh.paste(a, (0, 4), a); sh.paste(b, (530, 4)); sh.paste(c, (1070, 60), c); sh.paste(e, (1095, 200), e)
        sh.save(arg[1])
    else:
        icons = os.path.join(OUT, 'assets', 'icons')
        for n in (192, 512): png(n, 0.7).save(os.path.join(icons, f'icon-{n}.png'), optimize=True)  # maskable: keep inside the safe zone
        png(512, 0.9, False).save(os.path.join(icons, 'icon-any-512.png'), optimize=True)
        png(180, 0.82).convert('RGB').save(os.path.join(icons, 'apple-touch-icon.png'), optimize=True)
        png(64, 0.92, False).save(os.path.join(icons, 'favicon-64.png'), optimize=True)
        print('icons written')
