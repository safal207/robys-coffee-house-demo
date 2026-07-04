#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TOKEN_RE = /^rv_[a-z0-9]{20}$/;
const ORDER_ID_RE = /^ord_[a-z0-9][a-z0-9_-]{2,63}$/;
const MONEY_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
const OFFSET_DATE_TIME_RE = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/;
const TOKEN_TIMESTAMP_WIDTH = 7;
const PRODUCT_REF = "PROD-ROBYS-WEB";
const MEASUREMENT_PLAN_REF = "MPLAN-ROBYS-MENU-TO-VISIT-001";
const CURRENCY = "TRY";
const ATTRIBUTION_WINDOW_HOURS = 24;

export class PosBaselineError extends Error {}

function require(condition, message) {
  if (!condition) throw new PosBaselineError(message);
}

export function timestampFromCampaignToken(token) {
  require(typeof token === "string" && TOKEN_RE.test(token), "campaignToken is invalid");
  const encoded = token.slice(3, 3 + TOKEN_TIMESTAMP_WIDTH);
  const seconds = Number.parseInt(encoded, 36);
  require(
    Number.isSafeInteger(seconds) &&
      seconds >= 0 &&
      seconds.toString(36).padStart(TOKEN_TIMESTAMP_WIDTH, "0") === encoded,
    "campaignToken timestamp is invalid"
  );
  const timestamp = seconds * 1000;
  require(Number.isFinite(Date.parse(new Date(timestamp).toISOString())), "campaignToken timestamp is invalid");
  return timestamp;
}

export function visitIntentFromCampaignToken(token) {
  return {
    eventId: `wev_${token.slice(-16)}`,
    eventName: "visit_intent_created",
    occurredAt: new Date(timestampFromCampaignToken(token)).toISOString(),
    campaignToken: token
  };
}

export function normalizePosOrder(order, index = 0) {
  require(order && typeof order === "object" && !Array.isArray(order), `posOrders[${index}] must be an object`);
  const fields = [
    "campaignToken",
    "currency",
    "grossRevenue",
    "orderId",
    "orderedAt",
    "variableCost"
  ];
  require(
    Object.keys(order).sort().join(",") === fields.join(","),
    `posOrders[${index}] contains missing or unknown fields`
  );
  require(typeof order.orderId === "string" && ORDER_ID_RE.test(order.orderId), `posOrders[${index}].orderId is invalid`);
  require(
    typeof order.orderedAt === "string" &&
      OFFSET_DATE_TIME_RE.test(order.orderedAt) &&
      Number.isFinite(Date.parse(order.orderedAt)),
    `posOrders[${index}].orderedAt must be an RFC3339 date-time with offset`
  );
  timestampFromCampaignToken(order.campaignToken);
  require(order.currency === CURRENCY, `posOrders[${index}].currency must be ${CURRENCY}`);
  require(
    typeof order.grossRevenue === "string" && MONEY_RE.test(order.grossRevenue),
    `posOrders[${index}].grossRevenue is invalid`
  );
  require(
    typeof order.variableCost === "string" && MONEY_RE.test(order.variableCost),
    `posOrders[${index}].variableCost is invalid`
  );
  return {
    orderId: order.orderId,
    orderedAt: order.orderedAt,
    campaignToken: order.campaignToken,
    grossRevenue: order.grossRevenue,
    currency: order.currency,
    variableCost: order.variableCost
  };
}

function canonical(value) {
  return JSON.stringify(value);
}

export function deduplicatePosOrders(posOrders) {
  require(Array.isArray(posOrders), "POS export must be a JSON array");
  const seen = new Map();
  const unique = [];
  posOrders.forEach((raw, index) => {
    const order = normalizePosOrder(raw, index);
    const encoded = canonical(order);
    if (seen.has(order.orderId)) {
      require(seen.get(order.orderId) === encoded, `conflicting duplicate orderId: ${order.orderId}`);
      return;
    }
    seen.set(order.orderId, encoded);
    unique.push(order);
  });
  return unique.sort((left, right) => left.orderId.localeCompare(right.orderId, "en"));
}

function deterministicRunId(orders) {
  const digest = createHash("sha256").update(canonical(orders)).digest("hex");
  return `ATTRRUN-ROBYS-BASELINE-${digest.slice(0, 16).toUpperCase()}`;
}

export function buildBaselineBundle(posOrders) {
  const orders = deduplicatePosOrders(posOrders);
  const eventsByToken = new Map();
  for (const order of orders) {
    if (!eventsByToken.has(order.campaignToken)) {
      eventsByToken.set(order.campaignToken, visitIntentFromCampaignToken(order.campaignToken));
    }
  }
  const webEvents = [...eventsByToken.values()].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt, "en") || left.eventId.localeCompare(right.eventId, "en")
  );
  return {
    schemaVersion: "robys-attribution-input.v0",
    runId: deterministicRunId(orders),
    mode: "BASELINE",
    productRef: PRODUCT_REF,
    measurementPlanRef: MEASUREMENT_PLAN_REF,
    currency: CURRENCY,
    attributionWindowHours: ATTRIBUTION_WINDOW_HOURS,
    webEvents,
    posOrders: orders
  };
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) {
    console.error("Usage: node scripts/build-baseline-from-pos.mjs <pos-orders.json> [baseline-bundle.json]");
    return 2;
  }
  try {
    const raw = JSON.parse(readFileSync(inputPath, "utf8"));
    const bundle = buildBaselineBundle(raw);
    const rendered = `${JSON.stringify(bundle, null, 2)}\n`;
    if (outputPath) writeFileSync(outputPath, rendered);
    else process.stdout.write(rendered);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`INVALID: ${message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
