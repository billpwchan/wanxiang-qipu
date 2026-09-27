"""阿里妈妈数黑体子集化（展示字体：标题、名字、数字）→ site/dist/fonts/shuhei.woff2
字体：@fontpkg/alimama-shu-hei-ti（阿里妈妈数黑体，免费商用），原文件在 research/v4/fonts/。"""
import json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'site/dist'
chars = set()
for p in [D / 'index.html', D / 'app.js', D / 'data/plan.js']:
    chars |= set(p.read_text())
cards = json.load(open(D / 'data/cards.json'))
for k in ['heroes', 'effects', 'talents', 'equipment', 'lords']:
    for c in cards[k]:
        chars |= set(c['name'])
chars |= set(''.join(chr(i) for i in range(0x20, 0x7f))) | set('→←×·—–…「」『』（）：；，。！？、%+−±≤≥↑↓')
chars = {c for c in chars if ord(c) >= 0x20}
txt = Path('/tmp/wx-font-chars.txt'); txt.write_text(''.join(sorted(chars)))
src = ROOT / 'research/v4/fonts/alimama-shu-hei-ti-1.0.5/AlimamaShuHeiTi-Bold.ttf'
out = D / 'fonts/shuhei.woff2'
subprocess.run([sys.executable, '-m', 'fontTools.subset', str(src), f'--text-file={txt}', '--flavor=woff2', f'--output-file={out}', '--layout-features=*', '--no-hinting'], check=True)
print(f'{len(chars)} 字 → {out} {out.stat().st_size // 1024} KB')
