import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const canonical = "https://www.instagram.com/robyscoffeehouse/";
const resultsDir = path.resolve(process.env.SOCIAL_NETWORK_RESULTS_DIR ?? "visual-results/social-network");
const attemptsLimit = Number(process.env.SOCIAL_NETWORK_ATTEMPTS ?? 3);
const timeoutMs = Number(process.env.SOCIAL_NETWORK_TIMEOUT_MS ?? 10000);

function fail(message) {
  throw new Error(`[SOCIAL-NETWORK-001] ${message}`);
}

function assertSafeResultsDir(directory) {
  const relative = path.relative(process.cwd(), directory);
  const insideVisualResults = relative === "visual-results"
    || relative.startsWith(`visual-results${path.sep}`);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative) || !insideVisualResults) {
    fail(`Refusing to write outside visual-results: ${directory}`);
  }
}

if (!Number.isInteger(attemptsLimit) || attemptsLimit < 1 || attemptsLimit > 5) {
  fail(`SOCIAL_NETWORK_ATTEMPTS must be an integer between 1 and 5; got ${process.env.SOCIAL_NETWORK_ATTEMPTS ?? attemptsLimit}`);
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
  fail(`SOCIAL_NETWORK_TIMEOUT_MS must be between 1000 and 60000; got ${process.env.SOCIAL_NETWORK_TIMEOUT_MS ?? timeoutMs}`);
}

assertSafeResultsDir(resultsDir);
mkdirSync(resultsDir, { recursive: true });

function normalize(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

function isProfileDestination(value) {
  const url = new URL(value);
  const firstSegment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  return !new Set(["p", "reel", "reels", "stories", "tv", "explore", "accounts"]).has(firstSegment);
}

function safeDiagnostic(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 240);
}

const sources = [
  ["index.html", readFileSync("index.html", "utf8")],
  ["menu.html", readFileSync("menu.html", "utf8")],
  ["src/social-offer.ts", readFileSync("src/social-offer.ts", "utf8")]
];
const instagramReferences = [];

for (const [file, content] of sources) {
  for (const match of content.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/gi)) {
    instagramReferences.push({ file, value: match[0] });
  }
}

const references = instagramReferences.filter((reference) => isProfileDestination(reference.value));
if (references.length < 5) {
  fail(`expected at least five Roby's Instagram profile references across the homepage, menu and typed offer; found ${references.length}`);
}
for (const reference of references) {
  if (normalize(reference.value) !== canonical) {
    fail(`${reference.file} points to a non-canonical Instagram profile destination: ${reference.value}`);
  }
}

const probeAttempts = [];
const persistedAttempts = [];
let reachable = false;
let hardFailure = null;

for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(canonical, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 RobysSocialContract/1.0",
        accept: "text/html,application/xhtml+xml"
      }
    });
    const accepted = (response.status >= 200 && response.status < 400)
      || [401, 403, 429].includes(response.status);
    probeAttempts.push({ attempt, status: response.status, accepted });

    if (response.status === 404 || response.status === 410) {
      persistedAttempts.push({ attempt, outcome: "profile-missing" });
      hardFailure = `Instagram returned ${response.status}; the public profile destination appears missing`;
      break;
    }
    if (accepted) {
      persistedAttempts.push({ attempt, outcome: "reachable" });
      reachable = true;
      break;
    }
    persistedAttempts.push({ attempt, outcome: "http-inconclusive" });
  } catch (error) {
    probeAttempts.push({ attempt, error: safeDiagnostic(error), accepted: false });
    persistedAttempts.push({ attempt, outcome: "network-error" });
  } finally {
    clearTimeout(timeout);
  }

  if (attempt < attemptsLimit) {
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  canonical,
  localReferences: references,
  ignoredInstagramContentLinks: instagramReferences.length - references.length,
  probeConfiguration: { attemptsLimit, timeoutMs },
  probeAttempts: persistedAttempts,
  reachable,
  hardFailure: Boolean(hardFailure)
};
writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8", flag: "w" });

if (hardFailure) fail(hardFailure);
if (!reachable) {
  const diagnostics = probeAttempts.map((entry) => entry.status ?? entry.error ?? "unknown").join(" | ");
  console.warn(
    `⚠️ SOCIAL-NETWORK-001: local Instagram contracts are valid, but the external network did not return a conclusive response after ${attemptsLimit} attempts (${diagnostics}). The external outage does not hide local URL failures.`
  );
} else {
  const final = probeAttempts.at(-1);
  console.log(
    `✅ SOCIAL-NETWORK-001 verified ${references.length} canonical Instagram profile references and reached the social destination on attempt ${final.attempt} with status ${final.status}.`
  );
}
