# TypeScript 7 dual-compiler migration

This draft PR changes development tooling only. It **does not** claim improvements to browser LCP, media transfer, product-feed interactions or runtime JavaScript performance.

## Compiler selection
- `tsc`: native TypeScript **7.0.2**, via `@typescript/native` npm alias.
- `tsc6`: TypeScript 6 compatibility CLI, via the `typescript` alias pointing at `@typescript/typescript6@6.0.2`.
- `import "typescript"` in `scripts/build.mjs`: **TypeScript 6 programmatic compiler API**. The alias exposes the API through `@typescript/old@6.0.3`; the verifier exercises real transpilation.
- `npm ci` uses a committed lockfile; no dynamic `latest` resolution during CI.

## Safety
- Comparison baseline: Roby's TypeScript 7 isolated benchmark [PR #518](https://github.com/safal207/robys-coffee-house-demo/pull/518), 5.95x–6.02x faster type checks on the three GitHub runners.
- `npm run verify:typescript-toolchain`, `npm run typecheck`, `npm run typecheck:compat`, and production build must pass.
- A dedicated read-only workflow verifies all three operating systems, and on Linux rejects changes to generated runtime files and the integrity manifest.
- Do **not** merge while any required check is failing. PR #515 remains a separate feature/performance stream.

## Known issue
The TypeScript-Go `--noEmit` type-error exit status differs in the pinned 7.0.2 binary from legacy TypeScript (GitHub [microsoft/typescript-go#1493](https://github.com/microsoft/typescript-go/issues/1493)). A later upstream fix [#4407](https://github.com/microsoft/typescript-go/pull/4407) was verified from source. This toolchain relies on zero vs non-zero for release gating, not on `exitCode === 2`.
