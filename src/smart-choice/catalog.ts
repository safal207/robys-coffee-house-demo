import {
  menuCategories,
  type MenuCategorySource,
  type MenuItemSource,
  type MenuLocalizedText
} from "../../menu-data.js";

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
  category: string;
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

export interface BumpTrigger {
  comboIds?: readonly string[];
  itemIds?: readonly string[];
}

export interface SmartChoiceBump {
  id: string;
  trigger: BumpTrigger;
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

export type CatalogDiagnosticSeverity = "error" | "warning";

export interface CatalogDiagnostic {
  code: string;
  severity: CatalogDiagnosticSeverity;
  path: string;
  message: string;
}

interface FlattenedMenuItem {
  sourceId: string;
  categoryId: string;
  item: MenuItemSource;
}

interface SmartChoiceItemRule {
  sourceId: string;
  tags: readonly string[];
  intents: readonly SmartChoiceIntent[];
  temperature: DrinkTemperature;
  taste: TasteProfile;
  partySizes: readonly PartySize[];
  availability: AvailabilityStatus;
  sourceStatus: SourceStatus;
}

interface SmartChoiceComboRule {
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
  const flattened: FlattenedMenuItem[] = [];

  for (const category of categories) {
    const directItems = category.items ?? [];
    const groupedItems = (category.groups ?? []).flatMap((group) => group.items);

    for (const item of [...directItems, ...groupedItems]) {
      flattened.push({
        sourceId: sourceIdFor(category.id, item),
        categoryId: category.id,
        item
      });
    }
  }

  return flattened;
}

const MENU_INDEX = new Map<string, FlattenedMenuItem>();
for (const entry of flattenMenu(menuCategories)) {
  if (MENU_INDEX.has(entry.sourceId)) {
    throw new Error(`[SMART-CHOICE-CATALOG] Duplicate public-menu source id: ${entry.sourceId}`);
  }
  MENU_INDEX.set(entry.sourceId, entry);
}

const ITEM_RULES: readonly SmartChoiceItemRule[] = [
  {
    sourceId: "hot-coffee--caffe-latte",
    tags: ["coffee", "milk", "morning"],
    intents: ["coffee", "breakfast"],
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
    sourceId: "cold-coffee--iced-caffe-latte",
    tags: ["coffee", "milk", "cold"],
    intents: ["coffee", "refresh", "dessert"],
    temperature: "cold",
    taste: "neutral",
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
    intents: ["coffee", "snack", "dessert"],
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

const COMBO_RULES: readonly SmartChoiceComboRule[] = [
  {
    id: "combo-iced-san-sebastian",
    sourceOfferId: "iced-san-sebastian-pairing",
    componentIds: [
      "cold-coffee--iced-caffe-latte",
      "desserts--san-sebastian-cheesecake"
    ],
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

function requireMenuSource(sourceId: string): FlattenedMenuItem {
  const source = MENU_INDEX.get(sourceId);
  if (!source) {
    throw new Error(`[SMART-CHOICE-CATALOG] Unknown public-menu source: ${sourceId}`);
  }
  return source;
}

function toMinorUnits(priceLira: number, sourceId: string): number {
  if (!Number.isInteger(priceLira) || priceLira <= 0) {
    throw new Error(`[SMART-CHOICE-CATALOG] ${sourceId} has invalid whole-lira price: ${priceLira}`);
  }
  return priceLira * 100;
}

function buildItem(rule: SmartChoiceItemRule): SmartChoiceItem {
  const source = requireMenuSource(rule.sourceId);
  return {
    id: rule.sourceId,
    sourceId: rule.sourceId,
    sourceCategoryId: source.categoryId,
    name: source.item.name,
    ...(source.item.description ? { description: source.item.description } : {}),
    category: source.categoryId,
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

function buildCombo(rule: SmartChoiceComboRule): SmartChoiceCombo {
  const source = requireMenuSource(rule.sourceOfferId);
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

const COMBOS = COMBO_RULES.map(buildCombo);

const BUMPS: readonly SmartChoiceBump[] = [
  {
    id: "bump-macaron-after-iced-san-sebastian",
    trigger: { comboIds: ["combo-iced-san-sebastian"] },
    targetItemId: "desserts--macaron",
    deltaPriceMinor: ITEM_INDEX.get("desserts--macaron")?.priceMinor ?? 0,
    exclusions: ["basket-already-contains-dessert-add-on"],
    availability: "unavailable",
    sourceStatus: "provisional"
  }
];

export const SMART_CHOICE_CATALOG: SmartChoiceCatalog = {
  version: "smart-choice-catalog.v0.1.0",
  currency: "TRY",
  minorUnitScale: 100,
  items: ITEMS,
  combos: COMBOS,
  bumps: BUMPS
};

function addDiagnostic(
  diagnostics: CatalogDiagnostic[],
  code: string,
  severity: CatalogDiagnosticSeverity,
  path: string,
  message: string
): void {
  diagnostics.push({ code, severity, path, message });
}

function validateLocalizedText(
  value: MenuLocalizedText | undefined,
  path: string,
  diagnostics: CatalogDiagnostic[]
): void {
  if (!value || typeof value !== "object") {
    addDiagnostic(diagnostics, "SC-CATALOG-I18N-001", "error", path, "Localized text is missing.");
    return;
  }

  for (const language of LANGUAGES) {
    if (typeof value[language] !== "string" || value[language].trim().length === 0) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-I18N-002",
        "error",
        `${path}.${language}`,
        `Missing ${language} translation.`
      );
    }
  }
}

function validateMoney(
  value: number,
  path: string,
  diagnostics: CatalogDiagnostic[],
  allowZero = false
): void {
  const valid = Number.isInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) {
    addDiagnostic(
      diagnostics,
      "SC-CATALOG-MONEY-001",
      "error",
      path,
      "Money must be a positive integer in minor units."
    );
  }
}

function validateUniqueIds(
  entries: readonly { id: string }[],
  path: string,
  diagnostics: CatalogDiagnostic[]
): void {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (!entry.id.trim()) {
      addDiagnostic(diagnostics, "SC-CATALOG-ID-001", "error", `${path}[${index}].id`, "ID is empty.");
    } else if (seen.has(entry.id)) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-ID-002",
        "error",
        `${path}[${index}].id`,
        `Duplicate ID: ${entry.id}`
      );
    }
    seen.add(entry.id);
  }
}

export function validateSmartChoiceCatalog(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): CatalogDiagnostic[] {
  const diagnostics: CatalogDiagnostic[] = [];

  if (!catalog.version.trim()) {
    addDiagnostic(diagnostics, "SC-CATALOG-VERSION-001", "error", "version", "Catalog version is missing.");
  }
  if (catalog.currency !== "TRY") {
    addDiagnostic(diagnostics, "SC-CATALOG-CURRENCY-001", "error", "currency", "Currency must be TRY.");
  }
  if (catalog.minorUnitScale !== 100) {
    addDiagnostic(
      diagnostics,
      "SC-CATALOG-CURRENCY-002",
      "error",
      "minorUnitScale",
      "TRY prices must use a 100 minor-unit scale."
    );
  }

  validateUniqueIds(catalog.items, "items", diagnostics);
  validateUniqueIds(catalog.combos, "combos", diagnostics);
  validateUniqueIds(catalog.bumps, "bumps", diagnostics);

  const itemIndex = new Map(catalog.items.map((item) => [item.id, item]));
  const comboIndex = new Map(catalog.combos.map((combo) => [combo.id, combo]));

  for (const [index, item] of catalog.items.entries()) {
    const path = `items[${index}]`;
    validateLocalizedText(item.name, `${path}.name`, diagnostics);
    if (item.description) validateLocalizedText(item.description, `${path}.description`, diagnostics);
    validateMoney(item.priceMinor, `${path}.priceMinor`, diagnostics);

    if (!MENU_INDEX.has(item.sourceId)) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-SOURCE-001",
        "error",
        `${path}.sourceId`,
        `Unknown public-menu source: ${item.sourceId}`
      );
    }

    if (item.sourceStatus !== "confirmed" && item.availability === "available") {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-ELIGIBILITY-001",
        "error",
        path,
        "Only confirmed items may be available for recommendation."
      );
    }
  }

  for (const [index, combo] of catalog.combos.entries()) {
    const path = `combos[${index}]`;
    validateLocalizedText(combo.name, `${path}.name`, diagnostics);
    if (combo.description) validateLocalizedText(combo.description, `${path}.description`, diagnostics);
    if (combo.extraValue) validateLocalizedText(combo.extraValue, `${path}.extraValue`, diagnostics);
    validateMoney(combo.priceMinor, `${path}.priceMinor`, diagnostics);

    if (!MENU_INDEX.has(combo.sourceOfferId)) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-SOURCE-002",
        "error",
        `${path}.sourceOfferId`,
        `Unknown public-menu offer source: ${combo.sourceOfferId}`
      );
    }

    if (combo.components.length < 2) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-COMBO-001",
        "error",
        `${path}.components`,
        "A combo must contain at least two components."
      );
    }

    const componentIds = new Set<string>();
    let componentTotalMinor = 0;
    for (const [componentIndex, component] of combo.components.entries()) {
      const componentPath = `${path}.components[${componentIndex}]`;
      if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-COMBO-002",
          "error",
          `${componentPath}.quantity`,
          "Component quantity must be a positive integer."
        );
      }
      if (componentIds.has(component.itemId)) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-COMBO-003",
          "error",
          `${componentPath}.itemId`,
          `Duplicate combo component: ${component.itemId}`
        );
      }
      componentIds.add(component.itemId);

      const item = itemIndex.get(component.itemId);
      if (!item) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-REFERENCE-001",
          "error",
          `${componentPath}.itemId`,
          `Unknown item reference: ${component.itemId}`
        );
      } else {
        componentTotalMinor += item.priceMinor * component.quantity;
      }
    }

    for (const [substitutionIndex, substitution] of combo.allowedSubstitutions.entries()) {
      const substitutionPath = `${path}.allowedSubstitutions[${substitutionIndex}]`;
      if (!itemIndex.has(substitution.fromItemId) || !itemIndex.has(substitution.toItemId)) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-REFERENCE-002",
          "error",
          substitutionPath,
          "Substitution references an unknown item."
        );
      }
      validateMoney(substitution.priceDeltaMinor, `${substitutionPath}.priceDeltaMinor`, diagnostics, true);
    }

    for (const [upgradeIndex, upgrade] of combo.upgrades.entries()) {
      const upgradePath = `${path}.upgrades[${upgradeIndex}]`;
      validateLocalizedText(upgrade.label, `${upgradePath}.label`, diagnostics);
      validateMoney(upgrade.priceDeltaMinor, `${upgradePath}.priceDeltaMinor`, diagnostics, true);
    }

    if (combo.sourceStatus !== "confirmed" && combo.availability === "available") {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-ELIGIBILITY-002",
        "error",
        path,
        "Only confirmed combos may be available for recommendation."
      );
    }

    if (componentTotalMinor > 0 && combo.priceMinor > componentTotalMinor && !combo.extraValue) {
      const eligible = combo.sourceStatus === "confirmed" && combo.availability === "available";
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-COMBO-PRICE-001",
        eligible ? "error" : "warning",
        `${path}.priceMinor`,
        eligible
          ? "Orderable combo costs more than its components without declared extra value."
          : "Blocked combo costs more than its components and remains ineligible until extra value or corrected pricing is declared."
      );
    }
  }

  for (const [index, bump] of catalog.bumps.entries()) {
    const path = `bumps[${index}]`;
    validateMoney(bump.deltaPriceMinor, `${path}.deltaPriceMinor`, diagnostics);

    const target = itemIndex.get(bump.targetItemId);
    if (!target) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-REFERENCE-003",
        "error",
        `${path}.targetItemId`,
        `Unknown bump target: ${bump.targetItemId}`
      );
    } else if (target.priceMinor !== bump.deltaPriceMinor) {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-BUMP-PRICE-001",
        "error",
        `${path}.deltaPriceMinor`,
        "Bump price must match the referenced menu item until a separately approved offer exists."
      );
    }

    for (const comboId of bump.trigger.comboIds ?? []) {
      const combo = comboIndex.get(comboId);
      if (!combo) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-REFERENCE-004",
          "error",
          `${path}.trigger.comboIds`,
          `Unknown trigger combo: ${comboId}`
        );
      } else if (combo.components.some((component) => component.itemId === bump.targetItemId)) {
        addDiagnostic(\iagnostics,
          "SC-CATALOG-BUMP-001",
          "error",
          path,
          "Bump duplicates an item already included in its trigger combo."
        );
      }
    }

    for (const itemId of bump.trigger.itemIds ?? []) {
      if (!itemIndex.has(itemId)) {
        addDiagnostic(
          diagnostics,
          "SC-CATALOG-REFERENCE-005",
          "error",
          `${path}.trigger.itemIds`,
          `Unknown trigger item: ${itemId}`
        );
      }
    }

    if (bump.sourceStatus !== "confirmed" && bump.availability === "available") {
      addDiagnostic(
        diagnostics,
        "SC-CATALOG-ELIGIBILITY-003",
        "error",
        path,
        "Only confirmed bumps may be available for recommendation."
      );
    }
  }

  return diagnostics;
}

export function assertSmartChoiceCatalog(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): void {
  const errors = validateSmartChoiceCatalog(catalog).filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length === 0) return;

  const details = errors
    .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`)
    .join("\n");
  throw new Error(`[SMART-CHOICE-CATALOG] Validation failed:\n${details}`);
}

export function getEligibleItems(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): readonly SmartChoiceItem[] {
  return catalog.items.filter(
    (item) => item.sourceStatus === "confirmed" && item.availability === "available"
  );
}

export function getEligibleCombos(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): readonly SmartChoiceCombo[] {
  return catalog.combos.filter(
    (combo) => combo.sourceStatus === "confirmed" && combo.availability === "available"
  );
}

export function getEligibleBumps(
  catalog: SmartChoiceCatalog = SMART_CHOICE_CATALOG
): readonly SmartChoiceBump[] {
  return catalog.bumps.filter(
    (bump) => bump.sourceStatus === "confirmed" && bump.availability === "available"
  );
}

assertSmartChoiceCatalog();
