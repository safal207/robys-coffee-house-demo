import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const mapCss = readFileSync("map-live.css", "utf8");
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(`[MAP-001] ${message}`);
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mapCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
  assert(match, `Missing CSS rule for ${selector}`);
  return match[1].replace(/\s+/g, "").toLowerCase();
}

const mapFrames = Array.from(html.matchAll(/<iframe\b[^>]*>/gi))
  .map((match) => match[0])
  .filter((tag) => /\bclass=["'][^"']*\bmap-live-frame\b[^"']*["']/i.test(tag));

assert(mapFrames.length === 1, `Expected exactly one .map-live-frame iframe, found ${mapFrames.length}`);

const iframe = mapFrames[0];
const src = iframe.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";

assert(/^https:\/\/(?:www\.|maps\.)?google\.[^/]+\/maps/i.test(src), "Map iframe must use an HTTPS Google Maps URL");
assert(/[?&]output=embed(?:&|$)/i.test(src), "Map iframe URL must include output=embed");
assert(!/\btabindex=["']-1["']/i.test(iframe), "Map iframe must remain keyboard reachable; tabindex=-1 is forbidden");
assert(/\ballowfullscreen(?:\s|>|=)/i.test(iframe), "Map iframe must allow fullscreen mode");

const frameRule = cssRule(".map-live-frame");
const overlayRule = cssRule(".map-live-link");
const badgeRule = cssRule(".map-live-badge");
const bottomRule = cssRule(".map-live-bottom");

assert(frameRule.includes("pointer-events:auto"), ".map-live-frame must receive pointer events");
assert(overlayRule.includes("pointer-events:none"), ".map-live-link must not block the iframe");
assert(badgeRule.includes("pointer-events:auto"), ".map-live-badge must remain clickable");
assert(bottomRule.includes("pointer-events:auto"), ".map-live-bottom must remain clickable");

const contract = dashboard.contracts?.find((item) => item.id === "MAP-001");
assert(contract, "MAP-001 is missing from qa/regression-dashboard.json");
assert(contract.status === "gated", "MAP-001 dashboard status must remain gated");
assert(Array.isArray(contract.assertions) && contract.assertions.length >= 6, "MAP-001 dashboard must document all regression assertions");

console.log("✅ MAP-001 gated: embedded map is interactive, keyboard reachable, and protected from full-card overlay regressions.");
