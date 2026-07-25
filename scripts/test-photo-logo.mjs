#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const WORDMARK_REVISION = "20260724-wordmark-v3";
const bootstrap = readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../brand-photo-logo.css", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const compactMaster = readFileSync(new URL("../src/brand/robys-compact-master-v1.svg", import.meta.url), "utf8");
const markMaster = readFileSync(new URL("../src/brand/robys-mark-master-v1.svg", import.meta.url), "utf8");

const assetRevisions = new Map([
  ["src/brand/robys-primary-master-v1.svg", WORDMARK_REVISION],
  ["src/brand/robys-header-master-v1.svg", WORDMARK_REVISION],
  ["src/brand/robys-compact-master-v1.svg", WORDMARK_REVISION],
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

assert.match(bootstrap, /apple-touch-icon\.png\?v=ios-install-20260707-1/, "progressive Apple touch fallback changed");
assert.doesNotMatch(bootstrap, /brand-photo-logo\.css/, "identity stylesheet must remain statically linked by HTML");
assert.match(stylesheet, new RegExp(`robys-header-master-v1\\.svg\\?v=${WORDMARK_REVISION}`));
assert.match(stylesheet, new RegExp(`robys-primary-master-v1\\.svg\\?v=${WORDMARK_REVISION}`));
assert.match(stylesheet, new RegExp(`robys-compact-master-v1\\.svg\\?v=${WORDMARK_REVISION}`));
assert.match(stylesheet, /robys-mark-master-v1\.svg\?v=20260721-master-1/);
assert.doesNotMatch(stylesheet, /robys-mobile-master-v1\.svg/, "identity CSS must not depend on the retired baked mobile pill master");
assert.match(stylesheet, /\.brand-copy strong::before,[\s\S]*?content:none!important/);
assert.match(stylesheet, /\.menu-page-brand-tagline\s*\{\s*display:none!important/);
assert.match(stylesheet, /clip-path:inset\(50%\)!important/);
assert.doesNotMatch(stylesheet, /(^|[\s;{])clip\s*:/m, "logo accessibility styles must not use deprecated clip");
assert.doesNotMatch(stylesheet, /font-family:/, "visual wordmark must not depend on browser fonts");
assert.doesNotMatch(stylesheet, /scaleX\(/, "visual wordmark must not be synthesized with CSS transforms");

assert.match(compactMaster, /viewBox="0 0 435 150"/);
assert.match(compactMaster, /data-cap-y="18" data-baseline-y="132"/, "wordmark must publish the shared R/Y vertical grid");
assert.match(compactMaster, /id="robys-b-bowls"[\s\S]*?translate\(62 2\.454545\) scale\(\.65 \.863636\)/, "B bowls must align to the R/Y cap-height and baseline");
assert.match(compactMaster, /id="robys-s"[\s\S]*?translate\(105 6\.434783\) scale\(\.65 \.826087\)/, "S must align to the R/Y cap-height and baseline");
assert.match(markMaster, /M50 4C77\.7 4 96 22\.9 96 50\.3/, "standalone mark must retain the smooth cup-referenced outer ring");

const coreAssets = serviceWorker.match(
  /const CORE_ASSETS = \[(?<body>[\s\S]*?)\];/u,
)?.groups?.body ?? "";
assert.match(coreAssets, new RegExp(`"\\./brand-photo-logo\\.css\\?v=${WORDMARK_REVISION}"`));
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
