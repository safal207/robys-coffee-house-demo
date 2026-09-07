/** Production menu + canonical order integration. No Telegram message is sent.
 * Only the denial/delay clipboard controls below replace browser behavior.
 * Visual regression and Lighthouse remain independent required gates.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root=process.cwd();
const out=resolve(process.env.ORDER_SHARE_RESULTS_DIR??'.artifacts/order-share');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(root+sep))throw new Error('Outside static root');
    const body=await readFile(path);
    const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.mp4':'video/mp4'}[extname(path)]??'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const files=['src/order-share.ts','src/order-shell.ts','order-shell.js','order-shell.css','order-store.js','menu-app.js','menu.html','smart-choice/app-v2.js'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={baseHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  scope:'Actual production menu/catalog and shared order, real UI clicks and enforced CSP. Real clipboard success; denial/delay explicitly mocked. No actual Telegram navigation, cafe receipt, payment, native WebView or conversion claim.',
  files:Object.fromEntries(files.map(f=>[f,hash(readFileSync(f))])),servedFiles:{},cases:[],pageErrors:[],telegramRequests:[]};
let browser,context,page;
const share=()=>page.locator('.order-sharing');
const toggle=()=>page.locator('.order-sharing > summary');
const preview=()=>page.locator('.order-share-preview');
const copy=()=>page.locator('.order-share-actions button');
const telegram=()=>page.locator('.order-share-actions a');
const status=()=>page.locator('.order-sharing .order-status');
const canonical=()=>page.evaluate(()=>sessionStorage.getItem('robys:coffee-house:order.v2'));
async function fresh(language='ru',width=390){
  await context?.close();
  context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',serviceWorkers:'block',bypassCSP:false});
  page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).hostname==='t.me')report.telegramRequests.push(r.url());});
  await page.goto(`${origin}/menu.html?entry=off`);
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  await page.locator(`.lang-button[data-lang="${language}"]`).click();
}
async function addProduct(id,quantity=1){
  await page.locator(`[data-category="${id.split(':')[0]}"]`).click();
  await page.locator(`[data-product-id="${id}"] .full-menu-item-media`).click();
  for(let i=1;i<quantity;i++)await page.locator('#menu-quantity-increase').click();
  await page.locator('#menu-add-to-cart').click();
  await page.locator('#menu-product-dialog').waitFor({state:'hidden'});
}
async function order(){await page.locator('#menu-cart-trigger').click();await page.locator('#robys-order-dialog').waitFor({state:'visible'});}
async function openShare(){assert.equal(await share().evaluate(n=>n.open),false);await toggle().click();assert(await preview().isVisible());}
async function settledStatus(fragment){await page.waitForFunction(fragment=>document.querySelector('.order-sharing .order-status').textContent.includes(fragment),fragment);}
async function scenario(name,fn){
  const result={name,status:'RUNNING'};report.cases.push(result);
  try{await fn();result.status='PASS';}
  catch(e){result.status='FAIL';result.error=String(e.stack);await page?.screenshot({path:resolve(out,`failure-${report.cases.length}.png`)}).catch(()=>{});}
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`${result.status} ${name}`);
}
try{
  browser=await chromium.launch({headless:true});report.browser=browser.version();report.playwright=JSON.parse(readFileSync('node_modules/playwright/package.json','utf8')).version;
  for(const f of files.filter(f=>!f.startsWith('src/'))){const response=await fetch(`${origin}/${f}`);assert(response.ok);const digest=hash(Buffer.from(await response.arrayBuffer()));assert.equal(digest,report.files[f]);report.servedFiles[f]=digest;}
  for(const language of ['tr','en','ru'])for(const width of [320,390,768,1440]){
    await scenario(`menu:${language}:${width}: three lattes plus macaron`,async()=>{
      await fresh(language,width);await addProduct('cold-coffee:iced-caffe-latte',3);await addProduct('desserts:macaron');await order();
      assert.match(await page.locator('.order-total').innerText(),/570/);const before=await canonical();assert(before);
      await openShare();const value=await preview().inputValue();assert.match(value,/3 × /);assert.match(value,/1 × /);assert.match(value,/570/);
      const url=new URL(await telegram().getAttribute('href'));assert.equal(url.origin+url.pathname,'https://t.me/share/url');assert.equal(value,`${url.searchParams.get('text')}\n\n${url.searchParams.get('url')}`);
      assert.equal(url.searchParams.get('url'),`${origin}/menu.html`);assert.equal(await telegram().getAttribute('rel'),'noopener noreferrer');assert.equal(await preview().getAttribute('readonly'),'');
      const geometry=await page.locator('#robys-order-dialog').evaluate(d=>({doc:document.documentElement.scrollWidth,width:innerWidth,client:d.clientWidth,scroll:d.scrollWidth}));assert(geometry.doc<=geometry.width+1,JSON.stringify(geometry));assert(geometry.scroll<=geometry.client+1,JSON.stringify(geometry));
      for(const node of [toggle(),copy(),telegram()]){const b=await node.boundingBox();assert(b.height>=44,JSON.stringify(b));assert(b.x>=0&&b.x+b.width<=width+1,JSON.stringify(b));}
      assert.equal(await canonical(),before,'Sharing render must not mutate the canonical order');
      if(width===390){await share().scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`menu-${language}-390-share.png`)});}
      await page.locator('#robys-order-handoff').click();assert.equal(await toggle().isVisible(),false);assert.match(await page.locator('.order-total').innerText(),/570/);
      if(language==='ru'&&width===390)await page.screenshot({path:resolve(out,'menu-ru-390-barista.png')});
      await page.locator('#robys-order-edit').click();assert(await toggle().isVisible());assert.equal(await share().evaluate(n=>n.open),false);
      await page.keyboard.press('Escape');await page.reload();await order();assert.match(await page.locator('.order-total').innerText(),/570/);
    });
  }
  for(const language of ['tr','en','ru'])await scenario(`text-size:${language}:320px:200-percent-root-font`,async()=>{
    await fresh(language,320);await addProduct('cold-coffee:iced-caffe-latte');await order();
    await page.evaluate(()=>document.documentElement.style.fontSize='32px');await openShare();
    const dimensions=await page.locator('#robys-order-dialog').evaluate(d=>({width:d.clientWidth,scroll:d.scrollWidth}));assert(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));
    for(const node of [toggle(),copy(),telegram()]){const box=await node.boundingBox();assert(box.x>=0&&box.x+box.width<=321);}
    await copy().scrollIntoViewIfNeeded();if(language==='ru')await page.screenshot({path:resolve(out,'menu-ru-320-large-text.png')});
  });
  await scenario('clipboard: actual browser write and read equals preview; no order mutation',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte',3);await order();await openShare();await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const before=await canonical(),value=await preview().inputValue();await copy().click();await settledStatus('скопирован');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),value);assert.equal(await canonical(),before);
  });
  await scenario('clipboard: mocked denial selects complete visible fallback',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte');await order();await openShare();
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied for negative control'))}}));
    await copy().click();await settledStatus('недоступно');assert.equal(await page.evaluate(()=>document.activeElement.className),'order-share-preview');assert(await preview().evaluate(t=>t.selectionStart===0&&t.selectionEnd===t.value.length));
  });
  await scenario('clipboard: mocked delayed success cannot acknowledge a changed order',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte');await order();await openShare();
    await page.evaluate(()=>{window.copyCalls=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.copyCalls.push(text);return new Promise(resolve=>window.finishCopy=resolve);}}});});
    await copy().click();assert(await copy().isDisabled());await page.evaluate(()=>document.querySelector('.order-share-actions button').click());
    await page.locator('.order-line .order-step').last().click();await page.evaluate(()=>window.finishCopy());await settledStatus('изменился');assert.equal(await page.evaluate(()=>window.copyCalls.length),1);assert.match(await preview().inputValue(),/360/);
  });
  await scenario('keyboard: collapsed/open disclosure, focus wrap and Escape return',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte');await order();await toggle().focus();await page.keyboard.press('Enter');assert(await preview().isVisible());
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'order-share-preview');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'A');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('.order-share-actions')!==null),true);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'order-close');
    await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('.order-share-actions')!==null),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#robys-order-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-cart-trigger');
  });
  await scenario('empty order clears sharing and offers a usable menu path',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte');await order();await openShare();await page.locator('.order-line .order-remove').click();assert.equal(await toggle().isVisible(),false);assert.equal(await preview().inputValue(),'');assert.equal(await telegram().getAttribute('href'),null);assert.equal(await page.locator('.order-empty-actions a').count(),2);
  });
  await scenario('Telegram intent records current selection without navigating or claiming receipt',async()=>{
    await fresh();await addProduct('cold-coffee:iced-caffe-latte');await order();await openShare();const before=await canonical();
    await page.evaluate(()=>document.querySelector('.order-share-actions a').addEventListener('click',e=>{window.checkedTelegramHref=e.currentTarget.href;e.preventDefault();}));
    await telegram().click();await settledStatus('не подтверждено');assert.match(new URL(await page.evaluate(()=>window.checkedTelegramHref)).searchParams.get('text'),/180/);assert.equal(await canonical(),before);
  });
  await scenario('no uncaught browser errors or automatic Telegram requests',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.telegramRequests,[]);});
} catch(e){report.environmentError=String(e.stack);}
finally{
  await context?.close();await browser?.close();await new Promise(r=>server.close(r));
  report.passed=report.cases.filter(c=>c.status==='PASS').length;report.failed=report.cases.filter(c=>c.status==='FAIL').length;
  report.status=report.environmentError||report.failed?'FAIL':'PASS';
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,passed:report.passed,failed:report.failed,browser:report.browser}));
  if(report.status!=='PASS')process.exitCode=1;
}
