import { createTakeawayScene, runTakeawayEntry } from "../takeaway-entry.js";
const params = new URLSearchParams(location.search);
const language = ["tr", "en", "ru"].includes(params.get("lang")) ? params.get("lang") : "tr";
if (params.get("mode") === "run") {
  localStorage.setItem("robys-language", language);
  sessionStorage.removeItem("robys-takeaway-entry-v1");
  const events = [];
  const start = performance.now();
  window.addEventListener("robys:entry-state", (event) => {
    events.push(`${event.detail.state}: ${Math.round(performance.now() - start)} ms`);
    parent.postMessage({ type: "takeaway-qa", summary: events.join(" → ") }, location.origin);
  });
  document.documentElement.dataset.robysEntryPending = "day";
  runTakeawayEntry("day");
} else {
  const { overlay, content } = createTakeawayScene(language);
  content.style.opacity = "1";
  overlay.querySelector("button").addEventListener("click", () => overlay.remove());
  document.body.append(overlay);
}
