import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

// Execute the authored delivery boundary. Native browser cases independently
// verify actual selection, request withholding and recovery over HTTPS.
const source = readFileSync("src/menu-app.js", "utf8");
const start = source.indexOf("function loadMenuProductPhoto(");
const end = source.indexOf("function createProductImageObserver(", start);
assert(start >= 0 && end > start);
const load = runInNewContext(source.slice(start, end) + "\nloadMenuProductPhoto;");

test("list delivery uses the same complete 512/1024 frames as the feed", () => {
  for (const original of ["src/products/sets-v1/cool-lime-macaron.webp", "src/products/menu-v1/hot-coffee--espresso.webp"]) {
    const image = { addEventListener() {} };
    load(image, original);
    const compact = original.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-512.webp");
    assert.equal(image.src, original, "The original remains the canonical fallback");
    assert.equal(image.srcset, `${compact} 512w, ${original} 1024w`);
    assert.equal(image.sizes, "(max-width: 460px) 100vw, 460px");
  }
});

test("a failed delivery copy retries only the original and cannot loop", () => {
  const handlers = new Map(), requests = [];
  const original = "src/products/menu-v1/hot-coffee--espresso.webp";
  const image = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    removeAttribute(name) { if (name === "srcset") this.srcset = ""; },
    set src(value) { requests.push(value); }, get src() { return requests.at(-1); }
  };
  load(image, original);
  handlers.get("error")();
  assert.equal(image.srcset, ""); assert.deepEqual(requests, [original, original]);
  handlers.get("error")();
  assert.deepEqual(requests, [original, original], "An original failure must not restart the compact request");
});
