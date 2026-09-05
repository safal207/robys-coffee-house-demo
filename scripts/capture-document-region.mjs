/** Capture document-flow layout without locator auto-scroll moving sticky UI over it.
 * This is layout evidence, not a viewport interaction check; test reachability separately.
 * No nodes, styles, sticky positioning, viewport dimensions or thresholds are changed.
 */
export async function captureDocumentRegion(page, locator, filePath) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const box = await locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0 || box.x < 0 || box.y < 0) {
    throw new Error("VISUAL-REGION-001: target has no valid document rectangle");
  }
  return page.screenshot({
    ...(filePath ? { path: filePath } : {}), fullPage: true, clip: box,
    animations: "disabled", scale: "css"
  });
}
