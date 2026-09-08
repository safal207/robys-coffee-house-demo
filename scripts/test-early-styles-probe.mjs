import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html");
const owners = ["conversion.js", "qa.js", "pwa.js"].map((path) => ({ path, source: read(path) }));
const originalStyles = [
  "styles-v2.css", "mobile.css", "conversion.css", "final-qa.css", "gallery-clean.css",
  "map-live.css", "menu-preview.css", "featured-strip.css", "featured-gallery.css",
  "social-offer.css", "community-reel.css", "brand-photo-logo.css", "order-shell.css"
];
const earlyStyles = ["android-app.css", "hero-balance.css", "mobile-install.css"];
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)]
  .map((match) => [match[1], match[2]]));
const links = (page) => [...page.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attributes(tag));
const stylesheetLinks = (page) => links(page).filter((link) => link.rel === "stylesheet");
const basename = (href) => href.split("?")[0];

test("homepage puts the three real stylesheets after the existing thirteen with current owner revisions", () => {
  const styles = stylesheetLinks(html);
  assert.deepEqual(styles.map((link) => basename(link.href)), [...originalStyles, ...earlyStyles]);
  const tail = styles.slice(-3);
  assert.equal(tail[1]["data-hero-balance"], "true");
  for (const [index, link] of tail.entries()) {
    assert.ok(owners[index].source.includes(link.href), `${link.href} must match its actual loader URL`);
    assert.equal(link.media, undefined, "The experiment must not make a required stylesheet conditional");
    assert.equal(link.disabled, undefined);
  }
  const androidRevision = createHash("sha256").update(read("android-app.css")).digest("hex").slice(0, 12);
  assert.equal(tail[0].href, `android-app.css?v=${androidRevision}`);
  assert.match(html, /\bid="visit"/);
  assert.doesNotMatch(html, /\bid="android-app"/, "The Android section must remain owned by conversion");
});

test("the isolated early stylesheet declaration does not spread to menu or discover", () => {
  for (const page of ["menu.html", "discover.html"]) {
    const present = stylesheetLinks(read(page)).map((link) => basename(link.href));
    assert.ok(earlyStyles.every((name) => !present.includes(name)), `${page} acquired an experimental stylesheet`);
  }
});

// This DOM models stylesheet ownership and insertion only. It does not load
// resources, compute styles, run layout, or assert browser scheduling behavior.
function ownerHarness({ removeEarlyLinks = false } = {}) {
  const dataKey = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  class Node extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = new Map();
      this.style = { setProperty: (name, value) => { this.style[name] = value; } };
      this.classList = { toggle() {} };
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name.startsWith("data-")) this.dataset[dataKey(name)] = String(value);
      else this[name] = String(value);
    }
    getAttribute(name) {
      if (name.startsWith("data-")) return this.dataset[dataKey(name)] ?? null;
      return this[name] ?? this.attributes.get(name) ?? null;
    }
    append(...nodes) {
      for (const node of nodes) {
        if (typeof node === "string") continue;
        this.children.push(node);
        node.parent = this;
      }
    }
    before(node) {
      assert.ok(this.parent, "Insertion point must be in the document");
      this.parent.children.splice(this.parent.children.indexOf(this), 0, node);
      node.parent = this.parent;
    }
    removeAttribute(name) { this.attributes.delete(name); delete this[name]; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    querySelectorAll(selector) {
      const matches = (node) => {
        if (selector.startsWith("#")) return node.id === selector.slice(1);
        if (selector.startsWith(".")) return (node.className ?? "").split(/\s+/).includes(selector.slice(1));
        const match = selector.match(/^([a-z]+)(?:\[([\w-]+)(\^?=)"([^"]+)"\])?$/);
        assert.ok(match, `Unsupported fixture selector: ${selector}`);
        if (node.tagName !== match[1].toUpperCase()) return false;
        if (!match[2]) return true;
        const value = node.getAttribute(match[2]);
        return match[3] === "^=" ? typeof value === "string" && value.startsWith(match[4]) : value === match[4];
      };
      return this.children.flatMap((node) => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
  }
  const root = new Node("html"), head = new Node("head"), body = new Node("body"), visit = new Node("section");
  root.lang = "tr";
  root.append(head, body);
  visit.id = "visit";
  body.append(visit);
  for (const attrs of links(html)) {
    if (removeEarlyLinks && attrs.rel === "stylesheet" && earlyStyles.includes(basename(attrs.href))) continue;
    const node = new Node("link");
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    head.append(node);
  }
  const document = Object.assign(new EventTarget(), {
    documentElement: root, head, body, readyState: "interactive", hidden: false,
    createElement: (tag) => new Node(tag),
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector)
  });
  const window = new EventTarget();
  const context = vm.createContext({
    document, window, navigator: { onLine: true },
    addEventListener: window.addEventListener.bind(window)
  });
  return {
    document, head, body, visit,
    styles: () => document.querySelectorAll('link[rel="stylesheet"]'),
    runOwners() {
      for (const { path, source } of owners) {
        // Each real script keeps its lexical scope, as the modules do in HTML.
        vm.runInContext(`(() => {\n${source}\n})();`, context, { filename: path });
      }
    }
  };
}

for (const removeEarlyLinks of [false, true]) {
  test(`real conversion, QA and PWA loaders ${removeEarlyLinks ? "restore omitted" : "reuse parser-owned"} styles in order`, () => {
    const h = ownerHarness({ removeEarlyLinks });
    const before = h.styles();
    assert.equal(before.length, removeEarlyLinks ? 13 : 16);
    h.runOwners();
    const after = h.styles();
    assert.deepEqual(after.map((link) => basename(link.href)), [...originalStyles, ...earlyStyles]);
    assert.deepEqual(after.map((link) => link.href), stylesheetLinks(html).map((link) => link.href),
      "Fallback owners and parser declarations must request the same revisions");
    assert.equal(after.length, 16, "Real stylesheet loaders must neither duplicate nor lose required styles");
    for (let index = 0; index < before.length; index += 1) {
      assert.equal(after[index], before[index], "Owners must preserve existing link identity and cascade position");
    }
    assert.equal(after[14].dataset.heroBalance, "true");
    assert.equal(h.body.children.length, 2);
    assert.equal(h.body.children[0].id, "android-app", "Reusing CSS must not skip Android section creation");
    assert.equal(h.body.children[1], h.visit);
    assert.ok(h.document.querySelector(".android-download-button"));
    assert.equal(h.document.documentElement.style["--ruby"], "#b24753", "The real QA initializer must execute");
    assert.equal(h.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content, "yes",
      "The real PWA initializer must execute");
  });
}
