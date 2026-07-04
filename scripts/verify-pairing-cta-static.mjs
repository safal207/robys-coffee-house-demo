import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("index.html", "utf8");
const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
const primaryCta = heroActions.match(/<a\b[^>]*class="button button-primary"[^>]*>[^<]*<\/a>/)?.[0] ?? "";

assert.match(primaryCta, /href="menu\.html#pairing-offers"/);
assert.match(primaryCta, /data-analytics-action="pairing_click"/);
assert.match(primaryCta, /data-localized/);
assert.match(primaryCta, /data-tr="Bugünün Eşleşmesini Gör"/);
assert.match(primaryCta, /data-en="See Today's Pairing"/);
assert.match(primaryCta, /data-ru="Смотреть сочетание дня"/);
assert.equal(primaryCta.includes("target="), false);
assert.equal(primaryCta.includes("rel="), false);
assert.equal(primaryCta.includes("data-i18n="), false);
assert.match(index, /src="analytics\.js\?v=pairing-cta-20260704-1"/);

console.log("PASS: static pairing CTA and cache revision are bound");
