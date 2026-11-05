import assert from "node:assert/strict";
import test from "node:test";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { calorieRange, nutritionPortions, nutritionPairs } from "../src/menu-nutrition-portions.js";
import { createCalorieLookup, formatCalorieLabel } from "../src/menu-nutrition-summary.js";
const calorieLabel = createCalorieLookup(menuCategories);
import { nutritionDetails, nutritionSelectionDetails, nutritionRecipes, nutritionCopy } from "../src/menu-nutrition.js";

const products = feedProducts(menuCategories);

test("every menu item and pairing has an explicit portion and nutrition in all three languages", () => {
  const ids = products.map(product => product.id).sort();
  assert.deepEqual([...Object.keys(nutritionPortions), ...Object.keys(nutritionPairs)].sort(), ids);
  assert.deepEqual(Object.keys(nutritionRecipes).sort(), ids.filter(id => !id.startsWith("pairing-offers:")));
  for (const product of products) {
    for (const language of ["tr", "en", "ru"]) {
      const data = nutritionDetails(product, language);
      assert.equal(calorieLabel(product.id, language), formatCalorieLabel(calorieRange(product.id), language));
      for (const field of ["calorie", "portion", "ingredients", "ingredientLabel", "benefits", "vitamins"]) {
        assert.equal(typeof data[field], "string", `${product.id}/${language}/${field}`);
        assert.ok(data[field].length > 2, `${product.id}/${language}/${field} must be populated`);
        assert.doesNotMatch(data[field], /undefined|null|NaN/);
      }
      assert.ok(nutritionCopy[language].note.length > 60, "uncertainty must be visible in each locale");
    }
  }
});

test("calories use bounded ranges and identified example portions, including the small macaron", () => {
  for (const [id, [low, high, portion, unit]] of Object.entries(nutritionPortions)) {
    assert.ok(Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high > low, id);
    assert.ok(portion > 0 && ["ml", "g"].includes(unit), id);
  }
  assert.deepEqual(nutritionPortions["desserts:macaron"], [70, 110, 20, "g"]);
  assert.deepEqual(calorieRange("pairing-offers:cool-lime-macaron-pairing"), [150, 290]);
  assert.deepEqual(calorieRange("pairing-offers:iced-san-sebastian-pairing"), [440, 670]);
  assert.equal(calorieRange("missing:product"), null);
  assert.equal(calorieLabel("constructor"), "");
});

test("syrup flavours never imply fruit or nut vitamin content", () => {
  const hazelnut = nutritionDetails(products.find(p => p.id === "hot-coffee:hazelnut-latte"), "ru");
  assert.match(hazelnut.ingredients, /Сироп со вкусом фундука/);
  assert.doesNotMatch(hazelnut.vitamins, /витамин E/);
  for (const product of products.filter(p => p.category.id === "refreshers")) {
    assert.match(nutritionDetails(product, "ru").vitamins, /Сиропу витамины не приписываются/);
  }
});

test("a chosen drink and dessert sum both portions and describe both components", () => {
  const selection = ["hot-coffee:caffe-latte", "desserts:macaron"].map(id => products.find(product => product.id === id));
  const data = nutritionSelectionDetails(selection, "ru");
  assert.deepEqual(calorieRange(selection.map(product => product.id)), [190, 290]);
  assert.match(data.calorie, /190–290/);
  assert.equal(data.portion, "300 мл + 20 г");
  assert.match(data.ingredients, /Эспрессо/);
  assert.match(data.ingredients, /Миндаль/);
  assert.match(data.vitamins, /B12/);
  assert.match(data.vitamins, /витамин E/);
  assert.equal(nutritionSelectionDetails([], "ru"), null);
  assert.equal(calorieRange([selection[0].id, "missing:dessert"]), null);
});

test("herbal ingredients retain the menu blend; flavours stay attached to their own product", () => {
  for (const product of products.filter(p => p.category.id === "herbal-tea")) {
    assert.ok(nutritionDetails(product, "ru").ingredients.includes(product.item.description.ru));
    assert.match(nutritionDetails(product, "ru").baseNote, /Без добавленного сахара/);
  }
  const product = products.find(p => p.id === "cold-coffee:milkshake");
  assert.match(nutritionDetails(product, "ru", "strawberry").ingredients, /Выбранный вкус: Клубника/);
  assert.doesNotMatch(nutritionDetails(product, "ru", "unavailable").ingredients, /Выбранный вкус/);
});
