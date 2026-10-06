import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { menuCatalogRevision, readMenuCatalogRevisionInputs, verifyMenuCatalogRevision } from "./menu-catalog-revision.mjs";

const catalogBytes = Buffer.from('export const menuCategories = [{ id: "pairing-offers", price: 370 }];\n');
const revision = menuCatalogRevision(catalogBytes);
const currentUrl = `./menu-catalog.js?v=${revision}`;
const revealRuntime = `import { menuCategories } from "${currentUrl}";`;
const revealUrl = `./menu-product-reveal-runtime.js?v=${menuCatalogRevision(revealRuntime)}`;
const discoverRuntime = `import{menuCategories}from"${currentUrl}";`;
const discoverDeck = `import { menuCategories } from "${currentUrl}";\nexport const route = "pairing-offers";`;
const discoverUrl = `./discover-v2.js?v=${menuCatalogRevision(discoverRuntime)}`;
const deckUrl = `./discover-deck.js?v=${menuCatalogRevision(discoverDeck)}`;
const fixture = () => ({
  catalogBytes,
  menuSource: `import { menuCategories } from "${currentUrl}";`,
  menuRuntime: `import{menuCategories}from"${currentUrl}";`,
  revealRuntime,
  revealLoader: `import("${revealUrl}");`,
  discoverRuntime,
  discoverDeck,
  discoverHtml: `<script src="${discoverUrl.slice(2)}"></script><script src="${deckUrl.slice(2)}"></script>`,
  serviceWorker: `const CORE_ASSETS = ["${currentUrl}", "${revealUrl}", "${discoverUrl}", "${deckUrl}"];
async function cachedResponse(request) {
  const requiresExactRevision = url.pathname.endsWith("/menu-catalog.js") || url.pathname.endsWith("/menu-product-reveal-runtime.js") || url.pathname.endsWith("/discover-v2.js") || url.pathname.endsWith("/discover-deck.js");
  if (requiresExactRevision) {
    return cache.match(request);
  }
  return cache.match(request, { ignoreSearch: true });
}`
});

test("shipped source, compiled runtime and service worker share the current catalog digest", () => {
  verifyMenuCatalogRevision(readMenuCatalogRevisionInputs());
});

test("reject a rollback to a previously cached catalog URL in each delivery layer", () => {
  for (const key of ["menuSource", "menuRuntime", "revealRuntime", "discoverRuntime", "discoverDeck", "serviceWorker"]) {
    const inputs = fixture();
    inputs[key] = inputs[key].replace(currentUrl, "./menu-catalog.js?v=20260904-premium-order-v1");
    assert.throws(() => verifyMenuCatalogRevision(inputs), /CATALOG-REV-001/, key);
  }
});

test("reject stale Discover page or precache script revisions after its catalog import changes", () => {
  for (const key of ["discoverHtml", "serviceWorker"]) {
    for (const url of [discoverUrl, deckUrl]) {
      const inputs = fixture();
      inputs[key] = inputs[key].replace(url.slice(key === "discoverHtml" ? 2 : 0), url.slice(key === "discoverHtml" ? 2 : 0).replace(/v=.*/, "v=000000000000"));
      assert.throws(() => verifyMenuCatalogRevision(inputs), /exact content revision/, key);
    }
  }
});

test("reject a stale lazy reveal loader or service-worker reveal revision", () => {
  for (const key of ["revealLoader", "serviceWorker"]) {
    const inputs = fixture();
    inputs[key] = inputs[key].replace(revealUrl, "./menu-product-reveal-runtime.js?v=90e757f93063");
    assert.throws(() => verifyMenuCatalogRevision(inputs), /exact.*content revision/, key);
  }
});

test("reject catalog byte changes without a corresponding import and precache revision", () => {
  const inputs = fixture();
  verifyMenuCatalogRevision(inputs);
  inputs.catalogBytes = Buffer.from(catalogBytes.toString().replace("370", "371"));
  assert.throws(() => verifyMenuCatalogRevision(inputs), /exact content revision/);
});

test("reject query-insensitive caching of the catalog", () => {
  const inputs = fixture();
  inputs.serviceWorker = inputs.serviceWorker.replace("return cache.match(request);", "return cache.match(request, { ignoreSearch: true });");
  assert.throws(() => verifyMenuCatalogRevision(inputs), /query-string identity/);
});

test("returning service-worker cache does not reuse the old catalog at a new content URL", async () => {
  const scope = "https://example.test/robys-coffee-house-demo/";
  const oldUrl = new URL("./menu-catalog.js?v=20260904-premium-order-v1", scope).href;
  const freshUrl = new URL(currentUrl, scope).href;
  const cacheEntries = new Map([[oldUrl, "stale-catalog"]]);
  const networkRequests = [];
  const context = {
    URL,
    caches: {
      async open() {
        return {
          async match(request, options) {
            if (!options?.ignoreSearch) return cacheEntries.get(request.url);
            return Array.from(cacheEntries).find(([url]) => new URL(url).pathname === new URL(request.url).pathname)?.[1];
          },
          async put(request, response) { cacheEntries.set(request.url, response); }
        };
      }
    },
    self: { registration: { scope }, addEventListener() {} },
    async fetch(request) {
      networkRequests.push(request.url);
      return { ok: true, body: "current-catalog", clone() { return "current-catalog"; } };
    }
  };
  // Execute the actual shipped worker code, preserving its exact-query cache branch.
  runInNewContext(readFileSync("sw-core-v64.js", "utf8"), context);
  assert.equal(await context.cachedResponse({ url: freshUrl }), undefined);
  assert.equal((await context.runtimeAssetResponse({ url: freshUrl })).body, "current-catalog");
  assert.deepEqual(networkRequests, [freshUrl]);
  assert.equal(await context.cachedResponse({ url: freshUrl }), "current-catalog");
  assert.equal(cacheEntries.get(oldUrl), "stale-catalog");
});
