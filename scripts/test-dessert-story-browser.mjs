import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mime = { ".css":"text/css", ".js":"text/javascript", ".jpg":"image/jpeg", ".html":"text/html" };
const fixture = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/_dessert_qa.css"></head><body><div class="feed-languages"><button data-lang="tr" aria-pressed="true">TR</button><button data-lang="en" aria-pressed="false">EN</button><button data-lang="ru" aria-pressed="false">RU</button></div><main id="feed"><article class="feed-card" data-product-id="desserts:chocolate-cake"><div class="feed-photo"><img src="/src/products/stories/chocolate-cake/01.jpg" alt="original"></div></article></main><div id="menu-root"><article class="full-menu-item full-menu-item--product" data-product-id="desserts:chocolate-cake"><button class="full-menu-item-media" type="button"><img src="/src/products/stories/chocolate-cake/01.jpg"></button><div class="full-menu-item-details"><span>Çikolatalı Pasta</span></div></article><article class="full-menu-item full-menu-item--product" data-product-id="desserts:brownie"><div class="full-menu-item-details"></div></article></div><script type="module" src="/src/dessert-story-loader.js"></script></body></html>';
const qaCss = 'body{font:16px system-ui;margin:20px;background:#faf4ec}.feed-photo{position:relative;width:min(390px,90vw);height:min(390px,90vw);overflow:hidden}.feed-photo>img{width:100%;height:100%;object-fit:cover}.feed-languages{display:flex;gap:6px;margin-bottom:16px} .full-menu-item{margin:12px 0}.full-menu-item--product{display:grid;grid-template-columns:88px minmax(0,1fr);gap:12px;padding:8px;max-width:300px}.full-menu-item-media{width:88px;height:88px;padding:0;border:0}.full-menu-item-media img{width:100%;height:100%;object-fit:cover}.full-menu-item-details{min-width:0}.menu-photo-grid .full-menu-item--product{display:flex;flex-direction:column;width:188px}.menu-photo-grid .full-menu-item-media{width:100%;height:auto;aspect-ratio:1}.menu-photo-grid .full-menu-item-details{width:100%;box-sizing:border-box;padding:12px}.story-test-spacer{height:1800px}';
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; require-trusted-types-for 'script'; trusted-types robys-pwa";
const server = createServer((request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,"http://localhost").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    if (pathname === "/_dessert_qa.html" || pathname === "/_dessert_qa.css") {
      const css=pathname.endsWith(".css"),url=new URL(request.url,"http://localhost");
      response.writeHead(200,{"content-type":css?"text/css":"text/html","content-security-policy":csp,"cache-control":"no-store"});
      let html=fixture;
      const mode=url.searchParams.get("mode");
      if(mode==="list"||mode==="grid"){
        html=html.replace(/<main id="feed">[\s\S]*?<\/main>/,'<main id="feed"></main>');
        if(mode==="grid")html=html.replace("<body>","<body class=\"menu-photo-grid\">");
      }
      if(url.searchParams.has("offscreen"))html=html.replace("<body>","<body><div class=\"story-test-spacer\"></div>")
        .replace('<body class="menu-photo-grid">','<body class="menu-photo-grid"><div class="story-test-spacer"></div>');
      response.end(css?qaCss:html);
      return;
    }
    const file = resolve(root,"."+pathname);
    if (!file.startsWith(root+sep) || !existsSync(file) || !statSync(file).isFile()) return response.writeHead(404).end();
    response.writeHead(200,{"content-type":mime[extname(file)]??"application/octet-stream","cache-control":"no-store"});
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
let browser;
try {
  browser = await chromium.launch({headless:true});
  // Verify no full module/CSS fetch before cake is visible, in all menu modes.
  for(const mode of ["feed","list","grid"]){
    const lazyPage=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:"block"});
    const heavyRequests=[];
    const javascriptErrors=[];
    lazyPage.on("pageerror",err=>javascriptErrors.push(err.message));
    lazyPage.on("request",request=>{
      if(/\/(?:dessert-story\.js|dessert-story\.css)(?:\?|$)/.test(request.url()))heavyRequests.push(request.url());
    });
    await lazyPage.goto("http://127.0.0.1:"+server.address().port+"/_dessert_qa.html?offscreen=1&mode="+mode,{waitUntil:"networkidle"});
    assert.deepEqual(heavyRequests,[],mode+": no controller or CSS requested while cake is offscreen");
    assert.equal(await lazyPage.locator("#dessert-story-modal").count(),0,mode+": no premature modal");
    const card=lazyPage.locator(mode==="feed"?".feed-card[data-product-id='desserts:chocolate-cake']":".full-menu-item[data-product-id='desserts:chocolate-cake']");
    await card.scrollIntoViewIfNeeded();
    await lazyPage.locator(mode==="feed"?".dessert-story-feed":".dessert-story-open").waitFor({timeout:12000});
    assert.equal(heavyRequests.filter(url=>url.endsWith("/dessert-story.js")).length,1,mode+": load controller once");
    assert.equal(heavyRequests.filter(url=>url.endsWith("/dessert-story.css")).length,1,mode+": load stylesheet only after visibility");
    if(mode!=="feed"){
      const trigger=lazyPage.locator(".dessert-story-open");
      assert.ok((await trigger.getAttribute("aria-label"))?.length>0,mode+": accessible name");
      await trigger.click();
      await lazyPage.locator("#dessert-story-modal[open]").waitFor();
      await lazyPage.keyboard.press("Escape");
      await lazyPage.locator("#dessert-story-modal[open]").waitFor({state:"hidden"});
      assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,mode+": focus return");
    }
    assert.deepEqual(javascriptErrors,[],mode+": no JavaScript errors");
    await lazyPage.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:"block"});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("console",event=>{if(event.type()==="error")errors.push(event.text());});
  await page.goto("http://127.0.0.1:"+server.address().port+"/_dessert_qa.html",{waitUntil:"domcontentloaded"});
  const slide=page.locator(".dessert-story-feed");
  await slide.waitFor({timeout:12000});
  const photoReady=()=>page.locator(".dessert-story-frame").evaluate(async image=>{
    if(!image.complete)await new Promise(resolve=>{
      image.addEventListener("load",resolve,{once:true});
      image.addEventListener("error",resolve,{once:true});
    });
    if(!image.naturalWidth)throw Error("Story photograph did not decode");
  });
  await photoReady();
  assert.equal(await page.locator(".dessert-story-open").count(),1,"Only Chocolate Cake gets an entry");
  assert.match(await slide.getAttribute("aria-label"),/Çikolatalı Pasta/);
  const photo=page.locator(".dessert-story-frame");
  assert.match(await photo.getAttribute("src"),/01\.jpg$/);
  const box=await slide.boundingBox();
  assert.ok(box && box.width>100,"Feed story must be visible");
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.55);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.55,{steps:6});
  await page.mouse.up();
  await page.locator('.dessert-story-frame[src$="/02.jpg"]').waitFor();
  await slide.focus();await page.keyboard.press("ArrowLeft");
  await page.locator('.dessert-story-frame[src$="/03-tr.jpg"]').waitFor();
  for(const [lang,localeLabel,alt] of [["ru","Шоколадный торт","Хочешь?"],["en","Chocolate Cake","Want some?"]]){
    await page.evaluate(lang=>{
      document.querySelectorAll(".feed-languages [data-lang]").forEach(btn=>btn.setAttribute("aria-pressed",String(btn.dataset.lang===lang)));
      document.querySelector('.feed-languages [data-lang="'+lang+'"]').click();
    },lang);
    await page.locator('.dessert-story-feed[aria-label*="'+localeLabel+'"]').waitFor();
    await slide.focus();await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowLeft");
    await page.locator('.dessert-story-frame[src$="/03-'+lang+'.jpg"]').waitFor();
    assert.equal(await photo.getAttribute("alt"),alt);
  }
  const open=page.locator(".dessert-story-open");
  assert.equal(await open.getAttribute("aria-label"),"3-frame taste story");
  const placement=await open.evaluate(button=>{
    const card=button.closest(".full-menu-item"),media=card.querySelector(".full-menu-item-media"),details=card.querySelector(".full-menu-item-details");
    const b=button.getBoundingClientRect(),m=media.getBoundingClientRect(),d=details.getBoundingClientRect();
    return {absolute:getComputedStyle(button).position==="absolute",overPhoto:b.left>=m.left&&b.right<=m.right&&b.top>=m.top&&b.bottom<=m.bottom,clearOfCopy:b.right<=d.left};
  });
  assert.deepEqual(placement,{absolute:true,overPhoto:true,clearOfCopy:true},"Story entry must not reflow the menu card or cover product copy");
  // VISUAL-001 regression: the story button is an overlay, never an extra
  // menu row. Compare each card's actual rendered height with the same DOM
  // after temporarily removing only the story trigger.
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});
    const storySizeDeltas=await open.evaluate(button=>{
      const card=button.closest(".full-menu-item");
      const results=[];
      for(const mode of ["list","grid"]){
        document.body.classList.toggle("menu-photo-grid",mode==="grid");
        const withStory=card.getBoundingClientRect().height;
        button.remove();
        const withoutStory=card.getBoundingClientRect().height;
        card.append(button);
        results.push([mode,Math.round((withStory-withoutStory)*100)/100]);
      }
      document.body.classList.remove("menu-photo-grid");
      return results;
    });
    assert.deepEqual(storySizeDeltas,[["list",0],["grid",0]],
      "VISUAL-001: story must not shift card height at viewport "+width+"px");
  }
  await page.setViewportSize({width:390,height:844});
  await open.click();
  const dialog=page.locator("#dessert-story-modal[open]");await dialog.waitFor();
  assert.equal(await dialog.getAttribute("aria-labelledby"),"dessert-story-title");
  assert.equal(await page.locator("#dessert-story-title").textContent(),"Chocolate Cake");
  await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowLeft");
  assert.match(await dialog.locator("img").getAttribute("src"),/03-en\.jpg$/);
  mkdirSync(".artifacts/dessert-story",{recursive:true});
  await page.screenshot({path:".artifacts/dessert-story/story-modal-390.png"});
  await page.keyboard.press("Escape");
  await dialog.waitFor({state:"hidden"});
  await page.locator(".dessert-story-open:focus").waitFor();
  assert.equal(await open.evaluate(el=>document.activeElement===el),true);
  assert.deepEqual(errors,[],errors.join(" | "));
  mkdirSync(".artifacts/dessert-story",{recursive:true});
  await page.screenshot({path:".artifacts/dessert-story/qa-390.png"});
  console.log("PASS dessert story browser: pointer swipe, keyboard, tr/ru/en, dialog, focus and CSP");
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}
