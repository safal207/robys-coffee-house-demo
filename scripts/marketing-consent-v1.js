// Consent policy V1. Source-only: no network calls, DOM or implicit event listeners.
import { clearUtm } from "./marketing-attribution-v0.js";

export const CONSENT_SCHEMA_VERSION = "robys.analytics-consent.v1";
export const CONSENT_KEY = "robys-analytics-choice.v1";
export const CONSENT_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

export const consentCopy = Object.freeze({
  tr: Object.freeze({
    title: "İsteğe bağlı kullanım analitiği",
    description: "Menünün nasıl kullanıldığını anlamak için anonim etkileşimleri kaydetmemize izin verir misiniz? Reddetseniz de menü ve sipariş taslağı çalışır.",
    accept: "İzin ver", reject: "Reddet", settings: "Analitik tercihleri", withdraw: "İzni geri çek"
  }),
  en: Object.freeze({
    title: "Optional usage analytics",
    description: "May we collect limited, anonymous menu interactions to improve the experience? Declining does not affect the menu or order draft.",
    accept: "Allow", reject: "Decline", settings: "Analytics preferences", withdraw: "Withdraw consent"
  }),
  ru: Object.freeze({
    title: "Необязательная аналитика",
    description: "Разрешаете собирать ограниченные обезличенные события меню для улучшения сервиса? Отказ не влияет на меню и корзину.",
    accept: "Разрешить", reject: "Отказаться", settings: "Настройки аналитики", withdraw: "Отозвать согласие"
  })
});

const allowed = new Set(["accepted", "rejected"]);
const validClock = value => Number.isSafeInteger(value) && value > 0;

export function readConsent(storage, now = Date.now()) {
  if (!storage || !validClock(now)) return null;
  try {
    const value = JSON.parse(storage.getItem(CONSENT_KEY) || "null");
    if (!value || Object.keys(value).sort().join(",") !== "choice,expiresAt,schemaVersion" ||
        value.schemaVersion !== CONSENT_SCHEMA_VERSION || !allowed.has(value.choice) ||
        !validClock(value.expiresAt) || value.expiresAt <= now ||
        value.expiresAt > now + CONSENT_LIFETIME_MS) return null;
    return value.choice;
  } catch { return null; }
}

// The essential preference is written only after the visitor explicitly chooses.
// The production feature flag stays off until owner approval and privacy review.
export function createConsentManager({
  preferenceStorage = null, campaignStorage = null, now = Date.now,
  collectionEnabled = false, onWithdraw = () => {}
} = {}) {
  if (typeof now !== "function") throw new Error("Invalid clock");
  let choice = readConsent(preferenceStorage, now());
  const persist = next => {
    choice = next;
    try {
      preferenceStorage?.setItem(CONSENT_KEY, JSON.stringify({
        schemaVersion: CONSENT_SCHEMA_VERSION,
        choice: next,
        expiresAt: now() + CONSENT_LIFETIME_MS
      }));
    } catch { /* User may disable storage. Choice still works for this page. */ }
  };
  const revoke = () => {
    persist("rejected");
    clearUtm(campaignStorage);
    try { onWithdraw(); } catch { /* Data deletion callback never blocks the UI. */ }
  };
  return Object.freeze({
    get choice() { return choice; },
    get canCollect() { return collectionEnabled === true && choice === "accepted"; },
    accept() { persist("accepted"); return this.canCollect; },
    reject: revoke,
    withdraw: revoke,
    get requiresDecision() { return choice === null; }
  });
}
