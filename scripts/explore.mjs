// datawxq 大数据检索器的批量查询（浏览公开页面、模拟点击，不调用其签名接口）。
// node scripts/explore.mjs queries.json out.json
// queries.json: [{ "id": "hanxin", "all": ["韩信"], "none": ["雅典娜"], "tabs": ["英雄", "天赋牌"] }, ...]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [qfile, ofile] = process.argv.slice(2);
const queries = JSON.parse(readFileSync(qfile, 'utf8'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9100 + Math.floor(Math.random() * 90);
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/wx-explore-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info; for (let i = 0; i < 50 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(info.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const call = async (fn, ...args) => (await send('Runtime.evaluate', { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, returnByValue: true, awaitPromise: true })).result.result.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });

async function typeKeys(text) { await send('Input.insertText', { text }); }

async function addCondition(spec, exclude) {
  const [name, kind] = spec.split('@');
  if (exclude) {
    await call(() => { const b = [...document.querySelectorAll('button')].find((x) => /添加排除条件|排除/.test(x.innerText)); b?.click(); return !!b; });
    await sleep(400);
  }
  // 聚焦最后一个条件搜索框
  const ok = await call(() => {
    const sels = [...document.querySelectorAll('.condition-search .el-select__wrapper')];
    const w = sels[sels.length - 1];
    if (!w) return false;
    w.click();
    const inp = w.querySelector('input'); inp?.focus();
    return true;
  });
  if (!ok) return 'no-input';
  await sleep(300);
  await typeKeys(name);
  await sleep(1300);
  return call((name, kind) => {
    const opts = [...document.querySelectorAll('.condition-search-option, .condition-search-popper .el-select-dropdown__item')].filter((o) => o.offsetParent);
    const fit = (o) => !kind || o.innerText.includes(kind);
    const exact = opts.find((o) => o.innerText.trim().split(/\s|\n/)[0] === name && fit(o)) || opts.find((o) => o.innerText.includes(name) && fit(o));
    if (!exact) return 'no-option:' + opts.map((o) => o.innerText.trim().slice(0, 12)).slice(0, 8).join(',');
    (exact.closest('.el-select-dropdown__item') || exact).click();
    return 'ok';
  }, name, kind);
}

function readSummary() {
  const t = document.querySelector('.explorer-results')?.innerText || '';
  const num = (label) => { const m = t.match(new RegExp(label + '\\s*\\n?\\s*([\\d.]+)%?')); return m ? parseFloat(m[1]) : null; };
  return { games: num('场次'), avg: num('平均名次'), win: num('登顶率'), top3: num('前三率') };
}
function readTable() {
  const head = [...document.querySelectorAll('.dimension-panel .el-table__header th')].map((th) => th.innerText.trim());
  const rows = [...document.querySelectorAll('.dimension-panel .el-table__body tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()));
  return { head, rows };
}
async function openTab(name) {
  const r = await call((name) => { const t = [...document.querySelectorAll('.dimension-tabs .el-tabs__item')].find((x) => x.innerText.trim() === name); t?.click(); return !!t; }, name);
  await sleep(1800);
  return r;
}

const out = [];
for (const q of queries) {
  await send('Page.navigate', { url: 'https://www.datawxq.com/explorer' }); await sleep(8000);
  const log = [];
  for (const n of q.all || []) log.push(n + ':' + await addCondition(n, false));
  for (const n of q.none || []) log.push('非' + n + ':' + await addCondition(n, true));
  await call(() => document.body.click()); await sleep(2500);
  const res = { id: q.id, all: q.all || [], none: q.none || [], log, summary: await call(readSummary), tabs: {} };
  for (const t of q.tabs || ['英雄']) {
    await openTab(t);
    res.tabs[t] = await call(readTable);
  }
  out.push(res);
  console.log(q.id, JSON.stringify(res.summary), log.join(' '));
  writeFileSync(ofile, JSON.stringify(out, null, 1));
}
ws.close(); proc.kill();
