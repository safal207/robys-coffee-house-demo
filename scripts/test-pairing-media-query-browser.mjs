import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { verifyPairingDetailsGeometry } from "./test-pairing-discovery-browser.mjs";

// Exercise the real menu with only the 901px MediaQueryList API changed.
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
            if (query !== "(min-width: 901px)") return native;
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
          }, { id: pairing, wide: width >= 901 });
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
