import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const allowlistedPluginIds = new Set([
  "10020", // GitHub Pages does not expose a configurable anti-clickjacking response header.
  "10038"  // The site enforces CSP through meta because GitHub Pages headers are not configurable.
]);

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const candidates = walk(process.cwd()).filter((file) => {
  const name = path.basename(file).toLowerCase();
  return name.endsWith(".json") && (name.includes("zap") || name.includes("report"));
});

const reportFile = candidates.find((file) => {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed.site) || Array.isArray(parsed.alerts);
  } catch {
    return false;
  }
});

if (!reportFile) throw new Error("DAST-001: ZAP JSON report was not produced");

const raw = JSON.parse(readFileSync(reportFile, "utf8"));
const sites = Array.isArray(raw.site) ? raw.site : [{ "@name": "unknown", alerts: raw.alerts ?? [] }];
const alerts = sites.flatMap((site) => (site.alerts ?? []).map((alert) => ({
  site: site["@name"] ?? site.name ?? "unknown",
  pluginId: String(alert.pluginid ?? alert.pluginId ?? alert["pluginid"] ?? ""),
  name: alert.name ?? alert.alert ?? "Unnamed alert",
  riskCode: Number(alert.riskcode ?? alert.riskCode ?? 0),
  risk: alert.riskdesc ?? alert.risk ?? "Unknown",
  confidence: alert.confidence ?? alert.confidencedesc ?? "Unknown",
  instances: Array.isArray(alert.instances) ? alert.instances.length : 0
})));

const blocking = alerts.filter((alert) => alert.riskCode >= 2 && !allowlistedPluginIds.has(alert.pluginId));
const accepted = alerts.filter((alert) => alert.riskCode >= 2 && allowlistedPluginIds.has(alert.pluginId));
const summary = {
  generatedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), reportFile),
  totals: {
    alerts: alerts.length,
    blocking: blocking.length,
    acceptedMediumOrHigh: accepted.length
  },
  allowlistedPluginIds: [...allowlistedPluginIds],
  blocking,
  accepted,
  allAlerts: alerts
};

mkdirSync(".artifacts", { recursive: true });
writeFileSync(".artifacts/zap-evaluation.json", `${JSON.stringify(summary, null, 2)}\n`);

if (blocking.length) {
  blocking.forEach((alert) => console.error(`❌ [DAST-001] ${alert.pluginId} ${alert.name} (${alert.risk})`));
  throw new Error(`DAST-001 failed: ${blocking.length} non-allowlisted medium/high alert(s)`);
}

console.log(`✅ DAST-001 passed: ${alerts.length} alerts reviewed, no non-allowlisted medium/high findings.`);
