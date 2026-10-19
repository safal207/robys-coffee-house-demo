import { resolve } from "node:path";

// All browser entry points reuse the same revisioned catalog module, rather
// than each bundle shipping another copy of the complete multilingual menu.
export function sharedMenuCatalogPlugin(revision, storageRevision) {
  if (!/^[a-f0-9]{12}$/.test(revision)) throw new Error("Expected the current menu catalog content revision");
  if (storageRevision !== undefined && !/^[a-f0-9]{12}$/.test(storageRevision)) throw new Error("Expected the current shared order storage content revision");
  const canonicalPath = resolve("menu-catalog.js");
  return {
    name: "smart-choice-shared-menu-catalog",
    setup(context) {
      context.onResolve({ filter: /menu-catalog\.js(\?.*)?$/ }, (args) => {
        if (resolve(args.resolveDir, args.path.split("?")[0]) !== canonicalPath) return;
        return { path: `../menu-catalog.js?v=${revision}`, external: true };
      });
      if (storageRevision) context.onResolve({ filter: /order-storage\.js(\?.*)?$/ }, (args) => {
        if (resolve(args.resolveDir, args.path.split("?")[0]) !== resolve("src/order-storage.js")) return;
        return { path: `../order-storage.js?v=${storageRevision}`, external: true };
      });
    }
  };
}

// The derived recommendation catalog and its validation run once per page,
// instead of repeating the same immutable data in five browser entry points.
export function sharedSmartChoiceCatalogPlugin(revision) {
  if (!/^[a-f0-9]{12}$/.test(revision)) throw new Error("Expected the current Smart Choice catalog content revision");
  const canonicalPath = resolve("src/smart-choice/catalog.js");
  return {
    name: "smart-choice-shared-derived-catalog",
    setup(context) {
      context.onResolve({ filter: /(?:^|\/)catalog\.js(\?.*)?$/ }, args => {
        if (resolve(args.resolveDir, args.path.split("?")[0]) !== canonicalPath) return;
        return { path: `./catalog.js?v=${revision}`, external: true };
      });
    }
  };
}
