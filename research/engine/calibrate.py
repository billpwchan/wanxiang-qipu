"""用 datawxq 的 36 套真实阵容校准引擎：模型特征 → 平均名次。留一交叉验证，报告能不能排对。"""
import json, math, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from wxengine import Board, simulate, features, ROOT

def load_forms():
    D = sorted((ROOT / 'research/v2').glob('datawxq-*'))[-1]
    out = []
    for c in json.load(open(D / 'lineups-all.json')):
        m = [float(x) for x in re.findall(r'([\d.]+)', c['metrics'])[:4]]
        g = int(re.search(r'(\d+) 场', c['meta']).group(1))
        # 主核 = 装备最多的英雄（数据里的写法），并列按主核质量
        from wxengine import CARRY_Q
        carry = max(c['units'], key=lambda u: (len(u['items']), CARRY_Q.get(u['name'], 0)))['name']
        units = [u['name'] for u in c['units']]
        aw = {u['name'] for u in c['units'] if u['awakened']}
        lord = re.sub(r'\s*[\d.]+%', '', c['commanders'][0]).strip() if c['commanders'] else None
        out.append({'title': c['title'], 'units': units, 'aw': aw, 'carry': carry, 'lord': lord, 'avg': m[3], 'top3': m[1], 'games': g})
    return out

def lstsq(X, y, w, lam=0.05):
    # 加权岭回归（纯 Python，小矩阵）
    n = len(X[0])
    A = [[0.0] * n for _ in range(n)]; bv = [0.0] * n
    for xi, yi, wi in zip(X, y, w):
        for i in range(n):
            bv[i] += wi * xi[i] * yi
            for j in range(n): A[i][j] += wi * xi[i] * xi[j]
    for i in range(1, n): A[i][i] += lam * sum(w)
    # 高斯消元
    M = [row[:] + [bv[i]] for i, row in enumerate(A)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i])); M[i], M[p] = M[p], M[i]
        for r in range(n):
            if r != i and M[i][i]:
                f = M[r][i] / M[i][i]
                M[r] = [a - f * b for a, b in zip(M[r], M[i])]
    return [M[i][n] / M[i][i] for i in range(n)]

def spearman(a, b):
    ra = {i: r for r, i in enumerate(sorted(range(len(a)), key=lambda i: a[i]))}
    rb = {i: r for r, i in enumerate(sorted(range(len(b)), key=lambda i: b[i]))}
    n = len(a)
    return 1 - 6 * sum((ra[i] - rb[i]) ** 2 for i in range(n)) / (n * (n * n - 1))

def standardize(X):
    cols = list(zip(*X))
    mu = [sum(c) / len(c) for c in cols]
    sd = [max(1e-9, (sum((v - m) ** 2 for v in c) / len(c)) ** .5) for c, m in zip(cols, mu)]
    return [[(v - m) / s for v, m, s in zip(row, mu, sd)] for row in X], mu, sd

FAMILY = None
def family_of(f):
    import importlib.util
    spec = importlib.util.spec_from_file_location('bm', ROOT / 'scripts/build_meta.py')
    return None

def to_families(forms):
    import re as _re
    sys.path.insert(0, str(ROOT / 'scripts'))
    src = (ROOT / 'scripts/build_meta.py').read_text()
    ns = {}
    exec(src[src.index('def family(c):'):src.index('def agg(cards):')], ns)
    fams = {}
    for f in forms:
        key = ns['family']({'units': [{'h': u} for u in f['units']], 'title': f['title']})
        fams.setdefault(key, []).append(f)
    out = []
    for k, fs in fams.items():
        g = sum(x['games'] for x in fs)
        main = max(fs, key=lambda x: x['games'])
        out.append({**main, 'title': k + ' | ' + main['title'], 'avg': sum(x['avg'] * x['games'] for x in fs) / g, 'games': g})
    return out

if __name__ == '__main__':
    forms = to_families(load_forms()) if '--forms' not in sys.argv else load_forms()
    sims, X = [], []
    for f in forms:
        s = simulate(Board(f['units'], f['carry'], f['aw'], f['lord'], f['title']))
        sims.append(s); X.append(features(s))
    Xs, mu, sd = standardize(X)
    Xb = [[1.0] + r for r in Xs]
    y = [f['avg'] for f in forms]
    w = [math.sqrt(f['games']) for f in forms]
    coef = lstsq(Xb, y, w)
    pred = [sum(c * v for c, v in zip(coef, r)) for r in Xb]
    # 留一
    loo = []
    for i in range(len(forms)):
        idx = [j for j in range(len(forms)) if j != i]
        c = lstsq([Xb[j] for j in idx], [y[j] for j in idx], [w[j] for j in idx])
        loo.append(sum(a * b for a, b in zip(c, Xb[i])))
    names = ['截距', '主核有效等级×主核质量', '人均等级', '保护', '主核上场回合', '四人阵']
    print('系数（标准化特征）：', {n: round(c, 3) for n, c in zip(names, coef)})
    print('拟合 Spearman', round(spearman(pred, y), 3), ' 留一 Spearman', round(spearman(loo, y), 3))
    big = [i for i, f in enumerate(forms) if f['games'] >= 1000]
    print('大样本（≥1000 局）留一 Spearman', round(spearman([loo[i] for i in big], [y[i] for i in big]), 3), f'（{len(big)} 套）')
    for i in sorted(range(len(forms)), key=lambda i: y[i]):
        f, s = forms[i], sims[i]
        print(f"{y[i]:.2f} 预测 {loo[i]:.2f}  {f['games']:5d}局  主核{f['carry']:<4} 有效{s['carry_eff']:6.0f} 全队{s['team']:6.0f} 保护{s['protect']:.1f} 主核R{s['carry_join']}  {f['title']}")
    json.dump({'coef': coef, 'mu': mu, 'sd': sd, 'names': names}, open(Path(__file__).parent / 'calibration.json', 'w'), ensure_ascii=False, indent=1)
