import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup({ native = true, ready = false, reduced = false } = {}) {
  const window = new EventTarget();
  Object.assign(window, { location: { search: native ? "?entry=android-handoff" : "" },
    matchMedia: () => ({ matches: reduced }), setTimeout: () => {} });
  const video = new EventTarget();
  const source = { removeAttribute() {} };
  Object.assign(video, { loads: 0, plays: 0, dataset: {}, classList: { add() {}, remove() {} },
    querySelector: () => source, load() { this.loads++; }, play() { this.plays++; return Promise.resolve(); } });
  const document = new EventTarget();
  Object.assign(document, { readyState: "loading", hidden: false,
    documentElement: { dataset: ready ? { robysNativeReady: "true" } : {} }, querySelector: () => video });
  const context = vm.createContext({ window, document, URLSearchParams });
  vm.runInContext(readFileSync("qa.js", "utf8"), context);
  context.scheduleHeroPlayback();
  return { video, window };
}

const waiting = setup();
assert.equal(waiting.video.loads, 0);
assert.equal(waiting.video.plays, 0);
waiting.window.dispatchEvent(new Event("robys:android-handoff"));
assert.equal(waiting.video.plays, 0, "The web hard stop must not start native playback");
waiting.window.dispatchEvent(new Event("robys:native-ready"));
assert.equal(waiting.video.loads, 1);
assert.equal(waiting.video.plays, 1);
waiting.window.dispatchEvent(new Event("robys:native-ready"));
assert.equal(waiting.video.loads, 1, "Native acknowledgement is one-shot");
assert.equal(setup({ ready: true }).video.plays, 1, "Late scheduler sees the native acknowledgement");
assert.equal(setup({ native: false }).video.plays, 1, "Normal website autoplay is preserved");
const reduced = setup({ reduced: true });
reduced.window.dispatchEvent(new Event("robys:native-ready"));
assert.equal(reduced.video.loads, 0, "Reduced motion keeps the poster without starting a decoder");
console.log("Hero playback: native deferral, web fallback, late/duplicate acknowledgement, normal autoplay and reduced motion PASS");
