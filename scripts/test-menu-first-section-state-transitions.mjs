import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { compiled } from "./experiment-menu-first-section-render.mjs";

// Disposable browser-context state graph. Changes are never deployed.
const BASE = "https://safal207.github.io/robys-coffee-house-demo/";
const OUTPUT = ".artifacts/menu-first-photo-experiment/staged-render-state-machine.json";
const modes = ["control", "default-list-only"];
const entries = [
  { id: "default", path: "menu.html?view=list" },
  { id: "search", path: "menu.html?view=list&q=latte" },
  { id: "category", path: "menu.html?view=list#desserts" },
  { id: "product", path: "menu.html?view=list&product=pairing-offers:iced-san-sebastian-pairing" }
];
const IMG = "#menu-root .full-menu-item-media img";

async function snapshot(page) {
  return page.evaluate(() => ({
    ids: [...document.querySelectorAll("#menu-root [data-product-id]")]
      .map(node => node.dataset.productId),
    sections: [...document.querySelectorAll("#menu-root .full-menu-panel")]
      .map(node => node.id),
    firstPhoto: (() => {
      const img = document.querySelector("#menu-root .full-menu-item-media img");
      const src = img?.currentSrc || img?.src;
      return src ? new URL(src).pathname : null;
    })(),
    lang: document.documentElement.lang,
    query: document.querySelector("#menu-search")?.value ?? null,
    hash: location.hash,
    noResults: !document.querySelector("#menu-empty")?.hidden,
    ready: document.querySelector("#menu-root")?.dataset.ready === "true",
    cartCount: Number(document.querySelector("#menu-cart-count")?.textContent),
    url: location.href
  }));
}

async function stable(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector("#menu-root");
    return root?.dataset.ready === "true" &&
      (root.querySelector("[data-product-id]") || !document.querySelector("#menu-empty")?.hidden);
  }, null, { timeout: 25000 });
  // A stale ready flag from the previous state is not proof of full rendering.
  // Use two separate event-loop turns before asserting structural invariants.
  await page.waitForTimeout(80);
  return snapshot(page);
}

async function input(page, value) {
  await page.evaluate(next => {
    const el = document.querySelector("#menu-search");
    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  return stable(page);
}

async function one(browser, mode, entry) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  let replaced = 0;
  page.on("pageerror", e => errors.push(e.message));
  await page.route(url => url.pathname.endsWith("/menu-app.js"), async route => {
    const original = await route.fetch();
    assert.equal(original.status(), 200);
    replaced++;
    await route.fulfill({ response: original, body: compiled[mode] });
  });
  const transitions = [];
  function save(name, value) {
    transitions.push({ name, ...value });
    return value;
  }
  try {
    const res = await page.goto(new URL(entry.path, BASE).href,
      { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.ok(res?.ok(), "Menu document unavailable");
    await page.locator(IMG).first().waitFor({ state: "attached", timeout: 25000 });
    const baseline = save("initial", await stable(page));
    assert.ok(baseline.ids.length > 0 && baseline.firstPhoto?.includes("/src/products/"));
    assert.equal(replaced, 1);
    if (entry.id === "search") assert.equal(baseline.query, "latte");
    if (entry.id === "category") assert.equal(baseline.hash, "#desserts");
    if (entry.id === "product") assert.ok(
      baseline.ids.includes("pairing-offers:iced-san-sebastian-pairing"));

    // A rapid succession of inputs tests cancellation of work scheduled by
    // an earlier render. The last search must win, without stale product cards.
    await page.evaluate(() => {
      const field = document.querySelector("#menu-search");
      for (const value of ["latte", "coffee", "zzzxxyy-no-products"]) {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const empty = save("rapid-search-to-empty", await stable(page));
    assert.equal(empty.ids.length, 0, "Old cards reappeared after rapid search");
    assert.equal(empty.noResults, true, "Empty state did not appear");
    assert.equal(empty.query, "zzzxxyy-no-products");

    const restored = save("reset-search", await input(page, ""));
    // Search and a previous category hash alter the desired view; compare the
    // final reset against another ordinary all-category state instead.
    assert.ok(restored.ids.length >= baseline.ids.length,
      "Reset search lost catalog products");

    // Real, delegated category selection must not be broken by the deferred append.
    const chip = page.locator('.menu-category-chip[data-category="desserts"]');
    await chip.click();
    const desserts = save("select-desserts", await stable(page));
    assert.equal(desserts.hash, "#desserts");
    assert.deepEqual(desserts.sections, ["desserts"]);
    assert.ok(desserts.ids.length > 0);
    assert.ok(desserts.firstPhoto?.includes("/src/products/"));

    // Typing while a category is active must clear the category filter and
    // keep the new query, not resurrect a pending old category.
    const searched = save("search-from-category", await input(page, "latte"));
    assert.equal(searched.hash, "");
    assert.equal(searched.query, "latte");
    assert.ok(searched.ids.length > 0);
    assert.ok(searched.sections.length > 0);

    const cleared = save("clear-and-restore-all", await input(page, ""));
    assert.equal(cleared.hash, "");
    assert.ok(cleared.ids.length >= restored.ids.length,
      "Clearing filter must return the complete catalog");

    await page.locator('.lang-button[data-lang="ru"]').click();
    const russian = save("switch-language", await stable(page));
    assert.equal(russian.lang, "ru");
    assert.deepEqual(russian.ids, cleared.ids,
      "Changing the language must not reorder or duplicate products");

    // A cart read does not add or commit an order. It must still open/close
    // normally after multiple product-list redraws.
    await page.locator("#menu-cart-trigger").click();
    await page.locator("#menu-cart-dialog[open]").waitFor({ timeout: 20000 });
    save("open-cart", await snapshot(page));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#menu-cart-dialog")?.hasAttribute("open"),
      null, { timeout: 10000 });
    save("close-cart", await snapshot(page));
    assert.deepEqual(errors, [], "JavaScript exceptions during menu transitions");
    return { mode, case: entry.id, transitions, errors, interceptedRuntimeCount: replaced };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const samples = [];
  try {
    for (const entry of entries) {
      for (const mode of modes) {
        const sample = await one(browser, mode, entry);
        samples.push(sample);
        console.log("STAGED_STATE_SAMPLE " + JSON.stringify({
          mode, case: entry.id, transitions: sample.transitions.map(t => ({
            name: t.name, cards: t.ids.length, sections: t.sections.length,
            lang: t.lang, hash: t.hash, query: t.query, cartCount: t.cartCount
          }))
        }));
      }
    }
  } finally {
    await browser.close();
  }
  for (const entry of entries) {
    const control = samples.find(s => s.case === entry.id && s.mode === "control");
    const candidate = samples.find(s => s.case === entry.id && s.mode === "default-list-only");
    assert.ok(control && candidate, "Missing state pair");
    assert.deepEqual(candidate.transitions.map(s => s.name),
      control.transitions.map(s => s.name), "Transition sequence changed");
    for (let i = 0; i < control.transitions.length; i++) {
      const a = control.transitions[i], b = candidate.transitions[i];
      assert.deepEqual(b.ids, a.ids,
        entry.id + " " + a.name + ": product order differs");
      assert.deepEqual(b.sections, a.sections,
        entry.id + " " + a.name + ": category order differs");
      assert.equal(b.firstPhoto, a.firstPhoto,
        entry.id + " " + a.name + ": wrong first photo");
      assert.equal(b.lang, a.lang);
      assert.equal(b.hash, a.hash);
      assert.equal(b.query, a.query);
      assert.equal(b.noResults, a.noResults);
      assert.equal(b.cartCount, a.cartCount);
    }
  }
  const report = {
    schema: "robys.first-section-render-state-graph.v1",
    synthetic: true, productionApproved: false,
    routes: entries.length, modes: modes.length,
    transitionsPerRoute: samples[0].transitions.length,
    note: "Published page, in-memory compiled JS interception; no production deployment",
    samples
  };
  mkdirSync(".artifacts/menu-first-photo-experiment", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
  console.log("STAGED_STATE_SUMMARY " + JSON.stringify({
    routes: entries.length, modes: modes.length,
    transitionStates: samples.reduce((n, sample) => n + sample.transitions.length, 0)
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
