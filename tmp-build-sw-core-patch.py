from pathlib import Path

# 1) Build: synchronize the cache-bearing service-worker core when sw.js is a thin loader.
build = Path('scripts/build.mjs')
text = build.read_text()
old_read = 'let serviceWorker = readFileSync("sw.js", "utf8");\nserviceWorker = synchronizeServiceWorker(\n  serviceWorker,\n'
new_read = '''let serviceWorker = readFileSync("sw.js", "utf8");
const serviceWorkerCorePath = "sw-core-v64.js";
const serviceWorkerUsesCore = /importScripts\\(["']\\.\\/sw-core-v64\\.js["']\\)/.test(serviceWorker);
let serviceWorkerCacheSource = serviceWorkerUsesCore
  ? readFileSync(serviceWorkerCorePath, "utf8")
  : serviceWorker;
serviceWorkerCacheSource = synchronizeServiceWorker(
  serviceWorkerCacheSource,
'''
if old_read in text:
    text = text.replace(old_read, new_read, 1)
elif 'let serviceWorkerCacheSource = serviceWorkerUsesCore' not in text:
    raise SystemExit('service worker read anchor missing')

old_loop = '  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);\n}\nwriteFileSync("sw.js", serviceWorker);'
new_loop = '''  serviceWorkerCacheSource = synchronizeServiceWorkerAsset(serviceWorkerCacheSource, filePath, revision);
}
if (serviceWorkerUsesCore) {
  writeFileSync(serviceWorkerCorePath, serviceWorkerCacheSource);
} else {
  writeFileSync("sw.js", serviceWorkerCacheSource);
}'''
if old_loop in text:
    text = text.replace(old_loop, new_loop, 1)
elif 'writeFileSync(serviceWorkerCorePath, serviceWorkerCacheSource);' not in text:
    raise SystemExit('service worker loop/write anchor missing')
build.write_text(text)

# 2) Shared verifier helper: effective worker source = loader plus imported cache core.
helper = Path('scripts/service-worker-source.mjs')
helper.write_text('''import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function readEffectiveServiceWorkerSource(root = process.cwd()) {
  const loaderPath = path.join(root, "sw.js");
  const loader = readFileSync(loaderPath, "utf8");
  const importedCore = loader.match(/importScripts\\(["']\\.\\/([^"']+)["']\\)/)?.[1];
  if (!importedCore) return loader;

  const corePath = path.join(root, importedCore);
  if (!existsSync(corePath)) {
    throw new Error(`Service worker imports missing core: ${importedCore}`);
  }
  return `${loader}\n${readFileSync(corePath, "utf8")}`;
}
''')

# 3) Content/cache verifiers should inspect the effective worker, not only the thin loader.
targets = {
  'scripts/verify-menu-share.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/test-photo-logo.mjs': [
    ('const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-smart-choice-release.mjs': [
    ('const serviceWorker = read("sw.js");', 'const serviceWorker = readEffectiveServiceWorkerSource();'),
    ('''const serviceWorkerLoader = read("sw.js");
const serviceWorker = serviceWorkerLoader.includes('importScripts("./sw-core-v64.js")')
  ? read("sw-core-v64.js")
  : serviceWorkerLoader;''', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-android-download.mjs': [
    ('const sw = readFileSync("sw.js", "utf8");', 'const sw = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-security-contracts.mjs': [
    ('const serviceWorker = read("sw.js");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/test-discover-deck.mjs': [
    ('const swSource = readFileSync(resolve(root, "sw.js"), "utf8");', 'const swSource = readEffectiveServiceWorkerSource(root);')
  ],
  'scripts/verify-taste-journey-posters.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-brand-identity-assets.mjs': [
    ('const sw = read("sw.js");', 'const sw = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-menu-image-assets.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-pr140-release-blockers.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-menu-truth-live.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-menu-order.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/test-brand-wordmark.mjs': [
    ('const serviceWorker = read("sw.js");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-regression-contracts.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
  'scripts/verify-entry-handoff.mjs': [
    ('const serviceWorker = readFileSync("sw.js", "utf8");', 'const serviceWorker = readEffectiveServiceWorkerSource();')
  ],
}

import_line = 'import { readEffectiveServiceWorkerSource } from "./service-worker-source.mjs";\n'
for filename, replacements in targets.items():
  p = Path(filename)
  source = p.read_text()
  changed = False
  for old, new in replacements:
    if old in source:
      source = source.replace(old, new, 1)
      changed = True
      break
  if not changed and 'readEffectiveServiceWorkerSource(' not in source:
    raise SystemExit(f'SW reader anchor missing in {filename}')
  if import_line.strip() not in source:
    source = import_line + source
  p.write_text(source)
