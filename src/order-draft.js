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
  const current = readPersistentDraft();
  const pending = readPendingDraft();
  // Keep failed writes across reloads, but only while the canonical value is
  // still the one we tried to replace. A newer write from another tab wins.
  if (pending && (!current.available || current.value === pending.previous)) {
    try {
      memoryDraft = normalizeOrderDraft(JSON.parse(pending.value), validIds);
      persistDraft(JSON.stringify(memoryDraft), pending.previous);
      return memoryDraft;
    } catch {}
  }
  if (pending) clearPendingDraft();
  if (current.available && (current.value !== null || pending)) {
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
  persistDraft(JSON.stringify(draft), current.value);
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
