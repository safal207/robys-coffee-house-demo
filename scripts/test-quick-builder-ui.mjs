import assert from "node:assert/strict";
import { build } from "esbuild";

// A small DOM boundary test executes the real component's event handlers. It
// measures node identity and render counts; browser geometry is checked separately.
class TestElement extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.parentElement = null;
    this.dataset = {}; this.attributes = new Map(); this.className = ""; this.id = "";
    this.value = ""; this.disabled = false; this.replacements = 0; this._text = "";
  }
  get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
  set textContent(value) { this._text = String(value); this.children.forEach(child => { child.parentElement = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  append(...nodes) {
    for (const child of nodes) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(node => node !== child);
      child.parentElement = this; this.children.push(child);
    }
  }
  replaceChildren(...nodes) {
    this.replacements++; this.children.forEach(child => { child.parentElement = null; });
    this.children = []; this._text = ""; this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  matches(selector) {
    if (selector.includes(":not(:disabled)")) {
      if (this.disabled) return false;
      selector = selector.replace(":not(:disabled)", "");
    }
    const classAttribute = selector.match(/^(\.[\w-]+)(\[.+\])$/);
    if (classAttribute) return this.matches(classAttribute[1]) && this.matches(classAttribute[2]);
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
      const key = attribute[1].replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = attribute[1].startsWith("data-") ? this.dataset[key] : this.getAttribute(attribute[1]);
      return attribute[2] === undefined ? value !== undefined && value !== null : value === attribute[2];
    }
    const compound = selector.match(/^([a-z]+)(\[.+\])$/);
    if (compound) return this.tagName === compound[1] && this.matches(compound[2]);
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  focus() { document.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  select() { this.textSelected = true; }
  showModal() { assert(this.isConnected, "A modal may only open after it is attached"); this.open = true; }
  close() {
    this.open = false;
    if (this.deferCloseEvent) this.pendingClose = () => this.dispatchEvent(new Event("close"));
    else this.dispatchEvent(new Event("close"));
  }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}

const previous = new Map(["window", "document", "localStorage", "sessionStorage", "requestAnimationFrame", "indexedDB"].map(key => [key, globalThis[key]]));
const numberFormat = Intl.NumberFormat;
let formatterCount = 0;
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};
try {
  globalThis.document = { createElement: tag => new TestElement(tag), activeElement: null, body: new TestElement("body") };
  document.querySelector = selector => document.body.querySelector(selector);
  globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) });
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  // This fixture checks DOM transitions, not IndexedDB concurrency. Keep the
  // real transaction updater asynchronous; real cross-tab locks are exercised
  // by test-order-transactions-stress-browser.mjs in actual browser engines.
  const records = new Map();
  let transactionTail = Promise.resolve();
  const database = { createObjectStore() {}, close() {}, transaction() {
    const previousTransaction = transactionTail;
    let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    let aborted = false;
    const changes = new Map();
    const transaction = { abort() { aborted = true; },
      objectStore: () => ({ get() {
        const request = {};
        previousTransaction.then(() => queueMicrotask(() => {
          request.result = structuredClone(records.get("robys-menu-order.v1"));
          request.onsuccess?.();
          queueMicrotask(() => {
            if (aborted) transaction.onabort?.();
            else { changes.forEach((value, key) => records.set(key, value)); transaction.oncomplete?.(); }
            release();
          });
        }));
        return request;
      }, put(value, key) { changes.set(key, structuredClone(value)); } }) };
    return transaction;
  } };
  globalThis.indexedDB = { open() {
    const request = { result: database };
    queueMicrotask(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
    return request;
  } };
  const settleWrites = () => new Promise(resolve => setImmediate(resolve));
  const animationFrames = [];
  globalThis.requestAnimationFrame = callback => animationFrames.push(callback);
  const flushAnimationFrames = () => animationFrames.splice(0).forEach(callback => callback());
  Intl.NumberFormat = function (...args) { formatterCount++; return new numberFormat(...args); };
  const output = await build({ stdin: { contents: 'export * from "./src/smart-choice/quick-builder.ts"; export { transactStoredOrderDraft } from "./src/order-draft.js"; export { orderProductIds as testIds } from "./src/smart-choice/shared-order.ts";', resolveDir: process.cwd() }, bundle: true,
    platform: "node", format: "esm", target: "node20", write: false });
  const { createQuickBuilder, transactStoredOrderDraft, testIds } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const replaceCanonical = async draft => {
    await transactStoredOrderDraft(() => ({ draft, applied: true, blocked: false }), testIds, { origin: "fixture-other" });
    await settleWrites();
  };
  const root = createQuickBuilder("en", () => {}); document.body.append(root);
  await settleWrites();
  const cards = root.querySelectorAll(".qb-product");
  assert.equal(cards.length, 63);
  const photos = cards.map(card => card.querySelector("img"));
  const tea = cards.find(card => card.dataset.productId === "brew-hot:black-tea");
  const coffee = cards.find(card => card.dataset.productId === "hot-coffee:americano");
  const composer = root.querySelector("#qb-composer");
  const customizer = root.querySelector(".qb-customizer");
  tea.click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards, "Selecting a product must preserve catalog card identity");
  assert.deepEqual(cards.map(card => card.querySelector("img")), photos, "Selecting a product must preserve all existing photo nodes");
  assert.equal(tea.getAttribute("aria-pressed"), "true");
  assert.match(tea.querySelector(".qb-product-action").textContent, /Selected/);
  assert.equal(document.activeElement, composer.querySelector("h2"));
  assert.equal(customizer.open, true, "A selection must open its customizer on mobile");
  assert.equal(customizer.getAttribute("aria-labelledby"), composer.querySelector("h2").id);
  assert.equal(composer.querySelectorAll(".qb-sweet").length, 12, "All accompanying sweets must be visible buttons");
  composer.querySelector('[data-step="up"]').click();
  composer.querySelector(".qb-customizer-close").click();
  assert.equal(customizer.open, false);
  assert.equal(document.activeElement, tea, "Closing returns focus to the opening product");
  window.matchMedia = () => ({ matches: false });
  tea.click();
  assert.equal(customizer.open, true, "A selection must also open its customizer on desktop");
  assert.equal(composer.querySelector("output").textContent, "2", "Repeated selection must preserve composer quantity");
  composer.querySelector(".qb-customizer-close").click();
  coffee.click();
  assert.equal(tea.getAttribute("aria-pressed"), "false");
  assert.equal(coffee.getAttribute("aria-pressed"), "true");
  assert.equal(composer.querySelector("output").textContent, "1");
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards);
  const cart = root.querySelector("#qb-cart");
  let before = cart.replacements;
  const firstAdd = composer.querySelector(".qb-add");
  firstAdd.click();
  await settleWrites();
  assert.equal(customizer.open, true, "Adding keeps a persistent next-step confirmation in view");
  assert.equal(composer.querySelector("h2").textContent, "Added to your order");
  assert.equal(document.activeElement, composer.querySelector("h2"), "Success moves focus to the confirmation");
  assert.equal(composer.querySelector(".qb-add"), null, "Confirmation cannot accidentally add the same selection again");
  const addedDraft = localStorage.getItem("robys-menu-order.v1");
  firstAdd.click();
  assert.equal(localStorage.getItem("robys-menu-order.v1"), addedDraft, "A second activation of the former Add button cannot duplicate the order");
  assert(composer.querySelector(".qb-confirmation-checkout"));
  composer.querySelector(".qb-confirmation-more").click();
  assert.equal(customizer.open, false, "Choosing more explicitly returns to the catalog");
  assert.equal(document.activeElement, root.querySelector("#qb-search"));
  coffee.focus(); // Simulate native restoration finishing after our close callback.
  flushAnimationFrames();
  assert.equal(document.activeElement, root.querySelector("#qb-search"), "A late native focus restore cannot override Choose more");
  assert.equal(localStorage.getItem("robys-menu-order.v1"), addedDraft, "Continuing to browse preserves the basket");
  assert.equal(cart.replacements - before, 1, "Own add must render the cart once, not twice through its event echo");
  before = cart.replacements;
  cart.querySelector('[data-step="up"]').click();
  await settleWrites();
  assert.equal(cart.replacements - before, 1, "Own quantity step must render the cart once");
  assert.equal(cart.querySelector("output").textContent, "2");
  before = cart.replacements;
  window.dispatchEvent(new CustomEvent("robys:order-change"));
  await settleWrites();
  assert.equal(cart.replacements - before, 1, "External order-change events must still refresh the cart");
  before = cart.replacements;
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "robys-menu-order.v1" }));
  await settleWrites();
  assert.equal(cart.replacements - before, 1, "Cross-tab storage updates must still refresh the cart");
  const savedDraft = () => JSON.parse(localStorage.getItem("robys-menu-order.v1"));
  const beforeEdit = savedDraft();
  cart.querySelector(".qb-edit").click();
  assert.equal(customizer.open, true);
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  assert.equal(composer.querySelector("output").textContent, "2", "A dessert selection preserves the drink quantity");
  assert.equal(composer.querySelectorAll(".qb-selection-photos")[0].querySelectorAll("figure").length, 2);
  composer.querySelector(".qb-customizer-close").click();
  assert.deepEqual(savedDraft(), beforeEdit, "Cancel must not alter or remove the original item");
  cart.querySelector(".qb-edit").click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  composer.querySelector(".qb-add").click();
  await settleWrites();
  const pairedDraft = savedDraft();
  assert.equal(pairedDraft.groups.length, 1, "Saving an edit replaces the original instead of adding another copy");
  assert.equal(pairedDraft.groups[0].quantity, 2);
  assert.deepEqual(pairedDraft.groups[0].items.map(item => item.id), ["hot-coffee:americano", "desserts:macaron"]);
  assert.equal(composer.querySelector("h2").textContent, "Order updated");
  composer.querySelector(".qb-customizer-close").click();
  cart.querySelector(".qb-edit").click();
  composer.querySelector(".qb-no-sweet").click();
  const changedElsewhere = savedDraft(); changedElsewhere.groups[0].quantity = 3;
  await replaceCanonical(changedElsewhere);
  composer.querySelector(".qb-add").click();
  await settleWrites();
  assert.equal(customizer.open, true, "A stale edit must stay open with an actionable explanation");
  assert.equal(savedDraft().groups[0].quantity, 3, "A stale edit must preserve the latest quantity");
  assert.equal(savedDraft().groups[0].items.length, 2, "A stale edit must preserve the original pair atomically");
  assert.match(composer.querySelector(".qb-notice").textContent, /order changed/);
  composer.querySelector(".qb-customizer-close").click();
  const flavoured = cards.find(card => card.dataset.productId === "cold-coffee:flavoured-iced-caffe-latte");
  flavoured.click();
  assert.equal(composer.querySelector(".qb-add").disabled, true, "An unresolved flavour blocks adding");
  const flavour = composer.querySelector('[data-variant-id="caramel"]'); const flavourId = flavour.dataset.variantId;
  flavour.click();
  composer.querySelector('[data-step="up"]').click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  assert.equal(composer.querySelector(`[data-variant-id="${flavourId}"]`).getAttribute("aria-pressed"), "true", "A dessert change preserves the drink flavour");
  assert.equal(composer.querySelector("output").textContent, "2");
  assert.equal(composer.querySelector(".qb-add").disabled, false);
  composer.querySelector(".qb-customizer-close").click();
  const cappuccino = cards.find(card => card.dataset.productId === "hot-coffee:cappuccino");
  const caramelCappuccino = cards.find(card => card.dataset.productId === "hot-coffee:caramel-cappuccino");
  cappuccino.click();
  composer.querySelector('[data-step="up"]').click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  composer.querySelector('[data-choice-id="hot-coffee:caramel-cappuccino/plain"]').click();
  assert.equal(composer.querySelector("output").textContent, "2", "Changing drink option preserves quantity");
  assert.equal(composer.querySelector('[data-dessert-id="desserts:macaron"]').getAttribute("aria-pressed"), "true", "Changing drink option preserves dessert");
  assert.equal(cappuccino.getAttribute("aria-pressed"), "false");
  assert.equal(caramelCappuccino.getAttribute("aria-pressed"), "true");
  assert.match(composer.querySelector(".qb-selection-photos").querySelector("img").src, /hot-coffee--caramel-cappuccino/);
  const money = value => new numberFormat("en-US", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
  assert.equal(composer.querySelector(".qb-add-total").querySelector("strong").textContent, money(460), "Family price comes from the selected canonical drink plus dessert, times quantity");
  composer.querySelector(".qb-add").click();
  await settleWrites();
  const cappuccinoPair = savedDraft().groups.find(group => group.items[0].id === "hot-coffee:caramel-cappuccino");
  assert.equal(cappuccinoPair.quantity, 2);
  assert.equal(cappuccinoPair.items[1].id, "desserts:macaron");
  assert.match(composer.querySelector(".qb-confirmation-lines").textContent, /2 × Caramel Cappuccino/);
  composer.querySelector(".qb-customizer-close").click();
  const pairRow = cart.querySelectorAll(".qb-order-group").find(row => row.dataset.groupId === cappuccinoPair.id);
  pairRow.querySelector(".qb-edit").click();
  composer.querySelector('[data-choice-id="hot-coffee:cappuccino/plain"]').click();
  composer.querySelector(".qb-add").click();
  await settleWrites();
  assert(!savedDraft().groups.some(group => group.items[0].id === "hot-coffee:caramel-cappuccino"), "Editing a drink option replaces the original canonical product");
  assert.equal(savedDraft().groups.find(group => group.items[0].id === "hot-coffee:cappuccino").quantity, 2);
  composer.querySelector(".qb-customizer-close").click();
  const icedLatte = cards.find(card => card.dataset.productId === "cold-coffee:iced-caffe-latte");
  icedLatte.click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  composer.querySelector('[data-step="up"]').click();
  composer.querySelector('[data-choice-id="cold-coffee:flavoured-iced-caffe-latte/vanilla"]').click();
  assert.equal(composer.querySelector(".qb-add-total").querySelector("strong").textContent, money(460));
  assert.equal(composer.querySelector("output").textContent, "2");
  composer.querySelector(".qb-add").click();
  await settleWrites();
  const icedPair = savedDraft().groups.find(group => group.items[0].id === "cold-coffee:flavoured-iced-caffe-latte");
  assert.equal(icedPair.items[0].variant, "vanilla", "A flavour option stores its canonical product and variant");
  assert.equal(icedPair.items[1].id, "desserts:macaron");
  assert.match(composer.querySelector(".qb-confirmation-lines").textContent, /Vanilla/);
  composer.querySelector(".qb-confirmation-more").click();
  const search = root.querySelector("#qb-search"); search.value = "black tea"; search.dispatchEvent(new Event("input"));
  const filtered = root.querySelectorAll(".qb-product");
  assert(filtered.length > 0 && filtered.length < cards.length);
  filtered[0].click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), filtered, "Selecting filtered results must preserve their photo nodes");
  composer.querySelector(".qb-continue-shopping").click();
  assert.equal(document.activeElement, search);
  assert.equal(formatterCount, 1, "One locale must reuse one formatter across initial render, filters, selection, and cart edits");
  createQuickBuilder("ru", () => {});
  createQuickBuilder("en", () => {});
  assert.equal(formatterCount, 2, "Returning to a locale must reuse its cached formatter");

  // A helpful recommendation enters a fresh composer, even after editing a
  // flavoured pair. Merely reviewing that recommendation must never write it.
  cart.querySelectorAll(".qb-order-group").find(row => row.dataset.groupId === icedPair.id).querySelector(".qb-edit").click();
  const beforePrefill = savedDraft();
  for (let quantity = 1; quantity <= 6; quantity++) {
    const prefilled = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity });
    const dialog = prefilled.querySelector(".qb-customizer");
    assert(!dialog.open, "Creating a prefill must not open a disconnected dialog");
    document.body.replaceChildren(prefilled);
    assert(!dialog.open, "Opening is deferred until the mounted frame");
    flushAnimationFrames();
    assert.equal(dialog.open, true);
    const detail = prefilled.querySelector("#qb-composer");
    assert.equal(detail.querySelector("output").textContent, String(quantity), "All requested guest counts must reach the composer unchanged");
    assert.equal(detail.querySelector(".qb-selection-photos").querySelectorAll("figure").length, 1, "A recommendation must clear a previous accompanying dessert");
    assert.equal(detail.querySelector(".qb-add-total").querySelector("strong").textContent, money(50 * quantity));
    assert.match(detail.querySelector(".qb-add").textContent, /^Add to order/, "A recommendation starts an addition, not an edit of the previous basket item");
    assert.deepEqual(savedDraft(), beforePrefill, "Opening a recommendation must preserve the existing order");
    detail.querySelector(".qb-customizer-close").click();
    assert.equal(document.activeElement, prefilled.querySelector("#qb-search"), "Closing a recommended selection returns to an available catalog control");
  }
  const detached = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 2 });
  document.body.replaceChildren(detached);
  document.body.replaceChildren();
  flushAnimationFrames();
  assert(!detached.querySelector(".qb-customizer").open, "An obsolete selection must not open after navigation removed its builder");
  for (const selection of [{ productId: "unknown", quantity: 1 }, ...[0, -1, 7, 1.5, NaN].map(quantity => ({ productId: "brew-hot:black-tea", quantity }))]) {
    const invalid = createQuickBuilder("en", () => {}, selection);
    document.body.replaceChildren(invalid);
    assert.equal(animationFrames.length, 0, "Invalid prefills must not schedule a modal");
    assert(!invalid.querySelector(".qb-customizer").open);
    assert.deepEqual(savedDraft(), beforePrefill);
  }
  const unresolved = createQuickBuilder("en", () => {}, { productId: "cold-coffee:flavoured-iced-caffe-latte", quantity: 2 });
  document.body.replaceChildren(unresolved); flushAnimationFrames();
  assert.equal(unresolved.querySelector(".qb-add").disabled, true, "Prefill must ask for a required flavour rather than reuse an earlier one");
  const toAdd = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 4 });
  document.body.replaceChildren(toAdd); flushAnimationFrames();
  toAdd.querySelector(".qb-add").click();
  await settleWrites();
  const afterPrefill = savedDraft();
  assert.deepEqual(afterPrefill.groups.filter(group => group.items[0].id !== "brew-hot:black-tea"), beforePrefill.groups,
    "Adding a recommended selection must preserve every pre-existing basket group");
  const newGroup = afterPrefill.groups.find(group => group.items[0].id === "brew-hot:black-tea");
  assert.equal(newGroup.quantity, 4);
  assert.deepEqual(newGroup.items, [{ id: "brew-hot:black-tea", quantity: 1 }], "The addition must contain only the requested product without a stale flavour or dessert");
  const confirmation = toAdd.querySelector("#qb-composer");
  assert.equal(confirmation.querySelectorAll(".qb-confirmation-line").length, afterPrefill.groups.length,
    "Success shows the whole order, including earlier selections");
  const oldTotal = confirmation.querySelector(".qb-grand-total").textContent;
  newGroup.quantity = 5;
  await replaceCanonical(afterPrefill);
  assert.notEqual(confirmation.querySelector(".qb-grand-total").textContent, oldTotal,
    "A confirmation updates its full total after another order surface changes the basket");
  assert.equal(confirmation.querySelector("h2").textContent, "Order updated");
  confirmation.querySelector(".qb-edit").click();
  assert.equal(toAdd.querySelector(".qb-customizer").open, false);
  assert.equal(document.activeElement, toAdd.querySelector("#qb-cart").querySelector("h2"), "Edit order lands on the actual basket");
  const withMissingFlavour = savedDraft();
  delete withMissingFlavour.groups.find(group => group.items[0].id === "cold-coffee:flavoured-iced-caffe-latte").items[0].variant;
  await replaceCanonical(withMissingFlavour);
  const flavourHelp = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
  document.body.replaceChildren(flavourHelp); flushAnimationFrames();
  flavourHelp.querySelector(".qb-add").click();
  await settleWrites();
  const flavourDialog = flavourHelp.querySelector(".qb-customizer");
  flavourDialog.deferCloseEvent = true;
  const next = flavourHelp.querySelector(".qb-confirmation-checkout");
  assert.equal(next.textContent, "Choose drink flavours");
  next.click();
  await settleWrites();
  const requiredChoice = flavourHelp.querySelector('select[aria-invalid="true"]');
  assert(requiredChoice, "The unresolved drink exposes a flavour control");
  assert.equal(document.activeElement, requiredChoice);
  flavourDialog.pendingClose();
  assert.equal(document.activeElement, requiredChoice, "Native asynchronous close must keep focus on the required flavour");
  flavourHelp.querySelector(".qb-product").focus();
  flushAnimationFrames();
  assert.equal(document.activeElement, requiredChoice, "The required flavour also survives late native focus restoration");

  const focusRoot = createQuickBuilder("en", () => {});
  document.body.replaceChildren(focusRoot);
  const focusCards = focusRoot.querySelectorAll(".qb-product");
  const focusDialog = focusRoot.querySelector(".qb-customizer");
  const closeFocusDialog = () => focusRoot.querySelector(".qb-customizer-close").click();
  focusCards[0].click(); closeFocusDialog();
  focusCards[1].click();
  const reopenedHeading = focusRoot.querySelector("#qb-composer").querySelector("h2");
  flushAnimationFrames();
  assert.equal(document.activeElement, reopenedHeading, "An old close frame cannot take focus from a reopened customizer");
  assert.equal(focusDialog.open, true);
  closeFocusDialog(); flushAnimationFrames();

  focusCards[0].click(); closeFocusDialog();
  focusCards[1].click(); closeFocusDialog();
  const latestFocus = focusCards[1];
  const staleFrame = animationFrames.shift();
  staleFrame();
  assert.equal(document.activeElement, latestFocus, "An old opening's close frame stays cancelled even when the new dialog has already closed");
  flushAnimationFrames();

  focusCards[0].click(); closeFocusDialog();
  const qr = new TestElement("dialog"); qr.className = "order-checkout-dialog"; qr.setAttribute("open", "");
  const qrButton = new TestElement("button"); qr.append(qrButton); document.body.append(qr); qrButton.focus();
  flushAnimationFrames();
  assert.equal(document.activeElement, qrButton, "A QR opened before the close frame retains its focus");

  document.body.replaceChildren(focusRoot);
  focusCards[0].click(); closeFocusDialog();
  const replacement = new TestElement("button"); document.body.replaceChildren(replacement); replacement.focus();
  flushAnimationFrames();
  assert.equal(document.activeElement, replacement, "Removing the builder cancels pending focus restoration");
  console.log("Quick builder UI PASS: desktop/mobile modal, focus return, visible sweets/flavours, edit/save/cancel and stale edits, persistent photo nodes, one cart render, external updates, cached locale formatters; recommendation prefills for 1–6 guests, validation, mounted opening and basket preservation.");
} finally {
  await new Promise(resolve => setImmediate(resolve));
  Intl.NumberFormat = numberFormat;
  for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
