function emitAndroidHandoffState(state) {
  document.documentElement.dataset.robysAndroidHandoff = state;
  window.dispatchEvent(new CustomEvent("robys:android-handoff", {
    detail: { state }
  }));
}

async function waitForProductFrame() {
  if (!window.__robysAndroidHandoffDomReady) {
    throw new Error("Android product DOM readiness unavailable");
  }
  await window.__robysAndroidHandoffDomReady;

  const hero = document.querySelector(".hero-video");
  const content = document.querySelector(".hero-content");
  const brand = document.querySelector(".site-header .brand-copy");
  if (!hero?.poster || !content || !brand || !document.querySelector('link[data-hero-balance="true"]')) {
    throw new Error("Android product frame dependencies unavailable");
  }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !link.disabled && (!link.media || window.matchMedia(link.media).matches));
  await Promise.all(styles.map((link) => {
    if (link.sheet) return Promise.resolve();
    return new Promise((resolve, reject) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("Android product stylesheet unavailable")), { once: true });
    });
  }));

  const background = getComputedStyle(brand).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
  if (!background) throw new Error("Android product brand unavailable");
  await Promise.all([hero.poster, background].map(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
  }));
  await document.fonts.ready;
  // Preserve the existing entrance timings while keeping transparent titles
  // and actions beneath the native splash until their entrance is complete.
  const entrances = content.getAnimations({ subtree: true })
    .filter((animation) => animation.animationName === "heroContentIn");
  await Promise.all(entrances.map((animation) => animation.finished.catch(() => undefined)));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (const child of content.children) {
    const style = getComputedStyle(child);
    if (style.display !== "none" && Number(style.opacity) < 1) {
      throw new Error("Android product entrance is not visible");
    }
  }
}

async function runNativeProductHandoff() {
  if (window.__robysAndroidHandoffAborted) return;
  let released = false;
  // The native splash covers all preparation. Its visual-state callback must
  // certify the product itself, so release has no second surface to animate.
  document.documentElement.style.backgroundColor = "";
  window.__robysAndroidHandoffRelease = () => {
    if (released) return;
    released = true;
    emitAndroidHandoffState("releasing");
    emitAndroidHandoffState("done");
    delete window.__robysAndroidHandoffRelease;
  };
  emitAndroidHandoffState("loading");
  try {
    await waitForProductFrame();
  } catch (error) {
    if (!released && !window.__robysAndroidHandoffAborted) throw error;
    return;
  }
  if (released || window.__robysAndroidHandoffAborted) return;
  emitAndroidHandoffState("ready");
}

runNativeProductHandoff().catch(() => {
  document.querySelector(".robys-android-handoff")?.remove();
  document.documentElement.style.backgroundColor = "";
  emitAndroidHandoffState("done");
  delete window.__robysAndroidHandoffRelease;
});
