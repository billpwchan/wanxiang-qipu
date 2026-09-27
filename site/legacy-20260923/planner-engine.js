// A bounded preparation-phase search. It does not predict combat outcomes.
export const RULE_VERSION = 'prep-2026-09-23.1';
const copy = x => JSON.parse(JSON.stringify(x));
const cap = n => Math.min(999, Math.max(0, n));
const DIRECT = {'古币':2,'精致古币':4,'特训战术':4,'高阶特训战术':8};
const ALL = {'演练战术':1,'高阶演练战术':2};
export const EFFECTS = [...Object.keys(DIRECT),...Object.keys(ALL),'古币多多','唤醒','集体唤醒','妙音','弦音','天籁琴音','武装之力','扶倾济弱','助力核心','战前宣誓','能量大爆炸','新生力量','有福同享'];
const ENTRIES = new Set(['明世隐']);
const unit = (s,id) => s.units.find(u=>u.id===id);
const byName = (s,n) => s.units.find(u=>u.name===n);
const slots = s => s.units.length < s.population;
const numeric = (n,lo,hi) => typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const equipment = u => u.equipmentCount || 0;
const tier = (d,u) => d.heroes.find(h=>h.name===u.name)?.tier;
const faction = (d,u) => d.heroes.find(h=>h.name===u.name)?.faction;

export function blankState() {
  return {version:RULE_VERSION,demo:'',round:1,energy:null,reserve:0,population:5,
    goal:'growth',lord:'',carry:'',core:0,coreRule:'normal',refreshCost:1,upgradeCost:null,
    pressure:'normal',talents:[],units:[],hand:[],shop:[],nextId:1};
}
export function newUnit(name,id,extra={}) {
  return {id,name,level:1,temporary:0,awake:false,remaining:null,role:'support',
    row:3,col:3,equipmentCount:0,allowSell:false,link:'',sealed:false,
    counter:0,capacity:2,expectedTemporary:0,mana:45,entryCounter:0,...extra};
}
export function validate(s,d) {
  const errors=[];
  if(!s||typeof s!=='object')return ['局面格式不正确'];
  for(const [key,name,lo,hi] of [['energy','现有能量',0,999],['reserve','必须预留',0,999],['round','当前回合',1,99],['population','人口上限',1,12],['core','核心等级',0,999],['refreshCost','刷新费用',0,99]]) {
    if(!numeric(s[key],lo,hi)||!Number.isInteger(s[key]))errors.push(`${name}需要填写 ${lo}–${hi} 的整数`);
  }
  if(s.reserve>s.energy)errors.push('必须预留不能超过现有能量');
  if(s.upgradeCost!==null&&(!numeric(s.upgradeCost,0,999)||!Number.isInteger(s.upgradeCost)))errors.push('升级费用需要填写 0–999 的整数，或留空');
  if(!['normal','special'].includes(s.coreRule))errors.push('请选择核心分配规则');
  if(!['growth','protect','save'].includes(s.goal))errors.push('请选择比较目标');
  if(!Array.isArray(s.units)||s.units.length<1||s.units.length>12)return [...errors,'先放入至少一名场上英雄（最多 12 名）'];
  if(s.units.length>s.population)errors.push('场上人数超过人口上限');
  if(!s.units.some(u=>u.id===s.carry))errors.push('请选择本局主核');
  const ids=new Set(),names=new Set(),positions=new Set();
  for(const u of s.units){
    if(typeof u.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(u.id))errors.push('英雄标识格式无效');
    if(typeof u.awake!=='boolean'||typeof u.sealed!=='boolean'||typeof u.allowSell!=='boolean')errors.push('英雄状态必须是明确的是或否');
    if(!d.heroes.some(h=>h.name===u.name))errors.push('场上存在未知英雄');
    if(ids.has(u.id)||names.has(u.name))errors.push('同名英雄请用合成进度表示，不重复上场');
    ids.add(u.id);names.add(u.name);
    if(!Number.isInteger(u.row)||!Number.isInteger(u.col)||u.row<0||u.row>3||u.col<0||u.col>6||positions.has(u.row*7+u.col))errors.push('棋盘位置无效或重叠');
    positions.add(u.row*7+u.col);
    if(!numeric(u.level,1,999)||!Number.isInteger(u.level)||!numeric(u.temporary,0,999)||!Number.isInteger(u.temporary))errors.push(`${u.name}的等级需要是有效整数`);
    if(u.remaining!==null&&(!numeric(u.remaining,1,99)||!Number.isInteger(u.remaining)))errors.push(`${u.name}还差的觉醒张数无效`);
    if(!numeric(u.equipmentCount,0,9)||!Number.isInteger(u.equipmentCount))errors.push(`${u.name}的装备件数无效`);
    if(![0,1].includes(u.counter)||![0,1].includes(u.entryCounter))errors.push(`${u.name}的未结算计数只能为 0 或 1`);
    if(u.name==='明世隐'&&(!numeric(u.capacity,0,999)||!numeric(u.expectedTemporary,0,999)))errors.push('小明的容量与有效临时输入需要为 0–999');
    if(u.name==='大乔'&&!numeric(u.mana,1,999))errors.push('大乔当前蓝条需要为 1–999');
    if(!['front','carry','support','resource'].includes(u.role))errors.push(`${u.name}职责无效`);
    if(u.link&&!s.units.some(x=>x.id===u.link&&x.id!==u.id))errors.push(`${u.name}的连线目标不存在`);
  }
  for(const source of ['hand','shop']){
    if(!Array.isArray(s[source])||s[source].length>12){errors.push('手牌和商店各最多录入 12 种');continue;}
    for(const c of s[source]){
      if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(c.id))errors.push('卡牌标识格式无效');
      if(!['hero','effect'].includes(c.kind)||!d[c.kind==='hero'?'heroes':'effects'].some(x=>x.name===c.name))errors.push('存在未知候选牌');
      if(ids.has(c.id))errors.push('卡牌标识重复');ids.add(c.id);
      if(!numeric(c.qty,1,99)||!Number.isInteger(c.qty)||!numeric(c.cost,0,99)||!Number.isInteger(c.cost))errors.push(`${c.name}的数量或实价无效`);
      if(source==='hand'&&c.cost!==0)errors.push('已在手中的牌不应重复计购买费用');
      if(c.kind==='hero'&&c.gain!==null&&(!numeric(c.gain,0,999)||!Number.isInteger(c.gain)))errors.push(`${c.name}的合成本体净增无效`);
      if(c.kind==='hero'&&(!numeric(c.level,1,999)||!Number.isInteger(c.level)))errors.push(`${c.name}的新入场等级无效`);
    }
  }
  if(!Array.isArray(s.talents)||s.talents.some(n=>!d.talents.some(t=>t.name===n)))errors.push('天赋名称无效');
  if(!Number.isInteger(s.nextId)||s.nextId<1)errors.push('局面标识无效');
  return [...new Set(errors)];
}

export function project(s,d) {
  const sunset=s.units.filter(u=>faction(d,u)==='日落海').length;
  const normal=s.coreRule==='normal'&&!s.talents.some(n=>['定向传输','能量改造','光棱塔'].includes(n));
  const units=s.units.map(u=>{
    const share=normal&&sunset&&faction(d,u)==='日落海'?Math.min(s.core/sunset,s.core*.5):0;
    return {...u,share,effective:cap(u.level+u.temporary+share)};
  });
  const ming=byName(s,'明世隐');
  const saved=ming&&unit(s,ming.link)?Math.min(ming.capacity,ming.expectedTemporary):0;
  const ta=byName(s,'太乙真人');
  const reviveGrade=ta&&ta.link===s.carry?(ta.awake?2:1):0;
  return {units,sunset,normal,saved,revive:reviveGrade>0,reviveGrade,front:s.units.some(u=>u.role==='front'),mana:byName(s,'大乔')?.mana??null};
}

function gain(s,u,n,reason,events) {
  if(!u||n<=0)return;
  const before=u.level;u.level=cap(u.level+n+(u.sealed?1:0));
  events.push({name:u.name,kind:'永久',delta:u.level-before,reason:reason+(u.sealed?'；含已录入的封神 +1':'')});
}
function put(s,name,qty) {
  const held=s.hand.find(c=>c.name===name&&c.kind==='effect');
  if(held)held.qty+=qty;
  else s.hand.push({id:'g'+s.nextId++,name,kind:'effect',qty,cost:0});
}
function effectTriggers(s,events) {
  const mi=byName(s,'芈月');
  if(mi){
    const targets=s.units.filter(u=>u._faction==='逐鹿');
    const max=Math.max(...targets.map(equipment));
    const best=targets.filter(u=>equipment(u)===max);
    if(best.length===1)gain(s,best[0],mi.awake?2:1,'芈月：使用效果牌',events);
  }
  const jing=byName(s,'镜');
  if(jing){jing.counter++;if(jing.counter>=2){jing.counter=0;gain(s,jing,jing.awake?2:1,'镜：累计两次效果牌',events);}}
}
function entry(s,target,events) {
  if(target.name==='明世隐'){
    const delta=target.awake?4:2;target.capacity+=delta;
    events.push({name:target.name,kind:'保存容量',delta,reason:'登场效果；不是已经保存的等级'});
  }
  const qiao=byName(s,'大乔');
  if(qiao){
    qiao.entryCounter++;const times=qiao.awake?1:2;
    if(qiao.entryCounter>=times){const old=qiao.mana;qiao.entryCounter=0;qiao.mana=Math.max(10,qiao.mana-5);events.push({name:'大乔',kind:'法力上限',delta:qiao.mana-old,reason:'登场训练；10 作为本次模型停止训练值'});}
  }
  const xiao=byName(s,'小乔');
  if(xiao&&(xiao.awake||s.units.length<=3))for(const u of s.units)gain(s,u,1,'小乔：登场成长',events);
}
function awake(s,u,events) {
  if(u.awake||u.remaining===null)return;
  u.remaining--;
  if(u.remaining<=0){u.awake=true;u.remaining=null;events.push({name:u.name,kind:'觉醒',delta:1,reason:'达到录入的觉醒张数；方案包含重新部署'});}
}
function targets(s,c,d) {
  const names=Object.keys(DIRECT);
  if(names.includes(c.name))return s.units.filter(u=>!['古币','精致古币'].includes(c.name)||faction(d,u)==='河洛');
  if(c.name==='唤醒')return s.units.filter(u=>ENTRIES.has(u.name));
  if(['妙音','弦音'].includes(c.name))return s.units.filter(u=>!u.awake&&u.remaining!==null&&(c.name!=='弦音'||tier(d,u)<=3));
  if(c.name==='扶倾济弱'){
    const min=Math.min(...s.units.map(u=>u.level)),matches=s.units.filter(u=>u.level===min);
    return matches.length===1?matches:[];
  }
  if(['战前宣誓','有福同享'].includes(c.name))return s.units;
  return [null];
}

export function legalActions(s,d) {
  const actions=[];
  for(const source of ['hand','shop'])for(const c of s[source]){
    if(c.qty<=0||s.energy-c.cost<s.reserve)continue;
    if(c.kind==='hero'){
      const old=byName(s,c.name);
      if(old&&c.gain===null)continue;
      // Self-awakening capacity rescaling is not specified by the public card text.
      if(old?.name==='明世隐'&&!old.awake&&old.remaining===1)continue;
      if(!old&&!slots(s))continue;
      actions.push({type:'card',source,id:c.id,target:old?.id||'',protect:c.name==='太乙真人'?s.carry:''});
    }else if(EFFECTS.includes(c.name)){
      if(c.name==='集体唤醒'&&s.units.some(u=>/^登场[:：]/m.test(d.heroes.find(h=>h.name===u.name)?.text||'')&&!ENTRIES.has(u.name)))continue;
      for(const t of targets(s,c,d))actions.push({type:'card',source,id:c.id,target:t?.id||''});
    }
  }
  for(const u of s.units){
    if(u.allowSell&&u.id!==s.carry&&!(u.role==='front'&&s.units.filter(x=>x.role==='front').length<=1))actions.push({type:'sell',id:u.id});
  }
  const ta=byName(s,'太乙真人');
  if(ta&&ta.link!==s.carry)actions.push({type:'link',id:ta.id,target:s.carry});
  return actions;
}

export function transition(state,action,d) {
  const s=copy(state),events=[];let text='',cost=0;
  if(action.type==='sell'){
    const u=unit(s,action.id);if(!u||!u.allowSell||u.id===s.carry)return null;
    text=`出售 ${u.name}，回收 1 能量（失去其现有等级与功能）`;s.energy++;s.units=s.units.filter(x=>x.id!==u.id);
    for(const x of s.units)if(x.link===u.id)x.link='';
  }else if(action.type==='link'){
    const u=unit(s,action.id),t=unit(s,action.target);if(!u||!t)return null;
    u.link=t.id;text=`调整 ${u.name} 位置，让游戏连线指向 ${t.name}`;
  }else{
    const c=s[action.source]?.find(x=>x.id===action.id);if(!c||c.qty<1||s.energy-c.cost<s.reserve)return null;
    cost=c.cost;s.energy-=cost;c.qty--;
    let t=unit(s,action.target);
    text=(action.source==='shop'?`花 ${cost} 能量买入并使用`:'使用手牌')+` ${c.name}`;
    if(c.kind==='hero'){
      if(t){
        if(c.gain===null)return null;
        gain(s,t,c.gain,'录入的合成本体净增',events);awake(s,t,events);
        const pig=byName(s,'猪八戒');
        if(pig&&tier(d,t)<=3)for(const u of s.units)if(tier(d,u)===tier(d,t))gain(s,u,pig.awake?2:1,'猪八戒：同阶合成联动',events);
        text+=`，合成 ${t.name}${t.awake?'，再部署':''}`;
      }else{
        if(!slots(s))return null;
        const occupied=new Set(s.units.map(u=>u.row*7+u.col));let i=21;while(occupied.has(i))i=(i+1)%28;
        t=newUnit(c.name,'u'+s.nextId++,{level:c.level,role:c.role||'support',row:Math.floor(i/7),col:i%7});
        s.units.push(t);text+=`，以 ${t.level} 级上场`;
      }
      if(action.protect){t.link=action.protect;text+=`；把连线给 ${unit(s,action.protect)?.name}`;}
      if(ENTRIES.has(t.name))entry(s,t,events);
    }else{
      if(t)text+=` → ${t.name}`;
      if(DIRECT[c.name])gain(s,t,DIRECT[c.name],c.name,events);
      else if(ALL[c.name])for(const u of s.units)gain(s,u,ALL[c.name],c.name,events);
      else if(c.name==='古币多多')put(s,'古币',2);
      else if(c.name==='唤醒')entry(s,t,events);
      else if(c.name==='集体唤醒')for(const u of s.units)if(ENTRIES.has(u.name))entry(s,u,events);
      else if(c.name==='天籁琴音')put(s,'妙音',3);
      else if(['妙音','弦音'].includes(c.name)){if(t.name==='明世隐'&&t.remaining===1)return null;awake(s,t,events);}
      else if(c.name==='武装之力')for(const u of s.units)gain(s,u,equipment(u),c.name,events);
      else if(c.name==='扶倾济弱')gain(s,t,9,c.name,events);
      else if(c.name==='助力核心'){const delta=2*(1+s.units.filter(u=>faction(d,u)==='日落海').length);s.core=cap(s.core+delta);events.push({name:'阿科米亚核心',kind:'核心等级',delta,reason:c.name});}
      else if(c.name==='战前宣誓'){const delta=tier(d,t)*3;t.temporary=cap(t.temporary+delta);events.push({name:t.name,kind:'临时',delta,reason:c.name});}
      else if(c.name==='有福同享')for(const u of s.units)if(tier(d,u)===tier(d,t))gain(s,u,3,c.name,events);
      else if(c.name==='能量大爆炸')s.energy+=5;
      else if(c.name==='新生力量')s.population=Math.min(12,s.population+1);
      else return null;
      // Card trigger reactions share the same actual effect-card event.
      for(const u of s.units)u._faction=faction(d,u);
      effectTriggers(s,events);
      for(const u of s.units)delete u._faction;
    }
    s.hand=s.hand.filter(x=>x.qty>0);s.shop=s.shop.filter(x=>x.qty>0);
  }
  return {state:s,step:{action,text,cost,energyAfter:s.energy,events}};
}

function metrics(s,base,d) {
  const p=project(s,d),bp=project(base,d),c=p.units.find(u=>u.id===s.carry),bc=bp.units.find(u=>u.id===base.carry);
  const thresholds=(before,after)=>[10,40,100].filter(n=>before<n&&after>=n).length;
  const currentTotal=base.units.reduce((sum,u)=>sum+(unit(s,u.id)?.level??0)-u.level,0);
  const supportNodes=p.units.filter(u=>u.id!==s.carry).reduce((n,u)=>n+thresholds(bp.units.find(b=>b.id===u.id)?.effective??u.effective,u.effective),0);
  return {carry:c?.effective??0,carryGain:(c?.effective??0)-(bc?.effective??0),nodes:thresholds(bc?.effective??0,c?.effective??0),permanent:currentTotal,
    save:p.saved-bp.saved,mana:bp.mana!==null&&p.mana!==null?bp.mana-p.mana:0,revive:p.reviveGrade,front:p.front?1:0,supportNodes,sales:base.units.filter(u=>!unit(s,u.id)).length,energy:s.energy};
}
function vector(m,goal) {
  if(goal==='protect')return [m.front,m.revive,m.nodes,m.supportNodes,m.energy,m.carryGain,m.save,m.mana,m.permanent];
  if(goal==='save')return [-m.sales,m.energy,m.nodes,m.carryGain,m.save,m.mana,m.supportNodes,m.permanent];
  return [m.nodes,m.carryGain,m.save,m.mana,m.supportNodes,m.permanent,m.energy];
}
function compare(a,b,goal) {
  const x=vector(a.metrics,goal),y=vector(b.metrics,goal);
  for(let i=0;i<x.length;i++)if(Math.abs(x[i]-y[i])>.00001)return y[i]-x[i];
  return a.steps.length-b.steps.length;
}
function fingerprint(s) {
  return JSON.stringify([s.energy,s.population,s.core,s.units.map(u=>[u.id,u.name,u.level,u.temporary,u.awake,u.remaining,u.counter,u.capacity,u.link,u.mana,u.entryCounter,u.equipmentCount,u.role,u.sealed,u.expectedTemporary]),['hand','shop'].map(k=>s[k].map(c=>[c.name,c.qty,c.cost,c.gain]).sort())]);
}
function coverage(s,d) {
  const warnings=[];
  const mi=byName(s,'芈月');
  if(mi){const z=s.units.filter(u=>faction(d,u)==='逐鹿');const max=Math.max(...z.map(equipment));if(z.filter(u=>equipment(u)===max).length>1)warnings.push('芈月的最多装备目标并列：其成长未计入。先修改装备件数使目标唯一，再算。');}
  if(s.talents.length)warnings.push(`已录入天赋：${s.talents.join('、')}。除识别日落海分配改写外，天赋加成尚未进入计算；涉及这些加成时不能据此定优劣。`);
  if(s.units.some(u=>u.sealed))warnings.push('封神按每次独立永久升级额外 +1 计算，不递归；其触发拆分需与游戏核对。');
  if(byName(s,'明世隐'))warnings.push('小明显示的是输入假设下可保存的上限，不是已经到账；觉醒当次容量重算未建模，不自动完成小明觉醒。');
  if(byName(s,'大乔'))warnings.push('大乔只比较已支持的额外登场训练，计算到 10 停止；未模拟施法、装备减蓝或客户端下限。');
  const xiao=byName(s,'小乔');if(xiao&&!xiao.awake&&s.units.length>3)warnings.push('未觉醒小乔的随机三人成长未分配，不能把这部分当作主核确定收益。');
  if(s.core&&!project(s,d).normal)warnings.push('核心分配被特殊规则改写：当前未计算日落海临时等级，不比较压缩人口的数值收益。');
  const held=[...s.hand,...s.shop];
  const unsupportedEntries=s.units.filter(u=>/^登场[:：]/m.test(d.heroes.find(h=>h.name===u.name)?.text||'')&&!ENTRIES.has(u.name));
  const tiedLowest=s.units.filter(u=>u.level===Math.min(...s.units.map(x=>x.level))).length>1;
  const modeledHeroes=['芈月','镜','明世隐','大乔','小乔','猪八戒','太乙真人'];
  const unresolved=held.filter(c=>c.kind==='hero'?!modeledHeroes.includes(c.name):(!EFFECTS.includes(c.name)||(['唤醒','集体唤醒'].includes(c.name)&&unsupportedEntries.length)||(c.name==='扶倾济弱'&&tiedLowest)));
  if(unsupportedEntries.length&&held.some(c=>['唤醒','集体唤醒'].includes(c.name)))warnings.push(`唤醒作用于 ${unsupportedEntries.map(u=>u.name).join('、')} 的结果未模拟，不能用小明目标的排序替代。`);
  if(tiedLowest&&held.some(c=>c.name==='扶倾济弱'))warnings.push('扶倾济弱的最低等级目标并列，未把其中一人的成长当成确定收益。');
  for(const c of held)if(c.kind==='hero'&&byName(s,c.name)&&c.gain===null)warnings.push(`${c.name}：未填合成本体净增，暂不枚举这张牌。`);
  const reactionNames=['武则天','花木兰','狄仁杰','李白','沈梦溪','周瑜','白起','老夫子','张良','朵莉亚','姬小满','公孙离','猪八戒'];
  const extra=s.units.filter(u=>reactionNames.includes(u.name)).map(u=>u.name);
  if(extra.length)warnings.push(`${extra.join('、')}的其他收益未完整模拟（猪仅计同阶联动，不自动夺取）。伤害、回复、开团、整备、退场与随机回牌不纳入总战力结论。`);
  if(s.lord)warnings.push(`${s.lord}的棋手任务、随机助力与宝藏未自动兑现；已指定的封神单独录入。`);
  return {warnings:[...new Set(warnings)],unresolved:unresolved.map(c=>({name:c.name,kind:c.kind,text:d[c.kind==='hero'?'heroes':'effects'].find(e=>e.name===c.name)?.text||''})),supportedEffects:EFFECTS.length};
}
export function analyze(input,d,options={}) {
  const errors=validate(input,d);if(errors.length)return {errors,plans:[]};
  const base=copy(input),limit=options.maxNodes??6000,depthLimit=options.depth??12,width=options.width??32;
  const first={state:base,steps:[],metrics:metrics(base,base,d)};
  let beam=[first],generated=0,truncated=false,pruned=false;const outcomes=[first],visited=new Map([[fingerprint(base),0]]);
  for(let depth=0;depth<depthLimit;depth++){
    const next=[];
    for(const node of beam){
      for(const action of legalActions(node.state,d)){
        if(generated>=limit){truncated=true;break;}
        generated++;const result=transition(node.state,action,d);if(!result)continue;
        const key=fingerprint(result.state),n=node.steps.length+1;
        if(visited.has(key)&&visited.get(key)<=n)continue;visited.set(key,n);
        next.push({state:result.state,steps:[...node.steps,result.step],metrics:metrics(result.state,base,d)});
      }
      if(truncated)break;
    }
    if(!next.length)break;
    next.sort((a,b)=>compare(a,b,base.goal));
    if(next.length>width)pruned=true;
    // Keep each first paid choice alive so early immediate gain does not hide setup value.
    const diversity=new Map();for(const n of next){const key=n.steps.find(x=>x.cost>0)?.action.id||'free';if(!diversity.has(key))diversity.set(key,n);}
    beam=[...diversity.values()].slice(0,Math.floor(width/2));for(const n of next){if(beam.length>=width)break;if(!beam.includes(n))beam.push(n);}
    outcomes.push(...beam);
    if(generated>=limit)break;
    if(depth===depthLimit-1)truncated=true;
  }
  outcomes.sort((a,b)=>compare(a,b,base.goal));
  const best=outcomes[0],chosen=[best];
  const cheap=[...outcomes].sort((a,b)=>compare(a,b,'save'))[0];
  if(fingerprint(cheap.state)!==fingerprint(best.state))chosen.push(cheap);
  const firstPaid=n=>n.steps.find(x=>x.cost>0)?.action.id||n.steps.find(x=>x.action.type==='sell')?.action.id||'free';
  const alternative=outcomes.find(n=>firstPaid(n)!==firstPaid(best)&&!chosen.some(x=>fingerprint(x.state)===fingerprint(n.state)));
  if(alternative)chosen.push(alternative);
  return {errors:[],version:RULE_VERSION,generated,unique:visited.size,truncated:truncated||pruned||generated>=limit,depthLimit,
    coverage:coverage(base,d),before:project(base,d),plans:chosen.map((n,i)=>({...n,label:i===0?'按当前目标优先':n===cheap?'保留更多能量':'另一种投入',after:project(n.state,d)}))};
}

export function demoState(which) {
  const s={...blankState(),demo:which,round:6,energy:6,reserve:3,nextId:100};
  const hero=(name,id,extra)=>newUnit(name,id,extra);
  const card=(id,name,kind,extra={})=>({id,name,kind,qty:1,cost:kind==='hero'?3:2,gain:2,level:1,role:'support',...extra});
  if(which==='mirror'){
    s.lord='姜导';s.population=6;s.carry='jing';
    s.units=[hero('苏烈','su',{level:40,role:'front',row:0,col:3}),hero('镜','jing',{level:70,remaining:1,role:'carry',row:1,col:5,equipmentCount:2}),hero('芈月','mi',{level:25,remaining:1,row:2,col:4}),hero('孙膑','sun',{level:20,row:3,col:3})];
    s.hand=[card('h1','古币多多','effect',{qty:2,cost:0})];
    s.shop=[card('s1','芈月','hero'),card('s2','镜','hero'),card('s3','太乙真人','hero')];
  }else if(which==='sunset'){
    s.population=7;s.carry='ailin';s.core=180;s.energy=8;
    s.units=[hero('苏烈','su',{level:60,role:'front',row:0,col:3}),hero('艾琳','ailin',{level:35,role:'carry',row:3,col:4}),hero('朵莉亚','duo',{level:40,row:3,col:3}),...['狂铁','亚连','米莱狄','安琪拉'].map((n,i)=>hero(n,'sun'+i,{level:10,allowSell:true,role:'resource',row:1,col:i}))];
  }else{
    s.population=5;s.carry='lixin';s.energy=5;s.reserve=3;
    s.units=[hero('苏烈','su',{level:40,role:'front',row:0,col:2}),hero('李信','lixin',{level:80,role:'carry',row:2,col:5}),hero('明世隐','ming',{level:40,row:3,col:5,link:'lixin',capacity:40,expectedTemporary:14})];
    s.shop=[card('wake','唤醒','effect')];
  }
  return s;
}
