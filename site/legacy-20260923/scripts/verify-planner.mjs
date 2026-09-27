import fs from 'node:fs';
import assert from 'node:assert/strict';
import {analyze,project,validate,transition,legalActions,demoState,newUnit,blankState} from '../site/dist/planner-engine.js';
const d=JSON.parse(fs.readFileSync(new URL('../site/dist/data/cards.json',import.meta.url)));
const clone=x=>JSON.parse(JSON.stringify(x));
let tests=0;
function test(name,fn){fn();tests++;console.log('PASS '+name);}
const best=s=>analyze(s,d).plans[0];

test('Purchase order: awaken Miyue before the six effect events; alternatives conserve cash',()=>{
  const s=demoState('mirror'),before=JSON.stringify(s),a=analyze(s,d);
  assert.equal(a.plans[0].steps[0].action.id,'s1');
  assert.equal(a.plans[0].metrics.carry,85);
  assert.equal(a.plans[1].metrics.carry,79);assert.equal(a.plans[1].state.energy,6);
  assert.equal(a.plans[2].metrics.carry,84);
  assert.equal(JSON.stringify(s),before,'search must not mutate the input');
  assert.equal(a.plans[0].steps.filter(x=>x.action.source==='hand').length,6);
});
test('Different observed pressure changes the choice to protection, not more growth',()=>{
  const s=demoState('mirror');s.goal='protect';const p=best(s);
  assert.equal(p.steps.find(x=>x.cost>0).action.id,'s3');assert(p.after.revive);
});
test('Without effect resources the same shop no longer recommends Miyue',()=>{
  const s=demoState('mirror');s.hand=[];assert.notEqual(best(s).steps[0]?.action.id,'s1');
});
test('Full preservation capacity makes paid Wake inferior to retaining cash',()=>{
  const s=demoState('capacity');assert.equal(best(s).steps.length,0);
  s.units.find(u=>u.name==='明世隐').capacity=8;s.units.find(u=>u.name==='明世隐').expectedTemporary=80;
  const p=best(s);assert.equal(p.steps[0].action.id,'wake');assert.equal(p.after.saved,10);
  assert.equal(p.state.units.find(u=>u.name==='李信').level,80,'future saved estimate is not settled now');
});
test('Core redistribution crosses 100, exposes sold levels, preserves protected units',()=>{
  const s=demoState('sunset'),a=analyze(s,d),p=a.plans[0];
  assert.equal(a.before.units.find(u=>u.id===s.carry).effective,65);
  assert.equal(p.metrics.carry,125);assert.equal(p.metrics.permanent,-40);
  assert.equal(p.state.units.length,3);assert(p.state.units.some(u=>u.id==='su'));assert(p.state.units.some(u=>u.id==='duo'));
  assert(a.plans.some(x=>x.steps.length===0),'cash alternative must not liquidate units merely to create cash');
});
test('Special core rules disable the ordinary distribution model',()=>{
  const s=demoState('sunset');s.coreRule='special';assert.equal(project(s,d).units.find(u=>u.id===s.carry).effective,35);
  s.coreRule='normal';s.talents=['定向传输'];assert.equal(project(s,d).normal,false);
});
test('An ambiguous Miyue recipient never becomes guaranteed main-carry income',()=>{
  const s=demoState('mirror');s.units.find(u=>u.name==='芈月').equipmentCount=2;
  const a=analyze(s,d);assert(a.coverage.warnings.some(w=>w.includes('并列')));
  assert(a.plans[0].metrics.carry<85);
});
test('Odd-counter effects and the 999 cap retain event boundaries',()=>{
  const s=demoState('mirror');s.shop=[];s.hand=[{id:'fx',name:'特训战术',kind:'effect',qty:1,cost:0}];
  const j=s.units.find(u=>u.name==='镜');j.counter=1;j.level=998;
  const p=best(s);assert.equal(p.metrics.carry,999);assert.equal(p.state.units.find(u=>u.id===j.id).counter,0);
});
test('Budget reserve is never spent and buying is not charged twice to hand cards',()=>{
  const s=demoState('mirror');s.energy=3;s.reserve=3;
  const p=best(s);assert.equal(p.state.energy,3);assert(!p.steps.some(x=>x.cost>0));
  assert.equal(p.metrics.carry,79);
  s.reserve=4;assert(validate(s,d).length>0);
});
test('Population gates a new unit; only explicit sale permissions are candidates',()=>{
  const s=demoState('mirror');s.population=4;s.goal='protect';
  assert(!legalActions(s,d).some(a=>a.id==='s3'));
  s.units[0].allowSell=true;assert(!legalActions(s,d).some(a=>a.type==='sell'),'last frontliner protected');
  s.units[1].allowSell=true;assert(!legalActions(s,d).some(a=>a.type==='sell'),'carry protected');
});
test('Unknown merge gain, random effects and awakening-capacity rescaling are not invented',()=>{
  const s=demoState('capacity');s.shop=[{id:'random',name:'照影',kind:'effect',qty:1,cost:4},{id:'merge',name:'李信',kind:'hero',qty:1,cost:3,gain:null,level:1}];
  const a=analyze(s,d);assert.equal(a.coverage.unresolved[0].name,'照影');assert(a.coverage.warnings.some(w=>w.includes('净增')));
  assert.equal(best(s).steps.length,0);
});
test('Every returned sequence can be replayed to the same result without violating budget',()=>{
  for(const name of ['mirror','sunset','capacity']){
    const start=demoState(name);
    for(const p of analyze(start,d).plans){let s=clone(start);for(const step of p.steps){assert(legalActions(s,d).some(a=>JSON.stringify(a)===JSON.stringify(step.action)));s=transition(s,step.action,d).state;assert(s.energy>=s.reserve);assert(s.units.length<=s.population);}assert.deepEqual(s,p.state);assert.deepEqual(validate(s,d),[]);}
  }
});
test('Extra entry training is bounded; ordinary Qiao differs from awakened Qiao',()=>{
  const s=demoState('capacity');s.energy=3;s.reserve=3;s.population=5;
  s.units.push(newUnit('大乔','q',{level:20,row:3,col:0,mana:20}));s.hand=[{id:'two',name:'唤醒',kind:'effect',qty:2,cost:0}];s.shop=[];
  assert.equal(best(s).state.units.find(u=>u.name==='大乔').mana,15);
  s.units.find(u=>u.name==='大乔').awake=true;
  assert.equal(best(s).state.units.find(u=>u.name==='大乔').mana,10);
});
test('Bounded search advertises truncation and rejects malformed inputs',()=>{
  const a=analyze(demoState('mirror'),d,{maxNodes:1});assert(a.truncated);assert(a.generated<=1);
  const s=demoState('mirror');s.energy=NaN;assert(analyze(s,d).errors.length);
  const b=blankState();assert(analyze(b,d).errors.length);
});
test('Protection differentiates ordinary from perfect rebirth',()=>{
  const s=demoState('mirror');s.goal='protect';s.hand=[];
  s.units.push(newUnit('太乙真人','ta',{row:2,col:2,link:s.carry,remaining:1}));
  s.shop=[{id:'tacopy',name:'太乙真人',kind:'hero',qty:1,cost:3,gain:2,level:1}];
  assert.equal(project(s,d).reviveGrade,1);assert.equal(best(s).after.reviveGrade,2);
});
test('Imported identifiers and optional numeric prices are validated',()=>{
  const s=demoState('mirror');s.units[0].id='bad" onclick=bad';
  assert(validate(s,d).some(e=>e.includes('标识')));
  const t=demoState('mirror');t.upgradeCost=-2;assert(validate(t,d).some(e=>e.includes('升级费用')));
});
console.log(JSON.stringify({tests,status:'pass'}));
