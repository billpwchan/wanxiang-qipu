// 探查 datawxq 检索器页面：截图 + 文本 + 条件搜索候选
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9200 + Math.floor(Math.random() * 90);
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/wx-probe-' + port, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info; for (let i = 0; i < 50 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(info.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'https://www.datawxq.com/explorer' }); await sleep(9000);
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.result.data, 'base64')); };
const dir = process.argv[2];
await shot(dir + '/probe-0.png');
writeFileSync(dir + '/probe-text.txt', await ev('document.body.innerText'));
const out = {};
for (const term of process.argv.slice(3)) {
  await ev(`(()=>{const s=[...document.querySelectorAll('.condition-search .el-select__wrapper')];const w=s[s.length-1];w.click();w.querySelector('input')?.focus();})()`);
  await sleep(300);
  await send('Input.insertText', { text: term }); await sleep(1500);
  out[term] = await ev(`[...document.querySelectorAll('.condition-search-option, .el-select-dropdown__item')].filter(o=>o.offsetParent).map(o=>o.innerText.trim().replace(/\\s+/g,' ')).slice(0,12)`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await ev(`(()=>{const i=document.querySelector('.condition-search input'); if(i){i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await sleep(500);
}
await shot(dir + '/probe-1.png');
console.log(JSON.stringify(out, null, 1));
ws.close(); proc.kill();
