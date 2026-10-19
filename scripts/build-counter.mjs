import { build } from "esbuild";

await build({
  entryPoints: ["counter/src/guest.js", "counter/src/staff.js"],
  outdir: "counter/public", bundle: true, minify: true, charset: "utf8",
  format: "esm", platform: "browser", target: "es2020", legalComments: "none"
});
console.log("Counter guest and staff interfaces built from source.");
