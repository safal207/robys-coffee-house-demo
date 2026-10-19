import type { SmartChoiceLanguage } from "./catalog.js";
import { normalizeOrderDraft, updateOrderGroupQuantity, addOrderGroup, removeOrderGroup, type OrderDraft, type OrderGroupResult } from "../order-draft.js";
import { orderProducts, orderProductIds } from "./shared-order.js";
import { kidsComboForItems } from "../kids-menu.js";

export type QuickProduct = (typeof orderProducts extends Map<string, infer T> ? T : never);
export interface QuickOrderItem { id: string; variant?: string; quantity: number }
export interface QuickOrderGroup { id: string; items: QuickOrderItem[]; quantity: number }
export interface QuickVariant { id: string; name: Record<SmartChoiceLanguage, string> }
export interface QuickDrinkChoice { product: QuickProduct; variant?: QuickVariant }

export const quickProducts = [...orderProducts.values()];
export const drinkCategories = new Set(["hot-coffee", "brew-hot", "herbal-tea", "cold-coffee", "refreshers"]);
export const sweetProducts = quickProducts.filter(product =>
  product.categoryId === "desserts" && product.id !== "desserts:savoury-cookie" || product.id === "food:nutella-croissant");

export function variantsFor(product: QuickProduct): readonly QuickVariant[] {
  return (product.item as typeof product.item & { variants?: readonly QuickVariant[] }).variants ?? [];
}

// These are alternative menu products, not a generic syrup surcharge. Keep
// their canonical IDs, photos and prices intact through the cart and QR.
const drinkFamilies = [
  ["hot-coffee:cappuccino", "hot-coffee:caramel-cappuccino"],
  ["hot-coffee:caffe-latte", "hot-coffee:chocolate-cookie-latte", "hot-coffee:cinnamon-latte",
    "hot-coffee:caramel-latte", "hot-coffee:vanilla-latte", "hot-coffee:hazelnut-latte"],
  ["cold-coffee:iced-caffe-latte", "cold-coffee:flavoured-iced-caffe-latte"]
];

export function drinkChoicesFor(product: QuickProduct): QuickDrinkChoice[] {
  const family = drinkFamilies.find(ids => ids.includes(product.id));
  return (family ?? []).flatMap<QuickDrinkChoice>(id => {
    const option = orderProducts.get(id);
    if (!option) return [];
    const variants = variantsFor(option);
    return variants.length ? variants.map(variant => ({ product: option, variant })) : [{ product: option }];
  });
}

const canonicalDrinkFlavours: Record<string, string> = {
  "hot-coffee:caramel-cappuccino": "caramel", "hot-coffee:chocolate-cookie-latte": "chocolate-cookie",
  "hot-coffee:cinnamon-latte": "cinnamon", "hot-coffee:caramel-latte": "caramel",
  "hot-coffee:vanilla-latte": "vanilla", "hot-coffee:hazelnut-latte": "hazelnut"
};
export function drinkChoiceLabel(choice: QuickDrinkChoice, language: SmartChoiceLanguage): string {
  const flavour = choice.variant ?? variantsFor(orderProducts.get("cold-coffee:flavoured-iced-caffe-latte")!)
    .find(variant => variant.id === canonicalDrinkFlavours[choice.product.id]);
  return flavour?.name[language] ?? { tr: "Sade", en: "Classic", ru: "Классический" }[language];
}

export function needsOrderVariant(groups: readonly QuickOrderGroup[]): boolean {
  return groups.some(group => group.items.some(item => {
    const product = orderProducts.get(item.id);
    if (!product) return false;
    const variants = variantsFor(product);
    return variants.length > 0 && !variants.some(variant => variant.id === item.variant);
  }));
}

// A click expresses a step, not the absolute quantity from an older render.
export function stepQuickGroupQuantity(raw: unknown, groupId: string, delta: number): OrderGroupResult {
  const draft = normalizeOrderDraft(raw, orderProductIds);
  const group = draft.groups.find(entry => entry.id === groupId);
  if (!group || (delta !== -1 && delta !== 1) || group.quantity + delta < 1) {
    return { draft, applied: false, blocked: true };
  }
  return updateOrderGroupQuantity(draft, groupId, group.quantity + delta, orderProductIds);
}

// Replace against the latest basket in one write. A stale editor must not
// overwrite a quantity/flavour change from another tab or resurrect a removal.
export function replaceQuickGroup(raw: unknown, original: QuickOrderGroup, items: QuickOrderItem[], quantity: number): OrderGroupResult {
  const draft = normalizeOrderDraft(raw, orderProductIds);
  const current = draft.groups.find(group => group.id === original.id);
  if (!current || current.quantity !== original.quantity || JSON.stringify(current.items) !== JSON.stringify(original.items)) {
    return { draft, applied: false, blocked: true };
  }
  const result = addOrderGroup(removeOrderGroup(draft, original.id, orderProductIds), items, quantity, orderProductIds);
  if (!result.applied) return { draft, applied: false, blocked: true };
  if (current.source !== "recommendation" || !draft.recommendation) return result;
  // A cart edit remains owned by the advisor. Record explicit removals so a
  // later same-selection option change cannot silently put a dessert back.
  const remaining = new Map<string, number>();
  for (const item of items) remaining.set(item.id, (remaining.get(item.id) ?? 0) + item.quantity * quantity);
  const removed = new Map((draft.recommendation.removedLines ?? []).map(line => [line.id, line.quantity]));
  for (const line of draft.recommendation.selectedLines ?? draft.recommendation.lines) {
    const before = current.items.filter(item => item.id === line.id).reduce((sum, item) => sum + item.quantity * current.quantity, 0);
    if (before === (remaining.get(line.id) ?? 0)) continue;
    const difference = line.quantity - (remaining.get(line.id) ?? 0);
    if (difference > 0) removed.set(line.id, difference);
    else removed.delete(line.id);
  }
  const replacement = normalizeOrderDraft({ ...draft,
    groups: draft.groups.map(group => group.id === original.id ? { ...group, items, quantity } : group),
    recommendation: { ...draft.recommendation,
      removedLines: [...removed].map(([id, quantity]) => ({ id, quantity })).sort((a, b) => a.id.localeCompare(b.id, "en")) }
  }, orderProductIds);
  return { draft: replacement, applied: true, blocked: false };
}

// Preserve the pair, its quantity, and recommendation ownership while editing a flavour.
export function updateQuickGroupVariant(raw: OrderDraft, groupId: string, itemIndex: number, variantId: string): OrderDraft {
  const draft = normalizeOrderDraft(raw, orderProductIds);
  const group = draft.groups.find(entry => entry.id === groupId);
  const item = group?.items[itemIndex];
  const product = item && orderProducts.get(item.id);
  if (!product || !variantsFor(product).some(variant => variant.id === variantId)) return draft;
  const changedItems: QuickOrderItem[] = [];
  for (const [index, value] of group!.items.entries()) {
    const changed = index === itemIndex ? { ...value, variant: variantId } : value;
    const existing = changedItems.find(entry => entry.id === changed.id && entry.variant === changed.variant);
    if (existing) existing.quantity += changed.quantity;
    else changedItems.push({ ...changed });
  }
  return normalizeOrderDraft({ ...draft, groups: draft.groups.map(entry => entry.id === groupId
    ? { ...entry, items: changedItems }
    : entry) }, orderProductIds);
}

function searchText(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i").replace(/ё/g, "е");
}

export function matchesQuickProduct(product: QuickProduct, query: string, categoryId = "all"): boolean {
  if (categoryId !== "all" && product.categoryId !== categoryId) return false;
  const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
  const haystack = searchText([
    ...Object.values(product.name), ...Object.values(product.categoryName),
    ...Object.values(product.item.description ?? {}),
    ...variantsFor(product).flatMap(variant => Object.values(variant.name))
  ].join(" "));
  return terms.every(term => haystack.includes(term));
}

export function orderItemName(item: QuickOrderItem, language: SmartChoiceLanguage): string {
  const product = orderProducts.get(item.id);
  if (!product) return "";
  const variant = variantsFor(product).find(entry => entry.id === item.variant);
  return `${product.name[language]}${variant ? ` · ${variant.name[language]}` : ""}`;
}

export function orderGroupTotal(group: QuickOrderGroup): number {
  return group.items.reduce((sum, item) => sum + (orderProducts.get(item.id)?.unitPriceMinor ?? 0) * item.quantity, 0) * group.quantity;
}

export function orderGroupName(group: QuickOrderGroup, language: SmartChoiceLanguage): string {
  const components = orderGroupItems(group).map(item => `${item.quantity > 1 ? `${item.quantity} × ` : ""}${orderItemName(item, language)}`).join(" + ");
  const combo = kidsComboForItems(group.items);
  return combo ? `${combo.name[language]}: ${components}` : components;
}

export function orderGroupItems(group: QuickOrderGroup): QuickOrderItem[] {
  return [...group.items].sort((left, right) =>
    Number(drinkCategories.has(orderProducts.get(right.id)?.categoryId ?? "")) -
    Number(drinkCategories.has(orderProducts.get(left.id)?.categoryId ?? "")));
}
