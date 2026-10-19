const ORDER_ID = /^[A-Za-z0-9_-]{32}$/;
const ACTIVE = new Set(["preparing", "ready"]);

export function parseOrderInput(value, baseUrl) {
  if (typeof value !== "string" || value.length > 2048) return null;
  const text = value.trim();
  if (ORDER_ID.test(text)) return text;
  try {
    const base = new URL(baseUrl);
    const url = new URL(text, base);
    const expectedPath = new URL("staff.html", base).pathname;
    if (url.origin !== base.origin || url.pathname !== expectedPath || url.search || url.username || url.password) return null;
    const params = new URLSearchParams(url.hash.slice(1));
    const entries = [...params.entries()];
    return entries.length === 1 && entries[0][0] === "order" && ORDER_ID.test(entries[0][1]) ? entries[0][1] : null;
  } catch {
    return null;
  }
}

export function visibleForRole(order, role) {
  return Boolean(order && (role === "cashier"
    ? ["awaiting_payment", "preparing", "ready", "issued"].includes(order.status)
    : role === "barista" && ACTIVE.has(order.status)));
}

export function newestOrder(known, incoming) {
  if (!known || known.id !== incoming.id) return incoming;
  return known.version > incoming.version ? known : incoming;
}

export function queueSections(orders, role) {
  const visible = (Array.isArray(orders) ? orders : []).filter(order => visibleForRole(order, role))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return {
    unpaid: visible.filter(order => order.status === "awaiting_payment"),
    active: visible.filter(order => ACTIVE.has(order.status)),
    issued: visible.filter(order => order.status === "issued")
  };
}

export function nextOrderAction(order, role) {
  if (!visibleForRole(order, role)) return null;
  if (order.status === "awaiting_payment") return "pay";
  if (order.status === "preparing") return "ready";
  if (order.status === "ready") return "issued";
  return null;
}

export function paymentStillCurrent(order, intent) {
  return Boolean(order && intent && order.id === intent.id && order.version === intent.version
    && order.totalMinor === intent.totalMinor && order.status === "awaiting_payment");
}

export function formatMoney(minor, language) {
  return new Intl.NumberFormat({ ru: "ru-RU", en: "en-GB", tr: "tr-TR" }[language] ?? "tr-TR", {
    style: "currency", currency: "TRY", minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2
  }).format(minor / 100);
}
