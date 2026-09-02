import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { webkit, devices } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:4173";
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
    `.menu-controls .menu-route-quick[href^="${routePrefix}"]`,
    `.menu-share-actions .menu-inline-link[href^="${routePrefix}"]`,
    `.menu-page-cta-actions .menu-dark-secondary-button[href^="${routePrefix}"]`
  ]
};

await mkdir(evidenceDir, { recursive: true });

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  locale: "tr-TR",
  timezoneId: "Europe/Istanbul"
});

// Production is HTTPS, while this gate intentionally serves the exact revision
// over local HTTP. WebKit applies the production upgrade directive to localhost
// subresources, so remove only that directive from local document responses.
if (new URL(baseUrl).protocol === "http:") {
  await context.route(`${new URL(baseUrl).origin}/**`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const body = (await response.text()).replace(/\s*upgrade-insecure-requests\s*;?/gu, "");
    await route.fulfill({ response, body });
  });
}

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

  if (pathname === "index.html") {
    const heroPrimary = page.locator('.hero-actions .button[href="menu.html"]');
    const smartChoiceSecondary = page.locator('.hero-actions [data-smart-choice-entry]');
    const pairingSecondary = page.locator('.hero-actions [data-analytics-action="pairing_click"]');
    assert.equal(await heroPrimary.getAttribute("href"), "menu.html", "hero primary CTA must route to the full menu");
    assert.equal(await heroPrimary.getAttribute("target"), null, "full-menu CTA must stay in the current customer journey");
    assert.equal(await pairingSecondary.getAttribute("href"), "menu.html#pairing-offers", "hero secondary CTA must route to pairing offers");
    assert.equal(await pairingSecondary.getAttribute("target"), null, "pairing CTA must stay in the current customer journey");
    assert.equal(await heroPrimary.isVisible(), true, "full-menu CTA must remain visible after Smart Choice enhances the mobile hero");
    assert.equal(await smartChoiceSecondary.isVisible(), true, "Smart Choice must remain available as the second mobile action");
    assert.equal(await pairingSecondary.isVisible(), false, "pairing CTA must stay hidden in the compact mobile hero");
    const [menuBox, smartChoiceBox] = await Promise.all([
      heroPrimary.boundingBox(),
      smartChoiceSecondary.boundingBox()
    ]);
    assert.ok(menuBox && smartChoiceBox, "visible mobile hero actions must have layout boxes");
    assert.ok(menuBox.y < smartChoiceBox.y, "full-menu CTA must render before Smart Choice on mobile");
    assert.equal(
      await page.evaluate(() => {
        const menu = document.querySelector('.hero-actions .button[href="menu.html"]');
        const smartChoice = document.querySelector('.hero-actions [data-smart-choice-entry]');
        return Boolean(menu && smartChoice && (menu.compareDocumentPosition(smartChoice) & Node.DOCUMENT_POSITION_FOLLOWING));
      }),
      true,
      "full-menu CTA must precede Smart Choice in DOM and assistive-technology order"
    );
    assert.equal(await smartChoiceSecondary.evaluate((element) => element.tabIndex), 0, "Smart Choice must stay in the default focus order");
    await smartChoiceSecondary.focus();
    assert.equal(
      await page.evaluate(() => document.activeElement?.hasAttribute("data-smart-choice-entry")),
      true,
      "Smart Choice must remain keyboard focusable in mobile WebKit"
    );
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

    // Use one fresh source page per activation so WebKit's popup throttling does
    // not turn the third valid user tap into a false negative.
    const activationPage = await context.newPage();
    await activationPage.goto(localUrl, { waitUntil: "domcontentloaded" });
    const activationLink = activationPage.locator(`a[href^="${routePrefix}"]`).nth(index);
    if (await activationLink.evaluate((element) => Boolean(element.closest(".mobile-cta")))) {
      await activationPage.locator("#about").scrollIntoViewIfNeeded();
      await activationPage.locator(".mobile-cta.is-visible").waitFor({ state: "visible", timeout: 5000 });
    }
    await activationLink.scrollIntoViewIfNeeded();
    let popup;
    try {
      [popup] = await Promise.all([
        context.waitForEvent("page", { timeout: 5000, predicate: (candidate) => candidate !== activationPage }),
        activationLink.tap()
      ]);
    } catch (error) {
      await activationPage.close().catch(() => {});
      throw new Error(`${pathname}: route link ${index + 1} did not open a new tab after a real touch tap`, { cause: error });
    }
    await popup.waitForLoadState("domcontentloaded");

    assert.notEqual(popup.url(), "about:blank", `${pathname}: route link opened a blank iOS tab`);
    assert.ok(popup.url().startsWith(routePrefix), `${pathname}: route popup opened an unexpected URL: ${popup.url()}`);
    assert.equal(activationPage.url(), localUrl, `${pathname}: source page was unexpectedly replaced`);

    pageEvidence.routeLinks.push({ index, href, popupUrl: popup.url(), passed: true });
    await popup.close();
    await activationPage.close();
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

  console.log("✅ iOS WebKit route gate passed: hero opens the full menu, keeps pairings secondary, and every named route CTA opens a non-blank Google Maps driving route.");
} finally {
  await context.close();
  await browser.close();
}
