import { addOrderGroup } from "./order-draft.js";

// Editorial starting points using ordinary menu products, never new sale SKUs.
export const familyRecipes = [
  { id: "milk-cookie", name: { tr: "Süt ve cookie", en: "Milk & cookie", ru: "Молоко и печенье" },
    productIds: ["brew-hot:milk", "desserts:cookie"] },
  { id: "simit-break", name: { tr: "Simit molası", en: "Simit break", ru: "Перекус с симитом" },
    productIds: ["brew-hot:milk", "food:sesame-simit", "desserts:cookie"] },
  { id: "milk-roll", name: { tr: "Süt ve rulo pasta", en: "Milk & cake roll", ru: "Молоко и рулет" },
    productIds: ["brew-hot:milk", "desserts:cake-roll"] }
];

export function quoteFamilySelection(recipeId, selectedIds, productIndex) {
  const recipe = familyRecipes.find(entry => entry.id === recipeId);
  if (!recipe || !Array.isArray(selectedIds) || !selectedIds.length ||
      new Set(selectedIds).size !== selectedIds.length ||
      selectedIds.some(id => !recipe.productIds.includes(id))) {
    return { valid: false, products: [], total: 0 };
  }
  const products = selectedIds.map(id => productIndex.get(id));
  if (products.some(product => !product || !Number.isFinite(product.item?.price) || product.item.price <= 0)) {
    return { valid: false, products: [], total: 0 };
  }
  return { valid: true, products, total: products.reduce((sum, product) => sum + product.item.price, 0) };
}

export function stageFamilySelection(draft, recipeId, selectedIds, productIndex, validIds) {
  const quote = quoteFamilySelection(recipeId, selectedIds, productIndex);
  if (!quote.valid) return { applied: false, draft, quote };
  let staged = draft;
  // Separate ordinary lines allow independent removal and quantity changes.
  // Nothing is persisted until every component fits the latest shared draft.
  for (const product of quote.products) {
    const result = addOrderGroup(staged, [{ id: product.id, quantity: 1 }], 1, validIds);
    if (!result.applied) return { applied: false, draft, quote };
    staged = result.draft;
  }
  return { applied: true, draft: staged, quote };
}
