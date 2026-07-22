# Exact-head maintainer attestation

Use this only after required CI and evidence checks have completed for the current pull-request head.

```text
Independent-Review: PDG-001
Head: <full 40-character commit SHA>
Outcome: accepted
```

After all current-head findings are dispositioned, post the D6 seal:

```text
Proof-Depth-Seal: PDG-001
Head: <full 40-character commit SHA>
Depth: D6
```

A new commit invalidates both statements. Optional automated review evidence may supplement this process but cannot replace accountable maintainer authority.
