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
assert.equal(sanSebastian.revealImage, "src/products/gallery-v5/san-sebastian.webp");
assert.ok(
  existsSync(resolve(root, sanSebastian.revealImage)),
  "Reveal image must be a real repository asset"
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

const loader = readFileSync(resolve(root, "menu-search-clear.js"), "utf8");
assert.match(
  loader,
  /import\("\.\/menu-product-reveal\.js\?v=20260909-reveal-v1"\)\.catch\(\(\) => \{\}\)/,
  "Reveal module must stay a caught progressive enhancement so menu bootstrap cannot fail with it"
);

console.log("menu product reveal contract: PASS");
