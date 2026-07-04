import "./verify-pairing-cta-static.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analytics = readFileSync("analytics.js", "utf8");
const index = readFileSync("index.html", "utf8");
const menuData = readFileSync("menu-data.js", "utf8");
const menuRuntime = readFileSync("menu-page.js", "utf8");

assert.match(analytics, /const analyticsAction = link\.dataset\.analyticsAction/);
assert.match(analytics, /if \(analyticsAction\) track\(analyticsAction, \{ placement: placementFor\(link\) \}\)/);
assert.equal(analytics.includes("pairingCtaCopy"), false, "analytics must not own pairing CTA copy");
assert.equal(analytics.includes("updateHeroPairingCta"), false, "analytics must not rewrite pairing CTA markup");
assert.equal(analytics.includes("MutationObserver"), false, "analytics must not duplicate app localization");

const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
assert.match(heroActions, /class="button button-primary"/);
assert.match(heroActions, /class="button button-ghost" href="menu\.html"/);

const firstCategory = menuData.match(/export const menuCategories = \[\s*\{\s*id: "([^"]+)"/)?.[1];
assert.equal(firstCategory, "pairing-offers", "Pairing offers must remain the first menu category");
assert.match(menuRuntime, /window\.location\.hash\.slice\(1\)/);
assert.match(menuRuntime, /menuCategories\.some\(\(category\) => category\.id === requested\)/);
assert.match(menuRuntime, /document\.querySelector\("\.full-menu-wrap"\)\?\.scrollIntoView/);

assert.match(index, /<section class="section visit-section" id="visit">[\s\S]*google\.com\/maps\/dir\//);
assert.match(index, /<nav class="mobile-cta"[\s\S]*google\.com\/maps\/dir\//);

console.log("✅ PAIRING-CTA-001: static hero routes to the first pairing category, app owns localization, analytics emits pairing_click, and route actions remain lower in the journey.");
