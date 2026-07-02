import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/review-route-preflight.yml", "utf8");
const required = [
  "concurrency:",
  "group: review-route-preflight-${{ github.event.pull_request.number || github.ref }}",
  "cancel-in-progress: true",
  "pull-requests: read",
  "repository: ${{ github.event.pull_request.head.repo.full_name || github.repository }}",
  "persist-credentials: false",
  "github.paginate(",
  "github.rest.pulls.listFiles",
  "file.status === 'renamed'",
  "file.previous_filename",
  "override_json:",
  "Select review route",
  "scripts/select-review-route.mjs",
  "--head \"${REVIEW_HEAD}\"",
  "--route-result review-route-result.json"
];

for (const token of required) {
  if (!workflow.includes(token)) {
    throw new Error(`RRM-WORKFLOW-001: missing ${token}`);
  }
}

if (workflow.includes("pull_request_target:")) {
  throw new Error("RRM-WORKFLOW-001: untrusted pull request code must not run through pull_request_target");
}

console.log("✅ RRM-WORKFLOW-001 passed: exact-head path evidence, route selection, audited manual input and read-only PR execution are present.");
