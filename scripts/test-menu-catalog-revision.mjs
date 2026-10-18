import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { compileMenuRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";
import { menuCatalogRevision, readMenuCatalogRevisionInputs, verifyMenuCatalogRevision,
  SMART_CHOICE_CATALOG_CONSUMERS, readSmartChoiceCatalogRevisionInputs, verifySmartChoiceCatalogRevision } from "./menu-catalog-revision.mjs";

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

test("all Smart Choice consumers share the canonical revisioned catalog and offline entry", () => {
  verifySmartChoiceCatalogRevision(readSmartChoiceCatalogRevisionInputs());
});

test("shared Smart Choice catalog rejects stale, missing and merely mentioned imports", () => {
  const inputs = readSmartChoiceCatalogRevisionInputs();
  const { expectedUrl } = verifySmartChoiceCatalogRevision(inputs);
  for (const file of SMART_CHOICE_CATALOG_CONSUMERS) {
    for (const altered of [inputs.runtimes[file].replace(expectedUrl, "../menu-catalog.js?v=000000000000"),
      "export const empty = true;", `const mention = ${JSON.stringify(`import { menuCategories } from "${expectedUrl}";`)};`]) {
      assert.notEqual(altered, inputs.runtimes[file]);
      assert.throws(() => verifySmartChoiceCatalogRevision({ ...inputs, runtimes: { ...inputs.runtimes, [file]: altered } }), /must import the shared catalog/);
    }
  }
});

test("shared catalog consumers reject changed data and stale offline cache references", () => {
  const inputs = readSmartChoiceCatalogRevisionInputs();
  const { revision } = verifySmartChoiceCatalogRevision(inputs);
  assert.throws(() => verifySmartChoiceCatalogRevision({ ...inputs, catalogBytes: Buffer.concat([inputs.catalogBytes, Buffer.from("\n")]) }), /must import the shared catalog/);
  const alteredWorker = inputs.serviceWorker.replace(`./menu-catalog.js?v=${revision}`, "./menu-catalog.js?v=000000000000");
  assert.notEqual(alteredWorker, inputs.serviceWorker);
  assert.throws(() => verifySmartChoiceCatalogRevision({ ...inputs, serviceWorker: alteredWorker }), /precached at its exact content revision/);
});

function readPairingRevisionInputs() {
  const pairingBytes = readFileSync("menu-pairing.js", "utf8");
  const generatedPairing = buildSync({
    entryPoints: ["src/menu-pairing-view.js"], bundle: true, minify: true, charset: "utf8",
    format: "esm", target: "es2020", outfile: "menu-pairing.js", legalComments: "none", write: false
  }).outputFiles[0].text;
  return {
    pairingBytes, generatedPairing,
    orderSource: readFileSync("src/menu-order-ui.js", "utf8"),
    orderRuntime: readFileSync("menu-order-ui.js", "utf8"),
    menuRuntime: readFileSync("menu-app.js", "utf8"),
    premiumBytes: readFileSync("menu-premium.css"),
    worker: readFileSync("sw-core-v64.js", "utf8")
  };
}

function verifyPairingRevision({ pairingBytes, generatedPairing, orderSource, orderRuntime, menuRuntime, premiumBytes, worker }) {
  assert.equal(pairingBytes, generatedPairing, "Pairing view bytes must match their readable source and bundled domain dependency");
  const pairingRevision = menuCatalogRevision(pairingBytes);
  const expectedUrl = `./menu-pairing.js?v=${pairingRevision}`;
  for (const [file, source] of [["src/menu-order-ui.js", orderSource], ["menu-order-ui.js", orderRuntime]]) {
    const imports = Array.from(source.matchAll(/\bimport\(["'](\.\/menu-pairing\.js(?:\?[^"']*)?)["']\)/g), (match) => match[1]);
    assert.deepEqual(imports, [expectedUrl], `${file} must lazily import the pairing view's exact content revision`);
  }
  const precache = worker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache, "Service worker precache list is missing");
  const cachedUrls = Array.from(precache.matchAll(/["'](\.\/menu-pairing\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(cachedUrls, [expectedUrl], "Service worker must precache only the pairing view's exact content revision");
  const cacheRevision = menuCatalogRevision([
    menuCatalogRevision(menuRuntime),
    menuCatalogRevision(orderRuntime),
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
  for (const key of ["orderSource", "orderRuntime", "worker"]) {
    const inputs = { ...current, [key]: current[key].replace(expectedUrl, "./menu-pairing.js?v=000000000000") };
    assert.notEqual(inputs[key], current[key], `${key}: stale-URL control must actually change the fixture`);
    assert.throws(() => verifyPairingRevision(inputs), /exact content revision/, key);
  }
  for (const key of ["pairingBytes", "generatedPairing"]) {
    assert.throws(() => verifyPairingRevision({ ...current, [key]: current[key] + "\n// byte drift\n" }), /must match their readable source/, key);
  }
  for (const key of ["menuRuntime", "orderRuntime", "premiumBytes"]) {
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
  await verifyReturningModuleCache(worker, "menu-order-ui.js", menuCatalogRevision(readFileSync("menu-order-ui.js")));
  await verifyReturningModuleCache(worker, "order-storage.js", menuCatalogRevision(readFileSync("order-storage.js")));
});

test("ordering storage is loaded on intent with verified source and exact offline revision", () => {
  const runtime = readFileSync("order-storage.js", "utf8");
  assert.equal(runtime, compileOrderStorageRuntime(), "Storage runtime must match its source, domain and recovery controls");
  const revision = menuCatalogRevision(runtime);
  const expectedUrl = `./order-storage.js?v=${revision}`;
  const source = readFileSync("src/menu-app.js", "utf8");
  const emitted = readFileSync("menu-app.js", "utf8");
  for (const [file, content] of [["source", source], ["runtime", emitted]]) {
    assert.ok(content.includes(`import("${expectedUrl}")`), `${file} must request the current storage runtime lazily`);
    assert.doesNotMatch(content, /from\s*["'][^"']*(?:order-storage|order-draft|order-storage-notice)\.js/, `${file} must not import ordering storage eagerly`);
  }
  const worker = readFileSync("sw-core-v64.js", "utf8");
  assert.ok(worker.includes(`"${expectedUrl}"`), "Storage must be precached at its exact revision");
  for (const file of ["smart-choice/app-v2.js", "smart-choice/cart-v2.js"]) {
    const content = readFileSync(file, "utf8");
    const imports = Array.from(content.matchAll(/\bfrom\s*["']([^"']*order-storage\.js(?:\?[^"']*)?)["']/g), match => match[1]);
    assert.deepEqual([...new Set(imports)], [`../order-storage.js?v=${revision}`], `${file} must reuse the current shared storage module`);
    assert.ok(!content.includes("robys-order-transactions.v1"), `${file} must not ship a duplicate storage implementation`);
  }
});

test("actual-worker negative control rejects stale ordering storage at a new revision", async () => {
  const worker = readFileSync("sw-core-v64.js", "utf8");
  const rule = /url\.pathname\.endsWith\("\/order-storage\.js"\)\s*\|\|/;
  assert.match(worker, rule);
  await assert.rejects(
    verifyReturningModuleCache(worker.replace(rule, ""), "order-storage.js", menuCatalogRevision(readFileSync("order-storage.js"))),
    /a stale query must not satisfy the current content URL/
  );
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

test("family selection source, loader and offline cache use the same fresh bytes", async () => {
  const runtime = readFileSync("menu-family-ui.js", "utf8");
  assert.equal(runtime, compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8")),
    "Family UI must match its source and bundled recipe domain");
  const revision = menuCatalogRevision(runtime);
  const cssRevision = menuCatalogRevision(readFileSync("menu-family.css"));
  const expectedUrl = `./menu-family-ui.js?v=${revision}`;
  for (const file of ["src/menu-app.js", "menu-app.js"]) {
    assert.ok(readFileSync(file, "utf8").includes(`import("${expectedUrl}")`),
      `${file}: family intent must load the current content revision`);
  }
  const worker = readFileSync("sw-core-v64.js", "utf8");
  assert.ok(worker.includes(`"${expectedUrl}"`), "Offline family UI must precache current bytes");
  assert.ok(worker.includes(`"./menu-family.css?v=${cssRevision}"`), "Offline family CSS must precache current bytes");
  assert.ok(readFileSync("menu.html", "utf8").includes(`href="menu-family.css?v=${cssRevision}"`),
    "Family page stylesheet must match offline content");
  const familyPhotos = ["milk-cookie", "simit-break", "milk-roll", "kids-box"]
    .map(name => `src/products/family-sets-v1/${name}.webp`);
  const precache = worker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  for (const path of familyPhotos) {
    assert.ok(precache?.includes(`"./${path}"`), `${path}: first offline reveal requires precaching`);
  }
  const photoRevisions = familyPhotos.map(path => menuCatalogRevision(readFileSync(path)));
  const namespace = menuCatalogRevision([revision, cssRevision, menuCatalogRevision(readFileSync("src/menu-family.js")), ...photoRevisions].join(":"));
  assert.ok(worker.includes(`-family-menu-${namespace}-`), "Family cache namespace must bind UI, CSS, recipes and photo bytes");
  for (const file of ["menu-family-ui.js", "menu-family.css"]) {
    const digest = menuCatalogRevision(readFileSync(file));
    await verifyReturningModuleCache(worker, file, digest);
    const exactRule = new RegExp(`url\\.pathname\\.endsWith\\("/${file.replaceAll(".", "\\.")}"\\)\\s*\\|\\|`);
    assert.match(worker, exactRule, `${file}: negative control must remove the real cache rule`);
    await assert.rejects(verifyReturningModuleCache(worker.replace(exactRule, ""), file, digest),
      /a stale query must not satisfy the current content URL/,
      `${file}: removing query identity must reproduce stale bytes`);
  }
});

function readSocialOfferRevisionInputs() {
  return {
    offerBytes: readFileSync("social-offer.js"),
    home: readFileSync("index.html", "utf8"),
    worker: readFileSync("sw-core-v64.js", "utf8")
  };
}

function verifySocialOfferRevision({ offerBytes, home, worker }) {
  const revision = menuCatalogRevision(offerBytes);
  const expectedUrl = `social-offer.js?v=${revision}`;
  const scripts = Array.from(home.matchAll(/<script\b[^>]*\bsrc=["'](?:\.\/)?(social-offer\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(scripts, [expectedUrl], "Home must load the social offer's exact content revision");
  const precache = worker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache, "Service worker precache list is missing");
  const cachedUrls = Array.from(precache.matchAll(/["'](\.\/social-offer\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(cachedUrls, [`./${expectedUrl}`], "Service worker must precache the social offer's exact content revision");
  const cacheVersion = worker.match(/const CACHE_VERSION = "([^"]+)";/)?.[1];
  assert.ok(cacheVersion?.includes(`-social-offer-${revision}-`), "Social offer cache namespace must bind its actual runtime bytes");
  return { revision, expectedUrl, cacheVersion };
}

test("home offer runtime, page, precache and cache namespace share their content revision", () => {
  verifySocialOfferRevision(readSocialOfferRevisionInputs());
});

test("reject stale home offer loaders, precache and cache namespaces after offer byte changes", () => {
  const current = readSocialOfferRevisionInputs();
  const { expectedUrl, revision } = verifySocialOfferRevision(current);
  for (const key of ["home", "worker"]) {
    const stale = current[key].replace(expectedUrl, "social-offer.js?v=000000000000");
    assert.notEqual(stale, current[key], `${key}: stale-URL control must change the fixture`);
    assert.throws(() => verifySocialOfferRevision({ ...current, [key]: stale }), /exact content revision/);
  }
  assert.throws(() => verifySocialOfferRevision({ ...current, offerBytes: Buffer.concat([current.offerBytes, Buffer.from("\n")]) }), /exact content revision/);
  const staleNamespace = current.worker.replace(`-social-offer-${revision}-`, "-social-offer-000000000000-");
  assert.notEqual(staleNamespace, current.worker, "Cache namespace control must change the fixture");
  assert.throws(() => verifySocialOfferRevision({ ...current, worker: staleNamespace }), /cache namespace must bind/);
});

test("returning worker fetches the current home offer instead of reusing its old query", async () => {
  const inputs = readSocialOfferRevisionInputs();
  const { revision } = verifySocialOfferRevision(inputs);
  await verifyReturningModuleCache(inputs.worker, "social-offer.js", revision);
  const exactOfferRule = /url\.pathname\.endsWith\("\/social-offer\.js"\)\s*\|\|/;
  assert.match(inputs.worker, exactOfferRule, "Negative control must remove the actual social offer exact-query rule");
  await assert.rejects(
    verifyReturningModuleCache(inputs.worker.replace(exactOfferRule, ""), "social-offer.js", revision),
    /a stale query must not satisfy the current content URL/,
    "Removing the exact-query rule must reproduce stale offer reuse"
  );
});

test("actual worker installation precaches the new offer and activation retires the previous home cache", async () => {
  const inputs = readSocialOfferRevisionInputs();
  const { expectedUrl, revision, cacheVersion } = verifySocialOfferRevision(inputs);
  const previousVersion = cacheVersion.replace(`-social-offer-${revision}`, "");
  const cacheNames = new Set([previousVersion]);
  const handlers = new Map();
  let precached;
  let skippedWaiting = false;
  let claimed = false;
  runInNewContext(inputs.worker, {
    URL,
    caches: {
      async open(name) {
        assert.equal(name, cacheVersion);
        cacheNames.add(name);
        return { async addAll(urls) { precached = Array.from(urls); } };
      },
      async keys() { return Array.from(cacheNames); },
      async delete(name) { return cacheNames.delete(name); }
    },
    self: {
      registration: { scope: "https://example.test/robys-coffee-house-demo/" },
      addEventListener(name, handler) { handlers.set(name, handler); },
      async skipWaiting() { skippedWaiting = true; },
      clients: { async claim() { claimed = true; } }
    }
  });
  let completion;
  handlers.get("install")({ waitUntil(promise) { completion = promise; } });
  await completion;
  assert.ok(precached.includes(`./${expectedUrl}`));
  assert.equal(skippedWaiting, true);
  handlers.get("activate")({ waitUntil(promise) { completion = promise; } });
  await completion;
  assert.deepEqual(Array.from(cacheNames), [cacheVersion], "Activation must remove the previously cached home and offer");
  assert.equal(claimed, true);
});
