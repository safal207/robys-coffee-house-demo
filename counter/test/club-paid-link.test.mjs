import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openCounterStore, CounterError } from "../store.mjs";
import { randomSecret, validSecret } from "../auth.mjs";
import { getOrCreateOrderTicket, quoteOrderTicket } from "../../src/order-ticket.js";
// Test-only boundary proof. Not imported by Counter server or a public runtime.

const opaqueId = value => typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
const fail = (status, code) => { throw new CounterError(status, code); };

// resolveMemberSession is a TRUSTED server-side session resolver supplied by
// the harness. A caller-supplied member identifier is never accepted.
function openPaidLinkProof({ ledgerPath, counterStore, resolveMemberSession }) {
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


const memberId = () => randomBytes(24).toString("base64url");
const code = expected => error => error?.code === expected;
test("real Counter payment and guest capability gate a private, durable, one-time claim", async t => {
  const dir = mkdtempSync(join(tmpdir(), "robys-club-proof-"));
  const counterPath = join(dir, "counter.sqlite"), ledgerPath = join(dir, "claims.sqlite");
  const counter = openCounterStore(counterPath);
  const tokenA = randomSecret(), tokenB = randomSecret();
  const a = memberId(), b = memberId();
  const sessions = new Map([[tokenA, a], [tokenB, b]]);
  const options = {ledgerPath, counterStore: counter, resolveMemberSession: token => sessions.get(token)};
  let ledger = openPaidLinkProof(options);
  t.after(() => { ledger?.close(); counter.close(); rmSync(dir, {recursive:true,force:true}); });
  await counter.provisionUser({username:"cashier",password:randomSecret(),role:"cashier"});
  const cashier = counter.userByName("cashier");
  const ticket = getOrCreateOrderTicket({version:1,groups:[{quantity:1,items:[{id:"hot-coffee:espresso",quantity:1}]}]});
  const guestKey = randomSecret();
  const quotes = Object.fromEntries(["tr","en","ru"].map(lang=>[lang, quoteOrderTicket(ticket,lang)]));
  const now = 1780000000000;
  const {order} = counter.createOrder({ticket,guestKey,quotes,now,language:"tr"});
  const claim = (token=tokenA,key=guestKey,extra={}) => ledger.claim({sessionToken:token,orderId:order.id,guestKey:key,...extra});
  assert.throws(()=>claim(randomSecret()),code("member_required"));
  assert.throws(()=>claim(tokenA,randomSecret()),code("order_not_found"));
  assert.throws(()=>claim(tokenA,guestKey,{paidAt:now,status:"issued",totalMinor:1}),code("order_not_paid"));
  assert.deepEqual(ledger.history(tokenA),[]);
  const paid = counter.transition(order.id,{user:cashier,action:"pay",version:order.version,language:"tr",now:now+1});
  const first = claim(tokenA,guestKey,{memberId:b,totalMinor:1});
  assert.equal(first.created,true);
  assert.equal(first.receipt.paidAt,paid.paidAt);
  assert.equal(first.receipt.totalMinor,quotes.tr.totalMinor);
  assert.deepEqual(claim(),{receipt:first.receipt,created:false});
  assert.throws(()=>claim(tokenB),code("claim_unavailable"));
  assert.throws(()=>claim(tokenA,randomSecret()),code("order_not_found"));
  assert.deepEqual(ledger.history(tokenB),[]);
  assert.deepEqual(ledger.history(tokenA),[first.receipt]);
  const ready = counter.transition(order.id,{user:cashier,action:"status",status:"ready",version:paid.version,language:"tr",now:now+2});
  counter.transition(order.id,{user:cashier,action:"status",status:"issued",version:ready.version,language:"tr",now:now+3});
  ledger.close(); ledger = null;
  ledger = openPaidLinkProof(options);
  assert.deepEqual(ledger.history(tokenA),[first.receipt]);
  assert.equal(claim().created,false);
  sessions.delete(tokenA);
  assert.throws(()=>ledger.history(tokenA),code("member_required"));
  assert.throws(()=>claim(),code("member_required"));
  const inspection = new DatabaseSync(ledgerPath,{readOnly:true});
  try {
    const rows=inspection.prepare("SELECT * FROM claimed_orders").all();
    assert.equal(rows.length,1);
    assert.equal(rows[0].member_id,a);
    assert.ok(!JSON.stringify(rows).includes(guestKey));
    assert.ok(!JSON.stringify(rows).includes(tokenA));
    assert.ok(!JSON.stringify(rows).includes(tokenB));
  } finally { inspection.close(); }
});
