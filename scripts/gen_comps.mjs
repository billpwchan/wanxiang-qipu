// 生成 data/comps.json：把官网阵容列表页的 XHR 快照归纳成一份数据文件。
// 用法：node scripts/gen_comps.mjs [--in <快照目录>] [--out <文件或目录>]
// 默认 --in snapshots/（自动取最新一次快照的 raw 目录），默认 --out data/（写成 <目录>/comps.json）。
//
// 只做归纳，不推算：stats 恒 null，variants 恒 null，heroList[].level 是源数据原值（恒为 1，不是真实等级）。
// 快照本身含作者昵称等个人信息，只在本地保存（snapshots/raw/ 已进 .gitignore）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERSION = 'v261105';
const SOURCE_PAGE = 'https://wxq.qq.com/cp/a20260707sfgw/teamlist.html';

// 三个栏位的分页接口。文件名形如 ...-598252_oslineupbyrecommend_pro_1.js-fd604539.json
const FEEDS = [
  { column: 'general', re: /598252_oslineupbyrecommend_pro_(\d+)\.js/ },
  { column: 'hot', re: /600264_oslineupbyhot_pro_(\d+)\.js/ },
  { column: 'beginner', re: /600269_oslineupbybeginner_pro_(\d+)\.js/ },
];

// primaryColumn 优先级：多栏命中时固定取 general > hot > beginner，避免随机
const PRIORITY = ['general', 'hot', 'beginner'];

// datawxq.com 的统计字段：由 scripts/fetch_stats.mjs 抓取后合并进来，不属于官网快照。
// 重新生成时必须按 rosterKey 继承，否则这批外部数据会被冲掉。
const DWXQ_SOURCE = 'datawxq.com';
const DWXQ_STAT_KEYS = ['appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'count', 'variantCount'];
const STATS_NOTE =
  '官网阵容列表页不提供平均排名 / 选取率 / 难度 / 穿戴率，未推算。' +
  '登场率 / 平均名次 / 登顶率 / 前三率 / 场次 / 变阵数来自 datawxq.com，匹配不到则留 null。' +
  'heroList[].level 源数据恒为 1，不是真实等级。';

// rosterKey：<英雄数>|<id 字符串升序>，与 datawxq 的 lineupKey / rosterKey 同构。
// 必须用字符串序（默认 sort），数字序会与站点不一致（例如 31191 排在 5051 之前）。
const rosterKeyOf = (heroList) =>
  [heroList.length, ...heroList.map((h) => String(h.id)).sort()].join('|');

const USAGE = 'usage: node scripts/gen_comps.mjs [--in <快照目录>] [--out <文件或目录>]';

function parseArgs(argv) {
  const opts = { in: 'snapshots', out: 'data' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' || a === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error(USAGE);
        process.exit(2);
      }
      opts[a.slice(2)] = v;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}\n${USAGE}`);
      process.exit(2);
    }
  }
  return opts;
}

// 快照目录可以有三种形态：
//   <dir> 里直接是分页 json；<dir>/raw/ 是；或 <dir>/<date>/raw/ 是（默认 snapshots/ 就是这种）。
// 找不到就直接报错，不猜别的目录。
function resolveInDir(dir) {
  const hasFeeds = (d) =>
    fs.existsSync(d) &&
    fs.readdirSync(d).some((f) => f.endsWith('.json') && FEEDS.some((feed) => feed.re.test(f)));

  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) throw new Error(`--in 不存在: ${abs}`);
  if (hasFeeds(abs)) return abs;
  const raw = path.join(abs, 'raw');
  if (hasFeeds(raw)) return raw;
  // 跳过 _ / . 开头的目录（手工留的旧快照、坏快照），按 raw 目录的修改时间取最新
  const candidates = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[_.]/.test(e.name))
    .map((e) => path.join(abs, e.name, 'raw'))
    .filter(hasFeeds)
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  if (candidates.length) {
    const picked = candidates[candidates.length - 1];
    console.log('note: --in 下有多份快照，取最新的', path.relative(process.cwd(), picked) || picked);
    return picked;
  }
  throw new Error(`--in 下找不到阵容分页快照（找过 ${abs}、${raw}、${abs}/*/raw）: ${abs}`);
}

function resolveOutFile(out) {
  const abs = path.resolve(out);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return path.join(abs, 'comps.json');
  if (out.endsWith('/') || out.endsWith(path.sep)) return path.join(abs, 'comps.json');
  if (path.extname(abs) === '.json') return abs;
  // 无扩展名且不存在：当目录
  fs.mkdirSync(abs, { recursive: true });
  return path.join(abs, 'comps.json');
}

const opts = parseArgs(process.argv.slice(2));
const rawDir = resolveInDir(opts.in);
const outFile = resolveOutFile(opts.out);

const indexPath = path.join(rawDir, '_index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
const atByFile = Object.fromEntries(
  index.map((x) => [x.savedAs, { at: x.at, url: String(x.url || '').split('?')[0] }]),
);

const rows = [];
for (const f of fs.readdirSync(rawDir)) {
  if (!f.endsWith('.json')) continue;
  for (const feed of FEEDS) {
    const m = f.match(feed.re);
    if (!m) continue;
    const arr = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    const meta = atByFile[f] || {};
    for (const r of arr) {
      rows.push({
        column: feed.column,
        pro: Number(m[1]),
        row: r,
        source: meta.url || f,
        fetchedAt: meta.at || null,
      });
    }
  }
}

if (!rows.length) {
  console.error(`--in 下没有读到任何阵容行: ${rawDir}`);
  process.exit(1);
}

const byKey = new Map();
for (const r of rows) {
  if (!byKey.has(r.row.key)) byKey.set(r.row.key, []);
  byKey.get(r.row.key).push(r);
}

const hero = (h) => ({
  id: h.id,
  name: h.name,
  type: h.type,
  cardQuality: h.cardQuality,
  level: h.level,
  isEvo: !!h.isEvo,
  positionX: h.positionX,
  positionZ: h.positionZ,
  equips: (h.equipList || []).map((e) => ({ id: e.id, name: e.name })),
});

const inter = (d) => ({
  score: Number(d.score),
  scoreNum: d.scoreNum,
  scores: d.scores,
  commentNum: d.commentNum,
  likeNum: d.likeNum,
});

// 玩家 UGC 文案：原文照录，只标来源，不改写、不截断、不拼接。
const ugc = (text) => (text ? { text, source: 'ugc' } : undefined);

const rounds = (list) =>
  (list || []).map((o) => ({
    beginRound: o.beginRound,
    endRound: o.endRound,
    desc: o.desc,
    source: 'ugc',
  }));

const records = [];
let crossSeasonCount = 0;
let interactiveDiffCount = 0;
let statsCarried = 0;

// 现有 comps.json 里由 fetch_stats.mjs 合并进来的 stats，按 rosterKey 索引。
// 只继承 source === 'datawxq.com' 且 6 个字段齐全的记录；其余（含用户手改）一律不碰。
const carriedStats = new Map();
{
  const prevPath = outFile;
  if (fs.existsSync(prevPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
      for (const r of prev.records || []) {
        const st = r?.stats;
        if (!st || st.source !== DWXQ_SOURCE) continue;
        if (!DWXQ_STAT_KEYS.every((k) => k in st)) continue;
        const k = rosterKeyOf(r.heroList || []);
        carriedStats.set(k, st);
      }
    } catch (e) {
      console.log('note: 读不到现有 comps.json，本次不从旧文件继承 stats：', e.message);
    }
  }
}

for (const [code, list] of byKey) {
  const columns = [...new Set(list.map((x) => x.column))];
  columns.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const primary = columns[0];
  const primaryRow = list.find((x) => x.column === primary);

  const useNumByColumn = {};
  for (const x of list) useNumByColumn[x.column] = x.row.useNum;

  const interactiveData = inter(primaryRow.row.interactiveData);
  const iSigs = new Map(list.map((x) => [x.column, JSON.stringify(inter(x.row.interactiveData))]));
  let interactiveDataByColumn;
  if (new Set(iSigs.values()).size > 1) {
    interactiveDataByColumn = {};
    for (const [col, sig] of iSigs) {
      const src = list.find((x) => x.column === col);
      interactiveDataByColumn[col] = inter(src.row.interactiveData);
    }
    interactiveDiffCount++;
  }

  const seasonIds = [...new Set(list.map((x) => x.row.seasonId))];
  const crossSeason = seasonIds.length > 1;
  if (crossSeason) crossSeasonCount++;

  const rec = {
    lineupCode: code,
    name: primaryRow.row.name,
    tag: primaryRow.row.tag || '',
    column: columns,
    primaryColumn: primary,
    crossSeason,
    useNumByColumn,
    lords: (primaryRow.row.lordList || []).map((l) => ({ id: l.id, name: l.name })),
    heroList: primaryRow.row.heroList.map(hero),
    interactiveData,
    stats: { avgRank: null, pickRate: null, difficulty: null, equipRate: null, source: '' },
    statsNote: STATS_NOTE,
    variants: null,
    source: primaryRow.source,
    sourcePage: SOURCE_PAGE,
    fetchedAt: primaryRow.fetchedAt,
    sourceSeasonId: primaryRow.row.seasonId,
    seasonIdRaw: primaryRow.row.seasonId,
    version: VERSION,
  };

  if (interactiveDataByColumn) rec.interactiveDataByColumn = interactiveDataByColumn;

  const op = rounds(primaryRow.row.operationDetails);
  if (op.length) rec.operationDetails = op;

  for (const field of ['brief', 'positionDesc', 'equipDesc']) {
    const v = ugc(primaryRow.row[field]);
    if (v) rec[field] = v;
  }

  rec.tags = primaryRow.row.tags || [];
  rec.talentCardDesc = primaryRow.row.talentCardDesc || '';
  rec.effectCardDesc = primaryRow.row.effectCardDesc || '';

  // beginner 栏是官方预置阵容（tag=官方、useNum 恒 0、seasonId=1），不是玩家提交的阵容。
  if (columns.includes('beginner')) rec.isPreset = true;

  // 外部统计：按 rosterKey 继承 fetch_stats.mjs 合并过的 datawxq 数据。
  // beginner 是官方预置阵容，不参与对局统计，永远保持 null。
  if (!rec.isPreset) {
    const st = carriedStats.get(rosterKeyOf(rec.heroList));
    if (st) {
      for (const k of DWXQ_STAT_KEYS) rec.stats[k] = st[k];
      rec.stats.source = DWXQ_SOURCE;
      statsCarried++;
    }
  }

  records.push(rec);
}

// 顺序稳定：按 primaryColumn 优先级，再按首见顺序（Map 保序），便于 diff
const order = new Map();
records.forEach((r, i) => order.set(r, i));
records.sort((a, b) => {
  const d = PRIORITY.indexOf(a.primaryColumn) - PRIORITY.indexOf(b.primaryColumn);
  return d !== 0 ? d : order.get(a) - order.get(b);
});

const columnCount = { general: 0, hot: 0, beginner: 0 };
for (const r of records) for (const c of r.column) columnCount[c]++;

const sourceSnapshot = (() => {
  const rel = path.relative(process.cwd(), rawDir).replace(/\\/g, '/');
  return rel.startsWith('..') ? path.basename(rawDir) : rel;
})();

const out = {
  schemaVersion: 1,
  version: VERSION,
  sourcePage: SOURCE_PAGE,
  sourceSnapshot,
  fetchedAt: index
    .filter((x) => FEEDS.some((f) => f.re.test(x.savedAs)))
    .map((x) => x.at)
    .sort()[0] || null,
  columns: PRIORITY,
  count: records.length,
  columnCount,
  notes: [
    '按 lineupCode 去重；' + rows.length + ' 条原始行 → ' + records.length + ' 条唯一阵容。',
    '跨栏记录的 useNum 官方取值不同，全部保留在 useNumByColumn，不取单值、不取平均。',
    'primaryColumn 固定按 general > hot > beginner 取值，仅表示字段来源，不代表推荐顺序。',
    'seasonIdRaw 按官方原值存，不做语义解释；general/hot=0、beginner=1，1 是栏位标识不是赛季。',
    'beginner 栏全部是官方预置阵容（tag=官方、useNum 恒为 0、seasonId=1），对应记录带 isPreset: true；不要和 general/hot 的使用次数放在一起比较。',
    'beginner 只有 9 行且 pro_2 返回 404，样本不足，暂不作为基准。',
    'stats 的 avgRank / pickRate / difficulty / equipRate 官网不提供，保持 null；登场率 / 平均名次 / 登顶率 / 前三率 / 场次 / 变阵数来自 datawxq.com，按 rosterKey 匹配，当初未重生成时保留；不要用 operationDetails 推 variants，不要用 equipList 算穿戴率。',
    'brief / positionDesc / equipDesc / operationDetails / tags / talentCardDesc / effectCardDesc 是玩家原创的阵容攻略（UGC），原文照录，版权归原作者，见 NOTICE。',
  ],
  records,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('in:', path.relative(process.cwd(), rawDir) || rawDir);
console.log('records:', records.length, '→', path.relative(process.cwd(), outFile) || outFile);
console.log('columnCount:', JSON.stringify(columnCount));
console.log('crossSeason:', crossSeasonCount, 'interactiveDiff:', interactiveDiffCount, 'statsCarried:', statsCarried);
console.log('bytes:', fs.statSync(outFile).size);
