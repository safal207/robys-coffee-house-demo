import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("menu.html", "utf8");
const runtime = readFileSync("menu-page.js", "utf8");
const styles = readFileSync("menu.css", "utf8");
const menuSource = readFileSync("menu-data.js", "utf8");
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
    "maxQuantity"
  ]) {
    assert(menuCopy[language]?.[key]?.trim(), `Missing ${language}.${key} menu order copy`);
  }
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
  "const availableQuantity = Math.max(0, MAX_ITEM_QUANTITY - currentQuantity)",
  "const addedQuantity = Math.min(selectedProductQuantity, MAX_ITEM_QUANTITY - currentQuantity)",
  "announceCart(`${copy.added}: ${localized(product.item.name)} × ${addedQuantity}`)",
  "function renderCart(focusTarget = null)",
  "setCartQuantity(id, lineQuantity + 1, \"increase\")",
  "(focusCandidate ?? fallback)?.focus({ preventScroll: true })",
  "typeof dialog.showModal === \"function\"",
  "cartLinesRoot.replaceChildren()",
  "document.createElement(\"button\")"
]) {
  assert(runtime.includes(contract), `Menu order runtime contract is missing: ${contract}`);
}
assert(!runtime.includes('new Intl.NumberFormat("tr-TR"'), "Menu totals must follow the selected language locale");
assert(!runtime.includes("innerHTML"), "Menu order runtime must use safe DOM construction");

for (const contract of [
  "/* PREMIUM-MENU-ORDER-V1 */",
  ".full-menu-item-media{appearance:none",
  ".menu-dialog::backdrop",
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

console.log(`✅ MENU-ORDER-001 passed: ${visualItemCount} clickable photos, localized modal, session cart, quantity controls and total calculator are wired.`);
