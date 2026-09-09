const originalFetch = globalThis.fetch;
const timeoutMs = Number(process.env.ROBYS_FETCH_TIMEOUT_MS ?? 15000);

globalThis.fetch = (input, init = {}) => originalFetch(input, {
  ...init,
  signal: init.signal ?? AbortSignal.timeout(timeoutMs)
});
