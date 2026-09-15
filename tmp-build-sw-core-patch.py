from pathlib import Path

path = Path('scripts/build.mjs')
text = path.read_text()

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
if old_read not in text:
    if 'let serviceWorkerCacheSource = serviceWorkerUsesCore' not in text:
        raise SystemExit('service worker read anchor missing')
else:
    text = text.replace(old_read, new_read, 1)

old_loop = '  serviceWorker = synchronizeServiceWorkerAsset(serviceWorker, filePath, revision);\n}\nwriteFileSync("sw.js", serviceWorker);'
new_loop = '''  serviceWorkerCacheSource = synchronizeServiceWorkerAsset(serviceWorkerCacheSource, filePath, revision);
}
if (serviceWorkerUsesCore) {
  writeFileSync(serviceWorkerCorePath, serviceWorkerCacheSource);
} else {
  writeFileSync("sw.js", serviceWorkerCacheSource);
}'''
if old_loop not in text:
    if 'writeFileSync(serviceWorkerCorePath, serviceWorkerCacheSource);' not in text:
        raise SystemExit('service worker loop/write anchor missing')
else:
    text = text.replace(old_loop, new_loop, 1)

path.write_text(text)
