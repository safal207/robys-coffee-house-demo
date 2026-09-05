import { build } from "esbuild";

function assert(condition, message) {
  if (!condition) throw new Error(`[SMART-CHOICE-ENGINE-TEST] ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localized(name) {
  return { tr: name, en: name, ru: name };
}

const result = await build({
  entryPoints: ["src/smart-choice/engine.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  legalComments: "none"
});

assert(result.outputFiles?.length === 1, "Expected one bundled engine output");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
const {
  DEFAULT_RECOMMENDATION_CONFIG,
  recommendSmartChoice,
  validateRecommendationConfig
} = await import(moduleUrl);

const catalogModule = await build({
  entryPoints: ["src/smart-choice/catalog.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  legalComments: "none"
});
const catalogUrl = `data:text/javascript;base64,${Buffer.from(catalogModule.outputFiles[0].text).toString("base64")}`;
const { SMART_CHOICE_CATALOG } = await import(catalogUrl);

assert(
  DEFAULT_RECOMMENDATION_CONFIG.version === "smart-choice-recommendation-config.v0.2.0",
  "Party-size hard constraints must carry a new replayable recommendation-config version"
);

const baseCombo = SMART_CHOICE_CATALOG.combos.find((combo) => combo.id === "combo-iced-san-sebastian");
assert(baseCombo, "Expected the confirmed Iced Latte + San Sebastian combo");

{
  const restoredEverydayChoice = recommendSmartChoice({
    intent: "coffee",
    temperature: "hot",
    taste: "neutral",
    partySize: "one",
    budget: { maxMinor: 25_000 },
    locale: "ru"
  });
  assert(restoredEverydayChoice.status === "ok", "Everyday hot-coffee choice under 250 TRY must not dead-end");
  assert(restoredEverydayChoice.top, "Everyday hot-coffee choice must return a recommendation");
  assert(restoredEverydayChoice.top.priceMinor <= 25_000, "Everyday top recommendation must respect the 250 TRY ceiling");
  assert(restoredEverydayChoice.top.componentItemIds.length >= 1, "Everyday recommendation must reference a verified menu item");
  assert(
    restoredEverydayChoice.economy === null ||
      restoredEverydayChoice.economy.priceMinor < restoredEverydayChoice.top.priceMinor,
    "An everyday economy alternative must be strictly cheaper than the top recommendation"
  );
  assert(
    !restoredEverydayChoice.top.componentItemIds.includes("herbal-tea--relax-tea-lavender-rooibos"),
    "Coffee intent must not resolve to herbal tea"
  );
}

{
  const sweetCoffeeChoice = recommendSmartChoice({
    intent: "coffee",
    temperature: "hot",
    taste: "sweet",
    partySize: "one",
    budget: { maxMinor: 25_000 },
    locale: "ru"
  });
  assert(sweetCoffeeChoice.status === "ok", "Sweet hot-coffee choice under 250 TRY must not dead-end");
  assert(
    sweetCoffeeChoice.top?.componentItemIds.includes("hot-coffee--caramel-latte"),
    "Sweet coffee intent must resolve to an actual coffee"
  );
  assert(
    !sweetCoffeeChoice.top?.componentItemIds.includes("brew-hot--hot-chocolate"),
    "Coffee intent must not resolve to Hot Chocolate"
  );
}

{
  const unsupportedFamilyChoice = recommendSmartChoice({
    intent: "breakfast",
    temperature: "hot",
    taste: "sweet",
    partySize: "family",
    budget: { maxMinor: 25_000 },
    locale: "ru"
  });
  assert(unsupportedFamilyChoice.status === "no-match", "Family choice must not return a one- or two-person item");
  const caramelLatteTrace = unsupportedFamilyChoice.trace.candidates.find(
    (candidate) => candidate.candidateId === "single-hot-coffee--caramel-latte"
  );
  assert(
    caramelLatteTrace?.rejectedBy.some((entry) => entry.code === "hard.party-size-mismatch"),
    "Unsupported family candidates must expose the party-size hard rejection"
  );
}

{
  const familyRefreshChoice = recommendSmartChoice({
    intent: "refresh",
    temperature: "cold",
    taste: "sweet",
    partySize: "family",
    budget: { maxMinor: 25_000 },
    locale: "ru"
  });
  assert(familyRefreshChoice.status === "no-match", "A one-unit refresher must not satisfy a family request");
  const coolLimeTrace = familyRefreshChoice.trace.candidates.find(
    (candidate) => candidate.candidateId === "single-refreshers--cool-lime"
  );
  assert(
    coolLimeTrace?.rejectedBy.some((entry) => entry.code === "hard.single-item-party-size-mismatch"),
    "Multi-person requests must hard-reject unscaled single-item candidates"
  );
}

function combo(id, priceMinor, componentItemIds, tags = ["cold", "sweet"], intents = ["dessert", "snack"]) {
  return {
    ...clone(baseCombo),
    id,
    sourceOfferId: baseCombo.sourceOfferId,
    name: localized(id),
    description: localized(`${id} description`),
    priceMinor,
    components: componentItemIds.map((itemId) => ({ itemId, quantity: 1 })),
    intents,
    tags,
    availability: "available",
    sourceStatus: "confirmed",
    extraValue: localized("Declared fixture value")
  };
}

function fixtureCatalog() {
  const catalog = clone(SMART_CHOICE_CATALOG);
  catalog.version = "smart-choice-catalog.test.v1";
  catalog.combos = [
    combo(
      "combo-top",
      37_000,
      ["cold-coffee--iced-caffe-latte", "desserts--san-sebastian-cheesecake"],
      ["cold", "sweet", "morning"]
    ),
    combo(
      "combo-economy",
      21_000,
      ["cold-coffee--iced-caffe-latte", "desserts--macaron"]
    ),
    combo(
      "combo-premium",
      42_000,
      ["cold-coffee--iced-caffe-latte", "desserts--lotus-cheesecake"]
    ),
    combo(
      "combo-hot-priority",
      22_000,
      ["hot-coffee--caffe-latte", "desserts--macaron"],
      ["hot", "sweet"]
    )
  ];
  catalog.bumps = [];
  return catalog;
}

const happyInput = {
  intent: "dessert",
  temperature: "cold",
  taste: "sweet",
  partySize: "one",
  budget: { minMinor: 20_000, maxMinor: 45_000 },
  locale: "en",
  timeOfDay: "morning"
};

{
  const catalog = fixtureCatalog();
  const first = recommendSmartChoice(happyInput, catalog);
  const second = recommendSmartChoice(happyInput, catalog);

  assert(first.status === "ok", "Happy path must return ok");
  assert(first.top?.candidateId === "combo-top", "Morning-fit combo must be the top recommendation");
  assert(first.economy?.candidateId === "combo-economy", "Cheapest remaining fit must be the economy alternative");
  assert(first.economy.priceMinor < first.top.priceMinor, "Economy alternative must be strictly cheaper than top");
  assert(first.premium?.candidateId === "combo-premium", "Higher-priced in-budget fit must be the premium alternative");
  assert(first.premium?.premiumStretch === false, "In-budget premium must not be labeled as a stretch");
  assert(JSON.stringify(first) === JSON.stringify(second), "Identical input must produce byte-stable JSON output");
  assert(
    first.top.scoreBreakdown.reduce((sum, entry) => sum + entry.contribution, 0) === first.top.score,
    "Score breakdown must add up to the total score"
  );
  assert(
    first.trace.candidates.some((candidate) =>
      candidate.candidateId === "combo-hot-priority" &&
      candidate.rejectedBy.some((rejection) => rejection.code === "hard.temperature-mismatch")
    ),
    "Wrong-temperature candidate must be rejected before scoring"
  );
}

{
  const catalog = fixtureCatalog();
  catalog.combos = [
    combo("combo-b", 30_000, ["cold-coffee--iced-caffe-latte", "desserts--macaron"]),
    combo("combo-a", 30_000, ["cold-coffee--iced-caffe-latte", "desserts--macaron"])
  ];
  const tie = recommendSmartChoice({ ...happyInput, timeOfDay: undefined }, catalog);
  assert(tie.top?.candidateId === "combo-a", "Exact ties must resolve by stable candidate ID");
}

{
  const noMatch = recommendSmartChoice(
    { ...happyInput, temperature: "hot" },
    {
      ...fixtureCatalog(),
      combos: [combo("combo-cold-only", 30_000, ["cold-coffee--iced-caffe-latte", "desserts--macaron"])]
    }
  );
  assert(noMatch.status === "no-match", "Hard-constraint exhaustion must return no-match");
  assert(noMatch.top === null && noMatch.economy === null && noMatch.premium === null, "No-match must not invent recommendations");
  assert(
    noMatch.trace.candidates[0].rejectedBy.some((entry) => entry.code === "hard.temperature-mismatch"),
    "No-match trace must explain the rejected hard constraint"
  );
}

{
  const missing = recommendSmartChoice({ intent: "dessert" }, fixtureCatalog());
  assert(missing.status === "invalid-input", "Missing data must fail as invalid-input");
  assert(missing.trace.inputDiagnostics.length >= 5, "Missing data must expose field diagnostics");
  assert(missing.top === null, "Invalid input must not produce a top recommendation");
}

{
  const catalog = fixtureCatalog();
  catalog.combos = [
    combo("combo-budget-base", 21_000, ["cold-coffee--iced-caffe-latte", "desserts--macaron"]),
    combo("combo-budget-boundary", 37_000, ["cold-coffee--iced-caffe-latte", "desserts--san-sebastian-cheesecake"])
  ];

  const exact = recommendSmartChoice(
    { ...happyInput, timeOfDay: undefined, budget: { maxMinor: 37_000 } },
    catalog
  );
  const exactCandidate = exact.trace.candidates.find((entry) => entry.candidateId === "combo-budget-boundary");
  assert(exactCandidate?.budgetClass === "regular", "A candidate exactly at the ceiling must remain regular");

  const overByOne = recommendSmartChoice(
    { ...happyInput, timeOfDay: undefined, budget: { maxMinor: 36_999 } },
    catalog
  );
  assert(overByOne.status === "ok", "A regular base candidate must preserve an ok result");
  assert(overByOne.premium?.candidateId === "combo-budget-boundary", "Candidate one minor unit over budget may only appear as premium");
  assert(overByOne.premium?.premiumStretch === true, "Over-budget premium must be explicitly labeled premium-stretch");
  assert(overByOne.top.priceMinor <= 36_999, "Top recommendation must never exceed the budget ceiling");
}

{
  const catalog = fixtureCatalog();
  const unavailable = catalog.combos.find((entry) => entry.id === "combo-top");
  unavailable.availability = "unavailable";
  const result = recommendSmartChoice(happyInput, catalog);
  assert(result.top?.candidateId !== "combo-top", "Unavailable candidates must be excluded");
  assert(
    result.trace.candidates.find((entry) => entry.candidateId === "combo-top")?.rejectedBy.some((entry) => entry.code === "hard.combo-unavailable"),
    "Unavailable rejection must be visible in the trace"
  );
}

{
  const catalog = fixtureCatalog();
  catalog.combos = [
    combo("combo-cold-safe", 30_000, ["cold-coffee--iced-caffe-latte", "desserts--macaron"]),
    combo("combo-hot-priority", 20_000, ["hot-coffee--caffe-latte", "desserts--macaron"], ["hot", "sweet"])
  ];
  const config = clone(DEFAULT_RECOMMENDATION_CONFIG);
  config.businessPriorityByCandidateId = { "combo-hot-priority": 100 };
  const result = recommendSmartChoice({ ...happyInput, timeOfDay: undefined }, catalog, config);
  assert(result.top?.candidateId === "combo-cold-safe", "Business priority must not override a hard temperature preference");
}

{
  const catalog = fixtureCatalog();
  catalog.combos = [combo("combo-top", 37_000, ["cold-coffee--iced-caffe-latte", "desserts--san-sebastian-cheesecake"], ["cold", "sweet", "morning"] )];
  catalog.bumps = [
    {
      id: "bump-macaron-test",
      trigger: { comboIds: ["combo-top"] },
      targetItemId: "desserts--macaron",
      deltaPriceMinor: 3_000,
      exclusions: ["basket-already-contains-dessert-add-on"],
      availability: "available",
      sourceStatus: "confirmed"
    },
    {
      id: "bump-expensive-test",
      trigger: { comboIds: ["combo-top"] },
      targetItemId: "desserts--lotus-cheesecake",
      deltaPriceMinor: 19_000,
      exclusions: [],
      availability: "available",
      sourceStatus: "confirmed"
    }
  ];
  const result = recommendSmartChoice(happyInput, catalog);
  assert(result.bump?.bumpId === "bump-macaron-test", "Engine must choose at most one cheapest eligible bump");
  assert(result.bump.finalPriceMinor === 40_000, "Bump final price must be deterministic and budget-safe");

  const excluded = recommendSmartChoice(
    { ...happyInput, activeExclusions: ["basket-already-contains-dessert-add-on"] },
    catalog
  );
  assert(excluded.bump === null, "An active bump exclusion must fail closed");
}

{
  const invalidConfig = clone(DEFAULT_RECOMMENDATION_CONFIG);
  invalidConfig.weights.businessPriority = 11;
  invalidConfig.weights.intent = 29;
  assert(
    validateRecommendationConfig(invalidConfig).some((message) => message.includes("must not exceed 10")),
    "Config validation must cap business priority at 10 points"
  );
}

console.log("✅ SMART-CHOICE-ENGINE passed: happy path, deterministic replay, ties, no-match, missing input, boundary budgets, availability, business guardrail and bump selection.");
