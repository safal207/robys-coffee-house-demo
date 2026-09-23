export interface OrderLine { id: string; quantity: number }
export interface OrderSelection { token: string; signature: string; lines: OrderLine[] }
export interface OrderDraft { version: 1; lines: OrderLine[]; recommendation?: OrderSelection }
export const ORDER_DRAFT_KEY: string;
export const MAX_ORDER_QUANTITY: number;
export function normalizeOrderDraft(raw: unknown, validIds: ReadonlySet<string>): OrderDraft;
export function updateOrderLines(raw: unknown, lines: OrderLine[], validIds: ReadonlySet<string>): OrderDraft;
export function applyOrderRecommendation(raw: unknown, selection: OrderSelection, validIds: ReadonlySet<string>): { draft: OrderDraft; applied: boolean; blocked: boolean };
