#!/usr/bin/env python3
"""Mutation tests for the request-bound cooperation compatibility layer."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("ai_review_cooperation_request_bound.py")
SPEC = importlib.util.spec_from_file_location("ai_review_cooperation_request_bound_test", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load {SCRIPT}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

HEAD = "1" * 40
OTHER_HEAD = "2" * 40
HEAD_TIME = MODULE.CORE.parse_time("2026-07-21T10:00:00Z")
REQUEST_TIME = "2026-07-21T10:01:00Z"
AFTER = "2026-07-21T10:02:00Z"
BEFORE = "2026-07-21T09:59:00Z"


def user(login: str, kind: str = "Bot") -> dict[str, str]:
    return {"login": login, "type": kind}


def request(created_at: str = REQUEST_TIME, association: str = "OWNER") -> dict[str, object]:
    return {
        "body": f"@coderabbitai review\n\nExact head: {HEAD}",
        "user": user("safal207", "User"),
        "author_association": association,
        "created_at": created_at,
        "updated_at": created_at,
    }


def stable(body: str, *, created_at: str = BEFORE, updated_at: str = AFTER,
           login: str = "coderabbitai[bot]") -> dict[str, object]:
    return {
        "body": body,
        "user": user(login),
        "author_association": "NONE",
        "created_at": created_at,
        "updated_at": updated_at,
    }


def walkthrough(body: str = "## Walkthrough\nReview complete.", **kwargs: object) -> dict[str, object]:
    return stable(f"<!-- walkthrough_start -->\n{body}", **kwargs)


def limit(body: str = "Review limit reached. Next review available in 20 minutes.",
          **kwargs: object) -> dict[str, object]:
    return stable(f"<!-- review_stack_entry_start -->\n{body}", **kwargs)


class RequestBoundCooperationTests(unittest.TestCase):
    def test_stable_headless_walkthrough_is_observed_by_updated_at(self) -> None:
        item = walkthrough()
        observed = MODULE.patched_bot_items([item], {"coderabbitai[bot]"}, HEAD_TIME)
        self.assertEqual(observed, [item])
        exact = MODULE.patched_request_bound_exact_items(observed, [request()], HEAD)
        self.assertEqual(exact, [item])

    def test_stable_walkthrough_before_request_is_rejected(self) -> None:
        item = walkthrough(updated_at="2026-07-21T10:00:30Z")
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [])

    def test_explicit_conflicting_sha_is_rejected(self) -> None:
        item = walkthrough(body=f"Review complete for {OTHER_HEAD}.")
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [])

    def test_explicit_current_sha_is_accepted(self) -> None:
        item = walkthrough(body=f"Review complete for {HEAD}.")
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [item])

    def test_quota_never_becomes_clean_review(self) -> None:
        item = limit()
        self.assertFalse(MODULE.patched_is_final_coderabbit_comment_evidence(item))
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [])

    def test_headless_quota_is_request_bound(self) -> None:
        item = limit()
        selected = MODULE.patched_latest_limit_signal([item], [request()])
        self.assertEqual(selected, item)

    def test_stale_or_conflicting_quota_is_rejected(self) -> None:
        stale = limit(updated_at="2026-07-21T10:00:30Z")
        conflict = limit(body=f"Review limit reached for {OTHER_HEAD}.")
        self.assertIsNone(MODULE.patched_latest_limit_signal([stale], [request()]))
        self.assertIsNone(MODULE.patched_latest_limit_signal([conflict], [request()]))

    def test_negative_limit_phrase_is_rejected(self) -> None:
        item = limit(body="No review limit was reached.")
        self.assertIsNone(MODULE.patched_latest_limit_signal([item], [request()]))

    def test_spoofed_provider_is_not_stable_coderabbit_evidence(self) -> None:
        item = walkthrough(login="attacker[bot]")
        self.assertFalse(MODULE.is_stable_coderabbit_item(item))
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [])

    def test_native_exact_head_evidence_still_works(self) -> None:
        native = {
            "commit_id": HEAD,
            "body": "Native review",
            "user": user("coderabbitai[bot]"),
            "created_at": AFTER,
        }
        exact = MODULE.patched_request_bound_exact_items([native], [request()], HEAD)
        self.assertEqual(exact, [native])

    def test_other_provider_headless_comment_is_not_promoted(self) -> None:
        item = stable("<!-- walkthrough_start -->\nReview complete.", login="jules[bot]")
        exact = MODULE.patched_request_bound_exact_items([item], [request()], HEAD)
        self.assertEqual(exact, [])

    def test_latest_request_controls_freshness(self) -> None:
        second = request(created_at="2026-07-21T10:03:00Z")
        item = walkthrough(updated_at="2026-07-21T10:02:30Z")
        self.assertEqual(
            MODULE.patched_request_bound_exact_items([item], [request(), second], HEAD),
            [],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
