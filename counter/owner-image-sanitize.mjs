// Decode and re-encode every uploaded owner photograph before it reaches private storage.
// No raw image file, metadata or client-provided filename is retained.
import sharp from "sharp";

const MAX_RAW_BYTES = 4 * 1024 * 1024;
const MAX_ENCODED_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_EDGE = 1600;
const allowed = new Set(["png", "jpeg", "webp"]);
const hasMetadata = info => Boolean(info.exif || info.xmp || info.iptc || info.icc);

export async function sanitizeOwnerImage(input) {
  if (!Buffer.isBuffer(input) || input.length < 40 || input.length > MAX_RAW_BYTES)
    throw new Error("Invalid owner image byte size");

  const decoder = sharp(input, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
    sequentialRead: true
  });
  let meta;
  try {
    meta = await decoder.metadata();
  } catch {
    throw new Error("Image could not be decoded");
  }
  if (!allowed.has(meta.format) || !Number.isInteger(meta.width) ||
      !Number.isInteger(meta.height) || meta.width < 64 || meta.height < 64 ||
      meta.width > 8192 || meta.height > 8192 ||
      meta.width * meta.height > MAX_INPUT_PIXELS ||
      (meta.pages && meta.pages !== 1) ||
      (meta.delay && meta.delay.length > 1)) {
    throw new Error("Unsupported image format, dimensions or animation");
  }

  // Sharp discards EXIF/GPS, XMP, IPTC and ICC unless explicitly preserved.
  // rotate applies orientation before the metadata is discarded.
  let buffer;
  try {
    buffer = await decoder.rotate()
      .resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE,
        fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80, effort: 4, smartSubsample: true })
      .toBuffer();
  } catch {
    throw new Error("Image normalization failed");
  }
  if (buffer.length > MAX_ENCODED_BYTES) throw new Error("Encoded image exceeds allowed size");
  const normalized = await sharp(buffer, {
    failOn: "error", limitInputPixels: MAX_INPUT_PIXELS
  }).metadata();
  if (normalized.format !== "webp" || !Number.isInteger(normalized.width) ||
      !Number.isInteger(normalized.height) || normalized.width > MAX_OUTPUT_EDGE ||
      normalized.height > MAX_OUTPUT_EDGE || hasMetadata(normalized) ||
      (normalized.pages && normalized.pages !== 1))
    throw new Error("Encoded image integrity or metadata violation");

  return Object.freeze({
    buffer, ext: "webp", mime: "image/webp",
    width: normalized.width, height: normalized.height, bytes: buffer.length
  });
}
