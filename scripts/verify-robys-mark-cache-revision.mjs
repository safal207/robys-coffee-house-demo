import { readFileSync } from "node:fs";

// This contract prevents a new Organic O from being served through a stale URL.
const REVISION = "20260726-approved-v4";
const css = readFileSync("brand-photo-logo.css", "utf8");
const expected = `robys-mark-master-v1.svg?v=${REVISION}`;

if (!css.includes(expected)) {
  throw new Error(`[BRAND-CACHE-001] Organic O must load with exact revision ${REVISION}`);
}
if (css.includes("20260721-master-1") || css.includes("20260724-wordmark-v3")) {
  throw new Error("[BRAND-CACHE-001] stale identity cache revisions must be removed");
}

console.log(`✅ BRAND-CACHE-001: Organic O uses exact cache revision ${REVISION}.`);
