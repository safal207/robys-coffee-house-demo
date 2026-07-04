const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const eventBuffer = [];

const VISIT_ATTRIBUTION = Object.freeze({
  schemaVersion: "robys-visit-intent.v0",
  productRef: "PROD-ROBYS-WEB",
  measurementPlanRef: "MPLAN-ROBYS-MENU-TO-VISIT-001",
  storageKey: "robys:visit-intents:v0",
  currency: "TRY",
  attributionWindowHours: 24,
  retentionMs: 8 * 24 * 60 * 60 * 1000,
  maxEvents: 200
});
const VISIT_TOKEN_RE = /^rv_[a-z0-9]{20}$/;
const VISIT_EVENT_RE = /^wev_[a-z0-9]{16}$/;
const RANDOM_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function placementFor(node) {
  if (node.closest(".mobile-cta")) return "mobile_dock";
  if (node.closest(".hero")) return "hero";
  if (node.closest("#visit")) return "visit";
  if (node.closest(".gallery-section")) return "gallery";
  return node.closest("section[id]")?.id || "page";
}

function track(action, details = {}) {
  const payload = {
    event: "robys_action",
    action,
    language: document.documentElement.lang || "tr",
    path: location.pathname,
    ...details
  };

  eventBuffer.push(payload);
  if (eventBuffer.length > 100) eventBuffer.shift();
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  document.dispatchEvent(new CustomEvent("robys:analytics", { detail: payload }));
}

function randomChars(length) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random generation is unavailable");
  }

  let result = "";
  while (result.length < length) {
    const bytes = new Uint8Array(Math.max(16, length - result.length));
    globalThis.crypto.getRandomValues(bytes);
    for (const value of bytes) {
      if (value >= 252) continue;
      result += RANDOM_ALPHABET[value % RANDOM_ALPHABET.length];
      if (result.length === length) break;
    }
  }
  return result;
}

function isVisitIntentRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(",") !== "campaignToken,eventId,eventName,occurredAt") return false;
  if (!VISIT_EVENT_RE.test(value.eventId)) return false;
  if (value.eventName !== "visit_intent_created") return false;
  if (!VISIT_TOKEN_RE.test(value.campaignToken)) return false;
  const occurredAt = Date.parse(value.occurredAt);
  return Number.isFinite(occurredAt);
}

function readVisitIntents(now = Date.now()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIT_ATTRIBUTION.storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isVisitIntentRecord)
      .filter((item) => now - Date.parse(item.occurredAt) <= VISIT_ATTRIBUTION.retentionMs)
      .slice(-VISIT_ATTRIBUTION.maxEvents);
  } catch {
    return [];
  }
}

function writeVisitIntents(events) {
  try {
    localStorage.setItem(
      VISIT_ATTRIBUTION.storageKey,
      JSON.stringify(events.slice(-VISIT_ATTRIBUTION.maxEvents))
    );
    return true;
  } catch {
    return false;
  }
}

function createVisitIntent() {
  return {
    eventId: `wev_${randomChars(16)}`,
    eventName: "visit_intent_created",
    occurredAt: new Date().toISOString(),
    campaignToken: `rv_${randomChars(20)}`
  };
}

function localizedVisitCopy() {
  const language = document.documentElement.lang || "tr";
  return ({
    tr: {
      title: "Ziyaret kodunuz",
      instruction: "Bu kodu kasada gösterin. Böylece web sitesinden gelen ziyaret ölçülebilir.",
      copy: "Kodu kopyala",
      copied: "Kod kopyalandı",
      close: "Kapat"
    },
    en: {
      title: "Your visit code",
      instruction: "Show this code at checkout so the website visit can be measured.",
      copy: "Copy code",
      copied: "Code copied",
      close: "Close"
    },
    ru: {
      title: "Ваш код визита",
      instruction: "Покажите код на кассе, чтобы визит с сайта можно было учесть.",
      copy: "Скопировать код",
      copied: "Код скопирован",
      close: "Закрыть"
    }
  })[language] || ({
    title: "Your visit code",
    instruction: "Show this code at checkout so the website visit can be measured.",
    copy: "Copy code",
    copied: "Code copied",
    close: "Close"
  });
}

function showVisitPass(intent) {
  q("#robys-visit-pass")?.remove();
  const copy = localizedVisitCopy();
  const dialog = document.createElement("dialog");
  dialog.id = "robys-visit-pass";
  dialog.setAttribute("aria-labelledby", "robys-visit-pass-title");

  const title = document.createElement("h2");
  title.id = "robys-visit-pass-title";
  title.textContent = copy.title;

  const instruction = document.createElement("p");
  instruction.textContent = copy.instruction;

  const code = document.createElement("code");
  code.textContent = intent.campaignToken;

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-primary";
  copyButton.textContent = copy.copy;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(intent.campaignToken);
      status.textContent = copy.copied;
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = intent.campaignToken;
    }
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "button button-ghost";
  closeButton.textContent = copy.close;
  closeButton.addEventListener("click", () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.remove();
  });

  const actions = document.createElement("div");
  actions.append(copyButton, closeButton);
  dialog.append(title, instruction, code, status, actions);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function recordVisitIntent(link) {
  const intent = createVisitIntent();
  const events = readVisitIntents();
  events.push(intent);
  const persisted = writeVisitIntents(events);
  const placement = placementFor(link);

  track("visit_intent_created", {
    placement,
    campaign_token: intent.campaignToken,
    measurement_plan_ref: VISIT_ATTRIBUTION.measurementPlanRef,
    persisted
  });
  document.dispatchEvent(new CustomEvent("robys:visit-intent", { detail: intent }));
  showVisitPass(intent);
  return intent;
}

function baselineRunId() {
  return `ATTRRUN-ROBYS-BASELINE-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function buildBaselineBundle(posOrders = []) {
  if (!Array.isArray(posOrders)) throw new TypeError("posOrders must be an array");
  return {
    schemaVersion: "robys-attribution-input.v0",
    runId: baselineRunId(),
    mode: "BASELINE",
    productRef: VISIT_ATTRIBUTION.productRef,
    measurementPlanRef: VISIT_ATTRIBUTION.measurementPlanRef,
    currency: VISIT_ATTRIBUTION.currency,
    attributionWindowHours: VISIT_ATTRIBUTION.attributionWindowHours,
    webEvents: readVisitIntents(),
    posOrders: posOrders.map((order) => ({ ...order }))
  };
}

window.robysAnalytics = {
  track,
  events: () => [...eventBuffer],
  clear: () => { eventBuffer.length = 0; }
};

window.robysVisitAttribution = {
  contract: { ...VISIT_ATTRIBUTION },
  events: () => readVisitIntents().map((event) => ({ ...event })),
  latest: () => {
    const events = readVisitIntents();
    return events.length ? { ...events[events.length - 1] } : null;
  },
  buildBaselineBundle,
  showLatest: () => {
    const latest = window.robysVisitAttribution.latest();
    if (latest) showVisitPass(latest);
    return latest;
  },
  clear: () => writeVisitIntents([])
};

function setupClicks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link) {
      const href = link.href || "";
      if (href.includes("google.com/maps")) {
        let intent = null;
        try {
          intent = recordVisitIntent(link);
        } catch {
          track("visit_intent_unavailable", { placement: placementFor(link) });
        }
        track("route_click", {
          placement: placementFor(link),
          campaign_token: intent?.campaignToken || null
        });
      }
      if (href.includes("instagram.com")) track("instagram_click", { placement: placementFor(link) });
    }

    const languageButton = event.target.closest(".lang-button");
    if (languageButton) {
      track("language_select", {
        placement: "header",
        selected_language: languageButton.dataset.lang || "unknown"
      });
    }

    const galleryCard = event.target.closest(".gallery-card");
    if (galleryCard) {
      track("gallery_open", {
        placement: "gallery",
        image_index: Math.max(0, qa(".gallery-card").indexOf(galleryCard))
      });
    }
  });
}

function setupSectionViews() {
  if (!("IntersectionObserver" in window)) return;
  const seen = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.35 || seen.has(entry.target.id)) return;
      seen.add(entry.target.id);
      track("section_view", { placement: entry.target.id });
      observer.unobserve(entry.target);
    });
  }, { threshold: [0.35] });
  qa("#about,#menu,#gallery,#visit").forEach((section) => observer.observe(section));
}

let initialized = false;
function initAnalytics() {
  if (initialized) return;
  initialized = true;
  setupClicks();
  setupSectionViews();
}

window.addEventListener("pointerdown", initAnalytics, { once: true, passive: true });
window.addEventListener("keydown", initAnalytics, { once: true });
window.addEventListener("scroll", initAnalytics, { once: true, passive: true });
