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
  "file.previous_filename"
];

for (const token of required) {
  if (!workflow.includes(token)) {
    throw new Error(`RRM-WORKFLOW-001: missing ${token}`);
  }
}

console.log("✅ RRM-WORKFLOW-001 passed: concurrency, fork-safe checkout, authoritative PR file API and both rename paths are present.");
