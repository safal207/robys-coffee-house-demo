import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(process.env.FEATURED_GALLERY_SOURCE??new URL('../src/featured-gallery.ts',import.meta.url),'utf8');

function fixture({pending='morning',state='loading',top=120,bottom=520}={}){
  const raf=new Map(),mutationObservers=[],intersectionObservers=[],windowHandlers=new Map();let next=0,reads=0;
  const root={dataset:{}};if(pending)root.dataset.robysEntryPending=pending;if(state)root.dataset.robysEntryState=state;
  const toggles=[];
  const body={classList:{toggle(name,on){toggles.push({name,on});}}};
  class MutationObserver {
    constructor(fn){this.fn=fn;this.targets=new Map();mutationObservers.push(this);}
    observe(node,options){this.targets.set(node,options);}
    disconnect(){this.targets.clear();}
  }
  class IntersectionObserver {
    constructor(fn,options){this.fn=fn;this.options=options;this.targets=new Set();intersectionObservers.push(this);}
    observe(node){this.targets.add(node);}
    disconnect(){this.targets.clear();}
  }
  const visualViewport={offsetTop:0,height:844,handlers:new Map(),addEventListener(type,fn){this.handlers.set(type,fn);}};
  const win={innerHeight:844,visualViewport,IntersectionObserver,
    requestAnimationFrame(fn){const id=++next;raf.set(id,fn);return id;},cancelAnimationFrame(id){raf.delete(id);},
    addEventListener(type,fn){if(!windowHandlers.has(type))windowHandlers.set(type,[]);windowHandlers.get(type).push(fn);}};
  const document={documentElement:root,body};
  const section={getBoundingClientRect(){reads++;return{top,bottom};}};
  const autoInit=source.indexOf('if (document.readyState === "loading") {');
  assert(autoInit>0,'Could not isolate module auto-init');
  const core=source.slice(0,autoInit);
  const instrumented=core.replace('function setupGalleryDockBehavior(section: HTMLElement): void {','export function setupGalleryDockBehavior(section: HTMLElement): void {');
  assert.notEqual(instrumented,core,'Failed to expose setupGalleryDockBehavior for test');
  const output=ts.transpileModule(instrumented,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  const context=vm.createContext({document,window:win,MutationObserver,IntersectionObserver,console,module,exports:module.exports});
  vm.runInContext(`(function(exports,module){${output}\n})(exports,module);`,context);
  const api=module.exports;
  assert.equal(typeof api.setupGalleryDockBehavior,'function');
  api.setupGalleryDockBehavior(section);
  const flush=()=>{const jobs=[...raf.entries()];raf.clear();for(const [,fn] of jobs)fn(0);};
  const fireWindow=type=>{for(const fn of windowHandlers.get(type)??[])fn({type});};
  const rootObserver=()=>mutationObservers.find(o=>o.targets.has(root));
  const mutate=(nextPending,nextState)=>{
    if(nextPending)root.dataset.robysEntryPending=nextPending;else delete root.dataset.robysEntryPending;
    if(nextState)root.dataset.robysEntryState=nextState;else delete root.dataset.robysEntryState;
    const o=rootObserver();if(o)o.fn([{type:'attributes',target:root}]);
  };
  return{raf,root,toggles,flush,fireWindow,mutate,rootObserver,mutationObservers,intersectionObservers,get reads(){return reads;},resetReads(){reads=0;}};
}

test('covered initial entry schedules no gallery geometry work',()=>{const f=fixture();assert.equal(f.raf.size,0);assert.equal(f.reads,0);f.flush();assert.equal(f.reads,0);});
test('scroll while covered does not enqueue hidden gallery measurement',()=>{const f=fixture();f.fireWindow('scroll');assert.equal(f.raf.size,0);assert.equal(f.reads,0);});
test('brand-frame mutation remains quiet while pending entry still covers page',()=>{const f=fixture();f.flush();f.resetReads();f.mutate('morning','brand-frame');assert.equal(f.raf.size,0);f.flush();assert.equal(f.reads,0);});
test('handoff mutation resumes gallery measurement before dissolve finishes',()=>{const f=fixture();f.flush();f.resetReads();f.mutate('morning','handoff');assert.equal(f.raf.size,1);f.flush();assert.equal(f.reads,1);assert.deepEqual(f.toggles.at(-1),{name:'featured-gallery-active',on:true});});
test('pending flag removal after abort resumes gallery without done event',()=>{const f=fixture();f.flush();f.resetReads();f.mutate(null,'loading');assert.equal(f.raf.size,1);f.flush();assert.equal(f.reads,1);});
test('entry off keeps ordinary initial gallery measurement',()=>{const f=fixture({pending:null,state:null});assert.equal(f.raf.size,1);f.flush();assert.equal(f.reads,1);});
test('scheduled measurement rechecks coverage before reading geometry',()=>{const f=fixture({pending:null,state:null});assert.equal(f.raf.size,1);f.root.dataset.robysEntryPending='morning';f.root.dataset.robysEntryState='loading';f.flush();assert.equal(f.reads,0);});
test('resize after reveal continues to schedule gallery measurements',()=>{const f=fixture({pending:null,state:null});f.flush();f.resetReads();f.fireWindow('resize');assert.equal(f.raf.size,1);f.flush();assert.equal(f.reads,1);});
test('root observer watches only entry pending and state attributes',()=>{const f=fixture();const o=f.rootObserver();assert(o,'Missing entry lifecycle observer');assert.deepEqual(Array.from(o.targets.get(f.root).attributeFilter),['data-robys-entry-pending','data-robys-entry-state']);});
test('visibility state still toggles from current section geometry',()=>{const f=fixture({pending:null,state:null,top:900,bottom:1200});f.flush();assert.deepEqual(f.toggles.at(-1),{name:'featured-gallery-active',on:false});});
