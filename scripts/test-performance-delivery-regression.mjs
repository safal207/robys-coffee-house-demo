import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the first feed photo uses a single, entry-specific hint without speculative HTML downloads", () => {
  const html = read("menu-feed.html");
  const source = read("src/menu-feed.js");
  const shipped = read("menu-feed.js");
  assert.doesNotMatch(html, /<link\b[^>]*rel="preload"[^>]*as="image"/i,
    "Static hints would also download the wrong product for deep links and empty searches");
  assert.ok(source.includes("const initialLead = productIndex.get(entry.productId) ?? filterFeed(products, entry.category, searchInput.value)[0]"));
  assert.ok(source.includes("if (initialLead)"));
  assert.ok(source.includes('hint.imageSrcset = `${compact} 512w, ${initialLead.image} 1024w`'));
  assert.ok(source.includes('hint.href = initialLead.image; document.head.append(hint)'));
  assert.ok(shipped.includes('imageSrcset'), "The shipped feed must retain the responsive runtime hint");
});

test("hero remains eager while interaction-only QA enhancements load from a versioned module", () => {
  const main = read("qa.js");
  const source = read("src/qa.js");
  const enhancements = read("qa-enhancements.js");
  const revision = createHash("sha256").update(enhancements).digest("hex").slice(0, 12);
  assert.ok(source.includes("function enableHeroVideo()"));
  assert.ok(source.includes('doc.querySelectorAll(".brand")'), "Immediate brand labels must be corrected");
  assert.ok(source.includes("const doc = document"), "The authored QA must preserve the live document reference");
  assert.ok(source.includes('const events = ["pointerover", "pointerdown", "keydown", "focusin"]'));
  assert.equal((source.match(/for \(const type of events\)/g) ?? []).length, 2,
    "Lazy activation and cleanup must cover the same pointer and keyboard events");
  assert.ok(source.includes('passive: type[0] === "p"'), "Only pointer events should be passive");
  assert.ok(main.includes("src/robys-ambience-clean.mp4"));
  const expected = transformSync(source.replace(
    /(import\("\.\/qa-enhancements\.js)(?:\?v=[^"]*)?("\))/, `$1?v=${revision}$2`),
    { minify: true, charset: "utf8", target: "es2020", legalComments: "none" }).code;
  assert.equal(main, expected, "Shipped QA must be the deterministic minified authored source");
  assert.ok(main.includes(`import("./qa-enhancements.js?v=${revision}")`));
  assert.ok(!main.includes("function setupLightboxAccessibility()"));
  assert.ok(!main.includes("function setupImageFallbacks()"));
  assert.ok(enhancements.includes("export function initQaEnhancements()"));
  assert.ok(enhancements.includes("function setupLightboxAccessibility()"));
  assert.ok(enhancements.includes('setInert(node.classList.contains("is-open"));'), "Already-open dialogs must receive focus protection after lazy activation");
  assert.ok(enhancements.includes("function setupImageFallbacks()"));
  assert.ok(read("sw-core-v64.js").includes(`"./qa-enhancements.js?v=${revision}"`));
});

test("featured pairing artwork remains eager while its detailed story is an on-demand, versioned chunk", () => {
  const html = read("menu.html");
  const source = read("src/pairing-posters.js");
  const runtime = read("pairing-posters.js");
  const detail = read("src/pairing-discovery.js");
  const chunk = read("pairing-discovery.js");
  const revision = createHash("sha256").update(chunk).digest("hex").slice(0, 12);
  assert.ok(source.includes("function enhancePairingCards()"));
  assert.ok(source.includes("const lang = document.documentElement.lang;"), "Pairing cards must not call an undefined global language helper");
  assert.ok(source.includes("currentLanguage: () => document.documentElement.lang"), "Lazy discovery must receive a defined language reader");
  assert.ok(source.includes("pairing-poster-overlay"));
  assert.ok(source.includes('menuRoot.addEventListener("pointerover", warmOnIntent'));
  assert.ok(source.includes('menuRoot.addEventListener("focusin", warmOnIntent'));
  assert.ok(source.includes('trigger.setAttribute("aria-busy", "true")'));
  assert.ok(source.includes('trigger.dataset.inlineChoiceBypass = "true"'), "Story load failure must preserve ordering");
  assert.ok(source.includes('import("./pairing-discovery.js")'), "Story import must occur on demand");
  assert.ok(runtime.includes(`import("./pairing-discovery.js?v=${revision}")`), "The loaded chunk must be cache versioned");
  assert.ok(detail.includes("export function renderExperience"));
  assert.ok(detail.includes("pairing-discovery-panel"));
  assert.ok(chunk.includes("pairing-discovery-panel"));
  assert.ok(!runtime.includes("pairing-discovery-panel"), "Detailed story must not increase first-load JS");
  assert.ok(!html.includes('src="pairing-discovery.js'), "The detailed story must not be an eager module");
  assert.ok(read("sw-core-v64.js").includes(`"./pairing-discovery.js?v=${revision}"`));
});

test("personal feed styles share the preloaded feed stylesheet without a second render blocker", () => {
  const html = read("menu-feed.html");
  const feed = read("menu-feed.css");
  const personal = read("my-feed.css");
  assert.ok(feed.endsWith(personal), "Preserve the exact trailing personal-feed cascade");
  assert.ok(!html.includes('href="my-feed.css'), "No second blocking stylesheet request");
  assert.ok(html.includes('href="menu-feed.css?v='), "Combined feed stylesheet stays linked");
});

test("default menu heading is not repainted when its localized text is already correct", () => {
  const html = read("menu.html");
  const source = read("src/menu-app.js");
  assert.match(html, /<h1 data-menu-copy="pageTitle">Tam Menü<\/h1>/);
  assert.ok(source.includes('if (copy[key] && element.textContent !== copy[key]) element.textContent = copy[key];'));
});

test("home first-paint styles stay enabled until a measured safe alternative exists", () => {
  const home = read("index.html"), source = read("src/qa.js");
  for (const name of ["gallery-clean.css", "map-live.css", "menu-preview.css", "featured-strip.css", "social-offer.css", "community-reel-v2.css"]) {
    const tag = home.match(new RegExp('<link rel="stylesheet" href="' + name.replaceAll(".", "\\.") + '\\?v=[^"]+"[^>]*>'))?.[0];
    assert.ok(tag, name);
    assert.doesNotMatch(tag, /media="print"|data-deferred-style=/, name);
  }
  assert.doesNotMatch(source, /activateDeferredHomeStyles/);
});

test("list CSS wins first paint, while the feed discovers its photo runtime early", () => {
  const list = read("menu.html"), feed = read("menu-feed.html");
  assert.ok(list.indexOf('href="menu-runtime.css?v=') < list.indexOf('<link rel="modulepreload"'),
    "The list's critical CSS must win over speculative JS");
  assert.ok(feed.indexOf('href="menu-feed.js?v=') < feed.indexOf('href="menu-runtime.css?v='),
    "The feed must discover its first-photo runtime before the CSS waterfall");
  assert.ok(feed.indexOf('<script type="module" src="menu-feed.js?v=') < feed.indexOf('href="menu-runtime.css?v='),
    "The photo runtime must be deferred but discovered before feed CSS");
  assert.ok(feed.indexOf('href="menu-runtime.css?v=') < feed.indexOf('href="menu-feed.css?v='),
    "Never reorder the reviewed photo-feed CSS cascade");
  const home = read("index.html");
  assert.ok(home.indexOf('href="combo-entry.css?v=') < home.indexOf('href="styles-v2.css?v='), "Preserve the authored home cascade");
  assert.ok(home.indexOf('href="styles-v2.css?v=') < home.indexOf('<link rel="preload" href="src/robys-hero-poster.jpg"'), "Load render-critical CSS before speculative hero artwork");
});
