import { readFileSync } from "node:fs";
import { menuCategories } from "../menu-catalog.js";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("social-offer.css", "utf8");
const source = readFileSync("src/social-offer.ts", "utf8");
const runtime = readFileSync("social-offer.js", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[SOCIAL-OFFER-001] ${message}`);
}

const roots = html.match(/<aside\b[^>]*\bid=["']daily-offer["'][^>]*>/gi) ?? [];
assert(roots.length === 1, `Expected exactly one #daily-offer root, found ${roots.length}`);
assert(roots[0].includes("hidden"), "The offer root must stay hidden until the typed runtime renders it");
assert(html.includes('href="social-offer.css?v='), "index.html must load the social-offer stylesheet");
assert(html.includes('src="social-offer.js?v='), "index.html must load the generated social-offer runtime");
assert(html.indexOf('id="daily-offer"') > html.indexOf('id="visit"'), "The offer must follow the visit/map section");
assert(html.indexOf('id="daily-offer"') < html.indexOf('class="site-footer"'), "The offer must remain above the footer");

for (const marker of [
  'id: "lotus-latte-340"',
  'currency: "₺"',
  'href: "https://www.instagram.com/robyscoffeehouse/"',
  'ru: "Сегодня в Roby’s"',
  'en: "Today at Roby\'s"',
  'tr: "Bugün Roby\'s\'de"'
]) {
  assert(source.includes(marker), `Typed offer config is missing ${marker}`);
}

const offerConfig = source.match(/const SOCIAL_OFFER:\s*SocialOffer\s*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
const offerPrice = Number(offerConfig.match(/^\s*price:\s*(\d+)\s*,/m)?.[1]);
const catalogTotal = [
  ["hot-coffee", "Caffè Latte"],
  ["desserts", "Lotus Cheesecake"]
].reduce((total, [categoryId, name]) => {
  const item = menuCategories.find((category) => category.id === categoryId)?.items?.find((item) => item.name.en === name);
  assert(item && Number.isFinite(item.price) && item.price > 0, `Missing canonical offer component: ${categoryId}/${name}`);
  return total + item.price;
}, 0);
assert(offerPrice === catalogTotal, `Offer price ${offerPrice} must equal the catalog sum ${catalogTotal} (Latte + Lotus Cheesecake), without an implicit discount`);

assert(source.includes("type SocialOffer"), "Offer data must remain typed");
assert(source.includes("root.replaceChildren(card)"), "Runtime must render with safe DOM APIs");
assert(!source.includes("innerHTML"), "Runtime must not use innerHTML under the strict Trusted Types CSP");
assert(runtime.includes("SOCIAL_OFFER"), "Generated runtime must contain the typed offer source");
assert(runtime.includes('document.querySelector("#daily-offer")'), "Generated runtime must target #daily-offer");

for (const marker of [
  ".social-offer-card{display:grid",
  "grid-template-columns:70px minmax(0,1fr) auto",
  "@media(max-width:680px)",
  "@media(max-width:390px)",
  'grid-template-areas:"mark copy" "mark social" "button button"',
  ".social-offer-button:focus-visible",
  "@media(prefers-reduced-motion:reduce)"
]) {
  assert(css.includes(marker), `Stylesheet is missing responsive/accessibility contract: ${marker}`);
}

console.log("✅ SOCIAL-OFFER-001 gated: typed daily offer renders safely between the map and footer with responsive mobile layouts.");
