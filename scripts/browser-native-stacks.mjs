import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boundedLog } from "./browser-failure-diagnostics.mjs";

const driver = fileURLToPath(new URL("./browser-native-stacks.py", import.meta.url));
export const gdbArguments = ["--nx", "--quiet", "--batch", "-iex", "set auto-load off",
  "-iex", "set debuginfod enabled off"];

export function gdbAvailability() {
  if (process.platform !== "linux") return { status: "UNAVAILABLE", reason: "Linux diagnostic only" };
  const probe = spawnSync("gdb", [...gdbArguments, "--return-child-result", "-ex", "set startup-with-shell off",
    "-ex", "set disable-randomization off", "-ex", "python import gdb, json, datetime, hashlib; print('ROBYS_GDB_PREFLIGHT')",
    "-ex", "run", "--args", "/bin/true"],
  { timeout: 5000, encoding: "utf8", maxBuffer: 16384 });
  return probe.status === 0 && probe.stdout.includes("ROBYS_GDB_PREFLIGHT") ? { status: "AVAILABLE" } : { status: "UNAVAILABLE",
    code: probe.error?.code ?? probe.signal ?? probe.status,
    reason: "GDB/Python missing or self-child tracing unavailable; no policy change attempted" };
}

export async function runNativeStackReplay(script, { output, env = process.env, args = [], timeoutMs = 120000,
  availability = gdbAvailability() } = {}) {
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120000, "Bounded diagnostic deadline required");
  output = resolve(output); mkdirSync(output, { recursive: true });
  const receiptPath = join(output, "native-stacks.json");
  const cancelPath = join(output, "deadline-requested");
  rmSync(receiptPath, { force: true });
  rmSync(cancelPath, { force: true });
  const receipt = { role: "Diagnostic replay; never replaces the canonical result", availability,
    driverSha256: createHash("sha256").update(readFileSync(driver)).digest("hex"),
    startedAt: new Date().toISOString(), timeoutMs };
  const save = () => writeFileSync(join(output, "execution.json"), JSON.stringify(receipt, null, 2) + "\n");
  save();
  if (availability.status !== "AVAILABLE") { receipt.status = "NOT_RUN"; save(); return receipt; }
  const logPath = join(output, "gdb.log"), log = boundedLog(logPath, 512 * 1024);
  let expired = false;
  const result = await new Promise(done => {
    const child = spawn("gdb", [...gdbArguments.filter(arg => arg !== "--batch"), "-x", driver, "--args", process.execPath, script, ...args],
      { env: { ...env, ROBYS_GDB_RECEIPT: receiptPath, ROBYS_GDB_CANCEL: cancelPath }, stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => {}); // A normal debugger exit may close the control pipe first.
    child.stdout.on("data", chunk => log.append(chunk)); child.stderr.on("data", chunk => log.append(chunk));
    let force;
    const timer = setTimeout(() => {
      expired = true; writeFileSync(cancelPath, new Date().toISOString() + "\n");
      // Background GDB remains responsive to its private control pipe. Sending
      // SIGINT alone stopped an inferior and the old loop then resumed it.
      child.stdin.write("python request_deadline()\n");
      force = setTimeout(() => child.kill("SIGKILL"), 5000); force.unref();
    }, timeoutMs); timer.unref();
    const finish = value => { clearTimeout(timer); clearTimeout(force); done(value); };
    child.on("error", error => finish({ code: null, signal: null, launchError: error.code }));
    child.on("close", (code, signal) => finish({ code, signal }));
  });
  Object.assign(receipt, result, { status: expired ? "INCONCLUSIVE_TIMEOUT" : "COMPLETED", finishedAt: new Date().toISOString(),
    log: { path: logPath, ...log.finish() }, nativeReceipt: receiptPath,
    interpretation: "GDB changes scheduling; a diagnostic pass does not prove the original crash is fixed" });
  try {
    const native = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.observerComplete = native.complete === true && !native.observerError && !native.cleanupErrors?.length;
    receipt.observedSignalStops = native.signals?.length ?? 0;
    receipt.signalExits = native.exits?.filter(row => row.signal !== null) ?? [];
    receipt.symbolization = native.signals?.some(row => row.symbolization === "PARTIAL") ? "PARTIAL" : "UNAVAILABLE";
    if (!expired && !receipt.observerComplete) receipt.status = "INCOMPLETE";
  } catch (error) { receipt.receiptError = error.code ?? error.name; if (!expired) receipt.status = "INCOMPLETE"; }
  save(); return receipt;
}
