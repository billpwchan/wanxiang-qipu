// 把 datawxq 的统计合并进 data/comps.json。
// 用法：node scripts/merge_stats.mjs [--in snapshots/probe-stats/search-stats.json] [--out data/comps.json] [--dry]
//
// 规则：
//   - rosterKey = <英雄数>|<id 字符串升序>，与 datawxq 的 lineupKey/rosterKey 同构。
//   - 命中：stats 追加 appearanceRate/avgPlacement/firstRate/top3Rate/count/variantCount，
//           并把 stats.source 置为 "datawxq.com"。
//   - 未命中：stats 只补 source: ""，原有 4 个 null 字段原样不动，绝不留占位数值。
//   - beginner（isPreset）是官方预置阵容，不参与对局统计，永远不合并。
// 只改 stats / statsNote，不动任何其他字段。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: node scripts/merge_stats.mjs [--in <json>] [--dry]';
const opts = { in: path.join(ROOT, 'snapshots', 'probe-stats', 'search-stats.json'), dry: false };
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
const DWXQ_STAT_KEYS = ['appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'count', 'variantCount'];
const STATS_NOTE =
  '官网阵容列表页不提供平均排名 / 选取率 / 难度 / 穿戴率，未推算。' +
  '登场率 / 平均名次 / 登顶率 / 前三率 / 场次 / 变阵数来自 datawxq.com，匹配不到则留 null。' +
  'heroList[].level 源数据恒为 1，不是真实等级。';

const rosterKeyOf = (heroList) =>
  [heroList.length, ...heroList.map((h) => String(h.id)).sort()].join('|');

if (!fs.existsSync(opts.in)) {
  console.error(`找不到抓取结果: ${opts.in}\n先跑 node scripts/fetch_stats.mjs`);
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(opts.in, 'utf8'));
const byKey = new Map();
for (const l of snap.lineups || []) {
  if (l && typeof l.rosterKey === 'string') byKey.set(l.rosterKey, l);
}
if (!byKey.size) {
  console.error('抓取结果里没有 lineups，不合并');
  process.exit(1);
}

const compsPath = path.join(ROOT, 'data', 'comps.json');
const comps = JSON.parse(fs.readFileSync(compsPath, 'utf8'));

let hit = 0;
let skippedPreset = 0;
const hitKeys = new Set();
for (const r of comps.records) {
  const st = r.stats && typeof r.stats === 'object' ? r.stats : { avgRank: null, pickRate: null, difficulty: null, equipRate: null };
  // 原有 4 个字段保住；缺就补 null，绝不删
  for (const f of ['avgRank', 'pickRate', 'difficulty', 'equipRate']) if (!(f in st)) st[f] = null;

  const k = rosterKeyOf(r.heroList || []);
  const l = r.isPreset ? null : byKey.get(k);
  if (l) {
    for (const f of DWXQ_STAT_KEYS) {
      if (!(f in l)) throw new Error(`datawxq 返回缺字段 ${f}（rosterKey=${k}）`);
      st[f] = l[f];
    }
    st.source = DWXQ_SOURCE;
    hit++; hitKeys.add(k);
  } else {
    for (const f of DWXQ_STAT_KEYS) delete st[f];
    st.source = '';
    if (r.isPreset) skippedPreset++;
  }
  r.stats = st;
  r.statsNote = STATS_NOTE;
}

// 覆盖情况（按记录数，同名 rosterKey 会算多条）
const recordsCovered = comps.records.filter((r) => r.stats.source === DWXQ_SOURCE).length;
const rosterKeysTotal = new Set(comps.records.map((r) => rosterKeyOf(r.heroList || []))).size;

console.log('comps records:', comps.records.length, 'rosterKeys:', rosterKeysTotal);
console.log('datawxq lineups:', byKey.size, 'rosterKeys matched:', hitKeys.size, 'records filled:', recordsCovered);
console.log('preset (beginner) skipped:', skippedPreset);

if (opts.dry) {
  console.log('--dry：不写文件');
  process.exit(0);
}

comps.notes = (comps.notes || []).map((n) =>
  n.startsWith('stats 四个字段官网不提供') || n.startsWith('stats 的 avgRank')
    ? 'stats 的 avgRank / pickRate / difficulty / equipRate 官网不提供，保持 null；登场率 / 平均名次 / 登顶率 / 前三率 / 场次 / 变阵数来自 datawxq.com（scripts/fetch_stats.mjs + merge_stats.mjs），按 rosterKey 匹配；不要用 operationDetails 推 variants，不要用 equipList 算穿戴率。'
    : n,
);
comps.statsSnapshot = {
  source: DWXQ_SOURCE,
  fetchedAt: snap.fetchedAt || null,
  statisticsScope: snap.statisticsScope ?? null,
  sampleCount: snap.sampleCount ?? null,
  rosterKeysMatched: hitKeys.size,
  recordsFilled: recordsCovered,
};

fs.writeFileSync(compsPath, JSON.stringify(comps, null, 2) + '\n', 'utf8');
console.log('written:', path.relative(ROOT, compsPath), 'bytes:', fs.statSync(compsPath).size);
