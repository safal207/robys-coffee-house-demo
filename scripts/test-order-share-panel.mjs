/** DOM test-double logic coverage, NOT browser layout, focus or activation proof. */
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const temp=mkdtempSync(join(tmpdir(),'robys-share-panel-'));
const compiled=ts.transpileModule(readFileSync(new URL('../src/order-share.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText;
writeFileSync(join(temp,'panel.mjs'),compiled);const {createOrderSharePanel,shareCopy}=await import(pathToFileURL(join(temp,'panel.mjs')));
const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
after(()=>{rmSync(temp,{recursive:true,force:true});for(const [key,value] of [['document',previousDocument],['navigator',previousNavigator]]){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.hidden=false;this.open=false;this.value='';this.textContent='';this.disabled=false;}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 removeAttribute(name){this.attributes.delete(name);}
 set href(value){this.setAttribute('href',value)}get href(){return this.getAttribute('href')??''}
 focus(){document.activeElement=this;}
 select(){this.selectionStart=0;this.selectionEnd=this.value.length;}
 click(){if(this.disabled)return true;return this.dispatchEvent(new Event('click',{cancelable:true}));}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(mode='ok'){
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag),activeElement:null}});
 const calls=[],deferred={};
 const clipboard={writeText(text){calls.push(text);if(mode==='reject')return Promise.reject(new Error('denied'));if(mode==='throw')throw new Error('denied');if(mode==='defer')return new Promise(resolve=>deferred.resolve=resolve);return Promise.resolve();}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:mode==='absent'?undefined:clipboard}});
 const state={revision:1,lines:[{id:'latte',quantity:3}]};let language='ru',allow=true,badTotal=false,missing=false,name='Айс-латте';
 const panel=createOrderSharePanel({language:()=>language,snapshot:()=>state,summary:()=>({quantity:state.lines.reduce((n,l)=>n+l.quantity,0),totalMinor:badTotal?1:state.lines.reduce((n,l)=>n+l.quantity*18000,0)}),resolveProduct:()=>missing?undefined:{item:{name:{tr:name,en:name,ru:name},price:180}},menuUrl:'https://example.test/menu.html?secret=1#private',canShare:()=>allow&&state.lines.length>0});
 const [toggle,hint,text,actions,long,status]=panel.element.children;const [telegram,copy]=actions.children;
 return {panel,toggle,hint,text,actions,long,status,telegram,copy,calls,state,deferred,show:()=>panel.update(true),allow:value=>{allow=value;panel.update(true)},lang:value=>{language=value;panel.update(true)},bad:()=>{badTotal=true;panel.update(true)},missing:()=>{missing=true;panel.update(true)},name:value=>{name=value;panel.update(true)}};
}
test('render does not write clipboard and uses one current complete projection',()=>{const f=setup();f.show();assert.deepEqual(f.calls,[]);const url=new URL(f.telegram.href);assert.equal(f.text.value,`${url.searchParams.get('text')}\n\nhttps://example.test/menu.html`);assert(f.text.readOnly);});
for(const lang of ['tr','en','ru'])test(`all panel labels and aria copy update together: ${lang}`,()=>{const f=setup();f.lang(lang);assert.equal(f.toggle.textContent,shareCopy[lang].toggle);assert.equal(f.copy.textContent,shareCopy[lang].copy);assert.equal(f.text.getAttribute('aria-label'),shareCopy[lang].preview);assert(f.text.value.includes(shareCopy[lang].disclaimer));});
test('clipboard success writes exact visible text and leaves source snapshot untouched',async()=>{const f=setup();f.show();const before=JSON.stringify(f.state);f.copy.click();await flush();assert.deepEqual(f.calls,[f.text.value]);assert.equal(JSON.stringify(f.state),before);assert.equal(f.status.textContent,shareCopy.ru.copied);assert.equal(f.copy.getAttribute('aria-busy'),null);});
for(const mode of ['absent','reject','throw'])test(`clipboard ${mode}: selects full preview, no false success`,async()=>{const f=setup(mode);f.show();f.copy.click();await flush();assert.equal(document.activeElement,f.text);assert.equal(f.text.selectionStart,0);assert.equal(f.text.selectionEnd,f.text.value.length);assert.equal(f.status.textContent,shareCopy.ru.manual);assert.equal(f.copy.disabled,false);});
test('pending clipboard promise prevents duplicate writes',async()=>{const f=setup('defer');f.show();f.copy.click();f.copy.click();assert.equal(f.calls.length,1);assert(f.copy.disabled);f.deferred.resolve();await flush();assert(!f.copy.disabled);});
test('basket changes during copy are not reported as copying current order',async()=>{const f=setup('defer');f.show();f.copy.click();const old=f.calls[0];f.state.revision++;f.state.lines[0].quantity=4;f.show();f.deferred.resolve();await flush();assert.notEqual(old,f.text.value);assert.equal(f.status.textContent,shareCopy.ru.changed);});
test('language change during copy is reported in new language',async()=>{const f=setup('defer');f.show();f.copy.click();f.lang('en');f.deferred.resolve();await flush();assert.equal(f.status.textContent,shareCopy.en.changed);});
test('closing sharing during pending copy does not resurrect panel or success',async()=>{const f=setup('defer');f.show();f.copy.click();f.panel.update(false);f.deferred.resolve();await flush();assert(f.panel.element.hidden);assert.equal(f.status.textContent,'');assert.equal(f.text.value,'');});
test('ordinary share click refreshes stale view from current snapshot',()=>{const f=setup();f.show();f.state.lines[0].quantity=4;f.state.revision++;assert.equal(f.telegram.click(),true);assert(new URL(f.telegram.href).searchParams.get('text').includes('4 ×'));assert.equal(f.status.textContent,shareCopy.ru.choose);assert.equal(f.state.revision,2);});
test('changed invalid order blocks stale share intent',()=>{const f=setup();f.show();f.state.lines[0].quantity=0;assert.equal(f.telegram.click(),false);assert.equal(f.telegram.getAttribute('href'),null);assert(f.actions.hidden);});
test('migration guard clears panel and resets disclosure state',()=>{const f=setup();f.show();f.panel.element.open=true;f.allow(false);assert(f.panel.element.hidden);assert(!f.panel.element.open);assert.equal(f.text.value,'');assert.equal(f.telegram.getAttribute('href'),null);});
test('empty order is never offered for sharing',()=>{const f=setup();f.state.lines=[];f.show();assert(f.panel.element.hidden);});
for(const cause of ['bad','missing'])test(`invalid ${cause} blocks full projection without partial lines`,()=>{const f=setup();f[cause]();assert(f.text.hidden);assert(f.actions.hidden);assert.equal(f.text.value,'');assert.equal(f.status.textContent,shareCopy.ru.invalid);});
test('oversize link is absent; complete preview and copy remain available',async()=>{const f=setup();f.name('Ж'.repeat(1400));assert(f.telegram.hidden);assert.equal(f.telegram.getAttribute('href'),null);assert(!f.long.hidden);assert(f.text.value.includes('Ж'.repeat(1400)));f.copy.click();await flush();assert.equal(f.calls[0],f.text.value);});
test('update resets old success after a basket edit',async()=>{const f=setup();f.show();f.copy.click();await flush();f.state.revision++;f.state.lines[0].quantity=4;f.show();assert.equal(f.status.textContent,'');});
test('sharing URL privacy attributes and state-free menu link retained',()=>{const f=setup();f.show();assert.equal(f.telegram.target,'_blank');assert.equal(f.telegram.rel,'noopener noreferrer');assert.equal(f.telegram.referrerPolicy,'no-referrer');assert(!new URL(f.telegram.href).searchParams.get('url').includes('secret'));});
