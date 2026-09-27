// 真实浏览器交互测试（v5）：开局禁用→方案、我的棋手、对局模式翻页/键盘/持久化、路线页各区块、棋手、查牌、抽屉、四种宽度无横向溢出、无脚本错误。
// node scripts/verify-ui.mjs          自带静态服务器测 site/dist
// node scripts/verify-ui.mjs <base>   测已部署的站点，例如 https://wanxiang.52-198-144-26.sslip.io/
// GPU=1 时开启 WebGL，检查玻璃画布真的在画；CHROME=<路径> 指定浏览器
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let server = null;
let BASE = process.argv[2];
if (!BASE) {
  server = createServer((req, res) => {
    let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
    const file = path.join(DIST, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const port = 9800 + Math.floor(Math.random() * 100);
const GPU = process.env.GPU === '1';
const proc = spawn(CHROME, ['--headless=new', ...(GPU ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']), ...(process.env.CI ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, '--user-data-dir=' + path.join(tmpdir(), 'wx-ui-' + port), 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let info; for (let i = 0; i < 50 && !info; i++) { try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(200); } }
const ws = new WebSocket(info.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = []; const bad = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) bad.push(m.params.response.status + ' ' + m.params.response.url);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result.result?.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
await size(390, 844);
const still = GPU ? '' : '?still';
const go = async (h, wait = 1600) => { await send('Page.navigate', { url: BASE + still + h }); await sleep(wait); };
const noOverflow = async () => ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
const results = []; const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const txt = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim()`);

// ---- 开局 ----
await go('#/'); await ev(`localStorage.clear()`); await go('#/');
check('开局：5 个禁用 + 还没看到', await ev(`document.querySelectorAll('.ban').length`) === 6);
check('开局：默认「还没看到」并直接给方案', await ev(`document.querySelector('[data-ban="未知"]').classList.contains('on')`) && (await txt('#ans h2')) === '大河开团射');
await ev(`document.querySelector('[data-ban="三分之地"]').click()`); await sleep(500);
check('开局：禁三分 → 香香 · 大河开团射', (await txt('#ans .for b')) === '香香' && (await txt('#ans h2')) === '大河开团射', await txt('#ans h2'));
check('开局：主数字是棋手的全部对局', (await ev(`document.querySelector('#ans .src').textContent`)).includes('香香的全部对局') && (await txt('#ans .rnum')) === '3.2');
check('开局：地址记住禁用（可分享）', decodeURIComponent(await ev('location.hash')) === '#/?ban=三分之地');
await ev(`document.querySelector('[data-ban="大河流域"]').click()`); await sleep(500);
check('开局：禁大河 → 孙小宾 · 孙小宾三分 · 3.1', (await txt('#ans .for b')) === '孙小宾' && (await txt('#ans h2')) === '孙小宾三分' && (await txt('#ans .rnum')) === '3.1');
check('开局：说明这个棋手有多少对局在打这套', (await txt('#ans .share')).includes('71%'));
await ev(`document.querySelector('[data-ban="河洛"]').click()`); await sleep(500);
check('开局：备选 3 条', await ev(`document.querySelectorAll('#ans .alt').length`) === 3);
check('开局：开始对局带上棋手', (await ev(`document.querySelector('#ans .btn.go').getAttribute('href')`)).includes('#/play/kaituan?lord='));
check('开局：十套路线，分三档', await ev(`document.querySelectorAll('.rgrid .rt').length === 10 && document.querySelectorAll('.tgroup').length === 3`));
check('开局：热门但别打 5 条，带导入次数', await ev(`document.querySelectorAll('.trap').length === 5 && document.querySelector('.trap .uses').textContent.includes('万')`));
check('开局：手机无横向溢出', await noOverflow());
// 我的棋手
await ev(`document.querySelector('[data-owned]').click()`); await sleep(300);
check('我的棋手：抽屉 19 个', await ev(`document.querySelectorAll('[data-own]').length`) === 19);
await ev(`['嬴律','明先生'].forEach(n => document.querySelector('[data-own="'+n+'"]').click())`);
await ev(`document.querySelector('#sheet [data-close].btn').click()`); await sleep(600);
check('我的棋手：禁河洛时跳过孙小宾', (await txt('#ans .for b')) !== '孙小宾' && ['嬴律', '明先生'].includes(await txt('#ans .for b')), await txt('#ans .for b'));
await ev(`localStorage.removeItem('wx.owned')`);

// ---- 路线 ----
await go('#/route/kaituan');
check('旧链接 #/route/ 跳到 #/r/', await ev(`location.hash`) === '#/r/kaituan');
await go('#/r/lvbu');
check('路线：标题与平均名次（孙小宾全部对局）', (await txt('.rhero h1')) === '孙小宾三分' && (await txt('.rhero .rnum')) === '3.1');
check('路线：「打成这套时」单独列出', (await ev(`document.querySelector('.facts').textContent`)).includes('打成这套时'));
check('路线：打之前看 4 项', await ev(`document.querySelectorAll('.facts .fact').length`) === 4);
check('路线：体检 5 项', await ev(`document.querySelectorAll('.check .ck').length`) === 5);
check('路线：强在哪 3 步', await ev(`document.querySelectorAll('.logic .lnode').length`) === 3);
check('路线：棋盘 28 格、7 人、1 个主核', await ev(`document.querySelectorAll('.formation .board .cell').length === 28 && document.querySelectorAll('.formation .board .tok').length === 7 && document.querySelectorAll('.formation .board .tok.core').length === 1`));
check('路线：7 个阶段', await ev(`document.querySelectorAll('#plan .st').length`) === 7);
check('路线：拍卖有出价上限', await ev(`document.querySelectorAll('#plan .st.auc .cap').length`) >= 6);
check('路线：卡图已加载', await ev(`(async () => { document.querySelector('#plan').scrollIntoView(); const i = [...document.querySelectorAll('#plan .cd img')].slice(0, 6); await Promise.race([Promise.all(i.map(x => x.decode().catch(() => {}))), new Promise(r => setTimeout(r, 4000))]); return i.every(x => x.naturalWidth > 100); })()`));
check('路线：转型链接', await ev(`!!document.querySelector('.pv a[href="#/r/mulan"]')`));
check('路线：手机无横向溢出', await noOverflow());
await ev(`document.querySelector('#plan .cd').click()`); await sleep(400);
check('卡牌抽屉', await ev(`document.querySelector('#sheet').open && document.querySelector('#panel h2').textContent.length > 0`));
await ev(`document.querySelector('#sheet').close()`); await sleep(100);
await ev(`document.querySelector('.lordpill').click()`); await sleep(400);
check('棋手抽屉', await ev(`document.querySelector('#sheet').open && document.querySelector('#panel h2').textContent === '孙小宾' && document.querySelectorAll('#panel .skill').length >= 3`));
await ev(`document.querySelector('#sheet').close()`);
await go('#/r/kaituan');
check('路线：有阵容码的路线显示导入块', await ev(`!!document.querySelector('.code [data-code]')`));

// ---- 对局模式 ----
await size(1180, 820);
await go('#/play/lvbu?lord=孙小宾');
check('对局：开局阶段', (await txt('.pstage h1')) === '开局' && await ev(`document.querySelectorAll('.pstage .cd').length`) >= 4);
check('对局：隐藏全站导航', await ev(`getComputedStyle(document.querySelector('#bar')).display === 'none'`));
check('对局：7 个阶段点', await ev(`document.querySelectorAll('.dots button').length`) === 7);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`); await sleep(500);
check('对局：键盘 → 到第一次拍卖', (await txt('.pstage h1')) === '第一次拍卖' && await ev(`document.querySelectorAll('.bid .cd .cap').length`) >= 2);
await ev(`document.querySelector('.pnav .btn.go').click()`); await sleep(500);
check('对局：下一步按钮 → 前期', (await txt('.pstage h1')) === '前期');
check('对局：棋盘标出已买/未买', await ev(`document.querySelectorAll('.prail .tok.ghost').length > 0 && document.querySelectorAll('.prail .tok:not(.ghost)').length > 0`));
await go('#/play/lvbu');
check('对局：记住进度', (await txt('.pstage h1')) === '前期');
await ev(`document.querySelector('[data-step="6"]').click()`); await sleep(500);
check('对局：跳到决赛，最后一步显示「打完了」', (await txt('.pstage h1')) === '决赛' && (await txt('.pnav .btn.go')).includes('打完了'));
await ev(`document.querySelector('[data-pivot]').click()`); await sleep(400);
check('对局：撞车了 → 转型抽屉', await ev(`document.querySelector('#sheet').open && document.querySelectorAll('#panel .pv').length >= 2`));
await ev(`document.querySelector('#sheet').close()`);
check('对局：iPad 横屏无横向溢出', await noOverflow());
await size(390, 844); await go('#/play/mulan?s=4');
check('对局：手机无横向溢出', await noOverflow());

// ---- 棋手 / 查牌 / 规则 ----
await go('#/lords');
check('棋手：19 个，按平均名次排', await ev(`(() => { const v = [...document.querySelectorAll('.lc .rnum')].map(x => +x.textContent); return v.length === 19 && v.every((x, i) => !i || x >= v[i - 1]); })()`));
check('棋手：官方立绘已加载', await ev(`(async () => { const i = document.querySelector('.lc img'); await Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 4000))]); return i.naturalWidth > 200; })()`));
await go('#/cards');
check('查牌：85 个英雄', await ev(`document.querySelectorAll('#cgrid .cd').length`) === 85);
await ev(`(() => { const i = document.querySelector('#cq'); i.value = '复生'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
const n1 = await ev(`document.querySelectorAll('#cgrid .cd').length`);
check('查牌：搜「复生」', n1 > 0 && n1 < 85, String(n1));
await ev(`document.querySelector('[data-ctab="effects"]').click()`); await sleep(200);
check('查牌：效果牌', await ev(`document.querySelectorAll('#cgrid .ci').length`) > 0);
await go('#/rules');
check('规则页', await ev(`document.querySelectorAll('.rule').length`) >= 6);
await ev(`document.querySelector('[data-note]').click()`); await sleep(300);
check('数据说明抽屉', await ev(`document.querySelector('#panel').textContent.includes('平均名次')`));

// ---- 宽度 ----
for (const [w, h] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
  await size(w, h);
  for (const hsh of ['#/', '#/r/yuhuan', '#/play/kaituan?s=3', '#/lords', '#/cards']) { await go(hsh, 900); if (!(await noOverflow())) check(`无横向溢出 ${w} ${hsh}`, false); }
}
check('四种宽度 × 5 页无横向溢出', !results.some((r) => r[1].startsWith('无横向溢出 ')));
if (GPU) {
  await size(1180, 820); await go('#/?ban=%E6%B2%B3%E6%B4%9B', 3500);
  check('WebGL：首页玻璃画布在画', await ev(`(() => { const c = document.querySelector('#gl'); const g = c.getContext('webgl2'); if (!g) return false; const p = new Uint8Array(4); g.readPixels(c.width >> 1, c.height >> 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, p); return c.width > 100; })()`));
}
check('没有脚本错误', errors.length === 0, errors.join(' | '));
check('没有 404', bad.length === 0, bad.slice(0, 5).join(' | '));

ws.close(); proc.kill(); server?.close();
let fail = 0;
for (const [s, n, d] of results) { if (s === 'FAIL') fail++; console.log(s, n, d ? '· ' + d : ''); }
console.log(`${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
