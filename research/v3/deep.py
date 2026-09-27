"""深度分析：主核强度（按阶分组）、联动、撞车双重差分、棋手适配。输出 research/v3/deep-report.txt"""
import json, sys
from pathlib import Path
sys.path.insert(0, 'research/v3')
from analyze import table, num, B, BL
E = Path('research/v2/explore')
R = {q['id']: q for q in json.load(open(E / 'r-heroes.json'))}
cards = json.load(open('site/dist/data/cards.json'))
TIER = {h['name']: h['tier'] for h in cards['heroes']}
FAC = {h['name']: h['faction'] for h in cards['heroes']}
out = []
P = lambda *a: out.append(' '.join(str(x) for x in a))

def contest(q, X):
    t = q['tabs'].get('克制')
    if not t: return None
    for r in t['rows']:
        if r[0] == X:
            g = [(num(r[i]) / 100, num(r[i + 1])) for i in range(2, 10, 2)]
            return int(r[1]), g
    return None
def lv(M, g):  # 各组平均 = M + d_k*(1-w_k)
    return [M + d * (1 - w) if w else None for w, d in g]

# 1) 撞车：自己玩 X 时 1 名对手也玩 vs 0 名，减去「别人玩 Y 时面对 1 名 X 对手」的同样差值（池化）
P('=== 撞车代价（双重差分）===  自己 a1-a0 | 对照（其他主核面对 X）a1-a0 | 纯撞车')
carries = [k for k in R if k.startswith('c-')]
cont = {}
for k in carries:
    X = R[k]['all'][0].split('@')[0]
    c = contest(R[k], X)
    if not c: continue
    n, g = c; M = R[k]['summary']['avg']; L = lv(M, g)
    own = L[1] - L[0] if L[1] and L[0] else None
    if own is None: continue
    bs, bw = 0, 0
    for k2, q2 in R.items():
        if k2 == k: continue
        c2 = contest(q2, X)
        if not c2: continue
        n2, g2 = c2; L2 = lv(q2['summary']['avg'], g2)
        if L2[0] is None or L2[1] is None: continue
        w = n2 * g2[1][0]
        bs += (L2[1] - L2[0]) * w; bw += w
    base = bs / bw if bw else None
    cont[X] = (own, base, g[1][0])
    if base is None: continue
    P(f'{X:5} 自己 {own:+.2f}  对照 {base:+.2f}  纯撞车 {own-base:+.2f}   被撞比例 {1-g[0][0]:.0%}  n{n}')

# 2) 主核按阶
P('\n=== 主核（终局在场）按阶 ===  avg / top3 / win / 终局等级 / 局数 / 1st|top3')
rows = []
for k in carries:
    q = R[k]; X = q['all'][0].split('@')[0]; s = q['summary']
    me = next((r for r in table(q['tabs']['英雄']) if r['名称'] == X), {})
    rows.append((TIER.get(X, 0), s['avg'], X, s['top3'], s['win'], me.get('平均等级'), s['games']))
for t, a, X, t3, w, l, n in sorted(rows):
    cc = cont.get(X); pure = (cc[0] - cc[1]) if cc and cc[0] is not None and cc[1] is not None else float('nan')
    P(f'{t}阶 {X:5} {a:.2f}  前三{t3:4.1f}%  登顶{w:4.1f}%  Lv{str(l):>4}  n{n:6}  closer {w/t3:.2f}  撞车{pure:+.2f}')

# 3) 联动：每个主核的 top 交互
P('\n=== 联动（i = 同主核内名次差 − 全局名次差；n≥500）===')
for k in carries:
    q = R[k]; X = q['all'][0].split('@')[0]
    ps = []
    for r in table(q['tabs']['英雄']):
        y = r['名称']
        if y == X or y not in B: continue
        n = int(r['场次']); d = num(r['名次差']); b = num(B[y]['名次差'])
        if n < 500 or d is None or b is None: continue
        ps.append((round(d - b, 2), y, d, n, n / q['summary']['games']))
    ps.sort()
    P(f"{X}: " + ' '.join(f'{y}{i:+.2f}[{sh:.0%}]' for i, y, d, n, sh in ps[:7]) + '  ||  差: ' + ' '.join(f'{y}{i:+.2f}' for i, y, d, n, sh in ps[-4:]))

# 4) 棋手 × 主核（棋手从 R1 就在，比较公平）
P('\n=== 棋手适配（主核对局内，n≥200，按平均名次）===')
for k in carries:
    q = R[k]; X = q['all'][0].split('@')[0]
    t = q['tabs'].get('棋手')
    if not t: continue
    ls = [(num(r['平均名次']), r['名称'], int(r['场次']), num(r['名次差'])) for r in table(t) if int(r['场次']) >= 200]
    ls.sort()
    P(f"{X} ({q['summary']['avg']}): " + ' '.join(f'{n}{a:.2f}({c})' for a, n, c, d in ls[:5]) + ' ... 最差 ' + ' '.join(f'{n}{a:.2f}' for a, n, c, d in ls[-2:]))

# 5) 天赋：主核对局内最好的（n≥250）
P('\n=== 天赋（主核对局内 名次差最负，n≥250）===')
for k in carries:
    q = R[k]; X = q['all'][0].split('@')[0]
    t = q['tabs'].get('天赋牌')
    if not t: continue
    ts = [(num(r['名次差']), r['名称'], int(r['场次']), r.get('Lv3'), r.get('Lv4')) for r in table(t) if int(r['场次']) >= 250]
    ts.sort()
    P(f"{X}: " + ' '.join(f'{n}{d:+.2f}' for d, n, c, l3, l4 in ts[:6]))

# 6) 出装：主核对局内（n≥500）
P('\n=== 出装（主核对局内，n≥500）===')
for k in carries:
    q = R[k]; X = q['all'][0].split('@')[0]
    t = q['tabs'].get('装备')
    if not t: continue
    ts = [(num(r['名次差']), r['名称'], int(r['场次'])) for r in table(t) if int(r['场次']) >= 500]
    ts.sort()
    P(f"{X}: " + ' '.join(f'{n}{d:+.2f}({c})' for d, n, c in ts[:6]))
Path('research/v3/deep-report.txt').write_text('\n'.join(out))
print('\n'.join(out[:60]))
