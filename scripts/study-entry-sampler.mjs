/** Diagnostic factorial study; not a replacement for release certification.
 * Run the copied file from .artifacts/sampler-study/ in the pinned checkout.
 * Rich uses the unchanged production contract's sampler. Clock/events ablations
 * cannot certify visual startup: a rAF timestamp is NOT a painted-frame receipt.
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
export const HEAD='0611ca0caa5d39f769fd0916bca65f037886aa56';
export const CONTRACT_SHA256='a115811b06fd1c1394ea5a703d5403344b92cd5fd312e2747a01c0d264836ca3';
export const CONDITIONS=['rich/plain','clock/plain','events/plain','rich/trace','clock/trace','events/trace'];
export function plan(){
  // Balanced six-condition Williams design: every position and first-order
  // predecessor occurs equally often. Fixed in advance, not random allocation.
  const first=[0,1,5,2,4,3];
  return Array.from({length:6},(_,block)=>first.map((v,position)=>{
    const condition=CONDITIONS[(v+block)%6], [sampler,tracing]=condition.split('/');
    return {block:block+1,position:position+1,condition,sampler,traced:tracing==='trace',label:`b${block+1}-p${position+1}-${sampler}-${tracing}`};
  })).flat();
}
export function stats(values){
  const xs=values.filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b);
  if(!xs.length)return {n:0,median:null,min:null,max:null};
  const m=Math.floor(xs.length/2);
  return {n:xs.length,median:xs.length%2?xs[m]:(xs[m-1]+xs[m])/2,min:xs[0],max:xs.at(-1)};
}
export function validateRows(rows){
  const expected=plan();
  if(rows.length!==expected.length)throw new Error('Incomplete fixed study');
  for(let i=0;i<expected.length;i++){
    for(const k of ['label','condition','sampler','traced','block','position'])if(rows[i][k]!==expected[i][k])throw new Error(`Plan mismatch ${i}:${k}`);
    if(rows[i].captureError||rows[i].traceError)throw new Error(`Capture incomplete: ${rows[i].label}`);
    if(!['PASS','FAIL'].includes(rows[i].releaseStatus)||!['PASS','FAIL'].includes(rows[i].timingStatus))throw new Error('Unmeasured lifecycle gate');
    if(rows[i].sampler==='rich'&&!['PASS','FAIL'].includes(rows[i].cadenceStatus))throw new Error('Unmeasured rich cadence');
    if(rows[i].traced&&!rows[i].traceSha256)throw new Error(`Missing trace: ${rows[i].label}`);
    if(rows[i].sampler!=='rich'&&rows[i].cadenceStatus!=='NOT_MEASURED')throw new Error('Ablation cannot certify visual cadence');
  }
  return true;
}
export function summarize(rows){
  let validationError=null;try{validateRows(rows);}catch(e){validationError=e.message;}
  return {studyOnly:true,releaseCertified:false,captureComplete:validationError===null,validationError,
    groups:Object.fromEntries(CONDITIONS.map(condition=>{
      const group=rows.filter(r=>r.condition===condition);
      return [condition,{n:group.length,releaseFailures:group.filter(r=>r.releaseStatus!=='PASS').length,
        timingFailures:group.filter(r=>r.timingStatus!=='PASS').length,
        cadence:condition.startsWith('rich/')?{passed:group.filter(r=>r.cadenceStatus==='PASS').length,failed:group.filter(r=>r.cadenceStatus==='FAIL').length,startupMs:stats(group.map(r=>r.startupMs))}:{status:'NOT_MEASURED'},
        brandToHandoffMs:stats(group.map(r=>r.brandToHandoffMs)),
        loafReportedForcedMs:stats(group.map(r=>r.loafReportedForcedMs)),
        samplerLoafReportedForcedMs:stats(group.map(r=>r.samplerLoafReportedForcedMs))}];
    }))};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function main(){
  const {chromium}=await import('playwright');
  const contract=await import(pathToFileURL(resolve('scripts/takeaway-browser-contract.mjs')).href);
  const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==HEAD)throw new Error('Unexpected product HEAD');
  if(sha(readFileSync('scripts/takeaway-browser-contract.mjs'))!==CONTRACT_SHA256)throw new Error('Changed original sampler/gates');
  const out=resolve('.artifacts/sampler-study');mkdirSync(out,{recursive:true});
  const save=(name,data)=>writeFileSync(join(out,name),JSON.stringify(data,null,2)+'\n');
  const paths=['scripts/takeaway-browser-contract.mjs','scripts/morning-entry-smoke.mjs','takeaway-entry.js','bootstrap-v2.js','styles-v2.css','src/order-dock.ts','order-launcher.js','index.html','integrity-manifest.json','lighthouse/budgets.json','lighthouse/baseline.json'];
  const before=Object.fromEntries(paths.map(p=>[p,sha(readFileSync(p))]));
  const report={productHead:HEAD,productTree:git('rev-parse','HEAD^{tree}'),protectedHashes:before,
    runnerSha256:sha(readFileSync(new URL(import.meta.url))),plan:plan(),cases:[],
    scope:'Fixed 36 cold browser processes, six-condition balanced order. Same product bytes; no retries or best-run selection. Original rich sampler vs clock-only rAF vs events-only, each with/without Chrome tracing. Common Long Animation Frame observers store entries without serializing during animation. No live DOM inspections by the harness until 3000 ms after DOMContentLoaded. Only rich measures original visual cadence; clock timestamps and lifecycle completion are not painted-frame evidence. LoAF reports only long-frame attribution, not total layout cost. No numeric subtraction from historical failures or release authorization.'};
  save('plan.json',report.plan);save('report.json',report);
  const port=4199,origin=`http://127.0.0.1:${port}`;
  const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
  let serverLog='',serverError;
  server.stderr.on('data',b=>serverLog=(serverLog+b.toString()).slice(-32000));server.on('error',e=>serverError=e);
  try{
    let ready=false;for(let i=0;i<40;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw new Error('Server exited');try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await sleep(100);}if(!ready)throw new Error('Server unavailable');
    for(const spec of report.plan){
      const r={...spec,releaseStatus:'NOT_RUN',timingStatus:'NOT_RUN',cadenceStatus:spec.sampler==='rich'?'NOT_RUN':'NOT_MEASURED',pageErrors:[]};report.cases.push(r);
      let browser,context,page,cdp,recording=false;
      try{
        browser=await chromium.launch({headless:true});r.browser=browser.version();
        context=spec.sampler==='rich'?await contract.contextFor(browser):await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:'no-preference',serviceWorkers:'block'});
        await context.addInitScript(({sampler})=>{
          try{localStorage.setItem('robys-language','tr');}catch{}
          const d=globalThis.__samplerStudy={events:[],clock:[],longFrames:[],observerErrors:[]};let sampling=false,finished=false;
          window.addEventListener('robys:entry-state',e=>{
            d.events.push({...e.detail,at:performance.now()});performance.mark('study:'+e.detail.state);
            if(e.detail.state==='done')finished=true;
            if(sampler!=='clock'||e.detail.state!=='brand-frame'||sampling)return;
            sampling=true;
            const frameClock=at=>{d.clock.push({at,callbackAt:performance.now()});if(!finished&&d.clock.length<240)requestAnimationFrame(frameClock);};
            requestAnimationFrame(frameClock);
          });
          try{if(!PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))throw new Error('LoAF unavailable');const o=new PerformanceObserver(list=>d.longFrames.push(...list.getEntries()));o.observe({type:'long-animation-frame',buffered:true});d.observer=o;}catch(e){d.observerErrors.push(String(e));}
        },{sampler:spec.sampler});
        page=await context.newPage();page.on('pageerror',e=>r.pageErrors.push(e.message));
        if(spec.traced){cdp=await context.newCDPSession(page);await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,loading,cc,benchmark,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream',options:'sampling-frequency=1000'});recording=true;}
        await page.goto(`${origin}/?entry=morning`,{waitUntil:'domcontentloaded',timeout:15000});
        // Host timer only: no polling, computed-style queries, screenshots, or
        // animation geometry inspection from the driver during the measured phase.
        await sleep(3000);
        const captured=await page.evaluate(()=>{
          const d=globalThis.__samplerStudy;if(!d)throw new Error('Missing study observer');
          if(d.observer){d.longFrames.push(...d.observer.takeRecords());d.observer.disconnect();}
          return {events:d.events,clock:d.clock,longFrames:d.longFrames.map(e=>e.toJSON()),observerErrors:d.observerErrors,
            probe:globalThis.__takeawayProbe??null,timeOrigin:performance.timeOrigin,
            release:{state:document.documentElement.dataset.robysEntryState,pending:Boolean(document.documentElement.dataset.robysEntryPending),overlays:document.querySelectorAll('.robys-takeaway-entry').length,inert:document.body.inert}};
        });
        save(`${spec.label}-probe.json`,captured);
        if(captured.observerErrors.length)throw new Error(captured.observerErrors.join('; '));
        const rel=captured.release;r.releaseStatus=rel.state==='done'&&!rel.pending&&rel.overlays===0&&!rel.inert&&r.pageErrors.length===0?'PASS':'FAIL';
        try{const t=contract.timing({events:captured.events},'cold','morning');r.brandToHandoffMs=t.holdMs;r.totalMs=t.totalMs;r.timingStatus='PASS';}catch(e){r.timingStatus='FAIL';r.timingError=String(e);}
        if(spec.sampler==='rich'){
          const probe=captured.probe;if(!probe)throw new Error('Original probe missing');
          const first=probe.frames.find(f=>f.state==='brand-frame'&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);
          const brandAt=probe.events.find(e=>e.state==='brand-frame')?.at;r.startupMs=first&&Number.isFinite(brandAt)?first.at-brandAt:null;
          try{r.cadenceEvidence=contract.cadence(probe);r.cadenceStatus='PASS';}catch(e){r.cadenceStatus='FAIL';r.cadenceError=String(e);}
        }
        const b=captured.events.find(e=>e.state==='brand-frame')?.at,h=captured.events.find(e=>e.state==='handoff')?.at;
        r.startupLongFrames=captured.longFrames.filter(f=>Number.isFinite(b)&&Number.isFinite(h)&&f.startTime<h&&f.startTime+f.duration>b);
        const scripts=r.startupLongFrames.flatMap(f=>f.scripts??[]).filter(s=>s.startTime<h&&s.startTime+s.duration>b);
        r.loafReportedForcedMs=scripts.reduce((sum,s)=>sum+(s.forcedStyleAndLayoutDuration??0),0);
        r.samplerLoafReportedForcedMs=scripts.filter(s=>s.sourceFunctionName==='sample').reduce((sum,s)=>sum+(s.forcedStyleAndLayoutDuration??0),0);
      }catch(e){r.captureError=String(e.stack);}
      finally{
        if(recording){try{const complete=once(cdp,'Tracing.tracingComplete');await cdp.send('Tracing.end');const [{stream}]=await complete;const chunks=[];for(;;){const p=await cdp.send('IO.read',{handle:stream,size:1048576});chunks.push(Buffer.from(p.data,p.base64Encoded?'base64':'utf8'));if(p.eof)break;}await cdp.send('IO.close',{handle:stream});const bytes=Buffer.concat(chunks);JSON.parse(bytes.toString('utf8'));writeFileSync(join(out,`${spec.label}-trace.json`),bytes);r.traceSha256=sha(bytes);}catch(e){r.traceError=String(e.stack);}}
        // The final screen is evidence of release/recovery only, not onset timing.
        if(page&&spec.position===1)await page.screenshot({path:join(out,`${spec.label}-released.png`)}).catch(()=>{});
        await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
        save('report.json',report);console.log(JSON.stringify({label:r.label,cadence:r.cadenceStatus,startupMs:r.startupMs,forcedMs:r.loafReportedForcedMs,samplerForcedMs:r.samplerLoafReportedForcedMs,captureError:r.captureError,traceError:r.traceError}));
      }
    }
    git('diff','--exit-code');
    const after=Object.fromEntries(paths.map(p=>[p,sha(readFileSync(p))]));if(JSON.stringify(after)!==JSON.stringify(before))throw new Error('Product bytes changed');
    report.summary=summarize(report.cases);save('summary.json',report.summary);
    if(!report.summary.captureComplete)process.exitCode=1;
  }finally{server.kill('SIGTERM');save('server-log.json',{tail:serverLog});save('report.json',report);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
