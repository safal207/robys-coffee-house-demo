import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("menu.html", "utf8");
const runtime = readVerifiedMenuSource();
const styles = `${readFileSync("menu-premium.css", "utf8")}\n${readFileSync("menu-security-v2.css", "utf8")}`;
const serviceWorker = readFileSync("sw.js", "utf8");
const menuSource = readFileSync("menu-catalog.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(menuSource).toString("base64")}`;
const { menuCategories, menuCopy } = await import(moduleUrl);

for (const id of [
  "menu-cart-trigger",
  "menu-product-dialog",
  "menu-cart-dialog",
  "menu-quantity-decrease",
  "menu-quantity-increase",
  "menu-add-to-cart",
  "menu-cart-lines",
  "menu-cart-dialog-total"
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing menu order control #${id}`);
}

assert.match(html, /<dialog\b[^>]*id="menu-product-dialog"/, "Product detail must use a native dialog");
assert.match(html, /<dialog\b[^>]*id="menu-cart-dialog"/, "Cart summary must use a native dialog");
assert.equal((html.match(/data-menu-cart-status/g) ?? []).length, 3, "Cart announcements need outside, product-dialog and cart-dialog live regions");
const productDialogMarkup = html.match(/<dialog\b[^>]*id="menu-product-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
const cartDialogMarkup = html.match(/<dialog\b[^>]*id="menu-cart-dialog"[\s\S]*?<\/dialog>/)?.[0] ?? "";
assert.match(productDialogMarkup, /data-menu-cart-status[^>]*role="status"[^>]*aria-live="polite"/, "Product dialog needs an active cart live region");
assert.match(cartDialogMarkup, /data-menu-cart-status[^>]*role="status"[^>]*aria-live="polite"/, "Cart dialog needs an active cart live region");
assert.match(
  html,
  /<img\b(?=[^>]*id=["']menu-product-image["'])(?=[^>]*src=["']src\/products\/menu-v1\/[^"']+\.webp["'])[^>]*>/,
  "The closed product dialog must expose a decodable branded image source before its first interaction"
);
assert.match(html, /href="smart-choice\/"/, "Full menu must expose the Smart Choice route");
assert(!/<form\b/i.test(html), "Order calculator must not imply that it submits an order");

for (const language of ["tr", "en", "ru"]) {
  for (const key of [
    "smartChoice",
    "cart",
    "cartTitle",
    "total",
    "quantity",
    "addToCart",
    "orderDraft",
    "openProduct",
    "quantityUpdated",
    "removedFromCart",
    "maxQuantity"
  ]) {
    assert(menuCopy[language]?.[key]?.trim(), `Missing ${language}.${key} menu order copy`);
  }
}

const pluralCases = [
  ["tr", 1, "ürün"],
  ["tr", 2, "ürün"],
  ["en", 1, "item"],
  ["en", 2, "items"],
  ["ru", 1, "позиция"],
  ["ru", 2, "позиции"],
  ["ru", 5, "позиций"],
  ["ru", 21, "позиция"]
];
for (const [language, quantity, expected] of pluralCases) {
  const forms = menuCopy[language]?.itemCount;
  const category = new Intl.PluralRules({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language]).select(quantity);
  assert((forms?.[category] ?? forms?.other) === expected, `Wrong ${language} cart noun for ${quantity}`);
}

const visualItemCount = menuCategories.reduce((total, category) => {
  const items = category.items ?? category.groups.flatMap((group) => group.items);
  return total + items.length;
}, 0);
assert.equal(visualItemCount, 63, "Every current menu item and pairing must remain available to the product dialog");

for (const contract of [
  'const CART_STORAGE_KEY = "robys-menu-order.v1"',
  "sessionStorage.getItem(CART_STORAGE_KEY)",
  "sessionStorage.setItem(CART_STORAGE_KEY",
  "media.addEventListener(\"click\", () => openProduct(id))",
  "total += product.item.price * lineQuantity",
  "product.item.price * selectedProductQuantity",
  'const localeTag = { tr: "tr-TR", en: "en-US", ru: "ru-RU" }',
  "new Intl.NumberFormat(localeTag[language]",
  "new Intl.PluralRules(localeTag[language]).select(count)",
  "formatItemCount(summary.quantity)",
  "const availableQuantity = Math.max(0, MAX_ITEM_QUANTITY - currentQuantity)",
  "const addedQuantity = Math.min(selectedProductQuantity, MAX_ITEM_QUANTITY - currentQuantity)",
  "announceCart(`${copy.added}: ${localized(product.item.name)} × ${addedQuantity}`)",
  'document.querySelectorAll("[data-menu-cart-status]")',
  "cartStatuses.forEach((status) =>",
  "function renderCart(focusTarget = null)",
  'categoryNav.dataset.ready = "true"',
  'menuRoot.dataset.ready = "true"',
  "setCartQuantity(id, lineQuantity - 1, \"decrease\", true)",
  "setCartQuantity(id, lineQuantity + 1, \"increase\", true)",
  "setCartQuantity(id, 0, \"remove\", true)",
  "copy.removedFromCart",
  "copy.quantityUpdated",
  "(focusCandidate ?? fallback)?.focus({ preventScroll: true })",
  "typeof dialog.showModal === \"function\"",
  "dialog.classList.add(\"menu-dialog--fallback\")",
  "fallbackFocusableControls(dialog)",
  "event.key === \"Escape\"",
  "cartLinesRoot.replaceChildren()",
  "document.createElement(\"button\")"
]) {
  assert(runtime.includes(contract), `Menu order runtime contract is missing: ${contract}`);
}
assert(!runtime.includes('new Intl.NumberFormat("tr-TR"'), "Menu totals must follow the selected language locale");
assert(!runtime.includes("innerHTML"), "Menu order runtime must use safe DOM construction");
assert(!html.includes('src="menu-ready.js'), "Menu readiness must not require an extra render-blocking request");

for (const contract of [
  "/* PREMIUM-MENU-ORDER-V1 */",
  ".full-menu-item-media{appearance:none",
  ".menu-dialog::backdrop",
  ".menu-dialog:not([open]){display:none}",
  "max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px)",
  ".menu-product-shell{display:grid",
  ".menu-cart-line{display:grid",
  "@media(max-width:760px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  assert(styles.includes(contract), `Menu order responsive styling is missing: ${contract}`);
}
assert.match(
  styles,
  /\.menu-product-shell\{[^}]*overflow:auto/,
  "Product dialog must remain vertically scrollable on short and mobile viewports"
);
assert.doesNotMatch(
  styles,
  /\.menu-product-shell\{[^}]*overflow:hidden/,
  "Product dialog shell must not clip the add-to-order controls"
);
assert(
  /href="menu-security-v2\.css\?v=[a-f0-9]{12}"/.test(html),
  "Menu must load the cache-new dialog fallback stylesheet at its content revision"
);
assert(
  serviceWorker.includes('"./menu-security-v2.css?v=') &&
    serviceWorker.includes('url.pathname.endsWith("/menu-security-v2.css")'),
  "Dialog fallback stylesheet must be precached and matched at its exact revision"
);

console.log(`✅ MENU-ORDER-001 passed: ${visualItemCount} clickable photos, localized modal, session cart, quantity controls and total calculator are wired.`);
