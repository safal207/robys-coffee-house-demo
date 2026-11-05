import { calorieRows } from "./menu-nutrition-ranges.js";

export function formatCalorieLabel(range, language = "tr") {
  if (!range) return "";
  const copy = { tr: ["kcal", "örnek porsiyon"], en: ["kcal", "example portion"], ru: ["ккал", "пример порции"] };
  const [unit, note] = Object.hasOwn(copy, language) ? copy[language] : copy.tr;
  return `≈ ${range[0]}–${range[1]} ${unit} · ${note}`;
}

// Rows are generated from this same catalog at build time. Full product IDs
// remain the lookup identity; ingredient/portion descriptions stay lazy.
export function createCalorieLookup(categories) {
  const ranges = new Map();
  const slug = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const category of categories) {
    const items = category.items ?? category.groups?.flatMap(group => group.items) ?? [];
    items.forEach((item, index) => {
      const range = calorieRows[category.id]?.[index];
      if (range) ranges.set(`${category.id}:${item.id ?? slug(item.name.en)}`, range);
    });
  }
  return (id, language) => formatCalorieLabel(ranges.get(id), language);
}
