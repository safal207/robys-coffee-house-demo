/** Verify installed screenshot tools, not just declared dependencies.
 * A dependency-lock migration cannot reuse approvals from an older toolchain.
 * Package metadata/version identity is not a full installed-file integrity audit.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const names = ['playwright', 'pixelmatch', 'pngjs'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const exactVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);

export function verifyVersions(manifest, lock, installed) {
  assert.equal(lock.lockfileVersion, 3, 'A version-3 npm lockfile is required');
  const versions = {};
  for (const name of names) {
    const wanted = manifest.devDependencies?.[name];
    assert(exactVersion(wanted), `${name} must have an exact release pin`);
    assert.equal(lock.packages?.['']?.devDependencies?.[name], wanted, `${name}: root lock drift`);
    const locked = lock.packages?.[`node_modules/${name}`];
    assert.equal(locked?.version, wanted, `${name}: package lock drift`);
    assert(typeof locked.integrity === 'string' && locked.integrity.startsWith('sha512-'), `${name}: missing registry integrity`);
    assert.equal(installed[name]?.name, name, `${name}: missing/wrong installed package`);
    assert.equal(installed[name]?.version, wanted, `${name}: effective installed version drift`);
    versions[name] = wanted;
  }
  const [major, minor, patch] = versions.playwright.split('.').map(Number);
  assert(major > 1 || (major === 1 && (minor > 55 || (minor === 55 && patch >= 1))), 'Playwright must not regress below 1.55.1');
  assert.equal(installed.playwright.dependencies?.['playwright-core'], versions.playwright, 'Playwright core declaration drift');
  assert.equal(lock.packages?.['node_modules/playwright-core']?.version, versions.playwright, 'Playwright core lock drift');
  assert.equal(installed['playwright-core']?.name, 'playwright-core', 'Missing installed playwright-core');
  assert.equal(installed['playwright-core']?.version, versions.playwright, 'Effective playwright-core drift');
  return versions;
}

export function verifyBrowser(manifest, actualVersion) {
  const entry = manifest.browsers?.find(browser => browser.name === 'chromium-headless-shell');
  assert(entry && typeof entry.browserVersion === 'string' && /^\d+$/.test(entry.revision), 'Missing headless Chromium build binding');
  assert.equal(actualVersion, entry.browserVersion, 'Launched browser differs from locked Playwright browser manifest');
  return { browserVersion: actualVersion, revision: entry.revision, name: entry.name };
}

export function verifyMigration(first, second) {
  const keys = summary => {
    assert(Number.isInteger(summary.comparisons) && summary.comparisons > 0, 'Missing comparison count');
    assert(Array.isArray(summary.results) && summary.results.length === summary.comparisons, 'Incomplete comparison evidence');
    assert(summary.results.every(row => typeof row.passed === 'boolean' && typeof row.id === 'string' && typeof row.viewport === 'string'), 'Malformed comparison result');
    assert.equal(summary.failures, summary.results.filter(row => !row.passed).length, 'Failure count disagrees with results');
    const pairs = summary.results.map(row => `${row.id}/${row.viewport}`).sort();
    assert.equal(new Set(pairs).size, pairs.length, 'Duplicate capture evidence');
    assert.equal(summary.failures, 0, 'Toolchain changed: differences need fresh review; older approval records cannot be reused');
    return pairs;
  };
  assert.deepEqual(keys(first), keys(second), 'The two attempts cover different capture sets');
  return { comparisonsPerAttempt: first.comparisons, attempts: 2, unapprovedDifferences: 0 };
}

async function main() {
  const mode = process.argv[2] || '--packages';
  assert(['--packages', '--browser', '--comparison'].includes(mode), 'Unknown toolchain check mode');
  const root = process.cwd();
  const baseline = path.resolve(process.env.VISUAL_BASELINE_DIR || '../baseline');
  const out = path.resolve(process.env.VISUAL_TOOLCHAIN_RESULTS_DIR || 'visual-results/toolchain');
  mkdirSync(out, { recursive: true });
  const report = { mode, passed: false, node: process.version, platform: process.platform, arch: process.arch };
  let browser;
  try {
    report.sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    report.lockSha256 = sha256(readFileSync('package-lock.json'));
    report.baselineLockSha256 = sha256(readFileSync(path.join(baseline, 'package-lock.json')));
    report.toolchainChanged = report.lockSha256 !== report.baselineLockSha256;
    const require = createRequire(path.join(root, 'package.json'));
    const installed = {};
    report.packageMetadataSha256 = {};
    for (const name of [...names, 'playwright-core']) {
      const file = realpathSync(require.resolve(`${name}/package.json`));
      assert(file.startsWith(realpathSync(path.join(root, 'node_modules')) + path.sep), `${name} resolved outside this checkout`);
      installed[name] = json(file);
      report.packageMetadataSha256[name] = sha256(readFileSync(file));
    }
    report.versions = verifyVersions(json('package.json'), json('package-lock.json'), installed);
    if (mode === '--packages' && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${report.toolchainChanged}\n`);
    }
    if (mode === '--browser') {
      const browserManifestPath = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'browsers.json');
      browser = await require('playwright').chromium.launch({ headless: true });
      report.browser = verifyBrowser(json(browserManifestPath), browser.version());
      report.browserManifestSha256 = sha256(readFileSync(browserManifestPath));
    }
    if (mode === '--comparison') {
      report.migration = report.toolchainChanged
        ? verifyMigration(json('visual-results/screenshot-attempt-1/summary.json'), json('visual-results/screenshot-attempt-2/summary.json'))
        : { status: 'not-required', reason: 'Dependency lock unchanged; existing visual review gate still applies' };
    }
    report.passed = true;
  } catch (error) {
    report.error = String(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    writeFileSync(path.join(out, `${mode.slice(2)}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
