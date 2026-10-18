import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { addOrderGroup, updateOrderGroupQuantity, removeOrderGroup } from "../src/order-draft.js";

const key = "robys-menu-order.v1";
const latte = "hot-coffee:caffe-latte";
const san = "desserts:san-sebastian-cheesecake";
const lotus = "desserts:lotus-cheesecake";
const americano = "hot-coffee:americano";
const readyOffer = "pairing-offers:iced-san-sebastian-pairing";
const ids = new Set([latte, san, lotus, americano, readyOffer]);
const copy = {
  tr: { edit: "Seçimi değiştir", save: "Değişiklikleri kaydet", saved: "Seçimin güncellendi" },
  en: { edit: "Edit selection", save: "Save changes", saved: "Selection updated" },
  ru: { edit: "Изменить состав", save: "Сохранить изменения", saved: "Состав обновлён" }
};

function initialDraft() {
  let draft = addOrderGroup(null, [{ id: latte }, { id: lotus }], 2, ids).draft;
  draft = addOrderGroup(draft, [{ id: americano }], 3, ids).draft;
  return addOrderGroup(draft, [{ id: readyOffer }], 1, ids).draft;
}

const stored = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key);

async function prepare(page, base, language, fallback = false, delayStorage = false) {
  await page.addInitScript(({ storageKey, language, draft, fallback, delayStorage }) => {
    localStorage.setItem(storageKey, JSON.stringify(draft));
    localStorage.setItem("robys-language", language);
    if (fallback) {
      for (const method of ["showModal", "close"]) Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, value: undefined });
      Object.defineProperty(HTMLDialogElement.prototype, "open", { configurable: true, get: () => undefined });
    }
    // Model a click before another tab's queued storage notification redraws
    // this tab. Save must read the canonical draft even with the old UI intact.
    if (delayStorage) window.addEventListener("storage", event => event.stopImmediatePropagation(), true);
  }, { storageKey: key, language, draft: initialDraft(), fallback, delayStorage });
  await page.goto(new URL("menu.html?entry=off", base).href, { waitUntil: "domcontentloaded" });
  await page.locator('#menu-root[data-ready="true"]').waitFor();
  await page.locator("#menu-cart-trigger").click();
  await page.locator("#menu-cart-dialog[open]").waitFor();
}

async function openEditor(page) {
  await page.locator(".menu-cart-edit").click();
  await page.locator("#menu-product-dialog[open]").waitFor();
  await page.locator('#menu-pairing-picker[data-ready="true"]').waitFor();
  assert.equal(await page.locator("#menu-cart-dialog[open]").count(), 0, "editing uses one modal at a time");
}

async function choose(page, dessertId) {
  const input = page.locator(`input[name="menu-dessert"][value="${dessertId}"]`);
  if (!await input.locator("..").isVisible()) await page.locator(".menu-pairing-expand").click();
  await input.locator("..").click();
}

export async function verifyMenuCartEditing(context, base, check) {
  async function run(id, body) {
    const page = await context.newPage();
    try {
      const evidence = await body(page);
      check(id, true, id, evidence);
    } catch (error) {
      check(id, false, error.stack ?? String(error));
    } finally { await page.close(); }
  }
  for (const language of ["tr", "en", "ru"]) for (const fallback of [false, true]) {
    await run(`MENU-CART-EDIT/${language}/${fallback ? "fallback" : "native"}`, async page => {
      await prepare(page, base, language, fallback);
      assert.equal(await page.locator(".menu-cart-edit").count(), 1, "a ready-offer SKU has no component editor");
      assert.equal(await page.locator(".menu-cart-edit").textContent(), copy[language].edit);
      await openEditor(page);
      assert.equal(await page.locator(`input[name="menu-dessert"][value="${lotus}"]`).isChecked(), true);
      assert.equal(await page.locator("#menu-product-quantity").textContent(), "2");
      assert.equal((await page.locator("#menu-add-to-cart").textContent()).startsWith(copy[language].save), true);
      const before = await stored(page);
      await choose(page, san);
      await page.locator("#menu-quantity-increase").click();
      assert.deepEqual(await stored(page), before, "choosing components is a draft until explicit Save");
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-cart-dialog[open]").waitFor();
      const saved = await stored(page);
      assert.equal(saved.groups.length, 3);
      assert.equal(saved.lines.find(line => line.id === latte).quantity, 3, "saving replaces the pair without another drink");
      assert.equal(saved.lines.find(line => line.id === san).quantity, 3);
      assert.equal(saved.lines.some(line => line.id === lotus), false);
      assert.deepEqual(saved.groups.filter(group => !group.items.some(item => item.id === latte)),
        before.groups.filter(group => !group.items.some(item => item.id === latte)), "unrelated selections stay unchanged");
      assert.equal(await page.locator("#menu-cart-title").textContent(), copy[language].saved);
      await openEditor(page);
      await choose(page, lotus);
      await page.locator("#menu-quantity-increase").click();
      await page.keyboard.press("Escape");
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.deepEqual(await stored(page), saved, "Escape cancels all uncommitted composition and quantity changes");
      assert.equal(await page.locator(".menu-cart-edit").evaluate(node => node === document.activeElement), true);
      await openEditor(page);
      await choose(page, "");
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-cart-dialog[open]").waitFor();
      const drinkOnly = await stored(page);
      assert.equal(drinkOnly.lines.find(line => line.id === latte).quantity, 3);
      assert.equal(drinkOnly.lines.some(line => line.id === san), false, "drink-only Save removes the former dessert");
      assert.equal(drinkOnly.groups.length, 3);
      return { language, fallback, replacedQuantity: 3, preservedUnrelated: true, cancelledWithoutWrite: true, drinkOnly: true };
    });
  }
  for (const mutation of ["quantity", "removed", "capacity"]) {
    await run(`MENU-CART-EDIT/latest-${mutation}`, async page => {
      await prepare(page, base, "ru", false, true);
      await openEditor(page);
      await choose(page, san);
      const original = await stored(page);
      const group = original.groups.find(entry => entry.items.some(item => item.id === latte));
      const latest = mutation === "quantity" ? updateOrderGroupQuantity(original, group.id, 3, ids).draft
        : mutation === "removed" ? removeOrderGroup(original, group.id, ids)
        : addOrderGroup(original, [{ id: san }], 99, ids).draft;
      const other = await context.newPage();
      try {
        await other.goto(new URL("404.html", base).href, { waitUntil: "domcontentloaded" });
        await other.evaluate(({ storageKey, draft }) => localStorage.setItem(storageKey, JSON.stringify(draft)), { storageKey: key, draft: latest });
      } finally { await other.close(); }
      assert.equal(await page.locator("#menu-add-to-cart").isEnabled(), true, "the simulated delayed notification leaves the original editor visible");
      await page.locator("#menu-add-to-cart").click();
      await page.locator("#menu-product-edit-error:not([hidden])").waitFor();
      assert.deepEqual(await stored(page), latest, "failed replacement preserves every latest cart group atomically");
      assert.equal(await page.locator("#menu-product-dialog[open]").isVisible(), true);
      assert.equal(await page.locator("#menu-product-edit-error").evaluate(node => node === document.activeElement), true);
      if (mutation !== "capacity") assert.match(await page.locator("#menu-product-edit-error").textContent(), /другом окне/);
      await page.keyboard.press("Escape");
      await page.locator("#menu-cart-dialog[open]").waitFor();
      assert.deepEqual(await stored(page), latest);
      return { mutation, staleEditorRejected: mutation !== "capacity", capRejected: mutation === "capacity", preservedLatest: true };
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MENU_CART_EDIT_PORT ?? 4199);
  const base = `http://127.0.0.1:${port}/`;
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: "ignore" });
  const report = { checks: [] };
  let browser;
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", serviceWorkers: "block" });
    await verifyMenuCartEditing(context, base, (id, passed, message, evidence) => report.checks.push({ id, passed, message, evidence }));
    await context.close();
  } finally {
    await browser?.close();
    server.kill();
    mkdirSync(".artifacts/menu-cart-edit", { recursive: true });
    writeFileSync(".artifacts/menu-cart-edit/report.json", JSON.stringify(report, null, 2) + "\n");
  }
  const failures = report.checks.filter(check => !check.passed);
  console.log(`Menu cart editing: ${report.checks.length - failures.length}/${report.checks.length} passed`);
  if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
}
