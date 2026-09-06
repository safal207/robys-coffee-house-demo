import assert from "node:assert/strict";
import { captureDocumentRegion } from "./capture-document-region.mjs";

// This component crop compares internal presentation. Its original document
// position remains in the geometry report and unmodified full-page/raw captures.
// Align the origin by at most half a CSS pixel on each axis, on BOTH revisions.
// Do not use this for viewport reachability, page layout or transformed surfaces.
export async function captureAlignedShare(page, locator, filePath) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  const before = await snapshot(locator);
  const originalStyle = await locator.getAttribute("style");
  const offset = { x: Math.round(before.origin.x) - before.origin.x,
    y: Math.round(before.origin.y) - before.origin.y };
  try {
    await locator.evaluate((element, delta) => {
      const style = getComputedStyle(element);
      if (!element.matches(".menu-share-card") || style.position !== "static"
          || style.transform !== "none" || style.translate !== "none") {
        throw new Error("VISUAL-ALIGN-001: unsupported share-card positioning");
      }
      element.style.setProperty("position", "relative", "important");
      element.style.setProperty("left", `${delta.x}px`, "important");
      element.style.setProperty("top", `${delta.y}px`, "important");
    }, offset);
    const aligned = await snapshot(locator);
    assert.deepEqual(aligned.relative, before.relative,
      "VISUAL-ALIGN-002: origin alignment changed internal layout or presentation");
    assert.deepEqual(aligned.origin, {
      x: Math.round(before.origin.x), y: Math.round(before.origin.y)
    }, "VISUAL-ALIGN-003: component origin did not align");
    await captureDocumentRegion(page, locator, filePath);
    return { originalOrigin: before.origin, alignedOrigin: aligned.origin, offset };
  } finally {
    await locator.evaluate((element, style) => {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }, originalStyle);
    assert.deepEqual(await snapshot(locator), before,
      "VISUAL-ALIGN-004: original share-card state was not restored");
  }
}

async function snapshot(locator) {
  return locator.evaluate((element) => {
    const root = element.getBoundingClientRect();
    return {
      origin: { x: root.x + scrollX, y: root.y + scrollY },
      relative: [element, ...element.querySelectorAll("*")].map((node) => {
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { x: box.x - root.x, y: box.y - root.y,
          width: box.width, height: box.height, text: node.textContent,
          font: style.font, color: style.color, background: style.background,
          border: style.border, boxShadow: style.boxShadow,
          pseudo: ["::before", "::after"].map((pseudo) => {
            const css = getComputedStyle(node, pseudo);
            return ["content", "position", "top", "left", "width", "height",
              "font", "color", "background", "transform"].map(key => css[key]);
          }) };
      })
    };
  });
}
