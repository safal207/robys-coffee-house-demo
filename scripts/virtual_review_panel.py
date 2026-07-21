#!/usr/bin/env python3
"""Build, normalize, and validate Robis Virtual Review Panel v1 records.

The panel is advisory evidence. It may represent one model executing separate
role contracts or several independently identified providers, but it never
impersonates an external reviewer and never gains execution, approval, or merge
authority.
"""

from __future__ import annotations

import base64
import binascii
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
REPOSITORY_RE = re.compile(r"^[^/\s]+/[^/\s]+$")


def canonical_json(value: Any) -> str:
    """Return the deterministic UTF-8 JSON representation used for digests."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest_json(value: Any) -> str:
    """Return the SHA-256 digest of deterministic JSON bytes."""
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def severity_rank(value: str) -> int:
    """Return the ordering rank for a supported severity."""
    return SEVERITY_ORDER.get(value, 99)


def strongest_severity(values: list[str]) -> str:
    """Return the strongest severity from a non-empty list."""
    if not values:
        raise ValueError("at least one severity is required")
    return min(values, key=severity_rank)


def observations_of(role: Any) -> list[dict[str, Any]]:
    """Return only object-shaped observations from one role record."""
    if not isinstance(role, dict) or not isinstance(role.get("observations"), list):
        return []
    return [item for item in role["observations"] if isinstance(item, dict)]


def expected_role_vote(role: dict[str, Any]) -> set[str]:
    """Return votes consistent with the severity of one role's observations."""
    severities = {item.get("severity") for item in observations_of(role)}
    if severities & {"P0", "P1"}:
        return {"BLOCK"}
    if severities & {"P2", "P3"}:
        return {"FIX_THEN_RERUN"}
    return {"PASS", "WAIT_FOR_EVIDENCE", "READY_WITH_ADVISORY_GAPS"}


def role_vote_is_consistent(role: dict[str, Any]) -> bool:
    """Return whether a role vote is compatible with its own observations."""
    return str(role.get("vote") or "") in expected_role_vote(role)


def expected_verdict(record: dict[str, Any]) -> str:
    """Derive the panel verdict from all role observations and activation state."""
    observations = [
        observation
        for role in record.get("roles", [])
        if isinstance(role, dict)
        for observation in observations_of(role)
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
    """Map a supported verdict to its transition state."""
    return {
        "BLOCK": "BLOCKED",
        "FIX_THEN_RERUN": "FIX_REQUIRED",
        "WAIT_FOR_EVIDENCE": "EVIDENCE_PENDING",
        "READY_WITH_ADVISORY_GAPS": "READY_ADVISORY",
    }[verdict]


def dedupe_root_causes(roles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate role observations into deterministic causal root records."""
    grouped: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for role in roles:
        if not isinstance(role, dict):
            continue
        role_id = str(role.get("id") or "")
        for observation in observations_of(role):
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
    """Preserve alternative governing votes and every internally inconsistent vote."""
    verdict = str((record.get("decision") or {}).get("verdict") or "")
    result: list[dict[str, str]] = []
    for role in record.get("roles", []):
        if not isinstance(role, dict):
            continue
        vote = str(role.get("vote") or "")
        inconsistent = not role_vote_is_consistent(role)
        if inconsistent or vote not in {verdict, "PASS"}:
            result.append(
                {
                    "role_id": str(role.get("id") or ""),
                    "vote": vote,
                    "reason": str(role.get("rationale") or "").strip(),
                }
            )
    return result


def decode_manifest_bytes(item: dict[str, Any]) -> bytes | None:
    """Decode strict base64 evidence bytes from one manifest entry."""
    value = item.get("content_base64")
    if not isinstance(value, str) or not value:
        return None
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return None


def causal_basis(record: dict[str, Any]) -> dict[str, Any]:
    """Project the exact evidence that is permitted to justify a panel decision."""
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
    """Replace record_id with the digest of every other record field."""
    record.pop("record_id", None)
    record["record_id"] = f"panel:{digest_json(record)}"


def validate_record(record: dict[str, Any]) -> list[str]:
    """Validate semantic, causal, temporal, identity, and byte-integrity invariants."""
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    require(isinstance(record, dict), "panel record must be an object")
    if not isinstance(record, dict):
        return errors

    require(record.get("schema_version") == SCHEMA_VERSION, "unsupported schema_version")

    subject = record.get("subject") if isinstance(record.get("subject"), dict) else {}
    repository = str(subject.get("repository") or "")
    pr_number = subject.get("pull_request")
    head_sha = str(subject.get("head_sha") or "").lower()
    require(bool(REPOSITORY_RE.fullmatch(repository)), "subject.repository must be exactly owner/name")
    require(isinstance(pr_number, int) and not isinstance(pr_number, bool) and pr_number > 0,
            "subject.pull_request must be a positive integer")
    require(bool(SHA_RE.fullmatch(head_sha)), "subject.head_sha must be a full lowercase SHA")

    activation = record.get("activation") if isinstance(record.get("activation"), dict) else {}
    require(activation.get("reason_code") in ACTIVATION_REASONS, "unsupported activation reason")
    require(activation.get("external_lane_satisfied") is False,
            "virtual panel cannot satisfy the external reviewer lane")
    require(activation.get("external_provider") == "CodeRabbit",
            "external provider identity must remain explicit")
    require(bool(str(activation.get("provider_evidence_ref") or "").strip()),
            "activation.provider_evidence_ref must be non-empty")

    implementation = record.get("implementation") if isinstance(record.get("implementation"), dict) else {}
    mode = implementation.get("mode")
    providers = implementation.get("providers")
    require(mode in {"single_model_role_simulation", "multi_provider"}, "unsupported implementation mode")
    require(implementation.get("disclosed") is True, "implementation identity must be disclosed")
    require(implementation.get("external_provider_substitute") is False,
            "panel cannot impersonate or substitute the external reviewer")
    require(isinstance(providers, list) and bool(providers), "implementation.providers must be non-empty")
    providers = providers if isinstance(providers, list) else []
    provider_ids: list[str] = []
    for index, provider in enumerate(providers):
        if not isinstance(provider, dict):
            errors.append(f"provider {index} must be an object")
            continue
        for field in ("id", "label", "evidence_ref"):
            require(bool(str(provider.get(field) or "").strip()), f"provider {index}.{field} must be non-empty")
        provider_ids.append(str(provider.get("id") or ""))
    require(len(provider_ids) == len(set(provider_ids)), "provider identities must be unique")
    if mode == "single_model_role_simulation":
        require(len(provider_ids) == 1, "single-model mode must disclose exactly one provider")
    if mode == "multi_provider":
        require(len(provider_ids) >= 2, "multi-provider mode requires at least two providers")

    authority = record.get("authority") if isinstance(record.get("authority"), dict) else {}
    require(authority.get("role") == "advisory_panel", "authority role must be advisory_panel")
    require(authority.get("can_execute") is False, "panel grants execution authority")
    require(authority.get("can_approve") is False, "panel grants approval authority")
    require(authority.get("can_merge") is False, "panel grants merge authority")
    require(authority.get("human_adjudication_required") is True, "human adjudication boundary is missing")

    roles = record.get("roles")
    require(isinstance(roles, list), "roles must be an array")
    roles = roles if isinstance(roles, list) else []
    role_ids = [role.get("id") for role in roles if isinstance(role, dict)]
    require(role_ids == ROLE_IDS, "role identities or ordering differ from the v1 contract")
    observation_ids: list[str] = []
    for role_index, role in enumerate(roles):
        if not isinstance(role, dict):
            errors.append(f"role {role_index} must be an object")
            continue
        role_id = str(role.get("id") or "")
        vote = str(role.get("vote") or "")
        require(vote in ROLE_VOTES, f"invalid vote for {role_id}")
        require(bool(str(role.get("rationale") or "").strip()), f"missing rationale for {role_id}")
        observations = role.get("observations")
        require(isinstance(observations, list), f"observations must be an array for {role_id}")
        if vote in ROLE_VOTES:
            allowed_votes = expected_role_vote(role)
            require(vote in allowed_votes,
                    f"{role_id} vote {vote} contradicts its own observation severities; expected one of {sorted(allowed_votes)}")
        for observation_index, observation in enumerate(observations or []):
            if not isinstance(observation, dict):
                errors.append(f"role {role_index} observation {observation_index} must be an object")
                continue
            observation_id = str(observation.get("id") or "")
            observation_ids.append(observation_id)
            require(observation_id.startswith(f"{role_id}:"), f"observation id is not role-bound: {observation_id}")
            require(observation.get("severity") in SEVERITY_ORDER, f"invalid severity for {observation_id}")
            require(bool(str(observation.get("root_cause_key") or "").strip()),
                    f"missing root_cause_key for {observation_id}")
            require(bool(str(observation.get("title") or "").strip()), f"missing title for {observation_id}")
            require(bool(str(observation.get("recommendation") or "").strip()),
                    f"missing recommendation for {observation_id}")
            confidence = observation.get("confidence")
            require(isinstance(confidence, (int, float)) and not isinstance(confidence, bool) and 0 <= confidence <= 1,
                    f"invalid confidence for {observation_id}")
            evidence_refs = observation.get("evidence_refs")
            require(isinstance(evidence_refs, list) and bool(evidence_refs),
                    f"evidence_refs must be non-empty for {observation_id}")
            for ref_index, evidence_ref in enumerate(evidence_refs or []):
                if not isinstance(evidence_ref, dict):
                    errors.append(f"evidence reference {ref_index} must be an object")
                    continue
                require(evidence_ref.get("head_sha") == head_sha, f"stale evidence head for {observation_id}")
                require(bool(str(evidence_ref.get("path") or "").strip()), f"missing evidence path for {observation_id}")
                line = evidence_ref.get("line")
                require(isinstance(line, int) and not isinstance(line, bool) and line > 0,
                        f"invalid evidence line for {observation_id}")

    require(len(observation_ids) == len(set(observation_ids)), "observation ids must be unique")

    expected_roots = dedupe_root_causes(roles)
    require(record.get("root_causes") == expected_roots,
            "root_causes must be the deterministic deduplication of role observations")

    decision = record.get("decision") if isinstance(record.get("decision"), dict) else {}
    verdict = str(decision.get("verdict") or "")
    require(verdict in VERDICTS, "unsupported decision verdict")
    require(decision.get("advisory_only") is True, "decision must be advisory_only")
    if verdict in VERDICTS:
        require(verdict == expected_verdict(record), "decision contradicts panel observations")
    require(decision.get("id") == f"panel-decision:{head_sha}:{verdict.lower()}",
            "decision id is not exact-head bound")

    expected_dissent_value = expected_dissent(record)
    require(record.get("dissent") == expected_dissent_value,
            "dissent must preserve alternative governing votes and every internally inconsistent role vote")

    transition = record.get("transition") if isinstance(record.get("transition"), dict) else {}
    require(transition.get("state_from") == "EXTERNAL_REVIEW_STALLED", "unexpected transition.state_from")
    if verdict in VERDICTS:
        require(transition.get("state_to") == state_for(verdict), "transition.state_to does not match the verdict")
    require(bool(str(transition.get("tension") or "").strip()), "transition.tension must be non-empty")
    require(transition.get("parent_cause_id") == f"head:{head_sha}",
            "transition parent cause is not the exact head")
    require(bool(str(transition.get("smallest_justified_action") or "").strip()),
            "smallest justified action is missing")

    evidence = record.get("evidence") if isinstance(record.get("evidence"), dict) else {}
    require(evidence.get("head_sha") == head_sha, "evidence is not exact-head bound")
    manifest = evidence.get("manifest")
    require(isinstance(manifest, list) and bool(manifest), "evidence.manifest must be non-empty")
    manifest = manifest if isinstance(manifest, list) else []
    manifest_roles = [item.get("role") for item in manifest if isinstance(item, dict)]
    require(manifest_roles == sorted(manifest_roles), "evidence manifest must be sorted")
    require(len(manifest_roles) == len(set(manifest_roles)), "evidence manifest roles must be unique")
    for index, item in enumerate(manifest):
        if not isinstance(item, dict):
            errors.append(f"manifest entry {index} must be an object")
            continue
        role = item.get("role")
        require(bool(str(role or "").strip()), f"manifest entry {index}.role must be non-empty")
        require(bool(str(item.get("media_type") or "").strip()), f"manifest entry {role}.media_type must be non-empty")
        raw = decode_manifest_bytes(item)
        require(raw is not None, f"manifest entry {role}.content_base64 must be strict base64")
        require(bool(DIGEST_RE.fullmatch(str(item.get("sha256") or ""))), f"invalid evidence digest for {role}")
        byte_size = item.get("byte_size")
        require(isinstance(byte_size, int) and not isinstance(byte_size, bool) and byte_size > 0,
                f"invalid evidence byte size for {role}")
        if raw is not None:
            require(byte_size == len(raw), f"evidence byte size mismatch for {role}")
            require(item.get("sha256") == hashlib.sha256(raw).hexdigest(),
                    f"evidence digest mismatch for {role}")
        require(item.get("head_sha") == head_sha, f"manifest entry is stale for {role}")

    basis = record.get("causal_basis")
    expected_basis = causal_basis(record)
    require(basis == expected_basis, "causal_basis must be a deterministic projection of panel evidence")
    basis_digest = digest_json(expected_basis)
    require(transition.get("cause_id") == f"panel-cause:{basis_digest}",
            "transition cause_id does not match the causal basis")

    time = record.get("time") if isinstance(record.get("time"), dict) else {}
    valid_time = str(time.get("valid_time") or "")
    transaction_time = str(time.get("transaction_time") or "")
    require(valid_time.endswith("Z") and transaction_time.endswith("Z"), "time axes must be explicit UTC values")
    require(time.get("valid_time_source") == "github_pull_request_head_observation",
            "valid_time must describe trusted head observation, not issuer-selected commit time")

    supersession = record.get("supersession") if isinstance(record.get("supersession"), dict) else {}
    require(supersession.get("must_be_superseded_after_head_change") is True,
            "head-change supersession rule is missing")

    record_id = str(record.get("record_id") or "")
    clone = copy.deepcopy(record)
    clone.pop("record_id", None)
    require(record_id == f"panel:{digest_json(clone)}", "record_id does not match the complete panel bytes")

    return list(dict.fromkeys(errors))


def load(path: Path) -> dict[str, Any]:
    """Load a UTF-8 JSON object from disk."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("panel record must be an object")
    return value


def write(path: Path, record: dict[str, Any]) -> None:
    """Write a normalized UTF-8 JSON record with a trailing newline."""
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def command_validate(path: Path) -> int:
    """Validate one record and print deterministic diagnostics."""
    record = load(path)
    errors = validate_record(record)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"PASS virtual review panel {path} ({record['record_id']})")
    return 0


def command_normalize(source: Path, output: Path) -> int:
    """Normalize derived fields, validate, and write a new record."""
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
    """Run the validate or normalize CLI command."""
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
