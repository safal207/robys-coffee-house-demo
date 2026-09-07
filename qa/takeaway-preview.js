const frame = document.querySelector("iframe");
const language = document.querySelector("#language");
const width = document.querySelector("#width");
const events = document.querySelector("#events");
let mode = "still";
const selectedLanguage = () => language.value === "ru" ? "ru" : language.value === "en" ? "en" : "tr";
function show(next = mode) {
  mode = next === "run" ? "run" : "still";
  const pixels = width.value === "320" ? 320 : width.value === "768" ? 768 : width.value === "1280" ? 1280 : 390;
  frame.width = String(pixels);
  frame.height = pixels >= 768 ? 720 : 844;
  events.textContent = mode === "still" ? "Still frame: production component and CSS, no timer." : "Playing production entry…";
  const target = new URL("takeaway-scene.html", location.href);
  target.search = new URLSearchParams({ lang: selectedLanguage(), mode, replay: String(Date.now()) }).toString();
  frame.src = target.href;
}
language.addEventListener("change", () => show());
width.addEventListener("change", () => show());
document.querySelector("#still").addEventListener("click", () => show("still"));
document.querySelector("#replay").addEventListener("click", () => show("run"));
document.querySelector("#product").addEventListener("click", () => {
  localStorage.setItem("robys-language", selectedLanguage());
  frame.src = "../index.html?entry=day";
  events.textContent = "Actual homepage. Verify the page remains usable after the entry.";
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "takeaway-qa") return;
  events.textContent = event.data.summary;
});
