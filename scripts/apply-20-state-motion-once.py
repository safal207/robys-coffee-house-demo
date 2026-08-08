from pathlib import Path

path = Path("morning-entry.js")
text = path.read_text()

helper_marker = "function runMorningEntry({ forced }) {"
helpers = r'''const MOTION_POSE_COUNT = 20;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(from, to, progress) {
  return from + (to - from) * progress;
}

function smoothPose(progress) {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
}

function phase(progress, start, end) {
  if (end <= start) return progress >= end ? 1 : 0;
  return smoothPose((progress - start) / (end - start));
}

function poseSeries(factory) {
  return Array.from({ length: MOTION_POSE_COUNT }, (_, index) => {
    const offset = index / (MOTION_POSE_COUNT - 1);
    return { offset, ...factory(offset) };
  });
}

function peak(progress, start, peakAt, end, peakValue, endValue) {
  if (progress <= start) return 0;
  if (progress <= peakAt) return peakValue * phase(progress, start, peakAt);
  return mix(peakValue, endValue, phase(progress, peakAt, end));
}

'''
if helpers.strip() not in text:
    if helper_marker not in text:
        raise SystemExit("runMorningEntry marker not found")
    text = text.replace(helper_marker, helpers + helper_marker, 1)

start = text.index("  requestAnimationFrame(() => {", text.index(helper_marker))
end = text.index("\n\n  const finish = () => {", start)
choreography = r'''  requestAnimationFrame(() => {
    const duration = cold ? 1_420 : 560;

    animateSafe(ambient, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: phase(t, 0, .34),
        transform: `scale(${mix(1.035, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(redSurface, poseSeries((t) => {
      const p = smoothPose(t);
      const lift = Math.sin(Math.PI * t) * .28;
      return {
        opacity: phase(t, 0, .2),
        transform: `rotate(${mix(-11, -7, p).toFixed(3)}deg) translate3d(${mix(-3, 2, p).toFixed(3)}vw,${(mix(5, -1, p) - lift).toFixed(3)}vh,0) scale(${mix(1.08, 1.015, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(brownRibbon, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: .98 * phase(t, .03, .28),
        transform: `rotate(${mix(8, 5, p).toFixed(3)}deg) translate3d(${mix(7, 1, p).toFixed(3)}vw,${mix(-4, 1, p).toFixed(3)}vh,0) scale(${mix(1.06, 1.01, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(goldArc, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .05, .56, 1, .92, .68),
        transform: `rotate(${mix(19, 14, p).toFixed(3)}deg) translate3d(${mix(8, -1, p).toFixed(3)}vw,${mix(-4, 2, p).toFixed(3)}vh,0) scale(${mix(1.08, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(lightVeil, poseSeries((t) => {
      const p = smoothPose(t);
      return {
        opacity: peak(t, .08, .55, 1, .82, .48),
        transform: `translate3d(${mix(14, -5, p).toFixed(3)}%,0,0) rotate(${mix(7, 3, p).toFixed(3)}deg)`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoStage, poseSeries((t) => {
      const p = phase(t, .48, .78);
      return {
        opacity: p,
        transform: `translate(-50%, ${mix(-38, -42, p).toFixed(3)}%) scale(${mix(.92, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(logoHalo, poseSeries((t) => {
      const p = phase(t, .44, .82);
      return {
        opacity: .72 * p,
        transform: `translate(-50%, -50%) scale(${mix(.72, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(mark, poseSeries((t) => {
      const p = phase(t, .5, .74);
      return {
        opacity: p,
        transform: `translateY(${mix(10, 0, p).toFixed(3)}px) scale(${mix(.9, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });

    animateSafe(wordmark, poseSeries((t) => {
      const p = phase(t, .58, .86);
      return {
        opacity: p,
        transform: `translateY(${mix(12, 0, p).toFixed(3)}px) scale(${mix(.96, 1, p).toFixed(4)})`
      };
    }), { duration, easing: "linear", fill: "forwards" });
  });'''
text = text[:start] + choreography + text[end:]

state_marker = '  document.documentElement.dataset.robysEntryScene = "morning";\n'
pose_state = state_marker + '  document.documentElement.dataset.robysEntryPoseCount = String(MOTION_POSE_COUNT);\n'
if "dataset.robysEntryPoseCount" not in text:
    if state_marker not in text:
        raise SystemExit("entry scene dataset marker not found")
    text = text.replace(state_marker, pose_state, 1)

path.write_text(text)
