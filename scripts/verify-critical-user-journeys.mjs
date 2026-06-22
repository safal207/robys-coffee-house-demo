import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_LANGUAGES = ["tr", "en", "ru"];
const indexHtml = readFileSync("index.html", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const menuPageRuntime = readFileSync("menu-page.js", "utf8");
const clearSearchRuntime = readFileSync("menu-search-clear.js", "utf8");
const appRuntime = readFileSync("src/app.ts", "utf8");
const menuDataSource = readFileSync("menu-data.js", "utf8");
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const menuModuleUrl = `data:text/javascript;base64,${Buffer.from(menuDataSource).toString("base64")}`;
const { menuCategories, menuCopy } = await import(menuModuleUrl);

function assert(condition, contract, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

function contractById(id) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  assert(contract, id, `${id} is missing from qa/regression-dashboard.json`);
  assert(contract.status === "gated", id, `${id} must remain gated`);
  assert(["P0", "P1", "P2"].includes(contract.severity), id, `${id} must declare severity`);
  assert(contract.businessImpact, id, `${id} must declare businessImpact`);
  assert(contract.owner === "QA", id, `${id} owner must remain QA`);
  assert(contract.evidence === "CI", id, `${id} evidence must remain CI`);
  assert(Array.isArray(contract.devices) && contract.devices.length > 0, id, `${id} must list covered devices`);
  return contract;
}

function htmlIds(html) {
  return new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/gi), (match) => match[1]));
}

function anchorHrefs(html) {
  return Array.from(html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi), (match) => ({
    href: match[1],
    tag: match[0]
  }));
}

function languageButtons(html) {
  return Array.from(html.matchAll(/<button\b[^>]*\bclass=["'][^"']*\blang-button\b[^"']*["'][^>]*\bdata-lang=["']([^"']+)["'][^>]*>/gi), (match) => match[1]).sort();
}

function flattenItems(category) {
  if (Array.isArray(category.items)) return category.items;
  return (category.groups ?? []).flatMap((group) => group.items ?? []);
}

function normalized(value) {
  return String(value)
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function localizedValues(value) {
  return REQUIRED_LANGUAGES.map((language) => value?.[language] ?? "");
}

function assertTranslations(value, contract, context) {
  for (const language of REQUIRED_LANGUAGES) {
    assert(typeof value?.[language] === "string" && value[language].trim(), contract, `${context} is missing ${language} translation`);
  }
}

function resolveInternalHref(href, currentFile) {
  if (!href || /^(?:https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(href)) return null;
  const url = new URL(href, `https://example.invalid/${currentFile}`);
  let targetFile = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!targetFile) targetFile = "index.html";
  return { targetFile, hash: decodeURIComponent(url.hash.slice(1)) };
}

function verifyInternalLinks(html, currentFile, dynamicIdsByFile = new Map()) {
  const contract = "NAV-001";
  for (const { href } of anchorHrefs(html)) {
    const resolved = resolveInternalHref(href, currentFile);
    if (!resolved) continue;

    const cleanFile = path.posix.normalize(resolved.targetFile);
    assert(!cleanFile.startsWith("../"), contract, `${currentFile} contains an escaping link: ${href}`);
    assert(existsSync(cleanFile), contract, `${currentFile} links to missing file: ${href}`);

    if (!resolved.hash) continue;
    const targetHtml = cleanFile === "index.html" ? indexHtml : cleanFile === "menu.html" ? menuHtml : readFileSync(cleanFile, "utf8");
    const validIds = new Set([...htmlIds(targetHtml), ...(dynamicIdsByFile.get(cleanFile) ?? [])]);
    assert(validIds.has(resolved.hash), contract, `${currentFile} links to missing anchor: ${href}`);
  }
}

function searchMenu(query, categoryId = "all") {
  const needle = normalized(query);
  const results = [];
  for (const category of menuCategories) {
    if (categoryId !== "all" && category.id !== categoryId) continue;
    for (const item of flattenItems(category)) {
      const haystack = [
        ...Object.values(item.name ?? {}),
        ...Object.values(item.description ?? {})
      ].join(" ");
      if (normalized(haystack).includes(needle)) results.push({ categoryId: category.id, item });
    }
  }
  return results;
}

const categoryIds = menuCategories.map((category) => category.id);
const dynamicIds = new Map([["menu.html", categoryIds]]);
verifyInternalLinks(indexHtml, "index.html", dynamicIds);
verifyInternalLinks(menuHtml, "menu.html", dynamicIds);

const previewLinks = Array.from(indexHtml.matchAll(/<a\b[^>]*\bclass=["'][^"']*\bmenu-card-link\b[^"']*["'][^>]*\bhref=["']menu\.html#([^"']+)["'][^>]*>/gi), (match) => match[1]);
assert(previewLinks.length === 6, "NAV-001", `Expected 6 menu preview links, found ${previewLinks.length}`);
assert(new Set(previewLinks).size === previewLinks.length, "NAV-001", "Menu preview links must be unique");
for (const id of previewLinks) assert(categoryIds.includes(id), "NAV-001", `Preview links to unknown category: ${id}`);
assert(/https:\/\/www\.instagram\.com\/robyscoffeehouse\//i.test(indexHtml), "NAV-001", "Instagram CTA must target @robyscoffeehouse");
assert(/google\.com\/maps\/search\/\?api=1&query=Roby%27s\+Coffee\+House\+Gazipasa/i.test(indexHtml), "NAV-001", "Route CTA must target Roby's Coffee House Gazipaşa");
contractById("NAV-001");

assert(categoryIds.length > 0, "MENU-001", "Menu must contain categories");
assert(new Set(categoryIds).size === categoryIds.length, "MENU-001", "Category ids must be unique");

for (const category of menuCategories) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.id), "MENU-001", `Category id is not URL-safe: ${category.id}`);
  assertTranslations(category.name, "MENU-001", `Category ${category.id}`);
  const items = flattenItems(category);
  assert(items.length > 0, "MENU-001", `Category ${category.id} is empty`);

  if (category.groups) {
    for (const [groupIndex, group] of category.groups.entries()) {
      assertTranslations(group.label, "MENU-001", `${category.id} group ${groupIndex + 1}`);
      assert(Array.isArray(group.items) && group.items.length > 0, "MENU-001", `${category.id} group ${groupIndex + 1} is empty`);
    }
  }

  for (const [itemIndex, item] of items.entries()) {
    assertTranslations(item.name, "MENU-001", `${category.id} item ${itemIndex + 1}`);
    if (item.description) assertTranslations(item.description, "MENU-001", `${category.id} item ${itemIndex + 1} description`);
    assert(Number.isFinite(item.price) && item.price > 0, "MENU-001", `${category.id} item ${itemIndex + 1} has invalid price`);
    assert(Number.isInteger(item.price), "MENU-001", `${category.id} item ${itemIndex + 1} price must be an integer TRY amount`);
  }

  for (const language of REQUIRED_LANGUAGES) {
    const names = items.map((item) => normalized(item.name[language]));
    assert(new Set(names).size === names.length, "MENU-001", `Duplicate ${language} item name in ${category.id}`);
  }
}

const lotus = menuCategories.flatMap(flattenItems).find((item) => item.name?.en === "Lotus Cheesecake");
assert(lotus, "MENU-001", "Lotus Cheesecake must remain in the menu");
assert(lotus.price === 190, "MENU-001", `Lotus Cheesecake price changed from protected value 190 ₺ to ${lotus.price} ₺`);
assert(menuPageRuntime.includes("Intl.NumberFormat") && menuPageRuntime.includes("₺"), "MENU-001", "Menu prices must render with Turkish formatting and ₺");
contractById("MENU-001");

const expectedLanguages = [...REQUIRED_LANGUAGES].sort();
assert(JSON.stringify(languageButtons(indexHtml)) === JSON.stringify(expectedLanguages), "I18N-001", "Main page language buttons must be exactly TR/EN/RU");
assert(JSON.stringify(languageButtons(menuHtml)) === JSON.stringify(expectedLanguages), "I18N-001", "Menu page language buttons must be exactly TR/EN/RU");

const copyKeys = Object.fromEntries(REQUIRED_LANGUAGES.map((language) => [language, Object.keys(menuCopy[language] ?? {}).sort()]));
assert(JSON.stringify(copyKeys.tr) === JSON.stringify(copyKeys.en), "I18N-001", "English menuCopy keys differ from Turkish");
assert(JSON.stringify(copyKeys.tr) === JSON.stringify(copyKeys.ru), "I18N-001", "Russian menuCopy keys differ from Turkish");
for (const language of REQUIRED_LANGUAGES) {
  for (const [key, value] of Object.entries(menuCopy[language])) {
    assert(typeof value === "string" && value.trim(), "I18N-001", `menuCopy.${language}.${key} is empty`);
  }
}

for (const source of [appRuntime, menuPageRuntime]) {
  assert(source.includes("robys-language"), "I18N-001", "Both runtimes must use the shared robys-language storage key");
  assert(source.includes("document.documentElement.lang"), "I18N-001", "Both runtimes must update the document language");
  assert(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/.test(source), "I18N-001", "Language persistence must fail safely when localStorage is unavailable");
}
assert(appRuntime.includes("[data-i18n],[data-i18n-rich],[data-localized]"), "I18N-001", "Main runtime must translate text, safe rich text and localized markup modes");
assert(menuPageRuntime.includes('const supportedLanguages = ["tr", "en", "ru"]'), "I18N-001", "Menu runtime must explicitly support TR/EN/RU");
for (const language of REQUIRED_LANGUAGES) assert(clearSearchRuntime.includes(`${language}:`), "I18N-001", `Clear-search label is missing ${language}`);
contractById("I18N-001");

assert(menuPageRuntime.includes("function normalize"), "SEARCH-001", "Search normalization function is missing");
assert(menuPageRuntime.includes("function filteredItems"), "SEARCH-001", "Item filtering function is missing");
assert(menuPageRuntime.includes('searchInput.addEventListener("input"'), "SEARCH-001", "Search input listener is missing");
assert(menuPageRuntime.includes("emptyState.hidden = rendered > 0"), "SEARCH-001", "Empty search state contract is missing");
assert(menuPageRuntime.includes("activeCategory === \"all\" || activeCategory === category.id"), "SEARCH-001", "Category and search filters must compose");
assert(!menuPageRuntime.includes("innerHTML"), "SEARCH-001", "Menu rendering must not use innerHTML with searchable content");
assert(menuPageRuntime.includes("textContent = localized(item.name)"), "SEARCH-001", "Item names must render through textContent");
assert(clearSearchRuntime.includes('event.key !== "Escape"'), "SEARCH-001", "Escape-to-clear behavior is missing");
assert(clearSearchRuntime.includes('new Event("input", { bubbles: true })'), "SEARCH-001", "Clear button must dispatch the normal input flow");
assert(clearSearchRuntime.includes("searchInput.focus()"), "SEARCH-001", "Focus must return to search after clearing");

assert(searchMenu("latte").length > 0, "SEARCH-001", "Latin search fixture no longer finds Latte");
assert(searchMenu("ЧИЗКЕЙК").length > 0, "SEARCH-001", "Russian case-insensitive search fixture no longer finds cheesecake");
assert(searchMenu("çikolata").length > 0, "SEARCH-001", "Turkish search fixture no longer finds chocolate products");
assert(searchMenu("yuzu").length === 1, "SEARCH-001", "Yuzu fixture must return exactly one item");
assert(searchMenu("lotus", "desserts").length === 1, "SEARCH-001", "Category + search fixture must find Lotus Cheesecake once");
assert(searchMenu("definitely-not-on-the-menu").length === 0, "SEARCH-001", "Unknown search fixture must return no results");
contractById("SEARCH-001");

console.log("✅ NAV-001 gated: internal navigation, deep links and critical CTAs resolve.");
console.log("✅ MENU-001 gated: menu structure, translations and protected prices are valid.");
console.log("✅ I18N-001 gated: TR/EN/RU coverage and persistence contracts are intact.");
console.log("✅ SEARCH-001 gated: multilingual search, filtering and clear behavior are intact.");
