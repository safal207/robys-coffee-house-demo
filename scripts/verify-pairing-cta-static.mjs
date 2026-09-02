import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("index.html", "utf8");
const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
const primaryCta = heroActions.match(/<a\b[^>]*class="button button-primary"[^>]*>[^<]*<\/a>/)?.[0] ?? "";
const pairingCta = heroActions.match(/<a\b[^>]*class="button button-ghost"[^>]*>[^<]*<\/a>/)?.[0] ?? "";

assert.match(primaryCta, /href="menu\.html"/);
assert.match(primaryCta, /data-i18n="viewMenu"/);
assert.equal(primaryCta.includes("target="), false);
assert.equal(primaryCta.includes("rel="), false);
assert.equal(primaryCta.includes("pairing_click"), false);
assert.match(pairingCta, /href="menu\.html#pairing-offers"/);
assert.match(pairingCta, /data-analytics-action="pairing_click"/);
assert.match(pairingCta, /data-localized/);
assert.match(pairingCta, /data-tr="Bugünün Eşleşmesini Gör"/);
assert.match(pairingCta, /data-en="See Today's Pairing"/);
assert.match(pairingCta, /data-ru="Смотреть сочетание дня"/);
assert.equal(pairingCta.includes("target="), false);
assert.equal(pairingCta.includes("rel="), false);
assert.equal(pairingCta.includes("data-i18n="), false);
assert.match(index, /src="analytics\.js\?v=pairing-cta-20260704-2"/);

console.log("PASS: full-menu primary CTA, secondary pairing CTA, and cache revision are bound");
