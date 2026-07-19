import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ACTIVE_HERO_FETCH,
  ACTIVE_HERO_PATH,
  MIN_FILE_BYTES,
  MAX_FILE_BYTES,
  MAX_DURATION_SECONDS,
  MAX_EDGE_PIXELS,
  MAX_PIXEL_AREA,
  attributeValue,
  decodeHtmlAttribute,
  extractSingleHeroVideoSource,
  fetchReference,
  fileReference,
  hasClassToken,
} from "./media-contract-config.mjs";

const indexHtml = readFileSync("index.html", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const mobileCss = readFileSync("mobile.css", "utf8");
const conversionCss = readFileSync("conversion.css", "utf8");
const finalQaCss = readFileSync("final-qa.css", "utf8");
const menuCss = readFileSync("menu.css", "utf8");
const qaRuntime = readFileSync("qa.js", "utf8");
const menuRuntime = readFileSync("menu-page.js", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));

function assert(condition, id, message) {
  if (!condition) throw new Error(`[${id}] ${message}`);
}

function gate(id) {
  const item = dashboard.contracts?.find((contract) => contract.id === id);
  assert(item, id, "Missing dashboard contract");
  assert(item.status === "gated", id, "Contract must remain gated");
  assert(item.severity === "P1", id, "Contract must remain P1");
  assert(item.owner === "QA" && item.evidence === "CI", id, "Owner/evidence metadata changed");
  assert(item.devices?.includes("mobile"), id, "Mobile coverage is required");
}

function heroVideoSource(html, id) {
  try {
    return extractSingleHeroVideoSource(html, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[${id}] ${message}`);
  }
}

function fileExists(reference, id) {
  const clean = fileReference(reference, `${id} file reference`);
  const root = process.cwd();
  const fullPath = path.resolve(root, clean);
  const relativePath = path.relative(root, fullPath);
  assert(
    relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath),
    id,
    `File reference must stay inside repository: ${clean}`,
  );
  const fileStat = statSync(fullPath, { throwIfNoEntry: false });
  assert(fileStat?.isFile() && fileStat.size > 0, id, `Missing or invalid file: ${clean}`);
}

function hrefs(html, prefix) {
  const pattern = new RegExp(`^${prefix}`, "i");
  return Array.from(html.matchAll(/<a\b[^>]*>/gi), (match) => attributeValue(match[0], "href"))
    .filter((value) => value !== null)
    .map(decodeHtmlAttribute)
    .filter((value) => pattern.test(value));
}

function cssRule(css, selector, id) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
  assert(match, id, `Missing CSS rule for ${selector}`);
  return match[1].replace(/\s+/g, "").toLowerCase();
}

// Shared-parser regressions: exact attribute identity and exact class tokens are mandatory.
assert(attributeValue('<video data-class="hero-video">', "class") === null, "ASSET-001", "data-class masqueraded as class");
assert(attributeValue('<source data-src="bad.mp4">', "src") === null, "ASSET-001", "data-src masqueraded as src");
assert(hasClassToken('<video class="not-hero-video">', "hero-video") === false, "ASSET-001", "Hyphenated class matched hero token");
assert(hasClassToken('<video class="hero-video--fallback">', "hero-video") === false, "ASSET-001", "Class suffix matched hero token");
const heroTokenFixture = [
  '<video data-class="hero-video"><source src="bad-data-class.mp4"></video>',
  '<video class="not-hero-video"><source src="bad-a.mp4"></video>',
  '<video class="hero-video--fallback"><source src="bad-b.mp4"></video>',
  '<video class="hero-video featured"><source data-src="bad-data-src.mp4"><source src="good.mp4?v=1"></video>',
].join("");
assert(heroVideoSource(heroTokenFixture, "ASSET-001") === "good.mp4?v=1", "ASSET-001", "Strict hero attribute parsing changed");
let spoofOnlySourceRejected = false;
try {
  extractSingleHeroVideoSource('<video class="hero-video"><source data-src="bad.mp4"></video>', "spoof fixture");
} catch {
  spoofOnlySourceRejected = true;
}
assert(spoofOnlySourceRejected, "ASSET-001", "A data-src-only hero source was accepted");

// MOBILE-001
for (const [name, html] of [["index.html", indexHtml], ["menu.html", menuHtml]]) {
  assert(html.includes("width=device-width") && html.includes("viewport-fit=cover"), "MOBILE-001", `${name} viewport contract changed`);
}
for (const breakpoint of [980, 680, 390]) {
  assert(mobileCss.includes(`@media(max-width:${breakpoint}px)`), "MOBILE-001", `Missing ${breakpoint}px breakpoint`);
}
assert(mobileCss.includes("min-height:100svh"), "MOBILE-001", "Hero viewport handling changed");
assert(conversionCss.includes("grid-template-columns:1fr 1fr"), "MOBILE-001", "Mobile CTA must keep two columns");
assert(conversionCss.includes("safe-area-inset-bottom"), "MOBILE-001", "Safe-area support changed");
assert(conversionCss.includes("body{padding-bottom:0}"), "MOBILE-001", "Obsolete body CTA clearance must remain removed");
assert(conversionCss.includes(".site-footer{padding-bottom:calc(98px + env(safe-area-inset-bottom))}"), "MOBILE-001", "Footer must reserve fixed CTA clearance");
assert(conversionCss.includes("min-height:48px") && conversionCss.includes("min-height:46px"), "MOBILE-001", "Mobile CTA targets are too small");
assert(menuCss.includes("overflow-x:auto"), "MOBILE-001", "Category chips must stay scrollable");
assert(menuCss.includes(".full-menu-grid{grid-template-columns:1fr}"), "MOBILE-001", "Menu must collapse to one column");
assert(menuCss.includes("grid-template-columns:minmax(0,1fr) auto"), "MOBILE-001", "Product/price columns changed");
const menuDocumentRule = cssRule(menuCss, "html", "MOBILE-001");
assert(menuDocumentRule.includes("background:var(--cream)"), "MOBILE-001", "Menu document background must match the page during overscroll");
for (const [selector, expectedBackground] of [
  [".menu-page .site-header", "background:var(--dark)"],
  [".menu-controls", "background:var(--cream)"],
]) {
  const rule = cssRule(menuCss, selector, "MOBILE-001");
  assert(rule.includes("position:sticky"), "MOBILE-001", `${selector} must remain sticky`);
  assert(rule.includes(expectedBackground), "MOBILE-001", `${selector} must use an opaque background`);
  assert(rule.includes("backdrop-filter:none"), "MOBILE-001", `${selector} must disable backdrop filtering`);
  assert(!rule.includes("blur("), "MOBILE-001", `${selector} must not blur content during scrolling`);
}
assert(menuCss.includes("@media(hover:none) and (pointer:coarse){"), "MOBILE-001", "Coarse-pointer raster safe mode is missing");
for (const contract of [
  ".menu-page .site-header,.menu-controls{position:static;top:auto;z-index:auto;box-shadow:none}",
  ".full-menu-grid{display:block}",
  ".full-menu-panel{box-shadow:none}",
  ".full-menu-panel+.full-menu-panel{margin-top:18px}",
]) {
  assert(menuCss.includes(contract), "MOBILE-001", `Raster safe-mode contract changed: ${contract}`);
}
const languageSwitcherRule = cssRule(menuCss, ".menu-page .language-switcher", "MOBILE-001");
for (const contract of ["width:max-content", "justify-self:end", "flex:00auto", "white-space:nowrap"]) {
  assert(languageSwitcherRule.includes(contract), "MOBILE-001", `Language switcher sizing changed: ${contract}`);
}
gate("MOBILE-001");

// CTA-001
const allHtml = `${indexHtml}\n${menuHtml}`;
const routeUrls = hrefs(allHtml, "https://www\\.google\\.com/maps/dir/\\?api=1&destination=");
assert(routeUrls.length >= 4, "CTA-001", `Expected route CTAs, found ${routeUrls.length}`);
assert(new Set(routeUrls).size === 1, "CTA-001", "Route destinations differ");
assert(routeUrls[0].includes("Roby%27s+Coffee+House+Gazipasa"), "CTA-001", "Wrong route destination");
assert(routeUrls.every((url) => url.endsWith("&travelmode=driving")), "CTA-001", "Route CTAs must open driving navigation");
const instagramUrls = hrefs(allHtml, "https://www\\.instagram\\.com/");
const instagramProfile = "https://www.instagram.com/robyscoffeehouse/";
const approvedReelUrl = "https://www.instagram.com/reel/C0qYxxmIY9t/";
const instagramProfileUrls = instagramUrls.filter((url) => url === instagramProfile);
const instagramReelUrls = instagramUrls.filter((url) => url.startsWith("https://www.instagram.com/reel/"));
assert(instagramProfileUrls.length >= 3, "CTA-001", `Expected Instagram profile CTAs, found ${instagramProfileUrls.length}`);
assert(instagramReelUrls.length === 1 && instagramReelUrls[0] === approvedReelUrl, "CTA-001", "Expected exactly one approved Instagram Reel CTA");
assert(instagramUrls.every((url) => url === instagramProfile || url === approvedReelUrl), "CTA-001", "Wrong Instagram destination");
for (const tag of Array.from(allHtml.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi), (match) => match[0])) {
  const relTokens = (attributeValue(tag, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  assert(relTokens.includes("noopener") && relTokens.includes("noreferrer"), "CTA-001", "Unsafe external link");
}
assert(indexHtml.includes("Pazarcı, Uğur Mumcu Cd.") && indexHtml.includes("Gazipaşa / Antalya"), "CTA-001", "Address changed");
assert((indexHtml.match(/09:00 — 00:00/g) ?? []).length >= 2, "CTA-001", "Opening hours disappeared");
assert(menuHtml.includes('data-menu-copy="route"'), "CTA-001", "Localized route CTA disappeared");
gate("CTA-001");

// A11Y-001
assert(indexHtml.includes('<html lang="tr">') && menuHtml.includes('<html lang="tr">'), "A11Y-001", "Page language is missing");
assert(indexHtml.includes('class="skip-link" href="#main"') && indexHtml.includes('id="main"'), "A11Y-001", "Landing skip link broke");
assert(menuHtml.includes('class="skip-link" href="#menu-root"') && menuHtml.includes('id="menu-root"'), "A11Y-001", "Menu skip link broke");
for (const html of [indexHtml, menuHtml]) {
  for (const button of Array.from(html.matchAll(/<button\b[^>]*>/gi), (match) => match[0])) {
    assert(attributeValue(button, "type") === "button", "A11Y-001", "Button without type=button");
  }
}
assert(indexHtml.includes('aria-controls="main-navigation"') && indexHtml.includes('aria-expanded="false"'), "A11Y-001", "Menu toggle state changed");
assert(menuHtml.includes('for="menu-search"') && menuHtml.includes('aria-live="polite"'), "A11Y-001", "Search semantics changed");
assert(/class=["'][^"']*map-live-frame[^"']*["'][^>]*title=["'][^"']+/i.test(indexHtml), "A11Y-001", "Map title disappeared");
const heroOpeningTags = Array.from(indexHtml.matchAll(/<video\b[^>]*>/gi), (match) => match[0]).filter((tag) => hasClassToken(tag, "hero-video"));
assert(heroOpeningTags.length === 1 && attributeValue(heroOpeningTags[0], "aria-hidden") === "true", "A11Y-001", "Hero accessibility changed");
assert(finalQaCss.includes(":focus-visible"), "A11Y-001", "Focus styling disappeared");
assert(menuCss.includes(".visually-hidden{"), "A11Y-001", "Visually-hidden utility disappeared");
assert(qaRuntime.includes('event.key !== "Tab"') && qaRuntime.includes('setAttribute("inert", "")'), "A11Y-001", "Lightbox focus protection changed");
assert(menuRuntime.includes("aria-pressed"), "A11Y-001", "Dynamic pressed state disappeared");
gate("A11Y-001");

// ASSET-001
const activeHeroSource = heroVideoSource(indexHtml, "ASSET-001");
const activeHeroFetch = fetchReference(activeHeroSource, "index.html hero source");
const activeHeroPath = fileReference(activeHeroSource, "index.html hero source");
assert(activeHeroFetch === ACTIVE_HERO_FETCH, "ASSET-001", "Shared active hero fetch reference drifted");
assert(activeHeroPath === ACTIVE_HERO_PATH, "ASSET-001", `Unexpected active hero video: ${activeHeroPath || "missing"}`);
const criticalFiles = [
  "icon.svg",
  "styles.css",
  "mobile.css",
  "conversion.css",
  "final-qa.css",
  "gallery-clean.css",
  "map-live.css",
  "menu-preview.css",
  "menu.css",
  "app.js",
  "conversion.js",
  "analytics.js",
  "qa.js",
  "menu-page.js",
  "menu-data.js",
  "menu-search-clear.js",
  "hero-balance.css",
  "src/robys-hero-poster.jpg",
  activeHeroPath,
  "src/menu-icons/hot.svg",
  "src/menu-icons/cold.svg",
  "src/menu-icons/tea.svg",
  "src/menu-icons/refreshers.svg",
  "src/menu-icons/dessert.svg",
  "src/menu-icons/food.svg",
];
criticalFiles.forEach((file) => fileExists(file, "ASSET-001"));
const iconMappings = Array.from(finalQaCss.matchAll(/background-image:url\(["'](src\/menu-icons\/[^"']+)["']\)/gi), (match) => match[1]);
assert(iconMappings.length === 6 && new Set(iconMappings).size === 6, "ASSET-001", "Menu icon mapping changed");
assert(qaRuntime.includes('FALLBACK_IMAGE = "src/robys-hero-poster.jpg"'), "ASSET-001", "Fallback image changed");
const runtimeHeroSource = qaRuntime.match(/\bHERO_VIDEO\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
assert(runtimeHeroSource, "ASSET-001", "HERO_VIDEO is missing from qa.js");
const runtimeHeroFetch = fetchReference(runtimeHeroSource, "qa.js HERO_VIDEO");
const runtimeHeroPath = fileReference(runtimeHeroSource, "qa.js HERO_VIDEO");
assert(runtimeHeroFetch === activeHeroFetch, "ASSET-001", `Hero fetch URL drift: index.html=${activeHeroFetch}, qa.js=${runtimeHeroFetch}`);
assert(runtimeHeroPath === activeHeroPath, "ASSET-001", `Hero runtime and HTML source differ: ${runtimeHeroPath || "missing"}`);
assert(MIN_FILE_BYTES === 20_000 && MAX_FILE_BYTES === 256_000, "ASSET-001", "Hero byte budgets changed");
assert(MAX_DURATION_SECONDS === 8, "ASSET-001", "Hero duration budget changed");
assert(MAX_EDGE_PIXELS === 1280 && MAX_PIXEL_AREA === 1280 * 720, "ASSET-001", "Hero resolution budget changed");
assert(packageJson.scripts?.["verify:media"] === "node scripts/verify-media.mjs", "ASSET-001", "verify:media wiring changed");
const overrideProbe = spawnSync(process.execPath, ["scripts/verify-media.mjs", "src/not-the-active-hero.mp4"], {
  encoding: "utf8",
  timeout: 10_000,
  killSignal: "SIGKILL",
});
assert(overrideProbe.status !== 0 && overrideProbe.stderr.includes("Hero override must target the active hero video"), "ASSET-001", "Non-active media override was not rejected");
gate("ASSET-001");

console.log("✅ MOBILE-001, CTA-001, A11Y-001 and ASSET-001 passed.");
