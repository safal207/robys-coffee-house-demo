// Keep the suggestion UI and order storage out of the initial page load.
const host = document.querySelector("[data-choice-help]");
const entry = host?.querySelector(".choice-help-entry");
if (entry) {
  const key = "robys-choice-help.v1";
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key)); } catch {}
  const seen = saved?.seen === true;
  let elapsed = Number(saved?.elapsed) || 0;
  let last = performance.now();
  let active = last;
  let loading = false;
  let manual = false;
  const events = ["pointerdown", "keydown", "input", "scroll", "focusin"];
  const activity = () => { active = performance.now(); };
  for (const event of events) document.addEventListener(event, activity, true);
  const visibility = () => { last = performance.now(); active = last; };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pageshow", visibility);
  const save = () => {
    try { sessionStorage.setItem(key, JSON.stringify({ seen, elapsed })); } catch {}
  };
  window.addEventListener("pagehide", save);

  async function load(explicit = false) {
    manual ||= explicit;
    if (loading) return;
    loading = true;
    try {
      const { initChoiceHelp } = await import("./choice-help.js?v=98cc0d9e1fc3");
      window.clearInterval(timer);
      for (const event of events) document.removeEventListener(event, activity, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("pagehide", save);
      entry.removeEventListener("click", click);
      const helper = initChoiceHelp(host, { entry, initialElapsed: elapsed, initialIdle: performance.now() - active });
      if (manual) helper?.show();
      else helper?.offerAutomatic();
    } catch { loading = false; }
  }
  const click = () => { void load(true); };
  entry.addEventListener("click", click);
  const timer = seen ? undefined : window.setInterval(() => {
    const now = performance.now();
    if (!document.hidden) elapsed += now - last;
    last = now;
    if (elapsed >= 45000 && !document.hidden) void load();
  }, 1000);
}
