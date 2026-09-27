import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
// 读取 datawxq.com 公开页面（像普通访客一样浏览，不调用其签名接口），保存棋手榜与阵容榜（全部 + 每个禁用阵营）。
// node scripts/fetch_meta.mjs  → research/v2/datawxq-<日期>/ ，之后 python3 scripts/build_meta.py
import { mkdirSync } from 'node:fs';
const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outDir = process.argv[2] || new URL(`../research/v2/datawxq-${day}`, import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 90);
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/wx-bans2-' + port, 'about:blank'], { stdio: 'ignore' });
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

function extract() {
  const attr = (el) => el ? (el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('aria-label') || el.innerText || '').trim() : '';
  return [...document.querySelectorAll('.lineups-card')].map((c) => ({
    title: c.querySelector('.lineups-card__title')?.innerText.replace(/\n+/g, ' ').trim(),
    commanders: [...c.querySelectorAll('.lineups-card__commander')].map((x) => (attr(x.querySelector('img')) || attr(x)) + ' ' + x.innerText.replace(/\n+/g, ' ').trim()),
    units: [...c.querySelectorAll('.lineups-unit')].map((u) => ({ name: attr(u.querySelector('img')) || u.innerText.trim(), awakened: !!u.querySelector('.is-awakened'), items: [...u.querySelectorAll('.lineups-unit__items img')].map(attr) })),
    metrics: c.querySelector('.lineups-card__metrics')?.innerText.replace(/\n+/g, ' ').trim(),
    meta: c.innerText.match(/\d 人阵容[^\n]*/)?.[0],
  }));
}
function pickFaction(fac) {
  document.querySelector('.lineups-filter-trigger--faction').click();
  return new Promise((res) => setTimeout(() => {
    const grid = document.querySelector('.lineups-picker__grid--factions');
    if (!grid) return res('no-grid');
    const opts = [...grid.querySelectorAll('button, [role=button], div, span')].filter((e) => e.children.length <= 2);
    const t = opts.find((e) => (e.innerText || e.getAttribute('aria-label') || '').trim().startsWith(fac));
    if (!t) return res('no-opt:' + [...new Set(opts.map((e) => e.innerText.trim()))].slice(0, 20).join(','));
    t.click();
    res('picked:' + t.innerText.trim());
  }, 900));
}
function closePopper() { document.body.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; }

async function load() {
  await send('Page.navigate', { url: 'https://www.datawxq.com/lineups' }); await sleep(9000);
}
async function scrollAll() { for (let k = 0; k < 6; k++) { await call(() => window.scrollBy(0, 2500)); await sleep(700); } await call(() => window.scrollTo(0, 0)); await sleep(400); }
await send('Page.navigate', { url: 'https://www.datawxq.com/rankings/commanders' }); await sleep(9000);
await scrollAll();
writeFileSync(`${outDir}/lords.txt`, 'https://www.datawxq.com/rankings/commanders\n' + await call(() => document.body.innerText));
await load(); await scrollAll();
const all = await call(extract);
writeFileSync(`${outDir}/lineups-all.json`, JSON.stringify(all, null, 1));
console.log('all', all.length, JSON.stringify(all[0]).slice(0, 600));
for (const fac of ['河洛', '逐鹿', '日落海', '三分之地', '大河流域']) {
  await load();
  const r = await call(pickFaction, fac);
  await sleep(700); await call(closePopper); await sleep(4000); await scrollAll();
  const cards = await call(extract);
  const label = await call(() => document.querySelector('.lineups-filter-trigger--faction')?.innerText.replace(/\n/g, ' '));
  writeFileSync(`${outDir}/lineups-ban-${fac}.json`, JSON.stringify({ r, label, cards }, null, 1));
  console.log(fac, r, '|', label, '|', cards.length);
}
ws.close(); proc.kill();
