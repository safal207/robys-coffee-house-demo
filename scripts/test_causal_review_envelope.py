#!/usr/bin/env python3
"""Mutation tests for the Robis causal-review envelope."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from causal_review_envelope import (
    INPUT_ROLES,
    build_envelope,
    build_from_environment,
    load_cooperation_module,
    validate_envelope,
)


HEAD = "a" * 40
VALID_TIME = datetime(2026, 7, 21, 5, 0, tzinfo=timezone.utc)
TX_TIME = datetime(2026, 7, 21, 5, 2, tzinfo=timezone.utc)


def manifest() -> list[dict[str, object]]:
    return [
        {
            "role": role,
            "sha256": hashlib.sha256(role.encode("utf-8")).hexdigest(),
            "byte_size": len(role) + 1,
        }
        for role in sorted(INPUT_ROLES)
    ]


def bot(
    name: str,
    *,
    requested: bool,
    level: str,
    reason: str = "OK",
    waived: bool = False,
    findings: dict[str, int] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        name=name,
        requested=requested,
        level=level,
        state="clean exact-head review" if level == "E5" else "not requested",
        reason=reason,
        action="No action.",
        waived=waived,
        findings=findings or {"P0": 0, "P1": 0, "P2": 0, "P3": 0},
    )


def build(
    *,
    conclusion: str = "READY",
    findings: dict[str, int] | None = None,
    pending: int = 0,
    failed: list[str] | None = None,
    complete: bool = True,
    coderabbit: SimpleNamespace | None = None,
    advisory: list[SimpleNamespace] | None = None,
) -> dict[str, object]:
    findings = findings or {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    coderabbit = coderabbit or bot("CodeRabbit", requested=True, level="E5")
    advisory = advisory or [
        bot("Qodo", requested=False, level="E0", reason="DORMANT_PROVIDER"),
        bot("Codex", requested=True, level="E5"),
        bot("Jules", requested=True, level="E5"),
        bot("DeepSeek", requested=True, level="E5"),
    ]
    checks = SimpleNamespace(
        passed=17,
        pending=pending,
        failed_names=failed or [],
        optional_failed_names=[],
    )
    return build_envelope(
        repository="safal207/robys-coffee-house-demo",
        pr={"number": 224, "head": {"sha": HEAD}},
        head_time=VALID_TIME,
        transaction_time=TX_TIME,
        bots=[coderabbit, *advisory],
        checks_summary=checks,
        evidence_complete=complete,
        conclusion=conclusion,
        why="Synthetic contract fixture.",
        findings=findings,
        manifest=manifest(),
    )


class CausalReviewEnvelopeTests(unittest.TestCase):
    def assert_valid(self, envelope: dict[str, object]) -> None:
        self.assertEqual(validate_envelope(envelope), [])

    def assert_invalid(self, envelope: dict[str, object], fragment: str) -> None:
        errors = validate_envelope(envelope)
        self.assertTrue(any(fragment in error for error in errors), errors)

    def test_existing_reporter_module_loads(self) -> None:
        module = load_cooperation_module()
        self.assertTrue(callable(module.classify_bots))
        self.assertTrue(callable(module.overall_conclusion))

    def test_environment_builder_reuses_reporter_decision_logic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payloads = {
                "PR_JSON_FILE": {
                    "number": 224,
                    "head": {"sha": HEAD},
                    "base": {"repo": {"full_name": "safal207/robys-coffee-house-demo"}},
                },
                "HEAD_COMMIT_FILE": {
                    "commit": {
                        "committer": {"date": "2026-07-21T05:00:00Z"},
                        "author": {"date": "2026-07-21T05:00:00Z"},
                    }
                },
                "COMMENTS_FILE": [
                    {
                        "id": 1,
                        "body": f"@coderabbitai review\n\nExact head: {HEAD}",
                        "author_association": "OWNER",
                        "created_at": "2026-07-21T05:00:30Z",
                        "user": {"login": "safal207"},
                    }
                ],
                "REVIEWS_FILE": [
                    {
                        "id": 2,
                        "body": "No issues found.",
                        "commit_id": HEAD,
                        "submitted_at": "2026-07-21T05:01:00Z",
                        "user": {"login": "coderabbitai[bot]"},
                    }
                ],
                "REVIEW_COMMENTS_FILE": [],
                "THREADS_FILE": {"complete": True, "threads": []},
                "CHECKS_FILE": {"check_runs": []},
                "STATUSES_FILE": [],
                "FILES_FILE": [],
            }
            environment = {"REPOSITORY": "safal207/robys-coffee-house-demo"}
            for env_name, payload in payloads.items():
                path = root / f"{env_name.lower()}.json"
                path.write_text(json.dumps(payload), encoding="utf-8")
                environment[env_name] = str(path)
            with patch.dict("os.environ", environment, clear=False):
                envelope = build_from_environment()
            self.assertEqual(envelope["decision"]["verdict"], "READY_WITH_ADVISORY_GAPS")
            self.assert_valid(envelope)

    def test_ready_envelope_is_valid(self) -> None:
        self.assert_valid(build())

    def test_p2_requires_fix_then_rerun(self) -> None:
        self.assert_valid(build(
            conclusion="FIX_THEN_RERUN",
            findings={"P0": 0, "P1": 0, "P2": 2, "P3": 0},
        ))

    def test_p1_requires_block(self) -> None:
        self.assert_valid(build(
            conclusion="BLOCK",
            findings={"P0": 0, "P1": 1, "P2": 0, "P3": 0},
        ))

    def test_pending_checks_require_wait(self) -> None:
        self.assert_valid(build(conclusion="WAIT_FOR_EVIDENCE", pending=2))

    def test_quota_waiver_is_ready_with_advisory_gaps(self) -> None:
        coderabbit = bot(
            "CodeRabbit",
            requested=True,
            level="E2",
            reason="QUOTA_EXHAUSTED",
            waived=True,
        )
        self.assert_valid(build(
            conclusion="READY_WITH_ADVISORY_GAPS",
            coderabbit=coderabbit,
        ))

    def test_tampered_ready_with_p2_is_rejected(self) -> None:
        envelope = build(
            conclusion="FIX_THEN_RERUN",
            findings={"P0": 0, "P1": 0, "P2": 1, "P3": 0},
        )
        envelope["decision"]["verdict"] = "READY"
        envelope["transition"]["state_to"] = "READY"
        self.assert_invalid(envelope, "decision contradicts evidence")

    def test_missing_parent_node_is_rejected(self) -> None:
        envelope = build()
        envelope["causal_graph"]["nodes"] = envelope["causal_graph"]["nodes"][1:]
        self.assert_invalid(envelope, "missing parent head node")

    def test_transaction_before_valid_time_is_rejected(self) -> None:
        envelope = build()
        envelope["time"]["transaction_time"] = "2026-07-21T04:59:59Z"
        self.assert_invalid(envelope, "transaction_time precedes valid_time")

    def test_execution_authority_is_rejected(self) -> None:
        envelope = build()
        envelope["authority"]["can_execute"] = True
        self.assert_invalid(envelope, "grants execution authority")

    def test_manifest_digest_tamper_is_rejected(self) -> None:
        envelope = build()
        envelope["evidence"]["manifest"][0]["sha256"] = "bad"
        self.assert_invalid(envelope, "invalid evidence digest")

    def test_causal_basis_tamper_is_rejected(self) -> None:
        envelope = build()
        envelope["causal_basis"]["checks"]["pending"] = 1
        self.assert_invalid(envelope, "cause_id does not match causal basis")

    def test_record_digest_tamper_is_rejected(self) -> None:
        envelope = build()
        envelope["space"]["destination"] = "automatic_merge"
        self.assert_invalid(envelope, "record_id does not match envelope bytes")

    def test_head_change_requires_new_record(self) -> None:
        envelope = build()
        envelope["head_sha"] = "b" * 40
        self.assert_invalid(envelope, "transition parent cause is not the exact head")


if __name__ == "__main__":
    unittest.main()
