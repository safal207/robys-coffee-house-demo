import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const css=readFileSync("pairing-posters.css","utf8"), js=readFileSync("pairing-posters.js","utf8");
assert.match(css,/object-fit: contain/);
assert.match(css,/transform: none/);
assert.match(css,/#pairing-offers \.full-menu-item-details[\s\S]*?display: flex/);
assert.ok(!/oldPrice|priceMeta|340 ₺/.test(js),"no unsupported discount or duplicate price source");
assert.match(js,/aria-haspopup/);
assert.match(js,/media\.click\(\)/);
for (const file of ["pairing-posters.css","pairing-posters.js"]) {
  const revision=createHash("sha256").update(readFileSync(file)).digest("hex").slice(0,12);
  for (const consumer of ["menu.html","sw.js"]) assert.ok(readFileSync(consumer,"utf8").includes(file+"?v="+revision),consumer+": stale "+file);
}
console.log("Pairing source contract: PASS (framing, single price source, actions, content-bound HTML/SW)");

assert.match(css,/max-height: 320px/,'pairing media must stay bounded');
assert.match(css,/is-in-cart[^{}]*::after\s*\{\s*display: grid/,'selected badge must remain visible');
assert.match(css,/#menu-product-dialog[^{}]*sets-v1[^{}]*\{[^}]*object-fit: contain/,'set modal must not crop');
