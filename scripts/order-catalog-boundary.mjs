import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Both the renderer and the shared store must use ONE URL, not two query aliases.
export function orderCatalogURL(root = process.cwd()) {
  const bytes = readFileSync(resolve(root, 'menu-catalog.js'));
  return `./menu-catalog.js?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;
}
export function orderCatalogPlugin(root = process.cwd()) {
  const catalog = resolve(root, 'menu-catalog.js');
  return {
    name: 'one-canonical-order-catalog',
    setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)menu-catalog\.js(?:\?.*)?$/ }, args => {
        const file = resolve(dirname(args.importer), args.path.split('?')[0]);
        if (file !== catalog) return undefined;
        return { path: orderCatalogURL(root), external: true };
      });
    }
  };
}
