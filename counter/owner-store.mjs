// Owner identity is deliberately separate from cashier/barista users and sessions.
// This additive SQLite schema does not alter Counter's existing users CHECK constraints.
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { digest, hashPassword, normalizeUsername } from "./auth.mjs";

const DAY_MS = 86400000;
const MAX_REPORT_MS = 93 * DAY_MS;

export function openOwnerStore(dbPath) {
  if (!dbPath || dbPath === ":memory:") throw Error("Owner store requires private persistent Counter SQLite");
  const file = resolve(dbPath);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try { chmodSync(file, 0o600); } catch { /* OS-managed file permissions. */ }
  db.exec([
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    "CREATE TABLE IF NOT EXISTS robys_owners (id INTEGER PRIMARY KEY,",
    "username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS robys_owner_sessions (token_hash TEXT PRIMARY KEY,",
    "owner_id INTEGER NOT NULL REFERENCES robys_owners(id) ON DELETE CASCADE,",
    "expires_at INTEGER NOT NULL);",
    "CREATE INDEX IF NOT EXISTS robys_owner_session_expiry ON robys_owner_sessions(expires_at);"
  ].join(" "));
  const lookup = db.prepare("SELECT id,username,password_hash FROM robys_owners WHERE username = ?");
  const selectSession = db.prepare([
    "SELECT o.username FROM robys_owner_sessions s",
    "JOIN robys_owners o ON s.owner_id = o.id WHERE s.token_hash = ? AND s.expires_at > ?"
  ].join(" "));
  const predicate = "o.paid_at >= ? AND o.paid_at < ? AND o.paid_at IS NOT NULL " +
    "AND EXISTS (SELECT 1 FROM audit a WHERE a.order_id=o.id AND a.action='pay')";
  const report = db.prepare("SELECT COUNT(*) AS paid_orders, COALESCE(SUM(o.total_minor),0) AS gross_minor " +
    "FROM orders o WHERE " + predicate);
  const daily = db.prepare("SELECT strftime('%Y-%m-%d',o.paid_at / 1000,'unixepoch','+3 hours') AS day, " +
    "COUNT(*) AS paid_orders, COALESCE(SUM(o.total_minor),0) AS gross_minor " +
    "FROM orders o WHERE " + predicate + " GROUP BY day ORDER BY day");
  const safeMoney = n => {
    if (!Number.isSafeInteger(n) || n < 0) throw Error("Invalid Counter payment amount");
    return n;
  };
  return {
    close() { db.close(); },
    async provision({ username, password }) {
      const name = normalizeUsername(username);
      if (!name) throw Error("Invalid owner username");
      const hashed = await hashPassword(password);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT INTO robys_owners(username,password_hash) VALUES(?,?) " +
          "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash").run(name, hashed);
        // Password rotation invalidates all owner sessions.
        db.prepare("DELETE FROM robys_owner_sessions WHERE owner_id = " +
          "(SELECT id FROM robys_owners WHERE username = ?)").run(name);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return { username: name, role: "owner" };
    },
    ownerByName(name) { return lookup.get(name); },
    createSession(token, ownerId, at, ttl) {
      db.prepare("DELETE FROM robys_owner_sessions WHERE expires_at <= ?").run(at);
      db.prepare("INSERT INTO robys_owner_sessions(token_hash,owner_id,expires_at) VALUES(?,?,?)")
        .run(digest(token), ownerId, at + ttl);
    },
    session(token, at) { return selectSession.get(digest(token), at) ?? null; },
    logout(token) { db.prepare("DELETE FROM robys_owner_sessions WHERE token_hash = ?").run(digest(token)); },
    paidSummary({ fromMs, toMs }) {
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) ||
          fromMs <= 0 || toMs <= fromMs || toMs - fromMs > MAX_REPORT_MS)
        throw Error("Invalid paid summary window");
      const total = report.get(fromMs, toMs);
      const paidOrders = safeMoney(Number(total.paid_orders));
      const grossMinor = safeMoney(Number(total.gross_minor));
      const byDay = daily.all(fromMs, toMs).map(row => ({
        day: row.day, paidOrders: safeMoney(Number(row.paid_orders)),
        grossMinor: safeMoney(Number(row.gross_minor))
      }));
      return {
        authority: "cashier-acknowledged-and-audited",
        currency: "TRY", timezone: "Europe/Istanbul",
        fromMs, toMs, paidOrders, grossMinor,
        averageMinor: paidOrders ? Math.round(grossMinor / paidOrders) : null,
        byDay,
        // Deliberately no fabricated marketing attribution or net revenue.
        campaignAttribution: null
      };
    }
  };
}

export async function provisionOwner({ dbPath, username, password }) {
  const store = openOwnerStore(dbPath);
  try { return await store.provision({ username, password }); }
  finally { store.close(); }
}
