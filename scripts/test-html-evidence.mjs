import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-html-evidence.mjs");

function runFixture(evidence, html) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-html-001-"));
  try {
    mkdirSync(path.join(root, "qa/traceability"), { recursive: true });
    writeFileSync(path.join(root, "qa/feature-traceability-matrix.json"), JSON.stringify({
      featureFiles: ["qa/traceability/fixture.json"]
    }));
    writeFileSync(path.join(root, "qa/traceability/fixture.json"), JSON.stringify({
      features: [{ id: "FEAT-UI-001", evidence: [evidence] }]
    }));
    writeFileSync(path.join(root, "fixture.html"), html);
    return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectSuccess(label, evidence, html) {
  const result = runFixture(evidence, html);
  if (result.status !== 0) throw new Error(`${label} should pass:\n${result.stderr || result.stdout}`);
}

function expectFailure(label, evidence, html) {
  const result = runFixture(evidence, html);
  if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes("TRACE-HTML-001")) {
    throw new Error(`${label} should fail:\n${result.stdout}\n${result.stderr}`);
  }
}

expectSuccess("natural id", "fixture.html#menu-root", '<main id="menu-root"></main>');
expectSuccess("explicit id", "fixture.html##menu-root", '<main id="menu-root"></main>');
expectSuccess("class", "fixture.html#.hero", '<section class="card hero"></section>');
expectSuccess("exact attribute", 'fixture.html#[data-mode="expected"]', '<div data-mode="expected"></div>');
expectSuccess("boolean attribute", "fixture.html#[data-instagram-booking]", '<button data-instagram-booking></button>');
expectSuccess("case-insensitive markup", "fixture.html#menu-root", '<MAIN ID="menu-root"></MAIN>');

expectFailure("empty fragment", "fixture.html#", '<main id="menu-root"></main>');
expectFailure("natural id only in text", "fixture.html#menu-root", '<p>menu-root</p>');
expectFailure("natural id only in script", "fixture.html#menu-root", '<script>const id = "menu-root";</script>');
expectFailure("wrong exact attribute value", 'fixture.html#[data-mode="expected"]', '<div data-mode="wrong"></div>');
expectFailure("comment fake tag", "fixture.html#.hero", '<!-- <div class="hero"></div> -->');

for (const tag of ["script", "style", "template", "textarea"]) {
  expectFailure(`${tag} fake attribute tag`, "fixture.html#[data-instagram-booking]", `<${tag}><button data-instagram-booking></button></${tag}>`);
  expectFailure(`${tag} fake class tag`, "fixture.html#.hero", `<${tag}><div class="hero"></div></${tag}>`);
  expectFailure(`${tag} fake id tag`, "fixture.html#menu-root", `<${tag}><main id="menu-root"></main></${tag}>`);
}

console.log("✅ TRACE-HTML-001 mutation tests passed: empty fragments fail; natural ids and selector evidence require real HTML start-tag attributes outside comments and raw-text containers.");
