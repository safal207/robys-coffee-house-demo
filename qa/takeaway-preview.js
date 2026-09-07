const frame = document.querySelector("iframe");
const language = document.querySelector("#language");
const width = document.querySelector("#width");
const events = document.querySelector("#events");
let mode = "still";
function show(next = mode) {
  mode = next;
  frame.width = width.value;
  frame.height = Number(width.value) >= 768 ? 720 : 844;
  events.textContent = mode === "still" ? "Still frame: production component and CSS, no timer." : "Playing production entry…";
  frame.src = `takeaway-scene.html?lang=${language.value}&mode=${mode}&replay=${Date.now()}`;
}
language.addEventListener("change", () => show());
width.addEventListener("change", () => show());
document.querySelector("#still").addEventListener("click", () => show("still"));
document.querySelector("#replay").addEventListener("click", () => show("run"));
document.querySelector("#product").addEventListener("click", () => {
  localStorage.setItem("robys-language", language.value);
  frame.src = "../index.html?entry=day";
  events.textContent = "Actual homepage. Verify the page remains usable after the entry.";
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "takeaway-qa") return;
  events.textContent = event.data.summary;
});
