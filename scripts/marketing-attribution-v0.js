// Privacy-gated campaign attribution contract. No network requests, cookies or global hooks.
export const ATTRIBUTION_SCHEMA_VERSION = "robys.attribution.v0";
export const CAMPAIGN_SESSION_KEY = "robys-campaign-consented.v0";
export const CAMPAIGN_TTL_MS = 30 * 60 * 1000;

const keys = ["source", "medium", "campaign", "content", "term"];
const codePattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const productPattern = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,95}$/;
const clientEvents = new Set([
  "landing_view", "menu_item_view", "menu_item_liked", "menu_item_shared",
  "cart_item_added", "checkout_qr_opened", "route_clicked"
]);

function clean(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return codePattern.test(normalized) ? normalized : null;
}

function canonicalCampaign(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const campaign = {};
  for (const key of keys) {
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    const normalized = clean(input[key]);
    if (!normalized) return null;
    campaign[key] = normalized;
  }
  return campaign.source ? campaign : null;
}

// An invalid or untrusted field invalidates the campaign rather than silently relabelling it.
export function parseUtm(url) {
  let candidate;
  try { candidate = new URL(url); } catch { return null; }
  if (!["http:", "https:"].includes(candidate.protocol)) return null;
  const campaign = {};
  for (const key of keys) {
    const all = candidate.searchParams.getAll("utm_" + key);
    if (all.length > 1) return null;
    if (!all.length) continue;
    const normalized = clean(all[0]);
    if (!normalized) return null;
    campaign[key] = normalized;
  }
  return campaign.source ? campaign : null;
}

export function makeUtmLink(baseUrl, fields) {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") throw new Error("Campaign links must use HTTPS.");
  const campaign = canonicalCampaign(fields);
  if (!campaign) throw new Error("Invalid campaign. utm_source is required.");
  for (const key of keys) {
    url.searchParams.delete("utm_" + key);
    if (campaign[key]) url.searchParams.set("utm_" + key, campaign[key]);
  }
  return url.toString();
}

// Before consent: only the current URL is read, never persistent storage.
// After explicit analytics consent: reuse one attribution within this tab for 30 minutes.
export function resolveUtm({ url, consent = false, storage = null, now = Date.now() }) {
  const direct = parseUtm(url);
  if (!consent || !storage) return direct;
  if (direct) {
    try {
      storage.setItem(CAMPAIGN_SESSION_KEY, JSON.stringify({
        schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
        campaign: direct, expiresAt: now + CAMPAIGN_TTL_MS
      }));
    } catch { /* Storage failure must not block browsing. */ }
    return direct;
  }
  try {
    const value = JSON.parse(storage.getItem(CAMPAIGN_SESSION_KEY) || "null");
    if (value?.schemaVersion !== ATTRIBUTION_SCHEMA_VERSION ||
        !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now ||
        value.expiresAt > now + CAMPAIGN_TTL_MS) return null;
    return canonicalCampaign(value.campaign);
  } catch { return null; }
}

export function clearUtm(storage) {
  try { storage?.removeItem(CAMPAIGN_SESSION_KEY); } catch { /* optional storage */ }
}

// Only consented, bounded client events can be prepared for a future collector.
// In particular a browser event must NEVER assert successful payment.
export function makeClientFunnelEvent(name, data = {}, { consent = false, campaign = null, now = Date.now() } = {}) {
  if (!consent) return null;
  if (!clientEvents.has(name)) throw new Error("Unsupported or server-only funnel event.");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid event data.");
  const allowed = new Set(["productId", "viewMode", "lang"]);
  for (const key of Object.keys(data)) if (!allowed.has(key)) throw new Error("Unapproved analytics field.");
  if (data.productId !== undefined && (typeof data.productId !== "string" || !productPattern.test(data.productId)))
    throw new Error("Invalid product ID.");
  if (data.viewMode !== undefined && !["feed", "grid", "list"].includes(data.viewMode))
    throw new Error("Invalid view mode.");
  if (data.lang !== undefined && !["tr", "en", "ru"].includes(data.lang))
    throw new Error("Invalid language.");
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid event time.");
  const normalized = campaign === null ? null : canonicalCampaign(campaign);
  if (campaign !== null && !normalized) throw new Error("Invalid campaign.");
  return Object.freeze({
    schemaVersion: ATTRIBUTION_SCHEMA_VERSION,
    name,
    occurredAtMs: now,
    campaign: normalized,
    data: Object.freeze({ ...data })
  });
}
