import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const analytics = readFileSync("analytics.js", "utf8");
const index = readFileSync("index.html", "utf8");
const menuData = readFileSync("menu-data.js", "utf8");
const menuRuntime = readFileSync("menu-page.js", "utf8");

assert.match(analytics, /const pairingCtaCopy = \{[\s\S]*tr: "Bugünün Eşleşmesini Gör"[\s\S]*en: "See Today's Pairing"[\s\S]*ru: "Смотреть сочетание дня"/);
assert.match(analytics, /cta\.href = "menu\.html#pairing-offers"/);
assert.match(analytics, /cta\.removeAttribute\("target"\)/);
assert.match(analytics, /cta\.removeAttribute\("rel"\)/);
assert.match(analytics, /cta\.dataset\.analyticsAction = "pairing_click"/);
assert.match(analytics, /track\(analyticsAction, \{ placement: placementFor\(link\) \}\)/);
assert.match(analytics, /new MutationObserver\(updateHeroPairingCta\)/);

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

console.log("✅ PAIRING-CTA-001: hero routes to the first pairing category, stays localized, emits pairing_click, and preserves route actions lower in the journey.");
