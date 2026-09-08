/** Diagnostic-only fixed series for the patched sampler. Uses the same live brand()
 * call as MOTION-ENTRY-001. Cadence failures are retained in the report and do
 * not become passes. The ordinary Morning/Motion gates run separately afterward.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {chromium} from 'playwright';
import {contextFor,brand,assertBrand,done,timing,cadence} from './takeaway-browser-contract.mjs';

const root=process.cwd();
const out=resolve('.artifacts/pending-light-sampler/probe');mkdirSync(out,{recursive:true});
const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('outside root');const body=await readFile(file);const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2'}[extname(file)]??'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const rows=[];
try{
 for(let run=1;run<=24;run++){
  const row={run,status:'RUNNING',pageErrors:[]};rows.push(row);let browser,context,page;
  try{
   browser=await chromium.launch({headless:true});row.browser=browser.version();context=await contextFor(browser);
   await context.addInitScript(()=>{
    const d=globalThis.__pendingLightDiag={longFrames:[],longTasks:[],observerErrors:[]};
    for(const [type,key] of [['long-animation-frame','longFrames'],['longtask','longTasks']]){try{if(!PerformanceObserver.supportedEntryTypes.includes(type))throw Error(type+' unsupported');new PerformanceObserver(list=>d[key].push(...list.getEntries().map(e=>e.toJSON()))).observe({type,buffered:true});}catch(e){d.observerErrors.push(String(e));}}
   });
   page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
   await page.goto(`${origin}/?entry=morning`,{waitUntil:'domcontentloaded',timeout:15000});
   const appearance=await brand(page);assertBrand(appearance);row.brandStatus='PASS';
   const probe=await done(page);save(`run-${String(run).padStart(2,'0')}-probe.json`,probe);
   try{row.timing=timing(probe,'cold','morning');row.timingStatus='PASS';}catch(e){row.timingStatus='FAIL';row.timingError=String(e);}
   const entrance=probe.frames.filter(f=>f.state==='brand-frame');
   const first=entrance.find(f=>f.sampledStyle!==false&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);
   const brandAt=probe.events.find(e=>e.state==='brand-frame')?.at;row.startupMs=first&&Number.isFinite(brandAt)?first.at-brandAt:null;
   row.pendingUnsampled=entrance.filter(f=>f.sampledStyle===false).length;
   row.visibleSampled=entrance.filter(f=>f.sampledStyle!==false&&f.entrancePending===false&&f.entranceTime>0&&Number.isFinite(f.opacity)).length;
   row.pendingFramesWithStyle=entrance.filter(f=>f.entrancePending!==false&&f.sampledStyle!==false).length;
   try{const c=cadence(probe);row.cadenceStatus='PASS';row.cadence={startupMs:c.startupMs,medianFrameIntervalMs:c.medianFrameIntervalMs,uniqueTransforms:c.uniqueTransforms};}catch(e){row.cadenceStatus='FAIL';row.cadenceError=String(e);}
   row.diagnostics=await page.evaluate(()=>globalThis.__pendingLightDiag);row.startupLongFrames=(row.diagnostics.longFrames??[]).filter(f=>Number.isFinite(brandAt)&&f.startTime+f.duration>=brandAt&&(!first||f.startTime<=first.at));
   row.forcedStyleAndLayoutMs=row.startupLongFrames.flatMap(f=>f.scripts??[]).reduce((sum,s)=>sum+Number(s.forcedStyleAndLayoutDuration??0),0);
   row.scriptAttribution=row.startupLongFrames.flatMap(f=>f.scripts??[]).map(s=>({sourceURL:s.sourceURL,sourceFunctionName:s.sourceFunctionName,duration:s.duration,forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration,startTime:s.startTime})).sort((a,b)=>(b.duration??0)-(a.duration??0)).slice(0,10);
   row.status='CAPTURED';
  }catch(e){row.status='CAPTURE_ERROR';row.error=String(e.stack??e);}
  finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});save('matrix.json',rows);console.log(JSON.stringify({run,startupMs:row.startupMs,cadence:row.cadenceStatus,pendingUnsampled:row.pendingUnsampled,pendingFramesWithStyle:row.pendingFramesWithStyle,forcedStyleAndLayoutMs:row.forcedStyleAndLayoutMs,status:row.status}));}
 }
}finally{await new Promise(r=>server.close(r));}
const captured=rows.filter(r=>r.status==='CAPTURED'),failed=rows.filter(r=>r.cadenceStatus==='FAIL');
save('summary.json',{planned:24,captured:captured.length,captureErrors:24-captured.length,cadencePass:rows.filter(r=>r.cadenceStatus==='PASS').length,cadenceFail:failed.length,startupMs:captured.map(r=>r.startupMs),maxStartupMs:Math.max(...captured.map(r=>Number(r.startupMs)).filter(Number.isFinite)),pendingUnsampled:captured.map(r=>r.pendingUnsampled),pendingFramesWithStyle:captured.map(r=>r.pendingFramesWithStyle),failedRuns:failed.map(r=>({run:r.run,startupMs:r.startupMs,forcedStyleAndLayoutMs:r.forcedStyleAndLayoutMs,scriptAttribution:r.scriptAttribution})),releaseAuthorization:false,note:'Diagnostic only. Existing 372/208/151/150.5ms failures remain historical evidence; ordinary release gates run separately.'});
if(captured.length!==24||rows.some(r=>r.pageErrors.length)||captured.some(r=>r.pendingFramesWithStyle!==0)||captured.some(r=>r.visibleSampled<24))process.exitCode=1;
