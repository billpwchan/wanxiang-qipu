import { PHASES, ROUTES, MODULES } from './data/routes.js';
import { PATCH, PRINCIPLES, FACTS, UNKNOWNS, LORDS } from './data/guide.js';
import { HERO_NOTES, TALENT_NOTES } from './data/notes.js';
import { SIMS } from './data/sims.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheet-body');

// ── 数据索引 ─────────────────────────────
let DB = null;
const IDX = { hero: new Map(), talent: new Map(), effect: new Map(), equip: new Map(), lord: new Map() };
const routeById = new Map(ROUTES.map((r) => [r.id, r]));
const lordGuide = new Map(LORDS.map((l) => [l.name, l]));

function find(name) {
  for (const kind of ['hero', 'effect', 'talent', 'equip', 'lord']) {
    const c = IDX[kind].get(name);
    if (c) return { kind, c };
  }
  return null;
}

// ── 本地存储（可能不可用） ─────────────────
const store = {
  get(k, d) { try { const v = localStorage.getItem('wx.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wx.' + k, JSON.stringify(v)); } catch { /* 忽略 */ } },
};

// ── 小组件 ─────────────────────────────
function img(src, alt = '') {
  return src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()">` : '';
}
function av(name, { size = '', rank = 0, showTier = false } = {}) {
  const h = IDX.hero.get(name);
  if (!h) {
    const f = find(name);
    return `<button class="chip" type="button" data-card="${esc(name)}">${esc(name)}${f ? '' : ''}</button>`;
  }
  return `<button type="button" class="av fac ${size}" data-f="${esc(h.faction)}" data-card="${esc(name)}" aria-label="${esc(name)} ${h.tier} 阶">
    <span class="av-img">${img(h.img, name) || esc(name[0])}</span>
    ${rank ? `<span class="av-rank">${rank}</span>` : ''}${showTier ? `<span class="av-tier">${h.tier}</span>` : ''}
    <span class="av-name">${esc(name)}</span></button>`;
}
function chipCard(name, cls = 'chip') {
  return `<button type="button" class="${cls}" data-card="${esc(name)}">${esc(name)}</button>`;
}
function facOf(route) { return route.faction === '混合' ? '无阵营' : route.faction; }
function fitBar(n) { return '<span class="fitbar" aria-label="契合度 ' + n + '/3">' + '●'.repeat(n) + '○'.repeat(3 - n) + '</span>'; }

// ── 路由 ─────────────────────────────
function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, q: new URLSearchParams(qs || '') };
}
function setNav(key) {
  $$('.nav a').forEach((a) => { if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
function render() {
  if (!DB) return;
  const { parts, q } = parse();
  const [page, arg] = parts;
  let key = page || 'home';
  if (page === 'route') key = 'routes';
  setNav(key);
  if (!page) home();
  else if (page === 'routes') routesPage();
  else if (page === 'route' && routeById.has(arg)) routePage(routeById.get(arg), q.get('t') || 'rounds');
  else if (page === 'play') playPage(arg);
  else if (page === 'cards') cardsPage(q);
  else if (page === 'rules') rulesPage(q.get('s'));
  else home();
  if (!q.get('s')) window.scrollTo({ top: 0 });
}

// ── 开局 ─────────────────────────────
function home() {
  const picked = store.get('lords', []);
  view.innerHTML = `
  <section class="thesis">
    <div>
      <div class="thesis-kicker">9/24 版本 · 逐字对比官方卡面</div>
      <h1 class="h-display">韩信<em>翻倍</em>了。</h1>
      <p class="lede">日落海每回合六七次整备和开团，过去只变成会清零、要平分的核心临时等级。现在每一次都给韩信<b>永久 +2</b>（觉醒 +4），而亚连也能直接喂他——同一套底座，终端换一个人。</p>
      <div class="row"><a class="btn btn-primary" href="#/route/hanxin-zhengbei">看雅典娜韩信</a><a class="btn" href="#/rules?s=patch">这次改了什么</a></div>
    </div>
    <div class="panel thesis-math" aria-label="韩信每回合收入">
      <b>7</b><span>整备 + 开团事件 / 回合（狂铁、亚连、安琪拉、雅典娜 ×3、瑶）</span>
      <b>+14</b><span>韩信永久等级 / 回合（普通）</span>
      <b>+28</b><span>觉醒后</span>
      <b>+10</b><span>姜导封神：每个事件再 +1</span>
    </div>
  </section>

  <h2 class="h-section">你拿到了哪几个棋手？</h2><p class="small muted" style="margin:-6px 0 10px">开局三选一时点 1–3 个，下面告诉你拿谁、走哪条。</p>
  <div class="lords" role="group" aria-label="棋手">${DB.lords.map((l) => {
    const g = lordGuide.get(l.name);
    return `<button type="button" class="lord" data-lord="${esc(l.name)}" aria-pressed="${picked.includes(l.name)}">
      ${l.img ? `<img src="${esc(l.img)}" alt="" loading="lazy">` : `<span class="lord-mono">${esc(l.name[0])}</span>`}
      <span>${esc(l.name)}</span><span class="lord-tier">${g ? g.tier : ''}</span></button>`;
  }).join('')}</div>
  <div id="picks" class="picks"></div>

  <h2 class="h-section">8 条路线<small>按我对 9/24 版本的推荐排序</small></h2>
  <div class="route-cards">${ROUTES.map(routeCard).join('')}</div>

  <h2 class="h-section">任何路线都能插的模块</h2>
  <div class="stack">${MODULES.map(moduleBlock).join('')}</div>`;
  renderPicks(picked);
}
function onLordClick(e) {
  const b = e.target.closest('[data-lord]');
  if (!b) return;
  let picked = store.get('lords', []);
  const n = b.dataset.lord;
  picked = picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n].slice(-3);
  store.set('lords', picked);
  $$('[data-lord]').forEach((x) => x.setAttribute('aria-pressed', picked.includes(x.dataset.lord)));
  renderPicks(picked);
}
function lordRoutes(name) {
  const out = [];
  for (const r of ROUTES) {
    const f = r.lords.find((l) => l.name === name);
    if (f) out.push({ r, fit: f.fit, why: f.why });
  }
  return out.sort((a, b) => b.fit - a.fit);
}
function renderPicks(picked) {
  const box = $('#picks');
  if (!box) return;
  if (!picked.length) { box.innerHTML = ''; return; }
  const tierW = { S: 3, A: 2, B: 1 };
  const scored = picked.map((n) => { const rs = lordRoutes(n); return { n, rs, s: (rs[0]?.fit || 0) + (tierW[lordGuide.get(n)?.tier] || 0) }; }).sort((a, b) => b.s - a.s);
  const best = scored[0];
  box.innerHTML = (picked.length > 1 ? `<div class="panel"><div class="eyebrow">三选一</div><p style="margin:4px 0 0">拿 <b style="font-family:var(--display);font-size:20px">${esc(best.n)}</b>${best.rs[0] ? `，走 <a href="#/route/${best.rs[0].r.id}">${esc(best.rs[0].r.name)}</a>。${esc(best.rs[0].why)}` : '。' + esc(lordGuide.get(best.n)?.one || '')}</p></div>` : '') +
    scored.map(({ n, rs }) => {
      const g = lordGuide.get(n);
      return `<div class="panel pick"><div class="pick-lord">${esc(n)}</div><div class="pick-routes">
        <div class="small muted">${esc(g?.one || '')}</div>
        ${rs.length ? rs.slice(0, 3).map(({ r, fit, why }) => `<div class="pick-route">${fitBar(fit)}<a href="#/route/${r.id}">${esc(r.name)}</a><span class="small muted">${esc(why)}</span></div>`).join('')
          : '<div class="small">没有专门的路线：按来牌走任意路线，棋手技能当作补充。</div>'}
      </div></div>`;
    }).join('');
}
function routeCard(r) {
  const h = IDX.hero.get(r.carry.split(/[ /→]/)[0]);
  return `<a class="rc fac" data-f="${esc(facOf(r))}" href="#/route/${r.id}">
    <span class="rc-img">${img(h?.img, r.carry)}</span>
    <span><span class="rc-name">${esc(r.name)} ${r.badge ? `<span class="chip ${r.badge.includes('新') ? 'chip-new' : ''}">${esc(r.badge)}</span>` : ''}</span>
    <span class="rc-sub">${esc(r.sub)} · 主核 ${esc(r.carry)} · ${esc(r.stats.cost)}</span>
    <span class="rc-tag">${esc(r.tagline)}</span>
    <span class="row">${r.lords.filter((l) => l.fit === 3).map((l) => `<span class="chip chip-gold">${esc(l.name)}</span>`).join('')}</span></span></a>`;
}
function moduleBlock(m) {
  return `<details class="panel"><summary><b style="font-family:var(--display);font-size:19px;font-weight:400">${esc(m.name)}</b> <span class="small muted">${esc(m.when)}</span></summary>
    ${m.body.map((p) => `<p>${esc(p)}</p>`).join('')}${m.risk ? `<p class="small muted">冲突：${esc(m.risk)}</p>` : ''}</details>`;
}

// ── 路线列表 ─────────────────────────────
function routesPage() {
  view.innerHTML = `<h1 class="h-display">打法</h1>
  <p class="lede">每条路线都拆成：它靠哪种事件赚等级、谁接收、每回合买什么、缺牌时往哪转。数值全部来自卡面事件计数，不是胜率。</p>
  <div class="route-cards" style="margin-top:16px">${ROUTES.map(routeCard).join('')}</div>
  <h2 class="h-section">模块</h2><div class="stack">${MODULES.map(moduleBlock).join('')}</div>`;
}

// ── 路线详情 ─────────────────────────────
const TABS = [['rounds', '逐回合'], ['sim', '模拟一局'], ['math', '为什么强'], ['pivot', '转型'], ['board', '站位'], ['talent', '天赋装备'], ['lords', '棋手'], ['counter', '克制']];
function routePage(r, tab) {
  const h = IDX.hero.get(r.carry.split(/[ /→]/)[0]);
  view.innerHTML = `<header class="route-head fac" data-f="${esc(facOf(r))}">
    <div class="route-title"><span class="rc-img">${img(h?.img, r.carry)}</span>
      <div><div class="eyebrow">${esc(r.faction)} · ${esc(r.sub)}</div><h1>${esc(r.name)}</h1>
      <div class="row" style="margin-top:4px">${r.badge ? `<span class="chip ${r.badge.includes('新') ? 'chip-new' : ''}">${esc(r.badge)}</span>` : ''}<span class="chip">主核 ${esc(r.carry)}</span></div></div></div>
    <p class="lede" style="margin:0">${esc(r.tagline)}</p>
    <p class="route-verdict">${esc(r.verdict)}</p>
    <div class="row stat-chips"><span class="chip">成本 · ${esc(r.stats.cost)}</span><span class="chip">竞争 · ${esc(r.stats.contest)}</span><span class="chip">操作 · ${esc(r.stats.ops)}</span><span class="chip">${esc(r.stats.power)}</span></div>
    <div class="core-strip">${r.core.map((c) => `<div class="cs">${av(c.h, { size: 'av-sm' })}<span class="cs-role">${esc(c.role)}</span></div>`).join('')}</div>
    <div class="row"><a class="btn btn-gold" href="#/play/${r.id}">对局中跟打这条</a><span class="small muted">最适合：${r.lords.filter((l) => l.fit >= 2).map((l) => esc(l.name)).join('、')}</span></div>
  </header>
  <div class="tabs" role="tablist">${TABS.filter(([k]) => k !== 'sim' || SIMS[r.id]).map(([k, t]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</div>
  <div id="tab" role="tabpanel"></div>`;
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    history.replaceState(null, '', `#/route/${r.id}?t=${b.dataset.tab}`);
    $$('.tabs [data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    renderTab(r, b.dataset.tab);
  });
  renderTab(r, tab);
}
function renderTab(r, tab) {
  const box = $('#tab');
  if (tab === 'rounds') box.innerHTML = `<p class="small muted" style="margin:14px 0 0">左侧：回合 · 该回合收入 · 目标棋手等级 · 人口。头像左上角数字 = 购买优先级。拍卖行的数字是出价上限。</p><div class="track">${PHASES.map((p, i) => phaseRow(r, p, i)).join('')}</div>`;
  else if (tab === 'sim' && SIMS[r.id]) box.innerHTML = simView(SIMS[r.id]);
  else if (tab === 'lords') box.innerHTML = `<h2 class="h-section">哪个棋手最配</h2><div class="stack">${r.lords.map((l) => `<div class="panel pick-route">${fitBar(l.fit)}<b style="font-family:var(--display);font-size:19px;font-weight:400">${esc(l.name)}</b><span class="small">${esc(l.why)}</span></div>`).join('')}</div>`;
  else if (tab === 'math') box.innerHTML = `<h2 class="h-section">每个位置在干什么</h2>
    <div class="core-grid">${r.core.map((c) => `<div class="core-item">${av(c.h, { size: 'av-sm' })}<div><div class="core-role">${esc(c.role)}</div><div class="core-name">${esc(c.h)}</div><div class="core-note">${esc(c.note)}</div></div></div>`).join('')}</div>
    <h2 class="h-section">主核等级走势<small>卡面事件计数估算，不是实测</small></h2>
    <div class="panel">${ruler(r.curve)}<div class="legend"><span><i></i>顺利</span><span><i class="avg"></i>一般</span><span>${esc(r.curve.note)}</span></div></div>
    <h2 class="h-section">每回合收入怎么来</h2><div class="math">${r.math.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    <p class="total">${esc(r.math.total)}</p><p class="assume">假设：${r.math.assume.map(esc).join('；')}</p>`;
  else if (tab === 'pivot') box.innerHTML = `<h2 class="h-section">什么时候转、转去哪</h2><div class="stack">${r.pivots.map((p) => `<div class="pivot"><div class="pivot-when">${esc(p.when)}</div><div>${esc(p.how)}</div>${p.to ? `<a href="#/route/${p.to}">→ ${esc(routeById.get(p.to).name)}</a>` : ''}</div>`).join('')}</div>`;
  else if (tab === 'board') box.innerHTML = `<h2 class="h-section">决赛站位<small>4 行 × 7 列，上方是前排</small></h2>${board(r)}<p class="small" style="max-width:520px">${esc(r.boardNote)}</p>`;
  else if (tab === 'talent') box.innerHTML = `<h2 class="h-section">天赋</h2><div class="cols">
      <div><div class="eyebrow">必拿</div><div class="tlist must">${r.talents.must.map((t) => chipCard(t)).join('')}</div>
      <div class="eyebrow" style="margin-top:12px">好</div><div class="tlist">${r.talents.good.map((t) => chipCard(t)).join('')}</div>
      ${r.talents.avoid.length ? `<div class="eyebrow" style="margin-top:12px">别拿</div><div class="tlist avoid">${r.talents.avoid.map((t) => chipCard(t)).join('')}</div>` : ''}</div>
      <p class="small">${esc(r.talents.note)}</p></div>
    <h2 class="h-section">主核装备</h2><div class="tlist">${r.gear.map((g) => chipCard(g.replace(/（.*）/, ''))).join('')}</div>${r.gearNote ? `<p class="small">${esc(r.gearNote)}</p>` : ''}`;
  else if (tab === 'counter') box.innerHTML = `<h2 class="h-section">克制关系</h2><div class="cols"><div class="panel"><div class="eyebrow">怕</div><ul>${r.counters.weak.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="panel"><div class="eyebrow">打得过</div><ul>${r.counters.strong.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
}
function simView(sim) {
  const rows = sim.rows.map((x) => `<section class="ph ${x.r.startsWith('拍') ? 'auction' : ''}"><div class="ph-gut"><span class="ph-id">${esc(x.r)}</span>${x.income ? `<div class="ph-meta">+${x.income} 能</div>` : ''}</div>
    <div class="ph-body"><div class="ledger-top"><span class="chip">余 <b class="mono">${x.e}</b> 能</span><span class="chip">L${x.lv} <span class="mono">${esc(x.xp)}</span></span><span class="chip">血 <b class="mono">${x.hp}</b></span>${x.hx ? `<span class="chip chip-gold">韩信 <b class="mono">${x.hx}</b> 级</span>` : ''}${x.win ? '' : '<span class="chip" style="color:var(--danger)">输</span>'}</div>
    <ul class="ledger">${x.acts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div></section>`).join('');
  const br = sim.branches.map((b) => `<div class="pivot"><div class="pivot-when">${esc(b.at)}：${esc(b.what)}</div><div>${esc(b.then)}</div></div>`).join('');
  return `<h2 class="h-section">${esc(sim.title)}</h2><p class="small muted">${sim.assume.map(esc).join('；')}。</p><div class="track">${rows}</div>
    <h2 class="h-section">这一局在哪里可能走偏</h2><div class="stack">${br}</div>`;
}
function pips(e) { return `<span class="pips" aria-label="${e} 能量">${'<i></i>'.repeat(e)}</span>`; }
function phaseRow(r, p, i, now = -1) {
  const d = r.phases[p.id] || {};
  const cls = ['ph', p.auction ? 'auction' : '', i === now ? 'now' : ''].join(' ');
  const gut = p.auction ? `<span class="ph-id">${esc(p.id)}</span><div class="ph-meta">${esc(p.auction)}</div>`
    : `<span class="ph-id">${esc(p.id)}</span>${pips(p.e)}<div class="ph-meta">${p.e} 能 · ${esc(p.lv)}<br>${p.pop} 人</div>`;
  let body = '';
  if (p.auction) body += d.targets ? `<div class="lots">${d.targets.map(lot).join('')}</div>` : '';
  else if (d.buy?.length) body += `<div class="ph-row"><b>买</b><div class="avs">${d.buy.map((n, k) => av(n, { size: 'av-sm', rank: k + 1 })).join('')}</div></div>`;
  if (d.do?.length) body += `<div class="ph-row"><b>做</b><ul>${d.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  if (d.if?.length) body += `<div class="ph-row if"><b>若</b><ul>${d.if.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `<section class="${cls}" id="ph-${esc(p.id)}"><div class="ph-gut">${gut}</div><div class="ph-body">${body || '<span class="muted small">按上回合计划继续。</span>'}</div></section>`;
}
function lot(t) {
  return `<div class="lot">${av(t.h, { size: 'av-sm' })}<div><div class="lot-cap">≤ ${t.cap} 能</div>${t.note ? `<div class="lot-note">${esc(t.note)}</div>` : ''}</div></div>`;
}
function ruler(curve) {
  const W = 440, H = 260, L = 36, R = 44, T = 12, B = 28;
  const xs = [...curve.good, ...curve.avg].map((p) => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.log(5), y1 = Math.log(500);
  const X = (r) => L + ((r - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (Math.log(Math.max(5, v)) - y0) / (y1 - y0)) * (H - T - B);
  const line = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  let s = `<svg class="ruler" viewBox="0 0 ${W} ${H}" role="img" aria-label="主核等级估算：顺利 ${curve.good.map((p) => 'R' + p[0] + ' ' + p[1]).join('，')}">`;
  for (let r = x0; r <= x1; r++) s += `<line class="grid" x1="${X(r)}" x2="${X(r)}" y1="${T}" y2="${H - B}"/><text class="axis" x="${X(r)}" y="${H - 8}" text-anchor="middle">R${r}</text>`;
  for (const n of [10, 40, 100, 300]) s += `<line class="node" x1="${L}" x2="${W - R}" y1="${Y(n)}" y2="${Y(n)}"/><text class="node-l" x="${L - 6}" y="${Y(n) + 4}" text-anchor="end">${n}</text>`;
  s += `<path class="avg" d="${line(curve.avg)}"/><path class="good" d="${line(curve.good)}"/>`;
  curve.good.forEach((p) => { s += `<circle class="pt-good" cx="${X(p[0])}" cy="${Y(p[1])}" r="3"/>`; });
  const g = curve.good.at(-1), a = curve.avg.at(-1);
  s += `<text class="end" x="${X(g[0]) + 8}" y="${Y(g[1]) + 4}" fill="var(--azure)">${g[1]}</text><text class="end" x="${X(a[0]) + 8}" y="${Y(a[1]) + 4}" fill="var(--ink-3)">${a[1]}</text>`;
  return s + '</svg>';
}
function board(r) {
  const cells = [];
  for (let row = 1; row <= 4; row++) for (let c = 1; c <= 7; c++) {
    const u = r.board.find((b) => b.r === row && b.c === c);
    cells.push(`<div class="cell">${u ? av(u.h) : ''}</div>`);
  }
  return `<div class="board-wrap"><div class="board-label"><span>↑ 前排（靠近敌人）</span><span>第 1–7 列</span></div><div class="board">${cells.join('')}</div><div class="board-label"><span>↓ 后排</span></div></div>`;
}

// ── 跟打 ─────────────────────────────
function playPage(arg) {
  const saved = store.get('play', { route: 'hanxin-zhengbei', idx: 0 });
  const rid = routeById.has(arg) ? arg : saved.route;
  const r = routeById.get(rid) || ROUTES[0];
  let idx = saved.route === r.id ? saved.idx : 0;
  const draw = () => {
    store.set('play', { route: r.id, idx });
    const p = PHASES[idx];
    const d = r.phases[p.id] || {};
    const checks = store.get('checks', {});
    const mine = checks[r.id]?.[p.id] || [];
    view.innerHTML = `<div class="play-bar"><select id="route-select" aria-label="路线">${ROUTES.map((x) => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button class="btn" type="button" id="reset">新一局</button></div>
      <div class="dial" role="tablist" aria-label="回合">${PHASES.map((q, i) => `<button type="button" data-i="${i}" class="${q.auction ? 'auc' : ''}" ${i === idx ? 'aria-current="step"' : ''}>${esc(q.id)}</button>`).join('')}</div>
      <section class="stage">
        <div class="stage-head"><span class="stage-id">${esc(p.id)}</span>
          ${p.auction ? `<span class="chip chip-gold">拍卖 · ${esc(p.auction)}</span>` : `<div class="stage-meta"><span><b>${p.e}</b> 能量</span><span><b>${esc(p.lv)}</b></span><span><b>${p.pop}</b> 人</span></div>`}</div>
        ${p.auction && d.targets ? `<h3>出价（上限）</h3><div class="lots">${d.targets.map(lot).join('')}</div>` : ''}
        ${!p.auction && d.buy?.length ? `<h3>按顺序找</h3><div class="avs">${d.buy.map((n, k) => av(n, { rank: k + 1, size: 'av-lg' })).join('')}</div>` : ''}
        ${d.do?.length ? `<h3>要做</h3><ul class="checks">${d.do.map((x, k) => `<li><label><input type="checkbox" data-k="${k}" ${mine[k] ? 'checked' : ''}><span>${esc(x)}</span></label></li>`).join('')}</ul>` : ''}
        ${d.if?.length ? `<h3>如果</h3><div class="ph-row if" style="grid-template-columns:1fr"><ul>${d.if.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${!d.do?.length && !d.buy?.length && !d.targets ? '<p class="muted">按上回合计划继续。</p>' : ''}
      </section>
      <div class="quick"><button class="btn" type="button" data-tool="talent">天赋三选一</button><button class="btn" type="button" data-tool="pivot">缺牌怎么转</button><button class="btn" type="button" data-tool="counter">事件计数</button></div>
      <div class="play-nav"><button class="btn" type="button" id="prev" ${idx === 0 ? 'disabled' : ''}>← ${idx > 0 ? esc(PHASES[idx - 1].id) : ''}</button><button class="btn btn-primary" type="button" id="next" ${idx === PHASES.length - 1 ? 'disabled' : ''}>${idx < PHASES.length - 1 ? esc(PHASES[idx + 1].id) : '终局'} →</button></div>`;
    $('#route-select').onchange = (e) => { location.hash = '#/play/' + e.target.value; };
    $('#reset').onclick = () => { const c = store.get('checks', {}); delete c[r.id]; store.set('checks', c); idx = 0; draw(); };
    $('.dial').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { idx = +b.dataset.i; draw(); } };
    $('#prev').onclick = () => { if (idx > 0) { idx--; draw(); } };
    $('#next').onclick = () => { if (idx < PHASES.length - 1) { idx++; draw(); } };
    $$('.checks input').forEach((el) => el.onchange = () => {
      const c = store.get('checks', {}); c[r.id] = c[r.id] || {}; const arr = c[r.id][p.id] || []; arr[+el.dataset.k] = el.checked; c[r.id][p.id] = arr; store.set('checks', c);
    });
    $('.quick').onclick = (e) => { const b = e.target.closest('[data-tool]'); if (!b) return; if (b.dataset.tool === 'talent') talentTool(r); else if (b.dataset.tool === 'pivot') pivotSheet(r); else counterTool(); };
    const cur = $('.dial [aria-current]'); cur?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  if (arg !== r.id) history.replaceState(null, '', '#/play/' + r.id);
  draw();
}
function pivotSheet(r) {
  openSheet(`<h2 id="sheet-title" class="h-section" style="margin-top:0">${esc(r.name)}：转型条件</h2><div class="stack">${r.pivots.map((p) => `<div class="pivot"><div class="pivot-when">${esc(p.when)}</div><div>${esc(p.how)}</div>${p.to ? `<a href="#/play/${p.to}">→ 改跟 ${esc(routeById.get(p.to).name)}</a>` : ''}</div>`).join('')}</div>`);
}

// ── 工具：天赋三选一 ─────────────────────
function scoreTalent(name, r) {
  const g = TALENT_NOTES[name];
  const base = g ? g[0] : 0.5;
  if (r) {
    if (r.talents.must.includes(name)) return { s: 4 + base / 10, why: `${r.name}必拿。` + (g ? g[1] : '') };
    if (r.talents.good.includes(name)) return { s: 3 + base / 10, why: `${r.name}里好用。` + (g ? g[1] : '') };
    if (r.talents.avoid.includes(name)) return { s: -1, why: `${r.name}里别拿。` + (r.talents.note || '') };
  }
  return { s: base, why: g ? g[1] : (IDX.talent.get(name)?.text || '') };
}
function talentTool(r) {
  const names = DB.talents.map((t) => t.name);
  openSheet(`<h2 id="sheet-title" class="h-section" style="margin-top:0">天赋三选一</h2>
    <div class="fields"><div class="field"><label for="tr">当前路线</label><select id="tr"><option value="">不确定</option>${ROUTES.map((x) => `<option value="${x.id}" ${r && x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    ${[1, 2, 3].map((i) => `<div class="field"><label for="t${i}">天赋 ${i}</label><input id="t${i}" list="tl" autocomplete="off" placeholder="输入名字"></div>`).join('')}</div>
    <datalist id="tl">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div id="tout" class="result-rank"><p class="muted small">输入商店里给你的三个天赋，按当前路线排序。</p></div>`);
  const run = () => {
    const rr = routeById.get($('#tr').value);
    const picks = [1, 2, 3].map((i) => $('#t' + i).value.trim()).filter((n) => IDX.talent.has(n));
    if (!picks.length) return;
    const ranked = picks.map((n) => ({ n, ...scoreTalent(n, rr) })).sort((a, b) => b.s - a.s);
    $('#tout').innerHTML = ranked.map((x, i) => `<div class="rank-item ${i === 0 ? 'top' : ''}"><span class="rank-n">${i + 1}</span><div><b>${esc(x.n)}</b><div class="small">${esc(x.why)}</div><div class="small muted">${esc(IDX.talent.get(x.n).text)}</div></div></div>`).join('');
  };
  $$('#sheet input, #sheet select').forEach((el) => el.addEventListener('input', run));
}

// ── 工具：事件计数（韩信 / 朵莉亚 / 张良） ──────
function counterTool() {
  openSheet(`<h2 id="sheet-title" class="h-section" style="margin-top:0">事件计数：一回合给主核多少永久等级</h2>
  <p class="small muted">按卡面把整备、开团事件数出来。用来回答「再上一个整备源值不值」。</p>
  <div class="fields">
    <div class="field"><label for="c-zb">普通整备英雄</label><input id="c-zb" type="number" min="0" max="7" value="3"></div>
    <div class="field"><label for="c-zb2">觉醒整备英雄（触发 2 次）</label><input id="c-zb2" type="number" min="0" max="7" value="0"></div>
    <div class="field"><label for="c-kt">其他开团英雄</label><input id="c-kt" type="number" min="0" max="7" value="1"></div>
    <div class="field"><label for="c-ya">雅典娜</label><select id="c-ya"><option value="0">无</option><option value="1" selected>普通（触发 2 整备）</option><option value="2">觉醒（触发 4）</option></select></div>
    <div class="field"><label for="c-hx">韩信</label><select id="c-hx"><option value="2" selected>普通（+2）</option><option value="4">觉醒（+4）</option></select></div>
    <div class="field"><label for="c-dl">朵莉亚</label><select id="c-dl"><option value="0">无</option><option value="1" selected>普通（随机 3 人）</option><option value="2">觉醒（全员）</option></select></div>
    <div class="field"><label for="c-yl">亚连（给装备最多者）</label><select id="c-yl"><option value="0">无</option><option value="1" selected>普通</option><option value="2">觉醒</option></select></div>
    <div class="field"><label for="c-n">场上人数</label><input id="c-n" type="number" min="1" max="9" value="7"></div>
    <div class="field"><label for="c-fs">姜导封神在韩信</label><select id="c-fs"><option value="0" selected>否</option><option value="1">是</option></select></div>
  </div>
  <div class="panel" style="margin-top:12px"><div class="eyebrow">韩信每回合永久等级</div><div class="big-out" id="c-out">—</div><div class="small" id="c-detail"></div></div>`);
  const v = (id) => +$('#' + id).value || 0;
  const run = () => {
    const zbN = v('c-zb'), zbA = v('c-zb2'), kt = v('c-kt'), ya = v('c-ya'), hx = v('c-hx'), dl = v('c-dl'), yl = v('c-yl'), n = Math.max(1, v('c-n')), fs = v('c-fs');
    const zbHeroes = zbN + zbA;
    const yaZb = ya ? Math.min(ya * 2, zbHeroes) : 0; // 雅典娜只能选场上的日落海整备英雄
    const zb = zbN + zbA * 2 + yaZb;
    const ktEv = kt + (ya ? 1 : 0);
    const hxGain = (zb + ktEv) * hx;
    const ylTimes = yl ? (1 + (zbHeroes ? yaZb / zbHeroes : 0)) * yl : 0; // 亚连本身算在整备英雄里
    const ylGain = ylTimes * 2;
    const dlGain = dl === 2 ? zb : dl === 1 ? zb * Math.min(3, n) / n : 0;
    const events = zb + ktEv + (ylTimes > 0 ? ylTimes : 0) + (dl === 2 ? zb : dl === 1 ? zb * Math.min(3, n) / n : 0);
    const fsGain = fs ? events : 0;
    const total = hxGain + ylGain + dlGain + fsGain;
    $('#c-out').textContent = '+' + total.toFixed(1);
    $('#c-detail').innerHTML = `整备 ${zb} 次 · 开团 ${ktEv} 次<br>韩信自身 +${hxGain} · 亚连 +${ylGain.toFixed(1)} · 朵莉亚 +${dlGain.toFixed(1)}${fs ? ` · 封神 +${fsGain.toFixed(1)}` : ''}<br><span class="muted">「触发 2 次」按 2 个事件计；雅典娜抽不重复的整备英雄。</span>`;
  };
  $$('#sheet input, #sheet select').forEach((el) => el.addEventListener('input', run));
  run();
}

// ── 查牌 ─────────────────────────────
const KINDS = [['hero', '英雄'], ['talent', '天赋'], ['effect', '效果牌'], ['equip', '装备'], ['lord', '棋手']];
const FACS = ['全部', '河洛', '逐鹿', '日落海', '三分之地', '大河流域', '无阵营'];
let cardState = { kind: 'hero', fac: '全部', q: '' };
function cardsPage(q) {
  if (q.get('k')) cardState.kind = q.get('k');
  view.innerHTML = `<h1 class="h-display">查牌</h1>
  <div class="search"><input id="cq" type="search" placeholder="名字或效果里的字：整备、复生、古币…" value="${esc(cardState.q)}" aria-label="搜索">
    <div class="seg" id="ck">${KINDS.map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === cardState.kind}">${t}</button>`).join('')}</div>
    <div class="seg" id="cf" ${cardState.kind === 'hero' ? '' : 'hidden'}>${FACS.map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === cardState.fac}">${f}</button>`).join('')}</div></div>
  <div id="clist" class="cardlist"></div>`;
  const draw = () => {
    const list = listFor(cardState.kind).filter((c) => {
      if (cardState.kind === 'hero' && cardState.fac !== '全部' && c.faction !== cardState.fac) return false;
      if (!cardState.q) return true;
      const hay = c.name + (c.text || '') + (c.awake || '') + (HERO_NOTES[c.name]?.[1] || '') + (c.stages ? JSON.stringify(c.stages) : '');
      return hay.includes(cardState.q);
    });
    $('#clist').innerHTML = list.length ? list.slice(0, 300).map(cardItem).join('') : '<p class="muted">没有匹配。试试效果里的关键词，比如「整备」。</p>';
  };
  $('#cq').addEventListener('input', (e) => { cardState.q = e.target.value.trim(); draw(); });
  $('#ck').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; cardState.kind = b.dataset.k; $$('#ck button').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#cf').hidden = cardState.kind !== 'hero'; draw(); };
  $('#cf').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; cardState.fac = b.dataset.f; $$('#cf button').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); };
  draw();
}
function listFor(kind) {
  if (kind === 'hero') return [...DB.heroes].sort((a, b) => a.tier - b.tier || a.faction.localeCompare(b.faction));
  if (kind === 'talent') return [...DB.talents].sort((a, b) => (TALENT_NOTES[b.name]?.[0] ?? -1) - (TALENT_NOTES[a.name]?.[0] ?? -1) || a.tier - b.tier);
  if (kind === 'effect') return [...DB.effects].sort((a, b) => a.tier - b.tier);
  if (kind === 'equip') return [...DB.equipment].sort((a, b) => a.tier - b.tier);
  return DB.lords.map((l) => ({ ...l, text: lordGuide.get(l.name)?.one || '' }));
}
function cardItem(c) {
  const note = HERO_NOTES[c.name]?.[1] || (IDX.talent.has(c.name) ? TALENT_NOTES[c.name]?.[1] : '') || '';
  return `<button type="button" class="ci fac" data-f="${esc(c.faction || '')}" data-card="${esc(c.name)}">
    <span class="ci-img">${img(c.img, c.name)}</span>
    <span><span class="ci-name">${esc(c.name)} ${c.tier ? `<span class="chip">${c.tier} 阶</span>` : ''}${HERO_NOTES[c.name] ? `<span class="chip">${esc(HERO_NOTES[c.name][0])}</span>` : ''}</span>
    <span class="ci-text">${esc(c.text)}</span>${note ? `<span class="ci-note">${esc(note)}</span>` : ''}</span></button>`;
}

// ── 卡牌详情 ─────────────────────────────
function routesUsing(name) {
  return ROUTES.filter((r) => r.core.some((c) => c.h === name) || Object.values(r.phases).some((p) => p.buy?.includes(name) || p.targets?.some((t) => t.h === name)) || r.talents.must.includes(name) || r.talents.good.includes(name));
}
function openCard(name) {
  const f = find(name);
  if (!f) return;
  const { kind, c } = f;
  const uses = routesUsing(name);
  let body = `<div class="detail-head fac" data-f="${esc(c.faction || '')}"><span class="ci-img">${img(c.img, name)}</span><div><div class="eyebrow">${kind === 'hero' ? `${c.tier} 阶英雄 · ${esc(c.faction)}` : kind === 'talent' ? `${c.tier} 阶天赋` : kind === 'effect' ? `${c.tier} 阶效果牌 · ${c.cost ?? '?'} 能量` : kind === 'equip' ? '装备' : '棋手'}</div><h2 id="sheet-title">${esc(name)}</h2>${c.kw?.length ? `<div class="row">${c.kw.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}</div></div><div class="kv">`;
  const note = kind === 'hero' ? HERO_NOTES[name] : kind === 'talent' && TALENT_NOTES[name] ? ['天赋', TALENT_NOTES[name][1]] : null;
  if (note) body += `<p class="verdict"><b>${esc(note[0])}</b>${esc(note[1])}</p>`;
  if (c.text) body += `<div><h4>${kind === 'hero' ? '卡牌效果' : '效果'}</h4><p>${esc(c.text)}</p></div>`;
  if (c.awake) body += `<div><h4>觉醒</h4><p>${esc(c.awake)}</p></div>`;
  if (c.skills) c.skills.forEach((s) => { body += `<div><h4>技能 · ${esc(s.name)}</h4><p>${esc(s.text)}</p><div class="nodes" style="margin-top:6px">${s.nodes.map((n) => `<div class="node-row"><span class="node-lv">${n.lv}</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>`; });
  if (c.stats) body += `<div><h4>基础属性（1 级）</h4><p class="mono small">生命 ${c.stats.hp} · 物攻 ${c.stats.atk} · 法攻 ${c.stats.ap} · 距离 ${c.stats.range} · 蓝 ${c.stats.mana0}/${c.stats.mana}</p></div>`;
  if (c.rel?.length) body += `<div><h4>关联</h4>${c.rel.map((x) => `<p class="small"><b>${esc(x.name)}</b>：${esc(x.text)}</p>`).join('')}</div>`;
  if (c.stages) {
    const g = lordGuide.get(name);
    if (g) body += `<p class="verdict"><b>${g.tier}</b>${esc(g.one)}</p><div><h4>怎么用</h4><p class="small"><b>技能</b> ${esc(g.skill)}</p><p class="small"><b>秘技</b> ${esc(g.secret)}</p><p class="small"><b>专属</b> ${esc(g.ult)}</p></div>`;
    body += c.stages.map((s) => `<div><h4>${esc(s.stage)}</h4>${s.cards.map((x) => `<p class="small"><b>${esc(x.name)}</b>：${esc(x.text)}</p>`).join('')}</div>`).join('');
  }
  if (uses.length) body += `<div><h4>出现在这些路线</h4><div class="row">${uses.map((r) => `<a class="chip chip-gold" href="#/route/${r.id}">${esc(r.name)}</a>`).join('')}</div></div>`;
  openSheet(body + '</div>');
}
function openSheet(html) {
  sheetBody.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.querySelector('.sheet-inner').scrollTop = 0;
}
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close')) sheet.close(); if (e.target.closest('a[href^="#"]')) sheet.close(); });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-card]');
  if (b && !e.defaultPrevented) { e.preventDefault(); openCard(b.dataset.card); }
});

// ── 原理 ─────────────────────────────
function rulesPage(section) {
  view.innerHTML = `<h1 class="h-display">原理</h1>
  <p class="lede">先把游戏的资源循环想清楚，再谈阵容。下面每一条都能直接改变你在商店里的选择。</p>
  <h2 class="h-section" id="patch">${esc(PATCH.title)}</h2>
  <p>${esc(PATCH.lead)}</p>
  <div class="patch-list">${PATCH.changes.map((c) => `<div class="patch-item"><b>${esc(c.what)}</b><div><div class="patch-diff">${c.from ? `<del>${esc(c.from)}</del> → ` : ''}<ins>${esc(c.to)}</ins></div><div class="small muted">${esc(c.impact)}</div>${c.route ? `<a class="small" href="#/route/${c.route}">相关路线：${esc(routeById.get(c.route).name)}</a>` : ''}</div></div>`).join('')}</div>
  <h2 class="h-section" id="logic">底层逻辑</h2>
  <div class="principles">${PRINCIPLES.map((p) => `<article class="pr" id="p-${p.id}"><h3>${esc(p.title)}</h3><div class="pr-short">${esc(p.short)}</div>${p.body.map((x) => `<p>${esc(x)}</p>`).join('')}</article>`).join('')}</div>
  <h2 class="h-section" id="lords">19 位棋手<small>机制评级，不是胜率</small></h2>
  <div class="lord-guide">${LORDS.map((g) => { const l = IDX.lord.get(g.name); return `<article class="lg"><div class="lg-head">${l?.img ? `<img src="${esc(l.img)}" alt="" loading="lazy">` : `<span class="lord-mono">${esc(g.name[0])}</span>`}<span class="lg-name">${esc(g.name)}</span><span class="lg-tier">${g.tier}</span></div>
    <p>${esc(g.one)}</p><p><b>技能</b>${esc(g.skill)}</p><p><b>秘技</b>${esc(g.secret)}</p><p><b>专属</b>${esc(g.ult)}</p>
    ${g.routes.length ? `<div class="row">${g.routes.map((id) => `<a class="chip chip-gold" href="#/route/${id}">${esc(routeById.get(id).name)}</a>`).join('')}</div>` : ''}</article>`; }).join('')}</div>
  <h2 class="h-section" id="facts">规则与数字<small>可信度 ●●● 官方 · ●● 多源一致 · ● 单一来源</small></h2>
  <div class="panel scroll-x"><table class="facts"><tbody>${FACTS.map((f) => `<tr><th>${esc(f.k)}</th><td>${esc(f.v)}<div class="small muted">${esc(f.src)}</div></td><td class="conf">${'●'.repeat(f.c)}</td></tr>`).join('')}</tbody></table></div>
  <h2 class="h-section" id="unknown">还不知道的</h2>
  <div class="panel"><ul>${UNKNOWNS.map((u) => `<li>${esc(u)}</li>`).join('')}</ul><p class="small muted">数据：${esc(DB.meta.source)}，快照 ${esc(DB.meta.snapshot)}。游戏素材版权归腾讯，本站为非官方玩家研究。</p></div>`;
  if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
}

// ── 启动 ─────────────────────────────
fetch('data/cards.json').then((r) => r.json()).then((d) => {
  DB = d;
  d.heroes.forEach((c) => IDX.hero.set(c.name, c));
  d.talents.forEach((c) => IDX.talent.set(c.name, c));
  d.effects.forEach((c) => IDX.effect.set(c.name, c));
  d.equipment.forEach((c) => IDX.equip.set(c.name, c));
  d.lords.forEach((c) => IDX.lord.set(c.name, c));
  window.addEventListener('hashchange', render);
  view.addEventListener('click', onLordClick);
  render();
}).catch(() => { view.innerHTML = '<p>卡牌数据没有载入。刷新页面重试；本地打开需要用 HTTP 服务（见 README）。</p>'; });
