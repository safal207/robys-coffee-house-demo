from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(source: str, needle: str, replacement: str, label: str) -> str:
    count = source.count(needle)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return source.replace(needle, replacement, 1)


def replace_section(source: str, start: str, end: str, replacement: str, label: str) -> str:
    start_at = source.find(start)
    if start_at < 0:
        raise RuntimeError(f"{label}: start anchor missing")
    end_at = source.find(end, start_at + len(start))
    if end_at < 0:
        raise RuntimeError(f"{label}: end anchor missing")
    return source[:start_at] + replacement + source[end_at + len(end):]


verifier = read("scripts/verify-liminalqa-evidence.mjs")
verifier = replace_once(
    verifier,
    '  eq(test.run_count, test.name === "lighthouse-repeatability" ? 12 : 1, `${test.name} run count`);',
    '  eq(test.run_count, test.name === "lighthouse-repeatability" ? 24 : 1, `${test.name} run count`);',
    "Lighthouse signal run count",
)

old_start = 'eq(JSON.stringify(report.profiles.map((profile) => profile.profile).sort()), JSON.stringify(["desktop", "mobile"]), "profile set");\n\nconst qualityProfiles = report.profiles.map((profile) => {'
old_end = 'eq(report.overallVerdict, overall, "overall Lighthouse verdict");'
new_block = '''eq(JSON.stringify(report.profiles.map((profile) => profile.profile).sort()), JSON.stringify(["desktop", "mobile"]), "home profile set");
if (!Array.isArray(report.experienceProfiles)) fail("Missing experience Lighthouse profiles");
eq(JSON.stringify(report.experienceProfiles.map((profile) => profile.profile).sort()), JSON.stringify(["desktop", "mobile"]), "experience profile set");

function lighthouseRoute(finalUrl) {
  let pathname;
  try { pathname = new URL(finalUrl).pathname; }
  catch { fail(`Invalid Lighthouse URL: ${JSON.stringify(finalUrl)}`); }
  if (pathname === "/experience/" || pathname === "/experience/index.html") return "experience";
  if (pathname === "/" || pathname === "/index.html") return "home";
  fail(`Unexpected Lighthouse route: ${JSON.stringify(finalUrl)}`);
}

function verifyLighthouseRoute(profile, route, allRuns, budgets) {
  requireBudgets(profile.profile, budgets);
  eq(profile.route, route, `${profile.profile}/${route} route binding`);
  const routeRuns = allRuns.filter((run) => lighthouseRoute(run.finalUrl) === route)
    .sort((left, right) => left.fetchTimestamp - right.fetchTimestamp || left.source.localeCompare(right.source))
    .map((run, index) => ({ ...run, ordinal: index + 1 }));
  eq(routeRuns.length, 7, `${profile.profile}/${route} raw run count`);
  eq(profile.warmupRuns.length, 1, `${profile.profile}/${route} warm-up count`);
  eq(profile.runs.length, 6, `${profile.profile}/${route} measured count`);
  eq(profile.runCount, 6, `${profile.profile}/${route} reported count`);
  const warmup = routeRuns[0];
  const measured = routeRuns.slice(1);
  eq(profile.warmupRuns[0].source, warmup.source, `${profile.profile}/${route} warm-up source binding`);
  eq(profile.warmupRuns[0].fetchTime, warmup.fetchTime, `${profile.profile}/${route} warm-up time binding`);
  eq(profile.warmupRuns[0].ordinal, warmup.ordinal, `${profile.profile}/${route} warm-up ordinal binding`);
  const reportedMeasuredOrder = profile.runs.map(({ source, fetchTime, ordinal }) => ({ source, fetchTime, ordinal }));
  const recomputedMeasuredOrder = measured.map(({ source, fetchTime, ordinal }) => ({ source, fetchTime, ordinal }));
  eq(JSON.stringify(reportedMeasuredOrder), JSON.stringify(recomputedMeasuredOrder), `${profile.profile}/${route} measured chronological binding`);
  const metrics = {
    performance: stats(measured.map((run) => run.performance)), lcp: stats(measured.map((run) => run.lcp)),
    tbt: stats(measured.map((run) => run.tbt)), cls: stats(measured.map((run) => run.cls)),
    fcp: stats(measured.map((run) => run.fcp)), speedIndex: stats(measured.map((run) => run.speedIndex)),
    interactive: stats(measured.map((run) => run.interactive))
  };
  for (const [metric, values] of Object.entries(metrics)) {
    for (const [name, value] of Object.entries(values)) almost(profile.metrics[metric][name], value, `${profile.profile}/${route}.${metric}.${name}`);
  }
  const recomputed = classify(profile.profile, metrics, budgets);
  eq(profile.verdict, recomputed.verdict, `${profile.profile}/${route} verdict`);
  eq(JSON.stringify(profile.budgetBreaches), JSON.stringify(recomputed.breaches), `${profile.profile}/${route} breaches`);
  eq(JSON.stringify(profile.instabilityReasons), JSON.stringify(recomputed.instability), `${profile.profile}/${route} instability`);
  return {
    profile: profile.profile, route, warmupRuns: 1, measuredRuns: 6, uniqueRawHashes: 7,
    warmup: { source: warmup.source, fetchTime: warmup.fetchTime, ordinal: warmup.ordinal, performance: warmup.performance, lcp: warmup.lcp, tbt: warmup.tbt },
    verdict: recomputed.verdict,
    medians: Object.fromEntries(Object.entries(metrics).map(([name, value]) => [name, value.median]))
  };
}

const qualityProfiles = ["desktop", "mobile"].flatMap((profileName) => {
  const homeProfile = report.profiles.find((profile) => profile.profile === profileName);
  const experienceProfile = report.experienceProfiles.find((profile) => profile.profile === profileName);
  if (!homeProfile || !experienceProfile) fail(`${profileName}: missing home or experience profile`);
  const prefix = `lighthouse-raw/${profileName}/raw/`;
  const rawPaths = [...byPath.keys()].filter((candidate) => candidate.startsWith(prefix) && candidate.endsWith(".json"));
  eq(rawPaths.length, 14, `${profileName} total raw run count`);
  unique(rawPaths.map((relative) => byPath.get(relative).sha256), `${profileName} raw SHA values`);
  const allRuns = rawPaths.map(runFrom);
  return [
    verifyLighthouseRoute(homeProfile, "home", allRuns, budgets),
    verifyLighthouseRoute(experienceProfile, "experience", allRuns, budgets)
  ];
});
const overall = qualityProfiles.some((profile) => profile.verdict === "new_bug") ? "new_bug"
  : qualityProfiles.some((profile) => profile.verdict === "flake") ? "flake" : "stable";
eq(report.overallVerdict, overall, "overall Lighthouse verdict");'''
verifier = replace_section(verifier, old_start, old_end, new_block, "fresh-runner Lighthouse verification")
write("scripts/verify-liminalqa-evidence.mjs", verifier)

runner = read("scripts/run-lighthouse-repeatability.mjs")
old_markdown = '''  const markdown = `# Lighthouse repeatability — Roby's\n\n- Tested commit: \`${testedCommit}\`\n- Source run: \`${sourceRunId}\`\n- Verdict: **${overallVerdict}**\n- Warm-up policy: first chronological run per profile is retained as cold-start evidence and excluded from steady-state statistics.\n- Generated: ${generatedAt}\n\n| Profile | Warm-up | Measured | Verdict | Performance | LCP | TBT | Interactive |\n|---|---:|---:|---|---:|---:|---:|---:|\n${profiles.map((profile) => `| ${profile.profile} | ${profile.warmupRuns.length} | ${profile.runCount} | ${profile.verdict} | ${formatMetric(profile.metrics.performance, 1)} | ${formatMetric(profile.metrics.lcp)} ms | ${formatMetric(profile.metrics.tbt)} ms | ${formatMetric(profile.metrics.interactive)} ms |`).join("\n")}\n\n## Classification\n\n${profiles.map((profile) => `### ${profile.profile}\n\n- Warm-up source: ${profile.warmupRuns.map((run) => `\`${run.source}\` at \`${run.fetchTime}\``).join(", ")}\n- Budget breaches: ${profile.budgetBreaches.length ? profile.budgetBreaches.join("; ") : "none"}\n- Instability: ${profile.instabilityReasons.length ? profile.instabilityReasons.join("; ") : "none"}`).join("\n\n")}\n\nThis report classifies six steady-state exact-head measurements per profile while retaining the first cold-start run as explicit warm-up evidence. A median budget breach is a \`new_bug\`; excessive measured-run spread without a median breach is a \`flake\`.\n`;
  writeFileSync(path.join(outputRoot, "report.md"), markdown, "utf8");
  console.log(JSON.stringify({ testedCommit, sourceRunId, overallVerdict, profiles: profiles.map(({ profile, warmupRuns, runCount, verdict, budgetBreaches, instabilityReasons }) => ({ profile, warmupRuns: warmupRuns.length, runCount, verdict, budgetBreaches, instabilityReasons })) }, null, 2));'''
new_markdown = '''  const markdownProfiles = [...profiles, ...experienceProfiles];
  const markdown = `# Lighthouse repeatability — Roby's\n\n- Tested commit: \`${testedCommit}\`\n- Source run: \`${sourceRunId}\`\n- Verdict: **${overallVerdict}**\n- Warm-up policy: first chronological run per profile and route is retained as cold-start evidence and excluded from steady-state statistics.\n- Generated: ${generatedAt}\n\n| Profile | Route | Warm-up | Measured | Verdict | Performance | LCP | TBT | Interactive |\n|---|---|---:|---:|---|---:|---:|---:|---:|\n${markdownProfiles.map((profile) => `| ${profile.profile} | ${profile.route} | ${profile.warmupRuns.length} | ${profile.runCount} | ${profile.verdict} | ${formatMetric(profile.metrics.performance, 1)} | ${formatMetric(profile.metrics.lcp)} ms | ${formatMetric(profile.metrics.tbt)} ms | ${formatMetric(profile.metrics.interactive)} ms |`).join("\n")}\n\n## Classification\n\n${markdownProfiles.map((profile) => `### ${profile.profile} / ${profile.route}\n\n- Warm-up source: ${profile.warmupRuns.map((run) => `\`${run.source}\` at \`${run.fetchTime}\``).join(", ")}\n- Budget breaches: ${profile.budgetBreaches.length ? profile.budgetBreaches.join("; ") : "none"}\n- Instability: ${profile.instabilityReasons.length ? profile.instabilityReasons.join("; ") : "none"}`).join("\n\n")}\n\nThis report classifies six steady-state exact-head measurements per profile and route while retaining the first cold-start run as explicit warm-up evidence. A median budget breach is a \`new_bug\`; excessive measured-run spread without a median breach is a \`flake\`.\n`;
  writeFileSync(path.join(outputRoot, "report.md"), markdown, "utf8");
  console.log(JSON.stringify({ testedCommit, sourceRunId, overallVerdict, profiles: markdownProfiles.map(({ profile, route, warmupRuns, runCount, verdict, budgetBreaches, instabilityReasons }) => ({ profile, route, warmupRuns: warmupRuns.length, runCount, verdict, budgetBreaches, instabilityReasons })) }, null, 2));'''
runner = replace_once(runner, old_markdown, new_markdown, "route-aware Lighthouse Markdown report")
write("scripts/run-lighthouse-repeatability.mjs", runner)

print("Patched fresh-runner verifier for 24 measured Lighthouse runs and rendered home/experience profiles in report.md.")
