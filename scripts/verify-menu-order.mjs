import { readVerifiedMenuSource, readVerifiedMenuOrderSource } from "./menu-runtime-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

const html = readFileSync("menu.html", "utf8");
const runtime = `${readVerifiedMenuSource()}\n${readVerifiedMenuOrderSource()}`;
const styles = `${readFileSync("menu-premium.css", "utf8")}\n${readFileSync("menu-security-v2.css", "utf8")}`;
const serviceWorker = readFileSync("sw-core-v64.js", "utf8");
const menuSource = readFileSync("menu-catalog.js", "utf8");
const stabilitySource = readFileSync("menu-stability.css");
assert.deepEqual(readFileSync("menu-stability-v2.css"), stabilitySource, "Delivered menu stability CSS must preserve the approved source bytes");
const stabilityRevision = createHash("sha256").update(stabilitySource).digest("hex").slice(0, 12);
assert(html.includes(`href="menu-stability-v2.css?v=${stabilityRevision}"`), "Menu stability CSS must bypass legacy pathname caches at its current revision");
assert(serviceWorker.includes(`"./menu-stability-v2.css?v=${stabilityRevision}"`), "Menu stability CSS must be precached at the delivered revision");
assert(serviceWorker.includes('url.pathname.endsWith("/menu-stability-v2.css")'), "Current workers must match menu stability CSS at its exact revision");
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
await import("./test-menu-formatters.mjs");

const visualItemCount = menuCategories.reduce((total, category) => {
  const items = category.items ?? category.groups.flatMap((group) => group.items);
  return total + items.length;
}, 0);
assert.equal(visualItemCount, 63, "Every current menu item and pairing must remain available to the product dialog");

for (const contract of [
  'const CART_STORAGE_KEY = "robys-menu-order.v1"',
  "readStoredOrderDraft(orderProductIds)",
  "transactStoredOrderDraft(updater, orderProductIds, { origin: MENU_ORDER_ORIGIN })",
  "media.addEventListener(\"click\", event => openProduct(id, event.currentTarget))",
  "total += product.item.price * lineQuantity",
  "quoteMenuSelection(quoteCart, products, selectedProductQuantity, MAX_ITEM_QUANTITY)",
  "formatPrice(total)",
  'const localeTag = { tr: "tr-TR", en: "en-US", ru: "ru-RU" }',
  "new Intl.NumberFormat(localeTag[language]",
  "new Intl.PluralRules(localeTag[language])",
  "formatItemCount(summary.quantity)",
  "addOrderGroup(current, items, quantity, orderProductIds)",
  "replaceOrderGroup(current, original, items, quantity, orderProductIds)",
  "if (!selection.applied)",
  "orderDraft = selection.draft",
  "orderDraft.groups.forEach",
  "updateOrderGroupQuantity(current, id, quantity, orderProductIds)",
  'groupName(lastAddedSelection)',
  'openDialog(cartDialog, cartTitle, returnFocus)',
  'returnFocus: checkoutButton',
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

// An edit reuses the capacity occupied by its original selection; an ordinary
// Add still quotes the entire latest basket. Execute the real allowance path.
const quantityHandler = runtime.match(/function updateProductQuantity\(\) \{[\s\S]*?\n\}/)?.[0];
const buttonLabelHandler = runtime.match(/function setAddButtonLabel\(label\) \{[\s\S]*?\n\}/)?.[0];
assert(quantityHandler);
assert(buttonLabelHandler, "The shipped Add label must preserve its text node during an active press");
for (const editing of [false, true]) {
  const fullCart = new Map([["drink", 99], ["sweet", 99], ["other", 7]]);
  let quoted;
  const boundary = new Error("quote captured");
  const context = {
    selectedProducts: () => [{ id: "drink" }, { id: "sweet" }],
    cart: fullCart, selectedProductQuantity: 2, MAX_ITEM_QUANTITY: 99,
    menuCopy: { en: {} }, language: "en",
    editingGroup: editing ? { quantity: 2, items: [{ id: "drink", quantity: 1 }, { id: "sweet", quantity: 1 }] } : null,
    quoteMenuSelection: cart => { quoted = JSON.parse(JSON.stringify(Array.from(cart))); throw boundary; }
  };
  assert.throws(() => runInNewContext(`${buttonLabelHandler}\n${quantityHandler}\nupdateProductQuantity();`, context), error => error === boundary);
  assert.deepEqual(quoted, [["drink", editing ? 97 : 99], ["sweet", editing ? 97 : 99], ["other", 7]],
    "Only an editor's original components release capacity in its quote");
  assert.deepEqual(Array.from(fullCart), [["drink", 99], ["sweet", 99], ["other", 7]], "Quoting never mutates the real basket");
}
{
  const text = { nodeType: 3, nodeValue: "Add" };
  let replacements = 0;
  const button = { firstChild: text, childNodes: [text],
    get textContent() { return this.firstChild.nodeValue; },
    set textContent(value) { replacements += 1; this.firstChild = { nodeType: 3, nodeValue: value }; this.childNodes = [this.firstChild]; }
  };
  const context = { addToCartButton: button };
  runInNewContext(`${buttonLabelHandler}\nsetAddButtonLabel("Add"); setAddButtonLabel("Add more"); setAddButtonLabel("Add more");`, context);
  assert.equal(button.firstChild, text, "Both unchanged and changed labels keep the active pointer target's text node");
  assert.equal(button.textContent, "Add more");
  assert.equal(replacements, 0, "Label refresh cannot replace the button subtree during a press");
}

// Exercise the real Add handler: a successful mutation confirms the selection,
// while a rejected or disabled Add must never advance to cart or checkout.
const addHandler = runtime.match(/async function addSelectedProduct\(\) \{[\s\S]*?\n\}/)?.[0];
assert(addHandler, "The menu Add handler must be available for behavior verification");
for (const mode of ["success", "rejected", "disabled", "edit-success", "edit-stale", "edit-cap"]) {
  const editing = mode.startsWith("edit-");
  const success = mode === "success" || mode === "edit-success";
  const events = [];
  const drink = { id: "test-drink", item: { name: { en: "Test drink" } } };
  const dessert = { id: "test-dessert", item: { name: { en: "Test dessert" } } };
  const productDialog = { hasAttribute: () => true };
  const cartDialog = {};
  const cartTitle = {};
  const origin = { name: "product photo" };
  const cartOrigin = { name: "cart trigger" };
  const originalGroup = { id: "original-pair", quantity: 2, items: [{ id: drink.id, quantity: 1 }, { id: dessert.id, quantity: 1 }] };
  const latestDraft = { groups: [originalGroup, { id: "unrelated" }] };
  const context = {
    productIndex: new Map([[drink.id, drink]]), selectedProductId: drink.id,
    selectedProductQuantity: 2, selectedProductVariant: "vanilla", language: "en",
    menuCopy: { en: { maxQuantity: "Maximum" } }, addToCartButton: { disabled: mode === "disabled" },
    cart: new Map(), readCart: () => { context.orderDraft = latestDraft; return new Map(); }, orderDraft: { groups: [] }, orderProductIds: new Set(),
    selectedProducts: () => [drink, dessert], addOrderGroup: () => ({ applied: success, draft: success ? { groups: [] } : latestDraft }),
    replaceOrderGroup: (draft, original, items, quantity) => {
      assert.equal(draft, latestDraft, "Save must replace against freshly read storage");
      assert.equal(original, originalGroup, "Save keeps the original snapshot for the stale guard");
      assert.equal(quantity, 2);
      assert.deepEqual(JSON.parse(JSON.stringify(items)), [{ id: drink.id, quantity: 1, variant: "vanilla" }, { id: dessert.id, quantity: 1 }]);
      return { applied: success, stale: mode === "edit-stale", draft: success ? { groups: [] } : latestDraft };
    },
    announceCart: () => events.push("rejected"), updateProductQuantity: () => {}, localized: value => value.en,
    rememberSelection: () => {}, saveCart: async updater => {
      const result = updater(latestDraft);
      context.orderDraft = result.draft;
      if (result.applied) events.push("saved");
      return result;
    }, renderCart: () => events.push("rendered"), productSession: 1, productSaving: false,
    lastAddedSelection: null, lastSelectionWasEdit: false, editingGroup: editing ? originalGroup : null,
    editingCartReturnFocus: editing ? cartOrigin : null,
    productEditError: { hidden: true, textContent: "", focus: () => events.push("edit error"),
      scrollIntoView: options => {
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { block: "center", inline: "nearest" });
        events.push("reveal edit error");
      } },
    editCopy: { en: { stale: "Changed elsewhere" } },
    cartCheckoutError: { hidden: false }, cartLinesRoot: { scrollTop: 40 },
    productDialog, cartDialog, cartTitle, cartTrigger: {}, dialogReturnFocus: new Map([[productDialog, origin]]),
    closeDialog: dialog => { assert.equal(dialog, productDialog); assert.equal(context.editingGroup, null, "Committed edits must not run the Cancel path"); events.push("closed product"); },
    openDialog: (dialog, focus, returnFocus) => {
      assert.equal(dialog, cartDialog); assert.equal(focus, cartTitle); assert.equal(returnFocus, editing ? cartOrigin : origin);
      events.push("opened confirmation");
    }
  };
  await runInNewContext(`${addHandler}\naddSelectedProduct();`, context);
  assert.deepEqual(events, success ? ["saved", "rendered", "closed product", "opened confirmation"] : editing ? ["edit error", "reveal edit error"] : mode === "rejected" ? ["rejected"] : []);
  if (editing && !success) {
    assert.equal(context.productEditError.hidden, false);
    assert.equal(context.productEditError.textContent, mode === "edit-stale" ? "Changed elsewhere" : "Maximum");
    assert.equal(context.orderDraft, latestDraft, "A rejected Save leaves the latest basket untouched");
  }
  if (success) {
    assert.deepEqual(JSON.parse(JSON.stringify(context.lastAddedSelection)), {
      items: [{ id: drink.id, quantity: 1, variant: "vanilla" }, { id: dessert.id, quantity: 1 }], quantity: 2
    }, "Confirmation must preserve the actual variant, pair and quantity");
    assert.equal(context.cartLinesRoot.scrollTop, 0);
    assert.equal(context.lastSelectionWasEdit, editing, "Confirmation distinguishes a replacement from an addition");
  }
}

// A delayed optional module must not pull a guest back into checkout after
// they have continued browsing, or move focus out of an already open QR.
const checkoutHandler = runtime.match(/checkoutButton\.addEventListener\("click", (async \(\) => \{[\s\S]*?\n\})\);/)?.[1]
  ?.replace(/await import\("\.\/order-checkout\.js\?v=[a-f0-9]+"\)/, "await loadCheckout()");
assert(checkoutHandler?.includes("await loadCheckout()"), "Execute the real checkout callback with a controlled module load");
for (const mode of ["open", "closed", "reopened", "empty", "missing-variant", "load-error"]) {
  let resolveLoad, rejectLoad, loadCount = 0, opens = 0, focuses = 0;
  let cartOpen = true;
  const context = {
    checkoutOpening: false, cartSession: 1, cart: new Map(), orderDraft: { groups: [{}] }, language: "en",
    readCart: () => new Map(), renderCart: () => {}, hasMissingVariant: () => mode === "missing-variant" && loadCount > 0,
    cartDialog: { hasAttribute: () => cartOpen }, checkoutButton: { disabled: false },
    cartCheckoutError: { hidden: true, textContent: "", focus: () => { focuses += 1; } },
    orderUiCopy: { en: { checkoutError: "Try again" } },
    loadCheckout: () => { loadCount += 1; return new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; }); }
  };
  const handler = runInNewContext(`(${checkoutHandler})`, context);
  const pending = handler();
  assert.equal(context.checkoutOpening, true);
  await handler();
  assert.equal(loadCount, 1, "A repeated action during loading must not open another checkout");
  if (mode === "closed") cartOpen = false;
  if (mode === "reopened") context.cartSession += 1;
  if (mode === "empty") context.orderDraft.groups = [];
  if (mode === "load-error") rejectLoad(new Error("offline"));
  else resolveLoad({ openOrderCheckout: async options => {
    assert.equal(options.returnFocus, context.checkoutButton);
    assert.equal(options.draft, context.orderDraft);
    opens += 1;
  } });
  await pending;
  assert.equal(opens, mode === "open" ? 1 : 0, mode);
  assert.equal(context.checkoutOpening, false, "Loading guard must release after success, cancellation or failure");
  assert.equal(focuses, mode === "load-error" ? 1 : 0);
  assert.equal(context.cartCheckoutError.hidden, mode !== "load-error", "Load errors stay visible in the cart");
}
const openDialogHandler = runtime.match(/function openDialog\([\s\S]*?\n\}/)?.[0];
assert(openDialogHandler);
let qrOpen = true, titleFocuses = 0, scheduledFocus;
const fakeCartDialog = {
  showModal() {}, hasAttribute: () => true, classList: { contains: () => false }
};
const dialogContext = {
  cartDialog: fakeCartDialog, cartSession: 0, dialogReturnFocus: new WeakMap(),
  document: { activeElement: {}, querySelector: () => qrOpen ? {} : null, body: { classList: { add() {} } } },
  window: { requestAnimationFrame: callback => { scheduledFocus = callback; } }
};
const openTestDialog = runInNewContext(`${openDialogHandler}\nopenDialog`, dialogContext);
openTestDialog(fakeCartDialog, { focus: () => { titleFocuses += 1; } });
scheduledFocus();
assert.equal(titleFocuses, 0, "Deferred cart focus must never steal focus from QR checkout");
qrOpen = false;
scheduledFocus();
assert.equal(titleFocuses, 1, "The confirmation heading receives focus when it is the active dialog");

const translateHandler = runtime.match(/function translateStaticPage\(\) \{[\s\S]*?\n\}/)?.[0];
assert(translateHandler);
const familyCopySource = runtime.match(/const familyCopy = \{[\s\S]*?\n\};/)?.[0];
assert(familyCopySource, "The family route needs localized entry copy");
const familyCopy = runInNewContext(`${familyCopySource}\nfamilyCopy`);
for (const language of ["tr", "en", "ru"]) {
  const element = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
  const iconClose = element();
  const chooseMore = element();
  const familyTrigger = element();
  let familyLanguage;
  const document = {
    documentElement: {},
    querySelectorAll: selector => selector === ".menu-dialog-close[data-menu-dialog-close]" ? [iconClose]
      : selector === "[data-menu-dialog-close]" ? [iconClose, chooseMore] : []
  };
  runInNewContext(`${translateHandler}\ntranslateStaticPage();`, {
    storageNotice: undefined,
    menuCopy, language, document, searchInput: element(), categoryNav: element(),
    productDecrease: element(), productIncrease: element(), languageButtons: [],
    orderUi: undefined, renderCart: () => {}, familyTrigger, familyCopy,
    familyUi: { refresh: nextLanguage => { familyLanguage = nextLanguage; } }
  });
  assert.equal(iconClose.attributes["aria-label"], menuCopy[language].close);
  assert.equal(chooseMore.attributes["aria-label"], undefined,
    "The Choose more text button must retain its visible action as its accessible name");
  assert.equal(familyTrigger.textContent, familyCopy[language].link, "Family entry follows the current language");
  assert.equal(familyLanguage, language, "An already loaded family picker receives language changes");
}

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
  /\.menu-product-main\{[^}]*overflow:auto/,
  "Product details and optional choices must remain scrollable on short and mobile viewports"
);
assert.match(
  styles,
  /\.menu-product-actions\{[^}]*flex:none/,
  "Quantity and Add controls must occupy their own non-shrinking footer"
);
assert.match(productDialogMarkup, /<div class="menu-product-main">[\s\S]*<\/div>\s*<footer class="menu-product-actions">[\s\S]*id="menu-add-to-cart"[\s\S]*<\/footer>/,
  "The product action must stay outside the scrolling optional choices");
assert.match(cartDialogMarkup, /id="menu-cart-title" tabindex="-1"/, "Add confirmation needs an accessible focus destination");
assert.match(cartDialogMarkup, /id="menu-cart-added-summary"/, "Cart confirmation must expose the added composition, quantity and amount");
assert(
  /href="menu-security-v2\.css\?v=[a-f0-9]{12}"/.test(html),
  "Menu must load the cache-new dialog fallback stylesheet at its content revision"
);
assert(
  serviceWorker.includes('"./menu-security-v2.css?v=') &&
    serviceWorker.includes('url.pathname.endsWith("/menu-security-v2.css")'),
  "Dialog fallback stylesheet must be precached and matched at its exact revision"
);

console.log(`✅ MENU-ORDER-001 passed: ${visualItemCount} clickable photos, localized modal, shared grouped cart, quantity controls and total calculator are wired.`);
