# Bounded causal regression pipeline

This pipeline connects changed files, declared product dependencies, existing
checks and recorded journey measurements. It produces an inspectable impact
graph and execution report for one immutable revision. A dependency path is a
possible regression route; it does not establish a defect or its root cause.

The graph covers the capabilities registered in the repository. Functions,
states, browsers or interaction timings without a registered check remain
coverage gaps. A passing selected profile does not certify every feature of the
site, external services, a physical phone, or the published deployment.

## Execution

`.github/workflows/causal-regression.yml` runs on pull requests, pushes to `main`
and manual dispatch. Pull requests use affected-check selection. Main pushes
and manual runs default to all registered pipeline checks; manual dispatch also
offers the affected profile. Source and security contracts always run.

The planner checks out the actual PR head, rather than the synthetic merge
commit. It binds the comparison to the event's base commit. For an initial push
or manual run without an event base, it uses the head's parent, or the head
itself when no parent exists. The resolved 40-character revisions appear in
the plan. Changes to the plan or registry require another run.

The workflow has four jobs:

1. **Plan:** validate the graph and registry, run the verifier's negative tests,
   resolve revisions, and write
   `plan.json`, `impact.md` and `graph.mmd`.
2. **Checks:** execute selected registered pipeline checks in separate jobs,
   with an immutable head and a 25-minute limit. The wrapper records command
   completion, exit state, logs and hashes in `receipt-<ID>.json` and its files.
   Matrix values select a check ID and declared browser engines; they are never
   evaluated as shell commands. Browser names are restricted to Chromium,
   Firefox and WebKit, independently of the check's functional/security kind.
3. **Timings:** run the bounded Chromium journey probe separately and retain
   `.artifacts/journey-responsiveness/report.json`.
4. **Collect:** download check artifacts into separate directories, verify the
   receipts and timing evidence against the expected base/head supplied by the
   planning job, and write `report.json`, `report.md` and
   `graph.mmd`. Collection runs after failed jobs too, so missing evidence stays
   visible. A failed plan causes an explicit failure instead of an empty green
   report.

Every check artifact retains its own `.artifacts` contents. The collector finds
receipts recursively; referenced receipt files remain relative to that receipt's
directory. Separate download directories prevent reports from different jobs
overwriting each other. Logs and partial artifacts are uploaded after failure
when the runner can still execute cleanup steps. Cancellation or runner loss can
leave missing evidence, which must remain incomplete.

Only repository read permission is granted. The workflow needs no repository
secrets, writes no review comments, changes no protection rules and grants no
merge or deployment authority. It adds evidence to the existing technical
checks; it does not replace their acceptance requirements or introduce a manual
D6 seal.

## Reading the results

Keep execution and product conclusions separate:

- A receipt proves that its registered command completed with the recorded
  exit state on the bound revision and unchanged verified evidence. It does
  not turn a legacy suite's partial case list into exhaustive feature coverage.
- A timing sample describes its recorded action, completion condition, browser,
  viewport, language, motion setting and network/CPU profile. Missing timings
  are gaps. A job's elapsed duration is not user interaction latency.
- Enforced timing budgets apply only where the registry and measurement
  contract declare them. Other measured actions remain observations until an
  acceptance budget is explicitly defined.
- External checks not executed by this pipeline remain `NOT_RUN`. They cannot
  become passing through a dependency edge, a previous run or the absence of a
  reported failure.
- Missing, failed, stale or modified required selected evidence prevents a
  passing collection. Browser launch failures and timeouts are execution
  failures, not successful tests.

The report should be read together with the raw receipts, logs, exact test
reports and screenshots. The workflow's success concerns the selected profile.
Publication identity and live-site behavior require their own evidence.

## Local use

Install locked dependencies and the engines required by selected checks. The
timing probe uses Chromium and local HTTPS; it needs OpenSSL. Browser checks may
use Chromium, Firefox and WebKit according to their existing defaults.

```bash
npm ci --no-audit --no-fund
npx --no-install playwright install --with-deps chromium firefox webkit
node scripts/causal-regression.mjs validate
npm run test:causal-regression
TASK_HEAD="$(git rev-parse HEAD)"
TASK_BASE="$(git rev-parse HEAD^)"
node scripts/causal-regression.mjs plan --base "$TASK_BASE" --head "$TASK_HEAD" --scope all --output .artifacts/causal-regression/plan
```

For a root commit, use `TASK_BASE="$TASK_HEAD"`. The plan's
`matrix.include[].id` values identify the checks to run. Execute each selected
pipeline check through the wrapper, for example:

```bash
node scripts/causal-regression.mjs run-check --check source-contracts --head "$TASK_HEAD" --output .artifacts/causal-regression/checks/source-contracts
node scripts/causal-regression.mjs run-check --check security-contracts --head "$TASK_HEAD" --output .artifacts/causal-regression/checks/security-contracts
ROBYS_SOURCE_REVISION="$TASK_HEAD" node scripts/measure-journey-responsiveness.mjs
node scripts/causal-regression.mjs collect --base "$TASK_BASE" --head "$TASK_HEAD" --plan .artifacts/causal-regression/plan/plan.json --receipts .artifacts/causal-regression/checks --timings .artifacts/journey-responsiveness/report.json --output .artifacts/causal-regression/report
```

The two examples are not a substitute for the rest of the selected matrix.
Collection rejects missing required selected check receipts. Use `--scope
affected` with an explicit comparison base for a targeted local run. Omitting
`--timings` is useful when inspecting check receipts alone; it must not be
described as completed timing coverage. CI always supplies the timing input.

## Validation boundaries

The verifier must reject a wrong head, modified evidence, missing selected
receipt, duplicate identity, failed or unfinished command and enforced timing
failure. Negative tests should mutate those inputs and prove rejection. A
nonzero wrapper exit with an all-PASS prefix in an older test report remains a
failed command.

This document describes the pipeline contract. It does not assert that a future
GitHub Actions run, every registered browser suite or the current live site has
passed. Consult the produced evidence for the specific revision and run.
