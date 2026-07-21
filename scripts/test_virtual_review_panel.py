#!/usr/bin/env python3
"""Mutation tests for Robis Virtual Review Panel v1."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from virtual_review_panel import (
    causal_basis,
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


def rederive(record: dict) -> None:
    record["root_causes"] = dedupe_root_causes(record["roles"])
    record["decision"]["verdict"] = expected_verdict(record)
    head = record["subject"]["head_sha"]
    record["decision"]["id"] = f"panel-decision:{head}:{record['decision']['verdict'].lower()}"
    record["dissent"] = expected_dissent(record)
    states = {
        "BLOCK": "BLOCKED",
        "FIX_THEN_RERUN": "FIX_REQUIRED",
        "WAIT_FOR_EVIDENCE": "EVIDENCE_PENDING",
        "READY_WITH_ADVISORY_GAPS": "READY_ADVISORY",
    }
    record["transition"]["state_to"] = states[record["decision"]["verdict"]]
    record["causal_basis"] = causal_basis(record)
    record["transition"]["cause_id"] = f"panel-cause:{digest_json(record['causal_basis'])}"
    recompute_record_id(record)


class VirtualReviewPanelTests(unittest.TestCase):
    def test_canonical_fixture_is_valid(self) -> None:
        self.assertEqual(validate_record(fixture()), [])

    def test_fabricated_multi_provider_identity_fails(self) -> None:
        record = fixture()
        record["implementation"]["mode"] = "multi_provider"
        recompute_record_id(record)
        self.assertIn("multi-provider mode requires at least two providers", validate_record(record))

    def test_virtual_panel_cannot_satisfy_external_lane(self) -> None:
        record = fixture()
        record["activation"]["external_lane_satisfied"] = True
        recompute_record_id(record)
        self.assertIn("virtual panel cannot satisfy the external reviewer lane", validate_record(record))

    def test_repository_must_be_exact_owner_name(self) -> None:
        record = fixture()
        record["subject"]["repository"] = "a/b/c"
        recompute_record_id(record)
        self.assertIn("subject.repository must be exactly owner/name", validate_record(record))

    def test_provider_evidence_reference_is_required(self) -> None:
        record = fixture()
        record["activation"]["provider_evidence_ref"] = ""
        recompute_record_id(record)
        self.assertIn("activation.provider_evidence_ref must be non-empty", validate_record(record))

    def test_pass_with_p0_is_rejected_and_preserved_as_dissent(self) -> None:
        record = fixture()
        role = record["roles"][0]
        role["observations"][0]["severity"] = "P0"
        role["vote"] = "PASS"
        record["decision"]["verdict"] = "BLOCK"
        record["decision"]["id"] = f"panel-decision:{record['subject']['head_sha']}:block"
        record["root_causes"] = dedupe_root_causes(record["roles"])
        record["dissent"] = expected_dissent(record)
        record["transition"]["state_to"] = "BLOCKED"
        record["causal_basis"] = causal_basis(record)
        record["transition"]["cause_id"] = f"panel-cause:{digest_json(record['causal_basis'])}"
        recompute_record_id(record)
        errors = validate_record(record)
        self.assertTrue(any("vote PASS contradicts" in error for error in errors))
        self.assertEqual(record["dissent"][0]["role_id"], "causal_architect")

    def test_p3_finding_requires_fix_vote(self) -> None:
        record = fixture()
        role = record["roles"][0]
        role["observations"][0]["severity"] = "P3"
        role["vote"] = "PASS"
        recompute_record_id(record)
        self.assertTrue(any("vote PASS contradicts" in error for error in validate_record(record)))

    def test_hidden_alternative_verdict_fails(self) -> None:
        record = fixture()
        record["roles"][4]["observations"] = []
        record["roles"][4]["vote"] = "WAIT_FOR_EVIDENCE"
        rederive(record)
        self.assertTrue(record["dissent"])
        record["dissent"] = []
        record["causal_basis"] = causal_basis(record)
        record["transition"]["cause_id"] = f"panel-cause:{digest_json(record['causal_basis'])}"
        recompute_record_id(record)
        self.assertTrue(any("dissent must preserve" in error for error in validate_record(record)))

    def test_manifest_digest_is_recomputed_from_bytes(self) -> None:
        record = fixture()
        record["evidence"]["manifest"][0]["sha256"] = "a" * 64
        rederive(record)
        self.assertTrue(any("evidence digest mismatch" in error for error in validate_record(record)))

    def test_manifest_size_is_recomputed_from_bytes(self) -> None:
        record = fixture()
        record["evidence"]["manifest"][0]["byte_size"] += 1
        rederive(record)
        self.assertTrue(any("evidence byte size mismatch" in error for error in validate_record(record)))

    def test_manifest_base64_is_strict(self) -> None:
        record = fixture()
        record["evidence"]["manifest"][0]["content_base64"] = "%%%"
        rederive(record)
        self.assertTrue(any("strict base64" in error for error in validate_record(record)))

    def test_authority_escalation_fails(self) -> None:
        record = fixture()
        record["authority"]["can_merge"] = True
        recompute_record_id(record)
        self.assertIn("panel grants merge authority", validate_record(record))

    def test_stale_head_evidence_fails(self) -> None:
        record = fixture()
        record["roles"][0]["observations"][0]["evidence_refs"][0]["head_sha"] = "b" * 40
        recompute_record_id(record)
        self.assertTrue(any("stale evidence head" in error for error in validate_record(record)))

    def test_evidence_line_must_be_positive(self) -> None:
        record = fixture()
        record["roles"][0]["observations"][0]["evidence_refs"][0]["line"] = 0
        recompute_record_id(record)
        self.assertTrue(any("invalid evidence line" in error for error in validate_record(record)))

    def test_root_causes_are_deterministic(self) -> None:
        record = fixture()
        self.assertEqual(record["root_causes"], dedupe_root_causes(record["roles"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
