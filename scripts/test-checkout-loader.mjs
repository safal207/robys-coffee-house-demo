import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Replay browser module-map failures against the actual checkout loaders.
// A failed URL stays failed; recovery therefore requires an explicit new URL.
const menuSource = readFileSync("src/menu-order-ui.js", "utf8");
const menuLoader = menuSource.slice(menuSource.indexOf("let checkoutModulePromise;"),
  menuSource.indexOf("// Replace one component"));
const quickLoader = transformSync(readFileSync("src/smart-choice/checkout-link.ts", "utf8"),
  { loader: "ts", target: "es2020" }).code.replace(/^export /gm, "");

for (const [name, source, loadFunction] of [
  ["menu", menuLoader, "loadCheckoutModule"],
  ["quick", quickLoader, "loadQuickCheckout"]
]) {
  const controlled = source
    .replace(/import\(("\.\/order-checkout\.js\?v=[a-f0-9]+")\)/g, "loadModule($1)")
    .replaceAll("import(retryUrl.href)", "loadModule(retryUrl.href)")
    .replaceAll("import(moduleUrl.href)", "loadModule(moduleUrl.href)")
    .replaceAll("import.meta.url", '"https://example.test/cafe/menu-order-ui.js"');
  assert(!controlled.includes("import("), `${name}: control every loader import`);
  const requests = [], registry = new Map();
  const context = {
    URL, window: { location: { href: "https://example.test/cafe/smart-choice/#quick" } },
    loadModule(specifier) {
      const url = new URL(specifier, "https://example.test/cafe/menu-order-ui.js").href;
      if (!registry.has(url)) {
        let resolve, reject;
        const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
        registry.set(url, { promise, resolve, reject }); requests.push(url);
      }
      return registry.get(url).promise;
    }
  };
  const load = runInNewContext(`${controlled}\n${loadFunction}`, context);
  const first = load(), concurrent = load();
  const firstResult = Promise.allSettled([first, concurrent]);
  assert.equal(first, concurrent, `${name}: share an in-flight load`);
  assert.equal(requests.length, 1);
  registry.get(requests[0]).reject(new Error("network offline"));
  assert((await firstResult).every(result => result.status === "rejected"));
  assert.equal(requests.length, 1, `${name}: rejection must not retry on its own`);
  for (const failure of [1, 2]) {
    const pending = load();
    const result = Promise.allSettled([pending]);
    assert.equal(requests.length, failure + 1, `${name}: one request per new explicit action`);
    const url = new URL(requests.at(-1));
    assert.equal(url.origin, "https://example.test");
    assert.equal(url.pathname, "/cafe/order-checkout.js");
    assert.equal(url.searchParams.get("retry"), String(failure));
    assert.notEqual(url.href, requests[0], `${name}: do not reuse the poisoned first URL`);
    registry.get(url.href).reject(new Error("still offline"));
    assert.equal((await result)[0].status, "rejected");
  }
  const recovered = load(), alsoRecovered = load();
  assert.equal(recovered, alsoRecovered);
  const opens = [];
  const module = { openOrderCheckout: async options => { opens.push(options); return { dialog: {} }; } };
  registry.get(requests.at(-1)).resolve(module);
  assert.equal(await recovered, module);
  assert.equal(await load(), module, `${name}: cache the recovered module`);
  assert.equal(requests.length, 4, `${name}: successful checkout reuses the module`);
  if (name === "quick") {
    const open = runInNewContext("openQuickCheckout", context);
    const draft = { version: 1, groups: [] }, button = {};
    let current = true;
    const obsolete = open(draft, "en", button, () => current);
    current = false;
    await obsolete;
    assert.equal(opens.length, 0, "A delayed quick import cannot open an abandoned selection");
    current = true;
    await open(draft, "en", button, () => current);
    assert.equal(opens.length, 1);
    assert.equal(opens[0].draft, draft);
    assert.equal(opens[0].returnFocus, button);
    current = false;
    assert.equal(opens[0].shouldOpen(), false, "The shared checkout receives the live cancellation guard");
  }
}

// Execute the actual post-configuration continuation. Cancellation happens
// while the real checkout is suspended, before ticket creation or navigation.
const checkoutSource = readFileSync("src/order-checkout.js", "utf8");
const checkout = checkoutSource.slice(checkoutSource.indexOf("export async function openOrderCheckout("))
  .replace("export async function", "async function");
assert(checkout.startsWith("async function openOrderCheckout("));
for (const cancel of [true, false]) {
  let resolveConfig, current = true, tickets = 0;
  const redirects = [];
  const context = {
    checkoutCopy: { en: {} }, activeDismiss: null, ticketStorage: {}, document: { activeElement: {} },
    siteRootUrl: () => "https://example.test/cafe/",
    readCounterConfiguration: () => new Promise(resolve => { resolveConfig = resolve; }),
    getOrCreateOrderTicket: () => { tickets += 1; return {}; },
    counterCheckoutUrl: () => "https://example.test/cafe/counter/guest.html#test-ticket",
    window: { location: { assign: url => redirects.push(url) } }
  };
  const open = runInNewContext(`${checkout}\nopenOrderCheckout`, context);
  const pending = open({ draft: {}, language: "en", shouldOpen: () => current });
  assert.equal(tickets, 0);
  if (cancel) current = false;
  resolveConfig({ enabled: true });
  const result = await pending;
  assert.equal(tickets, cancel ? 0 : 1, "Cancel before creating or reusing a ticket");
  assert.equal(redirects.length, cancel ? 0 : 1, "A recovered configuration must respect cancellation");
  assert.equal(result.cancelled === true, cancel);
}
console.log("Checkout loader PASS: browser-cached imports recover on explicit retry; bounded same-origin loads; abandoned quick import and delayed configuration cannot create a ticket or navigate.");
