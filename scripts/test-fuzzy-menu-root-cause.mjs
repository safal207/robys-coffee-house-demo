import test from "node:test";
import assert from "node:assert/strict";
import { rising, falling, fuzzyAnd, fuzzyOr, analyzeFuzzyMenuEvidence } from "./fuzzy-menu-root-cause.mjs";

function fakeReports({jitter=116, penalty=18, cpu=-56, photo=104,
  extra=4, categorySlow=195, slower=3}={}) {
  return [
    {schema:"robys.fcp-negative-control-lab.v1",
      triplets:[
        ...Array.from({length:8},(_,i)=>({
          route:"default",pair:i+1,placeboFcpSpreadMs:jitter,
          stagedFcpPenaltyMs:penalty,stagedPhotoGainMs:photo,
          stagedPreFcpLongTaskDeltaMs:cpu,stagedSlowerThanBoth:i<slower
        })),
        ...Array.from({length:4},(_,i)=>({
          route:"search",pair:i+1,placeboFcpSpreadMs:jitter,
          stagedFcpPenaltyMs:penalty,stagedPhotoGainMs:photo,
          stagedPreFcpLongTaskDeltaMs:cpu,stagedSlowerThanBoth:i<slower
        }))
      ]},
    {schema:"robys.first-section-render-lab.confirmation.v1",
      pairs:[
        ...Array.from({length:8},(_,i)=>({
          case:"category",mode:"default-list-only",pair:i+1,
          photoGainMs:-categorySlow,fcpPenaltyMs:10,
          extraImageRequests:i<extra?1:0
        })),
        ...Array.from({length:8},(_,i)=>({
          case:"default",mode:"default-list-only",pair:i+1,
          photoGainMs:photo,fcpPenaltyMs:18,extraImageRequests:0
        }))
      ]}
  ];
}
test("Memberships are bounded and monotonic", () => {
  assert.equal(rising(20,40,120),0);
  assert.equal(rising(120,40,120),1);
  assert.equal(falling(120,40,120),0);
  assert.equal(falling(20,40,120),1);
  assert.equal(fuzzyAnd(1,0.4,0.8),0.4);
  assert.equal(fuzzyOr(0.1,0.8,0.3),0.8);
  assert.throws(()=>rising(NaN,1,2));
});
test("Noisy baseline + category request differences prioritize the next discriminating checks", ()=>{
  const [a,b]=fakeReports();
  const result=analyzeFuzzyMenuEvidence(a,b);
  const names=result.rankedHypotheses.map(x=>x.id);
  assert.equal(names[0],"category-image-observation-window");
  assert.equal(names[1],"fcp-run-to-run-jitter");
  assert.ok(result.rankedHypotheses.find(x=>x.id==="staged-render-fcp-regression").priority<20);
  assert.equal(result.measurements.categoryExtraImageRequestPairRate,0.5);
  assert.equal(result.measurements.placeboFcpSpreadMedianMs,116);
  assert.equal(result.productionApproved,false);
  assert.equal(result.probabilityClaim,false);
});
test("Persistent candidate slowdown with stable placebo raises staged-render investigation priority",()=>{
  const [a,b]=fakeReports({jitter:5,penalty:130,slower:8,cpu:85,extra:0,categorySlow:0});
  const ranked=analyzeFuzzyMenuEvidence(a,b).rankedHypotheses;
  assert.equal(ranked[0].id,"staged-render-fcp-regression");
  assert.equal(ranked[0].priority,100);
  assert.ok(ranked.find(x=>x.id==="fcp-run-to-run-jitter").priority<10);
});
test("Do not fabricate conclusions from empty, malformed or missing evidence",()=>{
  const [fcp,confirmation]=fakeReports();
  assert.throws(()=>analyzeFuzzyMenuEvidence({...fcp,triplets:[]},confirmation),/Missing or invalid evidence/);
  assert.throws(()=>analyzeFuzzyMenuEvidence(fcp,{...confirmation,schema:"wrong"}),/Missing or invalid evidence/);
  const corrupt=structuredClone(fcp);
  corrupt.triplets[0].stagedFcpPenaltyMs=NaN;
  assert.throws(()=>analyzeFuzzyMenuEvidence(corrupt,confirmation),/Missing or invalid evidence/);
});
