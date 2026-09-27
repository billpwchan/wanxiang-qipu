"""每张高清抠图的「脸部」焦点：取主体最上方 12% 行（头顶、发冠）里不透明像素的水平重心 → posters.json 的 fx/fy（百分比，给 object-position 用）"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
D = Path('site/dist'); P = json.loads((D / 'data/posters.json').read_text())
# 人工校正：头部不在最上方的构图（披风、特效比头高）
OVERRIDE = {'吕布': (40, 22), '钟馗': (72, 16), '司空震': (26, 22), '孙悟空': (52, 30), '周瑜': (60, 28), '刘禅': (62, 34), '孙膑': (48, 32)}
for name, v in P.items():
    a = np.array(Image.open(D / v['cut']).getchannel('A')) > 60
    ys, xs = np.nonzero(a)
    if not len(ys): continue
    y0, y1 = ys.min(), ys.max(); top = y0 + (y1 - y0) * 0.12
    sel = ys <= top
    fx = xs[sel].mean() / a.shape[1]; fy = (y0 + (y1 - y0) * 0.14) / a.shape[0]
    v['fx'] = round(float(fx) * 100, 1); v['fy'] = round(float(fy) * 100, 1)
    if name in OVERRIDE: v['fx'], v['fy'] = OVERRIDE[name]
(D / 'data/posters.json').write_text(json.dumps(P, ensure_ascii=False, indent=1))
print({k: (v.get('fx'), v.get('fy')) for k, v in list(P.items())[:8]})
