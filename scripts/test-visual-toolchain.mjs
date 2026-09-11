import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyBrowser, verifyMigration, verifyVersions } from './verify-visual-toolchain.mjs';

function fixture() {
  const versions = {
    playwright: '1.55.1',
    pixelmatch: '6.0.0',
    pngjs: '7.0.0'
  };
  const manifest = {
    devDependencies: {
      esbuild: '0.28.1',
      ...versions,
      typescript: '5.8.3',
      vite: '8.2.2'
    }
  };
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': {
        devDependencies: { ...manifest.devDependencies }
      }
    }
  };
  const installed = {};

  for (const [name, version] of Object.entries({ ...versions, 'playwright-core': '1.55.1' })) {
    lock.packages[`node_modules/${name}`] = {
      version,
      integrity: 'sha512-synthetic-test-fixture'
    };
    installed[name] = { name, version };
  }
  installed.playwright.dependencies = { 'playwright-core': '1.55.1' };

  return { manifest, lock, installed };
}

const verifyFixture = current => verifyVersions(current.manifest, current.lock, current.installed);

test('locked and installed visual-tool versions agree', () => {
  assert.deepEqual(verifyFixture(fixture()), {
    playwright: '1.55.1',
    pixelmatch: '6.0.0',
    pngjs: '7.0.0'
  });
});

for (const name of ['playwright', 'pixelmatch', 'pngjs']) {
  test(`${name}: reject effective installed downgrade`, () => {
    const current = fixture();
    current.installed[name].version = '1.0.0';
    assert.throws(() => verifyFixture(current));
  });

  test(`${name}: reject floating manifest pin`, () => {
    const current = fixture();
    current.manifest.devDependencies[name] = `^${current.manifest.devDependencies[name]}`;
    assert.throws(() => verifyFixture(current));
  });

  test(`${name}: reject missing installed package`, () => {
    const current = fixture();
    delete current.installed[name];
    assert.throws(() => verifyFixture(current));
  });
}

test('reject internally consistent vulnerable Playwright downgrade', () => {
  const current = fixture();
  current.manifest.devDependencies.playwright = '1.52.0';
  current.lock.packages[''].devDependencies.playwright = '1.52.0';
  for (const name of ['playwright', 'playwright-core']) {
    current.lock.packages[`node_modules/${name}`].version = '1.52.0';
    current.installed[name].version = '1.52.0';
  }
  current.installed.playwright.dependencies['playwright-core'] = '1.52.0';
  assert.throws(() => verifyFixture(current), /below 1\.55\.1/);
});

test('reject root lock drift', () => {
  const current = fixture();
  current.lock.packages[''].devDependencies.pngjs = '6.0.0';
  assert.throws(() => verifyFixture(current));
});

test('reject package lock drift', () => {
  const current = fixture();
  current.lock.packages['node_modules/pngjs'].version = '6.0.0';
  assert.throws(() => verifyFixture(current));
});

test('reject missing registry integrity', () => {
  const current = fixture();
  delete current.lock.packages['node_modules/pixelmatch'].integrity;
  assert.throws(() => verifyFixture(current));
});

test('reject playwright-core version drift', () => {
  const current = fixture();
  current.installed['playwright-core'].version = '1.52.0';
  assert.throws(() => verifyFixture(current));
});

const browserManifest = {
  browsers: [
    {
      name: 'chromium-headless-shell',
      revision: '1193',
      browserVersion: '140.0.7339.186'
    }
  ]
};

test('accept browser matching Playwright manifest', () => {
  assert.equal(verifyBrowser(browserManifest, '140.0.7339.186').revision, '1193');
});

test('reject old browser despite patched package metadata', () => {
  assert.throws(() => verifyBrowser(browserManifest, '136.0.7103.25'));
});

test('reject missing browser manifest entry', () => {
  assert.throws(() => verifyBrowser({ browsers: [] }, '140.0.7339.186'));
});

const summary = () => ({
  comparisons: 1,
  failures: 0,
  results: [{ id: 'home-full', viewport: 'phone-390', passed: true }]
});

test('toolchain migration requires two passing identical capture sets', () => {
  assert.equal(verifyMigration(summary(), summary()).attempts, 2);
});

test('old approval cannot cover a migration failure', () => {
  const second = summary();
  second.failures = 1;
  second.results[0].passed = false;
  assert.throws(() => verifyMigration(summary(), second), /fresh review/);
});

test('migration rejects falsified zero failure count', () => {
  const first = summary();
  first.results[0].passed = false;
  assert.throws(() => verifyMigration(first, summary()));
});

test('migration rejects missing second-attempt evidence', () => {
  assert.throws(() => verifyMigration(summary(), {}));
});

test('migration rejects changed capture sets', () => {
  const second = summary();
  second.results[0].viewport = 'desktop-1440';
  assert.throws(() => verifyMigration(summary(), second));
});

test('migration rejects empty evidence', () => {
  assert.throws(() => verifyMigration({ comparisons: 0, failures: 0, results: [] }, summary()));
});

test('migration rejects duplicate capture evidence', () => {
  const first = summary();
  first.comparisons = 2;
  first.results.push({ ...first.results[0] });
  assert.throws(() => verifyMigration(first, first));
});

test('visual workflow uses locked tooling and preserves evidence gates', () => {
  const workflow = readFileSync('.github/workflows/visual-regression.yml', 'utf8');
  assert(!/npm install[^\n]*playwright@/.test(workflow), 'Ad-hoc Playwright install returned');
  assert(!/--package-lock=false|npm audit fix/.test(workflow), 'Unsafe dependency mutation returned');

  for (const required of [
    'contents: read',
    'node scripts/verify-visual-toolchain.mjs --packages',
    'node scripts/verify-visual-toolchain.mjs --browser',
    'node scripts/verify-visual-toolchain.mjs --comparison',
    'npm audit --json --audit-level=high',
    'npm ls --all --json',
    'node scripts/verify-reviewed-visual-change.mjs',
    'npm run check',
    'npm run verify:security',
    'npx --no-install playwright install --with-deps chromium'
  ]) {
    assert(workflow.includes(required), `Missing workflow contract: ${required}`);
  }

  assert(
    workflow.indexOf('node scripts/verify-visual-toolchain.mjs --comparison') <
      workflow.indexOf('node scripts/verify-reviewed-visual-change.mjs'),
    'Migration gate must run before reviewed-change approval reuse'
  );
  assert(
    workflow.includes("steps.visual_toolchain.outputs.changed == 'true'"),
    'A toolchain migration must force a second screenshot attempt'
  );
});
