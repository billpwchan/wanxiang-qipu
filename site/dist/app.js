// 万象棋谱 v5
// 页面：#/ 开局 · #/play/:id 对局 · #/r/:id 路线 · #/routes · #/lords · #/cards · #/rules
import { STAGES, BANS, ROUTES, TRAPS, RULES } from './data/plan.js';
import { FACTS } from './data/facts.js';
import { ICONS } from './data/icons.js';
import { Glass, composeAnswer, composeParade } from './glass.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STILL = /[?&]still\b/.test(location.search);
const RM = STILL || matchMedia('(prefers-reduced-motion: reduce)').matches;
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const R = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
const F = FACTS.routes;
const L = FACTS.lords;
const view = $('#view');
const sheet = $('#sheet');
const panel = $('#panel');

let CARDS = null, BY = {}, ART = {};

const store = {
  get(k, d) { try { const v = localStorage.getItem('wx.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wx.' + k, JSON.stringify(v)); } catch {} },
};

// 棋手主色（取自官方棋手背景图）
const LC = { 乔汐: '#c43033', 姜导: '#8c7b6a', 嬴律: '#bb5851', 孙小宾: '#2f63d6', 小妲己: '#d9a53c', 常小娥: '#d13b76', 庄小鱼: '#3863c7', 弈星: '#4f5a9a', 明先生: '#d7393f', 昭君: '#3a74e8', 玉环: '#3aa3a0', 班叔: '#8a9a5b', 瑶妹: '#c865a0', 白歌: '#b08a60', 镜: '#8e96b8', 闹闹: '#5068bc', 阿离: '#d9b43c', 香香: '#e07a3a', 马可: '#d0433a' };
const LORD_TRAP = { 白歌: 'wukong', 常小娥: 'lukong', 阿离: 'shouyue', 闹闹: 'rilou', 镜: 'jingpig' };

// ---------- 小部件 ----------
const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
};

function emb(name, cls = 'emb') {
  const i = ICONS[name === '无阵营' || name === '未知' ? '无阵营' : name];
  if (!i) return '';
  return `<svg class="${cls}" viewBox="0 0 ${i.w} ${i.h}" aria-hidden="true"><g transform="${i.tr}"><path d="${i.d}"/></g></svg>`;
}
const facLabel = (f) => `<span class="fac f-${esc(f)}">${emb(f)}${esc(f)}</span>`;
const short = (f) => ({ 三分之地: '三分', 大河流域: '大河' }[f] || f);

// 品阶：游戏里用节点数表示
function tierGlyph(n) {
  if (!n) return '';
  const pts = n === 1 ? [] : Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [12 + 6.4 * Math.cos(a), 12 + 6.4 * Math.sin(a)]; });
  const lines = pts.map(([x, y]) => `<line x1="12" y1="12" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`).join('');
  const dots = n === 1 ? '<circle cx="12" cy="12" r="3.6"/>' : pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`).join('');
  return `<svg class="tier tg" viewBox="0 0 24 24" aria-label="${n} 阶"><circle class="bgc" cx="12" cy="12" r="11.5"/>${lines}${dots}</svg>`;
}

function face(name) { const c = BY[name]; return c?.img || ''; }
function lordIcon(name) { return L[name]?.icon || ''; }

function card(name, o = {}) {
  const c = BY[name];
  const hero = c?._k === 'heroes';
  const src = hero ? (c.art || c.img) : c?.img;
  const cls = ['cd', hero ? '' : 'fx', o.core ? 'core' : '', o.keep ? 'keep' : '', `f-${c?.faction || '无阵营'}`].join(' ');
  return `<button class="${cls}" data-card="${esc(name)}" type="button">
    <div class="art">${hero ? tierGlyph(c.tier) : ''}${src ? `<img src="${src}" alt="" loading="lazy" decoding="async">` : ''}</div>
    ${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ''}
    <div class="nm">${esc(name)}</div>${o.why ? `<div class="why">${esc(o.why)}</div>` : ''}
  </button>`;
}

function ruler(avg, o = {}) {
  if (avg == null) return '';
  const p = Math.max(0, Math.min(100, ((avg - 1) / 5) * 100)).toFixed(1);
  return `<div class="ruler ${o.sm ? 'sm' : ''}" style="--p:${p}%" role="img" aria-label="平均第 ${avg.toFixed(1)} 名（6 人局）">
    <div class="rtop"><span class="rnum">${avg.toFixed(1)}</span><span class="rl">${o.label || '平均名次'}${o.sm ? '' : '（6 人局）'}</span></div>
    <div class="track"><i></i></div>
    <div class="ticks"><em>第 1 名</em><em>平均</em><em>第 6 名</em></div>
  </div>`;
}

function statLine(s, o = {}) {
  if (!s) return '';
  return `<div class="stats">${s.top3 != null ? `<span>前三<b>${Math.round(s.top3)}%</b></span>` : ''}${s.win != null ? `<span>吃鸡<b>${Math.round(s.win)}%</b></span>` : ''}${o.noGames ? '' : `<span>${s.games.toLocaleString()} 局</span>`}</div>
    ${o.noLabel ? '' : `<div class="src">${esc(s.label)} · <button data-note>数字怎么来的</button></div>`}`;
}

const TIER = { top: ['首选', '选了这个棋手后的全部对局平均排在前 3.2 名以内'], ok: ['可以打', '比平均好一些'], avg: ['一般', '和平均差不多，别的打不了再考虑'] };
function tierChip(t) { return `<span class="chip tier-${t}">${TIER[t][0]}</span>`; }
function routeGroups() {
  const sorted = [...ROUTES].sort((a, b) => F[a.id].stat.avg - F[b.id].stat.avg);
  return ['top', 'ok', 'avg'].map((t) => { const rs = sorted.filter((r) => F[r.id].tier === t); return rs.length ? `<div class="tgroup"><div class="tgh"><b class="d">${TIER[t][0]}</b><span>${TIER[t][1]}</span></div><div class="rgrid">${rs.map(routeTile).join('')}</div></div>` : ''; }).join('');
}
const wan = (n) => (n >= 10000 ? `${(n / 10000).toFixed(n >= 1e6 ? 0 : 1)} 万` : n.toLocaleString());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 3800);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const i = document.createElement('textarea');
    i.value = text; i.style.position = 'fixed'; i.style.opacity = '0';
    document.body.appendChild(i); i.select();
    const ok = document.execCommand('copy'); i.remove(); return ok;
  } catch { return false; }
}

// 选择棋手：路线的棋手里第一个你有的；没设置「我的棋手」时用首选
function owned() { return store.get('owned', []); }
function lordFor(route) {
  const own = owned();
  if (!own.length) return { lord: route.lords[0], have: true };
  const hit = route.lords.find((l) => own.includes(l));
  return hit ? { lord: hit, have: true } : { lord: route.lords[0], have: false };
}

function picksFor(ban) {
  const list = (FACTS.bans[ban] || FACTS.bans['未知']).map((p) => ({ ...p, r: R[p.id], ...lordFor(R[p.id]) }));
  // 有你拥有的棋手的路线排前面（保持原顺序）
  return [...list.filter((p) => p.have), ...list.filter((p) => !p.have)];
}

// ---------- 页面：开局 ----------
let glass = null;
let answered = null;

function homePage(q) {
  const ban = q.get('ban') || '未知';
  const own = owned();
  const bans = ['河洛', '逐鹿', '日落海', '三分之地', '大河流域'];
  return `
  <section class="wrap home-top">
    <div class="q">
      <h1 class="d">这局禁了哪个阵营？</h1>
      <p class="hint">开局画面上方会显示「本局禁用」。</p>
      <div class="bans" role="radiogroup" aria-label="本局禁用阵营">
        ${bans.map((b) => `<button class="ban f-${b} ${ban === b ? 'on' : ''}" role="radio" aria-checked="${ban === b}" data-ban="${b}">${emb(b)}${b}</button>`).join('')}
        <button class="ban none f-未知 ${ban === '未知' ? 'on' : ''}" role="radio" aria-checked="${ban === '未知'}" data-ban="未知">还没看到</button>
      </div>
      <div class="owned">
        ${own.length ? `<span class="ics">${own.slice(0, 8).map((n) => `<img src="${lordIcon(n)}" alt="${esc(n)}">`).join('')}</span><span>只推荐你有的 ${own.length} 个棋手</span><button class="link" data-owned>修改</button>` : `<button class="link" data-owned>只推荐我有的棋手</button>`}
      </div>
    </div>
    <div class="stage" id="stage">
      <canvas id="gl" aria-hidden="true"></canvas>
    </div>
    <div class="ans" id="ans" aria-live="polite"></div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">十套路线</h2><p>数字是「开局选了这个棋手之后的全部对局」，不只算打成的人。点进去看每个阶段买什么。</p></div><a class="btn sm" href="#/routes">全部路线</a></div>
    ${routeGroups()}
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">热门但别打</h2><p>这些阵容在游戏里被导入过上百万次，顶尖局里的平均名次却排在 3.7 名以后。</p></div></div>
    <div class="traps">${TRAPS.map(trapRow).join('')}</div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">几条通用规则</h2><p>不管打哪套都适用。</p></div><a class="btn sm" href="#/rules">全部规则</a></div>
    <div class="rules">${RULES.slice(0, 4).map(ruleCard).join('')}</div>
  </section>`;
}

function routeTile(r) {
  const f = F[r.id];
  return `<a class="rt" href="#/r/${r.id}">
    <div class="pic">${f.splash ? `<img src="${f.splash.src}" alt="" loading="lazy" style="object-position:${f.splash.fx}% ${Math.min(40, f.splash.fy)}%">` : ''}${facLabel(r.faction)}${tierChip(f.tier)}</div>
    <div class="bd">
      <h3 class="d">${esc(r.name)}</h3>
      <p class="tag">${esc(r.tag)}</p>
      <p>${esc(r.idea)}</p>
      <div class="lr">${ruler(f.stat.avg, { sm: true, label: `${f.stat.lord} · 平均名次` })}<span class="lds">${r.lords.map((n) => `<img src="${lordIcon(n)}" alt="${esc(n)}" title="${esc(n)}">`).join('')}</span></div>
    </div>
  </a>`;
}

function trapRow(t) {
  const d = FACTS.traps.find((x) => x.id === t.id);
  return `<div class="trap">
    <div class="uses">${wan(d.uses)}<small>次导入游戏</small></div>
    <div><h3>${esc(t.name)}</h3><p>${esc(t.why)}${d.lordAvg ? `${esc(d.lord)}的全部对局平均第 ${d.lordAvg.toFixed(1)} 名。` : ''}</p><p>${esc(t.fix)}${t.to ? ` <a href="#/r/${t.to}">${esc(R[t.to].name)} →</a>` : ''}</p></div>
    <div class="rm">${ruler(d.avg, { sm: true, label: `打成了也只有 · ${d.games.toLocaleString()} 局` })}</div>
  </div>`;
}

function ruleCard(x) { return `<div class="rule"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></div>`; }

function answerHTML(ban) {
  const picks = picksFor(ban);
  const p = picks[0];
  const r = p.r, f = F[r.id];
  const lo = L[p.lord];
  const sh = f.lords.find((x) => x.name === p.lord)?.share || 0;
  const s = { avg: lo.avg, top3: lo.top3, win: lo.win, games: lo.games, label: `${p.lord}的全部对局` };
  const alt = r.lords.filter((l) => l !== p.lord);
  const note = BANS[ban]?.note;
  return `
    <div class="for"><img src="${lordIcon(p.lord)}" alt="">用 <b>${esc(p.lord)}</b> 打${p.have ? '' : '<span class="chip bad">你没有这个棋手</span>'}</div>
    <h2 class="d">${esc(r.name)}</h2>
    <p class="idea">${esc(r.idea)}</p>
    ${ruler(s.avg)}
    ${statLine(s)}
    <p class="share">${sh >= 0.35 ? `${esc(p.lord)}的对局里 ${Math.round(sh * 100)}% 在打这套，数字基本就是这套的表现。` : `${esc(p.lord)}什么都能打（只有 ${Math.round(sh * 100)}% 的对局打这套），数字是它全部对局的平均。`}</p>
    <div class="acts">
      <a class="btn go" href="#/play/${r.id}?lord=${encodeURIComponent(p.lord)}">${I.play}开始对局</a>
      <a class="btn" href="#/r/${r.id}">怎么打</a>
      ${f.code ? `<button class="btn" data-code="${r.id}">${I.copy}阵容码</button>` : ''}
    </div>
    ${alt.length ? `<p class="nolord">没有${esc(p.lord)}：${alt.map(esc).join('、')}也能打。</p>` : ''}
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <div class="alts"><div class="t">备选</div>
      ${picks.slice(1, 4).map((a) => { const as = L[a.lord]; const c = BY[a.r.carry]; return `<a class="alt" href="#/r/${a.id}">
        <span class="ai">${c?.art ? `<img src="${c.art}" alt="">` : ''}</span>
        <span><span class="an">${esc(a.r.name)}</span><span class="al">${esc(a.lord)}${a.have ? '' : '（你没有）'} · ${esc(short(a.r.faction))}</span></span>
        <span class="av">${as.avg.toFixed(1)}<small>平均名次</small></span></a>`; }).join('')}
    </div>`;
}

async function homeMount(q) {
  const stage = $('#stage');
  const cv = $('#gl');
  const ban = q.get('ban') || '未知';
  glass?.destroy();
  glass = null; answered = null;
  const dark = darkMQ.matches;
  const paradeLords = ['孙小宾', '嬴律', '明先生', '香香', '昭君', '玉环', '班叔', '瑶妹', '马可', '小妲己', '庄小鱼', '白歌'];
  const g = new Glass(cv, { flute: innerWidth < 600 ? 20 : 26, tint: dark ? [0.06, 0.08, 0.16] : [0.9, 0.93, 1] });
  if (!g.ok) {
    stage.insertAdjacentHTML('afterbegin', `<img class="still" alt="" src="${L['孙小宾'].img}" style="object-fit:contain;object-position:50% 100%">`);
  } else {
    glass = g;
    const parade = await composeParade(paradeLords.map((n) => L[n].small), { h: 900, dark });
    if (glass !== g) return;
    g.set(0, parade, 0, 0, true);
    g.panSpeed = RM ? 0 : 0.012;
    g.open = -1;
    g.draw(); g.kick();
    stage.addEventListener('pointermove', (e) => {
      const b = stage.getBoundingClientRect();
      g.pointer((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    });
    stage.addEventListener('pointerleave', () => g.pointer(0.5, 0.5));
  }
  // 文字立即出现；玻璃先停在棋手群像上，再推开露出答案
  showAnswer(ban, { quiet: true, glassDelay: RM ? 0 : 700 });
}

async function showAnswer(ban, o = {}) {
  const ans = $('#ans');
  if (!ans) return;
  ans.innerHTML = answerHTML(ban);
  $$('.ban').forEach((b) => { const on = b.dataset.ban === ban; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  if (!RM && !o.quiet) {
    $$('#ans > *').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 60 + i * 45, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
  }
  const p = picksFor(ban)[0];
  const stage = $('#stage');
  stage.classList.add('answered');
  const key = p.id + p.lord;
  if (answered === key) return;
  answered = key;
  const f = F[p.id];
  const dark = darkMQ.matches;
  if (glass) {
    const g = glass;
    const b = stage.getBoundingClientRect();
    const scale = Math.min(1.6, devicePixelRatio || 1);
    const cv = await composeAnswer({ splash: f.splash?.src, lord: L[p.lord]?.img, w: Math.round(b.width * scale), h: Math.round(b.height * scale), dark, fx: (f.splash?.fx ?? 60) / 100, fy: 0.3 });
    if (o.glassDelay) await new Promise((ok) => setTimeout(ok, o.glassDelay));
    if (g !== glass || answered !== key) return;
    if (g.bInfo) { g.swap(); g.pan = 0; g.panSpeed = 0; }
    g.set(1, cv);
    if (RM) { g.open = 1; g.panSpeed = 0; g.draw(); } else g.reveal(1.15, () => { g.panSpeed = 0; });
  } else {
    const still = $('.still', stage);
    if (still) still.src = L[p.lord].img;
  }
  if (!o.quiet && innerWidth < 900) stage.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
}

// ---------- 页面：路线列表 ----------
function routesPage() {
  return `<section class="wrap sec" style="padding-top:clamp(24px,4vw,48px)">
    <div class="hdr"><div><h2 class="d" style="font-size:clamp(36px,5vw,64px)">十套路线</h2><p>数字是「开局选了这个棋手之后的全部对局」：打成的、没打成的都算。只算打成的人会让每套都显得很强。</p></div><a class="btn go sm" href="#/">按禁用挑一套</a></div>
    ${routeGroups()}
  </section>
  <section class="wrap sec">
    <div class="hdr"><div><h2 class="d">热门但别打</h2><p>这些阵容在游戏里被导入过上百万次，顶尖局里的平均名次却排在 3.7 名以后。</p></div></div>
    <div class="traps">${TRAPS.map(trapRow).join('')}</div>
  </section>`;
}

// ---------- 棋盘 ----------
function boardSVG(r, o = {}) {
  // 7 列 × 4 行、奇偶行错开的六边形棋盘（和游戏里的站位图一致）；第 1 行是前排
  const s = 36, w = Math.sqrt(3) * s * 1.1, rowH = 2 * s + 20;
  const padL = 46, padT = 26;
  const W = padL + w * 7.5 + 6, H = padT + rowH * 3 + s * 2 + 24;
  const hex = (cx, cy, k) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + s * k * Math.cos(a)).toFixed(1)},${(cy + s * k * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const pos = (row, col) => [padL + w / 2 + (col - 1) * w + (row % 2 === 0 ? w / 2 : 0), padT + s + (row - 1) * rowH];
  let cells = '';
  for (let row = 1; row <= 4; row++) for (let col = 1; col <= 7; col++) { const [x, y] = pos(row, col); cells += `<polygon class="cell" points="${hex(x, y, 0.97)}"/>`; }
  const have = o.have, fresh = o.fresh;
  const toks = r.board.map((b, i) => {
    const [x, y] = pos(b.r, b.c);
    const core = b.h === r.carry;
    const st = have ? (have.has(b.h) ? (fresh?.has(b.h) ? 'new' : '') : 'ghost') : '';
    const id = `hx${o.uid || ''}${i}`;
    const img = face(b.h);
    return `<g class="tok ${core ? 'core' : ''} ${st}" data-card="${esc(b.h)}" style="cursor:pointer">
      <clipPath id="${id}"><polygon points="${hex(x, y, 0.9)}"/></clipPath>
      ${img ? `<image href="${img}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>` : ''}
      <polygon class="ring" points="${hex(x, y, 0.9)}"/>
      ${core ? `<rect class="tagc" x="${x - 17}" y="${y - s - 8}" width="34" height="17" rx="8.5"/><text class="tagt" x="${x}" y="${y - s + 4.5}">主核</text>` : ''}
      <text class="nmt" x="${x}" y="${y + s + 14}">${esc(b.h)}</text>
    </g>`;
  }).join('');
  return `<svg class="board" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" aria-label="成型站位">
    <text class="lab" x="2" y="${padT + s + 4}">前排</text><text class="lab" x="2" y="${padT + s + rowH * 3 + 4}">后排</text>
    <text class="lab" x="${(W / 2).toFixed(0)}" y="12" text-anchor="middle">↑ 对面</text>
    ${cells}${toks}</svg>`;
}

// ---------- 页面：路线 ----------
let rglass = null;

function routePage(id) {
  const r = R[id];
  if (!r) return notFound();
  const f = F[id];
  const s = f.stat;
  const tiers = r.board.map((b) => BY[b.h]).filter(Boolean);
  const top = Math.max(...tiers.map((c) => c.tier));
  const topNames = tiers.filter((c) => c.tier === top).map((c) => c.name);
  const cont = f.contest;
  const contText = !cont ? '—' : cont.level === 3 ? '很怕' : cont.level === 2 ? '有点怕' : '不怕';
  const contSub = (!cont ? '' : cont.level === 1 ? '单张就能用，被抢一张影响不大' : cont.level === 3 ? '同局有人一起打，名次明显变差' : '同局有人一起打，会差一些') + (f.pick != null ? `；${Math.round(f.pick)}% 的对局里有人打` : '');
  const pickText = f.pick != null ? `${Math.round(f.pick)}% 的对局里有人打` : '';
  const lordsHTML = f.lords.map((x) => `<button class="lordpill" data-lord="${esc(x.name)}" type="button" title="${esc(r.lordWhy?.[x.name] || '')}"><img src="${lordIcon(x.name)}" alt=""><b>${esc(x.name)}</b><small>平均 ${x.avg?.toFixed(1)}</small></button>`).join('');
  const stageHTML = STAGES.map((st) => stageCard(r, st)).join('');
  return `
  <section class="rhero">
    <div class="stage" id="rstage"><canvas id="rgl" aria-hidden="true"></canvas></div>
    <div class="wrap in">
      ${facLabel(r.faction)}
      <h1 class="d ${r.name.length >= 6 ? 'long' : ''}">${esc(r.name)}</h1>
      <p class="idea">${esc(r.idea)}</p>
      <div class="lr">${lordsHTML}</div>
      ${ruler(s.avg)}
      ${statLine(s)}
      <p class="share">${s.share >= 0.35 ? `${esc(s.lord)}的对局里 ${Math.round(s.share * 100)}% 在打这套。` : ''}${tierChip(f.tier)}</p>
      <div class="acts">
        <a class="btn go" href="#/play/${id}?lord=${encodeURIComponent(lordFor(r).lord)}">${I.play}开始对局</a>
        ${f.code ? `<button class="btn" data-code="${id}">${I.copy}阵容码</button>` : ''}
        <a class="btn" href="#plan">每个阶段买什么</a>
      </div>
    </div>
  </section>

  <section class="wrap sec rv" style="padding-top:clamp(28px,4vw,48px)">
    <div class="facts">
      <div class="fact"><div class="k">什么时候打不了</div><div class="v bad">禁${f.bans.map(short).join('或禁')}</div><div class="s">${f.bans.length > 1 ? '主核和关键牌不在同一个阵营' : '主核所在阵营'}</div></div>
      <div class="fact"><div class="k">怕不怕撞车</div><div class="v ${cont?.level === 1 ? 'good' : cont?.level === 3 ? 'bad' : ''}">${contText}</div><div class="s">${contSub}</div></div>
      <div class="fact"><div class="k">要等几阶</div><div class="v">${top} 阶</div><div class="s">${topNames.join('、')}</div></div>
      <div class="fact"><div class="k">打成这套时</div><div class="v">${f.done ? `平均第 ${f.done.avg.toFixed(1)} 名` : '—'}</div><div class="s">只算最后打成的对局，会偏好看${r.hard ? '；' + esc(r.hard) : ''}</div></div>
    </div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">体检</h2><p>从卡面推出来的：成本、自动涨级、主核、弱点、没成型时能打多少。点越多越好。</p></div></div>
    <div class="check">${[['cost', '成本'], ['engine', '自动涨级'], ['carry', '主核'], ['risk', '弱点'], ['floor', '没成型时']].map(([k, n]) => `<div class="ck"><span class="k">${n}</span><span class="dots3 d${r.check[k][0]}" aria-label="${r.check[k][0]} / 3"><i></i><i></i><i></i></span><span class="t">${esc(r.check[k][1])}</span></div>`).join('')}</div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">强在哪</h2></div></div>
    <div class="logic">${r.logic.map((n, i) => `${i ? `<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>` : ''}
      <div class="lnode ${i === r.logic.length - 1 ? 'last' : ''}">
        <div class="faces">${n.cards.map((c) => `<img src="${n.lord ? lordIcon(c) : face(c)}" alt="${esc(c)}" title="${esc(c)}">`).join('')}</div>
        <div class="kw">${emb(kwIcon(n.key))}${esc(n.key)}</div>
        <p>${esc(n.text)}</p>
      </div>`).join('')}</div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">成型站位</h2><p>点头像看卡。金色是主核。</p></div></div>
    <div class="formation">
      <div class="bwrap">${boardSVG(r, { uid: 'r' })}</div>
      <div class="side">
        <h3>站位</h3><ul>${r.place.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>${esc(r.carry)}的装备</h3>
        <div class="gear">${r.gear.map((g) => `<figure data-card="${esc(g)}"><img src="${BY[g]?.img || ''}" alt="">${esc(g)}</figure>`).join('')}</div>
        ${f.partners.plus.length ? `<h3>成型后值得带</h3><div class="chips" style="margin-bottom:18px">${f.partners.plus.map((p) => `<button class="face good" data-card="${esc(p.h)}"><img src="${face(p.h)}" alt="">${esc(p.h)}</button>`).join('')}</div>` : ''}
        ${f.partners.minus.length ? `<h3>决赛别留</h3><div class="chips">${f.partners.minus.map((p) => `<button class="face bad" data-card="${esc(p.h)}"><img src="${face(p.h)}" alt="">${esc(p.h)}</button>`).join('')}</div>` : ''}
      </div>
    </div>
  </section>

  <section class="wrap sec rv" id="plan">
    <div class="hdr"><div><h2 class="d">每个阶段买什么</h2><p>金点 = 留到最后的牌。拍卖上的数字是出价上限。</p></div><a class="btn go sm" href="#/play/${id}?lord=${encodeURIComponent(lordFor(r).lord)}">${I.play}对局里一步步看</a></div>
    <div class="tl">${stageHTML}</div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">天赋</h2><p>每次升级三选一。</p></div></div>
    <div class="tal">
      <div><div class="t">看到就拿</div><div class="chips">${r.talents.must.map((t) => `<button class="chip gold" data-card="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div><div class="t">可以拿</div><div class="chips">${r.talents.good.map((t) => `<button class="chip" data-card="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div><div class="t">别拿</div><div class="chips">${r.talents.avoid.length ? r.talents.avoid.map((t) => `<button class="chip bad" data-card="${esc(t)}">${esc(t)}</button>`).join('') : '<span class="small">没有特别冲突的</span>'}</div></div>
    </div>
  </section>

  <section class="wrap sec rv">
    <div class="hdr"><div><h2 class="d">打不成怎么办</h2></div></div>
    <div class="pivots">${r.pivots.map((p) => `<div class="pv"><div class="w">${esc(p.when)}</div><div class="h">${esc(p.do)}</div>${p.to ? `<a class="btn sm" href="#/r/${p.to}">${esc(R[p.to].name)} ${I.arrow}</a>` : '<span></span>'}</div>`).join('')}</div>
  </section>

  ${f.code ? `<section class="wrap sec rv">${codeBlock(r, f.code)}</section>` : ''}

  <section class="wrap sec rv">
    <p class="small">${esc(s.label)}：${s.games.toLocaleString()} 局，平均第 ${s.avg} 名，前三 ${Math.round(s.top3)}%，吃鸡 ${Math.round(s.win)}%，其中 ${Math.round(s.share * 100)}% 的对局终局有${esc(r.sig)}。${f.done ? `${esc(f.done.label)}：${f.done.games.toLocaleString()} 局，平均第 ${f.done.avg} 名——只算打成的人，没打成的被算进了别的阵容，所以偏好看。` : ''}站位、出价上限和每阶段的买法来自卡面机制和社区打法，没有对局数据。<button class="link" data-note>数据说明</button></p>
  </section>`;
}

function kwIcon(k) {
  return { 整备: '整备', 登场: '登场', 开团: '开团', 复生: '复生', 牺牲: '牺牲', 图腾: '图腾', 合成: '合成', 闪现: '闪现', 觉醒: '合成', 重放: '登场', 古币: '河洛', 放大: '凯旋', 装备: '合成', 施法: '闪现', 保存: '复生', 充能: '凯旋', 打出: '登场', 卖掉: '退场', 复制: '合成', 保护: '复生', 叠加: '凯旋', 收割: '凯旋', 战术牌: '逐鹿', 累计: '凯旋' }[k] || '凯旋';
}

function stageCard(r, st) {
  const x = r.stages[st.id] || {};
  const B = new Set(r.board.map((b) => b.h));
  if (st.kind === 'auction') {
    return `<div class="st auc"><div class="sh"><b>${st.name}</b><span>${st.rounds}</span></div>
      <div class="cdrow">${(x.bid || []).map(([h, cap]) => card(h, { cap: `≤${cap}`, core: h === r.carry, keep: B.has(h) })).join('')}</div>
      <ul>${(x.bid || []).filter((b) => b[2]).map(([h, , why]) => `<li>${esc(h)}：${esc(why)}</li>`).join('')}</ul>
      <div class="meta">拍品：${st.pool}</div></div>`;
  }
  return `<div class="st"><div class="sh"><b>${st.name}</b><span>${st.rounds}</span></div>
    <div class="cdrow">${(x.buy || []).map((h) => card(h, { core: h === r.carry, keep: B.has(h) })).join('')}</div>
    <ul>${(x.do || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <div class="meta">每回合 +${st.income} 能量 · ${st.level}</div></div>`;
}

function codeBlock(r, c) {
  const diff = [c.missing.length ? `少了${c.missing.join('、')}` : '', c.extra.length ? `多了${c.extra.join('、')}` : ''].filter(Boolean).join('，');
  return `<div class="code">
    <div>
      <h3>导入游戏：${esc(c.name)}</h3>
      <p>官方社区阵容，被导入 ${wan(c.uses)} 次。${diff ? `和这套相比${esc(diff)}。` : '和这套一致。'}</p>
      <ol><li>复制阵容码</li><li>游戏大厅右下角「阵容」→「收藏阵容」</li><li>点「导入阵容」</li></ol>
      <div class="k">${esc(c.key)}</div>
    </div>
    <button class="btn" data-code="${r.id}">${I.copy}复制阵容码</button>
  </div>`;
}

async function routeMount(id) {
  const r = R[id];
  if (!r) return;
  const f = F[id];
  rglass?.destroy(); rglass = null;
  const cv = $('#rgl');
  if (!cv || !f.splash) return;
  const narrow = innerWidth < 760;
  const dark = darkMQ.matches;
  const g = new Glass(cv, { flute: narrow ? 18 : 30, edge: narrow ? 0 : 0.5, vert: 0, frost: 0.7, tint: dark ? [0.04, 0.055, 0.11] : [0.91, 0.93, 0.98] });
  const img = new Image();
  img.src = f.splash.src;
  await img.decode().catch(() => {});
  if (!g.ok) {
    $('#rstage').insertAdjacentHTML('afterbegin', `<img class="still" alt="" src="${f.splash.src}" style="object-position:${f.splash.fx}% 30%">`);
    return;
  }
  rglass = g;
  // 窄屏：画面在上、文字在下，玻璃只做一道从下往上的磨砂
  const fx = narrow ? f.splash.fx / 100 : Math.min(0.85, f.splash.fx / 100 + 0.12);
  g.set(0, img, fx, 0.3);
  g.set(1, img, fx, 0.3);
  if (narrow) { g.o.edge = 0; g.open = 1; g.amt = 0; } else { g.open = 1; }
  g.draw();
  if (!RM) {
    const st = $('#rstage');
    st.parentElement.addEventListener('pointermove', (e) => { const b = st.getBoundingClientRect(); g.pointer((e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height); });
  }
}

// ---------- 页面：对局模式 ----------
let wake = null;

function playPage(id, q) {
  const r = R[id];
  if (!r) return notFound();
  const lord = q.get('lord') || lordFor(r).lord;
  let i = +(q.get('s') ?? store.get('play.' + id, 0));
  if (!(i >= 0 && i < STAGES.length)) i = 0;
  const st = STAGES[i];
  const x = r.stages[st.id] || {};
  const B = new Set(r.board.map((b) => b.h));
  const have = new Set(), fresh = new Set();
  STAGES.slice(0, i + 1).forEach((s, k) => {
    const y = r.stages[s.id] || {};
    [...(y.buy || []), ...(y.bid || []).map((b) => b[0])].forEach((h) => { if (!have.has(h) && k === i) fresh.add(h); have.add(h); });
  });
  const tip = RULES.find((t) => t.stage === st.id);
  const next = STAGES[i + 1], prev = STAGES[i - 1];
  const f = F[id];
  const body = st.kind === 'auction' ? `
      <p class="lab">出价上限（能量）</p>
      <div class="bid">${(x.bid || []).map(([h, cap, why]) => card(h, { cap: `最多 ${cap}`, why, core: h === r.carry, keep: B.has(h) })).join('')}</div>
      <ul class="todo">
        ${x.bid?.[0] ? `<li>第一目标：${esc(x.bid[0][0])}${x.bid[0][2] ? `（${esc(x.bid[0][2])}）` : ''}</li>` : ''}
        <li>拍输了不花钱；出价会进分红池，血越少分得越多</li>
      </ul>` : `
      <p class="lab">买这些（金点 = 留到最后）</p>
      <div class="cdrow">${(x.buy || []).map((h) => card(h, { core: h === r.carry, keep: B.has(h) })).join('')}</div>
      <ul class="todo">${(x.do || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      ${x.see?.length ? `<div class="see"><span class="t">这阶段看到就拿</span>${x.see.map((t) => `<button class="chip gold" data-card="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}`;
  return `<div class="play">
    <div class="pbar"><div class="wrap">
      <a class="back" href="#/r/${id}" aria-label="返回路线">${I.back}</a>
      <div class="ti"><b>${esc(r.name)}</b><small>${esc(lord)} · 第 ${i + 1} / ${STAGES.length} 步</small></div>
      <div class="dots">${STAGES.map((s, k) => `<button class="${s.kind === 'auction' ? 'auc' : ''} ${k < i ? 'done' : ''} ${k === i ? 'on' : ''}" data-step="${k}">${s.kind === 'auction' ? `拍卖${'一二三'[['a1', 'a2', 'a3'].indexOf(s.id)]}` : s.name}</button>`).join('')}</div>
      <div class="ptools">
        ${'wakeLock' in navigator ? `<button class="btn ${wake ? 'on' : ''}" data-wake title="屏幕常亮">${I.sun}<span>常亮</span></button>` : ''}
        <button class="btn" data-pivot="${id}" title="撞车了 / 打不成">${I.swap}<span>撞车了</span></button>
      </div>
    </div></div>
    <div class="pmain">
      <div class="pstage" id="pstage">
        <h1 class="d">${st.name}</h1>
        <div class="rd"><span class="chip">${st.rounds}</span>${st.kind === 'auction' ? `<span class="chip gold">拍品：${st.pool}</span>` : `<span class="chip">每回合 +${st.income} 能量</span><span class="chip">${st.level}</span>`}</div>
        ${body}
        ${tip ? `<div class="tip"><b>${esc(tip.title)}</b>${esc(tip.body)}</div>` : ''}
      </div>
      <aside class="prail">
        <div class="bwrap"><p class="t"><span>成型站位</span><span>实线 = 这时应该已经买过</span></p>${boardSVG(r, { have, fresh, uid: 'p' })}</div>
        <div class="box"><p class="t"><span>天赋看到就拿</span></p><div class="chips">${r.talents.must.map((t) => `<button class="chip gold" data-card="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          ${r.talents.avoid.length ? `<p class="t" style="margin-top:14px"><span>别拿</span></p><div class="chips">${r.talents.avoid.map((t) => `<button class="chip bad" data-card="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
        </div>
      </aside>
    </div>
    <div class="pnav"><div class="wrap">
      <button class="btn" data-step="${i - 1}" ${prev ? '' : 'disabled'}>${I.back}${prev ? esc(prev.name) : '上一步'}</button>
      <span class="kbd">键盘 ← → 翻页 · 手机左右滑</span>
      ${next ? `<button class="btn go" data-step="${i + 1}"><span>下一步：${esc(next.name)}</span>${I.arrow}</button>` : `<a class="btn go" href="#/r/${id}"><span>打完了</span>${I.arrow}</a>`}
    </div></div>
  </div>`;
}

function playStep(k) {
  const m = location.hash.match(/^#\/play\/([\w-]+)/);
  if (!m) return;
  const id = m[1];
  if (k < 0 || k >= STAGES.length) return;
  store.set('play.' + id, k);
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  q.set('s', k);
  history.replaceState(null, '', `#/play/${id}?${q}`);
  render({ keepScroll: false, step: true });
}

async function toggleWake() {
  try {
    if (wake) { wantWake = false; await wake.release(); wake = null; toast('屏幕常亮已关闭'); }
    else { wantWake = true; wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; $('[data-wake]')?.classList.remove('on'); }); toast('屏幕会保持常亮'); }
  } catch { toast('这个浏览器不支持屏幕常亮'); }
  $('[data-wake]')?.classList.toggle('on', !!wake);
}
// 切回页面时系统会释放常亮锁，自动重新申请
let wantWake = false;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wantWake && !wake) { try { wake = await navigator.wakeLock.request('screen'); } catch {} $('[data-wake]')?.classList.toggle('on', !!wake); }
});

// ---------- 页面：棋手 ----------
function lordsPage() {
  const list = Object.entries(L).filter(([, v]) => v.avg).sort((a, b) => a[1].avg - b[1].avg);
  return `<section class="wrap sec" style="padding-top:clamp(24px,4vw,48px)">
    <div class="hdr"><div><h2 class="d" style="font-size:clamp(36px,5vw,64px)">棋手</h2><p>棋手第一回合就定了，是影响名次最大的一个选择。按顶尖局的平均名次排，点开看技能和该打什么。</p></div><button class="btn sm" data-owned>设置我有的棋手</button></div>
    <div class="lgrid">${list.map(([n, v], k) => `<button class="lc ${v.avg >= 3.7 ? 'low' : ''}" data-lord="${esc(n)}" style="--lc:${LC[n] || 'var(--act)'}">
      <div class="pic"><span class="rank">${k + 1}</span><img src="${v.small}" alt="" loading="lazy"></div>
      <div class="bd">
        <h3 class="d">${esc(n)}</h3>
        ${ruler(v.avg, { sm: true })}
        <div class="stats"><span>前三<b>${Math.round(v.top3)}%</b></span><span>吃鸡<b>${Math.round(v.win)}%</b></span><span>${v.pick}% 的人在用</span></div>
        <div class="rs">${v.routes.length ? v.routes.map((id) => `<span class="chip">${esc(R[id].name)}</span>`).join('') : LORD_TRAP[n] ? `<span class="chip bad">别打${esc(TRAPS.find((t) => t.id === LORD_TRAP[n]).name.replace(/（.*）/, ''))}</span>` : '<span class="chip">没有推荐路线</span>'}</div>
      </div>
    </button>`).join('')}</div>
  </section>`;
}

function openLord(n) {
  const v = L[n];
  if (!v) return;
  const trap = LORD_TRAP[n] && TRAPS.find((t) => t.id === LORD_TRAP[n]);
  openSheet(`<div class="lordbig" style="--lc:${LC[n] || 'var(--act)'}"><img src="${v.img}" alt=""></div>
    <h2 class="d">${esc(n)}</h2>
    ${v.avg ? ruler(v.avg) : ''}
    ${v.avg ? `<div class="stats" style="margin-top:8px"><span>前三<b>${Math.round(v.top3)}%</b></span><span>吃鸡<b>${Math.round(v.win)}%</b></span><span>${v.games?.toLocaleString()} 局</span></div>` : ''}
    ${v.routes.length ? `<h3>打什么</h3><div class="chips">${v.routes.map((id) => `<a class="btn sm" href="#/r/${id}">${esc(R[id].name)}</a>`).join('')}</div>` : ''}
    ${trap ? `<h3>别打</h3><p>${esc(trap.name)}：${esc(trap.why)}${esc(trap.fix)}</p>` : ''}
    <h3>技能</h3>
    ${v.stages.map((s) => s.cards.map((c) => `<div class="skill"><b>${esc(c.name)}<small>${esc(s.stage)}</small></b><p>${esc(c.text)}</p></div>`).join('')).join('')}`);
}

// ---------- 页面：查牌 ----------
let cq = { tab: 'heroes', q: '', fac: '全部', tier: 0 };
function cardsPage() {
  const tabs = [['heroes', '英雄'], ['effects', '效果牌'], ['equipment', '装备'], ['talents', '天赋']];
  const facs = ['全部', '河洛', '逐鹿', '日落海', '三分之地', '大河流域', '无阵营'];
  return `<section class="wrap sec" style="padding-top:clamp(24px,4vw,48px)">
    <div class="hdr"><div><h2 class="d" style="font-size:clamp(36px,5vw,64px)">查牌</h2><p>官方卡面，9/24 版本。点卡看效果和在哪些路线里用到。</p></div></div>
    <div class="cfilter">
      <input id="cq" type="search" placeholder="搜名字或效果，比如「复生」" value="${esc(cq.q)}" autocomplete="off">
      <div class="seg" id="ctab">${tabs.map(([k, n]) => `<button data-ctab="${k}" class="${cq.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="seg" id="cfac" ${cq.tab === 'heroes' ? '' : 'hidden'}>${facs.map((f) => `<button data-cfac="${f}" class="${cq.fac === f ? 'on' : ''}">${f === '全部' ? '全部阵营' : short(f)}</button>`).join('')}</div>
      <div class="seg" id="ctier">${[0, 1, 2, 3, 4, 5].map((t) => `<button data-ctier="${t}" class="${cq.tier === t ? 'on' : ''}">${t ? `${t} 阶` : '全部'}</button>`).join('')}</div>
    </div>
    <div id="cgrid"></div>
  </section>`;
}
function cardsFill() {
  const g = $('#cgrid');
  if (!g) return;
  const q = cq.q.trim();
  let list = CARDS[cq.tab] || [];
  if (cq.tab === 'heroes' && cq.fac !== '全部') list = list.filter((c) => c.faction === cq.fac);
  if (cq.tier) list = list.filter((c) => c.tier === cq.tier);
  if (q) list = list.filter((c) => c.name.includes(q) || (c.text || '').includes(q) || (c.awake || '').includes(q));
  if (cq.tab === 'heroes') {
    g.className = 'cgrid';
    g.innerHTML = list.sort((a, b) => a.tier - b.tier).map((c) => card(c.name)).join('') || '<p class="small">没有找到。</p>';
  } else {
    g.className = 'cgrid txt';
    g.innerHTML = list.map((c) => `<button class="ci" data-card="${esc(c.name)}"><img src="${c.img || ''}" alt="" loading="lazy"><span><b>${esc(c.name)}</b><p>${esc(c.text || '')}</p></span></button>`).join('') || '<p class="small">没有找到。</p>';
  }
}

function openCard(name) {
  const c = BY[name];
  if (!c) return;
  const used = ROUTES.filter((r) => r.board.some((b) => b.h === name) || Object.values(r.stages).some((s) => (s.buy || []).includes(name) || (s.bid || []).some((b) => b[0] === name) || (s.see || []).includes(name)) || r.gear.includes(name) || [...r.talents.must, ...r.talents.good].includes(name));
  const avoid = ROUTES.filter((r) => r.talents.avoid.includes(name));
  const full = ART['hero:' + name];
  const nodes = c.skills?.[0]?.nodes || [];
  openSheet(`${full ? `<img class="big" src="${full}" alt="${esc(name)} 卡面">` : c.art ? `<img class="big" src="${c.art}" alt="">` : c.img ? `<img class="big" style="max-width:120px" src="${c.img}" alt="">` : ''}
    <h2 class="d">${esc(name)}</h2>
    <div class="chips">${c.tier ? `<span class="chip">${c.tier} 阶</span>` : ''}${c.faction ? `<span class="chip">${esc(c.faction)}</span>` : ''}${c.cost != null && c._k !== 'heroes' ? `<span class="chip">${c.cost} 能量</span>` : ''}</div>
    ${c.text ? `<p>${esc(c.text)}</p>` : ''}
    ${c.awake ? `<h3>觉醒后</h3><p>${esc(c.awake)}</p>` : ''}
    ${c.skills?.[0] ? `<h3>技能：${esc(c.skills[0].name)}</h3><p>${esc(c.skills[0].text)}</p>${nodes.length ? `<div class="lv">${nodes.map((n) => `<div><span>${n.lv} 级</span>${esc(n.text)}</div>`).join('')}</div>` : ''}` : ''}
    ${(c.rel || []).length ? `<h3>可以变成</h3><ul class="plain">${c.rel.map((x) => `<li><b>${esc(x.name)}</b>：${esc(x.text)}</li>`).join('')}</ul>` : ''}
    ${used.length ? `<h3>用在这些路线</h3><div class="chips">${used.map((r) => `<a class="btn sm" href="#/r/${r.id}">${esc(r.name)}</a>`).join('')}</div>` : ''}
    ${avoid.length ? `<h3>和这些路线冲突</h3><div class="chips">${avoid.map((r) => `<a class="chip bad" href="#/r/${r.id}">${esc(r.name)}</a>`).join('')}</div>` : ''}`);
}

// ---------- 页面：规则 ----------
function rulesPage() {
  return `<section class="wrap sec" style="padding-top:clamp(24px,4vw,48px)">
    <div class="hdr"><div><h2 class="d" style="font-size:clamp(36px,5vw,64px)">通用规则</h2><p>不管打哪套都适用。对局模式里会在对应阶段提醒。</p></div></div>
    <div class="rules">${RULES.map(ruleCard).join('')}</div>
  </section>
  <section class="wrap sec">
    <div class="hdr"><div><h2 class="d">热门但别打</h2></div></div>
    <div class="traps">${TRAPS.map(trapRow).join('')}</div>
  </section>`;
}

function notFound() { return `<section class="wrap sec"><h2 class="d">没有这个页面</h2><p><a class="btn" href="#/">回到开局</a></p></section>`; }

// ---------- 抽屉 ----------
function openSheet(html) {
  panel.innerHTML = `<button class="x" data-close aria-label="关闭">${I.x}</button>${html}`;
  if (!sheet.open) sheet.showModal();
  panel.scrollTop = 0;
}
sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) sheet.close(); });

function openNote() {
  openSheet(`<h2 class="d">数字怎么来的</h2>
    <p>对局数字来自 datawxq.com 的公开榜单：顶尖棋手、9/24 版本、近 7 天。</p>
    <dl>
      <dt>平均名次</dt><dd>6 人一局，第 1 名最好，3.5 是平均。</dd>
      <dt>前三 · 吃鸡</dt><dd>进前三、拿第一的对局比例。</dd>
      <dt>路线的主数字</dt><dd>「开局选了这个棋手之后的全部对局」。棋手第一回合就定了，打成的、半路崩的都算在里面，最接近你开局这么选之后的真实结果。我们用专门打这套的棋手（比如香香的对局 68% 在打开团射）来代表这套路线。</dd>
      <dt>打成这套时</dt><dd>对局结束时场上是这套阵容的对局。没打成的人被算进了别的阵容，只剩成功的人，所以会比主数字好看很多（例如玉环打成倒转时平均 2.9，但玉环的全部对局是 3.4）。只用来参考上限。</dd>
      <dt>样本</dt><dd>冷门棋手（孙小宾、班叔、玉环、庄小鱼，各占 2% 以下）的玩家可能是专门练这套的高手，数字会偏好；热门的嬴律、明先生、香香更可信。</dd>
      <dt>成型后值得带 · 决赛别留</dt><dd>同一个主核的对局里比较有这张牌和没有这张牌，已经扣掉这张牌在所有对局里的平均表现。</dd>
      <dt>怕不怕撞车</dt><dd>同一局多 1 个对手也打这个主核时，你平均多掉的名次，已经扣掉对手阵容本身强弱的影响。</dd>
      <dt>导入次数</dt><dd>官方社区阵容页面显示的数字，代表热门程度，不代表强度。</dd>
    </dl>
    <h3>没有数据的部分</h3>
    <p>站位、拍卖出价上限、每个阶段买哪些牌，来自卡面机制和社区打法。</p>
    <h3>更新</h3>
    <p>游戏更新后数字会变。本站数据更新于 2026-09-26。</p>`);
}

function openOwned() {
  const own = new Set(owned());
  const names = Object.keys(L).sort((a, b) => (L[a].avg ?? 9) - (L[b].avg ?? 9));
  openSheet(`<h2 class="d">我有的棋手</h2><p>点选你有的棋手，开局推荐只用这些。一个都不选 = 不限制。</p>
    <div class="lordpick">${names.map((n) => `<button class="${own.has(n) ? 'on' : ''}" data-own="${esc(n)}" aria-pressed="${own.has(n)}"><img src="${L[n].icon}" alt="">${esc(n)}</button>`).join('')}</div>
    <p style="margin-top:18px;display:flex;gap:10px"><button class="btn go" data-close>好了</button><button class="btn ghost" data-own-clear>全部清除</button></p>`);
}

function openPivot(id) {
  const r = R[id], f = F[id];
  const cont = f.contest;
  openSheet(`<h2 class="d">打不成怎么办</h2>
    <p>${cont?.level === 1 ? `${esc(r.carry)}不太怕撞车：被抢一两张影响不大。` : `${esc(r.carry)}${cont?.level === 3 ? '很怕' : '有点怕'}撞车：前 4 回合看到有人和你凑同一个主核，就考虑换。`}</p>
    <div class="pivots" style="margin-top:14px">${r.pivots.map((p) => `<div class="pv" style="grid-template-columns:1fr"><div class="w">${esc(p.when)}</div><div class="h">${esc(p.do)}</div>${p.to ? `<a class="btn sm" href="#/play/${p.to}" style="justify-self:start">改打${esc(R[p.to].name)} ${I.arrow}</a>` : ''}</div>`).join('')}</div>`);
}

// ---------- 路由 ----------
function parse() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = h.split('?');
  return { parts: p.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}

let lastKey = '';
function render(o = {}) {
  const { parts, q } = parse();
  const [a, b] = parts;
  const key = `${a || ''}/${b || ''}`;
  const same = key === lastKey;
  lastKey = key;
  document.body.classList.toggle('playing', a === 'play');
  $$('.nav a').forEach((x) => x.classList.toggle('on', x.dataset.nav === (a === 'r' || a === 'play' ? 'routes' : a || 'home')));
  if (a !== undefined && a !== '' && glass) { glass.destroy(); glass = null; }
  if (a !== 'r' && rglass) { rglass.destroy(); rglass = null; }
  let html, mount;
  if (!a) { html = homePage(q); mount = () => homeMount(q); }
  else if (a === 'routes') html = routesPage();
  else if (a === 'r') { html = routePage(b); mount = () => routeMount(b); }
  else if (a === 'play') html = playPage(b, q);
  else if (a === 'lords') html = lordsPage();
  else if (a === 'cards') { html = cardsPage(); mount = cardsFill; }
  else if (a === 'rules') html = rulesPage();
  else if (a === 'route') { location.replace('#/r/' + b); return; }
  else html = notFound();
  const swap = () => {
    view.innerHTML = html;
    if (!o.keepScroll && !(o.step && same)) window.scrollTo(0, 0);
    mount && mount();
    reveal();
    document.title = titleFor(a, b);
  };
  if (!RM && !o.step && document.startViewTransition && !same) document.startViewTransition(swap);
  else swap();
  if (o.step && !RM) $$('#pstage > *').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 35, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));
}

function titleFor(a, b) {
  if (a === 'r' && R[b]) return `${R[b].name} · 万象棋谱`;
  if (a === 'play' && R[b]) return `对局 · ${R[b].name}`;
  return { routes: '路线', lords: '棋手', cards: '查牌', rules: '通用规则' }[a] ? `${{ routes: '路线', lords: '棋手', cards: '查牌', rules: '通用规则' }[a]} · 万象棋谱` : '万象棋谱 · S1';
}

let io;
function reveal() {
  io?.disconnect();
  if (RM) { $$('.rv').forEach((e) => e.classList.add('in')); return; }
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach((e) => io.observe(e));
}

// ---------- 事件 ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-ban],[data-card],[data-lord],[data-code],[data-note],[data-owned],[data-own],[data-own-clear],[data-step],[data-wake],[data-pivot],[data-ctab],[data-cfac],[data-ctier]');
  if (!t) return;
  const d = t.dataset;
  if (d.ban) {
    history.replaceState(null, '', `#/?ban=${encodeURIComponent(d.ban)}`);
    showAnswer(d.ban);
  } else if (d.card) { e.preventDefault(); openCard(d.card); }
  else if (d.lord) openLord(d.lord);
  else if (d.code) {
    const c = F[d.code].code;
    const ok = await copy(c.key);
    toast(ok ? '阵容码已复制：游戏大厅「阵容」→「收藏阵容」→「导入阵容」' : `复制失败，阵容码：${c.key}`);
  } else if ('note' in d) openNote();
  else if ('owned' in d) openOwned();
  else if (d.own) {
    const own = new Set(owned());
    own.has(d.own) ? own.delete(d.own) : own.add(d.own);
    store.set('owned', [...own]);
    ownDirty = true;
    t.classList.toggle('on'); t.setAttribute('aria-pressed', own.has(d.own));
  } else if ('ownClear' in d) {
    store.set('owned', []);
    ownDirty = true;
    $$('[data-own]').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); });
  } else if (d.step != null) playStep(+d.step);
  else if ('wake' in d) toggleWake();
  else if (d.pivot) openPivot(d.pivot);
  else if (d.ctab) { cq.tab = d.ctab; cq.tier = 0; $$('#ctab button').forEach((b) => b.classList.toggle('on', b.dataset.ctab === cq.tab)); $('#cfac').hidden = cq.tab !== 'heroes'; $$('#ctier button').forEach((b) => b.classList.toggle('on', +b.dataset.ctier === 0)); cardsFill(); }
  else if (d.cfac) { cq.fac = d.cfac; $$('#cfac button').forEach((b) => b.classList.toggle('on', b.dataset.cfac === cq.fac)); cardsFill(); }
  else if (d.ctier != null) { cq.tier = +d.ctier; $$('#ctier button').forEach((b) => b.classList.toggle('on', +b.dataset.ctier === cq.tier)); cardsFill(); }
});
let ownDirty = false;
sheet.addEventListener('close', () => {
  // 改了「我的棋手」后刷新当前页（开局推荐会变）
  if (!ownDirty) return;
  ownDirty = false;
  lastKey = '';
  render({ keepScroll: true, step: true });
});
document.addEventListener('input', (e) => { if (e.target.id === 'cq') { cq.q = e.target.value; cardsFill(); } });
document.addEventListener('keydown', (e) => {
  if (!location.hash.startsWith('#/play/') || sheet.open || e.target.closest?.('input,textarea')) return;
  const i = +(new URLSearchParams(location.hash.split('?')[1] || '').get('s') ?? store.get('play.' + location.hash.match(/^#\/play\/([\w-]+)/)?.[1], 0));
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); playStep(i + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); playStep(i - 1); }
});
let tx = null;
document.addEventListener('touchstart', (e) => { if (location.hash.startsWith('#/play/') && !e.target.closest('.dots,.prail')) tx = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!tx) return;
  const dx = e.changedTouches[0].clientX - tx[0], dy = e.changedTouches[0].clientY - tx[1];
  tx = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
    const i = +(new URLSearchParams(location.hash.split('?')[1] || '').get('s') ?? 0);
    playStep(dx < 0 ? i + 1 : i - 1);
  }
}, { passive: true });
addEventListener('scroll', () => $('#bar').classList.toggle('scrolled', scrollY > 8), { passive: true });
addEventListener('hashchange', () => render());

// ---------- 启动 ----------
(async function boot() {
  const [cards, art] = await Promise.all([fetch('data/cards.json').then((r) => r.json()), fetch('data/art.json').then((r) => r.json()).catch(() => ({}))]);
  CARDS = cards;
  for (const k of ['talents', 'equipment', 'effects', 'heroes']) for (const c of cards[k]) BY[c.name] = { ...c, _k: k };
  ART = art.card || {};
  await document.fonts?.ready;
  render();
})();
