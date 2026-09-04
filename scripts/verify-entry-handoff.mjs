import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync("bootstrap.js", "utf8");
const morning = readFileSync("morning-entry.js", "utf8");
const contextual = readFileSync("day-night-entry.js", "utf8");
const styles = readFileSync("styles.css", "utf8");
const serviceWorker = readFileSync("sw.js", "utf8");

const pendingMarker = "document.documentElement.dataset.robysEntryPending = scene";
const hiddenMarker = 'document.documentElement.style.visibility = "hidden"';
const prepaintMarker = "document.documentElement.style.backgroundColor = scene";
const importMarker = "const entryImport = scene === \"morning\"";
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

for (const [name, runtime] of [["morning", morning], ["day/night", contextual]]) {
  const release = runtime.indexOf("delete document.documentElement.dataset.robysEntryPending");
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
  bootstrap.includes("20260904-handoff-v24") && serviceWorker.includes("20260904-handoff-v24"),
  "Day/night entry revision must be synchronized with offline delivery"
);

console.log("✅ ENTRY-HANDOFF-001 passed: paintable branded pre-paint, synchronized hero reveal, failure recovery and cache revision are wired.");
