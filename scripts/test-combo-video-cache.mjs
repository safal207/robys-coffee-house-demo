import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const core = readFileSync(new URL("../sw-core-v64.js", import.meta.url), "utf8");
const family = "/src/products/occasion-sets-v1/family-motion-v1.mp4";
const familyWebm = "/src/products/occasion-sets-v1/family-motion-v1.webm";
const pairing = "/src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4";
const origin = "https://example.test";

function loadWorker(paths = []) {
  const handlers = new Map();
  const requests = paths.map(path => new Request(origin + path));
  const deleted = [];
  const fetched = [];
  const cache = {
    async keys() { return requests; },
    async delete(request) { deleted.push(new URL(request.url).pathname); return true; }
  };
  runInNewContext(worker, {
    URL,
    self: {
      location: { origin },
      clients: { async claim() {} },
      skipWaiting() {},
      addEventListener(name, handler) { handlers.set(name, handler); }
    },
    caches: { async keys() { return ["previous"]; }, async open() { return cache; } },
    async fetch(request, options) {
      fetched.push({ request, options });
      return new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/100" } });
    },
    importScripts(file) { assert.equal(file, "./sw-core-v64.js"); }
  });
  return { handlers, deleted, fetched };
}

test("on-demand combo and pairing videos preserve Range requests outside the cache layer", async () => {
  const { handlers, fetched } = loadWorker();
  for (const path of [family, familyWebm, pairing]) {
    const request = new Request(origin + "/robys-coffee-house-demo" + path, { headers: { Range: "bytes=0-3" } });
    let response;
    let stopped = false;
    handlers.get("fetch")({ request, stopImmediatePropagation() { stopped = true; }, respondWith(value) { response = value; } });
    assert.equal(stopped, true, "legacy cache-first listener must not intercept partial video requests");
    assert.equal((await response).status, 206);
    const call = fetched.at(-1);
    assert.equal(call.request, request);
    assert.equal(call.request.headers.get("range"), "bytes=0-3");
    assert.equal(call.options.cache, "no-store");
  }
});

test("the preview bypass leaves other resources, origins and methods to their normal handlers", () => {
  const { handlers, fetched } = loadWorker();
  for (const request of [new Request(origin + "/menu.html"), new Request("https://other.test" + family), new Request(origin + family, { method: "HEAD" })]) {
    handlers.get("fetch")({ request, stopImmediatePropagation() { assert.fail("unexpected bypass"); }, respondWith() { assert.fail("unexpected response"); } });
  }
  assert.equal(fetched.length, 0);
});

test("activation removes old preview video cache entries without deleting menu photos", async () => {
  const keep = "/robys-coffee-house-demo/src/products/occasion-sets-v1/family.webp";
  const removed = [family, familyWebm, pairing].map(path => "/robys-coffee-house-demo" + path);
  const { handlers, deleted } = loadWorker([...removed, keep]);
  let completion;
  handlers.get("activate")({ waitUntil(value) { completion = value; } });
  await completion;
  assert.deepEqual(deleted.sort(), removed.sort());
});

test("the family clip stays small and is never part of offline installation downloads", () => {
  const precache = core.match(/const CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  assert.ok(precache);
  assert.ok(!precache.includes("family-motion-v1.mp4"));
  assert.ok(!precache.includes("family-motion-v1.webm"));
  const asset = new URL("../src/products/occasion-sets-v1/family-motion-v1.mp4", import.meta.url);
  const mp4Bytes = readFileSync(asset);
  assert.ok(mp4Bytes.length <= 350_000, "keep the three-second on-demand clip within its transfer budget");
  assert.equal(mp4Bytes.subarray(4, 8).toString(), "ftyp");
  const webm = new URL("../src/products/occasion-sets-v1/family-motion-v1.webm", import.meta.url);
  const webmBytes = readFileSync(webm);
  assert.ok(webmBytes.length <= 350_000, "the compatible fallback also stays within the transfer budget");
  assert.equal(webmBytes.subarray(0, 4).toString("hex"), "1a45dfa3");
});
