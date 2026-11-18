// 数据完整性（v5）：plan.js 的每张牌都在官方卡池里、每条路线 7 个阶段齐全、棋盘位置合法、
// facts.js 与 plan.js 对齐、所有引用的图片文件存在、禁用推荐不会推荐被禁的路线。
// node scripts/verify-site.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'site/dist');
// 动态 import 只接受 file:/data:/node: URL；Windows 的 D:\… 会被 ESM loader 拒绝。
// pathToFileURL 同时处理盘符与路径中的空格（转义为 %20）。
const load = (p) => import(pathToFileURL(p).href);
const { STAGES, BANS, ROUTES, TRAPS, RULES } = await load(path.join(D, 'data/plan.js'));
const { FACTS } = await load(path.join(D, 'data/facts.js'));
const { ICONS } = await load(path.join(D, 'data/icons.js'));
const cards = JSON.parse(readFileSync(path.join(D, 'data/cards.json')));
const art = JSON.parse(readFileSync(path.join(D, 'data/art.json')));
const BY = {};
for (const k of ['heroes', 'effects', 'equipment', 'talents']) for (const c of cards[k]) BY[c.name] = { ...c, k };
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const file = (p) => ok(p && existsSync(path.join(D, p)), `缺文件 ${p}`);

ok(STAGES.length === 7, '阶段数');
for (const r of ROUTES) {
  const f = FACTS.routes[r.id];
  ok(f, `${r.id} 没有 facts`);
  ok(BY[r.carry]?.k === 'heroes', `${r.id} 主核 ${r.carry}`);
  ok(r.board.some((b) => b.h === r.carry), `${r.id} 棋盘里没有主核`);
  const seen = new Set();
  for (const b of r.board) {
    ok(BY[b.h]?.k === 'heroes', `${r.id} 棋盘 ${b.h}`);
    ok(b.r >= 1 && b.r <= 4 && b.c >= 1 && b.c <= 7, `${r.id} 位置越界 ${b.h}`);
    ok(!seen.has(b.r + ',' + b.c), `${r.id} 位置重复 ${b.h}`); seen.add(b.r + ',' + b.c);
  }
  ok(r.board.length <= 7, `${r.id} 超过 7 人`);
  for (const s of STAGES) {
    const x = r.stages[s.id];
    ok(x, `${r.id} 缺阶段 ${s.id}`);
    if (!x) continue;
    if (s.kind === 'auction') { ok(x.bid?.length >= 2, `${r.id} ${s.id} 拍品少于 2`); for (const [h, cap] of x.bid) { ok(BY[h], `${r.id} ${s.id} 拍品 ${h}`); ok(cap > 0 && cap <= 15, `${r.id} ${s.id} 出价 ${cap}`); } }
    else { ok(x.buy?.length >= 1 && x.do?.length >= 1, `${r.id} ${s.id} 空`); for (const h of x.buy) ok(BY[h], `${r.id} ${s.id} 买 ${h}`); for (const t of x.see || []) ok(BY[t], `${r.id} ${s.id} 天赋 ${t}`); for (const d of x.do) ok(d.length <= 40, `${r.id} ${s.id} 句子太长：${d}`); }
  }
  // 成型阵容的每个人都应该在某个阶段出现过（对局模式里棋盘会逐步点亮）
  const bought = new Set(Object.values(r.stages).flatMap((x) => [...(x.buy || []), ...(x.bid || []).map((b) => b[0])]));
  for (const b of r.board) ok(bought.has(b.h), `${r.id} 成型阵容里的 ${b.h} 从没出现在购买/拍卖里`);
  for (const t of [...r.talents.must, ...r.talents.good, ...r.talents.avoid]) ok(BY[t]?.k === 'talents', `${r.id} 天赋 ${t}`);
  for (const g of r.gear) ok(BY[g]?.k === 'equipment', `${r.id} 装备 ${g}`);
  for (const n of r.logic) for (const c of n.cards) ok(n.lord ? FACTS.lords[c] : BY[c], `${r.id} 机制 ${c}`);
  for (const l of r.lords) ok(FACTS.lords[l], `${r.id} 棋手 ${l}`);
  for (const p of r.pivots) if (p.to) ok(ROUTES.some((x) => x.id === p.to), `${r.id} 转型到不存在的 ${p.to}`);
  ok(r.idea.length <= 40, `${r.id} 一句话太长`);
  ok(f?.stat?.avg > 1 && f.stat.avg < 6 && f.stat.games > 300, `${r.id} 数字异常`);
  if (f?.splash) file(f.splash.src);
  if (f?.code) ok(/^\d{15,20}$/.test(f.code.key), `${r.id} 阵容码格式`);
  ok(ICONS[r.faction], `${r.id} 阵营图标`);
}
for (const [ban, v] of Object.entries(BANS)) {
  for (const id of v.picks) {
    const f = FACTS.routes[id];
    ok(f, `${ban} 推荐了不存在的 ${id}`);
    if (ban !== '未知') ok(!f.bans.includes(ban), `禁${ban}时推荐了打不了的 ${id}`);
  }
  ok(FACTS.bans[ban]?.length === v.picks.length, `${ban} facts 不齐`);
}
for (const t of TRAPS) { const d = FACTS.traps.find((x) => x.id === t.id); ok(d && d.uses > 100000 && d.avg >= 3.6, `陷阱 ${t.id}`); if (t.to) ok(ROUTES.some((x) => x.id === t.to), `陷阱 ${t.id} 链接`); }
for (const [n, l] of Object.entries(FACTS.lords)) { file(l.img); file(l.small); file(l.icon); }
ok(Object.keys(FACTS.lords).length === 19, '棋手数');
for (const c of cards.heroes) { file(c.img); file(c.art); }
for (const k of ['effects', 'equipment', 'talents']) for (const c of cards[k]) if (c.img) file(c.img);
for (const v of Object.values(art.card)) file(v);
ok(RULES.length >= 6, '规则数');
for (const p of ['index.html', 'app.js', 'app.css', 'glass.js', 'fonts/shuhei.woff2', 'assets/og.jpg', 'assets/icon.svg']) file(p);

// 阵容页数据（scripts/build_comps_site.mjs 生成）：结构、外键、meta 计数、体积。
// 查牌库没有的牌必须登记在 meta.missing 里，不能悄悄少一行。
const compsPath = path.join(D, 'data/comps.json');
file('data/comps.json');
const comps = existsSync(compsPath) ? JSON.parse(readFileSync(compsPath)) : { meta: {}, records: [] };
const compsRaw = existsSync(compsPath) ? readFileSync(compsPath) : '';
const heroNames = new Set(cards.heroes.map((c) => c.name));
const lordIcons = new Set(Object.keys(FACTS.lords));
const knownMissingHeroes = new Set(comps.meta?.missing?.heroes || []);
const seenCodes = new Set();
let nStats = 0, nVars = 0, nVarsTotal = 0;
ok(comps.records.length > 0, '阵容数据为空');
ok(comps.records.length === comps.meta.total, '阵容数与 meta.total 不一致');
for (const r of comps.records) {
  // 社区阵容是 17 位雪花号，官方预置是十几到几十的小编号，都是纯数字。
  ok(/^\d{1,20}$/.test(r.code || ''), `阵容码格式 ${r.code}`);
  ok(!seenCodes.has(r.code), `阵容码重复 ${r.code}`);
  seenCodes.add(r.code);
  ok(!!r.name, `${r.code} 没有阵容名`);
  ok(r.heroes.length >= 1, `${r.code} 没有英雄`);
  for (const h of r.heroes) ok(heroNames.has(h), `${r.code} 英雄 ${h} 不在查牌库`);
  ok(r.lords.length >= 1, `${r.code} 没有棋手`);
  for (const l of r.lords) ok(lordIcons.has(l) || (comps.meta?.missing?.lords || []).includes(l), `${r.code} 棋手 ${l} 没有图标也没登记`);
  if (r.st) {
    nStats++;
    ok(r.st.a >= 0 && r.st.a <= 1, `${r.code} 登场率越界`);
    ok(r.st.m > 1 && r.st.m < 7, `${r.code} 平均名次越界`);
    ok(Number.isInteger(r.st.n) && r.st.n > 0, `${r.code} 场次不是正整数`);
  }
  if (!Array.isArray(r.vars)) { ok(r.vars === null, `${r.code} vars 既不是数组也不是 null`); continue; }
  if (!r.vars.length) continue;
  ok(!!r.st, `${r.code} 有变阵却没有统计`);
  nVars++;
  nVarsTotal += r.vars.length;
  for (const v of r.vars) {
    ok(v.add.length + v.rem.length >= 1, `${r.code} 变阵没有换人`);
    for (const h of v.add) {
      ok(heroNames.has(h) || knownMissingHeroes.has(h), `${r.code} 变阵新增 ${h} 不在查牌库也没登记`);
      ok(!r.heroes.includes(h), `${r.code} 变阵新增 ${h} 本来就在阵容里`);
    }
    for (const h of v.rem) {
      ok(heroNames.has(h) || knownMissingHeroes.has(h), `${r.code} 变阵移除 ${h} 不在查牌库也没登记`);
      ok(r.heroes.includes(h), `${r.code} 变阵移除 ${h} 不在阵容里`);
      ok(!v.add.includes(h), `${r.code} ${h} 同时新增和移除`);
    }
    ok(Number.isInteger(v.n) && v.n >= 0, `${r.code} 变阵场次异常`);
    if (v.ar != null) ok(v.ar >= 0 && v.ar <= 1, `${r.code} 变阵登场率越界`);
    if (v.m != null) ok(v.m > 1 && v.m < 7, `${r.code} 变阵平均名次越界`);
  }
}
ok(nStats === comps.meta.withStats, 'meta.withStats 对不上');
ok(nVars === comps.meta.withVariants, 'meta.withVariants 对不上');
ok(nVarsTotal === comps.meta.variantsTotal, 'meta.variantsTotal 对不上');
ok(Buffer.byteLength(compsRaw) <= 50 * 1024, `data/comps.json 超过 50KB（${Buffer.byteLength(compsRaw)}）`);
ok(readFileSync(path.join(D, 'app.js'), 'utf8').includes("fetch('data/comps.json')"), 'app.js 没有加载 data/comps.json');
// 页面文案里不应该出现统计术语
const copy = readFileSync(path.join(D, 'app.js'), 'utf8') + readFileSync(path.join(D, 'data/plan.js'), 'utf8');
for (const w of ['名次差', '双重差分', '交互项', '幸存者偏差', '判决', '全站最强', '碾压']) ok(!copy.includes(w), `文案里出现「${w}」`);

console.log(fails.length ? fails.join('\n') : 'OK');
console.log(`${ROUTES.length} 条路线 · ${Object.keys(BANS).length} 种禁用 · ${TRAPS.length} 个陷阱 · ${fails.length} 个问题`);
process.exit(fails.length ? 1 : 0);
