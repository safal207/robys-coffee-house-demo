import { build } from "esbuild";
import ts from "typescript";

function assert(condition, message) {
  if (!condition) throw new Error(`[SMART-CHOICE-CATALOG-VERIFY] ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
assert(configPath, "tsconfig.json was not found");

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
assert(!configFile.error, configFile.error ? ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n") : "");

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
assert(
  parsedConfig.errors.length === 0,
  parsedConfig.errors.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")).join("\n")
);

const program = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options });
const typeDiagnostics = ts.getPreEmitDiagnostics(program);
assert(
  typeDiagnostics.length === 0,
  typeDiagnostics.length > 0
    ? `TypeScript diagnostics failed:\n${ts.formatDiagnosticsWithColorAndContext(typeDiagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n"
      })}`
    : ""
);

const result = await build({
  entryPoints: ["src/smart-choice/catalog.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  legalComments: "none"
});

assert(result.outputFiles?.length === 1, "Expected one bundled catalog output");
const source = result.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  SMART_CHOICE_CATALOG,
  getEligibleItems,
  getEligibleCombos,
  getEligibleBumps,
  validateSmartChoiceCatalog
} = await import(moduleUrl);

const diagnostics = validateSmartChoiceCatalog(SMART_CHOICE_CATALOG);
const errors = diagnostics.filter((entry) => entry.severity === "error");
const warnings = diagnostics.filter((entry) => entry.severity === "warning");

assert(errors.length === 0, `Current catalog has errors:\n${JSON.stringify(errors, null, 2)}`);
assert(
  warnings.some((entry) => entry.code === "SC-CATALOG-COMBO-PRICE-001"),
  "Expected the blocked Cool Lime + Macaron price warning"
);

assert(SMART_CHOICE_CATALOG.currency === "TRY", "Catalog currency must be TRY");
assert(SMART_CHOICE_CATALOG.minorUnitScale === 100, "Catalog must use kuruş minor units");
assert(
  SMART_CHOICE_CATALOG.items.every((item) => Number.isInteger(item.priceMinor) && item.priceMinor > 0),
  "All item prices must be positive integer minor units"
);
assert(
  SMART_CHOICE_CATALOG.combos.every((combo) => Number.isInteger(combo.priceMinor) && combo.priceMinor > 0),
  "All combo prices must be positive integer minor units"
);

const eligibleItems = getEligibleItems();
const eligibleCombos = getEligibleCombos();
const eligibleBumps = getEligibleBumps();

assert(eligibleItems.length > 0, "Expected confirmed Smart Choice items");
const hotChocolate = SMART_CHOICE_CATALOG.items.find((item) => item.id === "brew-hot--hot-chocolate");
assert(hotChocolate, "Expected Hot Chocolate in the verified catalog");
assert(
  !hotChocolate.intents.includes("coffee"),
  "Hot Chocolate must not be eligible for the coffee intent"
);
assert(
  eligibleCombos.some((combo) => combo.id === "combo-iced-san-sebastian"),
  "Iced Latte + San Sebastian must be an eligible confirmed combo"
);
assert(
  eligibleCombos.some((combo) => combo.id === "single-brew-hot--filter-coffee"),
  "Verified single menu items must be eligible recommendation candidates"
);
assert(
  !eligibleCombos.some((combo) => combo.id === "combo-cool-lime-macaron"),
  "Cool Lime + Macaron must remain blocked until pricing is explained or corrected"
);
assert(eligibleBumps.length === 0, "No provisional bump may be eligible");

const negativePrice = clone(SMART_CHOICE_CATALOG);
negativePrice.items[0].priceMinor = -1;
assert(
  validateSmartChoiceCatalog(negativePrice).some(
    (entry) => entry.code === "SC-CATALOG-MONEY-001" && entry.severity === "error"
  ),
  "Negative prices must fail validation"
);

const unknownReference = clone(SMART_CHOICE_CATALOG);
unknownReference.combos[0].components[0].itemId = "missing-item";
assert(
  validateSmartChoiceCatalog(unknownReference).some(
    (entry) => entry.code === "SC-CATALOG-REFERENCE-001" && entry.severity === "error"
  ),
  "Unknown combo component references must fail validation"
);

const doubledSingleItem = clone(SMART_CHOICE_CATALOG);
const doubledSingleCandidate = doubledSingleItem.combos.find((combo) => combo.id === "single-brew-hot--hot-chocolate");
assert(doubledSingleCandidate, "Expected the Hot Chocolate single-item candidate");
doubledSingleCandidate.components[0].quantity = 2;
assert(
  validateSmartChoiceCatalog(doubledSingleItem).some(
    (entry) => entry.code === "SC-CATALOG-ITEM-CANDIDATE-001" && entry.severity === "error"
  ),
  "A single-item candidate with quantity other than one must fail validation"
);

const externalItemIds = clone(SMART_CHOICE_CATALOG);
const externalHotChocolate = externalItemIds.items.find((item) => item.id === "brew-hot--hot-chocolate");
const externalSingleCandidate = externalItemIds.combos.find((combo) => combo.id === "single-brew-hot--hot-chocolate");
assert(externalHotChocolate && externalSingleCandidate, "Expected the Hot Chocolate item and single-item candidate");
externalHotChocolate.id = "external-hot-chocolate-id";
externalSingleCandidate.components[0].itemId = externalHotChocolate.id;
assert(
  !validateSmartChoiceCatalog(externalItemIds).some((entry) => entry.code === "SC-CATALOG-ITEM-CANDIDATE-001"),
  "A valid single-item source relationship must not depend on equal internal and external IDs"
);

const contradictoryCombo = clone(SMART_CHOICE_CATALOG);
contradictoryCombo.combos[0].priceMinor += 100;
assert(
  validateSmartChoiceCatalog(contradictoryCombo).some(
    (entry) => entry.code === "SC-CATALOG-COMBO-PRICE-001" && entry.severity === "error"
  ),
  "An orderable combo priced above its components without extra value must fail validation"
);

const provisionalLeak = clone(SMART_CHOICE_CATALOG);
provisionalLeak.combos[1].availability = "available";
assert(
  validateSmartChoiceCatalog(provisionalLeak).some(
    (entry) => entry.code === "SC-CATALOG-ELIGIBILITY-002" && entry.severity === "error"
  ),
  "A provisional combo must not become available"
);

console.log(
  `✅ SMART-CHOICE-CATALOG passed: ${SMART_CHOICE_CATALOG.items.length} items, ` +
  `${SMART_CHOICE_CATALOG.combos.length} combos, ${SMART_CHOICE_CATALOG.bumps.length} bumps, ` +
  `${warnings.length} expected warning(s), TypeScript clean, adversarial mutations rejected.`
);
