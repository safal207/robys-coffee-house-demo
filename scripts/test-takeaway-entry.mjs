import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync("takeaway-entry.js", "utf8").replace(/^export /gm, "");

function harness({ warm = false, language = "tr", reduced = false, image = "ready", storageFails = false, activated = false, vibration = "available", animation = "normal", entranceDelay = 0 } = {}) {
  let time = 0;
  let sequence = 0;
  const tasks = new Map();
  const events = [];
  const pulses = [];
  const animations = [];
  class Target {
    listeners = new Map();
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    dispatchEvent(event) { for (const fn of [...(this.listeners.get(event.type) || [])]) fn(event); }
  }
  const schedule = (fn, ms) => {
    const id = ++sequence;
    tasks.set(id, { fn, at: time + ms });
    return id;
  };
  class Element extends Target {
    constructor(tag) { super(); this.tag = tag; }
    children = [];
    style = {};
    dataset = {};
    append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this); }
    querySelector(selector) {
      for (const n of this.children) {
        if (selector === n.tag || (selector.startsWith(".") && n.className === selector.slice(1))) return n;
        const found = n.querySelector(selector);
        if (found) return found;
      }
      return null;
    }
    decode() { return image === "ready" ? Promise.resolve() : image === "broken" ? Promise.reject(new Error("image failed")) : new Promise(() => {}); }
    animate(frames, options) {
      animations.push({ tag: this.className, frames, options });
      if (animation === "throws") throw new Error("animation unavailable");
      const delay = this.className === "robys-takeaway-content" ? entranceDelay : 0;
      return { finished: animation === "stalled" ? new Promise(() => {}) : new Promise((resolve) => schedule(resolve, options.duration + delay)) };
    }
  }
  const root = new Element("html");
  const body = new Element("body");
  root.append(body);
  const document = Object.assign(new Target(), {
    documentElement: root, body, readyState: "complete", visibilityState: "visible",
    createElement: (tag) => new Element(tag), querySelector: (s) => root.querySelector(s)
  });
  const motion = Object.assign(new Target(), { matches: reduced });
  const state = new Map(warm ? [["robys-takeaway-entry-v1", "1"]] : []);
  const sessionStorage = {
    getItem: (k) => { if (storageFails) throw new Error(); return state.get(k); },
    setItem: (k, v) => { if (storageFails) throw new Error(); state.set(k, v); }
  };
  const window = Object.assign(new Target(), {
    setTimeout: schedule, clearTimeout: (id) => tasks.delete(id), sessionStorage,
    localStorage: { getItem: () => { if (storageFails) throw new Error(); return language; } },
    matchMedia: () => motion
  });
  window.addEventListener("robys:entry-state", (event) => events.push({ ...event.detail, at: time }));
  const navigator = { userActivation: { hasBeenActive: activated } };
  if (vibration !== "absent") navigator.vibrate = (ms) => {
    if (vibration === "throws") throw new Error("blocked");
    pulses.push(ms); return true;
  };
  const context = vm.createContext({ window, document, navigator, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } } });
  vm.runInContext(source, context);
  const tick = async (ms = 0) => {
    const until = time + ms;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    while (true) {
      const next = [...tasks.entries()].filter(([, t]) => t.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      tasks.delete(next[0]); time = next[1].at; next[1].fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    time = until;
  };
  const start = (scene = "day") => { root.dataset.robysEntryPending = scene; context.runTakeawayEntry(scene); };
  const overlay = () => document.querySelector(".robys-takeaway-entry");
  const released = () => {
    assert.equal(overlay(), null);
    assert.equal(root.dataset.robysEntryPending, undefined);
    assert.equal(window.__robysTakeawayEntryRelease, undefined);
    assert.equal(document.listeners.get("visibilitychange")?.size || 0, 0);
    assert.equal(window.listeners.get("keydown")?.size || 0, 0);
  };
  return { start, tick, overlay, released, root, document, window, motion, navigator, events, pulses, animations };
}

for (const scene of ["morning", "day", "night"]) {
  test(`${scene}: one scene, stationary dissolve, cold entry closes in 1530 ms`, async () => {
    const h = harness(); h.start(scene); await h.tick();
    assert.equal(h.overlay().children[0].children[0].src, "src/brand/robys-takeaway-cup-v1.webp");
    await h.tick(1050);
    assert.equal(h.root.dataset.robysEntryPending, undefined);
    const fade = h.animations.find((a) => a.tag === "robys-takeaway-entry");
    assert(fade.frames.every((frame) => !frame.transform));
    await h.tick(480); h.released();
    assert.deepEqual(h.events.map((e) => e.state), ["loading", "brand-frame", "handoff", "done"]);
    assert.equal(h.events.at(-1).at, 1530);
    assert.deepEqual(h.pulses, []);
  });
}
test("delayed entrance retains the stationary reading pause", async () => {
  const h = harness({ entranceDelay: 250 }); h.start();
  await h.tick(1050);
  assert.equal(h.root.dataset.robysEntryState, "brand-frame");
  await h.tick(249);
  assert.equal(h.root.dataset.robysEntryState, "brand-frame");
  await h.tick(1);
  assert.equal(h.events.at(-1).state, "handoff");
  assert.equal(h.events.at(-1).at, 1300);
  await h.tick(480); h.released();
});
test("warm entry closes in 600 ms", async () => {
  const h = harness({ warm: true }); h.start(); await h.tick(600); h.released();
  assert.equal(h.events.at(-1).at, 600);
});
for (const [language, text] of [["tr", "Yanına al."], ["en", "Take it with you."], ["ru", "Возьми с собой."]]) {
  test(`${language} copy follows the saved language`, async () => {
    const h = harness({ language }); h.start(); await h.tick();
    assert.equal(h.overlay().children[0].children[1].textContent, text);
  });
}
for (const image of ["broken", "stalled"]) {
  test(`${image} image never reveals partial content or strands the page`, async () => {
    const h = harness({ image }); h.start(); await h.tick(600); h.released();
    assert(!h.events.some((e) => e.state === "brand-frame"));
    assert.equal(h.window.sessionStorage.getItem("robys-takeaway-entry-v1"), undefined);
  });
}
test("pointer dismisses immediately and allows at most one 8 ms pulse", async () => {
  const h = harness(); h.start(); await h.tick();
  h.navigator.userActivation.hasBeenActive = true;
  const overlay = h.overlay();
  overlay.dispatchEvent({ type: "pointerdown" }); overlay.dispatchEvent({ type: "pointerdown" });
  await h.tick(480); h.released(); assert.deepEqual(h.pulses, [8]);
});
for (const key of ["Escape", "Tab"]) {
  test(`${key} immediately releases the page and makes the next entry warm without vibration`, async () => {
    const h = harness(); h.start(); h.window.dispatchEvent({ type: "keydown", key });
    await h.tick(3000); h.released(); assert.deepEqual(h.pulses, []);
    assert(!h.events.some((e) => e.state === "brand-frame"));
    h.start(); await h.tick(600); h.released();
    assert.equal(h.events.at(-1).variant, "warm");
    assert.deepEqual(h.pulses, []);
  });
  test(`${key} still releases the page when session storage is unavailable`, async () => {
    const h = harness({ storageFails: true }); h.start();
    h.window.dispatchEvent({ type: "keydown", key });
    await h.tick(3000); h.released();
    assert(!h.events.some((e) => e.state === "brand-frame"));
  });
}
test("reduced motion bypasses the scene", () => {
  const h = harness({ reduced: true, activated: true }); h.start(); h.released(); assert.deepEqual(h.pulses, []);
});
test("changing to reduced motion releases a running scene", async () => {
  const h = harness(); h.start(); await h.tick(); h.motion.matches = true;
  h.motion.dispatchEvent({ type: "change" }); h.released();
});
test("hidden tab releases the scene and no late decode revives it", async () => {
  const h = harness(); h.start(); h.document.visibilityState = "hidden";
  h.document.dispatchEvent({ type: "visibilitychange" }); await h.tick(3000); h.released();
  assert(!h.events.some((e) => e.state === "brand-frame"));
});
for (const vibration of ["absent", "throws"]) {
  test(`${vibration} vibration and blocked storage cannot break entry`, async () => {
    const h = harness({ vibration, activated: true, storageFails: true }); h.start(); await h.tick(2300); h.released();
  });
}
for (const animation of ["throws", "stalled"]) {
  test(`${animation} animation still releases the page within the hard stop`, async () => {
    const h = harness({ animation }); h.start(); await h.tick(2300); h.released();
  });
}
