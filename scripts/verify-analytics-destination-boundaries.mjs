import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(scriptDir, "..", "analytics.js"), "utf8");
const windowListeners = new Map();
const documentListeners = new Map();

const document = {
  documentElement: { lang: "en" },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener(type, handler) {
    documentListeners.set(type, handler);
  },
  dispatchEvent: () => {}
};

const windowObject = {
  location: { href: "https://robys.example/", pathname: "/" },
  dataLayer: [],
  addEventListener(type, handler) {
    windowListeners.set(type, handler);
  }
};

class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

class IntersectionObserver {
  observe() {}
  unobserve() {}
}

vm.runInNewContext(source, {
  window: windowObject,
  document,
  location: windowObject.location,
  URL,
  CustomEvent,
  IntersectionObserver,
  console,
  Set,
  Array,
  Math
}, { filename: "analytics.js" });

const initialize = windowListeners.get("pointerdown");
if (typeof initialize !== "function") throw new Error("Analytics initializer was not registered");
initialize();

const handleClick = documentListeners.get("click");
if (typeof handleClick !== "function") throw new Error("Analytics click handler was not registered");

function actionsFor(href) {
  windowObject.robysAnalytics.clear();

  const anchor = {
    href,
    closest(selector) {
      return selector === "a" ? this : null;
    }
  };

  const target = {
    closest(selector) {
      return selector === "a" ? anchor : null;
    }
  };

  handleClick({ target });
  return windowObject.robysAnalytics.events().map((event) => event.action);
}

const cases = [
  { id: "google_maps_exact", href: "https://google.com/maps", expected: ["route_click"] },
  { id: "google_maps_nested", href: "https://www.google.com/maps/place/robys", expected: ["route_click"] },
  { id: "google_maps_query", href: "https://google.com/maps?query=robys", expected: ["route_click"] },
  { id: "instagram_exact", href: "https://instagram.com/robys", expected: ["instagram_click"] },
  { id: "instagram_subdomain", href: "https://www.instagram.com/robys", expected: ["instagram_click"] },
  { id: "google_suffix_bypass", href: "https://google.com.evil.example/maps", expected: [] },
  { id: "instagram_suffix_bypass", href: "https://instagram.com.evil.example/robys", expected: [] },
  { id: "query_confusion", href: "https://evil.example/?next=https://instagram.com/robys", expected: [] },
  { id: "maps_dot_prefix", href: "https://google.com/maps.evil", expected: [] },
  { id: "maps_word_prefix", href: "https://google.com/mapstore", expected: [] },
  { id: "non_http_instagram", href: "ftp://instagram.com/robys", expected: [] },
  { id: "invalid_url", href: "http://[::1", expected: [] }
];

const failures = [];
for (const testCase of cases) {
  const actual = actionsFor(testCase.href);
  if (JSON.stringify(actual) !== JSON.stringify(testCase.expected)) {
    failures.push({
      id: testCase.id,
      href: testCase.href,
      expected: testCase.expected,
      actual
    });
  }
}

if (failures.length) {
  console.error(JSON.stringify({
    contract: "ANALYTICS-DESTINATION-001",
    status: "failed",
    failures
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  contract: "ANALYTICS-DESTINATION-001",
  status: "passed",
  cases: cases.length
}));
