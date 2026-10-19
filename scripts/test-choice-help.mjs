import assert from "node:assert/strict";
import test from "node:test";
import { canOfferChoiceHelp, choiceHelpRecipeId, quoteChoiceHelpSuggestion } from "../src/choice-help.js";
import { menuCategories } from "../menu-catalog.js";
import { comboRecipes, quoteComboSelection } from "../src/menu-combos.js";

const ready = { seen: false, visible: true, elapsed: 45_000, idle: 8_000,
  editing: false, overlay: false, hasOrder: false, checking: false, width: 320, height: 568 };

test("choice help waits for both visible time and a pause in interaction", () => {
  assert.equal(canOfferChoiceHelp(ready), true);
  assert.equal(canOfferChoiceHelp({ ...ready, elapsed: 44_999 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, idle: 7_999 }), false);
});

test("one recipe follows explicit menu context with a neutral default", () => {
  assert.equal(choiceHelpRecipeId(), "sweet");
  assert.equal(choiceHelpRecipeId({ category: "desserts" }), "sweet");
  assert.equal(choiceHelpRecipeId({ category: "food" }), "hearty");
  assert.equal(choiceHelpRecipeId({ family: true }), "family");
  assert.equal(choiceHelpRecipeId({ filter: "family" }), "family");
  assert.equal(choiceHelpRecipeId({ filter: "together" }), "together");
  assert.equal(choiceHelpRecipeId({ category: "hot-coffee" }), "sweet");
});

test("suggestion prices come from current recipe quantities and catalog products", () => {
  const suggest = (categories, context) => quoteChoiceHelpSuggestion(categories, comboRecipes, quoteComboSelection, context);
  assert.equal(suggest(menuCategories, {}).total, 280);
  assert.equal(suggest(menuCategories, { family: true }).total, 750);
  assert.equal(suggest(menuCategories, { category: "food" }).recipe.id, "hearty");
  const changed = structuredClone(menuCategories);
  const dessert = changed.find(category => category.id === "desserts");
  dessert.items.find(item => item.id === "cookie" || item.name.en === "Cookie").price += 10;
  assert.equal(suggest(changed, {}).total, 290, "catalog price changes update the suggestion immediately");
  assert.equal(suggest(changed, { family: true }).total, 770, "family quantities remain part of the quote");
  assert.equal(suggest([], {}), null, "unavailable recipe products fall back to generic help");
});

test("choice help never interrupts editing, ordering, hidden pages or pending basket reads", () => {
  for (const flag of ["seen", "editing", "overlay", "hasOrder", "checking"]) {
    assert.equal(canOfferChoiceHelp({ ...ready, [flag]: true }), false, flag);
  }
  assert.equal(canOfferChoiceHelp({ ...ready, visible: false }), false);
});

test("choice help avoids short landscape screens without blocking small portrait phones", () => {
  assert.equal(canOfferChoiceHelp({ ...ready, width: 844, height: 390 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, width: 279 }), false);
  assert.equal(canOfferChoiceHelp({ ...ready, width: 280, height: 500 }), true);
});
