#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../bootstrap.js", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../brand-photo-logo.css", import.meta.url), "utf8");
const ring = readFileSync(new URL("../src/brand/robys-organic-ring.svg", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(bootstrap, /const photoLogo = document\.createElement\("link"\)/);
assert.match(bootstrap, /photoLogo\.rel = "stylesheet"/);
assert.match(bootstrap, /photoLogo\.href = "brand-photo-logo\.css\?v=20260721-type-1"/);
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

assert.match(
  stylesheet,
  /font-family:"Arial Narrow","Roboto Condensed","DejaVu Sans Condensed",Arial,sans-serif!important/,
  "wordmark must use a narrow, self-contained font stack",
);
assert.match(stylesheet, /--robys-wordmark-scale-x:\.78/);
assert.match(stylesheet, /--robys-wordmark-scale-y:1\.12/);
assert.match(stylesheet, /--robys-wordmark-rise:-56%/);
assert.match(stylesheet, /letter-spacing:-\.06em!important/);
assert.match(
  stylesheet,
  /transform:translateY\(var\(--robys-wordmark-rise\)\) scaleX\(var\(--robys-wordmark-scale-x\)\) scaleY\(var\(--robys-wordmark-scale-y\)\)!important/,
);
assert.match(
  stylesheet,
  /@media\(max-width:390px\)[\s\S]*?\.site-header \.brand\s*\{[\s\S]*?overflow:hidden!important/,
  "narrow header lockup must remain inside its white container",
);
assert.match(
  stylesheet,
  /@media\(max-width:340px\)[\s\S]*?\.discover-header \.brand-copy\s*\{[\s\S]*?display:flex!important/,
  "discover must render a compact wordmark instead of an empty white pill",
);

assert.match(ring, /fill="#d32636"/);
assert.match(ring, /fill-rule="evenodd"/);
assert.match(ring, /Photo-referenced red organic ring brand mark/);

const coreAssets = serviceWorker.match(
  /const CORE_ASSETS = \[(?<body>[\s\S]*?)\];/u,
)?.groups?.body ?? "";
assert.match(coreAssets, /"\.\/brand-photo-logo\.css\?v=20260721-type-1"/);
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
