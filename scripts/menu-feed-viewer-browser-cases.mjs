import assert from "node:assert/strict";
import { feedSharePath } from "../src/menu-feed-navigation.js";

// Preserve the active setup case even when no Page exists for a screenshot.
// The caller writes the report; the initial marker also survives abrupt exit.
export async function withViewerSetupDiagnostics({ report, engine, caseName, profile }, setup) {
  const state = { engine, case: caseName, ...profile, stage: "newContext", status: "running" };
  report.viewerSetup = state;
  console.log(`VIEWER_SETUP ${JSON.stringify(state)}`);
  let context;
  try {
    const result = await setup({
      setStage: stage => {
        state.stage = stage;
        console.log(`VIEWER_SETUP_STAGE ${JSON.stringify({ case: caseName, stage })}`);
      },
      trackContext: value => { context = value; },
    });
    state.stage = "complete";
    state.status = "complete";
    return result;
  } catch (error) {
    state.status = "failed";
    state.error = { name: String(error?.name ?? "Error"), message: String(error?.message ?? error).slice(0, 1000) };
    console.error(`VIEWER_SETUP_FAILED ${JSON.stringify(state)}`);
    // Best-effort cleanup must not replace or delay the original failure.
    if (context) {
      try { void Promise.resolve(context.close()).catch(() => {}); } catch { /* preserve original error */ }
    }
    throw error;
  }
}

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
  async function contextFor({ caseName, width = 390, height = 844, language = "en", reducedMotion = "reduce", nativeShare = false, batchViewerIntersections = false }) {
    return withViewerSetupDiagnostics({ report, engine, caseName, profile: { width, height, language, reducedMotion } }, async ({ setStage, trackContext }) => {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion, ignoreHTTPSErrors: true, serviceWorkers: "block" });
      trackContext(context);
      setStage("route");
      await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      setStage("addInitScript");
      await context.addInitScript(({ language, nativeShare, batchViewerIntersections }) => {
        localStorage.setItem("robys-language", language);
        if (!nativeShare) Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
        const NativeObserver = window.IntersectionObserver;
        if (NativeObserver) window.IntersectionObserver = class extends NativeObserver {
          constructor(callback, options) {
            const viewerObserver = options?.root?.classList?.contains("feed-viewer-shell");
            const initialHidden = new WeakMap();
            super(viewerObserver ? (entries, observer) => {
              const events = window.__feedViewerIOEvents ??= [];
              const dialog = document.querySelector("#feed-viewer");
              for (const entry of entries) events.push({ target: entry.target.id, currentImage: entry.target === document.querySelector("#feed-viewer-image"),
                ratio: entry.intersectionRatio, intersecting: entry.isIntersecting, entryTime: entry.time, now: performance.now(),
                state: dialog?.dataset.state, product: dialog?.dataset.productId, hidden: document.hidden,
                visibilityState: document.visibilityState });
              if (events.length > 60) events.splice(0, events.length - 60);
              if (!batchViewerIntersections) { callback(entries, observer); return; }
              const delivered = [];
              for (const entry of entries) {
                if (entry.target.id === "feed-viewer-image" && entry.intersectionRatio === 0 && dialog?.dataset.state === "loading") {
                  initialHidden.set(entry.target, entry);
                  window.__feedViewerIOBatchInitials = (window.__feedViewerIOBatchInitials ?? 0) + 1;
                } else if (initialHidden.has(entry.target) && entry.intersectionRatio >= .5) {
                  const hidden = initialHidden.get(entry.target); initialHidden.delete(entry.target);
                  delivered.push(hidden, entry);
                  const batches = window.__feedViewerIOBatches ??= [];
                  batches.push({ product: dialog?.dataset.productId, currentImage: entry.target === document.querySelector("#feed-viewer-image"),
                    ratios: [hidden.intersectionRatio, entry.intersectionRatio], entryTimes: [hidden.time, entry.time] });
                  if (batches.length > 20) batches.shift();
                } else delivered.push(entry);
              }
              if (delivered.length) callback(delivered, observer);
            } : callback, options);
          }
        };
      }, { language, nativeShare, batchViewerIntersections });
      setStage("newPage");
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; observeErrors(page, errors);
      return { context, page, errors, language };
    });
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
  async function recordFailure(page, error, name, errors) {
    const screenshot = `${output}/${engine}-${name}-failure.png`;
    const diagnostics = await page.evaluate(() => {
      const dialog = document.querySelector("#feed-viewer"), image = document.querySelector("#feed-viewer-image");
      const shell = document.querySelector(".feed-viewer-shell"), choose = document.querySelector("#feed-viewer-choose");
      const rect = node => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, top: box.top, right: box.right, bottom: box.bottom, left: box.left };
      };
      const nativeValue = name => {
        for (let prototype = Object.getPrototypeOf(document); prototype; prototype = Object.getPrototypeOf(prototype)) {
          const getter = Object.getOwnPropertyDescriptor(prototype, name)?.get;
          if (getter) return getter.call(document);
        }
        return null;
      };
      const choice = rect(choose), hit = choice && document.elementFromPoint(choice.x + choice.width / 2, choice.y + choice.height / 2);
      return { url: location.href, formatsHidden: document.querySelector(".feed-formats")?.hidden,
        ready: document.querySelector("#feed")?.dataset.ready, script: [...document.scripts].find(script => /menu-feed\.js/.test(script.src))?.src,
        viewer: dialog ? { open: dialog.open, ...dialog.dataset } : null,
        document: { hidden: document.hidden, visibilityState: document.visibilityState,
          nativeHidden: nativeValue("hidden"), nativeVisibilityState: nativeValue("visibilityState"), hasFocus: document.hasFocus() },
        dialogs: [...document.querySelectorAll("dialog[open]")].map(node => ({ id: node.id, ...node.dataset })),
        counts: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("robys-feed-views-v1:")).map(key => [key, localStorage.getItem(key)])),
        visibleCount: document.querySelector("#feed-viewer-view-count")?.textContent,
        image: image ? { complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, hidden: image.hidden, rect: rect(image) } : null,
        shell: shell ? { scrollTop: shell.scrollTop, height: shell.clientHeight, content: shell.scrollHeight, rect: rect(shell) } : null,
        choice: { rect: choice, hit: hit?.id || hit?.tagName, centerHit: hit === choose || !!choose?.contains(hit) },
        progress: [...document.querySelectorAll(".feed-viewer-segment")].slice(0, 4).map(node => ({ value: node.value, max: node.max })),
        ioEvents: window.__feedViewerIOEvents ?? [], controlledIntersectionBatches: window.__feedViewerIOBatches ?? [], now: performance.now() };
    }).catch(diagnosticError => ({ diagnosticError: diagnosticError.message }));
    await captureScreenshot(page, { path: screenshot }).catch(() => {});
    const record = { case: name, screenshot, error: error.message, ...diagnostics, errors: [...errors] };
    (report.failures ??= []).push(record);
    console.error(`VIEWER_FAILURE_DIAGNOSTICS ${JSON.stringify(record)}`);
    error.message += `\nViewer diagnostics: ${JSON.stringify(diagnostics)}`;
  }

  {
    const { context, page, errors } = await contextFor({ caseName: "stories-qualified-views-pause-share-order", reducedMotion: "no-preference", batchViewerIntersections: true });
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
      await page.waitForFunction(() => window.__feedViewerIOBatchInitials > 0);
      assert.equal(await count(page, hot[0].id), 0, "Rendering a story before its photograph loads is not a view");
      await page.locator("#feed-viewer-pause").click();
      releases[0]();
      await ready(page, "stories");
      assert.equal(await page.locator(viewer).getAttribute("data-paused"), "true");
      await page.waitForFunction(id => window.__feedViewerIOBatches?.some(batch => batch.product === id && batch.currentImage
        && batch.ratios[0] === 0 && batch.ratios[batch.ratios.length - 1] >= .5), hot[0].id);
      const controlledIntersectionBatchCount = await page.evaluate(() => window.__feedViewerIOBatches.length);
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
      assert.equal(shared.pathname, `/${feedSharePath(hot[1].id, "en")}`);
      assert.equal(shared.search, "");
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
        continuousSecond: true, perPageDeduplication: true, controlledNativeIntersectionBatch: true,
        controlledIntersectionBatchCount,
        freshPageCountsAgain: true, autoplayAndHold: true, shareUsesActiveProduct: true,
        sharedProductEditorAndListRoundTrip: true, likesAndOrderPersist: true, consoleErrors: false });
    } catch (error) {
      releases.forEach(release => release());
      await recordFailure(page, error, "stories", errors);
      throw error;
    } finally { releases.forEach(release => release()); await context.close(); }
  }

  {
    const { context, page, errors } = await contextFor({ caseName: "reels-gestures-heart-native-share", language: "ru" });
    try {
      await openFeed(page, "ru");
      const visibleReelsLabel = (await page.locator('#feed-reels-open [data-copy="reels"]').textContent()).trim();
      assert.ok((await page.locator("#feed-reels-open").getAttribute("aria-label")).includes(visibleReelsLabel),
        "The Reels opener's accessible name includes its visible label");
      await page.locator("#feed-reels-open").scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.locator("#feed-reels-open").click(); await ready(page, "reels");
      assert.ok((await page.locator("#feed-reels-open").getAttribute("aria-label")).includes(visibleReelsLabel),
        "Refreshing the viewer preserves the Reels opener's visible label in its accessible name");
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
      assert.equal(new URL(shared.url).pathname, `/${feedSharePath(active, "ru")}`);
      assert.equal(new URL(shared.url).search, "");
      if (shared.activation !== null) assert.equal(shared.activation, true, "Native sharing retains the trusted click's user activation");
      for (const selector of ["#feed-viewer-close", "#feed-viewer-like", "#feed-viewer-share", "#feed-viewer-choose", "#feed-viewer-next"]) await hitTarget(page, selector);
      await captureScreenshot(page, { path: `${output}/${engine}-reels-ru.png` });
      await page.keyboard.press("Escape");
      await page.locator(`${viewer}[open]`).waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement === document.querySelector("#feed-reels-open"));
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 1, "Closing Reels preserves the underlying menu position");
      await cleanErrors(errors);
      report.cases.push({ case: "reels-gestures-heart-native-share", result: "PASS", language: "ru", width: 390,
        trustedMousePointerDrag: true, physicalTouchTested: false, wheelKeyboardAndButtons: true, reelsLabelInAccessibleName: true,
        actionDragDoesNotNavigate: true, doubleTapSaves: true, nativeShareMock: true,
        activeProductLink: true, focusAndMenuPositionRestored: true, consoleErrors: false });
    } finally { await context.close(); }
  }

  {
    const { context, page, errors } = await contextFor({ caseName: "reels-short-text200", width: 320, height: 568, language: "ru" });
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
      const purchaseIsReachable = () => {
        const node = document.querySelector("#feed-viewer-choose"), shell = document.querySelector(".feed-viewer-shell");
        const box = node.getBoundingClientRect(), clip = shell.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= Math.max(0, clip.top)
          && box.bottom <= Math.min(innerHeight, clip.bottom) + 1 && (hit === node || node.contains(hit));
      };
      let purchaseAfterWheel = false;
      for (let step = 0; step < 3 && !purchaseAfterWheel; step++) {
        const geometry = await shell.evaluate(node => {
          const clip = node.getBoundingClientRect(), choice = document.querySelector("#feed-viewer-choose").getBoundingClientRect();
          const stage = document.querySelector(".feed-viewer-stage").getBoundingClientRect();
          const top = Math.max(0, clip.top), bottom = Math.min(innerHeight, clip.bottom);
          return { x: clip.left + clip.width * .35, y: stage.bottom > top && stage.top < bottom
            ? Math.min(bottom - 8, Math.max(top + 8, stage.top + stage.height / 2)) : (top + bottom) / 2,
          delta: choice.top < top ? Math.min(-32, Math.floor(choice.top - top - 16))
            : Math.max(32, Math.ceil(choice.bottom - bottom + 16)) };
        });
        await page.mouse.move(geometry.x, geometry.y);
        await page.mouse.wheel(0, geometry.delta);
        // A wheel promise resolves before WebKit finishes scrolling. Wait for
        // the actual purchase action, not merely the first changed scroll tick.
        purchaseAfterWheel = await page.waitForFunction(purchaseIsReachable, null, { timeout: 650 })
          .then(() => true).catch(error => { if (error.name === "TimeoutError") return false; throw error; });
      }
      assert.equal(await shell.evaluate(node => node.scrollTop > 0), true, "A real wheel scroll moves the overflowing viewer");
      assert.equal(await currentId(page), beforeWheelProduct, "An overflowing viewer scrolls enlarged content instead of advancing the reel");
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
    } catch (error) {
      await recordFailure(page, error, "reels-320-text200", errors);
      throw error;
    } finally { await context.close(); }
  }

  for (const [language, width, height] of [["tr", 390, 844], ["en", 1440, 1000]]) {
    const { context, page, errors } = await contextFor({ caseName: `stories-localization-${language}-${width}`, width, height, language });
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
    const { context, page, errors } = await contextFor({ caseName: "viewer-photo-retry-and-stale-native-share", language: "ru", nativeShare: true, reducedMotion: "no-preference" });
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
      assert.equal(new URL(latestShare.url).pathname, `/${feedSharePath(hot[1].id, "ru")}`);
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
    const { context, page, errors } = await contextFor({ caseName: "viewer-likes-reconcile-liked-only-feed", language: "ru" });
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
