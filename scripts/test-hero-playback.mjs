import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup({ reduced = false, hidden = false, hasSource = true } = {}) {
  const window = new EventTarget();
  Object.assign(window, { matchMedia: () => ({ matches: reduced }), setTimeout: () => {} });
  const video = new EventTarget();
  const source = { mediaRemoved: false, removeAttribute(name) { if (name === "media") this.mediaRemoved = true; } };
  Object.assign(video, { loads: 0, plays: 0, dataset: {}, classList: { add() {}, remove() {} },
    querySelector: () => hasSource ? source : null, load() { this.loads++; }, play() { this.plays++; return Promise.resolve(); } });
  const document = new EventTarget();
  Object.assign(document, { readyState: "loading", hidden, querySelector: () => video });
  const context = vm.createContext({ window, document });
  vm.runInContext(readFileSync("qa.js", "utf8"), context);
  context.scheduleHeroPlayback();
  return { video, source, window, document };
}

const normal = setup();
assert.equal(normal.video.loads, 1, "The website must load the hero video immediately");
assert.equal(normal.video.plays, 1, "The website must attempt autoplay");
assert.equal(normal.video.autoplay, true);
assert.equal(normal.video.muted, true);
assert.equal(normal.video.playsInline, true);
assert.equal(normal.source.mediaRemoved, true);
assert.match(normal.source.src, /robys-ambience-clean\.mp4/);

const hidden = setup({ hidden: true });
assert.equal(hidden.video.loads, 1);
assert.equal(hidden.video.plays, 0, "A hidden tab must not start playback");
hidden.document.hidden = false;
hidden.document.dispatchEvent(new Event("visibilitychange"));
assert.equal(hidden.video.plays, 1, "Playback must retry when the tab becomes visible");

const reduced = setup({ reduced: true });
assert.equal(reduced.video.loads, 0, "Reduced motion keeps the poster without starting a decoder");
assert.equal(reduced.video.plays, 0);
assert.equal(setup({ hasSource: false }).video.loads, 0, "Missing video source must fail gracefully");
console.log("Hero playback: normal web autoplay, visible-tab recovery, missing-source fallback and reduced motion PASS");
