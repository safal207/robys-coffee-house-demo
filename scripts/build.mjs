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

function synchronizeStylesheet(html, fileName, revision) {
  const pattern = new RegExp(`href="${fileName.replaceAll(".", "\\.")}(?:\\?v=[^"]*)?"`);
  if (!pattern.test(html)) throw new Error(`HTML does not load ${fileName}`);
  return html.replace(pattern, `href="${fileName}?v=${revision}"`);
}

function synchronizeServiceWorker(serviceWorker, scriptRevision, cssRevision) {
  const versionPattern = /const CACHE_VERSION = "(robys-offline-[^"]+?)(?:-[a-f0-9]{12}){2}";/;
  const versionMatch = serviceWorker.match(versionPattern);
  const scriptAssetPattern = /"\.\/discover-rotation-v3\.js(?:\?v=[a-f0-9]{12})?"/;
  const cssAssetPattern = /"\.\/discover-rotation\.css(?:\?v=[a-f0-9]{12})?"/;

  if (!versionMatch) {
    throw new Error("Service worker does not contain a revisioned Roby's cache version marker");
  }
  if (!scriptAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the v3 renderer cache entry");
  }
  if (!cssAssetPattern.test(serviceWorker)) {
    throw new Error("Service worker does not contain the poster stylesheet cache entry");
  }

  const cacheVersionPrefix = versionMatch[1];
  return serviceWorker
    .replace(
      versionPattern,
      `const CACHE_VERSION = "${cacheVersionPrefix}-${scriptRevision}-${cssRevision}";`
    )
    .replace(scriptAssetPattern, `"./discover-rotation-v3.js?v=${scriptRevision}"`)
    .replace(cssAssetPattern, `"./discover-rotation.css?v=${cssRevision}"`);
}

const appRevision = revisionFor("app.js");
const galleryRevision = revisionFor("featured-gallery.js");
const socialOfferRevision = revisionFor("social-offer.js");
const discoverRotationRevision = revisionFor("discover-rotation-v3.js");
const discoverRotationCssRevision = revisionFor("discover-rotation.css");
let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
writeFileSync("index.html", html);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeStylesheet(discoverHtml, "discover-rotation.css", discoverRotationCssRevision);
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let serviceWorker = readFileSync("sw.js", "utf8");
serviceWorker = synchronizeServiceWorker(
  serviceWorker,
  discoverRotationRevision,
  discoverRotationCssRevision
);
writeFileSync("sw.js", serviceWorker);

console.log(`Built app.js (${appRevision}), featured-gallery.js (${galleryRevision}), social-offer.js (${socialOfferRevision}), discover-rotation.js, discover-rotation-v2.js and discover-rotation-v3.js (${discoverRotationRevision}), plus discover-rotation.css (${discoverRotationCssRevision}) with exact synchronized cache keys.`);
