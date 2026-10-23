import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { installSignedUbuntuPackages } from "./signed-ubuntu-packages.mjs";
export { fallbackSources } from "./signed-ubuntu-packages.mjs";

const runCommand = (command, args) => spawnSync(command, args, { stdio: "inherit" });

export function ensureFfprobe({ run = runCommand, ...installation } = {}) {
  const initial = run("ffprobe", ["-version"]);
  if (initial.status === 0) return "preinstalled";
  if (initial.error?.code !== "ENOENT") throw new Error("Existing ffprobe could not execute");
  const selected = installSignedUbuntuPackages(["ffmpeg"], { ...installation, run });
  if (run("ffprobe", ["-version"]).status !== 0) throw new Error("ffprobe is unavailable after installation");
  return selected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) ensureFfprobe();
