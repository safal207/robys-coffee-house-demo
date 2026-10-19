import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { menuCategories } from "../menu-catalog.js";
import { addOrderGroup, normalizeOrderDraft } from "../src/order-draft.js";
import { familyRecipes, quoteFamilySelection, stageFamilySelection } from "../src/menu-family.js";

const index = new Map();
for (const category of menuCategories) for (const item of category.items ?? category.groups.flatMap(group => group.items)) {
  const slug = item.name.en.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const id = `${category.id}:${item.id ?? slug}`;
  index.set(id, { id, category, item });
}
const validIds = new Set(index.keys());
const empty = () => normalizeOrderDraft({}, validIds);

test("family recipes reference real menu products and current ordinary prices in all three languages", () => {
  assert.equal(familyRecipes.length, 3);
  const totals = [160, 195, 230];
  familyRecipes.forEach((recipe, position) => {
    for (const locale of ["tr", "en", "ru"]) assert.ok(recipe.name[locale]);
    assert.ok(recipe.productIds.length >= 2 && recipe.productIds.length <= 3);
    const quote = quoteFamilySelection(recipe.id, recipe.productIds, index);
    assert.equal(quote.valid, true);
    assert.equal(quote.total, totals[position]);
    assert.ok(quote.products.every(product => validIds.has(product.id)));
  });
});

test("unchecking components uses catalog prices and preserves the remaining independent products", () => {
  const recipe = familyRecipes[1];
  const chosen = ["brew-hot:milk", "food:sesame-simit"];
  assert.equal(quoteFamilySelection(recipe.id, chosen, index).total, 95);
  const result = stageFamilySelection(empty(), recipe.id, chosen, index, validIds);
  assert.equal(result.applied, true);
  assert.equal(result.draft.groups.length, 2);
  assert.ok(result.draft.groups.every(group => group.items.length === 1));
  assert.deepEqual(result.draft.lines, [{ id: "brew-hot:milk", quantity: 1 }, { id: "food:sesame-simit", quantity: 1 }]);
});

test("a changed catalog price is reflected immediately without a stored recipe price", () => {
  const changed = new Map(index);
  const milk = index.get("brew-hot:milk");
  changed.set(milk.id, { ...milk, item: { ...milk.item, price: 70 } });
  assert.equal(quoteFamilySelection("milk-cookie", familyRecipes[0].productIds, changed).total, 170);
});

test("empty, duplicate, unknown and unrelated selections never mutate or normalize the input draft", () => {
  const draft = empty();
  const original = structuredClone(draft);
  for (const [recipeId, selected] of [["milk-cookie", []], ["unknown", ["brew-hot:milk"]],
    ["milk-cookie", ["brew-hot:milk", "brew-hot:milk"]], ["milk-cookie", ["unknown:juice"]],
    ["milk-cookie", ["hot-coffee:espresso"]], ["milk-cookie", null]]) {
    const result = stageFamilySelection(draft, recipeId, selected, index, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
    assert.deepEqual(draft, original);
  }
});

test("a later component at capacity rolls back every staged earlier addition", () => {
  for (const atLimit of ["food:sesame-simit", "desserts:cookie"]) {
    const draft = addOrderGroup(empty(), [{ id: atLimit }], 99, validIds).draft;
    const before = structuredClone(draft);
    const result = stageFamilySelection(draft, "simit-break", familyRecipes[1].productIds, index, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
    assert.deepEqual(draft, before);
    assert.equal(result.draft.lines.some(line => line.id === "brew-hot:milk"), false);
  }
});

test("ordinary existing lines are incremented independently and capped across a grouped pair", () => {
  let draft = addOrderGroup(empty(), [{ id: "brew-hot:milk" }, { id: "desserts:cookie" }], 98, validIds).draft;
  const added = stageFamilySelection(draft, "milk-cookie", familyRecipes[0].productIds, index, validIds);
  assert.equal(added.applied, true);
  assert.equal(added.draft.groups.length, 3);
  assert.deepEqual(added.draft.lines, [{ id: "brew-hot:milk", quantity: 99 }, { id: "desserts:cookie", quantity: 99 }]);
  const blocked = stageFamilySelection(added.draft, "milk-cookie", familyRecipes[0].productIds, index, validIds);
  assert.equal(blocked.applied, false);
  assert.strictEqual(blocked.draft, added.draft);
  assert.deepEqual(draft.lines, [{ id: "brew-hot:milk", quantity: 98 }, { id: "desserts:cookie", quantity: 98 }]);
});

test("a missing or corrupt catalog component blocks the recipe rather than inventing a price", () => {
  for (const replacement of [undefined, { ...index.get("brew-hot:milk"), item: { price: NaN } }]) {
    const changed = new Map(index);
    changed.set("brew-hot:milk", replacement);
    const draft = empty();
    const result = stageFamilySelection(draft, "milk-cookie", familyRecipes[0].productIds, changed, validIds);
    assert.equal(result.applied, false);
    assert.strictEqual(result.draft, draft);
  }
});

test("one family hub retains ready sets, editable ideas and Kids Box across languages and real actions", async () => {
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this.className = ""; this._text = ""; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    append(...nodes) { nodes.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    replaceChildren(...nodes) { this._text = ""; this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) {
      if (selector === "input:checked") return this.tagName === "input" && this.checked;
      if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
      const data = selector.match(/^\[data-([\w-]+)\]$/);
      if (data) return this.dataset[data[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] !== undefined;
      return this.tagName === selector;
    }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    get classList() { return { add() {}, remove() {} }; }
    focus() { this.focused = true; }
    get isConnected() { return true; }
    showModal() { this.open = true; this.setAttribute("open", ""); }
    close() { this.open = false; this.removeAttribute("open"); }
    click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
  }
  const kidsSource = readFileSync(new URL("../src/kids-menu.js", import.meta.url), "utf8").replace(/^export /gm, "");
  const familySource = readFileSync(new URL("../src/menu-family-ui.js", import.meta.url), "utf8")
    .replace(/^import [^\n]+\n/gm, "").replace(/^export /gm, "");
  const settle = async () => { for (let tick = 0; tick < 5; tick++) await Promise.resolve(); };
  for (const language of ["tr", "en", "ru"]) {
    const document = Object.assign(new EventTarget(), {
      body: new Element("body"), createElement: tag => new Element(tag),
      createTextNode: text => { const node = new Element("#text"); node.textContent = text; return node; }
    });
    const notice = new Element("p");
    document.querySelector = () => notice;
    const createMenuFamilyUi = runInNewContext(`${kidsSource}\n${familySource}\ncreateMenuFamilyUi`, {
      document, familyRecipes, quoteFamilySelection, stageFamilySelection
    });
    const root = new Element("section"); document.body.append(root);
    let currentLanguage = language, draft = empty(), transactions = 0, opens = 0;
    const readyAdds = [], openedProducts = [];
    const ui = createMenuFamilyUi({ root, productIndex: index, orderProductIds: validIds, initialLanguage: language,
      localized: value => value[currentLanguage], formatPrice: value => `${value} ₺`, readDraft: () => draft,
      mutateDraft: async updater => { transactions++; const result = updater(draft); if (result.applied) draft = result.draft; return result; },
      onCartChange() {}, onIntent: () => () => true, openCart: async () => { opens++; },
      addKidsCombo: async (combo, trigger) => { readyAdds.push([combo.id, trigger]); return true; },
      openProduct: (id, trigger) => openedProducts.push([id, trigger])
    });
    const checkHub = () => {
      assert.equal(root.querySelectorAll(".kids-combo").length, 2, `${currentLanguage}: ready sets survive family initialization/refresh`);
      assert.equal(root.querySelectorAll(".menu-family-card").length, 3, `${currentLanguage}: accepted editable ideas remain`);
      assert.equal(root.querySelectorAll(".menu-family-coming-soon").length, 1);
      assert.equal(root.querySelector(".kids-menu-title").id, "kids-menu-title");
      assert.notEqual(root.querySelector(".kids-menu-title").textContent, root.querySelector(".menu-family-ideas-title").textContent);
      assert.equal(root.querySelectorAll(".kids-combo-total")[0].textContent.replace(/\D/g, ""), "160");
      assert.equal(root.querySelectorAll(".kids-combo-total")[1].textContent.replace(/\D/g, ""), "330");
    };
    checkHub();
    const addMini = root.querySelector(".kids-combo-add"); addMini.click(); addMini.click(); await settle();
    assert.equal(readyAdds.length, 1, "The ready Mini action delegates once, with its real trigger");
    assert.equal(readyAdds[0][0], "kids-mini"); assert.equal(readyAdds[0][1], addMini);
    assert.equal(transactions, 0, "The family UI must not also add separate copies of a ready set");
    root.querySelector(".kids-menu-product").click();
    assert.equal(openedProducts[0][0], "brew-hot:milk");
    root.querySelector(".menu-family-choose").click();
    const dialog = document.body.querySelector("dialog");
    assert.equal(dialog.open, true);
    const options = dialog.querySelectorAll("input"); assert.equal(options.length, 2);
    options[1].checked = false; options[1].dispatchEvent(new Event("change"));
    dialog.querySelector(".menu-family-add").click(); await settle();
    assert.equal(transactions, 1, "Accepted editable ideas still use one authoritative transaction");
    assert.deepEqual(draft.lines, [{ id: "brew-hot:milk", quantity: 1 }]);
    assert.equal(draft.groups.length, 1); assert.equal(draft.groups[0].items.length, 1);
    assert.equal(opens, 1);
    for (const nextLanguage of ["ru", "en", "tr"]) {
      currentLanguage = nextLanguage; ui.refresh(nextLanguage); checkHub();
    }
    assert.equal(readyAdds.length, 1, "Refreshing translations cannot re-add a ready set");
    assert.equal(transactions, 1, "Refreshing translations cannot re-add editable components");
  }
});
