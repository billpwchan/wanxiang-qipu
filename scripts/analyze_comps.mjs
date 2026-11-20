// 侦察脚本：只读，统计快照里的阵容记录结构、字段分布、跨栏差异，不写任何文件。
// 用法：node scripts/analyze_comps.mjs [--in <快照目录>]
import fs from 'node:fs';
import path from 'node:path';

const FEEDS = [
  { column: 'general', re: /598252_oslineupbyrecommend_pro_(\d+)\.js/ },
  { column: 'hot', re: /600264_oslineupbyhot_pro_(\d+)\.js/ },
  { column: 'beginner', re: /600269_oslineupbybeginner_pro_(\d+)\.js/ },
];

const USAGE = 'usage: node scripts/analyze_comps.mjs [--in <快照目录>]';

let inDir = 'snapshots';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--in') inDir = argv[++i];
  else if (argv[i] === '-h' || argv[i] === '--help') {
    console.log(USAGE);
    process.exit(0);
  } else {
    console.error(`unknown argument: ${argv[i]}\n${USAGE}`);
    process.exit(2);
  }
}
if (!inDir) {
  console.error(USAGE);
  process.exit(2);
}

const hasFeeds = (d) =>
  fs.existsSync(d) && fs.readdirSync(d).some((f) => f.endsWith('.json') && FEEDS.some((feed) => feed.re.test(f)));
const resolveInDir = (dir) => {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) throw new Error(`--in 不存在: ${abs}`);
  if (hasFeeds(abs)) return abs;
  if (hasFeeds(path.join(abs, 'raw'))) return path.join(abs, 'raw');
  const candidates = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(abs, e.name, 'raw'))
    .filter(hasFeeds)
    .sort();
  if (candidates.length) return candidates[candidates.length - 1];
  throw new Error(`--in 下找不到阵容分页快照: ${abs}`);
};

const rawDir = resolveInDir(inDir);
const files = fs.readdirSync(rawDir);
const rows = [];
for (const f of files) {
  for (const feed of FEEDS) {
    const m = f.match(feed.re);
    if (!m) continue;
    if (!f.endsWith('.json')) {
      console.log('SKIP non-json (status != 200):', f);
      continue;
    }
    const arr = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    console.log(`${feed.column}\tpro_${m[1]}\t${arr.length}\t${f}`);
    for (const r of arr) rows.push({ column: feed.column, pro: Number(m[1]), row: r });
  }
}

console.log('\nrows total:', rows.length);

const byKey = new Map();
for (const r of rows) {
  const k = r.row.key;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}
console.log('unique keys:', byKey.size);

const colDist = {};
for (const [k, list] of byKey) {
  const cols = [...new Set(list.map((x) => x.column))].sort();
  const sign = cols.join('+');
  colDist[sign] = (colDist[sign] || 0) + 1;
}
console.log('column combos:', JSON.stringify(colDist));

let dupSameCol = 0;
for (const [k, list] of byKey) {
  const seen = new Set();
  for (const x of list) {
    if (seen.has(x.column)) dupSameCol++;
    seen.add(x.column);
  }
}
console.log('dupSameCol:', dupSameCol);

let crossSeason = 0;
for (const [k, list] of byKey) {
  if (new Set(list.map((x) => x.row.seasonId)).size > 1) crossSeason++;
}
console.log('crossSeason:', crossSeason);

const lenDist = {};
for (const k of byKey.keys()) lenDist[k.length] = (lenDist[k.length] || 0) + 1;
console.log('key length dist:', JSON.stringify(lenDist));
let nonDigit = 0;
for (const k of byKey.keys()) if (!/^\d+$/.test(k)) nonDigit++;
console.log('non-digit keys:', nonDigit);

let useNumDiff = 0;
let maxRel = 0;
const samples = [];
for (const [k, list] of byKey) {
  if (list.length < 2) continue;
  const vals = list.map((x) => x.row.useNum);
  if (new Set(vals).size > 1) {
    useNumDiff++;
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const rel = ((mx - mn) / mx) * 100;
    if (rel > maxRel) maxRel = rel;
    if (samples.length < 5) samples.push({ k, pairs: list.map((x) => `${x.column}=${x.row.useNum}`) });
  }
}
console.log('useNum differs across columns:', useNumDiff, 'maxRel%:', maxRel.toFixed(3));
console.log('samples:', JSON.stringify(samples));

let iDiff = 0;
const iSamples = [];
for (const [k, list] of byKey) {
  if (list.length < 2) continue;
  const sigs = list.map((x) => JSON.stringify(x.row.interactiveData));
  if (new Set(sigs).size > 1) {
    iDiff++;
    if (iSamples.length < 5) iSamples.push({ k, sigs });
  }
}
console.log('interactiveData differs across columns:', iDiff);

const fieldCount = {};
for (const { row } of rows) {
  for (const [k, v] of Object.entries(row)) {
    fieldCount[k] = fieldCount[k] || { present: 0, nonEmpty: 0, types: {} };
    fieldCount[k].present++;
    const t = Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v;
    fieldCount[k].types[t] = (fieldCount[k].types[t] || 0) + 1;
    if (v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) fieldCount[k].nonEmpty++;
  }
}
console.log('\nfield usage:');
for (const [k, v] of Object.entries(fieldCount)) {
  console.log(' ', k, v.present, 'nonEmpty=' + v.nonEmpty, JSON.stringify(v.types));
}

// lord 相关字段：是否存在、长度分布、能否对上卡池 lordId
const lordLen = {};
const lordIds = new Map();
for (const { row } of rows) {
  const list = row.lordList || [];
  lordLen[list.length] = (lordLen[list.length] || 0) + 1;
  for (const l of list) lordIds.set(l.id, l.name);
}
console.log('\nlordList length dist:', JSON.stringify(lordLen));
console.log('lord ids:', [...lordIds.entries()].map(([i, n]) => `${i}=${n}`).join(', '));

const poolIds = new Set();
for (const f of files) {
  if (!/oscard_new.*\.json$/.test(f)) continue;
  const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
  for (const l of j.lords || []) poolIds.add(String(l.lordId));
}
if (poolIds.size) {
  const miss = [...lordIds.keys()].filter((id) => !poolIds.has(String(id)));
  console.log('lord id → 卡池 lordId: 命中', lordIds.size - miss.length, '/', lordIds.size, '未命中:', miss.join(', ') || '(无)');
}

const r0 = rows[0].row;
for (const k of ['tags', 'tag', 'talentCardDesc', 'effectCardDesc', 'brief', 'positionDesc', 'equipDesc']) {
  console.log('\n--', k, ':', JSON.stringify(r0[k]).slice(0, 300));
}
console.log('\n-- operationDetails[0]:', JSON.stringify((r0.operationDetails || [])[0]).slice(0, 400));
console.log('\n-- heroList[0]:', JSON.stringify((r0.heroList || [])[0]).slice(0, 400));
