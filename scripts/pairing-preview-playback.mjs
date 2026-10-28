import { withDeadline } from "./live-smoke-deadlines.mjs";

// Runs inside the browser: a moving clock or a playing event alone is not
// sufficient evidence that the decoder presented video frames.
export async function observeDecodedVideo(video, observationMs) {
  const startedAt = performance.now();
  let presentedFrames = 0;
  let callback;
  const frame = (_now, metadata) => {
    presentedFrames = metadata.presentedFrames;
    callback = video.requestVideoFrameCallback(frame);
  };
  if (typeof video.requestVideoFrameCallback === "function") callback = video.requestVideoFrameCallback(frame);
  try {
    while (performance.now() - startedAt < observationMs) {
      const quality = video.getVideoPlaybackQuality?.();
      const decodedFrames = Math.max(presentedFrames,
        quality ? quality.totalVideoFrames - quality.droppedVideoFrames : 0, video.webkitDecodedFrameCount ?? 0);
      const state = { started: decodedFrames >= 2 && video.currentTime > 0 && video.readyState >= 2,
        decodedFrames, currentTime: video.currentTime, width: video.videoWidth, height: video.videoHeight,
        readyState: video.readyState, errorCode: video.error?.code ?? 0, currentSrc: video.currentSrc };
      if (state.errorCode || !video.isConnected || state.started) return state;
      if (video.ended) return state;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return { started: false, error: "No decoded video frames before the playback deadline" };
  } finally {
    if (callback !== undefined) video.cancelVideoFrameCallback(callback);
  }
}

export async function verifyPairingPreviewPlayback(page, { timeoutMs = 8000, expectedSource } = {}) {
  const card = page.locator('.poster-card[data-product-id="san-sebastian"]');
  await card.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await card.click({ timeout: timeoutMs });
  const video = card.locator("video.pairing-preview-video");
  await video.waitFor({ state: "attached", timeout: timeoutMs });
  const state = await withDeadline(video.evaluate(observeDecodedVideo, timeoutMs),
    timeoutMs + 1500, "pairing preview decoded-frame observation");
  if (!state.started || state.errorCode || !state.currentSrc?.includes("iced-san-sebastian-pairing-preview.mp4")) {
    throw new Error(`Pairing preview did not decode: ${JSON.stringify(state)}`);
  }
  if (expectedSource && state.currentSrc !== new URL(expectedSource, page.url()).href) {
    throw new Error(`Pairing preview is stale: ${state.currentSrc}; expected ${expectedSource}`);
  }
  return state;
}
