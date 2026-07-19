import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const CONTRACT_PATH = resolve(ROOT, process.env.ROBYS_PRODUCT_LENS_CONTRACT || "qa/product-lens.v1.json");
const ARTIFACT_DIR = resolve(ROOT, process.env.ROBYS_PRODUCT_LENS_ARTIFACT_DIR || ".artifacts/robis-product-lens-v1");

function read(pathname) {
  return readFileSync(resolve(ROOT, pathname), "utf8");
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function currentHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim().toLowerCase();
}

function expectedHead(actualHead) {
  return String(process.env.ROBYS_EXACT_HEAD || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || actualHead).trim().toLowerCase();
}

function htmlLinks(text) {
  return [...text.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].replaceAll("&amp;", "&"));
}

function check(id, label, passed, evidence, detail) {
  return { id, label, passed: Boolean(passed), evidence, detail };
}

function walk(directory) {
  const paths = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) paths.push(...walk(fullPath));
    else paths.push(fullPath);
  }
  return paths;
}

function writeJson(pathname, value) {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const actualHead = currentHead();
const requestedHead = expectedHead(actualHead);
const validSha = /^[0-9a-f]{40}$/;

rmSync(ARTIFACT_DIR, { recursive: true, force: true });
mkdirSync(ARTIFACT_DIR, { recursive: true });

const missingFiles = contract.sourceFiles.filter((pathname) => !existsSync(resolve(ROOT, pathname)));
const sources = Object.fromEntries(contract.sourceFiles.filter((pathname) => !missingFiles.includes(pathname)).map((pathname) => [pathname, read(pathname)]));

const indexHtml = sources["index.html"] || "";
const menuHtml = sources["menu.html"] || "";
const menuData = sources["menu-data.js"] || "";
const pairingPosters = sources["pairing-posters.js"] || "";
const discoverHtml = sources["discover.html"] || "";
const discoverJs = sources["discover-v2.js"] || "";
const analyticsJs = sources["analytics.js"] || "";
const socialOfferJs = sources["social-offer.js"] || "";
const externalLinks = [...htmlLinks(indexHtml), ...htmlLinks(menuHtml)].filter((href) => /google\.com\/maps|instagram\.com/i.test(href));

const checks = [
  check("HEAD-001", "Exact head identity", validSha.test(requestedHead) && validSha.test(actualHead) && requestedHead === actualHead, ["git rev-parse HEAD", "ROBYS_EXACT_HEAD/GITHUB_HEAD_SHA/GITHUB_SHA"], `requested=${requestedHead}; checkedOut=${actualHead}`),
  check("FILES-001", "Bounded source set exists", missingFiles.length === 0, contract.sourceFiles, missingFiles.length ? `missing=${missingFiles.join(",")}` : `${contract.sourceFiles.length} source files present`),
  check("PATH-001", "Entry-to-visit path remains present", indexHtml.includes("menu.html#pairing-offers") && socialOfferJs.includes('link.href = "discover.html"') && /google\.com\/maps/i.test(indexHtml) && /instagram\.com/i.test(indexHtml) && menuHtml.includes("data-instagram-booking") && menuHtml.includes('data-menu-action-copy="mapsLink"') && discoverHtml.includes('id="pairing-menu-link"'), ["index.html", "menu.html", "discover.html", "social-offer.js"], "homepage → pairing/menu → Maps or Instagram handoff"),
  check("OFFER-001", "Optional pairing prices remain explicit", menuData.includes('id: "pairing-offers"') && menuData.includes('pricingMode: "approved-offer"') && menuData.includes('pricingMode: "menu-total"') && /price:\s*290\b/.test(menuData) && /price:\s*370\b/.test(menuData) && pairingPosters.includes("pairing-poster-price"), ["menu-data.js", "pairing-posters.js"], "approved offer and menu-total pairings expose TRY prices"),
  check("CHOICE-001", "No online payment or preselected paid extra", /form-action 'none'/.test(menuHtml) && !/<input[^>]+\bchecked\b/i.test(`${indexHtml}\n${menuHtml}\n${discoverHtml}`) && !/(stripe|paypal|checkout\.com|iyzico|payment[_-]?intent)/i.test(`${indexHtml}\n${menuHtml}\n${discoverHtml}\n${socialOfferJs}`), ["index.html", "menu.html", "discover.html", "social-offer.js"], "pairings are presentation and discovery, not an online payment commitment"),
  check("RECOVERY-001", "Local discovery memory remains bounded", discoverHtml.includes("yalnızca bu cihazda tutulur") && discoverHtml.includes("Baskı yok") && discoverJs.includes('language:"robys-language"') && discoverJs.includes('visits:"robys-discovery-visits"') && discoverJs.includes('discovered:"robys-discovery-pairs"'), ["discover.html", "discover-v2.js"], "language, visit stage, and discovered pairings are local-device state"),
  check("MEASURE-001", "Analytics finding remains client-buffer-only", analyticsJs.includes("const eventBuffer = []") && analyticsJs.includes("window.dataLayer") && !/\bfetch\s*\(|sendBeacon\s*\(|XMLHttpRequest|WebSocket\s*\(/.test(analyticsJs), ["analytics.js"], "repository does not prove durable analytics or POS attribution"),
  check("HANDOFF-001", "External handoff remains context-free", externalLinks.length >= 5 && externalLinks.every((href) => !/[?&](item|pairing|offer|choice|product)=/i.test(href)), ["index.html", "menu.html"], `${externalLinks.length} Maps/Instagram links; none preserve selected-product context`),
  check("CLAIM-001", "Offer claims remain unproven rather than promoted to growth evidence", socialOfferJs.includes("price: 340") && socialOfferJs.includes('currency: "₺"') && analyticsJs.includes('event: "robys_action"') && contract.overallConclusion === "VALUE_UNPROVEN", ["social-offer.js", "analytics.js", "qa/product-lens.v1.json"], "explicit offer exists, but realized-value outcome is not evidenced")
];

const failed = checks.filter((item) => !item.passed);
const verdict = failed.length ? "BLOCKED" : contract.reviewVerdict;
const productConclusion = failed.length ? "VALUE_UNPROVEN" : contract.overallConclusion;
const exactHead = { requestedHead, checkedOutHead: actualHead, matches: requestedHead === actualHead, evaluatedBaseSha: contract.product.evaluatedBaseSha, lensExactHead: contract.lens.exactHead };
const causalGraph = {
  nodes: contract.journey,
  edges: [
    { from: "entry", to: "discovery", state: "PROVEN", evidence: ["index.html", "discover.html"] },
    { from: "discovery", to: "menu", state: "PROVEN", evidence: ["discover-v2.js", "menu.html"] },
    { from: "menu", to: "pairing", state: "PROVEN", evidence: ["menu-data.js", "pairing-posters.js"] },
    { from: "pairing", to: "handoff", state: "PARTIAL", evidence: ["menu.html", "social-offer.js"], gap: "selected pairing context is not preserved" },
    { from: "handoff", to: "visit", state: "UNPROVEN", gap: "external-platform completion is not observed" },
    { from: "visit", to: "purchase", state: "UNPROVEN", gap: "no POS attribution evidence" },
    { from: "purchase", to: "repeat", state: "UNPROVEN", gap: "no bounded repeat-value cohort" }
  ]
};
const summary = { schemaVersion: 1, generatedAt: new Date().toISOString(), verdict, productConclusion, exactHead, checks, observations: contract.observations, boundaryChecks: contract.boundaryChecks, experiments: contract.experiments, authority: contract.authority };
const report = `# Robis Product Lens Run v1\n\n- Exact head: \`${actualHead}\`\n- Verdict: **${verdict}**\n- Product conclusion: **${productConclusion}**\n- Required checks: ${checks.length - failed.length}/${checks.length} passed\n\n## Causal reading\n\nThe digital path from entry through menu and pairing to Maps or Instagram is inspectable. The repository does not prove that the handoff became a physical visit, purchase, AOV/LTV change, or repeat visit. That downstream gap remains visible rather than being converted into a growth claim.\n\n## Observations\n\n${contract.observations.map((item) => `- **${item.id} · ${item.label}** — ${item.claim}`).join("\n")}\n\n## Bounded experiments\n\n${contract.experiments.map((item) => `- **${item.id} · ${item.name}** — ${item.hypothesis}`).join("\n")}\n\n## Authority boundary\n\n${contract.authority}\n`;

writeJson(join(ARTIFACT_DIR, "exact-head.json"), exactHead);
writeJson(join(ARTIFACT_DIR, "checks.json"), checks);
writeJson(join(ARTIFACT_DIR, "findings.json"), contract.observations);
writeJson(join(ARTIFACT_DIR, "causal-graph.json"), causalGraph);
writeJson(join(ARTIFACT_DIR, "run-summary.json"), summary);
writeFileSync(join(ARTIFACT_DIR, "lotus-product-report.md"), report, "utf8");
const manifestEntries = walk(ARTIFACT_DIR).filter((pathname) => !pathname.endsWith("manifest.json")).map((pathname) => { const content = readFileSync(pathname); return { path: relative(ARTIFACT_DIR, pathname).replaceAll("\\", "/"), bytes: content.length, sha256: sha256(content) }; }).sort((a, b) => a.path.localeCompare(b.path));
writeJson(join(ARTIFACT_DIR, "manifest.json"), { algorithm: "sha256", entries: manifestEntries });
console.log(JSON.stringify({ verdict, productConclusion, exactHead, failedChecks: failed.map((item) => item.id), artifactDir: relative(ROOT, ARTIFACT_DIR) }, null, 2));
if (failed.length) process.exitCode = 1;
