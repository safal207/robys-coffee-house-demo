import { resolve } from "node:path";

// Keep the same-photo placeholders in one cacheable, preloaded browser module.
// Test bundles that do not opt into this plugin remain self-contained.
export function sharedPhotoPreviewsPlugin(revision) {
  if (!/^[a-f0-9]{12}$/.test(revision)) throw new Error("Expected the current photo preview content revision");
  const canonicalPath = resolve("src/smart-choice/photo-previews.js");
  return {
    name: "smart-choice-shared-photo-previews",
    setup(context) {
      context.onResolve({ filter: /photo-previews\.js(\?.*)?$/ }, args => {
        if (resolve(args.resolveDir, args.path.split("?")[0]) !== canonicalPath) return;
        return { path: `./photo-previews.js?v=${revision}`, external: true };
      });
    }
  };
}
