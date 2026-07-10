import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const indexHtml = readFileSync("index.html", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const mobileCss = readFileSync("mobile.css", "utf8");
const conversionCss = readFileSync("conversion.css", "utf8");
const finalQaCss = readFileSync("final-qa.css", "utf8");
const menuCss = readFileSync("menu.css", "utf8");
const qaRuntime = readFileSync("qa.js", "utf8");
const menuRuntime = readFileSync("menu-page.js", "utf8");
const mediaVerifier = readFileSync("scripts/verify-media.mjs", "utf8");
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

function fileExists(reference, id) {
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  const fullPath = path.resolve(process.cwd(), clean);
  assert(existsSync(fullPath), id, `Missing file: ${clean}`);
  assert(statSync(fullPath).isFile() && statSync(fullPath).size > 0, id, `Invalid file: ${clean}`);
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&");
}

function referencePath(value) {
  return decodeURIComponent(decodeHtmlAttribute(value).split(/[?#]/)[0]);
}

function hrefs(html, prefix) {
  return Array.from(html.matchAll(new RegExp(`href=["'](${prefix}[^"']+)["']`, "gi")), (match) => decodeHtmlAttribute(match[1]));
}

function cssRule(css, selector, id) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
  assert(match, id, `Missing CSS rule for ${selector}`);
  return match[1].replace(/\s+/g, "").toLowerCase();
}

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
  [".menu-controls", "background:var(--cream)"]
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
  ".full-menu-panel+.full-menu-panel{margin-top:18px}"
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
const routeUrls = hrefs(allHtml, "https://www\\.google\\.com/maps/dir/\\?api=1&(?:amp;)?destination=");
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
  assert(/rel=["'][^"']*noopener[^"']*noreferrer[^"']*["']/i.test(tag), "CTA-001", "Unsafe external link");
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
    assert(/type=["']button["']/i.test(button), "A11Y-001", "Button without type=button");
  }
}
assert(indexHtml.includes('aria-controls="main-navigation"') && indexHtml.includes('aria-expanded="false"'), "A11Y-001", "Menu toggle state changed");
assert(menuHtml.includes('for="menu-search"') && menuHtml.includes('aria-live="polite"'), "A11Y-001", "Search semantics changed");
assert(/class=["'][^"']*map-live-frame[^"']*["'][^>]*title=["'][^"']+/i.test(indexHtml), "A11Y-001", "Map title disappeared");
assert(indexHtml.includes('class="hero-video"') && indexHtml.includes('aria-hidden="true"'), "A11Y-001", "Hero accessibility changed");
assert(finalQaCss.includes(":focus-visible"), "A11Y-001", "Focus styling disappeared");
assert(menuCss.includes(".visually-hidden{"), "A11Y-001", "Visually-hidden utility disappeared");
assert(qaRuntime.includes('event.key !== "Tab"') && qaRuntime.includes('setAttribute("inert", "")'), "A11Y-001", "Lightbox focus protection changed");
assert(menuRuntime.includes('aria-pressed'), "A11Y-001", "Dynamic pressed state disappeared");
gate("A11Y-001");

// ASSET-001
const activeHeroSource = indexHtml.match(/<video\b[^>]*\bclass=["'][^"']*\bhero-video\b[^"']*["'][^>]*>[\s\S]*?<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
const activeHeroPath = referencePath(activeHeroSource);
assert(activeHeroPath === "src/robys-ambience-clean.mp4", "ASSET-001", `Unexpected active hero video: ${activeHeroPath || "missing"}`);
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
  "src/menu-icons/food.svg"
];
criticalFiles.forEach((file) => fileExists(file, "ASSET-001"));
const iconMappings = Array.from(finalQaCss.matchAll(/background-image:url\(["'](src\/menu-icons\/[^"']+)["']\)/gi), (match) => match[1]);
assert(iconMappings.length === 6 && new Set(iconMappings).size === 6, "ASSET-001", "Menu icon mapping changed");
assert(qaRuntime.includes('FALLBACK_IMAGE = "src/robys-hero-poster.jpg"'), "ASSET-001", "Fallback image changed");
const runtimeHeroSource = qaRuntime.match(/\bHERO_VIDEO\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
const runtimeHeroPath = referencePath(runtimeHeroSource);
assert(runtimeHeroPath === activeHeroPath, "ASSET-001", `Hero runtime and HTML source differ: ${runtimeHeroPath || "missing"}`);
assert(mediaVerifier.includes("ACTIVE_HERO_VIDEO") && mediaVerifier.includes("MAX_FILE_BYTES=1024*1024"), "ASSET-001", "Active hero video byte budget changed");
assert(mediaVerifier.includes("MAX_DURATION_SECONDS=8") && mediaVerifier.includes("MAX_PIXEL_AREA=1280*720"), "ASSET-001", "Hero duration or resolution budget changed");
assert(mediaVerifier.includes("ffprobe") && mediaVerifier.includes("codec_name!=='h264'"), "ASSET-001", "Video verification changed");
assert(packageJson.scripts?.["verify:media"] === "node scripts/verify-media.mjs", "ASSET-001", "verify:media wiring changed");
gate("ASSET-001");

console.log("✅ MOBILE-001, CTA-001, A11Y-001 and ASSET-001 passed.");
