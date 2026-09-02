import { readFileSync } from "node:fs";
import vm from "node:vm";
import { copy } from "../discover-copy.js";
import { isPublicPairingEligible } from "../menu-data.js";
import { journeyCatalog, journeys } from "../discover-journeys-v2.js";

const fail = (message) => {
  throw new Error(`DISCOVER-ROTATION-001: ${message}`);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const runtime = readFileSync("discover-v2.js", "utf8");
const html = readFileSync("discover.html", "utf8");
const chooseStart = runtime.indexOf("function choose(){");
const chooseEnd = runtime.indexOf("\nfunction renderJourney", chooseStart);

assert(chooseStart >= 0 && chooseEnd > chooseStart, "could not isolate choose() from discover-v2.js");

const chooseSource = runtime.slice(chooseStart, chooseEnd);

function evaluate(discoveredIds, sourceJourneys = journeys) {
  const context = { result: null };
  const source = `
    let time = "day";
    let weather = "hot";
    const journeys = ${JSON.stringify(sourceJourneys)};
    const discovered = new Set(${JSON.stringify(discoveredIds)});
    let candidates = [];
    let candidateIndex = 99;
    ${chooseSource}
    choose();
    result = {
      ids: candidates.map((journey) => journey.id),
      candidateIndex,
      nextId: candidates[(candidateIndex + 1) % candidates.length]?.id ?? null
    };
  `;
  vm.runInNewContext(source, context);
  return context.result;
}

const fresh = evaluate([]);
assert(
  JSON.stringify(fresh.ids) === JSON.stringify(["iced-san-sebastian"]),
  `public Taste Journey must expose only the confirmed offer; found: ${fresh.ids.join(", ")}`
);
assert(fresh.candidateIndex === 0, "fresh rotation must reset candidateIndex to zero");
assert(fresh.nextId === "iced-san-sebastian", "single eligible journey must remain stable");

const catalogIds = journeyCatalog.map((journey) => journey.id);
assert(
  catalogIds.includes("cool-lime-macaron"),
  "Cool Lime + Macaron evidence must remain in the source journey catalog"
);
assert(
  !journeys.some((journey) => journey.id === "cool-lime-macaron"),
  "Cool Lime + Macaron must not be exported into the rendered journey rotation"
);
assert(!isPublicPairingEligible("cool-lime-macaron"), "disputed pairing must fail eligibility");
assert(!isPublicPairingEligible("unknown-pairing"), "unknown pairing ids must fail closed");
assert(runtime.includes("el.next.hidden=journeys.length<2"), "single-journey UI must hide the inactive rotation control");
assert(
  /<button\b(?=[^>]*\bid=["']next-pairing["'])(?=[^>]*\bhidden\b)[^>]*>/u.test(html),
  "no-JavaScript HTML must hide the inactive rotation control"
);
assert(
  /<button\b(?=[^>]*\bid=["']mark-discovered["'])(?=[^>]*\bhidden\b)[^>]*>/u.test(html),
  "no-JavaScript HTML must hide the inactive discovery control"
);
assert(
  runtime.includes('el.menuLink.href="menu.html#pairing-offers"'),
  "Taste Journey CTA must open the public pairing destination"
);
assert(runtime.includes("function renderEmptyJourney()"), "zero eligible journeys need an explicit empty state");
assert(runtime.includes("function renderAvailableJourney()"), "initial and weather renders need a guarded journey renderer");
assert(!runtime.includes("renderJourney(candidates[0])"), "runtime must never render an unchecked empty candidate");
for (const language of ["tr", "en", "ru"]) {
  assert(copy[language].noPairingTitle?.trim(), `${language} empty-state title is missing`);
  assert(copy[language].noPairingReason?.trim(), `${language} empty-state reason is missing`);
}

const empty = evaluate([], []);
assert(empty.ids.length === 0, "zero eligible journeys must produce an empty candidate list");
assert(empty.nextId === null, "zero eligible journeys must not invent a next candidate");

const discoveredOnlyJourney = evaluate(["iced-san-sebastian"]);
assert(
  JSON.stringify(discoveredOnlyJourney.ids) === JSON.stringify(["iced-san-sebastian"]),
  "the only eligible journey must remain reachable after it is marked discovered"
);

const syntheticJourneys = [
  { id: "confirmed-a", contexts: ["day:hot"] },
  { id: "confirmed-b", contexts: ["day:hot"] }
];
const secondSyntheticDiscovered = evaluate(["confirmed-b"], syntheticJourneys);
assert(
  JSON.stringify(secondSyntheticDiscovered.ids) === JSON.stringify(["confirmed-a", "confirmed-b"]),
  `unseen journeys must stay ahead of discovered journeys: ${secondSyntheticDiscovered.ids.join(", ")}`
);
assert(secondSyntheticDiscovered.nextId === "confirmed-b", "multi-journey rotation must still advance");

console.log(
  "✅ DISCOVER-ROTATION-001 verified fail-closed public eligibility, stable single-journey UX, and reusable multi-journey ordering."
);
