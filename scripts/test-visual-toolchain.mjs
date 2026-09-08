/** Synthetic contract controls. These do not execute a browser or npm audit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verifyVersions, verifyBrowser, verifyMigration } from './verify-visual-toolchain.mjs';

function fixture() {
  const versions = { playwright: '1.55.1', pixelmatch: '6.0.0', pngjs: '7.0.0' };
  const manifest = { devDependencies: { ...versions } };
  const lock = { lockfileVersion: 3, packages: { '': { devDependencies: { ...versions } } } };
  const installed = {};
  for (const [name, version] of Object.entries({ ...versions, 'playwright-core': '1.55.1' })) {
    lock.packages[`node_modules/${name}`] = { version, integrity: 'sha512-synthetic-test-fixture' };
    installed[name] = { name, version };
  }
  installed.playwright.dependencies = { 'playwright-core': '1.55.1' };
  return { manifest, lock, installed };
}
const run = f => verifyVersions(f.manifest, f.lock, f.installed);
test('locked and installed tool versions agree', () => assert.deepEqual(run(fixture()), { playwright: '1.55.1', pixelmatch: '6.0.0', pngjs: '7.0.0' }));
for (const name of ['playwright', 'pixelmatch', 'pngjs']) {
  test(`${name}: reject effective downgrade`, () => { const f = fixture(); f.installed[name].version = '1.0.0'; assert.throws(() => run(f)); });
  test(`${name}: reject floating manifest pin`, () => { const f = fixture(); f.manifest.devDependencies[name] = '^' + f.manifest.devDependencies[name]; assert.throws(() => run(f)); });
  test(`${name}: reject missing installed package`, () => { const f = fixture(); delete f.installed[name]; assert.throws(() => run(f)); });
}
test('reject internally consistent vulnerable Playwright downgrade', () => {
  const f = fixture(); f.manifest.devDependencies.playwright = '1.52.0';
  f.lock.packages[''].devDependencies.playwright = '1.52.0';
  for (const name of ['playwright', 'playwright-core']) { f.lock.packages[`node_modules/${name}`].version = '1.52.0'; f.installed[name].version = '1.52.0'; }
  f.installed.playwright.dependencies['playwright-core'] = '1.52.0'; assert.throws(() => run(f), /below 1.55.1/);
});
test('reject root lock drift', () => { const f = fixture(); f.lock.packages[''].devDependencies.pngjs = '6.0.0'; assert.throws(() => run(f)); });
test('reject package lock drift', () => { const f = fixture(); f.lock.packages['node_modules/pngjs'].version = '6.0.0'; assert.throws(() => run(f)); });
test('reject missing registry integrity', () => { const f = fixture(); delete f.lock.packages['node_modules/pixelmatch'].integrity; assert.throws(() => run(f)); });
test('reject core version drift', () => { const f = fixture(); f.installed['playwright-core'].version = '1.52.0'; assert.throws(() => run(f)); });
const browsers = { browsers: [{ name: 'chromium-headless-shell', revision: '1193', browserVersion: '140.0.7339.186' }] };
test('accept matching launched browser', () => assert.equal(verifyBrowser(browsers, '140.0.7339.186').revision, '1193'));
test('reject old browser with patched package metadata', () => assert.throws(() => verifyBrowser(browsers, '136.0.7103.25')));
test('reject missing browser manifest entry', () => assert.throws(() => verifyBrowser({ browsers: [] }, '140.0.7339.186')));
const summary = () => ({ comparisons: 1, failures: 0, results: [{ id: 'ru-coffee-full', viewport: 'phone-320', passed: true }] });
test('migration requires two passing identical capture sets', () => assert.equal(verifyMigration(summary(), summary()).attempts, 2));
test('old visual approval cannot cover a migration failure', () => { const s = summary(); s.failures = 1; s.results[0].passed = false; assert.throws(() => verifyMigration(summary(), s), /fresh review/); });
test('migration rejects a falsified zero failure count', () => { const s = summary(); s.results[0].passed = false; assert.throws(() => verifyMigration(s, summary())); });
test('migration rejects missing second-attempt evidence', () => assert.throws(() => verifyMigration(summary(), {})));
test('migration rejects changed capture sets', () => { const s = summary(); s.results[0].viewport = 'other'; assert.throws(() => verifyMigration(summary(), s)); });
test('migration rejects empty evidence', () => assert.throws(() => verifyMigration({ comparisons: 0, failures: 0, results: [] }, summary())));
test('migration rejects duplicate captures', () => { const s = summary(); s.comparisons = 2; s.results.push({ ...s.results[0] }); assert.throws(() => verifyMigration(s, s)); });
test('global workflow uses locked tooling and preserves review/dependency evidence gates', () => {
  const workflow = readFileSync('.github/workflows/visual-regression.yml', 'utf8');
  assert(!/npm install[^\n]*playwright@/.test(workflow), 'Ad-hoc Playwright install returned');
  assert(!/--package-lock=false|npm audit fix/.test(workflow));
  for (const required of ['contents: read', 'node scripts/verify-visual-toolchain.mjs --packages', 'node scripts/verify-visual-toolchain.mjs --browser', 'node scripts/verify-visual-toolchain.mjs --comparison', 'npm audit --json --audit-level=high', 'npm ls --all --json', 'node scripts/verify-reviewed-visual-change.mjs', 'node scripts/test-ru-coffee-landing.mjs', 'npm run check', 'npm run verify:security']) assert(workflow.includes(required), `Missing ${required}`);
  assert(workflow.indexOf('node scripts/verify-visual-toolchain.mjs --comparison') < workflow.indexOf('node scripts/verify-reviewed-visual-change.mjs'));
  assert(workflow.includes("steps.visual_toolchain.outputs.changed == 'true'"), 'Migration must repeat captures even when the first attempt passes');
});
