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
for (const mode of ["cancel-config", "cancel-latest", "current", "legacy-conflict"]) {
  let resolveConfig, resolveLatest, current = true, reads = 0, recovery = 0;
  let signalLatestRead;
  const latestReadStarted = new Promise(resolve => { signalLatestRead = resolve; });
  const staleDraft = { version: 1, groups: [{ quantity: 1, items: [{ id: "brew-hot:black-tea", quantity: 1 }] }] };
  const latestDraft = { version: 1, groups: [{ quantity: 3, items: [{ id: "brew-hot:milk", quantity: 1 }, { id: "desserts:cookie", quantity: 1 }] }] };
  const validIds = new Set(["brew-hot:black-tea", "brew-hot:milk", "desserts:cookie"]);
  const ticketInputs = [];
  const redirects = [];
  const staticRecovery = new Error("entered-static-recovery");
  class OrderLegacyConflictError extends Error { constructor() { super("unresolved legacy draft"); this.name = "OrderLegacyConflictError"; } }
  const context = {
    checkoutCopy: { en: {} }, activeDismiss: null, ticketStorage: {}, document: { activeElement: {} },
    orderProductIds: validIds, OrderLegacyConflictError,
    siteRootUrl: () => "https://example.test/cafe/",
    readCounterConfiguration: () => new Promise(resolve => { resolveConfig = resolve; }),
    readLatestStoredOrderDraft(ids) {
      assert.equal(ids, validIds, "Canonical reads use the actual catalog ID set"); reads += 1;
      signalLatestRead();
      return new Promise(resolve => { resolveLatest = resolve; });
    },
    getOrderStorageState: () => ({ legacyConflict: mode === "legacy-conflict" ? { token: "legacy-conflict" } : undefined }),
    getOrCreateOrderTicket: draft => { ticketInputs.push(draft); return {}; },
    counterCheckoutUrl: () => "https://example.test/cafe/counter/guest.html#test-ticket",
    // This boundary proves the real function reaches its ordinary recovery
    // dialog. Its full immutable-ticket UI is covered by the checkout tests.
    element(tag, className) {
      assert.equal(tag, "dialog"); assert.equal(className, "order-checkout-dialog");
      recovery += 1; throw staticRecovery;
    },
    window: { location: { assign: url => redirects.push(url) } }
  };
  const open = runInNewContext(`${checkout}\nopenOrderCheckout`, context);
  const pending = open({ draft: staleDraft, language: "en", shouldOpen: () => current });
  const settled = pending.then(value => ({ value }), error => ({ error }));
  assert.equal(ticketInputs.length, 0); assert.equal(reads, 0);
  if (mode === "cancel-config") current = false;
  resolveConfig({ enabled: true });
  if (mode !== "cancel-config") {
    await latestReadStarted;
    assert.equal(reads, 1); assert.equal(ticketInputs.length, 0);
    if (mode === "cancel-latest") current = false;
    resolveLatest(latestDraft);
  }
  const result = await settled;
  const cancelled = mode.startsWith("cancel-");
  assert.equal(ticketInputs.length, mode === "current" ? 1 : 0, `${mode}: stale or cancelled input cannot issue a ticket`);
  assert.equal(redirects.length, mode === "current" ? 1 : 0, `${mode}: navigation requires current authoritative intent`);
  if (mode === "current") {
    assert.equal(ticketInputs[0], latestDraft, "Only the latest canonical draft may create the counter ticket");
    assert.notEqual(ticketInputs[0], staleDraft);
    assert.equal(result.value.redirected, true);
  } else if (mode === "legacy-conflict") {
    assert.equal(result.error, staticRecovery, "An unresolved fork goes to the static recovery dialog");
    assert.equal(recovery, 1);
  } else {
    assert.equal(result.value.cancelled, cancelled);
    assert.equal(recovery, 0, "Cancellation must not open a recovery dialog either");
  }
}
console.log("Checkout loader PASS: explicit import retry; canonical latest ticket input; config/read cancellation creates no ticket or navigation; legacy conflict enters static recovery without issuing a ticket.");
