import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MENU_STYLE_INPUTS, compileMenuStylesBundle, menuStylesRevision, menuStylesSourceMap, readMenuStylesBundleInputs,
  verifyMenuStylesBundle } from "./menu-styles-bundle.mjs";

// Independent oracle: changing the compiler manifest must not redefine the
// expected cascade or silently move approved branding across other layers.
const expectedInputs = [
  ["styles-v2.css", "styles-v2.css"], ["menu-premium.css", "menu-premium.css"],
  ["menu-family.css", "menu-family.css"], ["menu-product-reveal.css", "menu-product-reveal.css"],
  ["pairing-posters.css", "pairing-posters.css"], ["menu-stability.css", "menu-stability-v2.css"],
  ["menu-security-v2.css", "menu-security-v2.css"], ["brand-photo-logo.css", "brand-photo-logo.css"],
  ["order-checkout.css", "order-checkout.css"]
];

function fixture() {
  const sources = Object.fromEntries(expectedInputs.map(([source], index) =>
    [source, Buffer.from(`/* ${source} */\n.layer { --winner: ${index}; }\n`)]));
  const bundleBytes = Buffer.from(expectedInputs.map(([source]) => sources[source].toString()).join("\n"));
  const revision = menuStylesRevision(bundleBytes);
  return { sources, bundleBytes, stabilityAliasBytes: sources["menu-stability.css"],
    menuHtml: `<link rel="stylesheet" href="menu-runtime.css?v=${revision}" />`,
    serviceWorker: `const CACHE_VERSION = "proof-menu-css-${revision}-done";
const CORE_ASSETS = ["./menu-runtime.css?v=${revision}"];
async function cachedResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  const url = new URL(request.url);
  const requiresExactRevision = url.pathname.endsWith("/another.js") || url.pathname.endsWith("/menu-runtime.css");
  if (requiresExactRevision) return cache.match(request);
  return cache.match(request, {ignoreSearch:true});
}` };
}

test("literal original cascade order and byte-preserving concatenation", () => {
  assert.deepEqual(MENU_STYLE_INPUTS.map(({ source, delivered }) => [source, delivered]), expectedInputs);
  const inputs = fixture();
  assert.deepEqual(compileMenuStylesBundle(inputs.sources), inputs.bundleBytes);
  const offsets = menuStylesSourceMap(inputs.sources);
  for (const segment of offsets) assert.deepEqual(inputs.bundleBytes.subarray(segment.start, segment.end), inputs.sources[segment.source]);
  assert.equal(offsets[offsets.length - 1].end, inputs.bundleBytes.byteLength);
  verifyMenuStylesBundle(inputs);
});

for (const [source] of expectedInputs) {
  test(`${source}: stale source bytes, omitted source and omitted segment are rejected`, () => {
    const inputs = fixture();
    assert.throws(() => verifyMenuStylesBundle({ ...inputs,
      sources: { ...inputs.sources, [source]: Buffer.concat([inputs.sources[source], Buffer.from("/* changed */")]) } }), /nine current source files/);
    const missing = { ...inputs.sources }; delete missing[source];
    assert.throws(() => verifyMenuStylesBundle({ ...inputs, sources: missing }), /source is missing/);
    const omitted = Buffer.from(expectedInputs.filter(([name]) => name !== source).map(([name]) => inputs.sources[name].toString()).join("\n"));
    assert.throws(() => verifyMenuStylesBundle({ ...inputs, bundleBytes: omitted }), /nine current source files/);
  });
}

test("reordered or absent delivered CSS and a stale stability alias are rejected", () => {
  const inputs = fixture();
  const reordered = Buffer.from([...expectedInputs].reverse().map(([source]) => inputs.sources[source].toString()).join("\n"));
  assert.throws(() => verifyMenuStylesBundle({ ...inputs, bundleBytes: reordered }), /reviewed cascade order/);
  assert.throws(() => verifyMenuStylesBundle({ ...inputs, bundleBytes: Buffer.alloc(0) }), /nine current source files/);
  assert.throws(() => verifyMenuStylesBundle({ ...inputs, stabilityAliasBytes: Buffer.from("stale") }), /stability alias/);
});

test("a missing, stale, commented, script-mentioned, disabled or duplicate stylesheet link fails", () => {
  const inputs = fixture();
  const invalid = ["", inputs.menuHtml.replace(/v=[a-f0-9]{12}/, "v=000000000000"),
    `<!-- ${inputs.menuHtml} -->`, `<script>const mention = ${JSON.stringify(inputs.menuHtml)};</script>`,
    inputs.menuHtml.replace("rel=", "disabled rel="), inputs.menuHtml.replace("rel=", 'media="print" rel='),
    inputs.menuHtml + inputs.menuHtml, inputs.menuHtml + '<link rel="stylesheet" href="menu-premium.css" />'];
  for (const menuHtml of invalid) assert.throws(() => verifyMenuStylesBundle({ ...inputs, menuHtml }), /Menu (?:must load|CSS bundle)/);
});

test("missing/stale precache and namespace, string decoys and non-exact branches fail", () => {
  const inputs = fixture();
  const invalid = [inputs.serviceWorker.replace(/\.\/menu-runtime\.css\?v=[a-f0-9]{12}/, "./menu-runtime.css?v=000000000000"),
    inputs.serviceWorker.replace(/const CORE_ASSETS = \[[^\]]*\];/, "const CORE_ASSETS = [];"),
    inputs.serviceWorker.replace(/-menu-css-[a-f0-9]{12}-/, "-menu-css-000000000000-"),
    inputs.serviceWorker.replace(' || url.pathname.endsWith("/menu-runtime.css")', ''),
    inputs.serviceWorker.replace('url.pathname.endsWith("/menu-runtime.css")', '"url.pathname.endsWith(\\\"/menu-runtime.css\\\")"'),
    inputs.serviceWorker.replace('url.pathname.endsWith("/menu-runtime.css")', '(url.pathname.endsWith("/menu-runtime.css") && false)'),
    inputs.serviceWorker.replace('if (requiresExactRevision)', 'if (false)'),
    inputs.serviceWorker.replace('return cache.match(request);', 'return cache.match(request, {ignoreSearch:true});')];
  for (const serviceWorker of invalid) assert.throws(() => verifyMenuStylesBundle({ ...inputs, serviceWorker }),
    /(?:precache|namespace|actual exact-query|cache branch|Exact-revision)/);
});

async function assertActualQueryIsolation(serviceWorker, bundleBytes) {
  const scope = "https://example.test/subpath/";
  const currentUrl = new URL(`menu-runtime.css?v=${menuStylesRevision(bundleBytes)}`, scope).href;
  const staleUrl = new URL("menu-runtime.css?v=old", scope).href;
  const entries = new Map([[staleUrl, "stale CSS"]]);
  const context = { URL, self: { registration: { scope }, addEventListener() {} },
    caches: { async open() { return { async match(request, options) {
      return options?.ignoreSearch
        ? [...entries].find(([url]) => new URL(url).pathname === new URL(request.url).pathname)?.[1]
        : entries.get(request.url);
    } }; } } };
  runInNewContext(serviceWorker, context);
  assert.equal(await context.cachedResponse({ url: currentUrl }), undefined,
    "A stale query must not satisfy the current CSS URL");
  entries.set(currentUrl, bundleBytes);
  assert.deepEqual(await context.cachedResponse({ url: currentUrl }), bundleBytes,
    "Offline lookup must return the exact current CSS bytes");
}

test("actual shipped bundle parity, exact revision, namespace and real-worker query isolation", async () => {
  const inputs = readMenuStylesBundleInputs();
  verifyMenuStylesBundle(inputs);
  await assertActualQueryIsolation(inputs.serviceWorker, inputs.bundleBytes);
  const rule = /url\.pathname\.endsWith\((["'])\/menu-runtime\.css\1\)/;
  assert.match(inputs.serviceWorker, rule, "Mutation must disable the actual bundle cache rule");
  await assert.rejects(assertActualQueryIsolation(inputs.serviceWorker.replace(rule, "false"), inputs.bundleBytes), /stale query/);
});

test("query-isolation oracle rejects the real branch mutation independently of string checks", async () => {
  const inputs = fixture();
  await assertActualQueryIsolation(inputs.serviceWorker, inputs.bundleBytes);
  await assert.rejects(assertActualQueryIsolation(inputs.serviceWorker.replace(' || url.pathname.endsWith("/menu-runtime.css")', ''), inputs.bundleBytes), /stale query/);
});
