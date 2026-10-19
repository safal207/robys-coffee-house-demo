import type { OrderGroupItem } from "./order-draft.js";
type Language = "tr" | "en" | "ru";
type Localized = Record<Language, string>;
export interface KidsCombo { id: string; name: Localized; lead: Localized; items: { id: string; quantity: number }[] }
export interface KidsMenuProduct { id: string; name: Localized; image: string; unitPriceMinor: number }
export const kidsCombos: KidsCombo[];
export const kidsMenuCopy: Record<Language, {title: string; eyebrow: string; lead: string; portions: string; allergy: string; add: string; individual: string; choose: string; items: string; failed: string}>;
export function kidsComboForItems(items: OrderGroupItem[]): KidsCombo | undefined;
export function createKidsMenuSection(options: {
  language: Language; products: ReadonlyMap<string, KidsMenuProduct>; query?: string; actionLabel?: string; idPrefix?: string; quantity?: number;
  onAdd: (combo: KidsCombo, trigger: HTMLButtonElement) => boolean | void | Promise<boolean | void>;
  onProduct?: (id: string, trigger: HTMLButtonElement) => void;
  photo?: (product: KidsMenuProduct, key: string) => HTMLElement;
}): HTMLElement | null;
