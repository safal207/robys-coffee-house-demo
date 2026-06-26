import { readFileSync, writeFileSync } from "node:fs";

const edits = [
  {
    path: "src/featured-gallery.ts",
    before: '  if (index === 0) image.fetchPriority = "high";',
    after: '  if (index === 0) image.fetchPriority = "low";'
  },
  {
    path: "featured-gallery.js",
    before: '        image.fetchPriority = "high";',
    after: '        image.fetchPriority = "low";'
  },
  {
    path: "index.html",
    before: 'loading="eager" decoding="async" fetchpriority="high"',
    after: 'loading="eager" decoding="async" fetchpriority="low"'
  }
];

for (const { path, before, after } of edits) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected text not found in ${path}`);
  writeFileSync(path, source.replace(before, after));
}
