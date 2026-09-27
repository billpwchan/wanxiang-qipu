"""雅典娜韩信（姜导）一局的能量/经验/等级账本模拟。
规则假设（见站点「规则与数字」）：收入 6/6/6/8/8/8/8/12/12/12/12/15...；英雄 3、刷新 1、卖 1；
经验 7/13/17/23/27，1 能量 = 1 经验，每回合结束 +1，拍卖 +2，弈星在场升级 +2。
每次升本拿一个天赋：L2/L3 取能量类（按 +5 折算），L4 起取成长类（0 能量）。
拍卖：分红 +2、地上掉落 +1（均为假设）。商店来牌按「顺利线」假设给出，每一步写在账本里。"""
import json

INCOME = {1: 6, 2: 6, 3: 6, 4: 8, 5: 8, 6: 8, 7: 8, 8: 12, 9: 12, 10: 12, 11: 12, 12: 15, 13: 15, 14: 15}
NEED = {2: 7, 3: 13, 4: 17, 5: 23, 6: 27}

class S:
    def __init__(s):
        s.e = 0; s.xp = 0; s.lv = 1; s.hp = 60; s.yixing = False
        s.log = []; s.row = None
        s.heroes = {}  # name -> [level, copies]
        s.hanxin_fs = False
    def start(s, r, label=None):
        s.row = {'r': label or f'R{r}', 'income': INCOME.get(r, 0), 'acts': [], 'e0': s.e}
        s.e += INCOME.get(r, 0)
    def spend(s, n, what):
        assert s.e >= n, (s.row['r'], what, s.e, n)
        s.e -= n; s.row['acts'].append(f'{what}（−{n}）')
    def gain(s, n, what):
        s.e += n; s.row['acts'].append(f'{what}（+{n}）')
    def buy(s, h):
        s.spend(3, '买' + h)
        if h in s.heroes:
            s.heroes[h][0] += 3; s.heroes[h][1] += 1
        else:
            s.heroes[h] = [1, 1]
        if h == '弈星': s.yixing = True
    def level(s, talent, tval=0):
        cost = NEED[s.lv + 1] - s.xp
        s.spend(cost, f'升 L{s.lv + 1}')
        s.lv += 1; s.xp = 2 if s.yixing else 0
        if tval: s.gain(tval, f'天赋「{talent}」')
        else: s.row['acts'].append(f'天赋「{talent}」')
    def note(s, t): s.row['acts'].append(t)
    def end(s, win, dmg=0, xp=1):
        s.xp += xp
        if not win: s.hp -= dmg
        s.row.update({'e': s.e, 'lv': s.lv, 'xp': f'{s.xp}/{NEED.get(s.lv + 1, "—")}', 'hp': s.hp, 'win': win,
                      'hx': s.heroes.get('韩信', [0])[0]})
        s.log.append(s.row)

def hanxin_round(s, zb, zb_aw, kt, ya, hx_aw, dl_aw, yl, n=7):
    """与站点「事件计数」同一口径，返回韩信本回合永久增量。"""
    yaz = min(ya * 2, zb + zb_aw) if ya else 0
    zbe = zb + zb_aw * 2 + yaz
    kte = kt + (1 if ya else 0)
    per = 4 if hx_aw else 2
    g = (zbe + kte) * per
    yl_t = (1 + (yaz / (zb + zb_aw) if zb + zb_aw else 0)) * yl
    g += yl_t * 2
    dl = zbe if dl_aw else zbe * 3 / n
    g += dl
    ev = zbe + kte + yl_t + dl
    if s.hanxin_fs: g += ev
    return round(g)

s = S()
# R1
s.start(1); s.buy('狂铁'); s.buy('弈星'); s.note('商店：狂铁、弈星、苏烈、孙膑、干将'); s.end(True)
# R2
s.start(2); s.level('小电池包', 5); s.buy('狂铁'); s.note('狂铁合成 → 4 级'); s.end(False, 3)
# R3
s.start(3); s.buy('亚连'); s.note('2 阶开放；留 5 能量进拍卖'); s.end(True)
# 拍1
s.start(0, '拍1'); s.spend(2, '出价拿冷门的安琪拉'); s.heroes['安琪拉'] = [1, 1]; s.gain(2, '分红（假设）'); s.gain(1, '地上掉落'); s.end(True, xp=2)
# R4
s.start(4); s.level('电池包', 8); s.buy('朵莉亚'); s.buy('安琪拉'); s.note('6 人口；整备开始：狂铁核心+2、亚连喂装备最多的安琪拉+2、安琪拉+2'); s.end(False, 4)
# R5
s.start(5); s.buy('朵莉亚'); s.buy('狂铁'); s.spend(2, '刷新 ×2'); s.buy('亚连'); s.end(True)
# R6
s.start(6); s.buy('瑶'); s.note('6 人口已满；攒钱：L4 需要 12–13 能量'); s.end(False, 4)
# R7
s.start(7); s.level('破格'); s.note('4 阶开放；「破格」让回合开始商店多一张高 1 阶'); s.end(True)
# 拍2
s.start(0, '拍2'); s.spend(3, '出价拿韩信（别人很少选这件）'); s.heroes['韩信'] = [1, 1]; s.gain(2, '分红（假设）'); s.gain(1, '地上掉落'); s.end(True, xp=2)
# R8：升 L5、韩信上场、封神
s.start(8); s.level('战术模组'); s.note('L5 = 7 人，战术模组再 +1 = 8 人')
s.hanxin_fs = True; s.heroes['韩信'][0] += 21; s.note('封神一瞬给韩信：品阶×5 = +20（封神自身 +1）')
s.note('装备全部移给韩信（亚连目标切换）'); s.gain(1, '卖弈星'); s.yixing = False
g = hanxin_round(s, zb=3, zb_aw=0, kt=1, ya=0, hx_aw=False, dl_aw=False, yl=1, n=6)
s.heroes['韩信'][0] += g; s.note(f'场上：狂铁、亚连、安琪拉、朵莉亚、瑶、韩信；整备 3 + 开团 1 → 韩信 +{g}'); s.end(False, 5)
# R9
s.start(9); s.buy('雅典娜'); s.buy('韩信'); s.buy('米莱狄')
s.heroes['韩信'][0] += 4
g = hanxin_round(s, zb=3, zb_aw=0, kt=1, ya=1, hx_aw=False, dl_aw=False, yl=1, n=8)
s.heroes['韩信'][0] += g; s.note(f'韩信合成 +4（含封神）；米莱狄上场之前本回合整备已结算；开战 雅典娜 +2 整备 → +{g}'); s.end(True)
# R10
s.start(10); s.buy('韩信'); s.spend(3, '刷新 ×3'); s.buy('韩信')
s.note('韩信第 4 张 → 觉醒回手再打出')
s.heroes['韩信'][0] += 8
g = hanxin_round(s, zb=4, zb_aw=0, kt=1, ya=1, hx_aw=True, dl_aw=False, yl=1, n=8)
s.heroes['韩信'][0] += g; s.note(f'合成 2 次 +8；米莱狄加入整备（4 个）；觉醒后 → +{g}'); s.end(True)
# R11
s.start(11); s.buy('朵莉亚'); s.buy('狂铁'); s.note('狂铁第 4 张 → 觉醒（整备触发 2 次）；朵莉亚第 3 张；留钱拍 3')
g = hanxin_round(s, zb=3, zb_aw=1, kt=1, ya=1, hx_aw=True, dl_aw=False, yl=1, n=8)
s.heroes['韩信'][0] += g; s.note(f'整备 2 普通 + 狂铁觉醒 ×2 + 米莱狄 + 雅典娜 2 → 韩信 +{g}'); s.end(True)
# 拍3
s.start(0, '拍3'); s.spend(9, '破境之证'); s.heroes['韩信'][0] += 21; s.note('破境之证给韩信：+20（封神 +1），之后每回合 +10'); s.gain(2, '分红（假设）'); s.end(True, xp=2)
# R12
s.start(12); s.level('完美演出（专属）'); s.note('韩信开战 15 秒免控 + 30% 吸血'); s.buy('朵莉亚'); s.note('朵莉亚第 4 张 → 觉醒：每次整备全员 +1')
g = hanxin_round(s, zb=3, zb_aw=1, kt=1, ya=1, hx_aw=True, dl_aw=True, yl=1, n=8) + 11
s.heroes['韩信'][0] += g; s.note(f'本回合事件 + 破境 +11 → +{g}'); s.end(True)
# R13
s.start(13); s.buy('雅典娜'); s.buy('雅典娜'); s.note('雅典娜第 3 张')
g = hanxin_round(s, zb=3, zb_aw=1, kt=1, ya=1, hx_aw=True, dl_aw=True, yl=1, n=8) + 11
s.heroes['韩信'][0] += g; s.note(f'→ +{g}'); s.end(True)
# R14
s.start(14); s.buy('雅典娜'); s.note('雅典娜第 4 张 → 觉醒：开团触发 4 个整备；其余只买当轮生效的保护、针对装备')
g = hanxin_round(s, zb=3, zb_aw=1, kt=1, ya=2, hx_aw=True, dl_aw=True, yl=1, n=8) + 11
s.heroes['韩信'][0] += g; s.note(f'→ +{g}'); s.end(True)

out = {'title': '姜导 · 雅典娜韩信：一局顺利线的账本', 'rows': s.log}
print(json.dumps(out, ensure_ascii=False, indent=1))
