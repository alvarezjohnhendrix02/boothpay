"""ContactSheet logo: an inventory box sealed with film-strip tape (+ a small sparkle).
One geometry (48-unit grid) → SVG for the app + PNG icons."""
import os, sys
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')  # app folder
INK, CREAM, CORAL, LEMON = '#2B2342', '#FFF7EA', '#FF8A7A', '#FFE27A'

def shapes():
    s = []
    s.append(('rect', 7, 13, 34, 8.5, 2.6, INK))      # lid
    s.append(('rect', 9, 22.5, 30, 17.5, 2.6, INK))   # box body
    s.append(('rect', 19.5, 10.5, 9, 29.5, 1.2, CREAM))  # film tape over lid + body
    for y in (12, 15.6, 19.2, 22.8, 26.4, 30, 33.6, 37.2):  # sprocket holes
        s.append(('rect', 20.6, y, 1.6, 1.9, 0.5, INK))
        s.append(('rect', 25.8, y, 1.6, 1.9, 0.5, INK))
    for y in (12.6, 21.4, 30.2):                          # film frames
        s.append(('rect', 22.9, y, 2.2, 6.6, 0.6, CORAL))
    x = 11.3                                              # barcode = inventory
    for w in (0.6, 0.3, 0.9, 0.3, 0.5, 1.0, 0.3, 0.7):
        s.append(('rect', x, 30.2, w, 6.6, 0.1, CREAM)); x += w + 0.3
    s.append(('rect', 30.6, 30.4, 6.2, 1.5, 0.7, CREAM))  # stock label lines
    s.append(('rect', 30.6, 33.6, 4.2, 1.5, 0.7, CORAL))
    s.append(('star', 38.5, 8.5, 4.6, CREAM))            # creative sparkle
    s.append(('star', 9.5, 7.5, 2.4, LEMON))
    return s

def star_pts(cx, cy, r):
    k = r * 0.28
    return [(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k), (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)]

def svg():
    parts = []
    for sh in shapes():
        if sh[0] == 'rect':
            _, x, y, w, h, r, c = sh
            parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>')
        else:
            _, cx, cy, r, c = sh
            parts.append('<path d="M' + ' L'.join(f'{px:.2f} {py:.2f}' for px, py in star_pts(cx, cy, r)) + f'Z" fill="{c}"/>')
    return ''.join(parts)

def png(size, bg_radius=None, scale=1.0, full=True):
    S = 4 * size
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if full: d.rectangle([0, 0, S, S], fill=CORAL)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=CORAL)
    u = S / 48 * scale; off = (S - 48 * u) / 2
    for sh in shapes():
        if sh[0] == 'rect':
            _, x, y, w, h, r, c = sh
            d.rounded_rectangle([off + x * u, off + y * u, off + (x + w) * u, off + (y + h) * u], radius=r * u, fill=c)
        else:
            _, cx, cy, r, c = sh
            d.polygon([(off + px * u, off + py * u) for px, py in star_pts(cx, cy, r)], fill=c)
    return im.resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    if sys.argv[1:] == ['svg']:
        print(svg())
    elif sys.argv[1:] == ['preview']:
        a = png(512, full=False, scale=0.86); b = png(512, scale=0.66); c = png(96, full=False, scale=0.86); e = png(48, full=False, scale=0.86)
        sheet = Image.new('RGBA', (1250, 520), CREAM); sheet.paste(a, (0, 4), a); sheet.paste(b, (530, 4)); sheet.paste(c, (1070, 60), c); sheet.paste(e, (1095, 200), e)
        sheet.save(os.path.join(os.path.dirname(__file__), 'logo_preview.png'))
    else:
        icons = os.path.join(OUT, 'assets', 'icons')
        for n in (192, 512): png(n, scale=0.66).save(os.path.join(icons, f'icon-{n}.png'), optimize=True)   # maskable: safe zone
        png(512, full=False, scale=0.86).save(os.path.join(icons, 'icon-any-512.png'), optimize=True)
        png(180, scale=0.78).convert('RGB').save(os.path.join(icons, 'apple-touch-icon.png'), optimize=True)
        png(64, full=False, scale=0.86).save(os.path.join(icons, 'favicon-64.png'), optimize=True)
        print('icons written')
