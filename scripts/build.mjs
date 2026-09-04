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
  outfile: "smart-choice/app-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/cart.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/cart-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/experiments.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/experiments-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/analytics.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/analytics-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/decision-trace.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/decision-trace-v2.js",
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
transpileClassicScript("src/social-offer.ts", "social-offer.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v2.js");
transpileClassicScript("src/discover-rotation.ts", "discover-rotation-v3.js");

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
  cssRevision
) {
  const versionPattern = /const CACHE_VERSION = "(robys-offline-[^"]+?)(?:-[a-f0-9]{12}){2,3}";/;
  const versionMatch = serviceWorker.match(versionPattern);
  const discoverRuntimeAssetPattern = /"\.\/discover-v2\.js(?:\?v=[a-f0-9]{12})?"/;
  const posterScriptAssetPattern = /"\.\/discover-rotation-v3\.js(?:\?v=[a-f0-9]{12})?"/;
  const cssAssetPattern = /"\.\/discover-rotation\.css(?:\?v=[a-f0-9]{12})?"/;

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

  const cacheVersionPrefix = versionMatch[1];
  return serviceWorker
    .replace(
      versionPattern,
      `const CACHE_VERSION = "${cacheVersionPrefix}-${discoverRuntimeRevision}-${posterScriptRevision}-${cssRevision}";`
    )
    .replace(discoverRuntimeAssetPattern, `"./discover-v2.js?v=${discoverRuntimeRevision}"`)
    .replace(posterScriptAssetPattern, `"./discover-rotation-v3.js?v=${posterScriptRevision}"`)
    .replace(cssAssetPattern, `"./discover-rotation.css?v=${cssRevision}"`);
}

function synchronizeServiceWorkerAsset(serviceWorker, filePath, revision) {
  const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`"\\./${escapedPath}(?:\\?v=[a-f0-9]{12})?"`);
  if (!pattern.test(serviceWorker)) {
    throw new Error(`Service worker does not contain the revisioned ${filePath} cache entry`);
  }
  return serviceWorker.replace(pattern, `"./${filePath}?v=${revision}"`);
}

const appRevision = revisionFor("app.js");
const galleryRevision = revisionFor("featured-gallery.js");
const socialOfferRevision = revisionFor("social-offer.js");
const discoverRuntimeRevision = revisionFor("discover-v2.js");
const discoverRotationRevision = revisionFor("discover-rotation-v3.js");
const discoverRotationCssRevision = revisionFor("discover-rotation.css");
const smartChoiceAppRevision = revisionFor("smart-choice/app-v2.js");
const smartChoiceCartRevision = revisionFor("smart-choice/cart-v2.js");
const smartChoiceExperimentsRevision = revisionFor("smart-choice/experiments-v2.js");
const smartChoiceAnalyticsRevision = revisionFor("smart-choice/analytics-v2.js");
const smartChoiceDecisionTraceRevision = revisionFor("smart-choice/decision-trace-v2.js");
const smartChoiceReleaseQaRevision = revisionFor("smart-choice/release-qa.js");
const smartChoiceCssRevision = revisionFor("smart-choice/style.css");
const smartChoiceCartCssRevision = revisionFor("smart-choice/cart.css");
const smartChoiceDecisionTraceCssRevision = revisionFor("smart-choice/decision-trace.css");
const smartChoiceReleaseQaCssRevision = revisionFor("smart-choice/release-qa.css");

let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
writeFileSync("index.html", html);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeModuleScript(discoverHtml, "discover-v2.js", discoverRuntimeRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision);
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let smartChoiceHtml = readFileSync("smart-choice/index.html", "utf8");
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "release-qa.js", smartChoiceReleaseQaRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "app-v2.js", smartChoiceAppRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "cart-v2.js", smartChoiceCartRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "experiments-v2.js", smartChoiceExperimentsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "analytics-v2.js", smartChoiceAnalyticsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "decision-trace-v2.js", smartChoiceDecisionTraceRevision);
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
  discoverRotationCssRevision
);
for (const [filePath, revision] of [
  ["smart-choice/release-qa.js", smartChoiceReleaseQaRevision],
  ["smart-choice/app-v2.js", smartChoiceAppRevision],
  ["smart-choice/cart-v2.js", smartChoiceCartRevision],
  ["smart-choice/experiments-v2.js", smartChoiceExperimentsRevision],
  ["smart-choice/analytics-v2.js", smartChoiceAnalyticsRevision],
  ["smart-choice/decision-trace-v2.js", smartChoiceDecisionTraceRevision],
  ["smart-choice/style.css", smartChoiceCssRevision],
  ["smart-choice/cart.css", smartChoiceCartCssRevision],
  ["smart-choice/decision-trace.css", smartChoiceDecisionTraceCssRevision],
  ["smart-choice/release-qa.css", smartChoiceReleaseQaCssRevision]
]) {
  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);
}
writeFileSync("sw.js", serviceWorker);

console.log(
  `Built app.js (${appRevision}), Smart Choice app-v2.js (${smartChoiceAppRevision}), ` +
  `Smart Choice cart-v2.js (${smartChoiceCartRevision}), Smart Choice experiments-v2.js (${smartChoiceExperimentsRevision}), ` +
  `Smart Choice analytics-v2.js (${smartChoiceAnalyticsRevision}), Smart Choice decision-trace-v2.js (${smartChoiceDecisionTraceRevision}), ` +
  `Smart Choice release-qa.js (${smartChoiceReleaseQaRevision}), featured-gallery.js (${galleryRevision}), ` +
  `social-offer.js (${socialOfferRevision}), discover-v2.js (${discoverRuntimeRevision}), ` +
  `discover-rotation-v3.js (${discoverRotationRevision}), Smart Choice style.css (${smartChoiceCssRevision}), ` +
  `Smart Choice cart.css (${smartChoiceCartCssRevision}), Smart Choice decision-trace.css (${smartChoiceDecisionTraceCssRevision}), ` +
  `and Smart Choice release-qa.css (${smartChoiceReleaseQaCssRevision}) with synchronized cache keys.`
);
