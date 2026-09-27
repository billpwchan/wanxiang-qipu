import {blankState,newUnit,demoState,analyze,project,transition,validate,RULE_VERSION,EFFECTS} from './planner-engine.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isInteger(n)?String(n):Number(n).toFixed(1);
const $=s=>document.querySelector(s);
const KEY='wanxiang-preparation-v1';
let D,R,state=blankState(),result=null,worker=null,requestId=0,timer=null,selected='',history=[],notice='',ready=false,mobileView='edit';
const goals={growth:'推进主核与成长',protect:'先补前排与复生',save:'尽量保留能量'};
const roles={front:'前排',carry:'输出',support:'辅助',resource:'资源位'};
const cardData=n=>[...D.heroes,...D.effects].find(c=>c.name===n);
const pic=n=>{const c=cardData(n);return `<img src="${esc(c?.thumb||'')}" alt="" loading="lazy">`;};
const options=(pairs,val)=>pairs.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(t)}</option>`).join('');
function numberField(label,key,val,min=0,max=999,unitId=''){
  return `<label>${label}<input type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${val??''}" ${unitId?`data-unit="${unitId}" data-field="${key}"`:`data-global="${key}"`} placeholder="按本局填写"></label>`;
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({state,history:history.slice(-10)}));}catch{notice='浏览器未允许保存；当前页面仍可使用。';}}
function commit(next){history.push(JSON.parse(JSON.stringify(state)));history=history.slice(-10);state=next;persist();render();}
function schedule(){
  result=null;requestId++;clearTimeout(timer);persist();
  if(!$('#decision-output'))return;
  $('#decision-output').innerHTML='<div class="solve-pending" role="status">正在比较当前局面的可执行操作…</div>';
  const id=requestId;
  timer=setTimeout(()=>{if(worker)worker.postMessage({type:'solve',id,state});else receive({id,result:analyze(state,D,{maxNodes:2500})});},180);
}
function receive(message){
  if(message.id!==requestId)return;
  result=message.result;
  if($('#decision-output'))$('#decision-output').innerHTML=renderResult();
  const counter=$('#sim-mobile-count');if(counter)counter.textContent=result.errors?.length?'待补信息':`${result.plans.length} 个方案`;
}
function setupWorker(){
  try{worker=new Worker(new URL('./planner-worker.js',import.meta.url),{type:'module'});worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker?.terminate();worker=null;schedule();};worker.postMessage({type:'init',cards:D});}catch{worker=null;}
}
function board(){
  return `<div class="sim-board-head"><h2>场上</h2><span>${state.units.length} / ${state.population} 人</span></div><div class="sim-board" role="group" aria-label="当前局面棋盘">${Array.from({length:28},(_,i)=>{
    const u=state.units.find(x=>x.row*7+x.col===i);
    return `<button class="sim-cell ${u?'filled':''} ${u?.id===selected?'selected':''}" data-sim="cell" data-value="${i}" aria-label="第${Math.floor(i/7)+1}排第${i%7+1}列 ${u?u.name:'空位'}">${u?`${pic(u.name)}<span class="unit-level">${u.level}${u.awake?' ★':''}</span><span class="unit-name">${u.name}</span>${state.carry===u.id?'<b class="carry-dot" title="主核">◆</b>':''}`:'<span>＋</span>'}</button>`;
  }).join('')}</div><p class="sim-note">上方是敌方。点英雄编辑；选中后点空位移动。连线目标单独录入，不猜游戏的距离平局。</p>
  <div class="add-unit"><label class="sr-only" for="sim-hero-name">添加场上英雄</label><input id="sim-hero-name" list="sim-hero-list" placeholder="输入英雄名，例如镜" autocomplete="off"><datalist id="sim-hero-list">${D.heroes.map(h=>`<option value="${h.name}">${h.tier} 阶 · ${h.faction}</option>`).join('')}</datalist><button data-sim="add-unit" class="solid-button">上场</button></div><div id="unit-inspector">${inspector()}</div>`;
}
function inspector(){
  const u=state.units.find(x=>x.id===selected);if(!u)return '<p class="sim-note">选中一个英雄，填写等级、觉醒进度和职责。</p>';
  return `<section class="unit-inspector"><div class="inspector-head"><button class="inspector-card" data-card="${u.name}">${pic(u.name)}<span>${u.name}<small>查看官方卡面 ↗</small></span></button><button data-sim="carry" data-value="${u.id}" class="text-link">${state.carry===u.id?'◆ 当前主核':'设为主核'}</button><button data-sim="remove-unit" data-value="${u.id}" class="remove-button" aria-label="删除录入的${u.name}">×</button></div>
  <div class="sim-fields unit-fields">${numberField('真实等级','level',u.level,1,999,u.id)}${numberField('已有临时等级','temporary',u.temporary,0,999,u.id)}<label>本局职责<select aria-label="本局职责" data-unit="${u.id}" data-field="role">${options(Object.entries(roles),u.role)}</select></label><label>当前状态<select aria-label="当前状态" data-unit="${u.id}" data-field="awake">${options([['false','未觉醒'],['true','已觉醒']],u.awake)}</select></label>${!u.awake?numberField('再用几张同名牌觉醒','remaining',u.remaining,1,99,u.id):''}${numberField('装备件数','equipmentCount',u.equipmentCount,0,9,u.id)}</div>
  ${['瑶','太乙真人','明世隐'].includes(u.name)?`<label class="link-label">游戏当前连线目标<select aria-label="游戏当前连线目标" data-unit="${u.id}" data-field="link">${options([['','尚未确认'],...state.units.filter(x=>x.id!==u.id).map(x=>[x.id,x.name])],u.link)}</select></label>`:''}
  ${u.name==='镜'?`<div class="sim-fields">${numberField('效果牌未结算计数','counter',u.counter,0,1,u.id)}</div>`:''}
  ${u.name==='明世隐'?`<div class="sim-fields">${numberField('当前实际保存容量','capacity',u.capacity,0,999,u.id)}${numberField('预计符合保存条件的临时等级','expectedTemporary',u.expectedTemporary,0,999,u.id)}</div><p class="sim-note">后者是你的场景假设；结果显示保存上限，不会加到当前真实等级。</p>`:''}
  ${u.name==='大乔'?`<div class="sim-fields">${numberField('当前法力上限','mana',u.mana,1,999,u.id)}${numberField('登场未结算计数','entryCounter',u.entryCounter,0,1,u.id)}</div>`:''}
  <div class="unit-permissions"><label><input type="checkbox" data-unit="${u.id}" data-field="sealed" ${u.sealed?'checked':''}>已获得封神一瞬</label><label><input type="checkbox" data-unit="${u.id}" data-field="allowSell" ${u.allowSell?'checked':''} ${state.carry===u.id?'disabled':''}>允许搜索出售这名英雄</label></div><p class="sim-note">删除录入只修正表单；“允许出售”才会让推演计算卖牌。主核和唯一前排不会自动出售。</p></section>`;
}
function resourceSection(source){
  const isHand=source==='hand';return `<section class="sim-resources"><div class="section-title"><h2>${isHand?'手牌':'当前商店'}</h2><span>${isHand?'不重复计购买费':'只搜索眼前已出现的牌'}</span></div>
  <div class="resource-list">${state[source].map(c=>{
    const existing=state.units.find(u=>u.name===c.name),supported=c.kind==='hero'||EFFECTS.includes(c.name);
    return `<div class="resource-row"><button data-card="${c.name}" class="resource-card">${pic(c.name)}<span>${c.name}<small>${c.kind==='hero'?'费用 / 合成参与计算':supported?'可参与搜索':'随机或未建模 · 单独评估'}</small></span></button><div class="resource-inputs"><label>张数<input aria-label="${isHand?'手牌':'商店'}${c.name}张数" type="number" inputmode="numeric" min="1" max="99" value="${c.qty}" data-stock="${source}" data-id="${c.id}" data-field="qty"></label>${!isHand?`<label>实价<input aria-label="${c.name}购买实价" type="number" inputmode="numeric" min="0" max="99" value="${c.cost}" data-stock="${source}" data-id="${c.id}" data-field="cost"></label>`:''}${c.kind==='hero'?`<label>${existing?'合成本体 +级':'新入场等级'}<input aria-label="${c.name}${existing?'合成本体净增':'新入场等级'}" type="number" inputmode="numeric" min="${existing?0:1}" max="999" value="${(existing?c.gain:c.level)??''}" placeholder="待确认" data-stock="${source}" data-id="${c.id}" data-field="${existing?'gain':'level'}"></label>${!existing?`<label>职责<select data-stock="${source}" data-id="${c.id}" data-field="role">${options(Object.entries(roles),c.role)}</select></label>`:''}`:''}</div><button class="remove-button" data-sim="remove-stock" data-source="${source}" data-value="${c.id}" aria-label="移除${isHand?'手牌':'商店'}${c.name}">×</button></div>`;
  }).join('')||`<p class="resource-empty">${isHand?'把现在能打出的英雄牌、效果牌放在这里。':'输入当前商店中值得比较的牌。无需把整间商店抄完。'}</p>`}</div>
  <div class="resource-add"><label class="sr-only" for="add-${source}-kind">${isHand?'手牌':'商店'}牌种</label><select id="add-${source}-kind"><option value="hero">英雄</option><option value="effect">效果牌</option></select><label class="sr-only" for="add-${source}-name">添加${isHand?'手牌':'商店'}卡牌</label><input id="add-${source}-name" list="sim-card-list" placeholder="输入卡牌名" autocomplete="off"><button data-sim="add-stock" data-source="${source}" class="quiet-button">添加</button></div>${!isHand?'<p class="sim-note">合成本体净增按游戏界面填写（含曜加成、不含猪等额外联动）；留空时暂不比较这张同名牌。</p>':''}</section>`;
}
function contextSection(){
  return `<details class="sim-context"><summary>棋手、核心、天赋与升级费用</summary><div class="sim-fields"><label>棋手<select data-global="lord">${options([['','未选择'],...D.lords.map(l=>[l.name,l.name])],state.lord)}</select></label>${numberField('日落海核心等级','core',state.core)}<label>核心分配规则<select data-global="coreRule">${options([['normal','普通平均分配'],['special','天赋已改写分配']],state.coreRule)}</select></label>${numberField('一次刷新实际费用','refreshCost',state.refreshCost,0,99)}${numberField('当前升级费用（可不填）','upgradeCost',state.upgradeCost,0,999)}<label>最近的问题<select data-global="pressure">${options([['normal','能正常出手 / 尚未观察'],['dies','主核没出手就倒下'],['controlled','出手被控制打断'],['damage','能持续打，但伤害不够']],state.pressure)}</select></label></div><div class="talent-input"><label for="sim-talent-name">已选天赋</label><input id="sim-talent-name" list="sim-talent-list" placeholder="输入天赋名"><button data-sim="add-talent" class="quiet-button">添加</button></div><datalist id="sim-talent-list">${D.talents.map(t=>`<option value="${t.name}"></option>`).join('')}</datalist><div class="sim-talents">${state.talents.map(n=>`<button data-sim="remove-talent" data-value="${n}">${n} ×</button>`).join('')}</div><p class="sim-note">未建模的天赋会单列提醒，不会默认为没有影响。装备暂以件数参与芈月与武装之力的计算，未模拟装备战斗效果。</p></details>`;
}
function header(){return `<header class="sim-heading"><div><span class="edition-label">局面推演 · 本地计算</span><h1>这笔能量，怎么花</h1><p>把眼前的牌放进来，比较操作顺序、能量和技能节点。</p></div><div class="sim-tools"><button class="quiet-button" data-sim="undo" ${!history.length?'disabled':''}>撤销上次模拟</button><button class="quiet-button" data-sim="export">导出局面</button><button class="quiet-button" data-sim="import">导入局面</button><input type="file" accept="application/json,.json" id="sim-import-file" hidden><button class="quiet-button" data-sim="reset">新局面</button></div></header><div class="sim-demo-bar"><span>${state.demo?'当前是演示局面，可直接修改':'用研究中的局面试一次'}</span><button data-sim="demo" data-value="mirror" class="${state.demo==='mirror'?'active':''}">芈月还是镜</button><button data-sim="demo" data-value="capacity" class="${state.demo==='capacity'?'active':''}">小明还要容量吗</button><button data-sim="demo" data-value="sunset" class="${state.demo==='sunset'?'active':''}">日落海减员</button></div>`;}
function render(){
  if(!location.hash.startsWith('#planner')&&location.hash&&location.hash!=='#main')return;
  result=null;
  $('#app').innerHTML=header()+`<div id="sim-notice" role="status">${esc(notice)}</div><div class="sim-workspace ${mobileView==='result'?'show-result':'show-editor'}"><section class="sim-editor" aria-label="录入局面"><div class="sim-fields session-fields">${numberField('当前回合','round',state.round,1,99)}${numberField('现有能量','energy',state.energy)}${numberField('必须预留','reserve',state.reserve)}${numberField('人口上限','population',state.population,1,12)}</div><div class="sim-goal"><label for="sim-goal">这次先解决</label><select id="sim-goal" data-global="goal">${options(Object.entries(goals),state.goal)}</select></div>${board()}${resourceSection('hand')}${resourceSection('shop')}${contextSection()}<datalist id="sim-card-list">${[...D.heroes,...D.effects].map(c=>`<option value="${c.name}">${c.faction}</option>`).join('')}</datalist><div class="sim-editor-actions"><button data-sim="refresh-shop" class="quiet-button">模拟刷新一次，录入新来牌</button><span>扣除实际费用，可撤销</span></div></section><aside class="sim-analysis" aria-label="推演结果"><div class="analysis-head"><span>方案比较</span><b>无需密钥</b></div><div id="decision-output" aria-live="polite">${renderResult()}</div></aside></div><nav class="sim-mobile-switch" aria-label="局面和结果"><button data-sim="mobile-view" data-value="edit" class="${mobileView==='edit'?'active':''}">编辑局面</button><button data-sim="mobile-view" data-value="result" class="${mobileView==='result'?'active':''}">查看推演 <span id="sim-mobile-count"></span></button></nav>`;
  schedule();
}
function deltaDescription(plan){
  const before=result.before,after=plan.after,carry=after.units.find(u=>u.id===state.carry),old=before.units.find(u=>u.id===state.carry);
  return `<div class="sim-outcomes"><div><span>剩余能量</span><strong>${state.energy} <i>→</i> ${plan.state.energy}</strong></div><div><span>${esc(carry?.name)}推演等级</span><strong>${fmt(old?.effective||0)} <i>→</i> ${fmt(carry?.effective||0)}</strong></div><div><span>原有英雄永久等级净变</span><strong>${plan.metrics.permanent>=0?'+':''}${fmt(plan.metrics.permanent)}</strong></div>${before.saved||after.saved?`<div><span>小明本轮可保存上限</span><strong>${fmt(before.saved)} <i>→</i> ${fmt(after.saved)}</strong></div>`:`<div><span>主核开团复生</span><strong>${after.reviveGrade===2?'完美复生':after.revive?'普通复生':'未提供'}</strong></div>`}</div>`;
}
function changes(plan){
  const rows=result.before.units.map(b=>{const a=plan.after.units.find(u=>u.id===b.id);if(!a)return {name:b.name,old:fmt(b.effective),now:'出售',note:`失去 ${b.level} 真实等级及原有功能`};if(a.level===b.level&&a.effective===b.effective&&a.awake===b.awake&&a.capacity===b.capacity&&a.mana===b.mana&&a.link===b.link)return null;let note=`真实 ${b.level} → ${a.level}`;if(a.share!==b.share)note+=`；核心临时 ${fmt(b.share)} → ${fmt(a.share)}`;if(a.awake!==b.awake)note+='；完成觉醒';if(a.capacity!==b.capacity)note+=`；保存容量 ${b.capacity} → ${a.capacity}`;if(a.mana!==b.mana)note+=`；蓝条 ${b.mana} → ${a.mana}`;return {name:b.name,old:fmt(b.effective),now:fmt(a.effective),note};}).filter(Boolean);
  for(const a of plan.after.units)if(!result.before.units.some(u=>u.id===a.id))rows.push({name:a.name,old:'未上场',now:fmt(a.effective),note:'新部署；已占用人口'});
  return rows.length?`<div class="sim-changes">${rows.map(r=>`<div>${pic(r.name)}<span><b>${r.name}</b><small>${r.note}</small></span><strong>${r.old} → ${r.now}</strong></div>`).join('')}</div>`:'<p class="sim-note">场上状态不变。</p>';
}
function planDetails(plan,index){return `<ol class="sim-steps">${plan.steps.map((step,i)=>`<li><span>${i+1}</span><div><p>${esc(step.text)}</p><small>执行后剩 ${step.energyAfter} 能量</small>${step.events.length?`<details><summary>这一步如何结算</summary>${step.events.map(e=>`<p class="event-line">${esc(e.name)} · ${esc(e.kind)} ${e.delta>=0?'+':''}${fmt(e.delta)}<small>${esc(e.reason)}</small></p>`).join('')}</details>`:''}</div></li>`).join('')}</ol>${changes(plan)}<div class="plan-actions"><button data-sim="step" data-value="${index}" class="solid-button" ${!plan.steps.length?'disabled':''}>模拟第一步</button><button data-sim="apply" data-value="${index}" class="quiet-button" ${!plan.steps.length?'disabled':''}>执行整套模拟</button></div><p class="sim-note">只更新本页局面，可撤销；不会操作游戏。结果不自动结算下一轮收入或战斗。</p>`;}
function nextDecision(plan){
  const c=plan.after.units.find(u=>u.id===state.carry),next=[10,40,100].find(n=>n>c.effective);
  const old=result.before.units.find(u=>u.id===state.carry);
  const crossed=[10,40,100].filter(n=>old.effective<n&&c.effective>=n);
  const breakpointText=D.heroes.find(h=>h.name===c.name)?.skills.flatMap(s=>s.breakpoints).filter(b=>crossed.includes(b.level));
  let text=plan.steps.length?'操作完成后，再根据新商店重算。不要把未出现的牌当成已拿到。':'本次已量化的操作没有更合适的投入；先保留能量。未量化的卡牌仍需单独判断。';
  if(next)text+=` ${c.name}距 ${next} 级还差 ${fmt(next-c.effective)} 级。`;
  return `<section class="sim-next"><h3>做完以后看什么</h3><p>${esc(text)}</p>${(breakpointText||[]).map(b=>`<p><b>${c.name} ${b.level} 级：</b>${esc(b.text)}</p>`).join('')}${state.upgradeCost!==null?`<p>当前升级报价 ${state.upgradeCost}，按本方案执行后${plan.state.energy-state.reserve>=state.upgradeCost?`可支付，扣除预留后还剩 ${plan.state.energy-state.reserve-state.upgradeCost}`:'无法同时支付并保留必要预算'}。新天赋和商店解锁未量化，未把升本排成确定优先项。</p>`:''}</section>`;
}
function planTitle(plan){
  const first=plan.steps[0];if(!first)return '先不增加投入';
  if(first.action.type==='sell')return '先出售'+(state.units.find(u=>u.id===first.action.id)?.name||'可替换单位');
  if(first.action.type==='link')return '先调整太乙的保护目标';
  const c=state[first.action.source]?.find(c=>c.id===first.action.id);
  if(!c)return first.text;
  if(c.name==='太乙真人')return '先补太乙，把复生给主核';
  if(first.events.some(e=>e.kind==='觉醒'))return `先觉醒${c.name}${plan.steps.some(s=>s.action.source==='hand')?'，再打手里的牌':''}`;
  const target=state.units.find(u=>u.id===first.action.target)?.name;
  return `${first.action.source==='shop'?'先买':'先用'}${c.name}${c.kind==='effect'&&target?'，给'+target:''}`;
}
function tradeoff(plan){
  const sold=result.before.units.filter(u=>!plan.state.units.some(x=>x.id===u.id));
  if(sold.length)return `<p class="tradeoff-warning">代价是出售 ${sold.map(u=>u.name).join('、')}，共失去 ${sold.reduce((n,u)=>n+u.level,0)} 真实等级和原有功能。只比较主核节点，尚不能证明减员后的阵容更能打。</p>`;
  const alternative=result.plans.find(p=>p!==plan&&p.state.energy>plan.state.energy);
  if(alternative){const extra=alternative.state.energy-plan.state.energy,gain=plan.metrics.carry-alternative.metrics.carry;return `<p class="tradeoff-line">比保留能量方案多花 ${extra}：${plan.after.revive&&!alternative.after.revive?'换来主核复生':gain>0?`主核再多 ${fmt(gain)} 级，约 ${fmt(gain/extra)} 级 / 能量`:plan.metrics.save>alternative.metrics.save?`可保存上限再多 ${fmt(plan.metrics.save-alternative.metrics.save)} 级`:'改善当前选定的比较目标'}。</p>`;}
  return '';
}
function renderResult(){
  if(!result)return `<div class="sim-empty"><h2>先放入当前局面</h2><p>填能量，放入场上英雄，再加入手牌和商店候选。也可以从上方演示开始，改一张牌观察建议如何变化。</p><div class="empty-sequence"><span>眼前的牌</span><b>→</b><span>可执行顺序</span><b>→</b><span>付出与结果</span></div></div>`;
  if(result.errors.length)return `<div class="sim-empty"><h2>还差这些信息</h2><ul>${result.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p>不会替你补造等级、能量或觉醒进度。</p></div>`;
  const p=result.plans[0];
  const comparisons={growth:'依次比较：主核跨节点、主核等级、保存上限、训练减蓝、辅助节点、原有永久等级、剩余能量。',protect:'依次比较：有前排、主核有复生、技能节点、剩余能量。复生不保证能赢，未计算受伤过程。',save:'优先不卖原有单位，再保留更多能量；余额相同时比较免费可兑现的收益。'};
  const beforeCarry=result.before.units.find(u=>u.id===state.carry),afterCarry=p.after.units.find(u=>u.id===state.carry);
  return `<div class="search-stamp">比较了 ${result.generated} 次操作扩展 · ${result.truncated?'有限搜索，非穷尽最优':'当前搜索范围已结束'}</div>${result.coverage.unresolved.length?`<p class="partial-scope">${result.coverage.unresolved.length} 种候选存在未量化效果，当前排序不覆盖它们的全部价值。</p>`:''}<h2 class="decision-title">${esc(planTitle(p))}</h2><p class="decision-rationale">${p.steps.length?`在已计算的规则内，${afterCarry.name}从 ${fmt(beforeCarry.effective)} 到 ${fmt(afterCarry.effective)} 级，最后保留 ${p.state.energy} 能量。`:'眼前的付费操作没有改善当前目标，或尚缺足够数据支持购买。'}</p>${tradeoff(p)}${deltaDescription(p)}<details class="sim-ranking"><summary>为什么它排在前面</summary><p>${comparisons[state.goal]}</p><p>没有综合战力评分或胜率。只比较你录入的候选，搜索最多 ${result.depthLimit} 步，不假设刷新命中。</p></details>${planDetails(p,0)}
  ${result.plans.slice(1).map((other,i)=>`<details class="alternative-plan"><summary>${other.label} · 留 ${other.state.energy} 能量 · 主核 ${fmt(other.metrics.carry)} 级</summary>${deltaDescription(other)}${planDetails(other,i+1)}</details>`).join('')}${nextDecision(p)}
  ${result.coverage.unresolved.length?`<section class="unresolved-cards"><h3>这些牌还不能排除</h3><p>这些卡牌的战斗或联动没有完整参加排序。尤其涉及发现、随机复制、装备与额外触发时，不能因为未计算就判为不值得买。</p>${result.coverage.unresolved.map(c=>`<div><button data-card="${c.name}" class="text-link">${c.name} ↗</button><p>${esc(c.text)}</p><small>${esc((c.kind==='hero'?R.heroAdvice[c.name]?.buy:R.effectAdvice.find(r=>r[0].split(' / ').includes(c.name))?.[1])||'查看卡面后，按实际抽到的结果补入局面再算。')}</small></div>`).join('')}</section>`:''}
  <details class="sim-coverage"><summary>已计算与暂未计算的范围</summary><p>已计算：资金、人口、同名合成输入、觉醒进度、芈月和镜的效果牌联动、部分确定性效果、猪同阶联动、小明容量、大乔训练、普通核心分配、太乙目标与主动允许的出售。</p><p>未计算：完整战斗、伤害/治疗、全部天赋装备、自动下一轮整备，以及随机产牌的实际结果。因而这是备战局部方案比较，不是整局最优求解。</p>${result.coverage.warnings.map(w=>`<p class="coverage-warning">${esc(w)}</p>`).join('')}</details>`;
}
function message(text){notice=text;if($('#sim-notice'))$('#sim-notice').textContent=text;}
function action(e){
  const b=e.target.closest('[data-sim]');if(!b)return;
  const type=b.dataset.sim,v=b.dataset.value,source=b.dataset.source;
  if(type==='mobile-view'){mobileView=v;const w=$('.sim-workspace');w.classList.toggle('show-result',v==='result');w.classList.toggle('show-editor',v==='edit');document.querySelectorAll('[data-sim=mobile-view]').forEach(x=>x.classList.toggle('active',x.dataset.value===v));(v==='result'?$('.sim-analysis'):$('.sim-editor')).scrollIntoView({block:'start'});return;}
  if(type==='demo'){mobileView='edit';commit(demoState(v));selected=state.carry;render();return;}
  if(type==='reset'){mobileView='edit';commit(blankState());selected='';notice='已开始空白局面；可撤销恢复上一局面。';render();return;}
  if(type==='undo'){if(history.length){state=history.pop();selected=state.carry;notice='已恢复上一次模拟前的局面。';persist();render();}return;}
  if(type==='cell'){
    const i=Number(v),u=state.units.find(x=>x.row*7+x.col===i);
    if(u)selected=u.id;else if(selected){const u=state.units.find(x=>x.id===selected);if(u){u.row=Math.floor(i/7);u.col=i%7;}}
    render();return;
  }
  if(type==='add-unit'){
    const name=$('#sim-hero-name').value.trim();if(!D.heroes.some(h=>h.name===name))return message('请选择卡牌库里的完整英雄名。');
    if(state.units.some(u=>u.name===name))return message('同名英雄已在场；重复牌请放到手牌或商店。');
    if(state.units.length>=state.population)return message('当前人口已满。先核对人口或修正场上单位。');
    const taken=new Set(state.units.map(u=>u.row*7+u.col));let i=21;while(taken.has(i))i=(i+1)%28;
    const u=newUnit(name,'u'+state.nextId++,{row:Math.floor(i/7),col:i%7});state.units.push(u);selected=u.id;if(!state.carry)state.carry=u.id;notice='已加入。请把默认 1 级改为游戏中的实际等级。';render();return;
  }
  if(type==='carry'){state.carry=v;const u=state.units.find(u=>u.id===v);u.allowSell=false;u.role='carry';render();return;}
  if(type==='remove-unit'){state.units=state.units.filter(u=>u.id!==v);for(const u of state.units)if(u.link===v)u.link='';if(state.carry===v)state.carry=state.units[0]?.id||'';selected=state.carry;render();return;}
  if(type==='add-stock'){
    const kind=$(`#add-${source}-kind`).value,name=$(`#add-${source}-name`).value.trim(),c=D[kind==='hero'?'heroes':'effects'].find(x=>x.name===name);
    if(!c)return message('请核对牌种与完整卡牌名称。');if(state[source].length>=12)return message('一次最多比较 12 种候选，请先移除无关牌。');
    state[source].push({id:'c'+state.nextId++,name,kind,qty:1,cost:source==='hand'?0:(c.cost??3),gain:null,level:1,role:'support'});notice='';render();return;
  }
  if(type==='remove-stock'){state[source]=state[source].filter(c=>c.id!==v);render();return;}
  if(type==='add-talent'){const n=$('#sim-talent-name').value.trim();if(!D.talents.some(t=>t.name===n))return message('请选择完整天赋名称。');if(!state.talents.includes(n))state.talents.push(n);render();return;}
  if(type==='remove-talent'){state.talents=state.talents.filter(n=>n!==v);render();return;}
  if(type==='step'){const p=result?.plans[Number(v)];if(!p?.steps.length)return;const next=transition(state,p.steps[0].action,D);if(!next)return;notice='已模拟第一步，余下操作已重新计算。';selected=state.carry;commit(next.state);return;}
  if(type==='apply'){
    const p=result?.plans[Number(v)];if(!p)return;
    notice='已在模拟中执行。下一批来牌需要你录入；游戏本身没有被操作。';selected=state.carry;mobileView='edit';commit(JSON.parse(JSON.stringify(p.state)));return;
  }
  if(type==='refresh-shop'){
    if(state.energy===null||state.energy-state.refreshCost<state.reserve)return message('刷新后无法保留必要预算，请先调整计划。');
    const next=JSON.parse(JSON.stringify(state));next.energy-=next.refreshCost;next.shop=[];notice='已扣刷新费并清空旧商店。请录入实际新来牌；没有生成虚构随机商店。';commit(next);return;
  }
  if(type==='import'){$('#sim-import-file').click();return;}
  if(type==='export'){
    const blob=new Blob([JSON.stringify({version:RULE_VERSION,state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='万象局面-R'+state.round+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('局面已导出；本地浏览器也会保留当前进度。');
  }
}
function edit(e){
  const el=e.target;if(!el.matches('[data-global],[data-unit],[data-stock]'))return;
  const isNumber=el.type==='number';let value=el.type==='checkbox'?el.checked:isNumber?(el.value===''?null:Number(el.value)):el.value;
  if(el.dataset.global){state[el.dataset.global]=value;if(el.dataset.global==='pressure'&&value==='dies'){state.goal='protect';$('#sim-goal').value='protect';}}
  if(el.dataset.unit){const u=state.units.find(u=>u.id===el.dataset.unit);if(!u)return;if(el.dataset.field==='awake'){value=value==='true';if(value)u.remaining=null;}u[el.dataset.field]=value;if(el.dataset.field==='awake')$('#unit-inspector').innerHTML=inspector();}
  if(el.dataset.stock){const c=state[el.dataset.stock].find(c=>c.id===el.dataset.id);if(c)c[el.dataset.field]=value;}
  const count=$('.sim-board-head>span');if(count)count.textContent=state.units.length+' / '+(state.population??'—')+' 人';
  if(el.dataset.unit){const u=state.units.find(x=>x.id===el.dataset.unit);const cell=document.querySelector(`.sim-cell[data-value="${u.row*7+u.col}"] .unit-level`);if(cell)cell.textContent=(u.level??'—')+(u.awake?' ★':'');}
  notice='';if($('#sim-notice'))$('#sim-notice').textContent='';schedule();
}
export function installPlanner(data,research){
  D=data;R=research;
  if(ready)return;ready=true;
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.state?.version===RULE_VERSION&&Array.isArray(saved.state.units)&&Array.isArray(saved.state.hand)&&Array.isArray(saved.state.shop)&&Array.isArray(saved.state.talents)){state=saved.state;history=Array.isArray(saved.history)?saved.history.slice(-10):[];selected=state.carry;}}catch{}
  setupWorker();document.addEventListener('change',async e=>{if(e.target.id!=='sim-import-file')return;const file=e.target.files?.[0];if(!file)return;if(file.size>200000)return message('局面文件过大，最多 200 KB。');try{const parsed=JSON.parse(await file.text());if(parsed.version!==RULE_VERSION)throw new Error('局面版本不匹配');const errors=validate(parsed.state,D);if(errors.length)throw new Error(errors.slice(0,3).join('；'));notice='已导入局面，可以继续推演。';selected=parsed.state.carry;commit(parsed.state);}catch(error){message('未导入：'+error.message);}});document.addEventListener('click',action);document.addEventListener('input',e=>{if(e.target.tagName==='INPUT')edit(e);});document.addEventListener('change',e=>{if(e.target.tagName==='SELECT')edit(e);});
}
export function renderPlanner(){render();}
