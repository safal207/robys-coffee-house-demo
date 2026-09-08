/** Real page, catalog and CSS. Geometry wrappers record calls but return native
 * values. Only explicitly named failure cases abort the entry module/image.
 * No Telegram requests or orders are sent. Timing certification stays separate.
 */
import path from 'node:path';
import {certify,contextFor,brand,assertBrand,done,assert,save} from './takeaway-browser-contract.mjs';
const resultsDir=path.resolve(process.env.DOCK_ENTRY_RESULTS_DIR??'.artifacts/dock-entry');
await certify({port:4198,resultsDir,contract:'DOCK-ENTRY-001'},async({browser,baseUrl})=>{
 const cases=[];
 for(const spec of [{name:'entry-tr',language:'tr'},{name:'entry-en',language:'en'},{name:'entry-ru',language:'ru'},
  {name:'entry-off',language:'ru',off:true},{name:'reduced-motion',language:'ru',reduce:true},
  {name:'module-failure',language:'ru',fail:'module'},{name:'image-failure',language:'ru',fail:'image'}]){
  const result={name:spec.name,status:'RUNNING'};cases.push(result);
  const context=await contextFor(browser,{language:spec.language,reducedMotion:spec.reduce?'reduce':'no-preference'});
  let page;
  try{
   await context.addInitScript(()=>{
    globalThis.__dockReads=[];
    const record=(node,kind)=>{if(node?.classList?.contains('order-bar'))globalThis.__dockReads.push({kind,pending:Boolean(document.documentElement.dataset.robysEntryPending),state:document.documentElement.dataset.robysEntryState??null,at:performance.now()});};
    const rect=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(...args){record(this,'rect');return rect.apply(this,args);};
    const style=window.getComputedStyle;
    window.getComputedStyle=function(node,...args){record(node,'style');return style.call(this,node,...args);};
   });
   page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(spec.fail==='module')await page.route('**/takeaway-entry.js*',r=>r.abort());
   if(spec.fail==='image')await page.route('**/src/brand/robys-takeaway-cup-v1.webp',r=>r.abort());
   await page.goto(`${baseUrl}?entry=${spec.off?'off':'morning'}`,{waitUntil:'domcontentloaded'});
   if(!spec.off&&!spec.reduce&&!spec.fail){const appearance=await brand(page);assertBrand(appearance,spec.language);await done(page);}
   else await page.waitForFunction(()=>!document.documentElement.dataset.robysEntryPending);
   await page.waitForFunction(()=>Number.parseFloat(document.documentElement.style.getPropertyValue('--robys-order-page-clearance'))>0);
   result.reads=await page.evaluate(()=>globalThis.__dockReads);
   const covered=result.reads.filter(r=>r.pending&&!['handoff','done'].includes(r.state));
   assert(covered.length===0,`Order dock performed ${covered.length} geometry/style reads behind the loading/brand frame`);
   assert(result.reads.some(r=>!r.pending||r.state==='handoff'||r.state==='done'),'Dock never resumed');
   result.geometry=await page.locator('.order-bar').evaluate(bar=>{
    const b=bar.getBoundingClientRect();
    return{bar:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height},width:innerWidth,documentWidth:document.documentElement.scrollWidth,
     obstacles:[...document.querySelectorAll('.mobile-cta,.mobile-quickbar')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{left:r.left,right:r.right,top:r.top,height:r.height,position:s.position,display:s.display,visibility:s.visibility,pointerEvents:s.pointerEvents};})};
   });
   const g=result.geometry;
   assert(g.bar.left>=-1&&g.bar.right<=g.width+1&&g.documentWidth<=g.width+1,'Dock/page overflow');
   for(const o of g.obstacles)if(o.position==='fixed'&&o.display!=='none'&&o.visibility!=='hidden'&&o.pointerEvents!=='none'&&o.height>0&&o.right>g.bar.left&&o.left<g.bar.right)assert(g.bar.bottom<=o.top-11,'Visible action lane overlaps the order dock');
   assert(errors.length===0,`Page errors: ${errors.join(';')}`);
   if(spec.name==='entry-ru')await page.screenshot({path:path.join(resultsDir,'ru-dock-after-entry.png')});
   result.status='PASS';
  }catch(e){result.status='FAIL';result.error=String(e.stack);if(page)await page.screenshot({path:path.join(resultsDir,`${spec.name}-failure.png`)}).catch(()=>{});}
  finally{await context.close();save(resultsDir,'cases.json',cases);console.log(`${result.status} ${spec.name}`);}
 }
 assert(cases.length===7&&cases.every(c=>c.status==='PASS'),'One or more dock/entry cases failed');
});
