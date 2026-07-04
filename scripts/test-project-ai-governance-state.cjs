const assert = require("node:assert/strict");

const {
  projectGovernanceState,
} = require("./project-ai-governance-state.cjs");

const HEAD = "a".repeat(40);
const OTHER_HEAD = "b".repeat(40);

const provider = (classification, exactHeadSha = HEAD) => ({
  schemaVersion: 1,
  classification,
  exactHeadSha,
});

const ledger = (
  classification,
  unresolvedFindings = 0,
  exactHeadSha = HEAD,
) => ({
  schemaVersion: 1,
  classification,
  exactHeadSha,
  unresolvedFindings,
});

const assertNoAuthority = (result) => {
  assert.deepEqual(result.authority, {
    merge: false,
    deploy: false,
    routePromotion: false,
  });
};

const cases = [
  {
    name: "verified evidence with clean ledger",
    input: {
      provider: provider("VERIFIED"),
      ledger: ledger("NO_OPEN_FINDINGS"),
    },
    expected: "VERIFIED_NO_OPEN_FINDINGS",
    ready: true,
  },
  {
    name: "verified evidence with open findings",
    input: {
      provider: provider("VERIFIED"),
      ledger: ledger("REVIEW_FINDINGS_PRESENT", 2),
    },
    expected: "REVIEW_FINDINGS_PRESENT",
    ready: false,
  },
  {
    name: "provider unavailable dominates clean ledger",
    input: {
      provider: provider("PROVIDER_EVIDENCE_UNAVAILABLE"),
      ledger: ledger("NO_OPEN_FINDINGS"),
    },
    expected: "PROVIDER_EVIDENCE_UNAVAILABLE",
    ready: false,
  },
  {
    name: "missing request dominates open findings",
    input: {
      provider: provider("REQUEST_MISSING"),
      ledger: ledger("REVIEW_FINDINGS_PRESENT", 1),
    },
    expected: "REQUEST_MISSING",
    ready: false,
  },
  {
    name: "ledger unavailable remains fail closed",
    input: {
      provider: provider("VERIFIED"),
      ledger: ledger("LEDGER_EVIDENCE_UNAVAILABLE"),
    },
    expected: "LEDGER_EVIDENCE_UNAVAILABLE",
    ready: false,
  },
  {
    name: "head mismatch is explicit",
    input: {
      provider: provider("VERIFIED"),
      ledger: ledger("NO_OPEN_FINDINGS", 0, OTHER_HEAD),
    },
    expected: "EVIDENCE_HEAD_MISMATCH",
    ready: false,
  },
  {
    name: "unknown provider classification is invalid",
    input: {
      provider: provider("APPROVED"),
      ledger: ledger("NO_OPEN_FINDINGS"),
    },
    expected: "INVALID_EVIDENCE",
    ready: false,
  },
  {
    name: "malformed head is invalid",
    input: {
      provider: provider("VERIFIED", "not-a-sha"),
      ledger: ledger("NO_OPEN_FINDINGS"),
    },
    expected: "INVALID_EVIDENCE",
    ready: false,
  },
];

for (const testCase of cases) {
  const result = projectGovernanceState(testCase.input);
  assert.equal(result.classification, testCase.expected, testCase.name);
  assert.equal(
    result.readyForIndependentDecision,
    testCase.ready,
    testCase.name,
  );
  assertNoAuthority(result);
}

process.stdout.write(`AI governance projection: ${cases.length} cases passed\n`);
