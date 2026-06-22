import { readFileSync } from "node:fs";

const profile = JSON.parse(readFileSync("qa/business-profile.json", "utf8"));
const localIndex = readFileSync("index.html", "utf8");
const build = localIndex.match(/<meta\b[^>]*name=["']robys-build["'][^>]*content=["']([^"']+)["']/i)?.[1];
if (!build) throw new Error("Local robys-build marker is missing");

const baseUrl = new URL(process.env.ROBYS_DEPLOY_BASE ?? profile.siteUrl);
const attempts = Number(process.env.ROBYS_DEPLOY_ATTEMPTS ?? 8);
const delayMs = Number(process.env.ROBYS_DEPLOY_DELAY_MS ?? 15000);

const targets = [
  { path: "", kind: "html", canonical: profile.siteUrl },
  { path: "menu.html", kind: "html", canonical: profile.menuUrl },
  { path: "robots.txt", kind: "robots" },
  { path: "sitemap.xml", kind: "sitemap" }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function inspect(target) {
  const url = new URL(target.path, baseUrl);
  const response = await fetch(url, { redirect: "follow", headers: { "cache-control": "no-cache" } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);

  if (target.kind === "html") {
    if (!body.includes(`name="robys-build" content="${build}"`)) throw new Error(`${url} does not expose build ${build}`);
    if (!body.includes(`rel="canonical" href="${target.canonical}"`)) throw new Error(`${url} canonical does not match ${target.canonical}`);
  } else if (target.kind === "robots") {
    if (!body.includes(`${profile.siteUrl}sitemap.xml`)) throw new Error(`${url} does not expose the canonical sitemap`);
  } else if (target.kind === "sitemap") {
    if (!body.includes(`<loc>${profile.siteUrl}</loc>`) || !body.includes(`<loc>${profile.menuUrl}</loc>`)) {
      throw new Error(`${url} does not list both public pages`);
    }
  }
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    for (const target of targets) await inspect(target);
    console.log(JSON.stringify({ baseUrl: baseUrl.href, build, targets: targets.map((target) => target.path || "index.html"), attemptsUsed: attempt }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < attempts) await sleep(delayMs);
  }
}

throw lastError;
