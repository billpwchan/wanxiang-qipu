"""分享图 1200×630：冰蓝底 + 官方棋手立绘 + 竖纹玻璃（和首页同一种效果，用 numpy 离线渲染）。
→ site/dist/assets/og.jpg"""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'site/dist'
FONT = ROOT / 'research/v4/fonts/alimama-shu-hei-ti-1.0.5/AlimamaShuHeiTi-Bold.ttf'
W, H = 1200, 630
lords = json.loads((D / 'data/lords.json').read_text())


def grad(w, h, stops):
    x = np.linspace(0, 1, w)[None, :, None]
    y = np.linspace(0, 1, h)[:, None, None]
    t = np.clip(x * 0.75 + y * 0.25, 0, 1)
    out = np.zeros((h, w, 3))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        m = ((t >= a) & (t <= b)).astype(float)
        k = np.clip((t - a) / (b - a), 0, 1)
        out += m * (np.array(ca) * (1 - k) + np.array(cb) * k)
    return Image.fromarray(np.clip(out, 0, 255).astype('uint8'))


def flute(img, x0, x1, n=14, amt=0.06, frost=0.2):
    """对 img 的 [x0,x1) 区域做竖纹玻璃：每条纹理内横向折射 + 模糊 + 高光。"""
    a = np.asarray(img).astype(float)
    h, w, _ = a.shape
    out = a.copy()
    blur = np.asarray(img.filter(ImageFilter.GaussianBlur(3))).astype(float)
    fw = (x1 - x0) / n
    tint = np.array([232, 237, 250], float)
    for x in range(x0, x1):
        f = ((x - x0) % fw) / fw
        lens = (f - 0.5) * (1 + 0.35 * ((f - 0.5) * 2) ** 2)
        for ch, k in ((0, 1.18), (1, 1.0), (2, 0.82)):
            sx = int(np.clip(x + lens * amt * w * k, 0, w - 1))
            out[:, x, ch] = blur[:, sx, ch]
        shade = 0.93 + 0.14 * (1 - f)
        hi = (max(0, (f - 0.9) / 0.1) * 0.55 + max(0, (0.06 - f) / 0.06) * 0.25) * 60
        out[:, x] = out[:, x] * shade + hi
        out[:, x] = out[:, x] * (1 - frost) + tint * frost
    return Image.fromarray(np.clip(out, 0, 255).astype('uint8'))


bg = grad(W, H, [(0, (226, 233, 250)), (0.5, (205, 217, 250)), (0.8, (228, 216, 250)), (1, (212, 236, 246))])
art = bg.copy().convert('RGBA')
for name, x, h in (('明先生', 690, 560), ('孙小宾', 820, 620), ('嬴律', 960, 560)):
    im = Image.open(D / f"assets/lord/{lords[name]['id']}.webp").convert('RGBA')
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    sh = Image.new('RGBA', im.size, (30, 40, 90, 0))
    sh.putalpha(im.getchannel('A').point(lambda v: int(v * 0.35)))
    sh = sh.filter(ImageFilter.GaussianBlur(24))
    art.alpha_composite(sh, (x - im.width // 2, H - h + 18))
    art.alpha_composite(im, (x - im.width // 2, H - h))
art = art.convert('RGB')
# 左侧大片竖纹玻璃（文字底），右侧留清晰的棋手
out = flute(art, 0, 640, n=16, amt=0.05, frost=0.55)
# 玻璃与清晰区之间的柔和过渡
mask = Image.new('L', (W, H), 0)
md = ImageDraw.Draw(mask)
for i in range(80):
    md.line([(600 + i, 0), (600 + i, H)], fill=int(255 * (1 - i / 80)))
md.rectangle([0, 0, 600, H], fill=255)
out = Image.composite(out, art, mask)

d = ImageDraw.Draw(out)
ink = (16, 21, 46)
f1 = ImageFont.truetype(str(FONT), 30)
f2 = ImageFont.truetype(str(FONT), 92)
f3 = ImageFont.truetype(str(FONT), 30)
d.text((64, 70), '万象棋谱 · S1', font=f1, fill=ink)
d.text((60, 190), '这局禁了谁？', font=f2, fill=ink)
d.text((64, 318), '用哪个棋手、打哪套', font=f3, fill=(70, 80, 115))
d.text((64, 364), '每个阶段买什么、拍卖出多少', font=f3, fill=(70, 80, 115))
d.rounded_rectangle([64, 470, 330, 536], radius=33, fill=(44, 70, 245))
d.text((96, 486), '开始对局', font=ImageFont.truetype(str(FONT), 30), fill=(255, 255, 255))
d.line([(250, 503), (290, 503)], fill=(255, 255, 255), width=4)
d.line([(276, 489), (291, 503), (276, 517)], fill=(255, 255, 255), width=4, joint='curve')
d.text((64, 572), '数据：顶尖对局 · 9/24 版本', font=ImageFont.truetype(str(FONT), 20), fill=(110, 118, 150))
out.save(D / 'assets/og.jpg', 'JPEG', quality=88, optimize=True, progressive=True)
print('og', (D / 'assets/og.jpg').stat().st_size // 1024, 'KB')
