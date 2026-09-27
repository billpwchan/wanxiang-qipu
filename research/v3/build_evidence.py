"""explorer 条件查询结果 → site/dist/data/evidence.js（网站用的「数据怎么说」）。

每名主核：局数、平均名次、前三率、终局平均等级；
  搭档：d = 同一主核的对局里有它 vs 没它的名次差；i = d − 它在全部对局里的 d（扣掉它本身的通用强度）；
  撞车：同局有 0/1/2/3+ 名对手也用这张牌时的平均名次（减去「对手用了这张牌」对不用它的人的影响 = 纯撞车代价）；
  出装、天赋、棋手：同一主核对局内的名次差。
"""
import json, re
from pathlib import Path
E = Path('research/v2/explore')
OUT = Path('site/dist/data/evidence.js')

def num(s):
    if s is None: return None
    s = str(s).replace('%', '').replace('+', '').strip()
    try: return float(s)
    except ValueError: return None

def rows(t):
    if not t: return []
    h = t['head']; out = []
    for r in t['rows']:
        d = dict(zip(h, r)); d['名称'] = (d.get('名称') or d.get('装备') or d.get('英雄') or '').split('\n')[0]; out.append(d)
    return out

def load(f):
    p = E / f
    return {q['id']: q for q in json.load(open(p))} if p.exists() else {}

base = json.load(open(E / 'r-base.json'))[0]
BH = {r['名称']: r for r in rows(base['tabs']['英雄'])}
BI = {r['名称']: r for r in rows(base['tabs']['装备'])}
BT = {r['名称']: r for r in rows(base['tabs']['天赋牌'])}
BL = {r['名称']: r for r in rows(base['tabs']['棋手'])}

def contest_raw(t, name):
    for r in (t or {}).get('rows', []):
        if r[0] == name:
            n = int(r[1]); cells = r[2:]
            return n, [(num(cells[i]) / 100, num(cells[i + 1])) for i in range(0, 8, 2)]
    return None, None

def contest_levels(M, groups):
    # 表里的 d_k = 该组平均 − 其余平均 → 该组平均 = M + d_k × (1 − 占比)
    return [round(M + d * (1 - w), 2) if w and d is not None else None for w, d in groups]

H = {**load('r-heroes.json')}
for k, q in load('r-combos2.json').items():
    if k.startswith('c-') and (q['summary']['games'] or 0) > 0 and q['summary']['games'] < base['summary']['games'] * .9: H[k] = q   # 补跑失败的主核
CT = {}
hero = {}
H = {k: q for k, q in H.items() if (q['summary']['games'] or 0) > 0 and q['summary']['games'] < base['summary']['games'] * .9}
for qid, q in H.items():
    X = q['all'][0].split('@')[0]
    s = q['summary']
    me = next((r for r in rows(q['tabs']['英雄']) if r['名称'] == X), None)
    if not me: continue
    partners = []
    for r in rows(q['tabs']['英雄']):
        y = r['名称']
        if y == X or y not in BH: continue
        n = int(r['场次']); d = num(r['名次差']); b = num(BH[y]['名次差'])
        if d is None or b is None or n < 200: continue
        partners.append([y, n, d, round(d - b, 2), int(num(r['平均等级']) or 0)])
    partners.sort(key=lambda p: p[3])
    ent = {'n': s['games'], 'avg': s['avg'], 'top3': s['top3'], 'win': s['win'], 'lv': int(num(me['平均等级']) or 0),
           'partners': partners}
    def side(tab, ref, minn=150):
        out = []
        for r in rows(q['tabs'].get(tab)):
            n = int(r['场次'])
            if n < minn: continue
            out.append([r['名称'], n, num(r['名次差']), num(r['平均名次']), round((num(r['名次差']) or 0) - (num(ref.get(r['名称'], {}).get('名次差')) or 0), 2)])
        return sorted(out, key=lambda x: x[2])
    if '装备' in q['tabs']: ent['items'] = side('装备', BI, 300)
    if '天赋牌' in q['tabs']: ent['talents'] = side('天赋牌', BT, 150)
    if '棋手' in q['tabs']: ent['lords'] = side('棋手', BL, 150)
    n, g = contest_raw(q['tabs'].get('克制'), X)
    if g:
        L = contest_levels(s['avg'], g)
        ent['contest'] = {'n': n, 'share': [round(w, 3) for w, _ in g], 'avg': L}
        bs = bw = 0
        for k2, q2 in H.items():
            if k2 == qid or q2['summary']['games'] >= base['summary']['games'] * .9: continue
            n2, g2 = contest_raw(q2['tabs'].get('克制'), X)
            if not g2: continue
            L2 = contest_levels(q2['summary']['avg'], g2)
            if L2[0] is None or L2[1] is None: continue
            w = n2 * g2[1][0]; bs += (L2[1] - L2[0]) * w; bw += w
        if bw and L[0] is not None and L[1] is not None:
            ent['contest']['face'] = round(bs / bw, 2)                    # 对手里有 1 个 X 对「不玩 X 的人」的影响
            ent['contest']['pure'] = round((L[1] - L[0]) - bs / bw, 2)    # 纯撞车代价
            ent['contest']['p'] = round(1 - g[0][0], 2)                   # 至少 1 名对手也拿 X 的概率
    ent['partners'] = [p for p in partners if p[1] >= 300][:14] + [p for p in partners if p[1] >= 300 and p[3] > 0.15][-5:]
    hero[X] = ent

lord = {}
for qid, q in load('r-lords.json').items():
    L = q['all'][0].split('@')[0]; s = q['summary']
    hs = []
    for r in rows(q['tabs'].get('英雄')):
        y = r['名称']; n = int(r['场次']); d = num(r['名次差']); b = num(BH.get(y, {}).get('名次差'))
        if n < 150 or d is None or b is None: continue
        hs.append([y, n, d, round(d - b, 2), num(r['平均名次'])])
    ts = []
    for r in rows(q['tabs'].get('天赋牌')):
        n = int(r['场次'])
        if n < 100: continue
        ts.append([r['名称'], n, num(r['名次差']), num(r['平均名次'])])
    lord[L] = {'n': s['games'], 'avg': s['avg'], 'top3': s['top3'], 'win': s['win'],
               'heroes': sorted(hs, key=lambda x: x[2])[:24], 'share': sorted(hs, key=lambda x: -x[1])[:12],
               'talents': sorted(ts, key=lambda x: x[2])[:12]}

combo = {}
for qid, q in {**load('r-combos.json'), **{k: v for k, v in load('r-combos2.json').items() if k.startswith('x-')}}.items():
    s = q['summary']
    if not s['games'] or s['games'] >= base['summary']['games'] * .9: continue   # 条件没生效（等于全部对局）
    combo[qid[2:]] = {'all': [x.split('@')[0] for x in q['all']], 'none': q['none'], 'n': s['games'], 'avg': s['avg'], 'top3': s['top3'], 'win': s['win']}

baseline = {
    'hero': {k: [int(v['场次']), int(num(v['平均等级']) or 0), num(v['平均名次']), num(v['名次差'])] for k, v in BH.items()},
    'item': {k: [int(v['场次']), num(v['平均名次']), num(v['名次差'])] for k, v in BI.items()},
    'talent': {k: [int(v['场次']), num(v['平均名次']), num(v['名次差'])] for k, v in BT.items()},
    'lord': {k: [int(v['场次']), num(v['平均名次']), num(v['名次差'])] for k, v in BL.items()},
}
src = {'site': 'datawxq.com 大数据检索器（公开页面）', 'version': 'v260924', 'window': '近 7 天', 'who': '顶尖棋手',
       'boards': base['summary']['games'], 'fetched': '2026-09-26'}
js = '// 由 research/v3/build_evidence.py 生成，勿手改。\n' + \
     'export const EVIDENCE = ' + json.dumps({'source': src, 'base': baseline, 'hero': hero, 'lord': lord, 'combo': combo}, ensure_ascii=False, separators=(',', ':')) + ';\n'
OUT.write_text(js)
print(f'{OUT}: {len(js)//1024} KB · 主核 {len(hero)} · 棋手 {len(lord)} · 组合 {len(combo)}')
