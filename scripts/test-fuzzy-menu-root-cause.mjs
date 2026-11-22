import test from "node:test";
import assert from "node:assert/strict";
import { rising, falling, fuzzyAnd, fuzzyOr, analyzeFuzzyMenuEvidence, analyzeLocalFixedFcpEvidence } from "./fuzzy-menu-root-cause.mjs";

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


function fakeLocalReport({slowNoise=200,fastNoise=16,slowPenalties=[100,100,-6,-6]}={}) {
  const triplets=[],samples=[];
  for(const profile of ["loopback","loopback-throttled"]) {
    const slow=profile==="loopback-throttled";
    const base=slow?1660:300,css=slow?1582:42,span=slow?slowNoise:fastNoise;
    for(let pair=1;pair<=4;pair++) {
      const placebo=[base,base+span,base];
      const candidate=slow?[base,base+slowPenalties[pair-1],base]:[base,base-78,base];
      for(const [block,fcps] of [["A/A/A",placebo],["A/B/A",candidate]]) {
        const delta=fcps[1]-(fcps[0]+fcps[2])/2;
        triplets.push({profile,block,pair,fcpMs:fcps,
          rangeFcpMs:Math.max(...fcps)-Math.min(...fcps),
          bracketFcpSpreadMs:Math.abs(fcps[0]-fcps[2]),
          candidateFcpPenaltyMs:block==="A/B/A"?delta:null,
          candidateSlowerThanBoth:block==="A/B/A"?fcps[1]>Math.max(fcps[0],fcps[2]):null});
        if(block==="A/A/A") {
          ["A1","A2","A3"].forEach((mode,i)=>samples.push({profile,block,pair,mode,
            passive:{fcpMs:fcps[i],cssEndMs:css+(i===1?2:0),jsEndMs:slow?900:26,
              documentResponseEndMs:slow?246:6}}));
        }
      }
    }
  }
  return {schema:"robys.local-fixed-asset-fcp.v1",synthetic:true,
    shipApproved:false,originalRuntimeSHA256:"a".repeat(64),
    candidateRuntimeSHA256:"b".repeat(64),triplets,samples};
}
test("Local fixed-resource FCP risk remains visible even when all remote priorities are zero",()=>{
  const [remote,confirmation]=fakeReports({
    jitter:20,penalty:-76,cpu:-65,extra:0,categorySlow:-17,slower:0
  });
  const old=analyzeFuzzyMenuEvidence(remote,confirmation);
  assert.ok(old.rankedHypotheses.every(x=>x.priority===0));
  const local=analyzeLocalFixedFcpEvidence(fakeLocalReport());
  assert.equal(local.schema,"robys.local-fixed-fcp-fuzzy-triage.v1");
  assert.equal(local.productionApproved,false);
  assert.equal(local.probabilityClaim,false);
  assert.equal(local.summary.find(x=>x.profile==="loopback-throttled").placeboFcpRangeMedianMs,200);
  assert.equal(local.summary.find(x=>x.profile==="loopback").placeboFcpRangeMedianMs,16);
  assert.equal(local.summary.find(x=>x.profile==="loopback-throttled").candidateFcpPenaltyMedianMs,47);
  assert.equal(local.summary.find(x=>x.profile==="loopback-throttled").candidateSlowerThanBothPairs,2);
  assert.equal(local.rankedHypotheses[0].id,"local-network-emulation-amplifies-jitter");
  assert.ok(local.rankedHypotheses.find(x=>x.id==="local-post-css-fcp-jitter").priority>=95);
  assert.ok(local.rankedHypotheses.find(x=>x.id==="local-throttled-candidate-fcp-regression").priority>35);
});
test("Local fixed-resource evidence fails closed on manipulated/missing controls",()=>{
  const ok=fakeLocalReport();
  const invalid=structuredClone(ok);
  invalid.triplets[0].rangeFcpMs++;
  assert.throws(()=>analyzeLocalFixedFcpEvidence(invalid),/local FCP triple math/);
  const missing=structuredClone(ok);
  missing.samples=missing.samples.slice(1);
  assert.throws(()=>analyzeLocalFixedFcpEvidence(missing),/local identical-code samples/);
  const wrongSha=structuredClone(ok);
  wrongSha.candidateRuntimeSHA256=wrongSha.originalRuntimeSHA256;
  assert.throws(()=>analyzeLocalFixedFcpEvidence(wrongSha),/candidate\/control source hashes/);
  const missingCss=structuredClone(ok);
  missingCss.samples[0].passive.cssEndMs=null;
  assert.throws(()=>analyzeLocalFixedFcpEvidence(missingCss),/finite local CSS and JS milestones/);
});
