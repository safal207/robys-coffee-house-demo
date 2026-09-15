from pathlib import Path

path = Path("scripts/run-lighthouse-repeatability.mjs")
source = path.read_text(encoding="utf-8")
start_marker = "  const markdown = `# Lighthouse repeatability — Roby's"
end_marker = "}\n\nassertExactCommit(testedCommit);"
start = source.find(start_marker)
end = source.find(end_marker, start + len(start_marker))
if start < 0 or end < 0:
    raise RuntimeError("route-aware Lighthouse Markdown structural anchors not found")
replacement = r'''  const markdownProfiles = [...profiles, ...experienceProfiles];
  const markdown = `# Lighthouse repeatability — Roby's\n\n- Tested commit: \`${testedCommit}\`\n- Source run: \`${sourceRunId}\`\n- Verdict: **${overallVerdict}**\n- Warm-up policy: first chronological run per profile and route is retained as cold-start evidence and excluded from steady-state statistics.\n- Generated: ${generatedAt}\n\n| Profile | Route | Warm-up | Measured | Verdict | Performance | LCP | TBT | Interactive |\n|---|---|---:|---:|---|---:|---:|---:|---:|\n${markdownProfiles.map((profile) => `| ${profile.profile} | ${profile.route} | ${profile.warmupRuns.length} | ${profile.runCount} | ${profile.verdict} | ${formatMetric(profile.metrics.performance, 1)} | ${formatMetric(profile.metrics.lcp)} ms | ${formatMetric(profile.metrics.tbt)} ms | ${formatMetric(profile.metrics.interactive)} ms |`).join("\n")}\n\n## Classification\n\n${markdownProfiles.map((profile) => `### ${profile.profile} / ${profile.route}\n\n- Warm-up source: ${profile.warmupRuns.map((run) => `\`${run.source}\` at \`${run.fetchTime}\``).join(", ")}\n- Budget breaches: ${profile.budgetBreaches.length ? profile.budgetBreaches.join("; ") : "none"}\n- Instability: ${profile.instabilityReasons.length ? profile.instabilityReasons.join("; ") : "none"}`).join("\n\n")}\n\nThis report classifies six steady-state exact-head measurements per profile and route while retaining the first cold-start run as explicit warm-up evidence. A median budget breach is a \`new_bug\`; excessive measured-run spread without a median breach is a \`flake\`.\n`;
  writeFileSync(path.join(outputRoot, "report.md"), markdown, "utf8");
  console.log(JSON.stringify({ testedCommit, sourceRunId, overallVerdict, profiles: markdownProfiles.map(({ profile, route, warmupRuns, runCount, verdict, budgetBreaches, instabilityReasons }) => ({ profile, route, warmupRuns: warmupRuns.length, runCount, verdict, budgetBreaches, instabilityReasons })) }, null, 2));
'''
path.write_text(source[:start] + replacement + source[end:], encoding="utf-8")
print("Patched Lighthouse Markdown report to render home and experience profiles.")
