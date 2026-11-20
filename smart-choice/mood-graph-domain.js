import { SMART_CHOICE_CATALOG } from "./catalog.js?v=528b93ac0a04";

// Every candidate is a proposed combination of individually verified public-menu items.
// This is NOT a published combo or a discounted price. No AI, inference about personality,
// weather API, or real-time stock claim is involved.
export const MOOD_GRAPH_VERSION = "mood-causal-pairs.v1";
export const COLOR_THEMES = ["green", "coral", "blue", "amber"];
export const MOODS = ["fresh", "comfort", "energy", "surprise"];
export const WEATHER = ["hot", "cool", "rain"];
export const PAIR_RULES = Object.freeze([
  { id:"lime-macaron", drink:"refreshers--cool-lime", snack:"desserts--macaron", colors:["green","blue"], moods:["fresh","surprise"], weather:["hot"] },
  { id:"lime-lotus", drink:"refreshers--cool-lime", snack:"desserts--lotus-cheesecake", colors:["green","amber"], moods:["surprise"], weather:["hot"] },
  { id:"iced-cheesecake", drink:"cold-coffee--iced-caffe-latte", snack:"desserts--san-sebastian-cheesecake", colors:["amber","coral"], moods:["comfort","energy"], weather:["hot"] },
  { id:"iced-macaron", drink:"cold-coffee--iced-caffe-latte", snack:"desserts--macaron", colors:["blue","green"], moods:["fresh","energy"], weather:["hot"] },
  { id:"mocha-lotus", drink:"cold-coffee--iced-mocha", snack:"desserts--lotus-cheesecake", colors:["coral","amber"], moods:["surprise","comfort"], weather:["hot"] },
  { id:"latte-macaron", drink:"hot-coffee--caffe-latte", snack:"desserts--macaron", colors:["amber","green"], moods:["comfort","energy"], weather:["cool","rain"] },
  { id:"caramel-cheesecake", drink:"hot-coffee--caramel-latte", snack:"desserts--san-sebastian-cheesecake", colors:["coral","amber"], moods:["comfort","surprise"], weather:["cool","rain"] },
  { id:"chocolate-macaron", drink:"brew-hot--hot-chocolate", snack:"desserts--macaron", colors:["coral","amber"], moods:["comfort","surprise"], weather:["cool","rain"] },
  { id:"chocolate-lotus", drink:"brew-hot--hot-chocolate", snack:"desserts--lotus-cheesecake", colors:["amber"], moods:["comfort"], weather:["cool","rain"] },
  { id:"tea-macaron", drink:"herbal-tea--relax-tea-lavender-rooibos", snack:"desserts--macaron", colors:["blue","green"], moods:["comfort","fresh"], weather:["cool","rain"] },
  { id:"tea-nutella", drink:"herbal-tea--relax-tea-lavender-rooibos", snack:"food--nutella-croissant", colors:["blue","coral"], moods:["surprise","comfort"], weather:["cool","rain"] },
  { id:"flatwhite-cheese", drink:"hot-coffee--flat-white", snack:"food--three-cheese-croissant", colors:["green","amber"], moods:["energy"], weather:["cool","rain"] }
]);

export function recommendMoodPair(input, catalog = SMART_CHOICE_CATALOG) {
  const { color, mood, weather, tried = [], offset = 0 } = input ?? {};
  if (!COLOR_THEMES.includes(color) || !MOODS.includes(mood) || !WEATHER.includes(weather)
    || !Array.isArray(tried) || !Number.isInteger(offset) || offset < 0) return null;
  const itemIndex = new Map(catalog.items.map(item => [item.id, item]));
  const ranked = PAIR_RULES.flatMap(rule => {
    const drink = itemIndex.get(rule.drink), snack = itemIndex.get(rule.snack);
    if (!drink || !snack || [drink, snack].some(item => item.availability !== "available" || item.sourceStatus !== "confirmed")) return [];
    if (tried.includes(rule.id)) return [];
    const hits = [
      { code:"mood", applied:rule.moods.includes(mood), weight:7 },
      { code:"weather", applied:rule.weather.includes(weather), weight:4 },
      { code:"color", applied:rule.colors.includes(color), weight:3 }
    ];
    return [{
      id: rule.id, drink, snack, totalMinor: drink.priceMinor + snack.priceMinor,
      score: hits.reduce((sum, hit) => sum + (hit.applied ? hit.weight : 0), 0),
      hits,
      trace: {
        graphVersion: MOOD_GRAPH_VERSION, catalogVersion: catalog.version,
        inputs: { color, mood, weather, source: "visitor-choice", weatherSource: "manual" },
        filtered: ["confirmed-catalog", "available-in-catalog", "not-marked-tried"],
        scoring: hits, selectedIds: [rule.drink, rule.snack],
        priceMode: "sum-of-public-menu-prices", outcome: "suggestion-only"
      }
    }];
  }).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
  return ranked[offset % ranked.length] ?? null;
}
