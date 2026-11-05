export function formatCalorieLabel(range, language = "tr") {
  if (!range) return "";
  const copy = { tr: ["kcal", "örnek porsiyon"], en: ["kcal", "example portion"], ru: ["ккал", "пример порции"] };
  const [unit, note] = Object.hasOwn(copy, language) ? copy[language] : copy.tr;
  return `≈ ${range[0]}–${range[1]} ${unit} · ${note}`;
}
