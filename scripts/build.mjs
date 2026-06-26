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
transpileClassicScript("src/community-reel.ts", "community-reel.js");

function revisionFor(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12);
}

function synchronizeScript(html, fileName, revision) {
  const start = html.indexOf(`src="${fileName}`);
  if (start < 0) throw new Error(`index.html does not load ${fileName}`);
  const open = html.lastIndexOf("<" + "script", start);
  const close = html.indexOf("</" + "script>", start);
  if (open < 0 || close < 0) throw new Error(`Cannot locate ${fileName} script element`);
  const tag = "<" + `script defer src="${fileName}?v=${revision}">` + "</" + "script>";
  return html.slice(0, open) + tag + html.slice(close + 9);
}

const appRevision = revisionFor("app.js");
const galleryRevision = revisionFor("featured-gallery.js");
const socialOfferRevision = revisionFor("social-offer.js");
const communityReelRevision = revisionFor("community-reel.js");
let html = readFileSync("index.html", "utf8");
html = synchronizeScript(html, "app.js", appRevision);
html = synchronizeScript(html, "featured-gallery.js", galleryRevision);
html = synchronizeScript(html, "social-offer.js", socialOfferRevision);
html = synchronizeScript(html, "community-reel.js", communityReelRevision);
writeFileSync("index.html", html);
console.log(`Built app.js (${appRevision}), featured-gallery.js (${galleryRevision}), social-offer.js (${socialOfferRevision}) and community-reel.js (${communityReelRevision}).`);
