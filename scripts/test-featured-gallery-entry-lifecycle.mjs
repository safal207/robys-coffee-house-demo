import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(process.env.GALLERY_SOURCE??new URL('../src/featured-gallery.ts',import.meta.url),'utf8');
const initAnchor='\nif (document.readyState === "loading") {';
const initIndex=source.indexOf(initAnchor);
assert(initIndex>0,'Expected gallery module init anchor');
const isolated=`${source.slice(0,initIndex)}\nexport { setupGalleryDockBehavior };\n`;

function fixture({pending='morning',state='loading',top=100,bottom=500}={}){
  const reads=[],toggles=[],jobs=new Map(),intersections=[],mutations=[];
  let rafId=0;
  const root={dataset:{}};
  if(pending)root.dataset.robysEntryPending=pending;
  if(state)root.dataset.robysEntryState=state;
  const body={classList:{toggle(name,value){toggles.push({name,value});}}};
  const doc={documentElement:root,body};
  const visualViewport=new EventTarget();visualViewport.offsetTop=0;visualViewport.height=844;
  const win=new EventTarget();
  win.visualViewport=visualViewport;win.innerHeight=844;
  win.requestAnimationFrame=fn=>{const id=++rafId;jobs.set(id,fn);return id;};
  win.cancelAnimationFrame=id=>jobs.delete(id);
  class IntersectionObserver {
    constructor(callback,options){this.callback=callback;this.options=options;this.nodes=new Set();intersections.push(this);}
    observe(node){this.nodes.add(node);}disconnect(){this.nodes.clear();}unobserve(node){this.nodes.delete(node);}
    fire(){this.callback([],this);}
  }
  class MutationObserver {
    constructor(callback){this.callback=callback;this.targets=new Map();mutations.push(this);}
    observe(node,options){this.targets.set(node,options);}disconnect(){this.targets.clear();}takeRecords(){return[];}
    fire(node=root){if(this.targets.has(node))this.callback([{type:'attributes',target:node}],this);}
  }
  win.IntersectionObserver=IntersectionObserver;
  const section={getBoundingClientRect(){reads.push({pending:root.dataset.robysEntryPending??null,state:root.dataset.robysEntryState??null});return{top,bottom};}};
  const output=ts.transpileModule(isolated,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
  assert.equal((output.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  const context=vm.createContext({document:doc,window:win,IntersectionObserver,MutationObserver,EventTarget,console,exports:module.exports,module});
  new vm.Script(`(function(exports,module){${output.outputText}\n})(exports,module);`).runInContext(context);
  module.exports.setupGalleryDockBehavior(section);
  const tick=()=>{const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(fn=>fn(0));};
  const transition=(nextPending,nextState)=>{
    if(nextPending)root.dataset.robysEntryPending=nextPending;else delete root.dataset.robysEntryPending;
    if(nextState)root.dataset.robysEntryState=nextState;else delete root.dataset.robysEntryState;
    mutations.forEach(observer=>observer.fire(root));
  };
  const signal=(target,type)=>target.dispatchEvent(new Event(type));
  return{reads,toggles,jobs,intersections,mutations,root,body,win,visualViewport,section,tick,transition,signal,setRect(nextTop,nextBottom){top=nextTop;bottom=nextBottom;}};
}

test('covered initial gallery schedules no frame and performs no geometry read',()=>{const f=fixture();assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);});
test('scroll resize viewport and intersection callbacks stay asleep while covered',()=>{const f=fixture();f.signal(f.win,'scroll');f.signal(f.win,'resize');f.signal(f.visualViewport,'scroll');f.signal(f.visualViewport,'resize');f.intersections[0]?.fire();assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);});
test('brand-frame mutation remains covered and performs no work',()=>{const f=fixture();f.transition('morning','brand-frame');assert.equal(f.jobs.size,0);f.tick();assert.deepEqual(f.reads,[]);});
test('handoff mutation resumes one coalesced measurement before pending is removed',()=>{const f=fixture();f.tick();f.reads.length=0;f.transition('morning','handoff');f.signal(f.win,'scroll');f.intersections[0]?.fire();assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.length,1);assert.deepEqual(f.toggles.at(-1),{name:'featured-gallery-active',value:true});});
test('failure recovery resumes when pending flag disappears without a done state',()=>{const f=fixture();f.tick();f.reads.length=0;f.transition(null,'loading');assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.length,1);});
test('entry-off path keeps the existing immediate gallery measurement',()=>{const f=fixture({pending:null,state:null});assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.length,1);});
test('multiple ordinary signals coalesce to one animation-frame geometry read',()=>{const f=fixture({pending:null,state:null});f.tick();f.reads.length=0;f.signal(f.win,'scroll');f.signal(f.win,'resize');f.signal(f.visualViewport,'resize');f.intersections[0]?.fire();assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.length,1);});
test('visibility state still toggles only when the result changes',()=>{const f=fixture({pending:null,state:null,top:900,bottom:1200});f.tick();assert.deepEqual(f.toggles,[{name:'featured-gallery-active',value:false}]);f.signal(f.win,'scroll');f.tick();assert.equal(f.toggles.length,1);f.setRect(200,700);f.signal(f.win,'scroll');f.tick();assert.deepEqual(f.toggles.at(-1),{name:'featured-gallery-active',value:true});});
test('root lifecycle observer watches only pending and state attributes',()=>{const f=fixture();const match=f.mutations.find(observer=>observer.targets.has(f.root));assert(match,'Missing root lifecycle observer');assert.deepEqual(Array.from(match.targets.get(f.root).attributeFilter),['data-robys-entry-pending','data-robys-entry-state']);});
test('done state is treated as uncovered even if pending cleanup is delayed',()=>{const f=fixture();f.tick();f.transition('morning','done');assert.equal(f.jobs.size,1);f.tick();assert.equal(f.reads.length,1);});
