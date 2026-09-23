import { menuCategories } from "../../menu-catalog.js";
import { applyOrderRecommendation, normalizeOrderDraft, type OrderDraft } from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";
import type { CartCalculation, CartState } from "./cart-domain.js";

const slug = (name: string): string => name.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const products = menuCategories.flatMap(category =>
  (category.items ?? category.groups?.flatMap(group => group.items) ?? []).map(item => {
    const id = `${category.id}:${item.id ?? slug(item.name.en)}`;
    return { id, sourceId: item.id ?? `${category.id}--${slug(item.name.en)}`, name: item.name, unitPriceMinor: item.price * 100 };
  })
);
export const orderProducts = new Map(products.map(item => [item.id, item]));
export const orderProductIds = new Set(orderProducts.keys());
// Smart Choice IDs are the canonical menu source IDs, including explicit IDs.
const sourceToMenu = new Map(products.map(item => [item.sourceId, item.id]));

export function syncRecommendation(raw: unknown, cart: CartState, calculation: CartCalculation, token: string) {
  const draft = normalizeOrderDraft(raw, orderProductIds);
  const lines = calculation.lines.map(line => ({ id: sourceToMenu.get(line.itemId) ?? "", quantity: line.quantity }));
  // Do not silently replace a special offer price with the sum of its components.
  const menuTotal = lines.reduce((sum, line) => sum + (orderProducts.get(line.id)?.unitPriceMinor ?? 0) * line.quantity, 0);
  if (!calculation.canHandoff || lines.some(line => !orderProductIds.has(line.id)) || menuTotal !== calculation.totalMinor) {
    return { draft, applied: false, blocked: true };
  }
  const signature = JSON.stringify({
    catalogVersion: cart.catalogVersion, candidateId: cart.candidateId,
    lines, totalMinor: calculation.totalMinor
  });
  return applyOrderRecommendation(draft, { token, signature, lines }, orderProductIds);
}

export function buildSharedOrderPayload(draft: OrderDraft) {
  const lines = normalizeOrderDraft(draft, orderProductIds).lines.map(line => {
    const product = orderProducts.get(line.id)!;
    return { ...line, unitPriceMinor: product.unitPriceMinor, lineTotalMinor: product.unitPriceMinor * line.quantity };
  });
  return {
    schemaVersion: "robys.order-draft.v1",
    currency: "TRY",
    lines,
    pricing: { totalMinor: lines.reduce((sum, line) => sum + line.lineTotalMinor, 0) },
    handoff: { channel: "whatsapp-share", status: "draft", submitted: false, paid: false, acceptedByCafe: false }
  };
}

export function buildSharedWhatsAppMessage(payload: ReturnType<typeof buildSharedOrderPayload>, language: SmartChoiceLanguage): string {
  const heading = { tr: "Roby's sipariş taslağı", en: "Roby's order draft", ru: "Черновик заказа Roby's" };
  const confirmation = {
    tr: "Bu bir ödeme veya onaylanmış sipariş değildir. Lütfen müsaitlik ve toplamı onaylayın.",
    en: "This is not a payment or a confirmed order. Please confirm availability and the final total.",
    ru: "Это не оплата и не подтверждённый заказ. Пожалуйста, подтвердите наличие и итоговую сумму."
  };
  const price = new Intl.NumberFormat({ tr: "tr-TR", en: "en-US", ru: "ru-RU" }[language], {
    style: "currency", currency: "TRY", minimumFractionDigits: 0,
    maximumFractionDigits: payload.pricing.totalMinor % 100 === 0 ? 0 : 2
  }).format(payload.pricing.totalMinor / 100);
  return [heading[language], "", ...payload.lines.map(line =>
    `• ${line.quantity} × ${orderProducts.get(line.id)!.name[language]}`), "",
  `${{ tr: "Toplam", en: "Total", ru: "Итого" }[language]}: ${price}`, "", confirmation[language]].join("\n");
}
