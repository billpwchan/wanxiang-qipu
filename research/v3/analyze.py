"""读 explorer 条件查询结果，算联动（交互）= d(Y|X) - d(Y|全部)。"""
import json, sys, re
from pathlib import Path
E = Path('research/v2/explore')
def num(s):
    s = s.replace('%', '').replace('+', '').strip()
    try: return float(s)
    except: return None
def table(t):
    h = t['head']; out = []
    for r in t['rows']:
        d = dict(zip(h, r))
        d['名称'] = (d.get('名称') or d.get('装备') or d.get('英雄') or '').split('\n')[0]
        out.append(d)
    return out
base = json.load(open(E / 'r-base.json'))[0]
B = {r['名称']: r for r in table(base['tabs']['英雄'])}
BI = {r['名称']: r for r in table(base['tabs']['装备'])}
BT = {r['名称']: r for r in table(base['tabs']['天赋牌'])}
BL = {r['名称']: r for r in table(base['tabs']['棋手'])}
def load(f):
    return {q['id']: q for q in json.load(open(E / f))} if (E / f).exists() else {}
def partners(q, minn=300):
    X = q['all'][0].split('@')[0] if q['all'] else None
    rows = []
    for r in table(q['tabs']['英雄']):
        y = r['名称']
        if y == X: continue
        n = int(r['场次']); d = num(r['名次差']); b = num(B.get(y, {}).get('名次差', 'x'))
        if n < minn or d is None or b is None: continue
        rows.append((y, n, int(num(r['平均等级']) or 0), num(r['平均名次']), d, b, round(d - b, 2)))
    return rows
if __name__ == '__main__':
    R = {**load('r-heroes.json')}
    for k in sys.argv[1:] or R:
        q = R.get(k)
        if not q: continue
        s = q['summary']; me = next((r for r in table(q['tabs']['英雄']) if r['名称'] == q['all'][0].split('@')[0]), {})
        print(f"\n### {k}  局数 {s['games']}  均名 {s['avg']}  登顶 {s['win']}%  前三 {s['top3']}%  主核均级 {me.get('平均等级')}")
        ps = partners(q)
        print('  最强联动（交互最负）:', ' '.join(f"{y}{i:+.2f}(d{d:+.2f},n{n},Lv{lv})" for y, n, lv, a, d, b, i in sorted(ps, key=lambda p: p[6])[:10]))
        print('  最差联动:', ' '.join(f"{y}{i:+.2f}(d{d:+.2f},n{n})" for y, n, lv, a, d, b, i in sorted(ps, key=lambda p: -p[6])[:6]))
        print('  常见搭档:', ' '.join(f"{y}{n*100//s['games']}%({d:+.2f})" for y, n, lv, a, d, b, i in sorted(ps, key=lambda p: -p[1])[:12]))
        for tab, ref, keyn in [('装备', BI, 8), ('天赋牌', BT, 8), ('棋手', BL, 19)]:
            t = q['tabs'].get(tab)
            if not t: continue
            rows = [r for r in table(t) if int(r['场次']) >= 150]
            rows.sort(key=lambda r: num(r['名次差']) or 0)
            print(f'  {tab}:', ' '.join(f"{r['名称']}{num(r['名次差']):+.2f}/{r['平均名次']}(n{r['场次']})" for r in rows[:keyn]))
        for tab in ['克制', '装备数量']:
            t = q['tabs'].get(tab)
            if t and t['rows']: print(f'  {tab}:', t['head'], t['rows'][:3])
