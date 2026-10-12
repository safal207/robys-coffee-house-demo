export type CheckoutLanguage = "tr" | "en" | "ru";
export interface OrderTicket {
  version: 1;
  id: string;
  createdAt: number;
  groups: Array<{ quantity: number; items: Array<{ id: string; variant?: string; quantity: number }> }>;
}
export function openOrderCheckout(options: { draft: unknown; language?: CheckoutLanguage; returnFocus?: Element | null }): Promise<{ ticket: OrderTicket | null; dialog: HTMLDialogElement; error?: unknown }>;
export function createOrderQr(url: string, language?: CheckoutLanguage): SVGSVGElement;
export function checkoutErrorMessage(error: unknown, language?: CheckoutLanguage): string;
export const checkoutCopy: Record<CheckoutLanguage, Record<string, string>>;
export function renderTicketContent(root: HTMLElement, ticket: OrderTicket, language?: CheckoutLanguage, options?: { cashier?: boolean; cashierUrl?: string }): unknown;
