import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __galleryCls?: number;
  }
}

test.beforeEach(async ({ page }) => {
  // WebKit applies upgrade-insecure-requests before bypassCSP takes effect.
  // The local QA server is HTTP-only, so remove only that directive from the
  // document response. The production CSP remains covered by security jobs.
  await page.route("http://127.0.0.1:4173/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("upgrade-insecure-requests;", "");
    await route.fulfill({ response, body: html });
  });

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

test("all five source-quality posters render inside their square frames", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const expectedProductIds = [
    "latte",
    "san-sebastian",
    "croissant",
    "nutella-croissant",
    "lotus-cheesecake"
  ];
  const cards = page.locator(".poster-card");
  await expect(cards).toHaveCount(expectedProductIds.length);

  for (let index = 0; index < expectedProductIds.length; index += 1) {
    const card = cards.nth(index);
    const image = card.locator("img");
    await expect(card).toHaveAttribute("data-product-id", expectedProductIds[index]);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(image).toHaveJSProperty("complete", true);

    const result = await image.evaluate((element: HTMLImageElement) => {
      const frame = element.closest<HTMLElement>(".poster-card-frame");
      const imageRect = element.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        path: new URL(element.currentSrc || element.src).pathname,
        naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight,
        loading: element.loading,
        objectFit: style.objectFit,
        imageRect: {
          top: imageRect.top,
          right: imageRect.right,
          bottom: imageRect.bottom,
          left: imageRect.left
        },
        frameRect: frameRect ? {
          top: frameRect.top,
          right: frameRect.right,
          bottom: frameRect.bottom,
          left: frameRect.left
        } : null
      };
    });

    expect(result.path).toMatch(/^\/src\/products\/gallery-v5\/[a-z0-9-]+\.webp$/);
    expect(result.naturalWidth).toBe(1536);
    expect(result.naturalHeight).toBe(1536);
    expect(result.loading).toBe(index === 0 ? "eager" : "lazy");
    expect(result.objectFit).toBe("contain");
    expect(result.frameRect).not.toBeNull();

    const frame = result.frameRect!;
    expect(result.imageRect.top).toBeGreaterThanOrEqual(frame.top - 1);
    expect(result.imageRect.left).toBeGreaterThanOrEqual(frame.left - 1);
    expect(result.imageRect.right).toBeLessThanOrEqual(frame.right + 1);
    expect(result.imageRect.bottom).toBeLessThanOrEqual(frame.bottom + 1);
    await expect(card).not.toHaveClass(/is-error/);

    const productId = await card.getAttribute("data-product-id");
    await test.info().attach(`gallery-${index + 1}-${productId ?? "unknown"}`, {
      body: await card.screenshot({ animations: "disabled" }),
      contentType: "image/png"
    });
  }

  await test.info().attach("gallery-section", {
    body: await page.locator(".featured-strip").screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });

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
  await page.route("**/san-sebastian.webp?*", (route) => route.abort());
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

test("daily social offer fits between the map and footer", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const offer = page.locator("#daily-offer");
  await offer.scrollIntoViewIfNeeded();
  await expect(offer).toBeVisible();
  await expect(offer.locator(".social-offer-title")).toHaveText("Bugün Roby's'de");
  await expect(offer.locator(".social-offer-price")).toHaveText("340 ₺");
  await expect(offer.locator('a[href="https://www.instagram.com/robyscoffeehouse/"]')).toHaveCount(2);

  const layout = await offer.evaluate((element) => {
    const card = element.querySelector<HTMLElement>(".social-offer-card");
    const map = document.querySelector<HTMLElement>("#visit");
    const footer = document.querySelector<HTMLElement>(".site-footer");
    const rect = card?.getBoundingClientRect();
    return {
      left: rect?.left ?? -1,
      right: rect?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: document.documentElement.clientWidth,
      followsMap: Boolean(map && (map.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)),
      precedesFooter: Boolean(footer && (element.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING))
    };
  });

  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.followsMap).toBe(true);
  expect(layout.precedesFooter).toBe(true);

  await page.locator('[data-lang="ru"]').click();
  await expect(offer.locator(".social-offer-title")).toHaveText("Сегодня в Roby’s");
  await expect(offer.locator(".social-offer-social-text")).toHaveText("Отметь нас в Instagram");

  await test.info().attach("daily-social-offer", {
    body: await offer.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
