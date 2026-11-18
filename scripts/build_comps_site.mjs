// 把 data/comps.json 裁成前端直接读的 site/dist/data/comps.json。
// 用法：node scripts/build_comps_site.mjs
//
// 只搬运和裁字段：
//   - 英雄只留名字（前端拿名字去 cards.json 取图标），id、势力、文本全丢。
//   - stats 只留数字，只认 stats.source === "datawxq.com"；其他来源或没有统计的一律 null，不补 0。
//   - variants 原样照搬核心字段；null 表示没抓过，[] 表示查过确实没变阵，两者不混。
//   - 不改数值、不四舍五入、不剔记录、不重排（顺序就是 data/comps.json 的顺序）。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'data', 'comps.json');
const CARDS = path.join(ROOT, 'site', 'dist', 'data', 'cards.json');
const FACTS = path.join(ROOT, 'site', 'dist', 'data', 'facts.js');
const OUT = path.join(ROOT, 'site', 'dist', 'data', 'comps.json');
const MAX_BYTES = 50 * 1024;
const DWXQ_SOURCE = 'datawxq.com';

if (!fs.existsSync(SRC)) {
  console.error(`找不到 ${path.relative(ROOT, SRC)}`);
  process.exit(1);
}

const comps = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const cards = JSON.parse(fs.readFileSync(CARDS, 'utf8'));
const { FACTS: facts } = await import(pathToFileURL(FACTS).href);
const heroNames = new Set((cards.heroes || []).map((h) => h.name));
// 棋手图标来自 facts.js（app.js 的 lordIcon 就查这里）；cards.json 里的 lords 没有 icon 字段。
const lordIcons = new Set(Object.keys(facts.lords || {}));

const namesOf = (list, tag) =>
  (list || []).map((h) => {
    const name = typeof h === 'string' ? h : h?.name;
    if (!name) throw new Error(`${tag}：英雄项没有 name（${JSON.stringify(h)}）`);
    return name;
  });

const intOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// rosterKey：<英雄数>|<英雄 id 字符串升序>，和 scripts/fetch_stats.mjs、fetch_variants.mjs 同一套构造，
// datawxq 的统计就是按它对齐的。前端靠它把「同一套英雄、不同阵容码」的记录去重成一行。
const rosterKeyOf = (heroList, tag) => {
  const list = heroList || [];
  if (!list.length) throw new Error(`${tag}：heroList 为空，没法算 rosterKey`);
  const ids = list.map((h) => {
    if (!h?.id) throw new Error(`${tag}：英雄项没有 id，没法算 rosterKey（${JSON.stringify(h)}）`);
    return String(h.id);
  });
  return [ids.length, ...ids.sort()].join('|');
};

// 阵容名来自社区，个别带 \r（换行残留）。只清控制字符和首尾空白，不改文字。
const cleanName = (s) => String(s).replace(/[\r\n]/g, '').trim();

const records = [];
const unknownBase = new Set(); // 阵容本体里的英雄，卡片上要显示图标，对不上就是硬错
const unknownVariant = new Set(); // 只在变阵里出现的英雄，文字列表照样能读，只提示
const unknownLords = new Set();
let withStats = 0;
let withVariants = 0;
let variantsTotal = 0;

for (const r of comps.records || []) {
  const tag = `lineupCode ${r.lineupCode}`;
  if (!r.lineupCode) throw new Error(`${tag}：缺 lineupCode`);
  if (!r.name) throw new Error(`${tag}：缺 name`);

  const heroes = namesOf(r.heroList, tag);
  for (const n of heroes) if (!heroNames.has(n)) unknownBase.add(n);
  const lords = namesOf(r.lords, tag);
  for (const n of lords) if (!lordIcons.has(n)) unknownLords.add(n);

  // 只认 datawxq 的统计：其他来源口径不同，混在一起前端没法解释。
  let st = null;
  if (r.stats && r.stats.source === DWXQ_SOURCE) {
    st = {
      a: numOrNull(r.stats.appearanceRate),
      m: numOrNull(r.stats.avgPlacement),
      f: numOrNull(r.stats.firstRate),
      t: numOrNull(r.stats.top3Rate),
      n: intOrNull(r.stats.count),
      v: intOrNull(r.stats.variantCount),
    };
    // 登场率和平均名次是页面上要显示的两个数，缺了就当没有统计，不要拿 null 当 0 渲染。
    if (st.a === null || st.m === null || st.n === null) st = null;
    else withStats++;
  }

  let vars = null;
  if (Array.isArray(r.variants)) {
    vars = r.variants.map((v, i) => {
      const vtag = `${tag} 变阵#${i}`;
      const add = namesOf(v.addedHeroes, vtag);
      const rem = namesOf(v.removedHeroes, vtag);
      for (const n of add.concat(rem)) if (!heroNames.has(n)) unknownVariant.add(n);
      return {
        add,
        rem,
        n: intOrNull(v.count),
        ar: numOrNull(v.appearanceRate),
        m: numOrNull(v.avgPlacement),
      };
    });
    if (vars.length) {
      withVariants++;
      variantsTotal += vars.length;
    }
  }

  records.push({
    code: r.lineupCode,
    name: cleanName(r.name),
    rosterKey: rosterKeyOf(r.heroList, tag),
    col: Array.isArray(r.column) ? r.column : [],
    preset: !!r.isPreset,
    heroes,
    lords,
    st,
    vars,
  });
}

// 阵容本体的英雄对不上 cards.json 就是硬错：卡片上会渲染成空图标，不能让它在页面上悄悄烂掉。
if (unknownBase.size) {
  console.error('这些英雄名在 site/dist/data/cards.json 里找不到（阵容本体）：', [...unknownBase].join('、'));
  process.exit(1);
}
// 只在变阵里出现的英雄可以没图标：名字照存，前端在文字列表里显示，不剔数据。
if (unknownVariant.size) {
  console.warn('提示：这些变阵英雄在 cards.json 里没有（只在文字里出现，不剔）：', [...unknownVariant].join('、'));
}
// 武凤、安琪拉 这类棋手本来就没图标，前端走文字兜底，这里只提示。
if (unknownLords.size) {
  console.warn('提示：这些棋手没有图标，前端走文字兜底：', [...unknownLords].join('、'));
}

const out = {
  meta: {
    total: records.length,
    withStats,
    withVariants,
    variantsTotal,
    statsSource: DWXQ_SOURCE,
    // 统计口径取抓取时接口自己返回的 statisticsScope（当前是 allPlayers）。
    // 接口没有给时间窗口，页面上就不要写「近 N 天」。
    statsScope: comps.statsSnapshot?.statisticsScope ?? null,
    // 没有图标的棋手 / 只出现在变阵里的新牌：如实登记，前端走文字兜底，不剔数据也不假装有图。
    missing: {
      lords: [...unknownLords],
      heroes: [...unknownVariant],
    },
    note: '数组顺序与 data/comps.json 一致；rosterKey 是「英雄数|英雄 id 升序」，同一套英雄的不同阵容码会得到同一个值，前端靠它去重排榜；name 已去掉 \\r\\n 并 trim；st 为 null 表示没有该来源的统计，不是 0；vars 为 null 表示没抓过变阵，[] 表示查过确实没有。',
  },
  records,
};

const text = JSON.stringify(out) + '\n';
const bytes = Buffer.byteLength(text, 'utf8');
if (bytes > MAX_BYTES) {
  console.error(`输出 ${bytes} 字节，超过 ${MAX_BYTES} 上限。先看是哪部分涨了，别靠删字段硬压。`);
  process.exit(1);
}
fs.writeFileSync(OUT, text, 'utf8');

console.log('records:', records.length, '有统计:', withStats, '有变阵:', withVariants, '变阵总数:', variantsTotal);
console.log('written:', path.relative(ROOT, OUT), 'bytes:', bytes, `(上限 ${MAX_BYTES})`);
