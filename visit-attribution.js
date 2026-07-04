(() => {
  if (window.robysVisitAttribution) return;

  const q = (selector, root = document) => root.querySelector(selector);
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
  const TOKEN_TIMESTAMP_WIDTH = 7;
  const TOKEN_RANDOM_WIDTH = 13;
  const POS_ORDER_ID_RE = /^ord_[a-z0-9][a-z0-9_-]{2,63}$/;
  const MONEY_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
  const OFFSET_DATE_TIME_RE = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/;

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

  function encodeCampaignTimestamp(nowMs = Date.now()) {
    const seconds = Math.floor(nowMs / 1000);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      throw new Error("Campaign timestamp is outside the supported range");
    }
    const encoded = seconds.toString(36).padStart(TOKEN_TIMESTAMP_WIDTH, "0");
    if (encoded.length !== TOKEN_TIMESTAMP_WIDTH) {
      throw new Error("Campaign timestamp is outside the supported width");
    }
    return encoded;
  }

  function campaignTokenForNow(nowMs = Date.now()) {
    return `rv_${encodeCampaignTimestamp(nowMs)}${randomChars(TOKEN_RANDOM_WIDTH)}`;
  }

  function timestampFromCampaignToken(token) {
    if (!VISIT_TOKEN_RE.test(token)) {
      throw new TypeError("campaignToken is invalid");
    }
    const encoded = token.slice(3, 3 + TOKEN_TIMESTAMP_WIDTH);
    const seconds = Number.parseInt(encoded, 36);
    if (
      !Number.isSafeInteger(seconds) ||
      seconds < 0 ||
      seconds.toString(36).padStart(TOKEN_TIMESTAMP_WIDTH, "0") !== encoded
    ) {
      throw new TypeError("campaignToken timestamp is invalid");
    }
    const timestamp = seconds * 1000;
    if (!Number.isFinite(Date.parse(new Date(timestamp).toISOString()))) {
      throw new TypeError("campaignToken timestamp is invalid");
    }
    return timestamp;
  }

  function eventIdForCampaignToken(token) {
    timestampFromCampaignToken(token);
    return `wev_${token.slice(-16)}`;
  }

  function visitIntentFromCampaignToken(token) {
    const timestamp = timestampFromCampaignToken(token);
    return {
      eventId: eventIdForCampaignToken(token),
      eventName: "visit_intent_created",
      occurredAt: new Date(timestamp).toISOString(),
      campaignToken: token
    };
  }

  function isVisitIntentRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (Object.keys(value).sort().join(",") !== "campaignToken,eventId,eventName,occurredAt") return false;
    if (!VISIT_EVENT_RE.test(value.eventId)) return false;
    if (value.eventName !== "visit_intent_created") return false;
    try {
      const canonical = visitIntentFromCampaignToken(value.campaignToken);
      return value.eventId === canonical.eventId && value.occurredAt === canonical.occurredAt;
    } catch {
      return false;
    }
  }

  function readVisitIntents(now = Date.now()) {
    try {
      const parsed = JSON.parse(localStorage.getItem(VISIT_ATTRIBUTION.storageKey) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(isVisitIntentRecord)
        .filter((item) => {
          const age = now - Date.parse(item.occurredAt);
          return age >= 0 && age <= VISIT_ATTRIBUTION.retentionMs;
        })
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

  function createVisitIntent(nowMs = Date.now()) {
    return visitIntentFromCampaignToken(campaignTokenForNow(nowMs));
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

  function normalizePosOrder(order, index) {
    if (!order || typeof order !== "object" || Array.isArray(order)) {
      throw new TypeError(`posOrders[${index}] must be an object`);
    }
    const fields = [
      "campaignToken",
      "currency",
      "grossRevenue",
      "orderId",
      "orderedAt",
      "variableCost"
    ];
    if (Object.keys(order).sort().join(",") !== fields.join(",")) {
      throw new TypeError(`posOrders[${index}] contains missing or unknown fields`);
    }
    if (!POS_ORDER_ID_RE.test(order.orderId)) {
      throw new TypeError(`posOrders[${index}].orderId is invalid`);
    }
    if (
      typeof order.orderedAt !== "string" ||
      !OFFSET_DATE_TIME_RE.test(order.orderedAt) ||
      !Number.isFinite(Date.parse(order.orderedAt))
    ) {
      throw new TypeError(`posOrders[${index}].orderedAt must be an RFC3339 date-time with offset`);
    }
    timestampFromCampaignToken(order.campaignToken);
    if (order.currency !== VISIT_ATTRIBUTION.currency) {
      throw new TypeError(`posOrders[${index}].currency must be TRY`);
    }
    if (typeof order.grossRevenue !== "string" || !MONEY_RE.test(order.grossRevenue)) {
      throw new TypeError(`posOrders[${index}].grossRevenue is invalid`);
    }
    if (typeof order.variableCost !== "string" || !MONEY_RE.test(order.variableCost)) {
      throw new TypeError(`posOrders[${index}].variableCost is invalid`);
    }
    return {
      orderId: order.orderId,
      orderedAt: order.orderedAt,
      campaignToken: order.campaignToken,
      grossRevenue: order.grossRevenue,
      currency: order.currency,
      variableCost: order.variableCost
    };
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
      posOrders: posOrders.map(normalizePosOrder)
    };
  }

  function recordVisitIntent(placement = "page") {
    const intent = createVisitIntent();
    const events = readVisitIntents();
    events.push(intent);
    const persisted = writeVisitIntents(events);
    document.dispatchEvent(new CustomEvent("robys:visit-intent", {
      detail: { ...intent, placement, persisted }
    }));
    showVisitPass(intent);
    return { intent, persisted, placement };
  }

  window.robysVisitAttribution = {
    contract: { ...VISIT_ATTRIBUTION },
    recordVisitIntent,
    events: () => readVisitIntents().map((event) => ({ ...event })),
    latest: () => {
      const events = readVisitIntents();
      return events.length ? { ...events[events.length - 1] } : null;
    },
    buildBaselineBundle,
    decodeCampaignToken: (token) => ({ ...visitIntentFromCampaignToken(token) }),
    showLatest: () => {
      const latest = window.robysVisitAttribution.latest();
      if (latest) showVisitPass(latest);
      return latest;
    },
    clear: () => writeVisitIntents([])
  };
})();
