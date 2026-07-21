#!/usr/bin/env python3
"""Build and validate the Robis causal-review envelope.

The envelope is an advisory, exact-head artifact. It records a checked state
transition and evidence lineage, but grants no execution, approval, or merge
authority.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any, Iterable

SCHEMA_VERSION = "robis.causal-review.v1"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
DECISION_TO_STATE = {
    "BLOCK": "BLOCKED",
    "FIX_THEN_RERUN": "FIX_REQUIRED",
    "WAIT_FOR_EVIDENCE": "EVIDENCE_PENDING",
    "READY_WITH_ADVISORY_GAPS": "READY_ADVISORY",
    "READY": "READY",
}
INPUT_ROLES = {
    "pull_request": "PR_JSON_FILE",
    "head_commit": "HEAD_COMMIT_FILE",
    "issue_comments": "COMMENTS_FILE",
    "reviews": "REVIEWS_FILE",
    "review_comments": "REVIEW_COMMENTS_FILE",
    "review_threads": "THREADS_FILE",
    "check_runs": "CHECKS_FILE",
    "statuses": "STATUSES_FILE",
    "changed_files": "FILES_FILE",
}
ADVISORY_REVIEWERS = {"Codex", "Jules", "DeepSeek"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def isoformat_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        return datetime.min.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def item_time(item: dict[str, Any]) -> datetime:
    candidates = (
        item.get("submitted_at"),
        item.get("completed_at"),
        item.get("updated_at"),
        item.get("created_at"),
        item.get("started_at"),
        item.get("submittedAt"),
        item.get("completedAt"),
        item.get("updatedAt"),
        item.get("createdAt"),
    )
    return max((parse_time(value) for value in candidates if value), default=parse_time(None))


def iter_nested_items(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from iter_nested_items(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from iter_nested_items(nested)


def latest_evidence_time(values: Iterable[Any], minimum: datetime) -> datetime:
    latest = minimum
    for value in values:
        for item in iter_nested_items(value):
            latest = max(latest, item_time(item))
    return latest


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evidence_manifest() -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for role, variable in sorted(INPUT_ROLES.items()):
        raw = os.environ.get(variable, "").strip()
        if not raw:
            raise RuntimeError(f"Missing required environment variable: {variable}")
        path = Path(raw)
        if not path.is_file():
            raise RuntimeError(f"Evidence input is not a file: {variable}")
        size = path.stat().st_size
        if size <= 0:
            raise RuntimeError(f"Evidence input is empty: {variable}")
        manifest.append({"role": role, "byte_size": size, "sha256": file_sha256(path)})
    return manifest


def findings_total(findings: dict[str, int], severities: Iterable[str]) -> int:
    return sum(int(findings.get(severity, 0)) for severity in severities)


def expected_decision(envelope: dict[str, Any]) -> str:
    findings = envelope.get("findings") or {}
    checks = envelope.get("checks") or {}
    evidence = envelope.get("evidence") or {}
    reviewers = envelope.get("reviewers") or []

    if checks.get("failed") or findings_total(findings, ("P0", "P1")):
        return "BLOCK"
    if int(findings.get("P2", 0)):
        return "FIX_THEN_RERUN"
    if not evidence.get("pagination_complete"):
        return "WAIT_FOR_EVIDENCE"
    if int(checks.get("pending", 0)):
        return "WAIT_FOR_EVIDENCE"

    required = next((reviewer for reviewer in reviewers if reviewer.get("name") == "CodeRabbit"), None)
    if not required or not required.get("requested"):
        return "WAIT_FOR_EVIDENCE"
    required_complete = required.get("level") in {"E4", "E5"}
    required_waived = bool(required.get("waived")) and required.get("reason") == "QUOTA_EXHAUSTED"
    if not required_complete and not required_waived:
        return "WAIT_FOR_EVIDENCE"

    advisory_gaps = [
        reviewer.get("name")
        for reviewer in reviewers
        if reviewer.get("name") in ADVISORY_REVIEWERS and reviewer.get("level") not in {"E4", "E5"}
    ]
    if required_waived or advisory_gaps:
        return "READY_WITH_ADVISORY_GAPS"
    return "READY"


def transition_tension(conclusion: str, findings: dict[str, int], checks: dict[str, Any]) -> str:
    if conclusion == "BLOCK":
        return "required CI failure or P0/P1 finding"
    if conclusion == "FIX_THEN_RERUN":
        return f"{int(findings.get('P2', 0))} unresolved P2 causal finding(s)"
    if conclusion == "WAIT_FOR_EVIDENCE":
        return f"evidence incomplete or {int(checks.get('pending', 0))} required check(s) pending"
    if conclusion == "READY_WITH_ADVISORY_GAPS":
        return "required controls satisfied with explicit advisory/provider gaps"
    return "required controls and exact-head reviewer evidence satisfied"


def justified_action(conclusion: str) -> str:
    return {
        "BLOCK": "Stop; resolve blocking CI or P0/P1 causes before any readiness claim.",
        "FIX_THEN_RERUN": "Fix each unique P2 cause, create a new head, and rerun exact-head review.",
        "WAIT_FOR_EVIDENCE": "Collect the missing exact-head evidence; do not strengthen the verdict.",
        "READY_WITH_ADVISORY_GAPS": "Submit the advisory record to human adjudication with gaps visible.",
        "READY": "Submit the complete advisory record to human adjudication.",
    }[conclusion]


def reviewer_record(bot: Any) -> dict[str, Any]:
    return {
        "name": str(bot.name),
        "role": (
            "required" if bot.name == "CodeRabbit"
            else "dormant" if bot.name == "Qodo"
            else "advisory"
        ),
        "requested": bool(bot.requested),
        "level": str(bot.level),
        "state": str(bot.state),
        "reason": str(bot.reason),
        "action": str(bot.action),
        "waived": bool(bot.waived),
        "findings": {f"P{i}": int(bot.findings.get(f"P{i}", 0)) for i in range(4)},
    }


def causal_basis(*, head_sha: str, conclusion: str, findings: dict[str, int],
                 checks: dict[str, Any], evidence_complete: bool,
                 reviewers: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "head_sha": head_sha,
        "conclusion": conclusion,
        "findings": {f"P{i}": int(findings.get(f"P{i}", 0)) for i in range(4)},
        "checks": {
            "passed": int(checks["passed"]),
            "pending": int(checks["pending"]),
            "failed": sorted(str(name) for name in checks["failed"]),
        },
        "evidence_complete": bool(evidence_complete),
        "reviewers": [
            {
                "name": reviewer["name"],
                "requested": reviewer["requested"],
                "level": reviewer["level"],
                "reason": reviewer["reason"],
                "waived": reviewer["waived"],
                "findings": reviewer["findings"],
            }
            for reviewer in reviewers
        ],
    }


def build_envelope(*, repository: str, pr: dict[str, Any], head_time: datetime,
                   transaction_time: datetime, bots: list[Any], checks_summary: Any,
                   evidence_complete: bool, conclusion: str, why: str,
                   findings: dict[str, int], manifest: list[dict[str, Any]]) -> dict[str, Any]:
    head_sha = str(pr["head"]["sha"]).lower()
    pr_number = int(pr["number"])
    reviewers = [reviewer_record(bot) for bot in bots]
    checks = {
        "passed": int(checks_summary.passed),
        "pending": int(checks_summary.pending),
        "failed": sorted(str(name) for name in checks_summary.failed_names),
        "optional_failed": sorted(str(name) for name in checks_summary.optional_failed_names),
    }
    normalized_findings = {f"P{i}": int(findings.get(f"P{i}", 0)) for i in range(4)}
    basis = causal_basis(
        head_sha=head_sha,
        conclusion=conclusion,
        findings=normalized_findings,
        checks=checks,
        evidence_complete=evidence_complete,
        reviewers=reviewers,
    )
    basis_digest = digest_json(basis)
    cause_id = f"cause:{basis_digest}"
    parent_cause_id = f"head:{head_sha}"
    decision_id = f"decision:{head_sha}:{conclusion.lower()}"
    valid_time = isoformat_utc(head_time)
    recorded_time = isoformat_utc(transaction_time)
    sense_id = f"sense:{head_sha}"
    transition_id = f"transition:{basis_digest}"
    commit_id = f"commit:{basis_digest}"

    envelope: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "repository": repository,
        "pull_request": pr_number,
        "head_sha": head_sha,
        "thread_id": f"robis-pr-{pr_number}",
        "time": {
            "valid_time": valid_time,
            "transaction_time": recorded_time,
        },
        "space": {
            "origin": {"repository": repository, "pull_request": pr_number, "head_sha": head_sha},
            "crossed_boundary": "evidence_to_advisory_decision",
            "destination": "human_adjudication",
        },
        "transition": {
            "state_from": "HEAD_UPDATED",
            "state_to": DECISION_TO_STATE[conclusion],
            "tension": transition_tension(conclusion, normalized_findings, checks),
            "cause_id": cause_id,
            "parent_cause_id": parent_cause_id,
            "smallest_justified_action": justified_action(conclusion),
        },
        "authority": {
            "actor": "robis-ai-review-cooperation",
            "role": "advisory_aggregator",
            "can_execute": False,
            "can_approve": False,
            "can_merge": False,
            "human_adjudication_required": True,
        },
        "decision": {
            "id": decision_id,
            "verdict": conclusion,
            "why": why,
            "advisory_only": True,
        },
        "findings": normalized_findings,
        "checks": checks,
        "reviewers": reviewers,
        "evidence": {
            "pagination_complete": bool(evidence_complete),
            "manifest": manifest,
        },
        "causal_basis": basis,
        "causal_graph": {
            "root_ids": [parent_cause_id],
            "nodes": [
                {"id": parent_cause_id, "kind": "exact_head_state"},
                {"id": cause_id, "kind": "causal_basis"},
                {"id": decision_id, "kind": "advisory_decision"},
            ],
            "edges": [
                {"from": parent_cause_id, "to": cause_id, "relation": "supports"},
                {"from": cause_id, "to": decision_id, "relation": "justifies"},
            ],
        },
        "trace": [
            {
                "id": sense_id,
                "type": "sense",
                "sequence": 1,
                "ts": valid_time,
                "ref": parent_cause_id,
                "previous": None,
            },
            {
                "id": transition_id,
                "type": "transition",
                "sequence": 2,
                "ts": recorded_time,
                "ref": cause_id,
                "previous": sense_id,
            },
            {
                "id": commit_id,
                "type": "commit",
                "sequence": 3,
                "ts": recorded_time,
                "ref": decision_id,
                "previous": transition_id,
                "execution_committed": False,
            },
        ],
        "supersession": {
            "supersedes_record": None,
            "must_be_superseded_after_head_change": True,
        },
    }
    envelope["record_id"] = f"review:{digest_json(envelope)}"
    return envelope


def validate_envelope(envelope: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    require(envelope.get("schema_version") == SCHEMA_VERSION, "unsupported schema_version")
    repository = str(envelope.get("repository") or "")
    require("/" in repository and not repository.startswith("/") and not repository.endswith("/"),
            "repository must be owner/name")
    require(isinstance(envelope.get("pull_request"), int) and envelope["pull_request"] > 0,
            "pull_request must be a positive integer")
    head_sha = str(envelope.get("head_sha") or "").lower()
    require(bool(SHA_RE.fullmatch(head_sha)), "head_sha must be a full lowercase SHA")
    require(envelope.get("thread_id") == f"robis-pr-{envelope.get('pull_request')}",
            "thread_id is not bound to pull_request")

    time = envelope.get("time") or {}
    valid_time = parse_time(time.get("valid_time"))
    transaction_time = parse_time(time.get("transaction_time"))
    require(valid_time != parse_time(None), "valid_time is missing")
    require(transaction_time != parse_time(None), "transaction_time is missing")
    require(transaction_time >= valid_time, "transaction_time precedes valid_time")

    space = envelope.get("space") or {}
    origin = space.get("origin") or {}
    require(origin.get("repository") == repository, "space origin repository mismatch")
    require(origin.get("pull_request") == envelope.get("pull_request"), "space origin PR mismatch")
    require(origin.get("head_sha") == head_sha, "space origin head mismatch")
    require(space.get("crossed_boundary") == "evidence_to_advisory_decision",
            "unexpected crossed boundary")
    require(space.get("destination") == "human_adjudication", "unexpected space destination")

    authority = envelope.get("authority") or {}
    require(authority.get("role") == "advisory_aggregator", "authority role must be advisory")
    require(authority.get("can_execute") is False, "envelope grants execution authority")
    require(authority.get("can_approve") is False, "envelope grants approval authority")
    require(authority.get("can_merge") is False, "envelope grants merge authority")
    require(authority.get("human_adjudication_required") is True,
            "human adjudication boundary is missing")

    decision = envelope.get("decision") or {}
    verdict = str(decision.get("verdict") or "")
    require(verdict in DECISION_TO_STATE, "unknown decision verdict")
    require(decision.get("advisory_only") is True, "decision must be advisory_only")
    require(decision.get("id") == f"decision:{head_sha}:{verdict.lower()}",
            "decision id is not exact-head bound")
    if verdict in DECISION_TO_STATE:
        require(verdict == expected_decision(envelope), "decision contradicts evidence")

    transition = envelope.get("transition") or {}
    require(transition.get("state_from") == "HEAD_UPDATED", "unexpected state_from")
    if verdict in DECISION_TO_STATE:
        require(transition.get("state_to") == DECISION_TO_STATE[verdict],
                "state_to does not match decision")
    parent_cause_id = f"head:{head_sha}"
    require(transition.get("parent_cause_id") == parent_cause_id,
            "transition parent cause is not the exact head")
    require(bool(str(transition.get("smallest_justified_action") or "").strip()),
            "smallest justified action is missing")

    basis = envelope.get("causal_basis") or {}
    require(basis.get("head_sha") == head_sha, "causal basis head mismatch")
    require(basis.get("conclusion") == verdict, "causal basis conclusion mismatch")
    expected_cause_id = f"cause:{digest_json(basis)}"
    require(transition.get("cause_id") == expected_cause_id, "cause_id does not match causal basis")

    graph = envelope.get("causal_graph") or {}
    nodes = graph.get("nodes") or []
    node_ids = [node.get("id") for node in nodes if isinstance(node, dict)]
    require(len(node_ids) == len(set(node_ids)), "causal graph contains duplicate node ids")
    require(graph.get("root_ids") == [parent_cause_id], "causal graph root is ambiguous")
    require(parent_cause_id in node_ids, "causal graph is missing parent head node")
    require(expected_cause_id in node_ids, "causal graph is missing cause node")
    require(decision.get("id") in node_ids, "causal graph is missing decision node")
    edges = graph.get("edges") or []
    expected_edges = {
        (parent_cause_id, expected_cause_id, "supports"),
        (expected_cause_id, decision.get("id"), "justifies"),
    }
    actual_edges = {
        (edge.get("from"), edge.get("to"), edge.get("relation"))
        for edge in edges if isinstance(edge, dict)
    }
    require(expected_edges.issubset(actual_edges), "causal graph lineage is incomplete")
    require(all(source in node_ids and target in node_ids for source, target, _ in actual_edges),
            "causal graph contains dangling edges")

    trace = envelope.get("trace") or []
    require([item.get("type") for item in trace if isinstance(item, dict)] ==
            ["sense", "transition", "commit"], "trace must be sense -> transition -> commit")
    require([item.get("sequence") for item in trace if isinstance(item, dict)] == [1, 2, 3],
            "trace sequence is invalid")
    if len(trace) == 3 and all(isinstance(item, dict) for item in trace):
        trace_times = [parse_time(item.get("ts")) for item in trace]
        require(trace_times == sorted(trace_times), "trace timestamps are not monotonic")
        require(trace[0].get("ref") == parent_cause_id, "sense is not bound to exact head")
        require(trace[1].get("ref") == expected_cause_id, "transition is not bound to cause")
        require(trace[2].get("ref") == decision.get("id"), "commit is not bound to decision")
        require(trace[0].get("previous") is None, "sense must be the trace root")
        require(trace[1].get("previous") == trace[0].get("id"), "transition previous link invalid")
        require(trace[2].get("previous") == trace[1].get("id"), "commit previous link invalid")
        require(trace[2].get("execution_committed") is False,
                "advisory trace cannot commit execution")

    supersession = envelope.get("supersession") or {}
    require(supersession.get("must_be_superseded_after_head_change") is True,
            "head-change supersession rule is missing")

    evidence = envelope.get("evidence") or {}
    manifest = evidence.get("manifest") or []
    roles = [item.get("role") for item in manifest if isinstance(item, dict)]
    require(roles == sorted(INPUT_ROLES), "evidence manifest roles are incomplete or unordered")
    for item in manifest:
        if not isinstance(item, dict):
            errors.append("evidence manifest entries must be objects")
            continue
        require(bool(DIGEST_RE.fullmatch(str(item.get("sha256") or ""))),
                f"invalid evidence digest for {item.get('role')}")
        require(isinstance(item.get("byte_size"), int) and item["byte_size"] > 0,
                f"invalid evidence byte size for {item.get('role')}")

    record_id = str(envelope.get("record_id") or "")
    clone = copy.deepcopy(envelope)
    clone.pop("record_id", None)
    require(record_id == f"review:{digest_json(clone)}", "record_id does not match envelope bytes")

    return errors


def load_cooperation_module() -> ModuleType:
    path = Path(__file__).with_name("ai-review-cooperation.py")
    spec = importlib.util.spec_from_file_location("robis_ai_review_cooperation", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load cooperation reporter: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def read_environment_inputs(cooperation: ModuleType) -> dict[str, Any]:
    return {
        "pr": cooperation.read_json_env("PR_JSON_FILE"),
        "head_commit": cooperation.read_json_env("HEAD_COMMIT_FILE"),
        "comments": cooperation.read_json_env("COMMENTS_FILE"),
        "reviews": cooperation.read_json_env("REVIEWS_FILE"),
        "review_comments": cooperation.read_json_env("REVIEW_COMMENTS_FILE"),
        "threads_data": cooperation.read_json_env("THREADS_FILE"),
        "checks_raw": cooperation.read_json_env("CHECKS_FILE"),
        "statuses": cooperation.read_json_env("STATUSES_FILE"),
        "files": cooperation.read_json_env("FILES_FILE"),
    }


def build_from_environment() -> dict[str, Any]:
    cooperation = load_cooperation_module()
    inputs = read_environment_inputs(cooperation)
    pr = inputs["pr"]
    head_commit = inputs["head_commit"]
    commit = head_commit.get("commit") or {}
    head_time = cooperation.parse_time(
        str((commit.get("committer") or {}).get("date") or (commit.get("author") or {}).get("date") or "")
    )
    available, complete, threads = cooperation.flatten_threads(inputs["threads_data"])
    bots = cooperation.classify_bots(
        pr=pr,
        comments=inputs["comments"],
        reviews=inputs["reviews"],
        review_comments=inputs["review_comments"],
        threads=threads,
        threads_available=available,
        statuses=inputs["statuses"],
        changed_paths={str(item.get("filename") or "") for item in inputs["files"]},
        head_time=head_time,
    )
    checks_summary = cooperation.classify_checks(inputs["checks_raw"])
    conclusion, why = cooperation.overall_conclusion(
        bots, checks=checks_summary, evidence_complete=complete
    )
    findings = cooperation.combined_findings(bots)
    transaction_time = latest_evidence_time(
        (
            inputs["comments"],
            inputs["reviews"],
            inputs["review_comments"],
            threads,
            inputs["checks_raw"].get("check_runs") or [],
            inputs["statuses"],
        ),
        head_time,
    )
    repository = os.environ.get("REPOSITORY", "").strip()
    if not repository:
        base_repo = ((pr.get("base") or {}).get("repo") or {}).get("full_name")
        repository = str(base_repo or "").strip()
    if not repository:
        raise RuntimeError("Cannot determine repository owner/name")

    envelope = build_envelope(
        repository=repository,
        pr=pr,
        head_time=head_time,
        transaction_time=transaction_time,
        bots=bots,
        checks_summary=checks_summary,
        evidence_complete=complete,
        conclusion=conclusion,
        why=why,
        findings=findings,
        manifest=evidence_manifest(),
    )
    errors = validate_envelope(envelope)
    if errors:
        raise RuntimeError("Generated causal envelope is invalid: " + "; ".join(errors))
    return envelope


def write_envelope(envelope: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(envelope, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in {"build", "validate"}:
        print("Usage: causal_review_envelope.py build | validate <path>", file=sys.stderr)
        return 2

    if argv[1] == "build":
        output = Path(os.environ.get("CAUSAL_ENVELOPE_FILE") or "causal-review-envelope.json")
        envelope = build_from_environment()
        write_envelope(envelope, output)
        print(
            f"Causal envelope {envelope['record_id']} -> "
            f"{envelope['decision']['verdict']} at {output}"
        )
        return 0

    if len(argv) != 3:
        print("Usage: causal_review_envelope.py validate <path>", file=sys.stderr)
        return 2
    path = Path(argv[2])
    envelope = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_envelope(envelope)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"PASS {path} ({envelope['record_id']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
