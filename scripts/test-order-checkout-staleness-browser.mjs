import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit } from "playwright";
import { decodeOrderTicket, quoteOrderTicket, validateTicketDraft } from "../src/order-ticket.js";

const key = "robys-menu-order.v1";
const group = (items, quantity = 1) => ({ quantity, items });
const item = (id, quantity = 1, variant) => ({ id, quantity, ...(variant ? { variant } : {}) });
const draft = groups => ({ version: 1, groups });
const original = draft([group([item("brew-hot:milk"), item("desserts:cookie")])]);
const added = draft([...original.groups, group([item("food:sesame-simit")])]);
const removed = draft([group([item("brew-hot:milk")])]);
const empty = draft([]);
const flavored = draft([...removed.groups, group([item("cold-coffee:milkshake", 1, "vanilla")], 2)]);
const productIds = ["brew-hot:milk", "desserts:cookie", "food:sesame-simit", "cold-coffee:milkshake"];
const bundle = await build({ stdin: { contents: `export * from "./src/order-checkout.js";
export { transactStoredOrderDraft, readLatestStoredOrderDraft } from "./src/order-draft.js";`, resolveDir: process.cwd() },
  bundle: true, format: "esm", write: false,
  target: "es2020", logLevel: "silent" });
const css = await readFile("order-checkout.css", "utf8");
const server = createServer((request, response) => {
  if (request.url === "/checkout.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(bundle.outputFiles[0].text);
  } else {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><button id="launch">Open order</button>`);
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const directory = ".artifacts/checkout-staleness";
await mkdir(directory, { recursive: true });
const report = [];
const selected = (process.env.CHECKOUT_BROWSERS ?? "chromium,firefox,webkit").split(",");
const copy = {
  tr: { changed: "Sipariş değişti", empty: "Sepetin artık boş", unavailable: "Güncel sepet okunamadı" },
  en: { changed: "Order changed", empty: "Your cart is now empty", unavailable: "Your current cart could not be read" },
  ru: { changed: "Заказ изменился", empty: "Корзина теперь пуста", unavailable: "Не удалось прочитать актуальную корзину" }
};

try {
  for (const engine of [chromium, firefox, webkit].filter(engine => selected.includes(engine.name()))) {
    const browser = await engine.launch({ headless: true, timeout: 30000 });
    try {
      for (const language of ["tr", "en", "ru"]) {
        const width = engine === webkit ? 320 : 390;
        const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
        try {
          const page = await context.newPage();
          const writer = await context.newPage();
          const exceptions = [];
          page.on("pageerror", error => exceptions.push(error.message));
          await Promise.all([page.goto(base), writer.goto(base)]);
          const setDraft = async value => writer.evaluate(async ({ value, productIds }) => {
            const module = await import("/checkout.js");
            await module.transactStoredOrderDraft(() => ({ draft: value, applied: true }), new Set(productIds));
          }, { value, productIds });
          await setDraft(original);
          await page.evaluate(async ({ original, language }) => {
            const module = await import("/checkout.js");
            window.checkout = module;
            window.result = await module.openOrderCheckout({ draft: original, language, returnFocus: document.querySelector("#launch") });
            window.originalTicket = window.result.ticket;
            window.originalTicketText = JSON.stringify(window.originalTicket);
            // Keep real IDB reads/commits, but control delivery of their already
            // completed callbacks to exercise late promises deterministically.
            window.holdCanonicalCompletions = () => {
              const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
              window.heldCompletions = [];
              Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
                configurable: descriptor.configurable, enumerable: descriptor.enumerable, get: descriptor.get,
                set(handler) {
                  descriptor.set.call(this, function(event) {
                    if (this.db.name === "robys-order-transactions.v1") {
                      window.heldCompletions.push(() => handler.call(this, event));
                    } else handler.call(this, event);
                  });
                }
              });
              window.restoreCanonicalCompletions = () => Object.defineProperty(IDBTransaction.prototype, "oncomplete", descriptor);
              window.releaseCanonicalCompletions = () => {
                window.restoreCanonicalCompletions();
                for (const complete of window.heldCompletions.splice(0).reverse()) complete();
              };
            };
          }, { original, language });
          const notice = page.locator(".order-ticket-update");
          const refresh = notice.locator("button");
          const link = page.locator(".order-checkout-actions a");
          const initialUrl = await link.getAttribute("href");
          const initialQr = await page.locator(".order-ticket-qr").innerHTML();
          assert.equal(await notice.isHidden(), true, "An unchanged cart has no stale warning");
          // Order source, metadata and array order do not change QR composition.
          await setDraft({ ...original, recommendation: { token: "changed-only-metadata" },
            groups: original.groups.map(entry => ({ ...entry, source: "menu", items: [...entry.items].reverse() })) });
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          assert.equal(await notice.isHidden(), true, "Equivalent current composition has no warning");

          await setDraft(added);
          await notice.waitFor({ state: "visible" });
          assert.match(await notice.textContent(), new RegExp(copy[language].changed));
          assert.equal(await link.getAttribute("href"), initialUrl, "Other-tab additions do not rewrite the old cashier payload");
          assert.equal(await page.locator(".order-ticket-qr").innerHTML(), initialQr, "Other-tab additions do not rewrite the old QR");
          assert.equal(await page.evaluate(() => JSON.stringify(window.originalTicket) === window.originalTicketText), true);
          assert.equal((await page.locator(".order-ticket-total").innerText()).trim(), language === "ru" ? "Итого\n160 ₺" : language === "tr" ? "Toplam\n160 ₺" : "Total\n160 ₺");
          if (language === "ru") await page.locator(".order-checkout-dialog").screenshot({ path: `${directory}/${engine.name()}-${width}-ru-stale.png` });

          await refresh.click();
          await notice.waitFor({ state: "hidden" });
          let regenerated = decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1));
          assert.deepEqual(regenerated.ticket.groups, validateTicketDraft(added));
          assert.equal(regenerated.language, language);
          assert.equal(quoteOrderTicket(regenerated.ticket).totalMinor, 19500);
          assert.notEqual(await link.getAttribute("href"), initialUrl);
          assert.equal(await page.evaluate(() => JSON.stringify(window.originalTicket) === window.originalTicketText), true, "Explicit refresh does not mutate the original ticket object");
          assert.equal(await page.locator(".order-checkout-close").evaluate(node => document.activeElement === node), true);

          await setDraft(removed);
          await notice.waitFor({ state: "visible" });
          await refresh.click();
          await notice.waitFor({ state: "hidden" });
          regenerated = decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1));
          assert.deepEqual(regenerated.ticket.groups, validateTicketDraft(removed));
          assert.equal(quoteOrderTicket(regenerated.ticket).totalMinor, 6000);
          const lastGoodUrl = await link.getAttribute("href");

          await setDraft(empty);
          await notice.waitFor({ state: "visible" });
          assert.match(await notice.textContent(), new RegExp(copy[language].empty));
          assert.equal(await refresh.isDisabled(), true, "Empty cart cannot generate a QR");
          assert.equal(await link.getAttribute("href"), lastGoodUrl, "Empty cart preserves the previous immutable ticket");
          await setDraft(added);
          await refresh.waitFor({ state: "visible" });
          await page.waitForFunction(() => !document.querySelector(".order-ticket-update button").disabled);
          await page.evaluate(() => {
            window.originalTransaction = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function(...args) {
              if (this.name === "robys-order-transactions.v1") throw new DOMException("Injected denied canonical read", "SecurityError");
              return window.originalTransaction.apply(this, args);
            };
          });
          await refresh.click();
          await notice.locator("[role=alert]").waitFor({ state: "visible" });
          assert.match(await notice.locator("[role=alert]").textContent(), new RegExp(copy[language].unavailable));
          assert.equal(await link.getAttribute("href"), lastGoodUrl, "Unreadable canonical storage must not replace a ticket with projection memory");
          await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; });
          await writer.evaluate(async key => {
            const database = await new Promise((resolve, reject) => {
              const request = indexedDB.open("robys-order-transactions.v1", 1);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            await new Promise((resolve, reject) => {
              const transaction = database.transaction("shared-order", "readwrite");
              const store = transaction.objectStore("shared-order");
              const request = store.get(key);
              request.onsuccess = () => { window.goodCanonicalRecord = request.result; store.put({ version: -1 }, key); };
              transaction.oncomplete = resolve;
              transaction.onabort = () => reject(transaction.error);
            });
            database.close();
          }, key);
          await refresh.click();
          await notice.locator("[role=alert]").waitFor({ state: "visible" });
          assert.equal(await link.getAttribute("href"), lastGoodUrl, "Damaged canonical storage preserves the previous QR");
          await writer.evaluate(async key => {
            const database = await new Promise((resolve, reject) => {
              const request = indexedDB.open("robys-order-transactions.v1", 1);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            await new Promise((resolve, reject) => {
              const transaction = database.transaction("shared-order", "readwrite");
              transaction.objectStore("shared-order").put(window.goodCanonicalRecord, key);
              transaction.oncomplete = resolve;
              transaction.onabort = () => reject(transaction.error);
            });
            database.close();
          }, key);
          // localStorage is only a projection. Damaging or clearing that mirror
          // must not change the authoritative IndexedDB cart or its fresh QR.
          await writer.evaluate(key => localStorage.setItem(key, "{malformed"), key);
          await refresh.click();
          await notice.waitFor({ state: "hidden" });
          assert.deepEqual(decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1)).ticket.groups, validateTicketDraft(added));
          const projectedUrl = await link.getAttribute("href");
          await writer.evaluate(key => localStorage.removeItem(key), key);
          await writer.evaluate(() => localStorage.clear());
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          assert.equal(await link.getAttribute("href"), projectedUrl, "Clearing a mirror cannot clear the canonical cart or mutate its ticket");
          await setDraft(draft([group([item("cold-coffee:milkshake", 1, "unavailable-flavor")])]));
          await notice.waitFor({ state: "visible" });
          await refresh.click();
          await notice.locator("[role=alert]").waitFor({ state: "visible" });
          assert.equal(await notice.locator("[role=alert]").textContent(),
            await page.evaluate(language => window.checkout.checkoutCopy[language].variant, language));
          assert.equal(await link.getAttribute("href"), projectedUrl, "Invalid flavor cannot replace the previous ticket");

          await setDraft(added);
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page.evaluate(() => {
            const button = document.querySelector(".order-ticket-update button");
            button.click(); button.click();
          });
          await notice.waitFor({ state: "hidden" });
          regenerated = decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1));
          assert.deepEqual(regenerated.ticket.groups, validateTicketDraft(added), "Rapid refresh clicks preserve one current QR");
          assert.equal(await page.locator(".order-ticket-qr").count(), 1);
          assert.equal(await page.locator(".order-checkout-dialog").count(), 1);

          await setDraft(flavored);
          await notice.waitFor({ state: "visible" });
          await refresh.click();
          await notice.waitFor({ state: "hidden" });
          regenerated = decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1));
          assert.deepEqual(regenerated.ticket.groups, validateTicketDraft(flavored), "Refresh preserves flavor identity and grouped quantity");
          assert.equal(quoteOrderTicket(regenerated.ticket).totalMinor, quoteOrderTicket({ groups: flavored.groups }).totalMinor);

          // The same document's successful transaction event is also observed.
          await page.evaluate(async ({ value, productIds }) => {
            await window.checkout.transactStoredOrderDraft(() => ({ draft: value, applied: true }), new Set(productIds));
          }, { value: removed, productIds });
          await notice.waitFor({ state: "visible" });
          await refresh.click();
          await notice.waitFor({ state: "hidden" });
          assert.deepEqual(decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1)).ticket.groups, validateTicketDraft(removed));

          await setDraft(added);
          await notice.waitFor({ state: "visible" });
          const beforePendingUrl = await link.getAttribute("href");
          await page.evaluate(() => window.holdCanonicalCompletions());
          await refresh.click();
          await page.waitForFunction(() => window.heldCompletions.length >= 1);
          assert.equal(await refresh.isDisabled(), true, "A pending canonical read prevents duplicate refresh actions");
          assert.equal(await link.getAttribute("href"), beforePendingUrl, "Pending reads leave the old QR visible");
          await page.evaluate(() => document.querySelector(".order-ticket-update button").click());
          await setDraft(flavored);
          await page.waitForFunction(() => window.heldCompletions.length >= 2);
          await page.evaluate(() => window.releaseCanonicalCompletions());
          await notice.waitFor({ state: "hidden" });
          assert.deepEqual(decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1)).ticket.groups,
            validateTicketDraft(flavored), "A commit during an awaited refresh wins over its older read");

          await setDraft(removed);
          await notice.waitFor({ state: "visible" });
          await page.evaluate(() => {
            window.holdCanonicalCompletions();
            window.pendingResult = window.result;
            window.pendingTicket = window.result.ticket;
          });
          await refresh.click();
          await page.waitForFunction(() => window.heldCompletions.length >= 1);
          await page.locator(".order-checkout-close").click();
          assert.equal(await page.locator(".order-checkout-dialog").count(), 0);
          await page.evaluate(async ({ original, language }) => {
            window.restoreCanonicalCompletions();
            window.replacementResult = await window.checkout.openOrderCheckout({ draft: original, language,
              returnFocus: document.querySelector("#launch") });
            document.querySelector(".order-checkout-actions button").focus();
            window.releaseCanonicalCompletions();
          }, { original, language });
          await page.waitForFunction(() => !document.querySelector(".order-ticket-update")?.hasAttribute("aria-busy"));
          assert.equal(await page.evaluate(() => window.pendingResult.ticket === window.pendingTicket), true,
            "A late canonical read cannot replace the ticket of a dismissed dialog");
          assert.equal(await page.locator(".order-checkout-dialog").count(), 1);
          assert.deepEqual(decodeOrderTicket(new URL(await link.getAttribute("href")).hash.slice(1)).ticket.groups,
            validateTicketDraft(original), "A late old refresh cannot overwrite a replacement dialog");
          assert.equal(await page.locator(".order-checkout-actions button").evaluate(node => node === document.activeElement), true,
            "A late old refresh cannot steal focus from the replacement dialog");

          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".order-checkout-dialog").count(), 0);
          assert.equal(await page.locator("#launch").evaluate(node => document.activeElement === node), true);
          await setDraft(original);
          assert.deepEqual(exceptions, []);
          report.push({ browser: engine.name(), version: browser.version(), language, width,
            unchanged: true, addedAndRemoved: true, immutableOldPayload: true, explicitRefresh: true,
            emptyDisabled: true, mirrorCorruptionAndClearIgnored: true, canonicalReadFailureSafe: true, canonicalCorruptionSafe: true, invalidFlavorSafe: true, rapidClicksSafe: true,
            sameDocumentEvent: true, flavorAndQuantity: true, asyncCommitWins: true, dismissedReadIgnored: true,
            replacementUnaffected: true, focusRestored: true });
          await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + "\n");
          console.log(`PASS ${engine.name()}/${language} checkout refresh, immutable payload and fault recovery`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.close();
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2) + "\n");
}
console.log(`Checkout staleness: PASS (${report.length} browser/language journeys)`);
