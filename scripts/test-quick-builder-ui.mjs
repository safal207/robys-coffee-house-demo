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
  tea.click();
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards, "Selecting a product must preserve catalog card identity");
  assert.deepEqual(cards.map(card => card.querySelector("img")), photos, "Selecting a product must preserve all existing photo nodes");
  assert.equal(tea.getAttribute("aria-pressed"), "true");
  assert.match(tea.querySelector(".qb-product-action").textContent, /Selected/);
  assert.equal(document.activeElement, composer.querySelector("h2"));
  assert.equal(composer.scrolled, true, "Mobile selection still scrolls to its composer");
  composer.querySelector('[data-step="up"]').click();
  tea.click();
  assert.equal(composer.querySelector("output").textContent, "2", "Repeated selection must preserve composer quantity");
  coffee.click();
  assert.equal(tea.getAttribute("aria-pressed"), "false");
  assert.equal(coffee.getAttribute("aria-pressed"), "true");
  assert.equal(composer.querySelector("output").textContent, "1");
  assert.deepEqual(root.querySelectorAll(".qb-product"), cards);
  const cart = root.querySelector("#qb-cart");
  let before = cart.replacements;
  composer.querySelector(".qb-add").click();
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
  console.log("Quick builder UI PASS: persistent photo nodes, selected labels/focus, filtered and repeated selection, one cart render, external updates, cached locale formatters.");
} finally {
  Intl.NumberFormat = numberFormat;
  for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
