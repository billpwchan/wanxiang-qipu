"""高清海报素材：王者荣耀官网皮肤原画（1920×882）→ 自动匹配万象棋卡面用的皮肤 → Vision 抠图 → 背景层 + 人物层。
python3 scripts/fetch_skins.py [英雄 ...]      输出 site/dist/assets/poster/*.webp 与 site/dist/data/posters.json
"""
import json, subprocess, sys, urllib.request, io
from pathlib import Path
import cv2, numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'site/dist'; CACHE = ROOT / 'research/skins'; OUT = D / 'assets/poster'
CACHE.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
LIFT = ROOT / 'scripts/lift/lift'
cards = json.load(open(D / 'data/cards.json'))
kamian = {h['name']: D / h['art'] for h in cards['heroes']}
hl = CACHE / 'herolist.json'
if not hl.exists():
    hl.write_bytes(urllib.request.urlopen('https://pvp.qq.com/web201605/js/herolist.json', timeout=30).read())
heroes = {h['cname']: h for h in json.loads(hl.read_text(encoding='utf-8'))}
from importlib import util
spec = util.spec_from_file_location('r', D / 'data/routes.js')
CUT_ONLY = '--cut-only' in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith('--')]
targets = args or ['吕布', '公孙离', '花木兰', '司空震', '猪八戒', '诸葛亮', '敖隐', '李信', '韩信', '嬴政', '海月']
# 人工指定：默认皮肤是双人原画等不适合抠单人的情况
SKIN_OVERRIDE = {'瑶': 3}
sift = cv2.SIFT_create(nfeatures=4000)
bf = cv2.BFMatcher()
def feats_rgba(p):
    im = Image.open(p).convert('RGBA'); a = np.array(im)
    g = cv2.cvtColor(a[:, :, :3], cv2.COLOR_RGB2GRAY); m = (a[:, :, 3] > 128).astype(np.uint8) * 255
    return sift.detectAndCompute(g, m)
def score(k1, d1, img):
    g = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2GRAY)
    k2, d2 = sift.detectAndCompute(g, None)
    if d1 is None or d2 is None: return 0
    good = [m for m, n in bf.knnMatch(d1, d2, k=2) if m.distance < 0.72 * n.distance]
    if len(good) < 8: return len(good)
    src = np.float32([k1[m.queryIdx].pt for m in good]); dst = np.float32([k2[m.trainIdx].pt for m in good])
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
    return int(inl.sum()) if inl is not None else 0
index = json.loads((D / 'data/posters.json').read_text()) if (D / 'data/posters.json').exists() else {}
for name in targets:
    if name not in heroes: print('not on official site:', name); continue
    if CUT_ONLY and name in index and index[name].get('cut') and '--force' not in sys.argv: continue
    h = heroes[name]; e = h['ename']; skins = [s for s in h.get('skin_name', '').split('|') if s]
    k1, d1 = feats_rgba(kamian[name])
    best = (-1, 1)
    for i in range(1, len(skins) + 1):
        p = CACHE / f'{e}-{i}.jpg'
        if not p.exists():
            try: p.write_bytes(urllib.request.urlopen(f'https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{e}/{e}-bigskin-{i}.jpg', timeout=30).read())
            except Exception as ex: print('skip', name, i, ex); continue
        s = score(k1, d1, Image.open(p)); print(f'  {name} {i} {skins[i-1]} inliers={s}')
        if s > best[0]: best = (s, i)
    s, i = best if best[0] >= 30 else (best[0], 1)   # 卡面原画不在官网皮肤里时用默认皮肤
    if name in SKIN_OVERRIDE: i = SKIN_OVERRIDE[name]
    src = CACHE / f'{e}-{i}.jpg'; fg = CACHE / f'{e}-{i}-fg.png'
    if not fg.exists(): subprocess.run([str(LIFT), str(src), str(fg)], check=True, capture_output=True)
    bgim = Image.open(src).convert('RGB'); fgim = Image.open(fg).convert('RGBA')
    W = 1600; H = round(bgim.height * W / bgim.width)
    bgim = bgim.resize((W, H), Image.LANCZOS); fgim = fgim.resize((W, H), Image.LANCZOS)
    a = np.array(fgim)[:, :, 3]; ys, xs = np.nonzero(a > 40)
    # 主体重心（按不透明度加权）：手机竖屏裁切时对准人物
    cx = float(xs.mean() / W); cy = float(ys.mean() / H); top = float(ys.min() / H)
    slug = f'{e}-{i}'
    if not CUT_ONLY:
        bgim.save(OUT / f'{slug}-bg.webp', quality=74, method=6)
        fgim.save(OUT / f'{slug}-fg.webp', quality=82, method=6)
    x0, y0, x1, y1 = fgim.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    pad = int(0.02 * W); cut = fgim.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
    if cut.height > 900: cut = cut.resize((round(cut.width * 900 / cut.height), 900), Image.LANCZOS)
    cut.save(OUT / f'{slug}-cut.webp', quality=82, method=6)
    index[name] = {} if CUT_ONLY else {'bg': f'assets/poster/{slug}-bg.webp', 'fg': f'assets/poster/{slug}-fg.webp'}
    index[name].update({'cut': f'assets/poster/{slug}-cut.webp', 'cw': cut.width, 'ch': cut.height, 'w': W, 'h': H, 'cx': round(cx, 3), 'cy': round(cy, 3), 'top': round(top, 3), 'skin': skins[i-1], 'inliers': s})
    print(f'{name}: {skins[i-1]} (inliers {s}) focus {cx:.2f},{cy:.2f}')
(D / 'data/posters.json').write_text(json.dumps(index, ensure_ascii=False, indent=1))
