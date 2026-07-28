import {
  SMART_CHOICE_CATALOG,
  type PartySize,
  type SmartChoiceCatalog,
  type SmartChoiceCombo,
  type SmartChoiceItem,
  type SmartChoiceLanguage
} from "./catalog.js";

export type BumpDecision = "pending" | "accepted" | "declined" | "ineligible";
export type DuplicateCategoryPolicy = "forbid" | "allow-with-reason";

export interface LocalizedCartText {
  tr: string;
  en: string;
  ru: string;
}

export interface CartSubstitutionRule {
  id: string;
  comboId: string;
  fromItemId: string;
  toItemId: string;
  label: LocalizedCartText;
  priceDeltaMinor: number;
}

export interface CartUpgradeRule {
  id: string;
  comboId: string;
  componentItemId: string;
  quantityDelta: number;
  partySizes: readonly PartySize[];
  label: LocalizedCartText;
  priceDeltaMinor: number;
}

export interface CartBumpRule {
  id: string;
  comboId: string;
  targetItemId: string;
  label: LocalizedCartText;
  reason: LocalizedCartText;
  priceDeltaMinor: number;
  duplicateCategoryPolicy: DuplicateCategoryPolicy;
  duplicateCategoryReason?: LocalizedCartText;
}

export interface CartRuleSet {
  version: string;
  substitutions: readonly CartSubstitutionRule[];
  upgrades: readonly CartUpgradeRule[];
  bumps: readonly CartBumpRule[];
}

export interface CartState {
  version: 1;
  candidateId: string;
  catalogVersion: string;
  substitutionIds: readonly string[];
  upgradeIds: readonly string[];
  bumpDecision: BumpDecision;
  bumpId?: string;
}

export interface CartNotice {
  code: string;
  itemId?: string;
  ruleId?: string;
}

export interface ReconciledCart {
  state: CartState;
  notices: readonly CartNotice[];
}

export interface CartLine {
  itemId: string;
  quantity: number;
  unitPriceMinor: number;
  lineMenuPriceMinor: number;
}

export interface CartAdjustment {
  kind: "substitution" | "upgrade" | "bump";
  ruleId: string;
  deltaMinor: number;
}

export interface CartCalculation {
  candidateId: string;
  baseComboMinor: number;
  substitutionMinor: number;
  upgradeMinor: number;
  bumpMinor: number;
  totalMinor: number;
  lines: readonly CartLine[];
  adjustments: readonly CartAdjustment[];
  canHandoff: boolean;
  notices: readonly CartNotice[];
}

export interface StableOrderPayload {
  schemaVersion: "robys.smart-choice-order.v1";
  catalogVersion: string;
  cartRulesVersion: string;
  candidateId: string;
  currency: "TRY";
  lines: readonly CartLine[];
  decisions: {
    substitutionIds: readonly string[];
    upgradeIds: readonly string[];
    bumpDecision: BumpDecision;
    bumpId: string | null;
  };
  pricing: {
    baseComboMinor: number;
    substitutionMinor: number;
    upgradeMinor: number;
    bumpMinor: number;
    totalMinor: number;
  };
  handoff: {
    channel: "whatsapp-share";
    status: "draft";
    submitted: false;
    paid: false;
    acceptedByCafe: false;
  };
}

function isEligible(entry: { sourceStatus: string; availability: string } | undefined): boolean {
  return entry?.sourceStatus === "confirmed" && entry.availability === "available";
}

function localizedText(tr: string, en: string, ru: string): LocalizedCartText {
  return { tr, en, ru };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function itemIndex(catalog: SmartChoiceCatalog): Map<string, SmartChoiceItem> {
  return new Map(catalog.items.map((item) => [item.id, item]));
}

function comboIndex(catalog: SmartChoiceCatalog): Map<string, SmartChoiceCombo> {
  return new Map(catalog.combos.map((combo) => [combo.id, combo]));
}

export function deriveCartRules(catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG): CartRuleSet {
  const items = itemIndex(catalog);
  const combos = comboIndex(catalog);
  const combo = combos.get("combo-iced-san-sebastian");
  const icedLatte = items.get("cold-coffee--iced-caffe-latte");
  const hotLatte = items.get("hot-coffee--caffe-latte");
  const macaron = items.get("desserts--macaron");

  const substitutions: CartSubstitutionRule[] = [];
  const upgrades: CartUpgradeRule[] = [];
  const bumps: CartBumpRule[] = [];

  if (isEligible(combo) && isEligible(icedLatte) && isEligible(hotLatte)) {
    substitutions.push({
      id: "sub-iced-latte-to-hot-latte",
      comboId: combo!.id,
      fromItemId: icedLatte!.id,
      toItemId: hotLatte!.id,
      label: localizedText(
        "Iced Latte yerine sıcak Latte",
        "Switch Iced Latte to hot Latte",
        "Заменить Iced Latte на горячий Latte"
      ),
      priceDeltaMinor: hotLatte!.priceMinor - icedLatte!.priceMinor
    });

    upgrades.push({
      id: "upgrade-second-latte",
      comboId: combo!.id,
      componentItemId: icedLatte!.id,
      quantityDelta: 1,
      partySizes: ["two", "family"],
      label: localizedText(
        "İkinci bir Latte ekle",
        "Add a second Latte",
        "Добавить второй Latte"
      ),
      priceDeltaMinor: icedLatte!.priceMinor
    });
  }

  if (isEligible(combo) && isEligible(macaron)) {
    bumps.push({
      id: "bump-takeaway-macaron",
      comboId: combo!.id,
      targetItemId: macaron!.id,
      label: localizedText(
        "Yanına paketli bir macaron ekleyin",
        "Add one takeaway macaron",
        "Добавить один макарон с собой"
      ),
      reason: localizedText(
        "Küçük, ayrı paketlenen bir eşlikçi",
        "A small, separately packed add-on",
        "Небольшое дополнение в отдельной упаковке"
      ),
      priceDeltaMinor: macaron!.priceMinor,
      duplicateCategoryPolicy: "allow-with-reason",
      duplicateCategoryReason: localizedText(
        "Tabak tatlısını tekrarlamaz; ayrı paketlenen küçük bir üründür.",
        "It does not duplicate the plated dessert experience; it is a small separately packed item.",
        "Это не повтор порционного десерта, а маленькая позиция в отдельной упаковке."
      )
    });
  }

  return {
    version: "smart-choice-cart-rules.v0.1.0",
    substitutions,
    upgrades,
    bumps
  };
}

function hasLocalizedText(value: LocalizedCartText | undefined): boolean {
  return Boolean(value?.tr.trim() && value.en.trim() && value.ru.trim());
}

export function validateCartRules(
  rules: CartRuleSet,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): readonly string[] {
  const errors: string[] = [];
  const items = itemIndex(catalog);
  const combos = comboIndex(catalog);
  const ids = new Set<string>();

  const recordId = (id: string, path: string): void => {
    if (!id.trim()) errors.push(`${path} has an empty id.`);
    if (ids.has(id)) errors.push(`${path} duplicates rule id ${id}.`);
    ids.add(id);
  };

  for (const [index, rule] of rules.substitutions.entries()) {
    const path = `substitutions[${index}]`;
    recordId(rule.id, path);
    const combo = combos.get(rule.comboId);
    const from = items.get(rule.fromItemId);
    const to = items.get(rule.toItemId);
    if (!isEligible(combo)) errors.push(`${path} references an ineligible combo.`);
    if (!isEligible(from) || !isEligible(to)) errors.push(`${path} references an ineligible item.`);
    if (!combo?.components.some((component) => component.itemId === rule.fromItemId)) {
      errors.push(`${path} does not replace a component of the combo.`);
    }
    if (from && to && rule.priceDeltaMinor !== to.priceMinor - from.priceMinor) {
      errors.push(`${path} price delta is not derived from catalog prices.`);
    }
    if (!Number.isInteger(rule.priceDeltaMinor)) errors.push(`${path} price delta must use minor units.`);
    if (!hasLocalizedText(rule.label)) errors.push(`${path} label is incomplete.`);
  }

  for (const [index, rule] of rules.upgrades.entries()) {
    const path = `upgrades[${index}]`;
    recordId(rule.id, path);
    const combo = combos.get(rule.comboId);
    const target = items.get(rule.componentItemId);
    if (!isEligible(combo) || !isEligible(target)) errors.push(`${path} references an ineligible combo or item.`);
    if (!combo?.components.some((component) => component.itemId === rule.componentItemId)) {
      errors.push(`${path} target is not a combo component.`);
    }
    if (!Number.isInteger(rule.quantityDelta) || rule.quantityDelta <= 0) errors.push(`${path} quantity delta must be positive.`);
    if (target && rule.priceDeltaMinor !== target.priceMinor * rule.quantityDelta) {
      errors.push(`${path} price delta is not derived from the catalog item price.`);
    }
    if (rule.partySizes.length === 0) errors.push(`${path} needs an explicit party-size scope.`);
    if (!hasLocalizedText(rule.label)) errors.push(`${path} label is incomplete.`);
  }

  const bumpCountByCombo = new Map<string, number>();
  for (const [index, rule] of rules.bumps.entries()) {
    const path = `bumps[${index}]`;
    recordId(rule.id, path);
    const combo = combos.get(rule.comboId);
    const target = items.get(rule.targetItemId);
    if (!isEligible(combo) || !isEligible(target)) errors.push(`${path} references an ineligible combo or item.`);
    if (target && rule.priceDeltaMinor !== target.priceMinor) {
      errors.push(`${path} must use the target menu price.`);
    }
    const duplicatesCategory = Boolean(
      combo && target && combo.components.some((component) => items.get(component.itemId)?.sourceCategoryId === target.sourceCategoryId)
    );
    if (duplicatesCategory && rule.duplicateCategoryPolicy !== "allow-with-reason") {
      errors.push(`${path} duplicates a category without a special rule.`);
    }
    if (duplicatesCategory && !hasLocalizedText(rule.duplicateCategoryReason)) {
      errors.push(`${path} duplicate-category reason is missing.`);
    }
    if (!hasLocalizedText(rule.label) || !hasLocalizedText(rule.reason)) errors.push(`${path} localized copy is incomplete.`);
    bumpCountByCombo.set(rule.comboId, (bumpCountByCombo.get(rule.comboId) ?? 0) + 1);
  }

  for (const [comboId, count] of bumpCountByCombo) {
    if (count > 1) errors.push(`Combo ${comboId} has ${count} bump rules; maximum is one.`);
  }

  return errors;
}

export function assertCartRules(
  rules: CartRuleSet = deriveCartRules(),
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): void {
  const errors = validateCartRules(rules, catalog);
  if (errors.length > 0) throw new Error(`[SMART-CHOICE-CART-RULES] ${errors.join(" ")}`);
}

export function createInitialCart(
  candidateId: string,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG,
  rules: CartRuleSet = deriveCartRules(catalog)
): CartState {
  const bump = rules.bumps.find((entry) => entry.comboId === candidateId);
  return {
    version: 1,
    candidateId,
    catalogVersion: catalog.version,
    substitutionIds: [],
    upgradeIds: [],
    bumpDecision: bump ? "pending" : "ineligible",
    ...(bump ? { bumpId: bump.id } : {})
  };
}

export function reconcileCart(
  raw: CartState,
  partySize: PartySize,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG,
  rules: CartRuleSet = deriveCartRules(catalog)
): ReconciledCart {
  const notices: CartNotice[] = [];
  const combo = comboIndex(catalog).get(raw.candidateId);
  if (!isEligible(combo)) {
    return {
      state: { ...createInitialCart(raw.candidateId, catalog, rules), bumpDecision: "ineligible" },
      notices: [{ code: "cart.combo-unavailable" }]
    };
  }

  const validSubstitutions = sortedUnique(raw.substitutionIds).filter((id) => {
    const rule = rules.substitutions.find((entry) => entry.id === id && entry.comboId === raw.candidateId);
    if (rule) return true;
    notices.push({ code: "cart.substitution-removed", ruleId: id });
    return false;
  });

  const selectedFromItems = new Set<string>();
  const dedupedSubstitutions = validSubstitutions.filter((id) => {
    const rule = rules.substitutions.find((entry) => entry.id === id)!;
    if (selectedFromItems.has(rule.fromItemId)) {
      notices.push({ code: "cart.substitution-conflict", ruleId: id });
      return false;
    }
    selectedFromItems.add(rule.fromItemId);
    return true;
  });

  const validUpgrades = sortedUnique(raw.upgradeIds).filter((id) => {
    const rule = rules.upgrades.find(
      (entry) => entry.id === id && entry.comboId === raw.candidateId && entry.partySizes.includes(partySize)
    );
    if (rule) return true;
    notices.push({ code: "cart.upgrade-removed", ruleId: id });
    return false;
  });

  const bump = rules.bumps.find((entry) => entry.id === raw.bumpId && entry.comboId === raw.candidateId);
  let bumpDecision: BumpDecision = raw.bumpDecision;
  let bumpId: string | undefined = raw.bumpId;
  if (!bump) {
    if (raw.bumpDecision === "accepted") notices.push({ code: "cart.bump-removed", ruleId: raw.bumpId });
    bumpDecision = "ineligible";
    bumpId = undefined;
  } else if (bumpDecision !== "accepted" && bumpDecision !== "declined") {
    bumpDecision = "pending";
  }

  return {
    state: {
      version: 1,
      candidateId: raw.candidateId,
      catalogVersion: catalog.version,
      substitutionIds: dedupedSubstitutions,
      upgradeIds: validUpgrades,
      bumpDecision,
      ...(bumpId ? { bumpId } : {})
    },
    notices
  };
}

function resolveReplacement(
  itemId: string,
  selectedSubstitutions: readonly CartSubstitutionRule[]
): string {
  return selectedSubstitutions.find((rule) => rule.fromItemId === itemId)?.toItemId ?? itemId;
}

export function calculateCart(
  cart: CartState,
  partySize: PartySize,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG,
  rules: CartRuleSet = deriveCartRules(catalog)
): CartCalculation {
  const reconciled = reconcileCart(cart, partySize, catalog, rules);
  const state = reconciled.state;
  const items = itemIndex(catalog);
  const combo = comboIndex(catalog).get(state.candidateId);
  if (!combo) {
    return {
      candidateId: state.candidateId,
      baseComboMinor: 0,
      substitutionMinor: 0,
      upgradeMinor: 0,
      bumpMinor: 0,
      totalMinor: 0,
      lines: [],
      adjustments: [],
      canHandoff: false,
      notices: [...reconciled.notices, { code: "cart.combo-missing" }]
    };
  }

  const selectedSubstitutions = state.substitutionIds
    .map((id) => rules.substitutions.find((entry) => entry.id === id))
    .filter((entry): entry is CartSubstitutionRule => Boolean(entry));
  const selectedUpgrades = state.upgradeIds
    .map((id) => rules.upgrades.find((entry) => entry.id === id))
    .filter((entry): entry is CartUpgradeRule => Boolean(entry));
  const selectedBump = state.bumpDecision === "accepted"
    ? rules.bumps.find((entry) => entry.id === state.bumpId)
    : undefined;

  const quantities = new Map<string, number>();
  const notices: CartNotice[] = [...reconciled.notices];
  let canHandoff = isEligible(combo);

  for (const component of combo.components) {
    const effectiveItemId = resolveReplacement(component.itemId, selectedSubstitutions);
    const item = items.get(effectiveItemId);
    if (!isEligible(item)) {
      canHandoff = false;
      notices.push({ code: "cart.required-item-unavailable", itemId: effectiveItemId });
      continue;
    }
    quantities.set(effectiveItemId, (quantities.get(effectiveItemId) ?? 0) + component.quantity);
  }

  const adjustments: CartAdjustment[] = [];
  for (const rule of selectedSubstitutions) {
    adjustments.push({ kind: "substitution", ruleId: rule.id, deltaMinor: rule.priceDeltaMinor });
  }

  for (const rule of selectedUpgrades) {
    const effectiveItemId = resolveReplacement(rule.componentItemId, selectedSubstitutions);
    const item = items.get(effectiveItemId);
    if (!isEligible(item)) {
      notices.push({ code: "cart.upgrade-item-unavailable", itemId: effectiveItemId, ruleId: rule.id });
      continue;
    }
    quantities.set(effectiveItemId, (quantities.get(effectiveItemId) ?? 0) + rule.quantityDelta);
    const deltaMinor = item!.priceMinor * rule.quantityDelta;
    adjustments.push({ kind: "upgrade", ruleId: rule.id, deltaMinor });
  }

  if (selectedBump) {
    const target = items.get(selectedBump.targetItemId);
    if (isEligible(target)) {
      quantities.set(target!.id, (quantities.get(target!.id) ?? 0) + 1);
      adjustments.push({ kind: "bump", ruleId: selectedBump.id, deltaMinor: target!.priceMinor });
    } else {
      notices.push({ code: "cart.bump-item-unavailable", itemId: selectedBump.targetItemId, ruleId: selectedBump.id });
    }
  }

  const lines = [...quantities.entries()]
    .map(([itemId, quantity]): CartLine | null => {
      const item = items.get(itemId);
      if (!item) return null;
      return {
        itemId,
        quantity,
        unitPriceMinor: item.priceMinor,
        lineMenuPriceMinor: item.priceMinor * quantity
      };
    })
    .filter((entry): entry is CartLine => Boolean(entry))
    .sort((left, right) => left.itemId.localeCompare(right.itemId, "en"));

  const substitutionMinor = adjustments
    .filter((entry) => entry.kind === "substitution")
    .reduce((sum, entry) => sum + entry.deltaMinor, 0);
  const upgradeMinor = adjustments
    .filter((entry) => entry.kind === "upgrade")
    .reduce((sum, entry) => sum + entry.deltaMinor, 0);
  const bumpMinor = adjustments
    .filter((entry) => entry.kind === "bump")
    .reduce((sum, entry) => sum + entry.deltaMinor, 0);
  const totalMinor = combo.priceMinor + substitutionMinor + upgradeMinor + bumpMinor;

  if (!Number.isInteger(totalMinor) || totalMinor <= 0) {
    canHandoff = false;
    notices.push({ code: "cart.invalid-total" });
  }

  return {
    candidateId: state.candidateId,
    baseComboMinor: combo.priceMinor,
    substitutionMinor,
    upgradeMinor,
    bumpMinor,
    totalMinor,
    lines,
    adjustments: adjustments.sort((left, right) => left.ruleId.localeCompare(right.ruleId, "en")),
    canHandoff,
    notices
  };
}

export function buildStableOrderPayload(
  cart: CartState,
  calculation: CartCalculation,
  rules: CartRuleSet = deriveCartRules()
): StableOrderPayload {
  return {
    schemaVersion: "robys.smart-choice-order.v1",
    catalogVersion: cart.catalogVersion,
    cartRulesVersion: rules.version,
    candidateId: cart.candidateId,
    currency: "TRY",
    lines: [...calculation.lines].sort((left, right) => left.itemId.localeCompare(right.itemId, "en")),
    decisions: {
      substitutionIds: sortedUnique(cart.substitutionIds),
      upgradeIds: sortedUnique(cart.upgradeIds),
      bumpDecision: cart.bumpDecision,
      bumpId: cart.bumpId ?? null
    },
    pricing: {
      baseComboMinor: calculation.baseComboMinor,
      substitutionMinor: calculation.substitutionMinor,
      upgradeMinor: calculation.upgradeMinor,
      bumpMinor: calculation.bumpMinor,
      totalMinor: calculation.totalMinor
    },
    handoff: {
      channel: "whatsapp-share",
      status: "draft",
      submitted: false,
      paid: false,
      acceptedByCafe: false
    }
  };
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, sortForStableJson(record[key])])
  );
}

export function stableSerializeOrderPayload(payload: StableOrderPayload): string {
  return JSON.stringify(sortForStableJson(payload));
}

function formatMinor(valueMinor: number, language: SmartChoiceLanguage): string {
  const locale = language === "tr" ? "tr-TR" : language === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: valueMinor % 100 === 0 ? 0 : 2
  }).format(valueMinor / 100);
}

export function buildWhatsAppDraftMessage(
  payload: StableOrderPayload,
  language: SmartChoiceLanguage,
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): string {
  const items = itemIndex(catalog);
  const heading = language === "tr"
    ? "Roby's Smart Choice sipariş taslağı"
    : language === "ru"
      ? "Черновик заказа Roby's Smart Choice"
      : "Roby's Smart Choice order draft";
  const confirmation = language === "tr"
    ? "Bu bir ödeme veya onaylanmış sipariş değildir. Lütfen müsaitlik ve toplamı onaylayın."
    : language === "ru"
      ? "Это не оплата и не подтверждённый заказ. Пожалуйста, подтвердите наличие и итоговую сумму."
      : "This is not a payment or a confirmed order. Please confirm availability and the final total.";
  const totalLabel = language === "tr" ? "Toplam" : language === "ru" ? "Итого" : "Total";
  const lines = payload.lines.map((line) => {
    const name = items.get(line.itemId)?.name[language] ?? line.itemId;
    return `• ${line.quantity} × ${name}`;
  });

  return [heading, "", ...lines, "", `${totalLabel}: ${formatMinor(payload.pricing.totalMinor, language)}`, "", confirmation].join("\n");
}

assertCartRules();
