import {
  menuCategories,
  type MenuCategorySource,
  type MenuItemSource,
  type MenuLocalizedText
} from "../../menu-catalog.js";

export type SmartChoiceLanguage = "tr" | "en" | "ru";
export type SourceStatus = "confirmed" | "provisional" | "unavailable";
export type AvailabilityStatus = "available" | "unavailable";
export type DrinkTemperature = "hot" | "cold" | "not-applicable";
export type TasteProfile = "sweet" | "neutral" | "savoury";
export type PartySize = "one" | "two" | "family";
export type SmartChoiceIntent = "coffee" | "breakfast" | "snack" | "dessert" | "refresh";

export interface SmartChoiceItem {
  id: string;
  sourceId: string;
  sourceCategoryId: string;
  name: MenuLocalizedText;
  description?: MenuLocalizedText;
  priceMinor: number;
  currency: "TRY";
  tags: readonly string[];
  intents: readonly SmartChoiceIntent[];
  temperature: DrinkTemperature;
  taste: TasteProfile;
  partySizes: readonly PartySize[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
}

export interface ComboComponent {
  itemId: string;
  quantity: number;
}

export interface ComboSubstitution {
  fromItemId: string;
  toItemId: string;
  priceDeltaMinor: number;
}

export interface ComboUpgrade {
  id: string;
  label: MenuLocalizedText;
  priceDeltaMinor: number;
}

export interface SmartChoiceCombo {
  id: string;
  sourceOfferId: string;
  name: MenuLocalizedText;
  description?: MenuLocalizedText;
  priceMinor: number;
  currency: "TRY";
  components: readonly ComboComponent[];
  allowedSubstitutions: readonly ComboSubstitution[];
  upgrades: readonly ComboUpgrade[];
  intents: readonly SmartChoiceIntent[];
  tags: readonly string[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
  pricingMode: string;
  extraValue?: MenuLocalizedText;
  blockedReason?: string;
}

export interface SmartChoiceBump {
  id: string;
  trigger: {
    comboIds?: readonly string[];
    itemIds?: readonly string[];
  };
  targetItemId: string;
  deltaPriceMinor: number;
  exclusions: readonly string[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
}

export interface SmartChoiceCatalog {
  version: string;
  currency: "TRY";
  minorUnitScale: 100;
  items: readonly SmartChoiceItem[];
  combos: readonly SmartChoiceCombo[];
  bumps: readonly SmartChoiceBump[];
}

export interface CatalogDiagnostic {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
}

interface FlattenedMenuItem {
  sourceId: string;
  categoryId: string;
  item: MenuItemSource;
}

interface ItemRule {
  sourceId: string;
  tags: readonly string[];
  intents: readonly SmartChoiceIntent[];
  temperature: DrinkTemperature;
  taste: TasteProfile;
  partySizes: readonly PartySize[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
}

interface ComboRule {
  id: string;
  sourceOfferId: string;
  componentIds: readonly string[];
  intents: readonly SmartChoiceIntent[];
  tags: readonly string[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
  blockedReason?: string;
  extraValue?: MenuLocalizedText;
}

const LANGUAGES: readonly SmartChoiceLanguage[] = ["tr", "en", "ru"];

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourceIdFor(categoryId: string, item: MenuItemSource): string {
  return item.id ?? `${categoryId}--${slugify(item.name.en)}`;
}

function flattenMenu(categories: readonly MenuCategorySource[]): FlattenedMenuItem[] {
  return categories.flatMap((category) => {
    const directItems = category.items ?? [];
    const groupedItems = (category.groups ?? []).flatMap((group) => group.items);
    return [...directItems, ...groupedItems].map((item) => ({
      sourceId: sourceIdFor(category.id, item),
      categoryId: category.id,
      item
    }));
  });
}

const MENU_INDEX = new Map<string, FlattenedMenuItem>();
for (const entry of flattenMenu(menuCategories)) {
  if (MENU_INDEX.has(entry.sourceId)) {
    throw new Error(`[SMART-CHOICE-CATALOG] Duplicate public-menu source id: ${entry.sourceId}`);
  }
  MENU_INDEX.set(entry.sourceId, entry);
}

const ITEM_RULES: readonly ItemRule[] = [
  {
    sourceId: "hot-coffee--caffe-latte",
    tags: ["coffee", "milk", "morning"],
    intents: ["coffee", "breakfast", "snack"],
    temperature: "hot",
    taste: "neutral",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "hot-coffee--flat-white",
    tags: ["coffee", "milk", "morning"],
    intents: ["coffee", "breakfast"],
    temperature: "hot",
    taste: "neutral",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "hot-coffee--caramel-latte",
    tags: ["coffee", "milk", "sweet", "morning"],
    intents: ["coffee", "breakfast", "dessert"],
    temperature: "hot",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "brew-hot--filter-coffee",
    tags: ["coffee", "black-coffee", "morning"],
    intents: ["coffee", "breakfast", "snack"],
    temperature: "hot",
    taste: "neutral",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "brew-hot--hot-chocolate",
    tags: ["chocolate", "sweet", "comfort"],
    intents: ["snack", "dessert"],
    temperature: "hot",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "cold-coffee--iced-caffe-latte",
    tags: ["coffee", "milk", "cold"],
    intents: ["coffee", "breakfast", "snack", "refresh", "dessert"],
    temperature: "cold",
    taste: "neutral",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "cold-coffee--flavoured-iced-caffe-latte",
    tags: ["coffee", "milk", "cold", "sweet"],
    intents: ["coffee", "breakfast", "dessert", "refresh"],
    temperature: "cold",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "cold-coffee--iced-mocha",
    tags: ["coffee", "chocolate", "cold", "sweet"],
    intents: ["coffee", "snack", "dessert", "refresh"],
    temperature: "cold",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "refreshers--cool-lime",
    tags: ["cold", "lime", "refreshing"],
    intents: ["refresh", "snack"],
    temperature: "cold",
    taste: "sweet",
    partySizes: ["one", "two", "family"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "herbal-tea--relax-tea-lavender-rooibos",
    tags: ["tea", "herbal", "evening"],
    intents: ["snack", "dessert"],
    temperature: "hot",
    taste: "neutral",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "desserts--san-sebastian-cheesecake",
    tags: ["dessert", "cheesecake", "signature"],
    intents: ["dessert", "snack"],
    temperature: "not-applicable",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "desserts--lotus-cheesecake",
    tags: ["dessert", "cheesecake", "lotus"],
    intents: ["dessert", "snack"],
    temperature: "not-applicable",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "desserts--macaron",
    tags: ["dessert", "small-add-on"],
    intents: ["dessert", "snack"],
    temperature: "not-applicable",
    taste: "sweet",
    partySizes: ["one", "two", "family"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "food--nutella-croissant",
    tags: ["croissant", "breakfast", "sweet"],
    intents: ["breakfast", "snack"],
    temperature: "not-applicable",
    taste: "sweet",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "food--three-cheese-croissant",
    tags: ["croissant", "breakfast", "savoury"],
    intents: ["breakfast", "snack"],
    temperature: "not-applicable",
    taste: "savoury",
    partySizes: ["one", "two"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    sourceId: "food--sesame-simit",
    tags: ["breakfast", "savoury", "small-add-on"],
    intents: ["breakfast", "snack"],
    temperature: "not-applicable",
    taste: "savoury",
    partySizes: ["one", "two", "family"],
    availability: "available",
    sourceStatus: "confirmed"
  }
];

const COMBO_RULES: readonly ComboRule[] = [
  {
    id: "combo-iced-san-sebastian",
    sourceOfferId: "iced-san-sebastian-pairing",
    componentIds: ["cold-coffee--iced-caffe-latte", "desserts--san-sebastian-cheesecake"],
    intents: ["coffee", "dessert", "snack", "refresh"],
    tags: ["signature", "cold", "sweet"],
    availability: "available",
    sourceStatus: "confirmed"
  },
  {
    id: "combo-cool-lime-macaron",
    sourceOfferId: "cool-lime-macaron-pairing",
    componentIds: ["refreshers--cool-lime", "desserts--macaron"],
    intents: ["refresh", "dessert", "snack"],
    tags: ["cold", "light", "sweet"],
    availability: "unavailable",
    sourceStatus: "provisional",
    blockedReason: "offer-price-exceeds-components-without-declared-extra-value"
  }
];

function requireSource(sourceId: string): FlattenedMenuItem {
  const source = MENU_INDEX.get(sourceId);
  if (!source) throw new Error(`[SMART-CHOICE-CATALOG] Unknown public-menu source: ${sourceId}`);
  return source;
}

function toMinorUnits(priceLira: number, sourceId: string): number {
  if (!Number.isInteger(priceLira) || priceLira <= 0) {
    throw new Error(`[SMART-CHOICE-CATALOG] ${sourceId} has invalid whole-lira price: ${priceLira}`);
  }
  return priceLira * 100;
}

function buildItem(rule: ItemRule): SmartChoiceItem {
  const source = requireSource(rule.sourceId);
  return {
    id: rule.sourceId,
    sourceId: rule.sourceId,
    sourceCategoryId: source.categoryId,
    name: source.item.name,
    ...(source.item.description ? { description: source.item.description } : {}),
    priceMinor: toMinorUnits(source.item.price, rule.sourceId),
    currency: "TRY",
    tags: rule.tags,
    intents: rule.intents,
    temperature: rule.temperature,
    taste: rule.taste,
    partySizes: rule.partySizes,
    availability: rule.availability,
    sourceStatus: rule.sourceStatus
  };
}

const ITEMS = ITEM_RULES.map(buildItem);
const ITEM_INDEX = new Map(ITEMS.map((item) => [item.id, item]));

function buildCombo(rule: ComboRule): SmartChoiceCombo {
  const source = requireSource(rule.sourceOfferId);
  return {
    id: rule.id,
    sourceOfferId: rule.sourceOfferId,
    name: source.item.name,
    ...(source.item.description ? { description: source.item.description } : {}),
    priceMinor: toMinorUnits(source.item.price, rule.sourceOfferId),
    currency: "TRY",
    components: rule.componentIds.map((itemId) => ({ itemId, quantity: 1 })),
    allowedSubstitutions: [],
    upgrades: [],
    intents: rule.intents,
    tags: rule.tags,
    availability: rule.availability,
    sourceStatus: rule.sourceStatus,
    pricingMode: source.item.pricingMode ?? "unspecified",
    ...(rule.extraValue ? { extraValue: rule.extraValue } : {}),
    ...(rule.blockedReason ? { blockedReason: rule.blockedReason } : {})
  };
}

function buildSingleItemCombo(item: SmartChoiceItem): SmartChoiceCombo {
  return {
    id: `single-${item.id}`,
    sourceOfferId: item.sourceId,
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    priceMinor: item.priceMinor,
    currency: item.currency,
    components: [{ itemId: item.id, quantity: 1 }],
    allowedSubstitutions: [],
    upgrades: [],
    intents: item.intents,
    tags: ["single-item", ...item.tags],
    availability: item.availability,
    sourceStatus: item.sourceStatus,
    pricingMode: "menu-item"
  };
}

const COMBOS = [
  ...COMBO_RULES.map(buildCombo),
  ...ITEMS.map(buildSingleItemCombo)
];
const MACARON_PRICE_MINOR = ITEM_INDEX.get("desserts--macaron")?.priceMinor ?? 0;

const BUMPS: readonly SmartChoiceBump[] = [
  {
    id: "bump-macaron-after-iced-san-sebastian",
    trigger: { comboIds: ["combo-iced-san-sebastian"] },
    targetItemId: "desserts--macaron",
    deltaPriceMinor: MACARON_PRICE_MINOR,
    exclusions: ["basket-already-contains-dessert-add-on"],
    availability: "unavailable",
    sourceStatus: "provisional"
  }
];

export const SMART_CHOICE_CATALOG: SmartChoiceCatalog = {
  version: "smart-choice-catalog.v0.2.0",
  currency: "TRY",
  minorUnitScale: 100,
  items: ITEMS,
  combos: COMBOS,
  bumps: BUMPS
};

function diagnostic(
  list: CatalogDiagnostic[],
  code: string,
  severity: "error" | "warning",
  path: string,
  message: string
): void {
  list.push({ code, severity, path, message });
}

function validateLocalized(
  value: MenuLocalizedText | undefined,
  path: string,
  list: CatalogDiagnostic[]
): void {
  for (const language of LANGUAGES) {
    if (!value || typeof value[language] !== "string" || value[language].trim().length === 0) {
      diagnostic(list, "SC-CATALOG-I18N-001", "error", `${path}.${language}`, `Missing ${language} translation.`);
    }
  }
}

function validateMoney(value: number, path: string, list: CatalogDiagnostic[], allowZero = false): void {
  if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    diagnostic(list, "SC-CATALOG-MONEY-001", "error", path, "Money must be an integer in minor units.");
  }
}

function validateUniqueIds(entries: readonly { id: string }[], path: string, list: CatalogDiagnostic[]): void {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (!entry.id.trim()) diagnostic(list, "SC-CATALOG-ID-001", "error", `${path}[${index}].id`, "ID is empty.");
    if (seen.has(entry.id)) diagnostic(list, "SC-CATALOG-ID-002", "error", `${path}[${index}].id`, `Duplicate ID: ${entry.id}`);
    seen.add(entry.id);
  });
}

function isEligible(entry: { sourceStatus: SourceStatus; availability: AvailabilityStatus }): boolean {
  return entry.sourceStatus === "confirmed" && entry.availability === "available";
}

export function validateSmartChoiceCatalog(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): CatalogDiagnostic[] {
  const list: CatalogDiagnostic[] = [];

  if (!catalog.version.trim()) diagnostic(list, "SC-CATALOG-VERSION-001", "error", "version", "Version is missing.");
  if (catalog.currency !== "TRY") diagnostic(list, "SC-CATALOG-CURRENCY-001", "error", "currency", "Currency must be TRY.");
  if (catalog.minorUnitScale !== 100) diagnostic(list, "SC-CATALOG-CURRENCY-002", "error", "minorUnitScale", "TRY must use a 100 minor-unit scale.");

  validateUniqueIds(catalog.items, "items", list);
  validateUniqueIds(catalog.combos, "combos", list);
  validateUniqueIds(catalog.bumps, "bumps", list);

  const itemIndex = new Map(catalog.items.map((item) => [item.id, item]));
  const comboIndex = new Map(catalog.combos.map((combo) => [combo.id, combo]));

  catalog.items.forEach((item, index) => {
    const path = `items[${index}]`;
    validateLocalized(item.name, `${path}.name`, list);
    if (item.description) validateLocalized(item.description, `${path}.description`, list);
    validateMoney(item.priceMinor, `${path}.priceMinor`, list);
    if (!MENU_INDEX.has(item.sourceId)) diagnostic(list, "SC-CATALOG-SOURCE-001", "error", `${path}.sourceId`, `Unknown menu source: ${item.sourceId}`);
    if (item.sourceStatus !== "confirmed" && item.availability === "available") {
      diagnostic(list, "SC-CATALOG-ELIGIBILITY-001", "error", path, "Only confirmed items may be available.");
    }
  });

  catalog.combos.forEach((combo, index) => {
    const path = `combos[${index}]`;
    validateLocalized(combo.name, `${path}.name`, list);
    if (combo.description) validateLocalized(combo.description, `${path}.description`, list);
    if (combo.extraValue) validateLocalized(combo.extraValue, `${path}.extraValue`, list);
    validateMoney(combo.priceMinor, `${path}.priceMinor`, list);
    if (!MENU_INDEX.has(combo.sourceOfferId)) diagnostic(list, "SC-CATALOG-SOURCE-002", "error", `${path}.sourceOfferId`, `Unknown offer source: ${combo.sourceOfferId}`);
    const isSingleItemCandidate = combo.pricingMode === "menu-item";
    const singleItemComponent = combo.components.length === 1 ? combo.components[0] : undefined;
    const singleItem = singleItemComponent ? itemIndex.get(singleItemComponent.itemId) : undefined;
    if (!isSingleItemCandidate && combo.components.length < 2) {
      diagnostic(list, "SC-CATALOG-COMBO-001", "error", `${path}.components`, "A combo needs at least two components.");
    }
    if (
      isSingleItemCandidate &&
      (
        !singleItemComponent ||
        singleItemComponent.quantity !== 1 ||
        singleItem?.sourceId !== combo.sourceOfferId
      )
    ) {
      diagnostic(
        list,
        "SC-CATALOG-ITEM-CANDIDATE-001",
        "error",
        `${path}.components`,
        "A menu-item candidate must contain exactly one unit of its verified source item."
      );
    }

    const seenComponents = new Set<string>();
    let componentTotalMinor = 0;
    combo.components.forEach((component, componentIndex) => {
      const componentPath = `${path}.components[${componentIndex}]`;
      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        diagnostic(list, "SC-CATALOG-COMBO-002", "error", `${componentPath}.quantity`, "Quantity must be a positive integer.");
      }
      if (seenComponents.has(component.itemId)) {
        diagnostic(list, "SC-CATALOG-COMBO-003", "error", `${componentPath}.itemId`, `Duplicate component: ${component.itemId}`);
      }
      seenComponents.add(component.itemId);
      const item = itemIndex.get(component.itemId);
      if (!item) {
        diagnostic(list, "SC-CATALOG-REFERENCE-001", "error", `${componentPath}.itemId`, `Unknown item: ${component.itemId}`);
      } else {
        componentTotalMinor += item.priceMinor * component.quantity;
      }
    });

    combo.allowedSubstitutions.forEach((substitution, substitutionIndex) => {
      const substitutionPath = `${path}.allowedSubstitutions[${substitutionIndex}]`;
      if (!itemIndex.has(substitution.fromItemId) || !itemIndex.has(substitution.toItemId)) {
        diagnostic(list, "SC-CATALOG-REFERENCE-002", "error", substitutionPath, "Substitution references an unknown item.");
      }
      validateMoney(substitution.priceDeltaMinor, `${substitutionPath}.priceDeltaMinor`, list, true);
    });

    combo.upgrades.forEach((upgrade, upgradeIndex) => {
      const upgradePath = `${path}.upgrades[${upgradeIndex}]`;
      validateLocalized(upgrade.label, `${upgradePath}.label`, list);
      validateMoney(upgrade.priceDeltaMinor, `${upgradePath}.priceDeltaMinor`, list, true);
    });

    if (combo.sourceStatus !== "confirmed" && combo.availability === "available") {
      diagnostic(list, "SC-CATALOG-ELIGIBILITY-002", "error", path, "Only confirmed combos may be available.");
    }

    if (componentTotalMinor > 0 && combo.priceMinor > componentTotalMinor && !combo.extraValue) {
      diagnostic(
        list,
        "SC-CATALOG-COMBO-PRICE-001",
        isEligible(combo) ? "error" : "warning",
        `${path}.priceMinor`,
        isEligible(combo)
          ? "Orderable combo costs more than its components without declared extra value."
          : "Blocked combo remains ineligible until corrected pricing or extra value is declared."
      );
    }
  });

  catalog.bumps.forEach((bump, index) => {
    const path = `bumps[${index}]`;
    validateMoney(bump.deltaPriceMinor, `${path}.deltaPriceMinor`, list);
    const target = itemIndex.get(bump.targetItemId);
    if (!target) {
      diagnostic(list, "SC-CATALOG-REFERENCE-003", "error", `${path}.targetItemId`, `Unknown bump target: ${bump.targetItemId}`);
    } else if (target.priceMinor !== bump.deltaPriceMinor) {
      diagnostic(list, "SC-CATALOG-BUMP-PRICE-001", "error", `${path}.deltaPriceMinor`, "Unapproved bump must use the menu item price.");
    }

    for (const comboId of bump.trigger.comboIds ?? []) {
      const combo = comboIndex.get(comboId);
      if (!combo) {
        diagnostic(list, "SC-CATALOG-REFERENCE-004", "error", `${path}.trigger.comboIds`, `Unknown trigger combo: ${comboId}`);
      } else if (combo.components.some((component) => component.itemId === bump.targetItemId)) {
        diagnostic(list, "SC-CATALOG-BUMP-001", "error", path, "Bump duplicates an item already included in the combo.");
      }
    }

    for (const itemId of bump.trigger.itemIds ?? []) {
      if (!itemIndex.has(itemId)) diagnostic(list, "SC-CATALOG-REFERENCE-005", "error", `${path}.trigger.itemIds`, `Unknown trigger item: ${itemId}`);
    }

    if (bump.sourceStatus !== "confirmed" && bump.availability === "available") {
      diagnostic(list, "SC-CATALOG-ELIGIBILITY-003", "error", path, "Only confirmed bumps may be available.");
    }
  });

  return list;
}

export function assertSmartChoiceCatalog(catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG): void {
  const errors = validateSmartChoiceCatalog(catalog).filter((entry) => entry.severity === "error");
  if (errors.length === 0) return;
  throw new Error(
    `[SMART-CHOICE-CATALOG] Validation failed:\n${errors
      .map((entry) => `${entry.code} ${entry.path}: ${entry.message}`)
      .join("\n")}`
  );
}

export function getEligibleItems(catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG): readonly SmartChoiceItem[] {
  return catalog.items.filter(isEligible);
}

export function getEligibleCombos(catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG): readonly SmartChoiceCombo[] {
  return catalog.combos.filter(isEligible);
}

export function getEligibleBumps(catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG): readonly SmartChoiceBump[] {
  return catalog.bumps.filter(isEligible);
}

assertSmartChoiceCatalog();
