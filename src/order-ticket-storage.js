// Storage is optional. A failed migration must not discard an existing ticket,
// and a failed persistent write must not make the next read restore older data.
export function createTicketStorage({
  persistent = () => globalThis.localStorage,
  temporary = () => globalThis.sessionStorage
} = {}) {
  const memory = new Map();
  const pendingWrites = new Map();
  const pendingKey = key => `${key}.pending`;
  const clearPending = key => {
    pendingWrites.delete(key);
    try { temporary().removeItem(pendingKey(key)); } catch {}
  };
  const readPersistent = key => {
    try { return { available: true, value: persistent().getItem(key) }; }
    catch { return { available: false, value: null }; }
  };
  const readPending = key => {
    if (pendingWrites.has(key)) return pendingWrites.get(key);
    try {
      const text = temporary().getItem(pendingKey(key));
      if (!text || text.length > 64000) return null;
      const record = JSON.parse(text);
      if (typeof record?.value !== "string" || record.value.length > 30000
        || !(record.previous === null || typeof record.previous === "string" && record.previous.length <= 30000)) return null;
      return record;
    } catch { return null; }
  };
  const mirror = (key, value) => {
    try { temporary().setItem(key, value); } catch { /* Memory still preserves this page's ticket. */ }
  };
  const persist = (key, value, previous) => {
    try { persistent().setItem(key, value); clearPending(key); }
    catch {
      const record = { previous, value };
      pendingWrites.set(key, record);
      // A reload may read an older, still-readable localStorage entry after a
      // quota error. This marker identifies our pending write without replacing
      // a different ticket subsequently saved by another tab.
      try { temporary().setItem(pendingKey(key), JSON.stringify(record)); } catch {}
    }
  };
  return {
    getItem(key) {
      const current = readPersistent(key);
      const pending = readPending(key);
      if (pending && (!current.available || current.value === pending.previous)) {
        memory.set(key, pending.value);
        persist(key, pending.value, pending.previous);
        return pending.value;
      }
      if (pending) clearPending(key);
      if (current.available && current.value !== null) {
        memory.set(key, current.value);
        mirror(key, current.value);
        return current.value;
      }
      if (memory.has(key)) return memory.get(key);
      let previous = null;
      try { previous = temporary().getItem(key); } catch { /* Use memory on subsequent writes. */ }
      if (previous !== null) {
        memory.set(key, previous);
        persist(key, previous, current.value);
      }
      return previous;
    },
    setItem(key, value) {
      memory.set(key, value);
      mirror(key, value);
      persist(key, value, readPersistent(key).value);
    }
  };
}
