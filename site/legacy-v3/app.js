import { PHASES, ROUTES, TRAPS, MODULES } from './data/routes.js';
import { BAN_PICKS, PATCH, PRINCIPLES, FACTS, UNKNOWNS, LORDS } from './data/guide.js';
import { HERO_NOTES, TALENT_NOTES } from './data/notes.js';
import { SIMS } from './data/sims.js';
import { META } from './data/meta.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
const FACS = ['河洛', '逐鹿', '日落海', '三分之地', '大河流域'];
const FAC_SHORT = { 河洛: '河洛', 逐鹿: '逐鹿', 日落海: '日落海', 三分之地: '三分', 大河流域: '大河' };
const BAN_ART = { 河洛: '花木兰', 逐鹿: '嬴政', 日落海: '露娜', 三分之地: '诸葛亮', 大河流域: '瑶', 未知: '太乙真人' };

// ── 数据 ─────────────────────────────
let DB = null;
let ART = { card: {}, lord: {} };
const IDX = { hero: new Map(), talent: new Map(), effect: new Map(), equip: new Map(), lord: new Map() };
const routeById = new Map(ROUTES.map((r) => [r.id, r]));
const lordGuide = new Map(LORDS.map((l) => [l.name, l]));
const lordStat = new Map(META.lords.map((l) => [l.name, l]));
const trapByMeta = new Map(TRAPS.map((t) => [t.meta, t]));

function find(name) {
  for (const kind of ['hero', 'effect', 'talent', 'equip', 'lord']) {
    const c = IDX[kind].get(name);
    if (c) return { kind, c };
  }
  return null;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('wx3.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wx3.' + k, JSON.stringify(v)); } catch { /* 忽略 */ } },
};
function fam(meta) { return META.families[meta]; }
function famBan(meta, ban) { return ban && META.byBan[ban] ? META.byBan[ban][meta] : null; }
function mainForm(meta) { return fam(meta)?.forms[0]; }
function bestForm(meta) {
  const f = fam(meta);
  if (!f) return null;
  const cands = f.forms.filter((x) => x.games >= 200);
  const b = cands.sort((a, c) => a.avg - c.avg)[0];
  return b && b !== f.forms[0] && b.avg < f.forms[0].avg - 0.15 ? b : null;
}
function lordShares(meta) {
  const f = fam(meta);
  if (!f) return [];
  const acc = new Map();
  for (const form of f.forms) for (const [n, pct] of form.lords) acc.set(n, (acc.get(n) || 0) + pct * form.games);
  return [...acc.entries()].map(([n, v]) => [n, Math.round((v / f.games) * 10) / 10]).sort((a, b) => b[1] - a[1]).slice(0, 4);
}
function sortedRoutes() {
  const t = { S: 0, A: 1, B: 2 };
  return [...ROUTES].sort((a, b) => t[a.tier] - t[b.tier] || (fam(a.meta)?.avg ?? 9) - (fam(b.meta)?.avg ?? 9));
}

// ── 组件 ─────────────────────────────
function cardSrc(name) {
  for (const k of ['hero', 'effect', 'talent', 'equip']) { const p = ART.card[`${k}:${name}`]; if (p) return p; }
  return '';
}
function gcard(name, { aw = false, rank = 0, lazy = true } = {}) {
  const src = cardSrc(name);
  return `<button type="button" class="gcard" data-card="${esc(name)}" aria-label="${esc(name)}${aw ? '（觉醒）' : ''}">${src ? `<img src="${esc(src)}" alt="" ${lazy ? 'loading="lazy"' : ''} decoding="async">` : `<span class="gcard-fallback">${esc(name)}</span>`}${aw ? '<span class="aw">觉醒</span>' : ''}${rank ? `<span class="rank">${rank}</span>` : ''}</button>`;
}
function itemIcons(items) {
  return `<div class="gitems">${(items || []).map((n) => { const e = IDX.equip.get(n); return e?.img ? `<button type="button" data-card="${esc(n)}" title="${esc(n)}"><img src="${esc(e.img)}" alt="${esc(n)}" loading="lazy"></button>` : ''; }).join('')}</div>`;
}
function lineup(form, { items = true } = {}) {
  const n = form.units.length;
  return `<div class="lineup ${n <= 4 ? 'n4' : n === 6 ? 'n6' : ''}">${form.units.map((u) => `<div class="gslot">${gcard(u.h, { aw: u.aw })}${items ? itemIcons(u.items) : ''}</div>`).join('')}</div>`;
}
function av(name, { size = '' } = {}) {
  const h = IDX.hero.get(name);
  if (!h) return `<button class="chip" type="button" data-card="${esc(name)}">${esc(name)}</button>`;
  return `<button type="button" class="av fac ${size}" data-f="${esc(h.faction)}" data-card="${esc(name)}"><span class="av-img">${h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy">` : esc(name[0])}</span><span class="av-name">${esc(name)}</span></button>`;
}
function lposter(name, { pct = null, showName = true, still = false } = {}) {
  const a = ART.lord[name] || {};
  const src = a.poster || IDX.lord.get(name)?.img || '';
  const inner = `${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}${showName ? `<span class="lp-name">${esc(name)}</span>` : ''}${pct != null ? `<span class="lp-pct">${pct}%</span>` : ''}`;
  // still：放在链接或按钮里面时用 span，避免交互元素嵌套
  return still ? `<span class="lposter" aria-hidden="true">${inner}</span>` : `<button type="button" class="lposter" data-lord="${esc(name)}" aria-label="棋手 ${esc(name)}">${inner}</button>`;
}
function heroArt(name) { return IDX.hero.get(name)?.art || ''; }
function meter(avg, { label = '平均名次', sm = false } = {}) {
  if (avg == null) return `<div class="meter ${sm ? 'sm' : ''}"><div class="meter-top"><span class="meter-val">—</span><span class="meter-lbl">${esc(label)}</span></div></div>`;
  const pos = Math.max(0, Math.min(100, ((avg - 1) / 5) * 100));
  const cls = avg <= 3.1 ? 'good' : avg >= 3.6 ? 'bad' : '';
  return `<div class="meter ${sm ? 'sm' : ''}" title="平均名次 ${avg}（1 最好，6 最差，3.5 为中位）"><div class="meter-top"><span class="meter-val ${cls}">${avg.toFixed(2)}</span><span class="meter-lbl">${esc(label)}</span></div><div class="meter-track"><span class="meter-mid"></span><span class="meter-dot" style="left:${pos}%"></span></div></div>`;
}
function facOf(r) { return r.faction === '无阵营' ? '无阵营' : r.faction; }
function chipCard(name) { return `<button type="button" class="chip" data-card="${esc(name)}">${esc(name)}</button>`; }

// ── 路由 ─────────────────────────────
function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
function setNav(key) { $$('.nav a').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))); }
function render() {
  if (!DB) return;
  const { parts, q } = parse();
  const [page, arg] = parts;
  setNav(page === 'route' ? 'routes' : page || 'home');
  if (!page) home();
  else if (page === 'routes') routesPage();
  else if (page === 'route' && routeById.has(arg)) routePage(routeById.get(arg), q.get('t') || 'rounds');
  else if (page === 'lords') lordsPage();
  else if (page === 'play') playPage(arg);
  else if (page === 'cards') cardsPage();
  else if (page === 'rules') rulesPage(q.get('s'));
  else home();
  if (!q.get('s')) window.scrollTo({ top: 0 });
}

// ── 开局 ─────────────────────────────
const UNKNOWN = {
  lead: '还没看到禁用阵营？先按「哪都能打」来：明先生在每种禁法下都有 2.8 左右的路线。',
  picks: [
    { route: 'kaituan', lord: '明先生', alt: '香香', why: '8133 局 2.80：除了禁大河，任何禁法都能打。' },
    { route: 'mulan', lord: '嬴律', alt: '明先生', why: '3866 局 2.66：除了禁河洛，任何禁法都能打。' },
    { route: 'marco-pig', lord: '马可', why: '1698 局 2.93，登顶率 38%。' },
  ],
  note: '',
  avoid: ['trap-jingpig', 'haiyue-lukong', 'trap-rilou-classic', 'trap-shouyue'],
};
function home() {
  const ban = store.get('ban', null);
  view.innerHTML = `
  <section>
    <div class="eyebrow">开局 20 秒 · 顶尖玩家近 7 天 5 万局数据</div>
    <h1 class="opening-q">本局禁了<em>哪个阵营</em>？</h1>
    <div class="bans" role="group" aria-label="本局禁用阵营">
      ${FACS.map((f) => `<button type="button" class="ban fac" data-f="${f}" data-ban="${f}" aria-pressed="${ban === f}"><b>${FAC_SHORT[f]}</b><small>${esc((BAN_PICKS[f].picks[0] && routeById.get(BAN_PICKS[f].picks[0].route).name) || '')}</small>${heroArt(BAN_ART[f]) ? `<img src="${esc(heroArt(BAN_ART[f]))}" alt="">` : ''}</button>`).join('')}
      <button type="button" class="ban none" data-ban="" aria-pressed="${!ban}"><b>还不知道</b><small>先给通用解</small>${heroArt(BAN_ART['未知']) ? `<img src="${esc(heroArt(BAN_ART['未知']))}" alt="">` : ''}</button>
    </div>
  </section>
  <section id="ban-result"></section>
  <h2 class="h2">全部路线<small>点进去看逐回合买什么</small></h2>
  <div class="routes">${sortedRoutes().map(routeCard).join('')}</div>
  <h2 class="h2">先懂这三条，再看阵容</h2>
  <div class="principles">${PRINCIPLES.slice(0, 3).map(prCard).join('')}</div>
  <p><a href="#/rules">全部底层逻辑、规则与数字 →</a></p>`;
  renderBan(ban);
}
function renderBan(ban) {
  const box = $('#ban-result');
  if (!box) return;
  const cfg = ban ? BAN_PICKS[ban] : UNKNOWN;
  box.innerHTML = `<p class="verdict-lead">${esc(cfg.lead)}</p>
    <div class="picks">${cfg.picks.map((p, i) => pickCard(p, i, ban)).join('')}</div>
    ${cfg.note ? `<p class="small muted">${esc(cfg.note)}</p>` : ''}
    ${openers(cfg)}
    <h2 class="h2">这局别碰<small>数据最差或竞争最大</small></h2>
    <div class="avoid">${cfg.avoid.map((id) => avoidChip(id, ban)).join('')}</div>`;
}
// 还没定路线时：前三回合先买能进多条推荐路线的牌
function openers(cfg) {
  const score = new Map(); const users = new Map();
  cfg.picks.forEach((p) => {
    const r = routeById.get(p.route);
    ['R1', 'R2', 'R3'].forEach((id) => (r.phases[id]?.buy || []).forEach((h, i) => {
      score.set(h, (score.get(h) || 0) + (3 - i));
      if (!users.has(h)) users.set(h, new Set());
      users.get(h).add(r.name);
    }));
  });
  const top = [...score.entries()].filter(([h]) => IDX.hero.has(h)).sort((a, b) => users.get(b[0]).size - users.get(a[0]).size || b[1] - a[1]).slice(0, 6);
  if (!top.length) return '';
  return `<h2 class="h2">还没决定走哪条？<small>前三回合先买这些，它们能进多条推荐路线</small></h2>
    <div class="buycards open">${top.map(([h]) => `<div class="cg">${gcard(h)}<div class="cg-note">${esc([...users.get(h)].join(' · '))}</div></div>`).join('')}</div>`;
}
function pickCard(p, i, ban) {
  const r = routeById.get(p.route);
  const fb = famBan(r.meta, ban) || fam(r.meta);
  const form = mainForm(r.meta);
  return `<article class="pick ${i === 0 ? 'first' : ''} fac" data-f="${esc(facOf(r))}"><span class="pick-n">${i + 1}</span>
    <div class="pick-lord">${lposter(p.lord)}${p.alt ? `<span class="alt">或 ${esc(p.alt)}</span>` : ''}</div>
    <div class="pick-body"><h3 class="pick-title"><a href="#/route/${r.id}">${esc(r.name)}</a></h3>
      ${meter(fb?.avg, { label: `${ban ? '这种禁法下' : '整体'} · ${fb?.games ?? '—'} 局`, sm: true })}
      <p class="pick-why">${esc(p.why)}</p>
      ${form ? `<div class="pick-cards">${form.units.map((u) => gcard(u.h, { aw: u.aw })).join('')}</div>` : ''}
      <div class="row"><a class="btn btn-gold" href="#/play/${r.id}">开始跟打</a><a class="btn" href="#/route/${r.id}">看路线</a></div>
    </div></article>`;
}
function avoidChip(id, ban) {
  const r = routeById.get(id);
  const t = trapByMeta.get(id);
  const meta = r ? r.meta : id;
  const st = famBan(meta, ban) || fam(meta);
  const name = r ? r.name : t?.name || id;
  const shown = !ban && t ? t.stat : st ? st.avg.toFixed(2) : '—';
  return `<a href="${r ? '#/route/' + r.id : '#/routes'}">${esc(name)} <b>${shown}</b></a>`;
}
function routeCard(r) {
  const f = fam(r.meta);
  const art = heroArt(r.carry);
  return `<a class="rcard fac" data-f="${esc(facOf(r))}" href="#/route/${r.id}">
    <span class="rcard-body"><span class="rcard-name"><span class="tier tier-${r.tier}">${r.tier}</span>${esc(r.name)}</span>
      <span class="rcard-sub">${esc(r.sub)} · 主核 ${esc(r.carry)}${r.badge ? ' · ' + esc(r.badge) : ''}</span>
      ${meter(f?.avg, { label: `${f?.games ?? 0} 局 · 前三 ${f?.top3 ?? '—'}%`, sm: true })}
      <span class="rcard-lords">${lordShares(r.meta).slice(0, 3).map(([n]) => lposter(n, { showName: false, still: true })).join('')}</span></span>
    <span class="rcard-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</span></a>`;
}
function prCard(p) { return `<article class="pr"><h3>${esc(p.title)}</h3><div class="pr-short">${esc(p.short)}</div>${p.body.map((x) => `<p>${esc(x)}</p>`).join('')}</article>`; }

// ── 路线列表 ─────────────────────────────
function routesPage() {
  const groups = [['S', '稳定上分'], ['A', '强，但有条件'], ['B', '能打，但不是最优']];
  view.innerHTML = `<h1 class="h1">路线</h1>
  <p class="lede">排序按顶尖玩家近 7 天的平均名次（1 最好、6 最差、3.5 为中位）。每条都写清了：靠什么机制赢、每回合买什么、缺牌往哪转。</p>
  ${groups.map(([t, label]) => `<h2 class="h2"><span class="tier tier-${t}">${t}</span> ${label}</h2><div class="routes">${sortedRoutes().filter((r) => r.tier === t).map(routeCard).join('')}</div>`).join('')}
  <h2 class="h2">陷阱<small>很多人在打，但数据很差</small></h2>
  <div class="traps">${TRAPS.map((t) => `<div class="trap"><span class="trap-stat">${esc(t.stat)}</span><div><b>${esc(t.name)}</b><p>${esc(t.why)}</p></div></div>`).join('')}</div>
  <h2 class="h2">通用模块</h2><div class="stack">${MODULES.map((m) => `<details class="panel"><summary><b style="font-family:var(--display);font-size:19px;font-weight:400">${esc(m.name)}</b> <span class="small muted">${esc(m.when)}</span></summary>${m.body.map((p) => `<p>${esc(p)}</p>`).join('')}</details>`).join('')}</div>`;
}

// ── 路线详情 ─────────────────────────────
const TABS = [['rounds', '逐回合'], ['why', '为什么强'], ['sim', '模拟一局'], ['pivot', '转型'], ['board', '站位'], ['talent', '天赋装备'], ['counter', '克制']];
function routePage(r, tab) {
  const f = fam(r.meta);
  const main = mainForm(r.meta);
  const best = bestForm(r.meta);
  const shares = lordShares(r.meta);
  const banRow = FACS.map((b) => ({ b, s: famBan(r.meta, b) }));
  const bestBan = banRow.filter((x) => x.s && x.s.games >= 150).sort((a, c) => a.s.avg - c.s.avg)[0]?.b;
  view.innerHTML = `
  <header class="banner fac" data-f="${esc(facOf(r))}">
    ${heroArt(r.carry) ? `<img class="banner-art" src="${esc(heroArt(r.carry))}" alt="">` : ''}
    <div class="banner-body"><div class="eyebrow">${esc(r.faction)} · ${esc(r.sub)}</div>
      <h1>${esc(r.name)}</h1>
      <div class="row"><span class="tier tier-${r.tier}">${r.tier}</span>${r.badge ? `<span class="chip chip-gold">${esc(r.badge)}</span>` : ''}<span class="chip">主核 ${esc(r.carry)}</span><span class="chip">${esc(r.stats.cost)}</span></div>
      <p class="tagline">${esc(r.tagline)}</p>
      <div class="row"><a class="btn btn-gold" href="#/play/${r.id}">对局中跟打</a></div></div>
  </header>
  <p class="verdict">${esc(r.verdict)}</p>
  <div class="stats">
    <div class="stat wide">${meter(f?.avg, { label: '平均名次（顶尖玩家 7 天）' })}</div>
    <div class="stat"><div class="stat-v">${f?.top3 ?? '—'}%</div><div class="stat-l">前三率</div></div>
    <div class="stat"><div class="stat-v">${f?.win ?? '—'}%</div><div class="stat-l">登顶率</div></div>
    <div class="stat"><div class="stat-v">${f?.games ?? '—'}</div><div class="stat-l">局数</div></div>
    <div class="stat"><div class="stat-v">${f?.pick ?? '—'}%</div><div class="stat-l">登场率（越高越抢）</div></div>
  </div>
  <h2 class="h2">不同禁用下的表现<small>平均名次 · 局数</small></h2>
  <div class="banbars">${banRow.map(({ b, s }) => `<div class="bb ${s ? '' : 'na'} ${b === bestBan ? 'best' : ''}"><div class="bb-l">禁${FAC_SHORT[b]}</div><div class="bb-v ${s && s.avg <= 3.1 ? 'good' : s && s.avg >= 3.6 ? 'bad' : ''}">${s ? s.avg.toFixed(2) : '—'}</div><div class="bb-g">${s ? s.games + ' 局' : r.faction === b ? '不可用' : '样本少'}</div></div>`).join('')}</div>
  <h2 class="h2">谁来当棋手<small>这套阵容里的棋手占比</small></h2>
  <div class="lords-strip">${shares.map(([n, pct]) => `<figure>${lposter(n, { pct })}<figcaption>整体 ${lordStat.get(n)?.avg ?? '—'}</figcaption></figure>`).join('')}</div>
  ${main ? `<h2 class="h2">成型阵容<small>${main.games} 局 · 平均 ${main.avg} · 金标 = 觉醒，下方是常见装备</small></h2>${lineup(main)}` : ''}
  ${best ? `<div class="form-head"><b>完成形态</b><span class="chip chip-gold">${best.games} 局 · 平均 ${best.avg}</span><span class="small muted">决赛把挂件换成保护</span></div>${lineup(best)}` : ''}
  ${r.variants.length ? `<h2 class="h2">变体</h2><div class="stack">${r.variants.map((v) => `<div class="variant"><b>${esc(v.name)}</b> <span class="small muted">${esc(v.swap)}</span><p>${esc(v.when)}。${esc(v.note)}</p></div>`).join('')}</div>` : ''}
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
  if (tab === 'rounds') box.innerHTML = `<p class="small muted" style="margin:14px 0 0">左侧：回合 · 该回合收入 · 目标棋手等级 · 人口。卡面左上角数字 = 购买优先级；拍卖行的数字是出价上限。卡面和游戏商店里一模一样。</p><div class="track">${PHASES.map((p) => phaseRow(r, p)).join('')}</div>`;
  else if (tab === 'why') box.innerHTML = `<h2 class="h2">它为什么赢</h2><ol class="why">${r.why.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <h2 class="h2">每个位置在干什么</h2><div class="stack">${r.core.map((c) => `<div class="row" style="align-items:center">${av(c.h, { size: 'av-sm' })}<span class="chip chip-gold">${esc(c.role)}</span><span class="small">${esc(c.note)}</span></div>`).join('')}</div>
    <h2 class="h2">按卡面算每回合收入</h2><div class="math">${r.math.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div><p><b>${esc(r.math.total)}</b></p><p class="small muted">假设：${r.math.assume.map(esc).join('；') || '无'}</p>`;
  else if (tab === 'sim' && SIMS[r.id]) box.innerHTML = simView(SIMS[r.id]);
  else if (tab === 'pivot') box.innerHTML = `<h2 class="h2">什么时候转、转去哪</h2><div class="stack">${r.pivots.map((p) => `<div class="pivot"><div class="pivot-when">${esc(p.when)}</div><div>${esc(p.how)}</div>${p.to ? `<a href="#/route/${p.to}">→ ${esc(routeById.get(p.to).name)}</a>` : ''}</div>`).join('') || '<p class="muted">暂无。</p>'}</div>`;
  else if (tab === 'board') box.innerHTML = `<h2 class="h2">决赛站位<small>4 行 × 7 列，上方是前排</small></h2>${board(r)}<p class="small" style="max-width:560px">${esc(r.boardNote)}</p>`;
  else if (tab === 'talent') box.innerHTML = `<h2 class="h2">天赋<small>金框 = 必拿，灰色 = 别拿</small></h2>
    <div class="tcards must">${r.talents.must.map((t) => gcard(t)).join('')}</div>
    ${r.talents.good.length ? `<div class="eyebrow" style="margin:14px 0 6px">也不错</div><div class="tcards">${r.talents.good.map((t) => gcard(t)).join('')}</div>` : ''}
    ${r.talents.avoid.length ? `<div class="eyebrow" style="margin:14px 0 6px">别拿</div><div class="tcards avoid">${r.talents.avoid.map((t) => gcard(t)).join('')}</div>` : ''}
    ${r.talents.note ? `<p class="small">${esc(r.talents.note)}</p>` : ''}
    <h2 class="h2">装备</h2><div class="tcards">${r.gear.map((g) => gcard(g)).join('')}</div>${r.gearNote ? `<p class="small">${esc(r.gearNote)}</p>` : ''}`;
  else if (tab === 'counter') box.innerHTML = `<h2 class="h2">克制关系</h2><div class="cols"><div class="panel"><div class="eyebrow">怕</div><ul>${r.counters.weak.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="panel"><div class="eyebrow">打得过</div><ul>${r.counters.strong.map((x) => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div></div>`;
}
function pips(e) { return `<span class="pips" aria-label="${e} 能量">${'<i></i>'.repeat(e)}</span>`; }
function phaseRow(r, p) {
  const d = r.phases[p.id] || {};
  const gut = p.auction ? `<span class="ph-id">${esc(p.id)}</span><div class="ph-meta">${esc(p.auction)}</div>` : `<span class="ph-id">${esc(p.id)}</span>${pips(p.e)}<div class="ph-meta">${p.e} 能 · ${esc(p.lv)}<br>${p.pop} 人</div>`;
  let body = '';
  if (p.auction && d.targets) body += `<div class="lots">${d.targets.map(lot).join('')}</div>`;
  else if (d.buy?.length) body += `<div class="ph-row"><b>买</b><div class="buycards">${d.buy.map((n, k) => gcard(n, { rank: k + 1 })).join('')}</div></div>`;
  if (d.do?.length) body += `<div class="ph-row"><b>做</b><ul>${d.do.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  if (d.if?.length) body += `<div class="ph-row if"><b>若</b><ul>${d.if.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `<section class="ph ${p.auction ? 'auction' : ''}"><div class="ph-gut">${gut}</div><div class="ph-body">${body || '<span class="muted small">按上回合计划继续。</span>'}</div></section>`;
}
function lot(t) { return `<div class="lot">${gcard(t.h)}<div class="lot-cap">≤ ${t.cap} 能</div>${t.note ? `<div class="lot-note">${esc(t.note)}</div>` : ''}</div>`; }
function board(r) {
  const cells = [];
  for (let row = 1; row <= 4; row++) for (let c = 1; c <= 7; c++) { const u = r.board.find((b) => b.r === row && b.c === c); cells.push(`<div class="cell">${u ? av(u.h) : ''}</div>`); }
  return `<div class="board-label"><span>↑ 前排</span><span>第 1–7 列</span></div><div class="board">${cells.join('')}</div><div class="board-label"><span>↓ 后排</span></div>`;
}
function simView(sim) {
  const rows = sim.rows.map((x) => `<section class="ph ${x.r.startsWith('拍') ? 'auction' : ''}"><div class="ph-gut"><span class="ph-id">${esc(x.r)}</span>${x.income ? `<div class="ph-meta">+${x.income} 能</div>` : ''}</div>
    <div class="ph-body"><div class="ledger-top"><span class="chip">余 <b class="mono">${x.e}</b> 能</span><span class="chip">L${x.lv} <span class="mono">${esc(x.xp)}</span></span><span class="chip">血 <b class="mono">${x.hp}</b></span>${x.hx ? `<span class="chip chip-gold">韩信 <b class="mono">${x.hx}</b> 级</span>` : ''}${x.win ? '' : '<span class="chip chip-bad">输</span>'}</div>
    <ul class="ledger">${x.acts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div></section>`).join('');
  return `<h2 class="h2">${esc(sim.title)}</h2><p class="small muted">${sim.assume.map(esc).join('；')}。</p><div class="track">${rows}</div>
    <h2 class="h2">这一局在哪里可能走偏</h2><div class="stack">${sim.branches.map((b) => `<div class="pivot"><div class="pivot-when">${esc(b.at)}：${esc(b.what)}</div><div>${esc(b.then)}</div></div>`).join('')}</div>`;
}

// ── 棋手 ─────────────────────────────
function lordsPage() {
  const ban = store.get('lordBan', '');
  view.innerHTML = `<h1 class="h1">棋手</h1>
  <p class="lede">按顶尖玩家近 7 天的平均名次排序。最强的几位都在「给钱」：能量是整局最紧的资源。选哪位，取决于这局你要走哪条路线。</p>
  <div class="segs" id="lban" style="margin-top:14px"><button type="button" data-b="" aria-pressed="${!ban}">全部</button>${FACS.map((f) => `<button type="button" data-b="${f}" aria-pressed="${ban === f}">禁${FAC_SHORT[f]}时</button>`).join('')}</div>
  <div class="lordgrid" id="lgrid" style="margin-top:12px"></div>`;
  const draw = (b) => {
    const list = [...LORDS].sort((x, y) => (lordStat.get(x.name)?.avg ?? 9) - (lordStat.get(y.name)?.avg ?? 9));
    $('#lgrid').innerHTML = list.map((g) => {
      const st = lordStat.get(g.name);
      let routeLine = g.use;
      if (b) {
        const rs = ROUTES.filter((r) => r.lords.some((l) => l.name === g.name)).map((r) => ({ r, s: famBan(r.meta, b) })).filter((x) => x.s).sort((x, y) => x.s.avg - y.s.avg);
        routeLine = rs.length ? `禁${FAC_SHORT[b]}时：${rs[0].r.name} ${rs[0].s.avg.toFixed(2)}（${rs[0].s.games} 局）` : `禁${FAC_SHORT[b]}时：没有适合的路线`;
      }
      return `<button type="button" class="lcard" data-lord="${esc(g.name)}">${lposter(g.name, { showName: false, still: true })}<span><span class="lcard-name">${esc(g.name)} <span class="tier tier-${g.tier}">${g.tier}</span></span>
        ${meter(st?.avg, { label: st ? `前三 ${st.top3}% · 登顶 ${st.win}% · ${st.games} 局` : '', sm: true })}
        <span class="lcard-one" style="display:block">${esc(g.one)}</span><span class="lcard-route">${esc(routeLine)}</span></span></button>`;
    }).join('');
  };
  draw(ban);
  $('#lban').onclick = (e) => { const x = e.target.closest('[data-b]'); if (!x) return; store.set('lordBan', x.dataset.b); $$('#lban button').forEach((y) => y.setAttribute('aria-pressed', y === x)); draw(x.dataset.b); };
}
function openLord(name) {
  const g = lordGuide.get(name); const st = lordStat.get(name); const a = ART.lord[name] || {}; const l = IDX.lord.get(name);
  const routes = ROUTES.filter((r) => r.lords.some((x) => x.name === name));
  openSheet(`<div class="lord-hero" style="background-image:url('${esc(a.bg || '')}')">${a.full ? `<img src="${esc(a.full)}" alt="">` : ''}<div class="lh-body"><div class="eyebrow" style="color:#ddd">棋手 · ${g ? g.tier : ''}</div><h2 id="sheet-title">${esc(name)}</h2><p style="margin:6px 0 0">${esc(g?.one || '')}</p></div></div>
    ${st ? `<div class="stats" style="grid-template-columns:1.6fr 1fr 1fr 1fr"><div class="stat">${meter(st.avg)}</div><div class="stat"><div class="stat-v">${st.top3}%</div><div class="stat-l">前三</div></div><div class="stat"><div class="stat-v">${st.win}%</div><div class="stat-l">登顶</div></div><div class="stat"><div class="stat-v">${st.pick}%</div><div class="stat-l">登场</div></div></div>` : ''}
    ${g ? `<div class="kv" style="margin-top:14px"><div><h4>技能怎么用</h4><p>${esc(g.skill)}</p></div><div><h4>秘技</h4><p>${esc(g.secret)}</p></div><div><h4>L6 专属</h4><p>${esc(g.ult)}</p></div><p class="note"><b>数据</b>${esc(g.use)}</p></div>` : ''}
    ${routes.length ? `<h2 class="h2" style="margin-top:20px">适合的路线</h2><div class="routes">${routes.map(routeCard).join('')}</div>` : ''}
    ${l ? `<h2 class="h2">官方卡面</h2>${l.stages.map((s) => `<div class="kv" style="margin-bottom:8px"><h4>${esc(s.stage)}</h4>${s.cards.map((x) => `<p class="small"><b>${esc(x.name)}</b>：${esc(x.text)}</p>`).join('')}</div>`).join('')}` : ''}`);
}

// ── 跟打 ─────────────────────────────
function playPage(arg) {
  const saved = store.get('play', { route: 'kaituan', idx: 0 });
  const r = routeById.get(arg) || routeById.get(saved.route) || ROUTES[0];
  let idx = saved.route === r.id ? saved.idx : 0;
  const draw = () => {
    store.set('play', { route: r.id, idx });
    const p = PHASES[idx];
    const d = r.phases[p.id] || {};
    const checks = store.get('checks', {});
    const mine = checks[r.id]?.[p.id] || [];
    view.innerHTML = `<div class="play-head">${lposter(r.lords[0]?.name, { showName: false })}<select id="route-select" aria-label="路线">${sortedRoutes().map((x) => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.name)} · ${esc(x.lords[0]?.name || '')}</option>`).join('')}</select><button class="btn" type="button" id="reset">新一局</button></div>
      <div class="dial" aria-label="回合">${PHASES.map((q, i) => `<button type="button" data-i="${i}" class="${q.auction ? 'auc' : ''}" ${i === idx ? 'aria-current="step"' : ''}>${esc(q.id)}</button>`).join('')}</div>
      <section class="stage">
        <div class="stage-head"><span class="stage-id">${esc(p.id)}</span>${p.auction ? `<span class="chip chip-gold">拍卖 · ${esc(p.auction)}</span>` : `<div class="stage-meta"><span><b>${p.e}</b> 能量</span><span><b>${esc(p.lv)}</b></span><span><b>${p.pop}</b> 人</span></div>`}</div>
        ${p.auction && d.targets ? `<h3>选这件，出价不超过</h3><div class="lots" style="grid-template-columns:repeat(auto-fill,minmax(96px,124px))">${d.targets.map(lot).join('')}</div>` : ''}
        ${!p.auction && d.buy?.length ? `<h3>商店里看到就买（按顺序）</h3><div class="buycards">${d.buy.map((n, k) => gcard(n, { rank: k + 1, lazy: false })).join('')}</div>` : ''}
        ${d.do?.length ? `<h3>要做</h3><ul class="checks">${d.do.map((x, k) => `<li><label><input type="checkbox" data-k="${k}" ${mine[k] ? 'checked' : ''}><span>${esc(x)}</span></label></li>`).join('')}</ul>` : ''}
        ${d.if?.length ? `<h3>如果</h3><div class="ph-row if" style="grid-template-columns:1fr"><ul>${d.if.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      </section>
      <div class="quick"><button class="btn" type="button" data-tool="talent">天赋三选一</button><button class="btn" type="button" data-tool="pivot">缺牌怎么转</button><button class="btn" type="button" data-tool="final">成型阵容</button></div>
      <div class="play-nav"><button class="btn" type="button" id="prev" ${idx === 0 ? 'disabled' : ''}>← ${idx > 0 ? esc(PHASES[idx - 1].id) : ''}</button><button class="btn btn-gold" type="button" id="next" ${idx === PHASES.length - 1 ? 'disabled' : ''}>${idx < PHASES.length - 1 ? esc(PHASES[idx + 1].id) : '终局'} →</button></div>`;
    $('#route-select').onchange = (e) => { location.hash = '#/play/' + e.target.value; };
    $('#reset').onclick = () => { const c = store.get('checks', {}); delete c[r.id]; store.set('checks', c); idx = 0; draw(); };
    $('.dial').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { idx = +b.dataset.i; draw(); } };
    $('#prev').onclick = () => { if (idx > 0) { idx--; draw(); } };
    $('#next').onclick = () => { if (idx < PHASES.length - 1) { idx++; draw(); } };
    $$('.checks input').forEach((el) => { el.onchange = () => { const c = store.get('checks', {}); c[r.id] = c[r.id] || {}; const arr = c[r.id][p.id] || []; arr[+el.dataset.k] = el.checked; c[r.id][p.id] = arr; store.set('checks', c); }; });
    $('.quick').onclick = (e) => { const b = e.target.closest('[data-tool]'); if (!b) return; if (b.dataset.tool === 'talent') talentTool(r); else if (b.dataset.tool === 'pivot') pivotSheet(r); else finalSheet(r); };
    $('.dial [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  if (arg !== r.id) history.replaceState(null, '', '#/play/' + r.id);
  draw();
}
function pivotSheet(r) {
  openSheet(`<h2 id="sheet-title" class="h2" style="margin-top:0">${esc(r.name)}：转型条件</h2><div class="stack">${r.pivots.map((p) => `<div class="pivot"><div class="pivot-when">${esc(p.when)}</div><div>${esc(p.how)}</div>${p.to ? `<a href="#/play/${p.to}">→ 改跟 ${esc(routeById.get(p.to).name)}</a>` : ''}</div>`).join('') || '<p class="muted">暂无。</p>'}</div>`);
}
function finalSheet(r) {
  const main = mainForm(r.meta); const best = bestForm(r.meta);
  openSheet(`<h2 id="sheet-title" class="h2" style="margin-top:0">${esc(r.name)}：成型阵容</h2>${main ? lineup(main) : ''}${best ? `<div class="form-head"><b>完成形态</b><span class="chip chip-gold">平均 ${best.avg}</span></div>${lineup(best)}` : ''}${board(r)}`);
}
function scoreTalent(name, r) {
  const g = TALENT_NOTES[name]; const base = g ? g[0] : 0.5;
  if (r) {
    if (r.talents.must.includes(name)) return { s: 4 + base / 10, why: `${r.name}必拿。` + (g ? g[1] : '') };
    if (r.talents.good.includes(name)) return { s: 3 + base / 10, why: `${r.name}里好用。` + (g ? g[1] : '') };
    if (r.talents.avoid.includes(name)) return { s: -1, why: `${r.name}里别拿。` + (r.talents.note || '') };
  }
  return { s: base, why: g ? g[1] : (IDX.talent.get(name)?.text || '') };
}
function talentTool(r) {
  openSheet(`<h2 id="sheet-title" class="h2" style="margin-top:0">天赋三选一</h2>
    <div class="fields"><div class="field"><label for="tr">当前路线</label><select id="tr"><option value="">不确定</option>${ROUTES.map((x) => `<option value="${x.id}" ${r && x.id === r.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    ${[1, 2, 3].map((i) => `<div class="field"><label for="t${i}">天赋 ${i}</label><input id="t${i}" list="tl" autocomplete="off" placeholder="输入名字"></div>`).join('')}</div>
    <datalist id="tl">${DB.talents.map((t) => `<option value="${esc(t.name)}">`).join('')}</datalist>
    <div id="tout" class="result-rank"><p class="muted small">输入给你的三个天赋，按当前路线排序。</p></div>`);
  const run = () => {
    const rr = routeById.get($('#tr').value);
    const picks = [1, 2, 3].map((i) => $('#t' + i).value.trim()).filter((n) => IDX.talent.has(n));
    if (!picks.length) return;
    const ranked = picks.map((n) => ({ n, ...scoreTalent(n, rr) })).sort((a, b) => b.s - a.s);
    $('#tout').innerHTML = ranked.map((x, i) => `<div class="rank-item ${i === 0 ? 'top' : ''}">${gcard(x.n)}<div><b>${i + 1}. ${esc(x.n)}</b><div class="small">${esc(x.why)}</div></div></div>`).join('');
  };
  $$('#sheet input, #sheet select').forEach((el) => el.addEventListener('input', run));
}

// ── 查牌 ─────────────────────────────
const KINDS = [['hero', '英雄'], ['talent', '天赋'], ['effect', '效果牌'], ['equip', '装备']];
const cstate = { kind: 'hero', fac: '全部', q: '' };
function cardsPage() {
  view.innerHTML = `<h1 class="h1">查牌</h1><p class="lede">卡面和游戏里一样；金字是本站的一句话判断。点开看技能节点和出现在哪些路线。</p>
  <div class="search"><input id="cq" type="search" placeholder="名字或效果：整备、复生、古币…" value="${esc(cstate.q)}" aria-label="搜索">
    <div class="segs" id="ck">${KINDS.map(([k, t]) => `<button type="button" data-k="${k}" aria-pressed="${k === cstate.kind}">${t}</button>`).join('')}</div>
    <div class="segs" id="cf" ${cstate.kind === 'hero' ? '' : 'hidden'}>${['全部', ...FACS, '无阵营'].map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === cstate.fac}">${f === '全部' ? f : FAC_SHORT[f] || f}</button>`).join('')}</div></div>
  <div id="clist" class="cardgrid"></div>`;
  const draw = () => {
    const src = cstate.kind === 'hero' ? DB.heroes : cstate.kind === 'talent' ? DB.talents : cstate.kind === 'effect' ? DB.effects : DB.equipment;
    let list = src.filter((c) => (cstate.kind !== 'hero' || cstate.fac === '全部' || c.faction === cstate.fac) && (!cstate.q || (c.name + (c.text || '') + (c.awake || '') + (HERO_NOTES[c.name]?.[1] || '')).includes(cstate.q)));
    list = list.sort((a, b) => (cstate.kind === 'talent' ? (TALENT_NOTES[b.name]?.[0] ?? -1) - (TALENT_NOTES[a.name]?.[0] ?? -1) : 0) || a.tier - b.tier);
    $('#clist').innerHTML = list.length ? list.slice(0, 260).map((c) => { const note = HERO_NOTES[c.name]?.[0] || (TALENT_NOTES[c.name] ? '★'.repeat(TALENT_NOTES[c.name][0]) : ''); return `<div class="cg">${gcard(c.name)}${note ? `<div class="cg-note">${esc(note)}</div>` : ''}</div>`; }).join('') : '<p class="muted">没有匹配。试试效果里的关键词，比如「整备」。</p>';
  };
  $('#cq').addEventListener('input', (e) => { cstate.q = e.target.value.trim(); draw(); });
  $('#ck').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; cstate.kind = b.dataset.k; $$('#ck button').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('#cf').hidden = cstate.kind !== 'hero'; draw(); };
  $('#cf').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; cstate.fac = b.dataset.f; $$('#cf button').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); };
  draw();
}

// ── 卡牌详情 ─────────────────────────────
function routesUsing(name) {
  return ROUTES.filter((r) => r.core.some((c) => c.h === name) || Object.values(r.phases).some((p) => p.buy?.includes(name) || p.targets?.some((t) => t.h === name)) || r.talents.must.includes(name) || r.talents.good.includes(name) || r.gear.includes(name));
}
function openCard(name) {
  const f = find(name);
  if (!f) return;
  const { kind, c } = f;
  if (kind === 'lord') { openLord(name); return; }
  const uses = routesUsing(name);
  const note = kind === 'hero' ? HERO_NOTES[name] : kind === 'talent' && TALENT_NOTES[name] ? ['天赋', TALENT_NOTES[name][1]] : null;
  const label = kind === 'hero' ? `${c.tier} 阶英雄 · ${c.faction}` : kind === 'talent' ? `${c.tier} 阶天赋` : kind === 'effect' ? `${c.tier} 阶效果牌 · ${c.cost ?? '?'} 能量` : '装备';
  openSheet(`<div class="detail"><div>${gcard(name, { lazy: false })}</div><div class="kv">
    <div><div class="eyebrow">${esc(label)}</div><h2 id="sheet-title">${esc(name)}</h2>${c.kw?.length ? `<div class="row" style="margin-top:6px">${c.kw.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}</div>
    ${note ? `<p class="note"><b>${esc(note[0])}</b>${esc(note[1])}</p>` : ''}
    ${c.awake ? `<div><h4>觉醒</h4><p>${esc(c.awake)}</p></div>` : ''}
    ${(c.skills || []).map((s) => `<div><h4>技能 · ${esc(s.name)}</h4><p>${esc(s.text)}</p><div class="nodes" style="margin-top:6px">${s.nodes.map((n) => `<div class="node-row"><span class="node-lv">${n.lv}</span><span>${esc(n.text)}</span></div>`).join('')}</div></div>`).join('')}
    ${c.stats ? `<div><h4>基础属性（1 级）</h4><p class="mono small">生命 ${c.stats.hp} · 物攻 ${c.stats.atk} · 法攻 ${c.stats.ap} · 距离 ${c.stats.range} · 蓝 ${c.stats.mana0}/${c.stats.mana}</p></div>` : ''}
    ${c.rel?.length ? `<div><h4>关联</h4>${c.rel.map((x) => `<p class="small"><b>${esc(x.name)}</b>：${esc(x.text)}</p>`).join('')}</div>` : ''}
    ${uses.length ? `<div><h4>出现在这些路线</h4><div class="row">${uses.map((r) => `<a class="chip chip-gold" href="#/route/${r.id}">${esc(r.name)}</a>`).join('')}</div></div>` : ''}
  </div></div>`);
}
function openSheet(html) { sheetBody.innerHTML = html; if (!sheet.open) sheet.showModal(); sheet.querySelector('.sheet-inner').scrollTop = 0; }
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-close') || e.target.closest('a[href^="#"]')) sheet.close(); });
document.addEventListener('click', (e) => {
  const lordEl = e.target.closest('[data-lord]');
  const cardEl = e.target.closest('[data-card]');
  const banEl = e.target.closest('[data-ban]');
  if (banEl) {
    const b = banEl.dataset.ban || null;
    store.set('ban', b);
    $$('[data-ban]').forEach((x) => x.setAttribute('aria-pressed', (x.dataset.ban || null) === b));
    renderBan(b);
    $('#ban-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (lordEl) { e.preventDefault(); openLord(lordEl.dataset.lord); return; }
  if (cardEl) { e.preventDefault(); openCard(cardEl.dataset.card); }
});

// ── 原理 ─────────────────────────────
function rulesPage(section) {
  view.innerHTML = `<h1 class="h1">原理</h1>
  <p class="lede">先把游戏的资源循环想清楚，再谈阵容。前五条来自对顶尖玩家数据的反推，后五条来自卡面机制。</p>
  <h2 class="h2" id="logic">底层逻辑</h2><div class="principles">${PRINCIPLES.map(prCard).join('')}</div>
  <h2 class="h2" id="patch">${esc(PATCH.title)}</h2><p>${esc(PATCH.lead)}</p>
  <div class="patch-list">${PATCH.changes.map((c) => `<div class="patch-item"><b>${esc(c.what)}</b><div><div class="patch-diff">${c.from ? `<del>${esc(c.from)}</del> → ` : ''}<ins>${esc(c.to)}</ins></div><div class="small muted">${esc(c.impact)}</div>${c.route ? `<a class="small" href="#/route/${c.route}">相关路线：${esc(routeById.get(c.route).name)}</a>` : ''}</div></div>`).join('')}</div>
  <h2 class="h2" id="facts">规则与数字<small>●●● 官方 · ●● 多源一致 · ● 单一来源</small></h2>
  <div class="panel scroll-x"><table class="facts"><tbody>${FACTS.map((f) => `<tr><th>${esc(f.k)}</th><td>${esc(f.v)}<div class="small muted">${esc(f.src)}</div></td><td class="conf">${'●'.repeat(f.c)}</td></tr>`).join('')}</tbody></table></div>
  <h2 class="h2" id="unknown">数据怎么读、还不知道什么</h2>
  <div class="panel"><ul>${UNKNOWNS.map((u) => `<li>${esc(u)}</li>`).join('')}</ul><p class="small muted">对局统计：${esc(META.source)}。卡牌：官方卡牌接口，快照 ${esc(DB.meta.snapshot)}。游戏素材版权归腾讯，本站为非官方玩家研究。</p></div>`;
  if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
}

// ── 启动 ─────────────────────────────
Promise.all([fetch('data/cards.json').then((r) => r.json()), fetch('data/art.json').then((r) => r.json()).catch(() => ({ card: {}, lord: {} }))]).then(([d, art]) => {
  DB = d; ART = art;
  d.heroes.forEach((c) => IDX.hero.set(c.name, c));
  d.talents.forEach((c) => IDX.talent.set(c.name, c));
  d.effects.forEach((c) => IDX.effect.set(c.name, c));
  d.equipment.forEach((c) => IDX.equip.set(c.name, c));
  d.lords.forEach((c) => IDX.lord.set(c.name, c));
  window.addEventListener('hashchange', render);
  render();
}).catch(() => { view.innerHTML = '<p>数据没有载入。刷新页面重试；本地打开需要用 HTTP 服务（见 README）。</p>'; });
