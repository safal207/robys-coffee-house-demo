import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveRevealConfig, revealCopy } from "../menu-product-reveal.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const sanSebastian = resolveRevealConfig(
  "https://example.test/robys-coffee-house-demo/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp?v=1"
);
assert.ok(sanSebastian, "San Sebastian must opt into product reveal");
assert.equal(sanSebastian.id, "desserts:san-sebastian-cheesecake");
assert.equal(sanSebastian.revealImage, "src/products/san-sebastian.webp");
assert.ok(
  existsSync(resolve(root, sanSebastian.revealImage)),
  "Reveal image must be a real repository asset"
);
assert.ok(
  existsSync(resolve(root, "menu-product-reveal.css")),
  "Reveal styling must be served as a same-origin external stylesheet"
);

assert.equal(
  resolveRevealConfig("src/products/menu-v1/desserts--lotus-cheesecake.webp"),
  null,
  "Products without an explicit reveal mapping must remain unchanged"
);
assert.equal(
  resolveRevealConfig("src/products/menu-v1/hot-coffee--caffe-latte.webp"),
  null,
  "Coffee products must not inherit the San Sebastian reveal"
);

for (const language of ["tr", "en", "ru"]) {
  const copy = revealCopy(language);
  assert.ok(copy.label.length > 8, `${language}: accessible label is required`);
  assert.ok(copy.hint.length > 8, `${language}: visible swipe hint is required`);
  assert.ok(copy.value.includes("%{percent}"), `${language}: value copy must expose reveal percent`);
}

const menuHtml = readFileSync(resolve(root, "menu.html"), "utf8");
assert.match(
  menuHtml,
  /<link rel="stylesheet" href="menu-product-reveal\.css\?v=20260909-reveal-v1" \/>/,
  "Menu must load reveal styling as an external CSP-safe stylesheet"
);
assert.match(
  menuHtml,
  /<script type="module" src="menu-product-reveal\.js\?v=20260909-reveal-v1"><\/script>/,
  "Menu must mount reveal as an independent module"
);

const searchHelper = readFileSync(resolve(root, "menu-search-clear.js"), "utf8");
assert.doesNotMatch(
  searchHelper,
  /menu-product-reveal/,
  "Search helper must stay independent from product reveal"
);

const revealSource = readFileSync(resolve(root, "menu-product-reveal.js"), "utf8");
assert.ok(
  revealSource.indexOf('sourceImage.getAttribute("src")') < revealSource.indexOf("sourceImage.currentSrc"),
  "Reveal matching must prefer the newly assigned src attribute over possibly stale currentSrc"
);
assert.doesNotMatch(
  revealSource,
  /gallery-v5\/san-sebastian\.webp/,
  "Reveal must not use the gallery poster as a food-photo alternate view"
);
assert.doesNotMatch(
  revealSource,
  /createElement\(["']style["']\)|style\.textContent/,
  "Reveal module must not inject inline style blocks rejected by menu CSP"
);

console.log("menu product reveal contract: PASS");
