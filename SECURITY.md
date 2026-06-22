# Security Policy

## Supported version

Security fixes are applied to the current `main` branch and the public GitHub Pages deployment.

## Reporting a vulnerability

Please do **not** open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow from the repository **Security** tab when it is available. Include:

- the affected page, file or workflow;
- clear reproduction steps;
- expected and observed impact;
- a minimal proof of concept;
- whether the issue is already public.

The maintainer will acknowledge a credible report as soon as practical, preserve the reporter's confidentiality and coordinate disclosure after a fix is available.

## Response targets

- **Critical:** immediate containment and rollback where possible.
- **High:** triage within 24 hours and prioritize a blocking fix.
- **Medium:** triage within 7 days.
- **Low:** address during normal maintenance.

## Incident checklist

1. Preserve logs and the affected commit SHA.
2. Disable or rotate compromised credentials.
3. Stop the affected workflow or deployment path.
4. Revert to the last verified release.
5. Patch the root cause and add a regression contract.
6. Re-run security, visual, performance and live gates.
7. Publish a concise post-incident note when disclosure is appropriate.

## Scope

The site is static and currently has no backend, authentication, payment processing or server-side database. The primary risks are DOM XSS, malicious links, compromised dependencies, leaked secrets, unsafe CI workflows and deployment tampering.
