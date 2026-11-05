# Menu nutrition guide

The menu has 61 individual products and two pairings. Each product dialog now has an editorial
calorie range, an explicitly identified **example portion**, typical ingredients,
a nutritional-contribution explanation and vitamin information in TR/EN/RU.
Open a product photo in the list or the ingredients control in the photo feed.
These are illustrative recipe models, not verified Roby's recipes, measured
servings, laboratory results, supplier labels or allergy declarations.

## Data and assumptions

- `src/menu-nutrition-portions.js`: complete ID-to-range index and example weights
  or volumes. Pair ranges are the sum of the two component ranges.
- `src/menu-nutrition.js`: typical ingredient models, translations, explanations
  and the product-dialog renderer. Existing herbal blend descriptions are retained.
- Black coffee and strained tea estimates exclude added sugar, milk and extras.
- Milk examples assume ordinary cow's milk; fat content and actual milk quantity
  vary. An iced drink's volume includes ice. Flavoured drinks cover a range of
  typical syrup/base quantities, not a specific café dispenser or brand.
- Dessert and bakery examples refer to the weight in the index, not an assumed
  café slice. A macaron example is 20 g; it is not a 100 g serving.
- Refresher bases, Summer Pine ingredients and supplier formulations are unknown.
  Their calorie ranges are illustrative sweet-drink scenarios. Fruit names do
  not establish juice/purée content, vitamin C, fibre or the absence of sugar.
- The typical dessert models include common flour, egg and dairy ingredients;
  they are not an exhaustive allergen or supplier ingredient list.
- No numerical vitamin amounts, daily-value percentages, vitamin D fortification,
  detox effects or medical benefits are inferred. Syrup flavour does not imply
  actual nuts/fruit or their vitamins. Milk B2/B12, almond E and beef B12 statements
  describe the named ingredient, with finished-serving amounts explicitly unknown.

## Reference basis

Consulted 5 November 2026. These sources support general ingredient properties
and the importance of portion/recipe variation. **They do not verify our calorie
ranges or Roby's food.** Calorie ranges are broad editorial estimates, not a
calculation presented as USDA data.

- [USDA FoodData Central documentation](https://fdc.nal.usda.gov/data-documentation/)
- [USDA portion conversion and food variability](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)
- [NIH ODS: riboflavin/B2 food sources](https://ods.od.nih.gov/factsheets/Riboflavin-HealthProfessional/)
- [NIH ODS: B12 food sources](https://ods.od.nih.gov/factsheets/VitaminB12-Consumer/)
- [NIH ODS: vitamin E food sources](https://ods.od.nih.gov/pdf/factsheets/vitamine-Consumer.pdf)
- [NIH ODS: vitamin C food sources](https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/)

Replace the estimates with verified recipe ingredient weights, supplier labels
and café serving sizes when provided. Recalculate per actual serving, retaining
the supplier/recipe source and review date. Never relabel an example as verified.

## Delivery and regression coverage

Nutrition data and copy load with the existing product dialog, keeping the
initial list/feed scripts compact. Both views use the same source and product IDs;
ordering prices and product identity are unchanged. Selecting a dessert recomputes
calories, ingredients and vitamins for both components while retaining disclosure
state. Quantity changes retain the explicitly labelled one-pair example portions. Details expand in the dialog's
scrolling body while existing order controls retain their layout.

`scripts/test-menu-nutrition.mjs` covers all catalog IDs and all languages, valid
range/portion units, pair arithmetic, variant association, herbal blend retention
and unsupported syrup vitamin claims. It runs through `verify:menu-content` in
the existing `npm run check` pipeline.
