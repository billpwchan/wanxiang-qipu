// 用 Chrome DevTools 协议做真实手机宽度截图，并收集页面脚本错误。
// node scripts/shoot.mjs <outdir> <width> <height> <dark|light> <name=url> ...
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const [outDir, w, h, scheme, ...jobs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const GPU = process.env.GPU === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--disable-gpu'];
const proc = spawn(CHROME, ['--headless=new', ...GPU, `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/wx-cdp-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 50 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const page = info.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
const FULL = process.env.FULL === '1';
const metrics = (hh) => send('Emulation.setDeviceMetricsOverride', { width: +w, height: hh, deviceScaleFactor: FULL ? 1 : 2, mobile: +w < 700 });
await metrics(+h);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
for (const job of jobs) {
  const [name, url] = job.split('=');
  const before = errors.length;
  await send('Page.navigate', { url: url.replace(/%3D/g, '=') });
  await sleep(+(process.env.WAIT || 1800));
  const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight})', returnByValue: true });
  const dims = JSON.parse(result.result.value);
  const [, anchor] = name.split('@');
  if (anchor) { await send('Runtime.evaluate', { expression: `document.getElementById('${anchor}')?.scrollIntoView()` }); await sleep(300); }
  if (FULL) { await metrics(Math.min(dims.sh, +(process.env.MAXH || 3400))); await sleep(1600); }
  const scrolls = (process.env.SCROLLS || '').split(',').filter(Boolean).map(Number);
  for (const [k, y] of (scrolls.length ? scrolls : [null]).entries()) {
    if (y != null) { await send('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})` }); await sleep(900); }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(`${outDir}/${name.split('@')[0]}${y != null ? '-' + k : ''}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  if (FULL) await metrics(+h);
  console.log(name, JSON.stringify(dims), dims.sw > dims.cw ? 'OVERFLOW-X' : '', errors.slice(before).join(' | '));
}
ws.close(); proc.kill();
