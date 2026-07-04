import "./verify-pairing-cta-static.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const analytics = readFileSync("analytics.js", "utf8");
const index = readFileSync("index.html", "utf8");
const menuData = readFileSync("menu-data.js", "utf8");
const menuRuntime = readFileSync("menu-page.js", "utf8");

function verifyAnalyticsBehavior() {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const dispatchedEvents = [];

  const cta = {
    href: "https://example.test/menu.html#pairing-offers",
    textContent: "Bugünün Eşleşmesini Gör",
    dataset: { analyticsAction: "pairing_click" },
    closest(selector) {
      if (selector === "a") return this;
      if (selector === ".hero") return { id: "hero" };
      return null;
    }
  };

  const document = {
    documentElement: { lang: "tr" },
    querySelectorAll() { return []; },
    addEventListener(type, handler) { documentListeners.set(type, handler); },
    dispatchEvent(event) { dispatchedEvents.push(event); return true; }
  };

  const window = {
    dataLayer: [],
    addEventListener(type, handler) { windowListeners.set(type, handler); }
  };

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  vm.runInNewContext(analytics, {
    window,
    document,
    location: { pathname: "/index.html" },
    CustomEvent,
    console
  });

  assert.equal(cta.textContent, "Bugünün Eşleşmesini Gör", "analytics must not rewrite initial CTA copy");
  document.documentElement.lang = "en";
  assert.equal(cta.textContent, "Bugünün Eşleşmesini Gör", "analytics must not own CTA language changes");

  const activateAnalytics = windowListeners.get("pointerdown");
  assert.equal(typeof activateAnalytics, "function", "analytics must lazy-initialize on first interaction");
  activateAnalytics({ type: "pointerdown" });

  const clickHandler = documentListeners.get("click");
  assert.equal(typeof clickHandler, "function", "analytics must register one delegated click handler");
  clickHandler({ target: cta });

  assert.equal(window.dataLayer.length, 1, "one CTA click must emit exactly one analytics payload");
  assert.deepEqual(
    window.dataLayer[0],
    {
      event: "robys_action",
      action: "pairing_click",
      language: "en",
      path: "/index.html",
      placement: "hero"
    },
    "pairing CTA analytics payload changed"
  );
  assert.equal(dispatchedEvents.length, 1, "one CTA click must dispatch exactly one analytics event");
  assert.equal(dispatchedEvents[0].type, "robys:analytics");
  assert.deepEqual(dispatchedEvents[0].detail, window.dataLayer[0]);
}

verifyAnalyticsBehavior();

const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
assert.match(heroActions, /class="button button-primary"/);
assert.match(heroActions, /class="button button-ghost" href="menu\.html"/);

const firstCategory = menuData.match(/export const menuCategories = \[\s*\{\s*id: "([^"]+)"/)?.[1];
assert.equal(firstCategory, "pairing-offers", "Pairing offers must remain the first menu category");
assert.match(menuRuntime, /window\.location\.hash\.slice\(1\)/);
assert.match(menuRuntime, /menuCategories\.some\(\(category\) => category\.id === requested\)/);
assert.match(menuRuntime, /document\.querySelector\("\.full-menu-wrap"\)\?\.scrollIntoView/);

assert.match(index, /<section class="section visit-section" id="visit">[\s\S]*google\.com\/maps\/dir\//);
assert.match(index, /<nav class="mobile-cta"[\s\S]*google\.com\/maps\/dir\//);

console.log("✅ PAIRING-CTA-001: behavior proves one pairing_click event, analytics leaves localization untouched, and the customer path remains intact.");
