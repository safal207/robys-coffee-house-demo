#!/usr/bin/env python3
"""Cross-field semantic seal for Robis causal-review envelopes."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

from causal_review_envelope import (
    causal_basis,
    digest_json,
    justified_action,
    transition_tension,
    validate_envelope,
)


EXPECTED_REVIEWERS = ["CodeRabbit", "Qodo", "Codex", "Jules", "DeepSeek"]
EXPECTED_ROLES = {
    "CodeRabbit": "required",
    "Qodo": "dormant",
    "Codex": "advisory",
    "Jules": "advisory",
    "DeepSeek": "advisory",
}


def normalized_findings(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict) or set(value) != {"P0", "P1", "P2", "P3"}:
        return None
    if any(not isinstance(value[key], int) or isinstance(value[key], bool) or value[key] < 0 for key in value):
        return None
    return {f"P{i}": value[f"P{i}"] for i in range(4)}


def semantic_errors(envelope: dict[str, Any]) -> list[str]:
    errors = list(validate_envelope(envelope))

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    findings = normalized_findings(envelope.get("findings"))
    require(findings is not None, "top-level findings must be exactly non-negative P0-P3 integers")
    findings = findings or {"P0": 0, "P1": 0, "P2": 0, "P3": 0}

    checks = envelope.get("checks")
    require(isinstance(checks, dict), "checks must be an object")
    checks = checks if isinstance(checks, dict) else {}
    require(set(checks) == {"passed", "pending", "failed", "optional_failed"},
            "checks fields are incomplete or unexpected")
    for name in ("passed", "pending"):
        value = checks.get(name)
        require(isinstance(value, int) and not isinstance(value, bool) and value >= 0,
                f"checks.{name} must be a non-negative integer")
    for name in ("failed", "optional_failed"):
        value = checks.get(name)
        require(isinstance(value, list) and all(isinstance(item, str) for item in value),
                f"checks.{name} must be a string list")
        if isinstance(value, list):
            require(value == sorted(set(value)), f"checks.{name} must be sorted and unique")

    reviewers = envelope.get("reviewers")
    require(isinstance(reviewers, list), "reviewers must be an array")
    reviewers = reviewers if isinstance(reviewers, list) else []
    names = [reviewer.get("name") for reviewer in reviewers if isinstance(reviewer, dict)]
    require(names == EXPECTED_REVIEWERS, "reviewer lanes or ordering differ from reporter contract")
    for reviewer in reviewers:
        if not isinstance(reviewer, dict):
            errors.append("reviewer entries must be objects")
            continue
        name = reviewer.get("name")
        require(reviewer.get("role") == EXPECTED_ROLES.get(name),
                f"reviewer role mismatch for {name}")
        require(normalized_findings(reviewer.get("findings")) is not None,
                f"reviewer findings invalid for {name}")

    evidence = envelope.get("evidence")
    require(isinstance(evidence, dict), "evidence must be an object")
    evidence = evidence if isinstance(evidence, dict) else {}
    require(isinstance(evidence.get("pagination_complete"), bool),
            "evidence.pagination_complete must be boolean")

    verdict = str((envelope.get("decision") or {}).get("verdict") or "")
    head_sha = str(envelope.get("head_sha") or "")
    basis = envelope.get("causal_basis")
    expected_basis = causal_basis(
        head_sha=head_sha,
        conclusion=verdict,
        findings=findings,
        checks={
            "passed": checks.get("passed", 0),
            "pending": checks.get("pending", 0),
            "failed": checks.get("failed", []),
        },
        evidence_complete=bool(evidence.get("pagination_complete")),
        reviewers=reviewers,
    )
    require(basis == expected_basis,
            "causal_basis must be a deterministic projection of top-level evidence")

    transition = envelope.get("transition") or {}
    require(transition.get("tension") == transition_tension(verdict, findings, checks),
            "transition tension is not derived from the verdict evidence")
    if verdict:
        try:
            expected_action = justified_action(verdict)
        except KeyError:
            expected_action = None
        require(transition.get("smallest_justified_action") == expected_action,
                "smallest justified action is not derived from the verdict")

    authority = envelope.get("authority") or {}
    require(authority.get("actor") == "robis-ai-review-cooperation",
            "authority actor is not the canonical reporter")

    basis_digest = digest_json(expected_basis)
    parent_id = f"head:{head_sha}"
    cause_id = f"cause:{basis_digest}"
    decision_id = f"decision:{head_sha}:{verdict.lower()}"
    expected_graph = {
        "root_ids": [parent_id],
        "nodes": [
            {"id": parent_id, "kind": "exact_head_state"},
            {"id": cause_id, "kind": "causal_basis"},
            {"id": decision_id, "kind": "advisory_decision"},
        ],
        "edges": [
            {"from": parent_id, "to": cause_id, "relation": "supports"},
            {"from": cause_id, "to": decision_id, "relation": "justifies"},
        ],
    }
    require(envelope.get("causal_graph") == expected_graph,
            "causal graph must be the exact deterministic head -> cause -> decision graph")

    time = envelope.get("time") or {}
    valid_time = time.get("valid_time")
    transaction_time = time.get("transaction_time")
    expected_trace = [
        {
            "id": f"sense:{head_sha}",
            "type": "sense",
            "sequence": 1,
            "ts": valid_time,
            "ref": parent_id,
            "previous": None,
        },
        {
            "id": f"transition:{basis_digest}",
            "type": "transition",
            "sequence": 2,
            "ts": transaction_time,
            "ref": cause_id,
            "previous": f"sense:{head_sha}",
        },
        {
            "id": f"commit:{basis_digest}",
            "type": "commit",
            "sequence": 3,
            "ts": transaction_time,
            "ref": decision_id,
            "previous": f"transition:{basis_digest}",
            "execution_committed": False,
        },
    ]
    require(envelope.get("trace") == expected_trace,
            "trace must be the exact deterministic sense -> transition -> advisory commit sequence")

    return list(dict.fromkeys(errors))


def recompute_record_id(envelope: dict[str, Any]) -> None:
    envelope.pop("record_id", None)
    envelope["record_id"] = f"review:{digest_json(envelope)}"


def self_test(path: Path) -> None:
    source = json.loads(path.read_text(encoding="utf-8"))
    errors = semantic_errors(source)
    if errors:
        raise AssertionError("canonical example failed semantic seal: " + "; ".join(errors))

    basis_tamper = copy.deepcopy(source)
    basis_tamper["causal_basis"]["findings"]["P2"] = 1
    digest = digest_json(basis_tamper["causal_basis"])
    new_cause = f"cause:{digest}"
    basis_tamper["transition"]["cause_id"] = new_cause
    basis_tamper["causal_graph"]["nodes"][1]["id"] = new_cause
    basis_tamper["causal_graph"]["edges"][0]["to"] = new_cause
    basis_tamper["causal_graph"]["edges"][1]["from"] = new_cause
    basis_tamper["trace"][1]["id"] = f"transition:{digest}"
    basis_tamper["trace"][1]["ref"] = new_cause
    basis_tamper["trace"][2]["id"] = f"commit:{digest}"
    basis_tamper["trace"][2]["previous"] = f"transition:{digest}"
    recompute_record_id(basis_tamper)
    assert not validate_envelope(basis_tamper), "base validator should accept internally rehashed basis tamper"
    assert any("deterministic projection" in error for error in semantic_errors(basis_tamper))

    tension_tamper = copy.deepcopy(source)
    tension_tamper["transition"]["tension"] = "looks safe"
    tension_tamper["transition"]["smallest_justified_action"] = "merge automatically"
    recompute_record_id(tension_tamper)
    assert not validate_envelope(tension_tamper), "base validator should accept rehashed narrative tamper"
    tension_errors = semantic_errors(tension_tamper)
    assert any("tension is not derived" in error for error in tension_errors)
    assert any("action is not derived" in error for error in tension_errors)

    graph_tamper = copy.deepcopy(source)
    graph_tamper["causal_graph"]["nodes"].append(
        {"id": "decision:shadow", "kind": "advisory_decision"}
    )
    graph_tamper["causal_graph"]["edges"].append(
        {
            "from": graph_tamper["transition"]["cause_id"],
            "to": "decision:shadow",
            "relation": "justifies",
        }
    )
    recompute_record_id(graph_tamper)
    assert not validate_envelope(graph_tamper), "base validator should accept non-dangling extra graph path"
    assert any("exact deterministic" in error for error in semantic_errors(graph_tamper))

    print("PASS semantic seal self-test")


def main(argv: list[str]) -> int:
    if len(argv) not in {2, 3} or argv[1] not in {"validate", "self-test"}:
        print(
            "Usage: verify_causal_review_semantics.py validate <path> | "
            "self-test [example-path]",
            file=sys.stderr,
        )
        return 2

    path = Path(argv[2] if len(argv) == 3 else "qa/causal-review-envelope.example.json")
    if argv[1] == "self-test":
        self_test(path)
        return 0

    envelope = json.loads(path.read_text(encoding="utf-8"))
    errors = semantic_errors(envelope)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"PASS semantic seal {path} ({envelope.get('record_id')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
