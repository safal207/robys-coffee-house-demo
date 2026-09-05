import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const output = ".artifacts/premium-feedback";
mkdirSync(output, { recursive: true });
const base = "http://127.0.0.1:4192/";
const server = spawn("python3", ["-m", "http.server", "4192", "--bind", "127.0.0.1"], { stdio: "ignore" });
const report = { boundary: "Real Chromium navigation with original CSP, emulated viewport; no physical-device/FPS/payment claim", checks: [], failures: [] };
let browser;
function check(id, passed, evidence = null) {
  const result = { id, passed: Boolean(passed), evidence };
  report.checks.push(result);
  if (!passed) report.failures.push(result);
}
async function ready() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Server startup timeout");
}
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  for (const lang of ["tr", "en", "ru"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "no-preference", locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "menu.html?entry=off", { waitUntil: "domcontentloaded" });
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    await page.locator(`.lang-button[data-lang="${lang}"]`).click();
    const first = page.locator(".full-menu-item--product").first();
    const media = first.locator(".full-menu-item-media");
    const id = await first.getAttribute("data-product-id");
    await media.click();
    const unit = Number((await page.locator("#menu-product-price").textContent()).replace(/\D/g, ""));
    await page.locator("#menu-quantity-increase").click();
    check(`${lang}/quantity-preview`, (await page.locator("#menu-product-quantity").textContent()) === "2" && (await page.locator("#menu-add-to-cart").textContent()).includes(String(unit * 2)), { unit });
    await page.locator("#menu-add-to-cart").click();
    check(`${lang}/cart-add-two`, (await page.locator("#menu-cart-count").textContent()) === "2", { id });
    check(`${lang}/selected-card`, await first.evaluate(row => row.classList.contains("is-in-cart")) && (await media.getAttribute("data-cart-quantity")) === "2", { id });
    check(`${lang}/focus-return`, await media.evaluate(el => el === document.activeElement));
    await page.waitForFunction(() => document.querySelector("#menu-cart-status.is-visible")?.textContent.includes("× 2"));
    check(`${lang}/visible-confirmation`, true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('#menu-root[data-ready="true"]').waitFor();
    check(`${lang}/session-restores-highlight`, await first.evaluate(row => row.classList.contains("is-in-cart")) && (await media.getAttribute("data-cart-quantity")) === "2");
    await page.locator("#menu-cart-trigger").click();
    check(`${lang}/exact-total`, (await page.locator("#menu-cart-dialog-total").textContent()).replace(/\D/g, "") === String(unit * 2), { expected: unit * 2 });
    await page.locator(".menu-cart-line img").evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.waitForTimeout(400);
    if (lang === "ru") await page.screenshot({ path: `${output}/cart-390.png` });
    await page.locator(".menu-cart-step").nth(1).click();
    check(`${lang}/increment`, (await page.locator("#menu-cart-count").textContent()) === "3" && (await media.getAttribute("data-cart-quantity")) === "3");
    await page.locator(".menu-cart-remove").click();
    check(`${lang}/remove-clears-state`, (await page.locator("#menu-cart-count").textContent()) === "0" && !(await first.evaluate(row => row.classList.contains("is-in-cart"))));
    await page.keyboard.press("Escape");
    const category = page.locator('[data-category="herbal-tea"]');
    await category.focus();
    await page.keyboard.press("Space");
    check(`${lang}/keyboard-category`, await category.evaluate(el => el === document.activeElement && el.getAttribute("aria-pressed") === "true"));
    const button = page.locator("#menu-cart-trigger");
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    assert(box, "Cart button is rendered");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(240);
    const transform = await button.evaluate(el => getComputedStyle(el).transform);
    check(`${lang}/press-feedback`, transform !== "none" && !transform.startsWith("matrix(1, 0, 0, 1,"), { transform });
    await page.mouse.up();
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".full-menu-item--product .full-menu-item-media").first().click();
    const animation = await page.locator(".menu-product-shell").evaluate(el => getComputedStyle(el).animationName);
    check(`${lang}/reduced-motion`, animation === "none", { animation });
    await page.keyboard.press("Escape");
    await page.locator(".full-menu-item-media img").evaluateAll(images => Promise.all(images.map(async img => { img.loading = "eager"; await img.decode(); })));
    if (lang === "ru") await page.screenshot({ path: `${output}/herbal-390.png`, fullPage: true });
    check(`${lang}/no-runtime-errors`, !errors.length, errors);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(base + "index.html?entry=off");
  await page.locator("[data-smart-choice-entry]").waitFor();
  const link = page.locator('.hero-actions a[href="menu.html"]');
  check("home/direct-menu", await link.isVisible());
  const bounds = await link.boundingBox();
  check("home/touch-target", bounds && bounds.height >= 44, bounds);
  await page.screenshot({ path: `${output}/home-390.png` });
  await page.locator(".android-app-section").scrollIntoViewIfNeeded();
  const mark = page.locator("img.android-app-screen-mark");
  await mark.waitFor();
  check("brand/approved-asset", await mark.evaluate(async img => { await img.decode(); return img.naturalWidth > 0 && img.alt === "Roby's Coffee House"; }));
  await context.close();
} catch (error) {
  check("FATAL", false, error.stack ?? String(error));
} finally {
  await browser?.close();
  server.kill();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
}
console.log(`Premium feedback: ${report.checks.length - report.failures.length}/${report.checks.length} passed`);
if (report.failures.length) { console.error(JSON.stringify(report.failures, null, 2)); process.exitCode = 1; }
