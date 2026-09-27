// README 配图 → docs/images/：横幅、设备展示、数据图（浅色 + 夜场两版）、功能截图、副驾面板、开局动图。
// 页面源在 docs/src/，和网站共用 site/dist 的玻璃、字体、立绘与数据，所以数据更新后重跑即可。
//   node scripts/build_readme_images.mjs            全部
//   node scripts/build_readme_images.mjs banner     只做名字里含 banner 的
// 需要 Chrome（CHROME=<路径> 可指定）；动图用 python3 + Pillow 合成 animated WebP。
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'site/dist');
const SRC = path.join(ROOT, 'docs/src');
const OUT = path.join(ROOT, 'docs/images');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 静态服务：/_docs/ → docs/src，其余 → site/dist
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  const [base, sub] = rel.startsWith('/_docs/') ? [SRC, rel.slice(6)] : [DIST, rel];
  const file = path.join(base, sub.endsWith('/') ? sub + 'index.html' : sub);
  if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

// 副驾面板：回放测试帧到第 7 帧（第 8 回合商店）停住
let hud = null;
const HUD_PORT = 4300 + Math.floor(Math.random() * 400);

// Chrome：macOS 无头模式直接用 GPU（Metal）；其他系统用软件 WebGL（玻璃效果需要 WebGL2）
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const port = 9600 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(path.join(tmpdir(), 'wx-readme-'));
const GL = process.platform === 'darwin' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const proc = spawn(CHROME, ['--headless=new', ...GL, '--hide-scrollbars', ...(process.env.CI ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let info; for (let i = 0; i < 50 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(info.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = []; const listeners = new Set();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  for (const f of listeners) f(m);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result?.value;
await send('Runtime.enable'); await send('Page.enable');

async function open(url, { w, h, scheme = 'light', dpr = 2, wait = 1800, ready }) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 700 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url });
  if (ready) for (let i = 0; i < 60 && !(await ev(ready)); i++) await sleep(250);
  await sleep(wait);
}
async function capture(file, { format = 'webp', quality = 88, clip } = {}) {
  const r = await send('Page.captureScreenshot', { format, ...(format === 'png' ? {} : { quality }), ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: !!clip });
  writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  console.log('→ docs/images/' + file, Math.round(Buffer.byteLength(r.result.data, 'base64') / 1024) + ' KB');
}
// 整页高度截图（数据图：高度随行数变）
async function fullPage(file, url, o) {
  await open(url, o);
  const hh = await ev('Math.ceil(document.documentElement.scrollHeight)');
  await send('Emulation.setDeviceMetricsOverride', { width: o.w, height: hh, deviceScaleFactor: o.dpr ?? 2, mobile: false });
  await sleep(400);
  await capture(file, o);
}

const THEMES = [['light', 'light'], ['dark', 'dark']];
const jobs = {
  banner: async () => { for (const [t, s] of THEMES) { await open(`${BASE}/_docs/banner.html?theme=${t}`, { w: 1280, h: 640, scheme: s, ready: 'document.body.dataset.ready', wait: 600 }); await capture(`banner-${t}.webp`, { quality: 90 }); } },
  showcase: async () => { for (const [t, s] of THEMES) { await open(`${BASE}/_docs/showcase.html`, { w: 1440, h: 820, scheme: s, ready: 'document.body.dataset.ready', wait: 1500 }); await capture(`showcase-${t}.webp`, { quality: 88 }); } },
  chart: async () => { for (const [t, s] of THEMES) await fullPage(`chart-survivorship-${t}.png`, `${BASE}/_docs/chart-survivorship.html?theme=${t}`, { w: 1200, h: 700, scheme: s, ready: 'document.body.dataset.ready', wait: 300, format: 'png' }); },
  screens: async () => {
    const shots = [
      ['screen-play.webp', '/#/play/kaituan?lord=%E9%A6%99%E9%A6%99&s=2', 1180, 820],
      ['screen-route.webp', '/#/r/kaituan', 1440, 900],
      ['screen-lords.webp', '/#/lords', 1440, 900],
    ];
    for (const [file, hash, w, h] of shots) { await open(BASE + hash, { w, h, wait: 3200 }); await capture(file); }
    // 路线页：体检 + 强在哪
    await open(BASE + '/#/r/lvbu', { w: 1440, h: 900, wait: 2500 });
    await ev(`(() => { document.querySelectorAll('.rv').forEach((e) => e.classList.add('in')); const s = document.querySelector('.check').closest('section'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 70); })()`);
    await sleep(900);
    await capture('screen-check.webp');
  },
  hud: async () => {
    hud = spawn('node', [path.join(ROOT, 'copilot/brain.mjs'), 'demo', path.join(ROOT, 'copilot/test/frames.jsonl'), '--no-voice', '--port', String(HUD_PORT), '--until', '7'], { stdio: 'ignore' });
    await sleep(1500);
    await open(`http://127.0.0.1:${HUD_PORT}/`, { w: 1280, h: 820, scheme: 'dark', wait: 2200 });
    await capture('screen-copilot.webp');
    hud.kill(); hud = null;
  },
  demo: async () => {
    // 开局页：换两次禁用，每次玻璃推开露出新答案
    await open(BASE + '/#/', { w: 1280, h: 760, scheme: 'light', dpr: 1, wait: 0 });
    await ev('localStorage.clear()');
    await open(BASE + '/#/?ban=%E6%B2%B3%E6%B4%9B', { w: 1280, h: 760, scheme: 'light', dpr: 1, wait: 4500 });
    const dir = mkdtempSync(path.join(tmpdir(), 'wx-demo-'));
    // 合成器录屏：画面有变化才出帧，帧时长用帧自带的时间戳
    const stamps = [];
    const onFrame = (m) => {
      if (m.method !== 'Page.screencastFrame') return;
      writeFileSync(path.join(dir, `f${String(stamps.length).padStart(4, '0')}.jpg`), Buffer.from(m.params.data, 'base64'));
      stamps.push(m.params.metadata.timestamp * 1000);
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
    };
    listeners.add(onFrame);
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
    await sleep(1600);
    const holds = [[0, 1600]];
    for (const ban of ['大河流域', '三分之地']) {
      const before = stamps.length;
      await ev(`document.querySelector('[data-ban="${ban}"]').click()`);
      await sleep(2800);
      if (stamps.length > before) holds.push([stamps.length - 1, 1800]);
    }
    await send('Page.stopScreencast');
    listeners.delete(onFrame);
    const durs = stamps.map((t, i) => (i + 1 < stamps.length ? stamps[i + 1] - t : 0));
    for (const [i, ms] of holds) durs[i] = ms;
    writeFileSync(path.join(dir, 'durs.json'), JSON.stringify(durs.map(Math.round)));
    execFileSync('python3', ['-c', `
import json, sys
from pathlib import Path
from PIL import Image
d = Path(sys.argv[1]); durs = json.loads((d / 'durs.json').read_text())
imgs = [Image.open(f).convert('RGB').resize((960, 570), Image.LANCZOS) for f in sorted(d.glob('f*.jpg'))]
out, dd = [], []
for im, t in zip(imgs, durs):  # 合并与上一帧相同的帧
    if out and im.tobytes() == out[-1].tobytes(): dd[-1] += t; continue
    out.append(im); dd.append(max(20, t))
out[0].save(sys.argv[2], save_all=True, append_images=out[1:], duration=dd, loop=0, quality=78, method=6)
print('frames', len(out), 'seconds', round(sum(dd) / 1000, 1))
`, dir, path.join(OUT, 'demo-opening.webp')], { stdio: 'inherit' });
    rmSync(dir, { recursive: true, force: true });
    console.log('→ docs/images/demo-opening.webp', Math.round(statSync(path.join(OUT, 'demo-opening.webp')).size / 1024) + ' KB');
  },
};

try {
  for (const [name, job] of Object.entries(jobs)) if (!only.length || only.some((o) => name.includes(o))) await job();
} finally {
  hud?.kill(); ws.close(); server.close();
  const exited = new Promise((r) => proc.once('exit', r));
  proc.kill(); await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (errors.length) { console.log('页面脚本错误：\n' + errors.join('\n')); process.exit(1); }
