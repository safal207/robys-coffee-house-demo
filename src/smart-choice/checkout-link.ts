import type { OrderDraft } from "../order-draft.js";
import type { SmartChoiceLanguage } from "./catalog.js";

interface CheckoutModule {
  openOrderCheckout(options: { draft: OrderDraft; language: SmartChoiceLanguage; returnFocus: HTMLElement; shouldOpen: () => boolean }): Promise<unknown>
}
let checkoutModule: Promise<CheckoutModule> | undefined;
let checkoutModuleRetry = 0;

function loadQuickCheckout(): Promise<CheckoutModule> {
  if (!checkoutModule) {
    const moduleUrl = new URL("../order-checkout.js?v=9c561c168e25", window.location.href);
    if (checkoutModuleRetry) moduleUrl.searchParams.set("retry", String(checkoutModuleRetry));
    // Failed imports are cached by URL. A later explicit checkout can recover
    // with one new URL, while concurrent actions share the in-flight request.
    checkoutModule = (import(moduleUrl.href) as Promise<CheckoutModule>).catch(error => {
      checkoutModule = undefined;
      checkoutModuleRetry += 1;
      throw error;
    });
  }
  return checkoutModule;
}

export async function openQuickCheckout(draft: OrderDraft, language: SmartChoiceLanguage, returnFocus: HTMLElement,
  shouldOpen: () => boolean = () => true): Promise<void> {
  const checkout = await loadQuickCheckout();
  if (!shouldOpen()) return;
  await checkout.openOrderCheckout({ draft, language, returnFocus, shouldOpen });
}
