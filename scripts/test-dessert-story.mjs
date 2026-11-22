import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
test("one shared story enhancement is wired into feed, grid and list", () => {
  for (const page of ["menu-feed.html", "menu-grid.html", "menu.html"]) {
    const html=read(page);
    assert.equal(html.split('src/dessert-story.js').length-1,1,page+" must load story once");
    assert.equal(html.split('href="dessert-story.css"').length-1,0,page+" must not add a blocking CSS link");
  }
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
