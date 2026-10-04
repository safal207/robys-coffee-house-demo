import { readVerifiedMenuSource } from "./menu-runtime-source.mjs";
import "./verify-pairing-cta-static.mjs";
import "./verify-pairing-catalog-parity.mjs";
import "./verify-menu-truth-live.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const analytics = readFileSync("analytics.js", "utf8");
const index = readFileSync("index.html", "utf8");
const menuData = readFileSync("menu-catalog.js", "utf8");
const menuRuntime = readVerifiedMenuSource();
const pairingRuntime = readFileSync("pairing-posters.js", "utf8");
const pairingCss = readFileSync("pairing-posters.css", "utf8");

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
  const payload = window.dataLayer[0];
  assert.equal(payload.event, "robys_action");
  assert.equal(payload.action, "pairing_click");
  assert.equal(payload.language, "en");
  assert.equal(payload.path, "/index.html");
  assert.equal(payload.placement, "hero");
  assert.equal(Object.keys(payload).length, 5, "pairing CTA payload contains unexpected fields");

  assert.equal(dispatchedEvents.length, 1, "one CTA click must dispatch exactly one analytics event");
  assert.equal(dispatchedEvents[0].type, "robys:analytics");
  assert.equal(dispatchedEvents[0].detail, payload, "dataLayer and CustomEvent must share the same payload");
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

assert.match(pairingRuntime, /media\.setAttribute\("aria-expanded", "true"\)/, "pairing disclosure must publish expanded state");
assert.match(pairingRuntime, /media\.setAttribute\("aria-controls", panel\.id\)/, "pairing disclosure must own its inline region");
assert.match(pairingRuntime, /panel\.setAttribute\("role", "region"\)/, "inline discovery must expose region semantics");
assert.match(pairingRuntime, /panel\.setAttribute\("aria-labelledby", title\.id\)/, "inline discovery region must have an accessible name");
assert.match(pairingRuntime, /removeExperiencePanel\(\{ restoreFocus: true \}\)/, "closing inline discovery must restore focus");
assert.match(pairingRuntime, /event\.key !== "Escape"/, "inline discovery must support Escape without hijacking dialogs");

assert.match(pairingCss, /\.full-menu-panel--featured \.full-menu-list\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/, "featured pairing list must stay within its grid track");
assert.match(pairingCss, /\.full-menu-item--visual\.pairing-poster-card\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/, "pairing cards must not widen the page");
assert.match(pairingCss, /\.pairing-poster-title-main,[\s\S]*?overflow-wrap: anywhere;/, "long localized pairing titles must wrap instead of clipping");
assert.match(pairingCss, /\.pairing-poster-bottom\s*\{[\s\S]*?flex-wrap: wrap;/, "pairing taste chips must wrap instead of overflowing");
assert.match(pairingCss, /\.full-menu-item--visual\.pairing-poster-card:focus-within/, "pairing cards need a high-contrast keyboard focus state");
assert.match(pairingCss, /\.pairing-discovery-panel\s*\{[\s\S]*?border-left-width: 5px;/, "inline discovery must be visually distinct without pretending to be a modal");

assert.match(index, /<section class="section visit-section" id="visit">[\s\S]*google\.com\/maps\/dir\//);
assert.match(index, /<nav class="mobile-cta"[\s\S]*google\.com\/maps\/dir\//);

console.log("✅ PAIRING-CTA-001: CTA analytics, deep-link behavior, pairing disclosure accessibility and overflow/focus contracts are intact.");
