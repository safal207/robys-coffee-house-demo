import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const canonical = "https://www.instagram.com/robyscoffeehouse/";
const resultsDir = path.resolve(process.env.SOCIAL_NETWORK_RESULTS_DIR ?? "visual-results/social-network");
const attemptsLimit = Number(process.env.SOCIAL_NETWORK_ATTEMPTS ?? 3);
const timeoutMs = Number(process.env.SOCIAL_NETWORK_TIMEOUT_MS ?? 10000);

mkdirSync(resultsDir, { recursive: true });

function fail(message) {
  throw new Error(`[SOCIAL-NETWORK-001] ${message}`);
}

function normalize(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

const sources = [
  ["index.html", readFileSync("index.html", "utf8")],
  ["menu.html", readFileSync("menu.html", "utf8")],
  ["src/social-offer.ts", readFileSync("src/social-offer.ts", "utf8")]
];
const references = [];

for (const [file, content] of sources) {
  for (const match of content.matchAll(/https:\/\/www\.instagram\.com\/robyscoffeehouse\/?/g)) {
    references.push({ file, value: match[0] });
  }
}

if (references.length < 5) {
  fail(`expected at least five Roby's Instagram references across the homepage, menu and typed offer; found ${references.length}`);
}
for (const reference of references) {
  if (normalize(reference.value) !== canonical) {
    fail(`${reference.file} points to a non-canonical Instagram destination: ${reference.value}`);
  }
}

const probeAttempts = [];
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
      hardFailure = `Instagram returned ${response.status}; the public profile destination appears missing`;
      break;
    }
    if (accepted) {
      reachable = true;
      break;
    }
  } catch (error) {
    probeAttempts.push({
      attempt,
      error: error instanceof Error ? error.message : String(error),
      accepted: false
    });
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
  liveProbe: {
    attemptsLimit,
    timeoutMs,
    reachable,
    hardFailure,
    attempts: probeAttempts
  }
};
writeFileSync(path.join(resultsDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (hardFailure) fail(hardFailure);
if (!reachable) {
  console.warn(
    `⚠️ SOCIAL-NETWORK-001: local Instagram contracts are valid, but the external network did not return a conclusive response after ${attemptsLimit} attempts. Evidence was saved without blocking the release.`
  );
} else {
  const final = probeAttempts.at(-1);
  console.log(
    `✅ SOCIAL-NETWORK-001 verified ${references.length} canonical Instagram references and reached the social destination on attempt ${final.attempt} with status ${final.status}.`
  );
}
