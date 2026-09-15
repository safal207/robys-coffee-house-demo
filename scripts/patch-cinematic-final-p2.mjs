import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one anchor`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one regex match, got ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`${label}: section anchors not found`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

const experiencePwa = `const SERVICE_WORKER_PATH = "../sw.js?v=premium-cache-new-20260904-1";
const SERVICE_WORKER_SCOPE = "../";
const trustedTypesApi = globalThis.trustedTypes;
let trustedPolicy;

function trustedScriptUrl(value) {
  if (!trustedTypesApi) return value;
  trustedPolicy ??= trustedTypesApi.createPolicy("robys-pwa", {
    createScriptURL(candidate) {
      if (candidate === new URL(SERVICE_WORKER_PATH, document.baseURI).href) return candidate;
      throw new TypeError("Rejected service worker URL");
    }
  });
  return trustedPolicy.createScriptURL(value);
}

async function registerExperienceServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const serviceWorkerUrl = new URL(SERVICE_WORKER_PATH, document.baseURI).href;
  const scopeUrl = new URL(SERVICE_WORKER_SCOPE, document.baseURI).href;
  try {
    await navigator.serviceWorker.register(trustedScriptUrl(serviceWorkerUrl), { scope: scopeUrl });
    await navigator.serviceWorker.ready;
    document.documentElement.dataset.offlineReady = "true";
  } catch {
    document.documentElement.dataset.offlineReady = "false";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registerExperienceServiceWorker, { once: true });
} else {
  registerExperienceServiceWorker();
}
`;
write("experience/experience-pwa.js", experiencePwa);

let experienceHtml = read("experience/index.html");
experienceHtml = replaceRegexOnce(
  experienceHtml,
  /  <script defer src="experience\.js\?v=[^"]+"><\/script>/,
  '  <script defer src="experience-pwa.js?v=unbuilt"></script>\n$&',
  "experience HTML PWA runtime"
);
write("experience/index.html", experienceHtml);

let build = read("scripts/build.mjs");
build = replaceOnce(
  build,
  'const experienceRuntimeRevision = revisionFor("experience/experience.js");',
  'const experiencePwaRevision = revisionFor("experience/experience-pwa.js");\nconst experienceRuntimeRevision = revisionFor("experience/experience.js");',
  "build experience PWA revision"
);
build = replaceOnce(
  build,
  'let experienceHtml = readFileSync("experience/index.html", "utf8");\nexperienceHtml = synchronizeScript(experienceHtml, "experience.js", experienceRuntimeRevision);',
  'let experienceHtml = readFileSync("experience/index.html", "utf8");\nexperienceHtml = synchronizeScript(experienceHtml, "experience-pwa.js", experiencePwaRevision);\nexperienceHtml = synchronizeScript(experienceHtml, "experience.js", experienceRuntimeRevision);',
  "build experience HTML synchronization"
);
build = replaceOnce(
  build,
  '  ["experience/experience.js", experienceRuntimeRevision],',
  '  ["experience/experience-pwa.js", experiencePwaRevision],\n  ["experience/experience.js", experienceRuntimeRevision],',
  "build service worker experience PWA asset"
);
write("scripts/build.mjs", build);

let serviceWorker = read("sw.js");
serviceWorker = replaceRegexOnce(
  serviceWorker,
  /(  "\.\/experience\/index\.html",\n)(  "\.\/experience\/experience\.js\?v=[^"]+",)/,
  '$1  "./experience/experience-pwa.js?v=unbuilt",\n$2',
  "service worker PWA precache"
);
serviceWorker = replaceOnce(
  serviceWorker,
  '    url.pathname.endsWith("/experience/experience.js") ||',
  '    url.pathname.endsWith("/experience/experience-pwa.js") ||\n    url.pathname.endsWith("/experience/experience.js") ||',
  "service worker exact experience PWA revision"
);
write("sw.js", serviceWorker);

let security = read("scripts/verify-security-contracts.mjs");
security = replaceOnce(
  security,
  '  "experience/experience.js",',
  '  "experience/experience.js",\n  "experience/experience-pwa.js",',
  "security runtime list"
);
security = replaceOnce(
  security,
  '    must("CSP-001", /<script\\b[^>]*src=["\']experience\\.js\\?v=[a-f0-9]{12}["\']/i.test(html), `${file} does not load the reviewed experience runtime`);',
  '    must("CSP-001", /<script\\b[^>]*src=["\']experience\\.js\\?v=[a-f0-9]{12}["\']/i.test(html), `${file} does not load the reviewed experience runtime`);\n    must("CSP-001", /<script\\b[^>]*src=["\']experience-pwa\\.js\\?v=[a-f0-9]{12}["\']/i.test(html), `${file} does not load the reviewed experience PWA runtime`);',
  "security reviewed experience PWA script"
);
security = replaceOnce(
  security,
  'const experienceRuntime = read("experience/experience.js");',
  'const experienceRuntime = read("experience/experience.js");\nconst experiencePwaRuntime = read("experience/experience-pwa.js");',
  "security experience PWA source"
);
security = replaceOnce(
  security,
  'must("SEC-001", experienceRuntime.includes("experience.dataset.motionFrame"), "Experience runtime must drive reviewed motion state through data-motion-frame");',
  'must("SEC-001", experienceRuntime.includes("experience.dataset.motionFrame"), "Experience runtime must drive reviewed motion state through data-motion-frame");\nmust("CSP-001", experiencePwaRuntime.includes("navigator.serviceWorker.register"), "Experience PWA runtime must register the service worker");\nmust("CSP-001", experiencePwaRuntime.includes("new URL(SERVICE_WORKER_PATH, document.baseURI)"), "Experience PWA runtime must resolve the root service worker explicitly");\nmust("CSP-001", experiencePwaRuntime.includes("new URL(SERVICE_WORKER_SCOPE, document.baseURI)"), "Experience PWA runtime must request the parent scope explicitly");\nmust("SEC-001", !/https?:\\/\\//i.test(experiencePwaRuntime), "Experience PWA runtime must not register a cross-origin worker");',
  "security experience PWA contract"
);
write("scripts/verify-security-contracts.mjs", security);

for (const configPath of [
  "lighthouse/lighthouserc.repeatability.mobile.cjs",
  "lighthouse/lighthouserc.repeatability.desktop.cjs"
]) {
  let config = read(configPath);
  config = replaceOnce(
    config,
    "config.ci.collect.url = ['http://localhost/index.html?entry=off'];",
    "config.ci.collect.url = ['http://localhost/index.html?entry=off', 'http://localhost/experience/'];",
    `${configPath} experience URL`
  );
  write(configPath, config);
}

let repeatability = read("scripts/run-lighthouse-repeatability.mjs");
const newLoadRuns = `function classifyRepeatabilityRoute(finalUrl) {
  let parsed;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return null;
  }
  if (parsed.pathname === "/experience/" || parsed.pathname === "/experience/index.html") return "experience";
  if (parsed.pathname === "/" || parsed.pathname === "/index.html") return "home";
  return null;
}

function loadRuns(profile) {
  const rawRoot = path.join(outputRoot, profile, "raw");
  const grouped = { home: [], experience: [] };
  for (const file of walk(rawRoot).filter((candidate) => candidate.endsWith(".json"))) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const lhr = lhrFromJson(parsed);
    if (!lhr) continue;
    const finalUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.mainDocumentUrl ?? lhr.requestedUrl ?? "";
    const route = classifyRepeatabilityRoute(finalUrl);
    if (!route) continue;
    const fetchTime = String(lhr.fetchTime ?? "");
    const fetchTimestamp = Date.parse(fetchTime);
    if (!fetchTime || !Number.isFinite(fetchTimestamp)) {
      throw new Error(\`${profile}: Lighthouse result \${path.relative(root, file)} has an invalid fetchTime\`);
    }
    grouped[route].push({
      source: path.relative(outputRoot, file).replaceAll(path.sep, "/"),
      finalUrl,
      fetchTime,
      fetchTimestamp,
      performance: Number(lhr.categories.performance.score) * 100,
      lcp: Number(lhr.audits["largest-contentful-paint"]?.numericValue),
      tbt: Number(lhr.audits["total-blocking-time"]?.numericValue),
      cls: Number(lhr.audits["cumulative-layout-shift"]?.numericValue),
      fcp: Number(lhr.audits["first-contentful-paint"]?.numericValue),
      speedIndex: Number(lhr.audits["speed-index"]?.numericValue),
      interactive: Number(lhr.audits.interactive?.numericValue)
    });
  }

  const result = {};
  for (const route of ["home", "experience"]) {
    const runs = grouped[route];
    runs.sort((left, right) => left.fetchTimestamp - right.fetchTimestamp || left.source.localeCompare(right.source));
    if (runs.length !== configuredRunsPerProfile) {
      throw new Error(\`${profile}/\${route}: expected exactly \${configuredRunsPerProfile} valid Lighthouse runs, found \${runs.length}\`);
    }
    const orderedRuns = runs.map((run, index) => ({ ...run, ordinal: index + 1 }));
    for (const [index, run] of orderedRuns.entries()) {
      for (const [metric, value] of Object.entries(run)) {
        if (["source", "finalUrl", "fetchTime"].includes(metric)) continue;
        if (!Number.isFinite(value)) throw new Error(\`${profile}/\${route} run \${index + 1}: invalid \${metric}\`);
      }
    }
    const warmupRuns = orderedRuns.slice(0, warmupRunsPerProfile);
    const measuredRuns = orderedRuns.slice(warmupRunsPerProfile);
    if (measuredRuns.length !== minimumRunsPerProfile) {
      throw new Error(\`${profile}/\${route}: expected \${minimumRunsPerProfile} measured runs after warm-up, found \${measuredRuns.length}\`);
    }
    result[route] = { warmupRuns, measuredRuns };
  }
  return result;
}

`;
repeatability = replaceSection(
  repeatability,
  "function loadRuns(profile) {",
  "function quantile(values, q) {",
  newLoadRuns,
  "repeatability route-aware loading"
);
repeatability = replaceOnce(
  repeatability,
  "function summarizeProfile(profile, runs) {",
  'function summarizeProfile(profile, runs, route = "home") {',
  "repeatability summary route"
);
repeatability = replaceOnce(
  repeatability,
  "  return {\n    profile,\n    runCount: runs.length,",
  "  return {\n    profile,\n    route,\n    runCount: runs.length,",
  "repeatability route result"
);
repeatability = replaceOnce(
  repeatability,
  "function writeCombinedReport(profiles) {\n  const overallVerdict = profiles.some((profile) => profile.verdict === \"new_bug\")\n    ? \"new_bug\"\n    : profiles.some((profile) => profile.verdict === \"flake\")\n      ? \"flake\"\n      : \"stable\";",
  "function writeCombinedReport(profiles, experienceProfiles) {\n  const allProfiles = [...profiles, ...experienceProfiles];\n  const overallVerdict = allProfiles.some((profile) => profile.verdict === \"new_bug\")\n    ? \"new_bug\"\n    : allProfiles.some((profile) => profile.verdict === \"flake\")\n      ? \"flake\"\n      : \"stable\";",
  "repeatability combined verdict"
);
repeatability = replaceOnce(
  repeatability,
  "    overallVerdict,\n    profiles\n  };",
  "    overallVerdict,\n    profiles,\n    experienceProfiles\n  };",
  "repeatability experience report field"
);
const newModeBlock = `if (mode === "--merge") {
  const packets = ["mobile", "desktop"].map((profile) => {
    const packet = JSON.parse(readFileSync(path.join(outputRoot, profile, "profile-report.json"), "utf8"));
    if (packet.schema !== "robys.lighthouse.repeatability.profile.v1") {
      throw new Error(\`${profile}: unsupported profile evidence schema\`);
    }
    if (packet.testedCommit !== testedCommit || packet.sourceRunId !== sourceRunId) {
      throw new Error(\`${profile}: stale or cross-run profile evidence\`);
    }
    if (packet.configuredRuns !== configuredRunsPerProfile || packet.warmupRuns !== warmupRunsPerProfile || packet.measuredRuns !== minimumRunsPerProfile) {
      throw new Error(\`${profile}: unexpected warm-up or measured run policy\`);
    }
    if (!packet.experienceProfileResult || !Array.isArray(packet.experienceWarmupEvidence)) {
      throw new Error(\`${profile}: experience-route evidence is missing\`);
    }
    return { profile, packet };
  });
  const profiles = packets.map(({ packet }) => ({ ...packet.profileResult, warmupRuns: packet.warmupEvidence }));
  const experienceProfiles = packets.map(({ packet }) => ({ ...packet.experienceProfileResult, warmupRuns: packet.experienceWarmupEvidence }));
  writeCombinedReport(profiles, experienceProfiles);
} else {
  if (!new Set(["mobile", "desktop"]).has(mode)) {
    throw new Error("Usage: node scripts/run-lighthouse-repeatability.mjs <mobile|desktop|--merge>");
  }
  rmSync(path.join(outputRoot, mode), { recursive: true, force: true });
  mkdirSync(path.join(outputRoot, mode), { recursive: true });
  collect(mode, \`lighthouse/lighthouserc.repeatability.\${mode}.cjs\`);
  const routeRuns = loadRuns(mode);
  const profileResult = summarizeProfile(mode, routeRuns.home.measuredRuns, "home");
  const experienceProfileResult = summarizeProfile(mode, routeRuns.experience.measuredRuns, "experience");
  const packet = {
    schema: "robys.lighthouse.repeatability.profile.v1",
    testedCommit,
    sourceRunId,
    generatedAt: new Date().toISOString(),
    configuredRuns: configuredRunsPerProfile,
    warmupRuns: warmupRunsPerProfile,
    measuredRuns: minimumRunsPerProfile,
    warmupEvidence: routeRuns.home.warmupRuns,
    profileResult,
    experienceWarmupEvidence: routeRuns.experience.warmupRuns,
    experienceProfileResult
  };
  writeFileSync(path.join(outputRoot, mode, "profile-report.json"), \`\${JSON.stringify(packet, null, 2)}\\n\`, "utf8");
  console.log(JSON.stringify({
    testedCommit,
    sourceRunId,
    profile: mode,
    home: {
      warmupSource: routeRuns.home.warmupRuns[0].source,
      runCount: profileResult.runCount,
      verdict: profileResult.verdict,
      budgetBreaches: profileResult.budgetBreaches,
      instabilityReasons: profileResult.instabilityReasons
    },
    experience: {
      warmupSource: routeRuns.experience.warmupRuns[0].source,
      runCount: experienceProfileResult.runCount,
      verdict: experienceProfileResult.verdict,
      budgetBreaches: experienceProfileResult.budgetBreaches,
      instabilityReasons: experienceProfileResult.instabilityReasons
    }
  }, null, 2));
}
`;
repeatability = replaceSection(
  repeatability,
  'if (mode === "--merge") {',
  "__END_OF_FILE__",
  newModeBlock,
  "repeatability mode block"
);
write("scripts/run-lighthouse-repeatability.mjs", repeatability);

let liminalSignals = read("scripts/build-liminalqa-signals.mjs");
const oldLighthouseBlock = `if (!Array.isArray(lighthouse.profiles) || lighthouse.profiles.length !== 2) {
  throw new Error("Lighthouse evidence must contain mobile and desktop profiles");
}
const lighthouseRunCount = lighthouse.profiles.reduce((sum, profile) => sum + Number(profile.runCount ?? 0), 0);
if (lighthouseRunCount !== 12) throw new Error(\`Lighthouse evidence must contain exactly 12 measured runs, got \${lighthouseRunCount}\`);
const lighthouseStability = Math.min(...lighthouse.profiles.map((profile) => probability(profile.stability, \`\${profile.profile}.stability\`)));
const lighthouseFlakeProbability = Math.max(...lighthouse.profiles.map((profile) => probability(profile.flakeProbability, \`\${profile.profile}.flakeProbability\`)));
const lighthouseVerdict = lighthouse.overallVerdict;`;
const newLighthouseBlock = `if (!Array.isArray(lighthouse.profiles) || lighthouse.profiles.length !== 2) {
  throw new Error("Lighthouse evidence must contain mobile and desktop home profiles");
}
if (!Array.isArray(lighthouse.experienceProfiles) || lighthouse.experienceProfiles.length !== 2) {
  throw new Error("Lighthouse evidence must contain mobile and desktop experience profiles");
}
const homeRunCount = lighthouse.profiles.reduce((sum, profile) => sum + Number(profile.runCount ?? 0), 0);
const experienceRunCount = lighthouse.experienceProfiles.reduce((sum, profile) => sum + Number(profile.runCount ?? 0), 0);
if (homeRunCount !== 12) throw new Error(\`Lighthouse home evidence must contain exactly 12 measured runs, got \${homeRunCount}\`);
if (experienceRunCount !== 12) throw new Error(\`Lighthouse experience evidence must contain exactly 12 measured runs, got \${experienceRunCount}\`);
const lighthouseRunCount = homeRunCount + experienceRunCount;
const lighthouseProfiles = [...lighthouse.profiles, ...lighthouse.experienceProfiles];
const lighthouseStability = Math.min(...lighthouseProfiles.map((profile) => probability(profile.stability, \`\${profile.profile}/\${profile.route ?? "home"}.stability\`)));
const lighthouseFlakeProbability = Math.max(...lighthouseProfiles.map((profile) => probability(profile.flakeProbability, \`\${profile.profile}/\${profile.route ?? "home"}.flakeProbability\`)));
const lighthouseVerdict = lighthouse.overallVerdict;`;
liminalSignals = replaceOnce(
  liminalSignals,
  oldLighthouseBlock,
  newLighthouseBlock,
  "LiminalQA experience Lighthouse evidence"
);
write("scripts/build-liminalqa-signals.mjs", liminalSignals);

console.log("Applied final cinematic P2 fixes: root-scope PWA registration and experience-route repeatability evidence.");
