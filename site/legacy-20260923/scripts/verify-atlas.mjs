import fs from 'node:fs';
import assert from 'node:assert/strict';
import {routes,spendPlan,trainingValue,savedValue} from '../site/dist/atlas-data.js';
const d=JSON.parse(fs.readFileSync(new URL('../site/dist/data/cards.json',import.meta.url)));
const r=JSON.parse(fs.readFileSync(new URL('../site/dist/data/research.json',import.meta.url)));
assert.equal(r.sections.length,21);assert.equal(Object.keys(r.heroAdvice).length,85);
assert.equal(r.sections.reduce((n,s)=>n+s.rounds.length,0),144);
for(const h of d.heroes)assert(r.heroAdvice[h.name]?.buy&&r.heroAdvice[h.name]?.exit);
for(const g of routes){assert(r.sections.find(s=>s.id===g.section).rounds.length===16);for(const st of g.stages){const used=new Set();for(const[n,row,col]of st){assert(d.heroes.some(h=>h.name===n),g.id+': '+n);assert(row>=0&&row<4&&col>=0&&col<7);assert(!used.has(row*7+col),g.id+' overlapping units');used.add(row*7+col);}}for(const n of g.talents)assert(d.talents.some(c=>c.name===n));for(const[,n]of g.gear)assert(d.equipment.some(c=>c.name===n));}
assert.deepEqual(spendPlan(12,3,2,1),{free:3,rolls:3});assert.equal(spendPlan(8,3,2,1).free,-1);assert.equal(spendPlan(8,3,2,1).rolls,0);assert.deepEqual(spendPlan(12,3,2,0),{free:3,rolls:null});assert.throws(()=>spendPlan(12,3,1.5,1));assert.throws(()=>spendPlan(NaN,3,2,1));
assert.deepEqual(trainingValue(6),{miyue:6,jing:3});assert.deepEqual(trainingValue(5),{miyue:5,jing:2});assert.throws(()=>trainingValue(-1));
assert.deepEqual(savedValue(8,80,2),{saved:8,extra:2});assert.deepEqual(savedValue(40,14,2),{saved:14,extra:0});assert.deepEqual(savedValue(8,9,2),{saved:8,extra:1});
for(const s of r.sections){assert(!s.html.includes('<script'));assert(!/href="(?:javascript|file):/.test(s.html));}
console.log(JSON.stringify({routes:routes.length,researchChapters:r.sections.length,sourceRoundEntries:144,heroDecisions:85,talentGroups:r.talentAdvice.length,effectGroups:r.effectAdvice.length,boards:30,status:'pass'}));
