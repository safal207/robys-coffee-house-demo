import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
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

function assert(condition, contract, message) {
  if (!condition) throw new Error(`[${contract}] ${message}`);
}

function contractById(id) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  assert(contract, id, `${id} is missing from qa/regression-dashboard.json`);
  assert(contract.status === "gated", id, `${id} must remain gated`);
  assert(contract.severity === "P1", id, `${id} must remain P1`);
  assert(contract.businessImpact, id, `${id} must declare businessImpact`);
  assert(contract.owner === "QA", id, `${id} owner must remain QA`);
  assert(contract.evidence === "CI", id, `${id} evidence must remain CI`);
  assert(Array.isArray(contract.devices) && contract.devices.includes("mobile"), id, `${id} must cover mobile`);
  return contract;
}

function htmlIds(html) {
  return new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/gi), (match) => match[1]));
}

function tagAttributes(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/([:\w-]+)(?:\s*=\s*(["'])(.*?)\2)?/gs)) {
    attributes.set(match[1].toLowerCase(), match[3] ?? "");
  }
  return attributes;
}

function tags(html, name) {
  return Array.from(html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi")), (match) => match[0]);
}

function localPath(reference) {
  if (!reference || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/|#)/i.test(reference)) return null;
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  return clean ? path.normalize(clean) : null;
}

function assertExistingFile(file, contract, context) {
  const absolute = path.resolve(ROOT, file);
  assert(absolute.startsWith(`${ROOT}${path.sep}`) || absolute === ROOT, contract, `${context} escapes repository: ${file}`);
  assert(existsSync(absolute), contract, `${context} is missing: ${file}`);
  assert(statSync(absolute).isFile(), contract, `${context} is not a file: ${file}`);
  assert(statSync(absolute).size > 0, contract, `${context} is empty: ${file}`);
}

function cssRule(css, selector, contract) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
  assert(match, contract, `Missing CSS rule for ${selector}`);
  return match[1].replace(/\s+/g, "").toLowerCase();
}

function maxWidthBreakpoints(css) {
  return Array.from(css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/gi), (match) => Number(match[1]));
}

// MOBILE-001 — layouts must retain their phone-safe contracts.
for (const [file, html] of [["index.html", indexHtml], ["menu.html", menuHtml]]) {
  assert(/<meta\b[^>]*name=["']viewport["'][^>]*content=["'][^"']*width=device-width[^"']*viewport-fit=cover[^"']*["']/i.test(html), "MOBILE-001", `${file} must keep width=device-width and viewport-fit=cover`);
}

const mainBreakpoints = maxWidthBreakpoints(mobileCss);
for (const expected of [980, 680, 390]) {
  assert(mainBreakpoints.includes(expected), "MOBILE-001", `mobile.css must keep the ${expected}px breakpoint`);
}
assert(mobileCss.includes("width:calc(100% - 24px)"), "MOBILE-001", "Phone container must keep horizontal breathing room");
assert(mobileCss.includes("min-height:100svh"), "MOBILE-001", "Hero must keep small-viewport height handling");
assert(conversionCss.includes("section[id]{scroll-margin-top:96px}"), "MOBILE-001", "Sticky header anchor offset must remain protected");

const mobileCtaRule = cssRule(conversionCss, ".mobile-cta", "MOBILE-001");
assert(mobileCtaRule.includes("position:fixed"), "MOBILE-001", "Mobile CTA must stay fixed");
assert(mobileCtaRule.includes("grid-template-columns:1fr1fr"), "MOBILE-001", "Mobile CTA must keep exactly two equal columns");
assert(mobileCtaRule.includes("env(safe-area-inset-bottom)"), "MOBILE-001", "Mobile CTA must respect the bottom safe area");
assert(conversionCss.includes("body{padding-bottom:calc(70px + env(safe-area-inset-bottom))}"), "MOBILE-001", "Page must reserve space for the fixed mobile CTA");

const mobileTargetHeights = Array.from(conversionCss.matchAll(/\.mobile-cta a,\.mobile-cta button\{[^}]*min-height:(\d+)px/gi), (match) => Number(match[1]));
assert(mobileTargetHeights.length > 0 && Math.min(...mobileTargetHeights) >= 46, "MOBILE-001", "Mobile CTA targets must remain at least 46px tall");
assert(menuCss.includes(".menu-category-nav{display:flex;gap:8px;overflow-x:auto"), "MOBILE-001", "Menu category chips must remain horizontally scrollable");
assert(menuCss.includes("@media(max-width:900px)") && menuCss.includes(".full-menu-grid{grid-template-columns:1fr}"), "MOBILE-001", "Full menu must collapse to one column on narrow screens");
assert(menuCss.includes(".full-menu-item{grid-template-columns:minmax(0,1fr) auto"), "MOBILE-001", "Mobile menu rows must preserve product/price columns");
contractById("MOBILE-001");

// CTA-001 — conversion links and business destinations must stay consistent.
const allHtml = `${indexHtml}\n${menuHtml}`;
const externalAnchorTags = [...tags(indexHtml, "a"), ...tags(menuHtml, "a")]
  .map((tag) => ({ tag, attrs: tagAttributes(tag) }))
  .filter(({ attrs }) => attrs.get("target") === "_blank");

for (const { tag, attrs } of externalAnchorTags) {
  const rel = new Set((attrs.get("rel") ?? "").split(/\s+/).filter(Boolean));
  assert(rel.has("noopener") && rel.has("noreferrer"), "CTA-001", `External link must include noopener noreferrer: ${tag}`);
}

const routeUrls = Array.from(allHtml.matchAll(/href=["'](https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^"']+)["']/gi), (match) => match[1]);
assert(routeUrls.length >= 4, "CTA-001", `Expected at least four route CTAs, found ${routeUrls.length}`);
assert(new Set(routeUrls).size === 1, "CTA-001", "All route CTAs must use the same destination");
assert(routeUrls[0].includes("Roby%27s+Coffee+House+Gazipasa"), "CTA-001", "Route CTA must target Roby's Coffee House Gazipaşa");

const instagramUrls = Array.from(allHtml.matchAll(/href=["'](https:\/\/www\.instagram\.com\/[^"']+)["']/gi), (match) => match[1]);
assert(instagramUrls.length >= 3, "CTA-001", `Expected at least three Instagram CTAs, found ${instagramUrls.length}`);
assert(instagramUrls.every((url) => url === "https://www.instagram.com/robyscoffeehouse/"), "CTA-001", "Every Instagram CTA must target @robyscoffeehouse");

assert(indexHtml.includes("Pazarcı, Uğur Mumcu Cd."), "CTA-001", "Visible street address must remain on the landing");
assert(indexHtml.includes("Gazipaşa / Antalya"), "CTA-001", "Visible city address must remain on the landing");
assert((indexHtml.match(/09:00 — 00:00/g) ?? []).length >= 2, "CTA-001", "Opening hours must remain visible in key landing sections");
assert(menuHtml.includes('data-menu-copy="route"'), "CTA-001", "Full menu must keep its localized route CTA");
contractById("CTA-001");

// A11Y-001 — keyboard, labels and semantic state must remain available.
for (const [file, html] of [["index.html", indexHtml], ["menu.html", menuHtml]]) {
  const lang = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1];
  assert(lang, "A11Y-001", `${file} must declare an html lang attribute`);

  const ids = htmlIds(html);
  const skipHref = html.match(/<a\b[^>]*\bclass=["'][^"']*\bskip-link\b[^"']*["'][^>]*\bhref=["']#([^"']+)["']/i)?.[1];
  assert(skipHref && ids.has(skipHref), "A11Y-001", `${file} skip link must target an existing id`);

  for (const buttonTag of tags(html, "button")) {
    const attrs = tagAttributes(buttonTag);
    assert(attrs.get("type") === "button", "A11Y-001", `${file} buttons must explicitly use type=button: ${buttonTag}`);
  }

  for (const imageTag of tags(html, "img")) {
    const attrs = tagAttributes(imageTag);
    assert(attrs.has("alt"), "A11Y-001", `${file} image is missing alt: ${imageTag}`);
  }
}

const navId = indexHtml.match(/<nav\b[^>]*\bid=["']([^"']+)["']/i)?.[1];
const menuToggle = tags(indexHtml, "button").find((tag) => /\bclass=["'][^"']*\bmenu-toggle\b/i.test(tag));
assert(menuToggle, "A11Y-001", "Mobile menu toggle is missing");
const toggleAttrs = tagAttributes(menuToggle);
assert(toggleAttrs.get("aria-controls") === navId, "A11Y-001", "Menu toggle aria-controls must target the main navigation");
assert(toggleAttrs.get("aria-expanded") === "false", "A11Y-001", "Menu toggle must have a deterministic collapsed state");

assert(/<label\b[^>]*for=["']menu-search["']/i.test(menuHtml), "A11Y-001", "Menu search must keep its explicit label");
assert(/<input\b[^>]*id=["']menu-search["'][^>]*type=["']search["']/i.test(menuHtml), "A11Y-001", "Menu search input semantics are missing");
assert(/id=["']menu-root["'][^>]*aria-live=["']polite["']/i.test(menuHtml), "A11Y-001", "Dynamic menu results must remain polite live content");
assert(/<iframe\b[^>]*class=["'][^"']*map-live-frame[^"']*["'][^>]*title=["'][^"']+["']/i.test(indexHtml), "A11Y-001", "Map iframe must keep a descriptive title");
assert(/<video\b[^>]*class=["'][^"']*hero-video[^"']*["'][^>]*aria-hidden=["']true["']/i.test(indexHtml), "A11Y-001", "Decorative hero video must remain hidden from assistive technology");
assert(finalQaCss.includes('a:focus-visible,button:focus-visible,[role="button"]:focus-visible'), "A11Y-001", "Global focus-visible styling must remain present");
assert(menuCss.includes(".visually-hidden{"), "A11Y-001", "Screen-reader-only utility must remain present");
assert(qaRuntime.includes('event.key !== "Tab"') && qaRuntime.includes('setAttribute("inert", "")'), "A11Y-001", "Lightbox focus trap and inert background must remain protected");
assert(menuRuntime.includes('button.setAttribute("aria-pressed", String(active))'), "A11Y-001", "Menu category state must remain exposed through aria-pressed");
contractById("A11Y-001");

// ASSET-001 — every local runtime reference must resolve to a non-empty file.
const htmlReferences = [];
for (const [file, html] of [["index.html", indexHtml], ["menu.html", menuHtml]]) {
  for (const attribute of ["href", "src", "poster"]) {
    for (const match of html.matchAll(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "gi"))) {
      const resolved = localPath(match[1]);
      if (resolved) htmlReferences.push({ file: resolved, context: `${file} ${attribute}` });
    }
  }
}

for (const reference of htmlReferences) {
  assertExistingFile(reference.file, "ASSET-001", reference.context);
}

const rootCssFiles = readdirSync(ROOT).filter((file) => file.endsWith(".css"));
for (const cssFile of rootCssFiles) {
  const css = readFileSync(cssFile, "utf8");
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const resolved = localPath(match[1]);
    if (resolved) assertExistingFile(resolved, "ASSET-001", `${cssFile} url()`);
  }
}

const criticalAssets = [
  "icon.svg",
  "src/robys-hero-poster.jpg",
  "src/robys-hero-mobile-lite.mp4",
  "src/menu-icons/hot.svg",
  "src/menu-icons/cold.svg",
  "src/menu-icons/tea.svg",
  "src/menu-icons/refreshers.svg",
  "src/menu-icons/dessert.svg",
  "src/menu-icons/food.svg"
];
for (const asset of criticalAssets) assertExistingFile(asset, "ASSET-001", "Critical asset");

const iconMappings = Array.from(finalQaCss.matchAll(/background-image:url\(["'](src\/menu-icons\/[^"']+)["']\)/gi), (match) => match[1]);
assert(iconMappings.length === 6, "ASSET-001", `Expected six menu icon mappings, found ${iconMappings.length}`);
assert(new Set(iconMappings).size === 6, "ASSET-001", "Menu icon mappings must be unique");
assert(qaRuntime.includes('FALLBACK_IMAGE = "src/robys-hero-poster.jpg"'), "ASSET-001", "Image fallback must remain connected to the poster asset");
assert(qaRuntime.includes('HERO_VIDEO = "src/robys-hero-mobile-lite.mp4'), "ASSET-001", "Hero runtime must reference the canonical MP4");
assert(mediaVerifier.includes("ffprobe") && mediaVerifier.includes("codec_name!=='h264'"), "ASSET-001", "Canonical video codec verification must remain active");
assert(packageJson.scripts?.["verify:media"] === "node scripts/verify-media.mjs", "ASSET-001", "verify:media must remain wired in package.json");
contractById("ASSET-001");

console.log("✅ MOBILE-001 gated: responsive layout and safe-area contracts are intact.");
console.log("✅ CTA-001 gated: destinations, address and opening-hour contracts are intact.");
console.log("✅ A11Y-001 gated: labels, keyboard states and focus protection are intact.");
console.log("✅ ASSET-001 gated: local assets and media verification are intact.");
