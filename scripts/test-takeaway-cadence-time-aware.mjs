import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cadenceTimeAware } from "./takeaway-cadence-time-aware.mjs";

function probeFromPositions(positions, interval = 16.67) {
  const frames = positions.map((position, index) => ({
    at: index * interval,
    state: "brand-frame",
    transform: `matrix(1, 0, 0, 1, 0, ${position})`,
    opacity: Math.min(1, index / Math.max(1, positions.length - 1)),
    overlayOpacity: 1,
    overlayTransform: "none"
  }));
  frames.push(
    { at: positions.length * interval, state: "handoff", transform: "none", opacity: 1, overlayOpacity: 1, overlayTransform: "none" },
    { at: (positions.length + 1) * interval, state: "handoff", transform: "none", opacity: 1, overlayOpacity: 0.7, overlayTransform: "none" }
  );
  return { frames };
}

test("accepts a long ease-out sampling tail when the entrance already made sufficient monotonic progress", () => {
  const positions = [10,9.4,8.8,8.2,7.6,7,6.4,5.8,5.2,4.6,4,3.5,3,2.6,2.3,2.1,2.1,2.1,2.1,2.1,2.1,2.1,2.1,2.1];
  const result = cadenceTimeAware(probeFromPositions(positions));
  assert.equal(result.movingTransitions, 15);
  assert.equal(result.longestFlatDurationMs > 100, true);
  assert.equal(result.totalMovementPx > 7, true);
});

test("rejects an entrance that has too few progressing transitions even when total travel is large enough", () => {
  const positions = [10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5,4.5,4,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5,3.5];
  assert.throws(
    () => cadenceTimeAware(probeFromPositions(positions)),
    /progressed on only/
  );
});

test("rejects reversed entrance motion", () => {
  const positions = [10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5.2,5.4,4.8,4.3,3.8,3.3,2.8,2.3,1.8,1.4,1,0.7,0.4,0.2];
  assert.throws(
    () => cadenceTimeAware(probeFromPositions(positions)),
    /movement reversed/
  );
});

test("pins the product entrance to continuous cubic-bezier easing instead of steps", () => {
  const source = readFileSync("takeaway-entry.js", "utf8");
  assert.match(
    source,
    /duration:\s*cold\s*\?\s*700\s*:\s*250,\s*easing:\s*["']cubic-bezier\(\.22,1,\.36,1\)["']/,
    "Takeaway entrance must retain its reviewed continuous easing"
  );
  assert.doesNotMatch(source, /steps\s*\(/i, "Takeaway entrance must not use stepped easing");
});
