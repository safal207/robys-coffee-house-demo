import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { webkit, devices } from "playwright";

const baseUrl = process.env.BASE_URL ?? "https://127.0.0.1:4173";
const baseOrigin = new URL(baseUrl);
assert.equal(baseOrigin.protocol, "https:", "WebKit route evidence requires HTTPS with the production CSP");
const routePrefix = "https://www.google.com/maps/dir/";
const expectedDestination = "Roby's Coffee House Gazipasa";
const evidenceDir = "qa-artifacts";

const expectedRouteSelectors = {
  "index.html": [
    `.visit-section .visit-actions a[href^="${routePrefix}"]`,
    `.visit-section .map-live-link[href^="${routePrefix}"]`,
    `.mobile-cta .mobile-cta-route[href^="${routePrefix}"]`
  ],
  "menu.html": [
    `.menu-share-actions .menu-inline-link[href^="${routePrefix}"]`,
    `.menu-page-cta-actions .menu-dark-secondary-button[href^="${routePrefix}"]`
  ]
};

await mkdir(evidenceDir, { recursive: true });

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  // Only the ephemeral loopback certificate is self-signed; deployed sites
  // still require normal certificate validation. CSP remains fully enabled.
  ignoreHTTPSErrors: ["127.0.0.1", "localhost"].includes(baseOrigin.hostname),
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul"
});
await context.tracing.start({ screenshots: true, snapshots: true });

await context.route(`${routePrefix}**`, async (route) => {
  const requestedUrl = route.request().url();
  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><title>Google Maps route accepted</title><main data-route-url="${requestedUrl.replaceAll("&", "&amp;")}">Route accepted</main>`
  });
});

const evidence = [];

async function verifyPage(pathname) {
  const page = await context.newPage();
  const localUrl = new URL(pathname, `${baseUrl}/`).href;
  await page.goto(localUrl, { waitUntil: "domcontentloaded" });
  // These authored, blocking styles must be loaded by DOMContentLoaded.
  // Use direct DOM inspection: waitForFunction internally compiles a string,
  // which conflicts with the page's enforced Trusted Types policy.
  for (const stylesheet of ["styles-v2.css", pathname === "index.html" ? "map-live.css" : "menu-premium.css"]) {
    const loaded = await page.locator(`link[rel="stylesheet"][href^="${stylesheet}"]`)
      .evaluate(link => Boolean(link.sheet && link.sheet.cssRules.length));
    assert(loaded, `${pathname}: required stylesheet did not load: ${stylesheet}`);
  }

  if (pathname === "index.html") {
    await page.locator(".hero-actions [data-smart-choice-entry]").waitFor({ state: "attached" });
    const heroPrimary = page.locator(".hero-actions .button-primary");
    assert.equal(await heroPrimary.count(), 1, "enhanced hero must have exactly one primary CTA");
    assert.equal(await heroPrimary.getAttribute("href"), "smart-choice/", "enhanced hero primary CTA must route to Smart Choice");
    assert.equal(await heroPrimary.getAttribute("target"), null, "Smart Choice must stay in the current customer journey");
    const pairing = page.locator('.hero-actions a[href="menu.html#pairing-offers"]');
    assert.equal(await pairing.count(), 1, "enhancement must retain the direct pairing CTA");
    assert.equal(await pairing.getAttribute("target"), null, "pairing CTA must stay in the current customer journey");
  }

  const selectors = expectedRouteSelectors[pathname];
  assert.ok(selectors, `${pathname}: no exact route selector contract is defined`);

  for (const selector of selectors) {
    assert.equal(await page.locator(selector).count(), 1, `${pathname}: expected exactly one route CTA for ${selector}`);
  }

  const routeLinks = page.locator(`a[href^="${routePrefix}"]`);
  const count = await routeLinks.count();
  assert.equal(count, selectors.length, `${pathname}: expected exactly ${selectors.length} intended route CTAs, found ${count}`);

  const pageEvidence = { pathname, routeLinks: [] };

  for (let index = 0; index < count; index += 1) {
    const link = routeLinks.nth(index);
    const href = await link.getAttribute("href");
    assert.ok(href, `${pathname}: route link ${index + 1} has no href`);

    const destination = new URL(href);
    assert.equal(destination.protocol, "https:", `${pathname}: route link must use HTTPS`);
    assert.equal(destination.hostname, "www.google.com", `${pathname}: route link must target Google Maps`);
    assert.equal(destination.pathname, "/maps/dir/", `${pathname}: route link must open Directions mode`);
    assert.equal(destination.searchParams.get("api"), "1", `${pathname}: route link must use Maps URL API v1`);
    assert.equal(destination.searchParams.get("destination"), expectedDestination, `${pathname}: wrong route destination`);
    assert.equal(destination.searchParams.get("travelmode"), "driving", `${pathname}: route must default to driving`);

    console.log(`Checking ${pathname} route ${index + 1}/${count}: ${await link.getAttribute("class")}`);
    if (await link.evaluate(node => Boolean(node.closest(".mobile-cta")))) {
      // The dock intentionally hides beside the visit/footer sections. Reach
      // its normal visible state before exercising the actual user click.
      await page.locator("#about").scrollIntoViewIfNeeded();
      await page.locator(".mobile-cta.is-visible").waitFor({ state: "visible" });
    } else {
      await link.scrollIntoViewIfNeeded();
    }
    await link.click({ trial: true });
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 5000 }),
      link.click()
    ]);
    await popup.waitForLoadState("domcontentloaded");

    assert.notEqual(popup.url(), "about:blank", `${pathname}: route link opened a blank iOS tab`);
    assert.ok(popup.url().startsWith(routePrefix), `${pathname}: route popup opened an unexpected URL: ${popup.url()}`);
    assert.equal(page.url(), localUrl, `${pathname}: source page was unexpectedly replaced`);

    pageEvidence.routeLinks.push({ index, href, popupUrl: popup.url(), passed: true });
    await popup.close();
  }

  if (pathname === "index.html") {
    const mapCard = page.locator(".map-card-live");
    await mapCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidenceDir}/ios-route-map.png`, fullPage: false });
  }

  evidence.push(pageEvidence);
  await page.close();
}

try {
  await verifyPage("index.html");
  await verifyPage("menu.html");

  await writeFile(
    `${evidenceDir}/ios-route-webkit.json`,
    `${JSON.stringify({ device: "iPhone 13", engine: "WebKit", passed: true, pages: evidence }, null, 2)}\n`,
    "utf8"
  );

  console.log("✅ iOS WebKit route gate passed: styled hero offers Smart Choice and direct pairings; every named route CTA opens a non-blank Google Maps driving route.");
} finally {
  await context.tracing.stop({ path: `${evidenceDir}/ios-route-trace.zip` });
  await context.close();
  await browser.close();
}
