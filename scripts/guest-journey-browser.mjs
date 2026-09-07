import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const out=process.env.GUEST_JOURNEY_RESULTS_DIR??'.artifacts/guest-journey';mkdirSync(out,{recursive:true});
const port=4204,base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const report={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),passed:false,cases:[],files:Object.fromEntries(['order-store.js','order-shell.js','order-shell.css','menu-app.js','smart-choice/app-v2.js','smart-choice/cart-v2.js'].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),boundary:'CI Chromium, production catalog, real UI clicks, enforcing CSP. No physical device, POS submission, payment or customer-satisfaction claim.'};
let browser;
async function choose(page,language,quantity,budgetIndex=2){
 await page.goto(base+'smart-choice/#welcome');await page.locator(`[data-lang="${language}"]`).click();await page.locator('.smart-card .primary-button').click();
 for(const answer of [0,1,1,quantity-1,budgetIndex]){await page.locator('.option-button').nth(answer).click();await page.locator('.actions .primary-button').click();}
}
async function capture(page,path){
 await page.locator('#robys-order-dialog').evaluate(async dialog=>{
  await Promise.all(dialog.getAnimations({subtree:true}).filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));
  await Promise.all([...dialog.querySelectorAll('img')].map(image=>image.decode()));
 });
 await page.screenshot({path});
}
async function total(page,amount){await page.locator('.order-total').filter({hasText:String(amount)}).waitFor({state:'visible'});}
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Static preview readiness');
 browser=await chromium.launch({headless:true});
 for(const language of ['tr','en','ru'])for(const quantity of [2,3])for(const width of [320,390]){
  const c=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:width===320?'reduce':'no-preference',bypassCSP:false,serviceWorkers:'block'});
  const p=await c.newPage(),errors=[];p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push(error.message));
  const result={language,quantity,width,passed:false};report.cases.push(result);
  try{
   await choose(p,language,quantity);
   await p.locator('.result-card--top .component-list').filter({hasText:`${quantity} ×`}).waitFor({state:'visible'});
   await p.locator('.result-card--top .result-price').filter({hasText:String(quantity*180)}).waitFor({state:'visible'});
   await p.locator('.result-card--top .primary-button').click();await p.locator('#smart-choice-add-order').click();
   await p.locator('#robys-order-dialog').waitFor({state:'visible'});await total(p,quantity*180);
   await p.locator('.order-extra button').last().click();await total(p,quantity*180);
   assert.equal(await p.locator('.order-extra').isVisible(),false);
   await p.locator('#robys-order-handoff').click();
   await p.locator('.order-dialog--handoff .order-line strong').filter({hasText:`${quantity} ×`}).waitFor({state:'visible'});
   assert.equal(await p.locator('.order-controls:visible').count(),0);
   const geometry=await p.locator('#robys-order-dialog').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));assert.ok(geometry.scroll<=geometry.client+1);
   await capture(p,`${out}/${language}-${quantity}-${width}-barista.png`);
   await p.locator('#robys-order-edit').click();await p.keyboard.press('Escape');
   await p.locator('#smart-choice-add-order').click();await total(p,quantity*180); // A second press only reviews.
   await p.keyboard.press('Escape');await p.reload();await p.locator('#smart-choice-add-order').click();await total(p,quantity*180);
   await p.keyboard.press('Escape');await p.goto(base+'menu.html?entry=off');
   await p.locator('[data-product-id="hot-coffee:espresso"] .full-menu-item-media').click();await p.locator('#menu-add-to-cart').click();
   await p.locator('#menu-cart-trigger').click();await total(p,quantity*180+110); // Both entry buttons open the same order.
   assert.equal(await p.locator('.order-extra').isVisible(),false,'Declined offer must not return on another route');
   const espresso=p.locator('.order-line').filter({hasText:/Espresso|Эспрессо/});
   await espresso.locator('.order-step').last().click();await total(p,quantity*180+220);
   await espresso.locator('.order-remove').click();await total(p,quantity*180);await p.locator('#robys-order-undo').click();await total(p,quantity*180+220);
   await p.keyboard.press('Escape');await p.reload();await p.locator('#robys-order-trigger').click();await total(p,quantity*180+220);
   await p.locator('#robys-order-handoff').click();await capture(p,`${out}/${language}-${quantity}-${width}-complete-order.png`);
   await p.keyboard.press('Escape');await p.locator('[data-category="hot-coffee"]').click();await p.locator('#menu-search').fill('Macaron');
   await p.locator('[data-product-id="desserts:macaron"]').waitFor({state:'visible'});
   assert.equal(await p.locator('[data-category="all"]').getAttribute('aria-pressed'),'true');
   await p.locator('[data-category="hot-coffee"]').click();
   assert.equal(await p.locator('#menu-search').inputValue(),'');
   assert.equal(await p.locator('.menu-search-clear').isVisible(),false);
   assert.deepEqual(errors,[]);result.passed=true;
  }catch(error){result.error=String(error.stack);await p.screenshot({path:`${out}/${language}-${quantity}-${width}-failure.png`}).catch(()=>{});throw error;}finally{await c.close();}
 }
 // Escape during a deferred first drawer load cancels that intent, including a late import.
 for(const trigger of ['#menu-cart-trigger','#robys-order-launcher']) {
 const delayed=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),dp=await delayed.newPage();
 let releaseDrawer;const drawerGate=new Promise(resolve=>{releaseDrawer=resolve;});
 await dp.route('**/order-shell.js?*',async route=>{await drawerGate;await route.continue();});
 await dp.goto(base+'menu.html?entry=off');await dp.locator('#menu-root[data-ready="true"]').waitFor();
 await dp.locator(trigger).click();await dp.keyboard.press('Escape');releaseDrawer();
 await dp.locator('#robys-order-dialog').waitFor({state:'attached'});
 await dp.locator('#menu-cart-trigger[aria-busy]').waitFor({state:'hidden'});
 assert.equal(await dp.locator('#robys-order-dialog').isVisible(),false,'Cancelled order intent must not reopen later');
 await delayed.close();
 }
 // Honest no-match: a group cannot be squeezed into the budget by removing portions.
 const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await c.newPage();
 await choose(p,'ru',3,0);await p.locator('.no-match-card').waitFor({state:'visible'});
 assert.equal(await p.locator('.result-card').count(),0);await p.locator('.no-match-card .primary-button').click();await p.locator('#question-budgetKey').waitFor({state:'visible'});await c.close();
 report.passed=report.cases.length===12&&report.cases.every(c=>c.passed);
}catch(error){report.error=String(error.stack);process.exitCode=1;}
finally{await browser?.close();server.kill();writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
