#!/usr/bin/env python3
"""Fail-closed structural and temporal seal for virtual panel records."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from virtual_review_panel import validate_record


def parse_utc(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def preflight_errors(record: Any) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    if not isinstance(record, dict):
        return ["panel record must be an object"]

    implementation = record.get("implementation")
    require(isinstance(implementation, dict), "implementation must be an object")
    providers = implementation.get("providers") if isinstance(implementation, dict) else None
    require(isinstance(providers, list), "implementation.providers must be an array")
    for index, provider in enumerate(providers or []):
        require(isinstance(provider, dict), f"provider {index} must be an object")
        if isinstance(provider, dict):
            for field in ("id", "label", "evidence_ref"):
                require(bool(str(provider.get(field) or "").strip()),
                        f"provider {index}.{field} must be non-empty")

    roles = record.get("roles")
    require(isinstance(roles, list), "roles must be an array")
    for role_index, role in enumerate(roles or []):
        require(isinstance(role, dict), f"role {role_index} must be an object")
        if not isinstance(role, dict):
            continue
        observations = role.get("observations")
        require(isinstance(observations, list),
                f"role {role_index}.observations must be an array")
        for observation_index, observation in enumerate(observations or []):
            require(isinstance(observation, dict),
                    f"role {role_index} observation {observation_index} must be an object")
            if not isinstance(observation, dict):
                continue
            evidence_refs = observation.get("evidence_refs")
            require(isinstance(evidence_refs, list),
                    f"observation {observation_index}.evidence_refs must be an array")
            for ref_index, evidence_ref in enumerate(evidence_refs or []):
                require(isinstance(evidence_ref, dict),
                        f"evidence reference {ref_index} must be an object")

    evidence = record.get("evidence")
    require(isinstance(evidence, dict), "evidence must be an object")
    manifest = evidence.get("manifest") if isinstance(evidence, dict) else None
    require(isinstance(manifest, list), "evidence.manifest must be an array")
    for index, item in enumerate(manifest or []):
        require(isinstance(item, dict), f"manifest entry {index} must be an object")

    time = record.get("time")
    require(isinstance(time, dict), "time must be an object")
    valid_time = parse_utc(time.get("valid_time")) if isinstance(time, dict) else None
    transaction_time = parse_utc(time.get("transaction_time")) if isinstance(time, dict) else None
    require(valid_time is not None, "valid_time must be timezone-aware RFC3339")
    require(transaction_time is not None, "transaction_time must be timezone-aware RFC3339")
    if valid_time is not None and transaction_time is not None:
        require(transaction_time >= valid_time,
                "transaction_time must not precede valid_time")

    return errors


def semantic_errors(record: Any) -> list[str]:
    errors = preflight_errors(record)
    if errors:
        return list(dict.fromkeys(errors))
    try:
        errors.extend(validate_record(record))
    except Exception as error:
        errors.append(f"base validator raised {type(error).__name__}: {error}")
    return list(dict.fromkeys(errors))


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: verify_virtual_panel_hardening.py <record.json>", file=sys.stderr)
        return 2
    record = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    errors = semantic_errors(record)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"PASS virtual panel hardening {argv[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
