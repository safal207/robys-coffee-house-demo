import { readFileSync } from "node:fs";
import vm from "node:vm";

const fail = (message) => {
  throw new Error(`DISCOVER-ROTATION-001: ${message}`);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const runtime = readFileSync("discover-v2.js", "utf8");
const chooseStart = runtime.indexOf("function choose(){");
const chooseEnd = runtime.indexOf("\nfunction renderJourney", chooseStart);

assert(chooseStart >= 0 && chooseEnd > chooseStart, "could not isolate choose() from discover-v2.js");

const chooseSource = runtime.slice(chooseStart, chooseEnd);
const journeys = [
  { id: "cool-lime-macaron", contexts: ["day:hot"] },
  { id: "iced-san-sebastian", contexts: ["day:hot"] }
];

function evaluate(discoveredIds) {
  const context = { result: null };
  const source = `
    let time = "day";
    let weather = "hot";
    const journeys = ${JSON.stringify(journeys)};
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
  JSON.stringify(fresh.ids) === JSON.stringify(["cool-lime-macaron", "iced-san-sebastian"]),
  `fresh rotation order changed: ${fresh.ids.join(", ")}`
);
assert(fresh.candidateIndex === 0, "fresh rotation must reset candidateIndex to zero");
assert(fresh.nextId === "iced-san-sebastian", "fresh rotation cannot advance to the other pairing");

const coolLimeDiscovered = evaluate(["cool-lime-macaron"]);
assert(
  JSON.stringify(coolLimeDiscovered.ids) === JSON.stringify(["iced-san-sebastian", "cool-lime-macaron"]),
  `discovered pair must remain after unseen pair: ${coolLimeDiscovered.ids.join(", ")}`
);
assert(
  coolLimeDiscovered.nextId === "cool-lime-macaron",
  "another-pairing action must still reach a previously discovered pairing"
);

const icedDiscovered = evaluate(["iced-san-sebastian"]);
assert(
  JSON.stringify(icedDiscovered.ids) === JSON.stringify(["cool-lime-macaron", "iced-san-sebastian"]),
  `unseen pair must remain first without collapsing the rotation: ${icedDiscovered.ids.join(", ")}`
);
assert(
  icedDiscovered.nextId === "iced-san-sebastian",
  "another-pairing action must rotate when the second pairing is already discovered"
);

const allDiscovered = evaluate(["cool-lime-macaron", "iced-san-sebastian"]);
assert(allDiscovered.ids.length === 2, "all-discovered state must retain both active pairings");
assert(allDiscovered.nextId !== allDiscovered.ids[0], "all-discovered state must still rotate");

console.log("✅ DISCOVER-ROTATION-001 verified that unseen pairings stay first while discovered pairings remain reachable through the another-pairing action.");
