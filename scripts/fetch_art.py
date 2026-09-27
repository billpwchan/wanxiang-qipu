"""下载官方「游戏内卡面渲染」（CardCapture）与棋手立绘，缩放后存为 WebP：site/dist/assets/art/。
卡面：英雄/效果/装备/天赋各一张（320px 宽）；棋手：海报、半身像、背景（最长边 900px）。
写出 site/dist/data/art.json：名字 → 图片路径。"""
import concurrent.futures, hashlib, io, json, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'research' / 'raw-20260925'
OUT = ROOT / 'site' / 'dist' / 'assets' / 'art'
OUT.mkdir(parents=True, exist_ok=True)

def load(n, key):
    t = (RAW / f'oscard_{n}.js').read_text(encoding='utf-8')
    return json.loads(t[t.index('{'):t.rindex('}') + 1])[key]

def fetch(job):
    url, name, maxw, maxh = job
    p = OUT / name
    if p.exists() and p.stat().st_size > 500:
        return name, None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://wxq.qq.com/'})
        img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=40).read()))
        img = img.convert('RGBA')
        img.thumbnail((maxw, maxh), Image.LANCZOS)
        img.save(p, 'WEBP', quality=80, method=5)
        return name, None
    except Exception as e:  # 失败的留空，页面会退回小头像
        return name, str(e)

jobs, art = [], {'card': {}, 'lord': {}}
for n, key, kind in [(1, 'heroCards', 'hero'), (2, 'effectCards', 'effect'), (4, 'equipCards', 'equip'), (8, 'talentCards', 'talent')]:
    for c in load(n, key):
        u = c.get('cardImage')
        if not u:
            continue
        name = 'c-' + hashlib.sha256(u.encode()).hexdigest()[:16] + '.webp'
        jobs.append((u, name, 320, 460))
        art['card'][f"{kind}:{c['name']}"] = 'assets/art/' + name
for l in load(16, 'lords'):
    entry = {}
    for field, label, size in [('icon', 'poster', (720, 1100)), ('portraitV2', 'half', (720, 900)), ('banShenImg', 'full', (720, 1100)), ('bgImg', 'bg', (1200, 700))]:
        u = l.get(field)
        if not u:
            continue
        name = f'l-{label}-' + hashlib.sha256(u.encode()).hexdigest()[:12] + '.webp'
        jobs.append((u, name, *size))
        entry[label] = 'assets/art/' + name
    art['lord'][l['name']] = entry

failed = []
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    for i, (name, err) in enumerate(pool.map(fetch, jobs)):
        if err:
            failed.append((name, err))
        if (i + 1) % 100 == 0:
            print(f'{i + 1}/{len(jobs)}', flush=True)
bad = {f for f, _ in failed}
for k in ('card',):
    art[k] = {n: p for n, p in art[k].items() if p.split('/')[-1] not in bad}
for n, e in art['lord'].items():
    art['lord'][n] = {k: p for k, p in e.items() if p.split('/')[-1] not in bad}
(ROOT / 'site' / 'dist' / 'data' / 'art.json').write_text(json.dumps(art, ensure_ascii=False))
total = sum(p.stat().st_size for p in OUT.glob('*.webp'))
print(json.dumps({'jobs': len(jobs), 'failed': len(failed), 'bytes': total}, ensure_ascii=False))
for f in failed[:10]:
    print('  failed', f)
