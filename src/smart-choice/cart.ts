import { order, linesFromChoice } from "@robys/order";
import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceIntent,
  type SmartChoiceLanguage
} from "@robys/order";
import {
  recommendSmartChoice,
  type RecommendationInput,
  type RequestedTaste,
  type RequestedTemperature
} from "@robys/order";
import {
  buildStableOrderPayload,
  buildWhatsAppDraftMessage,
  calculateCart,
  createInitialCart,
  deriveCartRules,
  reconcileCart,
  stableSerializeOrderPayload,
  type CartState
} from "@robys/order";
import { CART_COPY } from "./cart-copy.js";

interface FlowStateSnapshot {
  version: 1;
  screen: string;
  questionIndex: number;
  answers: Partial<Record<"intent" | "temperature" | "taste" | "partySize" | "budgetKey", string>>;
  locale: SmartChoiceLanguage;
  selectedCandidateId?: string;
  selectionId?: string;
}

const FLOW_STORAGE_KEY = "robys-smart-choice-session.v1";
const CART_STORAGE_KEY = "robys-smart-choice-cart.v1";
const ORDER_STORAGE_KEY = "robys-smart-choice-order.v1";
const rules = deriveCartRules();
const itemIndex = new Map(SMART_CHOICE_CATALOG.items.map((item) => [item.id, item]));
const comboIndex = new Map(SMART_CHOICE_CATALOG.combos.map((combo) => [combo.id, combo]));
const budgets: Readonly<Record<string, { minMinor?: number; maxMinor: number }>> = {
  "250": { maxMinor: 25_000 },
  "400": { minMinor: 25_001, maxMinor: 40_000 },
  "600": { minMinor: 40_001, maxMinor: 60_000 },
  "1200": { maxMinor: 120_000 },
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
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: valueMinor % 100 === 0 ? 0 : 2
  }).format(valueMinor / 100);
}

function recommendationFor(flow: FlowStateSnapshot) {
  const answers = flow.answers;
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
  return stored?.version === 1 &&
    stored.candidateId === candidateId &&
    stored.catalogVersion === SMART_CHOICE_CATALOG.version
    ? stored
    : createInitialCart(candidateId);
}

let currentFlow: FlowStateSnapshot | null = null;
const storedReceipts = readJson<unknown>("robys:choice-added.v1");
const addedSelections = new Set<string>((Array.isArray(storedReceipts) ? storedReceipts : typeof storedReceipts === "string" ? [storedReceipts] : [])
  .filter((value): value is string => typeof value === "string" && value.length < 1000).slice(-50));

function mountCart(): void {
  const selectedCard = document.querySelector<HTMLElement>(".selected-card");
  if (!selectedCard || selectedCard.dataset.cartMounted === "true") return;
  const flow = currentFlow;
  if (!flow || flow.screen !== "selected" || !flow.selectedCandidateId || !recommendationFor(flow)) return;
  const combo = comboIndex.get(flow.selectedCandidateId);
  if (!combo) return;

  selectedCard.dataset.cartMounted = "true";
  const root = create("section", "cart-builder");
  root.setAttribute("aria-labelledby", "cart-builder-title");
  selectedCard.insertBefore(root, selectedCard.querySelector(".actions"));
  const partySize = flow.answers.partySize as PartySize;
  const recommendation = recommendationFor(flow)!;
  let cart = reconcileCart({ ...loadCart(combo.id), quantity: recommendation.quantity, upgradeIds: [] }, partySize).state;
  if (readJson<boolean>("robys:order-addon-declined.v1")) cart = { ...cart, bumpDecision: "declined" };
  const receipt = flow.selectionId ?? JSON.stringify([flow.answers, combo.id]);
  let added = addedSelections.has(receipt);

  const render = (): void => {
    const language = flow.locale;
    const text = CART_COPY[language];
    cart = reconcileCart(cart, partySize).state;
    const calculation = calculateCart(cart, partySize);
    root.classList.toggle("cart-builder--added", added);
    const payload = buildStableOrderPayload(cart, calculation, rules);
    writeJson(CART_STORAGE_KEY, cart);
    writeJson(ORDER_STORAGE_KEY, JSON.parse(stableSerializeOrderPayload(payload)));

    root.replaceChildren();
    const heading = create("h2", "cart-title", text.title);
    heading.id = "cart-builder-title";
    root.append(heading, create("p", "cart-lead", text.lead));

    const list = create("ul", "cart-line-list");
    for (const line of calculation.lines) {
      list.append(create(
        "li",
        "cart-line",
        `${line.quantity} × ${itemIndex.get(line.itemId)?.name[language] ?? line.itemId}`
      ));
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
      (entry) => entry.comboId === combo.id && (cart.quantity ?? 1) === 1 && entry.partySizes.includes(partySize)
    )) {
      const active = cart.upgradeIds.includes(rule.id);
      const button = create("button", "cart-choice");
      button.type = "button";
      button.setAttribute("aria-pressed", String(active));
      button.append(
        create("span", "cart-choice-label", rule.label[language]),
        create("strong", "cart-choice-price", `${active ? text.remove : text.add} · +${formatPrice(rule.priceDeltaMinor, language)}`)
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
        root.querySelector<HTMLButtonElement>("#smart-choice-add-order")?.focus();
      });
      decline.addEventListener("click", () => {
        cart = { ...cart, bumpDecision: "declined" };
        writeJson("robys:order-addon-declined.v1", true);
        render();
        root.querySelector<HTMLButtonElement>("#smart-choice-add-order")?.focus();
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
        create("strong", "cart-choice-price", `${text.remove} · +${formatPrice(bump.priceDeltaMinor, language)}`)
      );
      remove.addEventListener("click", () => {
        cart = { ...cart, bumpDecision: "declined" };
        writeJson("robys:order-addon-declined.v1", true);
        render();
        root.querySelector<HTMLButtonElement>("#smart-choice-add-order")?.focus();
      });
      root.append(remove);
    }

    if (calculation.notices.some((notice) => notice.code.includes("removed"))) {
      root.append(create("p", "cart-notice", text.unavailable));
    }
    if (!calculation.canHandoff) {
      root.append(create("p", "cart-notice cart-notice--error", text.blocked));
    }

    const footer = create("div", "cart-total-row");
    const total = create("div", "cart-total");
    total.append(
      create("span", "", text.total),
      create("strong", "", formatPrice(calculation.totalMinor, language))
    );
    const addText = {tr:"Ortak sepete ekle",en:"Add to my order",ru:"В общий заказ"};
    const addedText = {tr:"Ortak sepete eklendi",en:"Added to your order",ru:"Добавлено в общий заказ"};
    const failedText = {tr:"Eklenemedi; miktarı kontrol edin.",en:"Could not add; check the quantity.",ru:"Не удалось добавить; проверьте количество."};
    const addShared = create("button", "primary-button", addText[language]);
    addShared.id = "smart-choice-add-order"; addShared.type = "button"; addShared.disabled = !calculation.canHandoff;
    const addStatus = create("p", "cart-notice");addStatus.setAttribute("role", "status");addStatus.setAttribute("aria-live", "polite");
    const reviewText = {tr:"Sepetimi aç",en:"Review my order",ru:"Открыть мой заказ"};
    if (added) addShared.textContent = reviewText[language];
    addShared.addEventListener("click", () => {
      if (added) { window.dispatchEvent(new Event("robys:order-open")); return; }
      try {
        order.addMany(linesFromChoice(cart, partySize));
        added = true; addedSelections.add(receipt); writeJson("robys:choice-added.v1", [...addedSelections].slice(-50));
        render();
        window.dispatchEvent(new Event("robys:order-added"));
        window.dispatchEvent(new Event("robys:order-open"));
      } catch { addStatus.textContent = failedText[language]; }
    });
    footer.append(total, addShared);
    root.append(addStatus, footer);
    if (added) {
      // A repeated tap or reload reviews the existing addition; a new selection gets a new receipt.
      root.replaceChildren(create("p", "cart-notice", addedText[language]), addShared);
    }

  };

  render();
}

function start(): void {
  const app = document.querySelector("#smart-choice-app");
  if (!app) return;
  window.addEventListener("robys:choice-state", (event) => {
    currentFlow = (event as CustomEvent<FlowStateSnapshot>).detail;
    mountCart();
  });
  window.dispatchEvent(new Event("robys:choice-request"));
  mountCart();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", start, { once: true })
  : start();
