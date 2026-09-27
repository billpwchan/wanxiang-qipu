"""v5 素材：官方棋手立绘、阵营/关键词图标矢量化、卡图转 webp。

输入
  research/v4/official/lord/*-banShenImg.png   官方棋手 3D 立绘（带透明通道，来自官方阵容接口）
  research/v4/official/lord/*-icon.png         棋手头像
  research/v4/official/icon/*.png              官方阵营 / 关键词图标（白色单色）
  research/cache/cards/*.png                   官方卡牌接口的卡面原画与头像（scripts/build_data.py 下载的缓存）
输出
  site/dist/assets/lord/<id>.webp  <id>-s.webp  <id>-i.webp
  site/dist/assets/c/<name>.webp               （卡图 webp）
  site/dist/data/icons.js                      （potrace 生成的 SVG path）
  site/dist/data/cards.json                    （img/art 路径改为 webp）
"""
import hashlib, json, os, re, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OFF = ROOT / 'research/v4/official'
DIST = ROOT / 'site/dist'


def lid(name):
    return 'l' + hashlib.md5(name.encode()).hexdigest()[:8]


def lords():
    out = DIST / 'assets/lord'
    out.mkdir(parents=True, exist_ok=True)
    man = {}
    for f in sorted((OFF / 'lord').glob('*-banShenImg.png')):
        name = f.name.split('-')[0]
        im = Image.open(f).convert('RGBA')
        # 立绘底部是腰线裁切：保留底边，只裁掉左右上方空白
        bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        l, t, r, b = bb
        pad = 12
        im = im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), im.height))
        i = lid(name)
        for suffix, h in (('', 960), ('-s', 420)):
            k = im.copy()
            if k.height > h:
                k = k.resize((round(k.width * h / k.height), h), Image.LANCZOS)
            k.save(out / f'{i}{suffix}.webp', 'WEBP', quality=84, method=6)
        ic = OFF / 'lord' / f'{name}-icon.png'
        if ic.exists():
            Image.open(ic).convert('RGBA').save(out / f'{i}-i.webp', 'WEBP', quality=86, method=6)
        man[name] = {'id': i, 'w': im.width, 'h': im.height}
    return man


def trace(png, blur=7):
    """白色单色图标 → 放大、模糊、阈值 → potrace → SVG path。"""
    im = Image.open(png).convert('RGBA')
    lum, a = im.convert('L'), im.getchannel('A')
    base = Image.new('L', im.size)
    base.putdata([int(x * y / 255) for x, y in zip(lum.getdata(), a.getdata())])
    pad = Image.new('L', (im.width + 4, im.height + 4), 0)
    pad.paste(base, (2, 2))
    big = pad.resize((pad.width * 12, pad.height * 12), Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    bw = big.point(lambda v: 0 if v > 110 else 255, '1')  # potrace 画黑色
    with tempfile.TemporaryDirectory() as td:
        pbm = Path(td) / 'i.pbm'
        svg = Path(td) / 'i.svg'
        bw.save(pbm)
        subprocess.run(['potrace', str(pbm), '-s', '-o', str(svg), '--turdsize', '40', '--alphamax', '1.25', '--opttolerance', '0.8'], check=True)
        s = svg.read_text()
    W, H = big.size
    tr = re.search(r'<g transform="([^"]+)"', s).group(1)
    paths = re.findall(r'<path d="([^"]+)"', s)
    return {'w': W, 'h': H, 'tr': tr, 'd': ' '.join(p.replace('\n', ' ') for p in paths)}


def icons():
    names = {
        'Icon_HeLuo': '河洛', 'Icon_ZhuLu': '逐鹿', 'Icon_RiLuoHai': '日落海',
        'Icon_SanFenZhiDi': '三分之地', 'Icon_DaHeLiuYu': '大河流域',
        'dengchang': '登场', 'zhengbei': '整备', 'xisheng': '牺牲', 'fusheng': '复生', 'hecheng': '合成',
        'tuteng': '图腾', 'shanxian': '闪现', 'kaixuan': '凯旋', 'tuichang': '退场', 'jiaofeng': '开团',
        'sheling': '摄灵', 'baizhen': '败阵', 'wuzhenyin': '无阵营',
    }
    res = {}
    for f in sorted((OFF / 'icon').glob('*.png')):
        k = f.stem
        if k not in names:
            continue
        res[names[k]] = trace(f, 2.2 if k == "Icon_SanFenZhiDi" else 7)
    js = '// 官方阵营 / 关键词图标，potrace 矢量化。生成：scripts/build_assets_v5.py\n'
    js += 'export const ICONS = ' + json.dumps(res, ensure_ascii=False) + ';\n'
    (DIST / 'data/icons.js').write_text(js)
    return list(res)


def cards():
    src = ROOT / 'research/cache/cards'
    out = DIST / 'assets/c'
    out.mkdir(parents=True, exist_ok=True)
    data = json.loads((DIST / 'data/cards.json').read_text())
    done = {}

    def conv(p):
        if not p or not p.startswith('assets/cards/'):
            return p
        if p in done:
            return done[p]
        f = src / Path(p).name
        o = out / (f.stem + '.webp')
        if not o.exists():
            im = Image.open(f)
            im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
            im.save(o, 'WEBP', quality=82, method=6)
        done[p] = f'assets/c/{o.name}'
        return done[p]

    for sec in ('heroes', 'effects', 'equipment', 'talents', 'lords'):
        for x in data[sec]:
            for k in ('img', 'art'):
                if k in x:
                    x[k] = conv(x[k])
    (DIST / 'data/cards.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    return len(done)


if __name__ == '__main__':
    m = lords()
    (DIST / 'data/lords.json').write_text(json.dumps(m, ensure_ascii=False))
    print('lords', len(m))
    print('icons', icons())
    print('cards', cards())
