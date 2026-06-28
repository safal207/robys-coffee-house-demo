# Maintainer attestation smoke scenarios

For this pull request, verify the trusted workflow on the exact current head:

1. No decision keeps the gate pending.
2. `/merge-ready <head>` makes the gate successful.
3. `/merge-hold <head>` makes the gate fail.
4. A newer `/merge-ready <head>` recovers the gate.
5. Editing or deleting decision evidence fails closed.
6. A final append-only `/merge-ready <head>` recovers the gate before merge.
