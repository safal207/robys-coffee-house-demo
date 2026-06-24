import { createHash } from "node:crypto";

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function comparePublishedBytes(bytes, entry) {
  const actual = { bytes: bytes.byteLength, sha256: digest(bytes) };
  if (actual.bytes === entry.bytes && actual.sha256 === entry.sha256) {
    return { passed: true, actual, canonicalization: null };
  }

  const hostMayStripTerminalLf = entry.path.endsWith(".html") && bytes.byteLength + 1 === entry.bytes;
  if (hostMayStripTerminalLf) {
    const restored = Buffer.concat([bytes, Buffer.from("\n")]);
    if (digest(restored) === entry.sha256) {
      return {
        passed: true,
        actual,
        canonicalization: "terminal_lf_restored"
      };
    }
  }

  return { passed: false, actual, canonicalization: null };
}
