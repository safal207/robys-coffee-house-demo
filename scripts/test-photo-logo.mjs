#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../brand-photo-logo.css", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const compactMaster = readFileSync(new URL("../src/brand/robys-compact-master-v1.svg", import.meta.url), "utf8");
const markMaster = readFileSync(new URL("../src/brand/robys-mark-master-v1.svg", import.meta.url), "utf8");

const assets = [
  "src/brand/robys-primary-master-v1.svg",
  "src/brand/robys-compact-master-v1.svg",
  "src/brand/robys-mobile-master-v1.svg",
  "src/brand/robys-mark-master-v1.svg",
];

for (const asset of assets) {
  assert.equal(existsSync(new URL(`../${asset}`, import.meta.url)), true, `missing SVG master: ${asset}`);
}

assert.match(bootstrap, /brand-photo-logo\.css\?v=20260721-svg-master-1/);
assert.match(stylesheet, /robys-primary-master-v1\.svg\?v=20260721-master-1/);
assert.match(stylesheet, /robys-compact-master-v1\.svg\?v=20260721-master-1/);
assert.match(stylesheet, /robys-mark-master-v1\.svg\?v=20260721-master-1/);
assert.match(stylesheet, /\.brand-copy strong::before,[\s\S]*?content:none!important/);
assert.match(stylesheet, /\.menu-page-brand-tagline\s*\{\s*display:none!important/);
assert.match(stylesheet, /clip-path:inset\(50%\)!important/);
assert.doesNotMatch(stylesheet, /(^|[\s;{])clip\s*:/m, "logo accessibility styles must not use deprecated clip");
assert.doesNotMatch(stylesheet, /font-family:/, "visual wordmark must not depend on browser fonts");
assert.doesNotMatch(stylesheet, /scaleX\(/, "visual wordmark must not be synthesized with CSS transforms");

assert.match(compactMaster, /viewBox="0 0 435 150"/);
assert.match(compactMaster, /translate\(105 -2\) scale\(\.65 1\)/, "S must occupy its own optical zone after Y and the apostrophe");
assert.match(markMaster, /M50 4C77\.7 4 96 22\.9 96 50\.3/, "standalone mark must retain the smooth cup-referenced outer ring");

for (const asset of assets) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(serviceWorker, new RegExp(escaped));
}
assert.match(serviceWorker, /brand-photo-logo\.css\?v=20260721-svg-master-1/);
assert.match(serviceWorker, /pathname\.endsWith\("\/src\/brand\/robys-primary-master-v1\.svg"\)/);
assert.match(serviceWorker, /pathname\.endsWith\("\/src\/brand\/robys-compact-master-v1\.svg"\)/);
assert.match(serviceWorker, /pathname\.endsWith\("\/src\/brand\/robys-mobile-master-v1\.svg"\)/);
assert.match(serviceWorker, /pathname\.endsWith\("\/src\/brand\/robys-mark-master-v1\.svg"\)/);

console.log("PASS: approved SVG-path Roby's wordmark contract");
