/** Actual controller logic with DOM/observer/geometry doubles; no layout or timing claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(process.env.DOCK_SOURCE??new URL('../src/order-dock.ts',import.meta.url),'utf8');
function fixture(pending='morning',state='loading'){
 const jobs=new Map(),reads=[],observers=[];let id=0;
 const values=new Map();
 const root={dataset:{},style:{getPropertyValue:k=>values.get(k)??'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
 if(pending)root.dataset.robysEntryPending=pending;if(state)root.dataset.robysEntryState=state;
 class Observer{constructor(fn){this.fn=fn;this.nodes=new Map();observers.push(this);}observe(n,options){this.nodes.set(n,options);}unobserve(n){this.nodes.delete(n);}disconnect(){this.nodes.clear();}}
 const win=new EventTarget();win.requestAnimationFrame=fn=>{jobs.set(++id,fn);return id};win.cancelAnimationFrame=n=>jobs.delete(n);win.visualViewport=new EventTarget();
 const doc=new EventTarget();doc.documentElement=root;doc.defaultView=win;doc.body={};doc.fonts=undefined;
 const block={isConnected:true,height:58,bottom:8,getBoundingClientRect(){reads.push('obstacle-rect');return{left:10,right:380,height:this.height}}};
 doc.querySelectorAll=()=>[block];
 win.getComputedStyle=n=>{reads.push(n===block?'obstacle-style':'bar-style');return n===block?{bottom:String(block.bottom),position:'fixed',display:'grid',visibility:'visible',pointerEvents:'auto'}:{bottom:String(Math.max(14,Number.parseFloat(values.get('--robys-order-obstruction'))||0))}};
 const makeBar=()=>({ownerDocument:doc,isConnected:true,getBoundingClientRect(){reads.push('bar-rect');return{left:14,right:380,height:52}}});
 const sandbox=vm.createContext({exports:{},MutationObserver:Observer,ResizeObserver:Observer,Element:class{},Symbol,Number,Set,Array,Math});
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInContext(output,sandbox);
 const api=sandbox.exports;const bar=makeBar();const stop=api.installOrderDock(bar);
 const tick=()=>{const current=[...jobs.values()];jobs.clear();current.forEach(fn=>fn(0));};
 const entry=(p,s)=>{if(p)root.dataset.robysEntryPending=p;else delete root.dataset.robysEntryPending;if(s)root.dataset.robysEntryState=s;else delete root.dataset.robysEntryState;for(const o of observers)if(o.nodes.has(root))o.fn([{type:'attributes',target:root}]);};
 return{jobs,reads,values,root,block,bar,api,makeBar,stop,tick,entry,observers,win};
}
test('covered initial entry performs zero geometry/style reads and does not poll',()=>{const f=fixture();f.tick();assert.deepEqual(f.reads,[]);assert.equal(f.jobs.size,0);assert.equal(f.values.size,0);});
test('brand-frame notification still leaves compositor startup free of dock reads',()=>{const f=fixture();f.tick();f.entry('morning','brand-frame');f.tick();assert.deepEqual(f.reads,[]);assert.equal(f.jobs.size,0);});
test('handoff resumes measurement before pending shield is removed',()=>{const f=fixture();f.tick();f.entry('morning','handoff');assert.equal(f.jobs.size,1);f.tick();assert(f.reads.length>0);assert.equal(f.values.get('--robys-order-obstruction'),'78px');assert.equal(f.values.get('--robys-order-page-clearance'),'142px');});
test('failure removing pending flag without a done event resumes dock',()=>{const f=fixture();f.tick();f.entry(null,'loading');assert.equal(f.jobs.size,1);f.tick();assert.equal(f.values.get('--robys-order-obstruction'),'78px');});
test('entry=off retains ordinary first-frame measurement',()=>{const f=fixture(null,null);f.tick();assert(f.reads.length>0);assert.equal(f.values.get('--robys-order-obstruction'),'78px');});
test('latest translated blocker dimensions are used after suspension',()=>{const f=fixture();f.tick();f.block.height=112;f.entry(null,'done');f.tick();assert.equal(f.values.get('--robys-order-obstruction'),'132px');assert.equal(f.values.get('--robys-order-page-clearance'),'196px');});
test('root fallback observer survives blocker refresh registration',()=>{const f=fixture();const matches=f.observers.filter(o=>o.nodes.has(f.root));assert.equal(matches.length,1);assert.deepEqual(Array.from(matches[0].nodes.get(f.root).attributeFilter),['data-robys-entry-pending','data-robys-entry-state']);});
test('dispose while suspended disconnects observers and prevents resurrection',()=>{const f=fixture();f.tick();f.stop();f.entry(null,'done');f.win.dispatchEvent(new Event('resize'));assert.equal(f.jobs.size,0);assert(f.observers.every(o=>o.nodes.size===0));});
test('two registered bars share one suspended controller and one frame',()=>{const f=fixture();const second=f.makeBar();const stop=f.api.installOrderDock(second);assert.equal(f.jobs.size,1);f.tick();assert.deepEqual(f.reads,[]);f.entry(null,'done');assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.filter(x=>x==='bar-rect').length,2);stop();f.stop();});
test('disconnected last bar is disposed even while entry covers page',()=>{const f=fixture();f.bar.isConnected=false;f.tick();assert.deepEqual(f.reads,[]);assert(f.observers.every(o=>o.nodes.size===0));});
