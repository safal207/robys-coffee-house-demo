import { readFileSync } from "node:fs";

const appBundle = readFileSync("app.js", "utf8");
const galleryBundle = readFileSync("featured-gallery.js", "utf8");
const html = readFileSync("index.html", "utf8");

function verifyClassicDeferredBundle(fileName, bundle) {
  if (!bundle.trim()) throw new Error(`${fileName} is empty`);
  if (/^\s*(?:import|export)\s/m.test(bundle)) {
    throw new Error(`${fileName} contains ESM import/export syntax but is loaded as a classic script`);
  }

  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const script = html.match(new RegExp(`<script\\b[^>]*\\bsrc=["']${escaped}(?:\\?[^"']*)?["'][^>]*><\\/script>`, "i"))?.[0];
  if (!script) throw new Error(`index.html does not load ${fileName}`);
  if (/\btype=["']module["']/i.test(script)) throw new Error(`${fileName} must not be loaded as type=module`);
  if (!/\bdefer(?:\s|>|=)/i.test(script)) throw new Error(`${fileName} must use defer`);
}

verifyClassicDeferredBundle("app.js", appBundle);
verifyClassicDeferredBundle("featured-gallery.js", galleryBundle);

const forbiddenLegacyMarkup = [
  '<section id="experience"',
  '<section class="story-section"',
  '<section id="my-robys"',
  '<nav class="mobile-dock"',
  '<dialog id="coffee-matcher"'
];

for (const marker of forbiddenLegacyMarkup) {
  if (appBundle.includes(marker)) {
    throw new Error(`app.js recreates forbidden legacy markup: ${marker}`);
  }
}

if (!galleryBundle.includes("FEATURED_PRODUCTS")) {
  throw new Error("featured-gallery.js does not contain the typed product source");
}

if (!galleryBundle.includes("IntersectionObserver") || !galleryBundle.includes("visualViewport")) {
  throw new Error("featured-gallery.js is missing the iOS-safe dock observers");
}

console.log("Verified: app.js and featured-gallery.js are classic deferred bundles with no live ESM imports or legacy gallery injection.");
