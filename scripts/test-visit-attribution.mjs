import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("analytics.js", "utf8");
const storage = new Map();
const windowListeners = new Map();
const documentListeners = new Map();
const appended = [];

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.removed = false;
    this.open = false;
    this.textContent = "";
    this.className = "";
    this.id = "";
    this.type = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, callback) {
    this.listeners.set(type, callback);
  }

  append(...children) {
    this.children.push(...children);
  }

  remove() {
    this.removed = true;
  }

  close() {
    this.open = false;
    this.listeners.get("close")?.();
  }

  showModal() {
    this.open = true;
  }

  closest() {
    return null;
  }
}

const document = {
  documentElement: { lang: "en" },
  body: {
    append(node) {
      appended.push(node);
    }
  },
  querySelector(selector) {
    if (!selector.startsWith("#")) return null;
    const id = selector.slice(1);
    return [...appended]
      .reverse()
      .find((node) => node.id === id && !node.removed) || null;
  },
  querySelectorAll() {
    return [];
  },
  createElement(tagName) {
    return new ElementStub(tagName);
  },
  createRange() {
    return { selectNodeContents() {} };
  },
  addEventListener(type, callback) {
    documentListeners.set(type, callback);
  },
  dispatchEvent() {}
};

const windowObject = {
  dataLayer: [],
  addEventListener(type, callback) {
    windowListeners.set(type, callback);
  },
  getSelection() {
    return { removeAllRanges() {}, addRange() {} };
  }
};

const context = vm.createContext({
  console,
  window: windowObject,
  document,
  location: { pathname: "/" },
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  },
  navigator: { clipboard: { async writeText() {} } },
  crypto: webcrypto,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
  IntersectionObserver: class IntersectionObserver {
    observe() {}
    unobserve() {}
  },
  Uint8Array,
  Date,
  JSON,
  Object,
  Array,
  Number,
  String,
  TypeError,
  Error,
  Math,
  setTimeout,
  clearTimeout
});
context.globalThis = context;
vm.runInContext(source, context, { filename: "analytics.js" });

assert.ok(windowObject.robysVisitAttribution, "Public attribution API must exist");
assert.equal(windowObject.robysVisitAttribution.events().length, 0);

windowListeners.get("pointerdown")();
const link = {
  href: "https://www.google.com/maps/dir/?api=1&destination=Robys",
  closest(selector) {
    if (selector === "#visit") return { id: "visit" };
    if (selector === "section[id]") return { id: "visit" };
    return null;
  }
};
const target = {
  closest(selector) {
    if (selector === "a") return link;
    return null;
  }
};
documentListeners.get("click")({ target });

const events = windowObject.robysVisitAttribution.events();
assert.equal(events.length, 1);
assert.match(events[0].eventId, /^wev_[a-z0-9]{16}$/);
assert.match(events[0].campaignToken, /^rv_[a-z0-9]{20}$/);
assert.equal(events[0].eventName, "visit_intent_created");
assert.ok(Number.isFinite(Date.parse(events[0].occurredAt)));
assert.equal(appended.length, 1);
assert.equal(appended[0].tagName, "dialog");
assert.equal(appended[0].open, true);

const bundle = windowObject.robysVisitAttribution.buildBaselineBundle([
  {
    orderId: "ord_001",
    orderedAt: "2026-07-04T12:00:00+03:00",
    campaignToken: events[0].campaignToken,
    grossRevenue: "300.00",
    currency: "TRY",
    variableCost: "140.00"
  }
]);
assert.equal(bundle.schemaVersion, "robys-attribution-input.v0");
assert.equal(bundle.mode, "BASELINE");
assert.equal(bundle.productRef, "PROD-ROBYS-WEB");
assert.equal(bundle.measurementPlanRef, "MPLAN-ROBYS-MENU-TO-VISIT-001");
assert.equal(bundle.currency, "TRY");
assert.equal(bundle.attributionWindowHours, 24);
assert.equal(bundle.webEvents.length, 1);
assert.equal(bundle.posOrders.length, 1);
assert.match(bundle.runId, /^ATTRRUN-ROBYS-BASELINE-[0-9]{14}$/);

assert.throws(
  () => windowObject.robysVisitAttribution.buildBaselineBundle({}),
  /posOrders must be an array/
);

storage.set("robys:visit-intents:v0", "not-json");
assert.equal(windowObject.robysVisitAttribution.events().length, 0);
assert.equal(windowObject.robysVisitAttribution.clear(), true);
assert.equal(windowObject.robysVisitAttribution.events().length, 0);

const actions = windowObject.dataLayer.map((entry) => entry.action);
assert.ok(actions.includes("visit_intent_created"));
assert.ok(actions.includes("route_click"));

console.log(
  "✅ VISIT-ATTRIBUTION-002 passed: route intent creates a bounded token event and exact baseline bundle."
);
