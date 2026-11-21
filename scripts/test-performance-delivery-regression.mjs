import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the default feed's earliest photograph has an exact responsive preload", () => {
  const first = feedProducts(menuCategories)[0];
  const compact = first.image.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-512.webp");
  const html = read("menu-feed.html");
  assert.ok(html.includes(`href="${first.image}"`));
  assert.ok(html.includes(`imagesrcset="${compact} 512w, ${first.image} 1024w"`));
  assert.ok(html.includes('imagesizes="(max-width: 460px) 100vw, 460px"'));
  assert.ok(html.includes('fetchpriority="high"'));
});

test("hero remains eager while interaction-only QA enhancements load from a versioned module", () => {
  const main = read("qa.js");
  const enhancements = read("qa-enhancements.js");
  const revision = createHash("sha256").update(enhancements).digest("hex").slice(0, 12);
  assert.ok(main.includes('function enableHeroVideo()'));
  assert.ok(main.includes(`import("./qa-enhancements.js?v=${revision}")`));
  assert.ok(!main.includes("function setupLightboxAccessibility()"));
  assert.ok(!main.includes("function setupImageFallbacks()"));
  assert.ok(enhancements.includes("export function initQaEnhancements()"));
  assert.ok(enhancements.includes("function setupLightboxAccessibility()"));
  assert.ok(enhancements.includes("function setupImageFallbacks()"));
  assert.ok(read("sw-core-v64.js").includes(`"./qa-enhancements.js?v=${revision}"`));
});
