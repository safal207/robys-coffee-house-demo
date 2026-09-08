import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const nativeRuntime = readFileSync(new URL("../android-native-product-frame.js", import.meta.url), "utf8");
const legacyRuntime = readFileSync(new URL("../android-handoff.js", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../bootstrap-v2.js", import.meta.url), "utf8");
const bootstrapStartup = bootstrap.indexOf("\ninstallAppleTouchIcon();");
assert.ok(bootstrapStartup > 0, "Bootstrap function definitions must precede startup");
// Exercise the real route and DOM-ready capture. Only module transport is
// substituted, retaining the asynchronous boundary of dynamic import.
const bootstrapFunctions = bootstrap.slice(0, bootstrapStartup)
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
  aborted = false, capturedDom = true, moduleFailure = false, background = `url("${brandUrl}")` } = {}) {
  let time = 0;
  let sequence = 0;
  const timers = new Map(), frames = new Map(), images = [], animations = [], events = [], heroAnimations = [], imports = [];
  const dom = deferred(), fonts = deferred();
  class Target {
    listeners = new Map();
    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push({ callback, once: options.once, capture: options === true || options.capture === true });
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, callback) {
      this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item.callback !== callback));
    }
    dispatchEvent(event) {
      event.target ??= this;
      for (const item of [...(this.listeners.get(event.type) ?? [])]) {
        if (item.once) this.removeEventListener(event.type, item.callback);
        item.callback(event);
      }
      return true;
    }
    dispatchCapturedEvent(event) {
      for (const item of [...(this.listeners.get(event.type) ?? [])].filter(item => item.capture)) {
        if (item.once) this.removeEventListener(event.type, item.callback);
        item.callback(event);
      }
    }
  }
  const schedule = (callback, duration) => {
    const id = ++sequence;
    timers.set(id, { callback, at: time + duration });
    return id;
  };
  class Element extends Target {
    constructor(tag) { super(); this.tag = tag; this.tagName = tag.toUpperCase(); }
    children = [];
    style = {};
    dataset = {};
    attributes = new Map();
    computedOpacity = "1";
    rendered = true;
    getClientRects() { return this.rendered ? [this.getBoundingClientRect()] : []; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.rendered ? 100 : 0, height: this.rendered ? 40 : 0 }; }
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
    location: { search }, setTimeout: schedule, clearTimeout: id => timers.delete(id),
    __robysAndroidHandoffAborted: aborted,
    matchMedia: query => ({ matches: query.includes("prefers-reduced-motion") ? reduced : query !== "not all" })
  });
  dom.promise.then(() => document.dispatchEvent({ type: "DOMContentLoaded" }));
  window.addEventListener("robys:android-handoff", event => events.push({ state: event.detail.state, at: time }));
  const context = vm.createContext({
    window, document, URLSearchParams, Image: ControlledImage,
    loadFixtureModule(specifier) {
      imports.push(specifier);
      return Promise.resolve().then(() => {
        if (moduleFailure) throw new Error("Fixture module transport unavailable");
        const path = specifier.split("?")[0];
        assert.ok(path === nativeModulePath || specifier === legacyModuleSpecifier,
          `Unexpected handoff import: ${specifier}`);
        vm.runInContext(path === nativeModulePath ? nativeRuntime : legacyRuntime, context, { filename: path });
        return {};
      });
    },
    getComputedStyle: element => {
      if (element === brand) return { backgroundImage: background };
      assert.ok(element === heroContent || heroContent.children.includes(element), "Unexpected styled product element");
      return { opacity: element.computedOpacity, display: element.rendered ? "block" : "none", visibility: "visible" };
    },
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext(bootstrapFunctions, context, { filename: "bootstrap-v2.js" });
  const requested = vm.runInContext("loadAndroidHandoffIfRequested()", context);
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
    for (const callback of pending) callback(time);
    await settle();
  };
  const loadStyle = link => { link.sheet = { cssRules: [] }; link.dispatchEvent({ type: "load" }); };
  // Resource errors do not bubble; exercise the document capture listener
  // before dispatching to the target's own listeners, without browser I/O.
  const failResource = target => {
    const event = { type: "error", target };
    document.dispatchCapturedEvent(event);
    target.dispatchEvent(event);
  };
  const captureListeners = () => (document.listeners.get("error") ?? []).filter(item => item.capture).length;
  const abort = () => vm.runInContext("revealProductAfterAndroidHandoffFailure()", context);
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
    images, animations, events, frames, timers, imports, requested, tick, frame, loadStyle, failResource,
    captureListeners, abort, readyDependencies,
    overlay: () => root.querySelector(".robys-android-handoff"), states: () => events.map(event => event.state) };
}

for (const moduleStarted of [false, true]) {
  test(`stylesheet error before DOM readiness is retained when module started=${moduleStarted}`, async () => {
    const h = harness();
    if (moduleStarted) await settle();
    h.failResource(h.heroStyle);
    h.dom.resolve(); await settle();
    assert.deepEqual(h.states(), ["loading", "done"], "A spent stylesheet error must fail preparation instead of waiting forever");
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
    assert.equal(h.captureListeners(), 0);
    assert.equal(h.images.length, 0, "Missing required styling must not advance to product assets");
    assert.equal(h.frames.size, 0);
    assert.equal(h.timers.size, 0, "Failure recovery must not introduce a timeout");
  });
}

test("only native entry captures stylesheet errors, without scheduling work", async () => {
  const native = harness();
  assert.equal(native.captureListeners(), 1);
  assert.equal(native.timers.size, 0);
  assert.equal(native.frames.size, 0);
  for (const search of ["?entry=android-handoff", "?entry=android-handoff&handoff-gen=0", "?entry=day"]) {
    const browser = harness({ search });
    assert.equal(browser.captureListeners(), 0, "Browser routes must not install native resource capture");
    await settle();
    assert.equal(browser.captureListeners(), 0);
  }
  native.abort();
  assert.equal(native.captureListeners(), 0);
});

test("stylesheet failure after subscription also disposes early capture", async () => {
  const h = harness(); h.dom.resolve(); await settle();
  assert.equal(h.captureListeners(), 1);
  h.failResource(h.heroStyle); await settle();
  assert.deepEqual(h.states(), ["loading", "done"]);
  assert.equal(h.captureListeners(), 0);
  assert.equal(h.window.__robysAndroidStylesheetErrors, undefined);
});

test("non-stylesheet and inactive stylesheet failures do not reject healthy required styling", async () => {
  const h = harness();
  const disabled = h.stylesheet("disabled.css"); disabled.disabled = true;
  const print = h.stylesheet("print.css"); print.media = "not all";
  h.styles.push(disabled, print);
  const preload = h.document.createElement("link"); preload.rel = "preload"; preload.href = h.heroStyle.href;
  for (const target of [disabled, print, preload, h.document.createElement("img")]) h.failResource(target);
  h.dom.resolve(); await settle();
  h.loadStyle(h.heroStyle); await settle();
  assert.equal(h.captureListeners(), 0, "Capture ends when required styles settle");
  for (const image of h.images) image.decoded.resolve();
  h.fonts.resolve(); await settle(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(disabled.sheet, null);
  assert.equal(print.sheet, null);
});

test("a stylesheet recovered before discovery is accepted despite its earlier error", async () => {
  const h = harness();
  h.failResource(h.heroStyle);
  h.loadStyle(h.heroStyle);
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(h.captureListeners(), 0);
  assert.equal(h.window.__robysAndroidStylesheetErrors, undefined);
});

test("an old URL failure does not reject a pending replacement URL on the same stylesheet link", async () => {
  const h = harness();
  h.failResource(h.heroStyle);
  h.heroStyle.href = "hero-balance.css?v=recovered";
  h.dom.resolve(); await settle();
  assert.deepEqual(h.states(), ["loading"], "A replacement request must remain pending until it settles");
  await h.readyDependencies(); await h.frame(); await h.frame();
  assert.deepEqual(h.states(), ["loading", "ready"]);
  assert.equal(h.captureListeners(), 0);
});

for (const action of ["release", "abort"]) {
  test(`${action} before DOM readiness disposes capture and cannot revive readiness`, async () => {
    const h = harness(); await settle();
    assert.equal(h.captureListeners(), 1);
    if (action === "release") h.window.__robysAndroidHandoffRelease();
    else h.abort();
    const completedStates = h.states();
    assert.equal(h.captureListeners(), 0);
    assert.equal(h.window.__robysAndroidStylesheetErrors, undefined);
    h.failResource(h.heroStyle);
    await h.readyDependencies(); await h.frame(); await h.frame();
    assert.deepEqual(h.states(), completedStates);
    assert.equal(h.window.__robysAndroidHandoffRelease, undefined);
    assert.equal(h.captureListeners(), 0);
  });
}

test("import failure, an already aborted module and page exit dispose capture", async () => {
  for (const options of [{ moduleFailure: true }, { aborted: true }]) {
    const h = harness(options); await settle();
    assert.equal(h.captureListeners(), 0);
    assert.equal(h.window.__robysAndroidStylesheetErrors, undefined);
    assert.ok(!h.states().includes("ready"));
  }
  const h = harness();
  assert.equal(h.captureListeners(), 1);
  h.window.dispatchEvent({ type: "pagehide" });
  assert.equal(h.captureListeners(), 0);
  assert.equal(h.window.__robysAndroidStylesheetErrors, undefined);
  assert.equal((h.window.listeners.get("pagehide") ?? []).length, 0);
  h.abort();
});

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
