"""ContactSheet logo: a cute paper sheet with a face and a tiny checklist (the stock list).
One geometry on a 48-unit grid → SVG for the app (python tools/make_icons.py svg) + PNG icons (python tools/make_icons.py).
Preview sheet: python tools/make_icons.py preview <out.png>"""
import os, sys
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')  # app folder
INK, CREAM, CORAL, PINK, MINT, FOLD, LINE = '#2B2342', '#FFF7EA', '#FF8A7A', '#FFA3CF', '#7FE3B4', '#F2D3BD', '#E9D7C3'

def shapes():
    s = []
    s.append(('rect', 11, 6, 26, 36, 4.5, CREAM))                 # the sheet
    s.append(('poly', [(29.5, 5.5), (37.5, 5.5), (37.5, 13.5)], CORAL))  # cut corner…
    s.append(('poly', [(29.5, 5.5), (29.5, 11.5), (31.5, 13.5), (37.5, 13.5)], FOLD))  # …folded down
    s.append(('ellipse', 19.2, 20.5, 2.1, 2.7, INK))              # eyes
    s.append(('ellipse', 28.8, 20.5, 2.1, 2.7, INK))
    s.append(('ellipse', 19.9, 19.4, 0.75, 0.75, CREAM))          # eye shine
    s.append(('ellipse', 29.5, 19.4, 0.75, 0.75, CREAM))
    s.append(('ellipse', 15.8, 25.2, 2.1, 1.25, PINK))            # blush
    s.append(('ellipse', 32.2, 25.2, 2.1, 1.25, PINK))
    s.append(('curve', (21.6, 24.6), (24, 27.6), (26.4, 24.6), 1.3, INK))  # smile
    for y in (31.2, 36.0):                                        # tiny checklist = inventory
        s.append(('rect', 15.2, y - 1.4, 2.8, 2.8, 0.8, MINT))
        s.append(('rect', 20.0, y - 0.8, 12.4 if y < 33 else 9.2, 1.6, 0.8, LINE))
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
