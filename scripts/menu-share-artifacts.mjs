import { readdirSync, realpathSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// These flat directories contain generated output only. Never recurse or follow
// links when removing an obsolete catalog page/photo.
export function pruneShareArtifacts(directory, expectedNames, extension) {
  const root = realpathSync(process.cwd());
  const output = realpathSync(resolve(directory));
  if (!output.startsWith(root + sep)) throw new Error("Share output must remain inside the repository");
  const expected = new Set(expectedNames);
  for (const entry of readdirSync(output, { withFileTypes: true })) {
    if (!entry.name.endsWith(extension) || expected.has(entry.name)) continue;
    if (!entry.isFile()) throw new Error(`Unexpected link/directory in share output: ${entry.name}`);
    unlinkSync(join(output, entry.name));
  }
}
