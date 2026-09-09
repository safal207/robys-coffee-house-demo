import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LiveSmokeTimeoutError,
  fetchTextWithDeadline,
  withDeadline
} from "./live-smoke-deadlines.mjs";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("withDeadline rejects a never-settling operation", async () => {
  const started = Date.now();
  await assert.rejects(
    withDeadline(new Promise(() => {}), 25, "never settles"),
    (error) => error instanceof LiveSmokeTimeoutError
      && error.code === "LIVE_SMOKE_TIMEOUT"
      && /never settles timed out after 25 ms/.test(error.message)
  );
  assert.ok(Date.now() - started < 500, "deadline must fail well before a workflow-level timeout");
});

test("fetchTextWithDeadline aborts when response headers arrive but the body stalls", async () => {
  globalThis.fetch = async (_input, init = {}) => ({
    ok: true,
    status: 200,
    url: "https://example.test/stalled",
    headers: new Headers(),
    text: () => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    })
  });

  await assert.rejects(
    fetchTextWithDeadline("https://example.test/stalled", {}, 30, "stalled body"),
    (error) => error instanceof LiveSmokeTimeoutError
      && error.code === "LIVE_SMOKE_TIMEOUT"
      && /stalled body timed out after 30 ms/.test(error.message)
  );
});

test("fetchTextWithDeadline preserves a successful response and body", async () => {
  globalThis.fetch = async () => new Response("published", {
    status: 200,
    headers: { "content-type": "text/plain" }
  });

  const { response, body } = await fetchTextWithDeadline(
    "https://example.test/published",
    {},
    100,
    "published page"
  );
  assert.equal(response.status, 200);
  assert.equal(body, "published");
});

test("LIVE-001 source and workflow keep every external wait bounded", () => {
  const source = readFileSync("scripts/live-smoke.mjs", "utf8");
  const workflow = readFileSync(".github/workflows/live-smoke.yml", "utf8");

  assert.match(source, /fetchTextWithDeadline/);
  assert.match(source, /fetchResponseWithDeadline/);
  assert.match(source, /withDeadline\(page\.locator\("\.hero-video"\)\.evaluate/);
  assert.match(source, /persistReport\(\);/);
  assert.match(workflow, /ROBYS_LIVE_ATTEMPTS:\s*4/);
  assert.match(workflow, /ROBYS_LIVE_DELAY_MS:\s*5000/);
  assert.match(workflow, /ROBYS_LIVE_FETCH_TIMEOUT_MS:\s*15000/);
  assert.match(workflow, /ROBYS_LIVE_VIDEO_TIMEOUT_MS:\s*8000/);
});
