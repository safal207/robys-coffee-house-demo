import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { readVerifiedMenuSource, readVerifiedMenuOrderSource } from "./menu-runtime-source.mjs";

const source = readVerifiedMenuSource();
const orderSource = readVerifiedMenuOrderSource();
const emitted = readFileSync("menu-order-ui.js");
const revision = createHash("sha256").update(emitted).digest("hex").slice(0, 12);
const worker = readFileSync("sw-core-v64.js", "utf8");
assert(source.includes(`import("./menu-order-ui.js?v=${revision}")`), "The intent loader must request the emitted dialog revision");
assert(worker.includes(`"./menu-order-ui.js?v=${revision}"`), "Offline dialogs must use the exact same revision");
assert(worker.includes('url.pathname.endsWith("/menu-order-ui.js")'), "An old cached dialog revision must never satisfy a new one");
assert(!orderSource.includes("readStoredOrderDraft") && !orderSource.includes("writeStoredOrderDraft"),
  "Lazy dialogs must use the eager storage owner, including its in-memory fallback");

// Execute the shipped ordering boundary and shared Escape listener. Family
// suggestions have a separate loader; including their implementation here
// would turn this controlled ordering fixture into an unrelated UI bootstrap.
const orderStart = source.indexOf("let orderUi;");
const orderEnd = source.indexOf("const familyTrigger =", orderStart);
const writerStart = source.indexOf("function writeMenuDraft(");
const writerEnd = source.indexOf("function cartSummary(", writerStart);
const escapeStart = source.indexOf('document.addEventListener("keydown", event =>', orderEnd);
const escapeEnd = source.indexOf("\n});", escapeStart);
const familyIntentDeclaration = source.match(/^let familyIntent = 0;$/m)?.[0];
assert(orderStart >= 0 && orderEnd > orderStart, "The shipped ordering loader boundary must be identifiable");
assert(writerStart >= 0 && writerEnd > writerStart, "The shared draft writer must be executed from shipped source");
assert(escapeStart > orderEnd && escapeEnd > escapeStart && familyIntentDeclaration,
  "The actual shared Escape listener and unloaded family intent state must be identifiable");
const loader = [
  source.slice(writerStart, writerEnd),
  source.slice(orderStart, orderEnd),
  familyIntentDeclaration,
  source.slice(escapeStart, escapeEnd + "\n});".length)
].join("\n")
  .replace(/import\(("\.\/menu-order-ui\.js\?v=[a-f0-9]+")\)/g, "loadModule($1)")
  .replace("import(retryUrl.href)", "loadModule(retryUrl.href)")
  .replace("import.meta.url", '"https://example.test/site/menu-app.js"');
assert(!loader.includes("import("), "The real loader's imports must all be controlled in this test");

function fixture() {
  const requests = [], opens = [], refreshes = [], events = new Map();
  let factoryCount = 0, options, resolveLoad, rejectLoad, currentDraft = { version: 1, groups: [], lines: [] };
  const notice = { textContent: "", classList: { add() {}, remove() {} } };
  const trigger = () => ({ isConnected: true, attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); } });
  const context = {
    URL, language: "tr", menuCopy: {}, productIndex: new Map(), orderProductIds: new Set(),
    localized() {}, formatPrice() {}, formatItemCount() {}, imageSlug() {}, renderCart() {},
    cart: new Map(), orderDraft: currentDraft, cartTrigger: trigger(),
    menuRoot: { querySelectorAll: () => [] },
    readCart() { context.orderDraft = currentDraft; return new Map(currentDraft.lines.map(line => [line.id, line.quantity])); },
    writeStoredOrderDraft(draft) { currentDraft = draft; return draft; },
    document: { activeElement: trigger(), querySelector: () => notice,
      addEventListener: (name, handler) => events.set(name, handler) },
    loadModule(url) { requests.push(url); return new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; }); }
  };
  const api = runInNewContext(`${loader}\n({ openOrderIntent, intents: () => ({ order: orderIntent, family: familyIntent }) });`, context);
  const module = { createMenuOrderUi(config) {
    factoryCount += 1; options = config;
    return { refresh(value) { refreshes.push(value); }, openProduct(id, target) { opens.push(["product", id, target]); },
      openCart(target) { opens.push(["cart", target]); } };
  } };
  return { context, api, requests, opens, refreshes, events, trigger, notice,
    resolve: () => resolveLoad(module), reject: () => rejectLoad(new Error("offline")),
    get factoryCount() { return factoryCount; }, get options() { return options; } };
}

{
  const f = fixture();
  assert.equal(f.requests.length, 0, "Reading/rendering the catalog must not download ordering dialogs");
  const first = f.trigger(), latest = f.trigger();
  const one = f.api.openOrderIntent("product", "tea", first);
  const two = f.api.openOrderIntent("product", "coffee", latest);
  assert.equal(f.requests.length, 1, "Concurrent intent must share one download");
  f.context.language = "ru";
  f.resolve(); await Promise.all([one, two]);
  assert.equal(f.factoryCount, 1);
  assert.equal(f.options.initialLanguage, "ru", "Language changed while downloading must be respected");
  assert.equal(f.opens.length, 1);
  assert.deepEqual(f.opens[0], ["product", "coffee", latest], "Only the latest intent opens and retains its own focus origin");
  assert.equal(f.refreshes[0].nextLanguage, "ru");
  assert.equal(first.attributes.size + latest.attributes.size, 0, "Busy state must be cleared on both triggers");
  await f.api.openOrderIntent("cart", undefined, latest);
  assert.equal(f.requests.length, 1, "Later cart intent must reuse the initialized dialog runtime");
  assert.deepEqual(f.opens[1], ["cart", latest]);
  const saved = { version: 1, groups: [], lines: [{ id: "tea", quantity: 2 }] };
  f.options.writeDraft(saved);
  assert.equal(f.options.readDraft(), saved, "Both boundaries must use the same storage owner");
  assert.equal(f.context.cart.get("tea"), 2);
}
{
  const f = fixture(), original = f.trigger(), replacement = f.trigger();
  const pending = f.api.openOrderIntent("product", "tea", original);
  original.isConnected = false;
  f.context.language = "ru";
  f.context.menuRoot.querySelectorAll = () => [{ dataset: { productId: "tea" }, querySelector: () => replacement }];
  f.resolve(); await pending;
  assert.equal(f.opens[0][2], replacement, "A language redraw while loading must return focus to the new product card");
  f.context.menuRoot.querySelectorAll = () => [];
  await f.api.openOrderIntent("product", "tea", original);
  assert.equal(f.opens[1][2], f.context.cartTrigger, "A filtered-out product must retain a connected cart fallback");
}
{
  const f = fixture();
  const pending = f.api.openOrderIntent("product", "tea", f.trigger());
  const before = f.api.intents();
  f.events.get("keydown")({ key: "Enter" });
  assert.equal(f.api.intents().order, before.order, "Unrelated keys must not cancel the current ordering intent");
  assert.equal(f.api.intents().family, before.family, "Unrelated keys must not mutate the unloaded family intent");
  f.events.get("keydown")({ key: "Escape" });
  assert.equal(f.api.intents().order, before.order + 1, "The shipped Escape listener invalidates the pending order intent");
  assert.equal(f.api.intents().family, before.family + 1, "The same shipped listener also invalidates the unloaded family intent");
  f.resolve(); await pending;
  assert.equal(f.opens.length, 0, "Escape during download must not cause a delayed dialog to appear");
}
{
  const f = fixture(); f.context.language = "en";
  const trigger = f.trigger();
  const failed = f.api.openOrderIntent("cart", undefined, trigger);
  f.reject(); await failed;
  assert.equal(f.opens.length, 0);
  assert.match(f.notice.textContent, /try again/i);
  assert.equal(trigger.attributes.size, 0);
  const retry = f.api.openOrderIntent("cart", undefined, trigger);
  assert.match(f.requests[1], /^https:\/\/example\.test\/site\/menu-order-ui\.js\?retry=1$/,
    "A retry must bypass the browser's failed module URL without changing origin");
  f.resolve(); await retry;
  assert.equal(f.opens.length, 1, "A recovered connection must allow the next real intent to open");
}
console.log("Menu order loader PASS: no eager import, shared initialization/storage, latest intent/language/focus, cancellation, retry, exact offline revision.");
