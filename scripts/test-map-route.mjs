import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
const script = readFileSync("map-route-controller.js", "utf8");
const bootstrap = readFileSync("map-route.js", "utf8");
const deployedBootstrap = readFileSync("bootstrap-v2.js", "utf8");
const bootstrapRevision = createHash("sha256").update(deployedBootstrap).digest("hex").slice(0, 12);
const html = readFileSync("index.html", "utf8");
const menuHtml = readFileSync("menu.html", "utf8");
const profile = JSON.parse(readFileSync("qa/business-profile.json", "utf8"));
const destination = new URL(profile.mapUrl);
const count = (haystack, needle) => haystack.split(needle).length - 1;

function fixture({ secure = true, hasGeo = true } = {}) {
  const navigations = [], callbacks = {};
  const button = {
    hidden: true, disabled: false, attributes: {},
    addEventListener(name, handler) { if (name === "click") this.click = handler; },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const reveal = {
    hidden: true,
    addEventListener(name, handler) { if (name === "click") this.click = handler; }
  };
  const mapCard = { active: false, classList: { add(className) { if (className === "map-active") mapCard.active = true; } } };
  const frame = { dataset: { mapSrc: "https://maps.google.com/maps?q=Robys&output=embed" }, closest: () => mapCard };
  const status = { textContent: "" };
  const routeLink = { href: profile.mapUrl };
  const document = {
    documentElement: { lang: "ru" },
    querySelectorAll(selector) {
      if (selector === "a[data-route-link]") return [routeLink, routeLink, routeLink];
      if (selector === "[data-route-from-me]") return [button];
      return [];
    },
    querySelector(selector) {
      return ({ "#route-status": status, "[data-map-reveal]": reveal, ".map-live-frame[data-map-src]": frame })[selector] ?? null;
    }
  };
  const navigator = hasGeo ? { geolocation: {
    getCurrentPosition(ok, err, options) { callbacks.ok = ok; callbacks.err = err; callbacks.options = options; }
  } } : {};
  const window = { isSecureContext: secure, location: {
    href: "https://example.test/robys-coffee-house-demo/",
    assign(value) { navigations.push(value); }
  } };
  runInNewContext(script, { document, navigator, window, URL });
  return { navigations, callbacks, button, reveal, frame, mapCard, status, routeLink };
}

test("destination is an exact approved Roby's Google Place and all route anchors preserve it", () => {
  assert.equal(destination.hostname, "www.google.com");
  assert.equal(destination.pathname, "/maps/dir/");
  assert.equal(destination.searchParams.get("api"), "1");
  assert.equal(destination.searchParams.get("destination"), "Roby's Coffee House Gazipasa");
  assert.equal(destination.searchParams.get("destination_place_id"), null, "The approved no-JS fallback remains unchanged");
  assert.equal(destination.searchParams.get("travelmode"), "driving");
  assert.equal(count(html, 'data-route-link'), 3);
  assert.equal(count(html, profile.mapUrl), 4); // JSON-LD and three route links
  assert.match(html, /<iframe class="map-live-frame"[^>]+data-map-src="https:\/\/maps\.google\.com/);
  assert.doesNotMatch(html, /<iframe class="map-live-frame"[^>]+\ssrc=/);
});

test("no permission request or third-party iframe before interaction", () => {
  const f = fixture();
  assert.equal(Object.keys(f.callbacks).length, 0);
  assert.equal(f.frame.src, undefined);
  assert.equal(f.navigations.length, 0);
  assert.equal(f.button.hidden, false);
  assert.equal(new URL(f.routeLink.href).searchParams.get("destination_place_id"), "ChIJpdkfSnH13BQRAEJUSGpYxNg", "Ordinary route links must be pinned to the exact venue without GPS");
  assert.equal(f.reveal.hidden, false);
});

test("the origin comes only from a valid browser GPS response", () => {
  const f = fixture();
  f.button.click();
  assert.equal(f.navigations.length, 0);
  assert.equal(f.button.disabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.callbacks.options)), {enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  f.callbacks.ok({coords:{latitude:36.2675839,longitude:32.3082694,accuracy:24}});
  const url = new URL(f.navigations[0]);
  assert.equal(url.searchParams.get("origin"), "36.26758,32.30827");
  assert.equal(url.searchParams.get("destination_place_id"), "ChIJpdkfSnH13BQRAEJUSGpYxNg");
  assert.equal(url.searchParams.get("dir_action"), "navigate");
  assert.equal(f.button.disabled, false);
});

test("denial and inaccurate fixes still open a usable origin-less route", () => {
  const denied = fixture();
  denied.button.click();
  denied.callbacks.err({code:1});
  assert.equal(new URL(denied.navigations[0]).searchParams.has("origin"), false);
  assert.match(denied.status.textContent, /запрещён/);
  const inaccurate = fixture();
  inaccurate.button.click();
  inaccurate.callbacks.ok({coords:{latitude:36.2,longitude:32.2,accuracy:4500}});
  assert.equal(new URL(inaccurate.navigations[0]).searchParams.has("origin"), false);
  const insecure = fixture({secure:false});
  insecure.button.click();
  assert.equal(new URL(insecure.navigations[0]).searchParams.has("origin"), false);
  const absent = fixture({hasGeo:false});
  absent.button.click();
  assert.equal(new URL(absent.navigations[0]).searchParams.has("origin"), false);
});

test("the embedded map loads from a restricted Google origin only on explicit click", () => {
  const f = fixture();
  assert.equal(f.frame.src, undefined);
  f.reveal.click();
  assert.equal(f.frame.src, "https://maps.google.com/maps?q=Robys&output=embed");
  assert.equal(f.mapCard.active, true);
  assert.equal(f.reveal.hidden, true);
  const invalid = fixture();
  invalid.frame.dataset.mapSrc = "https://maps.example.net/track";
  invalid.reveal.click();
  assert.equal(invalid.frame.src, undefined);
  assert.equal(invalid.mapCard.active, false);
});



test("menu CTAs share the exact-place route controller while no-JS anchors remain intact", () => {
  assert.ok(menuHtml.includes(`<script src="bootstrap-v2.js?v=${bootstrapRevision}"></script>`));
  assert.ok(!menuHtml.includes('src="map-route.js?'), "menu no longer downloads the extra route script");
  const anchors = menuHtml.split("<a ").slice(1).map(chunk => chunk.split(">")[0]).filter(tag => tag.includes("data-route-link"));
  assert.equal(anchors.length, 2, "menu has two route links, both enhanced by the shared controller");
  for (const tag of anchors) {
    assert.ok(tag.includes('href="https://www.google.com/maps/dir/'));
    assert.ok(tag.includes('target="_blank"'));
    assert.ok(tag.includes('rel="noopener noreferrer"'));
    assert.ok(tag.includes('destination=Roby%27s+Coffee+House+Gazipasa'));
  }
  assert.equal(count(html, "data-route-link"), 3, "landing retains three route links");
  assert.equal(count(menuHtml, "data-route-link"), 2, "menu retains two route links");
});

test("small bootstrap pins destinations without loading GPS or a third-party iframe eagerly", () => {
  assert.match(bootstrap, /IntersectionObserver/);
  assert.match(bootstrap, /import\(\"\.\/map-route-controller\.js\?v=[a-f0-9]{12}\"\)/);
  assert.match(bootstrap, /destination_place_id/);
  assert.ok(bootstrap.indexOf('getCurrentPosition') < 0);
  assert.ok(bootstrap.indexOf('frame.src') < 0);
  assert.ok(html.includes(`src="bootstrap-v2.js?v=${bootstrapRevision}"`));
  assert.ok(!html.includes('src="map-route.js?'), "home no longer downloads the extra route script");
  assert.ok(deployedBootstrap.includes(transformSync(bootstrap, {
    minify: true, target: "es2020", legalComments: "none"
  }).code.trim()), "the route logic must be delivered in the shared bootstrap");
});
