import { createServer } from "node:https";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "playwright";

// Serve the emitted site unchanged, including its original CSP. Text enlargement
// below changes the root font size, not native browser zoom or a physical phone.
const repo = resolve(new URL("..", import.meta.url).pathname);
process.chdir(repo);
const output = resolve(process.env.ROBYS_HOME_QA_DIR ?? ".artifacts/home-menu-responsive");
mkdirSync(output, { recursive: true });
const list = (name, fallback) => (process.env[name] ?? fallback).split(",").map(value => value.trim()).filter(Boolean);
const engines = list("ROBYS_HOME_QA_ENGINES", "chromium,firefox,webkit");
const languages = list("ROBYS_HOME_QA_LANGUAGES", "tr,en,ru");
const widths = list("ROBYS_HOME_QA_WIDTHS", "320,390,680,681,979,980,981,1024,1120,1121,1122,1280,1366,1440,1920").map(Number);
const textWidths = list("ROBYS_HOME_QA_TEXT_WIDTHS", "320,681,981,1121,1440").map(Number);
const baseline = process.env.ROBYS_HOME_QA_BASELINE === "1";
const browsers = { chromium, firefox, webkit };
if (!engines.length || engines.some(name => !browsers[name])) throw new Error("Select chromium, firefox or webkit with ROBYS_HOME_QA_ENGINES");
if (!languages.length || languages.some(language => !["tr", "en", "ru"].includes(language))) throw new Error("Invalid language matrix");
if (![...widths, ...textWidths].every(width => Number.isInteger(width) && width >= 320)) throw new Error("Invalid viewport matrix");
const assets = ["index.html", "styles-v2.css", "mobile.css", "conversion.css", "menu-preview.css", "final-qa-v2.css",
  "brand-photo-logo.css", "coffee-paths.css", "seasonal.css", "app.js", "src/app.ts", "src/i18n.ts", "bootstrap-v2.js",
  "scripts/test-home-menu-responsive-browser.mjs"];
const hashes = () => Object.fromEntries(assets.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = {
  startedAt: new Date().toISOString(), head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirtyFilesAtStart: execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().split("\n").filter(Boolean),
  mode: "Unchanged emitted files over local HTTPS; desktop engines and CSS-pixel viewports; not physical phones or native browser zoom",
  baseline, environment: { bypassCSP: false, externalRequests: "blocked", serviceWorkers: "blocked", reducedMotion: "reduce" },
  matrix: { engines, languages, widths, textWidths, textScale: "200% root font size (32px); CSS text enlargement, not browser zoom" },
  screenshotPolicy: "Every failed case plus successful RU cases at 320, 1121 and 1440 CSS pixels, including 200% text",
  sourceHashesStart: hashes(), browserVersions: {}, cases: []
};
const persist = () => writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
const certificate = mkdtempSync(join(tmpdir(), "robys-home-menu-"));
execFileSync("openssl", ["req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-keyout", join(certificate, "key.pem"),
  "-out", join(certificate, "cert.pem"), "-subj", "/CN=localhost"], { stdio: "ignore" });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4" };
const server = createServer({ key: readFileSync(join(certificate, "key.pem")), cert: readFileSync(join(certificate, "cert.pem")) }, (request, response) => {
  try {
    let file = resolve(repo, "." + decodeURIComponent(new URL(request.url, "https://127.0.0.1").pathname));
    if (file !== repo && !file.startsWith(repo + sep)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(400).end(); }
});

// Assertions use rendered native Range rectangles. A document-wide scrollbar
// check alone misses clipped text and content painting into the arrow gutter.
function inspectHomeMenu() {
  const tolerance = 2;
  const rect = element => {
    const value = element.getBoundingClientRect();
    return Object.fromEntries(["left", "right", "top", "bottom", "width", "height"].map(key => [key, +value[key].toFixed(3)]));
  };
  const visible = element => {
    if (!element || !element.getClientRects().length) return false;
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const violations = [];
  const issue = (scope, reason, evidence) => violations.push({ scope, reason, ...evidence });
  const within = (inner, outer, vertical = false) => inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance
    && (!vertical || inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance);
  const overlaps = (a, b) => a.left < b.right - tolerance && a.right > b.left + tolerance && a.top < b.bottom - tolerance && a.bottom > b.top + tolerance;
  const viewport = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
  const rangeRects = element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const result = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !visible(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) result.push({
        text: node.textContent.trim(), rect: Object.fromEntries(["left", "right", "top", "bottom", "width", "height"].map(key => [key, +box[key].toFixed(3)]))
      });
    }
    return result;
  };
  const menu = document.querySelector("#menu");
  const layout = menu.querySelector(".menu-layout");
  const intro = menu.querySelector(".menu-intro");
  const heading = intro.querySelector("h2");
  const headingRows = rangeRects(heading);
  for (const row of headingRows) for (const [name, boundary] of [["heading", heading], ["intro", intro], ["layout", layout], ["section", menu]]) {
    if (!within(row.rect, rect(boundary))) issue("menu-heading", `text exceeds ${name} horizontally`, { ...row, boundary: rect(boundary) });
  }
  if (!within(rect(layout), viewport)) issue("menu-layout", "layout exceeds viewport horizontally", { rect: rect(layout), viewport });
  const expectedHrefs = ["menu.html#hot-coffee", "menu.html#cold-coffee", "menu.html#brew-hot", "menu.html#refreshers", "menu.html#desserts", "menu.html#food"];
  const cards = [...menu.querySelectorAll(".menu-card-link")].map((card, index) => {
    const copy = card.querySelector(":scope>div");
    const icon = card.querySelector(".menu-icon");
    const cardBox = rect(card), copyBox = rect(copy), iconBox = rect(icon);
    const style = getComputedStyle(card);
    // The authored right padding reserves room for the decorative arrow.
    const content = { left: cardBox.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
      right: cardBox.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      top: cardBox.top + parseFloat(style.borderTopWidth), bottom: cardBox.bottom - parseFloat(style.borderBottomWidth) };
    const fields = [...copy.querySelectorAll("h3,p")].filter(visible).map(element => {
      const rows = rangeRects(element), own = rect(element);
      for (const row of rows) {
        for (const [name, boundary, vertical] of [[element.tagName.toLowerCase(), own, false], ["copy", copyBox, false], ["card", cardBox, true], ["content/arrow gutter", content, false]]) {
          if (!within(row.rect, boundary, vertical)) issue(`card-${index + 1}`, `text exceeds ${name}`, { ...row, boundary });
        }
        if (getComputedStyle(element).overflow !== "visible" && !within(row.rect, own, true)) {
          issue(`card-${index + 1}`, "text is clipped by its own element", { ...row, boundary: own });
        }
        if (overlaps(row.rect, iconBox)) issue(`card-${index + 1}`, "text overlaps icon", { ...row, icon: iconBox });
      }
      if (element.scrollHeight > element.clientHeight + tolerance && getComputedStyle(element).overflow !== "visible") {
        issue(`card-${index + 1}`, "hidden title lines", { text: element.textContent.trim(), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight });
      }
      return { tag: element.tagName.toLowerCase(), text: element.textContent.trim(), rect: own, rows };
    });
    if (!within(cardBox, rect(layout)) || !within(cardBox, viewport)) issue(`card-${index + 1}`, "card exceeds layout or viewport", { rect: cardBox, layout: rect(layout), viewport });
    if (!within(iconBox, cardBox, true)) issue(`card-${index + 1}`, "icon exceeds card", { icon: iconBox, card: cardBox });
    if (card.getAttribute("href") !== expectedHrefs[index]) issue(`card-${index + 1}`, "native category destination changed", { href: card.getAttribute("href"), expected: expectedHrefs[index] });
    return { href: card.getAttribute("href"), rect: cardBox, copy: copyBox, icon: iconBox, fields };
  });
  if (cards.length !== 6) issue("menu-cards", "expected all six category links", { count: cards.length });
  const brand = document.querySelector(".site-header .brand");
  const actions = document.querySelector(".site-header .header-actions");
  const navigation = document.querySelector(".site-header .main-nav");
  const header = { brand: rect(brand), actions: rect(actions), navigation: rect(navigation), navigationVisible: visible(navigation) };
  for (const [name, box] of [["brand", header.brand], ["header-actions", header.actions]]) {
    if (!within(box, viewport)) issue("header", `${name} exceeds viewport`, { rect: box, viewport });
  }
  if (overlaps(header.brand, header.actions)) issue("header", "brand overlaps language controls", header);
  if (header.navigationVisible) {
    if (!within(header.navigation, viewport)) issue("header", "navigation exceeds viewport", header);
    if (overlaps(header.navigation, header.brand) || overlaps(header.navigation, header.actions)) issue("header", "navigation overlaps brand or language controls", header);
    for (const link of navigation.querySelectorAll("a")) for (const row of rangeRects(link)) {
      if (!within(row.rect, rect(link), true)) issue("header", "navigation text exceeds link", { ...row, link: rect(link) });
    }
  }
  return { language: document.documentElement.lang, rootFontSize: getComputedStyle(document.documentElement).fontSize,
    documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
    menu: rect(menu), layout: rect(layout), heading: { text: heading.textContent.trim(), rect: rect(heading), rows: headingRows }, header, cards, violations };
}

try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `https://127.0.0.1:${server.address().port}`;
  for (const engine of engines) {
    let browser;
    try {
      browser = await browsers[engine].launch({ headless: true });
      report.browserVersions[engine] = browser.version();
      for (const textScale of [1, 2]) for (const width of textScale === 1 ? widths : textWidths) for (const language of languages) {
        const id = `${engine}-${width}-${language}${textScale === 2 ? "-text200" : ""}`;
        const result = { id, engine, width, height: 900, language, textScale, status: "FAIL", screenshots: [] };
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", ignoreHTTPSErrors: true, serviceWorkers: "block" });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
          await context.addInitScript(({ language, origin }) => { if (location.origin === origin) localStorage.setItem("robys-language", language); }, { language, origin });
          await page.goto(`${origin}/?entry=off`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(language => document.documentElement.lang === language && document.querySelector(".lang-button.active")?.dataset.lang === language, language);
          await page.waitForFunction(() => !document.documentElement.hasAttribute("data-robys-entry-pending"));
          await page.evaluate(async () => { await document.fonts.ready; });
          if (textScale === 2) await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
          await page.locator("#menu").scrollIntoViewIfNeeded();
          // Capture after the section's normal reveal observer has run. Reduced
          // motion removes transition delays; no application helpers are called.
          await page.waitForFunction(() => [...document.querySelectorAll("#menu .menu-card-link")].every(element => getComputedStyle(element).opacity === "1"));
          result.geometry = await page.evaluate(inspectHomeMenu);
          result.errors = errors;
          if (result.geometry.language !== language) result.geometry.violations.push({ scope: "localization", reason: "selected language was not applied" });
          if (errors.length) result.geometry.violations.push({ scope: "runtime", reason: "uncaught application exceptions", errors });
          result.status = result.geometry.violations.length ? "FAIL" : "PASS";
          const representative = language === "ru" && [320, 1121, 1440].includes(width);
          if (result.status === "FAIL" || representative) {
            const menuShot = join(output, `${id}-menu.png`);
            await page.locator("#menu").screenshot({ path: menuShot, animations: "disabled" });
            result.screenshots.push(relative(output, menuShot));
            await page.evaluate(() => window.scrollTo(0, 0));
            const headerShot = join(output, `${id}-header.png`);
            await page.screenshot({ path: headerShot, animations: "disabled" });
            result.screenshots.push(relative(output, headerShot));
          }
        } catch (error) {
          result.error = String(error.stack ?? error);
          try {
            const file = join(output, `${id}-error.png`);
            await page.screenshot({ path: file, animations: "disabled" });
            result.screenshots.push(relative(output, file));
          } catch { /* Preserve the primary failure if the page itself failed. */ }
        } finally {
          report.cases.push(result);
          persist();
          console.log(`${result.status} ${id}${result.geometry?.violations.length ? ` (${result.geometry.violations.length} violations)` : ""}`);
          await context.close();
        }
      }
    } catch (error) {
      report.cases.push({ id: `${engine}-launch`, engine, status: "FAIL", error: String(error.stack ?? error) });
      persist();
    } finally { await browser?.close(); }
  }
} finally {
  report.sourceHashesEnd = hashes();
  report.sourceChangedDuringRun = Object.keys(report.sourceHashesStart).filter(file => report.sourceHashesStart[file] !== report.sourceHashesEnd[file]);
  report.completedAt = new Date().toISOString();
  report.summary = { passed: report.cases.filter(item => item.status === "PASS").length, failed: report.cases.filter(item => item.status !== "PASS").length };
  persist();
  await new Promise(resolve => server.close(resolve));
  rmSync(certificate, { recursive: true, force: true });
}
console.log(`Home menu responsive: ${report.summary.passed} passed, ${report.summary.failed} failed${baseline ? " (baseline recording)" : ""}; ${join(output, "report.json")}`);
if (!baseline && (report.summary.failed || report.sourceChangedDuringRun.length)) process.exitCode = 1;
