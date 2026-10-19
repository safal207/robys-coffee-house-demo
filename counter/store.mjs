import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { digest, equalSecret, hashPassword, normalizeUsername } from "./auth.mjs";

export class CounterError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new CounterError(status, code); };
export function openCounterStore(dbPath) {
  if (!dbPath || dbPath === ":memory:") throw new Error("A persistent SQLite file path is required");
  const file = resolve(dbPath);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try { chmodSync(file, 0o600); } catch { /* Windows ACLs are controlled by the account owning the local data directory. */ }
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  if (db.prepare("PRAGMA user_version").get().user_version > 1) { db.close(); throw new Error("Unsupported counter database version"); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('cashier','barista'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS orders (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL UNIQUE,
      guest_hash TEXT NOT NULL, composition_hash TEXT NOT NULL, quotes TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_payment','preparing','ready','issued')),
      version INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      paid_at INTEGER, paid_by INTEGER REFERENCES users(id), total_minor INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS queue_order ON orders(status, created_at, sequence);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), action TEXT NOT NULL,
      from_version INTEGER NOT NULL, at INTEGER NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
      actor_username TEXT NOT NULL, actor_role TEXT NOT NULL,
      UNIQUE(order_id, action, from_version)
    );
    PRAGMA user_version = 1;
  `);
  const transaction = callback => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = callback(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const orderById = id => db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  const view = (row, language = "tr") => {
    const quote = JSON.parse(row.quotes)[language];
    return { id: row.id, number: `R-${String(row.sequence).padStart(6, "0")}`, status: row.status,
      version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, paidAt: row.paid_at,
      totalMinor: row.total_minor, currency: "TRY", groups: quote.groups };
  };
  return {
    close: () => db.close(),
    async provisionUser({ username, password, role }) {
      const name = normalizeUsername(username);
      if (!name || !["cashier", "barista"].includes(role)) throw new Error("Invalid username or role");
      const passwordHash = await hashPassword(password);
      transaction(() => {
        db.prepare(`INSERT INTO users(username,password_hash,role) VALUES(?,?,?)
          ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role=excluded.role`).run(name, passwordHash, role);
        db.prepare("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)").run(name);
      });
      return { username: name, role };
    },
    userByName: name => db.prepare("SELECT * FROM users WHERE username = ?").get(name),
    createSession(token, userId, now, ttl) {
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(digest(token), userId, now + ttl);
    },
    session(token, now) {
      return db.prepare(`SELECT users.id, users.username, users.role FROM sessions
        JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`).get(digest(token), now);
    },
    logout: token => db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(digest(token)),
    createOrder({ ticket, guestKey, quotes, now, language }) {
      return transaction(() => {
        const guestHash = digest(guestKey), compositionHash = digest(JSON.stringify(ticket.groups));
        const previous = db.prepare("SELECT * FROM orders WHERE client_id = ?").get(ticket.id);
        if (previous) {
          if (!equalSecret(previous.guest_hash, guestHash) || !equalSecret(previous.composition_hash, compositionHash)) fail(409, "order_conflict");
          return { order: view(previous, language), created: false };
        }
        const id = randomBytes(24).toString("base64url");
        db.prepare(`INSERT INTO orders(id,client_id,guest_hash,composition_hash,quotes,status,version,created_at,updated_at,total_minor)
          VALUES(?,?,?,?,?,'awaiting_payment',1,?,?,?)`).run(id, ticket.id, guestHash, compositionHash, JSON.stringify(quotes), now, now, quotes.tr.totalMinor);
        return { order: view(orderById(id), language), created: true };
      });
    },
    readOrder(id, { user, guestKey, language }) {
      const row = orderById(id);
      if (!row) fail(404, "order_not_found");
      if (user) {
        if (user.role === "barista" && row.status === "awaiting_payment") fail(404, "order_not_found");
      } else if (!guestKey || !equalSecret(row.guest_hash, digest(guestKey))) fail(404, "order_not_found");
      return view(row, language);
    },
    queue(user, language, now) {
      const rows = user.role === "barista"
        ? db.prepare("SELECT * FROM orders WHERE status IN ('preparing','ready') ORDER BY created_at,sequence LIMIT 200").all()
        : [
          ...db.prepare("SELECT * FROM orders WHERE status != 'issued' ORDER BY created_at,sequence LIMIT 200").all(),
          ...db.prepare("SELECT * FROM orders WHERE status = 'issued' AND updated_at >= ? ORDER BY updated_at DESC,sequence DESC LIMIT 30").all(now - 24 * 60 * 60 * 1000)
        ].sort((left, right) => left.created_at - right.created_at || left.sequence - right.sequence);
      return rows.map(row => view(row, language));
    },
    transition(id, { user, action, version, status, language, now }) {
      return transaction(() => {
        const row = orderById(id);
        if (!row || (user.role === "barista" && row.status === "awaiting_payment")) fail(404, "order_not_found");
        const operation = action === "pay" ? "pay" : status;
        if (db.prepare("SELECT 1 FROM audit WHERE order_id = ? AND action = ? AND from_version = ?").get(id, operation, version)) return view(row, language);
        if (row.version !== version) fail(409, "version_conflict");
        const next = action === "pay" ? "preparing" : status;
        const valid = action === "pay" ? row.status === "awaiting_payment"
          : (row.status === "preparing" && next === "ready") || (row.status === "ready" && next === "issued");
        if (!valid) fail(409, "invalid_transition");
        if (action === "pay") {
          db.prepare("UPDATE orders SET status=?,version=version+1,updated_at=?,paid_at=?,paid_by=? WHERE id=?").run(next, now, now, user.id, id);
        } else db.prepare("UPDATE orders SET status=?,version=version+1,updated_at=? WHERE id=?").run(next, now, id);
        db.prepare("INSERT INTO audit(order_id,action,from_version,at,actor_id,actor_username,actor_role) VALUES(?,?,?,?,?,?,?)")
          .run(id, operation, version, now, user.id, user.username, user.role);
        return view(orderById(id), language);
      });
    }
  };
}

export async function provisionUser({ dbPath, ...user }) {
  const store = openCounterStore(dbPath);
  try { return await store.provisionUser(user); } finally { store.close(); }
}
