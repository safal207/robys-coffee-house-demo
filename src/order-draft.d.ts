export interface OrderLine { id: string; quantity: number }
export interface OrderGroupItem { id: string; variant?: string; quantity?: number }
export interface OrderGroup { id: string; source: "menu" | "recommendation"; items: (OrderGroupItem & { quantity: number })[]; quantity: number }
export interface OrderSelection { token: string; signature: string; lines: OrderLine[]; selectedLines?: OrderLine[]; removedLines?: OrderLine[]; removed?: boolean }
export interface OrderDraft { version: 1; groups: OrderGroup[]; lines: OrderLine[]; recommendation?: OrderSelection }
export interface OrderGroupResult { draft: OrderDraft; applied: boolean; blocked: boolean; stale?: boolean }
export const ORDER_DRAFT_KEY: string;
export const ORDER_DRAFT_PROJECTION_KEY: string;
export const TAB_ORDER_DRAFT_KEY: string;
export const MAX_ORDER_QUANTITY: number;
export function normalizeOrderDraft(raw: unknown, validIds: ReadonlySet<string>): OrderDraft;
export function addOrderGroup(raw: unknown, items: OrderGroupItem[], quantity: number, validIds: ReadonlySet<string>): OrderGroupResult;
export function updateOrderGroupQuantity(raw: unknown, id: string, quantity: number, validIds: ReadonlySet<string>): OrderGroupResult;
export function removeOrderGroup(raw: unknown, id: string, validIds: ReadonlySet<string>): OrderDraft;
export function replaceOrderGroup(raw: unknown, original: Pick<OrderGroup, "id" | "items" | "quantity">, items: OrderGroupItem[], quantity: number, validIds: ReadonlySet<string>): OrderGroupResult;
export function updateOrderGroupVariant(raw: unknown, id: string, itemIndex: number, variant: string, validIds: ReadonlySet<string>): OrderGroupResult;
export function readStoredOrderDraft(validIds: ReadonlySet<string>): OrderDraft;
export function writeStoredOrderDraft(raw: unknown, validIds: ReadonlySet<string>): OrderDraft;
export class OrderStorageError extends Error {}
export class OrderLegacyConflictError extends OrderStorageError {}
export interface OrderStorageState { mode: "shared" | "tab"; hasSessionPersistence: boolean; staleSessionPossible?: boolean; legacyConflict?: { token: string; currentDraft: OrderDraft; legacyDraft?: OrderDraft; invalid: boolean } }
export function getOrderStorageState(): OrderStorageState;
export function resolveLegacyOrderDraft(choice: "keep-current" | "use-legacy", validIds: ReadonlySet<string>, expectedToken: string): Promise<OrderDraft>;
export function transactStoredOrderDraft<T extends { draft: unknown; applied: boolean }>(updater: (draft: OrderDraft) => T, validIds: ReadonlySet<string>, options?: { origin?: unknown }): Promise<Omit<T, "draft"> & { draft: OrderDraft; revision: number; committedRevision?: number }>;
export function readLatestStoredOrderDraft(validIds: ReadonlySet<string>): Promise<OrderDraft>;
export function updateOrderLines(raw: unknown, lines: OrderLine[], validIds: ReadonlySet<string>): OrderDraft;
export function applyOrderRecommendation(raw: unknown, selection: OrderSelection, validIds: ReadonlySet<string>): { draft: OrderDraft; applied: boolean; blocked: boolean };
