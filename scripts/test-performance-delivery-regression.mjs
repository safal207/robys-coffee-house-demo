import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the first feed photo uses a single, entry-specific hint without speculative HTML downloads", () => {
  const html = read("menu-feed.html");
  const source = read("src/menu-feed.js");
  const shipped = read("menu-feed.js");
  assert.doesNotMatch(html, /<link\b[^>]*rel="preload"[^>]*as="image"/i,
    "Static hints would also download the wrong product for deep links and empty searches");
  assert.ok(source.includes("const initialLead = productIndex.get(entry.productId) ?? filterFeed(products, entry.category, searchInput.value)[0]"));
  assert.ok(source.includes("if (initialLead)"));
  assert.ok(source.includes('hint.imageSrcset = `${compact} 512w, ${initialLead.image} 1024w`'));
  assert.ok(source.includes('hint.href = initialLead.image; document.head.append(hint)'));
  assert.ok(shipped.includes('imageSrcset'), "The shipped feed must retain the responsive runtime hint");
});

test("hero remains eager while interaction-only QA enhancements load from a versioned module", () => {
  const main = read("qa.js");
  const source = read("src/qa.js");
  const enhancements = read("qa-enhancements.js");
  const revision = createHash("sha256").update(enhancements).digest("hex").slice(0, 12);
  assert.ok(source.includes("function enableHeroVideo()"));
  assert.ok(main.includes("src/robys-ambience-clean.mp4"));
  const expected = transformSync(source.replace(
    /(import\("\.\/qa-enhancements\.js)(?:\?v=[^"]*)?("\))/, `$1?v=${revision}$2`),
    { minify: true, charset: "utf8", target: "es2020", legalComments: "none" }).code;
  assert.equal(main, expected, "Shipped QA must be the deterministic minified authored source");
  assert.ok(main.includes(`import("./qa-enhancements.js?v=${revision}")`));
  assert.ok(!main.includes("function setupLightboxAccessibility()"));
  assert.ok(!main.includes("function setupImageFallbacks()"));
  assert.ok(enhancements.includes("export function initQaEnhancements()"));
  assert.ok(enhancements.includes("function setupLightboxAccessibility()"));
  assert.ok(enhancements.includes('setInert(node.classList.contains("is-open"));'), "Already-open dialogs must receive focus protection after lazy activation");
  assert.ok(enhancements.includes("function setupImageFallbacks()"));
  assert.ok(read("sw-core-v64.js").includes(`"./qa-enhancements.js?v=${revision}"`));
});
