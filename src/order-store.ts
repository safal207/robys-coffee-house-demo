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
export function createOrderStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  onSubscriberError: (error: unknown) => void = error => console.error('[Robys order] View update failed', error)
) {
  let snapshot: OrderSnapshot = { version: 2, revision: 0, lines: [], migrationDone: false };
  let persistent = storage !== null;
  // Preserve bytes which this instance could not read; keep edits in memory.
  let safeToWrite = storage !== null;
  let notice = '';
  let pendingLegacy: OrderLine[] | null = null;
  let undo: { line: OrderLine; index: number } | null = null;
  const listeners = new Set<() => void>();
  const read = (key: string): unknown => {
    try { const text = storage?.getItem(key); return text ? JSON.parse(text) : null; }
    catch { notice = 'storage'; persistent = false; safeToWrite = false; return null; }
  };
  const emit = () => {
    // Committed data must not be reported as a failed add by a broken view.
    for (const listener of [...listeners]) {
      try { listener(); }
      catch (error) { try { onSubscriberError(error); } catch { /* Diagnostics cannot undo a committed order. */ } }
    }
  };
  const save = () => {
    if (!safeToWrite || !storage) { persistent = false; notice = 'storage'; return; }
    try {
      storage.setItem(ORDER_KEY, JSON.stringify(snapshot)); persistent = true;
      if (notice === 'storage') notice = '';
    } catch { persistent = false; notice = 'storage'; }
  };
  const existing = read(ORDER_KEY) as Partial<OrderSnapshot> | null;
  if (existing) {
    try {
      if (existing.version !== 2 || !Number.isSafeInteger(existing.revision) || Number(existing.revision) < 0) throw new Error('Invalid order schema');
      snapshot = { version: 2, revision: Number(existing.revision), lines: validLines(existing.lines), migrationDone: existing.migrationDone === true };
    } catch { notice = 'invalid-order'; snapshot.migrationDone = true; }
  } else if (safeToWrite) {
    const legacy = read(LEGACY_MENU_KEY) as { version?: number; lines?: unknown } | null;
    if (legacy?.version === 1) {
      try { snapshot.lines = validLines(legacy.lines); } catch { notice = 'invalid-legacy'; }
    }
  }
  // A legacy conflict needs consent and must not be silently reimported.
  if (safeToWrite && !snapshot.migrationDone) {
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
  const replace = (lines: OrderLine[], migrationDone = snapshot.migrationDone) => {
    const next = validLines(lines);
    const revision = snapshot.revision + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('Order revision limit');
    const remaining = new Set(next.map(line => line.id));
    const removed = snapshot.lines.filter(line => !remaining.has(line.id));
    if (removed.length === 1) {
      undo = { line: { ...removed[0] }, index: snapshot.lines.findIndex(line => line.id === removed[0].id) };
    } else if (removed.length > 1) undo = null;
    snapshot = { ...snapshot, revision, lines: next, migrationDone };
    if (migrationDone) pendingLegacy = null;
    save(); emit();
  };
  const store = {
    get: (): OrderSnapshot => ({ ...snapshot, lines: snapshot.lines.map(line => ({ ...line })) }),
    status: () => ({ persistent, notice, pendingLegacy: pendingLegacy?.map(line => ({ ...line })) ?? null, canUndo: undo !== null }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    replace,
    setQuantity(id: string, quantity: number) {
      if (!resolveOrderProduct(id) || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) throw new Error('Invalid quantity');
      const index = snapshot.lines.findIndex(line => line.id === id);
      const next = snapshot.lines.map(line => ({ ...line }));
      if (quantity === 0) {
        if (index < 0) return;
        next.splice(index, 1);
      } else if (index >= 0) {
        if (next[index].quantity === quantity) return;
        next[index] = { id, quantity };
      } else next.push({ id, quantity });
      replace(next);
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
      try {
        const previous = snapshot.lines.find(line => line.id === removed.line.id);
        if (previous) store.add(removed.line.id, removed.line.quantity);
        else {
          const next = snapshot.lines.map(line => ({ ...line }));
          next.splice(Math.min(removed.index, next.length), 0, { ...removed.line });
          replace(next);
        }
      } catch (error) { undo = removed; throw error; }
    },
    resolveMigration(choice: 'keep' | 'import') {
      if (choice !== 'keep' && choice !== 'import') throw new Error('Unknown migration decision');
      if (!pendingLegacy) return;
      let next = snapshot.lines;
      if (choice === 'import') {
        const merged = new Map(next.map(line => [line.id, line.quantity]));
        for (const line of pendingLegacy) merged.set(line.id, (merged.get(line.id) ?? 0) + line.quantity);
        next = validLines([...merged].map(([id, quantity]) => ({ id, quantity })));
      }
      replace(next, true);
    },
    summary() {
      const quantity = snapshot.lines.reduce((sum, line) => sum + line.quantity, 0);
      const totalMinor = snapshot.lines.reduce((sum, line) => sum + Math.round(resolveOrderProduct(line.id)!.item.price * 100) * line.quantity, 0);
      return { quantity, totalMinor };
    },
    reload() {
      const stored = read(ORDER_KEY) as OrderSnapshot | null;
      if (!safeToWrite) { emit(); return; }
      if (stored?.version !== 2 && stored !== null) return;
      if (stored && Number.isSafeInteger(stored.revision) && stored.revision >= snapshot.revision) {
        try {
          const next: OrderSnapshot = { version: 2, revision: stored.revision, lines: validLines(stored.lines), migrationDone: stored.migrationDone === true };
          if (JSON.stringify(next) !== JSON.stringify(snapshot)) undo = null;
          snapshot = next;
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
