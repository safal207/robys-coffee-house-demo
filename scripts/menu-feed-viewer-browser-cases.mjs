import assert from "node:assert/strict";

// Runs inside the menu-feed harness, against built public bytes over HTTPS and
// its real CSP. Pointer drags below use Playwright's mouse, not synthetic
// dispatchEvent touch events; physical touch/OS share sheets remain untested.
export async function runFeedViewerCases({ browser, origin, engine, output, observeErrors, captureScreenshot, report, catalog }) {
  const viewer = "#feed-viewer";
  const viewsKey = id => `robys-feed-views-v1:${id}`;
  const hot = catalog.filter(product => product.category.id === "hot-coffee");
  assert.ok(hot.length >= 3, "Story coverage needs three real hot-coffee products");
  const currentId = page => page.locator(viewer).getAttribute("data-product-id");
  const count = (page, id) => page.evaluate(key => Number(localStorage.getItem(key) ?? 0), viewsKey(id));
  const waitForId = (page, id) => page.waitForFunction(id => document.querySelector("#feed-viewer")?.dataset.productId === id, id);
  const waitForCount = (page, id, value) => page.waitForFunction(({ key, value }) => Number(localStorage.getItem(key) ?? 0) === value, { key: viewsKey(id), value });
  async function ready(page, mode) {
    await page.locator(`${viewer}[open][data-mode="${mode}"][data-state="ready"]`).waitFor();
    await page.locator("#feed-viewer-image").evaluate(image => image.decode());
  }
  async function imageFits(page) {
    const geometry = await page.locator("#feed-viewer-image").evaluate(image => {
      const box = image.getBoundingClientRect(), dialog = image.closest("dialog").getBoundingClientRect();
      const ratio = image.naturalWidth / image.naturalHeight;
      return { loaded: image.complete && image.naturalWidth > 0,
        inside: box.left >= dialog.left - 1 && box.right <= dialog.right + 1
          && box.top >= dialog.top - 1 && box.bottom <= dialog.bottom + 1,
        preservesWholeImage: getComputedStyle(image).objectFit === "contain"
          || Math.abs(box.width / box.height - ratio) < .01,
        rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        dialogOverflow: image.closest("dialog").scrollWidth > image.closest("dialog").clientWidth + 1 };
    });
    assert.deepEqual(geometry, { loaded: true, inside: true, preservesWholeImage: true, rootOverflow: false, dialogOverflow: false },
      "A complete catalog photograph fits the viewer without cropping or horizontal overflow");
  }
  async function hitTarget(page, selector) {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    const hit = await target.evaluate(node => {
      const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { size: box.width >= 44 && box.height >= 44, inside: box.left >= 0 && box.right <= document.documentElement.clientWidth + 1
        && box.top >= 0 && box.bottom <= innerHeight + 1, hit: hit === node || node.contains(hit) };
    });
    assert.deepEqual(hit, { size: true, inside: true, hit: true }, `${selector} remains a visible, unobscured 44px target`);
  }
  async function contextFor({ width = 390, height = 844, language = "en", reducedMotion = "reduce", nativeShare = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion, ignoreHTTPSErrors: true, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(({ language, nativeShare }) => {
      localStorage.setItem("robys-language", language);
      if (!nativeShare) Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    }, { language, nativeShare });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; observeErrors(page, errors);
    return { context, page, errors, language };
  }
  async function openFeed(page, language) {
    await page.goto(`${origin}/menu-feed.html?view=feed&lang=${language}`, { waitUntil: "domcontentloaded" });
    await page.locator('#feed[data-ready="true"]').waitFor();
    await page.locator("#feed-stories .feed-story").first().waitFor();
  }
  async function closeViewer(page, opener) {
    await page.locator("#feed-viewer-close").click();
    await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), opener);
  }
  async function cleanErrors(errors) { assert.deepEqual(errors, [], "Stories/Reels produce no application page or console errors"); }

  {
    const { context, page, errors } = await contextFor({ reducedMotion: "no-preference" });
    const releases = [];
    for (const product of hot.slice(0, 3)) {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      releases.push(release);
      await context.route(`${new URL(product.image, origin + "/").href}*`, async route => { await gate; await route.continue(); });
    }
    try {
      await openFeed(page, "en");
      const opener = '#feed-stories .feed-story[data-story-category="hot-coffee"]';
      await page.locator(opener).click();
      await page.locator(`${viewer}[open][data-mode="stories"][data-state="loading"]`).waitFor();
      assert.equal(await currentId(page), hot[0].id);
      await page.waitForTimeout(1150);
      assert.equal(await count(page, hot[0].id), 0, "Rendering a story before its photograph loads is not a view");
      await page.locator("#feed-viewer-pause").click();
      releases[0]();
      await ready(page, "stories");
      assert.equal(await page.locator(viewer).getAttribute("data-paused"), "true");
      await waitForCount(page, hot[0].id, 1);
      assert.equal(await page.locator(".feed-viewer-segment").first().evaluate(progress => progress.value), 0,
        "Explicit pause stops Story progress while a loaded foreground photograph still qualifies as viewed");
      await imageFits(page);
      assert.equal(await page.locator(".feed-viewer-segment").count(), hot.length);
      assert.equal(await page.locator("#feed-viewer-view-count").textContent(), "1");
      await page.locator("#feed-viewer-pause").click();
      const image = await page.locator("#feed-viewer-image").boundingBox();
      const x = image.x + image.width * .4, y = image.y + image.height * .5;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.waitForFunction(() => document.querySelector("#feed-viewer").dataset.paused === "true");
      const held = await page.locator(".feed-viewer-segment").first().evaluate(progress => progress.value);
      await page.waitForTimeout(300);
      assert.ok(Math.abs(await page.locator(".feed-viewer-segment").first().evaluate(progress => progress.value) - held) <= 60,
        "Holding a story pauses its actual progress");
      await page.mouse.up();
      assert.equal(await currentId(page), hot[0].id, "Releasing a hold does not also trigger a tap navigation");
      // Observe the real duration rather than altering the app clock or source.
      await waitForId(page, hot[1].id);
      await page.locator(`${viewer}[data-state="loading"]`).waitFor();
      releases[1](); await ready(page, "stories");
      await page.waitForTimeout(450);
      assert.equal(await count(page, hot[1].id), 0, "A short foreground glimpse does not qualify as a view");
      await page.locator("#feed-viewer-share").click();
      await page.locator("#feed-share[open]").waitFor();
      await page.waitForTimeout(1150);
      assert.equal(await count(page, hot[1].id), 0, "A loaded story covered by the share dialog is not a view");
      const shared = new URL(await page.locator("#feed-share-url").inputValue());
      assert.equal(shared.searchParams.get("item"), hot[1].id);
      assert.equal(shared.searchParams.get("lang"), "en");
      await page.locator("#feed-share-close").click();
      await page.waitForTimeout(600);
      assert.equal(await count(page, hot[1].id), 0, "A covered Story restarts its continuous one-second qualification when uncovered");
      await waitForCount(page, hot[1].id, 1);
      await page.locator("#feed-viewer-next").click(); await waitForId(page, hot[2].id);
      // A controlled Page Visibility transition exercises the app's lifecycle
      // handler consistently across engines; it is not a physical tab switch.
      await page.evaluate(() => {
        window.__viewerTestHidden = true;
        Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__viewerTestHidden });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__viewerTestHidden ? "hidden" : "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      releases[2](); await ready(page, "stories");
      await page.waitForTimeout(1150);
      assert.equal(await count(page, hot[2].id), 0, "A hidden document does not qualify the active loaded story");
      await page.evaluate(() => { window.__viewerTestHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
      await waitForCount(page, hot[2].id, 1);
      await page.locator("#feed-viewer-prev").click(); await waitForId(page, hot[1].id);
      await page.locator("#feed-viewer-prev").click();
      await ready(page, "stories"); await waitForId(page, hot[0].id);
      await page.locator("#feed-viewer-pause").click();
      await page.waitForTimeout(1150);
      assert.equal(await count(page, hot[0].id), 1, "Revisiting a qualified product on the same page does not inflate its count");
      await page.locator("#feed-viewer-like").click();
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator("#feed-liked-count").textContent(), "1");
      assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
      await captureScreenshot(page, { path: `${output}/${engine}-stories-en.png` });
      await page.locator("#feed-viewer-choose").click();
      await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
      await page.locator("#menu-product-dialog[open]").waitFor();
      assert.equal(await page.locator("#menu-product-title").textContent(), hot[0].item.name.en);
      await page.locator("#menu-add-to-cart").click();
      await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
      for (let i = 0; i < 2 && await page.locator("dialog[open]").count(); i++) await page.keyboard.press("Escape");
      await page.locator('.feed-view-switch [data-menu-view="list"]').click();
      await page.locator('#menu-root[data-ready="true"]').waitFor();
      if (await page.locator("#menu-product-dialog[open]").count()) await page.locator('[data-menu-dialog-close="product"]').click();
      await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
      assert.equal(await page.locator("#menu-cart-count").textContent(), "1");
      await page.locator('.menu-view-switch [data-menu-view="feed"]').click();
      await page.locator('#feed[data-ready="true"]').waitFor();
      await page.waitForFunction(() => document.querySelector("#menu-cart-count").textContent === "1");
      assert.equal(await page.locator("#menu-cart-count").textContent(), "1");
      assert.equal(await page.locator("#feed-liked-count").textContent(), "1");
      await page.locator(opener).click(); await ready(page, "stories");
      await waitForCount(page, hot[0].id, 2);
      await closeViewer(page, opener);
      await cleanErrors(errors);
      report.cases.push({ case: "stories-qualified-views-pause-share-order", result: "PASS", language: "en", width: 390,
        noCountBeforeLoadOrWhileCovered: true, pausedLoadedPhotoCounts: true, controlledVisibilityChange: true, physicalBackgroundTabTested: false,
        continuousSecond: true, perPageDeduplication: true,
        freshPageCountsAgain: true, autoplayAndHold: true, shareUsesActiveProduct: true,
        sharedProductEditorAndListRoundTrip: true, likesAndOrderPersist: true, consoleErrors: false });
    } catch (error) {
      releases.forEach(release => release());
      await captureScreenshot(page, { path: `${output}/${engine}-stories-failure.png` }).catch(() => {});
      const diagnostics = await page.evaluate(() => ({ url: location.href, formatsHidden: document.querySelector(".feed-formats")?.hidden,
        ready: document.querySelector("#feed")?.dataset.ready, script: [...document.scripts].find(script => /menu-feed\.js/.test(script.src))?.src })).catch(() => ({}));
      error.message += `\nViewer diagnostics: ${JSON.stringify({ ...diagnostics, errors })}`;
      throw error;
    } finally { releases.forEach(release => release()); await context.close(); }
  }

  {
    const { context, page, errors } = await contextFor({ language: "ru" });
    try {
      await openFeed(page, "ru");
      await page.locator("#feed-reels-open").scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.locator("#feed-reels-open").click(); await ready(page, "reels");
      await imageFits(page);
      const initial = await currentId(page);
      const initialIndex = Number(await page.locator(viewer).getAttribute("data-index"));
      const box = await page.locator("#feed-viewer-image").boundingBox();
      assert.ok(box.height >= 150, "Reels provides room for a real pointer drag");
      const x = box.x + box.width * .4, low = box.y + box.height * .75, high = box.y + box.height * .25;
      await page.mouse.move(x, low); await page.mouse.down(); await page.mouse.move(x, high, { steps: 10 }); await page.mouse.up();
      await page.waitForFunction(index => Number(document.querySelector("#feed-viewer").dataset.index) === index + 1, initialIndex);
      await ready(page, "reels");
      await page.mouse.move(x, high); await page.mouse.down(); await page.mouse.move(x, low, { steps: 10 }); await page.mouse.up();
      await waitForId(page, initial); await ready(page, "reels");
      const like = await page.locator("#feed-viewer-like").boundingBox();
      await page.mouse.move(like.x + like.width / 2, like.y + like.height / 2); await page.mouse.down();
      await page.mouse.move(like.x + like.width / 2, like.y - 90, { steps: 8 }); await page.mouse.up();
      assert.equal(await currentId(page), initial, "A drag beginning at an action button cannot navigate the reel");
      await page.locator("#feed-viewer-next").click(); await ready(page, "reels");
      await page.keyboard.press("ArrowUp"); await waitForId(page, initial);
      await page.locator("#feed-viewer-close").focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(id => document.querySelector("#feed-viewer").dataset.productId !== id, initial);
      await ready(page, "reels");
      await page.waitForTimeout(550);
      const beforeWheel = Number(await page.locator(viewer).getAttribute("data-index"));
      await page.mouse.move(x, (low + high) / 2); await page.mouse.wheel(0, 180);
      await page.waitForFunction(index => Number(document.querySelector("#feed-viewer").dataset.index) === index + 1, beforeWheel);
      await ready(page, "reels");
      await page.locator("#feed-viewer-like").click();
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "true");
      await page.locator("#feed-viewer-like").click();
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "false");
      const doubleTapPosition = { x: box.width * .35, y: box.height * .5 };
      await page.locator("#feed-viewer-image").dblclick({ position: doubleTapPosition });
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "true", "Double tap likes the photograph");
      await page.locator("#feed-viewer-image").dblclick({ position: doubleTapPosition });
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "true", "Repeated double tap preserves an existing like");
      const active = await currentId(page);
      await page.evaluate(() => {
        window.__viewerNativeShares = [];
        Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
          window.__viewerNativeShares.push({ title: data.title, url: data.url, activation: navigator.userActivation?.isActive ?? null });
        } });
      });
      await page.locator("#feed-viewer-share").click();
      await page.waitForFunction(() => window.__viewerNativeShares.length === 1);
      const shared = await page.evaluate(() => window.__viewerNativeShares[0]);
      assert.equal(new URL(shared.url).searchParams.get("item"), active);
      assert.equal(new URL(shared.url).searchParams.get("lang"), "ru");
      if (shared.activation !== null) assert.equal(shared.activation, true, "Native sharing retains the trusted click's user activation");
      for (const selector of ["#feed-viewer-close", "#feed-viewer-like", "#feed-viewer-share", "#feed-viewer-choose", "#feed-viewer-next"]) await hitTarget(page, selector);
      await captureScreenshot(page, { path: `${output}/${engine}-reels-ru.png` });
      await page.keyboard.press("Escape");
      await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-reels-open"));
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 1, "Closing Reels preserves the underlying menu position");
      await cleanErrors(errors);
      report.cases.push({ case: "reels-gestures-heart-native-share", result: "PASS", language: "ru", width: 390,
        trustedMousePointerDrag: true, physicalTouchTested: false, wheelKeyboardAndButtons: true,
        actionDragDoesNotNavigate: true, doubleTapSaves: true, nativeShareMock: true,
        activeProductLink: true, focusAndMenuPositionRestored: true, consoleErrors: false });
    } finally { await context.close(); }
  }

  {
    const { context, page, errors } = await contextFor({ width: 320, height: 568, language: "ru" });
    try {
      await openFeed(page, "ru");
      await page.locator("#feed-reels-open").click(); await ready(page, "reels");
      await imageFits(page);
      const before = await page.evaluate(() => scrollY);
      await page.evaluate(() => document.fonts.ready);
      // Controlled text enlargement, distinct from native browser zoom.
      await page.locator(".feed-viewer-identity strong,.feed-viewer-identity span,#feed-viewer-title,.feed-viewer-price,.feed-viewer-description,#feed-viewer-choose,#feed-viewer-counter,#feed-viewer-help,.feed-viewer-view-label,#feed-viewer-view-count").evaluateAll(nodes => {
        for (const node of nodes) node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) * 2}px`;
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const shell = page.locator(".feed-viewer-shell");
      const overflow = await shell.evaluate(node => { node.scrollTop = 0; return node.scrollHeight > node.clientHeight + 1; });
      if (!overflow) {
        await captureScreenshot(page, { path: `${output}/${engine}-reels-320-text200-failure.png` });
        const dimensions = await shell.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight,
          fontSizes: [...node.querySelectorAll("#feed-viewer-title,#feed-viewer-choose,#feed-viewer-help")].map(node => getComputedStyle(node).fontSize) }));
        assert.fail(`A short screen with 200% text must exercise inner scrolling: ${JSON.stringify(dimensions)}`);
      }
      const beforeWheelProduct = await currentId(page);
      const stage = await page.locator(".feed-viewer-stage").boundingBox();
      await page.mouse.move(stage.x + stage.width * .35, Math.min(stage.y + stage.height * .5, 460));
      await page.mouse.wheel(0, 650);
      await page.waitForFunction(() => document.querySelector(".feed-viewer-shell").scrollTop > 0);
      assert.equal(await currentId(page), beforeWheelProduct, "An overflowing viewer scrolls enlarged content instead of advancing the reel");
      const purchaseAfterWheel = await page.locator("#feed-viewer-choose").evaluate(node => {
        const box = node.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return box.top >= 0 && box.bottom <= innerHeight && (hit === node || node.contains(hit));
      });
      assert.equal(purchaseAfterWheel, true, "Real wheel scrolling exposes an unobscured purchase action at 200% text");
      for (const selector of ["#feed-viewer-close", "#feed-viewer-like", "#feed-viewer-share", "#feed-viewer-prev", "#feed-viewer-next", "#feed-viewer-choose"]) await hitTarget(page, selector);
      assert.equal(await page.locator(viewer).evaluate(dialog => dialog.scrollWidth > dialog.clientWidth + 1), false);
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 1, "Viewer pressure scrolls inside the modal, not the background page");
      await captureScreenshot(page, { path: `${output}/${engine}-reels-320-text200.png` });
      await closeViewer(page, "#feed-reels-open");
      await cleanErrors(errors);
      report.cases.push({ case: "reels-short-text200", result: "PASS", language: "ru", width: 320, height: 568,
        textScale: 2, textScaleMethod: "computed viewer text size; not browser zoom", controlsReachable: true,
        noHorizontalOverflow: true, realWheelScrollReachesPurchase: true, backgroundPositionPreserved: true, consoleErrors: false });
    } finally { await context.close(); }
  }

  for (const [language, width, height] of [["tr", 390, 844], ["en", 1440, 1000]]) {
    const { context, page, errors } = await contextFor({ width, height, language });
    try {
      await openFeed(page, language);
      const opener = '#feed-stories .feed-story[data-story-category="hot-coffee"]';
      await page.locator(opener).click(); await ready(page, "stories");
      await imageFits(page);
      assert.equal(await page.locator("#feed-viewer-title").textContent(), hot[0].item.name[language]);
      assert.equal(await page.locator(viewer).getAttribute("data-autoplay"), "false", "Reduced motion starts Stories in manual mode");
      if (language === "tr") {
        const duration = await page.locator(".feed-viewer-segment").first().evaluate(progress => progress.max);
        await page.waitForTimeout(duration + 100);
        assert.equal(await currentId(page), hot[0].id, "Manual reduced-motion Stories do not advance after a full segment duration");
      }
      await page.locator("#feed-viewer-next").click(); await waitForId(page, hot[1].id); await ready(page, "stories");
      assert.equal(await page.locator("#feed-viewer-title").textContent(), hot[1].item.name[language]);
      await page.locator("#feed-viewer-tap-next").click(); await waitForId(page, hot[2].id); await ready(page, "stories");
      await page.locator("#feed-viewer-tap-prev").click(); await waitForId(page, hot[1].id); await ready(page, "stories");
      const segmentValues = await page.locator(".feed-viewer-segment").evaluateAll(nodes => nodes.slice(0, 3).map(node => node.value));
      const segmentDuration = await page.locator(".feed-viewer-segment").first().evaluate(node => node.max);
      assert.deepEqual(segmentValues, [segmentDuration, 0, 0], "Manual taps update the segmented Story position without starting autoplay");
      for (const selector of ["#feed-viewer-close", "#feed-viewer-like", "#feed-viewer-share", "#feed-viewer-choose", "#feed-viewer-next"]) await hitTarget(page, selector);
      await captureScreenshot(page, { path: `${output}/${engine}-stories-${width}-${language}.png` });
      await closeViewer(page, opener);
      await cleanErrors(errors);
      report.cases.push({ case: `stories-localization-${language}-${width}`, result: "PASS", language, width, height,
        reducedMotionManual: true, observedFullManualDuration: language === "tr", translatedCatalogContent: true,
        tapZonesAndSegmentedPosition: true, navigationAndFocusReturn: true, photoFits: true, consoleErrors: false });
    } finally { await context.close(); }
  }

  {
    const { context, page, errors } = await contextFor({ language: "ru", nativeShare: true, reducedMotion: "no-preference" });
    const failedRequests = [];
    page.on("requestfailed", request => failedRequests.push(request.url()));
    try {
      await openFeed(page, "ru");
      const opener = '#feed-stories .feed-story[data-story-category="hot-coffee"]';
      await page.locator(opener).click(); await ready(page, "stories");
      const brokenImage = new URL(hot[0].image, `${origin}/`); brokenImage.searchParams.set("viewer-photo-error", "1");
      await context.route(brokenImage.href, route => route.abort("failed"));
      await page.locator("#feed-viewer-image").evaluate((image, href) => { image.src = href; }, brokenImage.href);
      await page.locator(`${viewer}[data-state="error"]`).waitFor();
      const progressBefore = await page.locator(".feed-viewer-segment").first().evaluate(node => node.value);
      await page.waitForTimeout(1150);
      assert.equal(await currentId(page), hot[0].id, "A failed photograph cannot advance the Story");
      assert.equal(await count(page, hot[0].id), 0, "A failed photograph cannot qualify as viewed");
      assert.equal(await page.locator(".feed-viewer-segment").first().evaluate(node => node.value), progressBefore,
        "Story progress stops while its photograph has failed");
      const retry = page.getByRole("button", { name: "Загрузить фото ещё раз", exact: true });
      await hitTarget(page, "#feed-viewer-retry");
      await retry.click(); await ready(page, "stories"); await imageFits(page);
      await waitForCount(page, hot[0].id, 1);
      await page.evaluate(() => {
        window.__viewerDeferredShares = [];
        Object.defineProperty(navigator, "share", { configurable: true, value: data => new Promise(resolve => {
          window.__viewerDeferredShares.push(data);
          window.__viewerResolveShare = resolve;
        }) });
      });
      await page.locator("#feed-viewer-share").click();
      await page.waitForFunction(() => window.__viewerDeferredShares.length === 1);
      assert.equal(await page.locator("#feed-viewer-share").isDisabled(), true);
      await closeViewer(page, opener);
      await page.locator(opener).click(); await ready(page, "stories");
      assert.equal(await page.locator("#feed-viewer-share").isEnabled(), true, "A reopened viewer has usable sharing controls");
      await page.locator("#feed-viewer-next").click(); await waitForId(page, hot[1].id); await ready(page, "stories");
      await page.evaluate(() => window.__viewerResolveShare());
      await page.waitForFunction(() => !document.querySelector("#feed-viewer-share").disabled);
      assert.equal(await currentId(page), hot[1].id, "Resolving the previous share cannot change the new viewer session");
      assert.equal(await page.locator(`${viewer}[open]`).count(), 1);
      await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
        window.__viewerDeferredShares.push(data);
      } }));
      await page.locator("#feed-viewer-share").click();
      await page.waitForFunction(() => window.__viewerDeferredShares.length === 2);
      const latestShare = await page.evaluate(() => window.__viewerDeferredShares[1]);
      assert.equal(new URL(latestShare.url).searchParams.get("item"), hot[1].id);
      await closeViewer(page, opener);
      assert.deepEqual(failedRequests, [brokenImage.href], "Only the deliberately failed viewer photograph request may fail");
      const expectedPhotoErrors = errors.filter(error => /^console\.error: Failed to load resource/.test(error));
      assert.ok(expectedPhotoErrors.length <= 1, "At most one resource error is attributable to the single intentional image abort");
      assert.deepEqual(errors.filter(error => !expectedPhotoErrors.includes(error)), [], "The error/retry and stale-share paths produce no application errors");
      report.cases.push({ case: "viewer-photo-retry-and-stale-native-share", result: "PASS", language: "ru", width: 390,
        intentionalImageAbort: true, expectedResourceConsoleErrors: expectedPhotoErrors.length, noViewsOrProgressOnError: true,
        localizedRetryLoadsAndQualifies: true, staleShareCannotChangeReopenedSession: true, newShareRemainsUsable: true,
        applicationConsoleErrors: false });
    } finally { await context.close(); }
  }


  {
    const { context, page, errors } = await contextFor({ language: "ru" });
    try {
      await openFeed(page, "ru");
      const opener = '#feed-stories .feed-story[data-story-category="hot-coffee"]';
      await page.locator(opener).click(); await ready(page, "stories");
      await page.locator("#feed-viewer-like").click(); await closeViewer(page, opener);
      await page.locator("#feed-liked-filter").click();
      await page.waitForFunction(() => document.querySelector("#feed-liked-filter").getAttribute("aria-pressed") === "true"
        && document.querySelectorAll(".feed-card").length === 1);
      assert.equal(await page.locator(".feed-card").getAttribute("data-product-id"), hot[0].id);
      await page.locator("#feed-reels-open").click(); await ready(page, "reels");
      assert.equal(await currentId(page), hot[0].id);
      await page.locator("#feed-viewer-like").click();
      assert.equal(await page.locator("#feed-viewer-like").getAttribute("aria-pressed"), "false");
      await page.locator("#feed-viewer-close").click();
      await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
      await page.locator("#feed-empty").waitFor();
      assert.equal(await page.locator(".feed-card").count(), 0, "Unliking in Reels removes the item from the liked-only feed on close");
      assert.equal(await page.locator("#feed-liked-count").textContent(), "0");
      assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
      assert.equal(await page.locator("#feed-reels-open").isDisabled(), true);
      await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-liked-filter"));
      await page.locator(opener).click(); await ready(page, "stories");
      assert.equal(await currentId(page), hot[0].id, "Category Stories stay available when the liked-only feed is empty");
      await page.locator("#feed-viewer-like").click(); await closeViewer(page, opener);
      await page.waitForFunction(() => document.querySelectorAll(".feed-card").length === 1);
      assert.equal(await page.locator(".feed-card").getAttribute("data-product-id"), hot[0].id,
        "Liking a Story repopulates the liked-only feed after the viewer closes");
      assert.equal(await page.locator("#feed-liked-count").textContent(), "1");
      assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
      assert.equal(await page.locator("#feed-reels-open").isEnabled(), true);
      await page.locator("#feed-reels-open").click(); await ready(page, "reels");
      await page.locator("#feed-viewer-like").click();
      await page.locator("#feed-viewer-choose").click();
      await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
      await page.locator("#menu-product-dialog[open]").waitFor();
      await page.keyboard.press("Escape");
      await page.locator("#menu-product-dialog[open]").waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-liked-filter"));
      assert.equal(await page.locator(".feed-card").count(), 0);
      assert.equal(await page.locator("#menu-cart-count").textContent(), "0");
      await cleanErrors(errors);
      report.cases.push({ case: "viewer-likes-reconcile-liked-only-feed", result: "PASS", language: "ru", width: 390,
        unlikeRemovesCardOnClose: true, emptyFeedFocusReturnsToFilter: true, storiesRemainAvailableWhenFeedEmpty: true,
        storyLikeRepopulatesFeed: true, chooseFromLastUnlikedReelReturnsFocusToFilter: true,
        likedCountSynchronized: true, orderUnchanged: true, consoleErrors: false });
    } finally { await context.close(); }
  }

}
