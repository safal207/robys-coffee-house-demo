// Local-only owner report export: never serves the Counter database over HTTP.
import { writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reportVerifiedPayments } from "./owner-paid-kpi-v1.mjs";
import { renderOwnerPaidKpiHtml } from "./render-owner-paid-kpi-v1.mjs";

export function exportOwnerPaidReport({ dbPath, fromMs, toMs, language = "tr", outputPath } = {}) {
  if (typeof outputPath !== "string" || !outputPath.trim() ||
      extname(outputPath).toLowerCase() !== ".html") throw Error("Explicit .html output path required");
  const data = reportVerifiedPayments(dbPath, { fromMs, toMs });
  const html = renderOwnerPaidKpiHtml(data, language);
  const file = resolve(outputPath);
  // Refuse overwriting another report or following an existing symlink.
  writeFileSync(file, html, { flag: "wx", mode: 0o600 });
  return { path: file, paidOrders: data.paidOrders };
}

function parseDate(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw Error("Date must be an explicit ISO-8601 timestamp with timezone");
  }
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms)) throw Error("Invalid date");
  return ms;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [dbPath, startIso, endIso, language, outputPath] = process.argv.slice(2);
    if (!dbPath || !startIso || !endIso || !language || !outputPath || process.argv.length !== 7)
      throw Error("Usage: node scripts/export-owner-paid-report-v1.mjs <private-counter.sqlite> <from-ISO-timezone> <to-ISO-timezone> <tr|en|ru> <output.html>");
    const result = exportOwnerPaidReport({
      dbPath, fromMs: parseDate(startIso), toMs: parseDate(endIso), language, outputPath
    });
    process.stdout.write(`Created private report; verified paid orders: ${result.paidOrders}\n`);
  } catch {
    // Fail without echoing source DB path, parameters or sensitive filesystem details.
    process.stderr.write("Owner report export failed; verify private paths, timeframe and source database.\n");
    process.exitCode = 1;
  }
}
