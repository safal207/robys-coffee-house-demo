import { encodeOrderTicket } from "./order-ticket.js";

// The static site stays usable without an order server. A same-origin counter
// server explicitly enables its guest screen; configuration never grants an
// external site access to the customer's order or browser credentials.
export function counterCheckoutUrl(config, ticket, language, siteRoot) {
  if (config?.enabled !== true || typeof config.checkoutUrl !== "string") return null;
  try {
    const base = new URL(siteRoot);
    const target = new URL(config.checkoutUrl, base);
    const expected = new URL("counter/guest.html", base);
    if (target.origin !== base.origin || target.pathname !== expected.pathname ||
        target.search || target.hash || target.username || target.password) return null;
    if (target.protocol !== "https:" && !(target.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))) return null;
    target.hash = new URLSearchParams({ ticket: encodeOrderTicket(ticket, language) }).toString();
    return target.href;
  } catch { return null; }
}

export async function readCounterConfiguration(siteRoot, { fetcher = globalThis.fetch, timeout = 1200 } = {}) {
  if (typeof fetcher !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(new URL("counter-config.json", siteRoot), {
      cache: "no-store", credentials: "same-origin", signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}
