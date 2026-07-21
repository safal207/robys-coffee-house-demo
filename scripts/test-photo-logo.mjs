#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../brand-photo-logo.css", import.meta.url), "utf8");
const ring = readFileSync(new URL("../src/brand/robys-organic-ring.svg", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(bootstrap, /const photoLogo = document\.createElement\("link"\)/);
assert.match(bootstrap, /photoLogo\.rel = "stylesheet"/);
assert.match(bootstrap, /photoLogo\.href = "brand-photo-logo\.css\?v=20260720-1"/);
assert.match(bootstrap, /document\.head\.append\(photoLogo\)/);
assert.doesNotMatch(bootstrap, /DOMContentLoaded/, "logo stylesheet must be requested immediately from the head bootstrap");

assert.match(stylesheet, /\.brand-copy strong\s*\{/);
assert.match(stylesheet, /border:\s*0\s*!important/);
assert.doesNotMatch(
  stylesheet,
  /border-color:\s*transparent\s*!important/,
  "transparent border must not shrink the organic O background positioning area",
);
assert.match(stylesheet, /src\/brand\/robys-organic-ring\.svg\?v=20260720-1/);
assert.match(stylesheet, /background:\s*url\([^)]*robys-organic-ring\.svg[^)]*\)\s*center\/contain\s*no-repeat\s*!important/);

assert.match(ring, /fill="#d32636"/);
assert.match(ring, /fill-rule="evenodd"/);
assert.match(ring, /Photo-referenced red organic ring brand mark/);

const coreAssets = serviceWorker.match(
  /const CORE_ASSETS = \[(?<body>[\s\S]*?)\];/u,
)?.groups?.body ?? "";
assert.match(coreAssets, /"\.\/brand-photo-logo\.css\?v=20260720-1"/);
assert.match(coreAssets, /"\.\/src\/brand\/robys-organic-ring\.svg\?v=20260720-1"/);

const exactRevisionBlock = serviceWorker.match(
  /const requiresExactRevision =(?<body>[\s\S]*?)if \(requiresExactRevision\)/u,
)?.groups?.body ?? "";
assert.match(exactRevisionBlock, /\.pathname\.endsWith\("\/brand-photo-logo\.css"\)/);
assert.match(exactRevisionBlock, /\.pathname\.endsWith\("\/src\/brand\/robys-organic-ring\.svg"\)/);
assert.match(
  serviceWorker,
  /if \(requiresExactRevision\)\s*\{\s*return cache\.match\(request\);/su,
);

console.log("PASS: photo-referenced Roby's organic logo contract");
