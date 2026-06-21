import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const HERO_VIDEO = "src/robys-hero-mobile-lite.mp4";
const MIN_DURATION_SECONDS = 1;
const MIN_FILE_BYTES = 20_000;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function repoPath(path) {
  return relative(ROOT, path).split(sep).join("/");
}

const sourceFiles = walk(join(ROOT, "src")).map(repoPath);
const forbidden = sourceFiles.filter((path) =>
  path === "src/hero-video-data.bin" ||
  path === "src/hero-video.ts" ||
  path.startsWith("src/hero-video-hex/") ||
  path.startsWith("src/hero-video-parts/") ||
  /hero-video.*\.(?:bin|hex|b64)$/i.test(path)
);

if (statSync(join(ROOT, "hero-video.js"), { throwIfNoEntry: false })) {
  forbidden.push("hero-video.js");
}

if (forbidden.length) {
  throw new Error(`Forbidden text/chunk video artifacts:\n${forbidden.sort().map((path) => `- ${path}`).join("\n")}`);
}

const absoluteVideo = join(ROOT, HERO_VIDEO);
const bytes = readFileSync(absoluteVideo);
if (bytes.length < MIN_FILE_BYTES) {
  throw new Error(`${HERO_VIDEO} is suspiciously small: ${bytes.length} bytes`);
}

for (const atom of ["ftyp", "moov", "mdat"]) {
  if (!bytes.includes(Buffer.from(atom))) {
    throw new Error(`${HERO_VIDEO} is missing required MP4 atom: ${atom}`);
  }
}

const probe = spawnSync("ffprobe", [
  "-v", "error",
  "-show_entries", "stream=index,codec_type,codec_name,width,height",
  "-show_entries", "format=format_name,duration,size",
  "-of", "json",
  absoluteVideo
], { encoding: "utf8" });

if (probe.error) throw probe.error;
if (probe.status !== 0) {
  throw new Error(`ffprobe failed (${probe.status}): ${probe.stderr.trim()}`);
}

const metadata = JSON.parse(probe.stdout);
const videoStreams = (metadata.streams ?? []).filter((stream) => stream.codec_type === "video");
if (videoStreams.length !== 1) {
  throw new Error(`${HERO_VIDEO} must contain exactly one video stream; found ${videoStreams.length}`);
}

const stream = videoStreams[0];
if (stream.codec_name !== "h264") {
  throw new Error(`${HERO_VIDEO} must use H.264 for broad mobile support; found ${stream.codec_name ?? "unknown"}`);
}
if (!Number.isInteger(stream.width) || stream.width <= 0 || !Number.isInteger(stream.height) || stream.height <= 0) {
  throw new Error(`${HERO_VIDEO} has invalid dimensions: ${stream.width}x${stream.height}`);
}

const duration = Number(metadata.format?.duration);
if (!Number.isFinite(duration) || duration < MIN_DURATION_SECONDS) {
  throw new Error(`${HERO_VIDEO} has invalid duration: ${metadata.format?.duration ?? "missing"}`);
}

console.log(JSON.stringify({
  file: HERO_VIDEO,
  bytes: bytes.length,
  duration,
  codec: stream.codec_name,
  width: stream.width,
  height: stream.height,
  streams: metadata.streams
}, null, 2));
