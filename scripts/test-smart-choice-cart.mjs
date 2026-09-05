// Exact-head verification after generated Smart Choice cart outputs were finalized.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-cart-"));
try {
  const outfile = path.join(temp, "cart-domain.mjs");
  await build({ entryPoints: ["src/smart-choice/cart-domain.ts"], bundle: true, platform: "node", format: "esm", target: "node20", outfile, legalComments: "none" });
  const domain = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const rules = domain.deriveCartRules();
  assert.deepEqual(domain.validateCartRules(rules), []);
  assert.equal(rules.bumps.length, 1, "exactly one bump rule is allowed");

  const base = domain.createInitialCart("combo-iced-san-sebastian");
  assert.deepEqual(base.substitutionIds, []);
  assert.deepEqual(base.upgradeIds, []);
  assert.equal(base.bumpDecision, "pending");
  let calculation = domain.calculateCart(base, "one");
  assert.equal(calculation.totalMinor, 37000);

  const singleItem = domain.createInitialCart("single-brew-hot--filter-coffee");
  const singleItemCalculation = domain.calculateCart(singleItem, "one");
  assert.equal(singleItemCalculation.totalMinor, 16000);
  assert.equal(singleItemCalculation.lines.length, 1);
  assert.equal(singleItemCalculation.lines[0].itemId, "brew-hot--filter-coffee");
  assert.equal(singleItemCalculation.canHandoff, true);

  const substituted = { ...base, substitutionIds: [rules.substitutions[0].id] };
  calculation = domain.calculateCart(substituted, "one");
  assert.equal(calculation.totalMinor, 37000);
  assert(calculation.lines.some((line) => line.itemId === "hot-coffee--caffe-latte"));

  const upgraded = { ...base, upgradeIds: [rules.upgrades[0].id] };
  calculation = domain.calculateCart(upgraded, "two");
  assert.equal(calculation.totalMinor, 55000);

  const bumped = { ...base, bumpDecision: "accepted" };
  calculation = domain.calculateCart(bumped, "one");
  assert.equal(calculation.totalMinor, 40000);
  assert(calculation.lines.some((line) => line.itemId === "desserts--macaron"));

  const declined = domain.reconcileCart({ ...base, bumpDecision: "declined" }, "one").state;
  assert.equal(declined.bumpDecision, "declined");

  const payloadA = domain.buildStableOrderPayload(bumped, domain.calculateCart(bumped, "one"), rules);
  const payloadB = domain.buildStableOrderPayload({ ...bumped, substitutionIds: [] }, domain.calculateCart(bumped, "one"), rules);
  assert.equal(domain.stableSerializeOrderPayload(payloadA), domain.stableSerializeOrderPayload(payloadB));
  assert.equal(payloadA.handoff.paid, false);
  assert.equal(payloadA.handoff.submitted, false);
  assert.equal(payloadA.handoff.acceptedByCafe, false);
  assert.match(domain.buildWhatsAppDraftMessage(payloadA, "ru"), /не оплата/i);

  const source = await readFile("src/smart-choice/cart.ts", "utf8");
  const html = await readFile("smart-choice/index.html", "utf8");
  const buildSource = await readFile("scripts/build.mjs", "utf8");
  assert(html.includes('src="cart-v2.js'));
  assert(html.includes('href="cart.css'));
  assert(buildSource.includes('entryPoints: ["src/smart-choice/cart.ts"]'));
  assert(source.includes('window.addEventListener("robys:choice-state"'));
  assert(source.includes("const flow = currentFlow"));
  assert(source.includes("lineFromChoice(cart, partySize)"));
  assert(source.includes("order.add(line.id, line.quantity)"));
  assert(source.includes("robys-smart-choice-order.v1"));
  assert(source.includes("https://wa.me/?text="));
  assert(!source.includes("innerHTML"));
  assert(!source.includes("fetch("));
  assert(!source.includes(".style."));
  console.log("✅ SMART-CHOICE-CART passed: catalog pricing, optional upgrades, one-session bump, stable draft payload and honest WhatsApp handoff verified.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
