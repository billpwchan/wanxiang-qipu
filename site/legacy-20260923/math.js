// Local, explicit models. These functions do not simulate a match.
function finite(n,min,max){if(!Number.isFinite(n)||n<min||n>max)throw new RangeError('Input outside model bounds');return n;}
export function copyLimit(realLevel,temporaryGain,awakened){finite(realLevel,1,999);finite(temporaryGain,0,999);const cap=realLevel*(awakened?2:1),raw=temporaryGain*(awakened?1:.5);return {cap,raw,levelRoom:999-realLevel,gain:Math.min(cap,raw,999-realLevel)};}
export function expectedTiger(levels,awakened){if(!levels.length)throw new RangeError('At least one target required');const x=levels.map(n=>finite(n,1,999)*(awakened?1:.5));return {mean:x.reduce((a,b)=>a+b,0)/x.length,min:Math.min(...x),max:Math.max(...x)};}
export function coreShare(coreLevel,count){finite(coreLevel,0,999);finite(count,1,12);if(!Number.isInteger(count))throw new RangeError('Count must be an integer');return Math.min(coreLevel/count,coreLevel*.5);}
export function rollChance(p,slots,tries){finite(p,0,1);finite(slots,1,10);finite(tries,0,100);if(!Number.isInteger(slots)||!Number.isInteger(tries))throw new RangeError('Counts must be integers');return 1-(1-p)**(slots*tries);}
