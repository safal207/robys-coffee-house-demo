import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const files = ["app.js", "mobile.css", "menu-preview.css"];
const scope = "https://example.test/robys-coffee-house-demo/";
const digest = bytes => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const readInputs = () => ({ html: readFileSync("index.html", "utf8"), worker: readFileSync("sw-core-v64.js", "utf8"),
  assets: Object.fromEntries(files.map(file => [file, readFileSync(file)])) });

// Bounded, quote-aware traversal of the authored HTML. Comments, templates and
// raw text cannot supply a delivery reference. No HTML is rewritten or cleaned.
function deliveredTags(html) {
  const tags = [];
  const inert = [];
  let position = 0;
  while ((position = html.indexOf("<", position)) >= 0) {
    if (html.startsWith("<!--", position)) {
      const ends = [html.indexOf("-->", position + 4), html.indexOf("--!>", position + 4)].filter(value => value >= 0);
      assert.ok(ends.length, "Authored HTML comment must terminate");
      const end = Math.min(...ends);
      position = end + (html.startsWith("--!>", end) ? 4 : 3);
      continue;
    }
    if (html.startsWith("<!", position)) {
      const end = html.indexOf(">", position + 2);
      assert.ok(end >= 0 && /^<!doctype\s+html\s*>$/i.test(html.slice(position, end + 1)), "Unsupported authored HTML declaration");
      position = end + 1;
      continue;
    }
    const start = position;
    const match = /^<(\/)?([a-z][a-z0-9:-]*)/i.exec(html.slice(position));
    if (!match) { position += 1; continue; }
    const name = match[2].toLowerCase(), closing = Boolean(match[1]);
    position += match[0].length;
    const attributes = Object.create(null);
    while (position < html.length) {
      while (/\s/.test(html[position] ?? "")) position += 1;
      if (html[position] === ">" || html.startsWith("/>", position)) { position += html[position] === ">" ? 1 : 2; break; }
      const attribute = /^[^\s=/>"'`<]+/.exec(html.slice(position));
      assert.ok(attribute, "Authored HTML attribute must have a name");
      const key = attribute[0].toLowerCase();
      assert.ok(!Object.hasOwn(attributes, key), "Authored HTML attribute must not repeat");
      position += attribute[0].length;
      while (/\s/.test(html[position] ?? "")) position += 1;
      let value = "";
      if (html[position] === "=") {
        position += 1;
        while (/\s/.test(html[position] ?? "")) position += 1;
        const quote = ["'", '"'].includes(html[position]) ? html[position++] : null;
        if (quote) {
          const end = html.indexOf(quote, position);
          assert.ok(end >= 0, "Authored HTML attribute quote must terminate");
          value = html.slice(position, end); position = end + 1;
        } else {
          const unquoted = /^[^\s>"'`<=]+/.exec(html.slice(position));
          assert.ok(unquoted, "Authored HTML attribute value must be well formed");
          value = unquoted[0]; position += value.length;
        }
      }
      attributes[key] = value;
    }
    assert.ok(html[position - 1] === ">", "Authored HTML tag must terminate");
    if (closing) {
      if (name === "template") { assert.equal(inert.pop(), name, "Templates must nest correctly"); }
      continue;
    }
    assert.ok(!["svg", "math", "select", "frameset"].includes(name), "Unsupported authored HTML parsing context");
    if (name === "template") { inert.push(name); continue; }
    const delivered = !inert.length && ["link", "script"].includes(name) ? { name, attributes, start, end: position } : null;
    if (delivered) tags.push(delivered);
    if (["script", "style", "title", "textarea", "iframe", "noscript", "xmp", "noembed", "noframes"].includes(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])[^>]*>`, "ig");
      close.lastIndex = position;
      const end = close.exec(html);
      assert.ok(end, "Authored HTML raw-text element must terminate");
      // Escaped script tokenization is outside this authored-page contract.
      assert.ok(name !== "script" || !html.slice(position, end.index).includes("<!--"), "Unsupported escaped script syntax");
      position = close.lastIndex;
      if (delivered) delivered.elementEnd = position;
    }
  }
  assert.equal(inert.length, 0, "Templates must terminate");
  return tags;
}

function workerContext(worker, additions = {}) {
  const context = { URL, self: { registration: { scope }, addEventListener() {} }, ...additions };
  runInNewContext(`${worker}\nglobalThis.homeCacheEvidence = { assets: CORE_ASSETS, version: CACHE_VERSION };`, context);
  return context;
}

function verifyDelivery({ html, worker, assets }) {
  const tags = deliveredTags(html);
  const { homeCacheEvidence } = workerContext(worker);
  for (const file of files) {
    const expected = `${file}?v=${digest(assets[file])}`;
    const candidates = tags.filter(({ name, attributes }) => {
      const url = name === "script" ? attributes.src : attributes.href;
      const stylesheet = (attributes.rel ?? "").toLowerCase().split(/\s+/).includes("stylesheet");
      return url && (file.endsWith(".js") ? name === "script" : name === "link" && stylesheet)
        && new URL(url, scope).pathname.endsWith(`/${file}`);
    });
    assert.equal(candidates.length, 1, `${file}: exactly one active HTML delivery reference required`);
    const { attributes } = candidates[0];
    assert.equal(attributes[file.endsWith(".js") ? "src" : "href"], expected, `${file}: HTML must use actual content revision`);
    if (file.endsWith(".css")) {
      assert.ok(!Object.hasOwn(attributes, "disabled") && !(attributes.rel ?? "").split(/\s+/).includes("alternate"), `${file}: stylesheet must apply`);
      assert.ok(!attributes.media || attributes.media === "all", `${file}: stylesheet must apply at every viewport`);
    }
    const cached = Array.from(homeCacheEvidence.assets).filter(url => new URL(url, scope).pathname.endsWith(`/${file}`));
    assert.deepEqual(cached, [`./${expected}`], `${file}: actual worker precache must use exact content revision`);
  }
  const revision = digest(files.map(file => digest(assets[file])).join(":"));
  assert.ok(homeCacheEvidence.version.includes(`-home-navigation-${revision}-`), "Home cache namespace must bind all three actual asset digests");
  return { revision, tags };
}

test("shipped home HTML, worker precache and namespace bind all navigation bytes", () => {
  verifyDelivery(readInputs());
});

test("delivery verifier rejects stale bytes, HTML, precache and namespace independently", () => {
  const original = readInputs();
  for (const file of files) {
    const expected = `${file}?v=${digest(original.assets[file])}`;
    const stale = `${file}?v=000000000000`;
    assert.throws(() => verifyDelivery({ ...original, assets: { ...original.assets, [file]: Buffer.concat([original.assets[file], Buffer.from("\n")]) } }), /actual content revision/, `${file}: changed bytes`);
    assert.throws(() => verifyDelivery({ ...original, html: original.html.replace(expected, stale) }), /actual content revision/, `${file}: stale HTML`);
    assert.throws(() => verifyDelivery({ ...original, worker: original.worker.replace(`"./${expected}"`, `"./${stale}"`) }), /actual worker precache/, `${file}: stale precache`);
    const updatedAssets = { ...original.assets, [file]: Buffer.concat([original.assets[file], Buffer.from("\n")]) };
    const updatedUrl = `${file}?v=${digest(updatedAssets[file])}`;
    assert.throws(() => verifyDelivery({ assets: updatedAssets, html: original.html.replace(expected, updatedUrl), worker: original.worker.replace(`"./${expected}"`, `"./${updatedUrl}"`) }), /namespace must bind/, `${file}: matching new URLs with stale namespace`);
  }
  const { revision } = verifyDelivery(original);
  assert.throws(() => verifyDelivery({ ...original, worker: original.worker.replace(`-home-navigation-${revision}-`, "-home-navigation-000000000000-") }), /namespace must bind/);
});

test("comments, templates and raw text cannot manufacture an active HTML delivery reference", () => {
  const original = readInputs();
  for (const file of files) {
    const tag = deliveredTags(original.html).find(({ attributes }) => (attributes.src ?? attributes.href ?? "").startsWith(`${file}?`));
    assert.ok(tag, `${file}: positive fixture must contain the active reference`);
    const end = tag.elementEnd ?? tag.end;
    const markup = original.html.slice(tag.start, end);
    for (const inert of [`<!--\n${markup}\n-->`, `<template>${markup}</template>`, `<style>/* ${markup} */</style>`]) {
      const html = original.html.slice(0, tag.start) + inert + original.html.slice(end);
      assert.throws(() => verifyDelivery({ ...original, html }), /exactly one active HTML delivery reference/, `${file}: inert-only mention`);
    }
  }
});

async function verifyReturningCache(worker, file, revision) {
  const oldUrl = new URL(`${file}?v=previous-cached-revision`, scope).href;
  const freshUrl = new URL(`${file}?v=${revision}`, scope).href;
  const entries = new Map([[oldUrl, `old-${file}`]]), requests = [];
  const context = workerContext(worker, {
    caches: { async open() { return {
      async match(request, options) { return options?.ignoreSearch ? [...entries].find(([url]) => new URL(url).pathname === new URL(request.url).pathname)?.[1] : entries.get(request.url); },
      async put(request, response) { entries.set(request.url, response); }
    }; } },
    async fetch(request) { requests.push(request.url); return { ok: true, body: `new-${file}`, clone() { return `new-${file}`; } }; }
  });
  assert.equal(await context.cachedResponse({ url: freshUrl }), undefined, `${file}: stale query must not satisfy current URL`);
  assert.equal(await context.cachedResponse({ url: new URL(file, scope).href }), undefined, `${file}: unversioned request must not alias old query`);
  assert.equal((await context.runtimeAssetResponse({ url: freshUrl })).body, `new-${file}`);
  assert.deepEqual(requests, [freshUrl], `${file}: current bytes must be fetched once`);
  assert.equal(await context.cachedResponse({ url: freshUrl }), `new-${file}`, `${file}: exact current URL must hit cache`);
  assert.equal(await context.cachedResponse({ url: oldUrl }), `old-${file}`, `${file}: old revision retains its own identity`);
}

test("actual shipped worker isolates old queries and caches fresh navigation bytes", async () => {
  const original = readInputs();
  for (const file of files) await verifyReturningCache(original.worker, file, digest(original.assets[file]));
});

test("cache fixture detects removal of each actual exact-query guard", async () => {
  const original = readInputs();
  for (const file of files) {
    const guard = `url.pathname.endsWith("/${file}")`;
    const mutated = original.worker.replace(guard, "false");
    assert.notEqual(mutated, original.worker, `${file}: fault injection must alter the shipped guard`);
    await assert.rejects(() => verifyReturningCache(mutated, file, digest(original.assets[file])), /stale query must not satisfy/);
  }
});
