import assert from "node:assert/strict";
import { test } from "node:test";
import { createMenuSound, MENU_SOUND_KEY, readMenuSound } from "../src/menu-feedback.js";
function fixture(storage) {
  let clock = 0, created = 0, tones = 0, disconnected = 0, visible = true;
  const saved = new Map();
  const context = { state: "running", currentTime: 0, destination: {},
    createOscillator: () => ({ frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { disconnected++; }, start() { tones++; }, stop() { this.onended(); } }),
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { disconnected++; } }) };
  const sound = createMenuSound({ storage: storage ?? { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    createContext: () => { created++; return context; }, now: () => clock, audible: () => visible });
  return { sound, context, saved, advance: n => { clock += n; }, hide: () => { visible = false; }, counts: () => ({ created, tones, disconnected }) };
}
test("silent by default, creates no audio resources until explicit opt in", () => {
  const f = fixture(); f.sound.play(); assert.equal(f.sound.enabled, false);
  assert.deepEqual(f.counts(), { created: 0, tones: 0, disconnected: 0 });
  assert.equal(f.sound.toggle(), true); assert.equal(f.saved.get(MENU_SOUND_KEY), "on");
  assert.deepEqual(f.counts(), { created: 1, tones: 1, disconnected: 2 });
});
test("rapid actions are throttled and muting takes effect immediately", () => {
  const f = fixture(); f.sound.toggle(); f.sound.play(); assert.equal(f.counts().tones, 1);
  f.advance(101); f.sound.play(); assert.equal(f.counts().tones, 2);
  assert.equal(f.sound.toggle(), false); f.advance(101); f.sound.play();
  assert.equal(f.counts().tones, 2); assert.equal(f.saved.get(MENU_SOUND_KEY), "off");
});
test("storage failures keep feedback usable and hidden pages silent", () => {
  const storage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(readMenuSound(storage), false);
  const f = fixture(storage); assert.doesNotThrow(() => f.sound.toggle()); f.hide(); f.advance(101); f.sound.play();
  assert.equal(f.counts().tones, 1);
});
test("failed audio initialization does not interrupt actions", () => {
  const sound = createMenuSound({ createContext: () => { throw Error("unavailable"); }, audible: () => true });
  assert.doesNotThrow(() => sound.toggle()); assert.doesNotThrow(() => sound.play());
});
test("a resumed context cannot emit a queued tone after muting", async () => {
  const f = fixture(); let resume;
  f.context.state = "suspended"; f.context.resume = () => new Promise(resolve => { resume = resolve; });
  f.sound.toggle(); f.sound.toggle(); f.context.state = "running"; resume(); await Promise.resolve();
  assert.equal(f.counts().tones, 0);
});

import { readFileSync } from "node:fs";
import vm from "node:vm";
function entryFixture(initial = false) {
  let listener, resolveModule, rejectModule, loads = 0, tones = 0, enabled = initial;
  const urls = [];
  const attributes = {}, button = { dataset: {}, setAttribute: (name, value) => { attributes[name] = value; } };
  const action = {};
  const context = { URL, document: { querySelector: () => button, addEventListener: (name, fn) => { listener = fn; } },
    localStorage: { getItem: () => initial ? "on" : "off" },
    loadModule: url => { urls.push(url); loads++; return new Promise((resolve, reject) => { resolveModule = resolve; rejectModule = reject; }); } };
  const source = readFileSync(new URL("../src/menu-feedback-entry.js", import.meta.url), "utf8")
    .replace(/import\(([^)]+)\)/g, "loadModule($1)")
    .replaceAll("import.meta.url", '"https://example.test/cafe/menu-app.js"');
  vm.runInNewContext(source, context);
  return { attributes, urls, fail: () => rejectModule(new Error("offline")), click: (toggle = true, trusted = true) => listener({ isTrusted: trusted, target: {
    closest: selector => selector === ".menu-sound-toggle" ? (toggle ? button : null) : (toggle ? button : action)
  } }),
  finish: () => resolveModule({ initializeMenuFeedback(target, activate) {
    if (activate) enabled = !enabled;
    target.dataset.soundReady = "true"; target.setAttribute("aria-pressed", String(enabled));
    if (activate && enabled) tones++;
    return { play() { if (enabled) tones++; } };
  } }), stats: () => ({ loads, tones, enabled }) };
}
test("lazy entry preserves an on then off tap while its module is downloading", async () => {
  const f = entryFixture(); const first = f.click();
  assert.equal(f.attributes["aria-pressed"], "true");
  await f.click(); assert.equal(f.attributes["aria-pressed"], "false");
  f.finish(); await first;
  assert.deepEqual(f.stats(), { loads: 1, tones: 0, enabled: false });
});

test("a failed optional audio import retries a fresh URL without losing the opt in", async () => {
  const f = entryFixture(); const first = f.click(); f.fail(); await first;
  assert.equal(f.attributes["aria-pressed"], "true");
  const retry = f.click(false); f.finish(); await retry;
  assert.match(f.urls[1], /[?&]retry=1/);
  assert.deepEqual(f.stats(), { loads: 2, tones: 1, enabled: true });
});
test("lazy entry ignores untrusted clicks and resumes a saved opt in on a real action", async () => {
  const f = entryFixture(true); await f.click(false, false);
  assert.equal(f.stats().loads, 0);
  const first = f.click(false); f.finish(); await first;
  assert.deepEqual(f.stats(), { loads: 1, tones: 1, enabled: true });
});
