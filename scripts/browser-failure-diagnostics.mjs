import { execFileSync, spawn, spawnSync } from "node:child_process";
import { constants } from "node:os";
import { closeSync, constants as fsConstants, createReadStream, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const read = path => { try { return { status: "AVAILABLE", value: readFileSync(path, "utf8") }; }
  catch (error) { return { status: "UNAVAILABLE", code: error.code }; } };
const numericFields = (text, names) => Object.fromEntries(text.split("\n").flatMap(line => {
  const match = /^([A-Za-z_]+):?\s+(\d+)(?:\s+kB)?$/.exec(line.trim());
  return match && (!names || names.includes(match[1])) ? [[match[1], Number(match[2])]] : [];
}));

export function processStat(text) {
  const end = text.lastIndexOf(")"), fields = text.slice(end + 2).trim().split(/\s+/);
  const pid = Number(text.slice(0, text.indexOf(" ")));
  if (end < 0 || !Number.isInteger(pid) || fields.length < 22) throw new Error("Invalid process stat");
  const result = { pid, comm: text.slice(text.indexOf("(") + 1, end).replace(/[^A-Za-z0-9_. -]/g, "?").slice(0, 40),
    state: fields[0], ppid: Number(fields[1]), startTicks: fields[19], rssPages: Number(fields[21]) };
  if (["Z", "X"].includes(result.state) && /^\d+$/.test(fields[49] ?? "")) {
    const raw = Number(fields[49]); result.waitStatus = { raw,
      signal: (raw & 127) !== 0 && (raw & 127) !== 127 ? raw & 127 : null,
      exitCode: (raw & 127) === 0 ? (raw >> 8) & 255 : null, coreDumped: Boolean(raw & 128) };
  }
  return result;
}

export function eventDelta(before, after) {
  return Object.fromEntries(Object.entries(after).map(([name, value]) => [name,
    typeof before[name] === "number" ? value - before[name] : null]));
}

export async function captureFailure(failure, persist, capture) {
  failure.captureErrors = []; failure.screenshotCapture = "PENDING"; persist();
  try { await capture(); failure.screenshotCapture = "SAVED"; }
  catch (error) { failure.screenshotCapture = "FAILED"; failure.captureErrors.push(String(error.message).slice(0, 2000)); }
  persist();
}

export function memorySnapshot() {
  const mem = read("/proc/meminfo"), group = read("/proc/self/cgroup");
  const relative = group.value?.split("\n").find(line => line.startsWith("0::"))?.slice(3);
  const cgroup = relative && !relative.split("/").includes("..") ? resolve("/sys/fs/cgroup", `.${relative}`) : null;
  const files = ["memory.events", "memory.events.local", "memory.current", "memory.max", "memory.swap.current", "memory.swap.max"];
  const memory = Object.fromEntries(files.map(name => {
    const data = cgroup ? read(join(cgroup, name)) : { status: "UNAVAILABLE", code: "NO_CGROUP_V2" };
    return [name, data.status === "AVAILABLE" ? { status: data.status, value: name.includes("events")
      ? numericFields(data.value) : data.value.trim() } : data];
  }));
  let shm;
  try { const data = statfsSync("/dev/shm"); shm = { status: "AVAILABLE", bytes: data.blocks * data.bsize,
    availableBytes: data.bavail * data.bsize, freeInodes: data.ffree }; }
  catch (error) { shm = { status: "UNAVAILABLE", code: error.code }; }
  return { meminfo: mem.status === "AVAILABLE" ? { status: mem.status, kib: numericFields(mem.value,
    ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree", "Shmem"]) } : mem, cgroup: memory, devShm: shm };
}

function descendants(rootPid, known) {
  const rows = new Map();
  for (const name of readdirSync("/proc").filter(name => /^\d+$/.test(name))) {
    try { const row = processStat(readFileSync(`/proc/${name}/stat`, "utf8")); rows.set(row.pid, row); } catch {}
  }
  const selected = new Set([rootPid]);
  for (let depth = 0; depth < 12; depth++) {
    let added = false;
    for (const row of rows.values()) if (selected.has(row.ppid) && !selected.has(row.pid)) { selected.add(row.pid); added = true; }
    if (!added) break;
  }
  const current = [...selected].filter(pid => pid !== rootPid).slice(0, 64).map(pid => rows.get(pid)).filter(Boolean);
  for (const row of current) {
    const status = read(`/proc/${row.pid}/status`), ids = /^NSpid:\s+([\d\s]+)$/m.exec(status.value ?? "")?.[1];
    if (ids) row.namespacePids = ids.trim().split(/\s+/).map(Number);
  }
  const disappeared = [...known.values()].filter(row => !rows.has(row.pid) || rows.get(row.pid).startTicks !== row.startTicks)
    .map(({ pid, comm, startTicks }) => ({ pid, comm, startTicks, state: "DISAPPEARED", exitCause: "UNKNOWN" }));
  for (const row of current) known.set(row.pid, row);
  return { current, disappeared: disappeared.slice(-64), truncated: selected.size > 65 };
}

export function startStartupDiagnostics(output, { intervalMs = 500, maxSamples = 120 } = {}) {
  mkdirSync(output, { recursive: true });
  const file = join(output, "startup-resources.json"), known = new Map();
  const pattern = read("/proc/sys/kernel/core_pattern"), limits = read("/proc/self/limits");
  const identity = read("/proc/self/stat");
  let rootPid; try { rootPid = processStat(identity.value).pid; } catch {}
  const report = { schemaVersion: 1, mode: "Observation only; aggregate memory deltas do not identify a process cause",
    startedAt: new Date().toISOString(), rootPid: rootPid ?? null, runtimeNamespacePid: process.pid, intervalMs, maxSamples, samples: [], stages: [],
    core: { pattern: pattern.status === "AVAILABLE" ? { status: pattern.status,
      mode: pattern.value.startsWith("|") ? "PIPE" : "FILE", collector: pattern.value.startsWith("|")
        ? basename(pattern.value.slice(1).trim().split(/\s+/)[0]) : "REDACTED_FILE_PATTERN" } : pattern,
      limit: limits.status === "AVAILABLE" ? limits.value.split("\n").find(line => line.startsWith("Max core file size")) : limits,
      coreBytesCollected: false }, truncated: false };
  let finished = false;
  const sample = reason => {
    if (finished) return;
    const record = { at: new Date().toISOString(), reason };
    try { Object.assign(record, memorySnapshot(), { processes: rootPid ? descendants(rootPid, known) : { status: "UNAVAILABLE", code: "NO_PROC_SELF_IDENTITY" } }); }
    catch (error) { record.status = "UNAVAILABLE"; record.code = error.code ?? error.name; }
    report.samples.push(record);
    if (report.samples.length > maxSamples) { report.samples.splice(1, 1); report.truncated = true; }
    const first = report.samples[0]?.cgroup?.["memory.events"]?.value, last = record.cgroup?.["memory.events"]?.value;
    report.memoryEventDelta = first && last ? eventDelta(first, last) : null;
    writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  };
  sample("before-browser-launch");
  const timer = setInterval(() => { sample("interval"); if (report.samples.length >= maxSamples) clearInterval(timer); }, intervalMs); timer.unref();
  return { mark(name) { if (!finished && report.stages.length < 40) report.stages.push({ at: new Date().toISOString(), name }); },
    finish(reason) { if (!finished) { clearInterval(timer); sample(reason); finished = true;
      report.finishedAt = new Date().toISOString(); writeFileSync(file, JSON.stringify(report, null, 2) + "\n"); }
      return { path: file, samples: report.samples.length, memoryEventDelta: report.memoryEventDelta,
        processExitAttribution: "Only zombie wait status or the separate native signal trace identifies an exit; disappearance alone does not" }; } };
}

export function boundedLog(file, maxBytes = 1024 * 1024) {
  let head = Buffer.alloc(0), tail = Buffer.alloc(0), totalBytes = 0;
  const headLimit = Math.floor(maxBytes / 2), tailLimit = maxBytes - headLimit;
  const flush = () => { const truncated = totalBytes > head.length + tail.length;
    writeFileSync(file, Buffer.concat([head, ...(truncated ? [Buffer.from("\n[DIAGNOSTIC LOG TRUNCATED; HEAD AND TAIL RETAINED]\n")] : []), tail]));
    return { totalBytes, retainedBytes: head.length + tail.length, truncated, maxBytes }; };
  flush();
  return { append(chunk) { const bytes = Buffer.from(chunk); totalBytes += bytes.length;
      const keep = Math.min(headLimit - head.length, bytes.length);
      if (keep > 0) head = Buffer.concat([head, bytes.subarray(0, keep)]);
      tail = Buffer.concat([tail, bytes.subarray(keep)]).subarray(-tailLimit); flush(); }, finish: flush };
}

export const traceArguments = ["-f", "-ttt", "-e", "trace=wait4,waitid,kill,tgkill", "-e",
  "signal=SIGSEGV,SIGABRT,SIGILL,SIGBUS,SIGFPE,SIGKILL,SIGTERM", "-s", "80"];
export function traceAvailability() {
  const result = spawnSync("strace", [...traceArguments, "-o", "/dev/null", "--", "/bin/true"],
    { timeout: 4000, stdio: "ignore" });
  return result.status === 0 ? { status: "AVAILABLE" } : { status: "UNAVAILABLE",
    code: result.error?.code ?? result.signal ?? result.status, reason: "strace missing or self-child ptrace preflight denied; no policy change attempted" };
}

export async function runObservedNode(script, { args = [], env = process.env, output, trace = true } = {}) {
  mkdirSync(output, { recursive: true });
  let availability = trace ? traceAvailability() : { status: "NOT_REQUESTED" };
  const fifo = join(output, "native-process.fifo"); let keeper, stream, streamDone;
  if (availability.status === "AVAILABLE") {
    try {
      execFileSync("mkfifo", ["-m", "600", fifo]);
      keeper = openSync(fifo, fsConstants.O_RDWR | fsConstants.O_NONBLOCK);
      stream = createReadStream(fifo);
      streamDone = new Promise(done => { stream.on("end", done); stream.on("error", done); });
      await new Promise((done, reject) => { stream.once("open", done); stream.once("error", reject); });
    } catch (error) {
      if (keeper !== undefined) closeSync(keeper);
      stream = null; rmSync(fifo, { force: true }); availability = { status: "UNAVAILABLE", code: error.code,
        reason: "Bounded native trace transport unavailable before canonical launch" };
    }
  }
  const traced = availability.status === "AVAILABLE", log = traced ? boundedLog(join(output, "native-process.log")) : null;
  stream?.on("data", chunk => log.append(chunk));
  const command = traced ? "strace" : process.execPath;
  const commandArgs = traced ? [...traceArguments, "-o", fifo, "--", process.execPath, script, ...args] : [script, ...args];
  const result = await new Promise(resolveResult => {
    const child = spawn(command, commandArgs, { env, stdio: "inherit" });
    child.on("error", error => resolveResult({ code: 1, signal: null, launchError: error.code }));
    child.on("close", (code, signal) => resolveResult({ code: code ?? 128 + (constants.signals[signal] ?? 0), signal }));
  });
  if (traced) { closeSync(keeper); await streamDone; rmSync(fifo, { force: true }); }
  const receipt = { ...result, trace: availability, traceLog: log ? { path: join(output, "native-process.log"), ...log.finish() } : null,
    interpretation: "Tracing changes scheduling. A diagnostic pass cannot establish that the untraced crash was fixed." };
  writeFileSync(join(output, "execution.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}
