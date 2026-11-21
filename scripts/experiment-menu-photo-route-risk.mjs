import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

// Test the proposed STATIC late-head hint against the published site, without
// changing published bytes. This experiment deliberately exposes route risks.
const BASE = "https://safal207.github.io/robys-coffee-house-demo/";
const PHOTO = "src/products/sets-v1/cool-lime-macaron.webp";
const SMALL = "src/products/quick-v1/sets-v1/cool-lime-macaron-512.webp";
const HINT = '<link data-perf-experiment="first-photo" rel="preload" as="image" href="' +
  PHOTO + '" imagesrcset="' + SMALL + ' 512w, ' + PHOTO +
  ' 1024w" imagesizes="(max-width: 460px) 100vw, 460px" fetchpriority="low" />';
const OUTPUT = ".artifacts/menu-first-photo-experiment/route-risk.json";

const cases = [
  { name: "list-default", path: "menu.html?view=list", view: "list", defaultProduct: true },
  { name: "list-ru", path: "menu.html?view=list&lang=ru", view: "list", defaultProduct: true, language: "ru" },
  { name: "list-search", path: "menu.html?view=list&q=latte", view: "list", search: "latte" },
  { name: "list-deeplink", path: "menu.html?view=list&product=pairing-offers:iced-san-sebastian-pairing",
    view: "list", product: "pairing-offers:iced-san-sebastian-pairing" },
  { name: "list-category", path: "menu.html?view=list#desserts", view: "list", category: "desserts" },
  { name: "generic-redirect", path: "menu.html", view: "feed" },
  { name: "feed-direct", path: "menu-feed.html?view=feed", view: "feed" },
  { name: "grid-direct", path: "menu-grid.html?view=grid", view: "grid" }
];

async function inspect(browser, scenario, variant) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: "tr-TR", serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  const photoRequests = [];
  const interceptedMenuRequests = [];
  let navigatedMenuDocuments = 0;
  let injectedDocuments = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith("/" + PHOTO)) photoRequests.push(request.url());
  });
  await page.route(url => url.pathname.endsWith("/menu.html"), async route => {
    const request = route.request();
    const mainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
    interceptedMenuRequests.push({
      url: request.url(), resourceType: request.resourceType(), mainNavigation
    });
    // The feed can prefetch menu.html for a future return. This is not another
    // customer navigation and must never receive the speculative hint.
    if (!mainNavigation) {
      await route.continue();
      return;
    }
    navigatedMenuDocuments++;
    const response = await route.fetch();
    assert.equal(response.status(), 200, "Published menu HTML must load");
    let html = await response.text();
    if (variant === "late-head-static") {
      assert.match(html, /<\/head>/i, "Menu head is missing");
      html = html.replace(/<\/head>/i, "  " + HINT + "\n</head>");
      injectedDocuments++;
    }
    await route.fulfill({ response, body: html });
  });
  try {
    const navigation = await page.goto(new URL(scenario.path, BASE).href, {
      waitUntil: "domcontentloaded", timeout: 45000
    });
    assert.ok(navigation?.ok(), "Initial route must load: " + scenario.name);
    if (scenario.view === "feed") {
      await page.waitForURL(url => url.pathname.endsWith("/menu-feed.html"), { timeout: 20000 });
      await page.locator("#feed .feed-card img").first().waitFor({ state: "attached", timeout: 20000 });
    } else {
      await page.waitForURL(url => url.pathname.endsWith(scenario.view === "grid" ? "/menu-grid.html" : "/menu.html"),
        { timeout: 20000 });
      await page.locator("#menu-root .full-menu-item-media img").first().waitFor({ state: "attached", timeout: 20000 });
    }
    await page.waitForTimeout(500);
    const state = await page.evaluate(productId => {
      const first = document.querySelector("#menu-root .full-menu-item-media img") ??
        document.querySelector("#feed .feed-card img");
      const source = first?.currentSrc || first?.src || null;
      return {
        finalUrl: location.href,
        hintCount: document.querySelectorAll('link[data-perf-experiment="first-photo"]').length,
        firstPhotoPath: source ? new URL(source).pathname : null,
        query: document.querySelector("#menu-search")?.value ?? null,
        documentLanguage: document.documentElement.lang,
        productPresent: productId ? Array.from(document.querySelectorAll("[data-product-id]"))
          .some(element => element.dataset.productId === productId) : null
      };
    }, scenario.product ?? null);
    assert.deepEqual(errors, [], "Browser JS errors on " + scenario.name + "/" + variant);
    const expectedNavigations = scenario.path.startsWith("menu.html") ? 1 : 0;
    assert.equal(navigatedMenuDocuments, expectedNavigations,
      "Top-level menu navigation count changed; background prefetch is not a navigation");
    assert.equal(injectedDocuments, variant === "late-head-static" ? navigatedMenuDocuments : 0,
      "Static preload injection must be scoped to actual top-level menu navigations");
    assert.equal(state.hintCount, variant === "late-head-static" && scenario.view === "list" ? 1 : 0,
      "Final document hint count must match navigation");
    if (scenario.language) assert.equal(state.documentLanguage, scenario.language, "Language route broken");
    if (scenario.search) assert.equal(state.query, scenario.search, "Search route broken");
    if (scenario.category) assert.equal(new URL(state.finalUrl).hash, "#" + scenario.category,
      "Category deep link lost");
    if (scenario.product) assert.equal(state.productPresent, true, "Product deep link target missing");
    if (scenario.defaultProduct) assert.ok(state.firstPhotoPath?.endsWith("/" + PHOTO),
      "Default list first photo changed");
    return {
      scenario: scenario.name, variant, initialRoute: scenario.path, view: scenario.view,
      ...state, navigatedMenuDocuments, injectedDocuments, interceptedMenuRequests,
      backgroundMenuRequests: interceptedMenuRequests.filter(request => !request.mainNavigation).length,
      photoRequestCount: photoRequests.length,
      // A risk flag, not proof of wasted bytes. A visible product may still use this photo.
      potentialOffTargetPreload: variant === "late-head-static" && !scenario.defaultProduct &&
        injectedDocuments > 0,
      firstPhotoMismatch: Boolean(state.firstPhotoPath && !state.firstPhotoPath.endsWith("/" + PHOTO)),
      errors
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (const scenario of cases) {
      for (const variant of ["control", "late-head-static"]) {
        const result = await inspect(browser, scenario, variant);
        samples.push(result);
        console.log(JSON.stringify(result));
      }
    }
  } finally {
    await browser.close();
  }
  const risks = samples.filter(sample => sample.potentialOffTargetPreload);
  const paired = cases.map(scenario => {
    const control = samples.find(sample => sample.scenario === scenario.name && sample.variant === "control");
    const candidate = samples.find(sample => sample.scenario === scenario.name && sample.variant === "late-head-static");
    assert.ok(control && candidate, "Missing paired route: " + scenario.name);
    return {
      scenario: scenario.name,
      controlPhotoRequests: control.photoRequestCount,
      candidatePhotoRequests: candidate.photoRequestCount,
      addedPhotoRequests: candidate.photoRequestCount - control.photoRequestCount,
      firstPhotoMismatch: candidate.firstPhotoMismatch,
      redirected: new URL(candidate.finalUrl).pathname !== new URL(scenario.path, BASE).pathname,
      navigatedMenuDocuments: candidate.navigatedMenuDocuments,
      backgroundMenuRequests: candidate.backgroundMenuRequests
    };
  });
  const report = {
    schema: "robys.first-photo-route-risk.v1", synthetic: true,
    source: "Published GitHub Pages; test-only document interception",
    caveats: [
      "This simulates a static late-head hint on every list document and does not deploy it",
      "Fragments (#category) are not transmitted in HTTP requests; static HTML cannot scope an image hint by fragment",
      "A requested image is not necessarily wasted bandwidth; inspect actual selected products and complete network data",
      "Photo request counts are snapshots 500ms after route readiness, not final page-transfer totals",
      "Background prefetches of the list are tracked separately and left unchanged; this harness only injects into actual menu navigations"
    ],
    scenarios: cases.length, variants: 2, potentialOffTargetRoutes: risks.map(r => r.scenario),
    productionApproved: false, paired, samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Menu preload route risk (no production changes)\n\n" +
      "Tested " + cases.length + " routes × 2 variants. " +
      "Potential off-target static hints: " + (risks.map(r => r.scenario).join(", ") || "none") +
      ". **Not a production approval.**\n\n" +
      "Category fragments cannot scope a static HTML image preload because they never reach the server.\n");
  }
  console.log("ROUTE_RISK_SUMMARY " + JSON.stringify({
    testedCases: cases.length, variants: 2, potentialOffTargetRoutes: risks.map(r => r.scenario)
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
