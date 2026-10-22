import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { installSignedUbuntuPackages } from "./signed-ubuntu-packages.mjs";

const require = createRequire(import.meta.url);
const engines = ["chromium", "firefox", "webkit"];
const runCommand = (command, args) => spawnSync(command, args, { stdio: "inherit" });

export function installedPlaywright() {
  const core = dirname(require.resolve("playwright-core/package.json"));
  const browserPackage = dirname(require.resolve("playwright/package.json"));
  const version = require(join(core, "package.json")).version;
  if (version !== "1.55.1" || require(join(browserPackage, "package.json")).version !== version) {
    throw new Error("Playwright prerequisites require the reviewed locked version 1.55.1");
  }
  return { version, cli: join(browserPackage, "cli.js"),
    dependencies: require(join(core, "lib/server/registry/nativeDeps.js")).deps?.["ubuntu24.04-x64"] };
}

export function playwrightPackages(browsers, installation = installedPlaywright()) {
  if (!Array.isArray(browsers) || !browsers.length || new Set(browsers).size !== browsers.length
    || browsers.some(browser => !engines.includes(browser))) throw new Error("Invalid Playwright browser selection");
  if (installation.version !== "1.55.1") throw new Error("Unsupported Playwright prerequisite version");
  // Use the installed version's canonical native package data, including tools.
  // Tests compare every engine subset with its public install-deps --dry-run.
  const groups = [...browsers, "tools"].map(group => installation.dependencies?.[group]);
  if (groups.some(group => !Array.isArray(group) || !group.length)) throw new Error("Missing canonical Playwright dependencies");
  const packages = [...new Set(groups.flat())];
  if (packages.some(name => typeof name !== "string" || !/^[a-z0-9][a-z0-9+.-]{0,100}$/.test(name))) {
    throw new Error("Invalid canonical Playwright package name");
  }
  return packages;
}

export function ensurePlaywrightBrowsers(browsers, { run = runCommand, installation = installedPlaywright(),
  ...transport } = {}) {
  const packages = playwrightPackages(browsers, installation);
  console.log(`Playwright ${installation.version}: ${browsers.join(", ")}; ${packages.length} canonical host packages.`);
  const source = installSignedUbuntuPackages(packages, { ...transport, run });
  // All host packages were installed above; retain the same browser downloads
  // and Playwright host validation, without starting another unbounded APT run.
  const result = run(process.execPath, [installation.cli, "install", ...browsers]);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Playwright browser installation failed");
  return { source, browsers: [...browsers], packageCount: packages.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  ensurePlaywrightBrowsers(process.argv.slice(2));
}
