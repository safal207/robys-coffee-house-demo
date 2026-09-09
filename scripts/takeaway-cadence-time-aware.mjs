const assert = (condition, message) => {
  if (!condition) throw new Error(`[TAKEAWAY-001] ${message}`);
};

function translateYPx(transform) {
  if (!transform || transform === "none") return 0;
  const translate = transform.match(/^translateY\((-?[\d.]+)px\)$/);
  if (translate) return Number(translate[1]);
  const matrix = transform.match(/^matrix\(([^)]+)\)$/);
  if (matrix) {
    const values = matrix[1].split(",").map(Number);
    return values.length === 6 ? values[5] : Number.NaN;
  }
  const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3d) {
    const values = matrix3d[1].split(",").map(Number);
    return values.length === 16 ? values[13] : Number.NaN;
  }
  return Number.NaN;
}

export function cadenceTimeAware(probe) {
  const frames = probe.frames.filter((frame) => frame.state === "brand-frame").slice(0, 24);
  assert(frames.length === 24, `Only ${frames.length}/24 entrance frames captured`);

  const positions = frames.map((frame) => translateYPx(frame.transform));
  assert(positions.every(Number.isFinite), "Entrance transform could not be measured");

  let movingTransitions = 0;
  let flatStartedAt = null;
  let longestFlatDurationMs = 0;
  let largestReversePx = 0;

  for (let i = 1; i < frames.length; i++) {
    assert(frames[i].opacity + .002 >= frames[i - 1].opacity, "Entrance opacity reversed");

    const progressPx = positions[i - 1] - positions[i];
    if (progressPx < -0.02) largestReversePx = Math.max(largestReversePx, -progressPx);

    if (Math.abs(progressPx) <= 0.01) {
      if (flatStartedAt === null) flatStartedAt = frames[i - 1].at;
      longestFlatDurationMs = Math.max(longestFlatDurationMs, frames[i].at - flatStartedAt);
    } else {
      if (progressPx > 0.01) movingTransitions += 1;
      flatStartedAt = null;
    }
  }

  assert(largestReversePx <= 0.02, `Entrance movement reversed by ${largestReversePx.toFixed(3)} px`);

  const intervals = frames.slice(1).map((frame, i) => frame.at - frames[i].at).sort((a, b) => a - b);
  const medianFrameIntervalMs = intervals[Math.floor(intervals.length / 2)];
  const totalMovementPx = positions[0] - positions.at(-1);

  assert(totalMovementPx >= 6, `Entrance moved only ${totalMovementPx.toFixed(3)} px across sampled frames`);
  assert(movingTransitions >= 15, `Entrance progressed on only ${movingTransitions}/23 sampled transitions`);
  assert(longestFlatDurationMs <= 42, `Entrance visually stalled for ${longestFlatDurationMs.toFixed(2)} ms`);
  assert(medianFrameIntervalMs <= 20.5, `Median cadence ${medianFrameIntervalMs.toFixed(2)} ms exceeded 60 Hz gate`);

  const fade = probe.frames.filter((frame) => frame.state === "handoff");
  assert(fade.length >= 2, "No actual exit fade was sampled");
  for (let i = 0; i < fade.length; i++) {
    assert(fade[i].overlayTransform === "none", "Exit moved or zoomed the full-screen surface");
    if (i) assert(fade[i].overlayOpacity <= fade[i - 1].overlayOpacity + .002, "Exit opacity reversed");
  }

  return {
    movingTransitions,
    longestFlatDurationMs,
    largestReversePx,
    totalMovementPx,
    medianFrameIntervalMs,
    frames,
    fade
  };
}
