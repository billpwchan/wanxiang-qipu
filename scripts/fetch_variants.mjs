// 抓 datawxq.com 的变阵（variants），只抓已经拿到统计数据的阵容。
// 用法：node scripts/fetch_variants.mjs [--out <json>] [--gap 2500] [--max-retry 4] [--proxy http://127.0.0.1:7890]
//
// 签名由页面自己算：脚本在 Runtime.evaluate 里 import 页面已经加载的 seo 模块，
// 调用它导出的请求封装（内部生成 t/did/nonce/signature）。
// 不要在 Node 里重放请求头 —— nonce 一次性，重放必返 42000。
//
// 只读：不写 data/ 下任何文件。输出默认落 snapshots/probe-variants/fetch-variants.json（已 gitignore）。
import { spawn, spawnSync } from 'node:child_process';
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

const USAGE = 'usage: node scripts/fetch_variants.mjs [--out <json>] [--gap <ms>] [--max-retry <n>] [--proxy <url>]';
const opts = {
  out: path.join(ROOT, 'snapshots', 'probe-variants', 'fetch-variants.json'),
  gap: 2500,
  maxRetry: 4,
  proxy: '',
};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error(USAGE);
        process.exit(2);
      }
      opts.out = path.resolve(v);
    } else if (a === '--proxy') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        console.error(USAGE);
        process.exit(2);
      }
      opts.proxy = v;
    } else if (a === '--gap' || a === '--max-retry') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) {
        console.error(USAGE);
        process.exit(2);
      }
      if (a === '--gap') opts.gap = v;
      else opts.maxRetry = v;
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
const DETAIL_PATH = '/wzwxq/lineups/detail';

// rosterKey：<英雄数>|<id 字符串升序>，与 datawxq 的 lineupKey / rosterKey 同构。
const rosterKeyOf = (heroList) => [heroList.length, ...heroList.map((h) => String(h.id)).sort()].join('|');

const compsPath = path.join(ROOT, 'data', 'comps.json');
const comps = JSON.parse(fs.readFileSync(compsPath, 'utf8'));

// 只抓已经有 datawxq 统计的阵容：没统计的连样本都不够，变阵更不会有。
const targets = new Map(); // rosterKey -> 记录数
for (const r of comps.records) {
  if (r?.stats?.source !== DWXQ_SOURCE) continue;
  const k = rosterKeyOf(r.heroList || []);
  targets.set(k, (targets.get(k) || 0) + 1);
}
if (!targets.size) {
  console.error('data/comps.json 里没有 stats.source === "datawxq.com" 的记录，先跑 fetch_stats.mjs + merge_stats.mjs');
  process.exit(1);
}

const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('找不到 Chrome，可用 CHROME_PATH 指定');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9000 + Math.floor(Math.random() * 700);
// 固定 profile：localStorage 里的 wxq-device-id（did）会保留下来，重跑时还是同一台设备，
// 不会每次都当新访客重新握手。
const userDataDir = path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'wx-variants-profile');
const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--lang=zh-CN',
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--window-size=1600,2400',
  // 指定代理时整页流量走它；本地回环（CDP）除外，否则命令行连不上浏览器。
  ...(opts.proxy ? [`--proxy-server=${opts.proxy}`, '--proxy-bypass-list=<-loopback>'] : []),
  'about:blank',
], { stdio: 'ignore', detached: process.platform !== 'win32' });

// 收尾只走这一处：正常结束、任意报错、Ctrl-C 都要把 Chrome 收掉。
// Windows 用 taskkill /T 收进程树；其余平台靠 detached 进程组按负 PID 收。
let chromeKilled = false;
const killChrome = () => {
  if (chromeKilled) return;
  chromeKilled = true;
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    if (r.error) console.error(`taskkill 失败：${r.error.message}`);
    else if (r.status !== 0 && r.status !== 128) console.error(`taskkill 退出码 ${r.status}`);
    return;
  }
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try { proc.kill(); } catch { /* 已经退出 */ }
  }
};
proc.on('error', (e) => {
  console.error(`spawn 失败：${e.message}`);
  killChrome();
  process.exit(1);
});
process.on('exit', killChrome);
process.on('SIGINT', () => { killChrome(); process.exit(130); });
process.on('SIGTERM', () => { killChrome(); process.exit(143); });
process.on('uncaughtException', (e) => { console.error(e); killChrome(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); killChrome(); process.exit(1); });

let targetsList = null;
for (let i = 0; i < 120 && !targetsList; i++) {
  try {
    targetsList = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    await sleep(250);
  }
}
if (!targetsList) {
  killChrome();
  console.error('Chrome 没起来');
  process.exit(1);
}

const ws = new WebSocket(targetsList.find((t) => t.type === 'page').webSocketDebuggerUrl);
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    return { __exc: String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || '').slice(0, 400) };
  }
  return r.result?.result?.value;
};

const shutdown = (code) => {
  try { ws.close(); } catch {}
  killChrome();
  process.exit(code);
};

await send('Page.enable');
await send('Runtime.enable');

// 挂钩 fetch，记下页面自己发出的 search 请求体，作为 detail 的模板（version / time 等跟页面一致）。
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
window.__wxqSearchBody = '';
(() => {
  const orig = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (url && url.includes('/wzwxq/lineups/search') && init && init.body) {
      window.__wxqSearchBody = String(init.body);
    }
    return orig.apply(this, arguments);
  };
})();
`,
});

console.log('targets:', targets.size, '个 rosterKey（取自 stats.source === "datawxq.com" 的记录）');

await send('Page.navigate', { url: 'https://www.datawxq.com/lineups' });
await sleep(15000);

const searchBodyRaw = await ev('window.__wxqSearchBody || ""');
let base = null;
try {
  base = JSON.parse(searchBodyRaw);
} catch {}
if (!base) {
  console.error('页面没有发出 /wzwxq/lineups/search，拿不到请求模板（站点可能整体异常）');
  shutdown(1);
}
delete base.page;
delete base.lineupKey;
if (base.version !== 'v261112') {
  console.error(`页面请求模板的 version 是 ${JSON.stringify(base.version)}，不是 v261112。站点改版了，先确认口径再跑。`);
  shutdown(1);
}

// seo 模块的 URL 会随发布变（index-Bw-LrfrL.js 里的 hash）。从已加载资源里找带签名逻辑的那个。
const modulePath = await ev(`(async () => {
  const urls = performance.getEntriesByType('resource').map((e) => e.name)
    .filter((n) => n.indexOf('/assets/') >= 0 && n.indexOf('.js') >= 0);
  for (const u of urls) {
    try {
      const p = new URL(u).pathname;
      const t = await (await fetch(p)).text();
      if (t.includes('wxq-device-id') && t.includes('/wzwxq/lineups/detail')) return p;
    } catch {}
  }
  return '';
})()`);
if (typeof modulePath !== 'string' || !modulePath) {
  console.error('没找到页面里的签名模块（assets/*.js 里没有 wxq-device-id）');
  shutdown(1);
}
console.log('signer module:', modulePath);

// 在页面上下文里调它导出的 fetch 封装；dz 是 gs 的导出名，会自己生成 t/did/nonce/signature。
const callDetail = async (rosterKey) => {
  const body = { ...base, page: 1, pageSize: 12, lineupKey: rosterKey, detailSections: ['ordinary'] };
  const out = await ev(`(async () => {
    try {
      const m = await import(${JSON.stringify(modulePath)});
      const d = await m.dz(${JSON.stringify(DETAIL_PATH)}, { method: 'POST', body: ${JSON.stringify(body)} });
      return JSON.stringify({ ok: true, data: d });
    } catch (e) {
      return JSON.stringify({ ok: false, err: String(e && e.message || e) });
    }
  })()`);
  if (out && typeof out === 'object' && out.__exc) return { ok: false, err: out.__exc };
  try {
    return JSON.parse(out);
  } catch {
    return { ok: false, err: `evaluate 返回值异常: ${String(out).slice(0, 200)}` };
  }
};

const isBlocked = (err) => /系统异常|42000|请求参数异常/.test(String(err || ''));
const isTooFew = (err) => /样本过少/.test(String(err || ''));

// 抓取阶段只挑字段、不造值：缺什么就留缺，缺字段由 merge_variants.mjs 报错，不在这里补 null。
const VARIANT_KEYS = ['lineupKey', 'lineupCode', 'heroes', 'addedHeroes', 'removedHeroes',
  'count', 'appearanceRate', 'avgPlacement', 'firstRate', 'top3Rate', 'similarity'];

const pickVariant = (v) => {
  const out = {};
  for (const k of VARIANT_KEYS) if (v && k in v) out[k] = v[k];
  return out;
};

const items = [];
const failures = [];
let blockedStreak = 0;
let requestCount = 0;

const keys = [...targets.keys()];

// 先探一次：站点把本机 IP 拒了的时候（42000），逐个重试只是白等。探不通就早退，别烧时间。
// 探通了就当成第一个 key 的结果，不再重复请求。
let firstRes = null;
for (let probe = 1; probe <= 3; probe++) {
  requestCount++;
  const r = await callDetail(keys[0]);
  if (!isBlocked(r.err)) {
    firstRes = r;
    break;
  }
  if (probe === 3) {
    console.log('探针仍被拒：', String(r.err).slice(0, 120));
    console.log('站点对本机 IP 还在限流（42000）。等恢复后再跑，别加频率。');
    shutdown(1);
  }
  console.log(`探针被拒（${probe}/3），30s 后重试`);
  await sleep(30000);
}

for (let idx = 0; idx < keys.length; idx++) {
  const key = keys[idx];
  let res = firstRes;
  firstRes = null;
  for (let attempts = 1; !res && attempts <= opts.maxRetry; attempts++) {
    requestCount++;
    res = await callDetail(key);
    if (res.ok) break;
    if (isTooFew(res.err)) break;
    if (isBlocked(res.err)) {
      if (attempts === opts.maxRetry) break;
      const wait = Math.min(15000 * attempts, 120000);
      console.log(`  [${idx + 1}/${keys.length}] 被封/异常，${Math.round(wait / 1000)}s 后重试（${attempts}/${opts.maxRetry}）`);
      await sleep(wait);
      res = null;
      continue;
    }
    break;
  }

  if (res && res.ok) {
    blockedStreak = 0;
    const d = res.data || {};
    const variants = (d.variants || []).map(pickVariant);
    items.push({ rosterKey: key, variantCount: d.variantCount ?? null, variants });
    console.log(`  [${idx + 1}/${keys.length}] ${key} → variants ${variants.length}（声明 ${d.variantCount ?? '?'}）`);
  } else if (res && isTooFew(res.err)) {
    blockedStreak = 0;
    items.push({ rosterKey: key, variantCount: 0, variants: [] });
    console.log(`  [${idx + 1}/${keys.length}] ${key} → 无数据（${res.err}）`);
  } else {
    failures.push({ rosterKey: key, err: String(res?.err || 'unknown') });
    console.log(`  [${idx + 1}/${keys.length}] ${key} → 失败：${String(res?.err || '').slice(0, 120)}`);
    if (isBlocked(res?.err)) blockedStreak++;
    else blockedStreak = 0;
    if (blockedStreak >= 3) {
      console.log('连续 3 个都被站点拒绝，停止。已抓到的先落盘。');
      break;
    }
  }
  if (idx < keys.length - 1) await sleep(opts.gap);
}

const covered = items.filter((i) => i.variants.length > 0).length;
const payload = {
  source: DWXQ_SOURCE,
  endpoint: `https://api.datatft.com${DETAIL_PATH}`,
  fetchedAt: new Date().toISOString(),
  query: base,
  queryNote: '请求体由页面自己的签名封装发出（seo 模块导出的 gs/dz）；签名与 nonce 绑定，无法在 Node 里重放。',
  requested: keys.length,
  succeeded: items.length,
  withVariants: covered,
  failed: failures.length,
  requestCount,
  items,
  failures,
};

fs.mkdirSync(path.dirname(opts.out), { recursive: true });
fs.writeFileSync(opts.out, JSON.stringify(payload, null, 1) + '\n', 'utf8');

console.log('out:', path.relative(ROOT, opts.out) || opts.out);
console.log('rosterKeys:', keys.length, '有变阵:', covered, '失败:', failures.length, '请求次数:', requestCount);
console.log('bytes:', fs.statSync(opts.out).size);

shutdown(failures.length && !items.length ? 1 : 0);
