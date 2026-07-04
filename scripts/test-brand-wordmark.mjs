#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const styles = readFileSync(resolve(root, "styles.css"), "utf8");
const menuStyles = readFileSync(resolve(root, "menu.css"), "utf8");
const index = readFileSync(resolve(root, "index.html"), "utf8");
const menu = readFileSync(resolve(root, "menu.html"), "utf8");

assert.match(index, /class="brand-mark">R<\/span><span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small>/);
assert.match(menu, /class="brand-mark">R<\/span>\s*<span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small>/);
assert.match(styles, /\.brand-mark\{display:none!important\}/);
assert.match(styles, /\.brand-copy strong::before\{[^}]*content:"R";content:"R" \/ ""/);
assert.match(styles, /\.brand-copy strong::after\{[^}]*content:"BY'S";content:"BY'S" \/ ""/);
assert.match(styles, /border:8px solid #d32636/);
assert.match(styles, /\.brand-copy small\{display:block!important/);
assert.match(styles, /@media\(max-width:390px\)[\s\S]*\.brand-copy\{display:flex!important/);
assert.match(menuStyles, /\.menu-page-mark::before\{content:"";display:block;width:54px;height:54px;border:12px solid #d32636/);

console.log("PASS: compact Roby's wordmark contract");
