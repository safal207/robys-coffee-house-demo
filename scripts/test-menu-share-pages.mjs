import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { menuCategories } from "../menu-catalog.js";
import { feedProducts } from "../src/menu-feed-model.js";
import { feedSharePath, parseFeedEntry } from "../src/menu-feed-navigation.js";

const products = feedProducts(menuCategories);
const base = new URL("https://safal207.github.io/robys-coffee-house-demo/");
const unescape = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[key]);
const meta = (html, key) => unescape(html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1] ?? "");

for (const language of ["tr", "en", "ru"]) test(`${language}: every shared product includes its own preview in the original HTML`, async () => {
  for (const product of products) {
    const path = feedSharePath(product.id, language);
    const html = readFileSync(path, "utf8");
    const head = html.split("</head>")[0];
    const title = `${product.item.name[language]} · Roby's Coffee House`;
    const canonical = new URL(path, base);
    assert.match(html, new RegExp(`<html lang="${language}"`));
    assert.equal(meta(head, "og:title"), title);
    assert.equal(meta(head, "og:url"), canonical.href);
    assert.ok(head.includes(`<link rel="canonical" href="${canonical.href}"`));
    assert.equal(meta(head, "og:type"), "website");
    assert.equal(meta(head, "twitter:card"), "summary_large_image");
    assert.equal(meta(head, "twitter:title"), title);
    assert.ok(meta(head, "og:description").includes(product.category.name[language]));
    assert.equal(meta(head, "og:image:alt"), product.item.name[language]);
    const image = new URL(meta(head, "og:image"));
    assert.ok(image.href.startsWith(`${base}src/products/share-v1/${product.id.replace(":", "--")}-`));
    assert.equal(meta(head, "twitter:image"), image.href);
    assert.equal(meta(head, "og:image:type"), "image/jpeg");
    const localImage = decodeURIComponent(image.pathname.slice(base.pathname.length));
    const bytes = readFileSync(localImage);
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    assert.ok(localImage.endsWith(`-${digest}.jpg`), "Image URLs change when their contents change");
    const actual = await sharp(bytes).metadata();
    const original = await sharp(product.image).metadata();
    assert.equal(actual.format, "jpeg");
    assert.equal(meta(head, "og:image:width"), String(actual.width));
    assert.equal(meta(head, "og:image:height"), String(actual.height));
    assert.ok(Math.abs(actual.width / actual.height - original.width / original.height) < .002, "The full photo aspect ratio is retained");
    assert.ok(bytes.length < 1024 * 1024);
    assert.doesNotMatch(head, /http-equiv="refresh"/i, "Crawlers should receive the product metadata before any browser navigation");
    const target = new URL(unescape(html.match(/id="menu-share-open" href="([^"]+)"/)[1]), canonical);
    assert.equal(target.pathname, `${base.pathname}menu-feed.html`);
    assert.equal(target.searchParams.get("view"), "feed");
    assert.deepEqual(parseFeedEntry(target, products), { language, category: product.category.id, productId: product.id });
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const asset = new URL(unescape(match[1]), canonical);
      if (asset.origin !== base.origin || !asset.pathname.startsWith(base.pathname)) continue;
      assert.ok(existsSync(decodeURIComponent(asset.pathname.slice(base.pathname.length))), `Missing ${asset.href}`);
    }
  }
});

test("JPEG delivery copies retain the approved photo rather than a generic preview", async () => {
  for (const product of products) {
    const html = readFileSync(feedSharePath(product.id, "en"), "utf8");
    const image = new URL(meta(html, "og:image"));
    const path = image.pathname.slice(base.pathname.length);
    const source = await sharp(product.image).resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const preview = await sharp(path).resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer();
    assert.equal(source.length, preview.length);
    const meanError = source.reduce((sum, value, index) => sum + Math.abs(value - preview[index]), 0) / source.length;
    assert.ok(meanError < 5, `Wrong or altered photo for ${product.id}: ${meanError}`);
  }
});
