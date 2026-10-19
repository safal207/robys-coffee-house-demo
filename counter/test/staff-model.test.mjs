import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderInput, queueSections, visibleForRole, nextOrderAction, paymentStillCurrent, formatMoney } from "../src/staff-model.mjs";

const base = "http://localhost:8787/counter/staff.html";
const id = "abcdefghijklmnopABCDEFGHIJKLMN_-";
test("accept an opaque order ID and only the cashier QR path on this origin", () => {
  assert.equal(parseOrderInput(id, base), id);
  assert.equal(parseOrderInput(`  ${base}#order=${id}  `, base), id);
  assert.equal(parseOrderInput(`/counter/staff.html#order=${id}`, base), id);
  for (const value of ["", "12345", `${id}x`, "javascript:alert(1)", `https://evil.test/counter/staff.html#order=${id}`, `http://localhost:8788/counter/staff.html#order=${id}`, `${base}?x=1#order=${id}`, `${base}#order=${id}&key=secret`, `${base}#order=${id}&order=${id}`, `${base}#ticket=${id}`, `/counter/guest.html#order=${id}`, `http://user:pass@localhost:8787/counter/staff.html#order=${id}`]) {
    assert.equal(parseOrderInput(value, base), null, value);
  }
});
const order = (status, createdAt = 1) => ({ id, status, createdAt, version: 1, totalMinor: 37000 });
test("cashier sees unpaid first, barista sees only preparation and ready orders", () => {
  const orders = [order("issued", 4), order("ready", 3), order("awaiting_payment", 1), order("preparing", 2), order("unknown", 0)];
  const cashier = queueSections(orders, "cashier"), barista = queueSections(orders, "barista");
  assert.deepEqual(cashier.unpaid.map(x => x.status), ["awaiting_payment"]);
  assert.deepEqual(cashier.active.map(x => x.status), ["preparing", "ready"]);
  assert.equal(cashier.issued.length, 1);
  assert.deepEqual(barista.unpaid, []); assert.deepEqual(barista.issued, []);
  assert.deepEqual(barista.active.map(x => x.status), ["preparing", "ready"]);
  assert.equal(visibleForRole(order("awaiting_payment"), "barista"), false);
  assert.equal(visibleForRole(order("ready"), "admin"), false);
  assert.equal(orders[0].status, "issued", "Sorting must not mutate API state");
});
test("offer only sequential actions authorized for the current role", () => {
  assert.equal(nextOrderAction(order("awaiting_payment"), "cashier"), "pay");
  assert.equal(nextOrderAction(order("awaiting_payment"), "barista"), null);
  for (const role of ["cashier", "barista"]) {
    assert.equal(nextOrderAction(order("preparing"), role), "ready");
    assert.equal(nextOrderAction(order("ready"), role), "issued");
    assert.equal(nextOrderAction(order("issued"), role), null);
  }
});
test("payment confirmation is invalidated by a changed order, amount, status or version", () => {
  const awaiting = order("awaiting_payment"), intent = { id, version: 1, totalMinor: 37000 };
  assert.equal(paymentStillCurrent(awaiting, intent), true);
  for (const changed of [{ id: "other" }, { version: 2 }, { totalMinor: 34000 }, { status: "preparing" }]) assert.equal(paymentStillCurrent({ ...awaiting, ...changed }, intent), false);
  assert.equal(paymentStillCurrent(null, intent), false);
});
test("minor units retain the actual amount across all three locales", () => {
  for (const lang of ["ru", "tr", "en"]) {
    assert.match(formatMoney(37000, lang), /370/);
    assert.match(formatMoney(37050, lang), /370[,.]50/);
  }
});
