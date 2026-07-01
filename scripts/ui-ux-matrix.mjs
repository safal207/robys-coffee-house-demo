import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const config = JSON.parse(readFileSync("qa/ui-ux-matrix.json", "utf8"));
const port = Number(process.env.UI_UX_PORT ?? 4191);
const resultsDir = path.resolve(process.env.UI_UX_RESULTS_DIR ?? "visual-results/ui-ux-matrix");
const requestedProfile = process.env.UI_UX_PROFILE?.trim();
const maxAttempts = Number(process.env.UI_UX_ATTEMPTS ?? config.maxAttempts ?? 2);
const canonicalInstagram = "https://www.instagram.com/robyscoffeehouse/";
const fixedNow = Date.parse("2026-07-01T12:00:00+03:00");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSafeResultsDir(directory) {
  const relative = path.relative(process.cwd(), directory);
  const insideVisualResults = relative === "visual-results"
    || relative.startsWith(`visual-results${path.sep}`);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative) || !insideVisualResults) {
    throw new Error(`[UI-UX-001] Refusing to delete unsafe results directory: ${directory}`);
  }
}

const profiles = requestedProfile
  ? config.profiles.filter((profile) => profile.id === requestedProfile)
  : config.profiles;

assert(Number.isInteger(port) && port >= 1024 && port <= 65535, `[UI-UX-001] Invalid UI_UX_PORT: ${port}`);
assert(profiles.length > 0, `[UI-UX-001] Unknown profile: ${requestedProfile}`);
assert(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 3, `[UI-UX-001] Invalid UI_UX_ATTEMPTS: ${maxAttempts}`);
assertSafeResultsDir(resultsDir);
rmSync(resultsDir, { recursive: true, force: true });
mkdirSync(resultsDir, { recursive: true });

function startServer() {
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  server.stderr.on("data", (chunk) => { diagnostics += chunk.toString(); });
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`UI/UX server exited with ${code}: ${diagnostics}`);
  });
  return server;
}

async function waitForServer(url) {
  let lastError;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function createContext(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    screen: { width: profile.width, height: profile.height },
    deviceScaleFactor: 1,
    isMobile: Boolean(profile.isMobile),
    hasTouch: Boolean(profile.hasTouch),
    colorScheme: "light",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    bypassCSP: true
  });

  await context.addInitScript((timestamp) => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [timestamp])); }
      static now() { return timestamp; }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate;
    try { localStorage.clear(); } catch { /* Initial blank document. */ }
  }, fixedNow);

  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ current: { temperature_2m: 30, precipitation: 0, weather_code: 0 } })
  }));
  return context;
}

async function stabilize(page) {
  await page.addStyleTag({ content: `
    *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
    html{scroll-behavior:auto!important}
    .hero-video,.map-live-frame{visibility:hidden!important}
  ` });

  await page.evaluate(async ({ imageTimeoutMs }) => {
    const withTimeout = (promise, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label)), imageTimeoutMs))
    ]);
    const year = document.querySelector("#current-year");
    if (year) year.textContent = "2026";
    document.querySelectorAll("video").forEach((video) => video.pause());
    if (document.fonts?.ready) await document.fonts.ready;
    for (const image of Array.from(document.images)) {
      image.loading = "eager";
      const label = image.currentSrc || image.src || image.alt || "unknown-image";
      if (!image.complete) {
        await withTimeout(new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }), `Timed out waiting for image: ${label}`);
      }
      if (image.decode) {
        await withTimeout(image.decode(), `Timed out decoding image: ${label}`).catch((error) => {
          if (!image.complete || image.naturalWidth === 0) throw error;
        });
      }
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { imageTimeoutMs: 5000 });
  await page.waitForTimeout(100);
}

async function assertPageStructure(page, profile, route) {
  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement;
    const h1 = document.querySelector("h1");
    const h1Rect = h1?.getBoundingClientRect();
    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id).filter(Boolean);
    return {
      title: document.title.trim(),
      mainCount: document.querySelectorAll("main").length,
      h1Text: h1?.textContent?.trim() ?? "",
      h1Visible: Boolean(h1Rect && h1Rect.width > 0 && h1Rect.height > 0),
      scrollWidth: root?.scrollWidth ?? 0,
      clientWidth: root?.clientWidth ?? 0,
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      brokenImages: Array.from(document.images)
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src || image.alt || "unknown-image")
    };
  });
  assert(metrics.title, `${route.id}: document title is empty`);
  assert(metrics.mainCount === 1, `${route.id}: expected one main landmark, found ${metrics.mainCount}`);
  assert(metrics.h1Text && metrics.h1Visible, `${route.id}: visible h1 is missing`);
  assert(metrics.scrollWidth <= metrics.clientWidth + 1, `${route.id}: horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px at ${profile.width}px`);
  assert(metrics.duplicateIds.length === 0, `${route.id}: duplicate ids ${metrics.duplicateIds.join(", ")}`);
  assert(metrics.brokenImages.length === 0, `${route.id}: broken images ${metrics.brokenImages.join(", ")}`);
}

async function assertPrimaryTargets(page, profile, route, warnings) {
  let visibleTargets = 0;
  for (const selector of route.primarySelectors) {
    const targets = page.locator(selector);
    for (let index = 0; index < await targets.count(); index += 1) {
      const target = targets.nth(index);
      if (!(await target.isVisible())) continue;
      visibleTargets += 1;
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      assert(box, `${route.id}: ${selector}[${index}] has no layout box`);
      assert(box.x >= -1 && box.x + box.width <= profile.width + 1, `${route.id}: ${selector}[${index}] escapes the viewport`);
      const name = ((await target.getAttribute("aria-label")) ?? (await target.innerText().catch(() => ""))).trim();
      assert(name, `${route.id}: ${selector}[${index}] has no accessible name`);
      if (profile.hasTouch) {
        const minimum = config.minimumTouchTarget ?? 24;
        const recommended = config.recommendedTouchTarget ?? 40;
        assert(box.width >= minimum && box.height >= minimum, `${route.id}: ${selector}[${index}] touch target is ${box.width.toFixed(1)}x${box.height.toFixed(1)}px, below ${minimum}px`);
        if (box.width < recommended || box.height < recommended) {
          warnings.push(`${selector}[${index}] is ${box.width.toFixed(1)}x${box.height.toFixed(1)}px; recommended ${recommended}px`);
        }
      }
    }
  }
  assert(visibleTargets > 0, `${route.id}: no primary actions are visible`);
}

async function assertKeyboardFocus(page, route) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  let focused;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      if (!visible) return { visible: false };

      const snapshot = () => {
        const style = getComputedStyle(element);
        return {
          outline: `${style.outlineStyle}|${style.outlineWidth}|${style.outlineColor}|${style.outlineOffset}`,
          boxShadow: style.boxShadow,
          background: style.backgroundColor,
          border: `${style.borderTopColor}|${style.borderRightColor}|${style.borderBottomColor}|${style.borderLeftColor}`,
          color: style.color,
          decoration: `${style.textDecorationLine}|${style.textDecorationColor}|${style.textDecorationThickness}`
        };
      };

      const focusVisible = element.matches(":focus-visible");
      const focusedStyle = snapshot();
      element.blur();
      const unfocusedStyle = snapshot();
      const cueChanged = Object.keys(focusedStyle).some((key) => focusedStyle[key] !== unfocusedStyle[key]);
      return {
        tag: element.tagName,
        text: (element.getAttribute("aria-label") || element.textContent || "").trim(),
        visible,
        focusVisible,
        cueChanged
      };
    });
    if (focused?.visible) break;
  }

  assert(focused?.visible, `${route.id}: keyboard focus never reached a visible control`);
  assert(focused.text, `${route.id}: focused ${focused.tag} has no accessible text`);
  assert(focused.focusVisible && focused.cueChanged, `${route.id}: focused ${focused.tag} has no focus-specific visual change`);
}

function normalizeInstagram(href) {
  try {
    const url = new URL(href);
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  } catch {
    return href;
  }
}

async function assertSocialNetworkUx(page, routeId) {
  if (routeId === "landing") await page.locator("#daily-offer:not([hidden])").waitFor({ state: "visible", timeout: 10000 });
  const selector = routeId === "landing"
    ? '#daily-offer a[href*="instagram.com"]'
    : routeId === "menu" ? 'a[href*="instagram.com/robyscoffeehouse"]' : null;
  if (!selector) return;
  const links = page.locator(selector);
  const count = await links.count();
  assert(count >= (routeId === "landing" ? 2 : 3), `${routeId}: insufficient Instagram actions (${count})`);
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    const rel = (await link.getAttribute("rel") ?? "").split(/\s+/);
    const name = ((await link.getAttribute("aria-label")) ?? (await link.innerText())).trim();
    assert(normalizeInstagram(href) === canonicalInstagram, `${routeId}: Instagram action ${index + 1} points to ${href}`);
    assert(await link.getAttribute("target") === "_blank", `${routeId}: Instagram action ${index + 1} must open in a new tab`);
    assert(rel.includes("noopener") && rel.includes("noreferrer"), `${routeId}: Instagram action ${index + 1} lacks safe rel tokens`);
    assert(name, `${routeId}: Instagram action ${index + 1} has no accessible name`);
  }
}

async function exerciseMenu(page) {
  const initialCount = await page.locator(".full-menu-item").count();
  assert(initialCount > 10, `menu: only ${initialCount} products rendered`);
  const search = page.locator("#menu-search");
  await search.fill("Latte");
  await page.waitForTimeout(100);
  const filtered = await page.locator(".full-menu-item:visible").count();
  assert(filtered > 0 && filtered < initialCount, `menu: search returned ${filtered} of ${initialCount}`);
  await search.fill("");
  await page.waitForTimeout(100);
  assert(await page.locator(".full-menu-item:visible").count() === initialCount, "menu: clearing search did not restore all items");
  await page.locator('.lang-button[data-lang="ru"]').click();
  assert(await page.evaluate(() => document.documentElement.lang === "ru"), "menu: RU language switch failed");
}

async function exerciseDiscover(page) {
  const pairing = page.locator("#pairing-products");
  const firstId = await pairing.getAttribute("data-pairing-id");
  assert(firstId, "discover: initial pairing id is missing");
  await page.locator("#next-pairing").click();
  await page.waitForFunction((previous) => document.querySelector("#pairing-products")?.getAttribute("data-pairing-id") !== previous, firstId);
  const secondId = await pairing.getAttribute("data-pairing-id");
  assert(secondId && secondId !== firstId, "discover: another-pairing action did not change the pairing");
  const mark = page.locator("#mark-discovered");
  if (!(await mark.isDisabled())) await mark.click();
  const beforeRecheck = await pairing.getAttribute("data-pairing-id");
  await page.locator("#next-pairing").click();
  await page.waitForFunction((previous) => document.querySelector("#pairing-products")?.getAttribute("data-pairing-id") !== previous, beforeRecheck);
  assert(await pairing.getAttribute("data-pairing-id") !== beforeRecheck, "discover: rotation collapsed after discovery");
  await page.locator('.lang-button[data-lang="ru"]').click();
  assert(await page.evaluate(() => document.documentElement.lang === "ru"), "discover: RU language switch failed");
}

async function runAttempt(browser, baseUrl, profile, route, attempt) {
  const context = await createContext(browser, profile);
  const page = await context.newPage();
  const warnings = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const url = new URL(route.path, baseUrl);
    url.searchParams.set("ui-ux", `${profile.id}-${route.id}-${attempt}`);
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(route.ready).first().waitFor({ state: "visible", timeout: 15000 });
    await stabilize(page);
    await assertPageStructure(page, profile, route);
    await assertPrimaryTargets(page, profile, route, warnings);
    if (!profile.hasTouch) await assertKeyboardFocus(page, route);
    await assertSocialNetworkUx(page, route.id);
    if (route.id === "menu") await exerciseMenu(page);
    if (route.id === "discover") await exerciseDiscover(page);
    assert(pageErrors.length === 0, `${route.id}: page errors: ${pageErrors.join(" | ")}`);
    return { passed: true, warnings };
  } catch (error) {
    const screenshot = path.join(resultsDir, `${profile.id}__${route.id}__attempt-${attempt}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" }).catch(() => {});
    return { passed: false, warnings, error: error instanceof Error ? error.message : String(error), screenshot: path.basename(screenshot) };
  } finally {
    await context.close();
  }
}

const server = startServer();
let browser;
const results = [];
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });
  for (const profile of profiles) {
    for (const route of config.routes) {
      const attempts = [];
      let finalResult;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        finalResult = await runAttempt(browser, baseUrl, profile, route, attempt);
        attempts.push(finalResult);
        if (finalResult.passed) break;
        console.warn(`⚠️ UI-UX-001 ${profile.id}/${route.id} failed attempt ${attempt}: ${finalResult.error}`);
      }
      const result = {
        profile: profile.id,
        width: profile.width,
        height: profile.height,
        route: route.id,
        passed: Boolean(finalResult?.passed),
        attempts: attempts.length,
        rechecked: attempts.length > 1,
        flaky: attempts.length > 1 && Boolean(finalResult?.passed),
        warnings: finalResult?.warnings ?? [],
        attemptResults: attempts
      };
      results.push(result);
      console.log(`${result.passed ? "✅" : "❌"} UI-UX-001 ${profile.id}/${route.id}${result.flaky ? " after automatic recheck" : ""}`);
    }
  }

  const failures = results.filter((result) => !result.passed);
  const flaky = results.filter((result) => result.flaky);
  const recommendations = results.reduce((total, result) => total + result.warnings.length, 0);
  writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    matrix: { profiles: profiles.length, routes: config.routes.length, scenarios: results.length, maximumAttempts: maxAttempts },
    failures: failures.length,
    flakyRechecks: flaky.length,
    recommendations,
    results
  }, null, 2)}\n`);
  if (failures.length) throw new Error(`[UI-UX-001] ${failures.length} of ${results.length} scenarios failed after automatic recheck.`);
  console.log(`✅ UI-UX-001 passed ${results.length} scenarios; ${flaky.length} recovered on recheck, ${recommendations} recommendation(s).`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
