// Test-only boundary proof. Not imported by Counter server or a public runtime.
import { DatabaseSync } from "node:sqlite";
import { CounterError } from "../store.mjs";
import { validSecret } from "../auth.mjs";

const opaqueId = value => typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
const fail = (status, code) => { throw new CounterError(status, code); };

// resolveMemberSession is a TRUSTED server-side session resolver supplied by
// the harness. A caller-supplied member identifier is never accepted.
export function openPaidLinkProof({ ledgerPath, counterStore, resolveMemberSession }) {
  const db = new DatabaseSync(ledgerPath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS claimed_orders (
      order_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      order_number TEXT NOT NULL,
      paid_at INTEGER NOT NULL,
      total_minor INTEGER NOT NULL CHECK(total_minor >= 0),
      currency TEXT NOT NULL CHECK(currency = 'TRY')
    );
    CREATE INDEX IF NOT EXISTS member_history ON claimed_orders(member_id, paid_at, order_id);
  `);
  function member(sessionToken) {
    if (!validSecret(sessionToken)) fail(401, "member_required");
    const id = resolveMemberSession(sessionToken);
    if (!opaqueId(id)) fail(401, "member_required");
    return id;
  }
  function receipt(row) {
    return { orderId: row.order_id, number: row.order_number, paidAt: row.paid_at,
      totalMinor: row.total_minor, currency: row.currency };
  }
  function claim({ sessionToken, orderId, guestKey }) {
    const memberId = member(sessionToken);
    if (!opaqueId(orderId) || !validSecret(guestKey)) fail(404, "order_not_found");
    // Existing Counter capability check; never pass a staff user or a client quote.
    const order = counterStore.readOrder(orderId, { guestKey, language: "tr" });
    if (!["preparing", "ready", "issued"].includes(order.status)
      || !Number.isSafeInteger(order.paidAt) || order.paidAt <= 0
      || !Number.isSafeInteger(order.totalMinor) || order.totalMinor < 0
      || order.currency !== "TRY" || order.id !== orderId) fail(409, "order_not_paid");
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db.prepare("SELECT * FROM claimed_orders WHERE order_id = ?").get(orderId);
      if (existing && existing.member_id !== memberId) fail(409, "claim_unavailable");
      if (!existing) db.prepare(`INSERT INTO claimed_orders
        (order_id, member_id, order_number, paid_at, total_minor, currency) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(order.id, memberId, order.number, order.paidAt, order.totalMinor, order.currency);
      const row = existing ?? db.prepare("SELECT * FROM claimed_orders WHERE order_id = ?").get(orderId);
      db.exec("COMMIT");
      return { receipt: receipt(row), created: !existing };
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function history(sessionToken) {
    const memberId = member(sessionToken);
    return db.prepare(`SELECT * FROM claimed_orders WHERE member_id = ?
      ORDER BY paid_at DESC, order_id DESC LIMIT 100`).all(memberId).map(receipt);
  }
  return { claim, history, close: () => db.close() };
}
