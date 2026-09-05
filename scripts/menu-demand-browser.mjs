import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
const out=path.resolve(process.env.MENU_DEMAND_RESULTS_DIR??'.artifacts/menu-demand');
const port=Number(process.env.MENU_DEMAND_PORT??4219),base=`http://127.0.0.1:${port}/`;
const key='robys:coffee-house:order.v2';
mkdirSync(out,{recursive:true});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:[],passed:false,
 boundary:'Chromium, unmodified enforcing CSP, service workers blocked to isolate module loading. Not live/physical-device/cache-upgrade certification.',files:{}};
for(const f of ['menu-app.js','order-launcher.js','order-store.js','order-shell.js','menu.html'])report.files[f]=createHash('sha256').update(readFileSync(f)).digest('hex');
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function check(name,fn){try{const detail=await fn();report.checks.push({name,passed:true,detail});}catch(e){report.checks.push({name,passed:false,error:String(e.stack)});throw e;}}
async function setup(){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,bypassCSP:false,serviceWorkers:'block'});const page=await context.newPage();return {context,page};}
async function menu(p){await p.goto(base+'menu.html?entry=off',{waitUntil:'domcontentloaded'});await p.locator('.full-menu-item--product').nth(49).waitFor({state:'attached'});}
async function product(p){await p.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();await p.locator('#menu-product-dialog').waitFor({state:'visible'});}
try{
 let ready=false;for(let i=0;i<70;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await sleep(100);}assert.ok(ready,'Server did not start');
 browser=await chromium.launch({headless:true});
 for(const language of ['tr','en','ru'])await check(language+' empty browse, first add, saved reload',async()=>{
  const {context,page:p}=await setup(),requests=[],errors=[];
  p.on('request',r=>{if(r.resourceType()==='script')requests.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
  try{
   await menu(p);await p.locator(`[data-lang="${language}"]`).click();await p.waitForLoadState('networkidle');
   const initial=[...requests];assert.ok(!initial.some(u=>/\/order-(?:store|shell)\.js/.test(u)),JSON.stringify(initial));
   assert.equal(await p.locator('#robys-order-launcher').count(),1);
   assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'0');
   assert.equal(await p.evaluate(k=>sessionStorage.getItem(k),key),null);
   await product(p);await p.locator('#menu-add-to-cart').click();
   await p.locator('#menu-cart-count').filter({hasText:/^1$/}).waitFor({state:'attached'});
   await p.locator('#robys-order-trigger').filter({hasText:'110'}).waitFor({state:'visible'});
   assert.equal(await p.locator('#robys-order-launcher').count(),0);
   const stores=[...new Set(requests.filter(u=>/\/order-store\.js/.test(u)))];assert.equal(stores.length,1);assert.match(stores[0],/\?v=[a-f0-9]{12}$/);
   const catalogs=[...new Set(requests.filter(u=>/\/menu-catalog\.js/.test(u)))];assert.equal(catalogs.length,1);
   await p.reload({waitUntil:'domcontentloaded'});await p.locator('.full-menu-item--product').nth(49).waitFor({state:'attached'});
   assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'1');
   await p.locator('#robys-order-trigger').click();await p.locator('.order-total').filter({hasText:'110'}).waitFor({state:'visible'});
   await p.screenshot({path:path.join(out,`first-order-${language}.png`)});assert.deepEqual(errors,[]);
   return {initialScripts:initial.map(u=>new URL(u).pathname),storeURL:stores[0],catalogueURL:catalogs[0]};
  }finally{await context.close();}
 });
 await check('empty global drawer opens on a real tap',async()=>{const {context,page:p}=await setup();try{await menu(p);await p.locator('#robys-order-launcher').click();await p.locator('#robys-order-dialog').waitFor({state:'visible'});await p.keyboard.press('Escape');await p.locator('#robys-order-dialog').waitFor({state:'hidden'});}finally{await context.close();}});
 await check('failed model download does not write or add, reload recovers',async()=>{
  const {context,page:p}=await setup();try{
   await p.route('**/order-store.js*',route=>route.abort('failed'));await menu(p);await p.locator('[data-lang="en"]').click();await product(p);await p.locator('#menu-add-to-cart').click();
   await p.locator('#menu-cart-status').filter({hasText:'could not load'}).waitFor({state:'attached'});
   assert.equal(await p.evaluate(k=>sessionStorage.getItem(k),key),null);assert.equal(await p.locator('#menu-product-dialog').isVisible(),true);
   await p.unroute('**/order-store.js*');await menu(p);await product(p);await p.locator('#menu-add-to-cart').click();await p.locator('#menu-cart-count').filter({hasText:/^1$/}).waitFor({state:'attached'});
  }finally{await context.close();}
 });
 await check('cancel during slow first load does not add later',async()=>{
  const {context,page:p}=await setup();let release;const gate=new Promise(r=>release=r);try{
   await p.route('**/order-store.js*',async route=>{await gate;await route.continue();});await menu(p);await product(p);
   await p.locator('#menu-add-to-cart').click();await p.keyboard.press('Escape');release();await p.waitForLoadState('networkidle');
   assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'0');const stored=await p.evaluate(k=>JSON.parse(sessionStorage.getItem(k)),key);assert.equal(stored?.lines.length??0,0);
  }finally{release?.();await context.close();}
 });
 await check('blocked storage preserves in-memory first-order flow',async()=>{
  const {context,page:p}=await setup();try{
   await context.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Denied','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Denied','SecurityError');};});
   await menu(p);await p.locator('[data-lang="en"]').click();await product(p);await p.locator('#menu-add-to-cart').click();
   await p.locator('#robys-order-trigger').filter({hasText:'110'}).waitFor({state:'visible'});await p.locator('#robys-order-trigger').click();await p.locator('.order-note').filter({hasText:'Storage is unavailable'}).waitFor({state:'visible'});
  }finally{await context.close();}
 });
 await check('unknown stored schema is preserved across lazy initialization',async()=>{
  const {context,page:p}=await setup(),raw=JSON.stringify({version:99,revision:1,lines:[{id:'hot-coffee:espresso',quantity:2}]});try{
   await context.addInitScript(({key,raw})=>{if(!sessionStorage.getItem('seed')){sessionStorage.setItem('seed','1');sessionStorage.setItem(key,raw);}},{key,raw});
   await menu(p);await product(p);await p.locator('#menu-add-to-cart').click();await p.locator('#menu-cart-count').filter({hasText:/^1$/}).waitFor({state:'attached'});
   assert.equal(await p.evaluate(k=>sessionStorage.getItem(k),key),raw);
  }finally{await context.close();}
 });
 report.passed=report.checks.length===8&&report.checks.every(c=>c.passed);assert.ok(report.passed,'Incomplete demand-loading run');
}catch(e){report.error=String(e.stack);process.exitCode=1;}
finally{await browser?.close();server.kill();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
