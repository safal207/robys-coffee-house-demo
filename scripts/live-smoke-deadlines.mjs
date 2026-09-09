export class LiveSmokeTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`[LIVE-001] ${label} timed out after ${timeoutMs} ms`);
    this.name = "LiveSmokeTimeoutError";
    this.code = "LIVE_SMOKE_TIMEOUT";
    this.timeoutMs = timeoutMs;
  }
}

function normalizeTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value <= 0) throw new TypeError("timeoutMs must be a positive finite number");
  return value;
}

export async function withDeadline(promise, timeoutMs, label = "operation") {
  const timeout = normalizeTimeout(timeoutMs);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new LiveSmokeTimeoutError(label, timeout)), timeout);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBounded(input, init, timeoutMs, label, consumeBody) {
  const timeout = normalizeTimeout(timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new LiveSmokeTimeoutError(label, timeout)), timeout);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!consumeBody) return response;
    const body = await response.text();
    return { response, body };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof LiveSmokeTimeoutError) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchResponseWithDeadline(input, init = {}, timeoutMs = 15000, label = "fetch") {
  return fetchBounded(input, init, timeoutMs, label, false);
}

export function fetchTextWithDeadline(input, init = {}, timeoutMs = 15000, label = "fetch text") {
  return fetchBounded(input, init, timeoutMs, label, true);
}
