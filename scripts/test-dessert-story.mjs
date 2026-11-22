import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
test("one shared story enhancement is wired into feed, grid and list", () => {
  for (const page of ["menu-feed.html", "menu-grid.html", "menu.html"]) {
    const html=read(page);
    assert.equal(html.split('src/dessert-story-loader.js').length-1,1,page+" must attach visibility loader once");
    assert.equal(html.split('src/dessert-story.js').length-1,0,page+" must not eagerly fetch the controller");
    assert.equal(html.split('href="dessert-story.css"').length-1,0,page+" must not add a blocking CSS link");
  }
});
test("lazy loader requires intersection, disconnects and preserves strict CSP", () => {
  const loader=read("src/dessert-story-loader.js");
  for(const pattern of [/IntersectionObserver/,/entry\.isIntersecting/,/MutationObserver/,/desserts:chocolate-cake/,/import\("\.\/dessert-story\.js"\)/,/visible\.disconnect\(\)/,/changes\.disconnect\(\)/]) assert.match(loader,pattern);
  assert.ok(!loader.includes("innerHTML") && !loader.includes("localStorage"),"no CSP-unsafe HTML or order state");
});
test("feature is scoped to the existing Chocolate Cake product and three localizations", () => {
  const source=read("src/dessert-story.js");
  assert.match(source,/desserts:chocolate-cake/);
  for (const value of ["tr:","en:","ru:","İster misin?","Want some?","Хочешь?"]) assert.ok(source.includes(value),"missing "+value);
  assert.ok(source.includes("pointerdown") && source.includes("pointerup"),"gesture events");
  assert.ok(source.includes("ArrowLeft") && source.includes("ArrowRight"),"keyboard navigation");
  assert.ok(!source.includes("localStorage.setItem"),"story should not mutate the order/cart");
  assert.ok(source.includes('loadStyles.addEventListener("load"'),"activate only after optional CSS loads");
  assert.ok(source.includes('new URL("../dessert-story.css",import.meta.url)'),"resolve local stylesheet");
  assert.ok(!source.includes('style.setProperty("--dessert-frame-image"'),"do not use inline styles under CSP");
  assert.ok(source.includes("dessert-story-backdrop"),"backdrop uses a real DOM image");
  assert.ok(source.includes("row.append(button)"),"story action must stay out of product copy and price flow");
  assert.ok(source.includes('button.setAttribute("aria-label",copy().open)'),"floating story icon has localized accessible name");
  assert.ok(read("dessert-story.css").includes(".full-menu-item--product{position:relative}"),"story trigger anchored to card");
  assert.ok(read("dessert-story.css").includes(".dessert-story-open{position:absolute"),"story trigger must not increase card height");
  assert.ok(source.includes('backdrop.loading="lazy"'),"blurred backdrop must not load offscreen eagerly");
  assert.ok(source.includes('card.dataset.dessertFrame=String(i+1)'),"finale state drives overlay clearance");
  assert.ok(source.includes('hint.hidden=i===2'),"finale cannot retain swipe hint");
  assert.ok(read("dessert-story.css").includes('[data-dessert-frame="3"] .feed-photo>.feed-photo-views'),"finale must not obscure the headline with view badge");
  assert.ok(!/\.innerHTML\s*=/.test(source),"Trusted Types: no unsafe innerHTML sink");
  assert.ok(source.includes('modal.setAttribute("aria-labelledby",heading.id)'),"modal must have an accessible name");
  assert.ok(source.includes('layer.setAttribute("aria-label",copy().title+" · "+copy().hint)'),"feed accessible name must update on language switch");
});
test("all five story photographs exist, fit the mobile budget and have JPEG signatures", () => {
  const base="src/products/stories/chocolate-cake/";
  for (const name of ["01.jpg","02.jpg","03-ru.jpg","03-tr.jpg","03-en.jpg"]) {
    const pathname=base+name;
    const bytes=readFileSync(new URL("../"+pathname,import.meta.url));
    assert.ok(bytes.length>1000 && bytes.length<60000,pathname+" should be a real optimized image");
    assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
    assert.equal(bytes[bytes.length-2],0xff);assert.equal(bytes[bytes.length-1],0xd9);
    assert.ok(statSync(new URL("../"+pathname,import.meta.url)).isFile());
  }
});
