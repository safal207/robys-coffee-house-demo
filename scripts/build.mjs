import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { build, transformSync } from "esbuild";
import ts from "typescript";
import { compileMenuRuntime, compileMenuOrderRuntime, compileOrderStorageRuntime } from "./menu-runtime-source.mjs";
import { sharedMenuCatalogPlugin, sharedSmartChoiceCatalogPlugin } from "./smart-choice-catalog-external.mjs";
import { sharedPhotoPreviewsPlugin } from "./smart-choice-photos-external.mjs";
import { MENU_STYLESHEET_FILE, MENU_STYLE_INPUTS, compileMenuStylesBundle, verifyMenuStylesBundle, readMenuStylesBundleInputs } from "./menu-styles-bundle.mjs";

await import("./build-counter.mjs");

const menuCatalogRevision = revisionFor("menu-catalog.js");
writeFileSync("menu-feedback.js", compileMenuRuntime(readFileSync("src/menu-feedback.js", "utf8")));
const menuFeedbackRevision = revisionFor("menu-feedback.js");
writeFileSync("menu-feed-viewer.js", compileMenuRuntime(readFileSync("src/menu-feed-viewer.js", "utf8")));
const menuFeedViewerRevision = revisionFor("menu-feed-viewer.js");
let viewerEntry = readFileSync("src/menu-feed-viewer-entry.js", "utf8");
viewerEntry = synchronizeModuleImport(viewerEntry, "menu-feed-viewer.js", menuFeedViewerRevision);
viewerEntry = viewerEntry.replace(/new URL\("\.\/menu-feed-viewer\.js(?:\?v=[^"]*)?", import\.meta\.url\)/,
  `new URL("./menu-feed-viewer.js?v=${menuFeedViewerRevision}", import.meta.url)`);
writeFileSync("src/menu-feed-viewer-entry.js", viewerEntry);
let feedbackEntry = readFileSync("src/menu-feedback-entry.js", "utf8");
feedbackEntry = synchronizeModuleImport(feedbackEntry, "menu-feedback.js", menuFeedbackRevision);
feedbackEntry = feedbackEntry.replace(/new URL\("\.\/menu-feedback\.js(?:\?v=[^"]*)?", import\.meta\.url\)/,
  `new URL("./menu-feedback.js?v=${menuFeedbackRevision}", import.meta.url)`);
writeFileSync("src/menu-feedback-entry.js", feedbackEntry);
for (const file of ["src/menu-app.js", "menu-product-reveal-runtime.js", "discover-v2.js", "discover-deck.js"]) {
  const source = readFileSync(file, "utf8").replace(/(from\s*["']\.\/menu-catalog\.js)(?:\?[^"']*)?(["'])/g, `$1?v=${menuCatalogRevision}$2`);
  writeFileSync(file, source);
}

await build({ entryPoints: ["src/order-checkout.js"], bundle: true, minify: true, charset: "utf8",
  format: "esm", target: "es2020", outfile: "order-checkout.js", legalComments: "none" });
const orderCheckoutRevision = revisionFor("order-checkout.js");
const orderCheckoutCssRevision = revisionFor("order-checkout.css");
let cashierSource = readFileSync("src/cashier.js", "utf8");
cashierSource = cashierSource.replace(/from "\.\/order-checkout\.js(?:\?v=[^"]*)?"/, `from "./order-checkout.js?v=${orderCheckoutRevision}"`);
writeFileSync("src/cashier.js", cashierSource);
await build({ entryPoints: ["src/cashier.js"], bundle: true, minify: true, charset: "utf8",
  external: ["./order-checkout.js*"], format: "esm", target: "es2020", outfile: "cashier.js", legalComments: "none" });
const cashierRevision = revisionFor("cashier.js");
let quickSource = readFileSync("src/smart-choice/checkout-link.ts", "utf8");
quickSource = quickSource.replace(/new URL\("\.\.\/order-checkout\.js(?:\?v=[^"]*)?",/, `new URL("../order-checkout.js?v=${orderCheckoutRevision}",`);
writeFileSync("src/smart-choice/checkout-link.ts", quickSource);

await build({
  entryPoints: ["src/menu-pairing-view.js"], bundle: true, minify: true, charset: "utf8",
  format: "esm", target: "es2020", outfile: "menu-pairing.js", legalComments: "none"
});
const menuPairingRevision = revisionFor("menu-pairing.js");
writeFileSync("order-storage.js", compileOrderStorageRuntime());
const orderStorageRevision = revisionFor("order-storage.js");
writeFileSync("menu-view-mode.js", compileMenuRuntime(readFileSync("src/menu-view-mode.js", "utf8")));
const menuViewModeRevision = revisionFor("menu-view-mode.js");
let menuOrderSource = readFileSync("src/menu-order-ui.js", "utf8");
menuOrderSource = synchronizeModuleImport(menuOrderSource, "order-checkout.js", orderCheckoutRevision);
menuOrderSource = synchronizeModuleImport(menuOrderSource, "menu-pairing.js", menuPairingRevision);
writeFileSync("src/menu-order-ui.js", menuOrderSource);
writeFileSync("menu-order-ui.js", compileMenuOrderRuntime());
const menuOrderRevision = revisionFor("menu-order-ui.js");
writeFileSync("menu-family-ui.js", compileMenuRuntime(readFileSync("src/menu-family-ui.js", "utf8")));
const menuFamilyRevision = revisionFor("menu-family-ui.js");
const menuFamilyCssRevision = revisionFor("menu-family.css");
writeFileSync("menu-combos-ui.js", compileMenuRuntime(readFileSync("src/menu-combos-ui.js", "utf8")));
const menuCombosRevision = revisionFor("menu-combos-ui.js");
const menuCombosCssRevision = revisionFor("menu-combos.css");
const comboEntryCssRevision = revisionFor("combo-entry.css");
const choiceHelpCssRevision = revisionFor("choice-help.css");
let choiceHelpSource = readFileSync("src/choice-help.js", "utf8");
choiceHelpSource = synchronizeModuleImport(choiceHelpSource, "order-storage.js", orderStorageRevision);
choiceHelpSource = synchronizeModuleImport(choiceHelpSource, "menu-catalog.js", menuCatalogRevision);
writeFileSync("src/choice-help.js", choiceHelpSource);
writeFileSync("choice-help.js", compileMenuRuntime(choiceHelpSource));
const choiceHelpRevision = revisionFor("choice-help.js");
let choiceHelpEntrySource = readFileSync("src/choice-help-entry.js", "utf8");
choiceHelpEntrySource = synchronizeModuleImport(choiceHelpEntrySource, "choice-help.js", choiceHelpRevision);
writeFileSync("src/choice-help-entry.js", choiceHelpEntrySource);
writeFileSync("choice-help-entry.js", compileMenuRuntime(choiceHelpEntrySource));
const choiceHelpEntryRevision = revisionFor("choice-help-entry.js");
for (const [file, dependencies] of [
  ["src/menu-feed-order.js", [["order-storage.js", orderStorageRevision], ["menu-order-ui.js", menuOrderRevision]]],
  ["src/menu-feed-collections.js", [["menu-family-ui.js", menuFamilyRevision], ["menu-combos-ui.js", menuCombosRevision]]]
]) {
  let source = readFileSync(file, "utf8");
  for (const [module, revision] of dependencies) {
    source = synchronizeModuleImport(source, module, revision);
  }
  writeFileSync(file, source);
}
let feedSource = readFileSync("src/menu-feed.js", "utf8");
feedSource = feedSource.replace(/from "\.\/menu-catalog\.js(?:\?v=[^"]*)?"/, `from "./menu-catalog.js?v=${menuCatalogRevision}"`);
writeFileSync("src/menu-feed.js", feedSource);
writeFileSync("menu-feed.js", compileMenuRuntime(feedSource));
const menuFeedRevision = revisionFor("menu-feed.js");
const menuFeedCssRevision = revisionFor("menu-feed.css");

let menuSource = readFileSync("src/menu-app.js", "utf8");
menuSource = synchronizeModuleImport(menuSource, "menu-order-ui.js", menuOrderRevision);
menuSource = synchronizeModuleImport(menuSource, "menu-family-ui.js", menuFamilyRevision);
menuSource = synchronizeModuleImport(menuSource, "menu-combos-ui.js", menuCombosRevision);
menuSource = synchronizeModuleImport(menuSource, "order-storage.js", orderStorageRevision);
writeFileSync("src/menu-app.js", menuSource);
writeFileSync("menu-app.js", compileMenuRuntime());

await build({
  entryPoints: ["src/app.ts"],
  external: ["./choice-help.js*"],
  bundle: true,
  charset: "utf8",
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "app.js",
  legalComments: "none"
});

await build({
  entryPoints: ["src/smart-choice/photo-previews.ts"],
  charset: "utf8", bundle: true, minify: true, format: "esm", platform: "browser",
  target: "es2020", outfile: "smart-choice/photo-previews.js", legalComments: "none"
});
const photoPreviewsRevision = revisionFor("smart-choice/photo-previews.js");

await build({
  entryPoints: ["src/smart-choice/catalog.ts"], plugins: [sharedMenuCatalogPlugin(menuCatalogRevision)],
  charset: "utf8", bundle: true, minify: true, format: "esm", platform: "browser",
  target: "es2020", outfile: "smart-choice/catalog.js", legalComments: "none"
});
const smartChoiceCatalogRevision = revisionFor("smart-choice/catalog.js");

await build({
  entryPoints: ["src/smart-choice/page.ts"],
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedPhotoPreviewsPlugin(photoPreviewsRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  external: ["../order-checkout.js*"],
  charset: "utf8",
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
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  charset: "utf8",
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
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  charset: "utf8",
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
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  charset: "utf8",
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
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  charset: "utf8",
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
  plugins: [sharedMenuCatalogPlugin(menuCatalogRevision, orderStorageRevision), sharedSmartChoiceCatalogPlugin(smartChoiceCatalogRevision)],
  charset: "utf8",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "smart-choice/release-qa.js",
  legalComments: "none"
});

// External ES modules are UTF-8; verify equivalence before publishing revisions.
await import("./test-smart-choice-encoding.mjs");

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
    target: "es2020", minifyWhitespace: true, minifySyntax: true,
    minifyIdentifiers: false, legalComments: "none"
  }).code;
  writeFileSync(outputPath, sourcePath === "src/discover-rotation.ts" ? bundle : compact);
}

transpileClassicScript("src/featured-gallery.ts", "featured-gallery.js");
transpileClassicScript("src/social-offer.ts", "social-offer.js");
transpileClassicScript("src/seasonal-theme.ts", "seasonal-theme.js");
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

// Discover the current view and its shared catalog before blocking CSS/bootstrap
// and the body. These are already required modules: no speculative execution or
// extra startup payload, and no serial entry -> catalog network round trip.
function synchronizeMenuPreloads(html, modules, alternateStyle = null) {
  html = html.replace(/\n\s*<!-- menu startup modules -->[\s\S]*?<!-- \/menu startup modules -->/, "");
  let hints = modules.map(([file, revision]) => `  <link rel="modulepreload" href="${file}?v=${revision}" />`).join("\n");
  if (alternateStyle) hints += `\n  <link rel="preload" href="${alternateStyle[0]}?v=${alternateStyle[1]}" as="style" fetchpriority="low" />`;
  const [entry, revision] = modules.at(-1);
  const script = new RegExp(`\\s*<script\\b[^>]*src="${entry.replaceAll(".", "\\.")}\\?v=[^"]*"[^>]*><\\/script>`);
  html = html.replace(script, "");
  // Keep normal deferred execution and incremental painting; no render-blocking
  // snapshots or timers stand between a tap and the next document.
  return html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n  <!-- menu startup modules -->\n${hints}\n  <script type="module" src="${entry}?v=${revision}"></script>\n  <!-- /menu startup modules -->`);
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

function synchronizeCssUrls(source, fileName, revision) {
  const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`url\\(["']${escapedName}(?:\\?v=[^"']*)?["']\\)`, "g");
  if (!pattern.test(source)) throw new Error(`CSS does not load ${fileName}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, `url("${fileName}?v=${revision}")`);
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

const takeawayEntryRevision = revisionFor("takeaway-entry.js");
const morningEntryRevision = revisionFor("morning-entry-v2.js");
const qaRevision = revisionFor("qa.js");
let bootstrapSource = readFileSync("src/bootstrap-v2.js", "utf8");
bootstrapSource = synchronizeModuleImport(bootstrapSource, "takeaway-entry.js", takeawayEntryRevision);
writeFileSync("src/bootstrap-v2.js", bootstrapSource);
// Reuse the existing blocking request and gzip stream on the three entry pages.
// Preserve the entry handoff source verbatim, including its guarded recovery.
const seasonalPrepaint = transformSync(readFileSync("seasonal-theme.js", "utf8"), {
  minify: true, target: "es2020", legalComments: "none"
}).code;
writeFileSync("bootstrap-v2.js", `${seasonalPrepaint}\n${bootstrapSource}`);

const menuProductRevealRuntimeRevision = revisionFor("menu-product-reveal-runtime.js");
let menuProductRevealSource = readFileSync("menu-product-reveal.js", "utf8");
menuProductRevealSource = synchronizeModuleImport(menuProductRevealSource, "menu-product-reveal-runtime.js", menuProductRevealRuntimeRevision);
writeFileSync("menu-product-reveal.js", menuProductRevealSource);

const discoverCopyRevision = revisionFor("discover-copy.js");
for (const file of ["discover-v2.js", "discover-rotation.js"]) {
  const source = readFileSync(file, "utf8").replace(/(from\s*["']\.\/discover-copy\.js)(?:\?[^"']*)?(["'])/g, `$1?v=${discoverCopyRevision}$2`);
  writeFileSync(file, source);
}
const appRevision = revisionFor("app.js");
const bootstrapRevision = revisionFor("bootstrap-v2.js");
const baseStylesRevision = revisionFor("styles-v2.css");
const mobileStylesRevision = revisionFor("mobile.css");
const menuPreviewRevision = revisionFor("menu-preview.css");
const seasonalThemeRevision = revisionFor("seasonal-theme.js");
const seasonalCssRevision = revisionFor("seasonal.css");
const menuSecurityRevision = revisionFor("menu-security-v2.css");
// Publish reviewed visual CSS under fresh pathnames so returning clients whose
// old service worker ignores query strings cannot receive stale bytes.
writeFileSync("menu-stability-v2.css", readFileSync("menu-stability.css"));
const menuStabilityRevision = revisionFor("menu-stability-v2.css");
writeFileSync(MENU_STYLESHEET_FILE, compileMenuStylesBundle());
const menuStylesRevision = revisionFor(MENU_STYLESHEET_FILE);
const landingCacheStyles = ["final-qa", "community-reel"].map((name) => {
  const target = `${name}-v2.css`;
  writeFileSync(target, readFileSync(`${name}.css`));
  return { name, target, revision: revisionFor(target) };
});
const menuPremiumRevision = revisionFor("menu-premium.css");
writeFileSync("pairing-posters.js", compileMenuRuntime(readFileSync("src/pairing-posters.js", "utf8")));
const pairingPostersRevision = revisionFor("pairing-posters.js");
const pairingPostersCssRevision = revisionFor("pairing-posters.css");
const menuAppRevision = revisionFor("menu-app.js");
const menuProductRevealRevision = revisionFor("menu-product-reveal.js");
const menuProductRevealCssRevision = revisionFor("menu-product-reveal.css");
const discoverDeckRevision = revisionFor("discover-deck.js");
const discoverDeckCssRevision = revisionFor("discover-deck.css");
const conversionSource = readFileSync("src/conversion.js", "utf8");
writeFileSync("conversion.js", transformSync(conversionSource, {
  minify: true, format: "esm", target: "es2020", legalComments: "none"
}).code);
const conversionRevision = revisionFor("conversion.js");
const galleryRevision = revisionFor("featured-gallery.js");
const socialOfferRevision = revisionFor("social-offer.js");
const coffeePathsRevision = revisionFor("coffee-paths.css");
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
const kidsMenuCssRevision = revisionFor("kids-menu.css");

const experienceEnvironmentFiles = [
  "environments/origin.svg",
  "environments/energy.svg",
  "environments/moment.svg",
  "environments/move.svg",
  "environments/pair.svg",
  "environments/finale.svg"
];
const experienceEnvironmentRevisions = new Map(
  experienceEnvironmentFiles.map((fileName) => [fileName, revisionFor(`experience/${fileName}`)])
);
let cinematicEnvironmentSource = readFileSync("experience/cinematic-environments.css", "utf8");
for (const [fileName, revision] of experienceEnvironmentRevisions) {
  cinematicEnvironmentSource = synchronizeCssUrls(cinematicEnvironmentSource, fileName, revision);
}
writeFileSync("experience/cinematic-environments.css", cinematicEnvironmentSource);

const experiencePwaRevision = revisionFor("experience/experience-pwa.js");
const experienceRuntimeRevision = revisionFor("experience/experience.js");
const experienceCssRevision = revisionFor("experience/experience.css");
const experienceBrandCssRevision = revisionFor("experience/brand-fidelity.css");
const experienceStateCssRevision = revisionFor("experience/experience-state.css");
const experienceCinematicCssRevision = revisionFor("experience/cinematic-environments.css");

let html = readFileSync("index.html", "utf8");
for (const { name, target, revision } of landingCacheStyles) {
  html = html.replace(`href="${name}.css`, `href="${target}`);
  html = synchronizeStylesheet(html, target, revision);
}
html = synchronizeBlockingScript(html, "bootstrap-v2.js", bootstrapRevision);
html = synchronizeModuleScript(html, "qa.js", qaRevision);
html = synchronizeStylesheet(html, "styles-v2.css", baseStylesRevision);
html = synchronizeStylesheet(html, "mobile.css", mobileStylesRevision);
html = synchronizeStylesheet(html, "menu-preview.css", menuPreviewRevision);
html = synchronizeStylesheet(html, "coffee-paths.css", coffeePathsRevision);
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
html = synchronizeModuleScript(html, "conversion.js", conversionRevision);
writeFileSync("index.html", html);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeBlockingScript(discoverHtml, "bootstrap-v2.js", bootstrapRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "styles-v2.css", baseStylesRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-deck.css", discoverDeckCssRevision);
discoverHtml = synchronizeModuleScript(discoverHtml, "discover-deck.js", discoverDeckRevision);
discoverHtml = synchronizeModuleScript(discoverHtml, "discover-v2.js", discoverRuntimeRevision);
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision);
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let menuHtml = readFileSync("menu.html", "utf8");
menuHtml = menuHtml.replace('href="menu-stability.css', 'href="menu-stability-v2.css');
menuHtml = synchronizeBlockingScript(menuHtml, "bootstrap-v2.js", bootstrapRevision);
const menuStyleLinks = [...menuHtml.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)];
const linkedMenuStyles = menuStyleLinks.map(([tag]) => tag.match(/\bhref="([^"?]+)/)?.[1]);
const originalMenuStyles = MENU_STYLE_INPUTS.map(({ delivered }) => delivered);
if (JSON.stringify(linkedMenuStyles) !== JSON.stringify(originalMenuStyles)
    && JSON.stringify(linkedMenuStyles) !== JSON.stringify([MENU_STYLESHEET_FILE])) {
  throw new Error("Menu stylesheet inputs must retain their complete original cascade or the generated bundle");
}
let firstMenuStyle = true;
menuHtml = menuHtml.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, () => {
  if (!firstMenuStyle) return "";
  firstMenuStyle = false;
  return `<link rel="stylesheet" href="${MENU_STYLESHEET_FILE}?v=${menuStylesRevision}" />`;
});
menuHtml = menuHtml.replace(/^[\t ]+$/gm, "");
menuHtml = synchronizeModuleScript(menuHtml, "menu-product-reveal.js", menuProductRevealRevision);
menuHtml = synchronizeModuleScript(menuHtml, "menu-app.js", menuAppRevision);
menuHtml = synchronizeModuleScript(menuHtml, "pairing-posters.js", pairingPostersRevision);
menuHtml = synchronizeMenuPreloads(menuHtml, [["menu-catalog.js", menuCatalogRevision], ["menu-app.js", menuAppRevision]], ["menu-feed.css", menuFeedCssRevision]);
writeFileSync("menu.html", menuHtml);

let feedHtml = readFileSync("menu-feed.html", "utf8");
feedHtml = synchronizeModuleScript(feedHtml, "menu-feed.js", menuFeedRevision);
feedHtml = synchronizeModuleScript(feedHtml, "menu-view-mode.js", menuViewModeRevision);
feedHtml = synchronizeStylesheet(feedHtml, "menu-feed.css", menuFeedCssRevision);
feedHtml = synchronizeStylesheet(feedHtml, MENU_STYLESHEET_FILE, menuStylesRevision);
feedHtml = synchronizeMenuPreloads(feedHtml, [["menu-catalog.js", menuCatalogRevision], ["menu-feed.js", menuFeedRevision]]);
writeFileSync("menu-feed.html", feedHtml);
const { menuShareProducts } = await import("./build-menu-share-pages.mjs");
const menuShareEntryRevision = revisionFor("menu-share-entry.js");
const menuShareStyleRevision = revisionFor("menu-share-entry.css");

let experienceHtml = readFileSync("experience/index.html", "utf8");
experienceHtml = synchronizeScript(experienceHtml, "experience-pwa.js", experiencePwaRevision);
experienceHtml = synchronizeScript(experienceHtml, "experience.js", experienceRuntimeRevision);
experienceHtml = synchronizeStylesheet(experienceHtml, "experience.css", experienceCssRevision);
experienceHtml = synchronizeStylesheet(experienceHtml, "brand-fidelity.css", experienceBrandCssRevision);
experienceHtml = synchronizeStylesheet(experienceHtml, "experience-state.css", experienceStateCssRevision);
experienceHtml = synchronizeStylesheet(experienceHtml, "cinematic-environments.css", experienceCinematicCssRevision);
writeFileSync("experience/index.html", experienceHtml);

let russianLandingHtml = readFileSync("ru/coffee-gazipasa.html", "utf8");
russianLandingHtml = synchronizeStylesheet(russianLandingHtml, "../styles-v2.css", baseStylesRevision);
russianLandingHtml = synchronizeStylesheet(russianLandingHtml, "../mobile.css", mobileStylesRevision);
writeFileSync("ru/coffee-gazipasa.html", russianLandingHtml);

let smartChoiceHtml = readFileSync("smart-choice/index.html", "utf8");
for (const [file, revision] of [["photo-previews.js", photoPreviewsRevision],
  ["catalog.js", smartChoiceCatalogRevision], ["../menu-catalog.js", menuCatalogRevision]]) {
  if (!smartChoiceHtml.includes(`href="${file}`)) {
    smartChoiceHtml = smartChoiceHtml.replace('  <link rel="stylesheet"', `  <link rel="modulepreload" href="${file}" />\n  <link rel="stylesheet"`);
  }
  smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, file, revision);
}
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "release-qa.js", smartChoiceReleaseQaRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "app-v2.js", smartChoiceAppRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "cart-v2.js", smartChoiceCartRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "experiments-v2.js", smartChoiceExperimentsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "analytics-v2.js", smartChoiceAnalyticsRevision);
smartChoiceHtml = synchronizeModuleScript(smartChoiceHtml, "decision-trace-v2.js", smartChoiceDecisionTraceRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "style.css", smartChoiceCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "cart.css", smartChoiceCartCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "../order-checkout.css", orderCheckoutCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "decision-trace.css", smartChoiceDecisionTraceCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "release-qa.css", smartChoiceReleaseQaCssRevision);
smartChoiceHtml = synchronizeStylesheet(smartChoiceHtml, "../kids-menu.css", kidsMenuCssRevision);
writeFileSync("smart-choice/index.html", smartChoiceHtml);

let cashierHtml = readFileSync("cashier.html", "utf8");
cashierHtml = synchronizeStylesheet(cashierHtml, "order-checkout.css", orderCheckoutCssRevision);
cashierHtml = synchronizeModuleScript(cashierHtml, "cashier.js", cashierRevision);
writeFileSync("cashier.html", cashierHtml);

// Keep all customer selection surfaces on the same helper and entry styles.
// The menu retains one blocking stylesheet, including these authored layers.
const choiceSurfaces = ["index.html", "menu.html", "discover.html", "experience/index.html", "smart-choice/index.html", "ru/coffee-gazipasa.html"];
for (const file of choiceSurfaces) {
  const prefix = file.includes("/") ? "../" : "";
  let page = readFileSync(file, "utf8");
  if (["index.html", "menu.html", "discover.html"].includes(file)) {
    if (page.includes(`src="${prefix}seasonal-theme.js`)) {
      throw new Error(`${file}: the shared bootstrap already initializes the season; remove the redundant authored script tag`);
    }
  } else {
    if (!page.includes(`src="${prefix}seasonal-theme.js`)) {
      page = page.replace("</head>", `  <script src="${prefix}seasonal-theme.js"></script>\n</head>`);
    }
    page = synchronizeBlockingScript(page, `${prefix}seasonal-theme.js`, seasonalThemeRevision);
  }
  if (file !== "menu.html") {
    if (!page.includes(`href="${prefix}seasonal.css`)) page = page.replace("</head>", `  <link rel="stylesheet" href="${prefix}seasonal.css" />\n</head>`);
    page = synchronizeStylesheet(page, `${prefix}seasonal.css`, seasonalCssRevision);
    if (!page.includes(`${prefix}choice-help.css`)) page = page.replace("</head>", `  <link rel="stylesheet" href="${prefix}choice-help.css" />\n</head>`);
    page = synchronizeStylesheet(page, `${prefix}choice-help.css`, choiceHelpCssRevision);
    page = synchronizeStylesheet(page, `${prefix}combo-entry.css`, comboEntryCssRevision);
  }
  if (["index.html", "menu.html"].includes(file)) {
    page = page.replace(/\s*<script type="module" src="choice-help-entry\.js(?:\?[^\"]*)?"><\/script>/, "");
  } else {
    if (!page.includes(`src="${prefix}choice-help-entry.js`)) page = page.replace("</body>", `  <script type="module" src="${prefix}choice-help-entry.js"></script>\n</body>`);
    page = synchronizeModuleScript(page, `${prefix}choice-help-entry.js`, choiceHelpEntryRevision);
  }
  writeFileSync(file, page);
}

let serviceWorker = readFileSync("sw-core-v64.js", "utf8");
if (!/^const MENU_SHARE_PRODUCTS = .*;$/m.test(serviceWorker)) throw new Error("Missing offline share product registry");
serviceWorker = serviceWorker.replace(/^const MENU_SHARE_PRODUCTS = .*;$/m, `const MENU_SHARE_PRODUCTS = ${JSON.stringify(menuShareProducts)};`);
const familyPhotoAssets = [
  "src/products/family-sets-v1/milk-cookie.webp",
  "src/products/family-sets-v1/simit-break.webp",
  "src/products/family-sets-v1/milk-roll.webp",
  "src/products/family-sets-v1/kids-box.webp"
];
const comboPhotoAssets = ["student", "cycle", "rain", "tea", "refresh", "together", "family", "local", "go", "morning", "sweet", "hearty"]
  .map(id => `src/products/occasion-sets-v1/${id}.webp`);
const { menuCategories: storyCategories } = await import("../menu-catalog.js");
const { feedProducts: storyProducts } = await import("../src/menu-feed-model.js");
const storyCatalog = storyProducts(storyCategories);
const storyCoverAssets = storyCategories.map(category => storyCatalog.find(product => product.category.id === category.id)?.image)
  .filter(Boolean).map(source => source.replace("/products/", "/products/quick-v1/").replace(/\.webp$/, "-256.webp"));
for (const asset of ["menu-feed-viewer.js", "menu-feedback.js", "menu-share-entry.js", "menu-share-entry.css", "menu-feed.html", "menu-feed.js", "menu-feed.css", "menu-view-mode.js", "kids-menu.css", "smart-choice/photo-previews.js", "smart-choice/catalog.js", MENU_STYLESHEET_FILE, "seasonal-theme.js", "seasonal.css", "cashier.html", "cashier.js", "order-checkout.js", "order-checkout.css", "order-storage.js", "menu-order-ui.js", "menu-family-ui.js", "menu-family.css",
  "menu-combos-ui.js", "menu-combos.css", "combo-entry.css", "choice-help-entry.js", "choice-help.js", "choice-help.css", "discover-copy.js", ...comboPhotoAssets,
  "src/products/quick-choice-v1/coffee.webp", "src/products/quick-choice-v1/tea.webp", "src/products/quick-choice-v1/cold.webp", ...familyPhotoAssets, ...storyCoverAssets]) {
  if (!serviceWorker.includes(`"./${asset}`)) serviceWorker = serviceWorker.replace('"./menu.html"', `"./${asset}",\n  "./menu.html"`);
}
const orderFlowRevision = createHash("sha256").update(`${orderCheckoutRevision}:${cashierRevision}:${smartChoiceAppRevision}:${smartChoiceCartRevision}:${orderCheckoutCssRevision}`).digest("hex").slice(0, 12);
const feedCacheRevision = createHash("sha256").update(`${menuFeedRevision}:${menuFeedCssRevision}:${revisionFor("menu-feed.html")}:${revisionFor("menu.html")}:${revisionFor("index.html")}`).digest("hex").slice(0, 12);
const shareCacheRevision = createHash("sha256").update(`${menuShareEntryRevision}:${menuShareStyleRevision}:${JSON.stringify(menuShareProducts)}`).digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-menu-share-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-menu-share-${shareCacheRevision}-shared-order-`);
serviceWorker = serviceWorker.replace(/-menu-feed-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-menu-feed-${feedCacheRevision}-shared-order-`);
serviceWorker = serviceWorker.replace(/-quick-order-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-quick-order-${orderFlowRevision}-shared-order-`);
// Offer prices must refresh for returning visitors, including their cached home.
// Bind both the worker namespace and exact precache URL to the rendered offer.
serviceWorker = serviceWorker.replace(/-social-offer-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-shared-order-social-offer-${socialOfferRevision}-`);
serviceWorker = serviceWorker.replace(/-coffee-paths-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-coffee-paths-${coffeePathsRevision}-shared-order-`);
const seasonalCacheRevision = createHash("sha256").update(`${seasonalThemeRevision}:${seasonalCssRevision}:${bootstrapRevision}`).digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-halloween-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-halloween-${seasonalCacheRevision}-shared-order-`);
const homeNavigationRevision = createHash("sha256")
  .update(`${appRevision}:${mobileStylesRevision}:${menuPreviewRevision}`).digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-home-navigation-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-home-navigation-${homeNavigationRevision}-shared-order-`);
// Include both pairing assets in the cache namespace, not only the precache URLs.
// Otherwise a CSS-only repair can leave returning visitors in the old namespace.
const pairingCachePattern = /(const CACHE_VERSION = "robys-offline-v64-20260910-menu-truth-)[a-f0-9]{12}-(?:pairing-css-[a-f0-9]{12}-)?/;
if (!pairingCachePattern.test(serviceWorker)) {
  throw new Error("Service worker is missing its pairing cache version marker");
}
serviceWorker = serviceWorker.replace(
  pairingCachePattern,
  `$1${pairingPostersRevision}-pairing-css-${pairingPostersCssRevision}-`
);
const familyCacheRevision = createHash("sha256")
  .update([menuFamilyRevision, menuFamilyCssRevision, revisionFor("src/menu-family.js"), ...familyPhotoAssets.map(revisionFor)].join(":"))
  .digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-family-menu-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-family-menu-${familyCacheRevision}-shared-order-`);
const combosCacheRevision = createHash("sha256")
  .update([menuCombosRevision, menuCombosCssRevision, comboEntryCssRevision, choiceHelpEntryRevision, choiceHelpRevision, choiceHelpCssRevision, discoverCopyRevision,
    ...choiceSurfaces.map(revisionFor), ...comboPhotoAssets.map(revisionFor)].join(":"))
  .digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-occasion-combos-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-occasion-combos-${combosCacheRevision}-shared-order-`);
const customPairingCacheRevision = createHash("sha256")
  .update(`${menuAppRevision}:${menuOrderRevision}:${menuPremiumRevision}:${menuPairingRevision}`).digest("hex").slice(0, 12);
serviceWorker = serviceWorker.replace(/-custom-pair-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-custom-pair-${customPairingCacheRevision}-shared-order-`);
serviceWorker = serviceWorker.replace(/-menu-css-[a-f0-9]{12}/, "");
serviceWorker = serviceWorker.replace("-shared-order-", `-menu-css-${menuStylesRevision}-shared-order-`);
for (const { name, target, revision } of landingCacheStyles) {
  serviceWorker = serviceWorker.replace(`"./${name}.css`, `"./${target}`);
  serviceWorker = serviceWorker.replace(
    new RegExp(`"\\./${target.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`),
    `"./${target}?v=${revision}"`
  );
}
serviceWorker = serviceWorker.replace('"./menu-stability.css', '"./menu-stability-v2.css');
serviceWorker = synchronizeServiceWorker(
  serviceWorker,
  discoverRuntimeRevision,
  discoverRotationRevision,
  discoverRotationCssRevision
);
for (const [filePath, revision] of [
  [MENU_STYLESHEET_FILE, menuStylesRevision],
  ["social-offer.js", socialOfferRevision],
  ["coffee-paths.css", coffeePathsRevision],
  ["menu-catalog.js", menuCatalogRevision],
  ["order-checkout.js", orderCheckoutRevision],
  ["order-storage.js", orderStorageRevision],
  ["cashier.js", cashierRevision],
  ["order-checkout.css", orderCheckoutCssRevision],
  ["bootstrap-v2.js", bootstrapRevision],
  ["morning-entry-v2.js", morningEntryRevision],
  ["takeaway-entry.js", takeawayEntryRevision],
  ["styles-v2.css", baseStylesRevision],
  ["mobile.css", mobileStylesRevision],
  ["menu-preview.css", menuPreviewRevision],
  ["app.js", appRevision],
  ["seasonal-theme.js", seasonalThemeRevision],
  ["seasonal.css", seasonalCssRevision],
  ["menu-security-v2.css", menuSecurityRevision],
  ["menu-stability-v2.css", menuStabilityRevision],
  ["menu-premium.css", menuPremiumRevision],
  ["kids-menu.css", kidsMenuCssRevision],
  ["pairing-posters.css", pairingPostersCssRevision],
  ["pairing-posters.js", pairingPostersRevision],
  ["menu-app.js", menuAppRevision],
  ["menu-feed.js", menuFeedRevision],
  ["menu-feedback.js", menuFeedbackRevision],
  ["menu-feed-viewer.js", menuFeedViewerRevision],
  ["menu-view-mode.js", menuViewModeRevision],
  ["menu-feed.css", menuFeedCssRevision],
  ["menu-share-entry.js", menuShareEntryRevision],
  ["menu-share-entry.css", menuShareStyleRevision],
  ["menu-order-ui.js", menuOrderRevision],
  ["menu-family-ui.js", menuFamilyRevision],
  ["menu-family.css", menuFamilyCssRevision],
  ["menu-combos-ui.js", menuCombosRevision],
  ["menu-combos.css", menuCombosCssRevision],
  ["combo-entry.css", comboEntryCssRevision],
  ["choice-help.js", choiceHelpRevision],
  ["choice-help-entry.js", choiceHelpEntryRevision],
  ["choice-help.css", choiceHelpCssRevision],
  ["discover-copy.js", discoverCopyRevision],
  ["menu-pairing.js", menuPairingRevision],
  ["menu-product-reveal.css", menuProductRevealCssRevision],
  ["menu-product-reveal.js", menuProductRevealRevision],
  ["menu-product-reveal-runtime.js", menuProductRevealRuntimeRevision],
  ["discover-deck.css", discoverDeckCssRevision],
  ["discover-deck.js", discoverDeckRevision],
  ["conversion.js", conversionRevision],
  ["smart-choice/release-qa.js", smartChoiceReleaseQaRevision],
  ["smart-choice/app-v2.js", smartChoiceAppRevision],
  ["smart-choice/photo-previews.js", photoPreviewsRevision],
  ["smart-choice/catalog.js", smartChoiceCatalogRevision],
  ["smart-choice/cart-v2.js", smartChoiceCartRevision],
  ["smart-choice/experiments-v2.js", smartChoiceExperimentsRevision],
  ["smart-choice/analytics-v2.js", smartChoiceAnalyticsRevision],
  ["smart-choice/decision-trace-v2.js", smartChoiceDecisionTraceRevision],
  ["smart-choice/style.css", smartChoiceCssRevision],
  ["smart-choice/cart.css", smartChoiceCartCssRevision],
  ["smart-choice/decision-trace.css", smartChoiceDecisionTraceCssRevision],
  ["smart-choice/release-qa.css", smartChoiceReleaseQaCssRevision],
  ["experience/experience-pwa.js", experiencePwaRevision],
  ["experience/experience.js", experienceRuntimeRevision],
  ["experience/experience.css", experienceCssRevision],
  ["experience/brand-fidelity.css", experienceBrandCssRevision],
  ["experience/experience-state.css", experienceStateCssRevision],
  ["experience/cinematic-environments.css", experienceCinematicCssRevision],
  ...Array.from(experienceEnvironmentRevisions, ([fileName, revision]) => [`experience/${fileName}`, revision])
]) {
  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);
}
writeFileSync("sw-core-v64.js", serviceWorker);
verifyMenuStylesBundle(readMenuStylesBundleInputs());

console.log(
  `Built app.js (${appRevision}), bootstrap-v2.js (${bootstrapRevision}), morning-entry-v2.js (${morningEntryRevision}), styles-v2.css (${baseStylesRevision}), ` +
  `menu-security-v2.css (${menuSecurityRevision}), pairing-posters.css (${pairingPostersCssRevision}), pairing-posters.js (${pairingPostersRevision}), ` +
  `Smart Choice app-v2.js (${smartChoiceAppRevision}), ` +
  `Smart Choice cart-v2.js (${smartChoiceCartRevision}), Smart Choice experiments-v2.js (${smartChoiceExperimentsRevision}), ` +
  `Smart Choice analytics-v2.js (${smartChoiceAnalyticsRevision}), Smart Choice decision-trace-v2.js (${smartChoiceDecisionTraceRevision}), ` +
  `Smart Choice release-qa.js (${smartChoiceReleaseQaRevision}), featured-gallery.js (${galleryRevision}), ` +
  `social-offer.js (${socialOfferRevision}), discover-v2.js (${discoverRuntimeRevision}), ` +
  `discover-rotation-v3.js (${discoverRotationRevision}), Smart Choice style.css (${smartChoiceCssRevision}), ` +
  `Smart Choice cart.css (${smartChoiceCartCssRevision}), Smart Choice decision-trace.css (${smartChoiceDecisionTraceCssRevision}), ` +
  `and Smart Choice release-qa.css (${smartChoiceReleaseQaCssRevision}) with synchronized cache keys.`
);
