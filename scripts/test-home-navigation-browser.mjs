import assert from "node:assert/strict";
import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

// Test the shipped page and emitted runtime under their original CSP. No
// production event handlers, styles or storage modules are substituted.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repo);
const output = resolve(process.env.ROBYS_HOME_NAV_QA_DIR ?? ".artifacts/home-navigation");
mkdirSync(output, { recursive: true });
const types = { chromium, firefox, webkit };
const navigationLabels = {
  tr: { open: "Menüyü aç", close: "Menüyü kapat" },
  en: { open: "Open menu", close: "Close menu" },
  ru: { open: "Открыть меню", close: "Закрыть меню" }
};
const selected = (process.env.ROBYS_HOME_NAV_BROWSERS ?? "chromium,firefox,webkit").split(",");
assert.ok(selected.length && selected.every(name => Object.hasOwn(types, name)), "Known browser engines required");
const filter = process.env.ROBYS_HOME_NAV_FILTER ?? "";
const standardMatrix = selected.flatMap(engine => [390, 900].flatMap(width => ["tr", "en", "ru"].map(language =>
  ({ engine, width, language, mode: "standard", id: `${engine}-${language}-${width}` }))));
const enlargedMatrix = selected.flatMap(engine => [{ width: 320, height: 568 }, { width: 568, height: 320 }]
  .flatMap(viewport => ["tr", "en", "ru"].map(language => ({ engine, ...viewport, language, mode: "text200",
    id: `${engine}-${language}-${viewport.width}x${viewport.height}-text200` }))));
const standaloneMatrix = selected.flatMap(engine => [390, 900].map(width => ({ engine, width, language: "ru",
  mode: "standalone", id: `${engine}-ru-standalone-${width}` })));
const matrix = [...standardMatrix, ...enlargedMatrix, ...standaloneMatrix].filter(entry => entry.id.includes(filter));
assert.ok(matrix.length > 0, "The selected browser and optional filter must exercise at least one case");
const assets = ["index.html", "app.js", "styles-v2.css", "mobile.css", "brand-photo-logo.css", "conversion.css",
  "src/app.ts", "src/i18n.ts", "ru/coffee-gazipasa.html", "scripts/test-home-navigation-browser.mjs"];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = {
  startedAt: new Date().toISOString(),
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyFilesAtStart: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  boundary: "Emitted page/runtime over local HTTPS, original CSP; desktop browser engines with mobile-sized viewports, not physical handsets",
  selection: { browsers: selected, filter, caseIds: matrix.map(entry => entry.id),
    textEnlargement: "32px root font (200% of the normal 16px); not native browser zoom" },
  assetHashesStart: hashes(), browsers: {}, cases: []
};
const certificate = mkdtempSync(join(tmpdir(), "robys-home-navigation-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    const pathname = new URL(request.url, "https://127.0.0.1").pathname;
    let file = resolve(repo, "." + decodeURIComponent(pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `https://127.0.0.1:${server.address().port}`;
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const focused = locator => locator.evaluate(node => document.activeElement === node);
const afterLayout = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
async function expectFocus(locator, message) {
  await locator.page().waitForFunction(selector => document.activeElement === document.querySelector(selector), await locator.evaluate(node => {
    if (node.id) return `#${node.id}`;
    if (node.matches(".menu-toggle")) return ".menu-toggle";
    if (node.matches(".site-header .brand")) return ".site-header .brand";
    if (node.matches(".lang-button[data-lang]")) return `.lang-button[data-lang="${node.dataset.lang}"]`;
    if (node.matches(".hero-actions .button-primary")) return ".hero-actions .button-primary";
    return "#main-navigation a:first-child";
  }));
  assert.equal(await focused(locator), true, message);
}

async function verifyResizeFocusRecovery(page, { toggle, first, width, language }) {
  const facts = {};
  const brand = page.locator(".site-header .brand");
  const recordFocus = async (key, locator) => {
    await expectFocus(locator, `${key}: resize preserves meaningful focus`);
    const state = await locator.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      let visible = node.getClientRects().length > 0;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) visible = false;
      }
      return { tag: node.tagName, id: node.id, className: node.className, label: node.getAttribute("aria-label"),
        focused: document.activeElement === node, visible, insideNavigation: Boolean(node.closest("#main-navigation")),
        onScreen: bounds.bottom > 0 && bounds.right > 0 && bounds.top < innerHeight && bounds.left < innerWidth,
        rect: bounds.toJSON(), viewportWidth: innerWidth };
    });
    assert.equal(state.focused, true, `${key}: expected control owns focus`);
    assert.equal(state.visible, true, `${key}: focused control is visible`);
    assert.equal(state.onScreen, true, `${key}: focused control is onscreen`);
    facts[key] = state;
  };

  // The existing first-link journey has just crossed 980 -> 981. A stable
  // header target must stay focused when the closed mobile layout returns.
  await recordFocus("firstLinkAtDesktop", brand);
  await page.setViewportSize({ width: 900, height: 900 });
  await afterLayout(page);
  await recordFocus("firstLinkReturnMobile", brand);

  // The toggle itself disappears at desktop width. Some engines reset its
  // focus to BODY before firing resize; that must also recover visibly.
  await toggle.click();
  await expectFocus(first, "Toggle resize journey starts at the first link");
  await page.keyboard.press("Shift+Tab");
  await expectFocus(toggle, "Shift+Tab reaches the open menu toggle");
  await page.setViewportSize({ width: 980, height: 900 });
  await afterLayout(page);
  await recordFocus("toggleAt980", toggle);
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.setViewportSize({ width: 981, height: 900 });
  await page.waitForFunction(() => document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "false");
  await recordFocus("toggleAtDesktop", brand);
  await page.setViewportSize({ width: 900, height: 900 });
  await afterLayout(page);
  await recordFocus("toggleReturnMobile", brand);

  // A visible header control already has meaningful focus. Closing an open
  // menu on resize must preserve it instead of always choosing the brand.
  await toggle.click();
  await expectFocus(first, "Unrelated header focus journey starts in the menu");
  const unrelated = language ? page.locator(`.lang-button[data-lang="${language}"]`) : brand;
  await unrelated.focus();
  await page.setViewportSize({ width: 981, height: 900 });
  await page.waitForFunction(() => document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "false");
  await recordFocus("unrelatedHeaderAtDesktop", unrelated);
  await page.setViewportSize({ width: 900, height: 900 });
  await afterLayout(page);
  await recordFocus("unrelatedHeaderReturnMobile", unrelated);

  // An ordinary desktop CTA remains the user's focus through later resizes.
  await page.setViewportSize({ width: 981, height: 900 });
  await afterLayout(page);
  const cta = page.locator(".hero-actions .button-primary").first();
  await cta.focus();
  await recordFocus("desktopCtaBeforeResize", cta);
  await page.setViewportSize({ width: 1000, height: 900 });
  await afterLayout(page);
  await recordFocus("desktopCtaAt1000", cta);
  await page.setViewportSize({ width: 900, height: 900 });
  await afterLayout(page);
  await recordFocus("desktopCtaReturnMobile", cta);
  await page.setViewportSize({ width, height: 900 });
  await afterLayout(page);
  return facts;
}

async function verifyCase(browser, engine, width, language) {
  const id = `${engine}-${language}-${width}`;
  const directory = join(output, engine);
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: "reduce",
    serviceWorkers: "block", ignoreHTTPSErrors: true, bypassCSP: false });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(({ language, origin }) => {
    if (location.origin === origin && location.pathname === "/index.html") localStorage.setItem("robys-language", language);
  }, { language, origin });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const facts = {};
  try {
    if (width === 390 && language === "ru") {
      await page.goto(`${origin}/index.html?entry=off&lang=en`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.lang === "en" &&
        document.title === "Roby's Coffee House | Gazipaşa");
      await page.locator('.lang-button[data-lang="tr"]').click();
      await page.waitForFunction(() => document.documentElement.lang === "tr");
      assert.equal(new URL(page.url()).searchParams.get("lang"), "tr", "Switching language updates the existing URL parameter");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.lang === "tr" &&
        document.title === "Roby's Coffee House | Gazipaşa");
      facts.urlLanguageAndTitleSurviveReload = true;
    }
    await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
    await page.locator(`.lang-button[data-lang="${language}"].active[aria-pressed="true"]`).waitFor();
    await page.locator("html:not([data-robys-entry-pending])").waitFor({ state: "attached" });
    const toggle = page.locator(".menu-toggle");
    const nav = page.locator("#main-navigation");
    const first = nav.locator("a").first();
    await toggle.waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("lang"), language);
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels[language].open, "Closed menu control has a localized opening label");

    // Natural Tab navigation must skip every closed navigation link. Inspect
    // actual focus rather than inferring usability from a CSS declaration.
    await page.locator(".site-header .brand").focus();
    facts.closedTabSequence = [];
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      const current = await page.locator(":focus").evaluate(node => ({
        tag: node.tagName, text: node.textContent.trim(), inNavigation: Boolean(node.closest("#main-navigation")),
        inHeader: Boolean(node.closest(".site-header"))
      }));
      facts.closedTabSequence.push(current);
      assert.equal(current.inNavigation, false, "Closed navigation links cannot capture keyboard focus");
      if (!current.inHeader) break;
    }
    assert.ok(facts.closedTabSequence.some(entry => !entry.inHeader), "Tab can leave the closed header");

    await toggle.click();
    await expectFocus(first, "Opening navigation focuses its first link");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels[language].close, "Open menu control has a localized closing label");
    await page.keyboard.press("Shift+Tab");
    await expectFocus(toggle, "Shift+Tab from the first link reaches the visible close control");
    await page.keyboard.press("Tab");
    await expectFocus(first, "Tab from the close control returns to the first link");
    facts.openTabSequence = [];
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press("Tab");
      const current = await page.locator(":focus").evaluate(node => ({
        tag: node.tagName, text: node.textContent.trim(), inNavigation: Boolean(node.closest("#main-navigation")),
        inActions: Boolean(node.closest(".header-actions"))
      }));
      facts.openTabSequence.push(current);
      assert.ok(current.inNavigation || current.inActions, "Open navigation contains Tab focus in its links and visible controls");
    }
    await page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Escape closes navigation");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels[language].open, "Escape restores the localized opening label");
    await expectFocus(toggle, "Escape returns focus to the menu control");
    facts.escapeClosesAndRestoresFocus = true;
    facts.localizedToggleLabels = navigationLabels[language];

    // The 900/901 transition remains in the same mobile layout. Only the
    // actual 980/981 breakpoint should close the mobile menu.
    await page.setViewportSize({ width: 900, height: 900 });
    await afterLayout(page);
    await toggle.click();
    await expectFocus(first, "Navigation opens at 900 pixels");
    await page.setViewportSize({ width: 901, height: 900 });
    await afterLayout(page);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "900 to 901 pixels preserves the open mobile navigation");
    assert.equal(await first.isVisible(), true);
    await page.setViewportSize({ width: 980, height: 900 });
    await afterLayout(page);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.setViewportSize({ width: 981, height: 900 });
    await page.waitForFunction(() => document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "false");
    assert.equal(await toggle.isVisible(), false, "Desktop navigation replaces the mobile control after 980 pixels");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels[language].open, "Desktop transition restores the opening label");
    assert.equal(await first.isVisible(), true, "Desktop links remain available after closing the mobile layout");
    facts.resizeKeepsMobileAndClosesAtDesktop = true;
    facts.resizeFocus = await verifyResizeFocusRecovery(page, { toggle, first, width, language });

    facts.destinations = [];
    for (const hash of ["#about", "#visit"]) {
      await toggle.click();
      await expectFocus(first, "Reopening navigation returns to its first link");
      await nav.locator(`a[href="${hash}"]`).click();
      await page.waitForFunction(expected => location.hash === expected, hash);
      assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Native section links close mobile navigation");
      const target = await page.locator(hash).evaluate(node => ({ top: node.getBoundingClientRect().top, viewport: innerHeight }));
      assert.ok(target.top >= -1 && target.top < target.viewport, `Native ${hash} navigation reaches the target section`);
      const focus = await page.evaluate(hash => {
        const node = document.activeElement;
        const target = document.querySelector(hash);
        const bounds = node.getBoundingClientRect();
        let visible = node.getClientRects().length > 0;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) visible = false;
        }
        return {
          tag: node.tagName, id: node.id, label: node.getAttribute("aria-label"),
          insideClosedNavigation: Boolean(node.closest("#main-navigation")),
          meaningful: node.matches(".menu-toggle") || node === target || target.contains(node), visible,
          onScreen: bounds.bottom > 0 && bounds.right > 0 && bounds.top < innerHeight && bounds.left < innerWidth,
          top: bounds.top, bottom: bounds.bottom
        };
      }, hash);
      facts.destinations.push({ hash, ...target, focus });
      assert.equal(focus.insideClosedNavigation, false, `Native ${hash} navigation cannot retain focus inside the closed menu: ${JSON.stringify(focus)}`);
      assert.equal(focus.visible, true, `Native ${hash} navigation leaves focus on a visible element: ${JSON.stringify(focus)}`);
      assert.equal(focus.meaningful, true, `Native ${hash} navigation restores a meaningful destination or menu control: ${JSON.stringify(focus)}`);
    }
    await toggle.click();
    await expectFocus(first, "Full-menu navigation starts inside the opened navigation");
    await nav.locator('a[href="menu.html"]').click();
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    assert.equal(new URL(page.url()).pathname, "/menu.html", "Main-menu link reaches the actual catalog");
    assert.equal(await page.locator("html").getAttribute("lang"), language, "Native menu navigation preserves the language");
    facts.destinations.push({ path: "/menu.html", preservedLanguage: language });
    assert.deepEqual(errors, [], "Navigation produces no uncaught runtime errors");
    await page.screenshot({ path: join(directory, `${id}-catalog.png`) });
    report.cases.push({ id, status: "PASS", facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    await page.screenshot({ path: join(directory, `${id}-failure.png`) }).catch(() => {});
    report.cases.push({ id, status: "FAIL", error: error.stack, facts, errors });
    console.error(`FAIL ${id}: ${error.message}`);
  } finally { await context.close(); persist(); }
}

async function verifyStandaloneCase(browser, { engine, width, id }) {
  const directory = join(output, engine);
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: "reduce",
    serviceWorkers: "block", ignoreHTTPSErrors: true, bypassCSP: false });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const facts = { path: "/ru/coffee-gazipasa.html", destinations: [] };
  try {
    await page.goto(`${origin}${facts.path}`, { waitUntil: "domcontentloaded" });
    const toggle = page.locator(".menu-toggle");
    const nav = page.locator("#main-navigation");
    const first = nav.locator("a").first();
    await toggle.waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels.ru.open);
    await page.locator(".site-header .brand").focus();
    await page.keyboard.press("Tab");
    await expectFocus(toggle, "Closed standalone navigation links do not capture natural Tab focus");

    await toggle.click();
    await expectFocus(first, "Opening standalone navigation focuses its first link");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels.ru.close);
    await page.keyboard.press("Shift+Tab");
    await expectFocus(toggle, "Standalone Shift+Tab reaches the close control");
    await page.keyboard.press("Tab");
    await expectFocus(first, "Standalone Tab loops from the close control to its first link");
    facts.openTabSequence = [];
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press("Tab");
      const current = await page.locator(":focus").evaluate(node => ({ tag: node.tagName, text: node.textContent.trim(),
        inNavigation: Boolean(node.closest("#main-navigation")), toggle: node.matches(".menu-toggle") }));
      facts.openTabSequence.push(current);
      assert.ok(current.inNavigation || current.toggle, "Standalone open navigation contains natural keyboard focus");
    }
    await nav.locator('a[href="#location"]').focus();
    await page.keyboard.press("Escape");
    await expectFocus(toggle, "Standalone Escape restores focus from a navigation link to the visible control");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels.ru.open);
    facts.escapeClosesAndRestoresFocus = true;

    for (const hash of ["#location", "#faq"]) {
      await toggle.click();
      await expectFocus(first, "Reopening standalone navigation restores its first link");
      await nav.locator(`a[href="${hash}"]`).focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(expected => location.hash === expected, hash);
      assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Native standalone fragment links close navigation");
      assert.equal(await toggle.getAttribute("aria-label"), navigationLabels.ru.open);
      const focus = await page.evaluate(hash => {
        const target = document.querySelector(hash), node = document.activeElement;
        const bounds = node.getBoundingClientRect(), targetBounds = target.getBoundingClientRect();
        let visible = node.getClientRects().length > 0;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) visible = false;
        }
        return { tag: node.tagName, id: node.id, insideClosedNavigation: Boolean(node.closest("#main-navigation")), visible,
          meaningful: node.matches(".menu-toggle") || node === target || target.contains(node),
          onScreen: bounds.bottom > 0 && bounds.right > 0 && bounds.top < innerHeight && bounds.left < innerWidth,
          targetTop: targetBounds.top, viewportHeight: innerHeight };
      }, hash);
      facts.destinations.push({ hash, focus });
      assert.equal(focus.insideClosedNavigation, false, `Standalone ${hash} cannot leave focus in the hidden menu: ${JSON.stringify(focus)}`);
      assert.equal(focus.visible, true, `Standalone ${hash} leaves focus visible: ${JSON.stringify(focus)}`);
      assert.equal(focus.meaningful, true, `Standalone ${hash} leaves meaningful focus, not BODY/HTML: ${JSON.stringify(focus)}`);
      assert.equal(focus.onScreen, true, `Standalone ${hash} focused element is onscreen: ${JSON.stringify(focus)}`);
      assert.ok(focus.targetTop >= -1 && focus.targetTop < focus.viewportHeight, `Native standalone ${hash} navigation scrolls to its actual section`);
    }

    await page.setViewportSize({ width: 900, height: 900 });
    await toggle.click();
    await expectFocus(first, "Standalone navigation opens at 900 pixels");
    await page.setViewportSize({ width: 901, height: 900 });
    await afterLayout(page);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Standalone navigation stays open at 901 pixels");
    await page.setViewportSize({ width: 980, height: 900 });
    await afterLayout(page);
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.setViewportSize({ width: 981, height: 900 });
    await page.waitForFunction(() => document.querySelector(".menu-toggle")?.getAttribute("aria-expanded") === "false");
    assert.equal(await toggle.isVisible(), false);
    assert.equal(await first.isVisible(), true);
    assert.equal(await toggle.getAttribute("aria-label"), navigationLabels.ru.open);
    facts.resizeKeepsMobileAndClosesAtDesktop = true;
    facts.resizeFocus = await verifyResizeFocusRecovery(page, { toggle, first, width });
    await toggle.click();
    await expectFocus(first, "Standalone full-menu navigation begins at its first link");
    await page.keyboard.press("Enter");
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    assert.equal(new URL(page.url()).pathname, "/menu.html", "Standalone menu link reaches the emitted catalog");
    assert.equal(await page.locator("html").getAttribute("lang"), "ru", "Standalone menu link preserves Russian");
    facts.destinations.push({ path: "/menu.html", preservedLanguage: "ru" });
    assert.deepEqual(errors, [], "Standalone navigation produces no uncaught runtime errors");
    await page.screenshot({ path: join(directory, `${id}-catalog.png`) });
    report.cases.push({ id, status: "PASS", facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    await page.screenshot({ path: join(directory, `${id}-failure.png`) }).catch(() => {});
    report.cases.push({ id, status: "FAIL", error: error.stack, facts, errors });
    console.error(`FAIL ${id}: ${error.message}`);
  } finally { await context.close(); persist(); }
}

function textGeometry(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const rows = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => ({
    left: box.left, right: box.right, top: box.top, bottom: box.bottom,
    uncovered: [box.left + 1, (box.left + box.right) / 2, box.right - 1].every(x => {
      const hit = document.elementFromPoint(x, (box.top + box.bottom) / 2);
      return hit === element || element.contains(hit);
    })
  }));
  let visible = element.getClientRects().length > 0;
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) visible = false;
  }
  return { text: element.textContent.trim(), rect: element.getBoundingClientRect().toJSON(), rows, visible,
    focused: document.activeElement === element, documentFocused: document.hasFocus(), matchesFocus: element.matches(":focus"),
    transform: getComputedStyle(element).transform, viewport: { width: innerWidth, height: innerHeight } };
}

function assertReadable(geometry, message) {
  assert.equal(geometry.visible, true, `${message}: element is visible`);
  assert.ok(geometry.rows.length > 0, `${message}: actual text rows exist`);
  for (const row of geometry.rows) {
    assert.ok(row.left >= -1 && row.right <= geometry.viewport.width + 1, `${message}: text fits horizontally ${JSON.stringify(row)}`);
    assert.ok(row.top >= -1 && row.bottom <= geometry.viewport.height + 1, `${message}: text fits vertically ${JSON.stringify(row)}`);
    assert.equal(row.uncovered, true, `${message}: text is not covered by fixed controls ${JSON.stringify(row)}`);
  }
}

async function verifyEnlargedCase(browser, { engine, width, height, language, id }) {
  const directory = join(output, engine);
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: "reduce",
    serviceWorkers: "block", ignoreHTTPSErrors: true, bypassCSP: false });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  await context.addInitScript(({ language, origin }) => {
    if (location.origin === origin) localStorage.setItem("robys-language", language);
  }, { language, origin });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const facts = { width, height, rootFontPixels: 32, textEnlargement: "200% root font; not native browser zoom", focusedLinks: [] };
  try {
    await page.goto(`${origin}/index.html?entry=off`, { waitUntil: "domcontentloaded" });
    await page.locator(`.lang-button[data-lang="${language}"].active[aria-pressed="true"]`).waitFor();
    await page.locator("html:not([data-robys-entry-pending])").waitFor({ state: "attached" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await afterLayout(page);
    facts.enlargedPageText = await page.locator(".hero h1, #about h2, #about .feature-card h3, #about .feature-card p, #menu .menu-intro .text-link, #visit h2")
      .evaluateAll(elements => elements.map(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        return { text: element.textContent.trim(), rows: [...range.getClientRects()].map(box => ({ left: box.left, right: box.right })) };
      }));
    for (const field of facts.enlargedPageText) for (const row of field.rows) {
      assert.ok(row.left >= -1 && row.right <= width + 1, `Measured enlarged home copy fits horizontally: ${JSON.stringify({ text: field.text, ...row })}`);
    }
    const skip = page.locator(".skip-link");
    facts.skipUnfocused = await skip.evaluate(textGeometry);
    assert.equal(facts.skipUnfocused.focused, false, "Skip link starts unfocused");
    assert.ok(facts.skipUnfocused.rect.bottom <= 1, `Unfocused skip link is entirely offscreen at enlarged text: ${JSON.stringify(facts.skipUnfocused.rect)}`);
    await page.keyboard.press("Tab");
    assert.equal(await focused(skip), true, "Natural first Tab reaches the skip link before measuring its presentation");
    // Two animation frames did not guarantee that Chromium had applied :focus:
    // the failed CI geometry was still translated offscreen, while its later
    // failure screenshot already showed the link. Wait for the actual CSS state
    // within a bounded second; a missing/broken focus rule must still fail.
    try {
      await page.waitForFunction(() => {
        const link = document.querySelector(".skip-link");
        if (!link?.matches(":focus")) return false;
        const transform = getComputedStyle(link).transform;
        return transform === "none" || new DOMMatrixReadOnly(transform).isIdentity;
      }, null, { timeout: 1000, polling: "raf" });
    } finally { facts.skipFocused = await skip.evaluate(textGeometry); }
    assert.equal(facts.skipFocused.focused, true, "Natural first Tab reaches the skip link");
    assertReadable(facts.skipFocused, "Focused skip link");
    await page.keyboard.press("Tab");
    await afterLayout(page);
    assert.equal(await focused(skip), false, "Tab can leave the enlarged skip link");
    facts.documentWidthBeforeOpen = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(facts.documentWidthBeforeOpen <= width + 1, "Enlarged home page has no document overflow before opening navigation");

    const toggle = page.locator(".menu-toggle");
    const nav = page.locator("#main-navigation");
    const links = nav.locator("a");
    await toggle.click();
    await expectFocus(links.first(), "Opening enlarged navigation focuses its first link");
    await afterLayout(page);
    facts.navigation = await nav.evaluate(element => ({
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      scrollTop: element.scrollTop, overflowY: getComputedStyle(element).overflowY,
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth
    }));
    assert.ok(facts.navigation.scrollWidth <= facts.navigation.clientWidth + 1, "Enlarged navigation has no horizontal overflow");
    assert.ok(facts.navigation.documentWidth <= facts.documentWidthBeforeOpen + 1, "Opening enlarged navigation does not increase the document width");
    const allRows = await links.evaluateAll(elements => elements.flatMap(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].map(box => ({ text: element.textContent.trim(), left: box.left, right: box.right }));
    }));
    facts.allHorizontalTextRows = allRows;
    for (const row of allRows) assert.ok(row.left >= -1 && row.right <= width + 1, `Every enlarged navigation word fits horizontally: ${JSON.stringify(row)}`);
    await page.screenshot({ path: join(directory, `${id}-first.png`) });

    // Use real wheel input inside the overlay, then natural Tab focus. No
    // scrollTop assignment, scrollIntoView or production navigation helper is used.
    if (facts.navigation.scrollHeight > facts.navigation.clientHeight + 1) {
      await page.mouse.move(width - 12, height - 12);
      await page.mouse.wheel(0, height * 3);
      await page.waitForFunction(before => document.querySelector("#main-navigation").scrollTop > before, facts.navigation.scrollTop);
      facts.wheelScrollDown = await nav.evaluate(element => element.scrollTop);
      await page.mouse.wheel(0, -height * 6);
      await page.waitForFunction(() => document.querySelector("#main-navigation").scrollTop <= 1);
      facts.wheelScrollBack = await nav.evaluate(element => element.scrollTop);
    }
    for (let index = 0; index < await links.count(); index++) {
      if (index > 0) await page.keyboard.press("Tab");
      await page.waitForFunction(index => document.activeElement === document.querySelectorAll("#main-navigation a")[index], index);
      await afterLayout(page);
      const geometry = await links.nth(index).evaluate(textGeometry);
      facts.focusedLinks.push({ index, ...geometry, scrollTop: await nav.evaluate(element => element.scrollTop) });
      assert.equal(geometry.focused, true, "Natural Tab focuses each enlarged navigation link");
      assertReadable(geometry, `Focused navigation link ${index + 1}`);
    }
    await page.screenshot({ path: join(directory, `${id}-last.png`) });
    await page.keyboard.press("Escape");
    await expectFocus(toggle, "Escape restores focus after scrolling enlarged navigation");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.deepEqual(errors, [], "Enlarged navigation produces no uncaught runtime errors");
    report.cases.push({ id, status: "PASS", facts });
    console.log(`PASS ${id}`);
  } catch (error) {
    await page.screenshot({ path: join(directory, `${id}-failure.png`) }).catch(() => {});
    report.cases.push({ id, status: "FAIL", error: error.stack, facts, errors });
    console.error(`FAIL ${id}: ${error.message}`);
  } finally { await context.close(); persist(); }
}

try {
  for (const engine of selected) {
    const cases = matrix.filter(entry => entry.engine === engine);
    if (!cases.length) continue;
    const browser = await types[engine].launch({ headless: true });
    report.browsers[engine] = browser.version();
    try {
      for (const entry of cases) {
        if (entry.mode === "text200") await verifyEnlargedCase(browser, entry);
        else if (entry.mode === "standalone") await verifyStandaloneCase(browser, entry);
        else await verifyCase(browser, engine, entry.width, entry.language);
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise(done => server.close(done));
  rmSync(certificate, { recursive: true, force: true });
  report.assetHashesEnd = hashes();
  report.assetsUnchanged = JSON.stringify(report.assetHashesStart) === JSON.stringify(report.assetHashesEnd);
  report.finishedAt = new Date().toISOString();
  persist();
}
assert.equal(report.assetsUnchanged, true, "Tested assets remain unchanged throughout navigation verification");
assert.equal(report.cases.length, matrix.length, "Every selected browser, viewport and language was exercised");
assert.equal(report.cases.filter(entry => entry.status === "FAIL").length, 0, "Home navigation checks failed");
console.log(`Home navigation: PASS (${report.cases.length} browser/language/viewport journeys)`);
