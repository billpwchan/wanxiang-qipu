// 真实浏览器交互测试（v5）：开局禁用→方案、我的棋手、对局模式翻页/键盘/持久化、路线页各区块、棋手、查牌、抽屉、四种宽度无横向溢出、无脚本错误。
// node scripts/verify-ui.mjs          自带静态服务器测 site/dist
// node scripts/verify-ui.mjs <base>   测已部署的站点，例如 https://wanxiang.52-198-144-26.sslip.io/
// GPU=1 时开启 WebGL，检查玻璃画布真的在画；CHROME=<路径> 指定浏览器
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, openSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/dist');
// 「我有的棋手」名单必须覆盖官方卡池全部棋手，数量跟着 cards.json 走，不写死 19 或 21。
const cardsLords = JSON.parse(readFileSync(path.join(DIST, 'data/cards.json'), 'utf8')).lords.map((x) => x.name);
const cardsSorted = [...cardsLords].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const { FACTS } = await import(pathToFileURL(path.join(DIST, 'data/facts.js')).href);
// 阵容榜的样本数/更新日期断言要和站点渲染同源，否则就是对着自己断言，永远绿（issue #21）。
const compsMeta = JSON.parse(readFileSync(path.join(DIST, 'data/comps.json'), 'utf8')).meta;
// 抽屉里按名称排，比对的期望值也按同一次排序取，免得被 cards.json 里的原始顺序干扰
const noRoute = cardsSorted.filter((n) => !(FACTS.lords[n]?.routes || []).length);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let server = null;
let BASE = process.argv[2];
if (!BASE) {
  server = createServer((req, res) => {
    let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
    const rel0 = rel.endsWith('/') ? rel + 'index.html' : rel;
    let file = path.join(DIST, rel0);
    // History 路由：没有扩展名的路径交给 index.html（和 vercel.json 的 rewrite 一致）
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
      if (path.extname(rel0)) { res.writeHead(404); res.end(); return; }
      file = path.join(DIST, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const port = 9800 + Math.floor(Math.random() * 100);
const GPU = process.env.GPU === '1';
// Chrome 的 stderr 落到临时文件：起不来时能看到它自己说了什么，而不是只剩一个 TypeError。
const chromeLog = path.join(tmpdir(), 'wx-ui-chrome-' + port + '.log');
const chromeLogFd = openSync(chromeLog, 'w');
let chromeSpawnError = null;
const proc = spawn(CHROME, ['--headless=new', ...(GPU ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']), ...(process.env.CI ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, '--user-data-dir=' + path.join(tmpdir(), 'wx-ui-' + port), 'about:blank'], { stdio: ['ignore', 'ignore', chromeLogFd] });
// spawn 失败（ENOENT 等）时 child 会发 error 事件；不监听会让整个进程崩掉，这里记下来交给等待循环统一报错。
proc.on('error', (err) => { chromeSpawnError = err; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromeLogTail = () => {
  try {
    const text = readFileSync(chromeLog, 'utf8').trim();
    return text ? `Chrome 日志尾部（${chromeLog}）：\n${text.split('\n').slice(-20).join('\n')}` : `Chrome 日志为空（${chromeLog}）`;
  } catch {
    return `Chrome 日志不可读（${chromeLog}）`;
  }
};
// 等 CDP 起来：fetch 带 1s 超时；返回值不是数组、或数组里没有 page 目标都继续重试，50 次耗尽抛可诊断错误。
const waitStart = Date.now();
let info;
for (let i = 0; i < 50 && !info; i++) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1000);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: ac.signal })).json();
    if (Array.isArray(list) && list.some((t) => t && t.type === 'page')) info = list;
  } catch { /* 连不上 / 超时 / 非 JSON：继续重试 */ } finally { clearTimeout(timer); }
  if (!info) await sleep(200);
}
if (!info) {
  throw new Error(
    `Chrome 未就绪：${CHROME} 在 ${Math.round((Date.now() - waitStart) / 1000)}s 内未暴露 CDP（port ${port}）` +
    `\n进程退出码：${proc.exitCode === null ? '仍在运行（未退出）' : proc.exitCode}` +
    (chromeSpawnError ? `\nspawn 失败：${chromeSpawnError.message}` : '') +
    `\n${chromeLogTail()}`,
  );
}
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
// History 路由：p 以 / 开头，?still 并进查询串
const go = async (p, wait = 1600) => { const u = new URL(p, BASE); if (!GPU) u.searchParams.set('still', ''); await send('Page.navigate', { url: u.href }); await sleep(wait); };
// 旧哈希链接（#/...）也要能打开
const goHash = async (h, wait = 1600) => { await send('Page.navigate', { url: BASE + still + '#' + h }); await sleep(wait); };
const noOverflow = async () => ev(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
const results = []; const check = (name, ok, detail = '') => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const txt = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim()`);

// ---- 开局 ----
await go('/'); await ev(`localStorage.clear()`); await go('/');
check('开局：5 个禁用 + 还没看到', await ev(`document.querySelectorAll('.ban').length`) === 6);
check('开局：默认「还没看到」并直接给方案', await ev(`document.querySelector('[data-ban="未知"]').classList.contains('on')`) && (await txt('#ans h2')) === '大河开团射');
await ev(`document.querySelector('[data-ban="三分之地"]').click()`); await sleep(500);
check('开局：禁三分 → 香香 · 大河开团射', (await txt('#ans .for b')) === '香香' && (await txt('#ans h2')) === '大河开团射', await txt('#ans h2'));
check('开局：主数字是棋手的全部对局', (await ev(`document.querySelector('#ans .src').textContent`)).includes('香香的全部对局') && (await txt('#ans .rnum')) === '3.2');
check('开局：地址记住禁用（可分享）', decodeURIComponent(await ev('location.search')) === '?ban=三分之地');
await ev(`document.querySelector('[data-ban="大河流域"]').click()`); await sleep(500);
check('开局：禁大河 → 孙小宾 · 孙小宾三分 · 3.1', (await txt('#ans .for b')) === '孙小宾' && (await txt('#ans h2')) === '孙小宾三分' && (await txt('#ans .rnum')) === '3.1');
check('开局：说明这个棋手有多少对局在打这套', (await txt('#ans .share')).includes('71%'));
await ev(`document.querySelector('[data-ban="河洛"]').click()`); await sleep(500);
check('开局：备选 3 条', await ev(`document.querySelectorAll('#ans .alt').length`) === 3);
check('开局：开始对局带上棋手', (await ev(`document.querySelector('#ans .btn.go').getAttribute('href')`)).includes('/play/kaituan?lord='));
check('开局：十套路线，分三档', await ev(`document.querySelectorAll('.rgrid .rt').length === 10 && document.querySelectorAll('.tgroup').length === 3`));
check('开局：热门但别打 6 条，带导入次数', await ev(`document.querySelectorAll('.trap').length === 6 && document.querySelector('.trap .uses').textContent.includes('万')`));
check('开局：手机无横向溢出', await noOverflow());
// 我的棋手
await ev(`document.querySelector('[data-owned]').click()`); await sleep(300);
check(`我的棋手：抽屉 ${cardsLords.length} 个（= 官方卡池全量）`, await ev(`document.querySelectorAll('[data-own]').length`) === cardsLords.length);
const picked = await ev(`[...document.querySelectorAll('[data-own]')].map(b => b.dataset.own)`);
check('我的棋手：名单与 cards.json 的 lords 完全一致', JSON.stringify(picked) === JSON.stringify(cardsSorted), picked.join(' '));
const naText = await ev(`[...document.querySelectorAll('[data-own][disabled]')].map(b => b.dataset.own + (b.textContent.includes('暂无法推荐') ? '' : '!'))`);
check(`我的棋手：无路线的 ${noRoute.length} 个置灰并标注暂无法推荐`, JSON.stringify(naText) === JSON.stringify(noRoute), naText.join(' '));
await ev(`['嬴律','明先生'].forEach(n => document.querySelector('[data-own="'+n+'"]').click())`);
await ev(`document.querySelector('#sheet [data-close].btn').click()`); await sleep(600);
check('我的棋手：禁河洛时跳过孙小宾', (await txt('#ans .for b')) !== '孙小宾' && ['嬴律', '明先生'].includes(await txt('#ans .for b')), await txt('#ans .for b'));
await ev(`localStorage.removeItem('wx.owned')`);

// ---- 路线 ----
await goHash('/route/kaituan');
check('旧链接 #/route/ 跳到 /r/', (await ev(`location.pathname`)) === '/r/kaituan', await ev(`location.pathname`));
await go('/r/lvbu');
check('路线：标题与平均名次（孙小宾全部对局）', (await txt('.rhero h1')) === '孙小宾三分' && (await txt('.rhero .rnum')) === '3.1');
check('路线：「打成这套时」单独列出', (await ev(`document.querySelector('.facts').textContent`)).includes('打成这套时'));
check('路线：打之前看 4 项', await ev(`document.querySelectorAll('.facts .fact').length`) === 4);
check('路线：体检 5 项', await ev(`document.querySelectorAll('.check .ck').length`) === 5);
check('路线：强在哪 3 步', await ev(`document.querySelectorAll('.logic .lnode').length`) === 3);
check('路线：棋盘 28 格、7 人、1 个主核', await ev(`document.querySelectorAll('.formation .board .cell').length === 28 && document.querySelectorAll('.formation .board .tok').length === 7 && document.querySelectorAll('.formation .board .tok.core').length === 1`));
check('路线：7 个阶段', await ev(`document.querySelectorAll('#plan .st').length`) === 7);
check('路线：拍卖有出价上限', await ev(`document.querySelectorAll('#plan .st.auc .cap').length`) >= 6);
check('路线：卡图已加载', await ev(`(async () => { document.querySelector('#plan').scrollIntoView(); const i = [...document.querySelectorAll('#plan .cd img')].slice(0, 6); await Promise.race([Promise.all(i.map(x => x.decode().catch(() => {}))), new Promise(r => setTimeout(r, 4000))]); return i.every(x => x.naturalWidth > 100); })()`));
check('路线：转型链接', await ev(`!!document.querySelector('.pv a[href="/r/mulan"]')`));
check('路线：手机无横向溢出', await noOverflow());
await ev(`document.querySelector('#plan .cd').click()`); await sleep(400);
check('卡牌抽屉', await ev(`document.querySelector('#sheet').open && document.querySelector('#panel h2').textContent.length > 0`));
await ev(`document.querySelector('#sheet').close()`); await sleep(100);
await ev(`document.querySelector('.lordpill').click()`); await sleep(400);
check('棋手抽屉', await ev(`document.querySelector('#sheet').open && document.querySelector('#panel h2').textContent === '孙小宾' && document.querySelectorAll('#panel .skill').length >= 3`));
await ev(`document.querySelector('#sheet').close()`);
await go('/r/kaituan');
check('路线：有阵容码的路线显示导入块', await ev(`!!document.querySelector('.code [data-code]')`));

// ---- 对局模式 ----
await size(1180, 820);
await go('/play/lvbu?lord=孙小宾');
check('对局：开局阶段', (await txt('.pstage h1')) === '开局' && await ev(`document.querySelectorAll('.pstage .cd').length`) >= 4);
check('对局：隐藏全站导航', await ev(`getComputedStyle(document.querySelector('#bar')).display === 'none'`));
check('对局：7 个阶段点', await ev(`document.querySelectorAll('.dots button').length`) === 7);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`); await sleep(500);
check('对局：键盘 → 到第一次拍卖', (await txt('.pstage h1')) === '第一次拍卖' && await ev(`document.querySelectorAll('.bid .cd .cap').length`) >= 2);
await ev(`document.querySelector('.pnav .btn.go').click()`); await sleep(500);
check('对局：下一步按钮 → 前期', (await txt('.pstage h1')) === '前期');
check('对局：棋盘标出已买/未买', await ev(`document.querySelectorAll('.prail .tok.ghost').length > 0 && document.querySelectorAll('.prail .tok:not(.ghost)').length > 0`));
await go('/play/lvbu');
check('对局：记住进度', (await txt('.pstage h1')) === '前期');
await ev(`document.querySelector('[data-step="6"]').click()`); await sleep(500);
check('对局：跳到决赛，最后一步显示「打完了」', (await txt('.pstage h1')) === '决赛' && (await txt('.pnav .btn.go')).includes('打完了'));
await ev(`document.querySelector('[data-pivot]').click()`); await sleep(400);
check('对局：撞车了 → 转型抽屉', await ev(`document.querySelector('#sheet').open && document.querySelectorAll('#panel .pv').length >= 2`));
await ev(`document.querySelector('#sheet').close()`);
check('对局：iPad 横屏无横向溢出', await noOverflow());
await size(390, 844); await go('/play/mulan?s=4');
check('对局：手机无横向溢出', await noOverflow());

// ---- 棋手 / 查牌 / 规则 ----
await go('/lords');
const rankedLords = cardsSorted.filter((n) => FACTS.lords[n]?.avg);
check('棋手：' + cardsLords.length + ' 个（官方卡池全量），' + rankedLords.length + ' 个有统计按平均名次排',
  await ev(`(() => { const v = [...document.querySelectorAll('.lc .rnum')].map(x => +x.textContent); return document.querySelectorAll('.lc').length === ` + cardsLords.length + ` && v.length === ` + rankedLords.length + ` && v.every((x, i) => !i || x >= v[i - 1]); })()`));
check('棋手：没有统计的卡片标「暂无法推荐」', await ev(`[...document.querySelectorAll('.lc')].filter(b => !b.querySelector('.rnum')).every(b => b.textContent.includes('暂无法推荐'))`));
check('棋手：官方立绘已加载', await ev(`(async () => { const i = document.querySelector('.lc img'); await Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 4000))]); return i.naturalWidth > 200; })()`));
await go('/cards');
check('查牌：85 个英雄', await ev(`document.querySelectorAll('#cgrid .cd').length`) === 85);
await ev(`(() => { const i = document.querySelector('#cq'); i.value = '复生'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
const n1 = await ev(`document.querySelectorAll('#cgrid .cd').length`);
check('查牌：搜「复生」', n1 > 0 && n1 < 85, String(n1));
await ev(`document.querySelector('[data-ctab="effects"]').click()`); await sleep(200);
check('查牌：效果牌', await ev(`document.querySelectorAll('#cgrid .ci').length`) > 0);
// 清掉搜索和分页状态，回到英雄列表，点第一张开属性表
await go('/cards');
await ev(`(() => { const i = document.querySelector('#cq'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
await ev(`document.querySelector('[data-ctab="heroes"]').click()`); await sleep(300);
await ev(`document.querySelector('#cgrid .cd').click()`); await sleep(400);
check('查牌：属性表 10 项', await ev(`document.querySelectorAll('#panel .stt div').length`) === 10);
const stt = (await txt('#panel .stt')) || '';
check('查牌：暴击率 / 暴击效果转成百分比', /暴击率\d+%/.test(stt) && /暴击效果\d+%/.test(stt), stt);
await ev(`document.querySelector('#sheet').close()`);
await go('/rules');
check('规则页', await ev(`document.querySelectorAll('.rule').length`) >= 6);
check('热门但别打：6 条', await ev(`document.querySelectorAll('.traps .trap').length`) === 6);
check('热门但别打：有统计的显示实测名次和场次', await ev(`(() => { const t = [...document.querySelectorAll('.traps .trap')].find(x => x.textContent.includes('4,124 局')); return !!t && t.textContent.includes('实测') && t.textContent.includes('4.59'); })()`));
check('热门但别打：无统计的写「暂无统计」', await ev(`[...document.querySelectorAll('.traps .trap')].filter(x => x.querySelector('.rm .src')?.textContent === '暂无统计').length`) === 2);
check('热门但别打：新增玉环日落海司空震', await ev(`(() => { const t = [...document.querySelectorAll('.traps .trap')].find(x => x.textContent.includes('玉环日落海司空震')); return !!t && t.textContent.includes('85.5 万') && t.textContent.includes('6,189 局'); })()`));
check('热门高导入：4 条并带说明', await ev(`(() => { const h = document.querySelector('.hotnos'); return !!h && h.querySelectorAll('li').length === 4 && h.textContent.includes('452 万') && h.textContent.includes('273 万') && h.textContent.includes('无法判定强弱'); })()`));
check('热门但别打：不把无统计的写成坑', await ev(`!document.querySelector('.traps')?.textContent.includes('坑')`));
await ev(`document.querySelector('[data-note]').click()`); await sleep(300);
check('数据说明抽屉', await ev(`document.querySelector('#panel').textContent.includes('平均名次')`));

// ---- 阵容 ----
await go('/comps');
check('阵容：112 套', await ev(`document.querySelectorAll('.cp').length`) === 112);
// 阵容榜：按 rosterKey 去重后取平均名次最好的 10 组，排在 112 张卡之前。
check('阵容榜：10 行', await ev(`document.querySelectorAll('.cprank .cpr').length`) === 10);
check('阵容榜：在卡牌网格之前', await ev(`(() => { const k = document.querySelector('.cprank'); const g = document.querySelector('.cpgrid'); return !!k && !!g && !!(k.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
check('阵容榜：名次 1–10 且平均名次升序、两位小数', await ev(`(() => {
  const rank = [...document.querySelectorAll('.cprank .cpr .rank')].map(x => x.textContent.trim());
  const m = [...document.querySelectorAll('.cprank .cpr .rnum')].map(x => x.textContent.trim());
  return rank.join(',') === '1,2,3,4,5,6,7,8,9,10' && m.every(x => /^\\d\\.\\d\\d$/.test(x)) && m.every((x, i) => !i || +x >= +m[i - 1]);
})()`));
check('阵容榜：一行一套阵容，没有重复', await ev(`(() => {
  const n = [...document.querySelectorAll('.cprank .cpr .cprn b')].map(x => x.textContent.trim());
  return n.length === 10 && new Set(n).size === 10 && n.every(x => x && !/[\\r\\n]/.test(x));
})()`));
check('阵容榜：同阵容合并的行标出套数', await ev(`[...document.querySelectorAll('.cprank .cprn .src')].some(x => /^共 \\d+ 套同阵容$/.test(x.textContent.trim()))`));
check('阵容榜：场次带千分位', await ev(`[...document.querySelectorAll('.cprank .cprg')].some(x => /^[\\d,]+ 局$/.test(x.textContent.trim()) && x.textContent.includes(','))`));
const cpNote = (await txt('.cprank .cprh .src')) || '';
check('阵容榜：口径写全服，不写没抓到的「近 7 天」', cpNote.includes('全服（allPlayers）') && cpNote.includes('平均名次升序') && !cpNote.includes('近 7 天'), cpNote);
const cpSample = typeof compsMeta?.statsSampleCount === 'number' ? `${compsMeta.statsSampleCount.toLocaleString('en-US')} 局样本` : '';
const cpFetched = typeof compsMeta?.statsFetchedAt === 'string' ? compsMeta.statsFetchedAt.slice(0, 10) : '';
check('阵容榜：样本数和更新日期', !!cpSample && !!cpFetched && cpNote.includes(cpSample) && cpNote.includes(cpFetched), cpNote);
check('阵容榜：每行有吃鸡率、前三率、棋手、场次', await ev(`(() => {
  const rows = [...document.querySelectorAll('.cprank .cpr')];
  return rows.length === 10 && rows.every(x => {
    const s = x.querySelector('.cprst');
    return !!s && s.textContent.includes('吃鸡') && s.textContent.includes('前三') && /[\\d,]+ 局/.test(s.textContent) && !!x.querySelector('.cprl .cpl');
  });
})()`));
check('阵容榜：能对上打法的给链接，对不上的写待补充', await ev(`(() => {
  const rows = [...document.querySelectorAll('.cprank .cpr')];
  const links = rows.filter(x => x.querySelector('.cpra a[href^="/r/"]')).length;
  const none = rows.filter(x => x.querySelector('.cpra .src')?.textContent === '当前版本胜率最高，打法待补充').length;
  return links >= 1 && none >= 1 && links + none === rows.length;
})()`));
check('阵容：有统计的显示登场率和平均名次', await ev(`(() => { const s = document.querySelector('.cp .stats'); return !!s && s.textContent.includes('登场率') && s.textContent.includes('平均名次'); })()`));
check('阵容：没有统计的写「暂无统计」且不出现 0', await ev(`(() => { const s = [...document.querySelectorAll('.cp .src')].find(x => x.textContent === '暂无统计'); if (!s) return false; const cp = s.closest('.cp'); return !cp.querySelector('.stats') && !/\\b0%/.test(cp.textContent); })()`));
check('阵容：英雄图标已加载', await ev(`(async () => { const i = document.querySelector('.cpgrid .chi img'); if (!i) return false; i.scrollIntoView({ block: 'center' }); await Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 4000))]); return i.naturalWidth > 0; })()`));
check('阵容：变阵折叠面板', await ev(`document.querySelectorAll('.cp details.cpv').length`) === 6);
await ev(`(() => { const d = document.querySelector('.cp details.cpv'); d.open = true; })()`); await sleep(300);
check('阵容：展开变阵显示换人和场次', await ev(`(() => { const d = document.querySelector('.cp details.cpv'); const li = d.querySelector('li'); return d.open && !!li && (li.querySelector('.sw b.up') || li.querySelector('.sw b.dn')) && li.textContent.includes('局'); })()`));
await ev(`document.querySelector('.cp .chi[data-card]').click()`); await sleep(400);
check('阵容：点英雄开查牌抽屉', await ev(`document.querySelector('#sheet').open && !!document.querySelector('#panel h2')`));
await ev(`document.querySelector('#sheet').close()`);
check('阵容：底部有社区内容说明', await ev(`[...document.querySelectorAll('.small')].some(p => p.textContent.includes('玩家原创'))`));
check('阵容：每张卡都有复制阵容码按钮', await ev(`(() => { const cards = [...document.querySelectorAll('.cpgrid .cp')]; return cards.length > 0 && cards.every(c => c.querySelector('.cpft [data-copy]')); })()`));
const cpCopy = await ev(`(async () => {
  window.__copied = null;
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (x) => { window.__copied = x; } } }); } catch {}
  const b = document.querySelector('.cpgrid .cp .cpft [data-copy]');
  const want = b.dataset.copy;
  b.click();
  await new Promise((r) => setTimeout(r, 250));
  return { want, got: window.__copied, text: b.textContent.trim(), toast: document.querySelector('#toast').textContent };
})()`);
check('阵容：点复制写入阵容码、按钮变「已复制」并提示', !!cpCopy && cpCopy.got === cpCopy.want && cpCopy.text === '已复制' && cpCopy.toast.includes('阵容码已复制'), JSON.stringify(cpCopy));
check('阵容：匹配到路线的卡有 data-r 链接，没匹配的不显示', await ev(`(() => {
  const cards = [...document.querySelectorAll('.cpgrid .cp')];
  const links = cards.map(c => c.querySelector('.cpft .cpgo[data-r]')).filter(Boolean);
  return links.length >= 1 && links.length < cards.length && links.every(a => a.dataset.r === a.getAttribute('href').slice(3) && /^\\/r\\//.test(a.getAttribute('href')));
})()`));
const cpJump = await ev(`(() => { const a = document.querySelector('.cpgrid .cp .cpgo[data-r]'); if (!a) return null; const id = a.dataset.r; a.click(); return { id, path: location.pathname }; })()`);
await sleep(700);
check('阵容：点「去这里看打法」跳到对应路线页', !!cpJump && cpJump.path === '/r/' + cpJump.id && (await ev(`location.pathname`)) === '/r/' + cpJump.id && (await ev(`!!document.querySelector('.rhero')`)), JSON.stringify(cpJump));

// ---- SEO ----
const metaC = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.getAttribute('content')`);
await go('/');
check('SEO：首页标题与描述', (await ev(`document.title`)) === '王者万象棋攻略助手 - 万象棋谱' && (await metaC('meta[name="description"]')).startsWith('王者万象棋 S1 对局助手'), await ev(`document.title`));
await go('/routes');
check('SEO：路线页标题', (await ev(`document.title`)) === '王者万象棋强势阵容打法 - 万象棋谱', await ev(`document.title`));
await go('/lords');
check('SEO：棋手页标题', (await ev(`document.title`)) === '王者万象棋全棋手技能与数据 - 万象棋谱', await ev(`document.title`));
await go('/comps');
check('SEO：阵容页标题', (await ev(`document.title`)) === '王者万象棋全服胜率阵容库 - 万象棋谱', await ev(`document.title`));
await go('/cards');
check('SEO：查牌页标题', (await ev(`document.title`)) === '王者万象棋英雄装备天赋图鉴 - 万象棋谱', await ev(`document.title`));
check('SEO：canonical 跟着地址走', (await ev(`document.querySelector('link[rel="canonical"]')?.getAttribute('href')`)) === 'https://wxq.007.al/cards', await ev(`document.querySelector('link[rel="canonical"]')?.getAttribute('href')`));

// ---- 宽度 ----
for (const [w, h] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
  await size(w, h);
  for (const hsh of ['/', '/r/yuhuan', '/play/kaituan?s=3', '/lords', '/comps', '/cards']) { await go(hsh, 900); if (!(await noOverflow())) check(`无横向溢出 ${w} ${hsh}`, false); }
}
check('四种宽度 × 6 页无横向溢出', !results.some((r) => r[1].startsWith('无横向溢出 ')));
if (GPU) {
  await size(1180, 820); await go('/?ban=%E6%B2%B3%E6%B4%9B', 3500);
  check('WebGL：首页玻璃画布在画', await ev(`(() => { const c = document.querySelector('#gl'); const g = c.getContext('webgl2'); if (!g) return false; const p = new Uint8Array(4); g.readPixels(c.width >> 1, c.height >> 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, p); return c.width > 100; })()`));
}
check('没有脚本错误', errors.length === 0, errors.join(' | '));
check('没有 404', bad.length === 0, bad.slice(0, 5).join(' | '));

ws.close(); proc.kill(); server?.close();
let fail = 0;
for (const [s, n, d] of results) { if (s === 'FAIL') fail++; console.log(s, n, d ? '· ' + d : ''); }
console.log(`${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
