import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { menuTruth, pairingTruth } from "./menu-truth-model.mjs";

async function importSource(path) {
  const source = readFileSync(path, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const { menuCategories } = await importSource("menu-data.js");
const menuHtml = readFileSync("menu.html", "utf8");
const source = readFileSync("scripts/menu-page-runtime.mjs", "utf8");
const posters = readFileSync("pairing-posters.js", "utf8");
const styles = readFileSync("menu-integrity.css", "utf8");
const build = readFileSync("scripts/build.mjs", "utf8");
const menuPwa = readFileSync("menu-pwa.js", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const configMatch = menuHtml.match(/<div id="menu-truth-config" hidden>([\s\S]*?)<\/div>/);
assert.ok(configMatch, "menu truth config must be embedded in an inert hidden DOM node");
assert.doesNotMatch(menuHtml, /<script[^>]*id="menu-truth-config"/);
const config = JSON.parse(configMatch[1]);

assert.equal(config.schemaVersion, menuTruth.schemaVersion);
assert.equal(config.menuVersion, menuTruth.menuVersion);
assert.equal(config.currency, menuTruth.currency);
assert.equal(config.operationalAuthority, menuTruth.operationalAuthority);
assert.equal(config.approvedSource, menuTruth.approvedSource);
assert.equal(config.digitalSource, menuTruth.digitalSource);
for (const lang of ["tr", "en", "ru"]) {
  assert.ok(config.copy?.[lang]?.searchScope);
  assert.ok(config.copy?.[lang]?.showBarista);
  assert.ok(config.copy?.[lang]?.truthNote);
}

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory?.items?.length);
const categoryItems = (category) => category.items ?? category.groups.flatMap((group) => group.items);
const findComponent = (component) => {
  const category = menuCategories.find((entry) => entry.id === component.categoryId);
  assert.ok(category, `missing component category ${component.categoryId}`);
  const item = categoryItems(category).find((entry) => entry.name?.tr === component.nameTr);
  assert.ok(item, `missing component ${component.nameTr}`);
  return item;
};

for (const pairing of pairingCategory.items) {
  const truth = pairingTruth[pairing.journeyId];
  const runtimeTruth = config.pairings[pairing.journeyId];
  assert.ok(truth && runtimeTruth, `missing truth for ${pairing.journeyId}`);
  assert.equal(truth.pairingItemId, pairing.id);
  assert.equal(runtimeTruth.pricingMode, truth.pricingMode);
  assert.equal(runtimeTruth.comparisonMode, truth.comparisonMode);
  for (const lang of ["tr", "en", "ru"]) {
    assert.ok(runtimeTruth.label?.[lang]);
    assert.ok(runtimeTruth.explanation?.[lang]);
  }
  const total = truth.components.reduce((sum, component) => sum + findComponent(component).price * component.quantity, 0);
  if (truth.pricingMode === "menu-total") assert.equal(pairing.price, total);
  else {
    assert.equal(truth.comparisonMode, "none");
    assert.notEqual(pairing.price, total);
  }
}

assert.doesNotMatch(posters, /oldPrice|pairing-poster-old-price|340 ₺|PAIR OF THE DAY/);
assert.doesNotMatch(posters, /menu-integrity\.js|menu-search-policy\.js|menu-truth\.js/);
assert.match(posters, /dataset\.priceLabel/);
assert.match(posters, /ROBY'S PAIRING/);

for (const token of [
  "menu_search_expanded_global",
  "menu_search_cleared_for_category",
  "pairing_show_barista",
  "pairing_directions_click",
  "createPairingActions",
  "openPairingDialog",
  "menuIntegrityReady",
  "resultStatus",
  "searchScope"
]) assert.ok(source.includes(token), `unified menu source missing ${token}`);
assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|Notification\.requestPermission|innerHTML\s*=/);
assert.match(source, /localStorage\.getItem\("robys-language"\)/);
assert.match(source, /localStorage\.setItem\("robys-language"/);
assert.match(source, /document\.querySelector\("#menu-truth-config"\)/);
assert.match(source, /JSON\.parse\(configNode\.textContent/);
assert.match(source, /directions\.href = mapsUrl/);
assert.match(source, /directions\.target = "_blank"/);
assert.match(source, /directions\.rel = "noopener noreferrer"/);

assert.match(build, /scripts\/menu-page-runtime\.mjs/);
assert.match(build, /bundle: true/);
assert.match(build, /minify: true/);
assert.match(build, /outfile: "menu-page\.js"/);
assert.match(build, /synchronizeModuleScript\(menuHtml, "menu-page\.js"/);
assert.match(build, /menuPageAssetPattern/);

assert.match(styles, /\.full-menu-item--visual\.pairing-poster-card \.full-menu-item-details\{\s*display:block/);
assert.match(styles, /pairing-card-actions/);
assert.match(styles, /min-height:52px/);
assert.match(styles, /focus-visible/);
assert.match(styles, /prefers-reduced-motion/);

assert.match(menuHtml, /menu-integrity\.css\?v=menu-truth-20260729-3/);
assert.match(menuHtml, /pairing-posters\.js\?v=menu-truth-20260729-4/);
assert.match(menuHtml, /id="pairing-fulfilment-dialog"/);
assert.match(menuHtml, /<a class="button button-primary" data-dialog-directions><\/a>/);
assert.doesNotMatch(menuHtml, /<a class="button button-primary"[^>]*href=[^>]*data-dialog-directions/);
assert.match(menuHtml, /id="menu-results-status" role="status" aria-live="polite"/);
assert.doesNotMatch(menuHtml, /id="menu-root"[^>]*aria-live/);

assert.match(menuPwa, /sw\.js\?v=menu-truth-20260729-2/);
assert.match(serviceWorker, /robys-offline-v31-20260729-menu-truth/);
assert.match(serviceWorker, /\.\/menu-page\.js\?v=[a-f0-9]{12}/);
assert.match(serviceWorker, /url\.pathname\.endsWith\("\/menu-page\.js"\)/);
assert.doesNotMatch(serviceWorker, /menu-integrity\.js|menu-search-policy\.js|menu-truth\.js/);
assert.match(serviceWorker, /cache\.match\(request, \{ ignoreSearch: true \}\)/);

console.log("✅ MENU-TRUTH-001 passed: pricing truth, global search, visible pairing actions, deferred dialog routing and exact PWA delivery are integrated into one minified runtime built outside the production graph.");
