import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const out=process.env.ORDER_LAYOUT_RESULTS_DIR??'.artifacts/order-layout';mkdirSync(out,{recursive:true});
const port=4199,base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases:[],passed:false,boundary:'Browser geometry and real input, not a physical-device test; no forced clicks or hidden overlays.'};
let browser;
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,1440])for(const rootSize of [16,32])for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<700,hasTouch:width<700,reducedMotion,bypassCSP:false,serviceWorkers:'block'});
  const page=await context.newPage(),entry={width,rootSize,reducedMotion,passed:false};report.cases.push(entry);
  try{
   await page.goto(base+'smart-choice/#welcome',{waitUntil:'domcontentloaded'});
   await page.locator('[data-lang="ru"]').click();await page.locator('.primary-button').first().click();
   for(let i=0;i<5;i++){await page.locator('.option-button').first().click();await page.locator('.primary-button').click();}
   await page.locator('.result-card .primary-button').first().click();await page.locator('#smart-choice-add-order').click();
   await page.evaluate(async size=>{document.documentElement.style.fontSize=size+'px';await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},rootSize);
   entry.geometry=await page.evaluate(()=>{
    const node=document.getElementById('robys-order-trigger'),rect=node.getBoundingClientRect(),style=getComputedStyle(node);
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
    return {client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,innerWidth,scale:visualViewport?.scale,bar:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},position:style.position,zIndex:style.zIndex,hit:hit?.id||hit?.className,reachable:hit===node||node.contains(hit)};
   });
   assert.ok(entry.geometry.scroll<=entry.geometry.client+1,JSON.stringify(entry.geometry));
   assert.ok(entry.geometry.reachable,JSON.stringify(entry.geometry));
   const bar=page.locator('#robys-order-trigger');
   if(width<700)await bar.tap();else await bar.click();
   await page.locator('#robys-order-dialog').waitFor({state:'visible'});
   const dimensions=await page.locator('#robys-order-dialog').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));entry.dialog=dimensions;
   assert.ok(dimensions.scroll<=dimensions.client+1,JSON.stringify(dimensions));
   await page.keyboard.press('Escape');
   assert.equal(await bar.evaluate(node=>document.activeElement===node),true);
   if(rootSize===32)await page.screenshot({path:`${out}/selected-${width}-${reducedMotion}.png`});
   entry.passed=true;
  }catch(error){entry.error=String(error.stack);await page.screenshot({path:`${out}/failure-${width}-${rootSize}-${reducedMotion}.png`}).catch(()=>{});throw error;}
  finally{await context.close();}
 }
 report.passed=report.cases.length===12&&report.cases.every(entry=>entry.passed);
}catch(error){report.error=String(error.stack);process.exitCode=1;}
finally{await browser?.close();server.kill();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
