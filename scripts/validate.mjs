// data/ 数据校验（零依赖，不引入 schema 库）。
// node scripts/validate.mjs [dataDir]   # 不传 dataDir 时校验仓库里的 data/
// 规则来自 docs/ 与维护约定：官网不提供的字段保持 null，不做推算，不按位数猜测阵容码。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'data');
const D = (p) => path.join(DATA_DIR, p);

const problems = [];
const notes = [];
const chk = (ok, msg) => { if (!ok) problems.push(msg); return !!ok; };
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const COLUMNS = ['general', 'hot', 'beginner'];

const readJson = (p) => JSON.parse(readFileSync(D(p), 'utf8'));

// ---- data/versions.json ----
const VERSION_FIELDS = ['version', 'seasonLabel', 'source', 'fetchedAt', 'isCurrent', 'note'];
const knownVersions = new Map();
if (!existsSync(D('versions.json'))) {
  problems.push('versions.json：文件不存在');
} else {
  const versions = readJson('versions.json');
  chk(Array.isArray(versions) && versions.length > 0, 'versions.json：顶层必须是数组且非空');
  const list = Array.isArray(versions) ? versions : [];
  let current = 0;
  list.forEach((v, i) => {
    for (const f of VERSION_FIELDS) chk(f in v, `versions.json[${i}]：缺字段 ${f}`);
    chk(isStr(v.version) && v.version.length > 0, `versions.json[${i}]：version 必须是非空字符串`);
    chk(typeof v.isCurrent === 'boolean', `versions.json[${i}]：isCurrent 必须是布尔`);
    chk(isStr(v.source) && v.source.startsWith('https://'), `versions.json[${i}]：source 必须是 https 地址`);
    chk(isStr(v.fetchedAt) && /^\d{4}-\d{2}-\d{2}$/.test(v.fetchedAt), `versions.json[${i}]：fetchedAt 必须是 YYYY-MM-DD`);
    if (v.isCurrent) current++;
    if (isStr(v.version)) knownVersions.set(v.version, v);
  });
  chk(current === 1, `versions.json：isCurrent=true 的条目必须恰好 1 条，实际 ${current}`);
}

// ---- data/lords.json ----
// 棋手外键表，只存 { id, name }，id 是卡池 lordId。卡面、技能、立绘在 site/dist/data/ 里，不重复存。
let lordIds = null;
let lordCount = null;
if (!existsSync(D('lords.json'))) {
  problems.push('lords.json：文件不存在');
} else {
  const j = readJson('lords.json');
  chk(Array.isArray(j), 'lords.json：顶层必须是数组');
  const lordList = Array.isArray(j) ? j : [];
  // 条数不写死：卡池版本升级本来就会变。只校验 id 唯一，条数在末尾当 info 打出来。
  const seenId = new Set();
  lordList.forEach((l, i) => {
    const at = `lords.json[${i}]`;
    chk(Object.keys(l || {}).join() === 'id,name', `${at}：只能有 id / name 两个字段`);
    chk(isInt(l?.id), `${at}：id 必须是整数`);
    if (isInt(l?.id)) {
      chk(!seenId.has(l.id), `${at}：id ${l.id} 重复`);
      seenId.add(l.id);
    }
    chk(isStr(l?.name) && l.name.length > 0, `${at}：name 必须是非空字符串`);
  });
  lordIds = seenId;
  lordCount = lordList.length;
}

// ---- data/heroes.json / equips.json / talents.json / effects.json ----
// 图鉴四表：纯数据，不含任何图片字段。字段定义见 data/README.md。
const STAT_KEYS = ['hp', 'atk', 'ap', 'range', 'mana0', 'mana', 'as',
  'phyDefense', 'magDefense', 'criticalRate', 'criticalEffect', 'moveSpeed', 'initEnergy'];
const BASE_KEYS = ['id', 'name', 'type', 'tier', 'faction', 'cost', 'desc'];
const CARD_FILES = [
  { file: 'heroes.json', type: 1, extra: ['stats', 'kw', 'awake', 'skills'], optional: [] },
  { file: 'equips.json', type: 5, extra: ['grpName', 'equipType'], optional: ['rel'] },
  { file: 'talents.json', type: 6, extra: ['grpName'], optional: ['rel'] },
  { file: 'effects.json', type: 2, extra: ['grpName'], optional: ['rel'] },
];
// 图片字段一律不许出现在这四张表里：卡面由 site/dist/data/cards.json 管。
const IMAGE_KEYS = new Set(['img', 'art', 'icon', 'thumb', 'url', 'image', 'cardImage', 'levelIcon',
  'levelIconV2', 'imageBg', 'bg', 'bgImg', 'portrait', 'portraitV2', 'avatar', 'banShenImg']);

const imageKeyHits = (v, at, out) => {
  if (Array.isArray(v)) {
    v.forEach((x, i) => imageKeyHits(x, `${at}[${i}]`, out));
    return out;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (IMAGE_KEYS.has(k)) out.push(`${at}.${k}`);
      imageKeyHits(x, `${at}.${k}`, out);
    }
  }
  return out;
};

let heroIds = null;
// 变阵英雄外键用名字反查 id：官网图鉴未收录、只在变阵里出现的新牌没有 heroes.json 记录，
// 名字查不到就登记成 note，名字查得到则 id 必须与图鉴一致。
let heroIdByName = null;
const unknownVariantNames = new Set();
for (const spec of CARD_FILES) {
  const label = spec.file.replace('.json', '');
  if (!existsSync(D(spec.file))) {
    problems.push(`${spec.file}：文件不存在`);
    continue;
  }
  const arr = readJson(spec.file);
  chk(Array.isArray(arr), `${spec.file}：顶层必须是数组`);
  if (!Array.isArray(arr)) continue;
  chk(arr.length > 0, `${spec.file}：不能为空数组`);
  notes.push(`data/${spec.file} 当前 ${arr.length} 条`);

  const allowed = new Set([...BASE_KEYS, ...spec.extra, ...spec.optional]);
  const required = [...BASE_KEYS, ...spec.extra];
  const seen = new Set();

  arr.forEach((c, i) => {
    const at = `${label}[${i}]`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      problems.push(`${at}：必须是对象`);
      return;
    }
    for (const k of Object.keys(c)) {
      if (!allowed.has(k)) problems.push(`${at}：出现未定义字段 ${k}`);
    }
    for (const k of required) chk(k in c, `${at}：缺字段 ${k}`);

    chk(isInt(c.id), `${at}：id 必须是整数`);
    if (isInt(c.id)) {
      chk(!seen.has(c.id), `${at}：id ${c.id} 重复`);
      seen.add(c.id);
    }
    chk(isStr(c.name) && c.name.length > 0, `${at}：name 必须是非空字符串`);
    chk(c.type === spec.type, `${at}：type 必须是 ${spec.type}，实际 ${c.type}`);
    chk(isInt(c.tier) && c.tier >= 1 && c.tier <= 6, `${at}：tier 必须是 1-6 的整数`);
    chk(isStr(c.faction), `${at}：faction 必须是字符串`);
    chk(isInt(c.cost), `${at}：cost 必须是整数`);
    chk(isStr(c.desc), `${at}：desc 必须是字符串`);
    if ('grpName' in c) chk(isStr(c.grpName) && c.grpName.length > 0, `${at}：grpName 必须是非空字符串`);
    if ('equipType' in c) chk(isStr(c.equipType) && c.equipType.length > 0, `${at}：equipType 必须是非空字符串`);

    if ('stats' in c) {
      const st = c.stats;
      chk(st && typeof st === 'object' && !Array.isArray(st), `${at}：stats 必须是对象`);
      if (st && typeof st === 'object' && !Array.isArray(st)) {
        const keys = Object.keys(st).sort().join();
        chk(keys === [...STAT_KEYS].sort().join(), `${at}：stats 必须且只能有 ${STAT_KEYS.length} 个字段`);
        for (const k of STAT_KEYS) chk(isNum(st[k]), `${at}.stats.${k} 必须是数字`);
      }
    }
    if ('kw' in c) {
      chk(Array.isArray(c.kw), `${at}：kw 必须是数组`);
      for (const k of Array.isArray(c.kw) ? c.kw : []) chk(isStr(k) && k.length > 0, `${at}：kw 的元素必须是非空字符串`);
    }
    if ('awake' in c) chk(isStr(c.awake), `${at}：awake 必须是字符串`);
    if ('skills' in c) {
      chk(Array.isArray(c.skills), `${at}：skills 必须是数组`);
      for (const [j, s] of (Array.isArray(c.skills) ? c.skills : []).entries()) {
        const sAt = `${at}.skills[${j}]`;
        chk(isStr(s?.name) && s.name.length > 0, `${sAt}：name 必须是非空字符串`);
        chk(isStr(s?.text), `${sAt}：text 必须是字符串`);
        chk(Array.isArray(s?.nodes), `${sAt}：nodes 必须是数组`);
        for (const [k, n] of (Array.isArray(s?.nodes) ? s.nodes : []).entries()) {
          chk(isInt(n?.lv), `${sAt}.nodes[${k}]：lv 必须是整数`);
          chk(isStr(n?.text), `${sAt}.nodes[${k}]：text 必须是字符串`);
        }
      }
    }
    if ('rel' in c) {
      chk(Array.isArray(c.rel), `${at}：rel 必须是数组`);
      for (const [j, r] of (Array.isArray(c.rel) ? c.rel : []).entries()) {
        chk(isStr(r?.name) && r.name.length > 0, `${at}.rel[${j}]：name 必须是非空字符串`);
        chk(isStr(r?.text), `${at}.rel[${j}]：text 必须是字符串`);
      }
    }
    const hits = imageKeyHits(c, at, []);
    for (const h of hits) problems.push(`${h}：图鉴表里不许出现图片字段`);
  });

  if (spec.file === 'heroes.json') {
    heroIds = seen;
    heroIdByName = new Map(arr.filter((c) => isInt(c?.id) && isStr(c?.name)).map((c) => [c.name, c.id]));
  }
}

// ---- data/comps.json ----
if (!existsSync(D('comps.json'))) {
  problems.push('comps.json：文件不存在');
} else {
  const doc = readJson('comps.json');
  chk(doc && typeof doc === 'object' && !Array.isArray(doc), 'comps.json：顶层必须是对象');
  const records = doc?.records;
  chk(Array.isArray(records), 'comps.json：records 必须是数组');
  const list = Array.isArray(records) ? records : [];

  chk(doc?.count === list.length, `comps.json：count=${doc?.count} 与实际记录数 ${list.length} 不一致`);
  chk(isStr(doc?.version) && knownVersions.has(doc.version), `comps.json：version ${doc?.version} 不在 versions.json 里`);
  chk(
    Array.isArray(doc?.columns) && doc.columns.join() === COLUMNS.join(),
    `comps.json：columns 必须是 ${COLUMNS.join('/')}`
  );
  chk(isStr(doc?.fetchedAt) && !Number.isNaN(Date.parse(doc.fetchedAt)), 'comps.json：fetchedAt 不是合法时间');

  // statsSnapshot / variantsSnapshot：datawxq.com 抓取的汇总。字段固定、类型固定，
  // 计数之间要自洽，并且要和 records 里实际填了几条对得上（部分抓取没写全就会在这里露出来）。
  const SNAP_KEYS = {
    statsSnapshot: ['source', 'fetchedAt', 'statisticsScope', 'sampleCount', 'rosterKeysMatched', 'recordsFilled'],
    variantsSnapshot: ['source', 'fetchedAt', 'provenance', 'rosterKeysRequested', 'rosterKeysFetched',
      'rosterKeysWithVariants', 'recordsFilled', 'recordsWithVariants', 'variantsTotal'],
  };
  const SNAP_INTS = ['sampleCount', 'rosterKeysMatched', 'recordsFilled',
    'rosterKeysRequested', 'rosterKeysFetched', 'rosterKeysWithVariants', 'recordsWithVariants', 'variantsTotal'];
  const snaps = {};
  for (const [name, keys] of Object.entries(SNAP_KEYS)) {
    const s = doc?.[name];
    if (!chk(s && typeof s === 'object' && !Array.isArray(s), `comps.json：${name} 必须是对象`)) continue;
    snaps[name] = s;
    for (const k of keys) chk(k in s, `comps.json.${name}：缺字段 ${k}`);
    for (const k of Object.keys(s)) chk(keys.includes(k), `comps.json.${name}：出现未定义字段 ${k}`);
    chk(s.source === 'datawxq.com', `comps.json.${name}.source 必须是 datawxq.com，实际 ${JSON.stringify(s.source)}`);
    chk(isStr(s.fetchedAt) && !Number.isNaN(Date.parse(s.fetchedAt)), `comps.json.${name}.fetchedAt 不是合法时间`);
    for (const k of SNAP_INTS) {
      if (k in s) chk(isInt(s[k]) && s[k] >= 0, `comps.json.${name}.${k} 必须是非负整数`);
    }
  }
  const statsSnap = snaps.statsSnapshot;
  const varSnap = snaps.variantsSnapshot;
  const sampleCount = statsSnap?.sampleCount;
  if (isStr(statsSnap?.statisticsScope)) {
    chk(statsSnap.statisticsScope.length > 0, 'comps.json.statsSnapshot.statisticsScope 不能是空串');
  }
  if (isStr(varSnap?.provenance)) {
    chk(varSnap.provenance.length > 0, 'comps.json.variantsSnapshot.provenance 不能是空串');
  }
  if (isInt(varSnap?.rosterKeysRequested) && isInt(varSnap?.rosterKeysFetched)) {
    chk(varSnap.rosterKeysFetched <= varSnap.rosterKeysRequested, 'comps.json.variantsSnapshot：rosterKeysFetched 不能大于 rosterKeysRequested');
  }
  if (isInt(varSnap?.rosterKeysFetched) && isInt(varSnap?.rosterKeysWithVariants)) {
    chk(varSnap.rosterKeysWithVariants <= varSnap.rosterKeysFetched, 'comps.json.variantsSnapshot：rosterKeysWithVariants 不能大于 rosterKeysFetched');
  }
  if (isInt(varSnap?.recordsFilled) && isInt(varSnap?.recordsWithVariants)) {
    chk(varSnap.recordsWithVariants <= varSnap.recordsFilled, 'comps.json.variantsSnapshot：recordsWithVariants 不能大于 recordsFilled');
  }

  // 外键：heroList[].id 必须落在上面图鉴校验建好的 heroIds 里。
  // heroes.json 缺失或结构不对时 heroIds 为 null，这里只提示、不静默关掉。
  if (!heroIds) notes.push('data/heroes.json 不可用，heroList[].id 外键校验已跳过');

  const codeSeen = new Map();
  list.forEach((r, i) => {
    const at = `comps.json.records[${i}]`;
    const tag = isStr(r?.lineupCode) ? `${at}(lineupCode=${r.lineupCode})` : at;

    // 阵容码：只校验非空 + 全数字。实测官网 1-19 位都有，禁止按位数校验。
    chk(isStr(r?.lineupCode), `${at}：lineupCode 必须是字符串`);
    if (isStr(r?.lineupCode)) {
      chk(r.lineupCode.length > 0, `${at}：lineupCode 为空`);
      chk(/^\d+$/.test(r.lineupCode), `${at}：lineupCode 必须全是数字`);
      if (codeSeen.has(r.lineupCode)) problems.push(`${at}：lineupCode 重复（首次出现在 records[${codeSeen.get(r.lineupCode)}]）`);
      else codeSeen.set(r.lineupCode, i);
    }

    chk(isStr(r?.name) && r.name.length > 0, `${tag}：name 必须是非空字符串`);
    chk(isStr(r?.tag), `${tag}：tag 必须是字符串`);

    // column / primaryColumn
    chk(Array.isArray(r?.column) && r.column.length > 0, `${tag}：column 必须是非空数组`);
    const cols = Array.isArray(r?.column) ? r.column : [];
    chk(new Set(cols).size === cols.length, `${tag}：column 有重复项`);
    for (const c of cols) chk(COLUMNS.includes(c), `${tag}：column 出现未知值 ${c}`);
    if (cols.length > 1) {
      chk(isStr(r?.primaryColumn) && cols.includes(r.primaryColumn), `${tag}：多栏记录的 primaryColumn 必填且必须属于 column`);
    } else if (cols.length === 1) {
      chk(r?.primaryColumn === cols[0], `${tag}：单栏记录的 primaryColumn 必须等于该栏`);
    }

    // useNumByColumn：跨栏数值不同，全部保留，不取单值
    const byCol = r?.useNumByColumn;
    chk(byCol && typeof byCol === 'object' && !Array.isArray(byCol), `${tag}：缺 useNumByColumn`);
    if (byCol && typeof byCol === 'object') {
      const keys = Object.keys(byCol);
      chk(keys.length === cols.length && cols.every((c) => keys.includes(c)), `${tag}：useNumByColumn 的键必须与 column 完全一致`);
      for (const k of keys) chk(isInt(byCol[k]) && byCol[k] >= 0, `${tag}：useNumByColumn.${k} 必须是非负整数`);
    }
    chk(!('useNum' in r), `${tag}：不应存在单值 useNum，跨栏数值见 useNumByColumn`);

    // heroList
    chk(Array.isArray(r?.heroList) && r.heroList.length > 0, `${tag}：heroList 必须是非空数组`);
    for (const [j, h] of (Array.isArray(r?.heroList) ? r.heroList : []).entries()) {
      const hAt = `${tag}.heroList[${j}]`;
      chk(isInt(h?.id), `${hAt}：id 必须是整数`);
      chk(isStr(h?.name) && h.name.length > 0, `${hAt}：name 必须是非空字符串`);
      chk([0, 1, 2, 3].includes(h?.type), `${hAt}：type 只能是 0-3`);
      chk(isInt(h?.cardQuality) && h.cardQuality >= 1 && h.cardQuality <= 5, `${hAt}：cardQuality 只能是 1-5`);
      chk(isInt(h?.level), `${hAt}：level 必须是整数`);
      chk(typeof h?.isEvo === 'boolean', `${hAt}：isEvo 必须是布尔`);
      chk(isInt(h?.positionX) && isInt(h?.positionZ), `${hAt}：positionX/positionZ 必须是整数`);
      chk(Array.isArray(h?.equips), `${hAt}：equips 必须是数组`);
      for (const [k, e] of (Array.isArray(h?.equips) ? h.equips : []).entries()) {
        chk(isInt(e?.id), `${hAt}.equips[${k}]：id 必须是整数`);
        chk(isStr(e?.name) && e.name.length > 0, `${hAt}.equips[${k}]：name 必须是非空字符串`);
      }
      if (heroIds && isInt(h?.id)) chk(heroIds.has(h.id), `${hAt}：id ${h.id} 不在 data/heroes.json 里`);
    }

    // lords：数组，1-3 条，id 查 data/lords.json
    chk(Array.isArray(r?.lords), `${tag}：lords 必须是数组`);
    const lords = Array.isArray(r?.lords) ? r.lords : [];
    chk(lords.length >= 1 && lords.length <= 3, `${tag}：lords 长度必须是 1-3，实际 ${lords.length}`);
    for (const [j, l] of lords.entries()) {
      const lAt = `${tag}.lords[${j}]`;
      chk(l && typeof l === 'object' && !Array.isArray(l), `${lAt}：必须是对象`);
      chk(isNum(l?.id) && isInt(l.id), `${lAt}：id 必须是整数（number）`);
      chk(isStr(l?.name) && l.name.length > 0, `${lAt}：name 必须是非空字符串`);
      if (lordIds && isInt(l?.id)) chk(lordIds.has(l.id), `${lAt}：id ${l.id} 不在 data/lords.json 里`);
    }

    // 玩家 UGC 文案：原文照录，只标 source: "ugc"；非空才写，写了就必须是 { text, source }
    for (const f of ['brief', 'positionDesc', 'equipDesc']) {
      if (!(f in (r || {}))) continue;
      const v = r[f];
      chk(v && typeof v === 'object' && !Array.isArray(v), `${tag}.${f}：必须是 { text, source } 对象，不能是裸字符串`);
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      chk(isStr(v.text), `${tag}.${f}.text 必须是字符串`);
      chk(v.source === 'ugc', `${tag}.${f}.source 必须是 "ugc"`);
    }
    if ('operationDetails' in (r || {})) {
      chk(Array.isArray(r.operationDetails), `${tag}.operationDetails 必须是数组`);
      for (const [j, o] of (Array.isArray(r.operationDetails) ? r.operationDetails : []).entries()) {
        const oAt = `${tag}.operationDetails[${j}]`;
        chk(isNum(o?.beginRound) && isInt(o.beginRound), `${oAt}：缺 beginRound 或不是整数`);
        chk(isNum(o?.endRound) && isInt(o.endRound), `${oAt}：缺 endRound 或不是整数`);
        // 官方源里有阶段 desc 就是空串，原文照录，允许 ""
        chk(isStr(o?.desc), `${oAt}：缺 desc 或不是字符串`);
        chk(isStr(o?.source), `${oAt}：缺 source 或不是字符串`);
      }
    }
    if ('tags' in (r || {})) {
      chk(Array.isArray(r.tags), `${tag}.tags 必须是数组`);
      for (const [j, t] of (Array.isArray(r.tags) ? r.tags : []).entries()) {
        chk(isStr(t) && t.length > 0, `${tag}.tags[${j}]：必须是非空字符串`);
      }
    }
    if ('talentCardDesc' in (r || {})) chk(isStr(r.talentCardDesc), `${tag}.talentCardDesc 必须是字符串`);
    if ('effectCardDesc' in (r || {})) chk(isStr(r.effectCardDesc), `${tag}.effectCardDesc 必须是字符串`);

    // 明确不落库的字段：出现即回归
    for (const f of ['recommendLords', 'video', 'author']) {
      chk(!(f in (r || {})), `${tag}：不应存在 ${f}`);
    }
    chk(!('infoID' in (r?.interactiveData || {})), `${tag}.interactiveData：不应存在 infoID`);
    chk(!('exposedComments' in (r?.interactiveData || {})), `${tag}.interactiveData：不应存在 exposedComments`);

    // interactiveData
    const checkInter = (d, at2) => {
      chk(d && typeof d === 'object', `${at2}：必须是对象`);
      if (!d || typeof d !== 'object') return;
      chk(isNum(d.score) && d.score >= 0 && d.score <= 10, `${at2}.score 必须是 0-10 的数字（用户评分，不是排名）`);
      chk(isInt(d.scoreNum) && d.scoreNum >= 0, `${at2}.scoreNum 必须是非负整数`);
      chk(Array.isArray(d.scores) && d.scores.length === 5, `${at2}.scores 必须是长度 5 的数组`);
      for (const s of (Array.isArray(d.scores) ? d.scores : [])) chk(isInt(s) && s >= 0, `${at2}.scores 的元素必须是非负整数`);
      chk(isInt(d.commentNum) && d.commentNum >= 0, `${at2}.commentNum 必须是非负整数`);
      chk(isInt(d.likeNum) && d.likeNum >= 0, `${at2}.likeNum 必须是非负整数`);
    };
    checkInter(r?.interactiveData, `${tag}.interactiveData`);
    if ('interactiveDataByColumn' in (r || {})) {
      const m = r.interactiveDataByColumn;
      chk(m && typeof m === 'object', `${tag}.interactiveDataByColumn 必须是对象`);
      const keys = Object.keys(m || {});
      chk(keys.length === cols.length && cols.every((c) => keys.includes(c)), `${tag}.interactiveDataByColumn 的键必须与 column 完全一致`);
      for (const k of keys) checkInter(m[k], `${tag}.interactiveDataByColumn.${k}`);
    }

    // stats / variants：官网不给就留 null，禁止填占位值
    const st = r?.stats;
    chk(st && typeof st === 'object', `${tag}：缺 stats`);
    for (const f of ['avgRank', 'pickRate', 'difficulty', 'equipRate']) {
      chk(st && f in st, `${tag}.stats：缺字段 ${f}`);
      chk(st?.[f] === null || isNum(st?.[f]), `${tag}.stats.${f} 只能是 null 或数字`);
    }
    // datawxq.com 的统计：有 source 就必须字段齐全且类型正确；没有 source（或为空）就必须是 null。
    // 数值不做二次推算，只查类型与取值范围。
    chk(st?.source === undefined || st?.source === '' || st?.source === 'datawxq.com',
      `${tag}.stats.source 只能是缺省、'' 或 'datawxq.com'，实际 ${JSON.stringify(st?.source)}`);
    const hasDwxq = st?.source === 'datawxq.com';
    for (const f of ['appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'count', 'variantCount']) {
      if (hasDwxq) {
        chk(f in (st || {}), `${tag}.stats：source=datawxq.com 时缺字段 ${f}`);
      } else {
        chk(!(f in (st || {})) || st?.[f] === null, `${tag}.stats.${f}：没有 source 时必须是 null 或不出现`);
      }
    }
    if (hasDwxq) {
      for (const f of ['appearanceRate', 'firstRate', 'top3Rate']) {
        chk(isNum(st[f]) && st[f] >= 0 && st[f] <= 1, `${tag}.stats.${f} 必须是 0~1 的数字`);
      }
      // 平均名次是 8 人局的名次均值，只能落在 (1, 7) 里；上限防的是把场次/局数写进这个字段。
      chk(isNum(st.avgPlacement) && st.avgPlacement > 1 && st.avgPlacement < 7,
        `${tag}.stats.avgPlacement 必须在 1 和 7 之间，实际 ${st.avgPlacement}`);
      for (const f of ['count', 'variantCount']) {
        chk(isInt(st[f]) && st[f] >= 0, `${tag}.stats.${f} 必须是非负整数`);
        if (isInt(sampleCount)) chk(st[f] <= sampleCount, `${tag}.stats.${f} ${st[f]} 大于 statsSnapshot.sampleCount ${sampleCount}`);
      }
    }
    chk(isStr(r?.statsNote) && r.statsNote.length > 0, `${tag}：statsNote 必须说明这些字段为什么是 null`);
    // variants：要么 null（没抓到），要么是从 datawxq 摘下来的变阵数组。
    // 只查结构、类型和「变阵 = 原阵容换掉若干英雄且人数不变」这条对应关系，不补字段、不推算数值。
    chk(r?.variants === null || Array.isArray(r?.variants), `${tag}：variants 只能是 null 或数组`);
    if (Array.isArray(r?.variants)) {
      const baseIds = (r.heroList || []).map((h) => String(h.id));
      const base = new Set(baseIds);
      chk(r.variants.length <= (st?.variantCount ?? 0),
        `${tag}.variants：${r.variants.length} 条，超过 stats.variantCount ${st?.variantCount}`);
      if (r.variants.length) chk(hasDwxq, `${tag}：有 variants 时 stats.source 必须是 datawxq.com`);
      const VARIANT_KEYS = ['lineupKey', 'lineupCode', 'heroes', 'addedHeroes', 'removedHeroes',
        'count', 'appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'similarity'];
      const seenKeys = new Set();
      for (let i = 0; i < r.variants.length; i++) {
        const v = r.variants[i];
        const vt = `${tag}.variants[${i}]`;
        chk(v && typeof v === 'object' && !Array.isArray(v), `${vt} 必须是对象`);
        for (const k of Object.keys(v || {})) chk(VARIANT_KEYS.includes(k), `${vt}：多出字段 ${k}`);
        for (const k of VARIANT_KEYS) chk(k in (v || {}), `${vt}：缺字段 ${k}`);
        chk(isStr(v.lineupKey) && /^\d+(\|\d+)+$/.test(v.lineupKey), `${vt}.lineupKey 格式不对：${JSON.stringify(v.lineupKey)}`);
        chk(!seenKeys.has(v.lineupKey), `${vt}.lineupKey 与本条记录里其他变阵重复`);
        seenKeys.add(v.lineupKey);
        // lineupCode 是被官网收录的阵容才有的公开编号，多数变阵没有，空串是原值。
        chk(isStr(v.lineupCode), `${vt}.lineupCode 只能是字符串`);
        for (const k of ['heroes', 'addedHeroes', 'removedHeroes']) {
          chk(Array.isArray(v[k]), `${vt}.${k} 必须是数组`);
          for (const h of v[k] || []) {
            chk(h && (typeof h.id === 'string' || typeof h.id === 'number') && String(h.id) !== '',
              `${vt}.${k}：英雄缺 id`);
            chk(!('name' in (h || {})) || isStr(h.name), `${vt}.${k}：name 只能是字符串`);
            // 外键：图鉴里有这个名字时 id 必须一致；图鉴没有的（官网未收录、只在变阵里出现的新牌）
            // 记进 unknownVariantNames，校验结束按 note 列出，不静默放过。
            if (!heroIdByName) continue;
            const nm = isStr(h?.name) ? h.name : '';
            if (heroIdByName.has(nm)) {
              chk(String(h.id) === String(heroIdByName.get(nm)),
                `${vt}.${k}：${nm} 的 id ${h.id} 与 data/heroes.json 的 ${heroIdByName.get(nm)} 不一致`);
            } else {
              unknownVariantNames.add(nm || `id=${h?.id}`);
            }
          }
        }
        // 变阵 = 原阵容 − removedHeroes + addedHeroes。多带一个、少带一个都见过，所以不查人数不变。
        const ids = (v.heroes || []).map((h) => String(h.id));
        chk(ids.length > 0, `${vt}.heroes 不能为空`);
        chk(new Set(ids).size === ids.length, `${vt}.heroes 有重复英雄`);
        const added = new Set((v.addedHeroes || []).map((h) => String(h.id)));
        const removed = new Set((v.removedHeroes || []).map((h) => String(h.id)));
        for (const hid of added) chk(!base.has(hid), `${vt}：addedHeroes 里的 ${hid} 本来就在原阵容里`);
        for (const hid of removed) chk(base.has(hid), `${vt}：removedHeroes 里的 ${hid} 不在原阵容里`);
        for (const hid of added) chk(!removed.has(hid), `${vt}：${hid} 同时出现在 addedHeroes 和 removedHeroes`);
        const expect = new Set([...baseIds.filter((h) => !removed.has(h)), ...added]);
        chk(expect.size === ids.length && ids.every((h) => expect.has(h)),
          `${vt}.heroes 与 addedHeroes / removedHeroes 对不上`);
        chk(isInt(v.count) && v.count >= 0, `${vt}.count 必须是非负整数`);
        if (isInt(v.count) && isInt(st?.count)) chk(v.count <= st.count, `${vt}.count ${v.count} 大于本条阵容的 stats.count ${st.count}`);
        for (const k of ['appearanceRate', 'firstRate', 'top3Rate', 'similarity']) {
          chk(isNum(v[k]) && v[k] >= 0 && v[k] <= 1, `${vt}.${k} 必须是 0~1 的数字`);
        }
        chk(isNum(v.avgPlacement) && v.avgPlacement > 1 && v.avgPlacement < 7,
          `${vt}.avgPlacement 必须在 1 和 7 之间，实际 ${v.avgPlacement}`);
      }
    }

    // 来源字段
    chk(isStr(r?.source) && r.source.startsWith('http'), `${tag}：source 必须是 URL`);
    chk(isStr(r?.sourcePage) && r.sourcePage.startsWith('http'), `${tag}：sourcePage 必须是 URL`);
    chk(isStr(r?.fetchedAt) && !Number.isNaN(Date.parse(r.fetchedAt)), `${tag}：fetchedAt 不是合法时间`);
    chk(r?.version === doc?.version, `${tag}：version 必须与文件级 version 一致`);
    chk(isInt(r?.sourceSeasonId), `${tag}：sourceSeasonId 必须是整数`);
    chk(isInt(r?.seasonIdRaw), `${tag}：seasonIdRaw 必须是整数`);
    chk(r?.sourceSeasonId === r?.seasonIdRaw, `${tag}：sourceSeasonId 与 seasonIdRaw 必须同值（都按官方原值存）`);
    chk(typeof r?.crossSeason === 'boolean', `${tag}：crossSeason 必须是布尔`);
    if (cols.length === 1 && (cols[0] === 'general' || cols[0] === 'hot')) {
      chk(r?.seasonIdRaw === 0, `${tag}：general/hot 的 seasonIdRaw 实测为 0，请核对`);
    }
    if (cols.length === 1 && cols[0] === 'beginner') {
      chk(r?.seasonIdRaw === 1, `${tag}：beginner 的 seasonIdRaw 实测为 1，请核对`);
    }
    // beginner 全是官方预置阵容：stats 官网不提供，四项必须全 null，不许补占位数
    if (cols.includes('beginner')) {
      chk(r?.isPreset === true, `${tag}：beginner 记录必须带 isPreset: true`);
      for (const f of ['avgRank', 'pickRate', 'difficulty', 'equipRate']) {
        chk(st && f in st ? st[f] === null : false, `${tag}.stats.${f}：beginner 记录必须为 null`);
      }
    } else {
      chk(!r?.isPreset, `${tag}：非 beginner 记录不应带 isPreset`);
    }
  });

  // 快照里的计数必须和 records 实际内容一致：部分抓取只写了一半时这里会失败。
  const withStats = list.filter((r) => r?.stats?.source === 'datawxq.com').length;
  const withVariants = list.filter((r) => Array.isArray(r?.variants)).length;
  const variantsTotal = list.reduce((s, r) => s + (Array.isArray(r?.variants) ? r.variants.length : 0), 0);
  if (isInt(statsSnap?.recordsFilled)) {
    chk(statsSnap.recordsFilled === withStats, `comps.json.statsSnapshot.recordsFilled=${statsSnap.recordsFilled}，实际带 stats 的记录 ${withStats} 条`);
  }
  if (isInt(varSnap?.recordsFilled)) {
    chk(varSnap.recordsFilled === withVariants, `comps.json.variantsSnapshot.recordsFilled=${varSnap.recordsFilled}，实际带 variants 的记录 ${withVariants} 条`);
  }
  if (isInt(varSnap?.recordsWithVariants)) {
    chk(varSnap.recordsWithVariants === withVariants, `comps.json.variantsSnapshot.recordsWithVariants=${varSnap.recordsWithVariants}，实际带 variants 的记录 ${withVariants} 条`);
  }
  if (isInt(varSnap?.variantsTotal)) {
    chk(varSnap.variantsTotal === variantsTotal, `comps.json.variantsSnapshot.variantsTotal=${varSnap.variantsTotal}，实际变阵 ${variantsTotal} 条`);
  }
  if (unknownVariantNames.size) {
    notes.push(`变阵里出现 heroes.json 未收录的英雄：${[...unknownVariantNames].join('、')}（按原文渲染，请核对是否官方新牌）`);
  }

  // 分组统计：按 (column, seasonIdRaw) 分组，禁止跨组计算
  const groups = {};
  for (const r of list) {
    for (const c of r.column || []) {
      const k = `${c}|seasonIdRaw=${r.seasonIdRaw}`;
      groups[k] = (groups[k] || 0) + 1;
    }
  }
  notes.push('分组计数 ' + JSON.stringify(groups));

  // beginner 样本不足，报告里必须写明
  const beginner = (list.length && groups['beginner|seasonIdRaw=1']) || 0;
  if (beginner > 0) notes.push(`beginner 只有 ${beginner} 条（另一页 pro_2 返回 404），样本不足，暂不作为基准`);
}

// ---- 输出 ----
// info 级提示：不计数、不影响退出码。
if (lordCount !== null) notes.push(`data/lords.json 当前 ${lordCount} 条；卡池版本升级请同步`);
for (const n of notes) console.log('note:', n);
if (problems.length === 0) {
  console.log('data/ 校验通过：0 个问题');
  process.exit(0);
}
console.log(`data/ 校验失败：${problems.length} 个问题`);
for (const p of problems) console.log(' -', p);
process.exit(1);
