/** Diagnostic runner. Execute from .artifacts/startup-trace/capture.mjs in a
 * clean product checkout. Traced samples are not performance certification.
 * The original timing/cadence/brand assertions remain unmodified.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { contextFor, brand, assertBrand, done, timing, cadence } from '../../scripts/takeaway-browser-contract.mjs';
const out = resolve('.artifacts/startup-trace');
mkdirSync(out, { recursive: true });
const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const expected = '96294ecbcba7cfb99deaadb4b629e0085a2686b9';
if (git('rev-parse', 'HEAD') !== expected) throw new Error('Unexpected product HEAD');
const protectedPaths = ['takeaway-entry.js','bootstrap-v2.js','styles-v2.css','index.html','scripts/takeaway-browser-contract.mjs','scripts/morning-entry-smoke.mjs','integrity-manifest.json'];
const report = { productHead: expected, productTree: git('rev-parse','HEAD^{tree}'),
  scope: 'Fixed six cold contexts: three untraced and three traced, alternating. No retries or selection of only passing samples. No product changes, revised thresholds, deployment or physical-device claim.',
  hashes: Object.fromEntries(protectedPaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),
  cases: [] };
const port=4197, origin=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
let serverLog='', serverError;
server.stderr.on('data', b=>serverLog=(serverLog+b.toString()).slice(-64000));
server.on('error', e=>serverError=e);
try {
  let ready=false;
  for(let i=0;i<40;i++){
    if(serverError)throw serverError;
    if(server.exitCode!==null)throw new Error('HTTP server exited');
    try{ready=(await fetch(origin)).ok;}catch{}
    if(ready)break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(!ready)throw new Error('HTTP server did not start');
  for(const [index,traced] of [false,true,false,true,false,true].entries()){
    const label=`${index+1}-${traced?'traced':'control'}`;
    const result={label,traced,assertions:{},pageErrors:[]};report.cases.push(result);
    let browser,context,page,cdp,recording=false;
    try {
      browser=await chromium.launch({headless:true});result.browser=browser.version();
      context=await contextFor(browser);page=await context.newPage();
      page.on('pageerror',e=>result.pageErrors.push(e.message));
      if(traced){
        await context.addInitScript(()=>{
          globalThis.__startupDiagnostics={longTasks:[],longFrames:[],errors:[]};
          window.addEventListener('robys:entry-state',e=>performance.mark('robys:'+e.detail.state));
          for(const [type,key] of [['longtask','longTasks'],['long-animation-frame','longFrames']]){
            try{new PerformanceObserver(list=>{for(const e of list.getEntries())globalThis.__startupDiagnostics[key].push(e.toJSON());}).observe({type,buffered:true});}
            catch(e){globalThis.__startupDiagnostics.errors.push(String(e));}
          }
        });
        cdp=await context.newCDPSession(page);
        await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,loading,cc,benchmark,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream',options:'sampling-frequency=1000'});
        recording=true;
      }
      await page.goto(`${origin}/?entry=morning`,{waitUntil:'domcontentloaded',timeout:15000});
      try{result.appearance=await brand(page);assertBrand(result.appearance);result.assertions.brand='PASS';}catch(e){result.assertions.brand=String(e);}
      try{await done(page);result.assertions.release='PASS';}catch(e){result.assertions.release=String(e);}
      const probe=await page.evaluate(()=>globalThis.__takeawayProbe);
      save(`${label}-probe.json`,probe);
      try{result.timing=timing(probe,'cold','morning');result.assertions.timing='PASS';}catch(e){result.assertions.timing=String(e);}
      try{const c=cadence(probe);result.cadence={startupMs:c.startupMs,uniqueTransforms:c.uniqueTransforms,changingTransitions:c.changingTransitions,longestIdenticalRun:c.longestIdenticalRun,medianFrameIntervalMs:c.medianFrameIntervalMs};result.assertions.cadence='PASS';}catch(e){result.assertions.cadence=String(e);}
      result.diagnostics=await page.evaluate(()=>({extra:globalThis.__startupDiagnostics??null,timeOrigin:performance.timeOrigin,navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>e.toJSON())}));
      await page.screenshot({path:join(out,`${label}-released.png`)});
    }catch(e){result.captureError=String(e.stack);}
    finally{
      if(recording){
        try{
          const complete=once(cdp,'Tracing.tracingComplete');await cdp.send('Tracing.end');
          const [{stream}]=await complete;
          const chunks=[];
          for(;;){const part=await cdp.send('IO.read',{handle:stream,size:1048576});chunks.push(Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));if(part.eof)break;}
          await cdp.send('IO.close',{handle:stream});
          const bytes=Buffer.concat(chunks);JSON.parse(bytes.toString('utf8'));
          writeFileSync(join(out,`${label}-trace.json`),bytes);result.traceSha256=createHash('sha256').update(bytes).digest('hex');result.traceBytes=bytes.length;
        }catch(e){result.traceError=String(e.stack);}
      }
      await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
      save('report.json',report);
      console.log(JSON.stringify({label,assertions:result.assertions,cadence:result.cadence,captureError:result.captureError,traceError:result.traceError}));
    }
  }
  git('diff','--exit-code');
  report.captureComplete=report.cases.length===6&&report.cases.every(r=>!r.captureError&&!r.traceError);
  report.allObservedGatesPass=report.captureComplete&&report.cases.every(r=>Object.values(r.assertions).every(v=>v==='PASS')&&r.pageErrors.length===0);
  if(!report.captureComplete)process.exitCode=1;
} finally {
  server.kill('SIGTERM');save('server-log.json',{tail:serverLog});save('report.json',report);
}
