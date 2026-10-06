import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
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

function readPairingRevisionInputs() {
  const pairingBytes = readFileSync("menu-pairing.js", "utf8");
  const generatedPairing = buildSync({
    entryPoints: ["src/menu-pairing-view.js"], bundle: true, minify: true, charset: "utf8",
    format: "esm", target: "es2020", outfile: "menu-pairing.js", legalComments: "none", write: false
  }).outputFiles[0].text;
  return {
    pairingBytes, generatedPairing,
    menuSource: readFileSync("src/menu-app.js", "utf8"),
    menuRuntime: readFileSync("menu-app.js", "utf8"),
    premiumBytes: readFileSync("menu-premium.css"),
    worker: readFileSync("sw-core-v64.js", "utf8")
  };
}

function verifyPairingRevision({ pairingBytes, generatedPairing, menuSource, menuRuntime, premiumBytes, worker }) {
  assert.equal(pairingBytes, generatedPairing, "Pairing view bytes must match their readable source and bundled domain dependency");
  const pairingRevision = menuCatalogRevision(pairingBytes);
  const expectedUrl = `./menu-pairing.js?v=${pairingRevision}`;
  for (const [file, source] of [["src/menu-app.js", menuSource], ["menu-app.js", menuRuntime]]) {
    const imports = Array.from(source.matchAll(/\bimport\(["'](\.\/menu-pairing\.js(?:\?[^"']*)?)["']\)/g), (match) => match[1]);
    assert.deepEqual(imports, [expectedUrl], `${file} must lazily import the pairing view's exact content revision`);
  }
  const precache = worker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache, "Service worker precache list is missing");
  const cachedUrls = Array.from(precache.matchAll(/["'](\.\/menu-pairing\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(cachedUrls, [expectedUrl], "Service worker must precache only the pairing view's exact content revision");
  const cacheRevision = menuCatalogRevision([
    menuCatalogRevision(menuRuntime),
    menuCatalogRevision(premiumBytes),
    pairingRevision
  ].join(":"));
  const cacheVersion = worker.match(/const CACHE_VERSION = "([^"]+)";/)?.[1];
  assert.ok(cacheVersion?.includes(`-custom-pair-${cacheRevision}-shared-order-`), "Custom pairing cache namespace must bind the actual menu runtime, stylesheet and lazy view bytes");
  return { expectedUrl, cacheRevision };
}

test("lazy pairing source, emitted bytes, loader, precache and cache namespace share their content revisions", () => {
  verifyPairingRevision(readPairingRevisionInputs());
});

test("reject stale lazy pairing loaders, precache, source/output bytes and cache namespaces", () => {
  const current = readPairingRevisionInputs();
  const { expectedUrl, cacheRevision } = verifyPairingRevision(current);
  for (const key of ["menuSource", "menuRuntime", "worker"]) {
    const inputs = { ...current, [key]: current[key].replace(expectedUrl, "./menu-pairing.js?v=000000000000") };
    assert.notEqual(inputs[key], current[key], `${key}: stale-URL control must actually change the fixture`);
    assert.throws(() => verifyPairingRevision(inputs), /exact content revision/, key);
  }
  for (const key of ["pairingBytes", "generatedPairing"]) {
    assert.throws(() => verifyPairingRevision({ ...current, [key]: current[key] + "\n// byte drift\n" }), /must match their readable source/, key);
  }
  for (const key of ["menuRuntime", "premiumBytes"]) {
    assert.throws(() => verifyPairingRevision({ ...current, [key]: current[key] + "\n" }), /cache namespace must bind/, key);
  }
  const staleNamespace = current.worker.replace(`-custom-pair-${cacheRevision}-`, "-custom-pair-000000000000-");
  assert.notEqual(staleNamespace, current.worker, "Cache namespace control must actually change the fixture");
  assert.throws(() => verifyPairingRevision({ ...current, worker: staleNamespace }), /cache namespace must bind/);
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

async function verifyReturningModuleCache(worker, file, currentRevision) {
  const scope = "https://example.test/robys-coffee-house-demo/";
  const oldUrl = new URL(`./${file}?v=previous-cached-revision`, scope).href;
  const freshUrl = new URL(`./${file}?v=${currentRevision}`, scope).href;
  const staleBytes = `stale-${file}`;
  const currentBytes = `current-${file}`;
  const cacheEntries = new Map([[oldUrl, staleBytes]]);
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
      return { ok: true, body: currentBytes, clone() { return currentBytes; } };
    }
  };
  // Execute the actual shipped worker code, preserving its exact-query cache branch.
  runInNewContext(worker, context);
  assert.equal(await context.cachedResponse({ url: freshUrl }), undefined, `${file}: a stale query must not satisfy the current content URL`);
  assert.equal((await context.runtimeAssetResponse({ url: freshUrl })).body, currentBytes);
  assert.deepEqual(networkRequests, [freshUrl]);
  assert.equal(await context.cachedResponse({ url: freshUrl }), currentBytes);
  assert.equal(cacheEntries.get(oldUrl), staleBytes);
}

test("returning service-worker cache does not reuse old catalog or lazy pairing bytes at new content URLs", async () => {
  const worker = readFileSync("sw-core-v64.js", "utf8");
  await verifyReturningModuleCache(worker, "menu-catalog.js", menuCatalogRevision(readFileSync("menu-catalog.js")));
  await verifyReturningModuleCache(worker, "menu-pairing.js", menuCatalogRevision(readFileSync("menu-pairing.js")));
});

test("actual-worker negative control rejects removal of the pairing exact-query cache rule", async () => {
  const worker = readFileSync("sw-core-v64.js", "utf8");
  const exactPairingRule = /url\.pathname\.endsWith\("\/menu-pairing\.js"\)\s*\|\|/;
  assert.match(worker, exactPairingRule, "Negative control must remove the actual pairing exact-query rule");
  const unsafeWorker = worker.replace(exactPairingRule, "");
  await assert.rejects(
    verifyReturningModuleCache(unsafeWorker, "menu-pairing.js", menuCatalogRevision(readFileSync("menu-pairing.js"))),
    /a stale query must not satisfy the current content URL/,
    "Removing the exact-query rule must reproduce stale lazy-module reuse"
  );
});
