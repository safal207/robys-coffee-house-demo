#!/usr/bin/env python3
"""Mutation tests for Robis Virtual Review Panel v1."""

from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from virtual_review_panel import (
    dedupe_root_causes,
    digest_json,
    expected_dissent,
    expected_verdict,
    recompute_record_id,
    validate_record,
)

FIXTURE = Path(__file__).parents[1] / "qa" / "virtual-review-panel.example.json"


def fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def rehash(record: dict) -> None:
    recompute_record_id(record)


class VirtualReviewPanelTests(unittest.TestCase):
    def test_canonical_fixture_is_valid(self) -> None:
        self.assertEqual(validate_record(fixture()), [])

    def test_fabricated_multi_provider_identity_fails(self) -> None:
        record = fixture()
        record["implementation"]["mode"] = "multi_provider"
        rehash(record)
        self.assertIn("multi-provider mode requires at least two providers", validate_record(record))

    def test_single_model_mode_cannot_hide_extra_provider(self) -> None:
        record = fixture()
        record["implementation"]["providers"].append(
            {"id": "fake:provider", "label": "Fake", "evidence_ref": "none"}
        )
        rehash(record)
        self.assertIn("single-model mode must disclose exactly one provider", validate_record(record))

    def test_virtual_panel_cannot_satisfy_external_lane(self) -> None:
        record = fixture()
        record["activation"]["external_lane_satisfied"] = True
        rehash(record)
        self.assertIn("virtual panel cannot satisfy the external reviewer lane", validate_record(record))

    def test_hidden_dissent_fails_even_after_rehash(self) -> None:
        record = fixture()
        record["dissent"] = []
        record["causal_basis"] = {
            **record["causal_basis"],
            "dissent": [],
        }
        record["transition"]["cause_id"] = f"panel-cause:{digest_json(record['causal_basis'])}"
        rehash(record)
        self.assertTrue(any("dissent must preserve" in item for item in validate_record(record)))

    def test_duplicate_root_cause_projection_fails(self) -> None:
        record = fixture()
        record["root_causes"].append(copy.deepcopy(record["root_causes"][0]))
        rehash(record)
        self.assertTrue(any("deterministic deduplication" in item for item in validate_record(record)))

    def test_stale_head_evidence_fails(self) -> None:
        record = fixture()
        record["roles"][0]["observations"][0]["evidence_refs"][0]["head_sha"] = "b" * 40
        rehash(record)
        self.assertTrue(any("stale evidence head" in item for item in validate_record(record)))

    def test_authority_escalation_fails(self) -> None:
        record = fixture()
        record["authority"]["can_merge"] = True
        rehash(record)
        self.assertIn("panel grants merge authority", validate_record(record))

    def test_manifest_tamper_breaks_causal_projection(self) -> None:
        record = fixture()
        record["evidence"]["manifest"][0]["sha256"] = "a" * 64
        rehash(record)
        self.assertTrue(any("causal_basis must be" in item for item in validate_record(record)))

    def test_p3_finding_requires_fix_then_rerun(self) -> None:
        record = fixture()
        for role in record["roles"]:
            role["observations"] = []
            role["vote"] = "PASS"
            role["rationale"] = "No issue."
        record["roles"][0]["observations"] = [{
            "id": "causal_architect:P3-001",
            "severity": "P3",
            "root_cause_key": "minor-policy-gap",
            "title": "Minor policy gap",
            "confidence": 0.8,
            "recommendation": "Fix it.",
            "evidence_refs": [{
                "path": "docs/policy.md",
                "line": 1,
                "head_sha": record["subject"]["head_sha"],
            }],
        }]
        record["roles"][0]["vote"] = "FIX_THEN_RERUN"
        self.assertEqual(expected_verdict(record), "FIX_THEN_RERUN")

    def test_expected_dissent_keeps_nonmatching_vote(self) -> None:
        record = fixture()
        self.assertEqual(
            expected_dissent(record),
            [{
                "role_id": "ci_reliability",
                "vote": "WAIT_FOR_EVIDENCE",
                "reason": record["roles"][4]["rationale"],
            }],
        )

    def test_root_causes_are_deterministic(self) -> None:
        record = fixture()
        self.assertEqual(record["root_causes"], dedupe_root_causes(record["roles"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
