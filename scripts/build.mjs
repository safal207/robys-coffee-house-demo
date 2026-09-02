import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import ts from "typescript";

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "app.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/page.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/app-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/cart.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/cart-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/experiments.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/experiments-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/analytics.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/analytics-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/decision-trace.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/decision-trace-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/release-qa.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/release-qa.js",
  legalComments: "none"
});

await build({
  entryPoints: ["menu-runtime-entry.js"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "menu-runtime.js",
  legalComments: "none"
});

await build({
  entryPoints: ["discover-runtime-entry.js"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "discover-runtime.js",
  legalComments: "none"
});

function transpileClassicScript(sourcePath, outputPath) {
  const source = readFileSync(sourcePath, "utf8");
  const bundle = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: true,
      removeComments: false
    }
  }).outputText;
  writeFileSync(outputPath, bundle);
}

transpileClassicScript("src/featured-gallery.ts", "featured-gallery.js");
transpileClassicScript("src/social-offer.ts", "home-menu-entry.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v2.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v3.js");

const menuRuntimeCss = `${readFileSync("menu.css", "utf8").trimEnd()}\n${readFileSync("pairing-posters.css", "utf8").trimEnd()}\n`;
writeFileSync("menu-runtime.css", menuRuntimeCss);

function revisionFor(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
}

function locateScript(html, fileName) {
  const start = html.indexOf(`src="${fileName}`);
  if (start < 0) throw new Error(`HTML does not load ${fileName}`);
  const open = html.lastIndexOf("<" + "script", start);
  const close = html.indexOf("</" + "script>", start);
  if (open < 0 || close < 0) throw new Error(`Cannot locate ${fileName} script element`);
  return { open, close };
}

function synchronizeScript(html, fileName, revision) {
  const { open, close } = locateScript(html, fileName);
  const tag = "<" + `script defer src="${fileName}?v=${revision}">` + "</" + "script>";
  return html.slice(0, open) + tag + html.slice(close + 9);
}

function synchronizeModuleScript(html, fileName, revision) {
  const pattern = new RegExp(`src="${fileName.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`HTML does not load ${fileName}`);
  return html.replace(pattern, `src="${fileName}?v=${revision}"`);
}

function synchronizeStylesheet(html, fileName, revision) {
  const pattern = new RegExp(`href="${fileName.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`HTML does not load ${fileName}`);
  return html.replace(pattern, `href="${fileName}?v=${revision}"`);
}

function synchronizeServiceWorker(
  serviceWorker,
  discoverRuntimeRevision,
  posterScriptRevision,
  cssRevision,
  menuRuntimeRevision,
  menuRuntimeCssRevision,
  homeMenuEntryRevision,
  homeMenuEntryCssRevision,
  socialOfferCssRevision,
  smartChoiceAppRevision,
  smartChoiceCartRevision,
  smartChoiceExperimentsRevision,
  smartChoiceAnalyticsRevision,
  smartChoiceDecisionTraceRevision,
  smartChoiceSimulatorRevision
) {
  const versionPattern = /const CACHE_VERSION = "(robys-offline-[^"]+?)(?:-[a-f0-9]{12}){2,15}";/;
  const versionMatch = serviceWorker.match(versionPattern);
  const discoverRuntimeAssetPattern = /"\.\/discover-runtime\.js(?:\?v=[a-f0-9]{12})?"/;
  const posterScriptAssetPattern = /"\.\/discover-rotation-v3\.js(?:\?v=[a-f0-9]{12})?"/;
  const cssAssetPattern = /"\.\/discover-rotation\.css(?:\?v=[a-f0-9]{12})?"/;
  const menuRuntimeAssetPattern = /"\.\/menu-runtime\.js(?:\?v=[a-f0-9]{12})?"/;
  const menuRuntimeCssAssetPattern = /"\.\/menu-runtime\.css(?:\?v=[a-f0-9]{12})?"/;
  const homeMenuEntryAssetPattern = /"\.\/home-menu-entry\.js(?:\?v=[a-f0-9]{12})?"/;
  const homeMenuEntryCssAssetPattern = /"\.\/home-menu-entry\.css(?:\?v=[a-f0-9]{12})?"/;
  const socialOfferCssAssetPattern = /"\.\/social-offer\.css(?:\?v=[a-f0-9]{12})?"/;

  if (!versionMatch) {
    throw new Error("Service worker does not contain a revisioned Roby's cache version marker");
  }
  if (!discoverRuntimeAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the Discover runtime cache entry");
  }
  if (!posterScriptAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the v3 renderer cache entry");
  }
  if (!cssAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the poster stylesheet cache entry");
  }
  if (!menuRuntimeAssetPattern.test(serviceWorker) || !menuRuntimeCssAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the first-load-safe menu runtime cache entries");
  }
  if (!homeMenuEntryAssetPattern.test(serviceWorker) || !homeMenuEntryCssAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the first-load-safe home menu cache entries");
  }
  if (!socialOfferCssAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the social offer stylesheet cache entry");
  }
  const smartChoiceRuntimePaths = [
    "/smart-choice/app-runtime.js",
    "/smart-choice/cart-runtime.js",
    "/smart-choice/experiments-runtime.js",
    "/smart-choice/analytics-runtime.js",
    "/smart-choice/decision-trace-runtime.js",
    "/smart-choice/simulator-runtime.js"
  ];
  if (!smartChoiceRuntimePaths.every((runtimePath) => serviceWorker.includes(`url.pathname.endsWith("${runtimePath}")`))) {
    throw new Error("Service worker does not require exact revisions for every Smart Choice runtime");
  }

  const cacheVersionPrefix = versionMatch[1];
  return serviceWorker
    .replace(
      versionPattern,
      `const CACHE_VERSION = "${cacheVersionPrefix}-${discoverRuntimeRevision}-${posterScriptRevision}-${cssRevision}-${menuRuntimeRevision}-${menuRuntimeCssRevision}-${homeMenuEntryRevision}-${homeMenuEntryCssRevision}-${socialOfferCssRevision}-${smartChoiceAppRevision}-${smartChoiceCartRevision}-${smartChoiceExperimentsRevision}-${smartChoiceAnalyticsRevision}-${smartChoiceDecisionTraceRevision}-${smartChoiceSimulatorRevision}";`
    )
    .replace(discoverRuntimeAssetPattern, `"./discover-runtime.js?v=${discoverRuntimeRevision}"`)
    .replace(posterScriptAssetPattern, `"./discover-rotation-v3.js?v=${posterScriptRevision}"`)
    .replace(cssAssetPattern, `"./discover-rotation.css?v=${cssRevision}"`)
    .replace(menuRuntimeAssetPattern, `"./menu-runtime.js?v=${menuRuntimeRevision}"`)
    .replace(menuRuntimeCssAssetPattern, `"./menu-runtime.css?v=${menuRuntimeCssRevision}"`)
    .replace(homeMenuEntryAssetPattern, `"./home-menu-entry.js?v=${homeMenuEntryRevision}"`)
    .replace(homeMenuEntryCssAssetPattern, `"./home-menu-entry.css?v=${homeMenuEntryCssRevision}"`)
    .replace(socialOfferCssAssetPattern, `"./social-offer.css?v=${socialOfferCssRevision}"`);
}

const appRevision = revisionFor("app.js");
const galleryRevision = revisionFor("featured-gallery.js");
const homeMenuEntryRevision = revisionFor("home-menu-entry.js");
const homeMenuEntryCssRevision = revisionFor("home-menu-entry.css");
const socialOfferCssRevision = revisionFor("social-offer.css");
const menuRuntimeRevision = revisionFor("menu-runtime.js");
const menuRuntimeCssRevision = revisionFor("menu-runtime.css");
const discoverRuntimeRevision = revisionFor("discover-runtime.js");
const discoverRotationRevision = revisionFor("discover-rotation-v3.js");
const discoverRotationCssRevision = revisionFor("discover-rotation.css");
const smartChoiceAppRevision = revisionFor("smart-choice/app-runtime.js");
const smartChoiceCartRevision = revisionFor("smart-choice/cart-runtime.js");
const smartChoiceExperimentsRevision = revisionFor("smart-choice/experiments-runtime.js");
const smartChoiceAnalyticsRevision = revisionFor("smart-choice/analytics-runtime.js");
const smartChoiceDecisionTraceRevision = revisionFor("smart-choice/decision-trace-runtime.js");
const smartChoiceSimulatorRevision = revisionFor("smart-choice/simulator-runtime.js");
const smartChoiceReleaseQaRevision = revisionFor("smart-choice/release-qa.js");
const smartChoiceCssRevision = revisionFor("smart-choice/style.css");
const smartChoiceCartCssRevision = revisionFor("smart-choice/cart.css");
const smartChoiceDecisionTraceCssRevision = revisionFor("smart-choice/decision-trace.css");
const smartChoiceReleaseQaCssRevision = revisionFor("smart-choice/release-qa.css");

let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "home-menu-entry.js", homeMenuEntryRevision);
html = synchronizeStylesheet(html, "home-menu-entry.css", homeMenuEntryCssRevision);
html = synchronizeStylesheet(html, "social-offer.css", socialOfferCssRevision);
writeFileSync("index.html", html);

let menuHtml = readFileSync("menu.html", "utf8");
menuHtml = synchronizeModuleScript(menuHtml, "menu-runtime.js", menuRuntimeRevision);
menuHtml = synchronizeStylesheet(menuHtml, "menu-runtime.css", menuRuntimeCssRevision);
writeFileSync("menu.html", menuHtml);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeModuleScript(discoverHtml, "discover-runtime.js", discoverRuntimeRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision);
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let smartChoiceHtml = readFileSync("smart-choice/index.html", "utf8");
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "release-qa.js", smartChoiceReleaseQaRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "app-runtime.js", smartChoiceAppRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "cart-runtime.js", smartChoiceCartRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "experiments-runtime.js", smartChoiceExperimentsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "analytics-runtime.js", smartChoiceAnalyticsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "decision-trace-runtime.js", smartChoiceDecisionTraceRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "style.css", smartChoiceCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "cart.css", smartChoiceCartCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "decision-trace.css", smartChoiceDecisionTraceCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "release-qa.css", smartChoiceReleaseQaCssRevision);
writeFileSync("smart-choice/index.html", smartChoiceHtml);

let serviceWorker = readFileSync("sw.js", "utf8");
serviceWorker = synchronizeServiceWorker(
  serviceWorker,
  discoverRuntimeRevision,
  discoverRotationRevision,
  discoverRotationCssRevision,
  menuRuntimeRevision,
  menuRuntimeCssRevision,
  homeMenuEntryRevision,
  homeMenuEntryCssRevision,
  socialOfferCssRevision,
  smartChoiceAppRevision,
  smartChoiceCartRevision,
  smartChoiceExperimentsRevision,
  smartChoiceAnalyticsRevision,
  smartChoiceDecisionTraceRevision,
  smartChoiceSimulatorRevision
);
writeFileSync("sw.js", serviceWorker);

console.log(
  `Built app.js (${appRevision}), Smart Choice app-runtime.js (${smartChoiceAppRevision}), ` +
  `Smart Choice cart-runtime.js (${smartChoiceCartRevision}), Smart Choice experiments-runtime.js (${smartChoiceExperimentsRevision}), ` +
  `Smart Choice analytics-runtime.js (${smartChoiceAnalyticsRevision}), Smart Choice decision-trace-runtime.js (${smartChoiceDecisionTraceRevision}), ` +
  `Smart Choice release-qa.js (${smartChoiceReleaseQaRevision}), featured-gallery.js (${galleryRevision}), ` +
  `home-menu-entry.js (${homeMenuEntryRevision}), ` +
  `menu-runtime.js (${menuRuntimeRevision}), menu-runtime.css (${menuRuntimeCssRevision}), ` +
  `home-menu-entry.css (${homeMenuEntryCssRevision}), social-offer.css (${socialOfferCssRevision}), discover-runtime.js (${discoverRuntimeRevision}), ` +
  `discover-rotation-v3.js (${discoverRotationRevision}), Smart Choice style.css (${smartChoiceCssRevision}), ` +
  `Smart Choice cart.css (${smartChoiceCartCssRevision}), Smart Choice decision-trace.css (${smartChoiceDecisionTraceCssRevision}), ` +
  `and Smart Choice release-qa.css (${smartChoiceReleaseQaCssRevision}) with synchronized cache keys.`
);
