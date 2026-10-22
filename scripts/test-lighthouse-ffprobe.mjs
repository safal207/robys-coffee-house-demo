import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { ensureFfprobe, fallbackSources } from "./ensure-lighthouse-ffprobe.mjs";

const source = `Types: deb
URIs: mirror+file:/etc/apt/apt-mirrors.txt
Suites: noble noble-updates noble-backports
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: http://security.ubuntu.com/ubuntu/
Suites: noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;
const os = 'ID=ubuntu\nVERSION_ID="24.04"\n';
const missing = () => ({ status: null, error: { code: "ENOENT" } });
function fixture({ downloadStatuses = [0], updateStatuses = [0, 0], installStatus = 0, finalProbe = 0, contents = source, platform = "linux", arch = "x64" } = {}) {
  const calls = []; let probes = 0, downloads = 0, updates = 0;
  const run = (command, args) => {
    const call = { command, args }; calls.push(call);
    if (command === "ffprobe") return probes++ ? { status: finalProbe } : missing();
    assert.equal(command, "sudo"); assert.deepEqual(args.slice(0, 3), ["-n", "env", "DEBIAN_FRONTEND=noninteractive"]);
    const sourceOption = args.find(value => value.startsWith("Dir::Etc::sourcelist="));
    call.source = readFileSync(sourceOption.slice(sourceOption.indexOf("=") + 1), "utf8");
    const parts = args.find(value => value.startsWith("Dir::Etc::sourceparts="));
    assert.deepEqual(readdirSync(parts.slice(parts.indexOf("=") + 1)), []);
    assert(args.includes("Acquire::AllowInsecureRepositories=false"));
    assert(args.includes("APT::Get::AllowUnauthenticated=false"));
    if (args.includes("--download-only")) return { status: downloadStatuses[downloads++] };
    if (args.includes("--no-download")) { assert(!args.includes("timeout")); return { status: installStatus }; }
    assert(args.includes("timeout") && args.includes("--kill-after=5s") && args.includes("update"));
    assert(args.includes("APT::Update::Error-Mode=any"));
    return { status: updateStatuses[updates++] };
  };
  return { calls, execute: () => ensureFfprobe({ run, configuration: () => ({ os, source: contents }), platform, arch }) };
}

test("working preinstalled ffprobe skips configuration, sudo and APT exactly", () => {
  const calls = [];
  assert.equal(ensureFfprobe({ run: (...args) => { calls.push(args); return { status: 0 }; },
    configuration: () => { throw new Error("Configuration must not be read"); } }), "preinstalled");
  assert.deepEqual(calls, [["ffprobe", ["-version"]]]);
});
test("primary full download precedes offline installation without modifying source metadata", () => {
  const f = fixture(); assert.equal(f.execute(), "primary");
  assert.equal(f.calls.length, 5); assert.equal(f.calls[1].source, source);
  assert(f.calls[2].args.includes("90s")); assert(f.calls[2].args.includes("--download-only"));
  assert(f.calls[3].args.includes("--no-download"));
});
test("a timed-out download gets one isolated official fallback, preserving signed suites and security source", () => {
  const f = fixture({ downloadStatuses: [124, 0] }); assert.equal(f.execute(), "fallback");
  assert.equal(f.calls.filter(call => call.args.includes("--download-only")).length, 2);
  assert(f.calls[4].args.includes("180s"));
  assert.equal(f.calls[3].source, source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://archive.ubuntu.com/ubuntu/"));
  const lists = f.calls.filter(call => call.args.includes("update")).map(call => call.args.find(value => value.startsWith("Dir::State::lists=")));
  assert.notEqual(lists[0], lists[1]);
  assert.equal(f.calls.filter(call => call.args.includes("--no-download")).length, 1);
});
test("unsigned, trust-overridden, unsupported mirrors and suites fail before any sudo operation", () => {
  for (const contents of [source.replace(/^Signed-By:.*\n/m, ""), source + "Trusted: yes\n",
    source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://untrusted.example/ubuntu/"),
    source.replace("noble-updates", "resolute-updates")]) {
    const f = fixture({ contents }); assert.throws(f.execute, /Unsupported|unsigned/);
    assert.equal(f.calls.length, 1);
  }
  assert.throws(() => fixture({ arch: "arm64" }).execute(), /amd64 runner only/);
});
test("two failed downloads cannot start installation or produce a passing probe", () => {
  const f = fixture({ downloadStatuses: [124, 100] }); assert.throws(f.execute, /Both bounded/);
  assert.equal(f.calls.filter(call => call.args.includes("--download-only")).length, 2);
  assert(!f.calls.some(call => call.args.includes("--no-download")));
  assert.equal(f.calls.filter(call => call.command === "ffprobe").length, 1);
});
test("failed authenticated index refreshes cannot be ignored or start a package install", () => {
  const f = fixture({ updateStatuses: [100, 100] }); assert.throws(f.execute, /Both bounded/);
  assert.equal(f.calls.filter(call => call.args.includes("update")).length, 2);
  assert(!f.calls.some(call => call.args.includes("install")));
});
test("installation failure or absent final ffprobe remains a hard failure", () => {
  assert.throws(() => fixture({ installStatus: 100 }).execute(), /could not be installed/);
  assert.throws(() => fixture({ finalProbe: null }).execute(), /unavailable after installation/);
});
test("direct Azure URI fallback changes only the verified archive URI", () => {
  assert.equal(fallbackSources(source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "http://azure.archive.ubuntu.com/ubuntu/")),
    source.replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://archive.ubuntu.com/ubuntu/"));
});
test("both pinned Ubuntu workflows use the helper before their unchanged media and Lighthouse checks", () => {
  for (const [file, lighthouse] of [["lighthouse-build-smoke.yml", "lighthouserc.refresh-smoke.cjs"],
    ["lighthouse-profile.yml", "run-lighthouse-profile.mjs"]]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    assert.match(workflow, /runs-on: ubuntu-24\.04\b/);
    const setup = workflow.indexOf("node scripts/ensure-lighthouse-ffprobe.mjs");
    assert(setup >= 0 && workflow.indexOf("npm run verify:media") > setup);
    assert(workflow.indexOf(lighthouse) > workflow.indexOf("npm run verify:media"));
  }
});
