import { readFileSync } from "node:fs";

const conversion = readFileSync("conversion.js", "utf8");
const source = readFileSync("hits-feed.js", "utf8");
const css = readFileSync("hits-feed.css", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[HITS-001] ${message}`);
}

const expectedProducts = [
  ["san-sebastian", "src/products/san-sebastian.webp", 190, "menu.html#desserts"],
  ["latte", "src/products/latte.webp", 180, "menu.html#hot-coffee"],
  ["nutella-croissant", "src/products/nutella-croissant.webp", 170, "menu.html#food"],
  ["lotus-cheesecake", "src/products/lotus-cheesecake.webp", 190, "menu.html#desserts"]
];

assert(conversion.startsWith('import "./hits-feed.js?v=20260623-1";'), "Hits module import changed");
assert(source.includes("function render()"), "Hits feed render function is missing");
assert(source.includes('section.id = "hits"'), "Hits section id is missing");
assert(source.includes('visitSection.before(section)'), "Hits feed must be inserted before the visit section");
assert(!source.includes("innerHTML"), "Unsafe innerHTML rendering is forbidden");
assert(source.includes("render();"), "Hits feed must render when the module loads");
assert(css.includes("scroll-snap-type:x mandatory"), "Mobile horizontal feed must retain scroll snapping");
assert(css.includes("@media(max-width:680px)"), "Mobile feed breakpoint is missing");
assert(css.includes("grid-template-columns:repeat(4,minmax(0,1fr))"), "Desktop four-card grid changed");

for (const language of ["tr", "en", "ru"]) {
  assert(new RegExp(`\\n  ${language}: \\{`).test(source), `Missing ${language} hits copy`);
}

for (const [id, image, price, href] of expectedProducts) {
  assert(source.includes(`id: "${id}"`), `Missing product ${id}`);
  assert(source.includes(`image: "${image}"`), `Missing image for ${id}`);
  assert(source.includes(`price: ${price}`), `Price changed for ${id}`);
  assert(source.includes(`href: "${href}"`), `Menu link changed for ${id}`);
}

const productIds = Array.from(source.matchAll(/\n    id: "([^"]+)",\n    image:/g), (match) => match[1]);
assert(JSON.stringify(productIds) === JSON.stringify(expectedProducts.map(([id]) => id)), "Hits product order changed");

console.log("✅ HITS-001 passed: multilingual four-card cafe hits feed, prices, assets, links and responsive layout remain intact.");
