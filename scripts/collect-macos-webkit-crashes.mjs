import { constants } from "node:fs";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

// Check and read the same opened file. A bounded read protects against growth
// after fstat; O_NOFOLLOW rejects replacement with a symlink on macOS, while
// O_NONBLOCK prevents a substituted FIFO from blocking before fstat.
export async function readCandidate(path, startedAt, { openFile = open, maxBytes = MAX_REPORT_BYTES } = {}) {
  if (process.platform === "darwin" && constants.O_NOFOLLOW === undefined) throw new Error("O_NOFOLLOW is required on macOS");
  if (process.platform !== "win32" && constants.O_NONBLOCK === undefined) throw new Error("O_NONBLOCK is required on POSIX");
  const file = await openFile(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  let originalError;
  try {
    const before = await file.stat();
    if (!before.isFile() || before.mtimeMs < startedAt || before.size > maxBytes) return null;
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(bytes, used, bytes.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    const after = await file.stat();
    if (used > maxBytes || used !== before.size || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) return null;
    return bytes.subarray(0, used).toString("utf8");
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    try { await file.close(); } catch (error) { if (!originalError) throw error; }
  }
}

// An .ips file contains a JSON header on its first line followed by a JSON
// report. Requiring the actual executable path avoids collecting unrelated
// runner reports merely because they have a WebKit-like filename.
export function matchesReport(text, browserRoot) {
  try {
    const newline = text.indexOf("\n");
    if (newline < 0) return false;
    const header = JSON.parse(text.slice(0, newline));
    const report = JSON.parse(text.slice(newline + 1));
    const name = report.procName ?? header.app_name;
    const executable = report.procPath;
    return name === "Playwright" && typeof executable === "string"
      && resolve(executable).startsWith(resolve(browserRoot) + sep);
  } catch { return false; }
}

// Keep only fields useful for identifying a native crash. Full macOS reports
// can include runner metadata, paths and other details that do not belong in
// the uploaded artifact. Image indices and offsets retain the frame mapping.
export function summarizeReport(text) {
  const report = JSON.parse(text.slice(text.indexOf("\n") + 1));
  const str = value => typeof value === "string" ? value.slice(0, 500) : null;
  const num = value => Number.isFinite(value) ? value : null;
  const exception = report.exception ?? {};
  return {
    process: str(report.procName), pid: num(report.pid), captureTime: str(report.captureTime),
    exception: { type: str(exception.type), signal: str(exception.signal), subtype: str(exception.subtype), codes: str(exception.codes) },
    faultingThread: num(report.faultingThread),
    threads: Array.isArray(report.threads) ? report.threads.slice(0, 256).map(thread => ({
      triggered: thread.triggered === true,
      frames: Array.isArray(thread.frames) ? thread.frames.slice(0, 256).map(frame => ({ imageIndex: num(frame.imageIndex),
        imageOffset: num(frame.imageOffset), symbol: str(frame.symbol), symbolLocation: num(frame.symbolLocation) })) : []
    })) : [],
    usedImages: Array.isArray(report.usedImages) ? report.usedImages.slice(0, 1024).map(image => ({ name: str(image.name),
      uuid: str(image.uuid), arch: str(image.arch) })) : []
  };
}

export async function collectReports({ directories, browserRoot, startedAt, output, waitMs = 20000, pollMs = 2000, now = () => Date.now(), pause = sleep }) {
  if (!Number.isFinite(startedAt) || !browserRoot || waitMs < 0 || pollMs <= 0) throw new Error("Invalid collection parameters");
  await mkdir(output, { recursive: true });
  const deadline = now() + waitMs;
  const errors = [];
  let matches = [];
  do {
    matches = [];
    for (const [directoryIndex, directory] of directories.entries()) {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code !== "ENOENT") errors.push(`directory-${directoryIndex + 1}: ${error.code ?? "read-error"}`); continue; }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".ips")) continue;
        const path = join(directory, entry.name);
        try {
          const contents = await readCandidate(path, startedAt);
          if (contents !== null && matchesReport(contents, browserRoot)) matches.push({ name: entry.name, summary: summarizeReport(contents) });
        } catch (error) { if (error.code !== "ENOENT") errors.push(`${entry.name}: ${error.code ?? error.message}`); }
      }
    }
    if (matches.length || now() >= deadline) break;
    await pause(Math.min(pollMs, Math.max(0, deadline - now())));
  } while (true);
  const files = [];
  // Assign new names so reports from different directories cannot overwrite one another.
  for (const [index, match] of matches.entries()) {
    const name = `webkit-crash-${index + 1}.json`;
    await writeFile(join(output, name), JSON.stringify(match.summary, null, 2) + "\n", { flag: "wx" });
    files.push({ sourceName: match.name, file: name });
  }
  const receipt = { status: files.length ? "captured" : "not-found", startedAt: new Date(startedAt).toISOString(), files, errors: [...new Set(errors)],
    association: "File modification time and Playwright executable path only; process IDs are not correlated with the test job.",
    scope: "Allowlisted summary from .ips reports named Playwright with procPath beneath the bound browser directory; not all WebKit process crashes.",
    interpretation: "The report format and process name have not been verified on a real crash in this runner. No report or a later pass does not establish the cause of a crash." };
  await writeFile(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

async function main() {
  const output = ".artifacts/order-reliability/macos-webkit-crashes";
  await mkdir(output, { recursive: true });
  try {
    if (process.platform !== "darwin" || !process.env.HOME) throw new Error("Expected a macOS runner with HOME");
    const metadata = JSON.parse(await readFile(".artifacts/order-reliability/webkit-environment.json", "utf8"));
    const startedAt = Date.parse(metadata.diagnosticsStartedAt);
    const launcher = metadata.executablePath;
    if (typeof launcher !== "string" || !launcher.includes("/webkit-2203/")) throw new Error("Missing bound WebKit executable");
    const browserRoot = dirname(launcher);
    const receipt = await collectReports({ directories: [join(process.env.HOME, "Library/Logs/DiagnosticReports"), "/Library/Logs/DiagnosticReports"], browserRoot, startedAt, output });
    console.log(`Native WebKit crash reports: ${receipt.status} (${receipt.files.length})`);
  } catch (error) {
    await writeFile(join(output, "receipt.json"), JSON.stringify({ status: "collector-error", error: error.message }, null, 2) + "\n");
    console.error(`Native WebKit crash report collection unavailable: ${error.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
