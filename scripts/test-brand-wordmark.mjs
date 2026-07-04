#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const root = resolve(dirname(modulePath), "..");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssRule(css, selector) {
  const match = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`));
  assert(match, `Missing CSS rule: ${selector}`);
  return match[1].replace(/\s+/g, "");
}

function atRuleBlock(css, prelude) {
  const start = css.indexOf(prelude);
  assert.notEqual(start, -1, `Missing at-rule: ${prelude}`);
  const open = css.indexOf("{", start + prelude.length);
  assert.notEqual(open, -1, `Missing opening brace for ${prelude}`);

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }

  assert.fail(`Missing closing brace for ${prelude}`);
}

export function verifyBrandWordmark() {
  const styles = readFileSync(resolve(root, "styles.css"), "utf8");
  const menuStyles = readFileSync(resolve(root, "menu.css"), "utf8");
  const responsiveStyles = readFileSync(resolve(root, "wordmark-responsive.css"), "utf8");
  const discoverGuard = readFileSync(resolve(root, "discover-weather-guard.js"), "utf8");
  const index = readFileSync(resolve(root, "index.html"), "utf8");
  const menu = readFileSync(resolve(root, "menu.html"), "utf8");

  assert.match(index, /<span class="brand-mark">R<\/span><span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small><\/span>/);
  assert.match(menu, /<span class="brand-mark">R<\/span>\s*<span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small><\/span>/);

  assert.equal(cssRule(styles, ".brand-mark"), "display:none!important");
  assert.match(cssRule(styles, ".brand-copy strong"), /(?:^|;)border:8pxsolid#d32636(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy strong::before"), /(?:^|;)content:"R";content:"R"\/""(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy strong::after"), /(?:^|;)content:"BY'S";content:"BY'S"\/""(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy small"), /(?:^|;)display:block!important(?:;|$)/);

  const compactMedia = atRuleBlock(styles, "@media(max-width:390px)");
  assert.match(cssRule(compactMedia, ".brand-copy"), /(?:^|;)display:flex!important(?:;|$)/);
  assert.match(cssRule(compactMedia, ".brand-copy"), /(?:^|;)width:118px(?:;|$)/);

  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)width:54px(?:;|$)/);
  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)height:54px(?:;|$)/);
  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)border:12pxsolid#d32636(?:;|$)/);

  assert.match(
    discoverGuard.replace(/\s+/g, " "),
    /const wordmarkStylesheet = document\.createElement\("link"\); wordmarkStylesheet\.rel = "stylesheet"; wordmarkStylesheet\.href = "wordmark-responsive\.css\?v=20260704-1"; document\.head\.appendChild\(wordmarkStylesheet\);/
  );

  const subtitleMedia = atRuleBlock(responsiveStyles, "@media(max-width:680px)");
  assert.equal(cssRule(subtitleMedia, ".discover-header .brand-copy small"), "display:none!important");

  const hiddenMedia = atRuleBlock(responsiveStyles, "@media(max-width:340px)");
  assert.equal(cssRule(hiddenMedia, ".discover-header .brand-copy"), "display:none!important");

  console.log("PASS: compact Roby's wordmark contract");
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  verifyBrandWordmark();
}
