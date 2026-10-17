import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync("index.html", "utf8");
const heroActions = index.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
const orderCta = heroActions.match(/<a\b[^>]*data-smart-choice-entry[^>]*>[^<]*<\/a>/)?.[0] ?? "";
assert.match(orderCta, /class="button button-primary"/);
assert.match(orderCta, /href="smart-choice\/"/);
assert.match(orderCta, /data-analytics-action="smart_choice_start"/);
assert.match(orderCta, /data-tr="Siparişimi oluştur"/);
assert.match(orderCta, /data-en="Build my order"/);
assert.match(orderCta, /data-ru="Собрать заказ"/);
assert.equal((heroActions.match(/class="button button-primary"/g) ?? []).length, 1);

const primaryCta = heroActions.match(/<a\b[^>]*class="hero-pairing-link"[^>]*>[^<]*<\/a>/)?.[0] ?? "";

assert.match(primaryCta, /href="menu\.html#pairing-offers"/);
assert.match(primaryCta, /data-analytics-action="pairing_click"/);
assert.match(primaryCta, /data-localized/);
assert.match(primaryCta, /data-tr="Kahve \+ tatlı fikirleri →"/);
assert.match(primaryCta, /data-en="Drink \+ dessert ideas →"/);
assert.match(primaryCta, /data-ru="Напиток \+ десерт →"/);
assert.equal(primaryCta.includes("target="), false);
assert.equal(primaryCta.includes("rel="), false);
assert.equal(primaryCta.includes("data-i18n="), false);
assert.match(index, /src="analytics\.js\?v=pairing-cta-20260704-2"/);

console.log("PASS: static pairing CTA and cache revision are bound");
