import path from 'node:path';
import { certify, contextFor, brand, assertBrand, done, timing, cadence, assert, save } from './takeaway-browser-contract.mjs';

await certify({ port: 4231, resultsDir: path.resolve('.artifacts/guest-motion-probe'), contract: 'GUEST-MOTION-PROBE' }, async ({browser,baseUrl,resultsDir})=>{
  const results=[];
  for(let index=0;index<20;index++) {
    const context=await contextFor(browser),page=await context.newPage();
    try {
      await page.goto(baseUrl+'?entry=morning',{waitUntil:'domcontentloaded'});
      const appearance=await brand(page),probe=await done(page);
      save(resultsDir,`raw-${index}.json`,probe);
      const result={index,passed:false};
      try {assertBrand(appearance);timing(probe,'cold','morning');cadence(probe);result.passed=true;}
      catch(error){result.error=error.message;result.repeats=probe.frames.filter((f,i,a)=>i>0&&f.state==='brand-frame'&&f.transform===a[i-1].transform).slice(0,12);}
      results.push(result);
    } finally {await context.close();}
  }
  save(resultsDir,'matrix.json',results);
  console.log(JSON.stringify(results,null,2));
  assert(results.every(x=>x.passed),'One or more original cadence gates failed; all 20 observations are preserved.');
});
