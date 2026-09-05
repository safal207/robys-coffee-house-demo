import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
const baseline=process.argv.includes('--baseline');
const root=path.resolve(process.env.ORDER_SITE_DIR??process.cwd());
const out=path.resolve(process.env.ORDER_RESULTS_DIR??'.artifacts/order-v2/browser');
const port=Number(process.env.ORDER_TEST_PORT??4198),base=`http://127.0.0.1:${port}/`;
mkdirSync(out,{recursive:true});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),siteRoot:root,baseline,checks:[],failures:[],passed:false,boundary:'Headless Chromium against local static server; original CSP enforced. Source identifies checkout; file hashes identify tested working-tree bytes. Not a physical device or public deployment.',files:{}};
for(const file of ['order-store.js','order-shell.js','menu-app.js','smart-choice/app-v2.js','smart-choice/cart-v2.js']){
 try{report.files[file]=createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');}catch{if(!baseline)throw Error('Missing runtime '+file);}
}
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser;
async function check(name,fn){try{await fn();report.checks.push({name,passed:true});}catch(error){report.failures.push({name,error:String(error.stack)});throw error;}}
function launchContext(extra={}){return browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,bypassCSP:false,serviceWorkers:'block',...extra});}
async function choose(page,language='en'){
 await page.goto(base+'smart-choice/#welcome',{waitUntil:'domcontentloaded'});
 await page.locator(`[data-lang="${language}"]`).click();
 await page.locator('.primary-button').first().click();
 for(let step=0;step<5;step++){await page.locator('.option-button').first().click();await page.locator('.primary-button').click();}
 await page.locator('.result-card .primary-button').first().click();
 await page.locator('.selected-card').waitFor({state:'visible'});
}
async function menu(page){await page.goto(base+'menu.html?entry=off',{waitUntil:'domcontentloaded'});await page.locator('.full-menu-item--product').nth(49).waitFor({state:'attached'});}
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await sleep(100);}assert.ok(ready,'Static server did not start');
 browser=await chromium.launch({headless:true});
 if(baseline){
  const c=await launchContext(),p=await c.newPage();await choose(p);await menu(p);
  await check('original Smart Choice/menu handoff gap reproduced',async()=>{assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'0');});
  await p.goto(base+'smart-choice/#welcome',{waitUntil:'domcontentloaded'});
  await check('original explicit welcome mismatch reproduced',async()=>{await p.locator('.selected-card').waitFor({state:'visible'});assert.equal(await p.locator('.smart-title').count(),0);});
  await p.screenshot({path:path.join(out,'original-welcome-mismatch.png')});await c.close();
 }else{
  for(const language of ['tr','en','ru']){
   const c=await launchContext(),p=await c.newPage(),errors=[];p.on('pageerror',error=>errors.push(error.message));
   try{
    await check(language+' recommendation adds to shared order',async()=>{
     await choose(p,language);await p.locator('#smart-choice-add-order').click();
     await p.locator('#robys-order-trigger').filter({hasText:'200'}).waitFor({state:'visible'});
    });
    await check(language+' full menu preserves selection, then adds Espresso',async()=>{
     await menu(p);assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'1');
     await p.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();
     await p.locator('#menu-add-to-cart').click();
     assert.equal((await p.locator('#menu-cart-count').innerText()).trim(),'2');
     await p.locator('#robys-order-trigger').filter({hasText:'310'}).waitFor({state:'visible'});
    });
    await check(language+' reload, global quantity edits, removal and undo',async()=>{
     await p.reload({waitUntil:'domcontentloaded'});await p.locator('#robys-order-trigger').filter({hasText:'310'}).waitFor({state:'visible'});
     await p.locator('#robys-order-trigger').click();
     const row=p.locator('.order-line').filter({hasText:/Espresso|Эспрессо/});
     await row.locator('.order-step').last().click();
     await p.locator('.order-total').filter({hasText:'420'}).waitFor({state:'visible'});
     await row.locator('.order-remove').click();await p.locator('#robys-order-undo').click();
     await p.locator('.order-total').filter({hasText:'420'}).waitFor({state:'visible'});
     await p.screenshot({path:path.join(out,`shared-order-${language}-390.png`)});
     await p.keyboard.press('Escape');assert.equal(await p.locator('#robys-order-dialog').getAttribute('open'),null);
    });
    await check(language+' home/discover retain order and direct welcome remains welcome',async()=>{
     for(const route of ['index.html?entry=off','discover.html?entry=off']){await p.goto(base+route,{waitUntil:'domcontentloaded'});await p.locator('#robys-order-trigger').filter({hasText:'420'}).waitFor({state:'visible'});}
     await p.goto(base+'smart-choice/#welcome',{waitUntil:'domcontentloaded'});await p.locator('.smart-title').waitFor({state:'visible'});
     await p.locator('#robys-order-trigger').filter({hasText:'420'}).waitFor({state:'visible'});
    });
    await check(language+' no runtime errors',async()=>assert.deepEqual(errors,[]));
   }catch(error){await p.screenshot({path:path.join(out,`failure-${language}.png`)}).catch(()=>{});throw error;}
   finally{await c.close();}
  }
  await check('back and forward restore the correct question',async()=>{
   const c=await launchContext(),p=await c.newPage();await p.goto(base+'smart-choice/#welcome');
   await p.locator('[data-lang="en"]').click();await p.locator('.primary-button').first().click();
   await p.locator('.option-button').first().click();await p.locator('.primary-button').click();
   await p.locator('#question-temperature').waitFor({state:'visible'});await p.goBack();await p.locator('#question-intent').waitFor({state:'visible'});
   await p.goForward();await p.locator('#question-temperature').waitFor({state:'visible'});await p.reload();await p.locator('#question-temperature').waitFor({state:'visible'});await c.close();
  });
  await check('storage denial keeps flow and current-page basket usable',async()=>{
   const c=await launchContext();await c.addInitScript(()=>{for(const method of ['getItem','setItem','removeItem'])Storage.prototype[method]=()=>{throw new DOMException('Denied','SecurityError');};});
   const p=await c.newPage();await choose(p);await p.locator('#smart-choice-add-order').click();
   await p.locator('#robys-order-trigger').filter({hasText:'200'}).waitFor({state:'visible'});await p.locator('#robys-order-trigger').click();
   await p.locator('.order-note').filter({hasText:'Storage is unavailable'}).waitFor({state:'visible'});await c.close();
  });
  await check('malformed flow does not produce blank screen or invalid deep-link step',async()=>{
   const c=await launchContext();await c.addInitScript(()=>sessionStorage.setItem('robys-smart-choice-session.v1',JSON.stringify({version:1,screen:'results',questionIndex:90,answers:{intent:'missing'},locale:'en'})));
   const p=await c.newPage();await p.goto(base+'smart-choice/#step-5');await p.locator('#question-intent').waitFor({state:'visible'});await c.close();
  });
  await check('legacy conflict requires consent and is not reimported after reload',async()=>{
   const c=await launchContext();await c.addInitScript(()=>{
    if(sessionStorage.getItem('fixture-ready'))return;sessionStorage.setItem('fixture-ready','1');
    sessionStorage.setItem('robys-menu-order.v1',JSON.stringify({version:1,lines:[{id:'hot-coffee:espresso',quantity:2}]}));
    sessionStorage.setItem('robys-smart-choice-cart.v1',JSON.stringify({version:1,candidateId:'single-hot-coffee--caramel-latte',catalogVersion:'smart-choice-catalog.v0.2.0',substitutionIds:[],upgradeIds:[],bumpDecision:'ineligible'}));
   });
   const p=await c.newPage();await menu(p);await p.locator('[data-lang="en"]').click();await p.locator('#robys-order-trigger').click();
   await p.locator('.order-total').filter({hasText:'220'}).waitFor({state:'visible'});await p.locator('.order-migration button').filter({hasText:'Add previous selection'}).click();
   await p.locator('.order-total').filter({hasText:'420'}).waitFor({state:'visible'});await p.reload();
   await p.locator('#robys-order-trigger').filter({hasText:'420'}).waitFor({state:'visible'});await p.locator('#robys-order-trigger').click();
   assert.equal(await p.locator('.order-migration').isVisible(),false);await c.close();
  });
  await check('320px large text and desktop order layout do not overflow',async()=>{
   for(const width of [320,1440]){
    const c=await launchContext({viewport:{width,height:900},isMobile:width===320,hasTouch:width===320,reducedMotion:'reduce'});const p=await c.newPage();await choose(p,'ru');await p.locator('#smart-choice-add-order').click();
    await p.evaluate(()=>{document.documentElement.style.fontSize='32px';});await p.locator('#robys-order-trigger').click();
    const dimensions=await p.locator('#robys-order-dialog').evaluate(node=>({scroll:node.scrollWidth,client:node.clientWidth}));assert.ok(dimensions.scroll<=dimensions.client+1,JSON.stringify(dimensions));
    await p.screenshot({path:path.join(out,`shared-order-${width}-large-text.png`)});await c.close();
   }
  });
 }
 report.passed=report.failures.length===0;
}catch(error){report.error=String(error.stack);process.exitCode=1;}
finally{await browser?.close();server.kill();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
