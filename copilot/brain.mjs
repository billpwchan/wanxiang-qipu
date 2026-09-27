// 万象副驾 · brain —— 读 eye 的 OCR 帧，推断局面，给出建议（语音 + HUD）。
//   node copilot/brain.mjs live   [--match 影片录制] [--fps 2] [--no-voice] [--lan] [--save]
//   node copilot/brain.mjs replay <frames.jsonl> [--no-voice]      回放测试
//   node copilot/brain.mjs demo   <frames.jsonl> [--every ms] [--until N]   不开游戏预览面板
// 所有判断来自网站同一套数据（site/dist/data/plan.js + facts.js）；深想（可选）调用本机 claude CLI，只发送文字局面。
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, appendFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { STAGES, BANS, ROUTES, TRAPS } from '../site/dist/data/plan.js';
import { FACTS } from '../site/dist/data/facts.js';
import { HERO_NOTES, TALENT_NOTES } from './notes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const argv = process.argv.slice(2);
const mode = argv[0] || 'live';
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const VOICE = !flag('--no-voice');
const PORT = +opt('--port', 4174);

// ── 知识 ─────────────────────────────
const DB = JSON.parse(readFileSync(join(ROOT, 'site/dist/data/cards.json'), 'utf8'));
const KIND = new Map(); // 规范名 → {name, kinds:Set}
const norm = (s) => String(s).replace(/[\s·•.．:：、，,。“”"'「」【】()（）\-—_|]/g, '');
for (const [k, list] of [['hero', DB.heroes], ['talent', DB.talents], ['effect', DB.effects], ['equip', DB.equipment], ['lord', DB.lords]]) {
  for (const c of list) {
    const n = norm(c.name);
    if (!KIND.has(n)) KIND.set(n, { name: c.name, kinds: new Set() });
    KIND.get(n).kinds.add(k);
  }
}
const HERO = new Map(DB.heroes.map((h) => [h.name, h]));
const TALENT = new Map(DB.talents.map((t) => [t.name, t]));
const IMGS = Object.fromEntries([...DB.heroes, ...DB.lords].filter((c) => c.img).map((c) => [c.name, '/' + c.img]));
const ROUTE = new Map(ROUTES.map((r) => [r.id, r]));
const STAGE = new Map(STAGES.map((s) => [s.id, s]));
const onBoard = (r, name) => r.board.some((b) => b.h === name);
const playable = (id, ban) => !ban || !FACTS.routes[id].bans.includes(ban);
// 路线页「强在哪」里提到这张牌的那一步 = 它在这套里的作用
const roleText = (r, name) => r.logic.find((n) => !n.lord && n.cards.includes(name))?.text || HERO_NOTES[name]?.[1] || '';
const layout = existsSync(join(HERE, 'layout.json')) ? JSON.parse(readFileSync(join(HERE, 'layout.json'), 'utf8')) : {};
const Z = { shop: layout.shop || { y0: 0.05, y1: 0.58 }, hand: layout.hand || { y0: 0.68, y1: 1 } };
const inZone = (it, z) => { const cy = it.y + it.h / 2; return cy >= z.y0 && cy <= z.y1 && (z.x0 == null || (it.x >= z.x0 && it.x <= z.x1)); };

// 一个字的误识容忍：只对 ≥3 字的名字，且只接受唯一候选
const HERO_NAMES = DB.heroes.map((h) => h.name).filter((n) => n.length >= 3);
const BY_LEN = new Map();
for (const [n, v] of KIND) { if (!BY_LEN.has(n.length)) BY_LEN.set(n.length, []); BY_LEN.get(n.length).push([n, v]); }
function matchName(text) {
  const n = norm(text);
  if (!n) return null;
  if (KIND.has(n)) return KIND.get(n);
  if (n.length >= 3) {
    const cands = (BY_LEN.get(n.length) || []).filter(([k]) => [...k].filter((ch, i) => ch !== n[i]).length === 1);
    if (cands.length === 1) return cands[0][1];
  }
  // 名字被截断（「典娜」→ 雅典娜）：只在唯一的 ≥3 字英雄名里找
  if (n.length >= 2 && n.length <= 4) {
    const cands = HERO_NAMES.filter((k) => k.length > n.length && (k.startsWith(n) || k.endsWith(n)));
    if (cands.length === 1) return KIND.get(norm(cands[0]));
  }
  return null;
}
// 第二信号：每个英雄的卡牌效果文字都是唯一的——名字没读出来时，用描述行认牌
const bigrams = (s) => { const t = norm(s).replace(/[+\d]/g, ''); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
const HERO_TEXT = DB.heroes.map((h) => ({ name: h.name, g: new Set([...bigrams(h.text), ...bigrams(h.awake || '')]) }));
function matchDesc(text) {
  const g = bigrams(text);
  if (g.size < 6) return null;
  let best = null, second = 0;
  for (const h of HERO_TEXT) {
    let hit = 0; for (const b of g) if (h.g.has(b)) hit++;
    const r = hit / g.size;
    if (!best || r > best.r) { second = best ? best.r : 0; best = { name: h.name, r }; } else if (r > second) second = r;
  }
  return best && best.r >= 0.6 && best.r - second >= 0.2 ? KIND.get(norm(best.name)) : null;
}

// ── 局面 ─────────────────────────────
const state = {
  screen: 'waiting', headline: null, ban: null, round: null, energy: null, auctions: 0, lord: null, pinned: null,
  owned: {}, handNow: new Set(), shop: [], talents: [], lots: [], lords: [], advice: [], plan: null,
  routeScores: [], route: null, voice: VOICE, capture: '等待画面', fps: 0, lastFrame: 0, log: [], deep: null,
};

function classify(hits, texts) {
  const joined = texts.join('|');
  const lordOnly = hits.filter((h) => h.kinds.has('lord') && !h.kinds.has('hero'));
  const talents = hits.filter((h) => h.kinds.has('talent') && !h.kinds.has('hero'));
  const heroes = hits.filter((h) => h.kinds.has('hero'));
  if (lordOnly.length >= 2) return 'lord';
  if (/竞拍|出价|拍品|拍卖/.test(joined)) return 'auction';
  if (talents.length >= 2 && heroes.length <= 1) return 'talent';
  if (heroes.length >= 1) return 'shop';
  return 'other';
}

function ingest(frame) {
  if (frame.status) { state.capture = frame.detail; push(); return; }
  const now = frame.ts || Date.now() / 1000;
  state.fps = state.lastFrame ? Math.round(10 / Math.max(0.1, now - state.lastFrame)) / 10 : 0;
  state.lastFrame = now;
  state.capture = `正在读取 · ${String(frame.src || '').split('/').pop().slice(0, 36)} · OCR ${frame.ms}ms`;
  const items = frame.items || [];
  const texts = items.map((i) => i.t);
  const hits = [];
  for (const it of items) { const m = matchName(it.t); if (m) hits.push({ ...m, it }); }
  // 描述行补认：同一张卡已经靠名字认出来的不重复
  for (const it of items) {
    if (matchName(it.t)) continue;
    const m = matchDesc(it.t);
    if (m && !hits.some((h) => h.name === m.name && Math.abs(h.it.x - it.x) < 0.08)) hits.push({ ...m, it, viaDesc: true });
  }

  // 禁用阵营：开局画面上「禁用 … 河洛」之类的文字
  const FAC_OF = { 河洛: '河洛', 逐鹿: '逐鹿', 日落海: '日落海', 三分: '三分之地', 大河: '大河流域' };
  const banText = texts.join('|');
  if (/禁/.test(banText)) for (const [k, v] of Object.entries(FAC_OF)) if (new RegExp('禁[^|]{0,6}' + k + '|' + k + '[^|]{0,4}禁').test(banText)) state.ban = v;
  // 数字：回合 / 能量（有 layout 校准时读区域，否则读关键词）
  for (const t of texts) {
    const r = t.match(/第\s*(\d{1,2})\s*回合/) || t.match(/^R\s?(\d{1,2})$/i);
    if (r) state.round = +r[1];
    const e = t.match(/能量\s*[:：]?\s*(\d{1,3})/);
    if (e) state.energy = +e[1];
  }
  if (layout.energy) { const it = items.find((i) => inZone(i, layout.energy) && /^\d{1,3}$/.test(i.t.trim())); if (it) state.energy = +it.t; }
  if (layout.round) { const it = items.find((i) => inZone(i, layout.round) && /\d/.test(i.t)); if (it) state.round = +it.t.replace(/\D/g, '') || state.round; }

  const prev = state.screen;
  const screen = classify(hits, texts);
  state.screen = screen;

  // 先更新局面、重新推断路线，再按这一帧的路线和阶段给建议（选棋手例外：它决定路线）
  if (screen === 'lord') {
    state.lords = [...new Set(hits.filter((h) => h.kinds.has('lord')).map((h) => h.name))];
    adviseLord();
    inferRoute();
  } else if (screen === 'talent') {
    state.talents = [...new Set(hits.filter((h) => h.kinds.has('talent')).map((h) => h.name))].slice(0, 3);
    inferRoute();
    adviseTalent();
  } else if (screen === 'auction') {
    if (prev !== 'auction') state.auctions++;
    state.lots = [...new Set(hits.filter((h) => h.kinds.has('hero') || h.kinds.has('effect')).map((h) => h.name))];
    inferRoute();
    adviseAuction();
  } else if (screen === 'shop') {
    const heroes = hits.filter((h) => h.kinds.has('hero'));
    const hand = new Set(heroes.filter((h) => inZone(h.it, Z.hand)).map((h) => h.name));
    for (const n of hand) if (!state.handNow.has(n)) state.owned[n] = (state.owned[n] || 0) + 1; // 新出现在手牌 = 买到/拿到一张
    state.handNow = hand;
    state.shop = [...new Set(heroes.filter((h) => inZone(h.it, Z.shop)).map((h) => h.name))];
    if (!state.round && prev !== 'shop' && prev !== 'waiting') state.estRound = (state.estRound || 1) + 1;
    inferRoute();
    adviseShop();
  } else inferRoute();
  push();
}

// ── 路线推断 ─────────────────────────────
function heroWeight(r, name) {
  let w = name === r.carry ? 4 : onBoard(r, name) ? 3 : 0;
  for (const x of Object.values(r.stages)) { if (x.buy?.includes(name)) w += 0.4; if (x.bid?.some((b) => b[0] === name)) w += 0.4; }
  return w;
}
// 和网站开局推荐同一个顺序：本局禁用的推荐路线里，第一条这个棋手能打的
function banPick(ban, lord) {
  const picks = (BANS[ban] || BANS['未知']).picks;
  return (lord && picks.find((id) => ROUTE.get(id).lords.includes(lord))) || picks[0];
}
function inferRoute() {
  const scores = ROUTES.filter((r) => playable(r.id, state.ban)).map((r) => {
    let s = 0;
    for (const [n, c] of Object.entries(state.owned)) s += heroWeight(r, n) * Math.min(c, 4);
    const li = state.lord ? r.lords.indexOf(state.lord) : -1;
    if (li >= 0) s += li === 0 ? 3 : 2;
    if (r.id === state.lordRoute) s += 2; // 选棋手时给的路线：同一棋手的几条路线里优先它
    return { id: r.id, name: r.name, s: Math.round(s * 10) / 10 };
  }).sort((a, b) => b.s - a.s);
  state.routeScores = scores.slice(0, 3);
  state.route = state.pinned || (scores[0]?.s > 0 ? scores[0].id : banPick(state.ban, state.lord));
  const r = ROUTE.get(state.route);
  const st = STAGE.get(stageId());
  const x = r.stages[st.id] || {};
  state.plan = {
    phase: st.name, rounds: st.rounds, e: st.income, lv: st.kind === 'auction' ? `拍品：${st.pool}` : st.level,
    buy: x.buy || [], do: x.do || [], see: x.see || [], targets: (x.bid || []).map(([h, cap, why]) => ({ h, cap, note: why })),
  };
}
// v5 的 7 个阶段：开局 R1–3 · 拍卖一 · 前期 R4–7 · 拍卖二 · 中期 R8–11 · 拍卖三 · 决赛 R12+
const curRound = () => state.round || state.estRound || 1;
function stageId() {
  if (state.screen === 'auction') return 'a' + Math.min(3, Math.max(1, state.auctions));
  const rd = curRound();
  return rd <= 3 ? 's1' : rd <= 7 ? 's2' : rd <= 11 ? 's3' : 's4';
}
function nextRoundStage(id) {
  const i = STAGES.findIndex((s) => s.id === id);
  return STAGES.slice(i + 1).find((s) => s.kind === 'round')?.id;
}

// ── 建议 ─────────────────────────────
function say(msg, key) {
  const k = key || msg;
  const now = Date.now();
  state.spoken = state.spoken || {};
  if (state.spoken[k] && now - state.spoken[k] < 45000) return;
  state.spoken[k] = now;
  state.log.unshift({ t: new Date().toLocaleTimeString('zh-CN', { hour12: false }), msg });
  state.log = state.log.slice(0, 30);
  if (state.voice && process.platform === 'darwin') execFile('say', ['-v', 'Tingting', '-r', '235', msg], () => {});
}
function evalHero(name) {
  const r = ROUTE.get(state.route);
  const sid = stageId();
  const why = [];
  let s = 0;
  const here = r.stages[sid]?.buy || [];
  const next = r.stages[nextRoundStage(sid)]?.buy || [];
  const rank = here.indexOf(name);
  if (rank >= 0) { s += 10 - rank * 2; why.push(`这个阶段第 ${rank + 1} 优先`); } else if (next.includes(name)) { s += 5; why.push('下个阶段要买'); }
  if (onBoard(r, name)) { s += 6; why.push(`${name === r.carry ? '主核' : '留到最后'}：${roleText(r, name)}`); }
  const have = state.owned[name] || 0;
  if (have > 0 && have < 4) { s += 3; why.push(have === 3 ? '第 4 张 → 觉醒' : `已有 ${have} 张，合成 +3`); }
  for (const o of ROUTES) {
    if (o.id === r.id || o.carry !== name || !playable(o.id, state.ban)) continue;
    const overlap = o.board.filter((b) => state.owned[b.h]).length;
    if (overlap >= 2) { s += 4; why.push(`可转「${o.name}」：你已有 ${overlap} 张成型牌`); }
  }
  if (!s && HERO_NOTES[name]?.[0] === '过渡' && curRound() <= 5) { s += 2; why.push('前期过渡可用'); }
  return { name, s, why: why.join('；') || (HERO_NOTES[name]?.[1] ?? ''), tier: HERO.get(name)?.tier };
}
// 升本回合（plan.js 的 STAGES.level）与费用：按 1 能量 ≈ 1 经验估，见 scripts/sim_hanxin.py 的账本
const LEVEL_UP = { 2: 6, 4: 8, 6: 13, 7: 13, 8: 18, 12: 20 };
function adviseShop() {
  const evals = state.shop.map(evalHero).sort((a, b) => b.s - a.s);
  state.advice = evals;
  const top = evals[0];
  state.headline = top && top.s >= 5 ? `买${top.name}` : '商店没有关键牌';
  const cost = LEVEL_UP[state.round || state.estRound];
  if (cost && state.energy != null && top && top.s >= 5) {
    if (state.energy < cost) top.why = `能量 ${state.energy} 不够升本（约 ${cost}）：先买${top.name}，升本推到下回合。` + top.why;
    else if (state.energy < cost + 3) top.why = `先升本（约 ${cost}），剩 ${state.energy - cost} 再决定买不买${top.name}。` + top.why;
  }
  if (top && top.s >= 8) say(`买${top.name}`, 'shop:' + (state.round || state.estRound) + ':' + top.name);
}
function scoreTalent(name) {
  const r = ROUTE.get(state.route);
  const g = TALENT_NOTES[name];
  const base = g ? g[0] : 0.5;
  if (r.stages[stageId()]?.see?.includes(name)) return { name, s: 4.5 + base / 10, why: '这个阶段看到就拿。' + (g ? g[1] : '') };
  if (r.talents.must.includes(name)) return { name, s: 4 + base / 10, why: `${r.name}必拿。` + (g ? g[1] : '') };
  if (r.talents.good.includes(name)) return { name, s: 3 + base / 10, why: `${r.name}里好用。` + (g ? g[1] : '') };
  if (r.talents.avoid.includes(name)) return { name, s: -1, why: `${r.name}里别拿。` };
  return { name, s: base, why: g ? g[1] : (TALENT.get(name)?.text || '') };
}
function adviseTalent() {
  const ranked = state.talents.map(scoreTalent).sort((a, b) => b.s - a.s);
  // 前两次升本（L2/L3）能量类天赋加分：把升本的钱赚回来
  if (curRound() <= 4) for (const x of ranked) if (/电池包|新援|双人游|五福临门|结伴/.test(x.name) && x.s < 3.5) { x.s += 1.5; x.why = '前期拿能量/牌，把升本的钱赚回来。' + x.why; }
  ranked.sort((a, b) => b.s - a.s);
  state.advice = ranked;
  state.headline = ranked[0] ? `天赋选${ranked[0].name}` : '天赋';
  if (ranked[0]) say(`天赋选${ranked[0].name}`, 'talent:' + state.talents.join());
}
function adviseAuction() {
  const r = ROUTE.get(state.route);
  const targets = r.stages[stageId()]?.bid || [];
  const ranked = state.lots.map((n) => {
    const t = targets.findIndex(([h]) => h === n);
    if (t >= 0) return { name: n, s: 10 - t * 2, cap: targets[t][1], why: targets[t][2] || `${r.name}的拍卖目标` };
    const core = onBoard(r, n);
    return { name: n, s: core ? 5 : 1, cap: core ? 4 : 2, why: core ? `留到最后：${roleText(r, n)}` : '不在计划里：低价或不拍' };
  }).sort((a, b) => b.s - a.s);
  state.advice = ranked;
  state.headline = ranked[0] ? `拍${ranked[0].name} · ≤${ranked[0].cap} 能` : '拍卖';
  if (ranked[0]) say(`拍卖选${ranked[0].name}，最多${ranked[0].cap}能量`, 'auction:' + state.lots.join());
}
// 和网站开局推荐一致：按本局禁用的推荐路线顺序，第一条有这个棋手的路线优先；
// 都不在推荐里时按棋手全部对局的平均名次排
function adviseLord() {
  const ban = state.ban || '未知';
  const picks = (BANS[ban] || BANS['未知']).picks;
  const ranked = state.lords.map((n) => {
    const avg = FACTS.lords[n]?.avg;
    const avgText = avg ? `${n}的全部对局平均第 ${avg.toFixed(1)} 名。` : '';
    const strength = avg ? (3.5 - avg) * 4 : -2;
    const k = picks.findIndex((id) => ROUTE.get(id).lords.includes(n));
    if (k >= 0) {
      const r = ROUTE.get(picks[k]);
      const why = r.lordWhy?.[n];
      return { name: n, s: 10 - k * 2 - r.lords.indexOf(n) * 0.5, route: r.id, why: `${ban === '未知' ? '' : `禁${ban}时`}推荐「${r.name}」${why ? `（${why}）` : ''}。${avgText}` };
    }
    const own = (FACTS.lords[n]?.routes || []).filter((id) => playable(id, state.ban));
    if (own.length) return { name: n, s: 0.5 + strength, route: own[0], why: `走「${ROUTE.get(own[0]).name}」。${avgText}` };
    const trap = TRAPS.find((t) => t.lord === n);
    return { name: n, s: strength - 1, why: (trap ? `别打${trap.name}：${trap.fix}` : '没有推荐路线。') + avgText };
  }).sort((a, b) => b.s - a.s);
  state.advice = ranked;
  state.headline = ranked[0] ? `选${ranked[0].name}` : '选棋手';
  if (ranked[0]) {
    state.lord = ranked[0].name;
    state.lordRoute = ranked[0].route || null;
    say(`选${ranked[0].name}` + (ranked[0].route ? `，走${ROUTE.get(ranked[0].route).name}` : ''), 'lord:' + state.lords.join());
  }
}

// ── 深想（可选）：只把文字局面交给本机 claude CLI ──────────────
function deepThink() {
  const r = ROUTE.get(state.route);
  const brief = {
    画面: state.screen, 回合: state.round || state.estRound, 能量: state.energy, 棋手: state.lord, 路线: r.name,
    已拿到: state.owned, 商店: state.shop, 天赋候选: state.talents, 拍品: state.lots,
    本回合计划: state.plan, 引擎排序: state.advice.slice(0, 4).map((a) => `${a.name}[${Math.round(a.s)}] ${a.why}`),
  };
  const sys = [
    '你是王者万象棋 S1 的局内教练。以下规则优先于你的任何常识：',
    '6 人、60 血；英雄牌 3 能量、卖 1、刷新 1；没有星级、没有利息、没有连胜连败奖励。',
    '打出场上已有的同名英雄 = 合成，等级 +3；第 4 张同名 = 觉醒（回到手牌再打出，卡牌效果增强）。',
    '等级 10/40/100 解锁技能质变；人口 L1–2=5、L3=6、L5=7。升本约 1 能量 = 1 经验（到 L2/L3/L4/L5/L6 需 7/13/17/23/27），每次升本送 1 个天赋。',
    'R3/R7/R11 后拍卖（2–3 阶英雄 / 4–5 阶英雄 / 6 阶效果牌）：失败不花钱，胜价进分红池按血量倾斜返还。',
    '9/24 版本：韩信在你任何英雄触发整备或开团时永久 +2（觉醒 +4）；亚连整备给装备最多的任意英雄 +2。',
    '局面里的「引擎排序」来自按卡面计算的路线规则，你是第二意见：同意就简短确认，不同意要给出数字理由。',
    '回答：中文，最多 4 行。第 1 行结论（具体到牌名/升不升本），第 2 行理由（用数字），第 3 行风险。禁止使用其他自走棋的概念（星级、三连、利息、连胜）。',
  ].join('\n');
  state.deep = { busy: true, text: '思考中…' }; push();
  const t0 = Date.now();
  execFile('claude', ['-p', '--model', process.env.WX_MODEL || 'sonnet', '--tools', '', '--no-session-persistence', '--system-prompt', sys, '局面：' + JSON.stringify(brief)], { timeout: 45000 }, (err, out) => {
    state.deep = { busy: false, text: err ? '深想失败：' + (err.killed ? '超时' : err.message.split('\n')[0]) : out.trim(), ms: Date.now() - t0 };
    push();
  });
}

// ── HUD 服务 ─────────────────────────────
const clients = new Set();
let pushTimer = null;
function snapshot() {
  const r = ROUTE.get(state.route);
  return { ...state, handNow: [...state.handNow], routeName: r?.name, carry: r?.carry, spoken: undefined, imgs: IMGS };
}
function push() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const data = 'data: ' + JSON.stringify(snapshot()) + '\n\n';
    for (const c of clients) c.write(data);
  }, 150);
}
function serve() {
  const hud = join(HERE, 'hud');
  const srv = createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); res.end(); return; } // 例如 '//'：别让一个坏请求打断对局中的副驾
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify(snapshot()) + '\n\n');
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST') {
      if (url.pathname === '/pin') { state.pinned = url.searchParams.get('route') || null; inferRoute(); push(); }
      if (url.pathname === '/voice') { state.voice = url.searchParams.get('on') === '1'; push(); }
      if (url.pathname === '/round') { state.round = +url.searchParams.get('r') || null; inferRoute(); push(); }
      if (url.pathname === '/lord') { state.lord = url.searchParams.get('name') || null; inferRoute(); push(); }
      if (url.pathname === '/ban') { state.ban = url.searchParams.get('f') || null; inferRoute(); push(); }
      if (url.pathname === '/reset') { Object.assign(state, { ban: null, round: null, estRound: null, energy: null, auctions: 0, lord: null, lordRoute: null, pinned: null, owned: {}, handNow: new Set(), shop: [], talents: [], lots: [], advice: [], log: [], deep: null }); inferRoute(); push(); }
      if (url.pathname === '/deep') deepThink();
      res.writeHead(204); res.end(); return;
    }
    if (url.pathname === '/routes') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(ROUTES.map((r) => ({ id: r.id, name: r.name })))); return; }
    const file = url.pathname === '/' ? join(hud, 'index.html') : url.pathname.startsWith('/assets/') ? join(ROOT, 'site/dist', url.pathname) : join(hud, url.pathname.replace(/\.\./g, ''));
    if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); createReadStream(file).pipe(res);
  });
  const host = flag('--lan') ? '0.0.0.0' : '127.0.0.1';
  srv.listen(PORT, host, () => {
    console.log(`HUD：http://127.0.0.1:${PORT}/`);
    if (flag('--lan')) for (const list of Object.values(networkInterfaces())) for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log(`手机打开：http://${a.address}:${PORT}/`);
  });
}

// ── 入口 ─────────────────────────────
inferRoute();
if (mode === 'replay') {
  const file = argv[1];
  const rl = createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    ingest(JSON.parse(line));
    const top = state.advice[0];
    console.log(`[${state.screen}] 禁=${state.ban ?? '?'} 路线=${ROUTE.get(state.route).name} 回合=${state.round ?? state.estRound ?? '?'} 能量=${state.energy ?? '?'} 商店=${state.shop.join(',')} 手牌=${[...state.handNow].join(',')} → ${top ? top.name + '（' + top.why + '）' : '—'}`);
  }
  if (flag('--json')) console.log(JSON.stringify(snapshot()));
  process.exit(0);
} else if (mode === 'demo') {
  // 没开游戏时预览：循环回放一段录下的帧
  serve();
  const lines = readFileSync(argv[1], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let i = 0;
  const step = () => { ingest({ ...lines[i % lines.length], ts: Date.now() / 1000 }); i++; if (i % lines.length === 0) Object.assign(state, { owned: {}, handNow: new Set(), auctions: 0, round: null }); };
  // --until N：直接回放前 N 帧后停在那一帧（截图、调面板用）
  const until = +opt('--until', 0);
  if (until) while (i < until) step();
  else { step(); setInterval(step, +opt('--every', 3000)); }
} else {
  serve();
  const logDir = join(HERE, 'logs'); mkdirSync(logDir, { recursive: true });
  const logFile = join(logDir, new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.jsonl');
  const eyeArgs = ['watch', '--match', opt('--match', '影片录制'), '--fps', opt('--fps', '2'), '--words', join(HERE, 'words.txt')];
  if (flag('--save')) eyeArgs.push('--save', join(logDir, 'frames'));
  const eye = spawn(join(HERE, 'bin/eye'), eyeArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  createInterface({ input: eye.stdout }).on('line', (line) => {
    try { const f = JSON.parse(line); appendFileSync(logFile, line + '\n'); ingest(f); } catch { /* 忽略坏行 */ }
  });
  eye.on('exit', (c) => { state.capture = 'eye 已退出（' + c + '）'; push(); });
  process.on('SIGINT', () => { eye.kill(); process.exit(0); });
}
