import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = process.cwd();
const variants = (process.env.ENTRY_PROBE_VARIANTS ?? 'baseline,no-video').split(',');
if (variants.some(v => !['baseline','no-video','contain','hide-covered'].includes(v))) throw new Error('Unknown diagnostic variant');
// Keep each run's evidence in an atomically created private directory.
const output = process.env.ENTRY_PROBE_OUTPUT ?? path.join(mkdtempSync(path.join(tmpdir(), 'robys-entry-probe-')), 'results.json');
console.log(JSON.stringify({ diagnosticOutput: output }));
const server = spawn('python3', ['-m','http.server','4194','--bind','127.0.0.1'], {cwd:root,stdio:'ignore'});
const results=[];
let browser;
try {
  for(let n=0;n<30;n++){try{if((await fetch('http://127.0.0.1:4194')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  for(let round=0;round<3;round++) for(const scene of ['day','night']) for(const variant of round%2 ? [...variants].reverse() : variants) {
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'tr-TR',timezoneId:'Europe/Istanbul',reducedMotion:'no-preference',serviceWorkers:'block'});
    // Both sides use the same interception/cache policy; only the diagnostic
    // no-video side removes media source/initialization. No gate result uses it.
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/'){
        let html=readFileSync(root+'/index.html','utf8');
        if(variant==='no-video') html=html.replace(/<video\b[\s\S]*?<\/video>/,'<video class="hero-video" muted playsinline preload="none" poster="src/robys-hero-poster.jpg" aria-hidden="true"></video>');
        await route.fulfill({status:200,contentType:'text/html',body:html});
      } else if(url.pathname==='/qa.js'){
        let js=readFileSync(root+'/qa.js','utf8');
        if(variant==='no-video')js=js.replace('function enableHeroVideo() {','function enableHeroVideo() { return;');
        await route.fulfill({status:200,contentType:'text/javascript',body:js});
      } else await route.continue();
    });
    await context.addInitScript((variant)=>{
      window.probe={events:[],longTasks:[],frames:[]};
      new PerformanceObserver(l=>window.probe.longTasks.push(...l.getEntries().map(e=>({at:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
      for(const name of ['robys:entry-state','robys:android-handoff'])window.addEventListener(name,e=>window.probe.events.push({at:performance.now(),...e.detail}));
      for(const name of ['play','playing','pause','loadeddata','canplay','error'])document.addEventListener(name,e=>{if(e.target.matches?.('.hero-video'))window.probe.events.push({at:performance.now(),media:name,state:document.documentElement.dataset.robysEntryState});},true);
      window.addEventListener('robys:entry-state',e=>{if(e.detail.state!=='brand-frame')return;
        if(variant==='contain')document.querySelector('.robys-contextual-entry').style.contain='layout paint';
        if(variant==='hide-covered')for(const el of document.body.children)if(!el.classList.contains('robys-contextual-entry'))el.style.visibility='hidden';
        const tick=at=>{const layer=document.querySelector('.robys-entry-red-surface'); if(!layer)return; window.probe.frames.push({at,transform:getComputedStyle(layer).transform,decoded:document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames}); if(window.probe.frames.length<50)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    },variant);
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4194/?entry='+scene,{waitUntil:'domcontentloaded'});
    await page.locator('html[data-robys-entry-state="done"]').waitFor({state:'attached',timeout:4000});
    const data=await page.evaluate(()=>({...window.probe,resources:performance.getEntriesByType('resource').filter(e=>/mp4|qa.js|entry.js/.test(e.name)).map(e=>({name:new URL(e.name).pathname,at:e.startTime,duration:e.duration})),media:{paused:document.querySelector('video').paused,decoded:document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames}}));
    const intervals=data.frames.slice(1).map((f,i)=>f.at-data.frames[i].at).sort((a,b)=>a-b);
    const record={round,scene,variant,median:intervals[Math.floor(intervals.length/2)],...data};results.push(record);
    console.log(JSON.stringify({round,scene,variant,median:record.median,firstFrame:record.frames[0]?.at,lastFrame:record.frames.at(-1)?.at,slow:intervals.filter(x=>x>21).length,media:data.media,longTasks:data.longTasks}));
    writeFileSync(output,JSON.stringify({scope:'diagnostic isolation only; not the 18-frame certification gate',browser:browser.version(),variants,results},null,2));
    await context.close();
  }
}finally{await browser?.close();server.kill();}
