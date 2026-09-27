import fs from 'node:fs';
import assert from 'node:assert/strict';
import {guides,sources} from '../site/dist/guides.js';
import {playbooks,applyReviewedRosters,candidateAudit} from '../site/dist/playbooks.js';
import {copyLimit,coreShare,expectedTiger,rollChance} from '../site/dist/math.js';
const d=JSON.parse(fs.readFileSync(new URL('../site/dist/data/cards.json',import.meta.url)));
applyReviewedRosters(guides);
for(const g of guides){
 assert.equal(g.roundFocus.length,16,g.id);assert.equal(g.phases.length,4,g.id);
 for(const n of g.heroes)assert(d.heroes.some(c=>c.name===n),g.id+': '+n);
 for(const id of g.sources)assert(sources.some(s=>s[0]===id),'source '+id);
 for(const [n] of g.talents)assert(d.talents.some(c=>c.name===n.split(' / ')[0]),'talent '+n);
 for(const st of (playbooks[g.id]?.stages||[{board:g.board}])){
  const cells=new Set();for(const [n,r,c] of st.board){assert(d.heroes.some(h=>h.name===n));assert(r>=0&&r<4&&c>=0&&c<7);assert(!cells.has(r*7+c),g.id+' collision');cells.add(r*7+c);}
 }
 assert(playbooks[g.id]||candidateAudit[g.id]);
}
assert.equal(Object.keys(playbooks).length,4);
assert.deepEqual(guides.find(g=>g.id==='four').heroes,['苏烈','马超','瑶','吕布']);
assert.equal(copyLimit(40,200,true).gain,80);
assert.equal(copyLimit(40,30,false).gain,15);
assert.equal(copyLimit(999,0,true).gain,0);assert.equal(copyLimit(998,999,true).gain,1);for(let l=1;l<=999;l+=17)assert(l+copyLimit(l,999,true).gain<=999);
assert.equal(coreShare(180,1),90);assert.equal(coreShare(180,2),90);assert.equal(coreShare(180,6),30);
assert.equal(expectedTiger([200,40,20],true).mean,260/3);
assert.equal(rollChance(0,5,10),0);assert.equal(rollChance(1,5,0),0);assert.equal(rollChance(1,5,1),1);
for(let n=1;n<12;n++)assert(coreShare(180,n)>=coreShare(180,n+1));
for(let n=1;n<20;n++)assert(rollChance(.05,5,n)>=rollChance(.05,5,n-1));
for(const run of [()=>copyLimit(-1,50,true),()=>expectedTiger([]),()=>expectedTiger([NaN]),()=>coreShare(100,0),()=>rollChance(.1,3.5,5)])assert.throws(run,RangeError);
const names=new Set([...d.heroes,...d.talents,...d.equipment,...d.effects].map(x=>x.name));
const nonCards=[...new Set(guides.flatMap(g=>g.equipment.flatMap(r=>r[1].split(' / '))).filter(n=>!names.has(n)))];
console.log(JSON.stringify({guides:guides.length,reviewedRoutes:4,candidates:8,cardCounts:Object.fromEntries(['heroes','lords','talents','equipment','effects'].map(k=>[k,d[k].length])),nonCardLabels:nonCards,status:'pass'},null,2));
const {roundPlans,planFor,energyBudget,assessCard}=await import('../site/dist/rounds.js');
for(const id of Object.keys(playbooks)){
 assert.equal(roundPlans[id].length,20);assert.equal(new Set(roundPlans[id].map(r=>r[0])).size,20);
 for(let round=1;round<=20;round++){const row=planFor(id,round);assert.equal(row.length,4);for(const cell of row)assert(cell.length>5);}
}
assert.throws(()=>planFor('four',0),RangeError);assert.throws(()=>planFor('four',21),RangeError);
assert.equal(energyBudget(15,8,2).remaining,1);assert.equal(energyBudget(10,8,2).affordable,false);assert.equal(energyBudget(14,8,2).remaining,0);
assert.throws(()=>energyBudget(-1,2),RangeError);assert.throws(()=>energyBudget(5,NaN),RangeError);
assert.match(assessCard('four','瑶',1,{energy:2}).verdict,/买不起/);
assert.match(assessCard('air','司空震',1,{pressure:'danger'}).verdict,/救下一场/);
assert.match(assessCard('four','瑶',1,{owned:['瑶']}).check,/重复牌/);
assert.match(assessCard('four','海诺',1).verdict,/先不/);
let mediaCount=0;
function checkMedia(obj){if(!obj||typeof obj!=='object')return;for(const [k,v] of Object.entries(obj)){if(['thumb','image'].includes(k)&&v){assert(v.startsWith('assets/cards/'),'external image '+v);assert(fs.statSync(new URL('../site/dist/'+v,import.meta.url)).size>100);mediaCount++;}else if(typeof v==='object')checkMedia(v);}}
checkMedia(d);
console.log(JSON.stringify({rounds:80,decisionBranches:'pass',budgetBoundaries:'pass',localImageReferences:mediaCount}));
