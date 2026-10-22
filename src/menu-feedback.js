// Feedback never delays an action. Sound is an explicit, local preference.
export const MENU_SOUND_KEY = "robys-menu-sound";
const copy = {
  tr: ["Menü sesini aç", "Menü sesini kapat"],
  en: ["Turn menu sound on", "Turn menu sound off"],
  ru: ["Включить звук меню", "Выключить звук меню"]
};
export function readMenuSound(storage) {
  try { return storage?.getItem(MENU_SOUND_KEY) === "on"; } catch { return false; }
}
export function createMenuSound({ storage, createContext, now = () => performance.now(), audible = () => !document.hidden }) {
  let enabled = readMenuSound(storage), context, last = -Infinity;
  const play = () => {
    if (!enabled || !audible()) return;
    const time = now();
    if (time - last < 100) return;
    last = time;
    try {
      context ??= createContext();
      if (!context) return;
      const ring = () => {
        // A tab can become hidden while the audio context is resuming.
        if (!enabled || !audible() || context.state !== "running") return;
        const start = context.currentTime;
        const voice = context.createOscillator(), volume = context.createGain();
        voice.type = "sine";
        voice.frequency.setValueAtTime(740, start);
        voice.frequency.exponentialRampToValueAtTime(1046, start + .045);
        volume.gain.setValueAtTime(0, start);
        volume.gain.linearRampToValueAtTime(.025, start + .006);
        volume.gain.exponentialRampToValueAtTime(.0001, start + .075);
        voice.connect(volume); volume.connect(context.destination);
        voice.onended = () => { voice.disconnect(); volume.disconnect(); };
        voice.start(start); voice.stop(start + .08);
      };
      if (context.state === "running") ring();
      else if (context.state !== "closed") context.resume().then(ring).catch(() => {});
    } catch { /* Unsupported or blocked audio must never affect menu actions. */ }
  };
  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try { storage?.setItem(MENU_SOUND_KEY, enabled ? "on" : "off"); } catch { /* Session-only preference remains usable. */ }
      if (enabled) play();
      return enabled;
    },
    play
  };
}

export function initializeMenuFeedback(toggle, activate = false) {
  if (!toggle || toggle.dataset.soundReady) return;
  toggle.dataset.soundReady = "true";
  let storage;
  try { storage = window.localStorage; } catch { /* Private browsing can disable storage. */ }
  const sound = createMenuSound({ storage, createContext: () => {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    return Audio ? new Audio() : null;
  } });
  const refresh = () => {
    const language = document.documentElement.lang;
    const label = (copy[language] ?? copy.tr)[Number(sound.enabled)];
    toggle.setAttribute("aria-label", label); toggle.title = label;
    toggle.setAttribute("aria-pressed", String(sound.enabled));
  };
  refresh();
  if (activate) { sound.toggle(); refresh(); }
  toggle.addEventListener("click", event => {
    // Only an actual user activation can opt into audio.
    if (!event.isTrusted) return;
    sound.toggle(); refresh();
  });
  document.addEventListener("click", event => {
    if (!event.isTrusted || event.defaultPrevented) return;
    const control = event.target.closest?.("button, a[href]");
    if (!control || control === toggle || control.disabled || control.getAttribute("aria-disabled") === "true") return;
    sound.play();
  }, { capture: true });
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return sound;
}
