import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const port=4217,base=`http://127.0.0.1:${port}/`,dir=".artifacts/mood-graph";
mkdirSync(dir,{recursive:true});
const server=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
let browser;const report=[];
try{
  for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true});
  for(const [width,language] of [[390,"ru"],[768,"tr"],[1440,"en"]]){
    const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:"block",reducedMotion:"reduce"});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    try{
      await page.goto(`${base}smart-choice/index.html#quick`,{waitUntil:"domcontentloaded"});
      await page.locator(".mood-pair-title").waitFor({state:"visible",timeout:15000});
      await page.locator(`.lang-button[data-lang="${language}"]`).click();
      const root=page.locator("#mood-pair");
      await page.waitForFunction(lang=>document.querySelector("#mood-pair")?.getAttribute("aria-label") ===
        ({ru:"Выбери цвет. Найди новый вкус.",tr:"Bir renk seç. Yeni bir lezzet keşfet.",en:"Choose a color. Discover a new pairing."})[lang],language);
      const initial=await page.locator(".mood-pair-title").innerText();
      assert.ok(initial.includes("+"),"Pair must include a drink and an add-on");
      await root.locator('[data-choice-key="weather:rain"]').click();
      assert.equal(await root.locator('[data-choice-key="weather:rain"]').getAttribute("aria-pressed"),"true");
      await root.locator('[data-choice-key="mood:comfort"]').click();
      await root.locator("details.mood-trace summary").click();
      assert.equal(await root.locator(".mood-score").count(),3,"Causal score must expose each input dimension");
      const price=await root.locator(".mood-price").innerText();
      assert.match(price,/\d/);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      assert.ok(overflow<=1,`Horizontal overflow at ${width}px: ${overflow}`);
      await root.screenshot({path:`${dir}/mood-${language}-${width}.png`,animations:"disabled"});
      if(language==="ru"){
        const chosen = await page.locator(".mood-pair-title").innerText();
        await root.locator('[data-choice-key="discover"]').click();
        await root.locator('[data-choice-key="like"]').waitFor({state:"visible"});
        assert.equal(await root.locator('[data-choice-key="like"]').getAttribute("aria-pressed"),"false");
        await root.locator('[data-choice-key="like"]').click();
        assert.equal(await root.locator('[data-choice-key="like"]').getAttribute("aria-pressed"),"true");
        const taste = await page.evaluate(()=>JSON.parse(localStorage.getItem("robys-mood-taste-journey.v1")));
        assert.ok(Object.keys(taste.discovered).length>0);
        assert.ok(Object.values(taste.views).some(x=>x===1));
        await root.locator('[data-choice-key="skip"]').click();
        assert.equal(await root.locator(".mood-share-stage h4").innerText(),"Хочешь попробовать эту пару?");
        assert.equal(await root.locator('[data-choice-key="add"]').textContent(),"Добавить пару в заказ");
        await root.screenshot({path:`${dir}/mood-ru-taste-390.png`,animations:"disabled"});
        await root.locator('[data-choice-key="add"]').click();
        await page.waitForFunction(()=>document.querySelector(".mood-status")?.textContent?.includes("Пара добавлена"),null,{timeout:18000});
        await root.locator('[data-choice-key="open-order"]').click();
        await page.waitForFunction(()=>document.querySelector(".quick-builder")?.textContent?.includes("Твой заказ"),null,{timeout:10000});
        const cart=await page.locator(".qb-cart").innerText();
        assert.match(cart,/Roby|заказ|Чай|шоколад|латте/i);
      }
      if(language==="en"){
        await root.locator('[data-choice-key="discover"]').click();
        const pairId = await page.evaluate(()=>{
          const log = JSON.parse(sessionStorage.getItem("robys-mood-pair-trace.v1")||"{}");
          return log.events?.findLast(event=>event.event==="taste-opened")?.pairId;
        });
        assert.ok(pairId,"A taste-opened event must record the selected pair");
        await page.evaluate(()=>Object.defineProperty(navigator,"share",{configurable:true,value:async ({url})=>{
          if(!new URL(url).searchParams.get("pair"))throw new Error("Missing pairing deep link");
        }}));
        await root.locator('[data-choice-key="share"]').click();
        await root.locator('[data-choice-key="add"]').waitFor({state:"visible"});
        await page.waitForFunction(()=>document.querySelector(".mood-share-stage h4")?.textContent==="Want to try this pairing?");
        const recipient = await context.newPage();
        try{
          await recipient.goto(`${base}smart-choice/index.html?pair=${encodeURIComponent(pairId)}#quick`,{waitUntil:"domcontentloaded"});
          await recipient.locator(".mood-share-stage h4").waitFor({state:"visible"});
          assert.equal(await recipient.locator(".mood-share-stage h4").innerText(),"Who would you try this with?");
          const opened = await recipient.evaluate(()=>JSON.parse(sessionStorage.getItem("robys-mood-pair-trace.v1")||"{}"));
          assert.ok(opened.events?.some(event=>event.event==="taste-opened"&&event.pairId===pairId),
            "Deep link must show selected taste story, not a generic menu");
        }finally{await recipient.close()}
      }
      assert.deepEqual(errors,[],`page errors ${language}: ${errors.join(" | ")}`);
      report.push({width,language,passed:true,overflow,initial,price});
      console.log(`PASS mood graph ${language} ${width}px`);
    }finally{await context.close()}
  }
}finally{await browser?.close();server.kill();writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2)+"\n")}
