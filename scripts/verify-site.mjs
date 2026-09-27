// 数据完整性（v5）：plan.js 的每张牌都在官方卡池里、每条路线 7 个阶段齐全、棋盘位置合法、
// facts.js 与 plan.js 对齐、所有引用的图片文件存在、禁用推荐不会推荐被禁的路线。
// node scripts/verify-site.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'site/dist');
const { STAGES, BANS, ROUTES, TRAPS, RULES } = await import(path.join(D, 'data/plan.js'));
const { FACTS } = await import(path.join(D, 'data/facts.js'));
const { ICONS } = await import(path.join(D, 'data/icons.js'));
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
// 页面文案里不应该出现统计术语
const copy = readFileSync(path.join(D, 'app.js'), 'utf8') + readFileSync(path.join(D, 'data/plan.js'), 'utf8');
for (const w of ['名次差', '双重差分', '交互项', '幸存者偏差', '判决', '全站最强', '碾压']) ok(!copy.includes(w), `文案里出现「${w}」`);

console.log(fails.length ? fails.join('\n') : 'OK');
console.log(`${ROUTES.length} 条路线 · ${Object.keys(BANS).length} 种禁用 · ${TRAPS.length} 个陷阱 · ${fails.length} 个问题`);
process.exit(fails.length ? 1 : 0);
