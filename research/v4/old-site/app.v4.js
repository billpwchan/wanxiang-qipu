// 万象棋谱 —— 原生 ES 模块，无构建。动效：GSAP / ScrollTrigger / Flip / SplitText / Lenis（vendor/，缺省时页面照常可用）。
import { PHASES, ROUTES, TRAPS } from './data/routes.js';
import { BAN_PICKS, LORDS, PATCH } from './data/guide.js';
import { HERO_NOTES, TALENT_NOTES } from './data/notes.js';
import { META } from './data/meta.js';
import { EVIDENCE } from './data/evidence.js';
import { TIPS, DATA_NOTE } from './data/tips.js';
import { CHAINS } from './data/chains.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f2 = (x) => (x == null ? '—' : Number(x).toFixed(2));
const kfmt = (n) => (n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万' : String(n));
// 名次变化：负数 = 名次提前（更好）
const lift = (d) => (d == null ? '—' : d <= 0 ? `↑${Math.abs(d).toFixed(2)}` : `↓${d.toFixed(2)}`);
const view = $('#view');
const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
const FACS = ['河洛', '逐鹿', '日落海', '三分之地', '大河流域'];
const FAC_SHORT = { 河洛: '河洛', 逐鹿: '逐鹿', 日落海: '日落海', 三分之地: '三分', 大河流域: '大河', 无阵营: '无阵营' };
const G = () => window.gsap;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
const FINE = matchMedia('(pointer: fine)').matches;

let DB = null;
let ART = { card: {}, lord: {} };
let PAL = { hero: {}, lord: {} };
let POSTER = {};
const IDX = { hero: new Map(), talent: new Map(), effect: new Map(), equip: new Map(), lord: new Map() };
for (const r of ROUTES) { const c = CHAINS[r.id]; if (c) { r.chain = c.chain; r.chainTitle = c.title; r.evidence = { partners: c.partners, say: c.say, caveat: c.caveat }; } }
const routeById = new Map(ROUTES.map((r) => [r.id, r]));
const lordGuide = new Map(LORDS.map((l) => [l.name, l]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('wx4.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wx4.' + k, JSON.stringify(v)); } catch { /* 隐私模式 */ } },
};
function find(name) {
  for (const kind of ['hero', 'effect', 'talent', 'equip', 'lord']) { const c = IDX[kind].get(name); if (c) return { kind, c }; }
  return null;
}
const fam = (meta) => META.families[meta];
const famBan = (meta, ban) => (ban && META.byBan[ban] ? META.byBan[ban][meta] : null);
const ev = (h) => EVIDENCE.hero[h];
function routeAvg(r) { return r.stat?.avg ?? fam(r.meta)?.avg ?? ev(r.carry)?.avg ?? null; }
function routeStat(r) {
  const f = fam(r.meta); const e = ev(r.carry);
  if (r.stat) return { avg: r.stat.avg, top3: r.stat.top3, games: r.stat.games, label: r.stat.label };
  if (f) return { avg: f.avg, top3: f.top3, games: f.games, label: '成型阵容' };
  return e ? { avg: e.avg, top3: e.top3, games: e.n, label: `场上有${r.carry}` } : {};
}
function sortedRoutes() { return [...ROUTES].sort((a, b) => (routeAvg(a) ?? 9) - (routeAvg(b) ?? 9)); }

// ── 主题：整页染成立绘主色 ─────────────
const NEUTRAL = { accent: '#eceae4', deep: '#0c0d12' };
function tint(p) {
  const c = p || NEUTRAL;
  const deep = mixHex(c.deep || NEUTRAL.deep, '#0b0c10', 0.5);
  document.documentElement.style.setProperty('--accent', c.accent);
  document.documentElement.style.setProperty('--deep', deep);
  $('meta[name="theme-color"]')?.setAttribute('content', deep);
}
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('');
}
const heroPal = (h) => PAL.hero[h];
const lordPal = (l) => PAL.lord[l];

// ── 小组件 ─────────────
function cardSrc(name) {
  for (const k of ['hero', 'effect', 'talent', 'equip']) { const p = ART.card[`${k}:${name}`]; if (p) return p; }
  return '';
}
const heroArt = (h) => IDX.hero.get(h)?.art || '';
const heroImg = (h) => IDX.hero.get(h)?.img || '';
const heroCut = (h) => POSTER[h]?.cut || heroArt(h);   // 高清紧裁切人物，没有就用卡面立绘
function card(name, { cap = '', w = '', eager = false } = {}) {
  const src = cardSrc(name);
  return `<button type="button" class="card" data-card="${esc(name)}" aria-label="${esc(name)}"${w ? ` style="--w:${w}"` : ''}>${src ? `<img src="${esc(src)}" alt="" ${eager ? '' : 'loading="lazy"'} decoding="async">` : `<span class="fb">${esc(name)}</span>`}${cap ? `<span class="cap">${esc(cap)}</span>` : ''}</button>`;
}
function av(name, { aw = false, label = true, s = '' } = {}) {
  const src = heroImg(name) || IDX.equip.get(name)?.img || IDX.talent.get(name)?.img || IDX.effect.get(name)?.img || '';
  return `<button type="button" class="av${aw ? ' aw' : ''}" data-card="${esc(name)}" title="${esc(name)}"${s ? ` style="--s:${s}"` : ''}><i>${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : ''}</i>${label ? `<b>${esc(name)}</b>` : ''}</button>`;
}
const avs = (names, o = {}) => `<div class="avs">${names.map((n) => av(n, { label: false, ...o })).join('')}</div>`;
function lordImg(name, kind = 'poster') { return ART.lord[name]?.[kind] || IDX.lord.get(name)?.img || ''; }
function nums(list) {
  return `<div class="nums">${list.map(([v, l, main]) => `<div class="${main ? 'main' : ''}"><b data-count="${esc(v)}">${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
}
function splitName(name) {
  const s = [...name];
  if (s.length <= 3) return [name];
  return [s.slice(0, 2).join(''), s.slice(2).join('')];
}
const sec = (title, body, { id = '', note = '' } = {}) => `<section class="sec"${id ? ` id="${id}"` : ''}><h2 class="h2">${esc(title)}</h2>${note ? `<p class="lede rv">${esc(note)}</p>` : ''}${body}</section>`;

// ── 路由 ─────────────
function parse() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
function setNav(key) { $$('.nav a').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))); }
let lastPath = '';
let viaMorph = false;
function render() {
  if (!DB) return;
  const { parts, q } = parse();
  const [page, arg] = parts;
  if (page === 'route' && routeById.has(arg)) { location.replace('#/r/' + arg); return; }
  if (page === 'lab') { location.replace('#/tips'); return; }
  const path = parts.join('/');
  const go = () => {
    killMotion();
    setNav({ r: 'routes', routes: 'routes', play: 'routes', lords: 'lords', tips: 'tips', cards: 'cards' }[page] || '');
    document.body.dataset.page = page || 'home';
    if (!page) home();
    else if (page === 'routes') routesPage();
    else if (page === 'r' && routeById.has(arg)) routePage(routeById.get(arg));
    else if (page === 'play' && routeById.has(arg)) playPage(routeById.get(arg), q);
    else if (page === 'lords') lordsPage();
    else if (page === 'tips') tipsPage();
    else if (page === 'cards') cardsPage(q);
    else home();
    if (path !== lastPath) { if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo({ top: 0, behavior: 'instant' }); }
    lastPath = path;
    motion(view);
  };
  if (document.startViewTransition && !RM && path !== lastPath && lastPath !== '') {
    const t = document.startViewTransition(go);
    t.finished.finally(() => { viaMorph = false; $$('[style*="view-transition-name"]').forEach((e) => (e.style.viewTransitionName = '')); });
    t.ready.catch(() => {});
  } else { viaMorph = false; go(); }
}

// ── 开局：禁了谁？ ─────────────
const UNKNOWN = { lead: '还不确定禁什么：先按复读吕布准备，禁三分就换后两套。', picks: [{ route: 'lvbu', lord: '孙小宾', alt: '镜', why: '禁三分时不能打。' }, { route: 'kaituan', lord: '香香', alt: '明先生', why: '除了禁大河，每种禁法都在 2.77–2.84。' }, { route: 'mulan', lord: '嬴律', alt: '明先生', why: '除了禁日落海，每种禁法都在 2.49–2.73。' }], avoid: [] };
function home() {
  const ban = store.get('ban', null);
  view.innerHTML = `
  <section class="home-hero${ban ? ' chosen' : ''}">
    <div class="ask-col">
      <h1 class="ask">这一局，<br>禁了<em id="ask-em">${ban && ban !== '未知' ? esc(FAC_SHORT[ban]) : '谁'}</em>？</h1>
      <p class="ask-sub">看开局画面上方的「本局禁用阵营」。</p>
      <div class="bans" role="group" aria-label="本局禁用阵营">
        ${FACS.map((f) => `<button type="button" class="ban" data-f="${f}" data-ban="${f}" aria-pressed="${ban === f}">${f}<small>${esc(routeById.get(BAN_PICKS[f].picks[0].route).name)}</small></button>`).join('')}
        <button type="button" class="ban unknown" data-ban="未知" aria-pressed="${ban === '未知'}">还不知道 →</button>
      </div>
    </div>
    <div class="pick" aria-hidden="true"><canvas class="embers" id="home-embers"></canvas><div class="pick-art" id="pick-art"></div></div>
  </section>
  <section class="verdict" id="verdict" hidden></section>
  ${tipsTeaser()}
  ${sec('路线', `<div class="board-list">${sortedRoutes().map(routeRow).join('')}</div><div class="acts rv"><a class="ln" href="#/routes">看别打的路线</a></div>`, { note: '按平均名次排序（1 最好，3.5 是平均线）。' })}
  ${foot()}`;
  pickKey = '';
  paintPick(ban && ban !== '未知' ? ban : null, !!ban);
  if (ban) showVerdict(ban, false);
  $$('.ban', view).forEach((b) => {
    const pre = () => { if (!store.get('ban', null)) paintPick(b.dataset.ban === '未知' ? null : b.dataset.ban, false); };
    b.addEventListener('mouseenter', pre); b.addEventListener('focus', pre);
  });
}
function banCfg(ban) { return ban && BAN_PICKS[ban] ? BAN_PICKS[ban] : UNKNOWN; }
let pickKey = '';
function paintPick(ban, committed) {
  const cfg = banCfg(ban);
  const p = cfg.picks[0]; const r = routeById.get(p.route);
  const key = `${p.lord}|${r.carry}`;
  const em = $('#ask-em');
  if (em) em.textContent = ban ? FAC_SHORT[ban] : '谁';
  tint(committed || ban ? lordPal(p.lord) || heroPal(r.carry) : null);
  const box = $('#pick-art');
  if (!box || key === pickKey) return;
  pickKey = key;
  const html = `<img class="pk-carry cut" src="${esc(heroCut(r.carry))}" alt=""><img class="pk-lord" src="${esc(lordImg(p.lord, 'half'))}" alt="">`;
  const g = G();
  if (g && !RM && box.children.length) {
    g.to(box.children, { opacity: 0, y: 16, duration: 0.2, onComplete: () => { box.innerHTML = html; g.from(box.children, { opacity: 0, y: 40, scale: 0.97, duration: 0.8, stagger: 0.09, ease: 'power3.out' }); } });
  } else box.innerHTML = html;
}
function showVerdict(ban, animate = true) {
  const cfg = banCfg(ban);
  const [p, ...alts] = cfg.picks;
  const r = routeById.get(p.route);
  const fb = famBan(r.meta, ban === '未知' ? null : ban);
  const avg = fb?.avg ?? routeAvg(r);
  const st = fb ? { games: fb.games, top3: fb.top3, label: '这种禁法下' } : routeStat(r);
  const lg = lordGuide.get(p.lord);
  const el = $('#verdict');
  el.hidden = false;
  el.innerHTML = `
    <p class="v-head">${ban === '未知' ? '' : `禁${esc(FAC_SHORT[ban])} · `}${esc(cfg.lead)}</p>
    <dl class="v-main">
      <div><dt>棋手</dt><dd><button type="button" data-lord="${esc(p.lord)}">${esc(p.lord)}</button><small>${esc(lg?.one || '')}${p.alt ? `没有就拿${esc(p.alt)}。` : ''}</small></dd></div>
      <div><dt>路线</dt><dd><a href="#/r/${r.id}" data-morph>${esc(r.name)}</a><small>主核 ${esc(r.carry)}。${esc(p.why)}</small></dd></div>
      <div><dt>${esc(st.label || '全部对局')}</dt><dd>${f2(avg)}<small>平均名次${st.games ? ' · ' + kfmt(st.games) + ' 局' : ''}${st.top3 ? ` · 前三 ${Math.round(st.top3)}%` : ''}</small></dd></div>
    </dl>
    <div class="acts"><a class="go" href="#/play/${r.id}?ban=${encodeURIComponent(ban)}&lord=${encodeURIComponent(p.lord)}">按这套开局</a><a class="ln" href="#/r/${r.id}" data-morph>看路线</a><button type="button" class="ln" data-clear>重选禁用</button></div>
    <div class="v-alt">
      <div><h4>也可以</h4>${alts.map((a) => altRow(a, ban)).join('')}</div>
      <div><h4>注意</h4>${cfg.note ? `<p class="v-note">${esc(cfg.note)}</p>` : ''}${contestHint(r)}${(cfg.avoid || []).length ? `<p class="v-note">别打：${cfg.avoid.map((id) => { const rr = routeById.get(id); const t = TRAPS.find((x) => x.meta === id); return rr ? `<a href="#/r/${rr.id}">${esc(rr.name)}</a>` : t ? esc(t.name) : ''; }).filter(Boolean).join('、')}</p>` : ''}</div>
    </div>`;
  if (animate && G() && !RM) {
    G().from(el.children, { opacity: 0, y: 30, duration: 0.7, stagger: 0.07, ease: 'power3.out' });
    requestAnimationFrame(() => (lenis ? lenis.scrollTo(el, { offset: -90 }) : el.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  }
}
function contestHint(r) {
  const c = ev(r.carry)?.contest;
  if (!c || c.pure == null) return '';
  return c.pure > 0.12
    ? `<p class="v-note">前 4 回合看到对手场上也有${esc(r.carry)}，换「也可以」里的路线：多 1 人抢，平均多掉 <b class="down">${f2(c.pure)}</b> 名。</p>`
    : `<p class="v-note">${esc(r.carry)}不怕被抢（多 1 人只多掉 ${f2(Math.max(0, c.pure))} 名）。</p>`;
}
function altRow(a, ban) {
  const r = routeById.get(a.route); const fb = famBan(r.meta, ban === '未知' ? null : ban);
  return `<div class="alt">${av(r.carry, { label: false })}<a href="#/r/${r.id}" data-morph><strong>${esc(r.name)}</strong><span>棋手 ${esc(a.lord)}${a.alt ? ' / ' + esc(a.alt) : ''} · ${esc(a.why)}</span></a><em>${f2(fb?.avg ?? routeAvg(r))}</em><a class="alt-go" href="#/play/${r.id}?ban=${encodeURIComponent(ban)}&lord=${encodeURIComponent(a.lord)}" aria-label="按${esc(r.name)}开局">开局</a></div>`;
}
function tipsTeaser() {
  const items = TIPS.flatMap((g) => g.items).filter((t) => t.home);
  return `<section class="sec"><h2 class="h2">要点</h2>
  <div class="laws">${items.map((t) => `<article class="law rv"><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p><p class="law-ev">${esc(t.ev)}</p>${t.cards?.length ? avs(t.cards) : ''}</article>`).join('')}</div>
  <div class="acts rv"><a class="ln" href="#/tips">全部要点</a></div></section>`;
}
function routeRow(r) {
  const f = routeStat(r); const avg = routeAvg(r);
  const units = (r.core || []).map((c) => c.h).slice(0, 7);
  return `<a class="rrow rv" href="#/r/${r.id}" data-morph data-peek="${esc(heroCut(r.carry))}" style="--rc:${esc(heroPal(r.carry)?.accent || 'var(--paper)')}"><b>${f2(avg)}</b><div><h3>${esc(r.name)}<span class="tier">${esc(r.tier)}</span></h3><p>${esc(r.carry)}${f.games ? ' · ' + kfmt(f.games) + ' 局' : ''}${f.top3 ? ` · 前三 ${Math.round(f.top3)}%` : ''}</p></div>${avs(units)}</a>`;
}
function trapRow(t) {
  return `<div class="rrow trap rv"><b>${esc(t.stat)}</b><div><h3>${esc(t.name)}</h3><p>${esc(t.why)}</p></div><span></span></div>`;
}
function foot() {
  const s = EVIDENCE.source;
  return `<footer class="foot"><span>数据：datawxq.com 顶尖棋手对局 · ${esc(s.version)} · ${esc(s.window)} · 更新于 ${esc(s.fetched)}</span><button type="button" class="ln" data-note>数据说明</button><span>游戏素材版权归腾讯。非官方玩家工具。</span></footer>`;
}
function openDataNote() {
  const n = DATA_NOTE;
  openSheet(`<h2>数据说明</h2><div class="txt"><p>${esc(n.source)}</p></div>
  <h4>数字的意思</h4><ol class="nodes terms">${n.terms.map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('')}</ol>
  <h4>这些数字不能说明什么</h4><ul class="dos">${n.limits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  <h4>${esc(PATCH.date)} 版本变化</h4><ul class="dos">${PATCH.changes.map((c) => `<li><b>${esc(c.what)}</b>：${c.from ? esc(c.from) + ' → ' : ''}${esc(c.to)}</li>`).join('')}</ul>`);
}

// ── 路线榜 ─────────────
function routesPage() {
  tint(null);
  view.innerHTML = `<section class="sec top"><h1 class="h2">路线</h1><p class="lede rv">按平均名次排序（1 最好，3.5 是平均线）。</p>
    <div class="board-list">${sortedRoutes().map(routeRow).join('')}</div></section>
  ${sec('别打的路线', `<div class="board-list">${TRAPS.map(trapRow).join('')}</div>`, { note: '看起来成型，平均名次却在平均线以下。' })}${foot()}`;
}

// ── 路线页 ─────────────
function posterHTML(r) {
  const P = POSTER[r.carry];
  const lines = splitName(r.name);
  const title = `<h1 class="p-title${viaMorph ? ' vt' : ''}" aria-label="${esc(r.name)}">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</h1>`;
  const ghost = `<div class="p-title ghost" aria-hidden="true">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`;
  const st = routeStat(r);
  const body = `<div class="p-body">
      <p class="p-sub">主核 <b>${esc(r.carry)}</b> · ${esc(r.faction)} · ${esc(r.tier)} 级</p>
      <p class="p-say">${esc(r.tagline)}</p>
      ${nums([[f2(st.avg), '平均名次', true], [st.top3 ? Math.round(st.top3) + '%' : '—', '前三率'], [st.games ? kfmt(st.games) : '—', (st.label || '') + '（局）']])}
      <div class="acts"><a class="go" href="#/play/${r.id}">跟着打一局</a><a class="ln" href="#rounds" data-jump="rounds">每回合买什么</a></div>
    </div>`;
  if (!P?.bg) return `<section class="poster">${title}<img class="p-cut" src="${esc(heroArt(r.carry))}" alt="${esc(r.carry)}">${ghost}${body}</section>`;
  return `<section class="poster layered" data-carry="${esc(r.carry)}">
    <div class="pl pl-bg"><img src="${esc(P.bg)}" alt="" fetchpriority="high" decoding="async"></div>
    <div class="p-shade"></div>
    <canvas class="embers"></canvas>
    ${title}
    <div class="pl pl-fg"><img src="${esc(P.fg)}" alt="${esc(r.carry)}" decoding="async"></div>
    ${ghost}
    <div class="p-fade"></div>
    ${body}
  </section>`;
}
function layoutPoster(el) {
  const P = POSTER[el.dataset.carry]; if (!P?.bg) return;
  const W = el.clientWidth, H = el.clientHeight; const mobile = W < 720;
  const place = (img, s, tx, ty, clamp) => {
    if (!img) return;
    const iw = P.w * s, ih = P.h * s;
    let left = W * tx - P.cx * iw; let top = H * ty - P.cy * ih;
    if (clamp) { left = Math.min(0, Math.max(W - iw, left)); top = Math.min(0, Math.max(H - ih, top)); }
    Object.assign(img.style, { width: iw + 'px', height: ih + 'px', left: left + 'px', top: top + 'px' });
  };
  const cover = Math.max(H / P.h, W / P.w) * 1.08;
  el.classList.toggle('m', mobile);
  // 桌面：背景与人物同一张原画、对齐，三层景深；手机：背景模糊铺满，人物单独缩放到约 2/3 屏高
  place($('.pl-bg img', el), cover, mobile ? 0.56 : 0.66, 0.5, true);
  place($('.pl-fg img', el), mobile ? (H * 0.64) / P.h : cover, mobile ? 0.6 : 0.66, mobile ? 0.52 : 0.5, !mobile);
}
function routePage(r) {
  tint(heroPal(r.carry));
  const idx = sortedRoutes().indexOf(r);
  const next = sortedRoutes()[(idx + 1) % ROUTES.length];
  view.innerHTML = `
  ${posterHTML(r)}
  ${factsBlock(r)}
  ${chainBlock(r)}
  ${teamBlock(r)}
  ${roundsBlock(r)}
  ${dataBlock(r)}
  ${colsBlock(r)}
  ${pivotBlock(r)}
  <section class="sec"><a class="next" href="#/r/${next.id}" data-morph><div><span>下一条</span><strong>${esc(next.name)}</strong></div><img class="cut" src="${esc(heroCut(next.carry))}" alt="" loading="lazy"></a></section>
  ${foot()}`;
  const P = $('.poster.layered', view);
  if (P) { layoutPoster(P); onResize = () => layoutPoster(P); }
}
function factsBlock(r) {
  const lords = (r.lords || []).slice(0, 2);
  const c = ev(r.carry)?.contest;
  const bans = Object.entries(META.byBan || {}).map(([b, m]) => [b, m[r.meta]]).filter(([, v]) => v && v.games >= 200);
  const best = bans.sort((a, b) => a[1].avg - b[1].avg)[0];
  const facts = [
    ['棋手', `<span class="f-lords">${lords.map((l) => `<button type="button" data-lord="${esc(l.name)}"><img src="${esc(lordImg(l.name))}" alt="">${esc(l.name)}</button>`).join('')}</span>`, lords[0]?.why || ''],
    ['禁用', r.faction === '无阵营' ? '不受禁用影响' : `禁${esc(FAC_SHORT[r.faction] || r.faction)}时不能打`, best ? `禁${FAC_SHORT[best[0]]}时最好：${f2(best[1].avg)}（${kfmt(best[1].games)} 局）` : ''],
    ['被抢', c?.pure == null ? '—' : c.pure > 0.12 ? `怕：多 1 人抢多掉 ${f2(c.pure)} 名` : '不怕', c?.p != null ? `${Math.round(c.p * 100)}% 的局至少有 1 名对手也拿${r.carry}` : ''],
    ['要什么', esc(r.stats?.cost || ''), r.stats?.ops ? '操作：' + r.stats.ops : ''],
  ];
  return `<section class="sec facts-sec"><dl class="facts4">${facts.map(([k, v, s]) => `<div class="rv"><dt>${k}</dt><dd>${v}</dd>${s ? `<p>${esc(s)}</p>` : ''}</div>`).join('')}</dl></section>`;
}
function chainBlock(r) {
  const chain = r.chain || [];
  if (!chain.length) return sec('为什么强', `<ul class="dos lede">${(r.why || []).map((w) => `<li class="rv">${esc(w)}</li>`).join('')}</ul>`);
  return `<section class="sec"><h2 class="h2">${esc(r.chainTitle || '为什么强')}</h2>
  <div class="chain" style="--n:${chain.length}">${chain.map((c) => `<div class="link rv">${avs(c.cards || [])}<h3>${esc(c.t)}</h3><p>${esc(c.d)}</p>${c.gain ? `<span class="gain">${esc(c.gain)}</span>` : ''}</div>`).join('')}</div></section>`;
}
function dataBlock(r) {
  const e = ev(r.carry);
  if (!e) return '';
  const show = (r.evidence?.partners || []).map((h) => e.partners.find((p) => p[0] === h)).filter(Boolean);
  const top = show.length ? show : e.partners.filter((p) => p[1] >= 400 && p[3] <= -0.08).slice(0, 7);
  const worst = e.partners.filter((p) => p[1] >= Math.max(400, e.n * 0.08) && p[3] > 0.2).sort((a, b) => b[3] - a[3]).slice(0, 3);
  const maxv = Math.max(0.6, ...top.concat(worst).map((p) => Math.abs(p[3])));
  const row = (p) => {
    const good = p[3] <= 0; const wpc = Math.min(100, (Math.abs(p[3]) / maxv) * 100);
    return `<div class="lrow rv">${av(p[0], { label: false })}<span class="nm">${esc(p[0])}<small>${kfmt(p[1])} 局</small></span><span class="bar2"><i style="width:${wpc}%;--c:var(${good ? '--up' : '--down'})"></i></span><span class="v ${good ? 'up' : 'down'}">${lift(p[3])}</span></div>`;
  };
  const c = e.contest;
  return sec('带谁，不带谁', `
  <div class="split">
    <div class="lift"><h4>带上它</h4>${top.map(row).join('')}${worst.length ? `<h4 style="margin-top:26px">别带</h4>${worst.map(row).join('')}` : ''}</div>
    ${c ? contestBlock(r, c) : ''}
  </div>`, { note: r.evidence?.say || '' });
}
function contestBlock(r, c) {
  const labels = ['没人抢', '1 名对手', '2 名对手', '3 名以上'];
  const vals = c.avg.map((v, i) => (v == null || c.share[i] < 0.01 ? null : v));
  return `<div class="contest"><h4>被抢时的平均名次</h4>
  <div class="contest-grid">${vals.map((v, i) => v == null ? '' : `<div class="cg rv"><div class="colbar"><i style="height:${Math.max(8, ((6 - v) / 5) * 100)}%;--c:var(${i === 0 ? '--up' : '--down'})"></i></div><b>${f2(v)}</b><span>${labels[i]}</span><small>${Math.round(c.share[i] * 100)}% 的局</small></div>`).join('')}</div>
  ${c.pure != null ? `<p class="note">扣掉「对手阵容强」本身的影响后，多 1 名对手也拿${esc(r.carry)}，平均多掉 ${f2(Math.max(0, c.pure))} 名。</p>` : ''}</div>`;
}
function teamBlock(r) {
  const core = r.core || [];
  if (!core.length) return '';
  const pos = r.board || [];
  const isBack = (h) => { const b = pos.find((x) => x.h === h); if (b) return b.r >= 3; return (IDX.hero.get(h)?.stats?.range || 1) >= 4; };
  const form = fam(r.meta)?.forms?.[0];
  const items = (h) => form?.units?.find((u) => u.h === h)?.items || [];
  // 选人界面式的斜切竖幅：按脸部焦点裁切；主核默认更宽，悬停展开
  const order = [...core].sort((a, b) => (a.h === r.carry ? -1 : b.h === r.carry ? 1 : 0));
  const slot = (c) => { const P = POSTER[c.h]; const src = P?.cut || heroArt(c.h); const pos2 = P?.fx != null ? `${P.fx}% ${P.fy}%` : '50% 20%';
    return `<button type="button" class="slot${c.h === r.carry ? ' core' : ''}" data-card="${esc(c.h)}" aria-label="${esc(c.h)}"><img src="${esc(src)}" alt="" loading="lazy" style="object-position:${pos2}"><span class="slot-n"><b>${esc(c.h)}</b><em>${esc(c.role)} · ${isBack(c.h) ? '后排' : '前排'}</em></span></button>`; };
  return sec('成型阵容', `
  <div class="squad rv">${order.map(slot).join('')}</div>
  <div class="team-roles">${core.map((c) => `<div class="role rv">${av(c.h, { label: false })}<div><b>${esc(c.h)}<em>${esc(c.role)}</em></b><p>${esc(c.note)}</p>${items(c.h).length ? `<div class="gear">${items(c.h).map((n) => { const it = IDX.equip.get(n); return it ? `<button type="button" data-card="${esc(n)}" title="${esc(n)}"><img src="${esc(it.img)}" alt="${esc(n)}" loading="lazy"></button>` : ''; }).join('')}</div>` : ''}</div></div>`).join('')}</div>
  ${r.boardNote ? `<p class="note rv">站位：${esc(r.boardNote)}</p>` : ''}`);
}
function roundsBlock(r) {
  return sec('每回合买什么', `<div class="rounds">${PHASES.map((p) => roundRow(r, p)).join('')}</div><div class="acts rv"><a class="go" href="#/play/${r.id}">全屏跟打</a></div>`,
    { id: 'rounds', note: '能量：R1–3 每回合 6，R4–7 为 8，R8–11 为 12，R12 起 15。英雄 3 能量，刷新 1，出售返 1。' });
}
function roundRow(r, p) {
  const ph = r.phases?.[p.id]; if (!ph) return '';
  const auc = !!p.auction;
  const buys = auc ? (ph.targets || []).map((t) => `<div class="tg">${card(t.h)}<span class="cap2">≤ ${t.cap} 能量</span>${t.note ? `<small>${esc(t.note)}</small>` : ''}</div>`).join('') : (ph.buy || []).map((h) => card(h)).join('');
  return `<div class="rd${auc ? ' auc' : ''}"><div class="rd-n"><b>${esc(p.id)}</b><span>${auc ? esc(p.auction) : `${p.e} 能量 · ${esc(p.lv)} · ${p.pop} 人`}</span></div>
  <div class="rd-body">${buys ? `<div class="buys">${buys}</div>` : '<div class="dim">不买英雄</div>'}<div>${(ph.do || []).length ? `<ul class="dos">${ph.do.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}${(ph.if || []).length ? `<ul class="ifs">${ph.if.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div></div></div>`;
}
function colsBlock(r) {
  const e = ev(r.carry);
  const lordsData = (e?.lords || []).filter((l) => l[1] >= 150).slice(0, 5);
  const talents = r.talents || { must: [], good: [], avoid: [] };
  const tData = new Map((e?.talents || []).map((t) => [t[0], t]));
  const tline = (n, cls = '') => { const t = tData.get(n); return `<button type="button" class="${cls}" data-card="${esc(n)}">${esc(n)}${t ? ` <small class="${t[2] < 0 ? 'up' : 'down'}">${lift(t[2])}</small>` : ''}</button>`; };
  const bestT = (e?.talents || []).filter((t) => t[1] >= 250 && t[2] <= -0.25 && !talents.must.includes(t[0]) && !talents.good.includes(t[0])).slice(0, 5);
  return sec('棋手、天赋、装备', `
  <div class="cols">
    <div class="col rv"><h4>棋手 · 平均名次</h4><ol>${(lordsData.length ? lordsData.map((l) => `<li><b><button type="button" data-lord="${esc(l[0])}" class="lordline"><img src="${esc(lordImg(l[0]))}" alt="">${esc(l[0])}</button></b><em>${f2(l[3])}</em><p>${kfmt(l[1])} 局</p></li>`) : (r.lords || []).map((l) => `<li><b><button type="button" data-lord="${esc(l.name)}" class="lordline"><img src="${esc(lordImg(l.name))}" alt="">${esc(l.name)}</button></b><em></em><p>${esc(l.why)}</p></li>`)).join('')}</ol></div>
    <div class="col rv"><h4>天赋</h4>
      <p class="sub">必拿</p><div class="tags">${talents.must.map((n) => tline(n)).join('')}</div>
      <p class="sub">好用</p><div class="tags">${talents.good.map((n) => tline(n)).join('')}</div>
      ${bestT.length ? `<p class="sub">这套对局里表现也好</p><div class="tags">${bestT.map((t) => tline(t[0])).join('')}</div>` : ''}
      ${talents.avoid.length ? `<p class="sub">别拿</p><div class="tags">${talents.avoid.map((n) => tline(n, 'no')).join('')}</div>` : ''}
      ${talents.note ? `<p class="note">${esc(talents.note)}</p>` : ''}</div>
    <div class="col rv"><h4>装备</h4><ol>${(r.gear || []).map((g) => { const name = typeof g === 'string' ? g : g.h || g.who; const it = IDX.equip.get(name) || relItem(name); const d = (e?.items || []).find((x) => x[0] === name); return `<li><b><button type="button" class="lordline" data-card="${esc(name)}">${it?.img ? `<img src="${esc(it.img)}" alt="" class="sq">` : ''}${esc(name)}</button></b><em class="${d && d[2] < 0 ? 'up' : 'dim'}">${d ? lift(d[2]) : ''}</em></li>`; }).join('')}</ol>${r.gearNote ? `<p class="note">${esc(r.gearNote)}</p>` : ''}</div>
  </div>`, { note: `数字是${r.carry}对局里的统计；↑ 表示有它时平均名次提前多少。` });
}
function pivotBlock(r) {
  const pv = r.pivots || []; const vs = r.variants || [];
  if (!pv.length && !vs.length) return '';
  return sec('转型', `<ul class="pivots">${pv.map((p) => { const to = p.to && routeById.get(p.to); return `<li class="rv"><div class="when">如果${esc(p.when.replace(/^如果/, ''))}</div><div>${to ? `<a class="to" href="#/r/${to.id}" data-morph>→ 换${esc(to.name)}</a>` : ''}<p class="how${to ? '' : ' solo'}">${esc(p.how)}</p></div></li>`; }).join('')}
  ${vs.map((v) => `<li class="rv"><div class="when">${esc(v.name)}<small>${esc(v.when)}</small></div><div><div class="to">${esc(v.swap)}</div><p class="how">${esc(v.note)}</p></div></li>`).join('')}</ul>`);
}

// ── 跟打 ─────────────
function playPage(r, q) {
  tint(heroPal(r.carry));
  const ban = q.get('ban'); const lord = q.get('lord');
  if (ban || lord) store.set('game', { route: r.id, ban, lord });
  const game = store.get('game', {});
  const steps = PHASES.filter((p) => r.phases?.[p.id]);
  let i = Math.min(store.get('step.' + r.id, 0), steps.length - 1);
  const checks = store.get('chk.' + r.id, {});
  const draw = () => {
    const p = steps[i]; const ph = r.phases[p.id]; const auc = !!p.auction;
    const buyList = auc ? (ph.targets || []) : (ph.buy || []).map((h) => ({ h }));
    view.innerHTML = `<div class="play">
      <p class="dim play-ctx"><a class="ln" href="#/r/${r.id}">${esc(r.name)}</a>${game.route === r.id && game.lord ? ` · 棋手 ${esc(game.lord)}` : ''}${game.route === r.id && game.ban && game.ban !== '未知' ? ` · 禁${esc(FAC_SHORT[game.ban] || game.ban)}` : ''}</p>
      <nav class="ticks" aria-label="回合">${steps.map((s, k) => `<button type="button" data-step="${k}" class="${k < i ? 'done' : ''}"${k === i ? ' aria-current="step"' : ''}>${esc(s.id)}</button>`).join('')}</nav>
      <div class="stage">
        <div class="st-n"><b>${esc(p.id)}</b><span>${auc ? `拍卖 · ${esc(p.auction)}` : `${p.e} 能量 · ${esc(p.lv)} · ${p.pop} 人上场`}</span></div>
        <div class="st-body">
          ${buyList.length ? `<section><h4>${auc ? '拍这些（出价上限）' : '看到就买'}</h4><div class="buys">${buyList.map((t) => auc ? `<div class="tg">${card(t.h, { eager: true })}<span class="cap2">≤ ${t.cap} 能量</span>${t.note ? `<small>${esc(t.note)}</small>` : ''}</div>` : card(t.h, { eager: true })).join('')}</div></section>` : ''}
          ${(ph.do || []).length ? `<section><h4>这回合</h4><div class="dos">${ph.do.map((d, k) => { const key = p.id + ':' + k; return `<button type="button" class="chk" data-chk="${esc(key)}" aria-pressed="${!!checks[key]}"><i></i><span>${esc(d)}</span></button>`; }).join('')}</div></section>` : ''}
          ${(ph.if || []).length ? `<section><h4>如果</h4><ul class="ifs">${ph.if.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>` : ''}
          ${i === steps.length - 1 && r.pivots?.length ? `<section><h4>转型</h4><ul class="ifs">${r.pivots.map((pv) => `<li>${esc(pv.when)} → ${esc(pv.how)}</li>`).join('')}</ul></section>` : ''}
        </div>
      </div>
    </div>
    <div class="pbar"><button type="button" class="go ghost" data-prev ${i === 0 ? 'disabled' : ''}>${i > 0 ? esc(steps[i - 1].id) : '开始'}</button><button type="button" class="go" data-next ${i === steps.length - 1 ? 'disabled' : ''}>${i < steps.length - 1 ? '下一步 ' + esc(steps[i + 1].id) : '最后一步'}</button></div>`;
    $$('.ticks button', view)[i]?.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (G() && !RM) {
      G().from($('.st-n b', view), { opacity: 0, x: 30, duration: 0.5, ease: 'power3.out' });
      G().from($$('.st-body .card', view), { opacity: 0, y: 36, rotate: -5, duration: 0.55, stagger: 0.06, ease: 'back.out(1.4)' });
      G().from($$('.st-body .dos, .st-body .ifs', view), { opacity: 0, y: 16, duration: 0.45, delay: 0.1, ease: 'power3.out' });
    }
  };
  const goStep = (k) => { i = Math.max(0, Math.min(steps.length - 1, k)); store.set('step.' + r.id, i); draw(); };
  view.onclick = (e) => {
    const t = e.target.closest('[data-step],[data-prev],[data-next],[data-chk]');
    if (!t) return;
    if (t.dataset.step) goStep(+t.dataset.step);
    else if (t.hasAttribute('data-prev')) goStep(i - 1);
    else if (t.hasAttribute('data-next')) goStep(i + 1);
    else if (t.dataset.chk) { checks[t.dataset.chk] = !checks[t.dataset.chk]; store.set('chk.' + r.id, checks); t.setAttribute('aria-pressed', String(!!checks[t.dataset.chk])); }
  };
  keyNav = (e) => { if (e.key === 'ArrowRight') goStep(i + 1); if (e.key === 'ArrowLeft') goStep(i - 1); };
  let sx = null;
  view.ontouchstart = (e) => { sx = e.touches[0].clientX; };
  view.ontouchend = (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 70) goStep(i + (dx < 0 ? 1 : -1)); sx = null; };
  draw();
}
let keyNav = null;
document.addEventListener('keydown', (e) => { if (keyNav && document.body.dataset.page === 'play' && !sheet.open) keyNav(e); });

// ── 棋手 ─────────────
function lordsPage() {
  tint(null);
  const L = [...DB.lords].map((l) => ({ l, st: EVIDENCE.base.lord[l.name] || [], g: lordGuide.get(l.name) }))
    .sort((a, b) => (a.st[1] ?? 9) - (b.st[1] ?? 9));
  view.innerHTML = `<section class="sec top"><h1 class="h2">棋手</h1>
    <p class="lede rv">按平均名次排序。棋手在第一回合就选定，这组对比是本站最可靠的数据。</p>
    <div class="lords">${L.map(({ l, st, g }) => { const route = (g?.routes || []).map((id) => routeById.get(id)).filter(Boolean)[0]; const pal = lordPal(l.name); return `<button type="button" class="lord rv" data-lord="${esc(l.name)}" style="--lc:${esc(pal?.deep || '#1b1d24')};--la:${esc(pal?.accent || '#eceae4')}">
      <img class="lb" src="${esc(lordImg(l.name, 'bg'))}" alt="" loading="lazy"><img class="lh" src="${esc(lordImg(l.name, 'half'))}" alt="" loading="lazy">
      <span class="ln-top">${st[0] ? kfmt(st[0]) + ' 局' : ''}</span><span class="ln-bot"><strong>${esc(l.name)}</strong><span>${route ? '主打 ' + esc(route.name) : esc(g?.tier ? g.tier + ' 级' : '')}</span></span><span class="ln-avg">${f2(st[1])}</span></button>`; }).join('')}</div>
  </section>${foot()}`;
}
function openLord(name) {
  const l = IDX.lord.get(name); if (!l) return;
  const g = lordGuide.get(name); const st = EVIDENCE.base.lord[name] || []; const el = EVIDENCE.lord[name];
  const routes = ROUTES.filter((r) => (r.lords || []).some((x) => x.name === name) || (g?.routes || []).includes(r.id));
  const bestHeroes = (el?.heroes || []).filter((h) => h[1] >= 300 && h[3] < -0.1).slice(0, 8);
  openSheet(`<div class="sh-lord-art" style="--lc:${esc(lordPal(name)?.deep || '#1b1d24')}"><img class="lb" src="${esc(lordImg(name, 'bg'))}" alt=""><img class="lh" src="${esc(lordImg(name, 'half'))}" alt=""></div>
  <h2 style="margin-top:22px">${esc(name)}</h2>
  <div class="facts" style="margin-top:14px"><div><b>${f2(st[1])}</b><span>平均名次</span></div><div><b>${st[0] ? kfmt(st[0]) : '—'}</b><span>局</span></div>${el ? `<div><b>${Math.round(el.win)}%</b><span>登顶率</span></div>` : ''}</div>
  ${g?.one ? `<p class="txt">${esc(g.one)}</p>` : ''}
  ${routes.length ? `<h4>打哪条路线</h4><div class="tags">${routes.map((r) => `<a class="ln" href="#/r/${r.id}">${esc(r.name)}</a>`).join('')}</div>` : ''}
  ${g?.use ? `<h4>怎么用</h4><div class="txt"><p>${esc(g.use)}</p></div>` : ''}
  ${bestHeroes.length ? `<h4>在${esc(name)}手里特别好用的英雄</h4><div class="avs">${bestHeroes.map((h) => av(h[0], { label: false })).join('')}</div>` : ''}
  ${(l.stages || []).map((s) => `<h4>${esc(s.stage)}</h4>${s.cards.map((c) => `<div class="txt"><p><b>${esc(c.name)}</b>　${esc(c.text)}</p></div>`).join('')}`).join('')}`);
}

// ── 要点 ─────────────
function tipsPage() {
  tint(null);
  view.innerHTML = `<section class="sec top"><h1 class="h2">要点</h1><p class="lede rv">会改变操作的结论。每条注明依据：「数据」来自对局统计，「推断」来自卡面机制。</p></section>
  ${TIPS.map((g) => `<section class="sec tipg"><h2 class="h3 tip-h">${esc(g.group)}</h2>
    ${g.items.map((t) => `<article class="tip rv" id="tip-${esc(t.id)}"><div><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p>${t.cards?.length ? avs(t.cards) : ''}</div><div class="tip-ev"><span class="basis${t.basis === '推断' ? ' guess' : ''}">${esc(t.basis)}</span><p>${esc(t.ev)}</p></div></article>`).join('')}</section>`).join('')}
  ${foot()}`;
}

// ── 查牌 ─────────────
const KINDS = [['hero', '英雄'], ['effect', '效果牌'], ['talent', '天赋'], ['equip', '装备']];
const cs = { kind: 'hero', fac: '全部', q: '' };
function cardsPage(q) {
  tint(null);
  if (q?.get('q')) cs.q = q.get('q');
  view.innerHTML = `<section class="sec top"><h1 class="h2">查牌</h1>
    <div class="finder"><input id="cq" type="search" placeholder="名字或效果，比如 整备、古币、复生" value="${esc(cs.q)}" aria-label="搜索卡牌"></div>
    <div class="segs" id="ck">${KINDS.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${cs.kind === k}">${n}</button>`).join('')}</div>
    <div class="segs" id="cf">${['全部', ...FACS, '无阵营'].map((f) => `<button type="button" data-fc="${f}" aria-pressed="${cs.fac === f}">${esc(FAC_SHORT[f] || f)}</button>`).join('')}</div>
    <div id="wall"></div></section>${foot()}`;
  const draw = () => {
    const list = { hero: DB.heroes, effect: DB.effects, talent: DB.talents, equip: DB.equipment }[cs.kind];
    const qq = cs.q.trim();
    const hit = list.filter((c) => (cs.fac === '全部' || c.faction === cs.fac || (cs.fac === '无阵营' && /无阵营|通用|^$/.test(c.faction || ''))) && (!qq || c.name.includes(qq) || (c.text || '').includes(qq) || (c.awake || '').includes(qq)))
      .sort((a, b) => (a.tier || 0) - (b.tier || 0));
    const big = cs.kind === 'hero' || cs.kind === 'effect';
    $('#wall').innerHTML = hit.length ? `<div class="wall${big ? '' : ' list'}">${hit.map((c) => big && cardSrc(c.name) ? card(c.name) : `<button type="button" class="ti" data-card="${esc(c.name)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : '<span></span>'}<span><b>${esc(c.name)}</b><span>${esc(c.text || (c.rel || []).map((x) => x.name).join('、'))}</span></span></button>`).join('')}</div>` : `<p class="lede dim">没有找到「${esc(qq)}」。试试只输入关键词，比如「牺牲」。</p>`;
  };
  $('#cq').addEventListener('input', (e) => { cs.q = e.target.value; draw(); });
  $('#ck').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; cs.kind = b.dataset.k; $$('#ck button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  $('#cf').addEventListener('click', (e) => { const b = e.target.closest('[data-fc]'); if (!b) return; cs.fac = b.dataset.fc; $$('#cf button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); });
  draw();
}
function relItem(name) {
  for (const e of DB.equipment) { const x = (e.rel || []).find((y) => y.name === name); if (x) return { img: e.img, name, text: x.text }; }
  return null;
}
function routesUsing(name) { return ROUTES.filter((r) => (r.core || []).some((c) => c.h === name) || r.carry === name); }
function openCard(name) {
  const f = find(name); if (!f) return;
  const { kind, c } = f;
  if (kind === 'lord') { openLord(name); return; }
  const uses = routesUsing(name);
  const note = kind === 'hero' ? HERO_NOTES[name] : kind === 'talent' && TALENT_NOTES[name] ? ['天赋', TALENT_NOTES[name][1]] : null;
  const label = kind === 'hero' ? `${c.tier} 阶英雄 · ${c.faction}` : kind === 'talent' ? `${c.tier} 阶天赋` : kind === 'effect' ? `${c.tier} 阶效果牌 · ${c.cost ?? '?'} 能量` : '装备';
  const b = kind === 'hero' ? EVIDENCE.base.hero[name] : kind === 'equip' ? EVIDENCE.base.item[name] : kind === 'talent' ? EVIDENCE.base.talent[name] : null;
  const e = kind === 'hero' ? ev(name) : null;
  openSheet(`<div class="sh-top">${cardSrc(name) ? card(name, { eager: true }) : c.img ? `<img src="${esc(c.img)}" alt="" style="width:110px;border-radius:8px">` : '<span></span>'}<div>
    <p class="meta">${esc(label)}</p><h2>${esc(name)}</h2>
    ${b ? `<div class="facts" style="margin-top:14px">${kind === 'hero' ? `<div><b>${b[1]}</b><span>终局平均等级</span></div><div><b>${f2(b[2])}</b><span>在场时平均名次</span></div>` : `<div><b>${f2(b[1])}</b><span>平均名次</span></div>`}<div><b>${kfmt(b[0])}</b><span>局</span></div></div>` : ''}
  </div></div>
  ${note ? `<div class="txt"><p>${esc(note[1])}</p></div>` : ''}
  ${c.text ? `<h4>卡面</h4><div class="txt"><p>${esc(c.text)}</p></div>` : ''}
  ${c.awake ? `<h4>觉醒</h4><div class="txt"><p>${esc(c.awake)}</p></div>` : ''}
  ${(c.skills || []).map((s) => `<h4>技能 · ${esc(s.name)}</h4><div class="txt"><p>${esc(s.text)}</p></div><ol class="nodes">${s.nodes.map((n) => `<li><b>${n.lv}</b><span>${esc(n.text)}</span></li>`).join('')}</ol>`).join('')}
  ${c.stats ? `<h4>1 级属性</h4><p class="dim">生命 ${c.stats.hp} · 物攻 ${c.stats.atk} · 法攻 ${c.stats.ap} · 距离 ${c.stats.range} · 法力 ${c.stats.mana0}/${c.stats.mana}</p>` : ''}
  ${c.rel?.length ? `<h4>可以铸造成</h4>${c.rel.map((x) => `<div class="txt"><p><b>${esc(x.name)}</b>　${esc(x.text)}</p></div>`).join('')}` : ''}
  ${e ? `<h4>和${esc(name)}最配的英雄</h4><div class="avs">${e.partners.filter((p) => p[1] >= 400).slice(0, 8).map((p) => av(p[0], { label: false })).join('')}</div>` : ''}
  ${uses.length ? `<h4>用到它的路线</h4><div class="tags">${uses.map((r) => `<a class="ln" href="#/r/${r.id}">${esc(r.name)}</a>`).join('')}</div>` : ''}`);
}
function openSheet(html) {
  sheetBody.innerHTML = `<button type="button" class="sh-x" data-close aria-label="关闭">×</button>${html}`;
  if (!sheet.open) { sheet.showModal(); lenis?.stop(); }
  sheet.scrollTop = 0;
}
sheet.addEventListener('close', () => lenis?.start());
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

// ── 全局点击 ─────────────
document.addEventListener('click', (e) => {
  const banEl = e.target.closest('[data-ban]');
  if (banEl && document.body.dataset.page === 'home') {
    const ban = banEl.dataset.ban; store.set('ban', ban);
    const hero = $('.home-hero'); const F = window.Flip;
    const state = F && !RM && !hero.classList.contains('chosen') ? F.getState('.ban, .ask, .pick') : null;
    $$('.ban').forEach((b) => b.setAttribute('aria-pressed', String(b === banEl)));
    hero.classList.add('chosen');
    if (state) { G().registerPlugin(F); F.from(state, { duration: 0.7, ease: 'power3.inOut', stagger: 0.015 }); }
    paintPick(ban === '未知' ? null : ban, true); showVerdict(ban); return;
  }
  if (e.target.closest('[data-clear]')) { store.set('ban', null); pickKey = ''; killMotion(); home(); motion(view); window.scrollTo({ top: 0 }); return; }
  if (e.target.closest('[data-note]')) { openDataNote(); return; }
  const jump = e.target.closest('[data-jump]');
  if (jump) { e.preventDefault(); const t = document.getElementById(jump.dataset.jump); if (t) { if (lenis) lenis.scrollTo(t, { offset: -70 }); else t.scrollIntoView({ behavior: 'smooth' }); } return; }
  const morph = e.target.closest('[data-morph]');
  if (morph && document.startViewTransition && !RM && !e.target.closest('[data-card],[data-lord]')) {
    // 标题形变：被点的路线名 → 下一页海报标题
    $$('.p-title.vt').forEach((x) => x.classList.remove('vt'));
    const t = morph.querySelector('h3, strong') || morph;
    t.style.viewTransitionName = 'rt'; viaMorph = true;
  }
  const lordEl = e.target.closest('[data-lord]');
  const cardEl = e.target.closest('[data-card]');
  if (lordEl) { e.preventDefault(); openLord(lordEl.dataset.lord); return; }
  if (cardEl) { e.preventDefault(); openCard(cardEl.dataset.card); }
});

// ── 渲染效果 ─────────────
let cleanups = [];
let onResize = null;
function killMotion() {
  const ST = window.ScrollTrigger;
  if (ST) ST.getAll().forEach((t) => t.kill());
  cleanups.forEach((f) => f()); cleanups = [];
  keyNav = null; onResize = null; view.onclick = null; view.ontouchstart = null; view.ontouchend = null;
}
addEventListener('resize', () => onResize?.(), { passive: true });

// 余烬：主色的光点从下往上飘；离开视口或切到后台时停止
function embers(canvas, color, n) {
  if (!canvas || RM) return () => {};
  const ctx = canvas.getContext('2d');
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#eceae4';
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  let w = 0, h = 0, raf = 0, on = false;
  const ps = [];
  const resize = () => { const d = Math.min(1.5, devicePixelRatio || 1); w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * d; canvas.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const spawn = (p, init) => { p.x = Math.random() * w; p.y = init ? Math.random() * h : h + 8; p.r = Math.random() * 1.6 + 0.5; p.vy = -(Math.random() * 0.45 + 0.2); p.vx = (Math.random() - 0.5) * 0.18; p.t = 0; p.max = Math.random() * 420 + 280; p.ph = Math.random() * 6.28; };
  resize();
  for (let i = 0; i < n; i++) { const p = {}; spawn(p, true); p.t = Math.random() * p.max; ps.push(p); }
  const tick = () => {
    ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      p.t++; p.ph += 0.018; p.x += p.vx + Math.sin(p.ph) * 0.22; p.y += p.vy;
      if (p.t > p.max || p.y < -10) spawn(p, false);
      const a = Math.sin((Math.PI * p.t) / p.max) * 0.85;
      ctx.fillStyle = `rgba(${rgb},${a * 0.16})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4.5, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!on && !document.hidden) { on = true; raf = requestAnimationFrame(tick); } };
  const stop = () => { on = false; cancelAnimationFrame(raf); };
  const io = new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop())); io.observe(canvas);
  const vis = () => (document.hidden ? stop() : start()); document.addEventListener('visibilitychange', vis);
  addEventListener('resize', resize);
  return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', vis); removeEventListener('resize', resize); };
}

// 卡面：跟随指针的 3D 倾斜 + 高光 + 镭射反光
let hotCard = null;
function resetCard(c) { c.classList.remove('hot'); ['--rx', '--ry', '--o'].forEach((k) => c.style.removeProperty(k)); }
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || RM) return;
  const c = e.target.closest('.card');
  if (hotCard && hotCard !== c) resetCard(hotCard);
  hotCard = c;
  if (!c) return;
  const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
  c.classList.add('hot');
  c.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  c.style.setProperty('--rx', ((0.5 - y) * 16).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((x - 0.5) * 20).toFixed(2) + 'deg');
  c.style.setProperty('--o', '1');
}, { passive: true });

// 路线列表：悬停时人物跟随指针浮现
let peek = null;
function setupPeek(root) {
  if (!FINE || RM || !G()) return;
  const rows = $$('[data-peek]', root); if (!rows.length) return;
  if (!peek) { peek = document.createElement('img'); peek.className = 'peek cut'; peek.alt = ''; document.body.appendChild(peek); }
  const g = G(); const qx = g.quickTo(peek, 'x', { duration: 0.6, ease: 'power3' }); const qy = g.quickTo(peek, 'y', { duration: 0.6, ease: 'power3' });
  const move = (e) => { qx(e.clientX + 30); qy(e.clientY - peek.offsetHeight * 0.55); };
  rows.forEach((row) => {
    row.addEventListener('mouseenter', (e) => { peek.src = row.dataset.peek; g.set(peek, { x: e.clientX + 30, y: e.clientY - 160 }); g.to(peek, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }); });
    row.addEventListener('mousemove', move);
    row.addEventListener('mouseleave', () => g.to(peek, { opacity: 0, scale: 0.9, duration: 0.3 }));
  });
  cleanups.push(() => g.set(peek, { opacity: 0 }));
}

function motion(root) {
  const g = G(); const ST = window.ScrollTrigger;
  const els = $$('.rv', root);
  if (!g || RM || !ST) { els.forEach((x) => x.classList.remove('rv')); $$('.embers', root).forEach((c) => (c.hidden = true)); return; }
  g.registerPlugin(ST); if (window.SplitText) g.registerPlugin(window.SplitText);
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const accent = !acc || acc === NEUTRAL.accent ? '#e0a45c' : acc;   // 没选棋手时用暖色余烬

  // 海报：三层景深入场 + 指针视差 + 滚动视差 + 余烬
  const poster = $('.poster', root);
  if (poster) {
    const spans = $$('.p-title:not(.ghost) span', poster);
    if (!viaMorph) g.from(spans, { yPercent: 70, opacity: 0, duration: 1.1, ease: 'power4.out', stagger: 0.08 });
    g.from($$('.ghost span', poster), { opacity: 0, duration: 1.2, delay: 0.5 });
    g.from($('.pl-bg img', poster) || $('.p-cut', poster), { scale: 1.12, opacity: 0, duration: 1.6, ease: 'power2.out' });
    const fg = $('.pl-fg img', poster);
    if (fg) g.from(fg, { y: 70, opacity: 0, duration: 1.3, ease: 'power3.out', delay: 0.15 });
    g.from($$('.p-body > *', poster), { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.07, delay: 0.4 });
    const st = () => ({ trigger: poster, start: 'top top', end: 'bottom top', scrub: true });
    g.to($('.pl-bg', poster) || $('.p-cut', poster), { yPercent: 8, ease: 'none', scrollTrigger: st() });
    if (fg) g.to($('.pl-fg', poster), { yPercent: 16, ease: 'none', scrollTrigger: st() });
    g.to($$('.p-title', poster), { yPercent: -22, ease: 'none', scrollTrigger: st() });
    countUp($$('.nums b', poster));
    cleanups.push(embers($('.embers', poster), accent, innerWidth < 720 ? 26 : 60));
    if (FINE && fg) {
      const layers = [[$('.pl-bg', poster), 14, 9], [$('.pl-fg', poster), 30, 16], [$$('.p-title', poster), -12, -6]];
      const qs = layers.map(([el, dx, dy]) => [g.quickTo(el, 'x', { duration: 1.1, ease: 'power3' }), g.quickTo(el, 'y', { duration: 1.1, ease: 'power3' }), dx, dy]);
      const mv = (e) => { const r = poster.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - 0.5; const ny = (e.clientY - r.top) / r.height - 0.5; qs.forEach(([qx, qy, dx, dy]) => { qx(-nx * dx); qy(-ny * dy); }); };
      poster.addEventListener('pointermove', mv);
      cleanups.push(() => poster.removeEventListener('pointermove', mv));
    }
  }
  // 首页：人物缓慢漂浮 + 余烬
  const pick = $('.pick', root);
  if (pick) {
    cleanups.push(embers($('#home-embers'), accent, innerWidth < 720 ? 18 : 40));
    const tw = g.to('#pick-art', { y: -12, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    cleanups.push(() => tw.kill());
    if (!$('.home-hero.chosen', root)) g.from($$('.ask, .ask-sub, .ban', root), { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.05 });
  }
  // 大标题：逐行从遮罩里升起
  if (window.SplitText) {
    $$('.sec .h2', root).forEach((h) => {
      const s = window.SplitText.create(h, { type: 'lines', mask: 'lines' });
      g.from(s.lines, { yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.08, scrollTrigger: { trigger: h, start: 'top 92%', once: true } });
      cleanups.push(() => s.revert());
    });
  }
  // 每回合：行出现后发牌
  $$('.rd', root).forEach((rd) => {
    const cards = $$('.card', rd);
    const tl = g.timeline({ scrollTrigger: { trigger: rd, start: 'top 88%', once: true } });
    tl.from(rd, { opacity: 0, y: 30, duration: 0.6, ease: 'power3.out' });
    if (cards.length) tl.from(cards, { opacity: 0, y: 50, rotate: -7, transformOrigin: '50% 100%', duration: 0.6, stagger: 0.07, ease: 'back.out(1.5)', clearProps: 'transform' }, '-=0.35');
  });
  // 阵容：竖幅依次从下方切入
  $$('.squad', root).forEach((t) => { t.classList.remove('rv'); g.from($$('.slot', t), { yPercent: 18, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'power3.out', scrollTrigger: { trigger: t, start: 'top 85%', once: true } }); });
  // 条形图：从零长出
  $$('.bar2 i', root).forEach((b) => g.from(b, { width: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: b, start: 'top 94%', once: true } }));
  $$('.colbar i', root).forEach((b) => g.from(b, { height: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: b, start: 'top 94%', once: true } }));
  ST.batch(els, { start: 'top 92%', once: true, onEnter: (b) => g.to(b, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, overwrite: true }) });
  setupPeek(root);
  requestAnimationFrame(() => ST.refresh());
}
function countUp(bs) {
  const g = G();
  bs.forEach((b) => {
    const raw = b.dataset.count || b.textContent; const m = raw.match(/^([\d.]+)(.*)$/);
    if (!m) return;
    const to = parseFloat(m[1]); const dec = (m[1].split('.')[1] || '').length; const tail = m[2];
    const o = { v: dec ? 6 : 0 };
    g.to(o, { v: to, duration: 1.4, ease: 'power3.out', delay: 0.5, onUpdate: () => { b.textContent = o.v.toFixed(dec) + tail; } });
  });
}
// 顶栏：向下滚动时收起
let lastY = 0;
addEventListener('scroll', () => { const y = scrollY; $('#bar').classList.toggle('away', y > 160 && y > lastY && document.body.dataset.page !== 'play'); lastY = y; }, { passive: true });

// 桌面端平滑滚动（Lenis），与 ScrollTrigger 同步
let lenis = null;
function setupLenis() {
  if (!FINE || RM || !window.Lenis || !G() || !window.ScrollTrigger) return;
  lenis = new window.Lenis({ lerp: 0.11 });
  lenis.on('scroll', window.ScrollTrigger.update);
  G().ticker.add((t) => lenis.raf(t * 1000));
  G().ticker.lagSmoothing(0);
}

// ── 启动 ─────────────
Promise.all([
  fetch('data/cards.json').then((r) => r.json()),
  fetch('data/art.json').then((r) => r.json()).catch(() => ({ card: {}, lord: {} })),
  fetch('data/palette.json').then((r) => r.json()).catch(() => ({ hero: {}, lord: {} })),
  fetch('data/posters.json').then((r) => r.json()).catch(() => ({})),
]).then(([d, art, pal, posters]) => {
  DB = d; ART = art; PAL = pal; POSTER = posters;
  d.heroes.forEach((c) => IDX.hero.set(c.name, c));
  d.talents.forEach((c) => IDX.talent.set(c.name, c));
  d.effects.forEach((c) => IDX.effect.set(c.name, c));
  d.equipment.forEach((c) => IDX.equip.set(c.name, c));
  d.lords.forEach((c) => IDX.lord.set(c.name, c));
  setupLenis();
  addEventListener('hashchange', render);
  (document.fonts?.ready || Promise.resolve()).then(render);
}).catch((err) => { console.error(err); view.innerHTML = '<p class="wrap" style="padding-top:140px">数据没有载入。刷新重试；本地打开需要 HTTP 服务（见 README）。</p>'; });
