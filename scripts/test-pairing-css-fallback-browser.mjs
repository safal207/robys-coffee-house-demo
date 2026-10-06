import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { verifyPairingGeometry } from "./test-pairing-discovery-browser.mjs";

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
          await page.route("**/pairing-posters.css?*", (route) => route.fulfill({
            status: 200, contentType: "text/css; charset=utf-8", body: fixture.css
          }));
          await page.goto(new URL("menu.html#pairing-offers", baseUrl).href, { waitUntil: "domcontentloaded" });
          await page.locator(`.lang-button[data-lang="${language}"]`).click();
          await page.locator("#pairing-offers .pairing-poster-overlay").nth(1).waitFor({ state: "attached" });
          await page.evaluate(async (scale) => {
            document.documentElement.style.fontSize = `${16 * scale}px`;
            await document.fonts.ready;
          }, scale);
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
          const evidence = { label, rejectedDeclarations: fixture.rejected.length, cards, geometryError, errors };
          check("PAIRING-CSS-FALLBACK-001", readable && !geometryError && errors.length === 0,
            `${label}: both posters retain readable type, photograph height and separated content`, evidence);
          results.push(evidence);
        } finally { await page.close(); }
      }
    }
  }
  return results;
}
