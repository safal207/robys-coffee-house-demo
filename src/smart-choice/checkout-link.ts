import type { OrderDraft } from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";

export async function openQuickCheckout(draft: OrderDraft, language: SmartChoiceLanguage, returnFocus: HTMLElement): Promise<void> {
  const moduleUrl = new URL("../order-checkout.js?v=6aa30239d031", window.location.href).href;
  const checkout = await import(moduleUrl) as {
    openOrderCheckout(options: { draft: OrderDraft; language: SmartChoiceLanguage; returnFocus: HTMLElement }): Promise<unknown>
  };
  await checkout.openOrderCheckout({ draft, language, returnFocus });
}
