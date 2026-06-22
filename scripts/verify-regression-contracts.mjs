import "./verify-critical-user-journeys.mjs";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const mapCss = readFileSync("map-live.css", "utf8");
const heroCss = readFileSync("hero-balance.css", "utf8");
const qaRuntime = readFileSync("qa.js", "utf8");
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));

function assert(condition, contract, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

function cssRules(css, selector, contract) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gi")));
  assert(matches.length > 0, contract, `Missing CSS rule for ${selector}`);
  return matches.map((match) => match[1].replace(/\s+/g, "").toLowerCase());
}

function dashboardContract(id, minimumAssertions) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  assert(contract, id, `${id} is missing from qa/regression-dashboard.json`);
  assert(contract.status === "gated", id, `${id} dashboard status must remain gated`);
  assert(
    Array.isArray(contract.assertions) && contract.assertions.length >= minimumAssertions,
    id,
    `${id} dashboard does not document all regression assertions`
  );
}

// MAP-001 — the embedded map must remain interactive.
const mapFrames = Array.from(html.matchAll(/<iframe\b[^>]*>/gi))
  .map((match) => match[0])
  .filter((tag) => /\bclass=["'][^"']*\bmap-live-frame\b[^"']*["']/i.test(tag));

assert(mapFrames.length === 1, "MAP-001", `Expected exactly one .map-live-frame iframe, found ${mapFrames.length}`);

const iframe = mapFrames[0];
const mapSrc = iframe.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";
assert(/^https:\/\/(?:www\.|maps\.)?google\.[^/]+\/maps/i.test(mapSrc), "MAP-001", "Map iframe must use an HTTPS Google Maps URL");
assert(/[?&]output=embed(?:&|$)/i.test(mapSrc), "MAP-001", "Map iframe URL must include output=embed");
assert(!/\btabindex=["']-1["']/i.test(iframe), "MAP-001", "Map iframe must remain keyboard reachable; tabindex=-1 is forbidden");
assert(/\ballowfullscreen(?:\s|>|=)/i.test(iframe), "MAP-001", "Map iframe must allow fullscreen mode");

const frameRule = cssRules(mapCss, ".map-live-frame", "MAP-001")[0];
const overlayRule = cssRules(mapCss, ".map-live-link", "MAP-001")[0];
const badgeRule = cssRules(mapCss, ".map-live-badge", "MAP-001")[0];
const bottomRule = cssRules(mapCss, ".map-live-bottom", "MAP-001")[0];
assert(frameRule.includes("pointer-events:auto"), "MAP-001", ".map-live-frame must receive pointer events");
assert(overlayRule.includes("pointer-events:none"), "MAP-001", ".map-live-link must not block the iframe");
assert(badgeRule.includes("pointer-events:auto"), "MAP-001", ".map-live-badge must remain clickable");
assert(bottomRule.includes("pointer-events:auto"), "MAP-001", ".map-live-bottom must remain clickable");
dashboardContract("MAP-001", 6);

// VIDEO-001 — the hero must not remain frozen on its poster.
const heroVideoBlocks = Array.from(html.matchAll(/<video\b[^>]*\bclass=["'][^"']*\bhero-video\b[^"']*["'][^>]*>[\s\S]*?<\/video>/gi)).map((match) => match[0]);
assert(heroVideoBlocks.length === 1, "VIDEO-001", `Expected exactly one .hero-video element, found ${heroVideoBlocks.length}`);

const heroVideo = heroVideoBlocks[0];
for (const attribute of ["autoplay", "muted", "loop", "playsinline"]) {
  assert(new RegExp(`\\b${attribute}(?:\\s|>|=)`, "i").test(heroVideo), "VIDEO-001", `Hero video must keep the ${attribute} attribute`);
}
const heroSource = heroVideo.match(/<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
assert(/^src\/[\w./-]+\.mp4(?:\?[^"']*)?$/i.test(heroSource), "VIDEO-001", "Hero video must use a local MP4 source");
assert(/\bvideo\.play\s*\(/.test(qaRuntime), "VIDEO-001", "Hero runtime must explicitly call video.play()");
for (const eventName of ["canplay", "visibilitychange", "pointerdown", "pause"]) {
  assert(qaRuntime.includes(`\"${eventName}\"`), "VIDEO-001", `Hero playback recovery must handle ${eventName}`);
}
assert(qaRuntime.includes("HERO_BALANCE_STYLES"), "VIDEO-001", "Hero runtime must load the visual-balance stylesheet");
dashboardContract("VIDEO-001", 5);

// THEME-001 — the landing must retain light sections and a readable hero.
const heroOverlayRules = cssRules(heroCss, ".hero-overlay", "THEME-001");
const overlayAlphas = heroOverlayRules.flatMap((rule) =>
  Array.from(rule.matchAll(/rgba\([^)]*,\s*(\d*\.?\d+)\)/g), (match) => Number(match[1]))
);
assert(overlayAlphas.length > 0, "THEME-001", "Hero overlay must declare RGBA transparency values");
assert(Math.max(...overlayAlphas) <= 0.78, "THEME-001", `Hero overlay is too dark: max alpha ${Math.max(...overlayAlphas)}`);

const heroVideoRule = cssRules(heroCss, ".hero-video", "THEME-001")[0];
const brightness = Number(heroVideoRule.match(/brightness\((\d*\.?\d+)\)/)?.[1] ?? 0);
assert(brightness >= 1, "THEME-001", `Hero video brightness must be at least 1.0, found ${brightness}`);

const lightSectionContracts = [
  [".about", "background:var(--paper)"],
  [".gallery-section", "background:var(--cream)"],
  [".visit-section", "background:var(--paper)"]
];
for (const [selector, requiredBackground] of lightSectionContracts) {
  const rule = cssRules(heroCss, selector, "THEME-001")[0];
  assert(rule.includes(requiredBackground), "THEME-001", `${selector} must retain ${requiredBackground}`);
  assert(rule.includes("color:var(--ink)"), "THEME-001", `${selector} must retain dark readable text`);
}
dashboardContract("THEME-001", 5);

console.log("✅ MAP-001 gated: embedded map remains interactive.");
console.log("✅ VIDEO-001 gated: hero playback has explicit mobile recovery.");
console.log("✅ THEME-001 gated: hero contrast and light-section palette remain balanced.");
