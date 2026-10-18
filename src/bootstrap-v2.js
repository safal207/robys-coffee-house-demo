document.documentElement.classList.add("js");

const ENTRY_PREPAINT_TIMEOUT_MS = 2_800;

function requestedEntryMode() {
  return new URLSearchParams(window.location.search).get("entry");
}

function resolveEntryScene() {
  const mode = requestedEntryMode();
  if (mode === "off") return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  const navigation = performance.getEntriesByType?.("navigation")?.[0];
  if (navigation?.type === "back_forward") return null;

  if (mode === "morning" || mode === "day" || mode === "night") return mode;

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "night";
}

function revealProductAfterEntryFailure() {
  window.__robysTakeawayEntryAborted = true;
  window.__robysTakeawayEntryRelease?.();
  window.__robysMorningEntryAborted = true;
  window.__robysContextualEntryAborted = true;
  delete document.documentElement.dataset.robysEntryPending;
  document.documentElement.style.visibility = "";
  document.documentElement.style.backgroundColor = "";
  document.querySelector(".robys-takeaway-entry, .robys-morning-entry, .robys-contextual-entry")?.remove();
}

function loadEntryIfEligible() {
  const scene = resolveEntryScene();
  if (!scene) return;

  window.__robysTakeawayEntryAborted = false;
  window.__robysMorningEntryAborted = false;
  window.__robysContextualEntryAborted = false;
  document.documentElement.dataset.robysEntryPending = scene;
  document.documentElement.style.backgroundColor = "#241c1b";
  const cupPreload = document.createElement("link");
  cupPreload.rel = "preload";
  cupPreload.as = "image";
  cupPreload.href = "src/brand/robys-takeaway-cup-v1.webp";
  document.head.append(cupPreload);

  const entryImport = import("./takeaway-entry.js?v=e42f8fe96069");

  entryImport.catch(revealProductAfterEntryFailure);

  window.setTimeout(() => {
    if (document.documentElement.dataset.robysEntryPending) {
      revealProductAfterEntryFailure();
    }
  }, ENTRY_PREPAINT_TIMEOUT_MS);
}

loadEntryIfEligible();
