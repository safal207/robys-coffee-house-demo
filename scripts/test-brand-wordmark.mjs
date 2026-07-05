#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const modulePath = fileURLToPath(import.meta.url);
const root = resolve(dirname(modulePath), "..");

function cssRule(css, selector) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const matchingRules = rules.filter(([, selectorList]) =>
    selectorList.split(",").map((candidate) => candidate.trim()).includes(selector)
  );
  const exactRule = matchingRules.find(([, selectorList]) => selectorList.trim() === selector) ?? matchingRules[0];
  assert(exactRule, `Missing CSS rule: ${selector}`);
  return exactRule[2].replace(/\s+/g, "");
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

function verifyDiscoverWordmarkStylesheet(discoverGuard) {
  const appended = [];
  const document = {
    getElementById(id) {
      return appended.find((element) => element.id === id) ?? null;
    },
    createElement(tagName) {
      assert.equal(tagName, "link");
      return {};
    },
    head: {
      appendChild(element) {
        appended.push(element);
      }
    }
  };

  const execute = () => runInNewContext(`(() => {\n${discoverGuard}\n})()`, { document });
  execute();
  execute();

  assert.equal(appended.length, 1, "wordmark stylesheet injection must be idempotent");
  assert.equal(appended[0].id, "robys-wordmark-responsive");
  assert.equal(appended[0].rel, "stylesheet");
  assert.equal(appended[0].href, "wordmark-responsive.css?v=20260704-1");
}

function verifyOfflineWordmarkDelivery(serviceWorker) {
  assert.match(
    serviceWorker,
    /const CACHE_VERSION = "robys-offline-[^"]+?(?:-[a-f0-9]{12}){3}";/,
    "service-worker cache marker must remain compatible with canonical build revisioning"
  );
  assert.match(
    serviceWorker,
    /"\.\/wordmark-responsive\.css\?v=20260704-1"/,
    "wordmark stylesheet must be precached with its exact revision"
  );
  assert.match(
    serviceWorker,
    /url\.pathname\.endsWith\("\/wordmark-responsive\.css"\)/,
    "wordmark stylesheet must use exact-revision cache matching"
  );
}

export function verifyBrandWordmark() {
  const styles = readFileSync(resolve(root, "styles.css"), "utf8");
  const finalQa = readFileSync(resolve(root, "final-qa.css"), "utf8");
  const menuStyles = readFileSync(resolve(root, "menu.css"), "utf8");
  const responsiveStyles = readFileSync(resolve(root, "wordmark-responsive.css"), "utf8");
  const discoverGuard = readFileSync(resolve(root, "discover-weather-guard.js"), "utf8");
  const serviceWorker = readFileSync(resolve(root, "sw.js"), "utf8");
  const index = readFileSync(resolve(root, "index.html"), "utf8");
  const menu = readFileSync(resolve(root, "menu.html"), "utf8");

  assert.match(index, /<span class="brand-mark">R<\/span><span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small><\/span>/);
  assert.match(menu, /<span class="brand-mark">R<\/span>\s*<span class="brand-copy"><strong>ROBY'S<\/strong><small>COFFEE HOUSE<\/small><\/span>/);

  assert.equal(cssRule(styles, ".brand-mark"), "display:none!important");
  assert.match(cssRule(styles, ".brand-copy strong"), /(?:^|;)border:8pxsolid#d32636(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy strong::before"), /(?:^|;)content:"R";content:"R"\/""(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy strong::after"), /(?:^|;)content:"BY'S";content:"BY'S"\/""(?:;|$)/);
  assert.match(cssRule(styles, ".brand-copy small"), /(?:^|;)display:block!important(?:;|$)/);

  const desktopLockup = cssRule(finalQa, ".site-header .brand-copy");
  assert.match(desktopLockup, /(?:^|;)width:132px(?:;|$)/);
  assert.match(desktopLockup, /(?:^|;)align-items:flex-start(?:;|$)/);
  assert.equal(cssRule(finalQa, ".site-header .brand-copy strong"), "margin-right:0;margin-left:25px");
  const desktopSubtitle = cssRule(finalQa, ".site-header .brand-copy small");
  assert.match(desktopSubtitle, /(?:^|;)margin-top:4px!important(?:;|$)/);
  assert.match(desktopSubtitle, /(?:^|;)letter-spacing:.20em!important(?:;|$)/);
  assert.match(desktopSubtitle, /(?:^|;)text-indent:.20em(?:;|$)/);

  const mobileLockup = atRuleBlock(finalQa, "@media(max-width:680px)");
  assert.match(cssRule(mobileLockup, ".site-header .brand-copy"), /(?:^|;)width:106px(?:;|$)/);
  assert.equal(cssRule(mobileLockup, ".site-header .brand-copy strong"), "margin-left:22px");

  const compactLockup = atRuleBlock(finalQa, "@media(max-width:390px)");
  assert.match(cssRule(compactLockup, ".site-header .brand-copy"), /(?:^|;)width:90px(?:;|$)/);
  assert.equal(cssRule(compactLockup, ".site-header .brand-copy strong"), "margin-left:19px");
  assert.match(cssRule(compactLockup, ".site-header .brand-copy small"), /(?:^|;)letter-spacing:.11em!important(?:;|$)/);

  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)width:54px(?:;|$)/);
  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)height:54px(?:;|$)/);
  assert.match(cssRule(menuStyles, ".menu-page-mark::before"), /(?:^|;)border:12pxsolid#d32636(?:;|$)/);

  verifyDiscoverWordmarkStylesheet(discoverGuard);
  verifyOfflineWordmarkDelivery(serviceWorker);

  const subtitleMedia = atRuleBlock(responsiveStyles, "@media(max-width:680px)");
  assert.equal(cssRule(subtitleMedia, ".discover-header .brand-copy small"), "display:none!important");

  const hiddenMedia = atRuleBlock(responsiveStyles, "@media(max-width:340px)");
  assert.equal(cssRule(hiddenMedia, ".discover-header .brand-copy"), "display:none!important");

  console.log("PASS: compact Roby's wordmark contract");
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  verifyBrandWordmark();
}
