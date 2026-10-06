import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { verifyPairingDetailsGeometry } from "./test-pairing-discovery-browser.mjs";

// Exercise the real menu with only the CSS 900px MediaQueryList API changed.
// Legacy listeners still receive actual browser viewport changes.
export async function verifyPairingMediaQueryCompatibility(context, baseUrl, check) {
  for (const mode of ["modern", "legacy", "no-listener"]) {
    for (const pairing of ["cool-lime-macaron", "iced-san-sebastian"]) {
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const label = `${mode}/${pairing}`;
      try {
        await page.addInitScript((listenerMode) => {
          const nativeMatchMedia = window.matchMedia.bind(window);
          const state = { modernRegistrations: 0, legacyRegistrations: 0, changes: 0 };
          window.__pairingMediaQueryState = state;
          window.matchMedia = (query) => {
            const native = nativeMatchMedia(query);
            if (query !== "(max-width: 900px)") return native;
            const result = { media: native.media, get matches() { return native.matches; } };
            const track = (listener) => (event) => { state.changes += 1; listener(event); };
            if (listenerMode === "modern") {
              result.addEventListener = (type, listener) => {
                state.modernRegistrations += 1;
                native.addEventListener(type, track(listener));
              };
            }
            if (listenerMode !== "no-listener") {
              result.addListener = (listener) => {
                state.legacyRegistrations += 1;
                native.addListener(track(listener));
              };
            }
            return result;
          };
        }, mode);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(new URL("menu.html?entry=off#pairing-offers", baseUrl).href, { waitUntil: "domcontentloaded" });
        await page.locator('.lang-button[data-lang="ru"]').click();
        const opener = page.locator(`[data-discover-pairing="${pairing}"]`);
        await opener.waitFor({ state: "visible" });
        await opener.focus();
        await page.keyboard.press("Enter");
        const panel = page.locator(".pairing-discovery-panel");
        await panel.waitFor({ state: "visible" });
        const placements = [];
        for (const width of [390, 1440, 390]) {
          const mark = panel.locator(".pairing-discovery-mark");
          await mark.focus();
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
          assert.equal(await mark.evaluate((node) => document.activeElement === node), true, `${label}/${width}: resize retains focus`);
          if (mode === "no-listener") {
            // Without either listener API, opening at the new size still works.
            await panel.locator(".pairing-discovery-close").click();
            assert.equal(await opener.evaluate((node) => document.activeElement === node), true, `${label}/${width}: close restores focus`);
            await page.keyboard.press("Enter");
            await panel.waitFor({ state: "visible" });
          }
          await page.waitForFunction(({ id, wide }) => {
            const node = document.querySelector(".pairing-discovery-panel");
            return node?.dataset.pairingId === id && node.previousElementSibling?.dataset.pairing ===
              (wide ? "iced-san-sebastian" : id);
          }, { id: pairing, wide: width > 900 });
          placements.push(await panel.evaluate((node) => ({
            id: node.dataset.pairingId,
            predecessor: node.previousElementSibling.dataset.pairing,
            width: document.documentElement.clientWidth
          })));
          await verifyPairingDetailsGeometry(page, `${label}/${width}`);
        }
        const state = await page.evaluate(() => window.__pairingMediaQueryState);
        assert.equal(state.modernRegistrations, mode === "modern" ? 1 : 0, `${label}: modern listener selection`);
        assert.equal(state.legacyRegistrations, mode === "legacy" ? 1 : 0, `${label}: legacy listener selection`);
        assert.equal(state.changes, mode === "no-listener" ? 0 : 2, `${label}: both responsive changes are delivered`);
        await panel.locator(".pairing-discovery-close").click();
        await panel.waitFor({ state: "detached" });
        assert.equal(await opener.evaluate((node) => document.activeElement === node), true, `${label}: close returns focus to the selected pair`);
        assert.equal(await opener.getAttribute("aria-expanded"), "false", `${label}: close resets expanded state`);
        assert.deepEqual(errors, [], `${label}: menu enhancement does not throw`);
        check("PAIRING-MEDIA-QUERY-COMPATIBILITY-001", true, label, { state, placements, errors });
      } catch (error) {
        check("PAIRING-MEDIA-QUERY-COMPATIBILITY-001", false, label, { error: String(error?.stack ?? error), errors });
      } finally {
        await page.close();
      }
    }
  }
}

// CSS zoom keeps a half-pixel iframe viewport representable in Chromium.
// Native media queries must prove the fractional viewport; none are mocked here.
export async function verifyPairingFractionalBreakpoint(context, baseUrl, check) {
  for (const pairing of ["cool-lime-macaron", "iced-san-sebastian"]) {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.setViewportSize({ width: 2000, height: 2200 });
      const harnessUrl = new URL("__pairing-fractional-harness.html", baseUrl).href;
      await page.route(harnessUrl, (route) => route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body style="margin:0"><iframe id="pairing-test-frame" title="Pairing menu" style="width:900px;height:1000px;border:0;zoom:2" src="menu.html?entry=off#pairing-offers"></iframe></body></html>'
      }));
      await page.goto(harnessUrl, { waitUntil: "domcontentloaded" });
      const iframe = page.locator("#pairing-test-frame");
      const frame = await (await iframe.elementHandle()).contentFrame();
      assert.ok(frame, "real menu iframe is attached");
      await frame.locator('.lang-button[data-lang="ru"]').focus();
      await page.keyboard.press("Enter");
      const opener = frame.locator(`[data-discover-pairing="${pairing}"]`);
      await opener.waitFor({ state: "visible" });
      await opener.focus();
      await page.keyboard.press("Enter");
      const panel = frame.locator(".pairing-discovery-panel");
      await panel.waitFor({ state: "visible" });
      const states = [];
      for (const width of [900, 900.5, 901, 900.5, 900]) {
        const mark = panel.locator(".pairing-discovery-mark");
        await mark.focus();
        await iframe.evaluate((node, size) => { node.style.width = `${size}px`; }, width);
        // Older Playwright iframe pollers compile strings with eval under CSP.
        // Poll from Node instead, preserving the same 10-second deadline.
        const deadline = performance.now() + 10_000;
        let placementReady = false;
        let lastPlacement;
        while (performance.now() < deadline) {
          lastPlacement = await frame.evaluate((expectedWidth) => {
            const node = document.querySelector(".pairing-discovery-panel");
            return {
              exactWidth: matchMedia(`(width: ${expectedWidth}px)`).matches,
              narrow: matchMedia("(max-width: 900px)").matches,
              pairingId: node?.dataset.pairingId ?? null,
              predecessor: node?.previousElementSibling?.dataset.pairing ?? null,
              isLastChild: Boolean(node && node === node.parentElement.lastElementChild)
            };
          }, width);
          placementReady = lastPlacement.exactWidth && lastPlacement.pairingId === pairing &&
            (lastPlacement.narrow ? lastPlacement.predecessor === pairing : lastPlacement.isLastChild);
          if (placementReady) break;
          await new Promise((done) => setTimeout(done, 50));
        }
        assert.equal(placementReady, true, `${pairing}/${width}: placement timed out: ${JSON.stringify(lastPlacement)}`);
        await frame.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const state = await frame.evaluate((expectedWidth) => {
          const node = document.querySelector(".pairing-discovery-panel");
          const cards = [...node.parentElement.querySelectorAll(".pairing-poster-card")];
          return {
            expectedWidth,
            cssIframeWidth: frameElement.style.width,
            iframeZoom: frameElement.style.zoom,
            exactWidth: matchMedia(`(width: ${expectedWidth}px)`).matches,
            above900: matchMedia("(width > 900px)").matches,
            below901: matchMedia("(width < 901px)").matches,
            narrow: matchMedia("(max-width: 900px)").matches,
            oldWide: matchMedia("(min-width: 901px)").matches,
            gridColumns: getComputedStyle(node.parentElement).gridTemplateColumns.split(" "),
            predecessor: node.previousElementSibling?.dataset.pairing,
            pairingId: node.dataset.pairingId,
            bothCardsBefore: cards.every((card) => Boolean(card.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)),
            cardsShareRow: Math.abs(cards[0].getBoundingClientRect().top - cards[1].getBoundingClientRect().top) <= 1,
            focusedMark: document.activeElement === node.querySelector(".pairing-discovery-mark")
          };
        }, width);
        assert.equal(state.exactWidth, true, `${pairing}/${width}: native query confirms the CSS viewport width`);
        assert.equal(state.narrow, width === 900, `${pairing}/${width}: JS uses the CSS narrow breakpoint`);
        assert.equal(state.gridColumns.length, width === 900 ? 1 : 2, `${pairing}/${width}: actual menu grid matches CSS`);
        assert.equal(state.focusedMark, true, `${pairing}/${width}: resize preserves focused action`);
        assert.equal(state.pairingId, pairing, `${pairing}/${width}: resize preserves the selected pair`);
        if (width === 900.5) {
          assert.equal(state.above900 && state.below901 && !state.oldWide, true, `${pairing}: fractional viewport lies inside the previous query gap`);
        }
        if (width > 900) {
          assert.equal(state.bothCardsBefore && state.cardsShareRow, true, `${pairing}/${width}: details follow both adjacent posters`);
        } else {
          assert.equal(state.predecessor, pairing, `${pairing}/${width}: narrow details follow their selected poster`);
        }
        states.push(state);
      }
      await panel.locator(".pairing-discovery-close").focus();
      await page.keyboard.press("Enter");
      await panel.waitFor({ state: "detached" });
      assert.equal(await opener.evaluate((node) => document.activeElement === node), true, `${pairing}: closing restores focus`);
      assert.deepEqual(errors, [], `${pairing}: fractional iframe does not throw`);
      check("PAIRING-FRACTIONAL-BREAKPOINT-001", true, pairing, { states, errors });
    } catch (error) {
      check("PAIRING-FRACTIONAL-BREAKPOINT-001", false, pairing, { error: String(error?.stack ?? error), errors });
    } finally {
      await page.close();
    }
  }
}

async function main() {
  const port = Number(process.env.PAIRING_MEDIA_QUERY_PORT ?? "4318");
  const baseUrl = `http://127.0.0.1:${port}/`;
  const report = { generatedAt: new Date().toISOString(), baseUrl, checks: [], failures: [] };
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { ready = (await fetch(baseUrl)).ok; } catch {}
      if (ready) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.equal(ready, true, "local menu server is ready");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort());
    await verifyPairingMediaQueryCompatibility(context, baseUrl, (id, passed, message, evidence) => {
      const item = { id, passed, message, evidence };
      report.checks.push(item);
      if (!passed) report.failures.push(item);
    });
    await verifyPairingFractionalBreakpoint(context, baseUrl, (id, passed, message, evidence) => {
      const item = { id, passed, message, evidence };
      report.checks.push(item);
      if (!passed) report.failures.push(item);
    });
    await context.close();
  } finally {
    await browser?.close();
    server.kill();
    await mkdir(".artifacts", { recursive: true });
    await writeFile(".artifacts/pairing-media-query-browser.json", JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ checks: report.checks.length, failures: report.failures.length, report: ".artifacts/pairing-media-query-browser.json" }));
  if (report.failures.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
