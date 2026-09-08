import test from 'node:test';
import assert from 'node:assert/strict';
import {plan,stats,validateRows,summarize,CONDITIONS} from './study-entry-sampler.mjs';
const rows=()=>plan().map(p=>({...p,releaseStatus:'PASS',timingStatus:'PASS',cadenceStatus:p.sampler==='rich'?'PASS':'NOT_MEASURED',...(p.traced?{traceSha256:'fixture'}:{}),startupMs:p.sampler==='rich'?50:null,brandToHandoffMs:1100,loafReportedForcedMs:0,samplerLoafReportedForcedMs:0}));
test('fixed plan has 36 unique cold runs and all six conditions in each block',()=>{const p=plan();assert.equal(p.length,36);assert.equal(new Set(p.map(x=>x.label)).size,36);for(let b=1;b<=6;b++)assert.deepEqual(p.filter(x=>x.block===b).map(x=>x.condition).sort(),[...CONDITIONS].sort());});
test('every condition occupies every ordinal position exactly once',()=>{const p=plan();for(const c of CONDITIONS)assert.deepEqual(p.filter(x=>x.condition===c).map(x=>x.position).sort(),[1,2,3,4,5,6]);});
test('within-block ordered predecessors are balanced',()=>{const p=plan(),pairs=new Map();for(let i=1;i<p.length;i++)if(p[i].block===p[i-1].block){const key=p[i-1].condition+'>'+p[i].condition;pairs.set(key,(pairs.get(key)??0)+1);}assert.equal(pairs.size,30);assert([...pairs.values()].every(n=>n===1));});
test('missing values are not converted into zeros',()=>{assert.deepEqual(stats([null,undefined,NaN,Infinity,'0']),{n:0,median:null,min:null,max:null});});
test('zero and all slow outliers are retained',()=>{assert.deepEqual(stats([0,10,20,1000]),{n:4,median:15,min:0,max:1000});});
test('full evidence does not imply release certification',()=>{const s=summarize(rows());assert.equal(s.captureComplete,true);assert.equal(s.releaseCertified,false);});
test('a failed rich cadence run remains a failure and is never dropped',()=>{const r=rows();r[0].cadenceStatus='FAIL';r[0].startupMs=208;const s=summarize(r);assert.equal(s.captureComplete,true);assert.equal(s.groups['rich/plain'].cadence.failed,1);assert.equal(s.groups['rich/plain'].cadence.startupMs.max,208);});
for(const [name,change] of [
 ['unmeasured rich cadence',r=>r[0].cadenceStatus='NOT_RUN'],['unmeasured lifecycle',r=>delete r[0].releaseStatus],
 ['missing run',r=>r.pop()],['duplicated sample',r=>r[1]=r[0]],['reordered samples',r=>[r[0],r[1]]=[r[1],r[0]]],
 ['incomplete capture',r=>r[0].captureError='navigation failed'],['missing trace',r=>delete r.find(x=>x.traced).traceSha256],
 ['trace error',r=>r.find(x=>x.traced).traceError='stream incomplete'],['fake ablation visual pass',r=>r.find(x=>x.sampler==='clock').cadenceStatus='PASS']
])test(`fail closed: ${name}`,()=>{const r=rows();change(r);assert.throws(()=>validateRows(r));assert.equal(summarize(r).captureComplete,false);});
test('clock/events are explicitly not visual measurements',()=>{const s=summarize(rows());for(const c of CONDITIONS.filter(x=>!x.startsWith('rich/')))assert.deepEqual(s.groups[c].cadence,{status:'NOT_MEASURED'});});
