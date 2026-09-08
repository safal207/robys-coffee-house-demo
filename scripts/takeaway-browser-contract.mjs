// Browser evidence for the approved takeaway-v1 design. See the contract migration
// table in docs/qa/takeaway-entry-20260907.md; historical spline geometry is not
// a requirement of the replacement scene. Timing, cadence and recovery remain gates.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright";

export const CUP_PATH = "src/brand/robys-takeaway-cup-v1.webp";
export const BACKGROUND = "rgb(36, 28, 27)";
export const TITLES = { tr: "Yanına al.", en: "Take it with you.", ru: "Возьми с собой." };
export const assert = (condition, message) => { if (!condition) throw new Error(`[TAKEAWAY-001] ${message}`); };
export const save = (directory, name, value) => writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);

export async function certify({ port, resultsDir, contract }, run) {
  mkdirSync(resultsDir, { recursive: true });
  const source = { contract, design: "takeaway-v1", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
  save(resultsDir, "source.json", source);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { stdio: ["ignore", "ignore", "pipe"] });
  let serverLog = "";
  // Drain the pipe during long matrices; an unread HTTP log can block responses.
  server.stderr.on("data", chunk => { serverLog = (serverLog + chunk.toString()).slice(-16_000); });
  let browser;
  let serverError;
  server.on("error", (error) => { serverError = error; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (serverError) throw serverError;
      assert(server.exitCode === null, "Intended HTTP server exited before readiness");
      try { ready = (await fetch(baseUrl)).ok; } catch { /* Bounded server startup. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert(ready && server.exitCode === null, "HTTP server unavailable");
    browser = await chromium.launch({ headless: true });
    await run({ browser, baseUrl, resultsDir });
    save(resultsDir, "result.json", { ...source, status: "passed" });
    console.log(`✅ ${contract} passed for takeaway-v1; evidence: ${resultsDir}`);
  } catch (error) {
    save(resultsDir, "result.json", { ...source, status: "failed", message: error.message });
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    server.kill("SIGTERM");
    save(resultsDir, "server-log-tail.json", { tail: serverLog });
  }
}

export async function contextFor(browser, options = {}) {
  const { language = "tr", ...browserOptions } = options;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "tr-TR", timezoneId: "Europe/Istanbul", reducedMotion: "no-preference", serviceWorkers: "block", ...browserOptions });
  await context.addInitScript(({ language }) => {
    try { localStorage.setItem("robys-language", language); } catch { /* Optional storage. */ }
    const probe = globalThis.__takeawayProbe = { events: [], frames: [] };
    let sampling = false;
    let entranceAnimation = null;
    const nativeAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = nativeAnimate.apply(this, args);
      if (this.classList?.contains("robys-takeaway-content")) entranceAnimation = animation;
      return animation;
    };
    window.addEventListener("robys:entry-state", (event) => {
      probe.events.push({ ...event.detail, at: performance.now() });
      if (event.detail.state !== "brand-frame" || sampling) return;
      sampling = true;
      // Start at the browser's first actual animated frame, independent of how
      // quickly the external test harness returns from navigation or screenshots.
      const sample = (at) => {
        const overlay = document.querySelector(".robys-takeaway-entry");
        const content = overlay?.querySelector(".robys-takeaway-content");
        if (!content) return;
        const frame = {
          at, state: document.documentElement.dataset.robysEntryState, sampledStyle: false,
          entrancePending: entranceAnimation?.pending, entranceTime: entranceAnimation?.currentTime, entranceState: entranceAnimation?.playState
        };
        // Avoid forcing style/layout while the Web Animation is still pending.
        // Once motion has actually begun, retain the original visual sampling.
        if (entranceAnimation?.pending === false && Number(entranceAnimation.currentTime) > 0) {
          const style = getComputedStyle(content);
          const surface = getComputedStyle(overlay);
          Object.assign(frame, { sampledStyle: true, transform: style.transform, opacity: Number(style.opacity), overlayOpacity: Number(surface.opacity), overlayTransform: surface.transform });
        }
        probe.frames.push(frame);
        if (probe.frames.length < 240) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, { language });
  return context;
}

export async function done(page, timeout = 3500) {
  await page.locator('html[data-robys-entry-state="done"]').waitFor({ state: "attached", timeout });
  const state = await page.evaluate(() => ({
    overlays: document.querySelectorAll(".robys-takeaway-entry,.robys-morning-entry,.robys-contextual-entry").length,
    pending: document.documentElement.hasAttribute("data-robys-entry-pending"),
    visibility: getComputedStyle(document.documentElement).visibility,
    background: document.documentElement.style.backgroundColor,
    bodyDisplay: getComputedStyle(document.body).display,
    inert: document.body.inert
  }));
  assert(state.overlays === 0 && !state.pending, "Handoff left an overlay or prepaint shield");
  assert(state.visibility === "visible" && state.bodyDisplay !== "none" && !state.inert && state.background === "", "Handoff did not release the product document");
  return page.evaluate(() => globalThis.__takeawayProbe);
}

export function timing(probe, variant = "cold", scene) {
  const events = probe.events;
  assert(events.map((event) => event.state).join(",") === "loading,brand-frame,handoff,done", `Unexpected event sequence: ${events.map((event) => event.state)}`);
  assert(events.every((event) => event.design === "takeaway-v1" && event.variant === variant && (!scene || event.scene === scene)), "Scene, design or session variant drifted");
  const [loading, brand, handoff, finished] = events;
  const holdMs = handoff.at - brand.at;
  const totalMs = finished.at - loading.at;
  // Same 1,100–2,400 ms total cold and 400–1,100 ms warm release windows.
  assert(totalMs >= (variant === "cold" ? 1100 : 400) && totalMs <= (variant === "cold" ? 2400 : 1100), `${variant} total ${totalMs.toFixed(1)} ms exceeded release window`);
  // One approved hold replaces scene-specific choreography lengths.
  assert(holdMs >= (variant === "cold" ? 1000 : 300) && holdMs <= (variant === "cold" ? 2100 : 1150), `${variant} hold ${holdMs.toFixed(1)} ms outside window`);
  return { holdMs, totalMs, events };
}

export function cadence(probe) {
  const entrance = probe.frames.filter((frame) => frame.state === "brand-frame");
  const sampledStyle = (frame) => frame.sampledStyle !== false;
  const atOrigin = (frame) => frame.entranceTime == null || frame.entranceTime === 0;
  // Pending-light samples preserve clock/animation state without forcing style.
  // Legacy evidence has no sampledStyle field and remains fully style-sampled.
  const firstVisible = entrance.findIndex(frame => sampledStyle(frame) && frame.entrancePending === false && frame.entranceTime > 0 && frame.opacity > 0);
  assert(firstVisible >= 0, "Entrance never visibly started");
  const startup = entrance.slice(0, firstVisible);
  for (const frame of startup) {
    if (frame.sampledStyle === false) {
      assert(frame.entrancePending !== false && atOrigin(frame), "Visible motion occurred before the measured entrance");
      continue;
    }
    assert(!(frame.entrancePending === false && frame.entranceTime > 0), "First visible style sample was not visible");
    assert(frame.opacity === 0 && atOrigin(frame), "Visible motion occurred before the measured entrance");
  }
  const brandAt = probe.events.find(event => event.state === "brand-frame")?.at;
  const startupMs = entrance[firstVisible].at - brandAt;
  assert(Number.isFinite(startupMs) && startupMs >= 0 && startupMs <= 150, `Visible entrance startup ${startupMs.toFixed(1)} ms exceeded 150 ms`);
  const frames = entrance.slice(firstVisible, firstVisible + 24);
  assert(frames.length === 24, `Only ${frames.length}/24 entrance frames captured`);
  assert(frames.every(frame => sampledStyle(frame) && typeof frame.transform === "string" && Number.isFinite(frame.opacity)), "Entrance lost a visible style sample");
  let longestIdenticalRun = 1, run = 1, changingTransitions = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].transform === frames[i - 1].transform) longestIdenticalRun = Math.max(longestIdenticalRun, ++run);
    else { run = 1; changingTransitions++; }
    assert(frames[i].opacity + .002 >= frames[i - 1].opacity, "Entrance opacity reversed");
  }
  const intervals = frames.slice(1).map((frame, i) => frame.at - frames[i].at).sort((a, b) => a - b);
  const medianFrameIntervalMs = intervals[Math.floor(intervals.length / 2)];
  const uniqueTransforms = new Set(frames.map((frame) => frame.transform)).size;
  assert(uniqueTransforms >= 20 && changingTransitions >= 20 && longestIdenticalRun <= 2, `Entrance stepped: ${uniqueTransforms} transforms, ${changingTransitions} changes, ${longestIdenticalRun} identical frames`);
  assert(medianFrameIntervalMs <= 20.5, `Median cadence ${medianFrameIntervalMs.toFixed(2)} ms exceeded 60 Hz gate`);
  const fade = probe.frames.filter((frame) => frame.state === "handoff" && sampledStyle(frame));
  assert(fade.length >= 2, "No actual exit fade was sampled");
  for (let i = 0; i < fade.length; i++) {
    assert(fade[i].overlayTransform === "none", "Exit moved or zoomed the full-screen surface");
    if (i) assert(fade[i].overlayOpacity <= fade[i - 1].overlayOpacity + .002, "Exit opacity reversed");
  }
  return { uniqueTransforms, changingTransitions, longestIdenticalRun, medianFrameIntervalMs, startupMs, startup, frames, fade };
}

export async function brand(page) {
  await page.locator('html[data-robys-entry-state="brand-frame"]').waitFor({ state: "attached", timeout: 1800 });
  return page.evaluate(() => {
    const overlay = document.querySelector(".robys-takeaway-entry");
    const cup = overlay.querySelector("img");
    const content = overlay.querySelector(".robys-takeaway-content");
    const title = overlay.querySelector(".robys-takeaway-title");
    const caption = overlay.querySelector(".robys-takeaway-caption");
    const skip = overlay.querySelector("button");
    const rect = (element) => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; };
    return {
      scene: document.documentElement.dataset.robysEntryScene, title: title.textContent, language: overlay.lang,
      imagePath: new URL(cup.src).pathname, decoded: cup.complete && cup.naturalWidth === 640 && cup.naturalHeight === 918,
      background: getComputedStyle(overlay).backgroundColor, titleColor: getComputedStyle(title).color,
      captionColor: getComputedStyle(caption).color, skipColor: getComputedStyle(skip).color,
      contentBackground: getComputedStyle(content).backgroundColor, imageFilter: getComputedStyle(cup).filter,
      animations: overlay.getAnimations({ subtree: true }).map((animation) => ({ frames: animation.effect.getKeyframes(), timing: animation.effect.getTiming() })),
      focusables: overlay.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length,
      skipName: skip.textContent, skipRect: rect(skip), cupRect: rect(cup), titleRect: rect(title), captionRect: rect(caption),
      viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      visible: getComputedStyle(document.documentElement).visibility === "visible", inert: document.body.inert,
      centerOwned: Boolean(document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(".robys-takeaway-entry")),
      focusTrapped: overlay.contains(document.activeElement)
    };
  });
}

function luminance(color) {
  const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}

export function assertBrand(evidence, language = "tr") {
  assert(evidence.decoded && evidence.imagePath.endsWith(`/${CUP_PATH}`), "The branded cup is missing, broken or not decoded");
  assert(evidence.language === language && evidence.title === TITLES[language], "Takeaway copy or language mismatch");
  assert(evidence.background === BACKGROUND && evidence.contentBackground === "rgba(0, 0, 0, 0)", "Warm espresso surface or card-free cup composition changed");
  assert(evidence.visible && !evidence.inert && evidence.centerOwned && !evidence.focusTrapped, "Entry hid the document or trapped focus");
  assert(evidence.focusables === 1 && evidence.skipName && evidence.skipRect.height >= 44, "One accessible 44 px skip control is required");
  assert(!evidence.imageFilter.includes("blur("), "Brand artwork must remain sharp");
  for (const color of [evidence.titleColor, evidence.captionColor, evidence.skipColor]) {
    const contrast = (luminance(color) + .05) / (luminance(evidence.background) + .05);
    assert(contrast >= 4.5, `Entry text contrast is ${contrast.toFixed(2)}:1`);
  }
  for (const rect of [evidence.cupRect, evidence.titleRect, evidence.captionRect, evidence.skipRect]) {
    assert(rect.width > 0 && rect.height > 0 && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= evidence.viewport.width + 1 && rect.y + rect.height <= evidence.viewport.height + 1, "Cup, copy or skip control escaped the viewport");
  }
  assert(evidence.documentWidth <= evidence.viewport.width, "Entry causes horizontal scrolling");
  assert(evidence.animations.length > 0 && evidence.animations.length <= 2, "Compositor animation budget exceeded");
  for (const animation of evidence.animations) for (const frame of animation.frames) {
    const properties = Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key));
    assert(properties.every((key) => ["transform", "opacity"].includes(key)), `Non-compositor animation: ${properties}`);
    if (frame.transform) assert(/^translateY\((10|0)px\)$/.test(frame.transform), `Unexpected entrance movement: ${frame.transform}`);
  }
}

export function assertAsset() {
  const bytes = readFileSync(CUP_PATH);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert(sha256 === "c0fd3edba8fa19f80d6a7cfbfefc11d4b50361893970bbc72fcdcb9a984194d1", "Reviewed cup asset changed; review the replacement before updating this fingerprint");
  assert(bytes.length < 32_000, "Cup exceeds the 32 KB asset budget");
  assert(readFileSync("takeaway-entry.js").length < 32_000, "Lazy runtime exceeds the retained 32 KB budget");
  return { bytes: bytes.length, sha256 };
}
