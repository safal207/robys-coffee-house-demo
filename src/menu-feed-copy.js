// Keep result counts and both Story entry renderers grammatically consistent.
const itemForms = {
  tr: { other: "ürün" },
  en: { one: "item", other: "items" },
  ru: { one: "позиция", few: "позиции", many: "позиций", other: "позиции" }
};
const pluralRules = new Map();

export function formatFeedItemCount(count, language) {
  const locale = Object.hasOwn(itemForms, language) ? language : "tr";
  if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
  const forms = itemForms[locale];
  return `${count} ${forms[pluralRules.get(locale).select(count)] ?? forms.other}`;
}
