import assert from "node:assert/strict";
import test from "node:test";
import { runFeedViewerCases, withViewerSetupDiagnostics } from "./menu-feed-viewer-browser-cases.mjs";

const catalog = Array.from({ length: 3 }, (_, index) => ({ id: String(index), category: { id: "hot-coffee" } }));
const base = { origin: "https://example.test", engine: "webkit", output: ".", catalog,
  observeErrors() {}, captureScreenshot() {} };

test("context creation failure retains the active case and the original error", async () => {
  const original = new Error("browser disconnected"), report = { cases: [] };
  await assert.rejects(runFeedViewerCases({ ...base, report, browser: { async newContext() { throw original; } } }),
    error => error === original);
  assert.deepEqual(report.viewerSetup, { engine: "webkit", case: "stories-qualified-views-pause-share-order",
    width: 390, height: 844, language: "en", reducedMotion: "no-preference", stage: "newContext",
    status: "failed", error: { name: "Error", message: "browser disconnected" } });
  assert.deepEqual(report.cases, []);
});

test("newPage failure keeps its stage and identity even when cleanup rejects", async () => {
  const original = new Error("browser closed"), report = { cases: [] };
  let closed = 0;
  const markers = [], previousLog = console.log;
  console.log = message => { markers.push(message); };
  const context = { async route() {}, async addInitScript() {}, async newPage() { throw original; },
    async close() { closed++; throw new Error("cleanup failed"); } };
  try {
    await assert.rejects(runFeedViewerCases({ ...base, report, browser: { async newContext() { return context; } } }),
      error => error === original);
  } finally {
    console.log = previousLog;
  }
  assert.deepEqual(markers.map(line => {
    const [prefix, json] = line.split(/ (.+)/);
    const record = JSON.parse(json);
    return [prefix, record.case, record.stage];
  }), [
    ["VIEWER_SETUP", "stories-qualified-views-pause-share-order", "newContext"],
    ["VIEWER_SETUP_STAGE", "stories-qualified-views-pause-share-order", "route"],
    ["VIEWER_SETUP_STAGE", "stories-qualified-views-pause-share-order", "addInitScript"],
    ["VIEWER_SETUP_STAGE", "stories-qualified-views-pause-share-order", "newPage"],
  ]);
  assert.equal(closed, 1);
  assert.equal(report.viewerSetup.case, "stories-qualified-views-pause-share-order");
  assert.equal(report.viewerSetup.stage, "newPage");
  assert.equal(report.viewerSetup.status, "failed");
  assert.equal(report.viewerSetup.error.message, "browser closed");
  assert.deepEqual(report.cases, []);
});

test("dynamic localization case remains identifiable before a page exists", async () => {
  const report = { cases: [] }, original = new Error("page rejected");
  let closed = 0;
  await assert.rejects(withViewerSetupDiagnostics({ report, engine: "webkit", caseName: "stories-localization-en-1440",
    profile: { width: 1440, height: 1000, language: "en", reducedMotion: "reduce" } },
  async ({ setStage, trackContext }) => {
    trackContext({ close() { closed++; } }); setStage("newPage"); throw original;
  }), error => error === original);
  assert.equal(closed, 1);
  assert.equal(report.viewerSetup.case, "stories-localization-en-1440");
  assert.equal(report.viewerSetup.width, 1440);
  assert.equal(report.viewerSetup.stage, "newPage");
});

test("successful setup is returned without closing the context or adding a passing case", async () => {
  const report = { cases: [] }, result = { page: {} };
  let closed = false;
  assert.equal(await withViewerSetupDiagnostics({ report, engine: "webkit", caseName: "example",
    profile: { width: 390, height: 844, language: "tr" } }, async ({ trackContext }) => {
    trackContext({ close() { closed = true; } }); return result;
  }), result);
  assert.equal(report.viewerSetup.status, "complete");
  assert.equal(report.viewerSetup.stage, "complete");
  assert.equal(closed, false);
  assert.deepEqual(report.cases, []);
});
