// 把 datawxq 的变阵（variants）合并进 data/comps.json。
// 用法：node scripts/merge_variants.mjs [--in snapshots/probe-variants/fetch-variants.json] [--dry] [--allow-partial]
//
// 规则：
//   - 只处理 stats.source === "datawxq.com" 的记录（其余没有统计，也就没抓变阵），按 rosterKey 匹配。
//   - 命中有变阵：record.variants = 数组，每条只留 11 个核心字段，原样照抄，不改数值。
//   - 命中但站点说没变阵：record.variants = []（查过，确实是空），不是 null。
//   - 没抓到的记录：保持 null，不动。
//   - 合并前逐条核对结构：人数不变、added/removed 各换几个、数值范围。对不上就抛错，不修数据。
//   - 输入不完整（requested/succeeded 缺失或对不上，或没覆盖 comps 需要变阵的全部 rosterKey）
//     默认拒绝合并；加 --allow-partial 才放行，并在 variantsSnapshot 记 partial: true。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: node scripts/merge_variants.mjs [--in <json>] [--dry] [--allow-partial]';
const opts = { in: path.join(ROOT, 'snapshots', 'probe-variants', 'fetch-variants.json'), dry: false, allowPartial: false };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error(USAGE);
        process.exit(2);
      }
      opts.in = path.resolve(v);
    } else if (a === '--dry') {
      opts.dry = true;
    } else if (a === '--allow-partial') {
      opts.allowPartial = true;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}\n${USAGE}`);
      process.exit(2);
    }
  }
}

const DWXQ_SOURCE = 'datawxq.com';
const VARIANT_KEYS = ['lineupKey', 'lineupCode', 'heroes', 'addedHeroes', 'removedHeroes',
  'count', 'appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'similarity'];

const rosterKeyOf = (heroList) =>
  [heroList.length, ...heroList.map((h) => String(h.id)).sort()].join('|');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v) && v >= 0;

if (!fs.existsSync(opts.in)) {
  console.error(`找不到抓取结果: ${opts.in}\n先跑 node scripts/fetch_variants.mjs`);
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(opts.in, 'utf8'));
const byKey = new Map();
for (const it of snap.items || []) {
  if (it && typeof it.rosterKey === 'string') byKey.set(it.rosterKey, it);
}
if (!byKey.size) {
  console.error('抓取结果里没有 items，不合并');
  process.exit(1);
}
if ((snap.failures || []).length) {
  console.error(`抓取结果里有 ${snap.failures.length} 个 rosterKey 失败，先补抓再合并：`);
  for (const f of snap.failures) console.error('  ', f.rosterKey, String(f.err).slice(0, 120));
  process.exit(1);
}

// 只留核心字段，其余（页面装饰用的 name 组、内部 id 等）丢掉；英雄只留 id + name。
const heroRef = (h) => {
  if (!h || typeof h !== 'object') throw new Error(`英雄项不是对象: ${JSON.stringify(h)}`);
  const id = h.id ?? h.heroId;
  if (id === undefined || id === null || String(id) === '') throw new Error(`英雄缺 id: ${JSON.stringify(h)}`);
  const out = { id: String(id) };
  if (typeof h.name === 'string') out.name = h.name;
  return out;
};

const pickVariant = (v, outerKey, baseIds, tag) => {
  const out = {};
  for (const k of VARIANT_KEYS) {
    if (!(k in v)) throw new Error(`${tag}：datawxq 返回缺字段 ${k}`);
    out[k] = v[k];
  }
  out.heroes = (v.heroes || []).map(heroRef);
  out.addedHeroes = (v.addedHeroes || []).map(heroRef);
  out.removedHeroes = (v.removedHeroes || []).map(heroRef);
  if (!out.lineupKey) out.lineupKey = outerKey;
  // 完整性：heroes 必须恰好等于「原阵容 − removedHeroes + addedHeroes」。
  // 变阵可以多带一个英雄，也可以少带一个（实测 7→8、7→6 都有），所以不查人数不变，只查集合对得上。
  const base = new Set(baseIds);
  const ids = out.heroes.map((h) => h.id);
  if (!ids.length) throw new Error(`${tag}：heroes 是空的`);
  if (new Set(ids).size !== ids.length) throw new Error(`${tag}：heroes 有重复英雄`);
  const added = new Set(out.addedHeroes.map((h) => h.id));
  const removed = new Set(out.removedHeroes.map((h) => h.id));
  for (const id of added) if (base.has(id)) throw new Error(`${tag}：addedHeroes 里的 ${id} 本来就在原阵容里`);
  for (const id of removed) if (!base.has(id)) throw new Error(`${tag}：removedHeroes 里的 ${id} 不在原阵容里`);
  for (const id of added) if (removed.has(id)) throw new Error(`${tag}：${id} 同时出现在 added 和 removed 里`);
  const expect = new Set([...baseIds.filter((id) => !removed.has(id)), ...added]);
  if (expect.size !== ids.length || !ids.every((id) => expect.has(id))) {
    throw new Error(`${tag}：heroes 与 addedHeroes / removedHeroes 对不上`);
  }
  if (!isInt(out.count)) throw new Error(`${tag}：count 不是非负整数（${JSON.stringify(out.count)}）`);
  for (const k of ['appearanceRate', 'firstRate', 'top3Rate', 'similarity']) {
    if (!isNum(out[k]) || out[k] < 0 || out[k] > 1) {
      throw new Error(`${tag}：${k} 不是 0~1 的数字（${JSON.stringify(out[k])}）`);
    }
  }
  if (!isNum(out.avgPlacement) || out.avgPlacement <= 0) {
    throw new Error(`${tag}：avgPlacement 不是正数（${JSON.stringify(out.avgPlacement)}）`);
  }
  // lineupCode 是被收录进官网的阵容才有的公开编号，大多数变阵没有，空串是原值，不是缺字段。
  if (typeof out.lineupCode !== 'string') throw new Error(`${tag}：lineupCode 不是字符串`);
  return out;
};

const compsPath = path.join(ROOT, 'data', 'comps.json');
const comps = JSON.parse(fs.readFileSync(compsPath, 'utf8'));

// 抓取可能因站点限流提前收尾，也可能只探了部分 rosterKey；拿这种文件合并会整体覆写
// variantsSnapshot 与 note，把上一次的全量记录换成部分数据。
// 对账：requested / succeeded / items 必须是有限数且自洽，并且覆盖 comps 里所有需要变阵的 rosterKey。
const neededKeys = new Set(
  comps.records
    .filter((r) => r?.stats?.source === DWXQ_SOURCE)
    .map((r) => rosterKeyOf(r.heroList || [])),
);
const requested = snap.requested;
const succeeded = snap.succeeded;
const itemCount = (snap.items || []).length;
const fetchedKeys = byKey.size;
const missingKeys = [...neededKeys].filter((k) => !byKey.has(k));
const partial =
  !isNum(requested) || !isNum(succeeded) ||
  requested !== succeeded || succeeded !== fetchedKeys || itemCount !== fetchedKeys ||
  missingKeys.length > 0;
if (partial) {
  console.error(
    `抓取结果不完整：rosterKeysRequested=${isNum(requested) ? requested : '(缺失)'}，` +
    `rosterKeysFetched=${fetchedKeys}（succeeded=${isNum(succeeded) ? succeeded : '(缺失)'}，items=${itemCount}），` +
    `comps 需要 ${neededKeys.size} 个 rosterKey，缺 ${missingKeys.length} 个` +
    (missingKeys.length ? `（如 ${missingKeys[0]}）` : ''),
  );
  if (!opts.allowPartial) {
    console.error('部分数据会整体覆写 variantsSnapshot，已拒绝合并；确认要合并请加 --allow-partial');
    process.exit(1);
  }
  console.warn('--allow-partial：允许合并部分数据');
}

let recordsFilled = 0;
let recordsWithVariants = 0;
let variantTotal = 0;
let skippedNoStats = 0;
const hitKeys = new Set();

for (const r of comps.records) {
  if (r?.stats?.source !== DWXQ_SOURCE) {
    skippedNoStats++;
    continue;
  }
  const key = rosterKeyOf(r.heroList || []);
  const it = byKey.get(key);
  if (!it) continue; // 没抓到就保持原样（null），不假装查过

  const baseIds = (r.heroList || []).map((h) => String(h.id));
  const list = (it.variants || []).map((v, i) => pickVariant(v, key, baseIds, `${key}#${i}`));
  if (it.variantCount != null && list.length > it.variantCount) {
    throw new Error(`${key}：变阵 ${list.length} 条，超过站点声明的 ${it.variantCount}`);
  }
  r.variants = list;
  recordsFilled++;
  hitKeys.add(key);
  if (list.length) {
    recordsWithVariants++;
    variantTotal += list.length;
  }
}

const withVariantsKeys = [...byKey.values()].filter((i) => (i.variants || []).length).length;

console.log('comps records:', comps.records.length, '有 datawxq 统计的记录跳过计数:', skippedNoStats);
console.log('抓取 rosterKeys:', fetchedKeys, '其中有变阵:', withVariantsKeys);
console.log('写入 variants 的记录:', recordsFilled, '其中非空:', recordsWithVariants, '变阵总数:', variantTotal);

if (opts.dry) {
  console.log('--dry：不写文件');
  process.exit(0);
}

// 抓取方式不固定：可能是 fetch_variants.mjs 批量跑，也可能是手工 CDP 探针先抓几个。
// 输入里写了 provenance 就照抄，没写才用默认的脚本名，不替输入编来源。
const provenance =
  typeof snap.provenance === 'string' && snap.provenance.trim()
    ? snap.provenance.trim()
    : 'scripts/fetch_variants.mjs + merge_variants.mjs';
const variantsNote =
  `variants 来自 datawxq.com 的 /wzwxq/lineups/detail（${provenance}），按 rosterKey 匹配，` +
  `覆盖 ${recordsFilled} 条记录（其中 ${recordsWithVariants} 条有变阵，共 ${variantTotal} 条）；` +
  '匹配到但没有变阵的记 []，没抓到的保持 null。每条只留核心字段，数值原样照抄。';

comps.notes = (comps.notes || []).map((n) => (n.startsWith('variants ') ? variantsNote : n));
if (!(comps.notes || []).some((n) => n.startsWith('variants '))) {
  comps.notes = comps.notes || [];
  comps.notes.push(variantsNote);
}
comps.variantsSnapshot = {
  source: DWXQ_SOURCE,
  fetchedAt: snap.fetchedAt || null,
  provenance,
  rosterKeysRequested: isNum(requested) ? requested : null,
  rosterKeysFetched: fetchedKeys,
  rosterKeysWithVariants: withVariantsKeys,
  recordsFilled,
  recordsWithVariants,
  variantsTotal: variantTotal,
  ...(partial ? { partial: true } : {}),
};

fs.writeFileSync(compsPath, JSON.stringify(comps, null, 2) + '\n', 'utf8');
console.log('written:', path.relative(ROOT, compsPath), 'bytes:', fs.statSync(compsPath).size);
