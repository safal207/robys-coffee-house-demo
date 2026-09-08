/** Diagnostic-only fixed study for PR #356 exact product head.
 * It preserves the original takeaway sampler and cadence assertions. Tracing is
 * alternated with untraced controls; all cases are retained, no retries/best-run
 * selection. It does not modify product bytes or authorize release.
 */
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {contextFor,brand,assertBrand,done,timing,cadence} from './takeaway-browser-contract.mjs';

const HEAD='5e6618b861efc866286c83a06e0380133e103a08';
const out=resolve('.artifacts/gallery-postfix-trace');mkdirSync(out,{recursive:true});
const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(git('rev-parse','HEAD')!==HEAD)throw new Error('Unexpected product HEAD');
const protectedPaths=['src/featured-gallery.ts','featured-gallery.js','takeaway-entry.js','bootstrap-v2.js','scripts/takeaway-browser-contract.mjs','scripts/morning-entry-smoke.mjs','styles-v2.css','lighthouse/budgets.json','lighthouse/baseline.json','integrity-manifest.json'];
const protectedHashes=Object.fromEntries(protectedPaths.map(p=>[p,sha(readFileSync(p))]));
const plan=[false,true,true,false,false,true,true,false].map((traced,index)=>({run:index+1,traced,label:`${String(index+1).padStart(2,'0')}-${traced?'trace':'plain'}`}));
const report={head:HEAD,tree:git('rev-parse','HEAD^{tree}'),plan,protectedHashes,cases:[],scope:'Diagnostic only. Eight fresh browser processes, fixed trace/plain order, original rich sampler and unchanged 150ms cadence gate. Common Long Animation Frame observer and user-timing marks in all cases; trace only in marked cases. No retries, threshold/baseline changes, merge/deploy or physical-device claim.'};
save('report.json',report);
const server=spawn('python3',['-m','http.server','4201','--bind','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
let serverLog='',serverError;server.stderr.on('data',b=>serverLog=(serverLog+b.toString()).slice(-64000));server.on('error',e=>serverError=e);
const origin='http://127.0.0.1:4201';
try{
  let ready=false;
  for(let i=0;i<40;i++){
    if(serverError)throw serverError;if(server.exitCode!==null)throw new Error('Server exited');
    try{ready=(await fetch(origin)).ok;}catch{}
    if(ready)break;await new Promise(r=>setTimeout(r,100));
  }
  if(!ready)throw new Error('Server unavailable');
  for(const spec of plan){
    const row={...spec,pageErrors:[],brandStatus:'NOT_RUN',releaseStatus:'NOT_RUN',timingStatus:'NOT_RUN',cadenceStatus:'NOT_RUN'};report.cases.push(row);
    let browser,context,page,cdp,recording=false;
    try{
      browser=await chromium.launch({headless:true});row.browser=browser.version();
      context=await contextFor(browser);
      await context.addInitScript(()=>{
        const d=globalThis.__entryStallDiag={events:[],longFrames:[],longTasks:[],observerErrors:[]};
        window.addEventListener('robys:entry-state',e=>{
          d.events.push({...e.detail,at:performance.now()});
          performance.mark(`stall:${e.detail.state}`);
        });
        for(const [type,key] of [['long-animation-frame','longFrames'],['longtask','longTasks']]){
          try{if(!PerformanceObserver.supportedEntryTypes.includes(type))throw new Error(`${type} unavailable`);new PerformanceObserver(list=>{for(const e of list.getEntries())d[key].push(e.toJSON());}).observe({type,buffered:true});}
          catch(e){d.observerErrors.push(String(e));}
        }
      });
      page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
      if(spec.traced){
        cdp=await context.newCDPSession(page);
        await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,loading,cc,benchmark,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream',options:'sampling-frequency=1000'});
        recording=true;
      }
      await page.goto(`${origin}/?entry=morning`,{waitUntil:'domcontentloaded',timeout:15000});
      try{const appearance=await brand(page);assertBrand(appearance);row.brandStatus='PASS';}catch(e){row.brandStatus='FAIL';row.brandError=String(e);}
      let probe=null;
      try{probe=await done(page);row.releaseStatus='PASS';}catch(e){row.releaseStatus='FAIL';row.releaseError=String(e);probe=await page.evaluate(()=>globalThis.__takeawayProbe??null).catch(()=>null);}
      if(probe){
        try{const t=timing(probe,'cold','morning');row.timingStatus='PASS';row.holdMs=t.holdMs;row.totalMs=t.totalMs;}catch(e){row.timingStatus='FAIL';row.timingError=String(e);}
        const brandAt=probe.events.find(e=>e.state==='brand-frame')?.at;
        const firstVisible=probe.frames.find(f=>f.state==='brand-frame'&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);
        row.startupMs=firstVisible&&Number.isFinite(brandAt)?firstVisible.at-brandAt:null;
        const brandFrames=probe.frames.filter(f=>f.state==='brand-frame');
        row.rafGaps=brandFrames.slice(1).map((f,i)=>({from:brandFrames[i].at,to:f.at,gapMs:f.at-brandFrames[i].at,fromPending:brandFrames[i].entrancePending,toPending:f.entrancePending})).sort((a,b)=>b.gapMs-a.gapMs).slice(0,8);
        try{const c=cadence(probe);row.cadenceStatus='PASS';row.cadence={startupMs:c.startupMs,medianFrameIntervalMs:c.medianFrameIntervalMs,uniqueTransforms:c.uniqueTransforms,longestIdenticalRun:c.longestIdenticalRun};}catch(e){row.cadenceStatus='FAIL';row.cadenceError=String(e);}
      }
      row.diagnostics=await page.evaluate(()=>({diag:globalThis.__entryStallDiag??null,timeOrigin:performance.timeOrigin,navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>e.toJSON())}));
      save(`${spec.label}-probe.json`,{probe,diagnostics:row.diagnostics});
    }catch(e){row.captureError=String(e.stack);}
    finally{
      if(recording){
        try{
          const complete=once(cdp,'Tracing.tracingComplete');await cdp.send('Tracing.end');const [{stream}]=await complete;const chunks=[];
          for(;;){const part=await cdp.send('IO.read',{handle:stream,size:1048576});chunks.push(Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));if(part.eof)break;}
          await cdp.send('IO.close',{handle:stream});const bytes=Buffer.concat(chunks);JSON.parse(bytes.toString('utf8'));writeFileSync(join(out,`${spec.label}-trace.json`),bytes);row.traceSha256=sha(bytes);row.traceBytes=bytes.length;
        }catch(e){row.traceError=String(e.stack);}
      }
      await context?.close().catch(()=>{});await browser?.close().catch(()=>{});save('report.json',report);console.log(JSON.stringify({label:spec.label,startupMs:row.startupMs,cadence:row.cadenceStatus,maxRafGap:row.rafGaps?.[0]?.gapMs,captureError:row.captureError,traceError:row.traceError}));
    }
  }
  git('diff','--exit-code');
  for(const [p,h] of Object.entries(protectedHashes))if(sha(readFileSync(p))!==h)throw new Error(`Product byte drift: ${p}`);
  report.captureComplete=report.cases.length===8&&report.cases.every(r=>!r.captureError&&!r.traceError&&r.pageErrors.length===0);
  report.gates={richPass:report.cases.filter(r=>r.cadenceStatus==='PASS').length,richFail:report.cases.filter(r=>r.cadenceStatus==='FAIL').length,maxStartupMs:Math.max(...report.cases.map(r=>Number(r.startupMs)).filter(Number.isFinite))};
  report.releaseDecision='HOLD: diagnostic completion is not release approval; any cadence failure remains a failure.';
  if(!report.captureComplete)process.exitCode=1;
}finally{server.kill('SIGTERM');save('server-log.json',{tail:serverLog});save('report.json',report);}
