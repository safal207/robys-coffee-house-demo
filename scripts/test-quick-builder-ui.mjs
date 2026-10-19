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
  get src() { return this._src ?? ""; }
  set src(value) { this._src = value; this.srcAssignments = (this.srcAssignments ?? 0) + 1; }
  set textContent(value) { this._text = String(value); this.children.forEach(child => { child.parentElement = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  append(...nodes) {
    for (const child of nodes) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(node => node !== child);
      child.parentElement = this; this.children.push(child);
    }
  }
  prepend(...nodes) { const previous = [...this.children]; this.replaceChildren(...nodes, ...previous); }
  replaceChildren(...nodes) {
    this.replacements++; this.children.forEach(child => { child.parentElement = null; });
    this.children = []; this._text = ""; this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
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
  getBoundingClientRect() { return { left: 100, top: 100, right: 400, bottom: 500 }; }
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

const previous = new Map(["window", "document", "localStorage", "sessionStorage", "requestAnimationFrame", "performance", "__robysCheckoutBoundary"].map(key => [key, globalThis[key]]));
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
  let clock = 1000;
  globalThis.performance = { now: () => clock };
  const animationFrames = [];
  globalThis.requestAnimationFrame = callback => animationFrames.push(callback);
  const flushAnimationFrames = () => animationFrames.splice(0).forEach(callback => callback());
  Intl.NumberFormat = function (...args) { formatterCount++; return new numberFormat(...args); };
  const output = await build({ entryPoints: ["src/smart-choice/quick-builder.ts"], bundle: true,
    platform: "node", format: "esm", target: "node20", write: false,
    plugins: [{ name: "controlled-checkout-boundary", setup(builder) {
      builder.onResolve({ filter: /checkout-link\.js$/ }, () => ({ path: "checkout", namespace: "test-checkout" }));
      builder.onLoad({ filter: /.*/, namespace: "test-checkout" }, () => ({ contents:
        "export async function openQuickCheckout(...args) { return globalThis.__robysCheckoutBoundary(...args); }" }));
    } }] });
  const { createQuickBuilder } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const photoOutput = await build({ entryPoints: ["src/smart-choice/product-photo.ts"], bundle: true,
    platform: "node", format: "esm", target: "node20", write: false });
  const { createProductPhoto } = await import(`data:text/javascript;base64,${Buffer.from(photoOutput.outputFiles[0].text).toString("base64")}`);
  const withoutPreview = createProductPhoto("src/products/unlisted-photo.webp", "en", "catalog");
  assert.equal(withoutPreview.querySelector(".qb-photo-preview"), null, "Products without a preview keep the ordinary photo frame");
  assert.notEqual(withoutPreview.querySelector(".qb-photo-status").hidden, true, "An unknown preview still explains a pending photo load");
  withoutPreview.querySelector("img").dispatchEvent(new Event("error"));
  assert.equal(withoutPreview.dataset.photoState, "error");
  assert.equal(withoutPreview.querySelector(".qb-photo-status").textContent, "Photo unavailable");
  const root = createQuickBuilder("en", () => {}); document.body.append(root);
  const cards = root.querySelectorAll(".qb-product");
  assert.equal(cards.length, 63);
  const photos = cards.map(card => card.querySelector("img"));
  assert(photos.slice(0, 6).every(image => image.loading === "eager"), "The first six catalog photos load without waiting for intersection");
  assert(photos.slice(6).every(image => image.loading === "lazy"), "The remainder of the long catalog stays lazy initially");
  assert.match(photos[0].src, /quick-v1\/(menu-v1|sets-v1)\/.+-256\.webp$/);
  assert.match(photos[0].srcset, /-256\.webp 256w, .+-512\.webp 512w$/);
  assert.match(photos[0].sizes, /260px/);
  const loadedFrame = cards[0].querySelector(".qb-photo");
  assert.equal(loadedFrame.dataset.photoState, "loading");
  assert.equal(loadedFrame.querySelector(".qb-photo-status").textContent, "Loading photo");
  const loadedPreview = loadedFrame.querySelector(".qb-photo-preview");
  assert(loadedPreview, "The actual product has an inline preview before the network photo loads");
  assert.match(loadedPreview.src, /^data:image\/webp;base64,/);
  assert.equal(loadedPreview.hidden, false, "The tiny product preview is visible immediately");
  assert.equal(loadedPreview.alt, "");
  assert.equal(loadedFrame.getAttribute("aria-hidden"), "true", "Names next to decorative previews remain the accessible product label");
  assert.equal(loadedFrame.querySelector("img"), photos[0], "The main photo remains first in the DOM");
  assert.equal(loadedFrame.querySelector(".qb-photo-status").hidden, true, "A ready inline preview avoids a loading label covering the small photo");
  photos[0].naturalWidth = 256;
  photos[0].dispatchEvent(new Event("load"));
  assert.equal(loadedFrame.dataset.photoState, "loaded");
  assert.equal(loadedFrame.querySelector(".qb-photo-status").hidden, true);
  assert.equal(loadedPreview.hidden, true, "The full photo replaces its preview after load");
  const recoveredFrame = cards[1].querySelector(".qb-photo");
  const recoveredImage = photos[1];
  recoveredImage.dispatchEvent(new Event("error"));
  assert.equal(recoveredImage.srcset, "", "A failed responsive request clears srcset before requesting the original");
  assert.match(recoveredImage.src, /^\.\.\/src\/products\/(menu-v1|sets-v1)\/.+\.webp$/);
  assert.equal(recoveredFrame.dataset.photoState, "loading", "The one original fallback remains an active load");
  recoveredImage.naturalWidth = 1024;
  recoveredImage.dispatchEvent(new Event("load"));
  assert.equal(recoveredFrame.dataset.photoState, "loaded", "A successful original fallback removes the placeholder");
  const failedFrame = cards[2].querySelector(".qb-photo");
  const failedImage = photos[2];
  failedImage.dispatchEvent(new Event("error"));
  const originalFallback = failedImage.src;
  failedImage.dispatchEvent(new Event("error"));
  assert.equal(failedFrame.dataset.photoState, "error");
  assert.equal(failedFrame.querySelector(".qb-photo-status").textContent, "Photo unavailable");
  assert.equal(failedImage.hidden, true, "A broken image icon is replaced by a clear reserved frame");
  assert.equal(failedFrame.querySelector(".qb-photo-preview").hidden, false, "The product stays recognizable even when both network attempts fail");
  assert.equal(failedFrame.querySelector(".qb-photo-status").hidden, false, "A failed detailed photo gets an honest error label");
  const failedRequests = failedImage.srcAssignments;
  failedImage.dispatchEvent(new Event("error"));
  assert.equal(failedImage.src, originalFallback, "A failed original must never trigger an unbounded retry loop");
  assert.equal(failedImage.srcAssignments, failedRequests, "Repeated error events must not start requests");
  assert.equal(cards[2].disabled, false, "An unavailable photo must not prevent choosing its named, priced product");
  root.querySelector('[data-category="desserts"]').click();
  const dessertCards = root.querySelectorAll(".qb-product");
  assert(dessertCards.length >= 6);
  assert(dessertCards.slice(0, 6).every(card => card.querySelector("img").loading === "eager"), "A newly visible category promotes its first six photos immediately");
  for (const card of dessertCards) assert.equal(card, cards.find(original => original.dataset.productId === card.dataset.productId), "Changing category reuses existing catalog cards");
  root.querySelector('[data-category="all"]').click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards, "Returning to all products retains every card");
  assert.deepEqual(cards.map(card => card.querySelector("img")), photos, "Returning from a category retains all decoded or in-flight photo nodes");
  assert.equal(loadedFrame.dataset.photoState, "loaded", "Returning from a category must not reset a loaded photo to a placeholder");
  assert.equal(failedFrame.dataset.photoState, "loading", "A new category action allows an unavailable photo to recover");
  assert.equal(failedImage.srcAssignments, failedRequests + 1, "A new category action retries the original only once");
  assert.equal(failedImage.src, originalFallback);
  failedImage.naturalWidth = 1024;
  failedImage.dispatchEvent(new Event("load"));
  assert.equal(failedFrame.dataset.photoState, "loaded");
  assert.equal(failedFrame.querySelector(".qb-photo-preview").hidden, true, "A recovered photo replaces the retained preview");
  const tea = cards.find(card => card.dataset.productId === "brew-hot:black-tea");
  const coffee = cards.find(card => card.dataset.productId === "hot-coffee:americano");
  const composer = root.querySelector("#qb-composer");
  const customizer = root.querySelector(".qb-customizer");
  tea.click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards, "Selecting a product must preserve catalog card identity");
  assert.deepEqual(cards.map(card => card.querySelector("img")), photos, "Selecting a product must preserve all existing photo nodes");
  assert.equal(tea.getAttribute("aria-pressed"), null, "Opening a customizer is not a basket toggle");
  assert.equal(tea.getAttribute("aria-haspopup"), "dialog");
  assert.equal(tea.querySelector(".qb-product-action").textContent, "Choose +");
  assert.equal(document.activeElement, composer.querySelector("h2"));
  assert.equal(customizer.open, true, "A selection must open its customizer on mobile");
  assert.equal(customizer.getAttribute("aria-labelledby"), composer.querySelector("h2").id);
  assert.equal(composer.querySelectorAll(".qb-sweet").length, 12, "All accompanying sweets must be visible buttons");
  const initialComposerPhotos = composer.querySelectorAll("img");
  assert.equal(composer.querySelector(".qb-selection-photos").querySelector("img").loading, "eager", "The opened selection must not wait for lazy-load intersection");
  assert(composer.querySelectorAll("img").every(image => image.loading === "eager"), "Visible accompanying sweets also load immediately");
  composer.querySelector('[data-step="up"]').click();
  assert.deepEqual(composer.querySelectorAll("img"), initialComposerPhotos, "Quantity changes retain decoded composer photo nodes");
  const failedSelectionFrame = composer.querySelector(".qb-selection-photos").querySelector(".qb-photo");
  const failedSelectionImage = failedSelectionFrame.querySelector("img");
  failedSelectionImage.dispatchEvent(new Event("error"));
  failedSelectionImage.dispatchEvent(new Event("error"));
  assert.equal(failedSelectionFrame.dataset.photoState, "error");
  const failedSelectionRequests = failedSelectionImage.srcAssignments;
  composer.querySelector(".qb-customizer-close").click();
  assert.equal(customizer.open, false);
  assert.equal(tea.querySelector(".qb-product-action").textContent, "Choose +", "Cancelling must not imply anything was added");
  assert.equal(document.activeElement, tea, "Closing returns focus to the opening product");
  window.matchMedia = () => ({ matches: false });
  tea.click();
  assert.equal(customizer.open, true, "A selection must also open its customizer on desktop");
  assert.equal(composer.querySelector(".qb-selection-photos").querySelector(".qb-photo"), failedSelectionFrame, "Reopening reuses the selection photo frame");
  assert.equal(failedSelectionFrame.dataset.photoState, "loading", "Reopening explicitly retries an unavailable selection photo");
  assert.equal(failedSelectionImage.srcAssignments, failedSelectionRequests + 1, "Reopening makes only one bounded original-photo request");
  assert.equal(failedSelectionFrame.querySelector(".qb-photo-preview").hidden, false, "The preview stays visible during recovery");
  assert.equal(failedSelectionFrame.querySelector(".qb-photo-status").hidden, true);
  failedSelectionImage.naturalWidth = 1024;
  failedSelectionImage.dispatchEvent(new Event("load"));
  assert.equal(failedSelectionFrame.dataset.photoState, "loaded");
  assert.equal(failedSelectionFrame.querySelector(".qb-photo-preview").hidden, true, "Recovery removes the tiny preview");
  assert.equal(failedSelectionFrame.querySelector(".qb-photo-status").hidden, true, "Recovery clears the unavailable-photo label");
  assert.equal(composer.querySelector("output").textContent, "2", "Repeated selection must preserve composer quantity");
  composer.querySelector(".qb-customizer-close").click();
  coffee.click();
  assert.equal(tea.getAttribute("aria-pressed"), null);
  assert.equal(coffee.getAttribute("aria-pressed"), null);
  assert.equal(composer.querySelector("output").textContent, "1");
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards);
  const cart = root.querySelector("#qb-cart");
  let before = cart.replacements;
  const firstAdd = composer.querySelector(".qb-add");
  firstAdd.click();
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
  const cartPhotosBeforeQuantity = cart.querySelectorAll("img");
  cart.querySelector('[data-step="up"]').click();
  assert.equal(cart.replacements - before, 1, "Own quantity step must render the cart once");
  assert.equal(cart.querySelector("output").textContent, "2");
  assert.deepEqual(cart.querySelectorAll("img"), cartPhotosBeforeQuantity, "Cart quantity changes preserve photo nodes");
  assert(cartPhotosBeforeQuantity.every(image => image.loading === "eager"));
  before = cart.replacements;
  window.dispatchEvent(new CustomEvent("robys:order-change"));
  assert.equal(cart.replacements - before, 1, "External order-change events must still refresh the cart");
  before = cart.replacements;
  window.dispatchEvent(Object.assign(new Event("storage"), { key: "robys-menu-order.v1" }));
  assert.equal(cart.replacements - before, 1, "Cross-tab storage updates must still refresh the cart");
  const savedDraft = () => JSON.parse(localStorage.getItem("robys-menu-order.v1"));
  const beforeEdit = savedDraft();
  cart.querySelector(".qb-edit").click();
  assert.equal(customizer.open, true);
  const drinkPhotoBeforePair = composer.querySelector(".qb-selection-photos").querySelector("img");
  const sweetPhotosBeforePair = composer.querySelectorAll(".qb-sweet").map(button => button.querySelector("img"));
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  assert.equal(composer.querySelector("output").textContent, "2", "A dessert selection preserves the drink quantity");
  assert.equal(composer.querySelectorAll(".qb-selection-photos")[0].querySelectorAll("figure").length, 2);
  assert.equal(composer.querySelector(".qb-selection-photos").querySelector("img"), drinkPhotoBeforePair, "Changing the pair keeps the drink photo decoded");
  assert.deepEqual(composer.querySelectorAll(".qb-sweet").map(button => button.querySelector("img")), sweetPhotosBeforePair, "Changing the pair keeps all dessert thumbnail nodes");
  assert(composer.querySelector(".qb-selection-photos").querySelectorAll("img").every(image => image.loading === "eager"));
  composer.querySelector(".qb-customizer-close").click();
  assert.deepEqual(savedDraft(), beforeEdit, "Cancel must not alter or remove the original item");
  cart.querySelector(".qb-edit").click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  composer.querySelector(".qb-add").click();
  const pairedDraft = savedDraft();
  assert.equal(pairedDraft.groups.length, 1, "Saving an edit replaces the original instead of adding another copy");
  assert.equal(pairedDraft.groups[0].quantity, 2);
  assert.deepEqual(pairedDraft.groups[0].items.map(item => item.id), ["hot-coffee:americano", "desserts:macaron"]);
  assert.equal(composer.querySelector("h2").textContent, "Order updated");
  composer.querySelector(".qb-customizer-close").click();
  cart.querySelector(".qb-edit").click();
  composer.querySelector(".qb-no-sweet").click();
  const changedElsewhere = savedDraft(); changedElsewhere.groups[0].quantity = 3;
  localStorage.setItem("robys-menu-order.v1", JSON.stringify(changedElsewhere));
  window.dispatchEvent(new CustomEvent("robys:order-change"));
  composer.querySelector(".qb-add").click();
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
  assert.equal(cappuccino.getAttribute("aria-pressed"), null);
  assert.equal(caramelCappuccino.getAttribute("aria-pressed"), null);
  assert.match(composer.querySelector(".qb-selection-photos").querySelector("img").src, /hot-coffee--caramel-cappuccino/);
  const money = value => new numberFormat("en-US", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
  assert.equal(composer.querySelector(".qb-add-total").querySelector("strong").textContent, money(460), "Family price comes from the selected canonical drink plus dessert, times quantity");
  composer.querySelector(".qb-add").click();
  const cappuccinoPair = savedDraft().groups.find(group => group.items[0].id === "hot-coffee:caramel-cappuccino");
  assert.equal(cappuccinoPair.quantity, 2);
  assert.equal(cappuccinoPair.items[1].id, "desserts:macaron");
  assert.match(composer.querySelector(".qb-confirmation-lines").textContent, /2 × Caramel Cappuccino/);
  composer.querySelector(".qb-customizer-close").click();
  const pairRow = cart.querySelectorAll(".qb-order-group").find(row => row.dataset.groupId === cappuccinoPair.id);
  pairRow.querySelector(".qb-edit").click();
  composer.querySelector('[data-choice-id="hot-coffee:cappuccino/plain"]').click();
  composer.querySelector(".qb-add").click();
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
  const icedPair = savedDraft().groups.find(group => group.items[0].id === "cold-coffee:flavoured-iced-caffe-latte");
  assert.equal(icedPair.items[0].variant, "vanilla", "A flavour option stores its canonical product and variant");
  assert.equal(icedPair.items[1].id, "desserts:macaron");
  assert.match(composer.querySelector(".qb-confirmation-lines").textContent, /Vanilla/);
  composer.querySelector(".qb-confirmation-more").click();
  const search = root.querySelector("#qb-search"); search.value = "black tea"; search.dispatchEvent(new Event("input"));
  const filtered = root.querySelectorAll(".qb-product");
  assert(filtered.length > 0 && filtered.length < cards.length);
  for (const card of filtered) assert.equal(card, cards.find(original => original.dataset.productId === card.dataset.productId), "A search reuses catalog cards instead of restarting photo loads");
  filtered[0].click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), filtered, "Selecting filtered results must preserve their photo nodes");
  composer.querySelector(".qb-continue-shopping").click();
  assert.equal(document.activeElement, search);
  root.querySelector(".qb-search-clear").click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards, "Clearing a search restores the same catalog cards and photos");
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
  localStorage.setItem("robys-menu-order.v1", JSON.stringify(afterPrefill));
  window.dispatchEvent(new CustomEvent("robys:order-change"));
  assert.notEqual(confirmation.querySelector(".qb-grand-total").textContent, oldTotal,
    "A confirmation updates its full total after another order surface changes the basket");
  assert.equal(confirmation.querySelector("h2").textContent, "Order updated");
  confirmation.querySelector(".qb-edit").click();
  assert.equal(toAdd.querySelector(".qb-customizer").open, false);
  assert.equal(document.activeElement, toAdd.querySelector("#qb-cart").querySelector("h2"), "Edit order lands on the actual basket");
  const withMissingFlavour = savedDraft();
  delete withMissingFlavour.groups.find(group => group.items[0].id === "cold-coffee:flavoured-iced-caffe-latte").items[0].variant;
  localStorage.setItem("robys-menu-order.v1", JSON.stringify(withMissingFlavour));
  const flavourHelp = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
  document.body.replaceChildren(flavourHelp); flushAnimationFrames();
  flavourHelp.querySelector(".qb-add").click();
  const flavourDialog = flavourHelp.querySelector(".qb-customizer");
  flavourDialog.deferCloseEvent = true;
  const next = flavourHelp.querySelector(".qb-confirmation-checkout");
  assert.equal(next.textContent, "Choose drink flavours");
  next.click();
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

  // A product remains an invitation to customize after its last basket entry
  // was removed, including when a new builder restores a previous selection.
  for (const remove of focusRoot.querySelectorAll(".qb-remove")) remove.click();
  assert.equal(savedDraft().groups.length, 0);
  const emptiedBuilder = createQuickBuilder("en", () => {});
  for (const card of emptiedBuilder.querySelectorAll(".qb-product")) {
    assert.equal(card.getAttribute("aria-pressed"), null);
    assert.equal(card.getAttribute("aria-haspopup"), "dialog");
    assert.equal(card.querySelector(".qb-product-action").textContent, "Choose +");
  }

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
  // Buyer-facing replacement is an explicit transaction, including pairs and
  // required flavours; opening a different product is never a second addition.
  {
  localStorage.removeItem("robys-menu-order.v1"); sessionStorage.removeItem("robys-menu-order.v1");
  const replaceRoot = createQuickBuilder("en", () => {}); document.body.replaceChildren(replaceRoot);
  const replaceDialog = replaceRoot.querySelector(".qb-customizer");
  const replaceComposer = replaceRoot.querySelector("#qb-composer");
  const catalogCard = id => replaceRoot.querySelectorAll(".qb-product").find(card => card.dataset.productId === id);
  catalogCard("hot-coffee:americano").click(); replaceComposer.querySelector(".qb-add").click();
  replaceComposer.querySelector(".qb-confirmation-more").click();
  catalogCard("hot-coffee:caffe-latte").click();
  replaceComposer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  replaceComposer.querySelector('[data-step="up"]').click(); replaceComposer.querySelector(".qb-add").click();
  const originalBasket = savedDraft();
  const originalPair = originalBasket.groups.find(group => group.items.some(item => item.id === "hot-coffee:caffe-latte"));
  const untouched = originalBasket.groups.find(group => group !== originalPair);
  assert.equal(catalogCard("hot-coffee:caffe-latte").querySelector(".qb-in-cart").textContent, "✓ In your order: 2");
  assert.equal(catalogCard("desserts:macaron").querySelector(".qb-in-cart").textContent, "✓ In your order: 2");
  const confirmationRow = groupId => replaceComposer.querySelectorAll(".qb-confirmation-line").find(row => row.dataset.groupId === groupId);
  confirmationRow(originalPair.id).querySelector(".qb-replace").click();
  const alternativeSearch = replaceComposer.querySelector("#qb-alternative-search");
  alternativeSearch.value = "tea"; alternativeSearch.dispatchEvent(new Event("input"));
  assert(replaceComposer.querySelectorAll(".qb-alternative").length > 0);
  assert(!replaceComposer.querySelector('[data-alternative-id="desserts:macaron"]'), "A drink replacement preserves the accompanying dessert, instead of replacing it with a second dessert");
  replaceComposer.querySelector('[data-alternative-id="brew-hot:black-tea"]').click();
  assert.equal(replaceComposer.querySelector("output").textContent, "2");
  assert.match(replaceComposer.querySelector(".qb-choice-summary").textContent, /Black Tea.*Macaron/);
  assert.equal(replaceComposer.querySelector(".qb-add-total").querySelector("strong").textContent, money(160));
  assert.match(replaceComposer.querySelector(".qb-add").textContent, /^Save replacement/);
  replaceComposer.querySelector(".qb-customizer-close").click();
  assert.deepEqual(savedDraft(), originalBasket, "Cancelling a cross-category replacement preserves the entire original basket");
  replaceRoot.querySelector(".qb-dock-review").click();
  assert(replaceDialog.open, "The always-visible order control opens editable order lines without scrolling past the catalog");
  confirmationRow(originalPair.id).querySelector(".qb-replace").click();
  replaceComposer.querySelector('[data-alternative-id="brew-hot:black-tea"]').click();
  replaceComposer.querySelector(".qb-add").click();
  const teaBasket = savedDraft();
  assert.equal(teaBasket.groups.length, 2);
  assert(teaBasket.groups.some(group => JSON.stringify(group) === JSON.stringify(untouched)), "Other selections stay unchanged");
  assert(!teaBasket.groups.some(group => group.items.some(item => item.id === "hot-coffee:caffe-latte")));
  const teaPair = teaBasket.groups.find(group => group.items.some(item => item.id === "brew-hot:black-tea"));
  assert.equal(teaPair.quantity, 2); assert(teaPair.items.some(item => item.id === "desserts:macaron"));
  assert.equal(catalogCard("hot-coffee:caffe-latte").querySelector(".qb-in-cart").hidden, true);
  assert.equal(catalogCard("brew-hot:black-tea").querySelector(".qb-in-cart").textContent, "✓ In your order: 2");
  confirmationRow(teaPair.id).querySelector(".qb-replace").click();
  replaceComposer.querySelector('[data-alternative-id="hot-coffee:cappuccino"]').click();
  const changedPair = savedDraft(); changedPair.groups.find(group => group.id === teaPair.id).quantity = 3;
  localStorage.setItem("robys-menu-order.v1", JSON.stringify(changedPair));
  window.dispatchEvent(new CustomEvent("robys:order-change"));
  replaceComposer.querySelector(".qb-add").click();
  assert.deepEqual(savedDraft(), changedPair, "A stale replacement cannot overwrite changes from another tab");
  assert.match(replaceComposer.querySelector(".qb-notice").textContent, /order changed/);
  replaceComposer.querySelector(".qb-remove").click();
  assert.deepEqual(savedDraft(), changedPair, "A stale editor must not remove a newer selection sharing the same group ID");
  replaceComposer.querySelector(".qb-customizer-close").click(); replaceRoot.querySelector(".qb-dock-review").click();
  confirmationRow(teaPair.id).querySelector(".qb-replace").click();
  replaceComposer.querySelector('[data-alternative-id="cold-coffee:flavoured-iced-caffe-latte"]').click();
  assert(replaceComposer.querySelector(".qb-add").disabled, "A replacement must collect its own required flavour");
  replaceComposer.querySelector('[data-variant-id="vanilla"]').click();
  replaceComposer.querySelector(".qb-add").click();
  const flavoured = savedDraft().groups.find(group => group.items.some(item => item.id === "cold-coffee:flavoured-iced-caffe-latte"));
  assert.equal(flavoured.quantity, 3); assert.equal(flavoured.items.find(item => item.id.includes("flavoured")).variant, "vanilla");
  confirmationRow(flavoured.id).querySelector(".qb-remove").click();
  assert.equal(savedDraft().groups.length, 1, "Remove works directly on the confirmation screen");
  assert.match(replaceComposer.querySelector(".qb-notice").textContent, /Removed.*Vanilla/);
  assert.equal(catalogCard("desserts:macaron").querySelector(".qb-in-cart").hidden, true);
  confirmationRow(savedDraft().groups[0].id).querySelector(".qb-remove").click();
  assert.equal(savedDraft().groups.length, 0);
  assert(replaceComposer.querySelector(".qb-confirmation-checkout").disabled);
  assert.equal(replaceComposer.querySelector(".qb-next-step").textContent, "Start with your first drink.");
  }
  // The SKU cap spans separate lines. Both rendered order surfaces must
  // advertise a blocked increase and recover immediately after a decrease.
  {
    const bulk = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
    document.body.replaceChildren(bulk); flushAnimationFrames();
    for (let count = 1; count < 98; count++) bulk.querySelector("#qb-composer").querySelector('[data-step="up"]').click();
    bulk.querySelector(".qb-add").click();
    const capped = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
    document.body.replaceChildren(capped); flushAnimationFrames();
    const detail = capped.querySelector("#qb-composer"), cart = capped.querySelector("#qb-cart");
    detail.querySelector('[data-dessert-id="desserts:macaron"]').click(); detail.querySelector(".qb-add").click();
    const rows = surface => surface.querySelectorAll("[data-group-id]");
    const allIncreasesDisabled = surface => rows(surface).every(row => row.querySelector('[data-step="up"]').disabled);
    const atLimit = savedDraft();
    assert.equal(atLimit.lines.find(line => line.id === "brew-hot:black-tea").quantity, 99);
    assert.equal(cart.querySelector(".qb-grand-total").querySelector("strong").textContent, money(4980));
    assert.equal(allIncreasesDisabled(cart), true, "Both cart increases respect tea's aggregate cap across groups");
    assert.equal(allIncreasesDisabled(detail), true, "Confirmation uses the same aggregate cap");
    rows(detail).find(row => row.querySelector("output").textContent === "1").querySelector('[data-step="up"]').click();
    assert.deepEqual(savedDraft(), atLimit, "A disabled pair increase cannot partially add a dessert");
    detail.querySelector(".qb-customizer-close").click();
    rows(cart).find(row => row.querySelector("output").textContent === "98").querySelector('[data-step="down"]').click();
    assert(rows(cart).every(row => !row.querySelector('[data-step="up"]').disabled), "Decreasing a standalone tea immediately re-enables each eligible cart increase");
    capped.querySelector(".qb-dock-review").click();
    assert(rows(detail).every(row => !row.querySelector('[data-step="up"]').disabled), "Reopened confirmation reflects the recovered allowance");
    rows(detail).find(row => row.querySelector("output").textContent === "1").querySelector('[data-step="up"]').click();
    const recovered = savedDraft();
    assert.equal(recovered.lines.find(line => line.id === "brew-hot:black-tea").quantity, 99);
    assert.equal(recovered.lines.find(line => line.id === "desserts:macaron").quantity, 2);
    assert.equal(cart.querySelector(".qb-grand-total").querySelector("strong").textContent, money(5010));
    assert.equal(detail.querySelector(".qb-grand-total").querySelector("strong").textContent, money(5010));
    assert.equal(allIncreasesDisabled(cart), true);
    assert.equal(allIncreasesDisabled(detail), true);
    while (detail.querySelector(".qb-remove")) detail.querySelector(".qb-remove").click();
    assert.equal(savedDraft().groups.length, 0);
  }
  // A carried-over second Add tap lands on the shorter confirmation's
  // backdrop in a real browser. It must not dismiss the successful selection.
  {
    const tapRoot = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 2 });
    document.body.replaceChildren(tapRoot); flushAnimationFrames();
    const detail = tapRoot.querySelector("#qb-composer"), dialog = tapRoot.querySelector(".qb-customizer");
    detail.querySelector('[data-dessert-id="desserts:macaron"]').click();
    const add = detail.querySelector(".qb-add"); add.click();
    const afterAdd = savedDraft(); add.click();
    const backdrop = () => dialog.dispatchEvent(Object.assign(new Event("click"), { clientX: 50, clientY: 600 }));
    backdrop();
    assert.equal(dialog.open, true, "The second Add tap must leave next-step confirmation visible");
    assert.deepEqual(savedDraft(), afterAdd, "The carried-over tap cannot duplicate a pair");
    clock += 600; backdrop();
    assert.equal(dialog.open, false, "A later deliberate backdrop tap still dismisses the dialog");
  }
  // Resume browsing, change a cart line, or leave the builder while the
  // optional checkout code is delayed. Each cancels only that pending intent.
  for (const mode of ["new-selection", "cart-change", "detached", "search", "clear-search", "reset-search", "category", "inspiration", "current"]) {
    const pendingRoot = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
    document.body.replaceChildren(pendingRoot); flushAnimationFrames();
    pendingRoot.querySelector(".qb-add").click();
    const pendingSearch = pendingRoot.querySelector("#qb-search");
    if (mode === "clear-search" || mode === "reset-search") {
      pendingRoot.querySelector(".qb-customizer-close").click();
      pendingSearch.value = mode === "clear-search" ? "tea" : "nothingmatchesxyz";
      pendingSearch.dispatchEvent(new Event("input"));
      pendingRoot.querySelector(".qb-dock-review").click();
    }
    let release, calls = 0, opens = 0;
    globalThis.__robysCheckoutBoundary = async (_draft, _language, _button, shouldOpen) => {
      calls += 1;
      await new Promise(resolve => { release = resolve; });
      if (shouldOpen()) opens += 1;
    };
    pendingRoot.querySelector(".qb-confirmation-checkout").click();
    const pendingCart = pendingRoot.querySelector("#qb-cart");
    pendingCart.querySelector(".qb-checkout").querySelector("button").click();
    assert.equal(calls, 1, "Another order control must not start a second pending checkout");
    if (mode === "new-selection") pendingRoot.querySelector('[data-product-id="hot-coffee:americano"]').click();
    if (mode === "cart-change") pendingCart.querySelector('[data-step="up"]').click();
    if (mode === "detached") document.body.replaceChildren();
    if (mode === "search") { pendingSearch.value = "latte"; pendingSearch.dispatchEvent(new Event("input")); }
    if (mode === "clear-search") pendingRoot.querySelector(".qb-search-clear").click();
    if (mode === "reset-search") pendingRoot.querySelector(".qb-no-results").querySelector("button").click();
    if (mode === "category") pendingRoot.querySelector('[data-category="desserts"]').click();
    if (mode === "inspiration") pendingRoot.querySelector(".qb-inspiration-card").click();
    release();
    for (let tick = 0; tick < 6; tick++) await Promise.resolve();
    assert.equal(opens, mode === "current" ? 1 : 0, `Delayed quick checkout: ${mode}`);
  }
  // A recoverable network error belongs to the failed attempt. It must not
  // stay visible beside the order after a later checkout succeeds.
  {
    const retryRoot = createQuickBuilder("en", () => {}, { productId: "brew-hot:black-tea", quantity: 1 });
    document.body.replaceChildren(retryRoot); flushAnimationFrames();
    retryRoot.querySelector(".qb-add").click();
    globalThis.__robysCheckoutBoundary = async () => { throw new Error("network unavailable"); };
    retryRoot.querySelector(".qb-confirmation-checkout").click();
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.match(retryRoot.querySelector(".qb-notice").textContent, /could not open/);
    let opens = 0;
    globalThis.__robysCheckoutBoundary = async (_draft, _language, _button, shouldOpen) => { if (shouldOpen()) opens += 1; };
    retryRoot.querySelector(".qb-checkout").querySelector("button").click();
    assert.equal(retryRoot.querySelector(".qb-notice").textContent, "", "Starting a valid retry clears the old error immediately");
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.equal(opens, 1);
    assert.equal(retryRoot.querySelector(".qb-notice").textContent, "", "Successful checkout must not leave a failed-attempt announcement");
  }
  // Use the buyer's actual kids controls in each locale. Assertions keep the
  // recipes/prices independent of the shared view and inspect persisted groups.
  const kidsCopy = {
    tr: { title: "Çocuk Menüsü", mini: "Mini Kombo", big: "Büyük Kombo", added: "Siparişine eklendi", updated: "Sipariş güncellendi", stale: "Sipariş değişti", ingredients: ["Süt", "Cookie", "Üç Peynirli Kruvasan"] },
    en: { title: "Kids' Menu", mini: "Mini Combo", big: "Big Combo", added: "Added to your order", updated: "Order updated", stale: "The order changed", ingredients: ["Milk", "Cookie", "Three-Cheese Croissant"] },
    ru: { title: "Детское меню", mini: "Мини-комбо", big: "Большое комбо", added: "Добавлено в заказ", updated: "Заказ обновлён", stale: "Заказ изменился", ingredients: ["Молоко", "Печенье", "Круассан с тремя сырами"] }
  };
  const milkId = "brew-hot:milk", cookieId = "desserts:cookie", croissantId = "food:three-cheese-croissant";
  const miniIds = [milkId, cookieId], bigIds = [milkId, croissantId, cookieId];
  const recipe = (draft, ids) => draft.groups.find(group => group.items.length === ids.length
    && group.items.every(item => ids.includes(item.id) && item.quantity === 1 && !item.variant));
  const settleKids = async () => { for (let tick = 0; tick < 3; tick++) await Promise.resolve(); };
  const comboCard = (surface, id) => surface.querySelector(`[data-kids-combo="${id}"]`);
  const groupRow = (surface, group) => surface.querySelectorAll("[data-group-id]").find(row => row.dataset.groupId === group.id);
  const seedKids = lines => {
    localStorage.setItem("robys-menu-order.v1", JSON.stringify({ version: 1, lines }));
    sessionStorage.removeItem("robys-menu-order.v1");
  };
  for (const [language, expected] of Object.entries(kidsCopy)) {
    const locale = { tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language];
    const amount = value => new numberFormat(locale, { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
    seedKids([{ id: "brew-hot:black-tea", quantity: 2 }]);
    const kidsRoot = createQuickBuilder(language, () => {}); document.body.replaceChildren(kidsRoot); flushAnimationFrames();
    const kidsCart = kidsRoot.querySelector("#qb-cart"), detail = kidsRoot.querySelector("#qb-composer");
    const dialog = kidsRoot.querySelector(".qb-customizer");
    const totalIs = value => {
      assert.equal(kidsCart.querySelector(".qb-grand-total").querySelector("strong").textContent, amount(value), `${language}: complete cart total`);
      if (dialog.open && detail.querySelector(".qb-grand-total")) {
        assert.equal(detail.querySelector(".qb-grand-total").querySelector("strong").textContent, amount(value), `${language}: complete confirmation total`);
      }
    };
    const checkRow = (surface, group, kind) => {
      const row = groupRow(surface, group);
      assert(row, `${language}: ${kind} is visible on the order surface`);
      assert(row.textContent.includes(expected[kind]), `${language}: the combo name remains visible`);
      const labels = kind === "big" ? expected.ingredients : expected.ingredients.slice(0, 2);
      labels.forEach(label => assert(row.textContent.includes(label), `${language}: actual component ${label} remains visible`));
      const frames = row.querySelectorAll(".qb-photo");
      assert.equal(frames.length, kind === "big" ? 3 : 2, `${language}: each component has one photo frame`);
      assert(frames.every(frame => frame.querySelector("img").loading === "eager"), `${language}: order photos load immediately`);
      return row;
    };
    assert(kidsRoot.querySelector(".qb-kids-entry").textContent.includes(expected.title));
    kidsRoot.querySelector(".qb-kids-entry").click();
    assert.equal(kidsRoot.querySelectorAll(".qb-chip")[1].dataset.category, "kids-menu", `${language}: kids category follows All`);
    assert.equal(kidsRoot.querySelector('[data-category="kids-menu"]').getAttribute("aria-pressed"), "true");
    assert.equal(kidsRoot.querySelector(".kids-menu-title").textContent, expected.title);
    assert.equal(document.activeElement, kidsRoot.querySelector(".kids-menu-title"), `${language}: the dedicated entry focuses its heading`);
    kidsRoot.querySelector('[data-category="all"]').click();
    assert.equal(kidsRoot.querySelectorAll(".kids-combo").length, 0);
    kidsRoot.querySelector('[data-category="kids-menu"]').click();
    assert.equal(kidsRoot.querySelectorAll(".kids-combo").length, 2);
    assert.equal(kidsRoot.querySelectorAll(".qb-product").length, 0, `${language}: the kids chip opens the curated choices`);
    for (const [id, kind, cost, count] of [["kids-mini", "mini", 160, 2], ["kids-big", "big", 330, 3]]) {
      const card = comboCard(kidsRoot, id);
      assert.equal(card.querySelector("h3").textContent, expected[kind]);
      assert.equal(card.querySelector(".kids-combo-total").textContent, amount(cost));
      assert.equal(card.querySelectorAll(".kids-combo-product").length, count);
      assert.equal(card.querySelectorAll(".qb-photo").length, count);
      assert(card.querySelectorAll("img").every(image => image.loading === "eager"));
    }
    const kidsSearch = kidsRoot.querySelector("#qb-search");
    kidsSearch.value = expected.ingredients[2]; kidsSearch.dispatchEvent(new Event("input"));
    assert.equal(kidsRoot.querySelectorAll(".kids-combo").length, 1, `${language}: ingredient search filters the kids category`);
    assert(comboCard(kidsRoot, "kids-big"));
    kidsRoot.querySelector(".qb-search-clear").click();
    assert.equal(kidsRoot.querySelectorAll(".kids-combo").length, 2);
    const individual = kidsRoot.querySelectorAll(".kids-menu-product");
    assert.equal(individual.length, 3, `${language}: components remain individually selectable`);
    const beforeIndividual = savedDraft();
    individual[0].click();
    assert.equal(dialog.open, true);
    assert.equal(detail.querySelector(".qb-selection-photos").querySelectorAll("figure").length, 1);
    assert(detail.querySelector(".qb-choice-summary").textContent.includes(expected.ingredients[0]));
    detail.querySelector(".qb-customizer-close").click();
    assert.deepEqual(savedDraft(), beforeIndividual, `${language}: reviewing milk alone does not add a combo`);

    const miniAdd = comboCard(kidsRoot, "kids-mini").querySelector(".kids-combo-add");
    miniAdd.click(); miniAdd.click();
    let mini = recipe(savedDraft(), miniIds);
    assert.equal(mini.quantity, 1, `${language}: a carried-over double activation adds only one set`);
    assert.equal(miniAdd.disabled, true); await settleKids(); assert.equal(miniAdd.disabled, false);
    assert.equal(miniAdd.getAttribute("aria-busy"), null);
    assert.equal(dialog.open, true);
    assert.equal(detail.querySelector("h2").textContent, expected.added);
    assert.equal(document.activeElement, detail.querySelector("h2"));
    const other = savedDraft().groups.find(group => group.items[0].id === "brew-hot:black-tea");
    assert.equal(detail.querySelectorAll(".qb-confirmation-line").length, 2, `${language}: confirmation includes earlier choices`);
    checkRow(detail, mini, "mini"); checkRow(kidsCart, mini, "mini"); totalIs(260);
    detail.querySelector(".qb-confirmation-more").click();
    miniAdd.click(); await settleKids();
    mini = recipe(savedDraft(), miniIds);
    assert.equal(savedDraft().groups.length, 2);
    assert.equal(mini.quantity, 2, `${language}: a later deliberate Mini addition merges its group`);
    assert.deepEqual(savedDraft().groups.find(group => group.id === other.id), other);
    totalIs(420);
    groupRow(detail, mini).querySelector('[data-step="up"]').click();
    assert.equal(recipe(savedDraft(), miniIds).quantity, 3);
    groupRow(detail, mini).querySelector('[data-step="down"]').click();
    assert.equal(recipe(savedDraft(), miniIds).quantity, 2); totalIs(420);
    detail.querySelector(".qb-customizer-close").click();
    groupRow(kidsCart, mini).querySelector('[data-step="up"]').click();
    assert.equal(recipe(savedDraft(), miniIds).quantity, 3);
    groupRow(kidsCart, mini).querySelector('[data-step="down"]').click();
    assert.equal(recipe(savedDraft(), miniIds).quantity, 2); totalIs(420);

    const beforeReplace = savedDraft();
    groupRow(kidsCart, mini).querySelector(".qb-replace").click();
    assert.deepEqual(savedDraft(), beforeReplace, `${language}: replacement is only a preview until a choice is saved`);
    assert.notEqual(detail.querySelector(".kids-menu-title").id, kidsRoot.querySelector(".kids-menu-title").id,
      `${language}: replacement and catalog headings have distinct IDs`);
    assert.equal(comboCard(detail, "kids-big").querySelector(".kids-combo-total").textContent, amount(660),
      `${language}: a two-set replacement quotes the complete new amount before saving`);
    assert(comboCard(detail, "kids-big").querySelector(".kids-combo-add").textContent.includes(`2 × ${expected.big}`));
    comboCard(detail, "kids-big").querySelector(".kids-combo-add").click(); await settleKids();
    let big = recipe(savedDraft(), bigIds);
    assert.equal(big.quantity, 2, `${language}: Mini to Big preserves set quantity`);
    assert.equal(recipe(savedDraft(), miniIds), undefined);
    assert.equal(savedDraft().groups.length, 2);
    assert.deepEqual(savedDraft().groups.find(group => group.id === other.id), other);
    assert.equal(detail.querySelector("h2").textContent, expected.updated);
    checkRow(detail, big, "big"); checkRow(kidsCart, big, "big"); totalIs(760);
    groupRow(detail, big).querySelector(".qb-replace").click();
    assert.equal(comboCard(detail, "kids-mini").querySelector(".kids-combo-total").textContent, amount(320));
    comboCard(detail, "kids-mini").querySelector(".kids-combo-add").click(); await settleKids();
    mini = recipe(savedDraft(), miniIds);
    assert.equal(mini.quantity, 2, `${language}: Big to Mini also preserves quantity`);
    assert.equal(recipe(savedDraft(), bigIds), undefined);
    assert.deepEqual(savedDraft().groups.find(group => group.id === other.id), other); totalIs(420);
    detail.querySelector(".qb-confirmation-more").click();
    comboCard(kidsRoot, "kids-big").querySelector(".kids-combo-add").click(); await settleKids();
    big = recipe(savedDraft(), bigIds);
    assert.equal(big.quantity, 1);
    assert.deepEqual(big.items.map(item => item.id), bigIds, `${language}: Big persists all three real products`);
    assert(savedDraft().lines.every(line => !line.id.startsWith("kids-")), `${language}: no invented combo SKU enters the order`);
    assert.equal(savedDraft().groups.length, 3); totalIs(750);
    checkRow(detail, big, "big").querySelector(".qb-remove").click();
    assert.equal(recipe(savedDraft(), bigIds), undefined);
    assert.equal(savedDraft().groups.length, 2); totalIs(420);

    groupRow(detail, mini).querySelector(".qb-replace").click();
    const staleChoice = comboCard(detail, "kids-big").querySelector(".kids-combo-add");
    const newer = savedDraft(); recipe(newer, miniIds).quantity = 3;
    newer.lines.filter(line => miniIds.includes(line.id)).forEach(line => { line.quantity = 3; });
    localStorage.setItem("robys-menu-order.v1", JSON.stringify(newer));
    window.dispatchEvent(Object.assign(new Event("storage"), { key: "robys-menu-order.v1" }));
    staleChoice.click(); await settleKids();
    assert.deepEqual(savedDraft(), newer, `${language}: stale replacement cannot overwrite the latest set or other choices`);
    assert(detail.querySelector(".qb-notice").textContent.includes(expected.stale));
    assert(detail.querySelector(".kids-menu-status").textContent.length > 0, `${language}: failed replacement has local feedback`);
    assert.equal(dialog.open, true); assert.equal(staleChoice.disabled, false);
    detail.querySelector(".qb-customizer-close").click();
    groupRow(kidsCart, recipe(savedDraft(), miniIds)).querySelector(".qb-remove").click();
    assert.deepEqual(savedDraft().groups, [other], `${language}: removing Mini preserves the earlier order`);
    kidsCart.querySelector(".qb-remove").click();
    assert.equal(savedDraft().groups.length, 0); totalIs(0);

    // Milk's 99-product allowance spans a standalone line and both sets. A
    // failed Big add cannot partially write its cookie or croissant.
    seedKids([{ id: milkId, quantity: 98 }, { id: "brew-hot:black-tea", quantity: 2 }]);
    const cappedRoot = createQuickBuilder(language, () => {}); document.body.replaceChildren(cappedRoot); flushAnimationFrames();
    cappedRoot.querySelector(".qb-kids-entry").click();
    comboCard(cappedRoot, "kids-mini").querySelector(".kids-combo-add").click(); await settleKids();
    const cappedDetail = cappedRoot.querySelector("#qb-composer"), cappedCart = cappedRoot.querySelector("#qb-cart");
    const atLimit = savedDraft(), limitedMini = recipe(atLimit, miniIds);
    assert.equal(atLimit.lines.find(line => line.id === milkId).quantity, 99);
    for (const surface of [cappedCart, cappedDetail]) {
      assert.equal(groupRow(surface, limitedMini).querySelector('[data-step="up"]').disabled, true);
      groupRow(surface, limitedMini).querySelector('[data-step="up"]').click();
      assert.deepEqual(savedDraft(), atLimit, `${language}: capped quantity cannot add another cookie`);
    }
    cappedDetail.querySelector(".qb-customizer-close").click();
    const bigAdd = comboCard(cappedRoot, "kids-big").querySelector(".kids-combo-add");
    bigAdd.click(); await settleKids();
    assert.deepEqual(savedDraft(), atLimit, `${language}: capped Big addition is atomic across every component`);
    assert.equal(savedDraft().lines.some(line => line.id === croissantId), false);
    assert(cappedRoot.querySelector(".kids-menu-status").textContent.length > 0);
    assert.equal(cappedRoot.querySelector(".qb-customizer").open, false);
    const milkOnly = atLimit.groups.find(group => group.items.length === 1 && group.items[0].id === milkId);
    groupRow(cappedCart, milkOnly).querySelector('[data-step="down"]').click();
    assert.equal(groupRow(cappedCart, limitedMini).querySelector('[data-step="up"]').disabled, false);
    bigAdd.click(); await settleKids();
    assert.equal(recipe(savedDraft(), bigIds).quantity, 1, `${language}: freed allowance permits a later complete set`);
    assert.equal(savedDraft().lines.find(line => line.id === milkId).quantity, 99);
    assert.equal(savedDraft().lines.find(line => line.id === cookieId).quantity, 2);
    assert.equal(savedDraft().lines.find(line => line.id === croissantId).quantity, 1);
    assert.equal(cappedCart.querySelector(".qb-grand-total").querySelector("strong").textContent, amount(6410));
    assert.equal(cappedDetail.querySelector(".qb-grand-total").querySelector("strong").textContent, amount(6410));
  }
  console.log("Quick builder UI PASS: responsive photo identity; visible order quantities; replacements, stale edits and required flavours; persistent double-tap confirmation; abandoned or changed delayed checkout cancels; complete totals and modal focus; TR/EN/RU kids navigation, recipes/prices/photos, repeat merges, quantity/removal, atomic replacement and shared 99-product cap.");
} finally {
  Intl.NumberFormat = numberFormat;
  for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
