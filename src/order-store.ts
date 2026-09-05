import { menuCategories } from '../menu-catalog.js';
import { SMART_CHOICE_CATALOG, type PartySize } from './smart-choice/catalog.js';
import { deriveCartRules, reconcileCart, calculateCart, type CartState } from './smart-choice/cart-domain.js';

export const ORDER_KEY = 'robys:coffee-house:order.v2';
export const LEGACY_MENU_KEY = 'robys-menu-order.v1';
export const LEGACY_CHOICE_KEY = 'robys-smart-choice-cart.v1';
export const MAX_QUANTITY = 99;
export type Language = 'tr' | 'en' | 'ru';
export interface OrderLine { id: string; quantity: number }
export interface OrderSnapshot { version: 2; revision: number; lines: OrderLine[]; migrationDone: boolean }
const slug = (text: string): string => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const menuProducts = new Map(menuCategories.flatMap(category =>
  [...(category.items ?? []), ...(category.groups ?? []).flatMap(group => group.items)].map(item => {
    const id = `${category.id}:${item.id ?? slug(item.name.en)}`;
    return [id, { id, category, item, image: item.image ?? `src/products/menu-v1/${category.id}--${slug(item.name.en)}.webp` }] as const;
  })
));
const sourceToSku = new Map([...menuProducts].map(([id, product]) => [product.item.id ?? `${product.category.id}--${slug(product.item.name.en)}`, id]));
const candidates = new Map(SMART_CHOICE_CATALOG.combos.map(combo => [combo.id, combo]));
const rules = deriveCartRules();
const options = [...rules.substitutions, ...rules.upgrades, ...rules.bumps];
const candidateSku = (candidateId: string): string | undefined => sourceToSku.get(candidates.get(candidateId)?.sourceOfferId ?? '');

/** Canonical identity includes approved options, never a translated name or client price. */
export function configuredId(sku: string, optionIds: readonly string[] = []): string {
  if (new Set(optionIds).size !== optionIds.length) throw new Error('Duplicate order option');
  return optionIds.length ? `${sku}|${[...optionIds].sort().join(',')}` : sku;
}
export function resolveOrderProduct(id: string) {
  if (typeof id !== 'string' || id.length > 500) return undefined;
  const [sku, encoded = '', extra] = id.split('|');
  if (extra !== undefined) return undefined;
  const base = menuProducts.get(sku);
  if (!base) return undefined;
  if (!encoded) return id === sku ? base : undefined;
  const ids = encoded.split(',');
  if (new Set(ids).size !== ids.length || configuredId(sku, ids) !== id) return undefined;
  const selected = ids.map(option => options.find(rule => rule.id === option && candidateSku(rule.comboId) === sku));
  if (selected.some(option => !option)) return undefined;
  const priceMinor = Math.round(base.item.price * 100) + selected.reduce((sum, rule) => sum + rule!.priceDeltaMinor, 0);
  if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) return undefined;
  const name = { ...base.item.name };
  for (const language of ['tr', 'en', 'ru'] as const) {
    name[language] += ` · ${selected.map(rule => rule!.label[language]).join(' · ')}`;
  }
  return { ...base, id, item: { ...base.item, name, price: priceMinor / 100 } };
}

/** Use the same checked configuration/price model as the existing Smart Choice editor. */
export function lineFromChoice(cart: CartState, partySize: PartySize): OrderLine {
  const combo = candidates.get(cart.candidateId);
  if (!combo || combo.sourceStatus !== 'confirmed' || combo.availability !== 'available') throw new Error('Unavailable choice');
  const checked = reconcileCart(cart, partySize).state;
  const calculation = calculateCart(checked, partySize);
  if (!calculation.canHandoff) throw new Error('Choice configuration is incomplete');
  const sku = candidateSku(combo.id);
  if (!sku) throw new Error('Choice has no exact menu identity');
  const optionIds = [...checked.substitutionIds, ...checked.upgradeIds];
  if (checked.bumpId && checked.bumpDecision === 'accepted') optionIds.push(checked.bumpId);
  const id = configuredId(sku, optionIds);
  const product = resolveOrderProduct(id);
  if (!product || Math.round(product.item.price * 100) !== calculation.totalMinor) throw new Error('Choice/menu price mismatch');
  return { id, quantity: 1 };
}
function validLines(value: unknown): OrderLine[] {
  if (!Array.isArray(value) || value.length > 250) throw new Error('Invalid order lines');
  const seen = new Set<string>();
  return value.map(line => {
    if (!line || !resolveOrderProduct(line.id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY || seen.has(line.id)) throw new Error('Invalid order line');
    seen.add(line.id);
    return { id: line.id as string, quantity: line.quantity as number };
  });
}
export function createOrderStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
  let snapshot: OrderSnapshot = { version: 2, revision: 0, lines: [], migrationDone: false };
  let persistent = storage !== null;
  let notice = '';
  let pendingLegacy: OrderLine[] | null = null;
  let undo: OrderLine | null = null;
  const listeners = new Set<() => void>();
  const read = (key: string): unknown => {
    try { const text = storage?.getItem(key); return text ? JSON.parse(text) : null; }
    catch { notice = 'storage'; return null; }
  };
  const emit = () => listeners.forEach(listener => listener());
  const save = () => {
    try { if (!storage) throw new Error('No session storage'); storage.setItem(ORDER_KEY, JSON.stringify(snapshot)); }
    catch { persistent = false; notice = 'storage'; }
  };
  const existing = read(ORDER_KEY) as Partial<OrderSnapshot> | null;
  if (existing) {
    try {
      if (existing.version !== 2 || !Number.isSafeInteger(existing.revision) || Number(existing.revision) < 0) throw new Error('Invalid order schema');
      snapshot = { version: 2, revision: Number(existing.revision), lines: validLines(existing.lines), migrationDone: existing.migrationDone === true };
    } catch { notice = 'invalid-order'; snapshot.migrationDone = true; }
  } else {
    const legacy = read(LEGACY_MENU_KEY) as { version?: number; lines?: unknown } | null;
    if (legacy?.version === 1) {
      try { snapshot.lines = validLines(legacy.lines); } catch { notice = 'invalid-legacy'; }
    }
  }
  // A conflict is explicitly offered. Never add both old carts on every page load.
  if (!snapshot.migrationDone) {
    const oldChoice = read(LEGACY_CHOICE_KEY) as CartState | null;
    const oldFlow = read('robys-smart-choice-session.v1') as { answers?: { partySize?: PartySize } } | null;
    if (oldChoice) {
      try {
        const party = oldFlow?.answers?.partySize ?? 'one';
        if (!['one', 'two', 'family'].includes(party)) throw new Error('Unknown party');
        pendingLegacy = [lineFromChoice(oldChoice, party)];
      } catch { notice = 'invalid-legacy'; snapshot.migrationDone = true; }
    } else snapshot.migrationDone = true;
  }
  save();
  const replace = (lines: OrderLine[]) => {
    const next = validLines(lines);
    const remaining = new Set(next.map(line => line.id));
    const removed = snapshot.lines.filter(line => !remaining.has(line.id));
    if (removed.length === 1) undo = { ...removed[0] };
    snapshot = { ...snapshot, revision: snapshot.revision + 1, lines: next };
    save(); emit();
  };
  const store = {
    get: (): OrderSnapshot => ({ ...snapshot, lines: snapshot.lines.map(line => ({ ...line })) }),
    status: () => ({ persistent, notice, pendingLegacy: pendingLegacy?.map(line => ({ ...line })) ?? null, canUndo: undo !== null }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    replace,
    setQuantity(id: string, quantity: number) {
      if (!resolveOrderProduct(id) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) throw new Error('Invalid quantity');
      const old = snapshot.lines.find(line => line.id === id);
      if (quantity === 0 && old) undo = { ...old };
      replace([...snapshot.lines.filter(line => line.id !== id), ...(quantity ? [{ id, quantity }] : [])]);
    },
    add(id: string, quantity = 1) {
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Invalid addition');
      const previous = snapshot.lines.find(line => line.id === id)?.quantity ?? 0;
      if (previous + quantity > MAX_QUANTITY) throw new Error('Quantity limit');
      store.setQuantity(id, previous + quantity);
    },
    undoRemoval() {
      if (!undo) return;
      const removed = undo; undo = null;
      try { store.add(removed.id, removed.quantity); } catch (error) { undo = removed; throw error; }
    },
    resolveMigration(choice: 'keep' | 'import') {
      if (!pendingLegacy) return;
      let next = snapshot.lines;
      if (choice === 'import') {
        const merged = new Map(next.map(line => [line.id, line.quantity]));
        for (const line of pendingLegacy) merged.set(line.id, (merged.get(line.id) ?? 0) + line.quantity);
        next = validLines([...merged].map(([id, quantity]) => ({ id, quantity })));
      }
      pendingLegacy = null; snapshot.migrationDone = true; replace(next);
    },
    summary() {
      const quantity = snapshot.lines.reduce((sum, line) => sum + line.quantity, 0);
      const totalMinor = snapshot.lines.reduce((sum, line) => sum + Math.round(resolveOrderProduct(line.id)!.item.price * 100) * line.quantity, 0);
      return { quantity, totalMinor };
    },
    reload() {
      // Refresh after bfcache restore, not by reimporting historical carts.
      const stored = read(ORDER_KEY) as OrderSnapshot | null;
      if (stored?.version !== 2 && stored !== null) return;
      if (stored && Number.isSafeInteger(stored.revision) && stored.revision >= snapshot.revision) {
        try {
          snapshot = { version: 2, revision: stored.revision, lines: validLines(stored.lines), migrationDone: stored.migrationDone === true };
          if (snapshot.migrationDone) pendingLegacy = null;
          emit();
        } catch { notice = 'invalid-order'; emit(); }
      }
    }
  };
  return store;
}
let storage: Storage | null = null;
try { if (typeof window !== 'undefined') storage = window.sessionStorage; } catch { /* In-memory fallback. */ }
export const order = createOrderStore(storage);
if (typeof window !== 'undefined') window.addEventListener('pageshow', event => { if (event.persisted) order.reload(); });

// Reuse the existing engine/configuration code rather than shipping it in every consumer.
export { SMART_CHOICE_CATALOG } from './smart-choice/catalog.js';
export type { PartySize, SmartChoiceIntent, SmartChoiceLanguage } from './smart-choice/catalog.js';
export { recommendSmartChoice } from './smart-choice/engine.js';
export type { RankedRecommendation, RecommendationInput, RecommendationResult, RequestedTaste, RequestedTemperature } from './smart-choice/engine.js';
export { buildStableOrderPayload, buildWhatsAppDraftMessage, calculateCart, createInitialCart, deriveCartRules, reconcileCart, stableSerializeOrderPayload } from './smart-choice/cart-domain.js';
export type { CartState } from './smart-choice/cart-domain.js';
