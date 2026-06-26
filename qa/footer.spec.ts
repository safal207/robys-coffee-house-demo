import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // The local QA server is HTTP-only; production CSP remains checked separately.
  await page.route("http://127.0.0.1:4173/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("upgrade-insecure-requests;", "");
    await route.fulfill({ response, body: html });
  });
});

test("mobile document ends on the dark footer without a cream spacer", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);

  const footer = page.locator(".site-footer");
  await expect(footer).toBeVisible();

  const result = await footer.evaluate((element) => {
    const footer = element as HTMLElement;
    const bodyStyle = getComputedStyle(document.body);
    const footerStyle = getComputedStyle(footer);
    const documentHeight = document.documentElement.scrollHeight;
    const footerEnd = footer.offsetTop + footer.offsetHeight;

    return {
      bodyPaddingBottom: Number.parseFloat(bodyStyle.paddingBottom),
      footerBackground: footerStyle.backgroundColor,
      trailingSpace: documentHeight - footerEnd,
      viewportOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  expect(result.bodyPaddingBottom).toBe(0);
  expect(Math.abs(result.trailingSpace)).toBeLessThanOrEqual(1);
  expect(result.footerBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(result.footerBackground).not.toBe("rgb(244, 241, 236)");
  expect(result.viewportOverflow).toBeLessThanOrEqual(1);

  await test.info().attach("mobile-footer-end", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png"
  });
});
