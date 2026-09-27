"""每名英雄立绘 / 棋手海报的主色（用于页面按主核自动换色）→ site/dist/data/palette.json"""
import json, colorsys
from pathlib import Path
from PIL import Image
D = Path('site/dist')
cards = json.load(open(D / 'data/cards.json')); art = json.load(open(D / 'data/art.json'))
def vivid(path, alpha=True):
    im = Image.open(D / path).convert('RGBA'); im.thumbnail((120, 120))
    px = [p for p in im.getdata() if p[3] > 200]
    q = Image.new('RGB', (len(px), 1)); q.putdata([p[:3] for p in px])
    pal = q.quantize(12, method=Image.Quantize.MEDIANCUT)
    cols = pal.getpalette()[:36]; counts = sorted(pal.getcolors(), reverse=True)
    best, score = None, -1
    for n, i in counts:
        r, g, b = cols[i*3:i*3+3]; h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
        sc = n / len(px) * (s ** 1.5) * (1 - abs(l - .5) * 1.4)
        if sc > score: best, score = (h, l, s), sc
    h, l, s = best
    acc = colorsys.hls_to_rgb(h, .62, min(1, max(.55, s)))    # 亮色：文字强调
    deep = colorsys.hls_to_rgb(h, .09, min(.6, s))             # 深色：底色
    hx = lambda c: '#%02x%02x%02x' % tuple(round(v * 255) for v in c)
    return {'accent': hx(acc), 'deep': hx(deep), 'hue': round(h * 360)}
out = {'hero': {}, 'lord': {}}
for h in cards['heroes']:
    out['hero'][h['name']] = vivid(h['art'])
for n, v in art['lord'].items():
    out['lord'][n] = vivid(v['poster'])
json.dump(out, open(D / 'data/palette.json', 'w'), ensure_ascii=False, indent=0)
print({k: out['hero'][k] for k in ['花木兰', '公孙离', '诸葛亮', '韩信', '杨玉环']})
print({k: out['lord'][k] for k in ['孙小宾', '嬴律', '明先生', '香香']})
