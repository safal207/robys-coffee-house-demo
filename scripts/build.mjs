import { orderCatalogPlugin, orderCatalogURL } from "./order-catalog-boundary.mjs";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build, transformSync } from "esbuild";
import ts from "typescript";
import { compileMenuRuntime } from "./menu-runtime-source.mjs";

await build({entryPoints: ["src/order-store.ts"], bundle: true, minify: true, charset: "utf8", format: "esm", target: "es2020", outfile: "order-store.js", legalComments: "none", plugins: [orderCatalogPlugin()] });
const orderRevision = createHash("sha256").update(readFileSync("order-store.js")).digest("hex").slice(0,12);
const orderPlugin = { name: "shared-order-runtime", setup(builder) {
  builder.onResolve({filter: /^@robys\/order$/}, () => ({path: `${builder.initialOptions.outfile.startsWith("smart-choice/") ? "../" : "./"}order-store.js?v=${orderRevision}`, external: true}));
}};
await build({entryPoints: ["src/order-shell.ts"], bundle: true, minify: true, charset: "utf8", format: "esm", target: "es2020", outfile: "order-shell.js", legalComments: "none", plugins:[orderPlugin]});
writeFileSync("menu-app.js", compileMenuRuntime());

await build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "iife",
  target: "es2020",
  outfile: "app.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/page.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/app-v2.js",
  plugins: [orderPlugin],
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/cart.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/cart-v2.js",
  plugins: [orderPlugin],
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/experiments.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/experiments-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/analytics.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/analytics-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/decision-trace.ts"],
  bundle: true,
  minify: true, charset: "utf8",
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/decision-trace-v2.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/release-qa.ts"],
  bundle: true,
  minify: true, charset: "utf8",
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
  // Keep stable public identifiers while avoiding shipping development whitespace.
  // No bundling, execution-order changes or business-logic substitutions.
  const compact = transformSync(bundle, {
    target: "es2020", minifyWhitespace: true, charset: "utf8", minifySyntax: true,
    minifyIdentifiers: false, legalComments: "none"
  }).code;
  writeFileSync(outputPath, sourcePath === "src/discover-rotation.ts" ? bundle : compact);
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

function synchronizeBlockingScript(html, fileName, revision) {
  const { open, close } = locateScript(html, fileName);
  const tag = "<" + `script src="${fileName}?v=${revision}">` + "</" + "script>";
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

function synchronizeModuleImport(source, fileName, revision) {
  const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`import\\("\\./${escapedName}(?:\\?v=[^"]*)?"\\)`);
  if (!pattern.test(source)) throw new Error(`Runtime does not import ${fileName}`);
  return source.replace(pattern, `import("./${fileName}?v=${revision}")`);
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
  const pattern = new RegExp(`"\\./${escapedPath}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(serviceWorker)) {
    throw new Error(`Service worker does not contain the revisioned ${filePath} cache entry`);
  }
  return serviceWorker.replace(pattern, `"./${filePath}?v=${revision}"`);
}

const morningEntryRevision = revisionFor("morning-entry-v2.js");
let bootstrapSource = readFileSync("bootstrap-v2.js", "utf8");
bootstrapSource = synchronizeModuleImport(bootstrapSource, "morning-entry-v2.js", morningEntryRevision);
writeFileSync("bootstrap-v2.js", bootstrapSource);

const appRevision = revisionFor("app.js");
const bootstrapRevision = revisionFor("bootstrap-v2.js");
const baseStylesRevision = revisionFor("styles-v2.css");
const menuSecurityRevision = revisionFor("menu-security-v2.css");
const menuPremiumRevision = revisionFor("menu-premium.css");
const menuAppRevision = revisionFor("menu-app.js");
const androidStylesRevision = revisionFor("android-app.css");
let conversionSource = readFileSync("src/conversion.js", "utf8");
const androidStylePattern = /android-app\.css\?v=[^"']+/;
if (!androidStylePattern.test(conversionSource)) throw new Error("Missing Android stylesheet loader");
conversionSource = conversionSource.replace(androidStylePattern, `android-app.css?v=${androidStylesRevision}`);
writeFileSync("conversion.js", transformSync(conversionSource, {
  minify: true, charset: "utf8", format: "esm", target: "es2020", legalComments: "none"
}).code);
const conversionRevision = revisionFor("conversion.js");
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
html = synchronizeBlockingScript(html, "bootstrap-v2.js", bootstrapRevision);
html = synchronizeStylesheet(html, "styles-v2.css", baseStylesRevision);
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
html = synchronizeModuleScript(html, "conversion.js", conversionRevision);
writeFileSync("index.html", html);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeBlockingScript(discoverHtml, "bootstrap-v2.js", bootstrapRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "styles-v2.css", baseStylesRevision);
discoverHtml = synchronizeModuleScript(discoverHtml, "discover-v2.js", discoverRuntimeRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision);
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let menuHtml = readFileSync("menu.html", "utf8");
menuHtml = synchronizeBlockingScript(menuHtml, "bootstrap-v2.js", bootstrapRevision);
menuHtml = synchronizeStylesheet(menuHtml, "styles-v2.css", baseStylesRevision);
menuHtml = synchronizeStylesheet(menuHtml, "menu-security-v2.css", menuSecurityRevision);
menuHtml = synchronizeStylesheet(menuHtml, "menu-premium.css", menuPremiumRevision);
menuHtml = synchronizeModuleScript(menuHtml, "menu-app.js", menuAppRevision);
writeFileSync("menu.html", menuHtml);

let russianLandingHtml = readFileSync("ru/coffee-gazipasa.html", "utf8");
russianLandingHtml = synchronizeStylesheet(russianLandingHtml, "../styles-v2.css", baseStylesRevision);
writeFileSync("ru/coffee-gazipasa.html", russianLandingHtml);

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
  ["bootstrap-v2.js", bootstrapRevision],
  ["morning-entry-v2.js", morningEntryRevision],
  ["styles-v2.css", baseStylesRevision],
  ["menu-security-v2.css", menuSecurityRevision],
  ["menu-premium.css", menuPremiumRevision],
  ["menu-app.js", menuAppRevision],
  ["conversion.js", conversionRevision],
  ["android-app.css", androidStylesRevision],
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
serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, "menu-catalog.js", orderCatalogURL().split("?v=")[1]);
const orderShellRevision = revisionFor("order-shell.js");
const orderShellCssRevision = revisionFor("order-shell.css");
const launcher = readFileSync("src/order-launcher.ts", "utf8").replace("order-shell.js?v=000000000000", `order-shell.js?v=${orderShellRevision}`);
// Bundle the small dock helper into the lazy launcher, never the order store.
const launcherBuild = await build({
  stdin: { contents: launcher, resolveDir: process.cwd() + "/src", sourcefile: "order-launcher.ts", loader: "ts" },
  bundle: true, write: false, minify: true, charset: "utf8", format: "esm", target: "es2020", legalComments: "none",
  external: ["./order-shell.js?*"]
});
writeFileSync("order-launcher.js", launcherBuild.outputFiles[0].text);
const orderLauncherRevision = revisionFor("order-launcher.js");
for (const pagePath of ["index.html", "menu.html", "discover.html", "smart-choice/index.html"]) {
  const prefix = pagePath.startsWith("smart-choice/") ? "../" : "";
  let page = readFileSync(pagePath, "utf8");
  const launcherOnly = pagePath === "index.html" || pagePath === "discover.html";
  page = synchronizeModuleScript(page, `${prefix}${launcherOnly ? "order-launcher.js" : "order-shell.js"}`, launcherOnly ? orderLauncherRevision : orderShellRevision);
  if (pagePath.startsWith("smart-choice/")) page = synchronizeStylesheet(page, "../order-store.js", orderRevision);
  page = synchronizeStylesheet(page, `${prefix}order-shell.css`, orderShellCssRevision);
  writeFileSync(pagePath, page);
}
for (const [filePath, revision] of [["order-launcher.js", orderLauncherRevision], ["order-store.js", orderRevision], ["order-shell.js", orderShellRevision], ["order-shell.css", orderShellCssRevision]]) {
  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);
}
writeFileSync("sw.js", serviceWorker);

console.log(
  `Built app.js (${appRevision}), bootstrap-v2.js (${bootstrapRevision}), morning-entry-v2.js (${morningEntryRevision}), styles-v2.css (${baseStylesRevision}), ` +
  `menu-security-v2.css (${menuSecurityRevision}), ` +
  `Smart Choice app-v2.js (${smartChoiceAppRevision}), ` +
  `Smart Choice cart-v2.js (${smartChoiceCartRevision}), Smart Choice experiments-v2.js (${smartChoiceExperimentsRevision}), ` +
  `Smart Choice analytics-v2.js (${smartChoiceAnalyticsRevision}), Smart Choice decision-trace-v2.js (${smartChoiceDecisionTraceRevision}), ` +
  `Smart Choice release-qa.js (${smartChoiceReleaseQaRevision}), featured-gallery.js (${galleryRevision}), ` +
  `social-offer.js (${socialOfferRevision}), discover-v2.js (${discoverRuntimeRevision}), ` +
  `discover-rotation-v3.js (${discoverRotationRevision}), Smart Choice style.css (${smartChoiceCssRevision}), ` +
  `Smart Choice cart.css (${smartChoiceCartCssRevision}), Smart Choice decision-trace.css (${smartChoiceDecisionTraceCssRevision}), ` +
  `and Smart Choice release-qa.css (${smartChoiceReleaseQaCssRevision}) with synchronized cache keys.`
);
