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
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
      const key = attribute[1].replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = attribute[1].startsWith("data-") ? this.dataset[key] : this.getAttribute(attribute[1]);
      return attribute[2] === undefined ? value !== undefined && value !== null : value === attribute[2];
    }
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
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
  click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}

const previous = new Map(["window", "document", "localStorage", "sessionStorage"].map(key => [key, globalThis[key]]));
const numberFormat = Intl.NumberFormat;
let formatterCount = 0;
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};
try {
  globalThis.document = { createElement: tag => new TestElement(tag), activeElement: null, body: new TestElement("body") };
  globalThis.window = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) });
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  Intl.NumberFormat = function (...args) { formatterCount++; return new numberFormat(...args); };
  const output = await build({ entryPoints: ["src/smart-choice/quick-builder.ts"], bundle: true,
    platform: "node", format: "esm", target: "node20", write: false });
  const { createQuickBuilder } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  const root = createQuickBuilder("en", () => {}); document.body.append(root);
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
  composer.querySelector(".qb-add").click();
  assert.equal(customizer.open, false, "Adding finishes the composer and returns to the catalog");
  assert.equal(cart.replacements - before, 1, "Own add must render the cart once, not twice through its event echo");
  before = cart.replacements;
  cart.querySelector('[data-step="up"]').click();
  assert.equal(cart.replacements - before, 1, "Own quantity step must render the cart once");
  assert.equal(cart.querySelector("output").textContent, "2");
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
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  assert.equal(composer.querySelector("output").textContent, "2", "A dessert selection preserves the drink quantity");
  assert.equal(composer.querySelectorAll(".qb-selection-photos")[0].querySelectorAll("figure").length, 2);
  composer.querySelector(".qb-customizer-close").click();
  assert.deepEqual(savedDraft(), beforeEdit, "Cancel must not alter or remove the original item");
  cart.querySelector(".qb-edit").click();
  composer.querySelector('[data-dessert-id="desserts:macaron"]').click();
  composer.querySelector(".qb-add").click();
  const pairedDraft = savedDraft();
  assert.equal(pairedDraft.groups.length, 1, "Saving an edit replaces the original instead of adding another copy");
  assert.equal(pairedDraft.groups[0].quantity, 2);
  assert.deepEqual(pairedDraft.groups[0].items.map(item => item.id), ["hot-coffee:americano", "desserts:macaron"]);
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
  assert.equal(cappuccino.getAttribute("aria-pressed"), "false");
  assert.equal(caramelCappuccino.getAttribute("aria-pressed"), "true");
  assert.match(composer.querySelector(".qb-selection-photos").querySelector("img").src, /hot-coffee--caramel-cappuccino/);
  const money = value => new numberFormat("en-US", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
  assert.equal(composer.querySelector(".qb-add-total").querySelector("strong").textContent, money(460), "Family price comes from the selected canonical drink plus dessert, times quantity");
  composer.querySelector(".qb-add").click();
  const cappuccinoPair = savedDraft().groups.find(group => group.items[0].id === "hot-coffee:caramel-cappuccino");
  assert.equal(cappuccinoPair.quantity, 2);
  assert.equal(cappuccinoPair.items[1].id, "desserts:macaron");
  const pairRow = cart.querySelectorAll(".qb-order-group").find(row => row.dataset.groupId === cappuccinoPair.id);
  pairRow.querySelector(".qb-edit").click();
  composer.querySelector('[data-choice-id="hot-coffee:cappuccino/plain"]').click();
  composer.querySelector(".qb-add").click();
  assert(!savedDraft().groups.some(group => group.items[0].id === "hot-coffee:caramel-cappuccino"), "Editing a drink option replaces the original canonical product");
  assert.equal(savedDraft().groups.find(group => group.items[0].id === "hot-coffee:cappuccino").quantity, 2);
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
  console.log("Quick builder UI PASS: desktop/mobile modal, focus return, visible sweets/flavours, edit/save/cancel and stale edits, persistent photo nodes, one cart render, external updates, cached locale formatters.");
} finally {
  Intl.NumberFormat = numberFormat;
  for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
