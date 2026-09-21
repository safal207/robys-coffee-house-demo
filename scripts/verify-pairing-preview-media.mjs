import { readFileSync } from "node:fs";

const path = "src/products/sets-v1/iced-san-sebastian-pairing-preview.mp4";
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

console.log(JSON.stringify({
  file: path,
  bytes: bytes.length,
  boxes,
  codecMarker: "avc1",
  status: "PASS"
}, null, 2));
