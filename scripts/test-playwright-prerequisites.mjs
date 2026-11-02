import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ensurePlaywrightBrowsers, installedPlaywright, playwrightPackages } from "./ensure-playwright-browsers.mjs";
import { installSignedUbuntuPackages } from "./signed-ubuntu-packages.mjs";

const installation = installedPlaywright();
const engines = ["chromium", "firefox", "webkit"];
const source = `# Generated Ubuntu sources\n\nTypes: deb
URIs: mirror+file:/etc/apt/apt-mirrors.txt
Suites: noble noble-updates noble-backports noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`;
const os = 'ID=ubuntu\nVERSION_ID="24.04"\n';
const sorted = values => [...values].sort();
const canonical = browsers => {
  const dryRun = execFileSync(process.execPath, [installation.cli, "install-deps", "--dry-run", ...browsers], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: "ubuntu24.04-x64" }
  });
  const packages = /apt-get install -y --no-install-recommends ([a-z0-9+. -]+)"\s*$/.exec(dryRun)?.[1].split(" ");
  assert(packages?.length, "The locked CLI must report its complete Ubuntu 24.04 package command");
  return packages;
};

for (let mask = 1; mask < 8; mask++) {
  const browsers = engines.filter((_, index) => mask & (1 << index));
  test(`canonical installed CLI package parity: ${browsers.join(" + ")}`, () => {
    assert.deepEqual(sorted(playwrightPackages(browsers)), sorted(canonical(browsers)));
  });
}

function fixture({ browsers = ["webkit"], downloads = [0], updates = [0, 0], install = 0,
  browserDownload = 0, contents = source, platform = "linux", arch = "x64" } = {}) {
  const calls = []; let nextDownload = 0, nextUpdate = 0;
  const run = (command, args) => {
    const call = { command, args }; calls.push(call);
    if (command === process.execPath) {
      assert.deepEqual(args, [installation.cli, "install", ...browsers]);
      return { status: browserDownload };
    }
    assert.equal(command, "sudo");
    assert.deepEqual(args.slice(0, 3), ["-n", "env", "DEBIAN_FRONTEND=noninteractive"]);
    assert(args.includes("Acquire::AllowInsecureRepositories=false"));
    assert(args.includes("Acquire::AllowDowngradeToInsecureRepositories=false"));
    assert(args.includes("APT::Get::AllowUnauthenticated=false"));
    const file = args.find(value => value.startsWith("Dir::Etc::sourcelist="));
    call.source = readFileSync(file.slice(file.indexOf("=") + 1), "utf8");
    if (args.includes("--download-only")) return { status: downloads[nextDownload++] };
    if (args.includes("--no-download")) { assert(!args.includes("timeout")); return { status: install }; }
    assert(args.includes("update") && args.includes("45s") && args.includes("--kill-after=5s"));
    return { status: updates[nextUpdate++] };
  };
  return { calls, execute: () => ensurePlaywrightBrowsers(browsers, { run, installation,
    configuration: () => ({ os, source: contents }), platform, arch }) };
}

test("all canonical host packages install before the unchanged local browser command", () => {
  const browsers = ["chromium", "firefox", "webkit"], expected = sorted(canonical(browsers));
  const f = fixture({ browsers }); assert.equal(f.execute().source, "primary");
  assert.equal(f.calls.length, 4);
  for (const call of f.calls.filter(call => call.args.includes("install") && call.command === "sudo")) {
    assert.deepEqual(sorted(call.args.slice(call.args.indexOf("-y") + 1)), expected);
  }
  assert(f.calls[1].args.includes("90s") && f.calls[1].args.includes("--download-only"));
  assert(f.calls[2].args.includes("--no-download"));
  assert.equal(f.calls[3].command, process.execPath);
});

test("a download deadline switches once to signed isolated fallback before offline install and browser download", () => {
  const f = fixture({ downloads: [124, 0] }); assert.equal(f.execute().source, "fallback");
  assert.equal(f.calls.length, 6);
  assert(f.calls[1].args.includes("90s") && f.calls[1].args.includes("--kill-after=5s"));
  assert(f.calls[3].args.includes("180s") && f.calls[3].args.includes("--kill-after=5s"));
  assert.equal(f.calls[0].source, source);
  assert.equal(f.calls[2].source, source.slice(source.indexOf("Types: deb"))
    .replace("mirror+file:/etc/apt/apt-mirrors.txt", "https://archive.ubuntu.com/ubuntu/"));
  const lists = f.calls.filter(call => call.args.includes("update")).map(call => call.args.find(arg => arg.startsWith("Dir::State::lists=")));
  assert.notEqual(lists[0], lists[1]);
  assert(f.calls[4].args.includes("--no-download"));
  assert.equal(f.calls[5].command, process.execPath);
});

test("failed downloads, index refreshes or offline installation cannot start a browser download", () => {
  for (const options of [{ downloads: [124, 100] }, { updates: [100, 100] }, { install: 100 }]) {
    const f = fixture(options); assert.throws(f.execute, /failed|could not be installed/);
    assert(!f.calls.some(call => call.command === process.execPath));
    if (options.install === undefined) assert(!f.calls.some(call => call.args.includes("--no-download")));
  }
});

test("unsigned sources and unsupported platforms fail before APT or browser processes", () => {
  for (const options of [{ contents: source.replace(/^Signed-By:.*\n/m, "") }, { platform: "darwin" }, { arch: "arm64" }]) {
    const f = fixture(options); assert.throws(f.execute, /unsigned|amd64 runner only/);
    assert.deepEqual(f.calls, []);
  }
});

test("browser installation failure remains a failure with no retry", () => {
  const f = fixture({ browserDownload: 77 }); assert.throws(f.execute, /browser installation failed/);
  assert.equal(f.calls.filter(call => call.command === process.execPath).length, 1);
});

test("browser enums, installed version and canonical package shapes fail closed", () => {
  for (const browsers of [[], ["chromium", "chromium"], ["chromium; echo unsafe"], ["chrome"], "webkit"]) {
    assert.throws(() => playwrightPackages(browsers), /Invalid Playwright browser selection/);
  }
  assert.throws(() => playwrightPackages(["chromium"], { ...installation, version: "1.56.0" }), /version/);
  assert.throws(() => playwrightPackages(["chromium"], { ...installation, dependencies: {} }), /Missing canonical/);
  assert.throws(() => playwrightPackages(["chromium"], { ...installation,
    dependencies: { chromium: ["--allow-unauthenticated"], tools: ["xvfb"] } }), /Invalid canonical/);
  for (const packages of [[], ["ffmpeg", "ffmpeg"], ["ffmpeg; id"], ["--allow-unauthenticated"]]) {
    assert.throws(() => installSignedUbuntuPackages(packages, { run: () => { throw new Error("Must not execute"); },
      configuration: () => { throw new Error("Must not read sources"); } }), /Invalid signed Ubuntu package selection/);
  }
});
