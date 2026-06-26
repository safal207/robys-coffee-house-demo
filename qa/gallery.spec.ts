import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __galleryCls?: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__galleryCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) window.__galleryCls = (window.__galleryCls ?? 0) + (shift.value ?? 0);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
});

test("all five gallery images render without horizontal overflow", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const cards = page.locator(".poster-card");
  await expect(cards).toHaveCount(5);

  for (let index = 0; index < 5; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.locator("img")).toHaveJSProperty("complete", true);

    const naturalWidth = await card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
    await expect(card).not.toHaveClass(/is-error/);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("bottom panel leaves the viewport while the gallery is active", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator(".mobile-cta");
  const gallery = page.locator(".featured-strip");
  await expect(panel).toBeVisible();

  await gallery.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);

  await expect(page.locator("body")).toHaveClass(/featured-gallery-active/);
  await expect(panel).toHaveCSS("opacity", "0");
  await expect(panel).toHaveCSS("pointer-events", "none");
});

test("failed image keeps the same reserved card height", async ({ page }) => {
  await page.route("**/san-sebastian-card.v3.svg?*", (route) => route.abort());
  await page.goto("/", { waitUntil: "networkidle" });

  const failed = page.locator('[data-product-id="san-sebastian"]');
  const healthy = page.locator('[data-product-id="latte"]');
  await expect(failed).toHaveClass(/is-error/);

  const failedBox = await failed.locator(".poster-card-frame").boundingBox();
  const healthyBox = await healthy.locator(".poster-card-frame").boundingBox();
  expect(failedBox).not.toBeNull();
  expect(healthyBox).not.toBeNull();
  expect(Math.abs((failedBox?.height ?? 0) - (healthyBox?.height ?? 0))).toBeLessThanOrEqual(1);
});

test("gallery image loading stays below the CLS budget", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const cards = page.locator(".poster-card");
  for (let index = 0; index < 5; index += 1) {
    await cards.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);

  const cls = await page.evaluate(() => window.__galleryCls ?? 0);
  expect(cls).toBeLessThan(0.1);
});
