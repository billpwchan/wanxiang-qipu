"""万象 S1 机制引擎：把卡面规则变成「每回合事件 → 放大器 → 等级」的可计算模型。

它不是战斗模拟器。它回答三个问题：
  1. 一套阵容每回合产生多少永久等级、临时等级，落在谁身上（成长）
  2. 这套阵容最早什么时候成型、要不要赌 5 阶（成本）
  3. 主核有多少保护（复生、护盾、免控来源）
然后用 datawxq 的真实平均名次校准，再拿去搜索没人打过的组合。

所有近似都写在 ASSUME 里；改一个数字，结论怎么变可以直接重跑。
"""
from __future__ import annotations
import json, math, re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARDS = json.loads((ROOT / 'site/dist/data/cards.json').read_text())
H = {h['name']: h for h in CARDS['heroes']}

ASSUME = {
    'fight_seconds': 20,        # 一场战斗有效时长
    'alive_frac': 0.7,          # 单位平均存活比例（算普攻次数）
    'mana_per_sec': 3.0,        # 普攻 + 受击的平均回蓝/秒（估）
    'plays_per_round': 3,       # 成型后每回合打出英雄牌数（12 能量 ≈ 3 张 + 刷新）
    'effect_buys': 1,           # 每回合额外购买的效果牌
    'rounds': list(range(6, 16)),
    'eval_round': 13,           # 用第几回合的等级做比较
    'sac_death_prob': 0.8,      # 牺牲身体每场阵亡概率
    'hp_lost': 30,              # 阿轲按已损失棋手血量
    'carry_items': 3,
    'other_items': 0.7,         # 其余英雄平均装备件数
    'totem_level_ratio': 0.6,   # 图腾等级 ≈ 召唤者等级 × 0.6（未公开，估）
    'mingshiyin_cap': (10, 20), # 明世隐每回合可转永久的容量（普通/觉醒，按 4 张计）
}

ZB = {'狂铁', '李元芳', '亚连', '米莱狄', '曹操', '百里玄策', '裴擒虎', '程咬金', '西施', '安琪拉', '上官婉儿', '孙悟空'}
ZB_DOUBLE = {'狂铁', '亚连', '米莱狄', '安琪拉'}  # 觉醒后「触发 2 次」
KT = {'虞姬', '公孙离', '云中君', '瑶', '艾琳', '雅典娜', '太乙真人', '刘邦', '嬴政', '东皇太一', '吕布'}
DC = {'孙尚香', '马可波罗', '赵云', '阿轲', '明世隐', '甄姬', '庄周', '蒙犽', '周瑜', '武则天', '露娜', '貂蝉'}
SAC = {'苏烈', '盾山', '项羽', '蒙恬', '铠', '花木兰', '海月', '钟馗'}
REVIVE_SELF = {'铠'}                 # 自带复生
REVIVE_40 = {'苏烈'}                 # 40 级复生
TOTEM = {'鬼谷子': '先知', '少司缘': '因缘', '大司命': '往生'}
SUMMON = {'米莱狄': 2, '蒙恬': 2, '苍': 2, '鲁班大师': 1, '大司命': 1, '芈月': 1}
FLASH = {'百里玄策', '云中君', '阿轲', '裴擒虎', '镜', '李白', '孙悟空', '韩信', '露娜'}
PROTECT = {'太乙真人': 1.0, '瑶': 0.8, '钟馗': 0.4, '庄周': 0.5, '明世隐': 0.3, '蔡文姬': 0.3, '朵莉亚': 0.3, '少司缘': 0.3, '扁鹊': 0.3, '廉颇': 0.4, '白起': 0.4}

# 主核质量：技能随等级放大的程度 + 范围（本站判断，写明是主观项）
CARRY_Q = {
    '公孙离': .9, '花木兰': .9, '李信': .9, '司空震': .9, '敖隐': .85, '嬴政': .85, '孙悟空': .85, '韩信': .8, '诸葛亮': .8,
    '武则天': .75, '马超': .75, '海月': .7, '李白': .7, '狄仁杰': .7, '吕布': .7, '艾琳': .7, '海诺': .65, '虞姬': .65, '露娜': .65,
    '东皇太一': .6, '周瑜': .6, '镜': .6, '百里守约': .6, '裴擒虎': .6, '姜子牙': .6, '鲁班七号': .6, '蒙犽': .6, '莱西奥': .6,
    '大司命': .6, '安琪拉': .55, '阿轲': .55, '猪八戒': .5, '刘邦': .5, '杨玉环': .5, '云中君': .5, '百里玄策': .55, '扁鹊': .5,
}
AS_CARRY = {'公孙离', '虞姬', '敖隐', '狄仁杰', '艾琳', '苍'}

def tier(n): return H[n]['tier']
def fac(n): return H[n]['faction']
def mana(n):
    if n == '干将莫邪': return 10  # 自带双剑·雄
    m = H[n]['stats']['mana'] or 999
    return m
def aspd(n): return (H[n]['stats']['as'] or 6000) / 10000

@dataclass
class Board:
    heroes: list
    carry: str
    aw: set = field(default_factory=set)
    lord: str | None = None
    name: str = ''

    def has(self, h): return h in self.heroes
    def a(self, h): return h in self.aw


def casts_per_fight(b: Board, h, zhuge_bonus=0.0, reduce=0):
    m = max(8, mana(h) - reduce)
    m0 = H[h]['stats']['mana0'] or 0
    t = ASSUME['fight_seconds'] * ASSUME['alive_frac']
    return max(0.5, (m0 + t * (ASSUME['mana_per_sec'] + zhuge_bonus)) / m)


def round_income(b: Board, level: dict, core: float, rnd: int):
    """一回合：返回 (永久增量 dict, 战斗临时 dict, 核心增量, 明细 list)。"""
    N = len(b.heroes)
    perm = {h: 0.0 for h in b.heroes}
    temp = {h: 0.0 for h in b.heroes}
    flow = []  # (事件, 放大器, 等级) 用于画事件流图
    dcore = 0.0

    def all_plus(x, src, ev, only=None):
        tg = [h for h in b.heroes if (only is None or only(h))]
        for h in tg: perm[h] += x
        flow.append((ev, src, x * len(tg)))

    def rand_plus(k, x, src, ev, only=None):
        tg = [h for h in b.heroes if (only is None or only(h))]
        if not tg: return
        k = min(k, len(tg))
        for h in tg: perm[h] += x * k / len(tg)
        flow.append((ev, src, x * k))

    # ── 整备 ──
    zb_heroes = [h for h in b.heroes if h in ZB]
    zb = sum(2 if (h in ZB_DOUBLE and b.a(h)) else 1 for h in zb_heroes)
    # 雅典娜开团触发日落海整备（在开团时，但收益同整备）
    if b.has('雅典娜'):
        rl = [h for h in zb_heroes if fac(h) == '日落海']
        extra = min(4 if b.a('雅典娜') else 2, len(rl))
        zb_from_athena = extra
    else:
        zb_from_athena = 0
    zb_total = zb + zb_from_athena
    # 整备本身的效果
    for h in zb_heroes:
        k = (2 if (h in ZB_DOUBLE and b.a(h)) else 1) + (zb_from_athena / max(1, len([x for x in zb_heroes if fac(x) == '日落海'])) if fac(h) == '日落海' else 0)
        if h == '狂铁': dcore += 2 * k
        if h == '安琪拉': perm[h] += 2 * k; dcore += 2 * k
        if h == '米莱狄': dcore += 3 * k
        if h == '亚连':
            tgt = b.carry if b.carry in perm else h
            perm[tgt] += 2 * k; dcore += 1 * k; flow.append(('整备', '亚连', 2 * k))
        if h == '孙悟空':
            fl = [x for x in b.heroes if x in FLASH]
            for x in fl: perm[x] += (4 if b.a(h) else 2)
            flow.append(('整备', '孙悟空', (4 if b.a(h) else 2) * len(fl)))
    if b.has('朵莉亚'):
        if b.a('朵莉亚'): all_plus(zb_total, '朵莉亚', '整备')
        else: rand_plus(3 * zb_total, 1, '朵莉亚', '整备')
        dcore += zb_total
    if b.has('韩信'):
        pass  # 与开团一起算

    # ── 出牌（登场、合成）──
    plays = ASSUME['plays_per_round']
    if b.lord == '闹闹': plays *= 1.8
    if b.lord == '玉环': plays *= 1.35
    if b.lord == '镜': plays += 1
    if b.lord == '明先生': plays += 0.5
    if b.lord == '嬴律': plays += 0.4
    cycle = 0
    if b.has('姬小满') or b.has('莱西奥') or (b.has('亚瑟') and b.lord == '玉环'):
        cycle = 2.5  # 倒转：买—打—卖
    dc_heroes = [h for h in b.heroes if h in DC]
    dc = plays * len(dc_heroes) / N
    if b.has('曹操'):
        sf = [h for h in dc_heroes if fac(h) == '三分之地']
        if sf: dc += min(2 if b.a('曹操') else 1, len(sf))
    if b.has('甄姬'): dc += (1.3 if b.a('甄姬') else 1.0) * dc / max(1, len(dc_heroes))
    if b.has('露娜'):
        zb_luna = (4 if b.a('露娜') else 2) * dc / max(1, len(dc_heroes))
        zb_total += zb_luna
        dcore += (4 if b.a('露娜') else 2) * dc / max(1, len(dc_heroes))
    merges = plays
    # 登场放大
    if b.has('小乔'):
        if b.a('小乔'): all_plus(dc, '小乔', '登场')
        else: rand_plus(3 * dc, 1, '小乔', '登场')
    per_dc = dc / max(1, len(dc_heroes))
    for h in dc_heroes:
        x = 2 if b.a(h) else 1
        if h == '周瑜': all_plus(x * per_dc, '周瑜', '登场')
        if h == '貂蝉': all_plus(x * per_dc, '貂蝉', '登场', lambda y: fac(y) == '三分之地')
        if h == '赵云': perm[h] += x * per_dc; rand_plus(2 * per_dc, x, '赵云', '登场')
        if h == '庄周': perm[h] += 2 * x * per_dc
        if h == '马可波罗': perm[h] += 2 * x * per_dc; dcore += 2 * x * per_dc
        if h == '阿轲':
            rep = 1 + ASSUME['hp_lost'] / 10
            perm[h] += x * rep * per_dc; rand_plus(rep * per_dc, x, '阿轲', '登场')
    # 三分出牌：蔡文姬
    sf_plays = plays * len([h for h in b.heroes if fac(h) == '三分之地']) / N
    if b.has('蔡文姬'):
        rand_plus(3 * sf_plays, 2 if b.a('蔡文姬') else 1, '蔡文姬', '出牌', lambda y: fac(y) == '三分之地')
    # 日落海出牌：亚瑟
    rl_plays = plays * len([h for h in b.heroes if fac(h) == '日落海']) / N + cycle
    if b.has('亚瑟'): dcore += (6 if b.a('亚瑟') else 3) * rl_plays
    if b.has('莱西奥'): dcore += cycle * (1 if b.a('莱西奥') else 0.5)
    # 姜子牙：异阵营/无阵营牌
    if b.has('姜子牙'):
        off = cycle + plays * len([h for h in b.heroes if fac(h) == '无阵营']) / N
        x = 2 if b.a('姜子牙') else 1
        perm['姜子牙'] += x * off; rand_plus(3 * off, x, '姜子牙', '出牌', lambda y: y != '姜子牙')
    # 合成：猪八戒、曜
    if b.has('猪八戒'):
        x = 2 if b.a('猪八戒') else 1
        for h in b.heroes:
            if tier(h) <= 3:
                same = [y for y in b.heroes if tier(y) == tier(h)]
                for y in same: perm[y] += x * merges / N
                flow.append(('合成', '猪八戒', x * merges / N * len(same)))
    if b.has('曜'):
        for h in b.heroes: perm[h] += (2 if b.a('曜') else 1) * merges / N

    # ── 效果牌 / 古币 ──
    xg = ASSUME['effect_buys']
    if b.has('白起'): xg += 1
    if b.has('老夫子'): xg += 1
    if b.has('西施'): xg += 1
    if b.has('庄周'): xg += per_dc if '庄周' in dc_heroes else 0
    if b.has('蒙犽'):
        xg += per_dc
        perm[b.carry] += (8 if b.a('蒙犽') else 4) * per_dc
        flow.append(('效果牌', '蒙犽', (8 if b.a('蒙犽') else 4) * per_dc))
    if b.has('鲁班七号'): xg += merges / 3
    if b.lord == '小妲己': xg += 1
    if b.has('芈月') and fac(b.carry) == '逐鹿':
        perm[b.carry] += (2 if b.a('芈月') else 1) * xg; flow.append(('效果牌', '芈月', (2 if b.a('芈月') else 1) * xg))
    if b.has('镜'): perm['镜'] += (2 if b.a('镜') else 1) * xg / 2
    gb = 0.0
    if b.has('上官婉儿'): gb += 6 if b.a('上官婉儿') else 3
    if b.has('程咬金'): gb += 2 if b.a('程咬金') else 1
    if b.has('李元芳'): gb += 2 if b.a('李元芳') else 1
    if b.has('盾山'): gb += 0.8
    if b.has('武则天'): gb += (2 if b.a('武则天') else 1) * per_dc if '武则天' in dc_heroes else 0
    coin = 2 + ((2 if b.a('武则天') else 1) if b.has('武则天') else 0)
    heluo = [h for h in b.heroes if fac(h) == '河洛']
    if gb and heluo:
        # 手动古币给主核，其余随机
        if b.carry in heluo: perm[b.carry] += coin * gb * 0.5
        for h in heluo: perm[h] += coin * gb * 0.5 / len(heluo)
        flow.append(('古币', '古币', coin * gb))
    if b.has('李白'): temp['李白'] += (8 if b.a('李白') else 4) * gb * 0.5 + (6 if b.a('李白') else 3) * gb * 0.3
    if b.has('西施') and fac(b.carry) == '逐鹿': pass  # 推演：减蓝，算在施法里

    # ── 开团 ──
    kt_heroes = [h for h in b.heroes if h in KT]
    totems = [h for h in b.heroes if h in TOTEM]
    kt_units = len(kt_heroes) + (1 if b.has('鬼谷子') else 0)  # 先知图腾有开团
    if b.has('张良'):
        if b.a('张良'): all_plus(kt_units, '张良', '开团')
        else: rand_plus(3 * kt_units, 1, '张良', '开团')
    if b.has('韩信'):
        ev = zb_total + len(kt_heroes)
        perm['韩信'] += (4 if b.a('韩信') else 2) * ev
        flow.append(('整备+开团', '韩信', (4 if b.a('韩信') else 2) * ev))
    if b.has('云中君'):
        x = 2 if b.a('云中君') else 1
        for h in b.heroes: perm[h] += x * (ASSUME['carry_items'] if h == b.carry else ASSUME['other_items'])
        flow.append(('开团', '云中君', x * (ASSUME['carry_items'] + ASSUME['other_items'] * (N - 1))))
    if b.has('虞姬') and totems:
        x = 1
        perm['虞姬'] += x * len(totems)
        rand_plus((4 if b.a('虞姬') else 2) * len(totems), x, '虞姬', '开团', lambda y: fac(y) == '大河流域' and y != '虞姬')
    if b.has('刘邦') and totems:
        perm['刘邦'] += (10 if b.a('刘邦') else 5) * len(totems); flow.append(('开团', '刘邦', (10 if b.a('刘邦') else 5) * len(totems)))
    # 图腾等级
    tlev = sum(level.get(h, 1) * ASSUME['totem_level_ratio'] for h in totems)
    if b.has('东皇太一'): temp['东皇太一'] += (0.3 if b.a('东皇太一') else 0.15) * tlev

    # ── 核心分配（临时）──
    rl_heroes = [h for h in b.heroes if fac(h) == '日落海']
    core_temp = {}
    if rl_heroes and core > 0:
        share = min(core / len(rl_heroes), core / 2)
        for h in rl_heroes: temp[h] += share; core_temp[h] = share
    # ── 战斗中 ──
    # 施法
    zhuge = b.has('诸葛亮')
    casts = {}
    for h in b.heroes:
        red = 0
        if b.has('西施') and fac(h) == '逐鹿' and h == b.carry: red += 15
        if b.has('大乔') and h == '大乔': red += 20
        casts[h] = casts_per_fight(b, h, reduce=red)
    if zhuge:
        others = sum(v for k, v in casts.items() if k != '诸葛亮')
        casts['诸葛亮'] = casts_per_fight(b, '诸葛亮', zhuge_bonus=others * (30 if b.a('诸葛亮') else 15) / (ASSUME['fight_seconds'] * ASSUME['alive_frac']))
        temp['诸葛亮'] += others * (8 if b.a('诸葛亮') else 4)
        flow.append(('施法', '诸葛亮', others * (8 if b.a('诸葛亮') else 4)))
    if b.has('刘禅'):
        for h in b.heroes: temp[h] += casts[h] * (4 if b.a('刘禅') else 2)
    if b.has('孙膑'):
        for h in b.heroes: perm[h] += casts[h] / 3
        flow.append(('施法', '孙膑', sum(casts.values()) / 3))
    # 普攻次数 → 因缘图腾
    attacks = 0.0
    for h in b.heroes:
        a = aspd(h)
        if h == '公孙离':
            awk = len([y for y in b.heroes if b.a(y) and y != h])
            a *= 1 + (0.30 if b.a(h) else 0.15) * awk + 0.3
        if h == '虞姬': a *= 1.3
        attacks += a
    attacks += sum(SUMMON.get(h, 0) * 0.6 for h in b.heroes)
    attacks *= ASSUME['fight_seconds'] * ASSUME['alive_frac']
    if b.has('少司缘') and b.a('少司缘'):
        attacks *= 1.15  # 40 级攻速光环（按觉醒近似）
    if b.has('少司缘'):
        all_plus(attacks / 25, '因缘图腾', '普攻')
    # 牺牲 / 死亡
    sac = [h for h in b.heroes if h in SAC and h != b.carry]
    if b.has('钟馗'): sac += [h for h in b.heroes if h not in sac and h != b.carry][:2]
    if b.has('鬼谷子'): sac += [h for h in b.heroes if fac(h) == '大河流域' and h not in sac and h != b.carry][:2]  # 玄微之种
    deaths = 0.0
    for h in sac:
        lives = 1 + (1 if h in REVIVE_SELF else 0) + (1 if h in REVIVE_40 and level.get(h, 1) >= 40 else 0)
        deaths += lives * ASSUME['sac_death_prob']
        if h == '苏烈': perm[h] += (4 if b.a(h) else 2) * lives * ASSUME['sac_death_prob']
        if h == '铠':
            for y in heluo: temp[y] += (10 if b.a(h) else 5) * lives * ASSUME['sac_death_prob']
    if b.has('太乙真人'): deaths += 0.5  # 复生给了牺牲身体时
    if b.has('李信'):
        temp['李信'] += (14 if b.a('李信') else 7) * deaths; flow.append(('阵亡', '李信', (14 if b.a('李信') else 7) * deaths))
    if b.has('大司命'):
        pass  # 往生图腾等级：计入图腾等级近似
    if b.has('花木兰'):
        revives = gb / 5 + (1 if b.has('太乙真人') else 0)
        temp['花木兰'] += (20 if b.a('花木兰') else 10) * (1 + revives)
        flow.append(('阵亡', '花木兰', (20 if b.a('花木兰') else 10) * (1 + revives)))
    if b.has('敖隐'):
        temp['敖隐'] += len(totems) * (ASSUME['fight_seconds'] * ASSUME['alive_frac'] / 4) * (8 if b.a('敖隐') else 4)
        flow.append(('图腾', '敖隐', len(totems) * 3.5 * (8 if b.a('敖隐') else 4)))
    if b.has('裴擒虎'):
        others = [level.get(h, 1) for h in b.heroes if h != '裴擒虎']
        temp['裴擒虎'] += (1 if b.a('裴擒虎') else 0.5) * (sum(others) / max(1, len(others)))
    # 司空震：复制临时等级
    if b.has('司空震'):
        real = level.get('司空震', 1)
        cap = (2 if b.a('司空震') else 1) * real
        got = 0.0
        for h, t in temp.items():
            if h == '司空震' or t <= 0: continue
            got += min((1 if b.a('司空震') else 0.5) * t, cap)
        temp['司空震'] += got; flow.append(('临时等级', '司空震', got))
    # 明世隐：临时 → 永久（给主核）
    if b.has('明世隐'):
        capc = ASSUME['mingshiyin_cap'][1 if b.a('明世隐') else 0]
        conv = min(capc, temp.get(b.carry, 0))
        perm[b.carry] += conv; flow.append(('临时等级', '明世隐', conv))
    # 海诺放大核心
    if b.has('海诺') and dcore > 0:
        events = max(1, dcore / 2)
        dcore += events * (2 if b.a('海诺') else 1)
    return perm, temp, dcore, flow


# ── 成型节奏：每个英雄按品阶在不同回合上场，按品阶在不同回合觉醒 ──
JOIN = {1: 1, 2: 2, 3: 4, 4: 7, 5: 9}
AW_DELAY = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5}

def schedule(b: Board):
    join, awk = {}, {}
    n5 = 0
    for h in sorted(b.heroes, key=tier):
        t = tier(h)
        j = JOIN[t]
        if t == 5:
            j += n5; n5 += 1
        join[h] = j
        if h in b.aw:
            d = AW_DELAY[t] - (1 if b.lord in ('镜', '白歌') else 0)
            awk[h] = j + max(1, d)
    return join, awk


def lord_bonus(b: Board, rnd: int, present: list, perm: dict):
    """棋手自带的等级产出（每回合）。返回额外保护值。"""
    L, N = b.lord, max(1, len(present))
    if L == '常小娥':
        gain = rnd + 1 + (4 * 3 / 12)  # 第 k 次助力 +(k+1)，另有送福
        for h in present: perm[h] += gain / N
    if L == '马可':
        low = [h for h in present if tier(h) <= 3]
        for h in present: perm[h] += 3 * (ASSUME['plays_per_round'] * len(low) / N) / 4 / N * 3
    if L == '姜导' and b.carry in perm:
        perm[b.carry] += 0.35 * perm[b.carry] + (0 if rnd < 7 else 0)
    if L == '昭君' and rnd >= 12 and b.carry in perm:
        perm[b.carry] += 1.5
    if L == '孙小宾':
        for h in present: perm[h] *= 1.25
    if L == '香香':
        low = [h for h in present if tier(h) <= 3]
        if len(low) >= 5 and b.carry in perm: perm[b.carry] += 2
    return {'瑶妹': 0.6, '班叔': 0.6, '阿离': 0.7, '乔汐': 0.3 if rnd >= 12 else 0}.get(L, 0)


def simulate(b: Board):
    join, awk = schedule(b)
    level = {h: 1.0 for h in b.heroes}
    core = 0.0
    hist, flows = [], {}
    lord_prot = 0.0
    for rnd in ASSUME['rounds']:
        present = [h for h in b.heroes if join[h] <= rnd]
        if b.carry not in present or len(present) < 2:
            for h in present: level[h] += 3 * ASSUME['plays_per_round'] / max(1, len(present)) * 0.5
            hist.append({'r': rnd, 'carry': level.get(b.carry, 0), 'team': sum(level[h] for h in present)}); continue
        eff = Board(present, b.carry, {h for h in b.aw if h in present and awk.get(h, 99) <= rnd}, b.lord)
        perm, temp, dcore, flow = round_income(eff, level, core, rnd)
        lord_prot = lord_bonus(b, rnd, present, perm)
        for h in present: level[h] += perm[h] + 3 * ASSUME['plays_per_round'] / len(b.heroes)  # 合成 +3
        core += dcore
        if b.lord == '姜导' and rnd == join[b.carry]: level[b.carry] += 5 * tier(b.carry)
        if rnd == ASSUME['eval_round']:
            for ev, src, x in flow: flows[(ev, src)] = flows.get((ev, src), 0) + x
        hist.append({'r': rnd, 'carry': level[b.carry], 'carry_temp': temp.get(b.carry, 0), 'team': sum(level[h] for h in present)})
    last = next(x for x in hist if x['r'] == ASSUME['eval_round'])
    prot = sum(PROTECT.get(h, 0) for h in b.heroes if h != b.carry) + lord_prot
    prot += 0.5 if b.carry in REVIVE_SELF or b.carry == '花木兰' else 0
    full = max(join.values())
    return {
        'assembly': full, 'awake': max(awk.values()) if awk else full,
        'carry_join': join[b.carry],
        'carry_perm': round(last['carry'], 1), 'carry_temp': round(last.get('carry_temp', 0), 1),
        'carry_eff': round(last['carry'] + 0.8 * last.get('carry_temp', 0), 1),
        'team': round(last.get('team', 0), 1), 'protect': round(prot, 2),
        'carry_q': CARRY_Q.get(b.carry, 0.4), 'size': len(b.heroes),
        'n5': sum(1 for h in b.heroes if tier(h) == 5), 'n4': sum(1 for h in b.heroes if tier(h) == 4),
        'flows': sorted(((k[0], k[1], round(v, 1)) for k, v in flows.items()), key=lambda x: -x[2]),
        'hist': hist,
    }


def features(s):
    return [
        math.log(1 + s['carry_eff']) * s['carry_q'],
        math.log(1 + s['team'] / s['size']),
        min(s['protect'], 2.5),
        s['carry_join'],
        1.0 if s['size'] <= 4 else 0.0,
    ]
