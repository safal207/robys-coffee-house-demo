#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const modulePath = fileURLToPath(import.meta.url);
const root = resolve(dirname(modulePath), "..");
const IDENTITY_REVISION = "20260723-identity-v2";
const MASTER_REVISION = "20260721-master-1";

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function verifyDiscoverWordmarkStylesheet(discoverGuard) {
  const appended = [];
  const document = {
    getElementById(id) {
      return appended.find((element) => element.id === id) ?? null;
    },
    createElement(tagName) {
      assert.equal(tagName, "link");
      return {};
    },
    head: {
      appendChild(element) {
        appended.push(element);
      }
    }
  };

  const execute = () => runInNewContext(`(() => {\n${discoverGuard}\n})()`, { document });
  execute();
  execute();

  assert.equal(appended.length, 1, "wordmark responsive stylesheet injection must be idempotent");
  assert.equal(appended[0].id, "robys-wordmark-responsive");
  assert.equal(appended[0].rel, "stylesheet");
  assert.equal(appended[0].href, "wordmark-responsive.css?v=20260704-1");
}

function verifyAccessibleBrandCopy(html, page) {
  assert.match(html, /class=["'][^"']*brand-copy[^"']*["'][^>]*>[\s\S]*?<strong>ROBY'S<\/strong>[\s\S]*?<small>COFFEE HOUSE<\/small>/i, `${page} must preserve accessible brand text`);
  assert.match(html, new RegExp(`brand-photo-logo\\.css\\?v=${IDENTITY_REVISION}`), `${page} must statically link the reviewed identity stylesheet`);
  assert.doesNotMatch(html, /brand--inverse/, `${page} must use the approved black-on-paper identity family`);
}

function verifyOfflineDelivery(serviceWorker) {
  assert.match(
    serviceWorker,
    /const CACHE_VERSION = "robys-offline-[^"]+?(?:-[a-f0-9]{12}){3}";/,
    "service-worker cache marker must remain compatible with canonical build revisioning"
  );
  for (const asset of [
    `brand-photo-logo.css?v=${IDENTITY_REVISION}`,
    `src/brand/robys-primary-master-v1.svg?v=${MASTER_REVISION}`,
    `src/brand/robys-header-master-v1.svg?v=${IDENTITY_REVISION}`,
    `src/brand/robys-compact-master-v1.svg?v=${MASTER_REVISION}`,
    `src/brand/robys-mark-master-v1.svg?v=${MASTER_REVISION}`,
    "wordmark-responsive.css?v=20260704-1"
  ]) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(serviceWorker, new RegExp(`"\\./${escaped}"`), `offline cache must include ${asset}`);
  }
  assert.doesNotMatch(serviceWorker, /robys-mobile-master-v1\.svg/, "offline delivery must not reference the retired baked mobile pill master");
  for (const pathname of [
    "/brand-photo-logo.css",
    "/wordmark-responsive.css",
    "/src/brand/robys-primary-master-v1.svg",
    "/src/brand/robys-header-master-v1.svg",
    "/src/brand/robys-compact-master-v1.svg",
    "/src/brand/robys-mark-master-v1.svg"
  ]) {
    const escaped = pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(serviceWorker, new RegExp(`url\\.pathname\\.endsWith\\("${escaped}"\\)`), `${pathname} must use exact-revision cache matching`);
  }
}

export function verifyBrandWordmark() {
  const index = read("index.html");
  const menu = read("menu.html");
  const discover = read("discover.html");
  const baseStyles = read("styles.css");
  const identityStyles = read("brand-photo-logo.css");
  const responsiveStyles = read("wordmark-responsive.css");
  const discoverGuard = read("discover-weather-guard.js");
  const serviceWorker = read("sw.js");
  const brandReference = read("docs/brand-reference-policy.md");

  for (const [page, html] of [["index.html", index], ["menu.html", menu], ["discover.html", discover]]) {
    verifyAccessibleBrandCopy(html, page);
  }

  for (const asset of [
    "src/brand/robys-primary-master-v1.svg",
    "src/brand/robys-header-master-v1.svg",
    "src/brand/robys-compact-master-v1.svg",
    "src/brand/robys-mark-master-v1.svg"
  ]) {
    assert.equal(existsSync(resolve(root, asset)), true, `missing approved SVG master: ${asset}`);
  }
  assert.equal(existsSync(resolve(root, "src/brand/robys-mobile-master-v1.svg")), false, "retired baked mobile pill master must stay removed");

  assert.match(baseStyles, /--brand-wordmark-ink:#111111/);
  assert.match(baseStyles, /--brand-wordmark-red:#E21B23/);
  assert.match(identityStyles, /--robys-brand-red:#E21B23/);
  assert.match(identityStyles, /--robys-brand-ink:#111111/);
  assert.match(identityStyles, /--robys-brand-paper:#F5F5F2/);
  assert.match(identityStyles, /--ruby:var\(--robys-brand-red\)/);
  assert.match(identityStyles, /--brand-wordmark-paper:var\(--robys-brand-paper\)/);

  assert.match(identityStyles, new RegExp(`robys-header-master-v1\\.svg\\?v=${IDENTITY_REVISION}`));
  assert.match(identityStyles, new RegExp(`robys-primary-master-v1\\.svg\\?v=${MASTER_REVISION}`));
  assert.match(identityStyles, new RegExp(`robys-compact-master-v1\\.svg\\?v=${MASTER_REVISION}`));
  assert.match(identityStyles, new RegExp(`robys-mark-master-v1\\.svg\\?v=${MASTER_REVISION}`));
  assert.doesNotMatch(identityStyles, /robys-mobile-master-v1\.svg/);
  assert.match(identityStyles, /\.brand-copy strong,[\s\S]*?clip-path:inset\(50%\)!important/);
  assert.match(identityStyles, /\.brand-copy strong::before,[\s\S]*?content:none!important/);
  assert.match(identityStyles, /@media\(max-width:680px\)[\s\S]*?robys-compact-master-v1\.svg/);
  assert.doesNotMatch(identityStyles, /font-family:/, "visual wordmark must not depend on browser fonts");
  assert.doesNotMatch(identityStyles, /scaleX\(/, "visual wordmark must not be synthesized with CSS transforms");

  assert.match(brandReference, /primary master variant uses black or near-black/);
  assert.match(brandReference, /The `O` is a red ring/);
  assert.match(brandReference, /approved digital identity tokens are red `#E21B23`, ink `#111111`, and warm paper `#F5F5F2`/);

  verifyDiscoverWordmarkStylesheet(discoverGuard);
  assert.match(responsiveStyles, /@media\(max-width:680px\)/);
  assert.match(responsiveStyles, /@media\(max-width:340px\)/);
  verifyOfflineDelivery(serviceWorker);

  console.log("PASS: production path-based Roby's wordmark contract");
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  verifyBrandWordmark();
}
