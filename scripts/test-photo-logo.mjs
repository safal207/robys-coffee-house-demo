#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../brand-photo-logo.css", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const compactMaster = readFileSync(new URL("../src/brand/robys-compact-master-v1.svg", import.meta.url), "utf8");
const markMaster = readFileSync(new URL("../src/brand/robys-mark-master-v1.svg", import.meta.url), "utf8");

const assetRevisions = new Map([
  ["src/brand/robys-primary-master-v1.svg", "20260721-master-1"],
  ["src/brand/robys-header-master-v1.svg", "20260723-identity-v2"],
  ["src/brand/robys-compact-master-v1.svg", "20260721-master-1"],
  ["src/brand/robys-mark-master-v1.svg", "20260721-master-1"],
]);

for (const asset of assetRevisions.keys()) {
  assert.equal(existsSync(new URL(`../${asset}`, import.meta.url)), true, `missing SVG master: ${asset}`);
}
assert.equal(
  existsSync(new URL("../src/brand/robys-mobile-master-v1.svg", import.meta.url)),
  false,
  "deprecated baked mobile pill master must stay removed"
);

assert.match(bootstrap, /brand-photo-logo\.css\?v=20260723-identity-v1/);
assert.match(stylesheet, /robys-header-master-v1\.svg\?v=20260723-identity-v1/);
assert.match(stylesheet, /robys-primary-master-v1\.svg\?v=20260721-master-1/);
assert.match(stylesheet, /robys-compact-master-v1\.svg\?v=20260721-master-1/);
assert.match(stylesheet, /robys-mark-master-v1\.svg\?v=20260721-master-1/);
assert.doesNotMatch(stylesheet, /robys-mobile-master-v1\.svg/, "identity CSS must not depend on the retired baked mobile pill master");
assert.match(stylesheet, /\.brand-copy strong::before,[\s\S]*?content:none!important/);
assert.match(stylesheet, /\.menu-page-brand-tagline\s*\{\s*display:none!important/);
assert.match(stylesheet, /clip-path:inset\(50%\)!important/);
assert.doesNotMatch(stylesheet, /(^|[\s;{])clip\s*:/m, "logo accessibility styles must not use deprecated clip");
assert.doesNotMatch(stylesheet, /font-family:/, "visual wordmark must not depend on browser fonts");
assert.doesNotMatch(stylesheet, /scaleX\(/, "visual wordmark must not be synthesized with CSS transforms");

assert.match(compactMaster, /viewBox="0 0 435 150"/);
assert.match(compactMaster, /translate\(105 -2\) scale\(\.65 1\)/, "S must occupy its own optical zone after Y and the apostrophe");
assert.match(markMaster, /M50 4C77\.7 4 96 22\.9 96 50\.3/, "standalone mark must retain the smooth cup-referenced outer ring");

const coreAssets = serviceWorker.match(
  /const CORE_ASSETS = \[(?<body>[\s\S]*?)\];/u,
)?.groups?.body ?? "";
assert.match(coreAssets, /"\.\/brand-photo-logo\.css\?v=20260723-identity-v2"/);
for (const [asset, revision] of assetRevisions) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(coreAssets, new RegExp(`"\\./${escaped}\\?v=${revision}"`));
}
assert.doesNotMatch(coreAssets, /robys-mobile-master-v1\.svg/, "offline cache must not request the retired mobile master");

const exactRevisionBlock = serviceWorker.match(
  /const requiresExactRevision =(?<body>[\s\S]*?)if \(requiresExactRevision\)/u,
)?.groups?.body ?? "";
for (const asset of assetRevisions.keys()) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(exactRevisionBlock, new RegExp(`url\\.pathname\\.endsWith\\("/${escaped}"\\)`));
}
assert.doesNotMatch(exactRevisionBlock, /robys-mobile-master-v1\.svg/, "exact-revision routing must not reference the retired mobile master");
assert.match(exactRevisionBlock, /url\.pathname\.endsWith\("\/brand-photo-logo\.css"\)/);
assert.match(serviceWorker, /if \(requiresExactRevision\)\s*\{\s*return cache\.match\(request\);/su);

const runtimeBlock = serviceWorker.match(
  /async function runtimeAssetResponse\(request\) \{(?<body>[\s\S]*?)\n\}/u,
)?.groups?.body ?? "";
assert.match(runtimeBlock, /const cached = await cachedResponse\(request\)/);
assert.match(runtimeBlock, /if \(cached\) return cached/);
assert.match(runtimeBlock, /const network = await fetch\(request\)/);
assert.match(runtimeBlock, /if \(network\.ok\)/);
assert.match(runtimeBlock, /cache\.put\(request, network\.clone\(\)\)/);
assert.match(serviceWorker, /event\.respondWith\(runtimeAssetResponse\(event\.request\)\)/);

console.log("PASS: approved SVG-path Roby's wordmark contract");