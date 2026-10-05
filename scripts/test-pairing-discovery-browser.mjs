// Keep the inline pairing route covered separately from ordinary product modals.
export async function verifyPairingDiscovery(context, baseUrl, check) {
  for (const language of ["tr", "en", "ru"]) {
    for (const fallback of [false, true]) {
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const label = `${language}/${fallback ? "fallback" : "native"}`;
      try {
        await page.goto(new URL("menu.html#pairing-offers", baseUrl).href, { waitUntil: "domcontentloaded" });
        await page.locator(`.lang-button[data-lang="${language}"]`).click();
        const opener = page.locator("#pairing-offers .full-menu-item-media[data-discover-pairing]").first();
        await opener.waitFor({ state: "visible" });
        if (fallback) {
          await page.evaluate(() => {
            document.querySelectorAll("dialog").forEach((dialog) => {
              Object.defineProperty(dialog, "showModal", { configurable: true, value: undefined });
            });
          });
        }
        const initialCount = await page.locator("#menu-cart-count").textContent();
        await opener.focus();
        await page.keyboard.press("Enter");
        const panel = page.locator(".pairing-discovery-panel");
        await panel.waitFor({ state: "visible" });
        const name = await panel.locator("h3").textContent();
        const inline = {
          language: await page.locator("html").getAttribute("lang"),
          expanded: await opener.getAttribute("aria-expanded"),
          controls: await opener.getAttribute("aria-controls"),
          panelId: await panel.getAttribute("id"),
          openModals: await page.locator(".menu-dialog[open]").count()
        };
        await panel.locator(".pairing-discovery-choose").click();
        const dialog = page.locator("#menu-product-dialog[open]");
        await dialog.waitFor({ state: "visible" });
        const product = {
          name: await page.locator("#menu-product-title").textContent(),
          fallback: await dialog.evaluate((node) => node.classList.contains("menu-dialog--fallback")),
          draftNote: await page.locator("#menu-product-draft-note").textContent()
        };
        await dialog.locator('[data-menu-dialog-close="product"]').click();
        await page.locator("#menu-product-dialog").waitFor({ state: "hidden" });
        await panel.locator(".pairing-discovery-close").click();
        await panel.waitFor({ state: "detached" });
        const closed = {
          expanded: await opener.getAttribute("aria-expanded"),
          controls: await opener.getAttribute("aria-controls"),
          focusReturned: await opener.evaluate((node) => document.activeElement === node),
          count: await page.locator("#menu-cart-count").textContent()
        };
        check(
          "PAIRING-DISCOVERY-BROWSER-001",
          inline.language === language && inline.expanded === "true" &&
            Boolean(inline.panelId) && inline.controls === inline.panelId && inline.openModals === 0 &&
            Boolean(name) && product.name === name && product.fallback === fallback && Boolean(product.draftNote?.trim()) &&
            closed.expanded === "false" && closed.controls === null && closed.focusReturned &&
            closed.count === initialCount && errors.length === 0,
          `${label}: keyboard opens inline discovery, choose opens the matching draft, close restores focus without ordering`,
          { inline, product, closed, errors }
        );
      } catch (error) {
        check("PAIRING-DISCOVERY-BROWSER-001", false, `${label}: pairing discovery failed`, {
          error: String(error?.stack ?? error), errors
        });
      } finally {
        await page.close().catch(() => {});
      }
    }
  }
}
