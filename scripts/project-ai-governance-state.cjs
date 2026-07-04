const fs = require("node:fs");

const SHA_RE = /^[0-9a-f]{40}$/;
const PROVIDER_STATES = new Set([
  "IN_PROGRESS",
  "VERIFIED",
  "REQUEST_MISSING",
  "PROVIDER_EVIDENCE_UNAVAILABLE",
]);
const LEDGER_STATES = new Set([
  "NO_OPEN_FINDINGS",
  "REVIEW_FINDINGS_PRESENT",
  "LEDGER_EVIDENCE_UNAVAILABLE",
]);

const noAuthority = () => ({
  merge: false,
  deploy: false,
  routePromotion: false,
});

const normalizeSha = (value) => String(value ?? "").toLowerCase();

const baseResult = ({ head, classification, provider, ledger, reasons }) => ({
  schemaVersion: 1,
  classification,
  exactHeadSha: head,
  readyForIndependentDecision: classification === "VERIFIED_NO_OPEN_FINDINGS",
  reasons,
  inputs: {
    provider: {
      schemaVersion: provider?.schemaVersion ?? null,
      classification: provider?.classification ?? null,
      exactHeadSha: provider?.exactHeadSha ?? null,
    },
    reviewLedger: {
      schemaVersion: ledger?.schemaVersion ?? null,
      classification: ledger?.classification ?? null,
      exactHeadSha: ledger?.exactHeadSha ?? null,
      unresolvedFindings: Number.isInteger(ledger?.unresolvedFindings)
        ? ledger.unresolvedFindings
        : null,
    },
  },
  authority: noAuthority(),
});

const invalid = ({ head, provider, ledger, reason }) => baseResult({
  head,
  classification: "INVALID_EVIDENCE",
  provider,
  ledger,
  reasons: [reason],
});

const projectGovernanceState = ({ provider, ledger }) => {
  const providerHead = normalizeSha(provider?.exactHeadSha);
  const ledgerHead = normalizeSha(ledger?.exactHeadSha);
  const head = providerHead || ledgerHead;

  if (provider?.schemaVersion !== 1 || ledger?.schemaVersion !== 1) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "Both inputs must use schemaVersion 1.",
    });
  }

  if (!SHA_RE.test(providerHead) || !SHA_RE.test(ledgerHead)) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "Both inputs must contain a valid 40-character exact head SHA.",
    });
  }

  if (providerHead !== ledgerHead) {
    return baseResult({
      head: providerHead,
      classification: "EVIDENCE_HEAD_MISMATCH",
      provider,
      ledger,
      reasons: ["Provider evidence and review-ledger evidence target different heads."],
    });
  }

  if (!PROVIDER_STATES.has(provider?.classification)) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "Provider classification is unknown.",
    });
  }

  if (!LEDGER_STATES.has(ledger?.classification)) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "Review-ledger classification is unknown.",
    });
  }

  if (
    ledger.classification === "NO_OPEN_FINDINGS" &&
    ledger.unresolvedFindings !== 0
  ) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "NO_OPEN_FINDINGS requires unresolvedFindings to equal 0.",
    });
  }

  if (
    ledger.classification === "REVIEW_FINDINGS_PRESENT" &&
    (!Number.isInteger(ledger.unresolvedFindings) || ledger.unresolvedFindings < 1)
  ) {
    return invalid({
      head,
      provider,
      ledger,
      reason: "REVIEW_FINDINGS_PRESENT requires a positive unresolvedFindings count.",
    });
  }

  if (provider.classification === "IN_PROGRESS") {
    return baseResult({
      head,
      classification: "PROVIDER_EVIDENCE_UNAVAILABLE",
      provider,
      ledger,
      reasons: [
        "Provider evidence generation is still in progress or failed before completion.",
      ],
    });
  }

  if (provider.classification === "REQUEST_MISSING") {
    return baseResult({
      head,
      classification: "REQUEST_MISSING",
      provider,
      ledger,
      reasons: ["One or more required provider review requests are missing."],
    });
  }

  if (provider.classification === "PROVIDER_EVIDENCE_UNAVAILABLE") {
    return baseResult({
      head,
      classification: "PROVIDER_EVIDENCE_UNAVAILABLE",
      provider,
      ledger,
      reasons: ["Required exact-head provider evidence is unavailable."],
    });
  }

  if (ledger.classification === "LEDGER_EVIDENCE_UNAVAILABLE") {
    return baseResult({
      head,
      classification: "LEDGER_EVIDENCE_UNAVAILABLE",
      provider,
      ledger,
      reasons: ["The exact-head review ledger is unavailable or incomplete."],
    });
  }

  if (ledger.classification === "REVIEW_FINDINGS_PRESENT") {
    return baseResult({
      head,
      classification: "REVIEW_FINDINGS_PRESENT",
      provider,
      ledger,
      reasons: ["Exact-head provider evidence exists, but actionable findings remain open."],
    });
  }

  return baseResult({
    head,
    classification: "VERIFIED_NO_OPEN_FINDINGS",
    provider,
    ledger,
    reasons: [
      "Exact-head provider evidence is verified and the review ledger reports no open findings.",
      "This projection is evidence only; an independent decision is still required.",
    ],
  });
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const main = () => {
  const [, , providerPath, ledgerPath, outputPath] = process.argv;
  if (!providerPath || !ledgerPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/project-ai-governance-state.cjs <provider.json> <ledger.json> <output.json>",
    );
  }

  const result = projectGovernanceState({
    provider: readJson(providerPath),
    ledger: readJson(ledgerPath),
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
};

module.exports = { projectGovernanceState };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
