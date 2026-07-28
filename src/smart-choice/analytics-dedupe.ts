export interface EventDedupeRegistration {
  accepted: boolean;
  keys: readonly string[];
}

export function registerEventDedupeKey(
  currentKeys: readonly string[],
  key: string,
  limit = 200
): EventDedupeRegistration {
  if (!key.trim()) throw new Error("Analytics dedupe key must not be empty.");
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("Analytics dedupe limit must be a positive integer.");
  if (currentKeys.includes(key)) return { accepted: false, keys: [...currentKeys] };
  return {
    accepted: true,
    keys: [...currentKeys, key].slice(-limit)
  };
}
