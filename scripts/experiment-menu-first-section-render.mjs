import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

// Only test code is committed. Candidate JS replaces the PUBLISHED compiled
// runtime in a disposable browser context; the source build and site stay intact.
const BASE = "https://safal207.github.io/robys-coffee-house-demo/";
const OUTPUT = ".artifacts/menu-first-photo-experiment/first-section-render.json";
const REPEATS = 3;
const FIRST_IMAGE = "#menu-root .full-menu-item-media img";
const cases = [
  { id: "default", path: "menu.html?view=list" },
  { id: "search", path: "menu.html?view=list&q=latte", query: "latte" },
  { id: "category", path: "menu.html?view=list#desserts", hash: "#desserts" },
  { id: "product", path: "menu.html?view=list&product=pairing-offers:iced-san-sebastian-pairing",
    product: "pairing-offers:iced-san-sebastian-pairing" }
];
const modes = ["control", "first-section", "first-section-eager", "default-list-only"];

const source = readFileSync("src/menu-app.js", "utf8");
const publishedBuild = readFileSync("menu-app.js", "utf8");
assert.equal(compileMenuRuntime(source), publishedBuild,
  "Shipped menu-app.js is stale; never benchmark unverified source");

function replaceExactly(haystack, needle, replacement) {
  assert.equal(haystack.split(needle).length - 1, 1, "Unexpected menu source anchor: " + needle);
  return haystack.replace(needle, replacement);
}

function buildCandidate(eagerFirst, defaultListOnly = false) {
  let candidate = source;
  const renderStart = candidate.indexOf("function renderMenu() {");
  const renderEnd = candidate.indexOf("\n\nconst menuActions = createMenuActionsLoader", renderStart);
  assert.ok(renderStart > 0 && renderEnd > renderStart, "Unable to isolate renderMenu()");
  const progressive = [
    "let firstSectionRenderEpoch = 0;",
    "function renderMenu() {",
    "  const epoch = ++firstSectionRenderEpoch;",
    "  productImageObserver?.takeRecords();",
    "  productImageObserver?.disconnect();",
    "  menuRoot.replaceChildren();",
    ...(eagerFirst ? ["  firstPhotoClaimed = false;"] : []),
    "  const categories = menuCategories.filter(category =>",
    '    (activeCategory === "all" || activeCategory === category.id) && matchesSearch(category));',
    "  let rendered = 0;",
    "  const append = category => {",
    "    const section = createCategory(category);",
    "    if (!section) return;",
    "    menuRoot.append(section);",
    "    rendered++;",
    "  };",
    "  const finish = () => {",
    "    if (epoch !== firstSectionRenderEpoch) return;",
    "    emptyState.hidden = rendered > 0;",
    '    menuRoot.dataset.ready = "true";',
    "    syncMenuCartState();",
    "    updateMenuViews();",
    "  };",
    ...(defaultListOnly ? [
      "  // Restrict progressive rendering to the unfiltered explicit list entry.",
      "  const entry = new URL(location.href);",
      '  const safeDefaultList = entry.pathname.endsWith("/menu.html") &&',
      '    entry.searchParams.get("view") === "list" && !entry.hash &&',
      '    !entry.searchParams.has("q") && !entry.searchParams.has("product") &&',
      '    !entry.searchParams.has("item") && activeCategory === "all" && !searchTerm;',
      "  if (!safeDefaultList) { categories.forEach(append); finish(); return; }"
    ] : []),
    "  let cursor = 0;",
    "  // Make the first category that contains filtered products available before",
    "  // doing work for other categories. Yield exactly one event-loop task.",
    "  while (cursor < categories.length && rendered === 0) append(categories[cursor++]);",
    "  if (cursor === categories.length) { finish(); return; }",
    "  setTimeout(() => {",
    "    if (epoch !== firstSectionRenderEpoch) return; // stale search/hash/lang update",
    "    for (; cursor < categories.length; cursor++) append(categories[cursor]);",
    "    finish();",
    "  }, 0);",
    "}"
  ].join("\n");
  candidate = candidate.slice(0, renderStart) + progressive + candidate.slice(renderEnd);
  if (eagerFirst) {
    candidate = replaceExactly(candidate, "function createItem(item, { priority = false, categoryId } = {}) {",
      "let firstPhotoClaimed = false;\nfunction createItem(item, { priority = false, categoryId } = {}) {");
    candidate = replaceExactly(candidate, "    image.alt = pairing ? localized(item.imageAlt ?? item.name) : \"\";",
      "    const eager = priority || !firstPhotoClaimed;\n    firstPhotoClaimed = true;\n" +
      "    image.alt = pairing ? localized(item.imageAlt ?? item.name) : \"\";");
    candidate = replaceExactly(candidate, '    image.loading = priority ? "eager" : "lazy";',
      '    image.loading = eager ? "eager" : "lazy";');
    candidate = replaceExactly(candidate, '    if (priority) image.fetchPriority = "high";',
      '    if (eager) image.fetchPriority = "high";');
    candidate = replaceExactly(candidate, "    if (!priority && productImageObserver) {",
      "    if (!eager && productImageObserver) {");
  }
  return compileMenuRuntime(candidate);
}

const compiled = {
  control: publishedBuild,
  "first-section": buildCandidate(false),
  "first-section-eager": buildCandidate(true),
  "default-list-only": buildCandidate(false, true)
};

function median(values) {
  assert.ok(values.length, "Cannot calculate an empty median");
  const a = [...values].sort((x, y) => x - y);
  return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2;
}

async function navigate(browser, testCase, mode, pair) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: "tr-TR", serviceWorkers: "block"
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: 1600000 / 8,
    uploadThroughput: 750000 / 8, connectionType: "cellular3g"
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const jsErrors = [], runtimeRoutes = [], requestUrls = [];
  page.on("pageerror", error => jsErrors.push(error.message));
  page.on("request", request => {
    if (/\/src\/products\/.+\.webp(?:\?|$)/.test(request.url())) requestUrls.push(request.url());
  });
  await page.route(url => url.pathname.endsWith("/menu-app.js"), async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, "Published runtime must load");
    const actual = await response.text();
    assert.equal(actual, publishedBuild, "GitHub Pages runtime does not match committed build");
    runtimeRoutes.push(route.request().url());
    await route.fulfill({ response, body: compiled[mode] });
  });
  try {
    const response = await page.goto(new URL(testCase.path, BASE).href, {
      waitUntil: "domcontentloaded", timeout: 45000
    });
    assert.ok(response?.ok(), "Published list page did not load");
    const first = page.locator(FIRST_IMAGE).first();
    await first.scrollIntoViewIfNeeded({ timeout: 45000 });
    await page.waitForFunction(selector => {
      const image = document.querySelector(selector);
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, FIRST_IMAGE, { timeout: 45000 });
    await first.evaluate(image => image.decode());
    await page.evaluate(() => new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const photoReadyMs = await page.evaluate(() => performance.now());
    await page.waitForFunction(() => document.querySelector("#menu-root")?.dataset.ready === "true",
      null, { timeout: 45000 });
    const settled = await page.evaluate(selector => {
      const image = document.querySelector(selector);
      const url = image?.currentSrc || image?.src;
      const entries = performance.getEntriesByType("resource");
      const photo = entries.find(resource => resource.name === url);
      return {
        photoPath: url ? new URL(url).pathname : null,
        photoRequestStartMs: photo?.startTime ?? null,
        photoTransferBytes: photo?.transferSize ?? null,
        fcpMs: performance.getEntriesByType("paint")
          .find(entry => entry.name === "first-contentful-paint")?.startTime ?? null,
        ids: Array.from(document.querySelectorAll("#menu-root [data-product-id]"))
          .map(el => el.dataset.productId),
        sectionIds: Array.from(document.querySelectorAll("#menu-root .full-menu-panel"))
          .map(el => el.id),
        query: document.querySelector("#menu-search")?.value,
        url: location.href,
        eagerFirst: image?.loading === "eager",
        fullMenuReadyUpperBoundMs: performance.now()
      };
    }, FIRST_IMAGE);
    // Exercise generation cancellation: two input events in one JS task must
    // never let stale delayed categories repopulate an empty search.
    if (testCase.id === "default" && pair === 1 && mode !== "control") {
      await page.evaluate(() => {
        const input = document.querySelector("#menu-search");
        input.value = "latte";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.value = "zzzxxyy-no-products";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(100);
      const emptyCards = await page.locator("#menu-root [data-product-id]").count();
      assert.equal(emptyCards, 0, "Stale delayed sections leaked into empty search");
      assert.equal(await page.locator("#menu-empty").isVisible(), true,
        "Empty-state UI disappeared after quick search churn");
      await page.evaluate(() => {
        const input = document.querySelector("#menu-search");
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(100);
      assert.equal(await page.locator("#menu-root [data-product-id]").count(), settled.ids.length,
        "Resetting rapid search must restore the full original catalog");
    }
    assert.equal(runtimeRoutes.length, 1, "Exactly one published runtime expected");
    assert.deepEqual(jsErrors, [], "No JavaScript errors allowed");
    assert.ok(settled.photoPath?.includes("/src/products/"), "First image must be a real product");
    assert.ok(settled.photoRequestStartMs !== null, "First photo request timing missing");
    assert.ok(Number.isFinite(settled.fcpMs), "FCP missing");
    assert.ok(settled.ids.length > 0, "No product cards rendered");
    if (testCase.query) assert.equal(settled.query, testCase.query);
    if (testCase.hash) assert.equal(new URL(settled.url).hash, testCase.hash);
    if (testCase.product) assert.ok(settled.ids.includes(testCase.product),
      "Product deep-link target absent");
    return {
      case: testCase.id, mode, pair, photoReadyMs,
      ...settled, imageRequestsObserved: requestUrls.length, jsErrors
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (let pair = 1; pair <= REPEATS; pair++) {
      for (const testCase of cases) {
        const order = modes.map((_, i) => modes[(i + pair - 1) % modes.length]);
        for (const mode of order) {
          const result = await navigate(browser, testCase, mode, pair);
          samples.push(result);
          console.log("FIRST_SECTION_SAMPLE " + JSON.stringify({
            case: result.case, mode, pair, photoReadyMs: Math.round(result.photoReadyMs),
            fcpMs: result.fcpMs, imageRequestsObserved: result.imageRequestsObserved,
            firstPath: result.photoPath, cards: result.ids.length, sections: result.sectionIds.length
          }));
        }
      }
    }
  } finally {
    await browser.close();
  }
  const pairs = [];
  for (const testCase of cases) {
    for (let pair = 1; pair <= REPEATS; pair++) {
      const set = samples.filter(sample => sample.case === testCase.id && sample.pair === pair);
      const control = set.find(x => x.mode === "control");
      assert.ok(control);
      for (const mode of modes.slice(1)) {
        const candidate = set.find(x => x.mode === mode);
        assert.ok(candidate);
        // Final catalog, selected image and route context are invariants.
        assert.deepEqual(candidate.ids, control.ids, "Product catalog changed on " + testCase.id);
        assert.deepEqual(candidate.sectionIds, control.sectionIds,
          "Category order changed on " + testCase.id);
        assert.equal(candidate.photoPath, control.photoPath,
          "First displayed product photo changed on " + testCase.id);
        assert.equal(candidate.photoTransferBytes, control.photoTransferBytes,
          "First photo size changed on " + testCase.id);
        pairs.push({
          case: testCase.id, pair, mode,
          photoGainMs: control.photoReadyMs - candidate.photoReadyMs,
          fcpPenaltyMs: candidate.fcpMs - control.fcpMs,
          fullMenuPenaltyUpperBoundMs: candidate.fullMenuReadyUpperBoundMs -
            control.fullMenuReadyUpperBoundMs,
          extraImageRequests: candidate.imageRequestsObserved - control.imageRequestsObserved
        });
      }
    }
  }
  const summary = cases.flatMap(testCase => modes.slice(1).map(mode => {
    const matched = pairs.filter(x => x.case === testCase.id && x.mode === mode);
    return {
      case: testCase.id, mode, n: matched.length,
      medianPairedPhotoGainMs: median(matched.map(x => x.photoGainMs)),
      medianPairedFcpPenaltyMs: median(matched.map(x => x.fcpPenaltyMs)),
      medianFullMenuPenaltyUpperBoundMs: median(matched.map(x => x.fullMenuPenaltyUpperBoundMs)),
      fasterPhotoPairs: matched.filter(x => x.photoGainMs > 0).length,
      slowerFcpPairs: matched.filter(x => x.fcpPenaltyMs > 0).length,
      additionalImageRequestPairs: matched.filter(x => x.extraImageRequests > 0).length
    };
  }));
  const report = {
    schema: "robys.first-section-render-lab.v1",
    source: "Published GitHub Pages with test-only compiled menu-app.js replacement",
    synthetic: true, productionApproved: false,
    viewport: "390×844, DPR 2, 150ms RTT, 1.6Mbps, CPU 4×",
    caveats: [
      "First-photo readiness requires Playwright scrollIntoView and image decode; not passive viewport paint",
      "All variants intercept and fulfill the production JS request, potentially changing realistic JS network timing",
      "The candidate JS bundle differs in size from the control; compare request timing and CPU costs before shipping",
      "Only three cold pairs per route and variant: directional lab evidence, not field user data or revenue impact",
      "The full-menu time is an upper bound measured after photo decoding and waiting for dataset.ready",
      "Candidate changes are compiled in CI only; no production source, generated JS, HTML or images are changed",
      "Rapid search-churn/empty-state recovery is smoke-tested for all candidates; additional language, cart and a11y regression remains necessary"
    ],
    compiledBytes: Object.fromEntries(modes.map(mode => [mode, Buffer.byteLength(compiled[mode])])),
    pairCount: REPEATS, summary, pairs, samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Source-first staged catalog rendering (not deployed)\n\n" +
      "| Route | Candidate | Paired photo gain, ms | Paired FCP penalty, ms | FCP slower pairs |\n" +
      "|---|---|---:|---:|---:|\n" +
      summary.map(x => "| " + x.case + " | " + x.mode + " | " +
        Math.round(x.medianPairedPhotoGainMs) + " | " +
        Math.round(x.medianPairedFcpPenaltyMs) + " | " +
        x.slowerFcpPairs + "/" + x.n + " |").join("\n") +
      "\n\nThis is a synthetic browser experiment, not a production change or ship decision.\n");
  }
  console.log("FIRST_SECTION_SUMMARY " + JSON.stringify(summary));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
