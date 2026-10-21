# Integrity publication race, 21 October 2026

Source examined: `safal207/robys-coffee-house-demo`, main
`d8426661dcd5a0b73c971fdef932fd1bf16c62b1` (PR #456).
Its parent is `3a305c5cb605c9a464b931c031a808815dd5500b` (PR #455).
No later main commit was present during collection. Times below are UTC.

## Historical evidence

- [Refresh run 39597461428, attempt 1](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597461428/attempts/1)
  accepted publication at 12:10:25.193. It fetched the remote manifest starting
  at 12:10:25.231 and finished verification at 12:10:43.416 with one mismatch.
- [Artifact 12344740598](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597461428/artifacts/12344740598)
  ZIP SHA-256: `c76451ee06b3d65a7353f3e407cc5ebf3a4bda3632d01ba199fec1f2f98a78aa`.
  Independently downloaded ZIP bytes matched the digest reported by GitHub.
- [Live integrity run 39597461379](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597461379)
  accepted publication at 12:10:21.823 and passed at 12:10:28.134. Its
  [artifact 12344591542](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597461379/artifacts/12344591542)
  shows both the expected and actual worker digest belonging to PR #455.
  This successful check certified an older deployment, not the target revision.
- [Pages run 39597460328](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597460328)
  created the deployment for `d842666` at 12:10:28.797 and reported success at
  12:10:33.017, after both integrity workflows had accepted readiness.

| Worker version | Bytes | SHA-256 |
| --- | ---: | --- |
| Parent / expected in the failing remote manifest | 17701 | `732148136de2c87a3d86bb5dce4ba612b488975560a65e508b98da19edb88247` |
| Target / actual in the failing report | 17701 | `810aa890a31f3b3f0988117d03491d9db13ba3dee58fb9ece64fb5b9a5e88955` |

`byteDiagnostics: null` in the failing report means the worker fetched from
Pages was byte-identical to the local target worker. The stale input was the
remote manifest's expected digest. The target manifest itself was already
current in Git: regeneration changed nothing.

The build marker (`20260904-1`) and the `menu.html` digest
(`e2378d2bccde3cabc2bb63842b5f92c085dd4d8c8b97d730fbd7f465dcc17212`)
are identical in both revisions. Four manifest entries changed, including the
worker. The readiness predicate inspected none of those four changed digests.
The verifier then trusted whichever manifest the live server returned.

## Adjudication and current state

Confirmed mechanism: insufficient readiness identity plus trust in a remote
manifest allowed an old manifest to be compared with a new worker during
publication. An entirely old, internally consistent publication could also pass.

The original artifact contains neither response headers nor full response bodies.
It therefore cannot distinguish Pages deployment propagation from CDN cache
propagation as the reason an old manifest was served. Browser/service-worker
caching is not involved in these Node fetches on fresh CI runners.
Current HTTP responses advertise a 600-second cache lifetime; that is evidence
of cache policy, not proof that caching caused the historical response.

Later direct downloads, both with and without a query parameter, matched the
target worker. The downloaded manifest matched the checkout byte-for-byte:
SHA-256 `9c4afd1a6a701d98a7e4ac6bfc460689d2b1eca9793d9663c8ea5377997bd1b3`.
The full refresh job was rerun on the unchanged target and
[attempt 2](https://github.com/safal207/robys-coffee-house-demo/actions/runs/39597461428/attempts/2)
passed all 470 files at 15:28:53.230. There is no reproduced persistent file
mismatch; the readiness defect remains in the original workflow code.

## Change and verification

Both integrity workflows now run the same strict verifier with a five-minute
publication deadline. A successful attempt requires the exact local manifest
SHA-256, then all local manifest entries' lengths and SHA-256 digests, plus the
existing page build-marker checks. A complete successful attempt is required;
partial passes are never combined across attempts. Persistent differences fail.
Each attempt gets a new UUID query parameter and requests cache revalidation.
The report retains failed attempts and response/cache headers for the manifest
and mismatched resources. Default command-line checks remain single-attempt.
No public resource, manifest entry, workflow permission, or digest algorithm was
removed or relaxed. Public bytes and the 470-file manifest are unchanged.

`node --test scripts/test-live-integrity.mjs` covers exact publication, an old
self-consistent deployment, the historical manifest/worker race, delayed
manifest and worker publication, persistent same-size corruption, size changes,
missing resources, binary bytes, and page build markers. The stale-deployment
test fails against the original verifier because it incorrectly exits zero;
all nine scenarios pass against the corrected verifier. These tests run as part
of `npm run check`.

## Compatibility after Stories/Reels (PR #460)

On 22 October the branch was updated against main
`7f2eff58bd3b8249a8880ab6d09e7ef9bf87f8e9`, which includes PR #460.
The merge has no conflicts and preserves every public byte from that main.
The current manifest has 471 entries, including `src/menu-feed-viewer.js`.
It is 67,226 bytes with SHA-256
`209d360a7a300048f010655214f31774f12f24062e62d4a49440f4a7ced62d7e`.
No manifest regeneration or service-worker version change is needed because
the integrity fix changes only development scripts, workflows and evidence.

All 13 HTTP fixture regressions pass. Four additional cases cover a complete
471-file publication, rejection of the self-consistent prior 470-file catalog,
the old-manifest then cached-viewer propagation sequence, and recovery after
a temporary manifest HTTP 503. The propagation fixture retains three attempts:
zero entries checked under the old manifest, then all 471 with a same-size
cached viewer mismatch, then all 471 matching in one complete attempt. Cache
headers and distinct request nonces are asserted rather than assuming that a
cache-busting parameter guarantees fresh bytes.

The actual 471 project files also pass the corrected verifier over a local
HTTP server, including binary files and the new nested viewer module.
`npm run check`, `npm run verify:security` (47 tests, 376 security contracts,
secret scan), YAML parsing and `git diff --check` pass on the combined tree.
The earlier 470-file live run above remains historical evidence; current
publication must be checked independently against the new manifest fingerprint.
