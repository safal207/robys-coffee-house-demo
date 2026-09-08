/** Measurement ablation only. Never replaces the original release contract.
 * All cases share product bytes, viewport, locale, instrumentation and navigation.
 * Four arms separate external brand assertions, full sampler, clock-only rAF,
 * and events only. Three counterbalanced blocks cross each with trace on/off.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {cpus,totalmem,platform,release} from 'node:os';
const HEAD='0611ca0caa5d39f769fd0916bca65f037886aa56';
const CONTRACT_BLOB='abbe2b050e763998bb6be37acf6acea0067d3709';
const contractPath='scripts/takeaway-browser-contract.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
const source=readFileSync(contractPath,'utf8');
assert.equal(blob(Buffer.from(source)),CONTRACT_BLOB,'Unexpected measurement source');
const arms=['contract','full','clock','events'];
function variant(mode){
 assert(arms.includes(mode));
 if(mode==='full'||mode==='contract')return source;
 const start=source.indexOf('      const sample = (at) => {');
 const end=source.indexOf('      requestAnimationFrame(sample);\n    });',start);
 assert(start>0&&end>start,'Sampler boundaries must be exact');
 const replacement=mode==='clock'?`      const sample = (at) => {
        if (document.documentElement.dataset.robysEntryState === 'done') return;
        probe.frames.push({at, callbackAt: performance.now(), state: document.documentElement.dataset.robysEntryState});
        if (probe.frames.length < 240) requestAnimationFrame(sample);
      };
`:'';
 // Events arm schedules nothing. Reduced arms explicitly cannot certify visibility.
 const stop=end+(mode==='events'?'      requestAnimationFrame(sample);\n'.length:0);
 return source.slice(0,start)+replacement+source.slice(stop);
}
function plan(){
 const base=arms.flatMap(arm=>[false,true].map(traced=>({arm,traced})));
 const permutations=[[0,3,4,7,2,5,6,1],[5,6,1,2,7,0,3,4],[2,7,0,5,4,1,6,3]];
 return permutations.flatMap((order,block)=>order.map((i,position)=>({block:block+1,position:position+1,...base[i]})));
}
function grade(probe,arm,contract){
 const r={timing:'NOT_MEASURED',cadence:'NOT_MEASURED',startupMs:null};
 try{contract.timing(probe,'cold','morning');r.timing='PASS';}catch(e){r.timing='FAIL';r.timingError=String(e);}
 if(['full','contract'].includes(arm)){
  const first=probe.frames.find(f=>f.state==='brand-frame'&&f.entrancePending===false&&f.entranceTime>0&&f.opacity>0);
  const event=probe.events.find(e=>e.state==='brand-frame');
  if(first&&event)r.startupMs=first.at-event.at;
  try{contract.cadence(probe);r.cadence='PASS';}catch(e){r.cadence='FAIL';r.cadenceError=String(e);}
 }
 return r;
}
async function selfTest(){
 let count=0;
 const check=(name,fn)=>{fn();console.log(`PASS ${name}`);count++;};
 check('24 fixed cases',()=>assert.equal(plan().length,24));
 check('balanced trace/mode cells',()=>{for(const a of arms)for(const t of [true,false])assert.equal(plan().filter(x=>x.arm===a&&x.traced===t).length,3);});
 check('each block contains every cell once',()=>{for(let b=1;b<=3;b++)assert.equal(new Set(plan().filter(x=>x.block===b).map(x=>`${x.arm}:${x.traced}`)).size,8);});
 check('original source retained in full and contract',()=>{assert.equal(variant('full'),source);assert.equal(variant('contract'),source);});
 check('unknown variant rejected',()=>assert.throws(()=>variant('other')));
 for(const arm of arms){
  check(`${arm} keeps all assertion function bytes`,()=>assert.equal(variant(arm).slice(variant(arm).indexOf('export async function done')),source.slice(source.indexOf('export async function done'))));
  check(`${arm} actual injected callback`,()=>{
   const s=variant(arm);
   const injected=s.slice(s.indexOf('  await context.addInitScript(')+'  await context.addInitScript('.length,s.indexOf('  }, { language });')+3);
   const queued=[],listeners={};let reads=0;
   const sandbox={localStorage:{setItem(){}},globalThis:null,window:{addEventListener:(type,listener)=>listeners[type]=listener},document:{documentElement:{dataset:{robysEntryState:'brand-frame'}},querySelector(){reads++;return{querySelector(){reads++;return{getAnimations(){reads++;return[{pending:false,currentTime:1,playState:'running'}]}}}}}},getComputedStyle(){reads++;return{transform:'none',opacity:'1'}},requestAnimationFrame:f=>queued.push(f),performance:{now:()=>10}};
   sandbox.globalThis=sandbox;
   vm.runInNewContext(`(${injected})({language:'tr'})`,sandbox);
   listeners['robys:entry-state']({detail:{state:'brand-frame',scene:'morning',variant:'cold',design:'takeaway-v1'}});
   assert.equal(queued.length,arm==='events'?0:1);
   if(queued.length)queued.shift()(20);
   assert.equal(reads>0,arm==='contract'||arm==='full');
   if(arm==='clock')assert.deepEqual(Object.keys(sandbox.__takeawayProbe.frames[0]),['at','callbackAt','state']);
  });
 }
 check('clock cannot be certified by a permissive cadence function',()=>assert.equal(grade({events:[],frames:[]},'clock',{timing(){},cadence(){}}).cadence,'NOT_MEASURED'));
 check('events cannot be certified by a permissive cadence function',()=>assert.equal(grade({events:[],frames:[]},'events',{timing(){},cadence(){}}).cadence,'NOT_MEASURED'));
 check('original cadence failure is preserved',()=>assert.equal(grade({events:[],frames:[]},'full',{timing(){},cadence(){throw Error('150ms')}}).cadence,'FAIL'));
 check('timing failure is preserved in all arms',()=>{for(const a of arms)assert.equal(grade({events:[],frames:[]},a,{timing(){throw Error('timeout')},cadence(){}}).timing,'FAIL');});
 console.log(JSON.stringify({selfTests:count,status:'PASS'}));
}
if(process.argv.includes('--self-test')){await selfTest();process.exit(0);}
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),HEAD);
const out=resolve('.artifacts/observer-study');mkdirSync(out,{recursive:true});
const save=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value,null,2)+'\n');
const files=['takeaway-entry.js','bootstrap-v2.js','src/order-dock.ts','order-launcher.js','styles-v2.css','index.html',contractPath,'lighthouse/baseline.json','lighthouse/budgets.json','integrity-manifest.json'];
const manifest=Object.fromEntries(files.map(p=>[p,hash(readFileSync(p))]));
const report={head:HEAD,tree:git('rev-parse','HEAD^{tree}'),environment:{node:process.version,platform:platform(),release:release(),cpus:cpus().length,cpuModel:cpus()[0]?.model,totalMemory:totalmem()},files:manifest,plan:plan(),cases:[],scope:'DIAGNOSTIC ONLY; no runtime or release-test edits. Lightweight arms do not measure visible startup or certify cadence. All cases retained without retries. Same callback timing wrapper and LoAF observer in all arms. rAF timestamp is not actual callback entry or presentation time.'};
save('plan.json',report);
const modules={};
for(const a of arms){const p=join(out,`contract-${a}.mjs`);writeFileSync(p,variant(a));modules[a]=await import(pathToFileURL(p));}
const {chromium}=await import('playwright');
const server=spawn('python3',['-m','http.server','4199','--bind','127.0.0.1'],{stdio:['ignore','ignore','pipe']});
let log='',serverError;server.stderr.on('data',b=>log=(log+b.toString()).slice(-32000));server.on('error',e=>serverError=e);
const origin='http://127.0.0.1:4199';
try{
 let ready=false;
 for(let i=0;i<40;i++){if(serverError)throw serverError;if(server.exitCode!==null)throw Error('Server exited');try{ready=(await fetch(origin)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
 assert(ready);
 for(const [index,spec] of report.plan.entries()){
  const row={...spec,label:`${String(index+1).padStart(2,'0')}-${spec.arm}-${spec.traced?'trace':'plain'}`,pageErrors:[]};report.cases.push(row);
  let browser,context,page,cdp,recording=false,completionTimeout;
  try{
   browser=await chromium.launch({headless:true});row.browser=browser.version();
   context=await modules[spec.arm].contextFor(browser);
   let notify;const completion=new Promise(r=>notify=r);
   await context.exposeBinding('__observerStudyDone',()=>notify(true));
   await context.addInitScript(()=>{
    const d=globalThis.__observerStudy={callbacks:[],longFrames:[],observerErrors:[],events:[]};
    const original=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=function instrumentedRAF(cb){
     if(cb.name!=='sample')return original(cb);
     return original(function measuredSample(frameAt){const begin=performance.now();try{return cb(frameAt);}finally{d.callbacks.push({frameAt,begin,end:performance.now()});}});
    };
    window.addEventListener('robys:entry-state',e=>{
     d.events.push({...e.detail,at:performance.now()});performance.mark('observer-study:'+e.detail.state);
     if(e.detail.state==='done')globalThis.__observerStudyDone();
    });
    try{new PerformanceObserver(list=>{for(const f of list.getEntries())d.longFrames.push(f.toJSON());}).observe({type:'long-animation-frame',buffered:true});}
    catch(e){d.observerErrors.push(String(e));}
   });
   page=await context.newPage();page.on('pageerror',e=>row.pageErrors.push(e.message));
   if(spec.traced){cdp=await context.newCDPSession(page);await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,loading,cc,benchmark,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream',options:'sampling-frequency=1000'});recording=true;}
   await page.goto(origin+'/?entry=morning',{waitUntil:spec.arm==='contract'?'domcontentloaded':'commit',timeout:15000});
   if(spec.arm==='contract'){
    try{row.appearance=await modules.contract.brand(page);modules.contract.assertBrand(row.appearance);row.brand='PASS';}catch(e){row.brand='FAIL';row.brandError=String(e);}
    try{await modules.contract.done(page);row.release='PASS';}catch(e){row.release='FAIL';row.releaseError=String(e);}
   }
   const completed=await Promise.race([completion,new Promise(r=>completionTimeout=setTimeout(()=>r(false),6000))]);
   clearTimeout(completionTimeout);assert(completed,'No done event by bounded deadline');
   row.data=await page.evaluate(()=>({probe:globalThis.__takeawayProbe,observer:globalThis.__observerStudy,timeOrigin:performance.timeOrigin,resources:performance.getEntriesByType('resource').map(e=>e.toJSON()),navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),overlays:document.querySelectorAll('.robys-takeaway-entry').length,pending:Boolean(document.documentElement.dataset.robysEntryPending)}));
   assert.equal(row.data.overlays,0);assert.equal(row.data.pending,false);
   Object.assign(row,grade(row.data.probe,spec.arm,modules.contract));
   save(`${row.label}-data.json`,row.data);
  }catch(e){row.captureError=String(e.stack);}
  finally{
   clearTimeout(completionTimeout);
   if(recording){try{
    const ended=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');
    const {stream}=await ended;const chunks=[];
    for(;;){const part=await cdp.send('IO.read',{handle:stream,size:1048576});chunks.push(Buffer.from(part.data,part.base64Encoded?'base64':'utf8'));if(part.eof)break;}
    await cdp.send('IO.close',{handle:stream});const bytes=Buffer.concat(chunks);JSON.parse(bytes.toString('utf8'));
    writeFileSync(join(out,`${row.label}-trace.json`),bytes);row.traceSha256=hash(bytes);row.traceBytes=bytes.length;
   }catch(e){row.traceError=String(e.stack);}}
   await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
   save('report.json',report);console.log(JSON.stringify({label:row.label,timing:row.timing,cadence:row.cadence,startupMs:row.startupMs,captureError:row.captureError,traceError:row.traceError}));
  }
 }
 git('diff','--exit-code');for(const p of files)assert.equal(hash(readFileSync(p)),manifest[p],p);
 report.captureComplete=report.cases.length===24&&report.cases.every(c=>!c.captureError&&!c.traceError&&c.pageErrors.length===0);
 report.standardGatesAllPass=report.captureComplete&&report.cases.filter(c=>c.arm==='contract').every(c=>c.timing==='PASS'&&c.cadence==='PASS'&&c.brand==='PASS'&&c.release==='PASS');
 report.allFullSamplerCadencePass=report.captureComplete&&report.cases.filter(c=>c.arm==='contract'||c.arm==='full').every(c=>c.cadence==='PASS');
 report.releaseDecision='HOLD: diagnostic completion never authorizes release; preserve historical negatives and independent native/review boundaries.';
 if(!report.captureComplete)process.exitCode=1;
}finally{server.kill('SIGTERM');save('server-log.json',{tail:log});save('report.json',report);}
