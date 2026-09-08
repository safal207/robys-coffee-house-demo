/** Actual order-shell.ts + order-share.ts logic integration.
 * The DOM, canonical store, dock and clipboard below are test doubles.
 * This is NOT browser layout/focus evidence, a production-catalog test or site CI.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const shell=readFileSync(process.env.ORDER_SHELL_SOURCE ?? new URL('../src/order-shell.ts',import.meta.url),'utf8');
const share=readFileSync(process.env.ORDER_SHARE_SOURCE ?? new URL('../src/order-share.ts',import.meta.url),'utf8');
console.log('# source_sha256',JSON.stringify({shell:createHash('sha256').update(shell).digest('hex'),share:createHash('sha256').update(share).digest('hex')}));
const flush=()=>new Promise(r=>setImmediate(r));
function setup(){
 const focusAttempts=[];
 let document;
 class Element extends EventTarget {
  constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.className='';this.id='';this.dataset={};this.hidden=false;this.open=false;this.disabled=false;this.value='';this.textContent='';this.inert=false;
   this.classList={add:(...v)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...v])].join(' ')},remove:(...v)=>{this.className=this.className.split(' ').filter(x=>!v.includes(x)).join(' ')},toggle:(x,on)=>{const has=this.className.split(' ').includes(x),next=on===undefined?!has:on;if(next)this.classList.add(x);else this.classList.remove(x);return next;}};
  }
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes.set(k,String(v));if(k==='open')this.open=true;}
  getAttribute(k){return this.attributes.get(k)??null;}
  removeAttribute(k){this.attributes.delete(k);if(k==='open')this.open=false;}
  set href(v){this.setAttribute('href',v);}get href(){return this.getAttribute('href')??'';}
  get isConnected(){return this===document.body||Boolean(this.parentElement?.isConnected);}
  matches(s){if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.className.split(' ').includes(s.slice(1));if(s==='[data-order-focus]')return this.dataset.orderFocus!==undefined;if(s==='button:not([disabled])')return this.tagName==='BUTTON'&&!this.disabled;if(s==='textarea:not([disabled])')return this.tagName==='TEXTAREA'&&!this.disabled;if(s==='a[href]')return this.tagName==='A'&&this.attributes.has('href');return this.tagName.toLowerCase()===s;}
  querySelectorAll(selector){return this.children.flatMap(n=>[n,...n.querySelectorAll('*')]).filter(n=>selector==='*'||selector.split(',').some(s=>n.matches(s.trim())));}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  getClientRects(){for(let n=this;n;n=n.parentElement)if(n.hidden||(n.tagName==='DIALOG'&&!n.open))return[];return[{}];}
  focus(){focusAttempts.push(this);document.activeElement=this;}
  select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click',{cancelable:true}));}
  showModal(){this.open=true;}
  close(){this.open=false;}
 }
 document={readyState:'complete',activeElement:null,createElement:t=>new Element(t),documentElement:new Element('html'),body:new Element('body'),querySelector:s=>document.body.querySelector(s)};
 document.documentElement.lang='ru';
 const state={revision:1,lines:[{id:'cold-coffee:iced-latte',quantity:3}]};
 let pendingLegacy=null;const listeners=[];
 const resolveProduct=id=>id==='cold-coffee:iced-latte'?{image:'fixture.png',item:{price:180,name:{tr:'Latte',en:'Latte',ru:'Латте'}}}:undefined;
 const order={get:()=>structuredClone(state),summary:()=>({quantity:state.lines.reduce((n,l)=>n+l.quantity,0),totalMinor:state.lines.reduce((n,l)=>n+18000*l.quantity,0)}),status:()=>({persistent:true,canUndo:false,notice:null,pendingLegacy}),subscribe:fn=>{listeners.push(fn);},setQuantity(id,quantity){state.lines=state.lines.filter(l=>l.id!==id);if(quantity)state.lines.push({id,quantity});state.revision++;for(const f of listeners)f();},undoRemoval(){},resolveMigration(){pendingLegacy=null;for(const f of listeners)f();}};
 const clipboardCalls=[],deferred={};
 const storage=new Map();
 const context=vm.createContext({document,window:new EventTarget(),HTMLElement:Element,MutationObserver:class{observe(){}},navigator:{clipboard:{writeText(text){clipboardCalls.push(text);return new Promise((resolve,reject)=>Object.assign(deferred,{resolve,reject}));}}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},URL,Intl,CustomEvent,Event,setTimeout,Promise,console});
 function load(source,path,dependencies){
  const output=ts.transpileModule(source.replaceAll('import.meta.url','"https://example.test/order-shell.js"'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
  assert.equal((output.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
  const module={exports:{}};
  const fn=new vm.Script(`(function(exports,module,require){${output.outputText}\n})`,{filename:path}).runInContext(context);
  fn(module.exports,module,name=>{assert(Object.hasOwn(dependencies,name),`Unexpected dependency: ${name}`);return dependencies[name];});return module.exports;
 }
 const realShare=load(share,'order-share.ts',{});
 load(shell,'order-shell.ts',{'./order-share.js':realShare,'./order-dock.js':{installOrderDock(){}},'@robys/order':{order,resolveOrderProduct:resolveProduct,suggestOrderAddition:()=>undefined}});
 const find=selector=>{const node=document.querySelector(selector);assert(node,`Missing ${selector}`);return node;};
 const dialog=find('#robys-order-dialog'),panel=find('#robys-order-sharing'),preview=find('.order-share-preview'),copy=find('.order-share-actions').children[1],status=panel.querySelector('.order-status');
 return {document,order,state,dialog,panel,preview,copy,status,deferred,clipboardCalls,focusAttempts,
  open(){find('#robys-order-trigger').click();},close(){find('.order-close').click();},reveal(){panel.open=true;panel.dispatchEvent(new Event('toggle'));},handoff(){find('#robys-order-handoff').click();},edit(){find('#robys-order-edit').click();},pending(value){pendingLegacy=value;for(const f of listeners)f();}};
}

test('closed drawer cannot expose an active share projection on initial render',()=>{const f=setup();assert(!f.dialog.open);assert(f.panel.hidden);assert.equal(f.preview.value,'');});
test('opening the real shell reveals the collapsed sharing control and canonical total',()=>{const f=setup();f.open();assert(f.dialog.open);assert(!f.panel.hidden);assert(!f.panel.open);f.reveal();assert(f.preview.value.includes('3 × Латте'));assert(f.preview.value.includes('540'));assert.deepEqual(f.clipboardCalls,[]);});
test('closing drawer clears disclosure and cannot leave a stale success view on reopening',async()=>{const f=setup();f.open();f.reveal();f.copy.click();f.deferred.resolve();await flush();assert(f.status.textContent.includes('скопирован'));f.close();assert(!f.dialog.open);assert(f.panel.hidden);assert(!f.panel.open);assert.equal(f.preview.value,'');assert.equal(f.status.textContent,'');f.open();assert(!f.panel.hidden);assert(!f.panel.open);assert.equal(f.status.textContent,'');});
test('late clipboard rejection after closing does not attempt hidden focus or restore status',async()=>{const f=setup();f.open();f.reveal();f.copy.click();f.close();const attempts=f.focusAttempts.length;f.deferred.reject(new Error('denied'));await flush();assert.equal(f.focusAttempts.length,attempts);assert(f.panel.hidden);assert.equal(f.status.textContent,'');assert.equal(f.preview.value,'');});
test('late clipboard success after closing does not restore hidden content or success',async()=>{const f=setup();f.open();f.reveal();f.copy.click();f.close();f.deferred.resolve();await flush();assert(f.panel.hidden);assert.equal(f.status.textContent,'');assert.equal(f.preview.value,'');});
test('canonical-order changes while drawer is closed do not resurrect the share panel',()=>{const f=setup();f.open();f.reveal();f.close();f.order.setQuantity('cold-coffee:iced-latte',4);assert(f.panel.hidden);assert.equal(f.preview.value,'');f.open();f.reveal();assert(f.preview.value.includes('4 × Латте'));assert(f.preview.value.includes('720'));});
test('barista handoff hides sharing and editing restores a collapsed control',()=>{const f=setup();f.open();f.reveal();f.handoff();assert(f.panel.hidden);assert(!f.panel.open);assert.equal(f.preview.value,'');f.edit();assert(!f.panel.hidden);assert(!f.panel.open);});
test('empty order and pending migration still prevent sharing in the open shell',()=>{const f=setup();f.open();f.pending([{id:'cold-coffee:iced-latte',quantity:1}]);assert(f.panel.hidden);f.pending(null);assert(!f.panel.hidden);f.order.setQuantity('cold-coffee:iced-latte',0);assert(f.panel.hidden);assert.equal(f.preview.value,'');});
test('clipboard failure from a previous drawer opening cannot steal focus after reopening',async()=>{const f=setup();f.open();f.reveal();f.copy.click();f.close();f.open();const attempts=f.focusAttempts.length;f.deferred.reject(new Error('old request denied'));await flush();assert.equal(f.focusAttempts.length,attempts);assert.equal(f.status.textContent,'');assert(!f.panel.open);});
test('clipboard success from a previous opening cannot label the new drawer as copied',async()=>{const f=setup();f.open();f.reveal();f.copy.click();f.close();f.open();f.deferred.resolve();await flush();assert.equal(f.status.textContent,'');assert(!f.panel.open);assert(!f.copy.disabled);});

// P2: independent pending clipboard writes across drawer lifecycles.
// These still use the labelled DOM/store/clipboard doubles above, not a browser.
const pendingTransitions = [
  ['drawer close/reopen', f => f.close(), f => f.open()],
  ['barista/edit', f => f.handoff(), f => f.edit()],
  ['migration hold/resume', f => f.pending([{id:'cold-coffee:iced-latte',quantity:1}]), f => f.pending(null)],
  ['empty/restore', f => f.order.setQuantity('cold-coffee:iced-latte',0), f => f.order.setQuantity('cold-coffee:iced-latte',3)]
];
for (const [name, hide, show] of pendingTransitions) test(`pending clipboard: ${name} releases busy without settling the obsolete write`, async () => {
  const f=setup();f.open();f.reveal();f.copy.click();
  assert(f.copy.disabled);assert.equal(f.copy.getAttribute('aria-busy'),'true');
  hide(f);
  assert(f.panel.hidden);assert(!f.copy.disabled);assert.equal(f.copy.getAttribute('aria-busy'),null);
  show(f);f.reveal();assert(!f.copy.disabled);f.copy.click();
  assert.equal(f.clipboardCalls.length,2,'a new write starts while the first remains pending');
  f.deferred.resolve();await flush();
  assert(f.status.textContent.includes('скопирован'));assert(!f.copy.disabled);
  assert.equal(f.copy.getAttribute('aria-busy'),null);
});
for (const oldOutcome of ['resolve','reject']) for (const newState of ['pending','resolved','rejected']) {
  test(`clipboard ownership: obsolete ${oldOutcome} cannot alter a newer ${newState} write`, async () => {
    const f=setup();f.open();f.reveal();f.copy.click();const oldWrite={...f.deferred};
    f.close();f.open();f.order.setQuantity('cold-coffee:iced-latte',4);f.reveal();f.copy.click();
    assert.equal(f.clipboardCalls.length,2);const newWrite={...f.deferred};
    assert.match(f.clipboardCalls[1],/720/);
    if(newState==='resolved')newWrite.resolve();
    if(newState==='rejected')newWrite.reject(new Error('current denial'));
    await flush();const before={status:f.status.textContent,focus:f.focusAttempts.length,text:f.preview.value};
    if(oldOutcome==='resolve')oldWrite.resolve();else oldWrite.reject(new Error('obsolete denial'));
    await flush();
    assert.equal(f.status.textContent,before.status);assert.equal(f.focusAttempts.length,before.focus);assert.equal(f.preview.value,before.text);
    assert.equal(f.copy.disabled,newState==='pending');
    assert.equal(f.copy.getAttribute('aria-busy'),newState==='pending'?'true':null);
    if(newState==='pending'){
      f.copy.click();assert.equal(f.clipboardCalls.length,2,'obsolete finally must not admit a duplicate third write');
      newWrite.resolve();await flush();assert(f.status.textContent.includes('скопирован'));assert(!f.copy.disabled);
    }else if(newState==='resolved')assert(f.status.textContent.includes('скопирован'));
    else {assert(f.status.textContent.includes('недоступно'));assert.equal(f.document.activeElement,f.preview);}
  });
}
test('clipboard ownership: three drawer generations keep only the newest busy state',async()=>{
  const f=setup();f.open();f.reveal();f.copy.click();const first={...f.deferred};
  f.close();f.open();f.reveal();f.copy.click();const second={...f.deferred};
  f.close();f.open();f.reveal();f.copy.click();const third={...f.deferred};assert.equal(f.clipboardCalls.length,3);
  first.resolve();second.reject(new Error('obsolete middle generation'));await flush();
  assert(f.copy.disabled);assert.equal(f.copy.getAttribute('aria-busy'),'true');assert.equal(f.status.textContent,'');
  third.resolve();await flush();assert(!f.copy.disabled);assert.equal(f.copy.getAttribute('aria-busy'),null);assert(f.status.textContent.includes('скопирован'));
});
test('clipboard ownership: same-lifecycle duplicate guard and changed-order notice remain intact',async()=>{
  const f=setup();f.open();f.reveal();f.copy.click();f.copy.click();assert.equal(f.clipboardCalls.length,1);
  f.order.setQuantity('cold-coffee:iced-latte',4);assert(f.copy.disabled);
  f.deferred.resolve();await flush();assert(f.status.textContent.includes('изменился'));assert(!f.copy.disabled);
});
