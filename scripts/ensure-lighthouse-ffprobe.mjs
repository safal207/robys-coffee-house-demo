import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const keyring = "/usr/share/keyrings/ubuntu-archive-keyring.gpg";
const sourcePath = "/etc/apt/sources.list.d/ubuntu.sources";
const archive = "https://archive.ubuntu.com/ubuntu/";
const allowedUris = new Set(["mirror+file:/etc/apt/apt-mirrors.txt", ...["http:", "https:"].flatMap(protocol =>
  ["azure.archive.ubuntu.com", "archive.ubuntu.com", "security.ubuntu.com"].flatMap(host =>
    [`${protocol}//${host}/ubuntu`, `${protocol}//${host}/ubuntu/`]))]);

// Keep the runner's signed Ubuntu suites/components; change only the mirror.
// Unknown formats and trust overrides fail instead of inventing new sources.
export function fallbackSources(source) {
  const blocks = source.trim().split(/\n\s*\n/);
  if (!blocks.length) throw new Error("Missing Ubuntu deb822 sources");
  return blocks.map(block => {
    const fields = new Map();
    for (const line of block.split("\n").filter(line => line.trim() && !line.trimStart().startsWith("#"))) {
      const match = /^([A-Za-z-]+):\s*(\S.*)$/.exec(line);
      if (!match || fields.has(match[1])) throw new Error("Unsupported Ubuntu deb822 field");
      fields.set(match[1], match[2].trim());
    }
    const allowed = ["Types", "URIs", "Suites", "Components", "Signed-By", "Architectures", "Enabled"];
    if ([...fields.keys()].some(key => !allowed.includes(key)) || fields.get("Types") !== "deb"
      || fields.get("Signed-By") !== keyring || (fields.has("Enabled") && fields.get("Enabled") !== "yes")
      || (fields.has("Architectures") && fields.get("Architectures") !== "amd64")) {
      throw new Error("Unsupported or unsigned Ubuntu source");
    }
    const uris = fields.get("URIs")?.split(/\s+/) ?? [];
    const suites = fields.get("Suites")?.split(/\s+/) ?? [];
    const components = fields.get("Components")?.split(/\s+/) ?? [];
    if (!uris.length || uris.some(uri => !allowedUris.has(uri)) || !suites.length
      || suites.some(suite => !/^noble(?:-updates|-backports|-security)?$/.test(suite))
      || !components.length || components.some(component => !["main", "restricted", "universe", "multiverse"].includes(component))) {
      throw new Error("Unsupported Ubuntu URI, suite or component");
    }
    const fallback = [...new Set(uris.map(uri => uri.includes("//security.ubuntu.com/") ? uri : archive))];
    return block.replace(/^URIs:.*$/m, `URIs: ${fallback.join(" ")}`);
  }).join("\n\n") + "\n";
}

const runCommand = (command, args) => spawnSync(command, args, { stdio: "inherit" });
const readConfiguration = () => {
  if (!statSync(keyring).isFile()) throw new Error("Ubuntu archive keyring is missing");
  return { os: readFileSync("/etc/os-release", "utf8"), source: readFileSync(sourcePath, "utf8") };
};

export function ensureFfprobe({ run = runCommand, configuration = readConfiguration,
  platform = process.platform, arch = process.arch } = {}) {
  const initial = run("ffprobe", ["-version"]);
  if (initial.status === 0) return "preinstalled";
  if (initial.error?.code !== "ENOENT") throw new Error("Existing ffprobe could not execute");
  const { os, source } = configuration();
  if (platform !== "linux" || arch !== "x64" || !/^ID=ubuntu$/m.test(os) || !/^VERSION_ID="24\.04"$/m.test(os)) {
    throw new Error("ffprobe installation supports the Ubuntu 24.04 amd64 runner only");
  }
  const fallback = fallbackSources(source);
  const directory = mkdtempSync(join(tmpdir(), "robys-ffprobe-"));
  chmodSync(directory, 0o755);
  try {
    const archives = join(directory, "archives"), sourceparts = join(directory, "sourceparts");
    for (const path of [archives, sourceparts]) mkdirSync(path, { mode: 0o755 });
    const prepare = (name, contents) => {
      const file = join(directory, `${name}.sources`), lists = join(directory, `${name}-lists`);
      writeFileSync(file, contents, { mode: 0o644 }); mkdirSync(lists, { mode: 0o755 });
      return ["-o", `Dir::Etc::sourcelist=${file}`, "-o", `Dir::Etc::sourceparts=${sourceparts}`, "-o", `Dir::State::lists=${lists}`,
        "-o", `Dir::Cache::archives=${archives}`, "-o", "Acquire::Retries=0", "-o", "Acquire::http::Timeout=20",
        "-o", "Acquire::https::Timeout=20", "-o", "Acquire::AllowInsecureRepositories=false",
        "-o", "Acquire::AllowDowngradeToInsecureRepositories=false", "-o", "APT::Get::AllowUnauthenticated=false"];
    };
    const apt = (options, args, seconds) => run("sudo", ["-n", "env", "DEBIAN_FRONTEND=noninteractive", ...(seconds ?
      ["timeout", "--signal=TERM", "--kill-after=5s", `${seconds}s`] : []), "apt-get", ...options, ...args]);
    const download = (options, seconds) => apt(options, ["-o", "APT::Update::Error-Mode=any", "update"], 45).status === 0
      && apt(options, ["install", "--download-only", "--no-install-recommends", "-y", "ffmpeg"], seconds).status === 0;
    let options = prepare("primary", source), selected = "primary";
    if (!download(options, 90)) {
      console.log("Primary Ubuntu download did not complete; trying the official archive once.");
      options = prepare("fallback", fallback); selected = "fallback";
      if (!download(options, 180)) throw new Error("Both bounded signed Ubuntu downloads failed");
    }
    // No download and no local timer here: do not interrupt dpkg to switch mirrors.
    if (apt(options, ["install", "--no-download", "--no-install-recommends", "-y", "ffmpeg"]).status !== 0) {
      throw new Error("Downloaded ffmpeg could not be installed");
    }
    if (run("ffprobe", ["-version"]).status !== 0) throw new Error("ffprobe is unavailable after installation");
    return selected;
  } finally {
    try { rmSync(directory, { recursive: true, force: true }); }
    catch { console.log(`Isolated APT state retained at ${directory}`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) ensureFfprobe();
