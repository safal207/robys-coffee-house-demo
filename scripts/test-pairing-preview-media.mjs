import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("pairing media gate rejects the shipped MP4 with boxes but no decodable frames", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-pairing-preview-media.mjs",
    "qa/fixtures/media/pairing-no-decodable-frames.mp4"], { encoding: "utf8", timeout: 40_000 });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, "the actual previously shipped bad video must never pass the release gate");
  assert.match(result.stderr, /incomplete\/undecodable video/);
});

test("the restored pairing clip decodes its complete frame sequence", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-pairing-preview-media.mjs"],
    { encoding: "utf8", timeout: 40_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const resultBody = JSON.parse(result.stdout);
  assert.ok(resultBody.decodedFrames >= 2);
  assert.ok(resultBody.duration > 0);
});
