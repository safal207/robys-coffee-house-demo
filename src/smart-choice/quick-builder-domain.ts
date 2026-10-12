import type { SmartChoiceLanguage } from "./catalog.js";
import { normalizeOrderDraft, updateOrderGroupQuantity, type OrderDraft, type OrderGroupResult } from "../order-draft.js";
import { orderProducts, orderProductIds } from "./shared-order.js";

export type QuickProduct = (typeof orderProducts extends Map<string, infer T> ? T : never);
export interface QuickOrderItem { id: string; variant?: string; quantity: number }
export interface QuickOrderGroup { id: string; items: QuickOrderItem[]; quantity: number }
export interface QuickVariant { id: string; name: Record<SmartChoiceLanguage, string> }

export const quickProducts = [...orderProducts.values()];
export const drinkCategories = new Set(["hot-coffee", "brew-hot", "herbal-tea", "cold-coffee", "refreshers"]);
export const sweetProducts = quickProducts.filter(product =>
  product.categoryId === "desserts" && product.id !== "desserts:savoury-cookie" || product.id === "food:nutella-croissant");

export function variantsFor(product: QuickProduct): readonly QuickVariant[] {
  return (product.item as typeof product.item & { variants?: readonly QuickVariant[] }).variants ?? [];
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
  return orderGroupItems(group).map(item => `${item.quantity > 1 ? `${item.quantity} × ` : ""}${orderItemName(item, language)}`).join(" + ");
}

export function orderGroupItems(group: QuickOrderGroup): QuickOrderItem[] {
  return [...group.items].sort((left, right) =>
    Number(drinkCategories.has(orderProducts.get(right.id)?.categoryId ?? "")) -
    Number(drinkCategories.has(orderProducts.get(left.id)?.categoryId ?? "")));
}
