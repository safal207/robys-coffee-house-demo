import {
  SMART_CHOICE_CATALOG,
  type DrinkTemperature,
  type SmartChoiceIntent,
  type SmartChoiceLanguage,
  type TasteProfile
} from "./catalog.js";
import type { RecommendationInput } from "./engine.js";
import { orderProducts } from "./shared-order.js";
import type { QuickProduct } from "./quick-builder-domain.js";

export type HelpfulDifference = "budget" | "temperature" | "taste" | "intent";

export interface HelpfulOption {
  productId: string;
  name: Record<SmartChoiceLanguage, string>;
  image: string;
  categoryId: string;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
  differences: readonly HelpfulDifference[];
  overBudgetMinor: number;
  temperature: DrinkTemperature;
  taste: TasteProfile;
  intents: readonly SmartChoiceIntent[];
}

interface Profile {
  temperature: DrinkTemperature;
  taste: TasteProfile;
  intents: readonly SmartChoiceIntent[];
}

const intents: readonly string[] = ["coffee", "breakfast", "snack", "dessert", "refresh"];
const sweetHotCoffee = new Set([
  "caramel-cappuccino", "chocolate-cookie-latte", "cinnamon-latte", "caramel-latte",
  "vanilla-latte", "hazelnut-latte", "caffe-mocha", "white-chocolate-mocha"
]);
const neutralColdCoffee = new Set(["iced-filter-coffee", "iced-americano", "iced-caffe-latte"]);

function validInput(input: RecommendationInput): boolean {
  return Boolean(input && typeof input === "object" &&
    intents.includes(input.intent) && ["hot", "cold", "any"].includes(input.temperature) &&
    ["sweet", "neutral", "any"].includes(input.taste) && ["one", "two", "family"].includes(input.partySize) &&
    ["tr", "en", "ru"].includes(input.locale) && input.budget &&
    Number.isSafeInteger(input.budget.maxMinor) && input.budget.maxMinor > 0 &&
    (input.budget.minMinor === undefined || Number.isSafeInteger(input.budget.minMinor) &&
      input.budget.minMinor >= 0 && input.budget.minMinor <= input.budget.maxMinor) &&
    (input.timeOfDay === undefined || ["morning", "day", "evening", "late"].includes(input.timeOfDay)) &&
    (input.activeExclusions === undefined || Array.isArray(input.activeExclusions) &&
      input.activeExclusions.every(value => typeof value === "string" && Boolean(value.trim()))));
}

// Categories and named menu products describe preferences, not ingredient or
// allergy guarantees. Existing reviewed item metadata takes precedence below.
function menuProfile(product: QuickProduct): Profile | null {
  const key = product.id.slice(product.id.indexOf(":") + 1);
  if (product.categoryId === "hot-coffee") {
    const sweet = sweetHotCoffee.has(key);
    return { temperature: "hot", taste: sweet ? "sweet" : "neutral",
      intents: sweet ? ["coffee", "breakfast", "snack", "dessert"] : ["coffee", "breakfast", "snack"] };
  }
  if (product.categoryId === "brew-hot") {
    if (key === "filter-coffee" || key === "turkish-coffee") {
      return { temperature: "hot", taste: "neutral", intents: ["coffee", "breakfast", "snack"] };
    }
    const sweet = ["hot-chocolate", "salep", "chai-tea-latte"].includes(key);
    return { temperature: "hot", taste: sweet ? "sweet" : "neutral",
      intents: sweet ? ["breakfast", "snack", "dessert"] : ["breakfast", "snack"] };
  }
  if (product.categoryId === "herbal-tea") {
    return { temperature: "hot", taste: "neutral", intents: ["breakfast", "snack"] };
  }
  if (product.categoryId === "cold-coffee") {
    if (key === "milkshake") return { temperature: "cold", taste: "sweet", intents: ["refresh", "snack", "dessert"] };
    const sweet = !neutralColdCoffee.has(key);
    return { temperature: "cold", taste: sweet ? "sweet" : "neutral",
      intents: sweet ? ["coffee", "breakfast", "snack", "dessert", "refresh"] : ["coffee", "breakfast", "snack", "refresh"] };
  }
  if (product.categoryId === "refreshers") {
    return { temperature: "cold", taste: "sweet", intents: ["refresh", "snack"] };
  }
  if (product.categoryId === "desserts") {
    return key === "savoury-cookie"
      ? { temperature: "not-applicable", taste: "savoury", intents: ["breakfast", "snack"] }
      : { temperature: "not-applicable", taste: "sweet", intents: ["dessert", "snack"] };
  }
  if (product.categoryId === "food") {
    return { temperature: "not-applicable", taste: key === "nutella-croissant" ? "sweet" : "savoury",
      intents: ["breakfast", "snack"] };
  }
  return null;
}

function preferenceCost(option: HelpfulOption): number {
  return (option.differences.includes("intent") ? 100 : 0) +
    (option.differences.includes("temperature") ? 20 : 0) +
    (option.differences.includes("taste") ? 10 : 0);
}

function compare(left: HelpfulOption, right: HelpfulOption): number {
  return preferenceCost(left) - preferenceCost(right) ||
    left.totalPriceMinor - right.totalPriceMinor || left.productId.localeCompare(right.productId, "en");
}

/** Concrete alternatives for the guest to review; never silently rewrites their answers. */
export function findHelpfulOptions(input: RecommendationInput, guestCount?: number): HelpfulOption[] {
  if (!validInput(input)) return [];
  const quantity = input.partySize === "one" ? 1 : input.partySize === "two" ? 2 : guestCount;
  if (!Number.isInteger(quantity) || quantity === undefined || quantity < 1 || quantity > 6 ||
    input.partySize === "family" && quantity < 3) return [];

  const reviewed = new Map(SMART_CHOICE_CATALOG.items.map(item => [item.sourceId, item]));
  const options: HelpfulOption[] = [];
  for (const product of orderProducts.values()) {
    // The complete public menu is the source of availability today. Respect any
    // explicit block from its metadata or the reviewed subset; never promote it.
    const status = product.item as typeof product.item & { availability?: string; sourceStatus?: string };
    const known = reviewed.get(product.sourceId);
    if (status.availability !== undefined && status.availability !== "available" ||
      status.sourceStatus !== undefined && status.sourceStatus !== "confirmed" ||
      known && (known.availability !== "available" || known.sourceStatus !== "confirmed")) continue;
    if (!Number.isSafeInteger(product.unitPriceMinor) || product.unitPriceMinor <= 0 ||
      !["tr", "en", "ru"].every(locale => product.name[locale as SmartChoiceLanguage]?.trim())) continue;
    const profile = known ?? menuProfile(product);
    if (!profile || product.categoryId === "pairing-offers") continue;
    const totalPriceMinor = product.unitPriceMinor * quantity;
    if (!Number.isSafeInteger(totalPriceMinor)) continue;
    const overBudgetMinor = Math.max(0, totalPriceMinor - input.budget.maxMinor);
    const differences: HelpfulDifference[] = [];
    if (overBudgetMinor) differences.push("budget");
    if (input.temperature !== "any" && input.temperature !== profile.temperature) differences.push("temperature");
    if (input.taste !== "any" && input.taste !== profile.taste) differences.push("taste");
    if (!profile.intents.includes(input.intent)) differences.push("intent");
    options.push({ productId: product.id, name: product.name, image: product.image,
      categoryId: product.categoryId, quantity, unitPriceMinor: product.unitPriceMinor,
      totalPriceMinor, differences, overBudgetMinor, temperature: profile.temperature,
      taste: profile.taste, intents: profile.intents });
  }
  options.sort(compare);
  const withinBudget = options.filter(option => option.overBudgetMinor === 0);
  const intendedWithinBudget = withinBudget.filter(option => !option.differences.includes("intent"));
  const picked: HelpfulOption[] = [];
  const add = (option: HelpfulOption | undefined): void => {
    if (option && !picked.some(existing => existing.productId === option.productId)) picked.push(option);
  };
  // Keep the requested kind visible even when two coffees cost more than the
  // budget. A cheap cookie must not displace it just because it is affordable.
  add(intendedWithinBudget[0] ?? options[0]);
  add(options[0]);
  const primary = picked[0];
  // A conflicting request such as a hot refresher needs alternatives on both
  // sides of the tradeoff, rather than three cold drinks with the same warning.
  const requestedTemperatureOption = primary?.differences.includes("temperature")
    ? withinBudget.find(option => option.temperature === input.temperature &&
      !picked.some(existing => existing.productId === option.productId)) : undefined;
  add(requestedTemperatureOption ?? withinBudget.find(option =>
    !picked.some(existing => existing.productId === option.productId)));
  if (primary?.overBudgetMinor) {
    // When the desired drinks exceed the budget, the remaining slot should
    // help lower that total rather than repeat another flavour at the same price.
    add(options.find(option => !option.differences.includes("intent") &&
      option.totalPriceMinor < primary.totalPriceMinor &&
      !picked.some(existing => existing.productId === option.productId)));
  }
  for (const option of options) {
    if (picked.length >= 3) break;
    add(option);
  }
  return picked.slice(0, 3);
}
