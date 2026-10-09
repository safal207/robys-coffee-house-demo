# OSS Scanner preparation

This directory prepares Roby's for a possible Anthropic OSS Scanner enrollment.
It does not itself submit, approve or run an Anthropic vulnerability scan.

## Pending maintainer decisions

- No root open-source license was present at inspected base
  `3e2aba1d2aaca93b6139f04db528bd2dd2904741`. A public repository alone does not
  establish an open-source license. The maintainer must decide licensing for
  original code and explicitly preserve third-party brand/media rights.
- Anthropic accepts eligible established OSS projects case by case. The cafe
  project's infrastructure importance or adoption must not be overstated.
- The first upstream enrollment PR requires the maintainer's Contributor
  License Agreement signature. This preparation does not sign the CLA.
- The enrollment contact is already public at `github.com/safal207`; it will
  also be public in Anthropic's enrollment repository if submitted.

## Files

- `Dockerfile`: digest-pinned Node.js build with all offline dependencies and Chromium.
- `threat_model.md`: repository-only scope, inputs, impact limits and report format.
- `enrollment/robys-coffee-house-demo/project.yaml`: proposed upstream config.
- `../.github/workflows/oss-scanner-build.yml`: exact-head container/offline check.

## Validate and test

Use the official tooling from
`https://github.com/anthropics/oss-scanner`, inspected revision
`481b73cc028deee0409d09c6aca619b614553880`:

```sh
# Run from an oss-scanner checkout after copying the enrollment directory to projects/.
python3 tools/validate.py
python3 tools/check robys-coffee-house-demo --no-shell
docker run --rm --network none --shm-size=1g \
  oss-scanner-check/built:robys-coffee-house-demo \
  bash -lc 'npm run check && npm run verify:security && node scripts/verify-analytics-destination-boundaries.mjs'
```

`tools/check` validates the configuration and builds the environment. It does
not request or perform a vulnerability scan. This branch's CI repeats local
checks offline and verifies the built checkout SHA against the PR head.

## Enrollment after decisions

Copy only `enrollment/robys-coffee-house-demo/project.yaml` to
`projects/robys-coffee-house-demo/project.yaml` in a fork of the official
repository. The Dockerfile and threat model are referenced in Roby's branch.
Open one enrollment PR, accurately state the cafe/demo scope, and have the
maintainer complete the CLA. Scanning starts only after acceptance/merge.

The config targets a dedicated branch so this preparation does not need a
production release. Move it to `#main` in a later enrollment change only after
the scanner files are present on `main` and the maintainer requests that change.
