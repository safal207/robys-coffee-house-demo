#!/usr/bin/env python3
"""Mutation tests for the fail-closed virtual panel hardening seal."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from verify_virtual_panel_hardening import semantic_errors

FIXTURE = Path(__file__).parents[1] / "qa" / "virtual-review-panel.example.json"


def fixture() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class VirtualPanelHardeningTests(unittest.TestCase):
    def test_canonical_record_passes(self) -> None:
        self.assertEqual(semantic_errors(fixture()), [])

    def test_non_object_provider_fails_without_exception(self) -> None:
        record = fixture()
        record["implementation"]["providers"] = ["fake"]
        errors = semantic_errors(record)
        self.assertIn("provider 0 must be an object", errors)

    def test_non_object_evidence_reference_fails_without_exception(self) -> None:
        record = fixture()
        record["roles"][0]["observations"][0]["evidence_refs"] = ["fake"]
        errors = semantic_errors(record)
        self.assertIn("evidence reference 0 must be an object", errors)

    def test_non_object_manifest_entry_fails_without_exception(self) -> None:
        record = fixture()
        record["evidence"]["manifest"] = ["fake"]
        errors = semantic_errors(record)
        self.assertIn("manifest entry 0 must be an object", errors)

    def test_transaction_time_cannot_precede_valid_time(self) -> None:
        record = fixture()
        record["time"]["transaction_time"] = "2026-07-21T05:00:00Z"
        errors = semantic_errors(record)
        self.assertIn("transaction_time must not precede valid_time", errors)

    def test_naive_timestamp_is_rejected(self) -> None:
        record = fixture()
        record["time"]["valid_time"] = "2026-07-21T05:54:02"
        errors = semantic_errors(record)
        self.assertIn("valid_time must be timezone-aware RFC3339", errors)

    def test_non_object_record_fails(self) -> None:
        self.assertEqual(semantic_errors([]), ["panel record must be an object"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
