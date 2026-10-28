import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const path = process.argv[2] ?? "src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4";
const bytes = readFileSync(path);

function readBox(offset) {
  if (offset + 8 > bytes.length) throw new Error(`Truncated MP4 header at ${offset}`);
  let size = bytes.readUInt32BE(offset);
  const type = bytes.toString("ascii", offset + 4, offset + 8);

  if (size === 0) size = bytes.length - offset;
  if (size < 8 || offset + size > bytes.length) {
    throw new Error(`Invalid MP4 box ${type} at ${offset}: size=${size}, file=${bytes.length}`);
  }

  return { type, size, offset, end: offset + size };
}

const boxes = [];
let offset = 0;
while (offset < bytes.length) {
  const box = readBox(offset);
  boxes.push(box);
  offset = box.end;
}

if (offset !== bytes.length) throw new Error("MP4 does not end on a top-level box boundary");

const types = boxes.map((box) => box.type);
for (const required of ["ftyp", "moov", "mdat"]) {
  if (!types.includes(required)) throw new Error(`Missing top-level MP4 box: ${required}`);
}
if (types[0] !== "ftyp") throw new Error("ftyp must be the first top-level box");
if (types.indexOf("moov") > types.indexOf("mdat")) {
  throw new Error("moov must precede mdat for fast-start playback");
}

const mdat = boxes.find((box) => box.type === "mdat");
if (!mdat || mdat.size <= 8) throw new Error("mdat payload is empty");
if (!bytes.includes(Buffer.from("avc1", "ascii"))) {
  throw new Error("Pairing preview must advertise AVC/H.264 (avc1)");
}

// Valid-looking boxes and an avc1 marker do not prove there is a single
// decodable frame. The original broken preview passed those checks.
const probe = spawnSync("ffprobe", ["-v", "error", "-count_frames",
  "-show_entries", "stream=codec_type,codec_name,profile,level,pix_fmt,width,height,nb_read_frames,avg_frame_rate:format=duration",
  "-of", "json", path], { encoding: "utf8", timeout: 30_000 });
if (probe.error || probe.status !== 0) throw new Error(`Pairing probe failed: ${probe.error?.message ?? probe.stderr}`);
const metadata = JSON.parse(probe.stdout);
const videos = metadata.streams?.filter(stream => stream.codec_type === "video") ?? [];
const audio = metadata.streams?.filter(stream => stream.codec_type === "audio") ?? [];
if (videos.length !== 1 || audio.length !== 0) throw new Error("Pairing preview needs exactly one video stream and no audio/attached-picture streams");
const video = videos[0];
const frames = Number(video.nb_read_frames);
const duration = Number(metadata.format?.duration);
const [numerator, denominator] = String(video.avg_frame_rate).split("/").map(Number);
const expectedFrames = duration * numerator / denominator;
if (video.codec_name !== "h264" || video.pix_fmt !== "yuv420p"
  || !["Constrained Baseline", "Baseline"].includes(video.profile) || !Number.isInteger(video.level) || video.level > 31
  || !Number.isInteger(video.width) || video.width <= 0 || video.width % 2
  || !Number.isInteger(video.height) || video.height <= 0 || video.height % 2
  || !Number.isFinite(duration) || duration <= 0
  || !Number.isFinite(expectedFrames) || expectedFrames < 2
  || !Number.isInteger(frames) || frames < 2 || frames < Math.floor(expectedFrames) - 1) {
  throw new Error(`Pairing preview has incomplete/undecodable video: ${JSON.stringify({ video, duration, expectedFrames })}`);
}
const decoded = spawnSync("ffmpeg", ["-v", "error", "-xerror", "-err_detect", "explode",
  "-i", path, "-map", "0:v:0", "-an", "-f", "null", "-"], { encoding: "utf8", timeout: 30_000 });
if (decoded.error || decoded.status !== 0 || decoded.stderr.trim()) {
  throw new Error(`Pairing frame decode failed: ${decoded.error?.message ?? decoded.stderr}`);
}

console.log(JSON.stringify({
  file: path,
  bytes: bytes.length,
  boxes,
  codecMarker: "avc1",
  decodedFrames: frames,
  duration,
  width: video.width,
  height: video.height,
  profile: video.profile,
  status: "PASS"
}, null, 2));
