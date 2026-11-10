import { readMenuStylesBundleInputs, verifyMenuStylesBundle } from "./menu-styles-bundle.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pairingOffer, resolveRevealConfig, revealCopy, ingredientRevealProducts, resolveIngredientConfig } from "../menu-product-reveal-runtime.js";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { menuCatalogRevision } from "./menu-catalog-revision.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const sanSebastian = resolveRevealConfig(
  "https://example.test/robys-coffee-house-demo/src/products/menu-v1/desserts--san-sebastian-cheesecake.webp?v=1"
);
assert.ok(sanSebastian, "San Sebastian must opt into product reveal");
assert.equal(sanSebastian.id, "desserts:san-sebastian-cheesecake");
assert.equal(sanSebastian.revealImage, "src/products/san-sebastian.webp");
assert.ok(existsSync(resolve(root, sanSebastian.revealImage)), "Reveal image must be a real repository asset");
const revealBytes = readFileSync(resolve(root, sanSebastian.revealImage));
assert.equal(revealBytes.toString("ascii", 0, 4), "RIFF", "Reveal photo must be an actual WebP image");
assert.equal(revealBytes.toString("ascii", 8, 12), "WEBP", "Reveal photo must retain its WebP container");
assert.equal(revealBytes.readUInt32LE(4) + 8, revealBytes.length, "Reveal photo must not be a truncated payload that exists but fails to decode");
assert.deepEqual(revealBytes, readFileSync(resolve(root, "src/products/menu-v1/desserts--san-sebastian-cheesecake.webp")), "The repaired fallback must reuse the approved food photo without an old embedded price");
assert.equal(sanSebastian.hasAlternateView, false, "Identical catalog/fallback photos must not advertise an alternate angle");
assert.ok(existsSync(resolve(root, "menu-product-reveal.css")), "Reveal styling must be served as a same-origin external stylesheet");

const pairing = pairingOffer();
assert.ok(pairing, "San Sebastian reveal must bridge to an existing catalog pairing");
assert.equal(pairing.category.id, "pairing-offers");
assert.equal(pairing.item.id, "iced-san-sebastian-pairing");
assert.equal(pairing.productId, "pairing-offers:iced-san-sebastian-pairing");
assert.equal(pairing.item.price, 370, "Pairing bridge price must come from the current menu catalog");
assert.equal(pairing.item.image, "src/products/sets-v1/iced-san-sebastian.webp");

assert.equal(resolveRevealConfig("src/products/menu-v1/desserts--lotus-cheesecake.webp"), null, "Products without an explicit reveal mapping must remain unchanged");
assert.equal(resolveRevealConfig("src/products/menu-v1/hot-coffee--caffe-latte.webp"), null, "Coffee products must not inherit the San Sebastian reveal");

const products = new Map(feedProducts(menuCategories).map(product => [product.id, product]));
assert.equal(ingredientRevealProducts.length, 9, "Only selected layered dishes opt into ingredient reveal");
assert.equal(new Set(ingredientRevealProducts.map(product => product.id)).size, ingredientRevealProducts.length);
for (const entry of ingredientRevealProducts) {
  const product = products.get(entry.id);
  assert.ok(product, `${entry.id}: every reveal item must exist in the actual menu`);
  assert.equal(resolveIngredientConfig(product.image)?.id, entry.id, `${entry.id}: use its own catalog photo`);
  assert.ok(entry.ingredients.length >= 2 && entry.ingredients.length <= 4);
  assert.ok(existsSync(resolve(root, product.image)), `${entry.id}: catalog photo exists`);
}
assert.equal(resolveIngredientConfig("src/products/menu-v1/hot-coffee--caffe-latte.webp"), null);

for (const language of ["tr", "en", "ru"]) {
  const copy = revealCopy(language);
  assert.ok(copy.label.length > 8, `${language}: accessible label is required`);
  assert.ok(copy.hint.length > 8, `${language}: visible swipe hint is required`);
  assert.ok(copy.value.includes("%{percent}"), `${language}: value copy must expose reveal percent`);
}

const menuHtml = readFileSync(resolve(root, "menu.html"), "utf8");
verifyMenuStylesBundle(readMenuStylesBundleInputs(root));
assert.match(menuHtml, /<script type="module" src="menu-product-reveal\.js\?v=[a-f0-9]{12}"><\/script>/, "Menu must mount a build-revisioned lightweight reveal loader");

const searchHelper = readFileSync(resolve(root, "menu-search-clear.js"), "utf8");
assert.doesNotMatch(searchHelper, /menu-product-reveal/, "Search helper must stay independent from product reveal");

const loaderSource = readFileSync(resolve(root, "menu-product-reveal.js"), "utf8");
assert.ok(Buffer.byteLength(loaderSource, "utf8") < 1000, "Always-loaded reveal/product-route loader must stay under 1.0 KB");
assert.match(loaderSource, /import\("\.\/menu-product-reveal-runtime\.js\?v=[a-f0-9]{12}"\)/, "Reveal runtime import must use the build revision");
assert.match(loaderSource, /san-sebastian-cheesecake/, "Reveal loader must still lazily activate on San Sebastian");
for (const entry of ingredientRevealProducts) {
  const slug = entry.file.replace(/^(desserts|food)--/, "").replace(/\.webp$/, "");
  assert.ok(loaderSource.includes(slug), `${entry.id}: selected product must activate the lazy loader`);
}
assert.match(loaderSource, /searchParams\.get\("product"\)/, "Deck product links must use an explicit product query parameter");
assert.match(loaderSource, /data-product-id/, "Product deep links must reuse the existing rendered product controls");
assert.match(loaderSource, /\.full-menu-item-media/, "Product deep links must click the existing product media control");
assert.match(loaderSource, /root\.dataset\.ready/, "Product deep links must wait for the real menu readiness marker");
assert.match(readFileSync(resolve(root, "menu-feed.html"), "utf8"), /<script type="module" src="menu-product-reveal\.js\?v=[a-f0-9]{12}"><\/script>/, "The photo feed must load the same lazy product control");

const runtimeSource = readFileSync(resolve(root, "menu-product-reveal-runtime.js"), "utf8");
assert.ok(runtimeSource.indexOf('sourceImage.getAttribute("src")') < runtimeSource.indexOf("sourceImage.currentSrc"), "Reveal matching must prefer the newly assigned src attribute over possibly stale currentSrc");
const catalogRevision = menuCatalogRevision(readFileSync(resolve(root, "menu-catalog.js")));
assert.ok(runtimeSource.includes(`from "./menu-catalog.js?v=${catalogRevision}"`), "Pairing bridge must reuse the exact catalog content revision already loaded by the menu");
assert.doesNotMatch(runtimeSource, /gallery-v5\/san-sebastian\.webp/, "Reveal must not use the gallery poster as a food-photo alternate view");
assert.doesNotMatch(runtimeSource, /createElement\(["']style["']\)|style\.textContent/, "Reveal runtime must not inject inline style blocks rejected by menu CSP");

console.log("menu product reveal + pairing + exact-product deep-link contract: PASS");
