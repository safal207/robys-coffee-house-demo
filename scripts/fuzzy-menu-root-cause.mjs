import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// QA triage, not a root-cause oracle. Fuzzy memberships are explicitly
// heuristic priorities from reproducible evidence, NEVER probabilities.
export const clamp01 = n => Math.max(0, Math.min(1, n));
export const rising = (value, low, high) => {
  assert.ok(high > low && Number.isFinite(value), "Invalid fuzzy membership input");
  return clamp01((value - low) / (high - low));
};
export const falling = (value, low, high) => 1 - rising(value, low, high);
export const fuzzyAnd = (...values) => Math.min(...values);
export const fuzzyOr = (...values) => Math.max(...values);
const median = values => {
  assert.ok(values.length && values.every(Number.isFinite), "Expected finite numeric observations");
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};
const round = x => Math.round(x * 100) / 100;
const ASSERT = (v, label) => assert.ok(v, "Missing or invalid evidence: " + label);

export function analyzeFuzzyMenuEvidence(fcp, confirmation) {
  ASSERT(fcp?.schema === "robys.fcp-negative-control-lab.v1", "negative-control schema");
  ASSERT(confirmation?.schema === "robys.first-section-render-lab.confirmation.v1", "confirmation schema");
  ASSERT(Array.isArray(fcp.triplets) && Array.isArray(confirmation.pairs), "paired samples");
  const defaultTriplets = fcp.triplets.filter(x => x.route === "default");
  const categoryPairs = confirmation.pairs.filter(x => x.case === "category" &&
    x.mode === "default-list-only");
  const defaultPairs = confirmation.pairs.filter(x => x.case === "default" &&
    x.mode === "default-list-only");
  const searchTriplets = fcp.triplets.filter(x => x.route === "search");
  ASSERT(defaultTriplets.length >= 4, "default negative-control triplets");
  ASSERT(searchTriplets.length >= 2, "search negative-control triplets");
  ASSERT(categoryPairs.length >= 4, "category confirmation pairs");
  ASSERT(defaultPairs.length >= 4, "default confirmation pairs");
  const validTriple = x => [x.placeboFcpSpreadMs, x.stagedFcpPenaltyMs,
    x.stagedPhotoGainMs, x.stagedPreFcpLongTaskDeltaMs].every(Number.isFinite)
    && typeof x.stagedSlowerThanBoth === "boolean" && x.placeboFcpSpreadMs >= 0;
  const validPair = x => [x.photoGainMs,x.fcpPenaltyMs,x.extraImageRequests].every(Number.isFinite);
  ASSERT([...defaultTriplets, ...searchTriplets].every(validTriple), "finite attribution samples");
  ASSERT([...categoryPairs,...defaultPairs].every(validPair), "finite confirmation pairs");

  // Distinct observations are kept distinct; photo timestamps after forced
  // scrolling cannot be silently treated as passive LCP or FCP.
  const m = {
    defaultTriplets: defaultTriplets.length,
    searchTriplets: searchTriplets.length,
    categoryPairs: categoryPairs.length,
    placeboFcpSpreadMedianMs: median(defaultTriplets.map(x => x.placeboFcpSpreadMs)),
    placeboFcpSpreadMaxMs: Math.max(...defaultTriplets.map(x => x.placeboFcpSpreadMs)),
    candidateFcpDeltaMedianMs: median(defaultTriplets.map(x => x.stagedFcpPenaltyMs)),
    candidateFcpSlowerThanBothRate: defaultTriplets.filter(x => x.stagedSlowerThanBoth).length /
      defaultTriplets.length,
    candidateFcpOver100msRate: defaultTriplets.filter(x => x.stagedFcpPenaltyMs > 100).length /
      defaultTriplets.length,
    candidatePhotoGainMedianMs: median(defaultTriplets.map(x => x.stagedPhotoGainMs)),
    candidatePreFcpLongTaskDeltaMedianMs: median(defaultTriplets.map(x => x.stagedPreFcpLongTaskDeltaMs)),
    categorySlowdownMedianMs: -median(categoryPairs.map(x => x.photoGainMs)),
    categoryExtraImageRequestPairRate: categoryPairs.filter(x => x.extraImageRequests > 0).length /
      categoryPairs.length,
    categoryFcpSlowPairRate: categoryPairs.filter(x => x.fcpPenaltyMs > 0).length /
      categoryPairs.length,
    defaultPhotoFasterRate: defaultPairs.filter(x => x.photoGainMs > 0).length /
      defaultPairs.length
  };

  // The rules are pre-declared and transparent. Fuzzy severity is NOT
  // posterior probability, confidence interval, or confirmed defect.
  const memberships = {
    highPlaceboFcpJitter: rising(m.placeboFcpSpreadMedianMs, 40, 120),
    lowObservedCandidateFcpPenalty: falling(Math.max(0,m.candidateFcpDeltaMedianMs), 30, 110),
    candidateFcpRegressionSeverity: rising(m.candidateFcpDeltaMedianMs, 25, 110),
    candidateFrequentlySlowerThanBoth: rising(m.candidateFcpSlowerThanBothRate, 0.1, 0.65),
    lowPlaceboJitter: falling(m.placeboFcpSpreadMedianMs, 35, 110),
    highCategorySlowdown: rising(m.categorySlowdownMedianMs, 40, 190),
    repeatedCategoryImageRequestDelta: rising(m.categoryExtraImageRequestPairRate, 0.1, 0.5),
    repeatedDefaultPhotoGain: rising(m.defaultPhotoFasterRate, 0.4, 0.9),
    highDefaultPhotoGain: rising(m.candidatePhotoGainMedianMs, 25, 100),
    candidatePreFcpCpuIncrease: rising(m.candidatePreFcpLongTaskDeltaMedianMs, 10, 110)
  };
  const H = (id, activation, label, evidence, test, graph, warnings=[]) => ({
    id, label, priority: round(100*activation), activation: round(activation),
    evidence, nextTest: test, graphPath: graph, warnings
  });
  const hypotheses = [
    H("category-image-observation-window",
      fuzzyAnd(memberships.highCategorySlowdown, memberships.repeatedCategoryImageRequestDelta),
      "Окно наблюдения / lazy loading картинок в #desserts",
      "В парных снимках есть замедление первого фото и отличия числа стартовавших запросов",
      "Снять request/response/requestfinished по URL, ответам, размеру, cache и моменту снимка; дождаться одинакового момента покоя",
      ["hash #desserts","scroll/IntersectionObserver","image request timing","photo-ready snapshot"],
      ["Это приоритет проверки, а не доказательство повторной загрузки одного изображения"]),
    H("fcp-run-to-run-jitter",
      fuzzyAnd(memberships.highPlaceboFcpJitter,
        memberships.lowObservedCandidateFcpPenalty),
      "Нестабильность FCP между одинаковыми сборками",
      "Два контроля с одинаковыми байтами JS дают заметно разный FCP",
      "Повторить A/A/A без модификации JS; собрать trace загрузки CSS/JS и длинные задачи",
      ["network and scheduler","document / CSS / JS resources","FCP paint"],
      ["Не означает, что оптимизация безвредна"]),
    H("staged-render-fcp-regression",
      fuzzyAnd(memberships.candidateFcpRegressionSeverity,
        memberships.candidateFrequentlySlowerThanBoth,
        memberships.lowPlaceboJitter),
      "Непосредственная регрессия FCP от поэтапного рендера",
      "Проверяем остаточное замедление сверх колебаний одинаковых контролей",
      "Сравнить staged/control при фиксированных локальных ресурсах, нескольких чередованиях порядка и trace main thread",
      ["renderMenu stage","main-thread long tasks","first paint"],
      ["Низкий score означает слабое подтверждение по этим данным, не исключение регрессии"]),
    H("staged-render-cpu-contention",
      fuzzyAnd(memberships.candidateFcpRegressionSeverity,
        memberships.candidatePreFcpCpuIncrease),
      "Дополнительная блокировка главного потока до FCP",
      "Оцениваем сочетание FCP penalty с приростом pre-FCP Long Tasks",
      "Снять Performance trace с function attribution и проверить синхронный вызов createCategory",
      ["createCategory","main-thread tasks","FCP"],
      ["PerformanceObserver longtask не указывает функцию-источник"])
  ].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));

  const report = {
    schema: "robys.menu-fuzzy-root-cause-triage.v1",
    scope: "test-only staged rendering vs published JS, PR #521",
    methodology: "Fuzzy IF–THEN memberships (min as AND), repeated-sample statistics, causal dependency graph",
    probabilityClaim: false, productionApproved: false,
    membershipScales: {
      highPlaceboFcpJitter: "linear 40–120 ms",
      lowObservedCandidateFcpPenalty: "falling 30–110 ms positive FCP penalty",
      highCategorySlowdown: "linear 40–190 ms",
      repeatedCategoryImageRequestDelta: "linear 10–50% of paired runs",
      candidateFrequentlySlowerThanBoth: "linear 10–65% of triplets",
      lowPlaceboJitter: "falling 35–110 ms",
      cpuIncrease: "linear 10–110 ms"
    },
    measurements: Object.fromEntries(Object.entries(m).map(([k,v])=>[k,round(v)])),
    memberships: Object.fromEntries(Object.entries(memberships).map(([k,v])=>[k,round(v)])),
    rankedHypotheses: hypotheses,
    interpretation: "Priority scores rank the next diagnostic experiments; they are NOT failure probabilities or proof of root cause.",
    constraints: ["Keep PR Draft / NO SHIP", "Do not raise FCP budget", "No production runtime modifications",
      "The category count reflects observed request starts at a timing-sensitive snapshot"],
    nextAction: hypotheses[0]?.nextTest ?? null
  };
  return report;
}

// Keep local-resource experiment evidence separate from GitHub Pages evidence.
// Its priorities are heuristics, not probabilistic estimates or a release gate.
export function analyzeLocalFixedFcpEvidence(local) {
  ASSERT(local?.schema === "robys.local-fixed-asset-fcp.v1",
    "local fixed-resource report schema");
  ASSERT(local.synthetic === true && local.shipApproved === false,
    "local report must explicitly disallow shipping");
  ASSERT(typeof local.originalRuntimeSHA256 === "string" &&
    /^[0-9a-f]{64}$/.test(local.originalRuntimeSHA256) &&
    /^[0-9a-f]{64}$/.test(local.candidateRuntimeSHA256) &&
    local.originalRuntimeSHA256 !== local.candidateRuntimeSHA256,
    "local candidate/control source hashes");
  ASSERT(Array.isArray(local.triplets) && Array.isArray(local.samples),
    "local triplets and paint/resource samples");
  const profiles = ["loopback", "loopback-throttled"];
  const categories = ["A/A/A", "A/B/A"];
  const medianSpan = rows => median(rows.map(x => Math.max(...x) - Math.min(...x)));
  const evidence = profiles.map(profile => {
    const control = local.triplets.filter(x => x.profile === profile && x.block === "A/A/A");
    const staged = local.triplets.filter(x => x.profile === profile && x.block === "A/B/A");
    ASSERT(control.length >= 4 && staged.length >= 4 &&
      control.length === staged.length, "local complete triple profile: " + profile);
    const validateTriple = t => Array.isArray(t.fcpMs) && t.fcpMs.length === 3 &&
      t.fcpMs.every(Number.isFinite) &&
      Number.isFinite(t.rangeFcpMs) && t.rangeFcpMs >= 0 &&
      Number.isFinite(t.bracketFcpSpreadMs) && t.bracketFcpSpreadMs >= 0 &&
      t.rangeFcpMs === Math.max(...t.fcpMs) - Math.min(...t.fcpMs) &&
      t.bracketFcpSpreadMs === Math.abs(t.fcpMs[0] - t.fcpMs[2]) &&
      (t.block === "A/A/A" ?
        t.candidateFcpPenaltyMs === null && t.candidateSlowerThanBoth === null :
        Number.isFinite(t.candidateFcpPenaltyMs) &&
        typeof t.candidateSlowerThanBoth === "boolean" &&
        t.candidateFcpPenaltyMs === t.fcpMs[1] - (t.fcpMs[0] + t.fcpMs[2]) / 2 &&
        t.candidateSlowerThanBoth ===
          (t.fcpMs[1] > Math.max(t.fcpMs[0], t.fcpMs[2])));
    ASSERT([...control, ...staged].every(validateTriple),
      "local FCP triple math and flags: " + profile);
    const samples = local.samples.filter(x => x.profile === profile &&
      x.block === "A/A/A");
    ASSERT(samples.length === control.length * 3,
      "local identical-code samples complete: " + profile);
    const cssGapSpans = control.map(t => {
      const rows = samples.filter(x => x.pair === t.pair);
      ASSERT(rows.length === 3 && rows.map(x => x.mode).sort().join(",") === "A1,A2,A3",
        "matched local control samples: " + profile + "/" + t.pair);
      const fcpGaps = rows.map(x => x.passive?.fcpMs - x.passive?.cssEndMs);
      const cssTimes = rows.map(x => x.passive?.cssEndMs);
      ASSERT(fcpGaps.every(Number.isFinite) && cssTimes.every(Number.isFinite) &&
        rows.every(x => Number.isFinite(x.passive?.jsEndMs) &&
          Number.isFinite(x.passive?.documentResponseEndMs)),
        "finite local CSS and JS milestones: " + profile + "/" + t.pair);
      ASSERT(rows.every(x => t.fcpMs.includes(x.passive.fcpMs)),
        "local matched control FCP observations: " + profile + "/" + t.pair);
      return {postCssSpanMs: Math.max(...fcpGaps) - Math.min(...fcpGaps),
        cssResponseSpanMs: Math.max(...cssTimes) - Math.min(...cssTimes)};
    });
    return {
      profile,triplesPerBlock:control.length,
      placeboFcpRangeMedianMs:median(control.map(x => x.rangeFcpMs)),
      placeboFcpRangeMaxMs:Math.max(...control.map(x => x.rangeFcpMs)),
      placeboPostCssSpanMedianMs:median(cssGapSpans.map(x => x.postCssSpanMs)),
      placeboCssEndSpanMedianMs:median(cssGapSpans.map(x => x.cssResponseSpanMs)),
      candidateFcpPenaltyMedianMs:median(staged.map(x => x.candidateFcpPenaltyMs)),
      candidateSlowerThanBothPairs:staged.filter(x => x.candidateSlowerThanBoth).length,
      candidateSlowerThanBothRate:staged.filter(x => x.candidateSlowerThanBoth).length / staged.length
    };
  });
  const regular=evidence.find(x=>x.profile==="loopback");
  const slow=evidence.find(x=>x.profile==="loopback-throttled");
  const rank = (id, label, activation, nextTest, warning) => ({
    id,label,priority:round(100*activation),
    nextTest,warning,source:"local-fixed-resource experiment"
  });
  const hypotheses = [
    rank("local-post-css-fcp-jitter",
      "Разброс FCP после завершения CSS у идентичных сборок",
      fuzzyAnd(
        rising(slow.placeboFcpRangeMedianMs, 40, 180),
        rising(slow.placeboPostCssSpanMedianMs, 40, 180),
        falling(slow.placeboCssEndSpanMedianMs, 25, 100)),
      "Снять Chrome tracing: frame commits, Blink layout/paint, renderer main thread и CSS completion в трёх идентичных загрузках",
      "CSS responseEnd — не готовность CSSOM, не завершение layout и не доказательство бага Chromium"),
    rank("local-throttled-candidate-fcp-regression",
      "Замедление FCP кандидата при эмуляции медленной сети",
      fuzzyAnd(
        rising(Math.max(0,slow.candidateFcpPenaltyMedianMs), 10, 100),
        rising(slow.candidateSlowerThanBothRate, 0.1, 0.5)),
      "Проверить trace FCP с фиксированным порядком ресурсов и чередованием кандидата, повторив больше пар",
      "Четыре тройки недостаточны для устойчивой оценки эффекта"),
    rank("local-network-emulation-amplifies-jitter",
      "Разброс одинаковых сборок усиливается при сетевой эмуляции",
      fuzzyAnd(
        rising(slow.placeboFcpRangeMedianMs-regular.placeboFcpRangeMedianMs, 30, 150),
        rising(slow.placeboFcpRangeMedianMs, 40, 180)),
      "Сравнить trace эмулятора сети и времена готовности к первому кадру, не смешивая с удалёнными данными",
      "Эмуляция влияет не только на скорость сети; локальный опыт остаётся синтетическим")
  ].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  return {
    schema:"robys.local-fixed-fcp-fuzzy-triage.v1",
    source:"local-fixed-fcp-controls same-run JSON artifact",
    synthetic:true,productionApproved:false,probabilityClaim:false,
    summary:evidence.map(x=>Object.fromEntries(
      Object.entries(x).map(([key,value])=>[key,typeof value==="number"?round(value):value]))),
    rankedHypotheses:hypotheses,
    interpretation:"Independent local QA priorities, not probabilities; do not replace or suppress these results with remote-only scores.",
    nextAction:hypotheses[0]?.nextTest??null
  };
}

function main() {
  const [fcpPath, confirmationPath, outPath = ".artifacts/menu-first-photo-experiment/fuzzy-root-cause-triage.json", localPath] = process.argv.slice(2);
  assert.ok(fcpPath && confirmationPath, "Usage: fuzzy-menu-root-cause.mjs <fcp-json> <confirmation-json> [output] [local-fixed-json]");
  const fcp = JSON.parse(readFileSync(fcpPath,"utf8"));
  const confirmation = JSON.parse(readFileSync(confirmationPath,"utf8"));
  const report = analyzeFuzzyMenuEvidence(fcp, confirmation);
  if (localPath) report.localFixedResourceEvidence = analyzeLocalFixedFcpEvidence(
    JSON.parse(readFileSync(localPath,"utf8")));
  mkdirSync(dirname(outPath), {recursive:true});
  writeFileSync(outPath, JSON.stringify(report,null,2)+"\n");
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## Fuzzy QA — ranked investigation targets (NOT probabilities)\n\n"+
    "| Rank | Hypothesis | Priority / 100 | First verification |\n|---|---|---:|---|\n"+
    report.rankedHypotheses.map((x,i)=>"| "+(i+1)+" | "+x.label+" | "+x.priority+" | "+x.nextTest.replace(/\|/g,"/")+" |").join("\n")+
    "\n\nNo source code deployment; scores are expert-defined fuzzy test priority, not defect likelihood.\n");
  if (report.localFixedResourceEvidence) {
    const local=report.localFixedResourceEvidence;
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "\n\n## Local fixed-asset fuzzy priorities (independent of remote scores)\n\n"+
      "| Hypothesis | Priority / 100 | Verification |\n|---|---:|---|\n"+
      local.rankedHypotheses.map(x=>"| "+x.label+" | "+x.priority+" | "+x.nextTest.replace(/\\|/g,"/")+" |").join("\n")+
      "\n\nSource: local A/A/A and A/B/A, two profiles. Scores are not probabilities. NO SHIP.\n");
    console.log("FUZZY_MENU_LOCAL " + JSON.stringify({
      measurements:local.summary, ranked:local.rankedHypotheses.map(x=>({id:x.id,priority:x.priority,nextTest:x.nextTest}))
    }));
  }
  console.log("FUZZY_MENU_TRIAGE " + JSON.stringify({
    measurements: report.measurements, ranked: report.rankedHypotheses.map(x=>({
      id:x.id, priority:x.priority,nextTest:x.nextTest
    }))
  }));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error); process.exitCode=1; }
}
