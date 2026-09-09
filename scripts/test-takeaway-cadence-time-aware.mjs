import assert from "node:assert/strict";
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

test("allows a short compositor plateau without calling a continuous entrance stepped", () => {
  const positions = [10,9.5,9,8.5,8,7.5,7,6.5,6,6,6,5.4,4.9,4.4,3.9,3.4,2.9,2.4,1.9,1.4,1,0.7,0.4,0.2];
  const result = cadenceTimeAware(probeFromPositions(positions));
  assert.equal(result.longestFlatDurationMs < 42, true);
  assert.equal(result.totalMovementPx > 9, true);
});

test("rejects a real visual stall even when requestAnimationFrame cadence stays near 60 Hz", () => {
  const positions = [10,9.5,9,8.5,8,7.5,7,6.5,6,6,6,6,5.8,5.4,5,4.5,4,3.5,3,2.5,2,1.5,1,0.5];
  assert.throws(
    () => cadenceTimeAware(probeFromPositions(positions)),
    /visually stalled/
  );
});

test("rejects reversed entrance motion", () => {
  const positions = [10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5.2,5.4,4.8,4.3,3.8,3.3,2.8,2.3,1.8,1.4,1,0.7,0.4,0.2];
  assert.throws(
    () => cadenceTimeAware(probeFromPositions(positions)),
    /movement reversed/
  );
});
