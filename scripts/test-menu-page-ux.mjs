import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFile, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const runtimeSource = readFileSync(resolve(root, "menu-page.js"), "utf8");
const htmlSource = readFileSync(resolve(root, "menu.html"), "utf8");
const indexSource = readFileSync(resolve(root, "index.html"), "utf8");
const discoverHtmlSource = readFileSync(resolve(root, "discover.html"), "utf8");
const discoverRuntimeSource = readFileSync(resolve(root, "discover-runtime.js"), "utf8");
const serviceWorkerSource = readFileSync(resolve(root, "sw.js"), "utf8");
const buildSource = readFileSync(resolve(root, "scripts/build.mjs"), "utf8");

function revisionFor(fileName) {
  return createHash("sha256").update(readFileSync(resolve(root, fileName))).digest("hex").slice(0, 12);
}

assert.match(
  runtimeSource,
  /category\.id === "pairing-offers"[\s\S]*item\.sourceStatus === "confirmed" && item\.availability === "available"/,
  "featured pairing renderer must fail closed unless both commercial fields are explicitly approved"
);
assert.doesNotMatch(
  htmlSource.match(/id="menu-root"[^>]*>/)?.[0] ?? "",
  /aria-live/,
  "the rebuilt menu catalog must not be an aria-live region"
);
assert.match(
  htmlSource,
  /id="menu-results-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/,
  "menu result changes need one compact atomic live status"
);

const menuRuntimeRevision = htmlSource.match(/src="menu-runtime\.js\?v=([a-f0-9]{12})"/)?.[1];
const menuCssRevision = htmlSource.match(/href="menu-runtime\.css\?v=([a-f0-9]{12})"/)?.[1];
const homeRuntimeRevision = indexSource.match(/src="home-menu-entry\.js\?v=([a-f0-9]{12})"/)?.[1];
const homeCssRevision = indexSource.match(/href="home-menu-entry\.css\?v=([a-f0-9]{12})"/)?.[1];
const socialOfferCssRevision = indexSource.match(/href="social-offer\.css\?v=([a-f0-9]{12})"/)?.[1];
const discoverRuntimeRevision = discoverHtmlSource.match(/src="discover-runtime\.js\?v=([a-f0-9]{12})"/)?.[1];
assert(menuRuntimeRevision && menuCssRevision, "menu page must load only hashed first-load-safe menu assets");
assert(homeRuntimeRevision && homeCssRevision, "home page must load hashed first-load-safe menu entry assets");
assert(socialOfferCssRevision, "home page must load the hashed social offer stylesheet");
assert(discoverRuntimeRevision, "Discover must load a hashed self-contained first-load-safe runtime");
assert.equal(menuRuntimeRevision, revisionFor("menu-runtime.js"), "menu runtime HTML revision is not derived from its current bytes");
assert.equal(menuCssRevision, revisionFor("menu-runtime.css"), "menu stylesheet HTML revision is not derived from its current bytes");
assert.equal(homeRuntimeRevision, revisionFor("home-menu-entry.js"), "home runtime HTML revision is not derived from its current bytes");
assert.equal(homeCssRevision, revisionFor("home-menu-entry.css"), "home stylesheet HTML revision is not derived from its current bytes");
assert.equal(socialOfferCssRevision, revisionFor("social-offer.css"), "social offer stylesheet HTML revision is not derived from its current bytes");
assert.equal(discoverRuntimeRevision, revisionFor("discover-runtime.js"), "Discover runtime HTML revision is not derived from its current bytes");
assert.doesNotMatch(htmlSource, /(?:src="menu-page\.js|src="pairing-posters\.js|href="menu\.css|href="pairing-posters\.css)/, "menu page still loads a stale-cache-prone source asset directly");
assert.doesNotMatch(indexSource, /src="social-offer\.js/, "home page still loads the stale-cache-prone legacy hero enhancer directly");
assert.doesNotMatch(discoverHtmlSource, /src="discover-v2\.js/, "Discover page still loads the stale-cache-prone source module path");
assert.doesNotMatch(discoverRuntimeSource, /\b(?:import|from)\b[^;]*\.\/(?:menu-data|discover-copy|discover-journeys-v2)\.js/, "deployed Discover runtime still has generation-mixable imports");
for (const asset of [
  `./menu-runtime.js?v=${menuRuntimeRevision}`,
  `./menu-runtime.css?v=${menuCssRevision}`,
  `./home-menu-entry.js?v=${homeRuntimeRevision}`,
  `./home-menu-entry.css?v=${homeCssRevision}`,
  `./social-offer.css?v=${socialOfferCssRevision}`,
  `./discover-runtime.js?v=${discoverRuntimeRevision}`
]) {
  assert(serviceWorkerSource.includes(`"${asset}"`), `service worker does not precache the exact first-load-safe asset ${asset}`);
}
for (const path of ["/menu-runtime.js", "/menu-runtime.css", "/home-menu-entry.js", "/home-menu-entry.css", "/social-offer.css", "/discover-runtime.js"]) {
  assert(serviceWorkerSource.includes(`url.pathname.endsWith("${path}")`), `service worker does not exact-match future revisions of ${path}`);
}
for (const marker of [
  'entryPoints: ["menu-runtime-entry.js"]',
  'transpileClassicScript("src/social-offer.ts", "home-menu-entry.js")',
  'writeFileSync("menu-runtime.css", menuRuntimeCss)',
  'synchronizeModuleScript(menuHtml, "menu-runtime.js", menuRuntimeRevision)',
  'synchronizeStylesheet(menuHtml, "menu-runtime.css", menuRuntimeCssRevision)'
]) {
  assert(buildSource.includes(marker), `build no longer owns first-load-safe artifact contract: ${marker}`);
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function createStaticServer() {
  return createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const absolutePath = resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }

    readFile(absolutePath, (error, content) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": mimeTypes.get(extname(absolutePath)) ?? "application/octet-stream" });
      response.end(content);
    });
  });
}

function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const server = createStaticServer();
await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
assert(address && typeof address === "object", "menu UX test server did not start");
const baseUrl = `http://127.0.0.1:${address.port}`;
const executablePath = resolveChromiumExecutable();
assert(executablePath, "no Chromium-compatible browser is available for the focused menu UX test");

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    locale: "tr-TR",
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    window.__menuScrollOptions = [];
    Element.prototype.scrollIntoView = function scrollIntoView(options) {
      window.__menuScrollOptions.push(options);
      return originalScrollIntoView.call(this, options);
    };
  });
  await page.goto(`${baseUrl}/menu.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#menu-root .full-menu-panel").first().waitFor();

  const featuredText = await page.locator("#pairing-offers").innerText();
  assert(!featuredText.includes("Cool Lime"), "provisional Cool Lime pairing was rendered in the public menu");
  assert(featuredText.includes("Buzlu Latte + San Sebastian"), "confirmed Iced San Sebastian pairing is missing");
  assert.equal(
    await page.locator("#pairing-offers .full-menu-item").count(),
    1,
    "public menu must render only the one currently confirmed and available pairing"
  );

  const searchInput = page.locator("#menu-search");
  let expectedDessertCount;
  for (const query of ["Tatlılar", "Desserts", "Десерты"]) {
    await searchInput.fill(query);
    const dessertCount = await page.locator("#desserts .full-menu-item").count();
    assert(dessertCount > 0, `category-name search returned no dessert items for ${query}`);
    expectedDessertCount ??= dessertCount;
    assert.equal(dessertCount, expectedDessertCount, `category-name search returned a partial category for ${query}`);
    assert.equal(await page.locator("#menu-root > .full-menu-panel").count(), 1, `category-name search rendered unrelated panels for ${query}`);
  }

  await searchInput.fill("iced");
  assert(
    (await page.locator("#menu-root .full-menu-item").count()) > 0,
    "English lowercase search failed under the Turkish UI locale"
  );

  await searchInput.fill("");
  const hotCoffeeChip = page.locator('[data-category-id="hot-coffee"]');
  await hotCoffeeChip.focus();
  await hotCoffeeChip.press("Enter");
  assert.equal(await page.evaluate(() => window.location.hash), "#hot-coffee", "keyboard category activation did not update the hash");
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.categoryId),
    "hot-coffee",
    "keyboard focus was lost when the active category changed"
  );
  assert.equal(
    await page.evaluate(() => window.__menuScrollOptions.filter((options) => options?.block === "start").at(-1)?.behavior),
    "auto",
    "category navigation ignored the user's reduced-motion preference"
  );

  await page.goto(`${baseUrl}/menu.html?deep-link-test=1#desserts`, { waitUntil: "domcontentloaded" });
  await page.locator("#desserts").waitFor();
  const categoryNavBox = await page.locator("#menu-category-nav").boundingBox();
  const activeCategoryBox = await page.locator('[data-category-id="desserts"]').boundingBox();
  assert(categoryNavBox && activeCategoryBox, "deep-linked category chip has no layout box");
  assert(
    activeCategoryBox.x >= categoryNavBox.x &&
      activeCategoryBox.x + activeCategoryBox.width <= categoryNavBox.x + categoryNavBox.width,
    "deep-linked active category chip is outside the visible mobile category rail"
  );
  const showAllButton = page.locator("#menu-show-all");
  assert(await showAllButton.isVisible(), "deep-linked category does not expose a visible full-menu reset");
  await page.locator('[data-lang="en"]').click();
  assert.equal(await showAllButton.textContent(), "Show full menu", "full-menu reset is not localized in English");
  await page.locator('[data-lang="ru"]').click();
  assert.equal(await showAllButton.textContent(), "Показать всё меню", "full-menu reset is not localized in Russian");
  await page.locator('[data-lang="tr"]').click();
  await searchInput.fill("Espresso");
  assert.equal(await searchInput.inputValue(), "Espresso", "deep-linked search fixture was not applied");
  await showAllButton.focus();
  await showAllButton.press("Enter");
  assert.equal(await searchInput.inputValue(), "", "full-menu reset did not clear the active search query");
  assert.equal(await page.evaluate(() => window.location.hash), "", "full-menu reset did not clear the category hash");
  assert(await showAllButton.isHidden(), "full-menu reset remains visible after the filter is cleared");
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.categoryId),
    "all",
    "focus did not move to the active All category after hiding the reset button"
  );
  const resetCategoryNavBox = await page.locator("#menu-category-nav").boundingBox();
  const allCategoryBox = await page.locator('[data-category-id="all"]').boundingBox();
  assert(resetCategoryNavBox && allCategoryBox, "reset All category chip has no layout box");
  assert(
    allCategoryBox.x >= resetCategoryNavBox.x &&
      allCategoryBox.x + allCategoryBox.width <= resetCategoryNavBox.x + resetCategoryNavBox.width,
    "focused All category chip remains outside the visible mobile category rail after reset"
  );
  assert((await page.locator("#menu-root > .full-menu-panel").count()) > 1, "full-menu reset did not restore the catalog");

  const routeQuick = page.locator(".menu-route-quick");
  assert(await routeQuick.isVisible(), "sticky menu controls do not expose a quick route action");
  await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.45)));
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const controlsBox = await page.locator(".menu-controls").boundingBox();
  const stickyCategoryNavBox = await page.locator("#menu-category-nav").boundingBox();
  const routeQuickBox = await routeQuick.boundingBox();
  assert(controlsBox && stickyCategoryNavBox && routeQuickBox, "sticky route action has no mobile layout box");
  assert(routeQuickBox.y >= controlsBox.y && routeQuickBox.y + routeQuickBox.height <= controlsBox.y + controlsBox.height, "quick route action escapes the sticky controls");
  assert(stickyCategoryNavBox.x + stickyCategoryNavBox.width <= routeQuickBox.x, "quick route action overlaps the horizontal category rail");
  assert(controlsBox.y >= 0 && controlsBox.y + controlsBox.height <= 844, "sticky controls leave the mobile viewport while browsing the long menu");

  assert.equal(await page.locator("#menu-root").getAttribute("aria-live"), null, "catalog unexpectedly became a live region");
  await searchInput.fill("Espresso");
  const renderedSearchItems = await page.locator("#menu-root .full-menu-item").count();
  const statusText = await page.locator("#menu-results-status").textContent();
  assert(statusText?.includes(String(renderedSearchItems)), "compact live status does not report the rendered result count");

  await searchInput.fill("");
  const featuredCard = page.locator("#pairing-offers .full-menu-item--visual").first();
  const featuredDetails = featuredCard.locator(".full-menu-item-details");
  const featuredDetailsText = await featuredDetails.textContent();
  assert(featuredDetailsText?.includes("Buzlu Latte + San Sebastian"), "featured card semantics omit the offer name");
  assert(featuredDetailsText?.includes("370 ₺"), "featured card semantics omit the offer price");
  assert.equal(await featuredDetails.getAttribute("aria-hidden"), null, "featured name, description, and price are hidden from assistive technology");
  assert.notEqual(
    await featuredDetails.evaluate((element) => getComputedStyle(element).display),
    "none",
    "featured details were removed from the accessibility tree"
  );
  assert((await featuredCard.locator("img").getAttribute("alt"))?.length, "featured image lost its localized alternative text");

  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${baseUrl}/menu.html?narrow-rail-test=1#pairing-offers`, { waitUntil: "domcontentloaded" });
  await page.locator("#pairing-offers").waitFor();
  const narrowNavBox = await page.locator("#menu-category-nav").boundingBox();
  const narrowRouteBox = await page.locator(".menu-route-quick").boundingBox();
  const lastChipBox = await page.locator('[data-category-id="pairing-offers"]').boundingBox();
  assert(narrowNavBox && narrowRouteBox && lastChipBox, "320px sticky controls have an incomplete layout");
  assert(narrowNavBox.x + narrowNavBox.width <= narrowRouteBox.x, "320px route action overlaps the category rail");
  assert(
    lastChipBox.x >= narrowNavBox.x && lastChipBox.x + lastChipBox.width <= narrowNavBox.x + narrowNavBox.width,
    `last category chip is not reachable and visible at 320px: ${JSON.stringify({ narrowNavBox, lastChipBox })}`
  );

  await context.close();
  console.log("✅ MENU-UX-001 passed: multilingual category search, stable keyboard focus, compact announcements, safe pairing visibility, accessible cards, and hash reset are gated.");
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
