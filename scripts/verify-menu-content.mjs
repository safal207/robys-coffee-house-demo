import { readFileSync } from "node:fs";

const baseline = JSON.parse(readFileSync("qa/menu-content-baseline.json", "utf8"));
const source = readFileSync("menu-data.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { menuCopy, menuCategories } = await import(moduleUrl);

function assert(condition, message) {
  if (!condition) throw new Error(`[MENU-CONTENT-001] ${message}`);
}

function assertTranslationSet(value, label) {
  assert(value && typeof value === "object", `${label} translations are missing`);
  for (const language of baseline.languages) {
    assert(typeof value[language] === "string" && value[language].trim().length > 0, `${label} is missing ${language}`);
  }
}

assert(Array.isArray(menuCategories), "menuCategories must be an array");
assert(menuCategories.length === baseline.categoryCount, `Expected ${baseline.categoryCount} categories, found ${menuCategories.length}`);
assert(Object.keys(baseline.prices).length === baseline.itemCount, "Baseline price count does not match itemCount");

for (const language of baseline.languages) {
  const copy = menuCopy?.[language];
  assert(copy && typeof copy === "object", `Missing ${language} page copy`);
  for (const key of ["pageTitle", "pageLead", "back", "searchLabel", "searchPlaceholder", "all", "noResults", "priceNote", "route", "categories"]) {
    assert(typeof copy[key] === "string" && copy[key].trim().length > 0, `Missing ${language}.${key} page copy`);
  }
}

const seenCategoryIds = new Set();
const actualPrices = {};
let itemCount = 0;

for (const category of menuCategories) {
  assert(typeof category.id === "string" && category.id.length > 0, "Category id is missing");
  assert(!seenCategoryIds.has(category.id), `Duplicate category id: ${category.id}`);
  seenCategoryIds.add(category.id);
  assertTranslationSet(category.name, `Category ${category.id}`);
  assert(typeof category.icon === "string" && category.icon.length > 0, `Category ${category.id} icon is missing`);

  const hasItems = Array.isArray(category.items);
  const hasGroups = Array.isArray(category.groups);
  assert(hasItems !== hasGroups, `Category ${category.id} must use either items or groups`);

  const entries = [];
  if (hasItems) {
    entries.push(...category.items);
  } else {
    assert(category.groups.length > 0, `Category ${category.id} has no groups`);
    for (const [groupIndex, group] of category.groups.entries()) {
      assertTranslationSet(group.label, `Category ${category.id} group ${groupIndex + 1}`);
      assert(Array.isArray(group.items) && group.items.length > 0, `Category ${category.id} group ${groupIndex + 1} has no items`);
      entries.push(...group.items);
    }
  }

  const expectedCategoryCount = baseline.categories[category.id];
  assert(Number.isInteger(expectedCategoryCount), `Category ${category.id} is missing from the baseline`);
  assert(entries.length === expectedCategoryCount, `Category ${category.id}: expected ${expectedCategoryCount} items, found ${entries.length}`);

  for (const [itemIndex, item] of entries.entries()) {
    const itemLabel = `${category.id} item ${itemIndex + 1}`;
    assertTranslationSet(item.name, itemLabel);
    if (item.description !== undefined) assertTranslationSet(item.description, `${itemLabel} description`);
    assert(Number.isInteger(item.price) && item.price > 0, `${itemLabel} has an invalid price`);

    const key = `${category.id}::${item.name.tr.trim()}`;
    assert(!(key in actualPrices), `Duplicate menu key: ${key}`);
    actualPrices[key] = item.price;
    itemCount += 1;
  }
}

assert(itemCount === baseline.itemCount, `Expected ${baseline.itemCount} items, found ${itemCount}`);

const actualKeys = Object.keys(actualPrices).sort();
const expectedKeys = Object.keys(baseline.prices).sort();
assert(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), "Menu item set differs from the verified baseline");

for (const key of expectedKeys) {
  assert(actualPrices[key] === baseline.prices[key], `${key}: expected ${baseline.prices[key]} ₺, found ${actualPrices[key]} ₺`);
}

console.log(`✅ MENU-CONTENT-001 passed: ${baseline.categoryCount} categories, ${itemCount} items, ${baseline.languages.length} languages, all verified prices unchanged.`);
