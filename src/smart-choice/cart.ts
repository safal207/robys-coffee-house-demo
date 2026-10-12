import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceIntent,
  type SmartChoiceLanguage
} from "./catalog.js";
import {
  recommendSmartChoice,
  type RecommendationInput,
  type RequestedTaste,
  type RequestedTemperature
} from "./engine.js";
import {
  calculateCart,
  createInitialCart,
  deriveCartRules,
  reconcileCart,
  type CartState
} from "./cart-domain.js";
import { CART_COPY } from "./cart-copy.js";
import { ORDER_DRAFT_KEY, readStoredOrderDraft, writeStoredOrderDraft } from "../order-draft.js";
import { syncRecommendation, orderProducts, orderProductIds, buildSharedOrderPayload } from "./shared-order.js";
import { orderGroupName, orderGroupTotal, orderGroupItems, needsOrderVariant } from "./quick-builder-domain.js";
import { openQuickCheckout } from "./checkout-link.js";

interface FlowStateSnapshot {
  version: 1;
  screen: string;
  questionIndex: number;
  answers: Partial<Record<"intent" | "temperature" | "taste" | "partySize" | "budgetKey", string>>;
  locale: SmartChoiceLanguage;
  selectedCandidateId?: string;
  selectionToken?: string;
}

const FLOW_STORAGE_KEY = "robys-smart-choice-session.v1";
const CART_STORAGE_KEY = "robys-smart-choice-cart.v1";
const ORDER_STORAGE_KEY = "robys-smart-choice-order.v1";
const DECLINED_STORAGE_KEY = "robys-smart-choice-declined-bumps.v1";
const APPLIED_STORAGE_KEY = "robys-smart-choice-applied-selections.v1";
const rules = deriveCartRules();
let refreshCart: (() => void) | undefined;
const comboIndex = new Map(SMART_CHOICE_CATALOG.combos.map((combo) => [combo.id, combo]));
const budgets: Readonly<Record<string, { minMinor?: number; maxMinor: number }>> = {
  "250": { maxMinor: 25_000 },
  "400": { minMinor: 25_001, maxMinor: 40_000 },
  "600": { minMinor: 40_001, maxMinor: 60_000 },
  open: { maxMinor: 60_000 }
};

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session persistence is optional.
  }
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatPrice(valueMinor: number, language: SmartChoiceLanguage): string {
  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : language === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: valueMinor % 100 === 0 ? 0 : 2
  }).format(valueMinor / 100);
}

function recommendationFor(flow: FlowStateSnapshot) {
  const answers = flow.answers ?? {};
  if (!answers.intent || !answers.temperature || !answers.taste || !answers.partySize || !answers.budgetKey) return null;
  const budget = budgets[answers.budgetKey];
  if (!budget) return null;
  const input: RecommendationInput = {
    intent: answers.intent as SmartChoiceIntent,
    temperature: answers.temperature as RequestedTemperature,
    taste: answers.taste as RequestedTaste,
    partySize: answers.partySize as PartySize,
    budget,
    locale: flow.locale
  };
  const result = recommendSmartChoice(input);
  return [result.top, result.economy, result.premium]
    .find((entry) => entry?.candidateId === flow.selectedCandidateId) ?? null;
}

function loadCart(candidateId: string): CartState {
  const stored = readJson<CartState>(CART_STORAGE_KEY);
  const cart = stored?.version === 1 &&
    stored.candidateId === candidateId &&
    stored.catalogVersion === SMART_CHOICE_CATALOG.version &&
    Array.isArray(stored.substitutionIds) && stored.substitutionIds.every(id => typeof id === "string") &&
    Array.isArray(stored.upgradeIds) && stored.upgradeIds.every(id => typeof id === "string") &&
    ["pending", "accepted", "declined", "ineligible"].includes(stored.bumpDecision)
    ? stored
    : createInitialCart(candidateId);
  const declined = readJson<string[]>(DECLINED_STORAGE_KEY);
  if (cart.bumpDecision === "declined") rememberDeclined(cart.bumpId);
  return cart.bumpId && cart.bumpDecision === "pending" && Array.isArray(declined) && declined.includes(cart.bumpId)
    ? { ...cart, bumpDecision: "declined" } : cart;
}

function rememberDeclined(id: string | undefined): void {
  if (!id) return;
  const stored = readJson<unknown>(DECLINED_STORAGE_KEY);
  const ids = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  writeJson(DECLINED_STORAGE_KEY, [...new Set([...ids, id])]);
}

function mountCart(): void {
  const selectedCard = document.querySelector<HTMLElement>(".selected-card");
  if (!selectedCard || selectedCard.dataset.cartMounted === "true") return;
  const flow = readJson<FlowStateSnapshot>(FLOW_STORAGE_KEY);
  if (!flow || flow.screen !== "selected" || !flow.selectedCandidateId || !recommendationFor(flow)) return;
  const combo = comboIndex.get(flow.selectedCandidateId);
  if (!combo) return;

  selectedCard.dataset.cartMounted = "true";
  const root = create("section", "cart-builder");
  root.setAttribute("aria-labelledby", "cart-builder-title");
  selectedCard.insertBefore(root, selectedCard.querySelector(".actions"));
  const partySize = flow.answers.partySize as PartySize;
  let cart = reconcileCart(loadCart(combo.id), partySize).state;
  let sharedDraft = readStoredOrderDraft(orderProductIds);
  const token = flow.selectionToken ?? `legacy:${combo.id}`;
  const storedTokens = readJson<unknown>(APPLIED_STORAGE_KEY);
  const appliedTokens = new Set(Array.isArray(storedTokens) ? storedTokens.filter((value): value is string => typeof value === "string") : []);

  const render = (applySelection = true): void => {
    const language = flow.locale;
    const text = CART_COPY[language];
    cart = reconcileCart(cart, partySize).state;
    const calculation = calculateCart(cart, partySize);
    const shared = applySelection
      ? syncRecommendation(readStoredOrderDraft(orderProductIds), cart, calculation, token)
      : { draft: readStoredOrderDraft(orderProductIds), applied: false, blocked: false };
    sharedDraft = shared.draft;
    const payload = buildSharedOrderPayload(sharedDraft);
    const canHandoff = !shared.blocked && payload.lines.length > 0;
    const needsFlavour = needsOrderVariant(sharedDraft.groups);
    writeJson(CART_STORAGE_KEY, cart);
    if (shared.applied) writeStoredOrderDraft(sharedDraft, orderProductIds);
    if (applySelection && !shared.blocked) {
      appliedTokens.add(token);
      writeJson(APPLIED_STORAGE_KEY, [...appliedTokens].slice(-100));
    }
    writeJson(ORDER_STORAGE_KEY, payload);

    const selectedGroups = sharedDraft.groups.filter(group => group.source === "recommendation");
    const summaryName = selectedCard.querySelector(".selected-summary strong");
    const summaryPrice = selectedCard.querySelector(".selected-summary span");
    if (summaryName) summaryName.textContent = selectedGroups.length
      ? selectedGroups.map(group => orderGroupName(group, language)).join(" + ") : text.selectionRemoved;
    if (summaryPrice) summaryPrice.textContent = `${text.selectionTotal}: ${formatPrice(selectedGroups.reduce((sum, group) => sum + orderGroupTotal(group), 0), language)}`;

    root.replaceChildren();
    const heading = create("h2", "cart-title", text.title);
    heading.id = "cart-builder-title";
    root.append(heading, create("p", "cart-lead", text.lead));

    const list = create("ul", "cart-line-list");
    for (const group of sharedDraft.groups) {
      const line = create("li", "cart-line");
      const photos = create("div", "cart-line-photos");
      for (const item of orderGroupItems(group)) {
        const product = orderProducts.get(item.id);
        if (!product) continue;
        const image = create("img"); image.src = `../${product.image}`; image.alt = "";
        image.width = image.height = 70; image.loading = "lazy";
        photos.append(image);
      }
      line.append(photos, create("span", "", `${group.quantity} × ${orderGroupName(group, language)}`),
        create("strong", "", formatPrice(orderGroupTotal(group), language)));
      list.append(line);
    }
    root.append(create("h3", "cart-section-title", text.contents), list);

    for (const rule of rules.substitutions.filter((entry) => entry.comboId === combo.id)) {
      const active = cart.substitutionIds.includes(rule.id);
      const button = create("button", "cart-choice");
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      const delta = rule.priceDeltaMinor === 0
        ? text.noExtra
        : `${rule.priceDeltaMinor > 0 ? "+" : "−"}${formatPrice(Math.abs(rule.priceDeltaMinor), language)}`;
      button.append(
        create("span", "cart-choice-label", rule.label[language]),
        create("strong", "cart-choice-price", delta)
      );
      button.addEventListener("click", () => {
        cart = { ...cart, substitutionIds: active ? [] : [rule.id] };
        render();
      });
      root.append(button);
    }

    for (const rule of rules.upgrades.filter(
      (entry) => entry.comboId === combo.id && entry.partySizes.includes(partySize)
    )) {
      const active = cart.upgradeIds.includes(rule.id);
      const button = create("button", "cart-choice");
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      button.append(
        create("span", "cart-choice-label", rule.label[language]),
        create("strong", "cart-choice-price", `${active ? text.remove : text.add} · ${active ? "−" : "+"}${formatPrice(rule.priceDeltaMinor, language)}`)
      );
      button.addEventListener("click", () => {
        cart = {
          ...cart,
          upgradeIds: active
            ? cart.upgradeIds.filter((id) => id !== rule.id)
            : [...cart.upgradeIds, rule.id]
        };
        render();
      });
      root.append(button);
    }

    const bump = rules.bumps.find((entry) => entry.id === cart.bumpId && entry.comboId === combo.id);
    if (bump && cart.bumpDecision === "pending") {
      const card = create("div", "cart-bump");
      card.append(
        create("h3", "cart-section-title", text.bumpTitle),
        create("p", "cart-bump-label", bump.label[language]),
        create("p", "cart-bump-reason", bump.reason[language]),
        create("strong", "cart-bump-price", `+${formatPrice(bump.priceDeltaMinor, language)}`)
      );
      const actions = create("div", "cart-bump-actions");
      const accept = create("button", "primary-button", text.accept);
      const decline = create("button", "secondary-button", text.decline);
      accept.type = decline.type = "button";
      accept.addEventListener("click", () => {
        cart = { ...cart, bumpDecision: "accepted" };
        render();
      });
      decline.addEventListener("click", () => {
        rememberDeclined(cart.bumpId);
        cart = { ...cart, bumpDecision: "declined" };
        render();
      });
      actions.append(accept, decline);
      card.append(actions);
      root.append(card);
    } else if (cart.bumpDecision === "declined") {
      root.append(create("p", "cart-notice", text.declined));
    } else if (bump && cart.bumpDecision === "accepted") {
      const remove = create("button", "cart-choice");
      remove.type = "button";
      remove.setAttribute("aria-pressed", "true");
      remove.append(
        create("span", "cart-choice-label", bump.label[language]),
        create("strong", "cart-choice-price", `${text.remove} · −${formatPrice(bump.priceDeltaMinor, language)}`)
      );
      remove.addEventListener("click", () => {
        rememberDeclined(cart.bumpId);
        cart = { ...cart, bumpDecision: "declined" };
        render();
      });
      root.append(remove);
    }

    if (calculation.notices.some((notice) => notice.code.includes("removed"))) {
      root.append(create("p", "cart-notice", text.unavailable));
    }
    if (!canHandoff) {
      root.append(create("p", "cart-notice cart-notice--error", text.blocked));
    }
    if (needsFlavour) root.append(create("p", "cart-notice", text.flavourNotice));

    const footer = create("div", "cart-total-row");
    const total = create("div", "cart-total");
    total.append(
      create("span", "", text.total),
      create("strong", "", formatPrice(payload.pricing.totalMinor, language))
    );
    const handoff = create("button", "primary-button cart-handoff", needsFlavour ? text.chooseFlavours : text.handoff);
    handoff.type = "button";
    handoff.disabled = !canHandoff;
    handoff.setAttribute("aria-disabled", String(!canHandoff));
    handoff.addEventListener("click", () => {
      const current = readStoredOrderDraft(orderProductIds);
      if (needsOrderVariant(current.groups)) {
        window.dispatchEvent(new CustomEvent("robys:quick-order"));
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLSelectElement>('.qb-cart select[aria-invalid="true"]')?.focus();
        });
        return;
      }
      handoff.disabled = true;
      void openQuickCheckout(current, language, handoff)
        .catch(() => root.append(create("p", "cart-notice cart-notice--error", text.checkoutError)))
        .finally(() => { handoff.disabled = !canHandoff; });
    });
    footer.append(total, handoff);
    root.append(footer, create("p", "cart-draft-note", text.draftNote));

  };

  refreshCart = () => { if (root.isConnected) render(false); };
  render(!appliedTokens.has(token));
}

function start(): void {
  const app = document.querySelector("#smart-choice-app");
  if (!app) return;
  new MutationObserver(mountCart).observe(app, { childList: true, subtree: true });
  mountCart();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start, { once: true })
  : start();

window.addEventListener("pageshow", event => { if (event.persisted) refreshCart?.(); });
window.addEventListener("storage", event => { if (event.key === ORDER_DRAFT_KEY || event.key === null) refreshCart?.(); });
