import {
  closeSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ACTIVE_HERO_PATH,
  MIN_FILE_BYTES,
  MAX_FILE_BYTES,
  MAX_DURATION_SECONDS,
  MAX_EDGE_PIXELS,
  MAX_PIXEL_AREA,
  fileReference,
} from "./media-contract-config.mjs";

const ROOT = process.cwd();
const override = process.argv[2] ?? process.env.HERO_VIDEO_PATH;
const HERO_VIDEO = override ? fileReference(override, "hero override") : ACTIVE_HERO_PATH;
if (override && HERO_VIDEO !== ACTIVE_HERO_PATH) {
  throw new Error(`Hero override must target the active hero video: ${ACTIVE_HERO_PATH}`);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const current = join(dir, entry.name);
    return entry.isDirectory() ? walk(current) : [current];
  });
}

function repoPath(value) {
  return relative(ROOT, value).split(sep).join("/");
}

function boxesOf(buffer) {
  const boxes = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error(`Truncated MP4 header at ${offset}`);
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > buffer.length) throw new Error(`Truncated extended box ${type}`);
      const big = buffer.readBigUInt64BE(offset + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Box ${type} too large`);
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    if (size < header || offset + size > buffer.length) throw new Error(`Invalid MP4 box ${type} at ${offset}`);
    boxes.push({ type, size, payloadSize: size - header });
    offset += size;
  }
  return boxes;
}

const sourceFiles = walk(join(ROOT, "src")).map(repoPath);
const forbidden = sourceFiles.filter((value) =>
  value === "src/hero-video-data.bin" ||
  value === "src/hero-video.ts" ||
  value.startsWith("src/hero-video-hex/") ||
  value.startsWith("src/hero-video-parts/") ||
  /hero-video.*\.(?:bin|hex|b64)$/i.test(value)
);
if (statSync(join(ROOT, "hero-video.js"), { throwIfNoEntry: false })) forbidden.push("hero-video.js");
if (forbidden.length) {
  throw new Error(`Forbidden text/chunk video artifacts:\n${forbidden.sort().map((value) => `- ${value}`).join("\n")}`);
}

const absoluteVideo = resolve(ROOT, HERO_VIDEO);
const relativeVideo = relative(ROOT, absoluteVideo);
if (relativeVideo === ".." || relativeVideo.startsWith(`..${sep}`)) {
  throw new Error(`Hero path must stay inside repository: ${HERO_VIDEO}`);
}

let descriptor;
let bytes;
try {
  descriptor = openSync(absoluteVideo, "r");
  const fileStat = fstatSync(descriptor);
  if (!fileStat.isFile()) throw new Error(`Hero video is not a regular file: ${HERO_VIDEO}`);
  bytes = readFileSync(descriptor);
} catch (error) {
  if (error?.code === "ENOENT") throw new Error(`Hero video not found: ${HERO_VIDEO}`);
  throw error;
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
}

if (bytes.length < MIN_FILE_BYTES) throw new Error(`${HERO_VIDEO} is suspiciously small: ${bytes.length}`);
if (bytes.length > MAX_FILE_BYTES) throw new Error(`${HERO_VIDEO} exceeds ${MAX_FILE_BYTES} bytes: ${bytes.length}`);
const boxes = boxesOf(bytes);
for (const type of ["ftyp", "moov", "mdat"]) {
  if (!boxes.some((box) => box.type === type)) throw new Error(`${HERO_VIDEO} is missing top-level box ${type}`);
}
const mdatPayloadBytes = boxes.filter((box) => box.type === "mdat").reduce((sum, box) => sum + box.payloadSize, 0);
if (mdatPayloadBytes <= 0) throw new Error(`${HERO_VIDEO} has an empty mdat payload`);

const probeDirectory = mkdtempSync(join(tmpdir(), "robys-ffprobe-"));
const probePath = join(probeDirectory, "hero.mp4");
let probe;
try {
  writeFileSync(probePath, bytes, { flag: "wx", mode: 0o600 });
  const probeStat = statSync(probePath);
  if (!probeStat.isFile() || probeStat.size !== bytes.length) {
    throw new Error(`Temporary ffprobe copy does not match trusted hero bytes: ${probeStat.size}/${bytes.length}`);
  }
  probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,codec_name,width,height",
    "-show_entries", "format=format_name,duration,size",
    "-of", "json",
    probePath,
  ], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
} finally {
  rmSync(probeDirectory, { recursive: true, force: true });
}
if (probe.error) throw probe.error;
if (probe.status !== 0) throw new Error(`ffprobe failed (${probe.status}): ${probe.stderr.trim()}`);

const metadata = JSON.parse(probe.stdout);
const streams = metadata.streams ?? [];
const videoStreams = streams.filter((stream) => stream.codec_type === "video");
const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
if (videoStreams.length !== 1) throw new Error(`${HERO_VIDEO} must contain exactly one video stream; found ${videoStreams.length}`);
if (audioStreams.length) throw new Error(`${HERO_VIDEO} must not contain audio; found ${audioStreams.length}`);
const stream = videoStreams[0];
if (stream.codec_name !== "h264") throw new Error(`${HERO_VIDEO} must use H.264; found ${stream.codec_name ?? "unknown"}`);
if (!Number.isInteger(stream.width) || stream.width <= 0 || !Number.isInteger(stream.height) || stream.height <= 0) {
  throw new Error(`${HERO_VIDEO} has invalid dimensions`);
}
if (stream.width > MAX_EDGE_PIXELS || stream.height > MAX_EDGE_PIXELS || stream.width * stream.height > MAX_PIXEL_AREA) {
  throw new Error(`${HERO_VIDEO} exceeds the resolution budget: ${stream.width}x${stream.height}`);
}
const duration = Number(metadata.format?.duration);
if (!Number.isFinite(duration) || duration < 1 || duration > MAX_DURATION_SECONDS) {
  throw new Error(`${HERO_VIDEO} has invalid duration: ${metadata.format?.duration ?? "unknown"}`);
}

console.log(JSON.stringify({
  file: repoPath(absoluteVideo),
  bytes: bytes.length,
  minBytes: MIN_FILE_BYTES,
  maxBytes: MAX_FILE_BYTES,
  duration,
  maxDuration: MAX_DURATION_SECONDS,
  codec: stream.codec_name,
  width: stream.width,
  height: stream.height,
  videoStreams: 1,
  audioStreams: 0,
  boxes: { ftyp: true, moov: true, mdat: true, mdatPayloadBytes },
}, null, 2));
