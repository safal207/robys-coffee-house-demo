// Groups preserve selections; lines remain a compatibility projection. Never persist prices.
export const ORDER_DRAFT_KEY = "robys-menu-order.v1";
export const MAX_ORDER_QUANTITY = 99;

const positive = value => Number.isInteger(value) && value > 0 && value <= MAX_ORDER_QUANTITY;

function validLines(lines, validIds) {
  const result = new Map();
  if (!Array.isArray(lines)) return result;
  for (const line of lines) {
    if (validIds.has(line?.id) && Number.isInteger(line.quantity) &&
        line.quantity > 0 && line.quantity <= MAX_ORDER_QUANTITY) {
      result.set(line.id, line.quantity);
    }
  }
  return result;
}

function validItems(items, validIds) {
  if (!Array.isArray(items) || !items.length) return [];
  const result = [];
  const seen = new Set();
  for (const item of items) {
    const quantity = item?.quantity ?? 1;
    if (!validIds.has(item?.id) || !positive(quantity)) return [];
    const variant = typeof item.variant === "string" && item.variant.trim().length > 0
      && item.variant.length <= 120 ? item.variant : undefined;
    if (item.variant !== undefined && !variant) return [];
    const key = JSON.stringify([item.id, variant ?? ""]);
    if (seen.has(key)) return [];
    seen.add(key);
    result.push({ id: item.id, ...(variant ? { variant } : {}), quantity });
  }
  return result;
}

function groupId(items, source = "menu") {
  const identities = [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
  return source === "recommendation" ? "recommendation" : `menu:${JSON.stringify(identities)}`;
}

function project(groups) {
  const lines = new Map();
  for (const group of groups) for (const item of group.items) {
    lines.set(item.id, (lines.get(item.id) ?? 0) + item.quantity * group.quantity);
  }
  return serialize(lines);
}

function withinLimit(groups) {
  return project(groups).every(line => positive(line.quantity));
}

function selectionMetadata(raw, validIds) {
  if (typeof raw?.token !== "string" || raw.token.length > 200 ||
      typeof raw.signature !== "string" || raw.signature.length > 4000) return undefined;
  return { token: raw.token, signature: raw.signature,
    lines: serialize(validLines(raw.lines, validIds)),
    selectedLines: serialize(validLines(raw.selectedLines ?? raw.lines, validIds)),
    removedLines: serialize(validLines(raw.removedLines, validIds)),
    ...(raw.removed === true ? { removed: true } : {}) };
}

function finish(groups, recommendation) {
  const draft = { version: 1, groups, lines: project(groups) };
  if (recommendation) draft.recommendation = { ...recommendation,
    lines: project(groups.filter(group => group.source === "recommendation")) };
  return draft;
}

function serialize(lines) {
  return Array.from(lines, ([id, quantity]) => ({ id, quantity }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function normalizeOrderDraft(raw, validIds) {
  const input = raw?.version === 1 ? raw : {};
  const recommendation = selectionMetadata(input.recommendation, validIds);
  const groups = [];
  if (Array.isArray(input.groups)) {
    for (const entry of input.groups) {
      const items = validItems(entry?.items, validIds);
      if (!items.length || !positive(entry.quantity)) continue;
      const source = entry.source === "recommendation" && recommendation ? "recommendation" : "menu";
      const id = groupId(items, source);
      const existing = groups.find(group => group.id === id);
      const candidate = { id, source, items: existing?.items ?? items, quantity: entry.quantity + (existing?.quantity ?? 0) };
      const next = [...groups.filter(group => group.id !== id), candidate];
      if (!positive(candidate.quantity) || !withinLimit(next)) continue;
      if (existing) groups.splice(groups.indexOf(existing), 1, candidate);
      else groups.push(candidate);
    }
  } else {
    const lines = validLines(input.lines, validIds);
    const owned = new Map();
    for (const line of recommendation?.lines ?? []) {
      const quantity = Math.min(line.quantity, lines.get(line.id) ?? 0);
      if (quantity) owned.set(line.id, quantity);
    }
    for (const [id, quantity] of lines) {
      const manual = quantity - (owned.get(id) ?? 0);
      if (manual) {
        const items = [{ id, quantity: 1 }];
        groups.push({ id: groupId(items), source: "menu", items, quantity: manual });
      }
    }
    if (owned.size) groups.push({ id: "recommendation", source: "recommendation", items: serialize(owned), quantity: 1 });
  }
  return finish(groups, recommendation);
}

export function addOrderGroup(raw, items, quantity, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  const selected = validItems(items, validIds);
  if (!selected.length || !positive(quantity)) return { draft, applied: false, blocked: true };
  const id = groupId(selected);
  const existing = draft.groups.find(group => group.id === id);
  const group = { id, source: "menu", items: existing?.items ?? selected, quantity: quantity + (existing?.quantity ?? 0) };
  const groups = existing ? draft.groups.map(entry => entry.id === id ? group : entry) : [...draft.groups, group];
  if (!positive(group.quantity) || !withinLimit(groups)) return { draft, applied: false, blocked: true };
  return { draft: finish(groups, draft.recommendation), applied: true, blocked: false };
}

function recordRemoval(recommendation, before, after) {
  if (!recommendation) return recommendation;
  const remaining = new Map(project(after.filter(group => group.source === "recommendation")).map(line => [line.id, line.quantity]));
  const removed = new Map(recommendation.removedLines.map(line => [line.id, line.quantity]));
  for (const line of recommendation.selectedLines) {
    const difference = line.quantity - (remaining.get(line.id) ?? 0);
    if (difference > 0) removed.set(line.id, Math.max(removed.get(line.id) ?? 0, difference));
  }
  return { ...recommendation, removedLines: serialize(removed),
    ...(!remaining.size && before.some(group => group.source === "recommendation") ? { removed: true } : {}) };
}

export function updateOrderGroupQuantity(raw, id, quantity, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ORDER_QUANTITY || !draft.groups.some(group => group.id === id)) {
    return { draft, applied: false, blocked: true };
  }
  const groups = draft.groups.flatMap(group => group.id !== id ? [group] : quantity ? [{ ...group, quantity }] : []);
  if (!withinLimit(groups)) return { draft, applied: false, blocked: true };
  return { draft: finish(groups, recordRemoval(draft.recommendation, draft.groups, groups)), applied: true, blocked: false };
}

export function removeOrderGroup(raw, id, validIds) {
  return updateOrderGroupQuantity(raw, id, 0, validIds).draft;
}

// Replace one selection against a freshly read basket in one write. Keep the
// original basket on invalid/capped edits, and never overwrite a stale editor.
export function replaceOrderGroup(raw, original, items, quantity, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  const current = draft.groups.find(group => group.id === original?.id);
  if (!current || current.quantity !== original.quantity || JSON.stringify(current.items) !== JSON.stringify(original.items)) {
    return { draft, applied: false, blocked: true, stale: true };
  }
  const selected = validItems(items, validIds);
  const result = addOrderGroup(removeOrderGroup(draft, original.id, validIds), selected, quantity, validIds);
  if (!result.applied) return { draft, applied: false, blocked: true };
  if (current.source !== "recommendation" || !draft.recommendation) return result;
  // An advisor-owned edit records explicit removals so changing an advisor
  // option later cannot silently restore a dessert removed in this editor.
  const remaining = new Map();
  for (const item of selected) remaining.set(item.id, (remaining.get(item.id) ?? 0) + item.quantity * quantity);
  const removed = new Map((draft.recommendation.removedLines ?? []).map(line => [line.id, line.quantity]));
  for (const line of draft.recommendation.selectedLines ?? draft.recommendation.lines) {
    const before = current.items.filter(item => item.id === line.id).reduce((sum, item) => sum + item.quantity * current.quantity, 0);
    if (before === (remaining.get(line.id) ?? 0)) continue;
    const difference = line.quantity - (remaining.get(line.id) ?? 0);
    if (difference > 0) removed.set(line.id, difference);
    else removed.delete(line.id);
  }
  return { draft: normalizeOrderDraft({ ...draft,
    groups: draft.groups.map(group => group.id === original.id ? { ...group, items: selected, quantity } : group),
    recommendation: { ...draft.recommendation,
      removedLines: [...removed].map(([id, quantity]) => ({ id, quantity })).sort((a, b) => a.id.localeCompare(b.id, "en")) }
  }, validIds), applied: true, blocked: false };
}

export function updateOrderGroupVariant(raw, id, itemIndex, variant, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  const group = draft.groups.find(entry => entry.id === id);
  if (!Number.isInteger(itemIndex) || !group?.items[itemIndex] || typeof variant !== "string" || !variant.trim() || variant.length > 120) {
    return { draft, applied: false, blocked: true };
  }
  // Editing two flavours into the same flavour combines their component counts;
  // it must never make normalization discard the entire valid selection.
  const items = [];
  group.items.forEach((item, index) => {
    const next = index === itemIndex ? { ...item, variant } : item;
    const existing = items.find(entry => entry.id === next.id && entry.variant === next.variant);
    if (existing) existing.quantity += next.quantity;
    else items.push({ ...next });
  });
  const groups = draft.groups.map(entry => entry.id === id ? { ...entry, items } : entry);
  return { draft: normalizeOrderDraft({ ...draft, groups }, validIds), applied: true, blocked: false };
}

// Compatibility for older clients editing flat quantities: keep manual selections first.
export function updateOrderLines(raw, lines, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  const desired = validLines(lines, validIds);
  const groups = [];
  for (const group of [...draft.groups].sort((a, b) => (a.source === "recommendation") - (b.source === "recommendation"))) {
    const requirements = new Map();
    for (const item of group.items) requirements.set(item.id, (requirements.get(item.id) ?? 0) + item.quantity * group.quantity);
    const unchanged = [...requirements].every(([id, quantity]) => (desired.get(id) ?? 0) >= quantity);
    const items = group.items.flatMap(item => {
      const quantity = Math.min(item.quantity * group.quantity, desired.get(item.id) ?? 0);
      desired.set(item.id, (desired.get(item.id) ?? 0) - quantity);
      return quantity ? [{ ...item, quantity }] : [];
    });
    if (!items.length) continue;
    groups.push(unchanged ? group : { id: groupId(items, group.source), source: group.source, items, quantity: 1 });
  }
  for (const [id, quantity] of desired) if (quantity) {
    const items = [{ id, quantity: 1 }];
    groups.push({ id: groupId(items), source: "menu", items, quantity });
  }
  return normalizeOrderDraft(finish(groups, recordRemoval(draft.recommendation, draft.groups, groups)), validIds);
}

// Changing an option in the same selection respects explicit removals. A new
// selection token is an intentional reselection and may add its full contents.
export function applyOrderRecommendation(raw, selection, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  if (draft.recommendation?.token === selection.token &&
      draft.recommendation.signature === selection.signature) return { draft, applied: false, blocked: false };
  const addition = validLines(selection.lines, validIds);
  if (!addition.size || addition.size !== selection.lines.length) return { draft, applied: false, blocked: true };
  const previous = draft.recommendation?.token === selection.token ? draft.recommendation : undefined;
  const previousGroup = previous ? draft.groups.find(group => group.source === "recommendation") : undefined;
  const removed = new Map((previous?.removedLines ?? []).map(line => [line.id, line.quantity]));
  const effective = serialize(addition).map(line => ({ ...line,
    quantity: previous?.removed ? 0 : Math.max(0, line.quantity - (removed.get(line.id) ?? 0)) })).filter(line => line.quantity > 0);
  // An option change edits the existing selection, including its quantity and
  // flavors. A new token starts a new selection with the default quantity.
  const items = effective.map(line => {
    const retained = previousGroup?.items.filter(item => item.id === line.id) ?? [];
    return retained.length === 1 && retained[0].variant ? { ...line, variant: retained[0].variant } : line;
  });
  const groups = draft.groups.filter(group => group.source !== "recommendation");
  if (items.length) groups.push({ id: "recommendation", source: "recommendation", items, quantity: previousGroup?.quantity ?? 1 });
  if (!withinLimit(groups)) return { draft, applied: false, blocked: true };
  const recommendation = { token: selection.token, signature: selection.signature, lines: effective,
    selectedLines: serialize(addition), removedLines: serialize(removed), ...(previous?.removed ? { removed: true } : {}) };
  return { draft: finish(groups, recommendation), applied: true, blocked: false };
}

let memoryDraft;
let canonicalDraft;
let canonicalRevision = -1;
let pendingLocalWrite;
const pendingKey = `${ORDER_DRAFT_KEY}.pending`;

function readPersistentDraft() {
  try { return { available: true, value: localStorage.getItem(ORDER_DRAFT_KEY) }; }
  catch { return { available: false, value: null }; }
}

function readPendingDraft() {
  if (pendingLocalWrite) return pendingLocalWrite;
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
    if (typeof pending?.value === "string" && (pending.previous === null || typeof pending.previous === "string")) {
      pendingLocalWrite = pending;
      return pending;
    }
  } catch {}
  return undefined;
}

function clearPendingDraft() {
  pendingLocalWrite = undefined;
  try { sessionStorage.removeItem(pendingKey); } catch {}
}

function mirrorDraft(value) {
  try { sessionStorage.setItem(ORDER_DRAFT_KEY, value); } catch {}
}

function persistDraft(value, previous) {
  try {
    localStorage.setItem(ORDER_DRAFT_KEY, value);
    clearPendingDraft();
  } catch {
    pendingLocalWrite = { previous, value };
    try { sessionStorage.setItem(pendingKey, JSON.stringify(pendingLocalWrite)); } catch {}
  }
}

export function readStoredOrderDraft(validIds) {
  if (canonicalDraft) return normalizeOrderDraft(canonicalDraft, validIds);
  const current = readPersistentDraft();
  const pending = readPendingDraft();
  // Keep failed writes across reloads, but only while the canonical value is
  // still the one we tried to replace. A newer write from another tab wins.
  if (pending && (!current.available || current.value === pending.previous)) {
    try {
      memoryDraft = normalizeOrderDraft(JSON.parse(pending.value), validIds);
      return memoryDraft;
    } catch {}
  }
  if (pending) clearPendingDraft();
  if (current.available) {
    try {
      memoryDraft = normalizeOrderDraft(JSON.parse(current.value ?? "null"), validIds);
      mirrorDraft(JSON.stringify(memoryDraft));
      return memoryDraft;
    } catch { /* Continue with a usable fallback if the saved value is malformed. */ }
  }
  // A failed session write must not replace a newer in-memory edit either.
  let raw;
  if (!memoryDraft) try { raw = JSON.parse(sessionStorage.getItem(ORDER_DRAFT_KEY) ?? "null"); } catch {}
  const draft = normalizeOrderDraft(raw ?? memoryDraft, validIds);
  memoryDraft = draft;
  return draft;
}

export function writeStoredOrderDraft(raw, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  memoryDraft = draft;
  const value = JSON.stringify(draft);
  mirrorDraft(value);
  persistDraft(value, readPersistentDraft().value);
  return draft;
}

const transactionDatabase = "robys-order-transactions.v1";
const transactionStore = "shared-order";
let databasePromise;
let currentDatabase;
let databaseEpoch = 0;
let orderChannel;

export class OrderStorageError extends Error {
  constructor(message = "The shared order could not be saved", options) {
    super(message, options);
    this.name = "OrderStorageError";
  }
}

function observeOrderCommits() {
  if (orderChannel || typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return;
  try {
    // Bundled menu/advisor/builder modules share one channel per document.
    // A commit must not echo through another bundle as a remote mutation.
    const key = Symbol.for("robys.shared-order.channel");
    if (window[key]) { orderChannel = window[key]; return; }
    orderChannel = new window.BroadcastChannel("robys-shared-order.v1");
    window[key] = orderChannel;
    orderChannel.onmessage = event => {
      if (!Number.isSafeInteger(event.data?.revision) || event.data.revision < 0) return;
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("robys:order-change", {
        detail: { remote: true, revision: event.data.revision }
      }));
    };
  } catch { /* Focus/pageshow and the optional storage projection also refresh. */ }
}

function orderDatabase() {
  observeOrderCommits();
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    if (typeof indexedDB === "undefined") {
      fail(new OrderStorageError("Shared order storage is unavailable"));
      return;
    }
    let request;
    try { request = indexedDB.open(transactionDatabase, 1); }
    catch (cause) { fail(new OrderStorageError(undefined, { cause })); return; }
    request.onupgradeneeded = () => request.result.createObjectStore(transactionStore);
    request.onerror = () => fail(new OrderStorageError(undefined, { cause: request.error }));
    request.onblocked = () => fail(new OrderStorageError("Shared order storage is busy; please retry"));
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      settled = true;
      currentDatabase = database;
      const invalidate = () => {
        if (currentDatabase !== database) return;
        currentDatabase = undefined; databasePromise = undefined; databaseEpoch += 1;
        canonicalDraft = undefined; canonicalRevision = -1; memoryDraft = undefined;
      };
      database.onversionchange = () => {
        database.close(); invalidate();
      };
      database.onclose = invalidate;
      resolve(database);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

function rememberCanonical(record, validIds) {
  // A slower read must not roll back a newer completed mutation in this module.
  if (record.revision >= canonicalRevision) {
    canonicalRevision = record.revision;
    canonicalDraft = normalizeOrderDraft(record.draft, validIds);
    memoryDraft = canonicalDraft;
    mirrorDraft(JSON.stringify(canonicalDraft));
  }
  return normalizeOrderDraft(canonicalDraft, validIds);
}

function initialCanonicalDraft(validIds) {
  const current = readPersistentDraft();
  const pending = readPendingDraft();
  const value = pending && (!current.available || current.value === pending.previous)
    ? pending.value : current.value;
  if (!current.available && !value) return normalizeOrderDraft(memoryDraft, validIds);
  try { return normalizeOrderDraft(JSON.parse(value ?? "null"), validIds); }
  catch (cause) { throw new OrderStorageError("The saved order is damaged; it was not overwritten", { cause }); }
}

function canonicalRecord(raw, validIds) {
  if (!raw || raw.version !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0
      || raw.draft?.version !== 1) throw new OrderStorageError("The saved order is damaged; it was not overwritten");
  return { version: 1, revision: raw.revision, draft: normalizeOrderDraft(raw.draft, validIds) };
}

function projectCanonical(record) {
  // localStorage is a compatibility/notification projection, never a second
  // authority. A projection failure after IDB commit cannot make Add fail and
  // encourage a duplicate retry. Each notified reader reads IDB afresh.
  try {
    const value = JSON.stringify(record.draft);
    if (localStorage.getItem(ORDER_DRAFT_KEY) !== value) localStorage.setItem(ORDER_DRAFT_KEY, value);
  } catch {}
}

// The updater is synchronous and receives the latest authoritative IDB value.
// Data read, validation, mutation and put share ONE atomic readwrite transaction;
// localStorage caches in different renderer processes cannot affect this input.
export async function transactStoredOrderDraft(updater, validIds, options = {}) {
  const database = await orderDatabase();
  const epoch = databaseEpoch;
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let record;
    let failure;
    let initialized = false;
    try { transaction = database.transaction(transactionStore, "readwrite"); }
    catch (cause) { databasePromise = undefined; reject(new OrderStorageError(undefined, { cause })); return; }
    transaction.onabort = () => reject(failure ?? new OrderStorageError(undefined, { cause: transaction.error }));
    transaction.onerror = () => { /* onabort supplies the one failure result */ };
    transaction.oncomplete = () => {
      if (epoch !== databaseEpoch) { reject(new OrderStorageError("Shared order storage changed; please retry")); return; }
      rememberCanonical(record, validIds);
      if (initialized || result.applied) {
        clearPendingDraft();
        projectCanonical(record);
      }
      if (result.applied) {
        try { orderChannel?.postMessage({ revision: record.revision }); } catch {}
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("robys:order-change", {
          detail: { origin: options.origin, revision: record.revision }
        }));
      }
      resolve({ ...result, revision: record.revision });
    };
    const store = transaction.objectStore(transactionStore);
    const request = store.get(ORDER_DRAFT_KEY);
    request.onsuccess = () => {
      try {
        initialized = request.result === undefined;
        record = initialized ? { version: 1, revision: 0, draft: initialCanonicalDraft(validIds) }
          : canonicalRecord(request.result, validIds);
        const current = record.draft;
        result = updater(current);
        if (!result || typeof result.then === "function" || typeof result.applied !== "boolean") {
          throw new TypeError("Order transaction updater must return a synchronous mutation result");
        }
        result = { ...result, draft: result.applied ? normalizeOrderDraft(result.draft, validIds) : current };
        if (result.applied) {
          if (record.revision >= Number.MAX_SAFE_INTEGER) throw new OrderStorageError("Order revision limit reached");
          record = { version: 1, revision: record.revision + 1, draft: result.draft };
        }
        if (initialized || result.applied) store.put(record, ORDER_DRAFT_KEY);
      } catch (cause) {
        failure = cause instanceof OrderStorageError ? cause : new OrderStorageError(undefined, { cause });
        transaction.abort();
      }
    };
  });
}

// Call on bootstrap, storage/broadcast notifications, pageshow and focus before
// displaying a fresh shared order or creating a QR. The synchronous reader is a
// projection/cache for rendering only and must never supply mutation input.
export async function readLatestStoredOrderDraft(validIds) {
  const result = await transactStoredOrderDraft(draft => ({ draft, applied: false, blocked: false }), validIds);
  return rememberCanonical({ revision: result.revision, draft: result.draft }, validIds);
}
