#!/usr/bin/env python3
"""Build and validate Robis Virtual Review Panel v1 records.

The panel is transparent advisory evidence. It may represent one model executing
separate role contracts or multiple independently identified providers, but it
never impersonates an external reviewer and never grants execution, approval,
or merge authority.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "robis.virtual-review-panel.v1"
ROLE_IDS = [
    "causal_architect",
    "temporal_provenance",
    "adversarial_semantics",
    "authority_safety",
    "ci_reliability",
]
SEVERITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
ACTIVATION_REASONS = {
    "QUOTA_EXHAUSTED",
    "PROVIDER_UNAVAILABLE",
    "NO_ACK",
    "MANUAL_ADVISORY_REQUEST",
}
VERDICTS = {
    "BLOCK",
    "FIX_THEN_RERUN",
    "WAIT_FOR_EVIDENCE",
    "READY_WITH_ADVISORY_GAPS",
}
ROLE_VOTES = VERDICTS | {"PASS"}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def severity_rank(value: str) -> int:
    return SEVERITY_ORDER.get(value, 99)


def strongest_severity(values: list[str]) -> str:
    if not values:
        raise ValueError("at least one severity is required")
    return min(values, key=severity_rank)


def expected_verdict(record: dict[str, Any]) -> str:
    observations = [
        observation
        for role in record.get("roles", [])
        for observation in role.get("observations", [])
    ]
    severities = {item.get("severity") for item in observations}
    if severities & {"P0", "P1"}:
        return "BLOCK"
    if severities & {"P2", "P3"}:
        return "FIX_THEN_RERUN"

    activation = record.get("activation") or {}
    if activation.get("reason_code") in {
        "QUOTA_EXHAUSTED",
        "PROVIDER_UNAVAILABLE",
        "NO_ACK",
    }:
        return "READY_WITH_ADVISORY_GAPS"
    return "WAIT_FOR_EVIDENCE"


def state_for(verdict: str) -> str:
    return {
        "BLOCK": "BLOCKED",
        "FIX_THEN_RERUN": "FIX_REQUIRED",
        "WAIT_FOR_EVIDENCE": "EVIDENCE_PENDING",
        "READY_WITH_ADVISORY_GAPS": "READY_ADVISORY",
    }[verdict]


def dedupe_root_causes(roles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for role in roles:
        role_id = str(role.get("id") or "")
        for observation in role.get("observations", []):
            key = str(observation.get("root_cause_key") or "")
            grouped.setdefault(key, []).append((role_id, observation))

    result: list[dict[str, Any]] = []
    for key in sorted(grouped):
        members = grouped[key]
        severities = [str(item["severity"]) for _, item in members]
        observation_ids = sorted(str(item["id"]) for _, item in members)
        roles_for_cause = sorted({role_id for role_id, _ in members})
        titles = sorted({str(item["title"]).strip() for _, item in members})
        result.append(
            {
                "key": key,
                "severity": strongest_severity(severities),
                "roles": roles_for_cause,
                "observation_ids": observation_ids,
                "title": titles[0],
            }
        )
    return result


def expected_dissent(record: dict[str, Any]) -> list[dict[str, str]]:
    verdict = str((record.get("decision") or {}).get("verdict") or "")
    result = []
    for role in record.get("roles", []):
        vote = str(role.get("vote") or "")
        if vote not in {verdict, "PASS"}:
            result.append(
                {
                    "role_id": str(role.get("id") or ""),
                    "vote": vote,
                    "reason": str(role.get("rationale") or "").strip(),
                }
            )
    return result


def causal_basis(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": record.get("subject"),
        "activation": record.get("activation"),
        "implementation": record.get("implementation"),
        "roles": record.get("roles"),
        "root_causes": record.get("root_causes"),
        "dissent": record.get("dissent"),
        "evidence": record.get("evidence"),
        "decision": {
            "verdict": (record.get("decision") or {}).get("verdict"),
            "advisory_only": (record.get("decision") or {}).get("advisory_only"),
        },
    }


def recompute_record_id(record: dict[str, Any]) -> None:
    record.pop("record_id", None)
    record["record_id"] = f"panel:{digest_json(record)}"


def validate_record(record: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    require(record.get("schema_version") == SCHEMA_VERSION, "unsupported schema_version")

    subject = record.get("subject") or {}
    repository = str(subject.get("repository") or "")
    pr_number = subject.get("pull_request")
    head_sha = str(subject.get("head_sha") or "").lower()
    require("/" in repository and not repository.startswith("/") and not repository.endswith("/"),
            "subject.repository must be owner/name")
    require(isinstance(pr_number, int) and not isinstance(pr_number, bool) and pr_number > 0,
            "subject.pull_request must be a positive integer")
    require(bool(SHA_RE.fullmatch(head_sha)), "subject.head_sha must be a full lowercase SHA")

    activation = record.get("activation") or {}
    require(activation.get("reason_code") in ACTIVATION_REASONS, "unsupported activation reason")
    require(activation.get("external_lane_satisfied") is False,
            "virtual panel cannot satisfy the external reviewer lane")
    require(activation.get("external_provider") == "CodeRabbit",
            "external provider identity must remain explicit")

    implementation = record.get("implementation") or {}
    mode = implementation.get("mode")
    providers = implementation.get("providers") or []
    require(mode in {"single_model_role_simulation", "multi_provider"},
            "unsupported implementation mode")
    require(implementation.get("disclosed") is True, "implementation identity must be disclosed")
    require(implementation.get("external_provider_substitute") is False,
            "panel cannot impersonate or substitute the external reviewer")
    require(isinstance(providers, list) and providers, "implementation.providers must be non-empty")
    provider_ids = [str(item.get("id") or "") for item in providers if isinstance(item, dict)]
    require(len(provider_ids) == len(set(provider_ids)), "provider identities must be unique")
    if mode == "single_model_role_simulation":
        require(len(provider_ids) == 1, "single-model mode must disclose exactly one provider")
    if mode == "multi_provider":
        require(len(provider_ids) >= 2, "multi-provider mode requires at least two providers")
        require(all(str(item.get("evidence_ref") or "").strip() for item in providers),
                "multi-provider identities require evidence_ref")

    authority = record.get("authority") or {}
    require(authority.get("role") == "advisory_panel", "authority role must be advisory_panel")
    require(authority.get("can_execute") is False, "panel grants execution authority")
    require(authority.get("can_approve") is False, "panel grants approval authority")
    require(authority.get("can_merge") is False, "panel grants merge authority")
    require(authority.get("human_adjudication_required") is True,
            "human adjudication boundary is missing")

    roles = record.get("roles")
    require(isinstance(roles, list), "roles must be an array")
    roles = roles if isinstance(roles, list) else []
    role_ids = [role.get("id") for role in roles if isinstance(role, dict)]
    require(role_ids == ROLE_IDS, "role identities or ordering differ from the v1 contract")
    observation_ids: list[str] = []
    for role in roles:
        if not isinstance(role, dict):
            errors.append("role entries must be objects")
            continue
        role_id = str(role.get("id") or "")
        require(role.get("vote") in ROLE_VOTES, f"invalid vote for {role_id}")
        require(bool(str(role.get("rationale") or "").strip()), f"missing rationale for {role_id}")
        observations = role.get("observations")
        require(isinstance(observations, list), f"observations must be an array for {role_id}")
        for observation in observations or []:
            if not isinstance(observation, dict):
                errors.append(f"observation entries must be objects for {role_id}")
                continue
            observation_id = str(observation.get("id") or "")
            observation_ids.append(observation_id)
            require(observation_id.startswith(f"{role_id}:"),
                    f"observation id is not role-bound: {observation_id}")
            require(observation.get("severity") in SEVERITY_ORDER,
                    f"invalid severity for {observation_id}")
            require(bool(str(observation.get("root_cause_key") or "").strip()),
                    f"missing root_cause_key for {observation_id}")
            require(bool(str(observation.get("title") or "").strip()),
                    f"missing title for {observation_id}")
            confidence = observation.get("confidence")
            require(isinstance(confidence, (int, float)) and not isinstance(confidence, bool)
                    and 0 <= confidence <= 1,
                    f"invalid confidence for {observation_id}")
            evidence_refs = observation.get("evidence_refs")
            require(isinstance(evidence_refs, list) and evidence_refs,
                    f"evidence_refs must be non-empty for {observation_id}")
            for evidence_ref in evidence_refs or []:
                require(evidence_ref.get("head_sha") == head_sha,
                        f"stale evidence head for {observation_id}")
                require(bool(str(evidence_ref.get("path") or "").strip()),
                        f"missing evidence path for {observation_id}")

    require(len(observation_ids) == len(set(observation_ids)), "observation ids must be unique")

    expected_roots = dedupe_root_causes(roles)
    require(record.get("root_causes") == expected_roots,
            "root_causes must be the deterministic deduplication of role observations")

    decision = record.get("decision") or {}
    verdict = str(decision.get("verdict") or "")
    require(verdict in VERDICTS, "unsupported decision verdict")
    require(decision.get("advisory_only") is True, "decision must be advisory_only")
    require(verdict == expected_verdict(record), "decision contradicts panel observations")
    require(decision.get("id") == f"panel-decision:{head_sha}:{verdict.lower()}",
            "decision id is not exact-head bound")

    expected_dissent_value = expected_dissent(record)
    require(record.get("dissent") == expected_dissent_value,
            "dissent must preserve every non-PASS role vote that differs from the final verdict")

    transition = record.get("transition") or {}
    require(transition.get("state_from") == "EXTERNAL_REVIEW_STALLED",
            "unexpected transition.state_from")
    if verdict in VERDICTS:
        require(transition.get("state_to") == state_for(verdict),
                "transition.state_to does not match the verdict")
    require(transition.get("parent_cause_id") == f"head:{head_sha}",
            "transition parent cause is not the exact head")
    require(bool(str(transition.get("smallest_justified_action") or "").strip()),
            "smallest justified action is missing")

    evidence = record.get("evidence") or {}
    require(evidence.get("head_sha") == head_sha, "evidence is not exact-head bound")
    manifest = evidence.get("manifest")
    require(isinstance(manifest, list) and manifest, "evidence.manifest must be non-empty")
    manifest_roles = [item.get("role") for item in manifest or [] if isinstance(item, dict)]
    require(manifest_roles == sorted(manifest_roles), "evidence manifest must be sorted")
    require(len(manifest_roles) == len(set(manifest_roles)), "evidence manifest roles must be unique")
    for item in manifest or []:
        if not isinstance(item, dict):
            errors.append("evidence manifest entries must be objects")
            continue
        require(bool(DIGEST_RE.fullmatch(str(item.get("sha256") or ""))),
                f"invalid evidence digest for {item.get('role')}")
        require(isinstance(item.get("byte_size"), int) and not isinstance(item.get("byte_size"), bool)
                and item["byte_size"] > 0,
                f"invalid evidence byte size for {item.get('role')}")
        require(item.get("head_sha") == head_sha,
                f"manifest entry is stale for {item.get('role')}")

    basis = record.get("causal_basis")
    expected_basis = causal_basis(record)
    require(basis == expected_basis,
            "causal_basis must be a deterministic projection of panel evidence")
    basis_digest = digest_json(expected_basis)
    require(transition.get("cause_id") == f"panel-cause:{basis_digest}",
            "transition cause_id does not match the causal basis")

    time = record.get("time") or {}
    valid_time = str(time.get("valid_time") or "")
    transaction_time = str(time.get("transaction_time") or "")
    require(valid_time.endswith("Z") and transaction_time.endswith("Z"),
            "time axes must be explicit UTC values")
    require(time.get("valid_time_source") == "github_pull_request_head_observation",
            "valid_time must describe trusted head observation, not issuer-selected commit time")

    supersession = record.get("supersession") or {}
    require(supersession.get("must_be_superseded_after_head_change") is True,
            "head-change supersession rule is missing")

    record_id = str(record.get("record_id") or "")
    clone = copy.deepcopy(record)
    clone.pop("record_id", None)
    require(record_id == f"panel:{digest_json(clone)}",
            "record_id does not match the complete panel bytes")

    return list(dict.fromkeys(errors))


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, record: dict[str, Any]) -> None:
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def command_validate(path: Path) -> int:
    record = load(path)
    errors = validate_record(record)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"PASS virtual review panel {path} ({record['record_id']})")
    return 0


def command_normalize(source: Path, output: Path) -> int:
    record = load(source)
    record["root_causes"] = dedupe_root_causes(record.get("roles") or [])
    verdict = expected_verdict(record)
    record.setdefault("decision", {})["verdict"] = verdict
    record["decision"]["advisory_only"] = True
    head = str((record.get("subject") or {}).get("head_sha") or "").lower()
    record["decision"]["id"] = f"panel-decision:{head}:{verdict.lower()}"
    record["dissent"] = expected_dissent(record)
    record.setdefault("transition", {})["state_from"] = "EXTERNAL_REVIEW_STALLED"
    record["transition"]["state_to"] = state_for(verdict)
    record["transition"]["parent_cause_id"] = f"head:{head}"
    record["causal_basis"] = causal_basis(record)
    record["transition"]["cause_id"] = f"panel-cause:{digest_json(record['causal_basis'])}"
    recompute_record_id(record)
    errors = validate_record(record)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    write(output, record)
    print(f"WROTE {output} ({record['record_id']})")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) not in {3, 4} or argv[1] not in {"validate", "normalize"}:
        print(
            "Usage: virtual_review_panel.py validate <record.json> | "
            "normalize <source.json> <output.json>",
            file=sys.stderr,
        )
        return 2
    if argv[1] == "validate":
        return command_validate(Path(argv[2]))
    if len(argv) != 4:
        return 2
    return command_normalize(Path(argv[2]), Path(argv[3]))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
