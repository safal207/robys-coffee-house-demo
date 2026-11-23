// A personal cart suggestion is always an existing SKU, never an invented bundle or discount.
import { PAIRS } from "./taste-memory-policy.js";

export function chooseTasteCartExtra({ selectedIds, likedIds, catalog }) {
  for (const [drink, dessert] of PAIRS) {
    if (!selectedIds.has(drink) || selectedIds.has(dessert) || !likedIds.has(dessert)) continue;
    const product = catalog.get(dessert);
    if (product && !product.item.variants?.length) return { sourceId: drink, product, reason: "remembered" };
  }
  for (const [drink, dessert] of PAIRS) {
    if (!selectedIds.has(drink) || selectedIds.has(dessert) || !likedIds.has(drink)) continue;
    const product = catalog.get(dessert);
    if (product && !product.item.variants?.length) return { sourceId: drink, product, reason: "pair" };
  }
  return null;
}
