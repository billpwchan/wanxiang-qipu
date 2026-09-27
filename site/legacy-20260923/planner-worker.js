import {analyze} from './planner-engine.js';
let cards;
self.onmessage = e => {
  if(e.data.type==='init'){cards=e.data.cards;return;}
  if(e.data.type==='solve'){
    try { self.postMessage({id:e.data.id,result:analyze(e.data.state,cards)}); }
    catch(error) { self.postMessage({id:e.data.id,result:{errors:['局面计算失败，请检查输入。'],plans:[]}}); }
  }
};
