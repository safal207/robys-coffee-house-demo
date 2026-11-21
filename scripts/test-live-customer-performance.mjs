import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROUTES, REPETITIONS, percentile, summarize } from "./audit-live-customer-performance.mjs";

test("mobile audit covers home, list, and photo feed without changing production", () => {
  assert.deepEqual(ROUTES.map(r => r.id), ["home", "menu-list", "photo-feed"]);
  assert.equal(REPETITIONS, 3);
  const source = readFileSync(new URL("./audit-live-customer-performance.mjs", import.meta.url), "utf8");
  assert.match(source, /serviceWorkers: "block"/);
  assert.match(source, /published-GitHub-Pages/);
  assert.match(source, /newCDPSession/);
  assert.match(source, /validatePublishedBuild/);
  assert.match(source, /firstPhotoReadyMs/);
  assert.match(source, /scrollIntoViewIfNeeded/);
  assert.match(source, /cacheState === "cold"/);
});

test("median and p90 are sample-based, deterministic and order-independent", () => {
  assert.equal(percentile([100, 300, 200], 0.5), 200);
  assert.equal(percentile([100, 300, 200], 0.9), 280);
  assert.equal(percentile([300, 100, 200], 0.9), 280);
  assert.throws(() => percentile([], 0.5));
  assert.throws(() => percentile([1, -2, 3], 0.5));
});

test("missing paint evidence stays unavailable rather than becoming a fabricated zero", () => {
  const samples = [1, 2, 3].map(v => ({
    fcpMs: null, lcpMs: v * 1000, semanticReadyMs: v * 100,
    firstPhotoReadyMs: null, imageTransferBytes: v * 1024,
    scriptTransferBytes: 0, stylesheetTransferBytes: 0, resourceCount: 4
  }));
  const summary = summarize(samples);
  assert.deepEqual(summary.fcpMs, { unavailable: true, observed: 0 });
  assert.deepEqual(summary.firstPhotoReadyMs, { unavailable: true, observed: 0 });
  assert.equal(summary.semanticReadyMs.median, 200);
  assert.equal(summary.imageTransferBytes.p90, 2867.2);
  assert.throws(() => summarize(samples.slice(0, 2)));
});
