/**
 * Verify the effective visual-regression toolchain, not only package declarations.
 * A dependency-lock migration cannot silently reuse evidence from an older browser/tool set.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolNames = ['playwright', 'pixelmatch', 'pngjs'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const isExactVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);

function resolveLockedDependency(packages, from, name) {
  // npm v3 package keys are POSIX paths, including on Windows. Match Node's
  // nearest node_modules lookup rather than assuming every dependency hoists.
  let directory = from;
  while (true) {
    if (path.posix.basename(directory) !== 'node_modules') {
      const candidate = `${directory ? `${directory}/` : ''}node_modules/${name}`;
      if (packages[candidate]) return candidate;
    }
    if (!directory) return null;
    const parent = path.posix.dirname(directory);
    directory = parent === '.' ? '' : parent;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])])
  );
  return value;
}

export function visualToolchainFingerprint(lock) {
  assert.equal(lock.lockfileVersion, 3, 'A version-3 npm lockfile is required');
  const packages = lock.packages ?? {};
  const roots = {};
  const closure = {};

  const visit = packagePath => {
    if (Object.hasOwn(closure, packagePath)) return;
    const locked = packages[packagePath];
    assert(locked && typeof locked.version === 'string', `${packagePath}: missing locked package`);
    assert(typeof locked.integrity === 'string' && locked.integrity.startsWith('sha512-'),
      `${packagePath}: missing registry integrity`);
    // These flags describe who consumes a package, not its bytes or resolution.
    // Adding a non-visual consumer must not turn the same tool into a migration.
    const { dev, devOptional, optional, ...identity } = locked;
    const edges = {};
    closure[packagePath] = { package: identity, edges };
    const dependencies = { ...locked.peerDependencies, ...locked.dependencies, ...locked.optionalDependencies };
    for (const name of Object.keys(dependencies).sort()) {
      const target = resolveLockedDependency(packages, packagePath, name);
      const optionalDependency = Object.hasOwn(locked.optionalDependencies ?? {}, name) ||
        (!Object.hasOwn(locked.dependencies ?? {}, name) && locked.peerDependenciesMeta?.[name]?.optional === true);
      assert(target || optionalDependency, `${packagePath}: missing required dependency ${name}`);
      edges[name] = target;
      if (target) visit(target);
    }
  };

  for (const name of toolNames) {
    const wanted = packages['']?.devDependencies?.[name];
    assert(isExactVersion(wanted), `${name}: missing exact root lock pin`);
    const packagePath = resolveLockedDependency(packages, '', name);
    assert(packagePath, `${name}: missing required visual tool`);
    roots[name] = { wanted, packagePath };
    visit(packagePath);
  }
  return sha256(JSON.stringify(canonical({ roots, closure })));
}

export function verifyVersions(manifest, lock, installed) {
  assert.equal(lock.lockfileVersion, 3, 'A version-3 npm lockfile is required');
  const versions = {};

  for (const name of toolNames) {
    const wanted = manifest.devDependencies?.[name];
    assert(isExactVersion(wanted), `${name} must use an exact release pin`);
    assert.equal(lock.packages?.['']?.devDependencies?.[name], wanted, `${name}: root lock drift`);

    const locked = lock.packages?.[`node_modules/${name}`];
    assert.equal(locked?.version, wanted, `${name}: package lock drift`);
    assert(
      typeof locked?.integrity === 'string' && locked.integrity.startsWith('sha512-'),
      `${name}: missing registry integrity`
    );

    assert.equal(installed[name]?.name, name, `${name}: missing or wrong installed package`);
    assert.equal(installed[name]?.version, wanted, `${name}: effective installed version drift`);
    versions[name] = wanted;
  }

  const [major, minor, patch] = versions.playwright.split('.').map(Number);
  assert(
    major > 1 || (major === 1 && (minor > 55 || (minor === 55 && patch >= 1))),
    'Playwright must not regress below 1.55.1'
  );

  assert.equal(
    installed.playwright.dependencies?.['playwright-core'],
    versions.playwright,
    'Playwright core declaration drift'
  );
  assert.equal(
    lock.packages?.[resolveLockedDependency(lock.packages ?? {}, 'node_modules/playwright', 'playwright-core')]?.version,
    versions.playwright,
    'Playwright core lock drift'
  );
  assert.equal(installed['playwright-core']?.name, 'playwright-core', 'Missing installed playwright-core');
  assert.equal(
    installed['playwright-core']?.version,
    versions.playwright,
    'Effective playwright-core drift'
  );

  return versions;
}

export function verifyBrowser(browserManifest, actualVersion) {
  const entry = browserManifest.browsers?.find(browser => browser.name === 'chromium-headless-shell');
  assert(
    entry && typeof entry.browserVersion === 'string' && /^\d+$/.test(String(entry.revision)),
    'Missing headless Chromium build binding'
  );
  assert.equal(actualVersion, entry.browserVersion, 'Launched browser differs from locked Playwright browser manifest');
  return {
    name: entry.name,
    revision: String(entry.revision),
    browserVersion: actualVersion
  };
}

export function verifyMigration(first, second) {
  const captureKeys = summary => {
    assert(Number.isInteger(summary.comparisons) && summary.comparisons > 0, 'Missing comparison count');
    assert(
      Array.isArray(summary.results) && summary.results.length === summary.comparisons,
      'Incomplete comparison evidence'
    );
    assert(
      summary.results.every(
        row => typeof row.passed === 'boolean' && typeof row.id === 'string' && typeof row.viewport === 'string'
      ),
      'Malformed comparison result'
    );
    assert.equal(summary.failures, summary.results.filter(row => !row.passed).length, 'Failure count disagrees with results');

    const pairs = summary.results.map(row => `${row.id}/${row.viewport}`).sort();
    assert.equal(new Set(pairs).size, pairs.length, 'Duplicate capture evidence');
    assert.equal(
      summary.failures,
      0,
      'Visual toolchain changed: screenshot differences require fresh review; older approval records cannot be reused'
    );
    return pairs;
  };

  assert.deepEqual(captureKeys(first), captureKeys(second), 'The two attempts cover different capture sets');
  return {
    comparisonsPerAttempt: first.comparisons,
    attempts: 2,
    unapprovedDifferences: 0
  };
}

async function main() {
  const mode = process.argv[2] || '--packages';
  assert(['--packages', '--browser', '--comparison'].includes(mode), 'Unknown toolchain check mode');

  const root = process.cwd();
  const baseline = path.resolve(process.env.VISUAL_BASELINE_DIR || '../baseline');
  const out = path.resolve(process.env.VISUAL_TOOLCHAIN_RESULTS_DIR || 'visual-results/toolchain');
  mkdirSync(out, { recursive: true });

  const report = {
    mode,
    passed: false,
    node: process.version,
    platform: process.platform,
    arch: process.arch
  };
  let browser;

  try {
    report.sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    report.lockSha256 = sha256(readFileSync('package-lock.json'));
    report.baselineLockSha256 = sha256(readFileSync(path.join(baseline, 'package-lock.json')));
    const lock = readJson('package-lock.json');
    report.toolchainSha256 = visualToolchainFingerprint(lock);
    report.baselineToolchainSha256 = visualToolchainFingerprint(readJson(path.join(baseline, 'package-lock.json')));
    report.toolchainChanged = report.toolchainSha256 !== report.baselineToolchainSha256;

    const localRequire = createRequire(path.join(root, 'package.json'));
    const installed = {};
    const packageFiles = {};
    report.packageMetadataSha256 = {};

    for (const name of [...toolNames, 'playwright-core']) {
      const packageRequire = name === 'playwright-core' ? createRequire(packageFiles.playwright) : localRequire;
      const file = realpathSync(packageRequire.resolve(`${name}/package.json`));
      const nodeModulesRoot = realpathSync(path.join(root, 'node_modules')) + path.sep;
      assert(file.startsWith(nodeModulesRoot), `${name} resolved outside this checkout`);
      installed[name] = readJson(file);
      packageFiles[name] = file;
      report.packageMetadataSha256[name] = sha256(readFileSync(file));
    }

    report.versions = verifyVersions(readJson('package.json'), lock, installed);

    if (mode === '--packages' && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `changed=${report.toolchainChanged}\n`);
    }

    if (mode === '--browser') {
      const browserManifestPath = path.join(
        path.dirname(packageFiles['playwright-core']),
        'browsers.json'
      );
      browser = await localRequire('playwright').chromium.launch({ headless: true });
      report.browser = verifyBrowser(readJson(browserManifestPath), browser.version());
      report.browserManifestSha256 = sha256(readFileSync(browserManifestPath));
    }

    if (mode === '--comparison') {
      report.migration = report.toolchainChanged
        ? verifyMigration(
            readJson('visual-results/screenshot-attempt-1/summary.json'),
            readJson('visual-results/screenshot-attempt-2/summary.json')
          )
        : { status: 'not-required', reason: 'Visual dependency closure unchanged; ordinary reviewed-change gate applies' };
    }

    report.passed = true;
  } catch (error) {
    report.error = String(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    writeFileSync(path.join(out, `${mode.slice(2)}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
