// v5 数字层：把 plan.js 的路线和三份数据源对齐，生成 site/dist/data/facts.js。
//   meta.js      datawxq 阵容榜 / 棋手榜（阵容级：打成这套的对局）
//   evidence.js  datawxq 大数据检索器（搭档、撞车、棋手 + 主核同局）
//   research/v4/lineups/lineups.json  官方社区阵容（阵容码 = key，导入次数 = useNum；scripts/trim_lineups.py 去掉了作者信息）
// node scripts/build_facts.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (p) => path.join(ROOT, 'site/dist/data', p);
const { ROUTES, TRAPS, BANS } = await import(D('plan.js'));
const { META } = await import(D('meta.js'));
const { EVIDENCE: E } = await import(D('evidence.js'));
const cards = JSON.parse(readFileSync(D('cards.json')));
const lordAssets = JSON.parse(readFileSync(D('lords.json')));
const posters = JSON.parse(readFileSync(D('posters.json')));
const lineups = JSON.parse(readFileSync(path.join(ROOT, 'research/v4/lineups/lineups.json')));
const officialLords = JSON.parse(readFileSync(path.join(ROOT, 'research/v4/official/lords.json')));

// plan 的路线 id → meta.js 的阵容家族 id
const FAMILY = { lvbu: 'wukong-sanfen', marco: 'marco-pig', mulan: 'mulan', kaituan: 'kaituan', zhuge: 'zhuge-yuhuan', yuhuan: 'yuhuan-rilou', totem: 'totem', lixin: 'lixin', hanxin: 'hanxin-zhengbei', yingzheng: 'yingzheng' };
// 这两条路线的定义比阵容榜的家族更窄，用检索器的组合口径（棋手 / 搭档同局）
const COMBO = {
  lvbu: { label: '孙小宾打成吕布的对局', avg: 1.62, top3: 89.9, win: 72.1, games: 1183 },
  hanxin: { label: '韩信和钟馗同在场的对局', avg: 2.37, top3: 80.4, win: 31.2, games: 1738 },
};

const uniq = [];
{ const seen = new Set(); for (const l of lineups) if (!seen.has(l.key)) { seen.add(l.key); uniq.push(l); } }
const heroSet = (l) => new Set(l.heroList.map((h) => h.name));
const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };

function bestCode(r) {
  const S = new Set(r.board.map((b) => b.h));
  let best = null;
  for (const l of uniq) {
    const H = heroSet(l);
    if (!H.has(r.carry)) continue;
    const j = jac(S, H);
    const lordHit = l.lordList.some((x) => r.lords.includes(x.name));
    const score = j + (lordHit ? 0.05 : 0);
    const missing = [...S].filter((x) => !H.has(x));
    const finalOnly = missing.every((x) => ['太乙真人', '钟馗', '海月'].includes(x));
    if ((j >= 0.7 || (j >= 0.55 && finalOnly)) && (!best || score > best.score || (score === best.score && l.useNum > best.uses))) {
      best = { score, key: l.key, name: l.name, uses: l.useNum, lords: l.lordList.map((x) => x.name), extra: [...H].filter((x) => !S.has(x)), missing: [...S].filter((x) => !H.has(x)) };
    }
  }
  if (best) delete best.score;
  return best;
}

function communityUses(comp, carry, min = 0.6) {
  const S = new Set(comp);
  let uses = 0, n = 0, top = null;
  for (const l of uniq) {
    const H = heroSet(l);
    if (!H.has(carry)) continue;
    if (jac(S, H) < min) continue;
    uses += l.useNum; n++;
    if (!top || l.useNum > top.uses) top = { name: l.name, uses: l.useNum };
  }
  return { uses, lineups: n, top };
}

// 由单一棋手定义的路线，搭档按该棋手的对局算（否则会混进别的棋手的打法）
const LORD_POP = { lvbu: '孙小宾', yuhuan: '玉环' };
// 马可的对局混着养猪和吕布两套、猪八戒又出现在开团射里：两种口径都不干净，不给搭档建议
const NO_PARTNERS = new Set(['marco']);
function partners(carry, rid) {
  const lp = LORD_POP[rid];
  if (lp) {
    const L = E.lord[lp];
    const list = L.heroes.filter(([h, n]) => h !== carry && n >= 150);
    return {
      plus: list.filter(([, , , i]) => i <= -0.3).sort((a, b) => a[3] - b[3]).slice(0, 5).map(([h, n, d, i]) => ({ h, n, gain: +(-i).toFixed(2) })),
      minus: list.filter(([, , , i]) => i >= 0.2).sort((a, b) => b[3] - a[3]).slice(0, 4).map(([h, n, d, i]) => ({ h, n, loss: +i.toFixed(2) })),
      pop: lp,
    };
  }
  const h = E.hero[carry];
  if (!h) return { plus: [], minus: [] };
  const seen = new Set();
  const floor = h.n * 0.04;
  const list = h.partners.filter(([y, n]) => n >= floor && (seen.has(y) ? false : seen.add(y)));
  // i：扣掉这张牌在所有对局里的平均表现后，和这个主核的额外配合（负 = 名次更靠前）
  const plus = list.filter(([, n, d, i]) => n >= 300 && i <= -0.12 && d < 0).sort((a, b) => a[3] - b[3]).slice(0, 5).map(([h, n, d, i]) => ({ h, n, gain: +(-i).toFixed(2) }));
  const minus = list.filter(([, n, d, i]) => n >= 300 && i >= 0.2 && d > -0.15).sort((a, b) => b[3] - a[3]).slice(0, 4).map(([h, n, d, i]) => ({ h, n, loss: +i.toFixed(2) }));
  return { plus, minus };
}

// 「决赛别留」里不列成型阵容本身的成员（数据是终局阵容，和成型阵容冲突时以成型阵容为准）
function dropBoard(p, r) {
  const B = new Set(r.board.map((b) => b.h));
  return { ...p, minus: p.minus.filter((x) => !B.has(x.h)) };
}

function contest(carry) {
  const c = E.hero[carry]?.contest;
  if (!c) return null;
  const pure = c.pure ?? 0;
  return { level: pure >= 0.25 ? 3 : pure >= 0.12 ? 2 : 1, drop: +pure.toFixed(2), share: +(1 - c.share[0]).toFixed(2) };
}

function lordStats(r) {
  return r.lords.map((name) => {
    const e = E.lord[name]?.heroes.find((x) => x[0] === r.carry);
    return { name, avg: e ? e[4] : null, games: e ? e[1] : null };
  });
}

const factionOf = Object.fromEntries(cards.heroes.map((h) => [h.name, h.faction]));

// 棋手第一回合就选定：「选了这个棋手的全部对局」不受「只统计打成的人」影响（意向口径）。
// 专门打这套的棋手 = 推荐棋手里，终局出现标志英雄（sig）比例最高的那个。
const ML = Object.fromEntries(META.lords.map((l) => [l.name, l]));
function share(lord, hero) {
  const L = E.lord[lord];
  const e = L?.heroes.find((x) => x[0] === hero) || L?.share?.find((x) => x[0] === hero);
  return e && L ? +(e[1] / L.n).toFixed(2) : 0;
}
const tierOf = (avg) => (avg <= 3.2 ? 'top' : avg <= 3.35 ? 'ok' : 'avg');

const routes = {};
for (const r of ROUTES) {
  const fam = FAMILY[r.id] ? META.families[FAMILY[r.id]] : null;
  const lordRows = r.lords.map((n) => ({ name: n, avg: ML[n]?.avg, top3: ML[n]?.top3, win: ML[n]?.win, games: ML[n]?.games, pick: ML[n]?.pick, share: share(n, r.sig) }));
  const spec = [...lordRows].sort((a, b) => b.share - a.share)[0];
  const stat = { label: `${spec.name}的全部对局`, lord: spec.name, share: spec.share, avg: spec.avg, top3: spec.top3, win: spec.win, games: spec.games };
  const done = COMBO[r.id] || (fam && { label: '打成这套的对局', avg: fam.avg, top3: fam.top3, win: fam.win, games: fam.games });
  const byBan = {};
  for (const [ban, v] of Object.entries(META.byBan)) {
    const f = FAMILY[r.id] && v[FAMILY[r.id]];
    if (f && f.games >= 200) byBan[ban] = { avg: f.avg, top3: f.top3, win: f.win, games: f.games, pick: f.pick };
  }
  const bans = [...new Set([r.faction, factionOf[r.carry]].filter((x) => x && x !== '无阵营'))];
  const P = posters[r.carry] || {};
  routes[r.id] = {
    stat, done, tier: tierOf(stat.avg), byBan, bans, pick: fam?.pick ?? null,
    lords: lordRows, partners: NO_PARTNERS.has(r.id) ? { plus: [], minus: [] } : dropBoard(partners(r.carry, r.id), r), contest: contest(r.carry),
    code: bestCode(r),
    splash: P.bg ? { src: P.bg, w: P.w, h: P.h, fx: P.fx ?? 60, fy: P.fy ?? 30, skin: P.skin } : null,
  };
}

const lords = {};
for (const L of META.lords) {
  const a = lordAssets[L.name];
  const c = cards.lords.find((x) => x.name === L.name);
  lords[L.name] = {
    avg: L.avg, top3: L.top3, win: L.win, games: L.games, pick: L.pick,
    img: a ? `assets/lord/${a.id}.webp` : null, small: a ? `assets/lord/${a.id}-s.webp` : null, icon: a ? `assets/lord/${a.id}-i.webp` : null,
    w: a?.w, h: a?.h,
    stages: c?.stages || [],
    routes: ROUTES.filter((r) => r.lords.includes(L.name)).map((r) => r.id),
  };
}
for (const name of Object.keys(lordAssets)) if (!lords[name]) {
  const a = lordAssets[name];
  lords[name] = { img: `assets/lord/${a.id}.webp`, small: `assets/lord/${a.id}-s.webp`, icon: `assets/lord/${a.id}-i.webp`, w: a.w, h: a.h, stages: cards.lords.find((x) => x.name === name)?.stages || [], routes: [] };
}

const traps = TRAPS.map((t) => {
  const fam = META.families[t.family];
  const f = t.form != null ? fam.forms[t.form] : fam;
  const lo = ML[t.lord];
  return { id: t.id, avg: f.avg, top3: f.top3, games: f.games, lord: t.lord, lordAvg: lo?.avg, lordGames: lo?.games, ...communityUses(t.comp, t.comp[0]) };
});

// 每个禁用下的推荐：route + 首选棋手 + 数字（优先用该禁用下的阵容榜数字）
const bans = {};
for (const [ban, v] of Object.entries(BANS)) {
  bans[ban] = v.picks.map((id) => {
    const f = routes[id];
    const s = f.byBan[ban] && !COMBO[id] ? { ...f.byBan[ban], label: `禁${ban === '三分之地' ? '三分' : ban === '大河流域' ? '大河' : ban}时打成这套的对局` } : null;
    return { id, stat: s };
  });
}

const out = { source: META.source, routes, lords, traps, bans, lineupTotal: uniq.length, built: new Date().toISOString().slice(0, 10) };
writeFileSync(D('facts.js'), '// 生成：scripts/build_facts.mjs（勿手改）\nexport const FACTS = ' + JSON.stringify(out) + ';\n');
console.log('routes', Object.keys(routes).length, 'lords', Object.keys(lords).length, 'traps', traps.length);
for (const [id, r] of Object.entries(routes)) console.log(id, r.tier, r.stat.lord, r.stat.avg, (r.stat.share * 100).toFixed(0) + '%', '| 打成', r.done?.avg, r.stat?.games, 'code', r.code?.name, r.code?.uses, 'miss', r.code?.missing?.join(','), '| plus', r.partners.plus.map((p) => p.h).join(','), '| minus', r.partners.minus.map((p) => p.h).join(','), '| contest', r.contest?.level, '| bans', r.bans.join(','));
for (const t of traps) console.log('trap', t.id, t.avg, t.games, 'uses', t.uses, t.lineups, t.top?.name);
