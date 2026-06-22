import { existsSync, readFileSync, statSync } from "node:fs";

const profile = JSON.parse(readFileSync("qa/business-profile.json", "utf8"));
const dashboard = JSON.parse(readFileSync("qa/regression-dashboard.json", "utf8"));
const pages = [
  { file: "index.html", url: profile.siteUrl, type: "CafeOrCoffeeShop" },
  { file: "menu.html", url: profile.menuUrl, type: "Menu" }
].map((page) => ({ ...page, html: readFileSync(page.file, "utf8") }));

function assert(condition, id, message) {
  if (!condition) throw new Error(`[${id}] ${message}`);
}

function dashboardGate(id, minimumAssertions) {
  const contract = dashboard.contracts?.find((item) => item.id === id);
  assert(contract, id, "Missing dashboard contract");
  assert(contract.status === "gated", id, "Contract must remain gated");
  assert(contract.owner === "QA", id, "Contract owner must remain QA");
  assert(Array.isArray(contract.assertions) && contract.assertions.length >= minimumAssertions, id, "Dashboard assertions are incomplete");
}

function oneMatch(html, regex, id, label) {
  const matches = Array.from(html.matchAll(regex));
  assert(matches.length === 1, id, `${label}: expected exactly one, found ${matches.length}`);
  return matches[0][1];
}

function meta(html, key, attribute = "name") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return oneMatch(html, new RegExp(`<meta\\b[^>]*${attribute}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "gi"), "SEO-001", `${attribute}=${key}`);
}

function canonical(html) {
  return oneMatch(html, /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/gi, "SEO-001", "canonical");
}

function title(html) {
  return oneMatch(html, /<title>([^<]+)<\/title>/gi, "SEO-001", "title");
}

function structuredData(html, expectedType) {
  const raw = oneMatch(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi, "SEO-001", "JSON-LD");
  const data = JSON.parse(raw);
  assert(data["@context"] === "https://schema.org", "SEO-001", "JSON-LD context changed");
  assert(data["@type"] === expectedType, "SEO-001", `JSON-LD type must be ${expectedType}`);
  return data;
}

for (const page of pages) {
  const pageTitle = title(page.html).trim();
  const description = meta(page.html, "description").trim();
  assert(pageTitle.length >= 20 && pageTitle.length <= 65, "SEO-001", `${page.file} title length is ${pageTitle.length}`);
  assert(description.length >= 55 && description.length <= 180, "SEO-001", `${page.file} description length is ${description.length}`);
  assert(meta(page.html, "robots").includes("index,follow"), "SEO-001", `${page.file} robots directive changed`);
  assert(canonical(page.html) === page.url, "SEO-001", `${page.file} canonical URL changed`);
  assert(meta(page.html, "og:url", "property") === page.url, "SEO-001", `${page.file} og:url changed`);
  assert(meta(page.html, "og:site_name", "property") === profile.name, "SEO-001", `${page.file} og:site_name changed`);
  assert(meta(page.html, "og:locale", "property") === "tr_TR", "SEO-001", `${page.file} og:locale changed`);
  assert(meta(page.html, "og:image", "property") === profile.imageUrl, "SEO-001", `${page.file} og:image changed`);
  assert(meta(page.html, "og:image:alt", "property").includes(profile.name), "SEO-001", `${page.file} og:image:alt changed`);
  assert(meta(page.html, "twitter:card") === "summary_large_image", "SEO-001", `${page.file} Twitter card changed`);
  assert(meta(page.html, "twitter:image") === profile.imageUrl, "SEO-001", `${page.file} Twitter image changed`);
  assert(meta(page.html, "twitter:image:alt").includes(profile.name), "SEO-001", `${page.file} Twitter image alt changed`);
  structuredData(page.html, page.type);
}

const landingData = structuredData(pages[0].html, "CafeOrCoffeeShop");
assert(landingData.name === profile.name, "CONTENT-001", "Structured business name changed");
assert(landingData.url === profile.siteUrl && landingData.hasMenu === profile.menuUrl, "CONTENT-001", "Structured page URLs changed");
assert(landingData.image === profile.imageUrl, "CONTENT-001", "Structured image changed");
assert(landingData.address?.streetAddress === profile.streetAddress, "CONTENT-001", "Structured street address changed");
assert(landingData.address?.addressLocality === profile.locality, "CONTENT-001", "Structured locality changed");
assert(landingData.address?.addressRegion === profile.region, "CONTENT-001", "Structured region changed");
assert(landingData.address?.addressCountry === profile.country, "CONTENT-001", "Structured country changed");
const hours = landingData.openingHoursSpecification?.[0];
assert(hours?.opens === profile.opens && hours?.closes === profile.closes, "CONTENT-001", "Structured opening hours changed");
assert(landingData.sameAs?.includes(profile.instagramUrl), "CONTENT-001", "Structured Instagram changed");
assert(landingData.hasMap === profile.mapUrl, "CONTENT-001", "Structured map URL changed");

const landingHtml = pages[0].html;
assert(landingHtml.includes(profile.streetAddress), "CONTENT-001", "Visible street address disappeared");
assert(landingHtml.includes(`${profile.locality} / ${profile.region}`), "CONTENT-001", "Visible locality/region disappeared");
assert((landingHtml.match(new RegExp(profile.displayHours.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 3, "CONTENT-001", "Opening hours are not visible in all key locations");
assert(landingHtml.includes(profile.instagramHandle), "CONTENT-001", "Visible Instagram handle disappeared");
assert((`${pages[0].html}\n${pages[1].html}`.match(new RegExp(profile.instagramUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 3, "CONTENT-001", "Instagram destination count regressed");
assert((`${pages[0].html}\n${pages[1].html}`.match(new RegExp(profile.mapUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 4, "CONTENT-001", "Map destination count regressed");

for (const file of ["index.html", "menu.html", "404.html", "robots.txt", "sitemap.xml", ".nojekyll"]) {
  assert(existsSync(file) && statSync(file).isFile(), "DEPLOY-001", `Missing deploy file ${file}`);
}
const buildMarkers = pages.map((page) => meta(page.html, "robys-build"));
assert(new Set(buildMarkers).size === 1, "DEPLOY-001", "Landing and menu build markers differ");
for (const page of pages) {
  assert(!/(?:localhost|127\.0\.0\.1|file:\/\/)/i.test(page.html), "DEPLOY-001", `${page.file} contains a development URL`);
  assert(!/(?:href|src|poster)=["']\/(?!\/)/i.test(page.html), "DEPLOY-001", `${page.file} contains a root-relative asset URL unsafe for project Pages`);
}
const robots = readFileSync("robots.txt", "utf8");
assert(robots.includes("User-agent: *") && robots.includes("Allow: /"), "DEPLOY-001", "robots.txt policy changed");
assert(robots.includes(`${profile.siteUrl}sitemap.xml`), "DEPLOY-001", "robots.txt sitemap URL changed");
const sitemap = readFileSync("sitemap.xml", "utf8");
assert(sitemap.includes(`<loc>${profile.siteUrl}</loc>`), "DEPLOY-001", "Landing missing from sitemap");
assert(sitemap.includes(`<loc>${profile.menuUrl}</loc>`), "DEPLOY-001", "Menu missing from sitemap");
const notFound = readFileSync("404.html", "utf8");
assert(notFound.includes('name="robots" content="noindex,follow"'), "DEPLOY-001", "404 page must remain noindex");
assert(notFound.includes(`href="${profile.siteUrl}"`), "DEPLOY-001", "404 recovery URL changed");

for (const [id, minimum] of [["SEO-001", 8], ["CONTENT-001", 7], ["DEPLOY-001", 7]]) dashboardGate(id, minimum);

console.log("✅ SEO-001 gated: metadata, social cards and JSON-LD are consistent.");
console.log("✅ CONTENT-001 gated: visible and structured business details match the canonical profile.");
console.log("✅ DEPLOY-001 gated: the GitHub Pages artifact layout is project-path safe.");
