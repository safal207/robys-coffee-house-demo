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

function synchronizeServiceWorker(serviceWorker, revision) {
  const version = `robys-offline-v8-20260630-rotation-${revision}`;
  const nextVersion = serviceWorker.replace(
    /const CACHE_VERSION = "robys-offline-v8-20260630-rotation-[^"]+";/,
    `const CACHE_VERSION = "${version}";`
  );
  const nextAsset = nextVersion.replace(
    /"\.\/discover-rotation-v3\.js(?:\?v=[a-f0-9]{12})?"/,
    `"./discover-rotation-v3.js?v=${revision}"`
  );

  if (nextAsset === serviceWorker) {
    throw new Error("Service worker does not contain the v3 renderer cache entry");
  }
  return nextAsset;
}

const appRevision = revisionFor("app.js");
const galleryRevision = revisionFor("featured-gallery.js");
const socialOfferRevision = revisionFor("social-offer.js");
const discoverRotationRevision = revisionFor("discover-rotation-v3.js");
let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
writeFileSync("index.html", html);

let discoverHtml = readFileSync("discover.html", "utf8");
discoverHtml = synchronizeScript(discoverHtml, "discover-rotation-v3.js", discoverRotationRevision);
writeFileSync("discover.html", discoverHtml);

let serviceWorker = readFileSync("sw.js", "utf8");
serviceWorker = synchronizeServiceWorker(serviceWorker, discoverRotationRevision);
writeFileSync("sw.js", serviceWorker);

console.log(`Built app.js (${appRevision}), featured-gallery.js (${galleryRevision}), social-offer.js (${socialOfferRevision}), discover-rotation.js, discover-rotation-v2.js and discover-rotation-v3.js (${discoverRotationRevision}, revisioned exact cache key).`);
