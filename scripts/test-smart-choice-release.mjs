import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(path.join(tmpdir(), "robys-smart-choice-release-"));
const outfile = path.join(temp, "release-qa-domain.mjs");

try {
  await build({
    entryPoints: ["src/smart-choice/release-qa-domain.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2020",
    outfile,
    legalComments: "none"
  });

  const domain = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  const {
    RELEASE_QA_COPY,
    formatTryMinor,
    normalizeReleaseLocale,
    releaseNotice,
    validateReleaseLocaleMatrix
  } = domain;

  assert.deepEqual(validateReleaseLocaleMatrix(), [], "TR/EN/RU release copy must have identical non-empty keys");
  assert.equal(normalizeReleaseLocale("tr"), "tr");
  assert.equal(normalizeReleaseLocale("en"), "en");
  assert.equal(normalizeReleaseLocale("ru"), "ru");
  assert.equal(normalizeReleaseLocale("de"), "tr", "unknown locale must fail closed to the default locale");

  for (const locale of ["tr", "en", "ru"]) {
    const zero = formatTryMinor(0, locale);
    const whole = formatTryMinor(37_000, locale);
    const fractional = formatTryMinor(37_050, locale);
    assert.match(zero, /0/, `${locale}: zero TRY must remain readable`);
    assert.match(whole, /370/, `${locale}: whole TRY amount must remain readable`);
    assert.match(fractional, /370/, `${locale}: fractional TRY amount must remain readable`);
    assert.ok(/₺|TRY/.test(whole), `${locale}: TRY currency marker must be present`);
    assert.ok(RELEASE_QA_COPY[locale].fallbackMenu.length > 0, `${locale}: fallback menu copy is required`);
  }

  assert.throws(() => formatTryMinor(-1, "ru"), /non-negative integer/);
  assert.throws(() => formatTryMinor(10.5, "en"), /non-negative integer/);

  assert.equal(releaseNotice("tr", "offline").title, RELEASE_QA_COPY.tr.offlineTitle);
  assert.equal(releaseNotice("en", "online").body, undefined);
  assert.equal(releaseNotice("ru", "fatal").body, RELEASE_QA_COPY.ru.fatalBody);

  const broken = structuredClone(RELEASE_QA_COPY);
  broken.ru.fallbackMenu = "";
  assert.ok(
    validateReleaseLocaleMatrix(broken).some((error) => error.includes("ru.fallbackMenu")),
    "empty locale values must be rejected"
  );

  console.log("[SMART-CHOICE-RELEASE] locale, TRY, fallback, and fail-closed tests passed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
