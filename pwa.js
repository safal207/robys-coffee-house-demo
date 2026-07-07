const SERVICE_WORKER_URL = "sw.js?v=offline-20260707-ios-install-3";
const MOBILE_INSTALL_RUNTIME_URL = "mobile-install.js?v=ios-install-20260707-1";
const TRUSTED_TYPES_POLICY = "robys-pwa";
const TRUSTED_SCRIPT_URLS = new Set([SERVICE_WORKER_URL, MOBILE_INSTALL_RUNTIME_URL]);

let trustedTypesPolicy;
let mobileInstallRuntimePromise;

function syncConnectivityState() {
  document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  const status = document.querySelector("[data-connectivity-status]");
  if (status) status.textContent = navigator.onLine ? "Online" : "Offline";
}

function trustedScriptUrl(value) {
  if (!window.trustedTypes) return value;
  trustedTypesPolicy ??= window.trustedTypes.createPolicy(TRUSTED_TYPES_POLICY, {
    createScriptURL(candidate) {
      if (!TRUSTED_SCRIPT_URLS.has(candidate)) throw new TypeError("Unexpected script URL");
      return candidate;
    }
  });
  return trustedTypesPolicy.createScriptURL(value);
}

function ensureHeadElement(selector, create) {
  if (document.head.querySelector(selector)) return;
  document.head.append(create());
}

function ensureMobileInstallAssets() {
  ensureHeadElement('link[rel="manifest"]', () => {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.webmanifest?v=ios-install-20260707-1";
    return link;
  });

  ensureHeadElement('link[href^="mobile-install.css"]', () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "mobile-install.css?v=ios-install-20260707-1";
    return link;
  });

  ensureHeadElement('link[rel="apple-touch-icon"]', () => {
    const link = document.createElement("link");
    link.rel = "apple-touch-icon";
    link.href = "icon.svg?v=ios-install-20260707-1";
    return link;
  });

  [
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "Roby's"],
    ["mobile-web-app-capable", "yes"]
  ].forEach(([name, content]) => {
    ensureHeadElement(`meta[name="${name}"]`, () => {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      return meta;
    });
  });
}

function loadMobileInstallRuntime() {
  if (mobileInstallRuntimePromise) return mobileInstallRuntimePromise;
  mobileInstallRuntimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = trustedScriptUrl(MOBILE_INSTALL_RUNTIME_URL);
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      mobileInstallRuntimePromise = undefined;
      reject(new Error("Roby's mobile install runtime could not load"));
    }, { once: true });
    document.head.append(script);
  });
  return mobileInstallRuntimePromise;
}

function setupMobileInstallLoader() {
  const visit = document.querySelector("#visit");
  if (!visit) return;

  const retry = () => {
    window.addEventListener("online", load, { once: true });
    document.addEventListener("pointerdown", load, { once: true, passive: true });
  };

  const load = () => loadMobileInstallRuntime().catch((error) => {
    console.warn(error);
    retry();
    throw error;
  });

  if (!("IntersectionObserver" in window)) {
    window.addEventListener("scroll", () => void load(), { once: true, passive: true });
    document.addEventListener("pointerdown", () => void load(), { once: true, passive: true });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    void load().then(() => observer.disconnect()).catch(() => {});
  }, { rootMargin: "1400px 0px", threshold: 0 });
  observer.observe(visit);
}

syncConnectivityState();
window.addEventListener("online", syncConnectivityState);
window.addEventListener("offline", syncConnectivityState);
ensureMobileInstallAssets();

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", setupMobileInstallLoader, { once: true })
  : setupMobileInstallLoader();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(trustedScriptUrl(SERVICE_WORKER_URL), { scope: "./" });
      await navigator.serviceWorker.ready;
      document.documentElement.dataset.offlineReady = "true";
      registration.update().catch(() => {});
    } catch (error) {
      document.documentElement.dataset.offlineReady = "false";
      console.warn("Roby's offline mode could not start", error);
    }
  }, { once: true });
}
