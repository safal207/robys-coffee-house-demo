import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { verifyPairingGeometry } from "./test-pairing-discovery-browser.mjs";
import { MENU_STYLESHEET_FILE, MENU_STYLE_INPUTS, compileMenuStylesBundle,
  menuStylesSourceMap, readMenuStylesSources } from "./menu-styles-bundle.mjs";

// Simulate declaration rejection, rather than changing CSS.supports in a browser
// that continues to understand cqw. Other properties and media rules stay intact.
export function rejectContainerWidthDeclarations(source) {
  const stylesheet = postcss.parse(source);
  const rejected = [];
  stylesheet.walkDecls((declaration) => {
    if (!/[+-]?(?:\d*\.?\d+)cqw\b/i.test(declaration.value)) return;
    rejected.push({ property: declaration.prop, value: declaration.value });
    declaration.remove();
  });
  assert.ok(rejected.length > 0, "unsupported-unit fixture must reject actual cqw declarations");
  return { css: stylesheet.toString(), rejected };
}

export async function pairingPosterDimensions(page) {
  return page.locator("#pairing-offers .pairing-poster-card").evaluateAll((cards) => cards.map((card) => {
    const media = card.querySelector(".full-menu-item-media");
    const bounds = media.getBoundingClientRect();
    const style = (selector) => getComputedStyle(card.querySelector(selector));
    const overlay = style(".pairing-poster-overlay");
    const title = style(".pairing-poster-title-main");
    const plus = style(".pairing-poster-title-plus");
    const accent = style(".pairing-poster-title-accent");
    const price = style(".pairing-poster-price strong");
    const bottom = style(".pairing-poster-bottom");
    return {
      id: card.dataset.pairing, width: bounds.width, height: bounds.height,
      rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
      titleFont: parseFloat(title.fontSize), plusFont: parseFloat(plus.fontSize),
      accentFont: parseFloat(accent.fontSize), priceFont: parseFloat(price.fontSize),
      overlayMinHeight: overlay.minHeight, gap: overlay.gap, padding: overlay.padding,
      titleFamily: title.fontFamily, plusFamily: plus.fontFamily,
      priceFamily: price.fontFamily, bottomFont: bottom.fontSize,
      priceWidth: style(".pairing-poster-price").width,
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  }));
}

export async function verifyPairingCssFallback(context, baseUrl, check, options = {}) {
  const source = options.css ?? readFileSync("pairing-posters.css", "utf8");
  const fixture = rejectContainerWidthDeclarations(source);
  const sources = readMenuStylesSources();
  const originalBundle = compileMenuStylesBundle(sources);
  const fallbackSources = { ...sources, "pairing-posters.css": Buffer.from(fixture.css) };
  const fallbackBundle = compileMenuStylesBundle(fallbackSources);
  const originalMap = menuStylesSourceMap(sources);
  const fallbackMap = menuStylesSourceMap(fallbackSources);
  assert.deepEqual(fallbackMap.map(({ source }) => source), originalMap.map(({ source }) => source),
    "Unsupported-unit fixture must preserve the complete stylesheet cascade order");
  const pairingIndex = originalMap.findIndex(({ source }) => source === "pairing-posters.css");
  assert.ok(pairingIndex >= 0, "Bundle must expose the real pairing CSS source segment");
  const pairingBefore = originalMap[pairingIndex];
  const pairingAfter = fallbackMap[pairingIndex];
  assert.deepEqual(fallbackBundle.subarray(0, pairingAfter.start), originalBundle.subarray(0, pairingBefore.start),
    "Unsupported-unit fixture must preserve every byte before the pairing segment");
  assert.deepEqual(fallbackBundle.subarray(pairingAfter.end), originalBundle.subarray(pairingBefore.end),
    "Unsupported-unit fixture must preserve every byte after the pairing segment");
  for (const [index, segment] of originalMap.entries()) {
    if (index === pairingIndex) continue;
    const fallbackSegment = fallbackMap[index];
    assert.deepEqual(fallbackBundle.subarray(fallbackSegment.start, fallbackSegment.end), sources[segment.source],
      `${segment.source}: unsupported-unit fixture must preserve the other CSS source bytes`);
  }
  const results = [];
  for (const width of options.widths ?? [320, 390, 768, 1440]) {
    for (const language of options.languages ?? ["tr", "en", "ru"]) {
      for (const scale of options.scales ?? [1, 2]) {
        const label = `cqw-rejected/${language}/${width}/${scale * 100}%`;
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        try {
          await page.setViewportSize({ width, height: 1080 });
          let interceptedRequests = 0;
          const interceptedTypes = [];
          await page.route((url) => url.pathname.endsWith(`/${MENU_STYLESHEET_FILE}`), async (route) => {
            const response = await route.fetch();
            assert.equal(response.status(), 200, "Unsupported-unit fixture must intercept the delivered menu bundle");
            assert.deepEqual(await response.body(), originalBundle,
              "Unsupported-unit fixture must start from the complete emitted menu CSS bundle");
            interceptedRequests += 1;
            interceptedTypes.push(route.request().resourceType());
            await route.fulfill({ response, body: fallbackBundle });
          });
          await page.goto(new URL("menu.html#pairing-offers", baseUrl).href, { waitUntil: "domcontentloaded" });
          await page.locator(`.lang-button[data-lang="${language}"]`).click();
          await page.locator("#pairing-offers .pairing-poster-overlay").nth(1).waitFor({ state: "attached" });
          await page.evaluate(async (scale) => {
            document.documentElement.style.fontSize = `${16 * scale}px`;
            await document.fonts.ready;
          }, scale);
          await page.waitForFunction((scale) => {
            const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const cards = [...document.querySelectorAll("#pairing-offers .pairing-poster-card")];
            return root === 16 * scale && cards.length === 2 && cards.every(card =>
              [[".pairing-poster-title-main", 1.5], [".pairing-poster-title-plus", 1.5],
                [".pairing-poster-title-accent", 1.1], [".pairing-poster-price strong", 1.2]]
                .every(([selector, floor]) => parseFloat(getComputedStyle(card.querySelector(selector)).fontSize) >= root * floor - .1));
          }, scale, { timeout: 15000 });
          let geometryError = null;
          try { await verifyPairingGeometry(page, label); }
          catch (error) { geometryError = error.message; }
          const cards = await pairingPosterDimensions(page);
          const readable = cards.length === 2 && cards.every((card) =>
            card.height >= Math.max(240, card.width * .8) - 1 &&
            card.titleFont >= card.rootFont * 1.5 - .1 &&
            card.plusFont >= card.rootFont * 1.5 - .1 &&
            card.accentFont >= card.rootFont * 1.1 - .1 &&
            card.priceFont >= card.rootFont * 1.2 - .1 && !card.documentOverflow);
          // A fetch used to warm the opposite view does not apply a stylesheet.
          // Routing disables normal cache reuse, so it can reach this fixture
          // even though the same CSS has already loaded. Keep exactly one real
          // stylesheet load, permit at most one speculative fetch, and deliver
          // the identical rejected-declaration fixture for both request types.
          const stylesheetRequests = interceptedTypes.filter(type => type === "stylesheet").length;
          const speculativeFetches = interceptedTypes.filter(type => type === "fetch").length;
          const deliveryValid = stylesheetRequests === 1 && speculativeFetches <= 1
            && interceptedRequests === stylesheetRequests + speculativeFetches;
          const evidence = { label, rejectedDeclarations: fixture.rejected.length,
            interceptedStylesheet: MENU_STYLESHEET_FILE, interceptedRequests, interceptedTypes,
            stylesheetRequests, speculativeFetches, deliveryValid,
            preservedStylesheets: MENU_STYLE_INPUTS.filter(({ source }) => source !== "pairing-posters.css").map(({ source }) => source),
            cards, geometryError, errors };
          check("PAIRING-CSS-FALLBACK-001", deliveryValid && readable && !geometryError && errors.length === 0,
            `${label}: both posters retain readable type, photograph height and separated content`, evidence);
          results.push(evidence);
        } finally { await page.close(); }
      }
    }
  }
  return results;
}
