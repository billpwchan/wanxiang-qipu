// 把 README 里的「十套路线」「热门但别打」两张表按 site/dist/data 重新生成（标记之间的内容会被覆盖）。
//   node scripts/sync_readme.mjs           写回 README.md
//   node scripts/sync_readme.mjs --check   只检查是否同步（CI 用），不同步时退出码 1
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'site/dist/data');
const { ROUTES, TRAPS } = await import(path.join(D, 'plan.js'));
const { FACTS } = await import(path.join(D, 'facts.js'));
const SITE = 'https://wanxiang.52-198-144-26.sslip.io/';
const TIER = { top: '首选', ok: '可以打', avg: '一般' };
const short = (f) => ({ 三分之地: '三分', 大河流域: '大河' }[f] || f);
const wan = (n) => (n >= 10000 ? `${(n / 10000).toFixed(0)} 万` : n.toLocaleString('en-US'));

const routes = [...ROUTES].sort((a, b) => FACTS.routes[a.id].stat.avg - FACTS.routes[b.id].stat.avg).map((r) => {
  const f = FACTS.routes[r.id];
  return `| [${r.name}](${SITE}#/r/${r.id}) | ${short(r.faction)} | ${r.carry} | ${r.lords.join('、')} | **${f.stat.avg.toFixed(2)}**（${f.stat.lord}） | ${f.done ? f.done.avg.toFixed(2) : '—'} | ${TIER[f.tier]} | ${r.tag} |`;
});
const routeTable = [
  '| 路线 | 阵营 | 主核 | 棋手 | 平均名次<br><sub>棋手的全部对局</sub> | <sub>只算打成的对局</sub> | 档位 | 特点 |',
  '|---|---|---|---|---|---|---|---|',
  ...routes,
].join('\n');

const traps = TRAPS.map((t) => {
  const d = FACTS.traps.find((x) => x.id === t.id);
  const to = ROUTES.find((r) => r.id === t.to);
  return `| ${t.name} | ${wan(d.uses)}次 | ${d.avg.toFixed(2)} | ${d.lord} ${d.lordAvg.toFixed(2)} | ${t.fix}${to ? `→ [${to.name}](${SITE}#/r/${to.id})` : ''} |`;
});
const trapTable = [
  '| 阵容 | 游戏内被导入 | 打成了也只有 | 棋手的全部对局 | 改成 |',
  '|---|---|---|---|---|',
  ...traps,
].join('\n');

const file = path.join(ROOT, 'README.md');
const before = readFileSync(file, 'utf8');
let after = before;
for (const [key, body] of [['routes', routeTable], ['traps', trapTable]]) {
  const re = new RegExp(`(<!-- ${key}:start -->\\n)[\\s\\S]*?(\\n<!-- ${key}:end -->)`);
  if (!re.test(after)) { console.error(`README 里缺少 <!-- ${key}:start --> / <!-- ${key}:end --> 标记`); process.exit(1); }
  after = after.replace(re, `$1${body}$2`);
}
if (process.argv.includes('--check')) {
  if (after !== before) { console.error('README 的路线表和 site/dist/data 不一致：运行 node scripts/sync_readme.mjs'); process.exit(1); }
  console.log('README 表格与数据一致');
} else {
  writeFileSync(file, after);
  console.log(after === before ? 'README 无变化' : 'README 表格已更新');
}
