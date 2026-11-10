// Read-only factual Counter KPIs. Only cashier-acknowledged payments with audit proof count.
// No attribution claims: this module cannot link paid orders to UTM sources.
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

export const PAID_REPORT_SCHEMA_VERSION = "robys.counter-paid-kpi.v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export function reportVerifiedPayments(dbPath, { fromMs, toMs } = {}) {
  if (typeof dbPath !== "string" || !dbPath.trim() || dbPath === ":memory:" ||
      !Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) ||
      fromMs <= 0 || toMs <= fromMs || toMs - fromMs > 366 * DAY_MS) {
    throw Error("Invalid private Counter report request");
  }
  const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
  try {
    db.exec("PRAGMA query_only=ON;");
    const predicate = `o.paid_at >= ? AND o.paid_at < ?
      AND EXISTS (SELECT 1 FROM audit a WHERE a.order_id=o.id AND a.action='pay')`;
    const totals = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(o.total_minor),0) AS gross
      FROM orders o WHERE ${predicate}`).get(fromMs,toMs);
    const byDay = db.prepare(`SELECT strftime('%Y-%m-%d',o.paid_at / 1000,'unixepoch','+3 hours') AS day,
      COUNT(*) AS count, COALESCE(SUM(o.total_minor),0) AS gross
      FROM orders o WHERE ${predicate} GROUP BY day ORDER BY day`).all(fromMs,toMs);
    const count = Number(totals.count);
    const grossMinor = Number(totals.gross);
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(grossMinor) || grossMinor < 0) throw Error("Invalid financial report totals");
    return {
      schemaVersion:PAID_REPORT_SCHEMA_VERSION,
      authority:"cashier-acknowledged-and-audited",
      timezone:"Europe/Istanbul",
      currency:"TRY",
      fromMs,toMs,
      paidOrders:count,grossMinor,averageMinor:count?Math.round(grossMinor/count):null,
      byDay:byDay.map(row=>({day:row.day,paidOrders:Number(row.count),grossMinor:Number(row.gross)})),
      attributionCoverage:null, // No verified paid-order/UTM join exists.
      caveats:["Cashier acknowledgement is not a bank settlement.","Refunds, fees and tax are not accounted for."]
    };
  } finally { db.close(); }
}
