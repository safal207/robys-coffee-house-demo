import test from "node:test";
import assert from "node:assert/strict";
import { compareTriple } from "./experiment-menu-local-fixed-fcp.mjs";

const base={
  profile:"loopback",pair:1,
  passive:{fcpMs:760,documentResponseEndMs:15,jsEndMs:85,cssEndMs:35,
    preFcpLongTaskMs:130,ids:["pairing-offers:x","desserts:y"],
    sections:["pairing-offers","desserts"],viewport:"390x844",scrollY:0},
  bundleSha256:"original"
};
const sample=(mode,fcpMs,bundleSha256="original")=>({
  ...base,mode,bundleSha256,
  passive:{...base.passive,fcpMs}
});
test("A/A/A is identical JS and reports ordinary FCP spread without a candidate",()=>{
  const group=[sample("A1",760),sample("A2",920),sample("A3",780)];
  const x=compareTriple(group,{id:"A/A/A"});
  assert.equal(x.rangeFcpMs,160);
  assert.equal(x.bracketFcpSpreadMs,20);
  assert.equal(x.candidateFcpPenaltyMs,null);
  assert.equal(x.candidateSlowerThanBoth,null);
});
test("A/B/A compares guarded FCP to surrounding identical controls",()=>{
  const x=compareTriple([
    sample("A1",760),sample("B",850,"candidate"),sample("A3",780)
  ],{id:"A/B/A"});
  assert.equal(x.candidateFcpPenaltyMs,80);
  assert.equal(x.candidateSlowerThanBoth,true);
});
test("A/A/A rejects non-identical control bytes",()=>{
  assert.throws(()=>compareTriple([
    sample("A1",760),sample("A2",900,"mutated"),sample("A3",780)
  ],{id:"A/A/A"}),/Expected values to be strictly equal/);
});
test("A/B/A rejects mistaken original JS and catalog mismatches",()=>{
  assert.throws(()=>compareTriple([
    sample("A1",760),sample("B",850),sample("A3",780)
  ],{id:"A/B/A"}),/Expected "actual" to be strictly unequal/);
  const mutated=sample("B",850,"candidate");
  mutated.passive.ids=["changed"];
  assert.throws(()=>compareTriple([
    sample("A1",760),mutated,sample("A3",780)
  ],{id:"A/B/A"}),/Product order changed/);
});
