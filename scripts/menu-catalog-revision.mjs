import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

export const SMART_CHOICE_CATALOG_CONSUMERS = [
  "smart-choice/app-v2.js", "smart-choice/cart-v2.js", "smart-choice/experiments-v2.js",
  "smart-choice/analytics-v2.js", "smart-choice/decision-trace-v2.js"
];

export function readSmartChoiceCatalogRevisionInputs() {
  return {
    catalogBytes: readFileSync("menu-catalog.js"),
    smartCatalogBytes: readFileSync("smart-choice/catalog.js"),
    runtimes: Object.fromEntries(SMART_CHOICE_CATALOG_CONSUMERS.map(file => [file, readFileSync(file, "utf8")])),
    serviceWorker: readFileSync("sw-core-v64.js", "utf8")
  };
}

export function verifySmartChoiceCatalogRevision({ catalogBytes, smartCatalogBytes, runtimes, serviceWorker }) {
  const revision = menuCatalogRevision(catalogBytes);
  const expectedUrl = `../menu-catalog.js?v=${revision}`;
  const smartCatalogRevision = menuCatalogRevision(smartCatalogBytes);
  const smartCatalogUrl = `./catalog.js?v=${smartCatalogRevision}`;
  const importsFor = (file, source, pattern) => {
    const parsed = ts.createSourceFile(file, String(source ?? ""), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    return [...new Set(parsed.statements.filter(ts.isImportDeclaration)
      .filter(node => ts.isStringLiteral(node.moduleSpecifier))
      .map(node => node.moduleSpecifier.text)
      .filter(specifier => pattern.test(specifier)))];
  };
  const menuPattern = /(?:^|\/)menu-catalog\.js(?:\?|$)/;
  assert.deepEqual(importsFor("smart-choice/catalog.js", smartCatalogBytes, menuPattern), [expectedUrl],
    `[CATALOG-REV-002] Derived catalog must import the shared catalog's exact content revision ${revision}`);
  for (const file of SMART_CHOICE_CATALOG_CONSUMERS) {
    assert.deepEqual(importsFor(file, runtimes[file], /(?:^|\/)catalog\.js(?:\?|$)/), [smartCatalogUrl],
      `[CATALOG-REV-002] ${file} must import the shared catalog's exact content revision ${smartCatalogRevision}`);
    // Some entry points also use the full ordering catalog directly. Every
    // direct edge must agree with the shared derived catalog's dependency.
    const directImports = importsFor(file, runtimes[file], menuPattern);
    if (directImports.length) assert.deepEqual(directImports, [expectedUrl],
      `[CATALOG-REV-002] ${file} must import the shared catalog's exact content revision ${revision}`);
  }
  const precache = serviceWorker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
  const urls = Array.from(precache.matchAll(/["'](\.\/menu-catalog\.js(?:\?[^"']*)?)["']/g), match => match[1]);
  assert.deepEqual(urls, [`./menu-catalog.js?v=${revision}`], "[CATALOG-REV-002] Shared catalog must be precached at its exact content revision");
  const smartUrls = Array.from(precache.matchAll(/["'](\.\/smart-choice\/catalog\.js(?:\?[^"']*)?)["']/g), match => match[1]);
  assert.deepEqual(smartUrls, [`./smart-choice/catalog.js?v=${smartCatalogRevision}`], "[CATALOG-REV-002] Derived catalog must be precached at its exact content revision");
  return { revision, expectedUrl, smartCatalogRevision, smartCatalogUrl };
}

export function menuCatalogRevision(catalogBytes) {
  return createHash("sha256").update(catalogBytes).digest("hex").slice(0, 12);
}

export function readMenuCatalogRevisionInputs() {
  return {
    catalogBytes: readFileSync("menu-catalog.js"),
    menuSource: readFileSync("src/menu-app.js", "utf8"),
    menuRuntime: readFileSync("menu-app.js", "utf8"),
    revealRuntime: readFileSync("menu-product-reveal-runtime.js", "utf8"),
    revealLoader: readFileSync("menu-product-reveal.js", "utf8"),
    discoverRuntime: readFileSync("discover-v2.js", "utf8"),
    discoverDeck: readFileSync("discover-deck.js", "utf8"),
    discoverHtml: readFileSync("discover.html", "utf8"),
    serviceWorker: readFileSync("sw-core-v64.js", "utf8")
  };
}

export function verifyMenuCatalogRevision({ catalogBytes, menuSource, menuRuntime, revealRuntime, revealLoader, discoverRuntime, discoverDeck, discoverHtml, serviceWorker }) {
  const revision = menuCatalogRevision(catalogBytes);
  const expectedUrl = `./menu-catalog.js?v=${revision}`;
  for (const [label, text] of [["menu source", menuSource], ["compiled menu runtime", menuRuntime], ["product reveal runtime", revealRuntime], ["Discover runtime", discoverRuntime], ["Discover deck", discoverDeck]]) {
    const imports = Array.from(text.matchAll(/\bfrom\s*["'](\.\/menu-catalog\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
    assert.deepEqual(imports, [expectedUrl], `[CATALOG-REV-001] ${label} must import the catalog's exact content revision ${revision}`);
  }

  const precache = serviceWorker.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache, "[CATALOG-REV-001] Service worker precache list is missing");
  const cachedUrls = Array.from(precache.matchAll(/["'](\.\/menu-catalog\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(cachedUrls, [expectedUrl], `[CATALOG-REV-001] Service worker must precache only the catalog's exact content revision ${revision}`);

  const revealRevision = menuCatalogRevision(revealRuntime);
  const expectedRevealUrl = `./menu-product-reveal-runtime.js?v=${revealRevision}`;
  const lazyImports = Array.from(revealLoader.matchAll(/\bimport\(["'](\.\/menu-product-reveal-runtime\.js(?:\?[^"']*)?)["']\)/g), (match) => match[1]);
  assert.deepEqual(lazyImports, [expectedRevealUrl], `[CATALOG-REV-001] Reveal loader must request the exact content revision ${revealRevision}`);
  const cachedRevealUrls = Array.from(precache.matchAll(/["'](\.\/menu-product-reveal-runtime\.js(?:\?[^"']*)?)["']/g), (match) => match[1]);
  assert.deepEqual(cachedRevealUrls, [expectedRevealUrl], `[CATALOG-REV-001] Service worker must precache the exact reveal content revision ${revealRevision}`);

  for (const [file, source] of [["discover-v2.js", discoverRuntime], ["discover-deck.js", discoverDeck]]) {
    const assetRevision = menuCatalogRevision(source);
    const expectedAssetUrl = `${file}?v=${assetRevision}`;
    const escapedFile = file.replaceAll(".", "\\.");
    const pageUrls = Array.from(discoverHtml.matchAll(new RegExp(`\\bsrc=["'](${escapedFile}(?:\\?[^"']*)?)["']`, "g")), (match) => match[1]);
    assert.deepEqual(pageUrls, [expectedAssetUrl], `[CATALOG-REV-001] Discover page must request ${file}'s exact content revision ${assetRevision}`);
    const cachedAssetUrls = Array.from(precache.matchAll(new RegExp(`["'](\\./${escapedFile}(?:\\?[^"']*)?)["']`, "g")), (match) => match[1]);
    assert.deepEqual(cachedAssetUrls, [`./${expectedAssetUrl}`], `[CATALOG-REV-001] Service worker must precache ${file}'s exact content revision ${assetRevision}`);
    assert.ok(serviceWorker.includes(`url.pathname.endsWith("/${file}")`), `[CATALOG-REV-001] ${file} must remain exact-revision cached`);
  }

  const cacheLookup = serviceWorker.match(/async function cachedResponse\(request\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(cacheLookup?.includes('url.pathname.endsWith("/menu-catalog.js")'), "[CATALOG-REV-001] Catalog must remain in the exact-revision cache rule");
  assert.ok(cacheLookup?.includes('url.pathname.endsWith("/menu-product-reveal-runtime.js")'), "[CATALOG-REV-001] Reveal runtime must remain in the exact-revision cache rule");
  assert.match(cacheLookup, /if\s*\(requiresExactRevision\)\s*\{\s*return cache\.match\(request\);\s*\}/, "[CATALOG-REV-001] Catalog cache hits must retain query-string identity");
  return { revision, expectedUrl };
}
