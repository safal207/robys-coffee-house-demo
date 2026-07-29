import { existsSync, readFileSync } from "node:fs";

const router = readFileSync("audience-router.js", "utf8");
const styles = readFileSync("audience-router.css", "utf8");
const analytics = readFileSync("analytics.js", "utf8");
const home = readFileSync("index.html", "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${message}`);
}

const routes = {
  menu: "menu.html",
  discover: "discover.html",
  smart: "smart-choice/",
  chapter: "chapter-01.html"
};

assert(analytics.startsWith('import "./audience-router.js";'), "homepage module entry loads Audience Router");
assert(analytics.includes('#audience-router,#about,#menu,#gallery,#visit'), "section analytics observes the Router without replacing existing sections");
assert(home.includes('href="menu.html"'), "ordinary menu remains available in the original homepage shell");
assert(home.includes('type="module" src="analytics.js'), "homepage retains its module entry point");

for (const [route, href] of Object.entries(routes)) {
  assert(router.includes(`id: "${route}"`), `route ${route} is declared`);
  assert(router.includes(`href: "${href}"`), `route ${route} points to ${href}`);
}

assert(existsSync("menu.html"), "ordinary menu destination exists");
assert(existsSync("discover.html"), "introduction destination exists");
assert(existsSync("smart-choice/index.html"), "Smart Choice destination exists");
assert(existsSync("chapter-01.html"), "Chapter destination exists on the stacked base");

for (const language of ["tr", "en", "ru"]) {
  assert(router.includes(`${language}: {`), `${language.toUpperCase()} Router copy exists`);
}

for (const key of ["route_offered", "route_accepted", "route_preference_reset"]) {
  assert(router.includes(`"${key}"`), `event ${key} is recorded`);
}

assert(router.includes('const SCHEMA_VERSION = 1;'), "local state is explicitly versioned");
assert(router.includes('source: "explicit-home-router"'), "saved preference records explicit intent source");
assert(router.includes('intentSource: "explicit"'), "accepted route is classified as explicit intent");
assert(router.includes("robys-audience-router-v1"), "preference uses a dedicated storage key");
assert(router.includes("robys-audience-router-events-v1"), "audit events use a dedicated key");
assert(router.includes("safeStorage(localStorage"), "explicit preference can persist locally");
assert(router.includes("safeStorage(sessionStorage"), "audit events and offer suppression are session-scoped");
assert(router.includes("getEvents: () => safeStorage(sessionStorage"), "event diagnostics do not create persistent behavioural history");
assert(router.includes("safeStorage"), "storage failures have a non-blocking boundary");
assert(router.includes("route_preference_reset"), "preference can be reset from the visible UI");
assert(router.includes("aria-live"), "restored preference status is announced accessibly");
assert(router.includes("MutationObserver"), "Router copy follows language changes");
assert(!router.includes("innerHTML"), "Router does not require unsafe HTML injection");
assert(!router.includes('setAttribute("role", "listitem")'), "route anchors retain native link semantics");
assert(!router.includes("aria-current"), "past preference is not misrepresented as current-page state");
assert(!router.includes("dataset.analyticsAction"), "route acceptance is not double-counted by generic click analytics");

for (const forbidden of [
  "location.replace",
  "location.assign",
  "window.location =",
  "Notification.requestPermission",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket"
]) {
  assert(!router.includes(forbidden), `Router excludes ${forbidden}`);
}

assert(styles.includes("grid-template-columns:repeat(4"), "desktop layout exposes four equal routes");
assert(styles.includes("@media(max-width:980px)"), "tablet breakpoint is explicit");
assert(styles.includes("@media(max-width:560px)"), "mobile breakpoint is explicit");
assert(styles.match(/@media\(max-width:560px\)[\s\S]*?\.audience-route-grid\{[\s\S]*?grid-template-columns:repeat\(2/), "mobile layout keeps the Router compact in a two-column grid");
assert(styles.match(/@media\(max-width:560px\)[\s\S]*?\.audience-route-card\{[\s\S]*?flex-direction:column/), "mobile cards use a readable vertical composition");
assert(styles.includes("min-height:40px"), "reset control meets the repository touch-target floor");
assert(styles.includes("prefers-reduced-motion"), "Router supplies a reduced-motion contract");
assert(styles.includes(".is-preferred"), "restored preference has a visible but non-blocking state");

if (process.exitCode) {
  console.error("Audience Router contract failed.");
  process.exit(process.exitCode);
}

console.log("Audience Router contract passed.");
