// First-party event store V1: no HTTP routes, cookies, fingerprinting or customer identifiers.
// Import only after an authorized collector has independently enforced same-origin, consent,
// bounded request size, rate limits and deployment approval.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { makeClientFunnelEvent, ATTRIBUTION_SCHEMA_VERSION } from "./marketing-attribution-v0.js";

export const EVENT_ID_PATTERN = /^ae_[a-f0-9]{32}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;
const MAX_EVENT_AGE_MS = 15 * 60 * 1000;
const ALLOWED_KEYS = ["eventId", "schemaVersion", "name", "occurredAtMs", "campaign", "data"];

const stableFields = value => value === null ? "null" : JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]));

function assertEvent(entry, receivedAt) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      Object.keys(entry).sort().join(",") !== ALLOWED_KEYS.slice().sort().join(",")) throw Error("Invalid event envelope");
  if (typeof entry.eventId !== "string" || !EVENT_ID_PATTERN.test(entry.eventId)) throw Error("Invalid event id");
  if (entry.schemaVersion !== ATTRIBUTION_SCHEMA_VERSION ||
      !Number.isSafeInteger(entry.occurredAtMs) ||
      entry.occurredAtMs < receivedAt - MAX_EVENT_AGE_MS ||
      entry.occurredAtMs > receivedAt + CLOCK_SKEW_MS) throw Error("Invalid event timestamp or schema");
  const valid = makeClientFunnelEvent(entry.name, entry.data,
    { consent: true, campaign: entry.campaign, now: entry.occurredAtMs });
  if (!valid || stableFields(valid.data) !== stableFields(entry.data) ||
      stableFields(valid.campaign) !== stableFields(entry.campaign)) throw Error("Noncanonical event values");
  return valid;
}

export function openMarketingEventStore(dbPath, { now = Date.now, retentionDays = 90 } = {}) {
  if (!dbPath || dbPath === ":memory:" || !Number.isSafeInteger(retentionDays) ||
      retentionDays < 1 || retentionDays > 365 || typeof now !== "function") throw Error("Invalid store configuration");
  const file = resolve(dbPath);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try { chmodSync(file, 0o600); } catch { /* Filesystem permissions vary by platform. */ }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS marketing_events (
      id TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL,
      name TEXT NOT NULL, source TEXT, medium TEXT, campaign TEXT, content TEXT, term TEXT,
      product_id TEXT, view_mode TEXT, locale TEXT
    );
    CREATE INDEX IF NOT EXISTS marketing_events_window ON marketing_events(occurred_at,name);
    CREATE INDEX IF NOT EXISTS marketing_events_source ON marketing_events(source,occurred_at);`);
  const insert = db.prepare(`INSERT OR IGNORE INTO marketing_events
    (id,occurred_at,received_at,name,source,medium,campaign,content,term,product_id,view_mode,locale)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const summary = db.prepare(`SELECT COALESCE(source, 'unknown') AS source, name, COUNT(*) AS eventCount
    FROM marketing_events WHERE occurred_at >= ? AND occurred_at < ?
    GROUP BY COALESCE(source, 'unknown'), name ORDER BY source,name`);
  const deleteOld = db.prepare("DELETE FROM marketing_events WHERE occurred_at < ?");
  return Object.freeze({
    // This flag must come from trusted HTTP middleware, never from a visitor's JSON body.
    append(entry, { authorizedConsent = false } = {}) {
      if (authorizedConsent !== true) throw Error("Consent not authorized by collector");
      const receivedAt = now();
      if (!Number.isSafeInteger(receivedAt) || receivedAt <= 0) throw Error("Invalid collector clock");
      const event = assertEvent(entry, receivedAt);
      deleteOld.run(receivedAt - retentionDays * DAY_MS);
      const source = event.campaign;
      const data = event.data;
      return insert.run(entry.eventId,event.occurredAtMs,receivedAt,event.name,
        source?.source ?? null,source?.medium ?? null,source?.campaign ?? null,
        source?.content ?? null,source?.term ?? null,data.productId ?? null,
        data.viewMode ?? null,data.lang ?? null).changes === 1;
    },
    // For use by a future authorized owner-only endpoint. No public route is attached.
    counts({ fromMs, toMs }) {
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) ||
          toMs <= fromMs || toMs - fromMs > retentionDays * DAY_MS) throw Error("Invalid reporting window");
      return summary.all(fromMs,toMs).map(row => ({
        source:row.source,event:row.name,count:Number(row.eventCount)
      }));
    },
    purgeBefore(cutoffMs) {
      if (!Number.isSafeInteger(cutoffMs) || cutoffMs <= 0) throw Error("Invalid cutoff");
      return deleteOld.run(cutoffMs).changes;
    },
    close() { db.close(); }
  });
}
