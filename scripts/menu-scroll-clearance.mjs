import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

const out='.artifacts/menu-scroll-clearance';
mkdirSync(out,{recursive:true});
const base='http://127.0.0.1:4196/';
const server=spawn('python3',['-m','http.server','4196','--bind','127.0.0.1'],{stdio:'ignore'});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  boundary:'Actual Chromium navigation and original CSP; desktop/mobile input emulation, not a physical-device FPS claim',cases:[],negativeControl:null};
let browser;
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function clearance(page,selector){
  return page.locator(selector).first().evaluate(element=>{
    const bounds=element.getBoundingClientRect();
    const pinnedBottom=Math.max(0,...['.site-header','.menu-controls'].map(selector=>{
      const el=document.querySelector(selector);
      return el&&['sticky','fixed'].includes(getComputedStyle(el).position)?el.getBoundingClientRect().bottom:0;
    }));
    const x=bounds.left+Math.min(14,bounds.width/2),y=bounds.top+Math.min(4,bounds.height/2);
    const hit=y>=0&&y<innerHeight?document.elementFromPoint(x,y):null;
    return {top:bounds.top,bottom:bounds.bottom,pinnedBottom,
      visible:!!hit&&(hit===element||element.contains(hit)),
      clear:bounds.top>=pinnedBottom-1&&bounds.top<innerHeight-8,
      hit:hit?.className??null,scrollY,padding:getComputedStyle(document.documentElement).scrollPaddingTop};
  });
}
try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  for(const width of [320,390,768,1440])for(const touch of [false,true])for(const fontSize of [16,32])for(const language of ['tr','en','ru']){
    const id=`${width}-${touch?'touch':'fine'}-${fontSize}-${language}`;
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:touch,isMobile:touch,reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const result={id,width,touch,fontSize,language,passed:false};
    try{
      await page.goto(base+'menu.html?entry=off',{waitUntil:'networkidle'});
      await page.locator(`[data-lang="${language}"]`).click();
      await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',fontSize);
      await page.evaluate(()=>document.fonts.ready);await settle(page);
      await page.locator('[data-category="hot-coffee"]').click();await settle(page);
      result.category=await clearance(page,'.full-menu-panel-header');
      assert.ok(result.category.clear&&result.category.visible,`${id}: category covered ${JSON.stringify(result.category)}`);
      assert.equal(await page.locator('[data-category="hot-coffee"]').getAttribute('aria-pressed'),'true');
      if(width===320&&!touch&&fontSize===16&&language==='tr'){
        await page.evaluate(()=>{
          document.documentElement.style.scrollPaddingTop='0px';
          document.querySelector('.full-menu-wrap').style.scrollMarginTop='170px';
        });
        await page.locator('[data-category="hot-coffee"]').click();await settle(page);
        const broken=await clearance(page,'.full-menu-panel-header');
        assert.ok(!broken.clear||!broken.visible,'Negative control must catch the original fixed-offset overlap');
        report.negativeControl={id:'original-fixed-offset',caught:true,evidence:broken};
        await page.evaluate(()=>{
          document.documentElement.style.removeProperty('scroll-padding-top');
          document.querySelector('.full-menu-wrap').style.removeProperty('scroll-margin-top');
        });
        await page.locator('[data-category="hot-coffee"]').click();await settle(page);
        const restored=await clearance(page,'.full-menu-panel-header');
        assert.ok(restored.clear&&restored.visible,'Restoring measured insets must restore clearance');
      }
      if(width<=390&&language==='tr')await page.screenshot({path:`${out}/category-${id}.png`});
      await page.locator('.menu-share-card').scrollIntoViewIfNeeded();await settle(page);
      result.automaticShareCapture=await clearance(page,'.menu-share-copy .eyebrow');
      // A tall component may not fit below a toolbar. Explicit focus/anchor
      // scrolling must still expose its heading; do not mask sticky controls.
      await page.locator('.menu-share-copy h2').evaluate(el=>el.scrollIntoView({block:'start'}));await settle(page);
      result.shareHeading=await clearance(page,'.menu-share-copy h2');
      assert.ok(result.shareHeading.clear&&result.shareHeading.visible,`${id}: share heading covered`);
      if(width<=390&&language==='tr')await page.screenshot({path:`${out}/share-${id}.png`});
      assert.deepEqual(errors,[],`${id}: page errors`);
      result.passed=true;
    }catch(error){result.error=error.stack;await page.screenshot({path:`${out}/failure-${id}.png`}).catch(()=>{});}
    report.cases.push(result);console.log(`${result.passed?'PASS':'FAIL'} ${id}`);
    await context.close();
  }
}finally{
  if(browser)await browser.close();server.kill();
  report.passed=report.cases.length===48&&report.cases.every(row=>row.passed)&&report.negativeControl?.caught===true;
  writeFileSync(out+'/summary.json',JSON.stringify(report,null,2)+'\n');
}
assert.ok(report.passed,`Scroll clearance failed: ${report.cases.filter(row=>!row.passed).map(row=>row.id).join(', ')}`);
console.log('SCROLL-CLEARANCE: 48 input/viewport/language/text-size cases and one detected negative control PASS');
