/** Actual gallery controller source with DOM, observer and viewport doubles.
 * This suite proves scheduling/recovery logic, not browser layout or performance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(process.env.GALLERY_SOURCE??new URL('../src/featured-gallery.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true});
assert.equal(code.diagnostics?.length??0,0);
function fixture({pending='morning',state='loading',intersection=true,visual=true}={}){
 const root={dataset:{}},jobs=new Map(),reads=[],writes=[],observers=[];let nextId=0,active=false;
 if(pending)root.dataset.robysEntryPending=pending;if(state)root.dataset.robysEntryState=state;
 const rect={top:500,bottom:900},viewport={offsetTop:0,height:844};
 const section={getBoundingClientRect(){reads.push('rect');return {...rect};}};
 const document=new EventTarget();document.readyState='loading';document.documentElement=root;
 document.body={classList:{toggle(name,value){assert.equal(name,'featured-gallery-active');active=value;writes.push(value);}}};
 const window=new EventTarget();window.requestAnimationFrame=fn=>{jobs.set(++nextId,fn);return nextId;};
 Object.defineProperty(window,'innerHeight',{get(){reads.push('innerHeight');return 844;}});
 if(visual){window.visualViewport=new EventTarget();for(const key of ['offsetTop','height'])Object.defineProperty(window.visualViewport,key,{get(){reads.push(key);return viewport[key];}});}
 class MutationObserver {constructor(fn){this.fn=fn;this.targets=new Map();observers.push(this);}observe(n,o){this.targets.set(n,o);}disconnect(){this.targets.clear();}}
 let intersectionCallback;
 class IntersectionObserver {constructor(fn){intersectionCallback=fn;}observe(n){assert.equal(n,section);}}
 if(intersection)window.IntersectionObserver=IntersectionObserver;
 const context=vm.createContext({window,document,MutationObserver,IntersectionObserver});
 vm.runInContext(code.outputText+'\nglobalThis.install=setupGalleryDockBehavior;',context);
 context.install(section);
 const notify=name=>{for(const o of observers)if(o.targets.get(root)?.attributeFilter?.includes(name))o.fn([{type:'attributes',target:root,attributeName:name}]);};
 const entry=(p,s)=>{if(p)root.dataset.robysEntryPending=p;else delete root.dataset.robysEntryPending;if(s)root.dataset.robysEntryState=s;else delete root.dataset.robysEntryState;notify('data-robys-entry-pending');notify('data-robys-entry-state');};
 return {root,jobs,reads,writes,rect,viewport,observers,active:()=>active,entry,notify,
  tick(){const current=[...jobs.values()];jobs.clear();current.forEach(f=>f(16));},
  event(name){window.dispatchEvent(new Event(name));},
  burst(){for(const name of ['scroll','resize','orientationchange','pageshow'])window.dispatchEvent(new Event(name));for(const name of ['scroll','resize'])window.visualViewport?.dispatchEvent(new Event(name));intersectionCallback?.([]);},
  intersection(){intersectionCallback?.([]);}};
}
for(const state of [null,'loading','brand-frame','unknown'])test(`covered ${state??'pre-import'}: no scheduled measurement or geometry reads`,()=>{const f=fixture({state});assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);});
test('covered scroll, viewport and intersection burst neither polls nor reads',()=>{const f=fixture();f.burst();assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);});
test('brand notification cannot schedule covered work',()=>{const f=fixture();f.tick();f.entry('morning','brand-frame');assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);});
for(const state of ['handoff','done'])test(`${state} wakes one measurement even with pending flag still present`,()=>{const f=fixture();f.tick();f.entry('morning',state);assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.filter(x=>x==='rect').length,1);assert.equal(f.active(),true);});
for(const state of [null,'loading','brand-frame'])test(`failure removes pending (${state??'no event'}): resumes without done event`,()=>{const f=fixture({state});f.tick();f.entry(null,state);assert.equal(f.jobs.size,1);f.tick();assert.equal(f.active(),true);});
test('frame queued before entry is suppressed if cover appears before callback',()=>{const f=fixture({pending:null,state:null});assert.equal(f.jobs.size,1);f.entry('day','loading');f.tick();assert.deepEqual(f.reads,[]);f.entry(null,'done');f.tick();assert.equal(f.active(),true);});
test('ordinary entry=off/native route with no pending shield is measured',()=>{const f=fixture({pending:null,state:null});f.tick();assert.equal(f.active(),true);assert.equal(f.reads.filter(x=>x==='rect').length,1);});
test('scroll burst after handoff coalesces and unchanged visibility does not rewrite class',()=>{const f=fixture({pending:null,state:'done'});f.tick();f.reads.length=0;f.burst();assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.filter(x=>x==='rect').length,1);assert.deepEqual(f.writes,[true]);});
test('latest scroll position is used on resumption, not pre-entry geometry',()=>{const f=fixture();f.tick();f.rect.top=1500;f.rect.bottom=1900;f.entry(null,'done');f.tick();assert.equal(f.active(),false);assert.deepEqual(f.writes,[false]);});
test('second entry pauses and then refreshes a previously active gallery',()=>{const f=fixture({pending:null,state:'done'});f.tick();f.reads.length=0;f.entry('night','loading');f.rect.top=-600;f.rect.bottom=-10;f.burst();f.tick();assert.deepEqual(f.reads,[]);assert.equal(f.active(),true);f.entry(null,'done');f.tick();assert.equal(f.active(),false);});
test('visual viewport offset/height retain existing intersection semantics',()=>{const f=fixture({pending:null});f.viewport.offsetTop=600;f.viewport.height=200;f.rect.top=100;f.rect.bottom=600;f.tick();assert.equal(f.active(),false);f.rect.bottom=601;f.event('resize');f.tick();assert.equal(f.active(),true);});
test('no visual viewport falls back to window height',()=>{const f=fixture({pending:null,visual:false});f.tick();assert(f.reads.includes('innerHeight'));assert.equal(f.active(),true);});
test('without IntersectionObserver, root removal and scroll still recover',()=>{const f=fixture({intersection:false});f.tick();f.entry(null,'done');f.tick();assert.equal(f.active(),true);f.rect.top=2000;f.rect.bottom=2400;f.event('scroll');f.tick();assert.equal(f.active(),false);});
test('pageshow after page restoration measures current geometry',()=>{const f=fixture({pending:null});f.tick();f.rect.top=-900;f.rect.bottom=-100;f.event('pageshow');f.tick();assert.equal(f.active(),false);});
test('root observer watches only pending/state, not unrelated language/class mutations',()=>{const f=fixture({pending:null});f.tick();const o=f.observers.filter(o=>o.targets.has(f.root));assert.equal(o.length,1);assert.deepEqual(Array.from(o[0].targets.get(f.root).attributeFilter),['data-robys-entry-pending','data-robys-entry-state']);f.notify('lang');f.notify('class');assert.equal(f.jobs.size,0);});
