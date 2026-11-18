// 语义级变更检测：区分「官方卡池真的变了」和「只是日期戳变了」。
//
// cards.json 的 meta.snapshot 每天按抓取日期重写，release.json 的 release 是生成时间戳，
// 两者一变，create-pull-request 就会天天开一个空 PR。这里把它们排除掉再比。
//
// 另外 release.json 的 files 是 site/dist 每个文件的 SHA-256，cards.json 因为 snapshot 变，
// 它的哈希也必然变，所以比对清单时把 data/cards.json 这一项一并去掉——
// 如果 cards.json 除了 snapshot 真的还有别的改动，上面的 cards 比对已经会报出来。
//
// 退出码：0 = 没有真实数据变更；1 = 有真实变更。
// node scripts/check_real_diff.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CARDS = 'site/dist/data/cards.json';
const REL = 'site/dist/release.json';
const IGNORE = new Set([CARDS, REL]);

// Windows 上这个仓库可能属于别的用户（dubious ownership），只对本仓库路径放行，不写全局配置。
const SAFE = ['-c', `safe.directory=${ROOT.replace(/\\/g, '/')}`];
const git = (...args) => execFileSync('git', [...SAFE, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

// HEAD 里的原文件；拿不到就当「原文件不存在」，按有变更处理
function head(p) {
  try {
    return git('show', `HEAD:${p}`);
  } catch {
    return null;
  }
}

// cards.json：只忽略 meta.snapshot，其余逐字段比对
function cardsDiff() {
  const oldText = head(CARDS);
  if (oldText == null) return `${CARDS} 在 HEAD 里不存在`;
  if (!existsSync(path.join(ROOT, CARDS))) return `${CARDS} 没有生成`;
  const a = JSON.parse(oldText);
  const b = JSON.parse(read(CARDS));
  if (a.meta) delete a.meta.snapshot;
  if (b.meta) delete b.meta.snapshot;
  // patch 是 build_data.py 从 snapshot 日期推出来的（20261119 → 11/19），同样天天变。
  if (a.meta) delete a.meta.patch;
  if (b.meta) delete b.meta.patch;
  return JSON.stringify(a) === JSON.stringify(b) ? null : `${CARDS} 内容有变化（已忽略 meta.snapshot）`;
}

// release.json：忽略 release 时间戳，以及随 snapshot 变的 cards.json 哈希
function releaseDiff() {
  const oldText = head(REL);
  if (oldText == null) return `${REL} 在 HEAD 里不存在`;
  if (!existsSync(path.join(ROOT, REL))) return `${REL} 没有生成`;
  const a = JSON.parse(oldText);
  const b = JSON.parse(read(REL));
  delete a.release;
  delete b.release;
  if (a.files) delete a.files['data/cards.json'];
  if (b.files) delete b.files['data/cards.json'];
  return JSON.stringify(a) === JSON.stringify(b) ? null : `${REL} 的文件清单有变化`;
}

// 其余文件：任何 tracked 改动或新增文件都算真实变更
function otherChanges() {
  const tracked = lines(git('diff', '--name-only', 'HEAD'));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  return [...new Set([...tracked, ...untracked])].filter((p) => !IGNORE.has(p));
}

const reasons = [cardsDiff(), releaseDiff()].filter(Boolean);
const other = otherChanges();
if (other.length) {
  const head10 = other.slice(0, 10).join(', ');
  reasons.push(`其他文件有变化（${other.length} 个）：${head10}${other.length > 10 ? ' …' : ''}`);
}

if (!reasons.length) {
  console.log('No real data changes, skip PR');
  process.exit(0);
}
console.log(reasons.join('\n'));
console.log('REAL_CHANGES');
process.exit(1);