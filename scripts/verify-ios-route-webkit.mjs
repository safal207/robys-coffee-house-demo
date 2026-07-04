import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { webkit, devices } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const routePrefix = "https://www.google.com/maps/dir/";
const expectedDestination = "Roby's Coffee House Gazipasa";
const evidenceDir = "qa-artifacts";

await mkdir(evidenceDir, { recursive: true });

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul"
});

await context.route(`${routePrefix}**`, async (route) => {
  const requestedUrl = route.request().url();
  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><title>Google Maps route accepted</title><main data-route-url="${requestedUrl.replaceAll("&", "&amp;")}">Route accepted</main>`
  });
});

const evidence = [];

async function verifyPage(pathname, minimumRouteLinks) {
  const page = await context.newPage();
  const localUrl = new URL(pathname, `${baseUrl}/`).href;
  await page.goto(localUrl, { waitUntil: "domcontentloaded" });

  if (pathname === "index.html") {
  const heroPrimary = page.locator(".hero-actions .button-primary");
  assert.equal(await heroPrimary.getAttribute("href"), "menu.html#pairing-offers", "hero primary CTA must route to pairing offers");
  assert.equal(await heroPrimary.getAttribute("target"), null, "pairing CTA must stay in the current customer journey");
}

const routeLinks = page.locator(`a[href^="${routePrefix}"]`);
  const count = await routeLinks.count();
  assert.ok(count >= minimumRouteLinks, `${pathname}: expected at least ${minimumRouteLinks} route links, found ${count}`);

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

    await link.scrollIntoViewIfNeeded();
    const popupPromise = page.waitForEvent("popup", { timeout: 5000 });
    await link.click();
    const popup = await popupPromise;
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
  await verifyPage("index.html", 3);
  await verifyPage("menu.html", 1);

  await writeFile(
    `${evidenceDir}/ios-route-webkit.json`,
    `${JSON.stringify({ device: "iPhone 13", engine: "WebKit", passed: true, pages: evidence }, null, 2)}\n`,
    "utf8"
  );

  console.log("✅ iOS WebKit route gate passed: hero opens pairing offers and every retained route CTA opens a non-blank Google Maps driving route.");
} finally {
  await context.close();
  await browser.close();
}
