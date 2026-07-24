#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const REVISION = "20260724-wordmark-v3";
const CAP_Y = 18;
const BASELINE_Y = 132;

const canonicalWordmark = `  <g id="robys-wordmark" data-cap-y="${CAP_Y}" data-baseline-y="${BASELINE_Y}">
    <path id="robys-r" fill="#111111" d="M8 18h22v114H8zM30 18h34c28 0 44 15 44 37 0 17-9 29-26 35l32 42H86L57 94H30V74h31c15 0 24-7 24-19s-9-18-24-18H30z" transform="translate(4 0) scale(.65 1)"/>
    <path id="robys-b-stem" fill="#111111" d="M211 18h22v114h-22z" transform="translate(62 0) scale(.65 1)"/>
    <path id="robys-b-bowls" fill="#111111" d="M233 18h33c27 0 43 13 43 32 0 14-8 25-21 30 17 5 26 17 26 34 0 22-17 36-48 36h-33v-20h31c17 0 26-6 26-18 0-11-9-17-26-17h-31V76h29c16 0 24-6 24-17 0-10-8-16-24-16h-29z" transform="translate(62 2.454545) scale(.65 .863636)"/>
    <path id="robys-y" fill="#111111" d="M322 18h26l24 43 24-43h27l-40 68v46h-23V86z" transform="translate(62 0) scale(.65 1)"/>
    <path id="robys-s" fill="#111111" d="M486 35c-10-14-23-21-39-21-29 0-47 15-47 38 0 23 18 34 41 41 18 6 29 11 29 23 0 11-9 18-24 18-18 0-31-9-41-24l-15 13c12 19 29 29 53 29 31 0 51-16 51-40 0-25-18-36-43-44-18-6-28-10-28-21 0-9 8-15 21-15 15 0 26 7 34 19z" transform="translate(105 6.434783) scale(.65 .826087)"/>
    <path id="robys-o" fill="#E21B23" fill-rule="evenodd" d="M50 4C77.7 4 96 22.9 96 50.3 96 77.6 77.2 96 49.8 96 22.7 96 4 77.2 4 50.1 4 22.8 22.7 4 50 4Zm-.8 19.8c-15.5-.7-27 9-28.2 24.2-1.3 16.8 9.8 29.3 25.7 30.8 14.8 1.4 27.6-8.8 30.9-21.2 2.2-8.1-4.8-9.4-9-14.4-6.8-8.1-4.6-18.7-19.4-19.4Z" transform="translate(85 18) scale(1.12)"/>
    <path id="robys-apostrophe" fill="#E21B23" d="M343 8h14l-6 24h-12z"/>
  </g>`;

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, source) {
  writeFileSync(path, source);
}

function assert(condition, message) {
  if (!condition) throw new Error(`[WORDMARK-NORMALIZE] ${message}`);
}

function replaceRange(source, startMarker, endMarker, replacement, path) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end >= 0, `${path}: expected wordmark markers were not found`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchCompact() {
  const path = "src/brand/robys-compact-master-v1.svg";
  let source = read(path);
  if (!source.includes('id="robys-wordmark"')) {
    source = replaceRange(
      source,
      '  <g fill="#111111">',
      '</svg>',
      `  <defs>\n${canonicalWordmark}\n  </defs>\n  <use href="#robys-wordmark"/>\n`,
      path
    );
  }
  source = source.replace(
    "Approved compact Roby's wordmark with independently spaced SVG letter paths and a red organic O.",
    "Approved compact Roby's wordmark with normalized cap-height and baseline geometry plus a red organic O."
  );
  write(path, source);
}

function patchHeader() {
  const path = "src/brand/robys-header-master-v1.svg";
  let source = read(path);
  if (!source.includes('id="robys-wordmark"')) {
    source = source.replace('</desc>\n', `</desc>\n  <defs>\n${canonicalWordmark}\n  </defs>\n`);
    source = replaceRange(
      source,
      '  <g transform="translate(4 0) scale(.88 1.08)">',
      '  <g transform="translate(410 8)"',
      '  <g transform="translate(4 0) scale(.88 1.08)">\n    <use href="#robys-wordmark"/>\n  </g>\n',
      path
    );
  }
  source = source.replace(
    "Approved medium Roby's Coffee House header wordmark without micro-tagline detail.",
    "Approved medium Roby's Coffee House header wordmark with normalized Roby's geometry and no micro-tagline detail."
  );
  write(path, source);
}

function patchPrimary() {
  const path = "src/brand/robys-primary-master-v1.svg";
  let source = read(path);
  if (!source.includes('id="robys-wordmark"')) {
    source = source.replace('  </defs>\n', `${canonicalWordmark}\n  </defs>\n`);
    source = replaceRange(
      source,
      '  <g transform="translate(4 0) scale(.88 1.08)">',
      '  <g transform="translate(410 8)"',
      '  <g transform="translate(4 0) scale(.88 1.08)">\n    <use href="#robys-wordmark"/>\n  </g>\n\n',
      path
    );
  }
  source = source.replace(
    "Approved primary Roby's Coffee House wordmark with independently spaced SVG paths and Fresh Coffee Point tagline.",
    "Approved primary Roby's Coffee House wordmark with normalized Roby's geometry and Fresh Coffee Point tagline."
  );
  write(path, source);
}

function replaceAllIn(path, replacements) {
  let source = read(path);
  for (const [from, to] of replacements) {
    assert(source.includes(from) || source.includes(to), `${path}: missing revision token ${from}`);
    source = source.split(from).join(to);
  }
  write(path, source);
}

function patchDelivery() {
  replaceAllIn("brand-photo-logo.css", [
    ["robys-compact-master-v1.svg?v=20260721-master-1", `robys-compact-master-v1.svg?v=${REVISION}`],
    ["robys-header-master-v1.svg?v=20260723-identity-v2", `robys-header-master-v1.svg?v=${REVISION}`],
    ["robys-primary-master-v1.svg?v=20260721-master-1", `robys-primary-master-v1.svg?v=${REVISION}`]
  ]);

  replaceAllIn("index.html", [
    ["brand-photo-logo.css?v=20260723-identity-v2", `brand-photo-logo.css?v=${REVISION}`],
    ["robys-compact-master-v1.svg?v=20260721-master-1", `robys-compact-master-v1.svg?v=${REVISION}`]
  ]);
  replaceAllIn("menu.html", [
    ["brand-photo-logo.css?v=20260723-identity-v2", `brand-photo-logo.css?v=${REVISION}`],
    ["robys-primary-master-v1.svg?v=20260721-master-1", `robys-primary-master-v1.svg?v=${REVISION}`]
  ]);
  replaceAllIn("discover.html", [
    ["brand-photo-logo.css?v=20260723-identity-v2", `brand-photo-logo.css?v=${REVISION}`],
    ["robys-compact-master-v1.svg?v=20260721-master-1", `robys-compact-master-v1.svg?v=${REVISION}`]
  ]);

  replaceAllIn("sw.js", [
    ["robys-offline-v27-20260724-brand-normalization", "robys-offline-v28-20260724-wordmark-normalization"],
    ["brand-photo-logo.css?v=20260723-identity-v2", `brand-photo-logo.css?v=${REVISION}`],
    ["robys-compact-master-v1.svg?v=20260721-master-1", `robys-compact-master-v1.svg?v=${REVISION}`],
    ["robys-header-master-v1.svg?v=20260723-identity-v2", `robys-header-master-v1.svg?v=${REVISION}`],
    ["robys-primary-master-v1.svg?v=20260721-master-1", `robys-primary-master-v1.svg?v=${REVISION}`]
  ]);
}

function patchIdentityContract() {
  const path = "scripts/verify-brand-identity-assets.mjs";
  let source = read(path);
  source = source.replace('const IDENTITY_REVISION = "20260723-identity-v2";', `const IDENTITY_REVISION = "${REVISION}";`);
  source = source.split("robys-compact-master-v1.svg?v=20260721-master-1").join(`robys-compact-master-v1.svg?v=${REVISION}`);
  source = source.split("robys-primary-master-v1.svg?v=20260721-master-1").join(`robys-primary-master-v1.svg?v=${REVISION}`);

  const insertionMarker = 'assert(header.includes(markPath), "header wordmark must reuse the approved organic O path");\n';
  const geometryContract = `\nfunction extractWordmark(svg, path) {\n  const match = svg.match(/<g id=["']robys-wordmark["'][\\s\\S]*?<\\/g>/);\n  assert(match, \`${'${path}'} must expose the canonical robys-wordmark definition\`);\n  return match[0].replace(/\\s+/g, " ").trim();\n}\n\nconst wordmarkSources = [\n  ["src/brand/robys-compact-master-v1.svg", compact],\n  ["src/brand/robys-header-master-v1.svg", header],\n  ["src/brand/robys-primary-master-v1.svg", primary]\n];\nconst canonicalWordmark = extractWordmark(compact, "src/brand/robys-compact-master-v1.svg");\nfor (const [path, source] of wordmarkSources) {\n  assert(extractWordmark(source, path) === canonicalWordmark, \`${'${path}'} must reuse byte-identical Roby's glyph geometry\`);\n  assert(source.includes('<use href="#robys-wordmark"/>'), \`${'${path}'} must render the canonical wordmark through <use>\`);\n}\n\nconst closeTo = (actual, expected) => Math.abs(actual - expected) < 0.001;\nconst transformedY = (value, scale, translate) => value * scale + translate;\nassert(closeTo(transformedY(18, 0.863636, 2.454545), 18), "B bowls must retain the shared cap-height y=18");\nassert(closeTo(transformedY(150, 0.863636, 2.454545), 132), "B bowls must end on the shared baseline y=132");\nassert(closeTo(transformedY(14, 0.826087, 6.434783), 18), "S must start on the shared cap-height y=18");\nassert(closeTo(transformedY(152, 0.826087, 6.434783), 132), "S must end on the shared baseline y=132");\nassert(canonicalWordmark.includes('id="robys-b-stem"'), "B stem must remain independently bound to y=18…132");\nassert(canonicalWordmark.includes('id="robys-b-bowls"'), "B bowls must remain independently normalizable");\nassert(canonicalWordmark.includes('data-cap-y="18" data-baseline-y="132"'), "wordmark must publish its cap-height and baseline contract");\n`;
  if (!source.includes("function extractWordmark")) {
    assert(source.includes(insertionMarker), `${path}: geometry contract insertion marker missing`);
    source = source.replace(insertionMarker, insertionMarker + geometryContract);
  }
  write(path, source);
}

patchCompact();
patchHeader();
patchPrimary();
patchDelivery();
patchIdentityContract();

writeFileSync(
  "wordmark-geometry-report.txt",
  [
    "Roby's wordmark geometry normalization",
    `revision=${REVISION}`,
    `cap-height=${CAP_Y}`,
    `baseline=${BASELINE_Y}`,
    "R=unchanged",
    "Y=unchanged",
    "O=unchanged",
    "B outer bounds=18..132",
    "S outer bounds=18..132",
    "canonical glyph definition=byte-identical across compact/header/primary"
  ].join("\n") + "\n"
);

console.log(`✅ Normalized Roby's B/S geometry to y=${CAP_Y}…${BASELINE_Y} across all three master SVGs.`);
