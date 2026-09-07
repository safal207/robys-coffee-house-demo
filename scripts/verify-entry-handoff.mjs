import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const bootstrap = readFileSync("bootstrap-v2.js", "utf8");
const takeaway = readFileSync("takeaway-entry.js", "utf8");
const styles = readFileSync("styles-v2.css", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");
const entryPages = ["index.html", "menu.html", "discover.html"].map((file) => readFileSync(file, "utf8"));

const pendingMarker = "document.documentElement.dataset.robysEntryPending = scene";
const hiddenMarker = 'document.documentElement.style.visibility = "hidden"';
const prepaintMarker = 'document.documentElement.style.backgroundColor = "#241c1b"';
const importMarker = 'const entryImport = import("./takeaway-entry.js';
assert(bootstrap.includes(pendingMarker), "Entry bootstrap must mark the pre-paint handoff");
assert(!bootstrap.includes(hiddenMarker), "Slow entry delivery must keep the product document paintable");
assert(bootstrap.includes(prepaintMarker), "Entry bootstrap must apply the branded pre-paint surface");
assert(
  bootstrap.indexOf(pendingMarker) < bootstrap.indexOf(importMarker) &&
    bootstrap.indexOf(prepaintMarker) < bootstrap.indexOf(importMarker),
  "Pending state and branded pre-paint must be applied before the async scene import"
);
assert(
  bootstrap.includes("if (document.documentElement.dataset.robysEntryPending)"),
  "Entry timeout must recover only a genuinely pending handoff"
);
assert(
  bootstrap.includes("delete document.documentElement.dataset.robysEntryPending"),
  "Entry failure recovery must release the hero animation"
);

for (const [name, runtime] of [["takeaway (all times of day)", takeaway]]) {
  const release = runtime.indexOf("delete root.dataset.robysEntryPending", runtime.indexOf("const finish ="));
  const fade = runtime.indexOf("animateSafe(overlay", release);
  assert(release >= 0, `${name} scene must release the pending marker`);
  assert(fade > release, `${name} scene must start the hero handoff before fading its overlay`);
}

assert(
  styles.includes("html[data-robys-entry-pending] .hero-content>*{animation-play-state:paused}"),
  "Hero content motion must wait for the splash handoff"
);
assert(
  styles.includes("html[data-robys-entry-pending] .site-header{opacity:0;transform:translateY(-10px)}"),
  "Header must not flash through the splash"
);
assert(
  bootstrap.includes(`takeaway-entry.js?v=${createHash("sha256").update(takeaway).digest("hex").slice(0, 12)}`) &&
    serviceWorker.includes(bootstrap.match(/takeaway-entry\.js\?v=[a-f0-9]{12}/)?.[0]),
  "Active takeaway runtime must match its bytes and its offline revision"
);
for (const page of entryPages) {
  const bootstrapTag = page.match(/<script\b[^>]*src="bootstrap-v2\.js\?v=[a-f0-9]{12}"[^>]*><\/script>/)?.[0] ?? "";
  assert(/src="bootstrap-v2\.js\?v=[a-f0-9]{12}"/.test(page), "Entry pages must load the cache-new revisioned bootstrap");
  assert(bootstrapTag && !/\b(?:defer|async)\b/.test(bootstrapTag), "Entry bootstrap must block parsing long enough to establish prepaint state");
  assert(/href="styles-v2\.css\?v=[a-f0-9]{12}"/.test(page), "Entry pages must load the cache-new revisioned base stylesheet");
  assert(!page.includes('src="bootstrap.js') && !page.includes('href="styles.css'), "Entry pages must not request legacy cache-colliding assets");
}
assert(
  serviceWorker.includes('"./bootstrap-v2.js?v=') &&
    serviceWorker.includes('"./takeaway-entry.js?v=') &&
    serviceWorker.includes('"./src/brand/robys-takeaway-cup-v1.webp"') &&
    serviceWorker.includes('"./styles-v2.css?v='),
  "Service worker must precache all entry assets at their exact cache-new revisions"
);
assert(
  serviceWorker.includes('url.pathname.endsWith("/bootstrap-v2.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/takeaway-entry.js")') &&
    serviceWorker.includes('url.pathname.endsWith("/styles-v2.css")'),
  "Entry assets must use exact revision matching in the service worker"
);
assert(
  /import\("\.\/takeaway-entry\.js\?v=[a-f0-9]{12}"\)/.test(bootstrap) &&
    !/import\("\.\/(?:morning-entry|day-night-entry)/.test(bootstrap),
  "All web entries must use one content-revisioned scene, without chaining legacy scenes"
);

console.log("✅ ENTRY-HANDOFF-001 passed: paintable branded pre-paint, synchronized hero reveal, failure recovery and cache revision are wired.");
