# Lighthouse Chrome startup investigation — 19 October 2026

## Scope and identities

- Repository: `safal207/robys-coffee-house-demo`.
- Failed source/workflow revision: `99e647d2aeadaccc505f3c028464a5a97da79da9`, the merge of PR #447.
- Previous main: `d2470cc4273f35ebe93114640dacc77fd5ab6655`.
- This change affects CI startup and reporting only. Site sources, emitted assets, combo recipes, ordering behavior, integrity manifest and Lighthouse budgets are unchanged.

## Observed execution

| Evidence | Revision | Result |
| --- | --- | --- |
| [Previous mobile audit, run 39297253697](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39297253697) | `d2470cc…` | Completed report: performance 91, accessibility/best practices/SEO 100 |
| [Original failure, attempt 1](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39317611592/attempts/1) | `99e647d…` | Server ready; Chrome debugging-port discovery timed out; summary and report upload skipped |
| [Live audit, run 39317611538](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39317611538) | `99e647d…` | Chrome 155.0.8059.39 launched and both audits completed |
| [Unmodified-source retry, attempt 2](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39317611592/attempts/2) | `99e647d…` | Completed report: performance 96, accessibility/best practices/SEO 100; no runtime error |

The previous successful workflow is byte-for-byte identical to the failed workflow. The previous success, original failure and successful retry all identify runner image `ubuntu-24.04`, image version `20261012.334.1`, Node `22.23.3`, and Lighthouse `12.8.2`. The failed attempt did not record the selected Chrome version or Chrome stderr. The retry report identifies HeadlessChrome 155.

Retry artifact: `lighthouse-mobile-99e647d2aeadaccc505f3c028464a5a97da79da9-39317611592-2`, artifact ID `12221111339`. Its downloaded ZIP was independently SHA-256 checked against the Actions artifact digest:

`47859b756902dd072057ba6d0068bcd8bb00db10fabe774ae7c2c5fb718290cd`

It contains both HTML and JSON reports plus readable JSON/Markdown summaries. The JSON report was parsed and checked for actual category scores and absence of `runtimeError`.

The live audit measured mobile performance 59 and desktop performance 97. Those are observations from the deployed origin, with a different delivery path and settings; they must not be substituted for the localhost mobile measurement or interpreted as proof of unchanged live performance.

## Causal conclusion and remaining uncertainty

The confirmed failure boundary is Chrome startup/debugging-port discovery, before site navigation. The error originates in `chrome-launcher` waiting for its dynamically allocated port to appear in `chrome-err.log`. The unchanged-source retry succeeded, as did the separate live audit on the same commit. This supports a transient browser/runner startup failure; it does not support attributing this failure to the combo UI.

The exact internal browser cause remains unknown. A Chrome crash, delayed startup, resource pressure or launcher/environment behavior cannot be distinguished from the retained attempt-1 logs. In particular, the successful retry does not prove a specific Chrome flag was wrong, and the runner image did not change between these observed executions. Lighthouse's transitive dependencies were not recorded in the old jobs, so their exact failed-attempt versions cannot be reconstructed from the top-level version alone.

The reproducible workflow defect is loss of diagnostic evidence: `--quiet` hides launcher detail and success-only artifact upload skips all evidence on startup failure. This PR repairs that gap and makes browser readiness an explicit prerequisite. It does not claim to have reproduced or identified a particular historical Chrome crash.

## Changes

- Resolve and record the Chrome binary, browser version, Node version and Lighthouse version.
- Preserve Chrome's default launcher flags from the installed Lighthouse dependency, then add the existing headless/no-sandbox/disable-gpu flags.
- Start one Chrome instance with a fresh temporary profile and a loopback DevTools port. Refuse an already responding endpoint, check process liveness, and verify `/json/version` before auditing.
- Connect Lighthouse to that ready instance using `--hostname=127.0.0.1 --port=9222`, avoiding dynamic port discovery from stderr.
- Keep the existing URL, mobile emulation, simulated throttling, categories and report formats. No retries wrap a failed audit and no thresholds are lowered.
- Retain Chrome stdout/stderr, browser metadata, Lighthouse verbose output and HTTP server logs through an `always()` diagnostic artifact. Do not upload the browser profile.
- Stop the processes started by this job, including on failure.
- Reject missing/invalid report categories and runtime errors before producing a summary. Diagnostic upload is separate from report upload; logs alone cannot satisfy the report step.
- Allow this specific workflow to execute for PRs that change its own file, so the correction can be tested before merging.

The original Lighthouse CLI also propagates runtime errors after saving reports: [Lighthouse 12.8.2 CLI](https://github.com/GoogleChrome/lighthouse/blob/v12.8.2/cli/run.js). The summary validation is an additional evidence-integrity check, not a replacement for that exit code or the repository's existing performance contract.

## Validation

Validation results for the proposed workflow are recorded in the PR, bound to its commit and Actions run. The original-source successful retry above remains a separate historical result; it is not presented as execution of the proposed workflow.

Report validation uses the actual successful retry report as a control and separately checks runtime errors, missing categories, null scores, missing files and malformed JSON. Each negative case must exit nonzero without creating a successful summary. YAML and every embedded Bash block are parsed before publication.

All six report-validation cases passed. A separate local lifecycle probe using bundled headless-shell Chromium 140 / Node 24 passed readiness, server startup, the Lighthouse 12.8.2 audit, summary generation and cleanup. Its scores were 64/100/100/100; that different browser/runtime under concurrent local validation is not used as a hosted-run performance baseline.

An existing-endpoint negative control also passed: the readiness step refused a pre-existing responding DevTools endpoint, did not record it as the job's Chrome process, and cleanup left that unrelated endpoint alive.

The local full Chromium launch exposed the execution sandbox's Unix-socket restriction (`process_singleton_posix.cc`, `Operation not permitted`). The readiness step failed immediately and retained stderr as intended. This local limitation is not evidence about the GitHub runner and is not worked around by changing CI security settings. The hosted PR run is the acceptance check for real Google Chrome on Ubuntu 24.04 / Node 22.
