import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const port=4225,base=`http://127.0.0.1:${port}/`,dir=".artifacts/photo-taste-journey";
mkdirSync(dir,{recursive:true});
const server=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
let browser;const results=[];
try {
  let online=false;
  for(let i=0;i<70;i++){
    try{online=(await fetch(base)).ok}catch{}
    if(online)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(online,"Local browser server must start");
  browser=await chromium.launch({headless:true});
  for(const [width,lang] of [[390,"ru"],[1024,"en"],[768,"tr"]]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    if(lang==="en")await page.addInitScript(()=>{
      Object.defineProperty(navigator,"share",{configurable:true,value:async payload=>{window.__sharedPair=payload.url}});
    });
    try {
      await page.goto(`${base}menu-grid.html?view=grid&lang=${lang}&entry=off`,{waitUntil:"domcontentloaded"});
      const first=page.locator('.pairing-poster-card[data-pairing="cool-lime-macaron"] .full-menu-item-media');
      await first.waitFor({state:"visible",timeout:20000});
      await first.click();
      const story=page.locator(".pairing-discovery-panel");
      await story.waitFor({state:"visible",timeout:9000});
      const journey=story.locator(".pairing-journey");
      await journey.waitFor({state:"visible",timeout:9000});
      const text=await story.innerText();
      assert.match(text,/cool lime|lime|лайм|макарон|makaron/i);
      const progress=await journey.locator(".pairing-journey-stats").innerText();
      assert.ok(progress.includes("1/2"),"Progress shows one discovered taste out of two");
      assert.match(progress,/1/);
      assert.equal(await story.locator(".pairing-discovery-mark").count(),0,
        "Original mark button should be replaced by automatic discovery and reversible like");
      const heart=journey.locator(".pairing-journey-like");
      assert.equal(await heart.getAttribute("aria-pressed"),"false");
      await heart.click();assert.equal(await heart.getAttribute("aria-pressed"),"true");
      await heart.click();assert.equal(await heart.getAttribute("aria-pressed"),"false");
      const total=await page.evaluate(()=>{
        const key="robys-inline-discovered-pairings";
        return JSON.parse(localStorage.getItem(key)||"[]");
      });
      assert.ok(total.includes("cool-lime-macaron"));
      const missingOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(missingOverflow<=1,`Overflow ${width}px: ${missingOverflow}`);
      await story.screenshot({path:`${dir}/taste-${width}-${lang}.png`,animations:"disabled"});
      if(lang==="en"){
        await journey.locator('[data-taste-action="share"]').click();
        await page.waitForFunction(()=>Boolean(window.__sharedPair));
        const shared=await page.evaluate(()=>window.__sharedPair);
        const link=new URL(shared);
        assert.equal(link.searchParams.get("pair"),"cool-lime-macaron");
        assert.equal(link.searchParams.get("lang"),"en");
        assert.deepEqual([...link.searchParams.keys()].sort(),["lang","pair","view"],
          "Do not leak mood or visitor identity in shared link");
        await page.waitForFunction(()=>document.querySelector(".pairing-journey-question")?.textContent==="Want to try this pairing?");
        const receiver=await context.newPage();
        try {
          await receiver.goto(shared,{waitUntil:"domcontentloaded"});
          const opened=receiver.locator('.pairing-discovery-panel[data-pairing-id="cool-lime-macaron"]');
          await opened.waitFor({state:"visible",timeout:20000});
          await opened.locator(".pairing-journey").waitFor({state:"visible"});
          assert.match(await opened.locator(".pairing-journey-stats").innerText(),/1/);
        }finally{await receiver.close()}
      }else if(lang==="ru"){
        await journey.locator('[data-taste-action="skip"]').click();
        assert.equal(await journey.locator(".pairing-journey-question").innerText(),"Хочешь попробовать эту пару?");
        const choose=story.locator(".pairing-discovery-choose");
        assert.match(await choose.innerText(),/Выбрать эту пару/);
        await choose.click();
        await page.locator("#menu-product-dialog[open]").waitFor({state:"visible",timeout:12000});
      }else {
        await page.evaluate(()=>{
          Object.defineProperty(navigator,"share",{configurable:true,value:undefined});
          Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("denied")}}});
        });
        await journey.locator('[data-taste-action="share"]').click();
        await journey.locator(".pairing-journey-url").waitFor({state:"visible"});
        assert.equal(await journey.locator(".pairing-journey-url").getAttribute("readonly"),"");
        await journey.locator('[data-taste-action="skip"]').click();
        assert.equal(await journey.locator(".pairing-journey-buttons").isHidden(),true);
      }
      assert.deepEqual(errors,[],`Browser errors ${lang}: ${errors.join(" | ")}`);
      results.push({width,lang,passed:true});
      console.log(`PASS photo taste ${lang} ${width}px`);
    }finally{await context.close()}
  }
  const noScript=await browser.newContext({javaScriptEnabled:false,serviceWorkers:"block"});
  try{
    const page=await noScript.newPage();
    await page.goto(`${base}menu-grid.html?view=grid&lang=ru`);
    assert.equal(await page.locator(".pairing-journey").count(),0,"JS enhancement must not block no-JS menu");
    assert.ok(await page.locator("body").isVisible());
  }finally{await noScript.close()}
}finally{
  await browser?.close();
  server.kill();
  writeFileSync(`${dir}/report.json`,JSON.stringify(results,null,2)+"\n");
}
