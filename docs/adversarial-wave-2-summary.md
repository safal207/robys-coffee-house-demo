# Mythos Security Wave 2

This change set adds three executable security contracts:

- **ADV-001** — real Chromium probes exercise CSP, Trusted Types, stored values, search input, URL fragments, storage boundaries and network-origin allowlists.
- **DAST-001** — an OWASP ZAP baseline scan inspects the locally built static site and retains dynamic findings as CI evidence.
- **INTEGRITY-001** — a deterministic SHA-256 manifest protects public files locally and after GitHub Pages publication.

The controls fail closed: a browser probe, scanner failure, missing file, size mismatch or digest mismatch blocks the corresponding check. Evidence is retained as GitHub Actions artifacts.
