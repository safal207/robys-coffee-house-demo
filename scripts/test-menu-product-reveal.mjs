import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pairingOffer, resolveRevealConfig, revealCopy } from "../menu-product-reveal-runtime.js";

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

const pairing = pairingOffer();
assert.ok(pairing, "San Sebastian reveal must bridge to an existing catalog pairing");
assert.equal(pairing.category.id, "pairing-offers");
assert.equal(pairing.item.id, "iced-san-sebastian-pairing");
assert.equal(pairing.productId, "pairing-offers:iced-san-sebastian-pairing");
assert.equal(pairing.item.price, 370, "Pairing bridge price must come from the current menu catalog");
assert.equal(pairing.item.image, "src/products/sets-v1/iced-san-sebastian.webp");

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
  "Menu must mount the lightweight reveal loader as an independent module"
);

const searchHelper = readFileSync(resolve(root, "menu-search-clear.js"), "utf8");
assert.doesNotMatch(
  searchHelper,
  /menu-product-reveal/,
  "Search helper must stay independent from product reveal"
);

const loaderSource = readFileSync(resolve(root, "menu-product-reveal.js"), "utf8");
assert.ok(
  Buffer.byteLength(loaderSource, "utf8") < 1000,
  "Always-loaded reveal loader must stay under 1.0 KB to remain inside the 5% JS regression envelope"
);
assert.match(
  loaderSource,
  /import\("\.\/menu-product-reveal-runtime\.js\?v=20260909-reveal-v2"\)/,
  "Reveal runtime must be dynamically imported only on demand"
);
assert.match(
  loaderSource,
  /const TARGET="src\/products\/menu-v1\/desserts--san-sebastian-cheesecake\.webp"/,
  "Reveal loader must match the relative src form written by the menu runtime"
);
assert.match(
  loaderSource,
  /URLSearchParams\(location\.search\)\.get\("product"\)/,
  "Deck product links must use an explicit product query parameter"
);
assert.match(
  loaderSource,
  /data-product-id/,
  "Product deep links must reuse the existing rendered product controls"
);

const runtimeSource = readFileSync(resolve(root, "menu-product-reveal-runtime.js"), "utf8");
assert.ok(
  runtimeSource.indexOf('sourceImage.getAttribute("src")') < runtimeSource.indexOf("sourceImage.currentSrc"),
  "Reveal matching must prefer the newly assigned src attribute over possibly stale currentSrc"
);
assert.match(
  runtimeSource,
  /menu-catalog\.js\?v=20260904-premium-order-v1/,
  "Pairing bridge must reuse the exact catalog module already loaded by the menu"
);
assert.doesNotMatch(
  runtimeSource,
  /gallery-v5\/san-sebastian\.webp/,
  "Reveal must not use the gallery poster as a food-photo alternate view"
);
assert.doesNotMatch(
  runtimeSource,
  /createElement\(["']style["']\)|style\.textContent/,
  "Reveal runtime must not inject inline style blocks rejected by menu CSP"
);

console.log("menu product reveal + pairing + deep-link contract: PASS");
