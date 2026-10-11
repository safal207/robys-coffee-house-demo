import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const profile = arg('profile');
const input = resolve(arg('input', '.lighthouseci'));
const output = resolve(arg('output', profile ? `lighthouse/reports/${profile}-summary.json` : 'lighthouse/reports/summary.json'));
const heroPath = resolve(arg('hero', process.env.HERO_VIDEO_PATH ?? 'src/robys-hero-mobile-lite.mp4'));

if (!['mobile', 'desktop'].includes(profile)) throw new Error('--profile must be mobile or desktop');
if (!statSync(input, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Lighthouse input not found: ${input}`);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function lhrFrom(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value?.audits && value?.categories && value?.lighthouseVersion ? value : null;
  } catch {
    return null;
  }
}

function pageId(lhr) {
  const rawUrl = lhr.finalUrl ?? lhr.requestedUrl;
  if (!rawUrl) return null;
  try {
    const path = new URL(rawUrl).pathname;
    const leaf = path.split('/').filter(Boolean).at(-1) ?? 'index.html';
    return leaf.replace(/\.html$/i, '') || 'index';
  } catch {
    return null;
  }
}

function firstPartyScriptBytes(lhr) {
  const pageUrl = lhr.finalUrl ?? lhr.requestedUrl;
  if (!pageUrl) return null;
  const origin = new URL(pageUrl).origin;
  return (lhr.audits?.['network-requests']?.details?.items ?? [])
    .filter((item) => String(item.resourceType ?? '').toLowerCase() === 'script')
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
  return (lhr.audits?.['network-requests']?.details?.items ?? []).find((item) => {
    const type = String(item.resourceType ?? '').toLowerCase();
    const url = String(item.url ?? '');
    return (type === 'media' || /\.mp4(?:$|[?#])/i.test(url)) && /hero/i.test(url);
  }) ?? null;
}

function requestDuration(item) {
  if (!item) return null;
  const start = Number(item.networkRequestTime ?? item.startTime);
  const end = Number(item.networkEndTime ?? item.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) * 1000 : null;
}

function summarizePage(lhrs) {
  const audit = (id) => lhrs
    .map((lhr) => Number(lhr.audits?.[id]?.numericValue))
    .filter(Number.isFinite);
  const heroes = lhrs.map(heroRequest);
  return {
    performance: median(lhrs.map((lhr) => Number(lhr.categories?.performance?.score))),
    lcp: median(audit('largest-contentful-paint')),
    tbt: median(audit('total-blocking-time')),
    cls: median(audit('cumulative-layout-shift')),
    fcp: median(audit('first-contentful-paint')),
    speed_index: median(audit('speed-index')),
    total_js_bytes: median(lhrs.map(firstPartyScriptBytes)),
    hero_transfer_bytes: median(heroes.map((item) => Number(item?.transferSize ?? item?.resourceSize))),
    hero_request_duration: median(heroes.map(requestDuration))
  };
}

const lhrs = walk(input).filter((path) => path.endsWith('.json')).map(lhrFrom).filter(Boolean);
if (!lhrs.length) throw new Error(`No Lighthouse result JSON files found in ${input}`);

const grouped = new Map();
for (const lhr of lhrs) {
  const id = pageId(lhr);
  if (!id) throw new Error('Lighthouse result is missing a parseable requested/final URL');
  if (!grouped.has(id)) grouped.set(id, []);
  grouped.get(id).push(lhr);
}

let links = {};
try {
  links = JSON.parse(readFileSync(join(input, 'links.json'), 'utf8'));
} catch {}
const publicUrls = [...new Set(Object.values(links).filter((value) => typeof value === 'string' && /^https?:/.test(value)))];

const pages = Object.fromEntries(
  [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, pageLhrs]) => [
    id,
    {
      url: pageLhrs[0].finalUrl ?? pageLhrs[0].requestedUrl ?? null,
      run_count: pageLhrs.length,
      values: summarizePage(pageLhrs)
    }
  ])
);

const summary = {
  schema_version: 2,
  profile,
  generated_at: new Date().toISOString(),
  total_run_count: lhrs.length,
  lighthouse_version: lhrs[0].lighthouseVersion,
  chrome_user_agent: lhrs[0].userAgent ?? null,
  public_urls: publicUrls,
  shared_values: {
    hero_file_bytes: statSync(heroPath, { throwIfNoEntry: false })?.size ?? null
  },
  pages
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
