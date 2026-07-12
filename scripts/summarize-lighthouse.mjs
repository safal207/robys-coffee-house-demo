import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ACTIVE_HERO_PATH, fileReference } from "./media-contract-config.mjs";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const profile = arg("profile");
const input = resolve(arg("input", ".lighthouseci"));
const output = resolve(arg("output", profile ? `lighthouse/reports/${profile}-summary.json` : "lighthouse/reports/summary.json"));
const heroReference = arg("hero", process.env.HERO_VIDEO_PATH ?? ACTIVE_HERO_PATH);
if (isAbsolute(heroReference) || /^(?:[a-z]:[\\/]|[\\/])/i.test(heroReference)) {
  throw new Error(`Lighthouse hero path must be repository-relative: ${heroReference}`);
}
const heroRepoPath = fileReference(heroReference, "Lighthouse hero path").replaceAll("\\", "/");
if (heroRepoPath !== ACTIVE_HERO_PATH) {
  throw new Error(`Lighthouse hero path must target the active hero: ${ACTIVE_HERO_PATH}`);
}
const heroPath = resolve(ROOT, heroRepoPath);
const heroRelativePath = relative(ROOT, heroPath);
if (heroRelativePath === ".." || heroRelativePath.startsWith(`..${sep}`) || isAbsolute(heroRelativePath)) {
  throw new Error(`Lighthouse hero path must stay inside repository: ${heroRepoPath}`);
}
if (!["mobile", "desktop"].includes(profile)) throw new Error("--profile must be mobile or desktop");
if (!statSync(input, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Lighthouse input not found: ${input}`);
const heroStat = statSync(heroPath, { throwIfNoEntry: false });
if (!heroStat?.isFile()) throw new Error(`Lighthouse hero asset not found: ${heroRepoPath}`);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const current = join(directory, entry.name);
    return entry.isDirectory() ? walk(current) : [current];
  });
}

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function lhrFrom(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value?.audits && value?.categories && value?.lighthouseVersion ? value : null;
  } catch {
    return null;
  }
}

const lhrs = walk(input).filter((path) => path.endsWith(".json")).map(lhrFrom).filter(Boolean);
if (!lhrs.length) throw new Error(`No Lighthouse result JSON files found in ${input}`);
const audit = (id) => lhrs.map((lhr) => Number(lhr.audits?.[id]?.numericValue)).filter(Number.isFinite);

function firstPartyScriptBytes(lhr) {
  const pageUrl = lhr.finalUrl ?? lhr.requestedUrl;
  if (!pageUrl) return null;
  const origin = new URL(pageUrl).origin;
  return (lhr.audits?.["network-requests"]?.details?.items ?? [])
    .filter((item) => String(item.resourceType ?? "").toLowerCase() === "script")
    .filter((item) => {
      try {
        return new URL(String(item.url)).origin === origin;
      } catch {
        return false;
      }
    })
    .reduce((sum, item) => sum + Number(item.transferSize ?? 0), 0);
}

function heroRequest(lhr) {
  const pageUrl = lhr.finalUrl ?? lhr.requestedUrl;
  return (lhr.audits?.["network-requests"]?.details?.items ?? []).find((item) => {
    const type = String(item.resourceType ?? "").toLowerCase();
    const rawUrl = String(item.url ?? "");
    if (type !== "media" && !/\.mp4(?:$|[?#])/i.test(rawUrl)) return false;
    try {
      const pathname = decodeURIComponent(new URL(rawUrl, pageUrl).pathname).replaceAll("\\", "/");
      return pathname === `/${heroRepoPath}` || pathname.endsWith(`/${heroRepoPath}`);
    } catch {
      return false;
    }
  }) ?? null;
}

function duration(request) {
  if (!request) return null;
  const start = Number(request.networkRequestTime ?? request.startTime);
  const end = Number(request.networkEndTime ?? request.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) * 1000 : null;
}

let links = {};
try {
  links = JSON.parse(readFileSync(join(input, "links.json"), "utf8"));
} catch {}
const publicUrl = Object.values(links).find((value) => typeof value === "string" && /^https?:/.test(value)) ?? null;
const heroes = lhrs.map(heroRequest);
const values = {
  performance: median(lhrs.map((lhr) => Number(lhr.categories?.performance?.score))),
  lcp: median(audit("largest-contentful-paint")),
  tbt: median(audit("total-blocking-time")),
  cls: median(audit("cumulative-layout-shift")),
  fcp: median(audit("first-contentful-paint")),
  speed_index: median(audit("speed-index")),
  total_js_bytes: median(lhrs.map(firstPartyScriptBytes)),
  hero_file_bytes: heroStat.size,
  hero_transfer_bytes: median(heroes.map((request) => Number(request?.transferSize ?? request?.resourceSize))),
  hero_request_duration: median(heroes.map(duration)),
};
const summary = {
  schema_version: 1,
  profile,
  generated_at: new Date().toISOString(),
  url: lhrs[0].finalUrl ?? lhrs[0].requestedUrl ?? null,
  run_count: lhrs.length,
  lighthouse_version: lhrs[0].lighthouseVersion,
  chrome_user_agent: lhrs[0].userAgent ?? null,
  public_url: publicUrl,
  hero_path: heroRepoPath,
  values,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
