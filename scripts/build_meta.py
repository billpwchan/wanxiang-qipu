"""把 datawxq 公开榜单（顶尖棋手、v260924、近 7 天）汇总成路线家族数据：site/dist/data/meta.js。
来源页面：https://www.datawxq.com/lineups 与 /rankings/commanders（浏览器公开页面读取，未调用其签名接口）。"""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
D = sorted((ROOT / 'research/v2').glob('datawxq-*'))[-1]  # 最新一次抓取
FACS = ['河洛', '逐鹿', '日落海', '三分之地', '大河流域']

def parse(c):
    m = [float(x) for x in re.findall(r'([\d.]+)', c['metrics'])[:4]]
    return {'title': c['title'], 'lords': [[re.sub(r'\s*[\d.]+%', '', x).strip(), float(re.search(r'([\d.]+)%', x).group(1))] for x in c['commanders'] if '%' in x],
            'units': [{'h': u['name'], 'aw': u['awakened'], 'items': u['items']} for u in c['units']],
            'pick': m[0], 'top3': m[1], 'win': m[2], 'avg': m[3], 'games': int(re.search(r'(\d+) 场', c['meta']).group(1)),
            'size': int(re.search(r'(\d) 人', c['meta']).group(1))}

def family(c):
    hs = {u['h'] for u in c['units']}
    if '司空震' in hs and ({'亚瑟', '海诺', '姬小满'} & hs): return 'yuhuan-rilou'
    if '敖隐' in hs: return 'totem'
    if '李信' in hs: return 'lixin'
    if '花木兰' in hs and '上官婉儿' in hs: return 'mulan'
    if '嬴政' in hs: return 'yingzheng'
    if '诸葛亮' in hs and '杨玉环' in hs: return 'zhuge-yuhuan'
    if '猪八戒' in hs and '姬小满' in hs: return 'marco-pig'
    if '孙悟空' in hs and '阿轲' in hs: return 'wukong-sanfen'
    if '韩信' in hs and ({'雅典娜', '亚连', '安琪拉'} & hs): return 'hanxin-zhengbei'
    if '公孙离' in hs or ({'虞姬', '张良', '云中君'} <= hs) or ('韩信' in hs and '张良' in hs and '孙悟空' not in hs): return 'kaituan'
    if '海月' in hs and '扁鹊' in hs: return 'haiyue'
    if '司空震' in hs and '裴擒虎' in hs: return 'haiyue-lukong'
    if '裴擒虎' in hs and '猪八戒' in hs: return 'trap-jingpig'
    if '安琪拉' in hs and '米莱狄' in hs: return 'trap-rilou-classic'
    if '百里守约' in hs or ('程咬金' in hs and '铠' in hs and '百里守约' in hs): return 'trap-shouyue'
    return 'other:' + c['title']

def agg(cards):
    fam = {}
    for c in cards:
        f = family(c)
        x = fam.setdefault(f, {'games': 0, 'sa': 0, 's3': 0, 'sw': 0, 'pick': 0, 'forms': []})
        x['games'] += c['games']; x['sa'] += c['avg'] * c['games']; x['s3'] += c['top3'] * c['games']; x['sw'] += c['win'] * c['games']; x['pick'] += c['pick']
        x['forms'].append(c)
    out = {}
    for f, x in fam.items():
        out[f] = {'games': x['games'], 'avg': round(x['sa'] / x['games'], 2), 'top3': round(x['s3'] / x['games'], 1), 'win': round(x['sw'] / x['games'], 1), 'pick': round(x['pick'], 1),
                  'forms': sorted(x['forms'], key=lambda c: -c['games'])}
    return out

allc = [parse(c) for c in json.load(open(D / 'lineups-all.json'))]
meta = {'source': f'datawxq.com 公开榜单 · 顶尖棋手 · 近 7 天 · {D.name[-8:]} 读取', 'families': agg(allc), 'byBan': {}}
for fac in FACS:
    cards = [parse(c) for c in json.load(open(D / f'lineups-ban-{fac}.json'))['cards']]
    meta['byBan'][fac] = {f: {k: v for k, v in x.items() if k != 'forms'} for f, x in agg(cards).items()}
# 棋手榜
t = [l.strip() for l in (D / 'lords.txt').read_text().split('\n') if l.strip()]
lords = []
i = t.index('场次') + 1
while i + 6 < len(t) and not t[i].startswith('万象棋大数据'):
    name, skill = t[i], t[i + 1]
    nums = t[i + 2:i + 7]
    try:
        lords.append({'name': name, 'pick': float(nums[0].rstrip('%')), 'avg': float(nums[1]), 'win': float(nums[2].rstrip('%')), 'top3': float(nums[3].rstrip('%')), 'games': int(nums[4])})
    except ValueError:
        break
    i += 7
meta['lords'] = lords
(ROOT / 'site/dist/data/meta.js').write_text('// 由 scripts/build_meta.py 生成。统计来自公开榜单，不是本站实测。\nexport const META = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
for f, x in sorted(meta['families'].items(), key=lambda kv: kv[1]['avg']):
    print(f"{x['avg']:.2f} top3 {x['top3']:.0f}% win {x['win']:.0f}% {x['games']:6d}g pick {x['pick']:5.1f}%  {f}  forms={len(x['forms'])}")
print('lords', len(lords), lords[:2])
print('\nby ban (avg / games):')
fams = sorted(meta['families'], key=lambda f: meta['families'][f]['avg'])
print('%-22s' % '' + ''.join('%-12s' % f for f in FACS))
for f in fams:
    print('%-22s' % f[:22] + ''.join(('%-12s' % (f"{meta['byBan'][b][f]['avg']:.2f}/{meta['byBan'][b][f]['games']}" if f in meta['byBan'][b] else '—')) for b in FACS))
