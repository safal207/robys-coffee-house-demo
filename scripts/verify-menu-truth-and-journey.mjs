import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function importSource(path) {
  const source = readFileSync(path, "utf8");
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(url);
}

const { menuCategories } = await importSource("menu-data.js");
const { menuTruth, pairingTruth } = await importSource("menu-truth.js");
const posters = readFileSync("pairing-posters.js", "utf8");
const integrity = readFileSync("menu-integrity.js", "utf8");
const searchPolicy = readFileSync("menu-search-policy.js", "utf8");
const styles = readFileSync("menu-integrity.css", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");

assert.equal(menuTruth.schemaVersion, 1);
assert.match(menuTruth.menuVersion, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(menuTruth.currency, "TRY");
assert.equal(menuTruth.digitalSource, "menu-data.js");
assert.equal(menuTruth.operationalAuthority, "robys-cafe-management");
assert.equal(menuTruth.priceComparisonRule, "never-display-unapproved-comparison");

const pairingCategory = menuCategories.find((category) => category.id === "pairing-offers");
assert.ok(pairingCategory?.items?.length, "pairing category must contain offers");

function categoryItems(category) {
  return category.items ?? category.groups.flatMap((group) => group.items);
}

function findComponent(component) {
  const category = menuCategories.find((entry) => entry.id === component.categoryId);
  assert.ok(category, `missing component category ${component.categoryId}`);
  const item = categoryItems(category).find((entry) => entry.name?.tr === component.nameTr);
  assert.ok(item, `missing component ${component.nameTr}`);
  assert.equal(typeof item.price, "number", `component ${component.nameTr} has no numeric price`);
  return item;
}

for (const pairing of pairingCategory.items) {
  const truth = pairingTruth[pairing.journeyId];
  assert.ok(truth, `missing truth metadata for ${pairing.journeyId}`);
  assert.equal(truth.pairingItemId, pairing.id);
  assert.ok(["standalone-approved-offer", "menu-total"].includes(truth.pricingMode));
  assert.ok(Array.isArray(truth.components) && truth.components.length >= 2);

  const componentTotal = truth.components.reduce((sum, component) => {
    const item = findComponent(component);
    return sum + item.price * component.quantity;
  }, 0);

  if (truth.pricingMode === "menu-total") {
    assert.equal(truth.comparisonMode, "component-total");
    assert.equal(pairing.price, componentTotal, `${pairing.id} must equal its component total`);
  } else {
    assert.equal(truth.comparisonMode, "none");
    assert.notEqual(pairing.price, componentTotal, `${pairing.id} must remain an explicitly separate approved price`);
    for (const language of ["tr", "en", "ru"]) {
      assert.ok(truth.label?.[language]?.trim(), `${pairing.id} missing ${language} price label`);
      assert.ok(truth.explanation?.[language]?.trim(), `${pairing.id} missing ${language} explanation`);
    }
  }
}

assert.doesNotMatch(posters, /oldPrice|pairing-poster-old-price|340 ₺/);
assert.doesNotMatch(posters, /PAIR OF THE DAY/);
assert.match(posters, /ROBY'S PAIRING/);
assert.match(posters, /pairing-poster-price-context/);
assert.match(posters, /import "\.\/menu-integrity\.js"/);
assert.match(posters, /import "\.\/menu-search-policy\.js"/);
assert.match(posters, /import \{ pairingTruth \} from "\.\/menu-truth\.js"/);

assert.match(integrity, /menu_search_expanded_global/);
assert.match(integrity, /menu-category-chip/);
assert.match(integrity, /aria-pressed/);
assert.match(integrity, /menuRoot\.removeAttribute\("aria-live"\)/);
assert.match(integrity, /menu-results-status/);
assert.match(integrity, /role", "status"/);
assert.match(integrity, /pairing_show_barista/);
assert.match(integrity, /pairing_directions_click/);
assert.match(integrity, /menu_version: menuTruth\.menuVersion/);
assert.match(integrity, /dataset\.menuIntegrityReady/);
assert.match(integrity, /menuObserver\?\.disconnect/);
assert.match(integrity, /setText\(/);
assert.match(integrity, /setAttribute\(/);
assert.match(integrity, /function closeDialog/);
assert.match(integrity, /showBaristaLabel/);
assert.doesNotMatch(integrity, /fetch\(|XMLHttpRequest|sendBeacon|Notification\.requestPermission/);
assert.doesNotMatch(integrity, /localStorage|sessionStorage/);
assert.doesNotMatch(integrity, /\.innerHTML\s*=/);

assert.match(searchPolicy, /menu_search_cleared_for_category/);
assert.match(searchPolicy, /input\.value = ""/);
assert.match(searchPolicy, /new Event\("input", \{ bubbles: true \}\)/);
assert.match(searchPolicy, /capture: true/);
assert.doesNotMatch(searchPolicy, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);

assert.match(styles, /\.full-menu-item--visual\.pairing-poster-card \.full-menu-item-details\{\s*display:block/);
assert.match(styles, /pairing-card-actions/);
assert.match(styles, /pairing-poster-price-context/);
assert.match(styles, /min-height:52px/);
assert.match(styles, /focus-visible/);
assert.match(styles, /prefers-reduced-motion/);

assert.match(menuHtml, /menu-integrity\.css\?v=menu-truth-20260729-3/);
assert.match(menuHtml, /pairing-posters\.js\?v=menu-truth-20260729-3/);
assert.match(menuHtml, /id="menu-root"/);

console.log("✅ MENU-TRUTH-001 passed: pairing prices are explainable, global search escapes active categories, explicit category choice exits search, pairing actions are visible and accessible, and menu ownership/version metadata is explicit.");
