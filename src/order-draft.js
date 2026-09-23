// Shared session draft. Only catalog IDs and quantities are persisted; never prices.
export const ORDER_DRAFT_KEY = "robys-menu-order.v1";
export const MAX_ORDER_QUANTITY = 99;

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

function serialize(lines) {
  return Array.from(lines, ([id, quantity]) => ({ id, quantity }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function normalizeOrderDraft(raw, validIds) {
  const lines = validLines(raw?.version === 1 ? raw.lines : [], validIds);
  const result = { version: 1, lines: serialize(lines) };
  const selected = raw?.version === 1 ? raw.recommendation : null;
  if (typeof selected?.token === "string" && selected.token.length <= 200 &&
      typeof selected.signature === "string" && selected.signature.length <= 4000) {
    const owned = validLines(selected.lines, validIds);
    for (const [id, quantity] of owned) {
      const remaining = Math.min(quantity, lines.get(id) ?? 0);
      if (remaining) owned.set(id, remaining);
      else owned.delete(id);
    }
    result.recommendation = { token: selected.token, signature: selected.signature, lines: serialize(owned) };
  }
  return result;
}

export function updateOrderLines(raw, lines, validIds) {
  return normalizeOrderDraft({ ...normalizeOrderDraft(raw, validIds), lines }, validIds);
}

// Replacing a recommendation removes only its remaining contribution. Menu edits
// clamp that contribution, so deleted items cannot return on reload or Back.
export function applyOrderRecommendation(raw, selection, validIds) {
  const draft = normalizeOrderDraft(raw, validIds);
  if (draft.recommendation?.token === selection.token &&
      draft.recommendation.signature === selection.signature) return { draft, applied: false, blocked: false };
  const addition = validLines(selection.lines, validIds);
  if (!addition.size || addition.size !== selection.lines.length) return { draft, applied: false, blocked: true };
  const lines = new Map(draft.lines.map(line => [line.id, line.quantity]));
  for (const line of draft.recommendation?.lines ?? []) {
    const remaining = (lines.get(line.id) ?? 0) - line.quantity;
    if (remaining > 0) lines.set(line.id, remaining);
    else lines.delete(line.id);
  }
  for (const [id, quantity] of addition) {
    const next = (lines.get(id) ?? 0) + quantity;
    // Never partially add a recommendation or silently change the quoted total.
    if (next > MAX_ORDER_QUANTITY) return { draft, applied: false, blocked: true };
    lines.set(id, next);
  }
  return {
    draft: { version: 1, lines: serialize(lines), recommendation: { ...selection, lines: serialize(addition) } },
    applied: true,
    blocked: false
  };
}
