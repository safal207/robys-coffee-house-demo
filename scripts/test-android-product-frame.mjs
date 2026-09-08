import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const nativeRuntime = readFileSync(new URL("../android-native-product-frame.js", import.meta.url), "utf8");
const legacyRuntime = readFileSync(new URL("../android-handoff.js", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../bootstrap-v2.js", import.meta.url), "utf8");
const unobservedNativeRuntime = readFileSync(new URL("./qa/fixtures/android-readiness-unobserved/android-native-product-frame.js", import.meta.url), "utf8");
const unobservedBootstrap = readFileSync(new URL("./qa/fixtures/android-readiness-unobserved/bootstrap-v2.js", import.meta.url), "utf8");
const bootstrapStartup = bootstrap.indexOf("\ninstallAppleTouchIcon();");
assert.ok(bootstrapStartup > 0, "Bootstrap function definitions must precede startup");
// Exercise the real route and DOM-ready capture. Only module transport is
// substituted, retaining the asynchronous boundary of dynamic import.
const bootstrapFunctions = bootstrap.slice(0, bootstrapStartup)
  .replace(/\bimport\(/g, "loadFixtureModule(");
const unobservedBootstrapStartup = unobservedBootstrap.indexOf("\ninstallAppleTouchIcon();");
assert.ok(unobservedBootstrapStartup > 0, "Control bootstrap function definitions must precede startup");
const unobservedBootstrapFunctions = unobservedBootstrap.slice(0, unobservedBootstrapStartup)
  .replace(/\bimport\(/g, "loadFixtureModule(");
const nativeModulePath = "./android-native-product-frame.js";
const legacyModuleSpecifier = "./android-handoff.js?v=20260808-atomic-v1";
const posterUrl = "https://safal207.github.io/robys-coffee-house-demo/src/robys-hero-poster.jpg";
const brandUrl = "https://safal207.github.io/robys-coffee-house-demo/src/brand/robys-compact-master-v1.svg?v=20260726-approved-v4";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  // Drain VM/native Promise continuations without running timers or animation frames.
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

function harness({ search = "?entry=android-handoff&handoff-gen=1", reduced = false,
  aborted = false, capturedDom = true, background = `url("${brandUrl}")`,
  recorderMode = "enabled", unobserved = false } = {}) {
  let time = 0;
  let sequence = 0;
  const calls = { timers: 0, clearedTimers: 0, scheduledFrames: 0, executedFrames: 0,
    computedStyles: 0, animationScans: 0, layoutReads: 0 };
  const readPhases = [];
  const performance = { now: () => time, timeOrigin: 1788854400000 };
  const timers = new Map(), frames = new Map(), images = [], animations = [], events = [], heroAnimations = [], imports = [];
  const dom = deferred(), fonts = deferred();
  class Target {
    listeners = new Map();
    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ callback, once: options.once });
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, callback) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item.callback !== callback));
    }
    dispatchEvent(event) {
      for (const item of [...(this.listeners.get(event.type) ?? [])]) {
        if (item.once) this.removeEventListener(event.type, item.callback);
        item.callback(event);
      }
      return true;
    }
  }
  const schedule = (callback, duration) => {
    calls.timers += 1;
    const id = ++sequence;
    timers.set(id, { callback, at: time + duration });
    return id;
  };
  class Element extends Target {
    constructor(tag) { super(); this.tag = tag; }
    children = [];
    style = {};
    dataset = {};
    attributes = new Map();
    computedOpacity = "1";
    rendered = true;
    getClientRects() { calls.layoutReads += 1; return this.rendered ? [this.getBoundingClientRect()] : []; }
    getBoundingClientRect() { calls.layoutReads += 1; return { left: 0, top: 0, width: this.rendered ? 100 : 0, height: this.rendered ? 40 : 0 }; }
    append(...children) {
      for (const child of children) { this.children.push(child); child.parent = this; }
    }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector === child.tag || selector === `.${child.className}`) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
    animate(keyframes, options) {
      animations.push({ keyframes, options });
      return { finished: new Promise(resolve => schedule(resolve, options.duration)) };
    }
  }
  class ControlledImage extends Element {
    constructor() {
      super("img");
      this.decoded = deferred();
      this.decodeCalls = 0;
      images.push(this);
    }
    decode() { this.decodeCalls += 1; return this.decoded.promise; }
  }
  const root = new Element("html"), body = new Element("body"), hero = new Element("video"), brand = new Element("span");
  const heroContent = new Element("div"), heading = new Element("h1"), actions = new Element("div");
  heroContent.className = "hero-content";
  actions.className = "hero-actions";
  heroContent.append(heading, actions);
  heroContent.getAnimations = options => {
    calls.animationScans += 1;
    readPhases.push({ read: "animations", phase: window.__robysAndroidReadinessSnapshot?.().events.at(-1)?.phase });
    assert.equal(options?.subtree, true, "Hero readiness must include descendant entrance animations");
    return heroAnimations;
  };
  root.style.backgroundColor = "#241c1b";
  root.classList = { add() {} };
  root.append(body);
  hero.poster = posterUrl;
  hero.playCalls = 0;
  hero.loadCalls = 0;
  hero.play = () => { hero.playCalls += 1; throw new Error("Readiness must not start media"); };
  hero.load = () => { hero.loadCalls += 1; throw new Error("Readiness must not reset media"); };
  const stylesheet = (href, loaded = false) => Object.assign(new Element("link"), {
    rel: "stylesheet", href, sheet: loaded ? { cssRules: [] } : null, disabled: false, media: ""
  });
  const baseStyle = stylesheet("styles-v2.css", true);
  const heroStyle = stylesheet("hero-balance.css");
  heroStyle.dataset.heroBalance = "true";
  const styles = [baseStyle, heroStyle];
  const document = Object.assign(new Target(), {
    documentElement: root, body, readyState: "interactive", fonts: { ready: fonts.promise },
    createElement: tag => tag === "img" ? new ControlledImage() : new Element(tag),
    querySelector(selector) {
      if (selector === ".hero-video") return hero;
      if (selector === ".hero-content") return heroContent;
      if (selector === ".site-header .brand-copy") return brand;
      if (selector === 'link[data-hero-balance="true"]') return styles.find(link => link.dataset.heroBalance === "true") ?? null;
      return root.querySelector(selector);
    },
    querySelectorAll(selector) {
      assert.equal(selector, 'link[rel="stylesheet"]', "Unexpected dependency discovery");
      return styles;
    }
  });
  const window = Object.assign(new Target(), {
    location: { search }, performance, setTimeout: schedule,
    clearTimeout: id => { calls.clearedTimers += 1; timers.delete(id); },
    __robysAndroidReadinessDisabled: recorderMode === "disabled",
    __robysAndroidHandoffAborted: aborted,
    matchMedia: query => ({ matches: query.includes("prefers-reduced-motion") ? reduced : query !== "not all" })
  });
  dom.promise.then(() => document.dispatchEvent({ type: "DOMContentLoaded" }));
  window.addEventListener("robys:android-handoff", event => events.push({ state: event.detail.state, at: time }));
  const context = vm.createContext({
    window, document, performance, URLSearchParams, Image: ControlledImage,
    loadFixtureModule(specifier) {
      imports.push(specifier);
      return Promise.resolve().then(() => {
        const path = specifier.split("?")[0];
        assert.ok(path === nativeModulePath || specifier === legacyModuleSpecifier,
          `Unexpected handoff import: ${specifier}`);
        vm.runInContext(path === nativeModulePath ? (unobserved ? unobservedNativeRuntime : nativeRuntime) : legacyRuntime,
          context, { filename: path });
        return {};
      });
    },
    getComputedStyle: element => {
      calls.computedStyles += 1;
      readPhases.push({ read: element === brand ? "brand" : "opacity", phase: window.__robysAndroidReadinessSnapshot?.().events.at(-1)?.phase });
      if (element === brand) return { backgroundImage: background };
      assert.ok(element === heroContent || heroContent.children.includes(element), "Unexpected styled product element");
      return { opacity: element.computedOpacity, display: element.rendered ? "block" : "none", visibility: "visible" };
    },
    requestAnimationFrame(callback) { calls.scheduledFrames += 1; const id = ++sequence; frames.set(id, callback); return id; },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext(unobserved ? unobservedBootstrapFunctions : bootstrapFunctions, context, { filename: "bootstrap-v2.js" });
  const requested = vm.runInContext("loadAndroidHandoffIfRequested()", context);
  // Disturb only the observer, after bootstrap installation and before the
  // asynchronous native module arrives. Product dependencies remain identical.
  if (recorderMode === "deleted") delete window.__robysAndroidReadinessRecord;
  if (recorderMode === "throwing") window.__robysAndroidReadinessRecord = () => { throw new Error("Fixture observer unavailable"); };
  if (recorderMode === "full") {
    for (let index = 0; index < 200; index += 1) window.__robysAndroidReadinessRecord("fixture-fill", index);
  }
  // Model an abort or invalidated readiness capture while the module is in flight.
  if (aborted) window.__robysAndroidHandoffAborted = true;
  if (!capturedDom) delete window.__robysAndroidHandoffDomReady;
  const tick = async (duration = 0) => {
    await settle();
    const until = time + duration;
    while (true) {
      const next = [...timers.entries()].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); time = next[1].at; next[1].callback(); await settle();
    }
    time = until;
  };
  const frame = async () => {
    const pending = [...frames.values()]; frames.clear();
    time += 16;
    for (const callback of pending) { calls.executedFrames += 1; callback(time); }
    await settle();
  };
  const loadStyle = link => { link.sheet = { cssRules: [] }; link.dispatchEvent({ type: "load" }); };
  const readyDependencies = async () => {
    dom.resolve(); await settle();
    for (const link of styles) loadStyle(link);
    await settle();
    for (const image of images) image.decoded.resolve();
    fonts.resolve(); await settle();
  };
  const addHeroAnimation = (animationName = "heroContentIn") => {
    const completion = deferred();
    const animation = { animationName, finished: completion.promise, completion };
    for (const method of ["finish", "cancel", "pause", "play", "updatePlaybackRate"]) {
      animation[method] = () => { throw new Error(`Readiness must not ${method} an existing animation`); };
    }
    heroAnimations.push(animation);
    return animation;
  };
  return { root, document, window, hero, brand, dom, fonts, styles, heroStyle, stylesheet,
    heroContent, heading, actions, heroAnimations, addHeroAnimation,
    images, animations, events, frames, timers, imports, requested, calls, readPhases, tick, frame, loadStyle, readyDependencies,
    snapshot: () => window.__robysAndroidReadinessSnapshot?.(),
    overlay: () => root.querySelector(".robys-android-handoff"), states: () => events.map(event => event.state) };
}

for (const generation of ["1", "2147483647"]) {
  test(`positive native generation ${generation} prepares product beneath the native cover`, async () => {
    const h = harness({ search: `?entry=android-handoff&handoff-gen=${generation}` });
    await settle();
    assert.equal(h.requested, true);
    assert.equal(h.imports.length, 1);
    assert.equal(h.imports[0].split("?")[0], nativeModulePath);
    assert.deepEqual(h.states(), ["loading"]);
    assert.equal(h.overlay(), null);
    assert.equal(h.root.style.backgroundColor, "");
    assert.equal(typeof h.window.__robysAndroidHandoffRelease, "function", "Fallback release must be available before DOM readiness");
  });
}

for (const query of ["", "&handoff-gen=", "&handoff-gen=0", "&handoff-gen=-1", "&handoff-gen=01",
  "&handoff-gen=1.5", "&handoff-gen=%2B1", "&handoff-gen=1e2", "&handoff-gen=2147483648", "&handoff-gen=Infinity"]) {
  test(`generationless or invalid browser entry preserves its HTML cover: ${query || "missing"}`, async () => {
    const h = harness({ search: `?entry=android-handoff${query}` }); await settle();
    assert.equal(h.requested, true);
    assert.deepEqual(h.imports, [legacyModuleSpecifier]);
    assert.ok(h.overlay());
    assert.deepEqual(h.states(), ["loading"]);
    assert.equal(h.images.length, 2, "Legacy bridge must still prepare both approved logos");
    assert.equal(typeof h.window.__robysAndroidHandoffRelease, "function");
  });
}

test("a generation without the Android entry mode does not select native product readiness", async () => {
  const h = harness({ search: "?entry=day&handoff-gen=1" }); await settle();
  assert.equal(h.requested, false);
  assert.deepEqual(h.imports, []);
  assert.deepEqual(h.states(), []);
  assert.equal(h.overlay(), null);
});

test("readiness awaits DCL, dynamic CSS, both actual product assets, fonts and two distinct frames", async () => {
  const h = harness(); await settle();
  assert.equal(h.document.readyState, "interactive");
  assert.equal(h.images.length, 0, "Interactive readyState must not bypass captured DCL");
  assert.equal(h.frames.size, 0);
  h.dom.resolve(); await settle();
  assert.equal(h.images.length, 0, "Dynamic hero CSS must settle before selecting its styled assets");
  h.loadStyle(h.heroStyle); await settle();
  assert.deepEqual(h.images.map(image => image.src).sort(), [posterUrl, brandUrl].sort());
  assert.ok(h.images.every(image => image.decodeCalls === 1));
  h.images[0].decoded.resolve(); await settle();
  assert.deepEqual(h.states(), ["loading"], "One decoded asset is insufficient");
  h.images[1].decoded.resolve(); await settle();
  assert.equal(h.frames.size, 0, "Fonts must settle before scheduling readiness frames");
  h.fonts.resolve(); await settle();
  assert.equal(h.frames.size, 1);
  await h.frame();
  assert.deepEqual(h.states(), ["loading"], "One frame must not emit readiness");
  await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(h.overlay(), null);
  assert.equal(h.hero.playCalls, 0);
  assert.equal(h.hero.loadCalls, 0);
  assert.equal(h.animations.length, 0);
});

test("bootstrap retains DCL when it fires before the native module arrives", async () => {
  const h = harness();
  assert.deepEqual(h.states(), [], "Dynamic import has not evaluated the module yet");
  h.document.dispatchEvent({ type: "DOMContentLoaded" });
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(h.overlay(), null);
});

test("a pending active stylesheet blocks readiness while inactive sheets do not", async () => {
  const h = harness();
  const active = h.stylesheet("order-shell.css");
  const disabled = h.stylesheet("disabled.css"); disabled.disabled = true;
  const unmatched = h.stylesheet("print.css"); unmatched.media = "not all";
  h.styles.push(active, disabled, unmatched);
  h.dom.resolve(); await settle();
  h.loadStyle(h.heroStyle); await settle();
  assert.equal(h.images.length, 0);
  h.loadStyle(active); await settle();
  for (const image of h.images) image.decoded.resolve();
  h.fonts.resolve(); await settle();
  await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(disabled.sheet, null);
  assert.equal(unmatched.sheet, null);
});

test("the decoded brand asset follows the computed responsive background", async () => {
  const desktopBrand = brandUrl.replace("compact", "header");
  const h = harness({ background: `url("${desktopBrand}")` });
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.deepEqual(h.images.map(image => image.src).sort(), [posterUrl, desktopBrand].sort());
  assert.deepEqual(h.states(), ["loading", "ready"]);
});

test("pending hero entrance prevents ready while unrelated animation does not block it", async () => {
  const h = harness();
  const entrance = h.addHeroAnimation();
  h.addHeroAnimation("unrelatedInfiniteAnimation");
  h.heading.computedOpacity = "0";
  h.actions.computedOpacity = "0";
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading"], "Resolved resources cannot certify transparent hero content");
  assert.equal(h.frames.size, 0, "Readiness frames follow the existing entrance completion");
  h.heading.computedOpacity = "1";
  h.actions.computedOpacity = "1";
  entrance.completion.resolve(); await settle();
  await h.frame(); assert.deepEqual(h.states(), ["loading"]);
  await h.frame(); assert.deepEqual(h.states(), ["loading", "ready"]);
});

test("a canceled entrance may complete readiness when the actual content is opaque", async () => {
  const h = harness();
  const entrance = h.addHeroAnimation();
  await h.readyDependencies();
  entrance.completion.reject(new Error("Fixture CSS entrance canceled")); await settle();
  await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
});

for (const outcome of ["canceled", "finished"]) {
  test(`${outcome} entrance cannot certify a still-transparent rendered hero child`, async () => {
    const h = harness();
    const entrance = h.addHeroAnimation();
    h.actions.computedOpacity = "0";
    await h.readyDependencies();
    if (outcome === "canceled") entrance.completion.reject(new Error("Fixture CSS entrance canceled"));
    else entrance.completion.resolve();
    await settle(); await h.frame(); await h.frame();
    assert.ok(!h.states().includes("ready"));
    assert.equal(h.root.dataset.robysAndroidHandoff, "done");
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
  });
}

for (const stage of ["loading", "ready"]) {
  test(`native release is synchronous and idempotent from ${stage}, with no late ready`, async () => {
    const h = harness(); await settle();
    if (stage === "ready") { await h.readyDependencies(); await h.frame(); await h.frame(); }
    const release = h.window.__robysAndroidHandoffRelease;
    release();
    const expected = stage === "ready" ? ["loading", "ready", "releasing", "done"] : ["loading", "releasing", "done"];
    assert.deepEqual(h.states(), expected, "Release must complete before returning to native");
    release();
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
    await h.readyDependencies(); await h.frame(); await h.frame(); await h.tick(6000);
    assert.deepEqual(h.states(), expected);
    assert.equal(h.overlay(), null);
    assert.equal(h.animations.length, 0);
  });
}

test("late stylesheet or image failure cannot emit done again after native release", async () => {
  for (const pending of ["stylesheet", "image decode"]) {
    const h = harness();
    h.dom.resolve(); await settle();
    if (pending === "image decode") { h.loadStyle(h.heroStyle); await settle(); }
    const release = h.window.__robysAndroidHandoffRelease;
    release();
    assert.deepEqual(h.states(), ["loading", "releasing", "done"]);
    if (pending === "stylesheet") h.heroStyle.dispatchEvent({ type: "error" });
    else h.images[0].decoded.reject(new Error("Fixture image failed after release"));
    await settle();
    release();
    assert.deepEqual(h.states(), ["loading", "releasing", "done"], `${pending} failure must not repeat a completed transition`);
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
    assert.equal(h.overlay(), null);
  }
});

test("an already aborted native entry installs no surface or release hook", async () => {
  const h = harness({ aborted: true }); await settle();
  assert.deepEqual(h.states(), []);
  assert.equal(h.overlay(), null);
  assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
});

test("aborting pending product preparation prevents a late ready", async () => {
  const h = harness(); await settle();
  h.window.__robysAndroidHandoffAborted = true;
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.ok(!h.states().includes("ready"));
});

for (const failure of ["missing DCL capture", "missing hero CSS", "stylesheet", "poster decode", "brand decode", "brand background", "missing poster", "font load"]) {
  test(`${failure} failure cannot be certified ready`, async () => {
    const h = harness({ capturedDom: failure !== "missing DCL capture", background: failure === "brand background" ? "none" : undefined });
    if (failure === "missing hero CSS") h.styles.splice(h.styles.indexOf(h.heroStyle), 1);
    if (failure === "missing poster") h.hero.poster = "";
    h.dom.resolve(); await settle();
    if (failure === "stylesheet") h.heroStyle.dispatchEvent({ type: "error" });
    else h.loadStyle(h.heroStyle);
    await settle();
    for (const image of h.images) {
      const broken = failure === "poster decode" && image.src === posterUrl || failure === "brand decode" && image.src === brandUrl;
      if (broken) image.decoded.reject(new Error("Fixture image unavailable"));
      else image.decoded.resolve();
    }
    await settle();
    if (failure === "font load") h.fonts.reject(new Error("Fixture fonts unavailable"));
    else h.fonts.resolve();
    await settle(); await h.frame(); await h.frame(); await h.tick(6000);
    assert.ok(!h.states().includes("ready"));
    assert.equal(h.root.dataset.robysAndroidHandoff, "done");
    assert.equal(h.overlay(), null);
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
  });
}

test("legacy browser bridge retains two-logo readiness and its 160 ms release fade", async () => {
  const h = harness({ search: "?entry=android-handoff" }); await settle();
  for (const image of h.images) image.decoded.resolve();
  await settle(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  h.window.__robysAndroidHandoffRelease(); await settle();
  assert.equal(h.animations[0].options.duration, 160);
  assert.ok(h.overlay(), "Browser cover remains until the fade finishes");
  await h.tick(159); assert.ok(h.overlay());
  await h.tick(1); assert.equal(h.overlay(), null);
  assert.deepEqual(h.states(), ["loading", "ready", "releasing", "done"]);
});

test("legacy reduced-motion release remains immediate", async () => {
  const h = harness({ search: "?entry=android-handoff", reduced: true }); await settle();
  h.window.__robysAndroidHandoffRelease(); await settle();
  assert.equal(h.overlay(), null);
  assert.equal(h.animations.length, 0);
  assert.deepEqual(h.states(), ["loading", "releasing", "done"]);
});

test("legacy hard stop still releases at 5000 ms with stalled logo decodes", async () => {
  const h = harness({ search: "?entry=android-handoff" }); await settle();
  await h.tick(4999); assert.ok(h.overlay());
  await h.tick(1); assert.equal(h.overlay(), null);
  assert.deepEqual(h.states(), ["loading", "releasing", "done"]);
  await h.frame(); await h.frame();
  assert.ok(!h.states().includes("ready"), "Pending readiness must not revive a hard-stopped bridge");
});

test("legacy browser handoff retains the reviewed bytes and import URL", () => {
  // android-handoff.js from 7799f80b5a6561beec57f2d98f8e8ca58e8c36fa.
  // Keep the fixture independent of git history in source archives and CI.
  assert.equal(createHash("sha256").update(legacyRuntime).digest("hex"),
    "451f55e218906204d2496762ce9944f2239e66555f750e930fddd067af9a838f");
  assert.ok(bootstrap.includes(`import("${legacyModuleSpecifier}")`));
});

test("native module revision reaches bootstrap and rejects stale offline module bytes", async () => {
  const revision = createHash("sha256").update(nativeRuntime).digest("hex").slice(0, 12);
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.ok(bootstrap.includes(`import("${nativeModulePath}?v=${revision}")`));
  assert.ok(worker.includes(`"${nativeModulePath}?v=${revision}"`));
  const origin = "https://example.test/coffee/";
  const previous = new URL(`${nativeModulePath}?v=old`, origin).href;
  const legacy = new URL("android-handoff.js", origin).href;
  const stale = { revision: "old" };
  const legacyResponse = { body: legacyRuntime };
  const stored = new Map([[previous, stale], [legacy, legacyResponse]]);
  const context = vm.createContext({ URL, Request, Response,
    self: { registration: { scope: origin }, addEventListener() {} },
    caches: { async open() { return { async match(request, options) {
      if (!options?.ignoreSearch) return stored.get(request.url);
      const requested = new URL(request.url); requested.search = "";
      for (const [key, response] of stored) {
        const cached = new URL(key); cached.search = "";
        if (cached.href === requested.href) return response;
      }
      return undefined;
    } }; } }
  });
  vm.runInContext(worker, context);
  const lookup = vm.runInContext("cachedResponse", context);
  assert.equal(await lookup(new Request(new URL(`${nativeModulePath}?v=${revision}`, origin))), undefined);
  assert.equal(await lookup(new Request(previous)), stale, "Exact cached revisions remain usable offline");
  assert.equal(await lookup(new Request(new URL(legacyModuleSpecifier, origin))), legacyResponse,
    "The preserved legacy URL still resolves its unchanged offline bytes");
});

function recordedEvents(h) {
  // Snapshot data crosses the VM boundary; normalize only for strict assertions.
  return JSON.parse(JSON.stringify(h.snapshot())).events;
}

function assertPendingPhase(h, phase, detail) {
  const last = recordedEvents(h).at(-1);
  assert.equal(last.phase, phase);
  if (detail !== undefined) assert.equal(last.detail, detail);
  assert.deepEqual(h.states(), ["loading"], `${phase} must not imply product readiness`);
  assert.ok(!recordedEvents(h).some(event => event.phase === "state" && event.detail === "ready"));
}

test("passive phases locate each unresolved dependency without advancing readiness", async () => {
  const h = harness();
  const entrance = h.addHeroAnimation();
  await settle();
  assertPendingPhase(h, "dom-wait");
  await h.tick(23);
  assertPendingPhase(h, "dom-wait");
  h.dom.resolve(); await settle();
  assertPendingPhase(h, "style-pending", 1);
  assert.ok(recordedEvents(h).some(event => event.phase === "dom-event" && event.atMs === 23));
  assert.deepEqual(recordedEvents(h).filter(event => event.phase === "style").map(event => event.detail),
    ["0:styles-v2.css", "1:hero-balance.css"]);
  h.loadStyle(h.heroStyle); await settle();
  assertPendingPhase(h, "decode-start", 1);
  h.images[0].decoded.resolve(); await settle();
  assertPendingPhase(h, "decode-end", 0);
  assert.equal(h.images[1].decodeCalls, 1);
  h.images[1].decoded.resolve(); await settle();
  assertPendingPhase(h, "fonts-wait");
  h.fonts.resolve(); await settle();
  assertPendingPhase(h, "animations-wait", 1);
  assert.equal(h.frames.size, 0);
  entrance.completion.resolve(); await settle();
  assertPendingPhase(h, "raf-wait");
  await h.frame(); assertPendingPhase(h, "raf-1");
  await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  const events = recordedEvents(h);
  assert.deepEqual(events.slice(-4).map(event => event.phase), ["raf-2", "opacity-start", "opacity-end", "state"]);
  assert.equal(events.at(-1).detail, "ready");
  assert.deepEqual(h.readPhases, [
    { read: "brand", phase: "brand-style-start" },
    { read: "animations", phase: "animations-scan-start" },
    { read: "opacity", phase: "opacity-start" },
    { read: "opacity", phase: "opacity-start" }
  ], "Existing synchronous reads must be bracketed before their work occurs");
  assert.deepEqual(h.calls, { timers: 0, clearedTimers: 0, scheduledFrames: 2, executedFrames: 2,
    computedStyles: 3, animationScans: 1, layoutReads: 0 });
  assert.equal(h.hero.playCalls + h.hero.loadCalls, 0);
  assert.ok(events.every((event, index) => Number.isFinite(event.atMs) && (!index || event.atMs >= events[index - 1].atMs)));
});

test("retained DCL is recorded before a native module that arrives later", async () => {
  const h = harness();
  h.document.dispatchEvent({ type: "DOMContentLoaded" });
  await settle();
  const phases = recordedEvents(h).map(event => event.phase);
  assert.ok(phases.indexOf("bootstrap") < phases.indexOf("dom-event"));
  assert.ok(phases.indexOf("dom-event") < phases.indexOf("module-evaluated"));
  assert.ok(phases.indexOf("module-evaluated") < phases.indexOf("dom-resumed"));
  assertPendingPhase(h, "style-pending", 1);
});

test("recorder snapshots are bounded, serializable and detached from stored events", () => {
  const h = harness();
  const initial = h.snapshot();
  assert.equal(initial.schema, "robys.android.readiness.v1");
  assert.equal(initial.timeOriginMs, 1788854400000);
  assert.equal(initial.dropped, 0);
  h.window.__robysAndroidReadinessRecord("detail-object", { nested: "must not be retained" });
  h.window.__robysAndroidReadinessRecord("detail-number", 12);
  h.window.__robysAndroidReadinessRecord("detail-nonfinite", Infinity);
  h.window.__robysAndroidReadinessRecord("x".repeat(100), "y".repeat(300));
  const beforeFill = h.snapshot();
  assert.equal(beforeFill.events.find(event => event.phase === "detail-object").detail, undefined);
  assert.equal(beforeFill.events.find(event => event.phase === "detail-number").detail, 12);
  assert.equal(beforeFill.events.find(event => event.phase === "detail-nonfinite").detail, undefined);
  assert.equal(beforeFill.events.at(-1).phase.length, 80);
  assert.equal(beforeFill.events.at(-1).detail.length, 160);
  for (let index = 0; index < 200; index += 1) h.window.__robysAndroidReadinessRecord("fixture-cap", index);
  const full = h.snapshot();
  assert.equal(full.events.length, 128);
  assert.equal(full.dropped, beforeFill.events.length + 200 - 128);
  assert.ok(full.events.every(event => !Object.hasOwn(event, "detail") || ["string", "number"].includes(typeof event.detail)));
  assert.doesNotThrow(() => JSON.stringify(full));
  const frozenCopy = JSON.stringify(full);
  full.schema = "tampered";
  full.events[0].phase = "tampered";
  full.events[0].detail = "tampered";
  full.events.push({ phase: "tampered", atMs: -1 });
  full.dropped = -1;
  assert.equal(JSON.stringify(h.snapshot()), frozenCopy, "Neither array nor event mutations may alter the retained observation");
});

for (const search of ["?entry=day&handoff-gen=1", "?entry=android-handoff", "?entry=android-handoff&handoff-gen=0"]) {
  test(`the readiness recorder is absent outside the native route: ${search}`, async () => {
    const h = harness({ search }); await settle();
    assert.equal(h.window.__robysAndroidReadinessRecord, undefined);
    assert.equal(h.window.__robysAndroidReadinessSnapshot, undefined);
  });
}

async function runRecorderLifecycle(recorderMode, transition, unobserved = false) {
  const h = harness({ recorderMode, unobserved }); await settle();
  if (recorderMode === "disabled") {
    assert.equal(h.window.__robysAndroidReadinessRecord, undefined);
    assert.equal(h.snapshot(), undefined);
  }
  h.dom.resolve(); await settle();
  if (transition === "release-pending") {
    const release = h.window.__robysAndroidHandoffRelease;
    release(); release();
  } else if (transition === "abort-pending") {
    h.window.__robysAndroidHandoffAborted = true;
  }
  if (transition === "stylesheet-error") h.heroStyle.dispatchEvent({ type: "error" });
  else h.loadStyle(h.heroStyle);
  await settle();
  for (const image of h.images) image.decoded.resolve();
  h.fonts.resolve(); await settle();
  await h.frame(); await h.frame();
  if (transition === "release-ready") {
    const release = h.window.__robysAndroidHandoffRelease;
    release(); release();
  }
  await h.tick(6000);
  assert.equal(h.hero.playCalls + h.hero.loadCalls, 0);
  assert.equal(h.overlay(), null);
  assert.equal(h.animations.length, 0);
  assert.equal(h.calls.timers, 0, "Observation cannot introduce a timer");
  assert.equal(h.calls.layoutReads, 0, "Observation cannot introduce layout measurements");
  const expected = transition === "release-ready" ? ["loading", "ready", "releasing", "done"]
    : transition === "release-pending" ? ["loading", "releasing", "done"]
      : transition === "stylesheet-error" ? ["loading", "done"] : ["loading"];
  assert.deepEqual(h.states(), expected);
  if (recorderMode === "full") {
    assert.equal(h.snapshot().events.length, 128);
    assert.ok(h.snapshot().dropped > 0);
  }
  return { states: h.states(), calls: h.calls, images: h.images.map(image => ({ source: image.src, decodeCalls: image.decodeCalls })),
    pendingFrames: h.frames.size, pendingTimers: h.timers.size,
    releasePresent: typeof h.window.__robysAndroidHandoffRelease === "function" };
}

for (const transition of ["release-ready", "release-pending", "abort-pending", "stylesheet-error"]) {
  test(`all recorder modes preserve the unobserved source's ${transition} mechanics`, async () => {
    const baseline = await runRecorderLifecycle("disabled", transition, true);
    for (const mode of ["enabled", "disabled", "deleted", "throwing", "full"]) {
      assert.deepEqual(await runRecorderLifecycle(mode, transition), baseline,
        `${mode} observation must retain states, resource operations and scheduled work`);
    }
  });
}

test("the unobserved controls retain the exact c9 candidate source bytes", () => {
  assert.equal(createHash("sha256").update(unobservedBootstrap).digest("hex"),
    "63411e8b1666f7f81a85d02998b23102bd0419383f14228eca0149001dd03831");
  assert.equal(createHash("sha256").update(unobservedNativeRuntime).digest("hex"),
    "b3fc17389457337e465cb93223907b2d6f2f4b98add0a2925176a80c9927f71f");
});

for (const failure of ["stylesheet", "decode", "opacity"]) {
  test(`${failure} failure is recorded without falsely reporting readiness`, async () => {
    const h = harness(); await settle();
    h.dom.resolve(); await settle();
    if (failure === "stylesheet") h.heroStyle.dispatchEvent({ type: "error" });
    else h.loadStyle(h.heroStyle);
    await settle();
    for (const image of h.images) {
      if (failure === "decode" && image.src === posterUrl) image.decoded.reject(new Error("Fixture decode failure"));
      else image.decoded.resolve();
    }
    if (failure === "opacity") h.actions.computedOpacity = "0";
    h.fonts.resolve(); await settle(); await h.frame(); await h.frame();
    const events = recordedEvents(h);
    assert.ok(events.some(event => event.phase === ({ stylesheet: "style-error", decode: "decode-error", opacity: "opacity-start" })[failure]));
    assert.ok(events.some(event => event.phase === "preparation-error"));
    assert.ok(!events.some(event => event.phase === "state" && event.detail === "ready"));
    if (failure === "opacity") assert.ok(!events.some(event => event.phase === "opacity-end"));
    assert.deepEqual(h.states(), ["loading", "done"]);
  });
}
