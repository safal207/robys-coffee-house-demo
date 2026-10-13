import { resolve } from "node:path";

// All browser entry points reuse the same revisioned catalog module, rather
// than each bundle shipping another copy of the complete multilingual menu.
export function sharedMenuCatalogPlugin(revision) {
  if (!/^[a-f0-9]{12}$/.test(revision)) throw new Error("Expected the current menu catalog content revision");
  const canonicalPath = resolve("menu-catalog.js");
  return {
    name: "smart-choice-shared-menu-catalog",
    setup(context) {
      context.onResolve({ filter: /menu-catalog\.js(\?.*)?$/ }, (args) => {
        if (resolve(args.resolveDir, args.path.split("?")[0]) !== canonicalPath) return;
        return { path: `../menu-catalog.js?v=${revision}`, external: true };
      });
    }
  };
}
