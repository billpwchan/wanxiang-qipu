// 抓 datawxq.com 的阵容统计数据（按 rosterKey 对齐 data/comps.json）。
// 用法：node scripts/fetch_stats.mjs [--out <json>] [--max-pages 40]
//
// 签名由浏览器自己算：本脚本不开新请求，只挂钩页面的 window.fetch 收集
// /wzwxq/lineups/search 的响应，再靠滚动触发列表分页，直到拿全。
// 不要在 Node 里重放抓到的 t/did/nonce/signature —— nonce 一次性，重放必失败。
//
// 只读：不写 data/ 下任何文件。输出默认落 snapshots/probe-stats/search-stats.json（已 gitignore）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const USAGE = 'usage: node scripts/fetch_stats.mjs [--out <json>] [--max-pages 40]';
const opts = { out: path.join(ROOT, 'snapshots', 'probe-stats', 'search-stats.json'), maxPages: 40 };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '--max-pages') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error(USAGE);
        process.exit(2);
      }
      opts[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}\n${USAGE}`);
      process.exit(2);
    }
  }
}
const MAX_PAGES = Number(opts.maxPages);

const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('找不到 Chrome，可用 CHROME_PATH 指定');
  process.exit(1);
}

const rosterKey = (heroList) => [heroList.length, ...heroList.map((h) => String(h.id)).sort()].join('|');

const compsPath = path.join(ROOT, 'data', 'comps.json');
const comps = JSON.parse(fs.readFileSync(compsPath, 'utf8'));
const wanted = new Map(); // rosterKey -> 记录数
for (const r of comps.records) {
  const k = rosterKey(r.heroList);
  wanted.set(k, (wanted.get(k) || 0) + 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9000 + Math.floor(Math.random() * 900);
const userDataDir = path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', `wx-stats-${port}`);
const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--lang=zh-CN',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1600,2400', 'about:blank',
], { stdio: 'ignore' });

let targets = null;
for (let i = 0; i < 120 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    await sleep(250);
  }
}
if (!targets) {
  proc.kill();
  console.error('Chrome 没起来');
  process.exit(1);
}

const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let msgId = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++msgId;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');

// 挂钩 fetch：页面自己发请求、自己签名，我们只收响应体。
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
window.__wxqCap = [];
(() => {
  const orig = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    const p = orig.apply(this, arguments);
    if (url && url.includes('/wzwxq/lineups/search')) {
      p.then((res) => res.clone().text().then((text) => {
        let json = null;
        try { json = JSON.parse(text); } catch {}
        window.__wxqCap.push({
          at: new Date().toISOString(),
          body: String((init && init.body) || ''),
          status: res.status,
          json,
        });
      })).catch(() => {});
    }
    return p;
  };
})();
`,
});

await send('Page.navigate', { url: 'https://www.datawxq.com/lineups' });
await sleep(15000);

// 页面把 minimumCount 固定在「最小 50 场」，会漏掉场次少的阵容。
// 通过 UI 选「最小 10 场」——签名由页面自己算，我们只点选。
const picked = await ev(`(() => {
  const sel = [...document.querySelectorAll('.el-select')].find((x) => /最小/.test(x.innerText));
  if (!sel) return 'no-select';
  sel.click();
  return 'opened';
})()`);
await sleep(1500);
const opt = await ev(`(() => {
  const o = [...document.querySelectorAll('.el-select-dropdown__item')].find((x) => /最小\\s*10\\s*场/.test(x.innerText));
  if (!o) return 'no-option';
  o.click();
  return 'clicked';
})()`);
await sleep(6000);
console.log('minimumCount filter:', picked, opt);
if (opt !== 'clicked') {
  ws.close();
  proc.kill();
  console.error('没能把最小场次降到 10，页面结构可能变了');
  process.exit(1);
}

const collect = async () =>
  JSON.parse(await ev('JSON.stringify(window.__wxqCap || [])') || '[]');

let caps = await collect();
if (!caps.length) {
  ws.close();
  proc.kill();
  console.error('页面没有发出 /wzwxq/lineups/search 请求');
  process.exit(1);
}

const fail = caps.find((c) => !c.json || c.json.success !== true);
if (fail) {
  ws.close();
  proc.kill();
  console.error('接口返回失败：', JSON.stringify(fail.json || { status: fail.status }));
  console.error('（签名重放不可行；这是站点对本机/IP 的拒绝，等它恢复再跑）');
  process.exit(1);
}

// 记下页面实际使用的查询参数（minimumCount 等），写进输出便于复核
const actualQuery = (() => {
  try {
    return JSON.parse(caps[0].body);
  } catch {
    return null;
  }
})();

// 滚动触发分页，直到拿全 total 或连续多轮没有新增。
const seenPages = new Set();
const readPages = () => {
  const pages = [];
  for (const c of caps) {
    const d = c.json?.data;
    if (!d) continue;
    const key = `${d.page}`;
    if (seenPages.has(key) && !d.lineups?.length) continue;
    pages.push({ page: d.page, lineups: d.lineups || [], total: d.total, sampleCount: d.sampleCount, scope: d.statisticsScope });
  }
  return pages;
};

let stableRounds = 0;
let lastCount = 0;
for (let i = 0; i < 60; i++) {
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /加载更多|继续下滑/.test(b.innerText));
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return 'btn'; }
    window.scrollTo(0, document.body.scrollHeight);
    return 'scroll';
  })()`);
  await sleep(2500);
  caps = await collect();
  const lineups = new Map();
  for (const c of caps) for (const l of c.json?.data?.lineups || []) lineups.set(l.rosterKey, l);
  const total = caps[0]?.json?.data?.total ?? null;
  const pagesSeen = caps.length;
  if (lineups.size === lastCount) stableRounds++;
  else stableRounds = 0;
  lastCount = lineups.size;
  console.log(`round ${i + 1}: pages=${pagesSeen} lineups=${lineups.size}/${total ?? '?'} matches=${[...lineups.keys()].filter((k) => wanted.has(k)).length}/${wanted.size}`);
  if (total !== null && lineups.size >= total) break;
  if (pagesSeen >= MAX_PAGES) break;
  if (stableRounds >= 4) break;
}

const merged = new Map();
let meta = {};
for (const c of caps) {
  const d = c.json?.data;
  if (!d) continue;
  meta = { groupingMode: d.groupingMode, statisticsScope: d.statisticsScope, sampleCount: d.sampleCount, total: d.total };
  for (const l of d.lineups || []) merged.set(l.rosterKey, l);
}

const matched = [...merged.keys()].filter((k) => wanted.has(k));
const coveredRecords = matched.reduce((n, k) => n + wanted.get(k), 0);

const payload = {
  source: 'datawxq.com',
  endpoint: 'https://api.datatft.com/wzwxq/lineups/search',
  fetchedAt: new Date().toISOString(),
  query: actualQuery || {
    groupingMode: 'rosterSimilarity', version: 'v261112', gameType: '2', time: 7,
    operator: 'AND', advancedMode: false, filters: [], exclusions: [],
    minimumCount: 10, sortBy: 'appearanceRate',
  },
  queryNote: '请求体由页面发出（最小场次经 UI 选到 10 场）；签名与请求体绑定且 nonce 一次性，无法在 Node 里改参数重发。',
  ...meta,
  coverage: {
    compsRecords: comps.records.length,
    compsRosterKeys: wanted.size,
    lineupsFetched: merged.size,
    rosterKeysMatched: matched.length,
    compsRecordsCovered: coveredRecords,
  },
  lineups: [...merged.values()],
};

fs.mkdirSync(path.dirname(opts.out), { recursive: true });
fs.writeFileSync(opts.out, JSON.stringify(payload, null, 1) + '\n', 'utf8');

ws.close();
proc.kill();

console.log('out:', path.relative(ROOT, opts.out) || opts.out);
console.log('lineups:', merged.size, 'rosterKeys matched:', `${matched.length}/${wanted.size}`, 'comps records covered:', `${coveredRecords}/${comps.records.length}`);
console.log('bytes:', fs.statSync(opts.out).size);
