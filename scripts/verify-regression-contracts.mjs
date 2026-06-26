import "./verify-critical-user-journeys.mjs";
import "./verify-p1-interface-contracts.mjs";
import "./verify-seo-content-deploy.mjs";
import "./verify-visual-contract.mjs";
import "./verify-performance-contract.mjs";
import "./verify-live-contract.mjs";
import "./verify-security-contracts.mjs";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const mapCss = readFileSync("map-live.css", "utf8");
const heroCss = readFileSync("hero-balance.css", "utf8");
const featuredCss = readFileSync("featured-gallery.css", "utf8");
const featuredRuntime = readFileSync("featured-gallery.js", "utf8");
const featuredSource = readFileSync("src/featured-gallery.ts", "utf8");
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
  assert(Array.isArray(contract.assertions) && contract.assertions.length >= minimumAssertions, id, `${id} dashboard does not document all regression assertions`);
}

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
assert(mapCss.includes("@media(hover:none) and (pointer:coarse){"), "MAP-001", "Touch-device map fallback media query is missing");
assert(mapCss.includes(".map-live-frame{display:none}"), "MAP-001", "Touch devices must hide the embedded map frame");
assert(mapCss.includes(".map-live-link{pointer-events:auto}"), "MAP-001", "Touch-device map card must remain fully clickable");
assert(mapCss.includes(".map-live-badge,.map-live-bottom{pointer-events:none}"), "MAP-001", "Touch-device child controls must delegate clicks to the full map link");
dashboardContract("MAP-001", 6);

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
  assert(qaRuntime.includes(`"${eventName}"`), "VIDEO-001", `Hero playback recovery must handle ${eventName}`);
}
assert(qaRuntime.includes("HERO_BALANCE_STYLES"), "VIDEO-001", "Hero runtime must load the visual-balance stylesheet");
dashboardContract("VIDEO-001", 5);

const heroOverlayRules = cssRules(heroCss, ".hero-overlay", "THEME-001");
const overlayAlphas = heroOverlayRules.flatMap((rule) => Array.from(rule.matchAll(/rgba\([^)]*,\s*(\d*\.?\d+)\)/g), (match) => Number(match[1])));
assert(overlayAlphas.length > 0, "THEME-001", "Hero overlay must declare RGBA transparency values");
assert(Math.max(...overlayAlphas) <= 0.78, "THEME-001", `Hero overlay is too dark: max alpha ${Math.max(...overlayAlphas)}`);
const heroVideoRule = cssRules(heroCss, ".hero-video", "THEME-001")[0];
const brightness = Number(heroVideoRule.match(/brightness\((\d*\.?\d+)\)/)?.[1] ?? 0);
assert(brightness >= 1, "THEME-001", `Hero video brightness must be at least 1.0, found ${brightness}`);
const lightSectionContracts = [[".about", "background:var(--paper)"], [".gallery-section", "background:var(--cream)"], [".visit-section", "background:var(--paper)"]];
for (const [selector, requiredBackground] of lightSectionContracts) {
  const rule = cssRules(heroCss, selector, "THEME-001")[0];
  assert(rule.includes(requiredBackground), "THEME-001", `${selector} must retain ${requiredBackground}`);
  assert(rule.includes("color:var(--ink)"), "THEME-001", `${selector} must retain dark readable text`);
}
dashboardContract("THEME-001", 5);

const expectedOrder = ["latte", "san-sebastian", "iced-latte", "nutella-croissant", "lotus-cheesecake"];
const sourceIds = Array.from(featuredSource.matchAll(/\bid:\s*"([^"]+)"/g), (match) => match[1]);
const sourceImages = Array.from(featuredSource.matchAll(/\bimage:\s*"([^"]+)"/g), (match) => match[1]);
const staticCards = Array.from(html.matchAll(/<a\b[^>]*class=["'][^"']*\bposter-card\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi));
assert(sourceIds.length === 5, "FEATURED-001", `Expected exactly 5 typed products, found ${sourceIds.length}`);
assert(JSON.stringify(sourceIds) === JSON.stringify(expectedOrder), "FEATURED-001", `Typed product order changed: ${sourceIds.join(", ")}`);
assert(sourceImages.length === 5, "FEATURED-001", `Expected 5 typed poster sources, found ${sourceImages.length}`);
assert(sourceImages.every((path) => /^src\/products\/(?:cards|gallery-v2)\/[\w.-]+\.(?:svg|avif)\?v=/.test(path)), "FEATURED-001", "Every typed item must use a versioned local image source");
assert(sourceImages.filter((path) => path.endsWith(".avif?v=20260625-5")).length === 1, "FEATURED-001", "Only the verified Iced Latte AVIF may be used");
assert(new Set(sourceImages).size === sourceImages.length, "FEATURED-001", "Typed poster sources must be unique");
assert(staticCards.length === 5, "FEATURED-001", `Static fallback must expose exactly 5 poster cards, found ${staticCards.length}`);
assert(!html.includes("featured-card--overview"), "FEATURED-001", "Cafe overview must not return to the product feed");
assert(html.includes('src="featured-gallery.js?v='), "FEATURED-001", "Typed gallery runtime is not loaded");
assert(html.includes('href="featured-gallery.css?v='), "FEATURED-001", "Typed gallery stylesheet is not loaded");
assert(!html.includes('src="featured-strip.js'), "FEATURED-001", "Legacy featured-strip runtime must stay disconnected");
assert(featuredCss.includes("grid-template-columns:minmax(0,1fr)!important"), "FEATURED-001", "Mobile feed must use one stable column");
assert(featuredCss.includes("aspect-ratio:1/1"), "FEATURED-001", "Poster frames must preserve a calm square canvas");
assert(featuredCss.includes("object-fit:contain!important"), "FEATURED-001", "Poster artwork must never be cropped");
assert(featuredCss.includes(".poster-card.is-error .poster-card-fallback"), "FEATURED-001", "Broken images must expose a visible fallback instead of a black card");
assert(featuredCss.includes("body.featured-gallery-active .mobile-cta"), "FEATURED-001", "The mobile dock must move away while posters are being viewed");
assert(featuredRuntime.includes("FEATURED_PRODUCTS.map"), "FEATURED-001", "Typed runtime must render from one product source");
assert(featuredRuntime.includes('card.classList.add("is-error")'), "FEATURED-001", "Typed runtime must handle image failures");
assert(featuredRuntime.includes("MutationObserver"), "FEATURED-001", "Typed runtime must keep localized accessibility labels in sync");
assert(featuredRuntime.includes("IntersectionObserver"), "FEATURED-001", "Typed runtime must use IntersectionObserver as its primary dock signal");
assert(featuredSource.includes('window.addEventListener("scroll"'), "FEATURED-001", "Typed runtime must include a passive scroll fallback for iOS momentum scrolling");
assert(featuredSource.includes("window.visualViewport?.addEventListener"), "FEATURED-001", "Typed runtime must react to iOS visual viewport changes");
assert(featuredSource.includes("window.requestAnimationFrame"), "FEATURED-001", "Scroll fallback must be animation-frame throttled");
assert(html.includes("script-src 'self';"), "FEATURED-001", "Gallery deployment must keep a strict external-script CSP");
assert(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*visualViewport/i.test(html), "FEATURED-001", "iOS gallery fallback must not be duplicated as inline JavaScript");

console.log("✅ MAP-001 gated: desktop map stays interactive and touch devices use a safe clickable fallback.");
console.log("✅ VIDEO-001 gated: hero playback has explicit mobile recovery.");
console.log("✅ THEME-001 gated: hero contrast and light-section palette remain balanced.");
console.log("✅ FEATURED-001 gated: the TypeScript gallery renders 5 complete images with iOS-safe dock handling, stable fallback height and no crop.");
