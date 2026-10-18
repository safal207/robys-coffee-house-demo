import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/menu-app.js", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../menu-catalog.js", import.meta.url), "utf8");
const { menuCategories, menuCopy } = await import(`data:text/javascript;base64,${Buffer.from(catalog).toString("base64")}`);
const localeDeclaration = source.match(/^const localeTag = \{[^\n]+\};$/m)?.[0];
const start = source.indexOf("const priceFormatters =");
const end = source.indexOf("function imageSlug(", start);
assert(localeDeclaration && start >= 0 && end > start, "Execute the real menu locale mapping, caches and formatting functions");
const numberConstructions = [], pluralConstructions = [];
const countingConstructor = (Constructor, calls) => new Proxy(Constructor, {
  construct(target, args) { calls.push(args[0]); return Reflect.construct(target, args); }
});
const context = {
  language: "tr", menuCopy,
  Intl: {
    NumberFormat: countingConstructor(Intl.NumberFormat, numberConstructions),
    PluralRules: countingConstructor(Intl.PluralRules, pluralConstructions)
  }
};
const api = runInNewContext(`${localeDeclaration}\n${source.slice(start, end)}\n({ formatPrice, formatItemCount });`, context);
assert.equal(numberConstructions.length + pluralConstructions.length, 0, "Both caches must be lazy before first use");
const expectedLocales = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };
const menuPrices = menuCategories.flatMap(category => category.items ?? category.groups.flatMap(group => group.items)).map(item => item.price);
const prices = [...menuPrices, ...menuPrices.map(price => price * 99), 0, 1, 1234, 123456789, 1234.5];
const counts = [0, 1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 25, 99, 101, 1001, 123456];
let comparisons = 0;
const usedLanguages = new Set();
for (const language of ["tr", "en", "ru", "tr"]) {
  context.language = language;
  usedLanguages.add(language);
  const expectedPrice = new Intl.NumberFormat(expectedLocales[language], { maximumFractionDigits: 0 });
  const expectedPlural = new Intl.PluralRules(expectedLocales[language]);
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const price of prices) {
      assert.equal(api.formatPrice(price), `${expectedPrice.format(price)} ₺`, `${language} price ${price} preserves native locale and rounding`);
      comparisons += 1;
    }
    for (const count of counts) {
      const forms = menuCopy[language].itemCount;
      assert.equal(api.formatItemCount(count), forms[expectedPlural.select(count)] ?? forms.other,
        `${language} quantity ${count} preserves native plural selection`);
      comparisons += 1;
    }
  }
  assert.equal(numberConstructions.length, usedLanguages.size, "Repeated card renders reuse one real price formatter per used language");
  assert.equal(pluralConstructions.length, usedLanguages.size, "Repeated cart announcements reuse one real plural rule per used language");
}
assert.deepEqual(numberConstructions, ["tr-TR", "en-US", "ru-RU"], "Returning to Turkish reuses its original formatter");
assert.deepEqual(pluralConstructions, ["tr-TR", "en-US", "ru-RU"], "Returning to Turkish reuses its original plural rule");
console.log(`Menu formatters PASS: ${comparisons} real Intl output comparisons, TR→EN→RU→TR, three lazy NumberFormat and three PluralRules instances.`);
