# Adversarial Security Test Plan

## Purpose

This plan defines executable abuse cases for the static Roby's Coffee House site. The goal is not to prove that the site is impossible to compromise; it is to ensure that known trust boundaries fail closed and remain observable.

## Browser attack probes

- direct markup assignment into a protected rich-text heading;
- inline script insertion under the production CSP;
- external script insertion from an unapproved origin;
- markup-like values in the persisted language preference;
- markup-like menu search input;
- markup-like URL fragments;
- unexpected network origins during landing and menu loading;
- expansion of browser storage beyond the approved language key.

## Passive dynamic scan

OWASP ZAP spiders the locally built site and performs a passive baseline scan. Warnings remain visible in the report, while confirmed failures block the pull request. Static-hosting limitations such as response headers that GitHub Pages cannot customize are documented rather than hidden.

## Deployment integrity

A deterministic SHA-256 manifest records every public HTML, CSS, JavaScript, image, video, icon, text and XML file. CI verifies the committed manifest locally. After deployment, a scheduled verifier downloads the public manifest and every listed asset, then compares byte length and digest.

## Evidence

Each control emits a JSON or HTML artifact retained by GitHub Actions:

- `adversarial-browser-report.json`;
- the ZAP HTML/JSON/Markdown report;
- `live-integrity-report.json`.

## Failure policy

A failed probe is never converted into a passing test by weakening CSP, disabling Trusted Types or excluding an executable public file. The implementation or the test harness must be corrected at the appropriate trust boundary.
